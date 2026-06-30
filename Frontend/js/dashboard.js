


// dashboard.js — VoiceAssist AI

// ── LIVE CLOCK ────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('liveTime').textContent = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
}
updateClock();
setInterval(updateClock, 1000);

// ── SIDEBAR NAVIGATION ────────────────────────────────────────────────────────
const sectionTitles = {
  overview: 'Overview',
  conversation: 'New Conversation',
  account: 'Account Lookup',
  history: 'Session History',
  summary: 'Bilingual Summary'
};

function navigate(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-section]').forEach(n => n.classList.remove('active'));
  const section = document.getElementById('section-' + sectionId);
  if (section) section.classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById('topbarTitle').textContent = sectionTitles[sectionId] || sectionId;
   if (sectionId === 'history')  loadSessionHistory();
  if (sectionId === 'summary')  loadBilingualSummary();
  if (sectionId === 'overview') loadOverviewStats();
}

document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(item.dataset.section);
  });
});

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');
  toastText.textContent = message;
  toast.style.background = isError ? 'var(--error)' : 'var(--navy)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

// ── ACCOUNT LOOKUP ────────────────────────────────────────────────────────────
function doLookup() {
  const val = document.getElementById('accountInput').value.trim();
  if (!val) { showToast('Enter a search value first', true); return; }
  const btn = document.querySelector('.lookup-btn');
  btn.textContent = 'Searching…';
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="15" height="15"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" stroke-linecap="round"/></svg> Search`;
    btn.disabled = false;
    document.getElementById('accountResult').classList.add('show');
    showToast('Account found — Rajesh Sharma');
  }, 900);
}

const accountInputEl = document.getElementById('accountInput');
if (accountInputEl) {
  accountInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLookup();
  });
}

document.querySelectorAll('.account-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.account-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// ── LANGUAGE + PROCESS STATE ──────────────────────────────────────────────────
let selectedLang = null;
let selectedProcess = null;
let langDetected = false;
let processSelected = false;
let lastTranscript = "";

const LANG_META = {
  "Hindi":   { flag: "हि", code: "हि" },
  "Marathi": { flag: "मा", code: "मा" },
  "Tamil":   { flag: "த",  code: "த" },
  "Telugu":  { flag: "తె", code: "తె" },
  "English": { flag: "EN", code: "EN" },
};

// Minimum mic volume (0-255 scale) to trust as actual speech, not silence/noise.
const SILENCE_THRESHOLD = 8;
// Minimum transcript length to trust as a real language signal.
const MIN_TRANSCRIPT_CHARS = 3;
// Minimum recording duration (ms) before we even bother sending to backend —
// mirrors the WAV min-sample guard from the standalone lang-detect proof of
// concept, so we don't waste an API call on a near-empty clip.
const MIN_RECORD_MS = 600;

// ── MIC FLOW — Real STT language detection ────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordStartTime = 0;
let audioCtxForMeter = null;
let analyser = null;
let maxObservedVolume = 0;
let volumeCheckInterval = null;

const micButton = document.getElementById('micButton');
const listenIdle = document.getElementById('listenIdle');
const listenActive = document.getElementById('listenActive');
const detectedResult = document.getElementById('detectedResult');
const processSection = document.getElementById('processSection');
const btnBegin = document.getElementById('btnBegin');
const changeLangBtn = document.getElementById('changeLangBtn');
const langGrid = document.getElementById('langGrid');

// Tap mic -> start real recording -> send to backend -> get language back
micButton && micButton.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    audioChunks = [];
    maxObservedVolume = 0;
    recordStartTime = Date.now();

    // Live volume meter to catch actual silence before we ever call the backend
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
    listenActive.style.display = 'flex';

    // Auto-stop after 4 seconds
    setTimeout(() => { if (isRecording) stopRecording(); }, 4000);

  } catch (err) {
    showManualLangPicker();
  }
});

function stopRecording() {
  const elapsed = Date.now() - recordStartTime;
  const doStop = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    if (volumeCheckInterval) { clearInterval(volumeCheckInterval); volumeCheckInterval = null; }
    if (audioCtxForMeter) { audioCtxForMeter.close().catch(() => {}); audioCtxForMeter = null; }
    isRecording = false;
  };

  // Guarantee a minimum recording length so we never send a near-empty clip
  // (mirrors the standalone lang-detect tool's MIN_DURATION guard).
  if (elapsed < MIN_RECORD_MS) {
    setTimeout(doStop, MIN_RECORD_MS - elapsed);
  } else {
    doStop();
  }
}

async function processDetectionAudio() {
  listenActive.classList.remove('show');
  listenActive.style.display = 'none';

  if (maxObservedVolume < SILENCE_THRESHOLD) {
    console.warn('[lang-detect] Skipped — silence detected (maxVolume=' + maxObservedVolume.toFixed(1) + ')');
    showManualLangPicker();
    return;
  }

  showEl('detectedResult'); // pre-show with a loading state for snappier feel
  setDetectingState();

  try {
    const mimeType = getSupportedMimeType();
    const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
    const wav = await convertToWav(blob);

    if (wav.size < 2000) {
      console.warn('[lang-detect] WAV too small after conversion:', wav.size, 'bytes');
      showManualLangPicker();
      return;
    }

    const formData = new FormData();
    formData.append('audio', wav, 'detect.wav');
    formData.append('language', 'auto');
    formData.append('process_type', 'General enquiry');

   const res = await fetch('https://rohan667-voiceassist-ai-backend-kj.hf.space/api/conversation/customer-speak', {
  method: 'POST',
  body: formData
});
    const data = await res.json();

    const transcript = (data.customer_text || '').trim();
    console.log('[lang-detect] Raw transcript:', JSON.stringify(transcript));
    console.log('[lang-detect] Backend-detected language:', data.language);

    if (!data.success || transcript.length < MIN_TRANSCRIPT_CHARS || isLikelyHallucination(transcript)) {
      console.warn('[lang-detect] Rejected transcript as unreliable:', transcript, data.error || '');
      showManualLangPicker();
      if (data.error) showToast(data.error, true);
      return;
    }

    setDetectedLanguage(data.language || 'English', transcript);
  } catch (e) {
    console.error('[lang-detect] Network/backend error:', e);
    showManualLangPicker();
    showToast('Could not reach backend. Is it running on port 8000?', true);
  }
}

// Catches Whisper's common hallucination patterns on silence/noise: empty,
// too-short, or repeated single-word spam.
function isLikelyHallucination(text) {
  const cleaned = text.replace(/[।.,!?\s]/g, '');
  if (cleaned.length < MIN_TRANSCRIPT_CHARS) return true;
  const words = text.trim().split(/\s+/);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  if (words.length >= 3 && uniqueWords.size === 1) return true;
  return false;
}

function setDetectingState() {
  const nameEl = document.getElementById('detectedLangName');
  const flagEl = document.querySelector('.chip-flag');
  const transcriptWrap = document.getElementById('detectedTranscriptWrap');
  if (nameEl) nameEl.textContent = 'Detecting…';
  if (flagEl) flagEl.textContent = '…';
  if (transcriptWrap) transcriptWrap.style.display = 'none';
}

function showManualLangPicker() {
  selectedLang = null;
  lastTranscript = "";
  detectedResult.classList.add('show');
  detectedResult.style.display = 'flex';
  langGrid.classList.add('open');
  processSection.classList.add('show');
  const nameEl = document.getElementById('detectedLangName');
  if (nameEl) nameEl.textContent = 'Select language';
  const flagEl = document.querySelector('.chip-flag');
  if (flagEl) flagEl.textContent = '—';
  const transcriptWrap = document.getElementById('detectedTranscriptWrap');
  if (transcriptWrap) transcriptWrap.style.display = 'none';
  langDetected = false;
  checkBegin();
}

function setDetectedLanguage(langName, transcript) {
  selectedLang = langName;
  lastTranscript = transcript || "";
  const meta = LANG_META[langName] || LANG_META['English'];

  document.getElementById('detectedLangName').textContent = langName;
  document.querySelector('.chip-flag').textContent = meta.flag;

  const transcriptWrap = document.getElementById('detectedTranscriptWrap');
  const transcriptText = document.getElementById('detectedTranscriptText');
  if (transcriptWrap && transcriptText) {
    if (lastTranscript) {
      transcriptText.textContent = lastTranscript;
      transcriptWrap.style.display = 'block';
    } else {
      transcriptWrap.style.display = 'none';
    }
  }

  detectedResult.classList.add('show');
  detectedResult.style.display = 'flex';
  processSection.classList.add('show');
  langDetected = true;
  checkBegin();
}

changeLangBtn && changeLangBtn.addEventListener('click', () => {
  langGrid.classList.toggle('open');
});

document.querySelectorAll('.lang-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const langName = btn.dataset.lang;
    selectedLang = langName;
    document.getElementById('detectedLangName').textContent = langName;
    document.querySelector('.chip-flag').textContent = btn.dataset.code;
    // Manual override — transcript no longer matches selected language,
    // hide it to avoid showing mismatched text.
    const transcriptWrap = document.getElementById('detectedTranscriptWrap');
    if (transcriptWrap) transcriptWrap.style.display = 'none';
    langGrid.classList.remove('open');
    langDetected = true;
    checkBegin();
  });
});

document.querySelectorAll('.process-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.process-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedProcess = card.dataset.process;
    processSelected = true;
    checkBegin();
  });
});

function checkBegin() {
  if (langDetected && processSelected && selectedLang) {
    btnBegin.disabled = false;
  } else {
    btnBegin.disabled = true;
  }
}

// ── BEGIN CONVERSATION — pass lang + process correctly ────────────────────────
btnBegin && btnBegin.addEventListener('click', () => {
  if (btnBegin.disabled) return;

  const langEl = document.getElementById('detectedLangName');
  const actualLang = langEl ? langEl.textContent.trim() : selectedLang;

  const procCard = document.querySelector('.process-card.selected');
  const actualProcess = procCard ? procCard.dataset.process : selectedProcess;

  sessionStorage.setItem('va_lang', actualLang);
  sessionStorage.setItem('va_process', actualProcess);
  if (lastTranscript) sessionStorage.setItem('va_first_utterance', lastTranscript);

  window.location.href = `conversation-desk.html?lang=${encodeURIComponent(actualLang)}&process=${encodeURIComponent(actualProcess)}`;
});

// ── DOM HELPERS ───────────────────────────────────────────────────────────────
function showEl(id) {
  const e = document.getElementById(id);
  if (e) { e.classList.add('show'); e.style.display = 'flex'; }
}

// ── WAV CONVERSION (for language detection audio) ─────────────────────────────
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
// ── LOAD SESSION HISTORY FROM localStorage ────────────────────────────────────
function loadSessionHistory() {
  let sessions = [];
  try {
    const raw = localStorage.getItem('va_sessions');
    if (raw) sessions = JSON.parse(raw);
  } catch(e) { sessions = []; }

  const tbody = document.querySelector('#section-history .history-table tbody');
  if (!tbody) return;

  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--slate-light);padding:32px">
      No sessions saved yet. Complete a conversation and click "Save to Records".
    </td></tr>`;
    return;
  }

  tbody.innerHTML = sessions.map(s => `
    <tr>
      <td>${s.date || ''}, ${s.time || ''}</td>
      <td>${s.process || ''}</td>
      <td><span class="lang-pill">${s.language || ''}</span></td>
      <td>${s.process || ''}</td>
      <td>${s.duration || ''}</td>
      <td>✓ Saved</td>
      <td><button class="view-link" onclick="viewSession('${s.id}')">View →</button></td>
    </tr>
  `).join('');
}

// ── LOAD BILINGUAL SUMMARY FROM localStorage ──────────────────────────────────
function loadBilingualSummary() {
  let sessions = [];
  try {
    const raw = localStorage.getItem('va_sessions');
    if (raw) sessions = JSON.parse(raw);
  } catch(e) { sessions = []; }

  const section = document.getElementById('section-summary');
  if (!section) return;

  if (sessions.length === 0) {
    section.innerHTML = `<div style="text-align:center;padding:60px;color:var(--slate-light)">
      No summaries saved yet. Complete a conversation and save it to see bilingual summaries here.
    </div>`;
    return;
  }

  // Show most recent session by default, with selector for others
  const latest = sessions[0];
  section.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <label style="font-size:13px;color:var(--slate);font-weight:500">Session:</label>
      <select id="summarySessionPicker" onchange="renderSummaryById(this.value)"
        style="border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;font-family:inherit;color:var(--navy);background:var(--white)">
        ${sessions.map((s,i) => `<option value="${s.id}">${s.date} ${s.time} — ${s.process} (${s.language})</option>`).join('')}
      </select>
    </div>
    <div id="summaryCards"></div>`;

  renderSummaryById(latest.id);
}

function renderSummaryById(sessionId) {
  let sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('va_sessions') || '[]'); } catch(e) {}
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;

  const container = document.getElementById('summaryCards');
  if (!container) return;

  container.innerHTML = `
    <div class="two-col">
      <div class="card">
        <div class="card-header">
          <div class="card-title">English Summary</div>
          <button class="card-action" onclick="navigator.clipboard.writeText(document.getElementById('engSumText').textContent);showToast('Copied!')">Copy</button>
        </div>
        <p id="engSumText" style="font-size:14px;line-height:1.75;color:var(--slate);white-space:pre-wrap">${escHtml(s.englishSummary || '')}</p>
        <div style="margin-top:12px;font-size:11px;color:var(--slate-light)">${s.language} · ${s.process} · ${s.duration} · ${s.date}</div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">${s.language} Summary</div>
        </div>
        <p id="regSumText" style="font-size:14px;line-height:1.9;color:var(--slate)">${escHtml(s.regionalSummary || '')}</p>
      </div>
    </div>`;
}

// ── LOAD OVERVIEW STATS FROM localStorage ─────────────────────────────────────
function loadOverviewStats() {
  let sessions = [];
  try { sessions = JSON.parse(localStorage.getItem('va_sessions') || '[]'); } catch(e) {}

  const today = new Date().toDateString();
  const todaySessions = sessions.filter(s => new Date(s.timestamp).toDateString() === today);
  const avgDur = todaySessions.length
    ? (todaySessions.reduce((a,s) => a + (s.durationMinutes||0), 0) / todaySessions.length).toFixed(1)
    : 0;
  const langs = [...new Set(sessions.map(s => s.language))];

  // ── Update stat cards by targeting the stat-grid directly ──
  const statGrid = document.querySelector('#section-overview .stat-grid');
  if (statGrid) {
    statGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Sessions today</div>
        <div class="stat-value">${todaySessions.length}</div>
        <div class="stat-sub">Total saved: ${sessions.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg. duration</div>
        <div class="stat-value">${avgDur}<span style="font-size:16px;font-weight:400"> min</span></div>
        <div class="stat-sub">Today's sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Languages used</div>
        <div class="stat-value">${langs.length}</div>
        <div class="stat-sub">${langs.join(', ') || '—'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Summaries saved</div>
        <div class="stat-value">${sessions.length}</div>
        <div class="stat-sub">${sessions.length > 0 ? '100%' : '0%'} completion rate</div>
      </div>`;
  }

  // ── Update recent sessions list ──
  const twoCol = document.querySelector('#section-overview .two-col');
  if (!twoCol) return;

  const recentCard = twoCol.querySelector('.card');
  if (!recentCard) return;

  const LANG_FLAGS = { Hindi:'हि', Marathi:'मा', Tamil:'த', Telugu:'తె', English:'EN' };

  if (sessions.length === 0) {
    recentCard.innerHTML = `
      <div class="card-header">
        <div class="card-title">Recent sessions</div>
      </div>
      <div style="padding:32px;text-align:center;color:var(--slate-light);font-size:13px">
        No sessions yet. Start a conversation to see history here.
      </div>`;
    return;
  }

  recentCard.innerHTML = `
    <div class="card-header">
      <div class="card-title">Recent sessions</div>
      <button class="card-action" onclick="navigate('history')">View all</button>
    </div>
    ${sessions.slice(0,4).map(s => `
      <div class="session-item" style="cursor:pointer" onclick="viewSession('${s.id}')">
        <div class="session-lang-badge">${LANG_FLAGS[s.language] || s.language?.slice(0,2) || '?'}</div>
        <div class="session-info">
          <div class="session-title">${escHtml(s.process)}</div>
          <div class="session-meta">${escHtml(s.language)} · ${s.duration} · Summary saved</div>
        </div>
        <div class="session-time">${s.time}</div>
      </div>`).join('')}`;
}

// ── VIEW INDIVIDUAL SESSION ───────────────────────────────────────────────────
function viewSession(sessionId) {
  navigate('summary');
  setTimeout(() => {
    const picker = document.getElementById('summarySessionPicker');
    if (picker) { picker.value = sessionId; renderSummaryById(sessionId); }
  }, 100);
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  loadOverviewStats();
});
window.addEventListener('load', () => {
  loadOverviewStats();
});
console.log(localStorage.getItem('va_sessions'));