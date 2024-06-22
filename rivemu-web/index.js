var lastEntropy = '';
var lastArgs = '';
var lastIncard = new Uint8Array([]);
var lastOutcard;
var lastTape;
var lastCartridge;
var lastFrame;
var lastTotalFrames;
var lastTargetFps;
var statusBeforePause;
var paused = false;
var speed = 1;
var runtimeInitialized = false;

let statusElem = document.getElementById("status");
let argsElem = document.getElementById("args");
let entropyElem = document.getElementById("entropy");
let timeElem = document.getElementById("time");
let scoreElem = document.getElementById("score");
let progressElem = document.getElementById("progress");
let frameElem = document.getElementById("frame");
let fpsElem = document.getElementById("fps");
let cpuCostElem = document.getElementById("cpuCost");
let cpuSpeedElem = document.getElementById("cpuSpeed");
let cpuUsageElem = document.getElementById("cpuUsage");
let cpuCyclesElem = document.getElementById("cpuCycles");
let resolutionElem = document.getElementById("resolution");
let canvasElem = document.getElementById("canvas");
let tapesizeElem = document.getElementById("tapesize");
let tapehashElem = document.getElementById("tapehash");
let entropyhashElem = document.getElementById("entropyhash");
let entropysizeElem = document.getElementById("entropysize");
let argshashElem = document.getElementById("argshash");
let argssizeElem = document.getElementById("argssize");
let inhashElem = document.getElementById("inhash");
let insizeElem = document.getElementById("insize");
let outhashElem = document.getElementById("outhash");
let outsizeElem = document.getElementById("outsize");
let cartsizeElem = document.getElementById("cartsize");
let carthashElem = document.getElementById("carthash");
let cartridgesElem = document.getElementById("cartridges");
let analysisBoxElem = document.getElementById("analysis-box");
let infoBoxElem = document.getElementById("info-box");
let changeSpeedElem = document.getElementById("change-speed");
let canvasDropElem = document.getElementById("canvas-drop");
let canvasStartElem = document.getElementById("canvas-start");
let canvasLoadElem = document.getElementById("canvas-load");
let textDecoder = new TextDecoder();
let textEncoder = new TextEncoder();
var Module = {};

// Prevent space bar from clicking buttons
window.addEventListener("keydown", function(e) {
  if (e.keyCode === 32) {
    e.preventDefault();
  }
});

// Allow starting different cartridges from cross origin iframes
window.addEventListener("message", async function(e) {
  let params = e.data;
  if (params.rivemuRunCode) {
    lastCartridge = textEncoder.encode(params.code);
    if (params.start) {
      rivemuRecord();
    } else {
      await rivemuStop();
      hideElem(canvasLoadElem);
      showFlexElem(canvasStartElem);
    }
  }
}, false);

// Alert when WebGL context is lost.
canvasElem.addEventListener("webglcontextlost", (e) => {
  alert('WebGL context lost. You will need to reload the page.'); e.preventDefault();
}, false);

canvasElem.ondragover = canvasElem.ondragenter = function(evt) {
  evt.preventDefault();
};

canvasElem.ondrop = function(e) {
  let file = e.dataTransfer.files[0];
  e.preventDefault();
  file.arrayBuffer().then(async function(a){
    await rivemuRecord(new Uint8Array(a));
  });
};

// Fired by Emscripten when WASM is ready.
Module.onRuntimeInitialized = function(status) {
  statusElem.textContent = "Idle";
  runtimeInitialized = true;
  window.dispatchEvent(new Event('rivemu_on_runtime_initialized'));
}

// Return SHA256 hexadecimal string from a chunk of data.
async function sha256sum(data) {
  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
  } catch(e) {
    console.error(e)
    return "";
  }
}

// Show an element.
function showFlexElem(el) {
  el.style.display = "flex";
}

// Show an element.
function showBlockElem(el) {
  el.style.display = "block";
}

// Show an element.
function hideElem(el) {
  el.style.display = "none";
}

// Toggle visibility of an element.
function toggleElemVisibility(el) {
  if (el.style.display === "none") {
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

// Open an user file dialog for saving a file.
function downloadFileDialog(data, filename) {
  if (typeof data === 'undefined') {
    return;
  }
  let blob = new Blob([data], { type: "application/octet-stream" });
  let url = URL.createObjectURL(blob);
  let el = document.createElement('a');
  el.style.display = 'none';
  el.download = filename;
  el.href = url;
  document.body.appendChild(el);
  el.click();
  URL.revokeObjectURL(url);
  el.remove();
}

// Open an user file dialog for downloading a file.
async function uploadFileDialog(ext) {
  let src = await new Promise(function(resolve, reject) {
    let el = document.createElement("input");
    el.type = "file";
    el.accept = ext;
    el.addEventListener('change', function() {
      if (el.files.length) {
        resolve(el.files[0]);
      } else {
        reject("No file");
      }
      el.remove();
    });
    el.click();
  });
  let url = URL.createObjectURL(src);
  showFlexElem(canvasLoadElem);
  let response = await fetch(url);
  URL.revokeObjectURL(url);
  if (!response.ok) {
    hideElem(canvasLoadElem);
    return null;
  }
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  hideElem(canvasLoadElem);
  return data;
}

// Fetch a file from a URL.
async function downloadFile(url) {
  // Retrieve cartridge
  showFlexElem(canvasLoadElem);
  const response = await fetch(url, {method: "GET", mode: "cors", cache: "no-cache"});
  if (!response.ok) {
    hideElem(canvasLoadElem);
    return null;
  }
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  hideElem(canvasLoadElem);
  return data;
}

// Waits for a window event to fire.
function waitEvent(name) {
  return new Promise((resolve) => {
    const listener = (e) => {
      window.removeEventListener(name, listener);
      resolve(e);
    }
    window.addEventListener(name, listener);
  })
}

// Wait the WASM emulator be downloaded and initialized.
async function waitRuntimeInitialize() {
  if (!runtimeInitialized) {
    statusElem.textContent = "Downloading emulator...";
    showFlexElem(canvasLoadElem);
    await waitEvent("rivemu_on_runtime_initialized");
    hideElem(canvasLoadElem);
  }
}

// Called before record/replaying.
async function rivemuBeforeStart(tape, cartridge, incard, entropy, args) {
  // Update statistics
  statusElem.textContent = "Loading...";
  scoreElem.textContent = "N/A";
  timeElem.textContent = "N/A";
  progressElem.textContent = "N/A";
  frameElem.textContent = "N/A";
  fpsElem.textContent = "N/A";
  cpuCostElem.textContent = "N/A";
  cpuSpeedElem.textContent = "N/A";
  cpuUsageElem.textContent = "N/A";
  cpuCyclesElem.textContent= "N/A";
  resolutionElem.textContent = "N/A";
  cartsizeElem.textContent = Math.ceil(cartridge.length / 1024) + " KB";
  carthashElem.textContent = await sha256sum(cartridge);
  inhashElem.textContent = await sha256sum(incard);
  insizeElem.textContent = incard.length + " B";
  entropyhashElem.textContent = await sha256sum(textEncoder.encode(entropy));
  entropysizeElem.textContent = entropy.length + " B";
  argshashElem.textContent = await sha256sum(textEncoder.encode(args));
  argssizeElem.textContent = args.length + " B";
  if (tape) {
    tapesizeElem.textContent = tape.length + " B";
    tapehashElem.textContent = await sha256sum(tape);
  } else {
    tapesizeElem.textContent = "N/A";
    tapehashElem.textContent = "N/A";
    outhashElem.textContent = "N/A";
    outsizeElem.textContent = "N/A";
  }
  changeSpeedElem.textContent = "1.0X"
  speed = 1.0;
  paused = false;

  // Disable some buttons while recording/replaying
  hideElem(canvasStartElem);
  hideElem(canvasDropElem);
  document.getElementById('pause').disabled = false;
  document.getElementById('change-speed').disabled = false;
  document.getElementById('stop').disabled = false;
  document.getElementById('record').disabled = false;
  document.getElementById('replay').disabled = false;
  document.getElementById('download_cartridge').disabled = false;

  // Clear info
  document.getElementById('name').textContent = 'N/A';
  document.getElementById('summary').textContent = 'N/A';
  document.getElementById('description').textContent = 'N/A';
  document.getElementById('tags').innerHTML = 'N/A';
  document.getElementById('links').innerHTML = 'N/A';
  document.getElementById('authors').innerHTML = 'N/A';
}

function resetCanvasSize() {
  canvasElem.width = 768;
  canvasElem.height = 768;
}

async function rivemuUpload(cartridgeUrl, incardUrl, tapeUrl, autoPlay) {
  hideElem(cartridgesElem);
  hideElem(canvasDropElem);
  await rivemuStop();
  resetCanvasSize();
  statusElem.textContent = "Downloading cartridge...";
  lastCartridge = cartridgeUrl ? await downloadFile(cartridgeUrl) : await uploadFileDialog(".sqfs");
  if (tapeUrl) {
    statusElem.textContent = "Downloading tape...";
    lastTape = tapeUrl ? await downloadFile(tapeUrl) : await uploadTapeDialog(".rivtape");
  }
  if (incardUrl) {
    statusElem.textContent = "Downloading incard...";
    lastIncard = incardUrl ? await downloadFile(incardUrl) : await uploadTapeDialog(".rivcard");
  }
  if (autoPlay) {
    rivemuStart();
  } else {
    showFlexElem(canvasStartElem);
  }
}

async function rivemuUploadCartridge(url) {
  hideElem(canvasDropElem);
  await rivemuStop();
  resetCanvasSize();
  statusElem.textContent = "Downloading cartridge...";
  let file = url ? await downloadFile(url) : await uploadFileDialog(".sqfs");
  await rivemuRecord(file);
}

function rivemuDownloadCartridge() {
  downloadFileDialog(lastCartridge, "cartridge.sqfs");
}

async function rivemuUploadTape(url) {
  let file = url ? await downloadFile(url) : await uploadFileDialog(".rivtape");
  await rivemuReplay(file);
}

function rivemuDownloadTape() {
  downloadFileDialog(lastTape, "gameplay.rivtape");
}

async function rivemuUploadIncard(url) {
  let file = url ? await downloadFile(url) : await uploadFileDialog(".rivcard");
  await rivemuRecord(null, file);
}

function rivemuDownloadIncard() {
  downloadFileDialog(lastIncard, "gameplay.rivcard");
}

function rivemuDownloadOutcard() {
  downloadFileDialog(lastOutcard, "gameplay.rivcard");
}

// Pause recording/replaying.
function rivemuPause() {
  if (!paused) {
    paused = true;
    statusBeforePause = statusElem.textContent;
    statusElem.textContent = "Paused";
    Module.ccall('rivemu_set_speed', null, ['number'], [0]);
  } else {
    paused = false;
    statusElem.textContent = statusBeforePause;
    Module.ccall('rivemu_set_speed', null, ['number'], [speed]);
  }
}

function rivemuChangeSpeed() {
  if (speed >= 4.0) {
    changeSpeedElem.textContent = "0.5X"
    speed = 0.5;
  } else if (speed >= 2.0) {
    changeSpeedElem.textContent = "4.0X"
    speed = 4.0;
  } else if (speed >= 1.5) {
    changeSpeedElem.textContent = "2.0X"
    speed = 2.0;
  } else if (speed >= 1) {
    changeSpeedElem.textContent = "1.5X"
    speed = 1.5;
  } else if (speed >= 0.5) {
    changeSpeedElem.textContent = "1.0X"
    speed = 1.0;
  }
  if (!paused) {
    Module.ccall('rivemu_set_speed', null, ['number'], [speed]);
  }
}

// Stop recording/replaying.
async function rivemuStop() {
  await waitRuntimeInitialize();
  if (Module.ccall('rivemu_stop')) {
    statusElem.textContent = "Stopping...";
    await waitEvent('rivemu_on_shutdown');
  }
  statusElem.textContent = "Stopped";
}

// Start recording a tape.
async function rivemuRecord(cartridge, incard, entropy, args) {
  // Wait previous run to finish
  await rivemuStop();
  // Set default arguments
  cartridge = cartridge || lastCartridge;
  incard = incard || lastIncard;
  entropy = entropy || entropyElem.value;
  args = args || argsElem.value;
  lastCartridge = cartridge;
  lastIncard = incard;
  lastEntropy = entropy;
  lastArgs = args;
  await rivemuBeforeStart(null, cartridge, incard, entropy, args);
  // Move cartridge into WASM memory
  const cartridgeBuf = Module._malloc(cartridge.length);
  const incardBuf = Module._malloc(incard.length);
  Module.HEAPU8.set(cartridge, cartridgeBuf);
  Module.HEAPU8.set(incard, incardBuf);
  Module.ccall('rivemu_start_record', null, ['number', 'number', 'number', 'number', 'string', 'string'], [
    cartridgeBuf, cartridge.length,
    incardBuf, incard.length,
    entropy, args
  ]);
  Module._free(cartridgeBuf);
  Module._free(incardBuf);
}

// Start replaying a tape.
async function rivemuReplay(tape, cartridge, incard, entropy, args) {
  // Wait previous run to finish
  await rivemuStop();
  // Set default arguments
  tape = tape || lastTape;
  cartridge = cartridge || lastCartridge;
  incard = incard || lastIncard;
  entropy = entropy || entropyElem.value;
  args = args || argsElem.value;
  lastTape = tape;
  lastCartridge = cartridge;
  lastIncard = incard;
  lastEntropy = entropy;
  lastArgs = args;
  await rivemuBeforeStart(tape, cartridge, incard, entropy, args);
  // Move cartridge into WASM memory
  const cartridgeBuf = Module._malloc(cartridge.length);
  const incardBuf = Module._malloc(incard.length);
  const tapeBuf = Module._malloc(tape.length);
  Module.HEAPU8.set(cartridge, cartridgeBuf);
  Module.HEAPU8.set(incard, incardBuf);
  Module.HEAPU8.set(tape, tapeBuf);
  Module.ccall('rivemu_start_replay', null, ['number', 'number', 'number', 'number', 'string', 'string', 'number', 'number'], [
    cartridgeBuf, cartridge.length,
    incardBuf, incard.length,
    entropy, args,
    tapeBuf, tape.length
  ]);
  Module._free(cartridgeBuf);
  Module._free(incardBuf);
  Module._free(tapeBuf);
}

// Called when big play button is pressed the first time.
function rivemuStart() {
  if (lastTape) {
    rivemuReplay()
  } else {
    rivemuRecord()
  }
}

// Enter fullscreen mode.
function rivemuFullscreen() {
  canvasElem.requestFullscreen();
}

function rivemuToggleAnalysis() {
  toggleElemVisibility(analysisBoxElem);
}

function rivemuToggleInfo() {
  toggleElemVisibility(infoBoxElem);
}

async function updateInfo(info) {
  document.getElementById('name').textContent = info.name;
  document.getElementById('summary').textContent = info.summary;
  document.getElementById('description').textContent = info.description;
  document.getElementById('tags').textContent = '';
  document.getElementById('links').textContent = '';
  document.getElementById('authors').textContent = '';
  // tags
  if (info.tags) {
    info.tags.forEach(function(tag) {
      let e = document.createElement('span');
      e.textContent = tag;
      document.getElementById('tags').append(e);
    });
  }
  // links
  if (info.links) {
    info.links.forEach(function(link) {
      let e = document.createElement('a');
      e.href = link;
      e.textContent = link;
      document.getElementById('links').append(e);
    });
  }
  // authors
  if (info.authors) {
    info.authors.forEach(function(author) {
      let e = document.createElement('a');
      e.textContent = author.name;
      e.href = author.link;
      document.getElementById('authors').append(e);
    });
  }
}

// Called by RIVEMU before the first frame.
function rivemu_on_begin(width, height, target_fps, total_frames, info_data) {
  if (info_data.length > 0) {
    try {
      let info = JSON.parse(textDecoder.decode(info_data));
      updateInfo(info);
    } catch(e) {
      console.error(e);
    }
  }
  lastFrame = 0;
  lastTotalFrames = total_frames;
  lastTargetFps = target_fps;
  resolutionElem.textContent =
    width+"x"+height+"@"+target_fps + " -> " + canvasElem.width+"x"+canvasElem.height+"@60";
  frameElem.textContent = "0";
  if (total_frames > 0) {
    progressElem.textContent = "0%";
    statusElem.textContent = "Replaying...";
  } else {
    statusElem.textContent = "Recording...";
  }
}

// Called by RIVEMU after the last frame.
async function rivemu_on_finish(tape, outcard, outhash) {
  // We need to make a deep copy of a Uint8Array here, otherwise
  lastTape = new Uint8Array(tape);
  lastOutcard = new Uint8Array(outcard);
  // Show outcard
  let outcard_str = textDecoder.decode(outcard);
  if (outcard_str.substring(0, 4) == 'JSON') {
    let scores = JSON.parse(outcard_str.substring(4));
    console.log(scores);
  }
  // Update buttons
  paused = false;
  document.getElementById('pause').disabled = true;
  document.getElementById('change-speed').disabled = true;
  document.getElementById('stop').disabled = true;
  document.getElementById('replay').disabled = false;
  document.getElementById('download_outcard').disabled = false;
  document.getElementById('download_incard').disabled = false;
  document.getElementById('download_tape').disabled = false;
  // Update labels
  statusElem.textContent = "Stopped";
  outhashElem.textContent = outhash;
  outsizeElem.textContent = outcard.length + " B";
  tapesizeElem.textContent = tape.length + " B";
  tapehashElem.textContent = await sha256sum(tape);
}

// Called by RIVEMU on every frame.
function rivemu_on_frame(outcard, frame, cycles, fps, cpu_cost, cpu_speed, cpu_usage, cpu_quota) {
  const mins = Math.floor(frame / (60 * lastTargetFps));
  const secs = (frame / lastTargetFps) - (60 * mins);
  timeElem.textContent = mins + " mins " + secs.toFixed(3) + " secs";
  fpsElem.textContent = fps.toFixed(2) + " fps";
  cpuCostElem.textContent = cpu_cost.toFixed(2) + " MIPS";
  cpuSpeedElem.textContent = cpu_speed.toFixed(2) + " MIPS";
  cpuUsageElem.textContent = cpu_usage.toFixed(2) + " %";
  cpuCyclesElem.textContent = (cycles / 1000000).toFixed(3) + " M (" + cpu_quota.toFixed(2) + "% quota)";
  frameElem.textContent = frame.toFixed(0);
  if (lastTotalFrames > 0) {
    progressElem.textContent = (frame*100/lastTotalFrames).toFixed(2) + "%";
  }
  let outcard_str = textDecoder.decode(outcard);
  if (outcard_str.substring(0, 4) == 'JSON') {
    let scores = JSON.parse(outcard_str.substring(4));
    if (typeof scores.score !== 'undefined') {
      scoreElem.textContent = scores.score;
    }
  }
}

// Parse params
let hash = window.location.hash.substr(1);
let params = hash.split('&').reduce(function (res, item) {
    var parts = item.split('=');
    res[parts[0]] = parts[1];
    return res;
}, {});

// Show or hide elements based on params
if (params.editor) {
  showFlexElem(canvasLoadElem);
} else {
  showBlockElem(cartridgesElem);
  showFlexElem(canvasDropElem);
}
if (params.nocontrols) {
  hideElem(document.getElementById('button-box'));
}
if (params.simple) {
  hideElem(document.getElementById('pause'));
  hideElem(document.getElementById('change-speed'));
  hideElem(document.getElementById('analyze'));
  hideElem(document.getElementById('info'));
}

// Play external cartridge
if (params.cartridge) {
  rivemuUpload(params.cartridge, params.incard, params.tape, params.autoplay);
}

// Send event to parent window when the page is loaded
window.parent.postMessage({ rivemuLoaded: true }, '*');
