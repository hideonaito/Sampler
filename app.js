const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const pads = Array.from({ length: 9 }, (_, idx) => ({
  name: `Pad ${idx + 1}`,
  buffer: null,
}));

let activePadIndex = 0;
let mediaRecorder = null;
let recordedChunks = [];

const statusEl = document.getElementById("status");
const activeSlotLabel = document.getElementById("activeSlotLabel");
const padsContainer = document.getElementById("pads");
const recordToggleBtn = document.getElementById("recordToggleBtn");
const filePicker = document.getElementById("filePicker");
const clearPadBtn = document.getElementById("clearPadBtn");

const pitch = document.getElementById("pitch");
const tempo = document.getElementById("tempo");
const reverb = document.getElementById("reverb");
const delay = document.getElementById("delay");

const pitchValue = document.getElementById("pitchValue");
const tempoValue = document.getElementById("tempoValue");
const reverbValue = document.getElementById("reverbValue");
const delayValue = document.getElementById("delayValue");
const cutStart = document.getElementById("cutStart");
const cutEnd = document.getElementById("cutEnd");
const cutStartValue = document.getElementById("cutStartValue");
const cutEndValue = document.getElementById("cutEndValue");
const applyCutBtn = document.getElementById("applyCutBtn");
const waveformCanvas = document.getElementById("waveformCanvas");
const wfCtx = waveformCanvas.getContext("2d");

function setStatus(msg) { statusEl.textContent = msg; }

function buildPads() {
  padsContainer.innerHTML = "";
  pads.forEach((pad, index) => {
    const btn = document.createElement("button");
    btn.className = "pad";
    btn.textContent = `${pad.name}${pad.buffer ? " ●" : ""}`;
    if (index === activePadIndex) btn.classList.add("active");
    btn.addEventListener("click", () => {
      activePadIndex = index;
      updatePadUI();
      playPad(index);
    });
    padsContainer.appendChild(btn);
  });
}

function drawWaveform() {
  const width = waveformCanvas.width;
  const height = waveformCanvas.height;
  const pad = pads[activePadIndex];

  wfCtx.clearRect(0, 0, width, height);
  wfCtx.fillStyle = "#101417";
  wfCtx.fillRect(0, 0, width, height);

  if (!pad.buffer) {
    wfCtx.fillStyle = "#6f8b77";
    wfCtx.font = "14px sans-serif";
    wfCtx.fillText("No sample loaded", 18, height / 2 + 4);
    return;
  }

  const data = pad.buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const amp = (height / 2) * 0.9;

  wfCtx.strokeStyle = "#86f0a3";
  wfCtx.lineWidth = 1;
  wfCtx.beginPath();

  for (let x = 0; x < width; x++) {
    let min = 1;
    let max = -1;
    const start = x * step;
    const end = Math.min(start + step, data.length);
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    wfCtx.moveTo(x, (1 + min) * amp);
    wfCtx.lineTo(x, (1 + max) * amp);
  }
  wfCtx.stroke();

  const startX = (Number(cutStart.value) / 100) * width;
  const endX = (Number(cutEnd.value) / 100) * width;
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);

  wfCtx.fillStyle = "rgba(0,0,0,0.42)";
  wfCtx.fillRect(0, 0, left, height);
  wfCtx.fillRect(right, 0, width - right, height);

  wfCtx.strokeStyle = "#ff9f2c";
  wfCtx.lineWidth = 2;
  wfCtx.beginPath();
  wfCtx.moveTo(left, 0);
  wfCtx.lineTo(left, height);
  wfCtx.moveTo(right, 0);
  wfCtx.lineTo(right, height);
  wfCtx.stroke();
}

function updatePadUI() {
  activeSlotLabel.textContent = pads[activePadIndex].name;
  refreshCutDisplay();
  [...padsContainer.children].forEach((node, idx) => {
    node.classList.toggle("active", idx === activePadIndex);
    node.textContent = `${pads[idx].name}${pads[idx].buffer ? " ●" : ""}`;
  });
}

function createReverbImpulse(seconds = 2, decay = 2) {
  const rate = audioContext.sampleRate;
  const length = rate * seconds;
  const impulse = audioContext.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return impulse;
}
const impulse = createReverbImpulse();

function createBufferFromChannels(channels, sampleRate) {
  const out = audioContext.createBuffer(channels.length, channels[0].length, sampleRate);
  channels.forEach((data, ch) => out.copyToChannel(data, ch));
  return out;
}

function granularProcess(buffer, pitchSemitones, tempoFactor) {
  const ratio = Math.pow(2, pitchSemitones / 12);
  const grainSize = Math.max(256, Math.floor(buffer.sampleRate * 0.045));
  const overlap = 0.5;
  const hopOut = Math.floor(grainSize * (1 - overlap));
  const hopIn = Math.max(1, Math.floor((hopOut * tempoFactor) / ratio));
  const outLength = Math.max(1, Math.floor(buffer.length / Math.max(tempoFactor, 0.01)));
  const channels = [];

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const input = buffer.getChannelData(ch);
    const output = new Float32Array(outLength + grainSize + 1);
    for (let outPos = 0, inPos = 0; outPos < outLength; outPos += hopOut, inPos += hopIn) {
      for (let i = 0; i < grainSize; i++) {
        const srcIndex = inPos + i * ratio;
        const i0 = Math.floor(srcIndex);
        const frac = srcIndex - i0;
        const s0 = input[i0] || 0;
        const s1 = input[i0 + 1] || 0;
        const sample = s0 + (s1 - s0) * frac;
        const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grainSize - 1));
        const o = outPos + i;
        if (o < output.length) output[o] += sample * win;
      }
    }
    channels.push(output.subarray(0, outLength));
  }

  return createBufferFromChannels(channels, buffer.sampleRate);
}


function playPad(index) {
  const pad = pads[index];
  if (!pad.buffer) return setStatus(`${pad.name} にサンプルがありません。`);
  if (audioContext.state === "suspended") audioContext.resume();

  const source = audioContext.createBufferSource();
  const processed = granularProcess(pad.buffer, Number(pitch.value), Number(tempo.value));
  source.buffer = processed;

  const dry = audioContext.createGain();
  const wet = audioContext.createGain();
  const delayNode = audioContext.createDelay(1.2);
  const feedback = audioContext.createGain();
  const convolver = audioContext.createConvolver();

  source.playbackRate.value = 1;
  convolver.buffer = impulse;
  wet.gain.value = Number(reverb.value);
  delayNode.delayTime.value = Number(delay.value);
  feedback.gain.value = 0.35;

  source.connect(dry); dry.connect(audioContext.destination);
  source.connect(convolver); convolver.connect(wet); wet.connect(audioContext.destination);
  source.connect(delayNode); delayNode.connect(feedback); feedback.connect(delayNode); delayNode.connect(audioContext.destination);

  const startRatio = Number(cutStart.value) / 100;
  const endRatio = Number(cutEnd.value) / 100;
  const startAt = processed.duration * Math.min(startRatio, endRatio);
  const endAt = processed.duration * Math.max(startRatio, endRatio);
  source.start(0, startAt, Math.max(0.02, endAt - startAt));
  setStatus(`${pad.name} を再生しました。`);
}

function refreshCutDisplay() {
  const pad = pads[activePadIndex];
  const duration = pad.buffer ? pad.buffer.duration : 0;
  cutStartValue.textContent = ((duration * Number(cutStart.value)) / 100).toFixed(2);
  cutEndValue.textContent = ((duration * Number(cutEnd.value)) / 100).toFixed(2);
  drawWaveform();
}

function resetCutRange() {
  cutStart.value = 0;
  cutEnd.value = 100;
  refreshCutDisplay();
}

function clearActivePad() {
  const pad = pads[activePadIndex];
  if (!pad.buffer) return setStatus(`${pad.name} はすでに空です。`);
  pad.buffer = null;
  resetCutRange();
  updatePadUI();
  setStatus(`${pad.name} のサンプルを消去しました。`);
}

async function assignAudio(arrayBuffer) {
  const decoded = await audioContext.decodeAudioData(arrayBuffer);
  pads[activePadIndex].buffer = decoded;
  resetCutRange();
  setStatus(`${pads[activePadIndex].name} にサンプルを割り当てました。`);
  updatePadUI();
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      await assignAudio(await blob.arrayBuffer());
      stream.getTracks().forEach((t) => t.stop());
      recordToggleBtn.textContent = "● Record";
    };
    mediaRecorder.start();
    setStatus("録音中... ボタンをもう一度押すと停止します。");
    recordToggleBtn.textContent = "■ Stop";
  } catch {
    setStatus("マイク録音に失敗しました。権限設定を確認してください。");
    recordToggleBtn.textContent = "● Record";
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    setStatus("録音停止中... サンプルを処理しています。");
  }
}

recordToggleBtn.addEventListener("click", async () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return startRecording();
  stopRecording();
});
clearPadBtn.addEventListener("click", clearActivePad);
filePicker.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await assignAudio(await file.arrayBuffer());
});
window.addEventListener("keydown", (event) => {
  const idx = Number(event.key) - 1;
  if (idx >= 0 && idx < pads.length) {
    activePadIndex = idx;
    updatePadUI();
    playPad(idx);
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") clearActivePad();
});

[pitch, tempo, reverb, delay].forEach((slider) => {
  slider.addEventListener("input", () => {
    pitchValue.textContent = pitch.value;
    tempoValue.textContent = Number(tempo.value).toFixed(2);
    reverbValue.textContent = reverb.value;
    delayValue.textContent = delay.value;
  });
});

cutStart.addEventListener("input", refreshCutDisplay);
cutEnd.addEventListener("input", refreshCutDisplay);
applyCutBtn.addEventListener("click", () => {
  const pad = pads[activePadIndex];
  if (!pad.buffer) return setStatus("先にサンプルを読み込んでください。");

  const startAt = pad.buffer.duration * Math.min(Number(cutStart.value), Number(cutEnd.value)) / 100;
  const endAt = pad.buffer.duration * Math.max(Number(cutStart.value), Number(cutEnd.value)) / 100;
  const frameStart = Math.floor(startAt * pad.buffer.sampleRate);
  const frameEnd = Math.floor(endAt * pad.buffer.sampleRate);
  const frameLength = Math.max(1, frameEnd - frameStart);
  const trimmed = audioContext.createBuffer(pad.buffer.numberOfChannels, frameLength, pad.buffer.sampleRate);

  for (let ch = 0; ch < pad.buffer.numberOfChannels; ch++) {
    const src = pad.buffer.getChannelData(ch).subarray(frameStart, frameStart + frameLength);
    trimmed.copyToChannel(src, ch, 0);
  }

  pad.buffer = trimmed;
  resetCutRange();
  setStatus(`${pad.name} を ${startAt.toFixed(2)}s - ${endAt.toFixed(2)}s でトリミングしました。`);
  updatePadUI();
});

buildPads();
refreshCutDisplay();
