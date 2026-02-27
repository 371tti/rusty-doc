use thiserror::Error;

#[derive(Debug, Error)]
pub enum MediaError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("ffprobe failed for {0}")]
    FfprobeFailed(String),
    #[error("ffmpeg failed for {0}")]
    FfmpegFailed(String),
}
