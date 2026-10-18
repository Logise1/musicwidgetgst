const MUSIC_DIR = "music";
const BAR_COUNT = 28;
const STORAGE_KEY = "xmas-ost-state";
const KEY_FILE = "xmas-ost-file";
const KEY_NUM = "xmas-ost-num";
const KEY_TIME = "xmas-ost-time";
const KEY_PAUSED = "xmas-ost-paused";
const KEY_INDEX = "xmas-ost-index";

const FALLBACK_TRACKS = [
  { file: "8-bit Village theme.mp3", title: "8-bit Village Theme", artist: "GST" },
  { file: "Build & Bolt theme #01 (2020).mp3", title: "Build & Bolt Theme #01 (2020)", artist: "GST" },
  { file: "Build & Bolt theme #02 (2020).mp3", title: "Build & Bolt Theme #02 (2020)", artist: "GST" },
  { file: "Easter GST Remix (Logise).mp3", title: "Easter GST Remix", artist: "Logise" },
  { file: "Halloween GST Remix (Logise).mp3", title: "Halloween GST Remix", artist: "Logise" },
  { file: "ho-ho-ho-merry-christmas.mp3", title: "Ho Ho Ho Merry Christmas", artist: "GST" },
  { file: "Jazzy GST Remix (Logise).mp3", title: "Jazzy GST Remix", artist: "Logise" },
  { file: "Main Village theme #2.mp3", title: "Main Village Theme #2", artist: "GST" },
  { file: "Main Village theme #3.mp3", title: "Main Village Theme #3", artist: "GST" },
  { file: "Main Village Theme 2015-2017.mp3", title: "Main Village Theme 2015-2017", artist: "GST" },
  { file: "Main Village Theme 2018-2023.mp3", title: "Main Village Theme 2018-2023", artist: "GST" },
  { file: "Search Theme.mp3", title: "Search Theme", artist: "GST" },
  { file: "Space GST Remix (Logise).mp3", title: "Space GST Remix", artist: "Logise" },
  { file: "Village #2 (2014).mp3", title: "Village #2 (2014)", artist: "GST" },
  { file: "Village #2 (2017).mp3", title: "Village #2 (2017)", artist: "GST" },
  { file: "Village #3 (2014).mp3", title: "Village #3 (2014)", artist: "GST" },
  { file: "Village Daytime Theme 2012-2014.mp3", title: "Village Daytime Theme 2012-2014", artist: "GST" },
  { file: "Wrap battle ( Song 2).mp3", title: "Wrap Battle (Song 2)", artist: "GST" },
  { file: "Wrap battle music (Song 1).mp3", title: "Wrap Battle Music (Song 1)", artist: "GST" },
  { file: "Wrap Battle music Part #1 (EXTENDED).mp3", title: "Wrap Battle Music Part #1 (Extended)", artist: "GST" },
];

const widget = document.getElementById("widget");
const visualizer = document.getElementById("visualizer");
const titleEl = document.getElementById("title");
const titleCopy = document.getElementById("titleCopy");
const titleTrack = document.getElementById("titleTrack");
const titleWrap = document.getElementById("titleWrap");
const artistEl = document.getElementById("artist");
const currentEl = document.getElementById("current");
const durationEl = document.getElementById("duration");
const seekEl = document.getElementById("seek");
const wave = document.getElementById("wave");
const waveCtx = wave.getContext("2d");
const audio = document.getElementById("audio");

const bars = [];
const levels = new Float32Array(BAR_COUNT);
let tracks = FALLBACK_TRACKS;
let currentIndex = -1;
let pendingSeek = 0;
let restoring = false;
let userPaused = false;
let lastGoodTime = 0;
let audioCtx = null;
let analyser = null;
let freqData = null;
let mediaSource = null;
let progressRatio = 0;

for (let i = 0; i < BAR_COUNT; i += 1) {
  const bar = document.createElement("span");
  bar.className = "bar";
  visualizer.appendChild(bar);
  bars.push(bar);
}

function parseTrack(file) {
  let name = file.replace(/\.(mp3|m4a)$/i, "").replace(/^\d+\s*-\s*/, "");
  const quoted = name.match(/^(.+?)\s*[＂"](.+)[＂"]/);
  let artist;
  let title;
  const credited = name.match(/^(.*?)\s*\(\s*([^)]+?)\s*\)\s*$/);

  if (quoted) {
    artist = quoted[1].trim();
    title = quoted[2].trim();
  } else if (name.includes(" - ")) {
    const idx = name.indexOf(" - ");
    artist = name.slice(0, idx).trim();
    title = name.slice(idx + 3).trim();
  } else if (credited && !/^\d{4}(?:\s*[-–]\s*\d{4})?$/.test(credited[2]) && !/^(song\s*\d+|extended)$/i.test(credited[2])) {
    title = credited[1].trim();
    artist = credited[2].trim();
  } else {
    artist = "GST";
    title = name;
  }

  if (title.includes("-") && !title.includes(" ")) {
    title = title
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  title = title
    .replace(/\s*\((?:Official(?:\s+(?:Video|Audio|Music Video|Visualizer))?|Lyric Video|Audio|Visualizer)\)/gi, "")
    .replace(/\s*\(\s+/g, " (")
    .replace(/\s+/g, " ")
    .trim();

  return { file, title, artist };
}

async function loadPlaylist() {
  try {
    const response = await fetch(`${MUSIC_DIR}/`);
    const html = await response.text();
    const files = [...html.matchAll(/href="([^"]+\.(?:mp3|m4a))"/gi)]
      .map((match) => decodeURIComponent(match[1].split("/").pop()))
      .filter(Boolean);
    if (files.length) return files.map(parseTrack);
  } catch {
    /* Live Server without listing: use the baked-in playlist */
  }
  return FALLBACK_TRACKS;
}

function trackUrl(file, time = 0) {
  const url = `${MUSIC_DIR}/${encodeURIComponent(file)}`;
  return time > 0.05 ? `${url}#t=${time.toFixed(2)}` : url;
}

function storageGet(key) {
  try {
    const value = localStorage.getItem(key);
    if (value != null && value !== "") return value;
  } catch {
    /* ignore */
  }
  try {
    const value = sessionStorage.getItem(key);
    if (value != null && value !== "") return value;
  } catch {
    /* ignore */
  }
  return readCookie(key);
}

function storageSet(key, value) {
  const text = String(value);
  try {
    localStorage.setItem(key, text);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(key, text);
  } catch {
    /* ignore */
  }
  document.cookie = `${key}=${encodeURIComponent(text)};path=/;max-age=31536000;SameSite=Lax`;
}

function readCookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function readState() {
  const file = storageGet(KEY_FILE);
  const time = Number(storageGet(KEY_TIME));
  const num = storageGet(KEY_NUM);
  const index = Number(storageGet(KEY_INDEX));
  if (!file && !num && !Number.isInteger(index)) {
    try {
      const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (legacy?.file) return legacy;
    } catch {
      /* ignore */
    }
    return null;
  }
  return {
    file,
    num,
    index: Number.isFinite(index) ? index : -1,
    time: Number.isFinite(time) ? time : 0,
    userPaused: storageGet(KEY_PAUSED) === "1",
  };
}

function getSafeTime() {
  if (pendingSeek > 0.05) return pendingSeek;
  const live = audio.currentTime;
  if (Number.isFinite(live) && live > 0.4) {
    lastGoodTime = live;
    return live;
  }
  return lastGoodTime;
}

function saveState() {
  if (restoring || currentIndex < 0 || !tracks[currentIndex]) return;
  const time = getSafeTime();
  if (!(time > 0.4) && lastGoodTime <= 0.4) return;
  const file = tracks[currentIndex].file;
  const num = (file.match(/^\d+/) || [String(currentIndex)])[0];
  storageSet(KEY_FILE, file);
  storageSet(KEY_NUM, num);
  storageSet(KEY_TIME, time.toFixed(2));
  storageSet(KEY_PAUSED, userPaused ? "1" : "0");
  storageSet(KEY_INDEX, currentIndex);
}

function waitFor(element, eventName, timeout = 4000) {
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      element.removeEventListener(eventName, finish);
      resolve();
    };
    const timer = window.setTimeout(finish, timeout);
    element.addEventListener(eventName, finish);
  });
}

function findTrackIndex(saved) {
  if (saved?.file) {
    const exact = tracks.findIndex((track) => track.file === saved.file);
    if (exact >= 0) return exact;
  }
  const num = saved?.num || String(saved?.file || "").match(/^\d+/)?.[0];
  if (num) {
    const byNumber = tracks.findIndex((track) => (track.file.match(/^\d+/) || [""])[0] === num);
    if (byNumber >= 0) return byNumber;
  }
  if (Number.isInteger(saved?.index) && saved.index >= 0 && tracks[saved.index]) {
    return saved.index;
  }
  return -1;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function pickRandomIndex() {
  if (tracks.length === 1) return 0;
  let next = currentIndex;
  while (next === currentIndex) {
    next = Math.floor(Math.random() * tracks.length);
  }
  return next;
}

function loadTrack(index, resumeTime = 0) {
  currentIndex = index;
  pendingSeek = resumeTime > 0.05 ? resumeTime : 0;
  lastGoodTime = pendingSeek > 0 ? pendingSeek : 0;
  const track = tracks[index];
  titleEl.textContent = track.title;
  titleCopy.textContent = track.title;
  artistEl.textContent = track.artist;
  progressRatio = resumeTime > 0 && audio.duration ? resumeTime / audio.duration : 0;
  setupTitleMarquee();
  currentEl.textContent = formatTime(pendingSeek);
  durationEl.textContent = "0:00";
  audio.src = trackUrl(track.file, pendingSeek);
  audio.load();
  if (!restoring) saveState();
}

function ensureGraph() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.78;
  freqData = new Uint8Array(analyser.frequencyBinCount);
  mediaSource = audioCtx.createMediaElementSource(audio);
  mediaSource.connect(analyser);
  analyser.connect(audioCtx.destination);
}

async function playCurrent() {
  ensureGraph();
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  try {
    await audio.play();
    widget.classList.remove("is-blocked", "is-paused");
  } catch {
    widget.classList.add("is-blocked", "is-paused");
  }
}

function togglePlayback() {
  if (audio.paused) {
    userPaused = false;
    playCurrent();
    return;
  }
  userPaused = true;
  audio.pause();
  widget.classList.add("is-paused");
  saveState();
}

function applyPendingSeek() {
  if (!(pendingSeek > 0.05) || !Number.isFinite(audio.duration) || audio.duration <= 0) {
    return false;
  }
  if (pendingSeek >= audio.duration - 0.35) {
    pendingSeek = 0;
    return "ended";
  }
  try {
    audio.currentTime = pendingSeek;
  } catch {
    return false;
  }
  pendingSeek = 0;
  updateProgress();
  return true;
}

async function seekToSaved(time) {
  if (!(time > 0.05)) return false;
  pendingSeek = time;
  lastGoodTime = time;
  if (audio.readyState < 1) await waitFor(audio, "loadedmetadata", 5000);
  if (audio.readyState < 2) await waitFor(audio, "canplay", 5000);
  if (Number.isFinite(audio.duration) && time >= audio.duration - 0.35) {
    pendingSeek = 0;
    return "ended";
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      audio.currentTime = time;
    } catch {
      /* retry */
    }
    await waitFor(audio, "seeked", 700);
    if (Number.isFinite(audio.currentTime) && audio.currentTime >= time - 1) {
      pendingSeek = 0;
      lastGoodTime = audio.currentTime;
      updateProgress();
      return true;
    }
  }
  return Number.isFinite(audio.currentTime) && audio.currentTime >= time - 1;
}

function updateProgress() {
  const { currentTime, duration } = audio;
  const shown = currentTime > 0.4 ? currentTime : restoring || lastGoodTime > currentTime ? lastGoodTime : currentTime;
  currentEl.textContent = formatTime(shown);
  durationEl.textContent = formatTime(duration);
  progressRatio = duration > 0 ? shown / duration : 0;
  saveState();
}

function seekFromEvent(event) {
  const duration = audio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const rect = seekEl.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * duration;
  pendingSeek = 0;
  updateProgress();
  saveState();
}

function overlayUnit() {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u")) || 1;
}

function setupTitleMarquee() {
  titleTrack.classList.remove("is-scrolling");
  requestAnimationFrame(() => {
    const overflow = titleEl.scrollWidth > titleWrap.clientWidth + 4;
    titleTrack.classList.toggle("is-scrolling", overflow);
    if (overflow) {
      const seconds = Math.max(10, titleEl.scrollWidth / 70);
      titleTrack.style.setProperty("--title-speed", `${seconds}s`);
    }
  });
}

function drawWave(time) {
  const rect = seekEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (wave.width !== width || wave.height !== height) {
    wave.width = width;
    wave.height = height;
  }

  const unit = overlayUnit();
  const thickness = 10 * unit * dpr;
  const pad = thickness / 2 + 1;
  const inner = Math.max(1, width - pad * 2);
  const amplitude = Math.min(7 * unit * dpr, height / 2 - pad);
  const mid = height / 2;
  const cycles = 18;

  waveCtx.clearRect(0, 0, width, height);
  waveCtx.lineCap = "round";
  waveCtx.lineJoin = "round";

  const phase = (time || 0) / 800;
  const yAt = (x) => {
    const t = (x - pad) / inner;
    return mid + Math.sin(t * Math.PI * 2 * cycles + phase) * amplitude;
  };

  const stroke = (fromX, toX, color) => {
    if (toX - fromX < 1) return;
    waveCtx.beginPath();
    waveCtx.strokeStyle = color;
    waveCtx.lineWidth = thickness;
    for (let x = fromX; x <= toX; x += 1) {
      const y = yAt(x);
      if (x === fromX) waveCtx.moveTo(x, y);
      else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
  };

  stroke(pad, pad + inner, "rgba(255, 255, 255, 0.28)");
  stroke(pad, pad + inner * progressRatio, "#ffffff");
}

function fitOverlay() {
  const width = window.innerWidth || 1920;
  const height = window.innerHeight || 1080;
  const unit = Math.min(width / 1920, height / 1080);
  document.documentElement.style.setProperty("--u", String(unit > 0 ? unit : 1));
  setupTitleMarquee();
}

function updateBars(time) {
  const idle = !analyser || audio.paused;
  if (!idle) {
    analyser.getByteFrequencyData(freqData);
  }

  const unit = overlayUnit();
  const minH = 28 * unit;
  const travel = 220 * unit;

  for (let i = 0; i < BAR_COUNT; i += 1) {
    let target = minH;
    if (idle) {
      const wave = (Math.sin(time / 420 + i * 0.45) + 1) / 2;
      target = minH + wave * (travel * 0.28);
    } else {
      const start = Math.floor((i / BAR_COUNT) ** 1.55 * freqData.length * 0.72);
      const end = Math.max(start + 1, Math.floor(((i + 1) / BAR_COUNT) ** 1.55 * freqData.length * 0.72));
      let sum = 0;
      for (let n = start; n < end; n += 1) sum += freqData[n];
      target = minH + (sum / (end - start) / 255) * travel;
    }

    levels[i] += (target - levels[i]) * 0.28;
    bars[i].style.height = `${levels[i]}px`;
  }

  const duration = audio.duration;
  if (Number.isFinite(duration) && duration > 0) {
    const currentTime = audio.currentTime;
    const shown =
      currentTime > 0.4 ? currentTime : restoring || lastGoodTime > currentTime ? lastGoodTime : currentTime;
    progressRatio = shown / duration;
    currentEl.textContent = formatTime(shown);
    durationEl.textContent = formatTime(duration);
  }

  drawWave(time);
  requestAnimationFrame(updateBars);
}

widget.addEventListener("click", (event) => {
  if (event.target.closest("#seek")) return;
  togglePlayback();
});

seekEl.addEventListener("click", (event) => {
  event.stopPropagation();
  seekFromEvent(event);
});

audio.addEventListener("timeupdate", updateProgress);
audio.addEventListener("loadedmetadata", () => {
  const seeked = applyPendingSeek();
  if (seeked === "ended" && !restoring) {
    loadTrack(pickRandomIndex());
    playCurrent();
    return;
  }
  updateProgress();
});
audio.addEventListener("durationchange", () => {
  applyPendingSeek();
  updateProgress();
});
audio.addEventListener("ended", () => {
  pendingSeek = 0;
  loadTrack(pickRandomIndex());
  playCurrent();
});
audio.addEventListener("play", () => widget.classList.remove("is-blocked", "is-paused"));
audio.addEventListener("pause", () => {
  if (!audio.ended) widget.classList.add("is-paused");
  if (getSafeTime() > 0.4) saveState();
});

window.addEventListener("resize", fitOverlay);
window.addEventListener("pagehide", saveState);
window.addEventListener("beforeunload", saveState);
document.addEventListener("visibilitychange", () => {
  saveState();
});
setInterval(saveState, 250);

(async function start() {
  fitOverlay();
  const saved = readState();
  tracks = await loadPlaylist();
  const savedIndex = saved ? findTrackIndex(saved) : -1;
  const shouldResume = savedIndex >= 0;
  const resumeTime = shouldResume ? Number(saved.time) || 0 : 0;
  userPaused = Boolean(saved?.userPaused);
  lastGoodTime = resumeTime;

  restoring = true;
  audio.muted = true;
  loadTrack(shouldResume ? savedIndex : pickRandomIndex(), resumeTime);

  if (audio.readyState < 1) {
    await waitFor(audio, "loadedmetadata", 5000);
  }

  if (resumeTime > 0.05) {
    await playCurrent();
    const seeked = await seekToSaved(resumeTime);
    if (seeked === "ended") {
      restoring = false;
      audio.muted = false;
      userPaused = false;
      lastGoodTime = 0;
      loadTrack(pickRandomIndex());
      if (audio.readyState < 1) await waitFor(audio, "loadedmetadata", 3000);
      await playCurrent();
    } else if (userPaused) {
      audio.pause();
      widget.classList.add("is-paused");
    }
  } else if (userPaused) {
    widget.classList.add("is-paused");
  } else {
    await playCurrent();
  }

  restoring = false;
  audio.muted = false;
  if (lastGoodTime > 0.4) saveState();
  requestAnimationFrame(updateBars);
})();
