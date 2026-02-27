const video = document.getElementById("video");
const originalSrc = video.dataset.src || video.getAttribute("data-src") || video.currentSrc || video.src || "";
const player = document.getElementById("player");
let audio = document.getElementById("audio");
if (!audio && player) {
    audio = document.createElement("audio");
    audio.id = "audio";
    audio.preload = "auto";
    audio.style.display = "none";
    player.appendChild(audio);
}
const controls = document.getElementById("controls");
const centerPlay = document.getElementById("center-play");
const playPauseBtn = document.getElementById("play-pause");
const playIcon = document.getElementById("play-icon");
const pauseIcon = document.getElementById("pause-icon");
const smallPlayIcon = playPauseBtn.querySelector("svg");

const seekbar = document.getElementById("seekbar");
const progress = document.getElementById("progress");
const buffer = document.getElementById("buffer");
const handle = document.getElementById("handle");
const tooltip = document.getElementById("tooltip");
const currentTimeText = document.getElementById("current-time");
const totalTimeText = document.getElementById("total-time");

const muteBtn = document.getElementById("mute-btn");
const volumeSlider = document.getElementById("volume-slider");
const volumeIcon = document.getElementById("volume-icon");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const speedBtn = document.getElementById("speed-btn");
const speedMenu = document.getElementById("speed-menu");
const speedRange = document.getElementById("speed-range");
const speedInput = document.getElementById("speed-input");
const pipBtn = document.getElementById("pip-btn");
const castBtn = document.getElementById("cast-btn");
const qualityBtn = document.getElementById("quality-btn");
const qualityMenu = document.getElementById("quality-menu");
const loadingSpinner = document.getElementById("loading-spinner");

const miniSeekbar = document.getElementById("mini-seekbar");
const miniProgress = document.getElementById("mini-progress");
const miniBuffer = document.getElementById("mini-buffer");
const preview = document.getElementById("preview");
const previewStrip = document.getElementById("preview-strip");
const previewTime = document.getElementById("preview-time");
const debugPanel = document.getElementById("debug-panel");
const dbgNet = document.getElementById("dbg-net");
const dbgReady = document.getElementById("dbg-ready");
const dbgState = document.getElementById("dbg-state");
const dbgTime = document.getElementById("dbg-time");
const dbgDur = document.getElementById("dbg-dur");
const dbgPlayrate = document.getElementById("dbg-playrate");
const dbgVol = document.getElementById("dbg-vol");
const dbgMuted = document.getElementById("dbg-muted");
const dbgSize = document.getElementById("dbg-size");
const dbgFrames = document.getElementById("dbg-frames");
const dbgDrop = document.getElementById("dbg-drop");
const dbgBuffer = document.getElementById("dbg-buffer");
const dbgBufferBar = document.getElementById("dbg-buffer-bar");
const dbgBufrange = document.getElementById("dbg-bufrange");
const dbgRate = document.getElementById("dbg-rate");

let hideTimeout;
let lastBufferedEnd = 0;
let lastBufferedAt = performance.now();
let touchSeekActive = false;
let touchSeekStartY = 0;
let touchSeekStartTime = 0;
let touchSeekLastY = 0;
let touchSeekLastAt = 0;
let wheelSeekTime = null;
let wheelSeekTimeout;
let previewHideTimeout;
let previewVideo;
let previewReady = false;
let previewBlocked = false;
let previewWidth = 200;
let previewHeight = 112;
let previewCanvases = [];
let previewCtxs = [];
let previewCenterIndex = 0;
const thumbnailMap = new Map();
const thumbnailMapLow = new Map();
const THUMB_INTERVAL = 1;
const THUMB_MIN_WIDTH = 140;
const THUMB_MAX_WIDTH = 240;
const PREVIEW_GAP = 6;
const PREVIEW_HIDE_DELAY = 520;
const PREVIEW_MAX_THUMBS = 600;
const PREVIEW_HIGH_THUMBS = 120;
const PREVIEW_LOW_SCALE = 0.34;
let previewRangeStart = 0;
let previewRangeEnd = 0;
let previewGenerationId = 0;
let previewInitInFlight = false;
let lastPreviewSrc = "";
let initialSeekTime = null;
let lastUrlUpdate = 0;
let lastUrlValue = "";
let qualityOptions = [];
let selectedQuality = "Original";
let audioUrl = null;
let useExternalAudio = false;
let videoMutedBeforeExternal = null;
const AUDIO_RECOVER_THRESHOLD = 0.8;
const AUDIO_RESYNC_INTERVAL = 1500;
let lastAudioResyncAt = 0;
let lastQualityKey = null;
const DEBUG_AUDIO = true;
const logAudio = (label, detail) => {
    if (!DEBUG_AUDIO) return;
    try {
        console.debug(`[audio] ${label}`, detail || "");
    } catch (err) {
    }
};
let qualityRetryCount = 0;
let qualityRetryTimer;
let qualityRetryInFlight = false;
const QUALITY_RETRY_LIMIT = 6;
const QUALITY_RETRY_DELAY = 1500;

const readStartTimeFromUrl = () => {
    const url = new URL(window.location.href);
    const queryValue = url.searchParams.get("t");
    const hashValue = url.hash.startsWith("#t=") ? url.hash.slice(3) : null;
    const value = queryValue || hashValue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const updateUrlTime = (timeValue) => {
    if (!Number.isFinite(timeValue)) return;
    const now = performance.now();
    if (now - lastUrlUpdate < 350) return;
    lastUrlUpdate = now;
    const formatted = timeValue.toFixed(2);
    if (formatted === lastUrlValue) return;
    lastUrlValue = formatted;
    const url = new URL(window.location.href);
    url.searchParams.set("t", formatted);
    history.replaceState(null, "", url);
};

const encodePath = (parts) => parts.map((part) => encodeURIComponent(part)).join("/");
const joinEncoded = (prefix, parts) => {
    const encoded = encodePath(parts);
    return encoded ? `${prefix}/${encoded}` : prefix;
};

const scheduleQualityRetry = () => {
    if (qualityRetryCount >= QUALITY_RETRY_LIMIT) return;
    if (qualityRetryTimer) return;
    qualityRetryCount += 1;
    qualityRetryTimer = setTimeout(() => {
        qualityRetryTimer = null;
        loadQualityOptions();
    }, QUALITY_RETRY_DELAY);
};

const safeDecode = (value) => {
    try {
        return decodeURIComponent(value);
    } catch (err) {
        return value;
    }
};

const getRawParts = () => {
    const src = video.currentSrc || video.src || originalSrc || "";
    if (!src) return null;
    const url = new URL(src, window.location.href);
    if (!url.pathname.startsWith("/raw/")) return null;
    const raw = url.pathname.replace(/^\/raw\//, "");
    const parts = raw.split("/").filter(Boolean).map(safeDecode);
    if (!parts.length) return null;
    return { url, parts };
};

const parseRenditionMeta = (name) => {
    const match = name.match(/_(\d+)p(\d+)fps\.mp4$/i) || name.match(/_(\d+)p\.mp4$/i);
    if (!match) return { label: name, height: null, fps: null };
    const height = Number(match[1]);
    const fps = match[2] ? Number(match[2]) : null;
    const label = fps ? `${height}p ${fps}fps` : `${height}p`;
    return { label, height, fps };
};

const getPreviewSource = () => {
    const candidates = qualityOptions
        .filter((option) => Number.isFinite(option.height))
        .sort((a, b) => a.height - b.height);
    const preferred = candidates.find((option) => option.height === 144);
    if (preferred) return preferred.url;
    if (candidates.length) return candidates[0].url;
    return video.currentSrc || video.src || "";
};

const renderQualityMenu = () => {
    if (!qualityMenu) return;
    qualityMenu.innerHTML = "";
    qualityOptions.forEach((option) => {
        const button = document.createElement("button");
        button.className = "quality-item";
        if (option.label === selectedQuality) {
            button.classList.add("is-active");
        }
        button.textContent = option.label;
        button.dataset.url = option.url || "";
        button.addEventListener("click", () => {
            setQuality(option);
        });
        qualityMenu.appendChild(button);
    });
    qualityBtn.textContent = selectedQuality || "Original";
};

const syncAudioState = () => {
    if (!audio || !useExternalAudio) return;
    audio.volume = video.volume;
    audio.playbackRate = video.playbackRate;
};

const toAbsoluteUrl = (value) => {
    try {
        return new URL(value, window.location.href).toString();
    } catch (err) {
        return value;
    }
};

const ensureAudioSource = () => {
    if (!audio || !audioUrl) return;
    const target = toAbsoluteUrl(audioUrl);
    if (audio.src !== target) {
        audio.src = target;
        audio.load();
        logAudio("set-src", target);
    }
};

const safePlay = (media) => {
    if (!media || !media.play) return;
    const promise = media.play();
    if (promise && promise.catch) {
        promise.catch((err) => {
            if (media === audio) logAudio("play-failed", err);
        });
    }
};

const playExternalAudio = (timeValue) => {
    if (!audio || !useExternalAudio) {
        logAudio("skip", { reason: "disabled", useExternalAudio, hasAudio: Boolean(audio) });
        return Promise.resolve(false);
    }
    ensureAudioSource();
    const current = Number.isFinite(timeValue) ? timeValue : video.currentTime;
    audio.currentTime = Math.min(current, audio.duration || current);
    logAudio("play", { time: audio.currentTime, paused: audio.paused, src: audio.src });
    const promise = audio.play();
    if (!promise || !promise.then) return Promise.resolve(true);
    return promise
        .then(() => {
            logAudio("play-ok", { time: audio.currentTime });
            return true;
        })
        .catch((err) => {
            logAudio("play-reject", err);
            return false;
        });
};

const startPlayback = () => {
    if (!video.src && originalSrc) {
        video.src = originalSrc;
    }
    if (useExternalAudio) {
        playExternalAudio(getPlaybackTime()).then(() => {
            safePlay(video);
        });
        return;
    }
    safePlay(video);
};

const pausePlayback = () => {
    video.pause();
    if (audio && useExternalAudio) {
        audio.pause();
    }
};

const setExternalAudioEnabled = (enabled) => {
    useExternalAudio = Boolean(enabled && audioUrl);
    if (!audio) return;
    if (!useExternalAudio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        logAudio("disable", { audioUrl });
        if (videoMutedBeforeExternal !== null) {
            video.muted = videoMutedBeforeExternal;
            videoMutedBeforeExternal = null;
        }
        return;
    }
    if (videoMutedBeforeExternal === null) {
        videoMutedBeforeExternal = video.muted;
    }
    video.muted = true;
    ensureAudioSource();
    audio.muted = videoMutedBeforeExternal;
    syncAudioState();
    logAudio("enable", { audioUrl, muted: audio.muted, volume: audio.volume });
};

const setLoadingState = (isLoading) => {
    if (!player) return;
    if (isLoading) {
        player.classList.add("is-loading");
    } else {
        player.classList.remove("is-loading");
    }
};

const getPlaybackTime = () => (useExternalAudio && audio ? audio.currentTime : video.currentTime);

const getPlaybackDuration = () => (useExternalAudio && audio && Number.isFinite(audio.duration)
    ? audio.duration
    : video.duration);


const applyQualitySource = (option, displayLabel) => {
    if (!option || !option.url) return;
    if ((video.currentSrc || video.src) === option.url) {
        qualityMenu.classList.remove("open");
        return;
    }
    const wasPaused = video.paused;
    const currentTime = getPlaybackTime();
    const rate = video.playbackRate;
    selectedQuality = displayLabel;
    qualityBtn.textContent = displayLabel;
    qualityMenu.classList.remove("open");
    setExternalAudioEnabled(Boolean(audioUrl));

    const onLoaded = async () => {
        if (audio && useExternalAudio) {
            ensureAudioSource();
            audio.currentTime = Math.min(currentTime, audio.duration || currentTime);
            logAudio("sync-after-load", { time: audio.currentTime });
        }
        video.currentTime = Math.min(currentTime, video.duration || currentTime);
        video.playbackRate = rate;
        syncAudioState();
        if (!wasPaused) {
            startPlayback();
        }
    };

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.src = option.url;
    video.load();
};

const setQuality = (option) => {
    if (!option) return;
    applyQualitySource(option, option.label);
};

const loadQualityOptions = async () => {
    if (qualityRetryInFlight) return;
    qualityRetryInFlight = true;
    try {
        const rawInfo = getRawParts();
        if (!rawInfo) return;
        const { parts } = rawInfo;
        const rawKey = parts.join("/");
        if (rawKey === lastQualityKey && qualityOptions.length) return;
        lastQualityKey = rawKey;
        let fileName = parts[parts.length - 1];
        let dirParts = parts.slice(0, -1);
        let elDir = `.el.${fileName}`;

        if (parts.length >= 2 && parts[parts.length - 2].startsWith(".el.")) {
            elDir = parts[parts.length - 2];
            fileName = elDir.slice(4);
            dirParts = parts.slice(0, -2);
        }

        const dirPath = joinEncoded("/ls", dirParts);

        let dirResponse;
        try {
            const resp = await fetch(dirPath);
            if (!resp.ok) {
                scheduleQualityRetry();
                return;
            }
            dirResponse = await resp.json();
        } catch (err) {
            scheduleQualityRetry();
            return;
        }
        const elEntry = (dirResponse.dirs || []).find((d) => d.name === elDir);
        if (!elEntry) {
            scheduleQualityRetry();
            return;
        }

        const elPath = joinEncoded("/ls", [...dirParts, elDir]);

        let elResponse;
        try {
            const resp = await fetch(elPath);
            if (!resp.ok) {
                scheduleQualityRetry();
                return;
            }
            elResponse = await resp.json();
        } catch (err) {
            scheduleQualityRetry();
            return;
        }

        const fileEntries = (elResponse.files || []).map((f) => ({
            name: f.name,
            size: Number.isFinite(f.size) ? f.size : null,
        }));
        const audioFile = fileEntries.find((file) => file.name.toLowerCase().endsWith("_audio.mp3"))?.name || null;
        const files = fileEntries.filter((file) => file.name.toLowerCase().endsWith(".mp4"));

        if (!files.length) {
            scheduleQualityRetry();
            return;
        }

        const baseRaw = joinEncoded("/raw", dirParts);
        const originalUrl = `${baseRaw}/${encodeURIComponent(fileName)}`;
        audioUrl = audioFile
            ? `${baseRaw}/${encodeURIComponent(elDir)}/${encodeURIComponent(audioFile)}`
            : null;
        if (!audioUrl && useExternalAudio) {
            setExternalAudioEnabled(false);
        }
        const options = files.map((file) => {
            const url = `${baseRaw}/${encodeURIComponent(elDir)}/${encodeURIComponent(file.name)}`;
            const meta = parseRenditionMeta(file.name);
            return {
                label: meta.label,
                height: meta.height,
                fps: meta.fps,
                sizeBytes: file.size,
                bitrateMbps: null,
                url,
            };
        });

        const currentUrl = video.currentSrc || video.src;
        const match = options.find((option) => option.url === currentUrl);
        const isOriginal = currentUrl === originalUrl;
        const previousQuality = selectedQuality;
        qualityOptions = [
            { label: "Original", url: originalUrl },
            ...options,
        ];
        const allowedLabels = new Set(qualityOptions.map((option) => option.label));
        if (match) {
            selectedQuality = match.label;
        } else if (allowedLabels.has(previousQuality)) {
            selectedQuality = previousQuality;
        } else {
            selectedQuality = isOriginal ? "Original" : qualityOptions[0].label;
        }
        renderQualityMenu();
        setExternalAudioEnabled(Boolean(audioUrl));
        if (!currentUrl && options.length) {
            applyQualitySource(qualityOptions[0], "Original");
        }
        initPreviewGenerator();
        qualityRetryCount = 0;
        if (qualityRetryTimer) {
            clearTimeout(qualityRetryTimer);
            qualityRetryTimer = null;
        }
    } finally {
        qualityRetryInFlight = false;
    }
};

const formatTime = (value) => {
    if (!Number.isFinite(value)) return "00:00.00";
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = Math.floor(value % 60);
    const cs = Math.floor((value - Math.floor(value)) * 100);
    const base = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
    if (h > 0) {
        return `${h}:${base}`;
    }
    return base;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const updateScrubUI = (timeValue) => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return 0;
    const clamped = clamp(timeValue, 0, video.duration);
    const percent = (clamped / video.duration) * 100;
    progress.style.width = `${percent}%`;
    handle.style.left = `${percent}%`;
    miniProgress.style.width = `${percent}%`;
    currentTimeText.textContent = formatTime(clamped);
    return clamped;
};

const applySeek = (newTime) => {
    const duration = getPlaybackDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;
    const clamped = updateScrubUI(newTime);
    requestAnimationFrame(() => {
        if (audio && useExternalAudio) {
            audio.currentTime = Math.min(clamped, audio.duration || clamped);
        }
        video.currentTime = clamped;
    });
};

const updatePreviewCanvases = () => {
    if (!previewStrip) return;
    const available = Math.max(0, window.innerWidth - 24);
    const rawCount = Math.floor((available + PREVIEW_GAP) / (previewWidth + PREVIEW_GAP));
    const count = Math.max(3, rawCount % 2 === 0 ? rawCount - 1 : rawCount);
    if (count === previewCanvases.length) return;
    previewStrip.innerHTML = "";
    previewCanvases = [];
    previewCtxs = [];
    for (let i = 0; i < count; i += 1) {
        const canvas = document.createElement("canvas");
        canvas.className = "preview-canvas";
        canvas.width = previewWidth;
        canvas.height = previewHeight;
        canvas.style.width = `${previewWidth}px`;
        canvas.style.height = `${previewHeight}px`;
        previewStrip.appendChild(canvas);
        previewCanvases.push(canvas);
        previewCtxs.push(canvas.getContext("2d"));
    }
    previewCenterIndex = Math.floor(count / 2);
};

const setPreviewSize = (width, height) => {
    previewWidth = width;
    previewHeight = height;
    updatePreviewCanvases();
};

const showPreview = (timeValue) => {
    if (!preview || previewBlocked) return;
    preview.classList.add("visible");
    clearTimeout(previewHideTimeout);
    if (previewTime) previewTime.textContent = formatTime(timeValue);
    ensurePreviewWindow(Math.round(timeValue / THUMB_INTERVAL));
};

const hidePreview = () => {
    if (!preview) return;
    preview.classList.remove("visible");
};

const scheduleHidePreview = () => {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = setTimeout(() => {
        hidePreview();
    }, PREVIEW_HIDE_DELAY);
};

const drawPreview = (timeValue) => {
    if (!previewCtxs.length || previewBlocked) return;
    const index = Math.round(timeValue / THUMB_INTERVAL);
    const fallbackIndex = Math.floor(timeValue / THUMB_INTERVAL);
    const baseIndex = thumbnailMap.has(index) || thumbnailMapLow.has(index) ? index : fallbackIndex;
    previewCtxs.forEach((ctx, i) => {
        ctx.clearRect(0, 0, previewWidth, previewHeight);
        const offset = i - previewCenterIndex;
        const thumbIndex = baseIndex + offset;
        const thumb = thumbnailMap.get(thumbIndex) || thumbnailMapLow.get(thumbIndex);
        if (thumb) {
            ctx.drawImage(thumb, 0, 0, previewWidth, previewHeight);
        }
    });
};

const getPreviewCenter = () => {
    const timeValue = wheelSeekTime !== null ? wheelSeekTime : video.currentTime;
    return Math.round((timeValue || 0) / THUMB_INTERVAL);
};

const ensurePreviewWindow = (centerIndex) => {
    if (centerIndex >= previewRangeStart && centerIndex <= previewRangeEnd) return;
    generateThumbnails(centerIndex);
};

const seekPreviewVideo = (timeValue) => new Promise((resolve) => {
    if (!previewVideo) {
        resolve();
        return;
    }
    if (!Number.isFinite(timeValue) || !Number.isFinite(previewVideo.duration)) {
        resolve();
        return;
    }
    const onSeeked = () => {
        previewVideo.removeEventListener("seeked", onSeeked);
        resolve();
    };
    previewVideo.addEventListener("seeked", onSeeked);
    const clamped = clamp(timeValue, 0, previewVideo.duration);
    if (!Number.isFinite(clamped)) {
        previewVideo.removeEventListener("seeked", onSeeked);
        resolve();
        return;
    }
    if (previewVideo.fastSeek) {
        previewVideo.fastSeek(clamped);
    } else {
        previewVideo.currentTime = clamped;
    }
});

const captureThumbnailAt = async (timeValue, index, scale, targetMap) => {
    if (!previewVideo || !previewCtxs.length || previewBlocked) return;
    await seekPreviewVideo(timeValue);
    const canvas = document.createElement("canvas");
    const width = Math.max(2, Math.round(previewWidth * scale));
    const height = Math.max(2, Math.round(previewHeight * scale));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    try {
        ctx.drawImage(previewVideo, 0, 0, width, height);
    } catch (err) {
        previewBlocked = true;
        thumbnailMap.clear();
        thumbnailMapLow.clear();
        hidePreview();
        return;
    }

    if (window.createImageBitmap) {
        const bitmap = await createImageBitmap(canvas);
        targetMap.set(index, bitmap);
    } else {
        targetMap.set(index, canvas);
    }
};

const buildIndexQueue = (centerIndex, startIndex, endIndex) => {
    const order = [];
    const seen = new Set();
    const pushIndex = (idx) => {
        if (idx < startIndex || idx > endIndex || seen.has(idx)) return;
        seen.add(idx);
        order.push(idx);
    };

    pushIndex(centerIndex);
    const maxOffset = Math.max(centerIndex - startIndex, endIndex - centerIndex);
    for (let offset = 1; offset <= maxOffset; offset += 1) {
        pushIndex(centerIndex - offset);
        pushIndex(centerIndex + offset);
    }
    return order;
};

const generateThumbnails = async (centerOverride) => {
    if (previewBlocked || !previewVideo) return;
    if (!Number.isFinite(previewVideo.duration) || previewVideo.duration <= 0) return;
    const count = Math.floor(previewVideo.duration / THUMB_INTERVAL);
    const center = typeof centerOverride === "number" ? centerOverride : getPreviewCenter();
    const maxThumbs = Math.min(count + 1, PREVIEW_MAX_THUMBS);
    const radius = Math.floor(maxThumbs / 2);
    const startIndex = clamp(center - radius, 0, count);
    const endIndex = clamp(center + radius, 0, count);
    previewRangeStart = startIndex;
    previewRangeEnd = endIndex;

    previewReady = false;
    thumbnailMap.clear();
    thumbnailMapLow.clear();

    const generationId = ++previewGenerationId;
    const order = buildIndexQueue(center, startIndex, endIndex);
    const highRadius = Math.min(radius, Math.floor(PREVIEW_HIGH_THUMBS / 2));
    const highStart = clamp(center - highRadius, startIndex, endIndex);
    const highEnd = clamp(center + highRadius, startIndex, endIndex);
    const highSet = new Set(buildIndexQueue(center, highStart, highEnd));

    for (let i = 0; i < order.length; i += 1) {
        if (generationId !== previewGenerationId) return;
        const index = order[i];
        const timeValue = Math.min(previewVideo.duration, index * THUMB_INTERVAL);
        await captureThumbnailAt(timeValue, index, PREVIEW_LOW_SCALE, thumbnailMapLow);
        if (!previewReady) previewReady = true;
        if (i % 6 === 0) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
    }

    const highOrder = Array.from(highSet);
    for (let i = 0; i < highOrder.length; i += 1) {
        if (generationId !== previewGenerationId) return;
        const index = highOrder[i];
        const timeValue = Math.min(previewVideo.duration, index * THUMB_INTERVAL);
        await captureThumbnailAt(timeValue, index, 1, thumbnailMap);
        if (i % 6 === 0) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
    }
};

const initPreviewGenerator = () => {
    if (!previewStrip || previewBlocked) return;
    const src = getPreviewSource();
    if (!src || !video.duration) return;
    if (previewInitInFlight) return;
    if (previewVideo && lastPreviewSrc === src) return;
    previewReady = false;
    thumbnailMap.clear();
    previewInitInFlight = true;
    lastPreviewSrc = src;

    previewVideo = document.createElement("video");
    previewVideo.muted = true;
    previewVideo.preload = "auto";
    previewVideo.src = src;
    previewVideo.crossOrigin = "anonymous";
    previewVideo.playsInline = true;
    previewVideo.addEventListener("loadedmetadata", () => {
        const ratio = previewVideo.videoWidth && previewVideo.videoHeight
            ? previewVideo.videoWidth / previewVideo.videoHeight
            : (16 / 9);
        const width = clamp(200, THUMB_MIN_WIDTH, THUMB_MAX_WIDTH);
        const height = Math.max(1, Math.round(width / ratio));
        setPreviewSize(width, height);
        generateThumbnails(getPreviewCenter());
        previewInitInFlight = false;
    }, { once: true });
    previewVideo.addEventListener("error", () => {
        previewInitInFlight = false;
    }, { once: true });
    previewVideo.load();
};

window.addEventListener("resize", () => {
    if (!previewStrip) return;
    updatePreviewCanvases();
    if (wheelSeekTime !== null) {
        drawPreview(wheelSeekTime);
    }
});

const shouldIgnoreSeekGesture = (target) => {
    if (controls.contains(target)) return true;
    if (seekbar.contains(target)) return true;
    if (speedMenu.contains(target)) return true;
    return false;
};

const shouldIgnoreScrollSeek = (target) => {
    if (!target) return false;
    if (target.closest("input, button")) return true;
    if (speedMenu.contains(target)) return true;
    if (seekbar.contains(target)) return true;
    return false;
};

const updateUI = () => {
    if (video.paused) {
        playIcon.style.display = "block";
        pauseIcon.style.display = "none";
        smallPlayIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
        showControls();
    } else {
        playIcon.style.display = "none";
        pauseIcon.style.display = "block";
        smallPlayIcon.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
        resetHideTimer();
    }
};

const setPlaybackRate = (rate) => {
    const clamped = Math.min(3, Math.max(0.25, Number(rate) || 1));
    video.playbackRate = clamped;
    if (audio && useExternalAudio) audio.playbackRate = clamped;
    speedBtn.textContent = `${clamped.toFixed(2).replace(/\.00$/, "").replace(/0$/, "")}x`;
    speedRange.value = clamped;
    speedInput.value = clamped;
    updateDebugInfo();
};

const updateProgress = () => {
    const duration = getPlaybackDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (wheelSeekTime !== null) {
        totalTimeText.textContent = formatTime(duration);
        return;
    }
    if (audio && useExternalAudio) {
        const now = performance.now();
        if (!video.paused && audio.paused && now - lastAudioResyncAt > AUDIO_RESYNC_INTERVAL) {
            lastAudioResyncAt = now;
            playExternalAudio(audio.currentTime);
        }
        const delta = Math.abs(video.currentTime - audio.currentTime);
        if (delta > AUDIO_RECOVER_THRESHOLD && now - lastAudioResyncAt > AUDIO_RESYNC_INTERVAL) {
            lastAudioResyncAt = now;
            video.currentTime = audio.currentTime;
        }
    }
    const timeValue = getPlaybackTime();
    const percent = (timeValue / duration) * 100;
    progress.style.width = `${percent}%`;
    handle.style.left = `${percent}%`;
    miniProgress.style.width = `${percent}%`;
    currentTimeText.textContent = formatTime(timeValue);
    totalTimeText.textContent = formatTime(duration);
    updateDebugInfo();
};

const updateBuffer = () => {
    if (!video.duration || !video.buffered.length) return;
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    const percent = (bufferedEnd / video.duration) * 100;
    buffer.style.width = `${percent}%`;
    miniBuffer.style.width = `${percent}%`;
    updateNetworkDebug(bufferedEnd, percent);
    
};

const updateNetworkDebug = (bufferedEnd, percent) => {
    const now = performance.now();
    const deltaTime = (now - lastBufferedAt) / 1000;
    const deltaBuf = Math.max(0, bufferedEnd - lastBufferedEnd);
    if (deltaTime > 0) {
        const rate = (deltaBuf / deltaTime) * 1000;
        dbgRate.textContent = `${Math.round(rate)} KB/s`;
    }
    lastBufferedEnd = bufferedEnd;
    lastBufferedAt = now;

    dbgNet.textContent = video.networkState;
    dbgReady.textContent = video.readyState;
    dbgState.textContent = video.paused ? "paused" : "playing";
    dbgBuffer.textContent = `${Math.floor(percent)}%`;
    dbgBufferBar.style.width = `${percent}%`;
    updateDebugInfo();
};

const updateDebugInfo = () => {
    dbgTime.textContent = formatTime(video.currentTime);
    dbgDur.textContent = formatTime(video.duration);
    dbgPlayrate.textContent = `${video.playbackRate}x`;
    dbgVol.textContent = `${Math.round(video.volume * 100)}%`;
    dbgMuted.textContent = video.muted ? "muted" : "on";
    dbgSize.textContent = video.videoWidth && video.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : "-";

    const bufferedCount = video.buffered.length;
    if (bufferedCount > 0) {
        const end = video.buffered.end(bufferedCount - 1);
        dbgBufrange.textContent = `${bufferedCount} / ${Math.round(end)}s`;
    } else {
        dbgBufrange.textContent = "0";
    }

    let decoded = 0;
    let dropped = 0;
    if (video.getVideoPlaybackQuality) {
        const q = video.getVideoPlaybackQuality();
        decoded = q.totalVideoFrames || 0;
        dropped = q.droppedVideoFrames || 0;
    } else {
        decoded = video.webkitDecodedFrameCount || 0;
        dropped = video.webkitDroppedFrameCount || 0;
    }
    dbgFrames.textContent = `${decoded}`;
    dbgDrop.textContent = `${dropped}`;
};

const showControls = () => {
    controls.classList.remove("is-hidden");
    controls.classList.add("is-visible");
    player.classList.add("controls-dim");
    miniSeekbar.classList.remove("visible");
    clearTimeout(hideTimeout);
};

const hideControls = () => {
    if (!video.paused) {
        controls.classList.remove("is-visible");
        controls.classList.add("is-hidden");
        player.classList.remove("controls-dim");
        miniSeekbar.classList.add("visible");
    }
};

const resetHideTimer = () => {
    clearTimeout(hideTimeout);
    if (!video.paused) {
        hideTimeout = setTimeout(hideControls, 3000);
    }
};

const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (video.paused) {
        startPlayback();
    } else {
        pausePlayback();
    }
};

const seek = (e) => {
    const rect = seekbar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
};

// Events
centerPlay.addEventListener("click", togglePlay);
playPauseBtn.addEventListener("click", togglePlay);

video.addEventListener("play", updateUI);
video.addEventListener("pause", updateUI);
video.addEventListener("loadstart", () => setLoadingState(true));
video.addEventListener("waiting", () => setLoadingState(true));
video.addEventListener("stalled", () => setLoadingState(true));
video.addEventListener("canplay", () => setLoadingState(false));
video.addEventListener("playing", () => setLoadingState(false));
video.addEventListener("error", () => setLoadingState(false));
audio && audio.addEventListener("waiting", () => setLoadingState(true));
audio && audio.addEventListener("playing", () => setLoadingState(false));
audio && audio.addEventListener("error", () => setLoadingState(false));
video.addEventListener("pause", () => {
    if (audio && useExternalAudio) {
        audio.pause();
    }
});
video.addEventListener("seeking", () => {
    if (audio && useExternalAudio) {
        audio.currentTime = video.currentTime;
    }
});
video.addEventListener("seeked", () => {
    if (audio && useExternalAudio) {
        audio.currentTime = video.currentTime;
    }
});
video.addEventListener("timeupdate", updateProgress);
video.addEventListener("timeupdate", () => {
    if (wheelSeekTime !== null) return;
    updateUrlTime(getPlaybackTime());
});
video.addEventListener("progress", updateBuffer);
video.addEventListener("loadedmetadata", updateProgress);
video.addEventListener("loadedmetadata", () => {
    updateBuffer();
    updateDebugInfo();
    if (initialSeekTime !== null) {
        applySeek(initialSeekTime);
        initialSeekTime = null;
    }
    loadQualityOptions();
    initPreviewGenerator();
});

player.addEventListener("click", (e) => {
    if (e.target === player || e.target === video) {
        if (controls.classList.contains("is-hidden")) showControls();
        else hideControls();
        return;
    }

    if (controls.contains(e.target)) {
        const isButton = e.target.closest(".icon-button, .center-button");
        if (!isButton) {
            if (video.paused) {
                showControls();
            } else {
                hideControls();
            }
        }
    }
});

player.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

speedBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    speedMenu.classList.toggle("open");
    qualityMenu.classList.remove("open");
});

qualityBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    qualityMenu.classList.toggle("open");
    speedMenu.classList.remove("open");
});

speedRange.addEventListener("input", () => {
    setPlaybackRate(speedRange.value);
});

speedInput.addEventListener("change", () => {
    setPlaybackRate(speedInput.value);
});

speedMenu.addEventListener("click", (e) => {
    const target = e.target.closest(".speed-chip");
    if (!target) return;
    const rate = Number(target.dataset.rate);
    if (!Number.isNaN(rate)) {
        setPlaybackRate(rate);
    }
});

document.addEventListener("click", (e) => {
    if (!speedMenu.contains(e.target) && e.target !== speedBtn) {
        speedMenu.classList.remove("open");
    }
    if (!qualityMenu.contains(e.target) && e.target !== qualityBtn) {
        qualityMenu.classList.remove("open");
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "d") {
        debugPanel.classList.toggle("visible");
    }
});

miniSeekbar.addEventListener("click", (e) => {
    const rect = miniSeekbar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const clampedPos = Math.max(0, Math.min(1, pos));
    const newTime = clampedPos * video.duration;

    const percent = clampedPos * 100;
    miniProgress.style.width = `${percent}%`;

    requestAnimationFrame(() => {
        video.currentTime = newTime;
    });
});

seekbar.addEventListener("mousedown", (e) => {
    seekbar.classList.add("active");
    let pendingSeek = null;

    const updateUIAndSeek = (pos) => {
        const clampedPos = Math.max(0, Math.min(1, pos));
        const newTime = clampedPos * video.duration;

        progress.style.width = `${clampedPos * 100}%`;
        handle.style.left = `${clampedPos * 100}%`;
        tooltip.textContent = formatTime(newTime);
        tooltip.style.left = `${clampedPos * 100}%`;
        currentTimeText.textContent = formatTime(newTime);
        showPreview(newTime);
        drawPreview(newTime);

        if (pendingSeek !== null) cancelAnimationFrame(pendingSeek);
        pendingSeek = requestAnimationFrame(() => {
            video.currentTime = newTime;
            pendingSeek = null;
        });
    };

    const rect = seekbar.getBoundingClientRect();
    const initialPos = (e.clientX - rect.left) / rect.width;
    updateUIAndSeek(initialPos);

    const onMouseMove = (ev) => {
        const currentRect = seekbar.getBoundingClientRect();
        const pos = (ev.clientX - currentRect.left) / currentRect.width;
        updateUIAndSeek(pos);
    };
    const onMouseUp = () => {
        seekbar.classList.remove("active");
        if (pendingSeek !== null) cancelAnimationFrame(pendingSeek);
        scheduleHidePreview();
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
});

seekbar.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    seekbar.classList.add("active");
    let pendingSeek = null;

    const updateUIAndSeek = (touch) => {
        const rect = seekbar.getBoundingClientRect();
        const pos = (touch.clientX - rect.left) / rect.width;
        const clampedPos = Math.max(0, Math.min(1, pos));
        const newTime = clampedPos * video.duration;

        progress.style.width = `${clampedPos * 100}%`;
        handle.style.left = `${clampedPos * 100}%`;
        tooltip.textContent = formatTime(newTime);
        tooltip.style.left = `${clampedPos * 100}%`;
        currentTimeText.textContent = formatTime(newTime);
        showPreview(newTime);
        drawPreview(newTime);

        if (pendingSeek !== null) cancelAnimationFrame(pendingSeek);
        pendingSeek = requestAnimationFrame(() => {
            video.currentTime = newTime;
            pendingSeek = null;
        });
    };

    updateUIAndSeek(e.touches[0]);

    const onTouchMove = (ev) => {
        if (ev.touches.length !== 1) return;
        ev.preventDefault();
        updateUIAndSeek(ev.touches[0]);
    };

    const onTouchEnd = () => {
        seekbar.classList.remove("active");
        if (pendingSeek !== null) cancelAnimationFrame(pendingSeek);
        scheduleHidePreview();
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
}, { passive: false });

seekbar.addEventListener("mousemove", (e) => {
    if (!seekbar.classList.contains("active")) {
        const rect = seekbar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        tooltip.textContent = formatTime(Math.max(0, Math.min(1, pos)) * video.duration);
        tooltip.style.left = `${Math.max(0, Math.min(1, pos)) * 100}%`;
    }
});

const handleWheelSeek = (e) => {
    if (!video.duration) return;
    if (shouldIgnoreScrollSeek(e.target)) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -1 : 1;
    const baseTime = wheelSeekTime !== null ? wheelSeekTime : video.currentTime;
    const newTime = clamp(baseTime + delta, 0, video.duration);
    wheelSeekTime = newTime;

    updateScrubUI(newTime);
    showPreview(newTime);
    drawPreview(newTime);

    clearTimeout(wheelSeekTimeout);
    wheelSeekTimeout = setTimeout(() => {
        if (wheelSeekTime !== null) {
            applySeek(wheelSeekTime);
            wheelSeekTime = null;
        }
        scheduleHidePreview();
    }, 220);
};

player.addEventListener("wheel", handleWheelSeek, { passive: false });
controls.addEventListener("wheel", handleWheelSeek, { passive: false });

player.addEventListener("touchstart", (e) => {
    if (shouldIgnoreSeekGesture(e.target)) return;
    if (e.touches.length !== 1) return;
    touchSeekActive = true;
    touchSeekStartY = e.touches[0].clientY;
    touchSeekStartTime = video.currentTime || 0;
    touchSeekLastY = touchSeekStartY;
    touchSeekLastAt = performance.now();
    wheelSeekTime = touchSeekStartTime;
}, { passive: true });

player.addEventListener("touchmove", (e) => {
    if (!touchSeekActive) return;
    if (!video.duration) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const currentY = e.touches[0].clientY;
    const now = performance.now();
    const deltaY = currentY - touchSeekLastY;
    const deltaTimeMs = Math.max(8, now - touchSeekLastAt);
    const speedPxPerMs = Math.abs(deltaY) / deltaTimeMs;
    const durationFactor = clamp(video.duration / 420, 0.7, 6.5);
    const speedGain = 0.34 * durationFactor;
    const speedScale = clamp(1 + Math.pow(speedPxPerMs * speedGain, 2.85), 1, 160);
    const secondsPerPixel = clamp(video.duration / 12000, 0.01, 0.3) * speedScale;
    const baseTime = wheelSeekTime !== null ? wheelSeekTime : touchSeekStartTime;
    const newTime = baseTime - deltaY * secondsPerPixel;
    wheelSeekTime = clamp(newTime, 0, video.duration);
    touchSeekLastY = currentY;
    touchSeekLastAt = now;
    updateScrubUI(wheelSeekTime);
    showPreview(wheelSeekTime);
    drawPreview(wheelSeekTime);
}, { passive: false });

player.addEventListener("touchend", () => {
    if (touchSeekActive && wheelSeekTime !== null) {
        applySeek(wheelSeekTime);
    }
    wheelSeekTime = null;
    scheduleHidePreview();
    touchSeekActive = false;
});

player.addEventListener("touchcancel", () => {
    wheelSeekTime = null;
    scheduleHidePreview();
    touchSeekActive = false;
});

muteBtn.addEventListener("click", () => {
    if (audio && useExternalAudio) {
        audio.muted = !audio.muted;
    } else {
        video.muted = !video.muted;
    }
    updateVolumeUI();
});

pipBtn.addEventListener("click", async () => {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            return;
        }
        if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
            await video.requestPictureInPicture();
        }
    } catch (err) {
        alert("PiPに対応していません。");
    }
});

castBtn.addEventListener("click", () => {
    if (window.chrome && window.chrome.cast && window.chrome.cast.requestSession) {
        window.chrome.cast.requestSession();
    } else {
        alert("キャスト機能は利用できません。");
    }
});

volumeSlider.addEventListener("input", () => {
    const volumeValue = Number(volumeSlider.value);
    if (audio && useExternalAudio) {
        audio.volume = volumeValue;
        audio.muted = (audio.volume === 0);
        video.volume = volumeValue;
    } else {
        video.volume = volumeValue;
        video.muted = (video.volume === 0);
    }
    updateVolumeUI();
    updateDebugInfo();
});

const updateVolumeUI = () => {
    const muted = useExternalAudio && audio ? audio.muted : video.muted;
    const volumeValue = useExternalAudio && audio ? audio.volume : video.volume;
    volumeSlider.value = muted ? 0 : volumeValue;
    if (useExternalAudio && audio) {
        video.volume = volumeValue;
    }
    if (muted || volumeValue === 0) {
        volumeIcon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.58.45-1.27.82-2.05 1.05v2.06c1.32-.3 2.5-.92 3.48-1.73l2.05 2.05L21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
    } else if (volumeValue < 0.5) {
        volumeIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm11 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>`;
    } else {
        volumeIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
    }
};

fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
        player.requestFullscreen();
        fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
    } else {
        document.exitFullscreen();
        fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
    }
});

initialSeekTime = readStartTimeFromUrl();
showControls();
updateVolumeUI();
setPlaybackRate(1);
loadQualityOptions();
