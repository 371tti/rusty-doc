use std::{path::{Path, PathBuf}, process::Command};

#[derive(Debug, Clone)]
pub struct FfmpegRendition {
    pub height: Option<u16>,
    pub fps: Option<u16>,
    pub label: Option<String>,
    pub keyframe_interval: Option<u16>,
    pub faststart: bool,
}

impl FfmpegRendition {
    pub fn new(height: Option<u16>, fps: Option<u16>) -> Self {
        Self {
            height,
            fps,
            label: None,
            keyframe_interval: None,
            faststart: false,
        }
    }

    pub fn with_label(mut self, label: impl Into<String>) -> Self {
        self.label = Some(label.into());
        self
    }

    pub fn with_keyframe_interval(mut self, interval: u16) -> Self {
        self.keyframe_interval = Some(interval);
        self
    }

    pub fn with_faststart(mut self) -> Self {
        self.faststart = true;
        self
    }
}

#[derive(Debug, Clone, Copy)]
pub enum FfmpegAudioCodec {
    Aac,
    Mp3,
}

#[derive(Debug, Clone)]
pub struct FfmpegVideoParams {
    pub height: Option<u16>,
    pub fps: Option<u16>,
    pub keyframe_interval: Option<u16>,
}

#[derive(Debug, Clone)]
pub struct FfmpegAudioParams {
    pub codec: FfmpegAudioCodec,
    pub bitrate_kbps: Option<u16>,
}

#[derive(Debug, Clone)]
pub struct FfmpegTranscode {
    pub input: PathBuf,
    pub output: PathBuf,
    pub video: Option<FfmpegVideoParams>,
    pub audio: Option<FfmpegAudioParams>,
    pub faststart: bool,
}

#[derive(Debug, Clone)]
pub enum FfmpegStep {
    Split {
        video_output: PathBuf,
        audio_output: PathBuf,
    },
    LowResMp4 {
        output: PathBuf,
        height: u16,
    },
    Compress {
        output: PathBuf,
    },
    Renditions {
        output_dir: PathBuf,
        renditions: Vec<FfmpegRendition>,
        include_audio: bool,
    },
    Transcode(FfmpegTranscode),
}

#[derive(Debug, Clone)]
pub struct FfmpegPlan {
    pub input: PathBuf,
    pub steps: Vec<FfmpegStep>,
}

impl FfmpegPlan {
    pub fn new(input: impl Into<PathBuf>) -> Self {
        Self {
            input: input.into(),
            steps: Vec::new(),
        }
    }

    pub fn push_step(mut self, step: FfmpegStep) -> Self {
        self.steps.push(step);
        self
    }
}

#[derive(Debug, Clone)]
pub struct FfmpegConfig {
    pub crf: u8,
    pub preset: String,
    pub audio_bitrate_kbps: u16,
    pub scale_height: Option<u16>,
}

impl Default for FfmpegConfig {
    fn default() -> Self {
        Self {
            crf: 23,
            preset: "medium".to_string(),
            audio_bitrate_kbps: 128,
            scale_height: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FfmpegCompressor {
    pub config: FfmpegConfig,
    pub ffmpeg_path: String,
}

impl Default for FfmpegCompressor {
    fn default() -> Self {
        Self {
            config: FfmpegConfig::default(),
            ffmpeg_path: "ffmpeg".to_string(),
        }
    }
}

impl FfmpegCompressor {
    pub fn new(config: FfmpegConfig) -> Self {
        Self {
            config,
            ffmpeg_path: "ffmpeg".to_string(),
        }
    }

    pub fn with_ffmpeg_path(mut self, path: impl Into<String>) -> Self {
        self.ffmpeg_path = path.into();
        self
    }

    pub fn build_compress_command(&self, input: &Path, output: &Path) -> Command {
        let mut cmd = Command::new(&self.ffmpeg_path);
        cmd.arg("-y");
        cmd.arg("-i").arg(input);
        cmd.arg("-c:v").arg("libx264");
        cmd.arg("-preset").arg(&self.config.preset);
        cmd.arg("-crf").arg(self.config.crf.to_string());
        cmd.arg("-c:a").arg("aac");
        cmd.arg("-b:a").arg(format!("{}k", self.config.audio_bitrate_kbps));
        if let Some(height) = self.config.scale_height {
            cmd.arg("-vf").arg(format!("scale=-2:{}", height));
        }
        cmd.arg(output);
        cmd
    }

    pub fn compress(&self, input: &Path, output: &Path) -> std::io::Result<()> {
        let status = self.build_compress_command(input, output).status()?;
        if status.success() {
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "ffmpeg compression failed",
            ))
        }
    }

    pub fn build_split_commands(
        &self,
        input: &Path,
        video_output: &Path,
        audio_output: &Path,
    ) -> (Command, Command) {
        let mut video_cmd = Command::new(&self.ffmpeg_path);
        video_cmd.arg("-y");
        video_cmd.arg("-i").arg(input);
        video_cmd.arg("-map").arg("0:v:0");
        video_cmd.arg("-c").arg("copy");
        video_cmd.arg(video_output);

        let mut audio_cmd = Command::new(&self.ffmpeg_path);
        audio_cmd.arg("-y");
        audio_cmd.arg("-i").arg(input);
        audio_cmd.arg("-map").arg("0:a:0");
        audio_cmd.arg("-c:a").arg("aac");
        audio_cmd.arg("-b:a").arg(format!("{}k", self.config.audio_bitrate_kbps));
        audio_cmd.arg(audio_output);

        (video_cmd, audio_cmd)
    }

    pub fn split_audio_video(
        &self,
        input: &Path,
        video_output: &Path,
        audio_output: &Path,
    ) -> std::io::Result<()> {
        let (mut video_cmd, mut audio_cmd) =
            self.build_split_commands(input, video_output, audio_output);
        let video_status = video_cmd.status()?;
        if !video_status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "ffmpeg video split failed",
            ));
        }
        let audio_status = audio_cmd.status()?;
        if audio_status.success() {
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "ffmpeg audio split failed",
            ))
        }
    }

    pub fn build_low_res_mp4_command(
        &self,
        input: &Path,
        output: &Path,
        height: u16,
    ) -> Command {
        let mut cmd = Command::new(&self.ffmpeg_path);
        cmd.arg("-y");
        cmd.arg("-i").arg(input);
        cmd.arg("-c:v").arg("libx264");
        cmd.arg("-preset").arg(&self.config.preset);
        cmd.arg("-crf").arg(self.config.crf.to_string());
        cmd.arg("-vf").arg(format!("scale=-2:{}", height));
        cmd.arg("-c:a").arg("aac");
        cmd.arg("-b:a").arg(format!("{}k", self.config.audio_bitrate_kbps));
        cmd.arg("-movflags").arg("+faststart");
        cmd.arg(output);
        cmd
    }

    pub fn compress_low_res_mp4(
        &self,
        input: &Path,
        output: &Path,
        height: u16,
    ) -> std::io::Result<()> {
        let status = self
            .build_low_res_mp4_command(input, output, height)
            .status()?;
        if status.success() {
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "ffmpeg low-res compression failed",
            ))
        }
    }

    pub fn build_commands_for_step(&self, input: &Path, step: &FfmpegStep) -> Vec<Command> {
        match step {
            FfmpegStep::Split {
                video_output,
                audio_output,
            } => {
                let (video_cmd, audio_cmd) =
                    self.build_split_commands(input, video_output, audio_output);
                vec![video_cmd, audio_cmd]
            }
            FfmpegStep::LowResMp4 { output, height } => {
                vec![self.build_low_res_mp4_command(input, output, *height)]
            }
            FfmpegStep::Compress { output } => {
                vec![self.build_compress_command(input, output)]
            }
            FfmpegStep::Renditions {
                output_dir,
                renditions,
                include_audio,
            } => self.build_rendition_commands(input, output_dir, renditions, *include_audio),
            FfmpegStep::Transcode(task) => vec![self.build_transcode_command(task)],
        }
    }

    pub fn build_commands_for_plan(&self, plan: &FfmpegPlan) -> Vec<Command> {
        let mut cmds = Vec::new();
        for step in &plan.steps {
            cmds.extend(self.build_commands_for_step(&plan.input, step));
        }
        cmds
    }

    pub fn run_plan(&self, plan: &FfmpegPlan) -> std::io::Result<()> {
        for step in &plan.steps {
            for mut cmd in self.build_commands_for_step(&plan.input, step) {
                let status = cmd.status()?;
                if !status.success() {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "ffmpeg plan step failed",
                    ));
                }
            }
        }
        Ok(())
    }

    pub fn build_rendition_commands(
        &self,
        input: &Path,
        output_dir: &Path,
        renditions: &[FfmpegRendition],
        include_audio: bool,
    ) -> Vec<Command> {
        let mut cmds = Vec::new();
        let stem = input
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output");

        if include_audio {
            let audio_output = output_dir.join(format!("{}_audio.m4a", stem));
            let mut audio_cmd = Command::new(&self.ffmpeg_path);
            audio_cmd.arg("-y");
            audio_cmd.arg("-i").arg(input);
            audio_cmd.arg("-vn");
            audio_cmd.arg("-c:a").arg("aac");
            audio_cmd
                .arg("-b:a")
                .arg(format!("{}k", self.config.audio_bitrate_kbps));
            audio_cmd.arg(audio_output);
            cmds.push(audio_cmd);
        }

        for rendition in renditions {
            let suffix = self.rendition_suffix(rendition);
            let output = output_dir.join(format!("{}_{}.mp4", stem, suffix));
            let mut cmd = Command::new(&self.ffmpeg_path);
            cmd.arg("-y");
            cmd.arg("-i").arg(input);
            cmd.arg("-map").arg("0:v:0");
            if include_audio {
                cmd.arg("-map").arg("0:a:0?");
            } else {
                cmd.arg("-an");
            }
            cmd.arg("-c:v").arg("libx264");
            cmd.arg("-preset").arg(&self.config.preset);
            cmd.arg("-crf").arg(self.config.crf.to_string());
            if let Some(height) = rendition.height {
                cmd.arg("-vf").arg(format!("scale=-2:{}", height));
            }
            if let Some(fps) = rendition.fps {
                cmd.arg("-r").arg(fps.to_string());
            }
            if let Some(interval) = rendition.keyframe_interval {
                cmd.arg("-g").arg(interval.to_string());
                cmd.arg("-keyint_min").arg(interval.to_string());
                cmd.arg("-sc_threshold").arg("0");
            }
            if include_audio {
                cmd.arg("-c:a").arg("aac");
                cmd.arg("-b:a").arg(format!("{}k", self.config.audio_bitrate_kbps));
            }
            if rendition.faststart {
                cmd.arg("-movflags").arg("+faststart");
            }
            cmd.arg(output);
            cmds.push(cmd);
        }

        cmds
    }

    fn rendition_suffix(&self, rendition: &FfmpegRendition) -> String {
        if let Some(label) = &rendition.label {
            return label.clone();
        }
        match (rendition.height, rendition.fps) {
            (Some(h), Some(f)) => format!("{}p{}fps", h, f),
            (Some(h), None) => format!("{}p", h),
            (None, Some(f)) => format!("{}fps", f),
            (None, None) => "original".to_string(),
        }
    }

    pub fn build_transcode_command(&self, task: &FfmpegTranscode) -> Command {
        let mut cmd = Command::new(&self.ffmpeg_path);
        cmd.arg("-y");
        cmd.arg("-i").arg(&task.input);

        match (&task.video, &task.audio) {
            (Some(_), Some(_)) => {
                cmd.arg("-map").arg("0:v:0");
                cmd.arg("-map").arg("0:a:0?");
            }
            (Some(_), None) => {
                cmd.arg("-map").arg("0:v:0");
                cmd.arg("-an");
            }
            (None, Some(_)) => {
                cmd.arg("-vn");
                cmd.arg("-map").arg("0:a:0?");
            }
            (None, None) => {}
        }

        if let Some(video) = &task.video {
            cmd.arg("-c:v").arg("libx264");
            cmd.arg("-preset").arg(&self.config.preset);
            cmd.arg("-crf").arg(self.config.crf.to_string());
            if let Some(height) = video.height {
                cmd.arg("-vf").arg(format!("scale=-2:{}", height));
            }
            if let Some(fps) = video.fps {
                cmd.arg("-r").arg(fps.to_string());
            }
            if let Some(interval) = video.keyframe_interval {
                cmd.arg("-g").arg(interval.to_string());
                cmd.arg("-keyint_min").arg(interval.to_string());
                cmd.arg("-sc_threshold").arg("0");
            }
        }

        if let Some(audio) = &task.audio {
            let codec = match audio.codec {
                FfmpegAudioCodec::Aac => "aac",
                FfmpegAudioCodec::Mp3 => "libmp3lame",
            };
            cmd.arg("-c:a").arg(codec);
            if let Some(bitrate) = audio.bitrate_kbps {
                cmd.arg("-b:a").arg(format!("{}k", bitrate));
            }
        }

        if task.faststart {
            cmd.arg("-movflags").arg("+faststart");
        }

        cmd.arg(&task.output);
        cmd
    }
}
