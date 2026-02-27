use std::{path::PathBuf, sync::Arc};

use kurosabi::utils::url_decode_fast;
use log::{info, warn};

use super::{
    FfmpegAudioCodec, FfmpegAudioParams, FfmpegCompressor, FfmpegPlan, FfmpegRendition,
    FfmpegStep, FfmpegTranscode, FfmpegVideoParams, MediaError, MediaJob, MediaJobProcessor,
    MediaQueue, MediaQueueConfig,
};

const DEFAULT_FALLBACK_HEIGHT: u32 = 720;
const DEFAULT_FALLBACK_FPS: u32 = 30;

#[derive(Debug, Clone)]
struct VideoProps {
    height: u32,
    fps: u32,
    audio_bitrate_kbps: Option<u32>,
    audio_codec: Option<String>,
}

impl VideoProps {
    fn fallback() -> Self {
        Self {
            height: DEFAULT_FALLBACK_HEIGHT,
            fps: DEFAULT_FALLBACK_FPS,
            audio_bitrate_kbps: None,
            audio_codec: None,
        }
    }
}

#[derive(Debug, Clone)]
struct RenditionPolicy {
    enable_720p: bool,
    enable_1080p: bool,
    enable_1080p60: bool,
}

impl Default for RenditionPolicy {
    fn default() -> Self {
        Self {
            enable_720p: true,
            enable_1080p: true,
            enable_1080p60: true,
        }
    }
}

impl RenditionPolicy {
    fn select(&self, props: VideoProps) -> Vec<FfmpegRendition> {
        let mut renditions = Vec::new();
        if props.height >= 144 {
            renditions.push(
                FfmpegRendition::new(Some(144), Some(30))
                    .with_keyframe_interval(30)
                    .with_faststart(),
            );
        }
        if props.height >= 360 {
            renditions.push(FfmpegRendition::new(Some(360), Some(30)));
        }

        if self.enable_720p && props.height >= 720 {
            renditions.push(FfmpegRendition::new(Some(720), Some(30)));
        }
        if self.enable_1080p && props.height >= 1080 {
            renditions.push(FfmpegRendition::new(Some(1080), Some(30)));
        }
        if self.enable_1080p60 && props.height >= 2160 && props.fps >= 50 {
            renditions.push(FfmpegRendition::new(Some(1080), Some(60)));
        }
        for rendition in &mut renditions {
            rendition.faststart = true;
        }

        renditions
            .into_iter()
            .filter(|rendition| {
                let same_height = rendition.height.map(|h| h as u32 == props.height).unwrap_or(false);
                let same_fps = rendition.fps.map(|f| f as u32 == props.fps).unwrap_or(false);
                !(same_height && same_fps)
            })
            .collect()
    }
}

#[derive(Debug, Clone)]
struct MediaProcessor {
    ffmpeg: FfmpegCompressor,
    policy: RenditionPolicy,
}

struct PendingStep {
    step: FfmpegStep,
    renames: Vec<(PathBuf, PathBuf)>,
}

impl MediaProcessor {
    fn new() -> Self {
        Self {
            ffmpeg: FfmpegCompressor::default(),
            policy: RenditionPolicy::default(),
        }
    }
}

impl MediaJobProcessor for MediaProcessor {
    fn process(&self, job: MediaJob) -> Result<(), MediaError> {
        let props = probe_video_props(&job.input).unwrap_or_else(VideoProps::fallback);
        let renditions = self.policy.select(props.clone());
        let stem = job
            .input
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");

        let mut pending = Vec::new();
        pending.extend(build_video_steps(&job, &renditions, stem));
        if let Some(step) = build_audio_step(&job, stem, &self.ffmpeg, &props) {
            pending.push(step);
        }

        for entry in pending {
            run_step(&self.ffmpeg, &job.input, &entry.step)?;
            finalize_temp_outputs(entry.renames);
        }
        Ok(())
    }
}

fn build_video_steps(job: &MediaJob, renditions: &[FfmpegRendition], stem: &str) -> Vec<PendingStep> {
    let mut steps = Vec::new();
    for rendition in renditions {
        let suffix = if let Some(label) = &rendition.label {
            label.clone()
        } else {
            match (rendition.height, rendition.fps) {
                (Some(h), Some(f)) => format!("{}p{}fps", h, f),
                (Some(h), None) => format!("{}p", h),
                (None, Some(f)) => format!("{}fps", f),
                (None, None) => "original".to_string(),
            }
        };
        let output = job.output_dir.join(format!("{}_{}.mp4", stem, suffix));
        let temp_output = make_temp_path(&output);
        let step = FfmpegStep::Transcode(FfmpegTranscode {
            input: job.input.clone(),
            output: temp_output.clone(),
            video: Some(FfmpegVideoParams {
                height: rendition.height,
                fps: rendition.fps,
                keyframe_interval: rendition.keyframe_interval,
            }),
            audio: None,
            faststart: rendition.faststart,
        });
        steps.push(PendingStep {
            step,
            renames: vec![(temp_output, output)],
        });
    }
    steps
}

fn build_audio_step(
    job: &MediaJob,
    stem: &str,
    ffmpeg: &FfmpegCompressor,
    props: &VideoProps,
) -> Option<PendingStep> {
    let audio_target = ffmpeg.config.audio_bitrate_kbps as u32;
    let audio_skip = props.audio_codec.as_deref() == Some("mp3")
        && props
            .audio_bitrate_kbps
            .map(|b| b <= audio_target)
            .unwrap_or(false);
    if audio_skip {
        return None;
    }
    let output = job.output_dir.join(format!("{}_audio.mp3", stem));
    let temp_output = make_temp_path(&output);
    let step = FfmpegStep::Transcode(FfmpegTranscode {
        input: job.input.clone(),
        output: temp_output.clone(),
        video: None,
        audio: Some(FfmpegAudioParams {
            codec: FfmpegAudioCodec::Mp3,
            bitrate_kbps: Some(ffmpeg.config.audio_bitrate_kbps),
        }),
        faststart: false,
    });
    Some(PendingStep {
        step,
        renames: vec![(temp_output, output)],
    })
}

fn run_step(
    ffmpeg: &FfmpegCompressor,
    input: &PathBuf,
    step: &FfmpegStep,
) -> Result<(), MediaError> {
    for mut cmd in ffmpeg.build_commands_for_step(input, step) {
        let status = cmd.status().map_err(MediaError::from)?;
        if !status.success() {
            return Err(MediaError::from(std::io::Error::new(
                std::io::ErrorKind::Other,
                "ffmpeg plan step failed",
            )));
        }
    }
    Ok(())
}

fn finalize_temp_outputs(renames: Vec<(PathBuf, PathBuf)>) {
    for (temp, final_path) in renames {
        if let Err(err) = std::fs::rename(&temp, &final_path) {
            warn!("Failed to finalize temp output {:?} -> {:?}: {}", temp, final_path, err);
        }
    }
}

fn make_temp_path(path: &PathBuf) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let ext = path.extension().and_then(|s| s.to_str());
    let temp_name = match ext {
        Some(ext) => format!("{}.temp.{}", stem, ext),
        None => format!("{}.temp", stem),
    };
    path.with_file_name(temp_name)
}

#[derive(Debug, Clone)]
pub struct MediaServiceConfig {
    pub base_dir: PathBuf,
    pub queue: MediaQueueConfig,
}

impl MediaServiceConfig {
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            base_dir,
            queue: MediaQueueConfig::default(),
        }
    }
}

impl Default for MediaServiceConfig {
    fn default() -> Self {
        Self {
            base_dir: PathBuf::from("./data/"),
            queue: MediaQueueConfig::default(),
        }
    }
}

#[derive(Clone)]
pub struct MediaService {
    base_dir: PathBuf,
    queue: MediaQueue,
}

impl MediaService {
    pub fn new(config: MediaServiceConfig) -> Self {
        let processor = Arc::new(MediaProcessor::new());
        let queue = MediaQueue::new(config.queue, processor);
        Self {
            base_dir: config.base_dir,
            queue,
        }
    }

    pub async fn ensure_el_outputs(&self, path: &[&str]) {
        if is_static_path(path) {
            info!("Skip EL outputs for static path: {:?}", path);
            return;
        }
        if is_el_path(path) {
            info!("Skip EL outputs for .el path: {:?}", path);
            return;
        }

        let Some(file_path) = decode_video_path(&self.base_dir, path) else {
            return;
        };

        let Some(output_dir) = build_output_dir(&file_path) else {
            return;
        };

        if output_dir.exists() {
            info!("EL outputs already exist: {:?}", output_dir);
            return;
        }

        if let Err(err) = std::fs::create_dir_all(&output_dir) {
            warn!("Failed to create output dir: {}", err);
            return;
        }

        info!("Queueing EL outputs for {:?}", file_path);
        let job = MediaJob {
            input: file_path,
            output_dir,
        };
        self.queue.enqueue(job).await;
    }
}

fn is_static_path(path: &[&str]) -> bool {
    path.first() == Some(&"static")
}

fn is_el_path(path: &[&str]) -> bool {
    path.iter().any(|segment| segment.starts_with(".el."))
}

fn decode_video_path(base_dir: &PathBuf, path: &[&str]) -> Option<PathBuf> {
    let file_path = decode_path_from_url(base_dir, path);
    if !file_path.is_file() {
        info!("Skip EL outputs (not a file): {:?}", file_path);
        return None;
    }

    let ext = file_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !is_video_extension(&ext) {
        info!("Skip EL outputs (not video): {:?}", file_path);
        return None;
    }

    Some(file_path)
}

fn decode_path_from_url(base_dir: &PathBuf, path: &[&str]) -> PathBuf {
    let mut out = base_dir.clone();
    for seg in path {
        out.push(url_decode_fast(seg).as_ref());
    }
    out
}

fn is_video_extension(ext: &str) -> bool {
    matches!(ext, "mp4" | "mkv" | "webm" | "mov" | "avi" | "m4v" | "ts")
}

fn build_output_dir(file_path: &PathBuf) -> Option<PathBuf> {
    let file_name = file_path.file_name()?.to_str()?;
    let parent = file_path.parent()?;
    Some(parent.join(format!(".el.{}", file_name)))
}

fn probe_video_props(input: &PathBuf) -> Option<VideoProps> {
    let output = std::process::Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("v:0")
        .arg("-show_entries")
        .arg("stream=height,r_frame_rate")
        .arg("-of")
        .arg("default=nw=1:nk=1")
        .arg(input)
        .output()
        .ok()?;
    if !output.status.success() {
        warn!("ffprobe failed for {:?}", input);
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut lines = text.lines();
    let height = lines.next()?.trim().parse::<u32>().ok()?;
    let fps_raw = lines.next().unwrap_or("0/1").trim();
    let fps = parse_fps(fps_raw).unwrap_or(DEFAULT_FALLBACK_FPS);
    let (audio_bitrate_kbps, audio_codec) = probe_audio_props(input);
    Some(VideoProps {
        height,
        fps,
        audio_bitrate_kbps,
        audio_codec,
    })
}

fn probe_audio_props(input: &PathBuf) -> (Option<u32>, Option<String>) {
    let output = std::process::Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("a:0")
        .arg("-show_entries")
        .arg("stream=codec_name,bit_rate")
        .arg("-of")
        .arg("default=nw=1:nk=1")
        .arg(input)
        .output();

    let Ok(output) = output else {
        return (None, None);
    };
    if !output.status.success() {
        return (None, None);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut lines = text.lines();
    let codec = lines.next().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let bitrate = lines
        .next()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .map(|b| b / 1000);
    (bitrate, codec)
}

fn parse_fps(input: &str) -> Option<u32> {
    if let Some((num, den)) = input.split_once('/') {
        let n = num.trim().parse::<f64>().ok()?;
        let d = den.trim().parse::<f64>().ok()?;
        if d == 0.0 {
            return None;
        }
        return Some((n / d).round() as u32);
    }
    input.trim().parse::<f64>().ok().map(|v| v.round() as u32)
}
