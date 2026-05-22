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
const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const filePicker = document.getElementById("filePicker");

const pitch = document.getElementById("pitch");
const reverb = document.getElementById("reverb");
const delay = document.getElementById("delay");

const pitchValue = document.getElementById("pitchValue");
const reverbValue = document.getElementById("reverbValue");
const delayValue = document.getElementById("delayValue");

function setStatus(msg) {
  statusEl.textContent = msg;
}

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

function updatePadUI() {
  activeSlotLabel.textContent = pads[activePadIndex].name;
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
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

const impulse = createReverbImpulse();

function playPad(index) {
  const pad = pads[index];
  if (!pad.buffer) {
    setStatus(`${pad.name} にサンプルがありません。`);
    return;
  }

  if (audioContext.state === "suspended") audioContext.resume();

  const source = audioContext.createBufferSource();
  source.buffer = pad.buffer;

  const dry = audioContext.createGain();
  const wet = audioContext.createGain();
  const delayNode = audioContext.createDelay(1.2);
  const feedback = audioContext.createGain();
  const convolver = audioContext.createConvolver();

  source.playbackRate.value = Math.pow(2, Number(pitch.value) / 12);
  convolver.buffer = impulse;

  wet.gain.value = Number(reverb.value);
  delayNode.delayTime.value = Number(delay.value);
  feedback.gain.value = 0.35;

  source.connect(dry);
  dry.connect(audioContext.destination);

  source.connect(convolver);
  convolver.connect(wet);
  wet.connect(audioContext.destination);

  source.connect(delayNode);
  delayNode.connect(feedback);
  feedback.connect(delayNode);
  delayNode.connect(audioContext.destination);

  source.start();
  setStatus(`${pad.name} を再生しました。`);
}

async function assignAudio(arrayBuffer) {
  const decoded = await audioContext.decodeAudioData(arrayBuffer);
  pads[activePadIndex].buffer = decoded;
  setStatus(`${pads[activePadIndex].name} にサンプルを割り当てました。`);
  updatePadUI();
}

recordBtn.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const arr = await blob.arrayBuffer();
      await assignAudio(arr);
      stream.getTracks().forEach((t) => t.stop());
      stopBtn.disabled = true;
      recordBtn.disabled = false;
    };

    mediaRecorder.start();
    setStatus("録音中... Stopで終了してください。");
    recordBtn.disabled = true;
    stopBtn.disabled = false;
  } catch {
    setStatus("マイク録音に失敗しました。権限設定を確認してください。");
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
});

filePicker.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const arr = await file.arrayBuffer();
  await assignAudio(arr);
});

window.addEventListener("keydown", (event) => {
  const idx = Number(event.key) - 1;
  if (idx >= 0 && idx < pads.length) {
    activePadIndex = idx;
    updatePadUI();
    playPad(idx);
  }
});

[pitch, reverb, delay].forEach((slider) => {
  slider.addEventListener("input", () => {
    pitchValue.textContent = pitch.value;
    reverbValue.textContent = reverb.value;
    delayValue.textContent = delay.value;
  });
});

buildPads();
