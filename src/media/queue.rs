use std::{path::PathBuf, sync::Arc};

use dashmap::DashMap;
use log::{error, info, warn};
use tokio::sync::{mpsc, Semaphore};

use super::MediaError;

#[derive(Debug, Clone)]
pub struct MediaJob {
    pub input: PathBuf,
    pub output_dir: PathBuf,
}

impl MediaJob {
    pub fn key(&self) -> String {
        self.output_dir.to_string_lossy().to_string()
    }
}

pub trait MediaJobProcessor: Send + Sync + 'static {
    fn process(&self, job: MediaJob) -> Result<(), MediaError>;
}

#[derive(Debug, Clone, Copy)]
pub struct MediaQueueConfig {
    pub capacity: usize,
    pub max_concurrency: usize,
}

impl Default for MediaQueueConfig {
    fn default() -> Self {
        Self {
            capacity: 8,
            max_concurrency: 1,
        }
    }
}

#[derive(Clone)]
pub struct MediaQueue {
    sender: mpsc::Sender<MediaJob>,
    in_progress: Arc<DashMap<String, ()>>,
}

impl MediaQueue {
    pub fn new(config: MediaQueueConfig, processor: Arc<dyn MediaJobProcessor>) -> Self {
        let (sender, receiver) = mpsc::channel(config.capacity);
        let in_progress = Arc::new(DashMap::new());
        let semaphore = Arc::new(Semaphore::new(config.max_concurrency));
        spawn_worker(receiver, in_progress.clone(), semaphore, processor);
        Self { sender, in_progress }
    }

    pub async fn enqueue(&self, job: MediaJob) -> bool {
        let key = job.key();
        if self.in_progress.insert(key.clone(), ()).is_some() {
            info!("Media job already queued: {}", key);
            return false;
        }
        if let Err(err) = self.sender.send(job).await {
            self.in_progress.remove(&key);
            warn!("Failed to enqueue media job: {}", err);
            return false;
        }
        info!("Media job enqueued: {}", key);
        true
    }
}

fn spawn_worker(
    mut receiver: mpsc::Receiver<MediaJob>,
    in_progress: Arc<DashMap<String, ()>>,
    semaphore: Arc<Semaphore>,
    processor: Arc<dyn MediaJobProcessor>,
) {
    tokio::spawn(async move {
        while let Some(job) = receiver.recv().await {
            let key = job.key();
            info!("Media job start: {}", key);
            let permit = match semaphore.clone().acquire_owned().await {
                Ok(permit) => permit,
                Err(_) => {
                    in_progress.remove(&key);
                    continue;
                }
            };

            let processor = processor.clone();
            let result = tokio::task::spawn_blocking(move || processor.process(job)).await;

            drop(permit);

            match result {
                Ok(Ok(())) => info!("Media job done: {}", key),
                Ok(Err(err)) => error!("Media job failed: {} ({})", key, err),
                Err(err) => error!("Media job panicked: {} ({})", key, err),
            }
            in_progress.remove(&key);
        }
    });
}
