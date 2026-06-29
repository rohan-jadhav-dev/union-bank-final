// ===================== ELEMENT REFERENCES =====================
const micButton = document.getElementById('micButton');
const listenIdle = document.getElementById('listenIdle');
const listenActive = document.getElementById('listenActive');
const detectedResult = document.getElementById('detectedResult');
const detectedChip = document.getElementById('detectedChip');
const detectedLangName = document.getElementById('detectedLangName');
const chipFlag = document.querySelector('.chip-flag');
const changeLangBtn = document.getElementById('changeLangBtn');
const langGrid = document.getElementById('langGrid');
const langOptions = document.querySelectorAll('.lang-option');

const processSection = document.getElementById('processSection');
const processCards = document.querySelectorAll('.process-card');
const btnBegin = document.getElementById('btnBegin');

let confirmedLanguage = null;
let selectedProcess = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let audioCtxForMeter = null;
let analyser = null;
let micStream = null;
let maxObservedVolume = 0;
let volumeCheckInterval = null;

const LANG_META = {
  "Hindi":   { flag: "हि" },
  "Marathi": { flag: "मा" },
  "Tamil":   { flag: "த"  },
  "Telugu":  { flag: "తె" },
  "English": { flag: "EN" },
};

// Minimum RMS volume (0-255 scale from getByteFrequencyData) to consider the
// clip as "the customer actually said something" rather than silence/noise.
const SILENCE_THRESHOLD = 8;
// Minimum transcript length (after trimming) to trust as a real language signal.
const MIN_TRANSCRIPT_CHARS = 3;

// ===================== STEP 1: REAL MIC RECORDING (with silence check) =====================
micButton.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream = stream;
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    audioChunks = [];
    maxObservedVolume = 0;

    // Set up a live volume meter so we can detect actual silence
    audioCtxForMeter = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtxForMeter.createMediaStreamSource(stream);
    analyser = audioCtxForMeter.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    volumeCheckInterval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      if (avg > maxObservedVolume) maxObservedVolume = avg;
    }, 100);

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = processDetectionAudio;
    mediaRecorder.start(100);
    isRecording = true;

    listenIdle.style.display = 'none';
    listenActive.classList.add('show');

    // Auto-stop after 4s so the customer doesn't have to tap stop
    setTimeout(() => { if (isRecording) stopRecording(); }, 4000);
  } catch (err) {
    // Mic denied — fall back to manual language picker, do NOT guess a language
    showManualPicker();
  }
});

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  if (volumeCheckInterval) { clearInterval(volumeCheckInterval); volumeCheckInterval = null; }
  if (audioCtxForMeter) { audioCtxForMeter.close().catch(() => {}); audioCtxForMeter = null; }
  isRecording = false;
}

// ===================== SEND AUDIO → BACKEND → REAL DETECTED LANGUAGE =====================
async function processDetectionAudio() {
  listenActive.classList.remove('show');

  // If the clip was effectively silent, don't even bother calling the
  // backend — Whisper will hallucinate text on silence/noise and we'd
  // wrongly "detect" a language. Go straight to manual picker instead.
  if (maxObservedVolume < SILENCE_THRESHOLD) {
    console.warn('[lang-detect] Skipped — silence detected (maxVolume=' + maxObservedVolume.toFixed(1) + ')');
    showManualPicker();
    return;
  }

  try {
    const mimeType = getSupportedMimeType();
    const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
    const wav = await convertToWav(blob);

    const formData = new FormData();
    formData.append('audio', wav, 'detect.wav');
    formData.append('language', 'auto');
    formData.append('process_type', 'General enquiry');

    const res = await fetch('http://localhost:8000/api/conversation/customer-speak', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    const transcript = (data.customer_text || '').trim();
    console.log('[lang-detect] Raw transcript:', JSON.stringify(transcript));

    // Reject too-short / empty transcripts — likely a hallucination, not
    // real speech. Don't guess a language off junk text.
    if (!data.success || transcript.length < MIN_TRANSCRIPT_CHARS || isLikelyHallucination(transcript)) {
      console.warn('[lang-detect] Rejected transcript as unreliable:', transcript);
      showManualPicker();
      return;
    }

    const detected = detectLangFromText(transcript);
    setDetectedLanguage(detected);
  } catch (e) {
    showManualPicker();
  }
}

// Common Whisper hallucination patterns on silence/noise — short repeated
// fillers, single stray words, or just punctuation.
function isLikelyHallucination(text) {
  const cleaned = text.replace(/[।.,!?\s]/g, '');
  if (cleaned.length < MIN_TRANSCRIPT_CHARS) return true;
  // Repeated single word/character spam (e.g. "ही ही ही", "...")
  const words = text.trim().split(/\s+/);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  if (words.length >= 3 && uniqueWords.size === 1) return true;
  return false;
}

// Script/character-based detection on the REAL transcript.
function detectLangFromText(text) {
  if (/[\u0900-\u097F]/.test(text)) {
    // Devanagari → could be Hindi or Marathi, check Marathi-specific words.
    // Require the marker word to be a whole word, not a substring match,
    // to avoid false positives on short/garbled transcripts.
    const marathiMarkers = /\b(आहे|आहेत|नाही|मला|तुम्ही|आपण|काय|होय)\b/;
    if (marathiMarkers.test(text)) return 'Marathi';
    return 'Hindi';
  }
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu';
  return 'English';
}

function setDetectedLanguage(langName) {
  confirmedLanguage = langName;
  const meta = LANG_META[langName] || LANG_META['English'];

  detectedLangName.textContent = langName;
  chipFlag.textContent = meta.flag;

  detectedResult.classList.add('show');
  revealProcessSection();
}

function showManualPicker() {
  confirmedLanguage = null;
  detectedLangName.textContent = 'Select language';
  chipFlag.textContent = '—';
  detectedResult.classList.add('show');
  langGrid.classList.add('show');
  revealProcessSection();
}

// ===================== STEP 2: LANGUAGE CONFIRM / CHANGE =====================
changeLangBtn.addEventListener('click', () => {
  langGrid.classList.toggle('show');
});

langOptions.forEach((btn) => {
  btn.addEventListener('click', () => {
    langOptions.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');

    confirmedLanguage = btn.dataset.lang;
    detectedLangName.textContent = confirmedLanguage;
    chipFlag.textContent = btn.dataset.code;

    langGrid.classList.remove('show');
  });
});

// ===================== STEP 3: PROCESS SELECT =====================
function revealProcessSection() {
  processSection.classList.add('show');
  btnBegin.classList.add('show');
}

processCards.forEach((card) => {
  card.addEventListener('click', () => {
    processCards.forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedProcess = card.dataset.process;
    btnBegin.disabled = false;
  });
});

// ===================== BEGIN CONVERSATION =====================
btnBegin.addEventListener('click', () => {
  if (btnBegin.disabled || !confirmedLanguage || !selectedProcess) return;

  sessionStorage.setItem('va_lang', confirmedLanguage);
  sessionStorage.setItem('va_process', selectedProcess);

  window.location.href = `conversation-desk.html?lang=${encodeURIComponent(confirmedLanguage)}&process=${encodeURIComponent(selectedProcess)}`;
});

// ===================== AUDIO HELPERS =====================
function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

async function convertToWav(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const numSamples = decoded.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const samples = decoded.getChannelData(0);
    function ws(o, s) { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
    ws(0,'RIFF'); view.setUint32(4,36+numSamples*2,true); ws(8,'WAVE');
    ws(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
    view.setUint16(22,1,true); view.setUint32(24,16000,true); view.setUint32(28,32000,true);
    view.setUint16(32,2,true); view.setUint16(34,16,true);
    ws(36,'data'); view.setUint32(40,numSamples*2,true);
    let off = 44;
    for (let i = 0; i < numSamples; i++, off += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    await audioCtx.close();
    return new Blob([buffer], { type: 'audio/wav' });
  } catch (e) { return blob; }
}