use std::{path::PathBuf, sync::Arc};

use dashmap::DashMap;

use crate::{
    config::BASE_DIR,
    markdown::MarkdownService,
    media::{MediaQueueConfig, MediaService, MediaServiceConfig},
    web::api::{DocsRouter, LsAPI, LsResponse},
    web::templates::TemplateService,
};

const DEFAULT_QUEUE_CAPACITY: usize = 8;
const DEFAULT_MAX_CONCURRENCY: usize = 1;

#[derive(Clone)]
pub struct RustyDocContext {
    pub cache: Arc<DashMap<String, String>>,
    media: MediaService,
    ls_api: LsAPI,
    docs_router: DocsRouter,
}

impl Default for RustyDocContext {
    fn default() -> Self {
        Self::new()
    }
}

impl RustyDocContext {
    pub fn new() -> Self {
        let base_dir = PathBuf::from(BASE_DIR);
        let queue_config = MediaQueueConfig {
            capacity: DEFAULT_QUEUE_CAPACITY,
            max_concurrency: DEFAULT_MAX_CONCURRENCY,
        };
        let media_config = MediaServiceConfig {
            base_dir,
            queue: queue_config,
        };
        Self::new_with_media(media_config)
    }

    pub fn new_with_media(media_config: MediaServiceConfig) -> Self {
        Self {
            cache: Arc::new(DashMap::new()),
            media: MediaService::new(media_config),
            ls_api: LsAPI::new(BASE_DIR),
            docs_router: DocsRouter::new(
                BASE_DIR,
                MarkdownService::default(),
                TemplateService::default(),
            ),
        }
    }

    pub fn cache_get(&self, key: &str) -> Option<String> {
        self.cache.get(key).map(|v| v.value().clone())
    }

    pub fn cache_set(&self, key: &str, value: String) {
        self.cache.insert(key.to_string(), value);
    }

    pub fn cache_purge(&self, key: &str) {
        self.cache.remove(key);
    }

    pub async fn ensure_el_outputs(&self, path: &[&str]) {
        self.media.ensure_el_outputs(path).await;
    }

    pub async fn docs_routing(&self, path: &[&str]) -> std::io::Result<Option<String>> {
        self.docs_router.route(path).await
    }

    pub async fn ls_routing(&self, path: &[&str]) -> std::io::Result<LsResponse> {
        self.ls_api.list(path).await
    }

}

