// dashboard.js — VoiceAssist AI (merged: new UI + old logic)
// UPDATED: "Begin conversation" now opens the floating chat-widget instead
// of navigating to conversation-desk.html. Everything else unchanged.

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
  "lead-generation": 'Lead Generation',
  history: 'Session History',
  summary: 'Bilingual Summary',
  "open-account": 'Open New Account',
  "credit-card": 'Apply for Credit Card',
  "cash-transaction": 'Deposit / Withdraw'
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
  if (sectionId === 'lead-generation') loadLeads();
  if (sectionId === 'cash-transaction') loadCbsAccountsIntoSelects();
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
  toast.style.background = isError ? 'var(--error)' : 'var(--blue-3)';
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

const SILENCE_THRESHOLD = 8;
const MIN_TRANSCRIPT_CHARS = 3;
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

  showEl('detectedResult');
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

// ── BEGIN CONVERSATION ─────────────────────────────────────────────────────
// UPDATED: opens the floating chat-widget (chat-widget.js) in place,
// instead of navigating to conversation-desk.html. The widget reads the
// same lang/process values and runs against the same backend.
btnBegin && btnBegin.addEventListener('click', () => {
  if (btnBegin.disabled) return;

  const langEl = document.getElementById('detectedLangName');
  const actualLang = langEl ? langEl.textContent.trim() : selectedLang;

  const procCard = document.querySelector('.process-card.selected');
  const actualProcess = procCard ? procCard.dataset.process : selectedProcess;

  // Kept for backward compatibility with anything still reading these
  sessionStorage.setItem('va_lang', actualLang);
  sessionStorage.setItem('va_process', actualProcess);
  if (lastTranscript) sessionStorage.setItem('va_first_utterance', lastTranscript);

  if (window.chatWidget) {
    window.chatWidget.open(actualLang, actualProcess);
  } else {
    showToast('Conversation widget not loaded — check chat-widget.js is included', true);
  }
});

// ── DOM HELPERS ───────────────────────────────────────────────────────────────
function showEl(id) {
  const e = document.getElementById(id);
  if (e) { e.classList.add('show'); e.style.display = 'flex'; }
}

// ── WAV CONVERSION ─────────────────────────────────────────────────────────
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">
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
    section.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted)">
      No summaries saved yet. Complete a conversation and save it to see bilingual summaries here.
    </div>`;
    return;
  }

  const latest = sessions[0];
  section.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <label style="font-size:13px;color:var(--text-dim);font-weight:600">Session:</label>
      <select id="summarySessionPicker" onchange="renderSummaryById(this.value)"
        style="border:1px solid rgba(0,0,0,0.08);border-radius:8px;padding:6px 12px;font-size:13px;font-family:inherit;color:var(--text);background:#fff">
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
        <p id="engSumText" style="font-size:14px;line-height:1.75;color:var(--text-dim);white-space:pre-wrap">${escHtml(s.englishSummary || '')}</p>
        <div style="margin-top:12px;font-size:11px;color:var(--text-muted)">${s.language} · ${s.process} · ${s.duration} · ${s.date}</div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">${s.language} Summary</div>
        </div>
        <p id="regSumText" style="font-size:14px;line-height:1.9;color:var(--text-dim)">${escHtml(s.regionalSummary || '')}</p>
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
      <div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">
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

// ── LEAD GENERATION ────────────────────────────────────────────────────────
// Pulls REAL leads from the backend (/api/conversation/leads), which is fed
// by the "Send to Bank" button inside the chat-widget's summary modal.
// Backend doesn't return a lead-quality score, so we compute one client-side
// from field completeness — this is just for sorting hot/warm/cold, not a
// claim about actual creditworthiness.

const LEADS_API_BASE = "https://rohan667-voiceassist-ai-backend-kj.hf.space/api/conversation";

function getLeadTagLabel(tag) {
  if (tag === 'hot') return 'Hot lead';
  if (tag === 'warm') return 'Warm lead';
  return 'Needs follow-up';
}

function mapBackendLead(record) {
  const lead = record.lead || {};
  const name = (lead.customer_name && lead.customer_name.trim()) || lead.query_summary || 'Unknown customer';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '??';

  const interestParts = [];
  if (lead.loan_type) interestParts.push(lead.loan_type);
  if (lead.account_type) interestParts.push(lead.account_type);
  if (lead.card_selected) interestParts.push(lead.card_selected);
  const interest = interestParts.length ? interestParts.join(', ') : (record.process_type || 'General enquiry');

  const lang = record.customer_language || '—';
  const phone = lead.phone || lead.account_last4 || '—';

  const values = Object.values(lead);
  const filled = values.filter(v => v && String(v).trim()).length;
  const score = values.length ? Math.round((filled / values.length) * 100) : 0;

  let tag = 'cold';
  if (score >= 70) tag = 'hot';
  else if (score >= 40) tag = 'warm';

  let date = '—';
  if (record.timestamp) {
    try {
      date = new Date(record.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) {}
  }

  return { name, initials, interest, lang, score, tag, phone, date, raw: record };
}

async function loadLeads() {
  const section = document.getElementById('section-lead-generation');
  if (!section) return;

  const listEl = section.querySelector('#leadList');
  const statRow = section.querySelector('.lead-stat-row');

  if (listEl) {
    listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">Loading leads…</div>`;
  }

  let rawLeads = [];
  let fetchFailed = false;
  try {
    const res = await fetch(`${LEADS_API_BASE}/leads`);
    const data = await res.json();
    if (data.success && Array.isArray(data.leads)) {
      rawLeads = data.leads;
    } else {
      fetchFailed = true;
    }
  } catch (e) {
    console.warn('[loadLeads] failed to fetch leads from backend:', e);
    fetchFailed = true;
  }

  const leads = rawLeads.map(mapBackendLead).reverse(); // newest first

  const hot = leads.filter(l => l.tag === 'hot').length;
  const warm = leads.filter(l => l.tag === 'warm').length;
  const cold = leads.filter(l => l.tag === 'cold').length;

  if (statRow) {
    statRow.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total leads</div>
        <div class="stat-value">${leads.length}</div>
        <div class="stat-sub">From customer conversations</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Hot leads</div>
        <div class="stat-value">${hot}</div>
        <div class="stat-sub"><span class="stat-trend-up">Follow up today</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Warm leads</div>
        <div class="stat-value">${warm}</div>
        <div class="stat-sub">Nurture this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Incomplete</div>
        <div class="stat-value">${cold}</div>
        <div class="stat-sub">Missing details</div>
      </div>`;
  }

  if (!listEl) return;

  if (fetchFailed) {
    listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--error);font-size:13px">
      Could not reach the leads server. Check that the backend is running and try again.
    </div>`;
    return;
  }

  if (leads.length === 0) {
    listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px">
      No leads yet. Leads appear here automatically when staff click "Send to Bank" at the end of a conversation in the Conversation Desk widget.
    </div>`;
    return;
  }

  listEl.innerHTML = leads.map((l, i) => `
    <div class="lead-card">
      <div class="lead-avatar">${escHtml(l.initials)}</div>
      <div class="lead-info">
        <div class="lead-name">${escHtml(l.name)} &nbsp; <span class="lead-tag lead-tag-${l.tag}">${getLeadTagLabel(l.tag)}</span></div>
        <div class="lead-meta">${escHtml(l.interest)} · ${escHtml(l.lang)} · ${escHtml(l.phone)} · ${escHtml(l.date)}</div>
      </div>
      <div class="lead-score">
        <div class="lead-score-value">${l.score}</div>
        <div class="lead-score-label">Complete</div>
      </div>
      <div class="lead-actions">
        <button class="lead-action-btn lead-action-call" onclick="showToast('Calling ${escHtml(l.name)}…')">Call</button>
        <button class="lead-action-btn" onclick="showLeadDetails(${i})">Details</button>
      </div>
    </div>
  `).join('');

  window._leadsCache = leads;
}

function showLeadDetails(index) {
  const leads = window._leadsCache || [];
  const l = leads[index];
  if (!l) return;
  const lead = l.raw.lead || {};
  const rows = Object.entries(lead)
    .filter(([k, v]) => v && String(v).trim())
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');
  alert(`Lead details — ${l.raw.process_type || ''}\n\n${rows || 'No additional details captured.'}\n\nSession duration: ${l.raw.session_duration || '—'}`);
}

async function saveManualLead() {
  const nameEl = document.getElementById('manualLeadName');
  const phoneEl = document.getElementById('manualLeadPhone');
  const interestEl = document.getElementById('manualLeadInterest');
  const notesEl = document.getElementById('manualLeadNotes');

  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { showToast('Enter a customer name first', true); return; }

  const lead = {
    customer_name: name,
    phone: phoneEl ? phoneEl.value.trim() : '',
    query_summary: notesEl ? notesEl.value.trim() : '',
  };
  const interest = interestEl ? interestEl.value : 'General enquiry';

  const btn = document.getElementById('manualLeadSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch(`${LEADS_API_BASE}/submit-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process_type: interest,
        customer_language: 'English',
        lead,
        session_duration: '',
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Lead saved ✓');
      if (nameEl) nameEl.value = '';
      if (phoneEl) phoneEl.value = '';
      if (notesEl) notesEl.value = '';
      loadLeads();
    } else {
      showToast(data.error || 'Failed to save lead', true);
    }
  } catch (e) {
    showToast('Network error saving lead', true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Lead'; }
  }
}

// ── CBS (CORE BANKING SERVICES) — Open Account / Credit Card / Deposit-Withdraw ──
// These flows don't have a live core-banking backend, so they behave like the
// rest of this dashboard's "offline demo" pieces (e.g. doLookup): submissions
// are validated client-side, persisted to localStorage so Session History /
// Overview style screens stay consistent across reloads, and confirmed with a
// toast + reference number. Swap the TODO sections for real API calls once a
// CBS endpoint exists.

function genRefNo(prefix) {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${n}`;
}

function getCbsAccounts() {
  try { return JSON.parse(localStorage.getItem('va_cbs_accounts') || '[]'); } catch (e) { return []; }
}
function setCbsAccounts(list) {
  localStorage.setItem('va_cbs_accounts', JSON.stringify(list));
}

// Seed one demo account (Rajesh Sharma, looked up elsewhere in the portal) so
// Deposit/Withdraw has something to act on out of the box.
function ensureSeedAccount() {
  const accounts = getCbsAccounts();
  if (accounts.length === 0) {
    accounts.push({
      accountNo: '4523881122047700',
      name: 'Rajesh Suresh Sharma',
      type: 'Savings',
      balance: 124832,
    });
    setCbsAccounts(accounts);
  }
}
ensureSeedAccount();

// ---- Open New Account ----
function submitOpenAccount() {
  const name = document.getElementById('oaName')?.value.trim();
  const mobile = document.getElementById('oaMobile')?.value.trim();
  const aadhaar = document.getElementById('oaAadhaar')?.value.trim();
  const accType = document.getElementById('oaAccType')?.value;
  const initialDeposit = parseFloat(document.getElementById('oaInitialDeposit')?.value || '0');

  if (!name) { showToast('Enter customer name first', true); return; }
  if (!mobile || mobile.length < 10) { showToast('Enter a valid mobile number', true); return; }
  if (!aadhaar || aadhaar.replace(/\s/g,'').length < 12) { showToast('Enter a valid 12-digit Aadhaar number', true); return; }
  if (isNaN(initialDeposit) || initialDeposit < 0) { showToast('Enter a valid initial deposit amount', true); return; }

  const btn = document.getElementById('oaSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Opening account…'; }

  setTimeout(() => {
    const accountNo = genRefNo('45239');
    const accounts = getCbsAccounts();
    accounts.unshift({ accountNo, name, type: accType, balance: initialDeposit });
    setCbsAccounts(accounts);

    if (btn) { btn.disabled = false; btn.textContent = 'Open Account'; }
    showToast(`Account opened — No. ${accountNo}`);

    ['oaName','oaMobile','oaAadhaar','oaInitialDeposit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const resultEl = document.getElementById('oaResult');
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="cbs-success-row">
          <div>
            <div class="cbs-success-label">New ${escHtml(accType)} account</div>
            <div class="cbs-success-value">${escHtml(name)}</div>
          </div>
          <div style="text-align:right">
            <div class="cbs-success-label">Account no.</div>
            <div class="cbs-success-value">${accountNo}</div>
          </div>
        </div>`;
    }
    loadCbsAccountsIntoSelects();
  }, 900);
}

// ---- Apply for Credit Card ----
function submitCreditCardApplication() {
  const name = document.getElementById('ccName')?.value.trim();
  const accountNo = document.getElementById('ccAccountNo')?.value.trim();
  const income = parseFloat(document.getElementById('ccIncome')?.value || '0');
  const cardType = document.getElementById('ccCardType')?.value;

  if (!name) { showToast('Enter customer name first', true); return; }
  if (!accountNo) { showToast('Enter the linked account number', true); return; }
  if (isNaN(income) || income <= 0) { showToast('Enter a valid monthly income', true); return; }

  const btn = document.getElementById('ccSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  setTimeout(() => {
    // Simple, transparent eligibility heuristic — not a real credit decision.
    let status = 'Pending review';
    let limit = 0;
    if (income >= 100000) { status = 'Pre-approved'; limit = 300000; }
    else if (income >= 40000) { status = 'Pre-approved'; limit = 100000; }
    else if (income >= 20000) { status = 'Pre-approved'; limit = 40000; }

    const appRef = genRefNo('CC');

    if (btn) { btn.disabled = false; btn.textContent = 'Submit Application'; }
    showToast(`Application ${appRef} submitted — ${status}`);

    const resultEl = document.getElementById('ccResult');
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="cbs-success-row">
          <div>
            <div class="cbs-success-label">${escHtml(cardType)} application</div>
            <div class="cbs-success-value">${escHtml(name)} · Ref ${appRef}</div>
          </div>
          <div style="text-align:right">
            <div class="cbs-success-label">${status}</div>
            <div class="cbs-success-value">${limit ? '₹' + limit.toLocaleString('en-IN') + ' limit' : '—'}</div>
          </div>
        </div>`;
    }

    ['ccName','ccAccountNo','ccIncome'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }, 1000);
}

// ---- Deposit / Withdraw ----
function loadCbsAccountsIntoSelects() {
  const accounts = getCbsAccounts();
  const select = document.getElementById('txnAccountSelect');
  if (!select) return;
  select.innerHTML = accounts.map(a =>
    `<option value="${a.accountNo}">${a.accountNo} — ${escHtml(a.name)} (₹${a.balance.toLocaleString('en-IN')})</option>`
  ).join('') || `<option value="">No accounts found</option>`;
  updateTxnBalancePreview();
}

function updateTxnBalancePreview() {
  const select = document.getElementById('txnAccountSelect');
  const balEl = document.getElementById('txnCurrentBalance');
  if (!select || !balEl) return;
  const accounts = getCbsAccounts();
  const acc = accounts.find(a => a.accountNo === select.value);
  balEl.textContent = acc ? `₹${acc.balance.toLocaleString('en-IN')}` : '—';
}

document.querySelectorAll('.txn-type-toggle .txn-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.txn-type-toggle .txn-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function submitTransaction() {
  const select = document.getElementById('txnAccountSelect');
  const amountEl = document.getElementById('txnAmount');
  const activeTypeBtn = document.querySelector('.txn-type-toggle .txn-type-btn.active');
  const type = activeTypeBtn ? activeTypeBtn.dataset.txnType : 'deposit';

  const accountNo = select?.value;
  const amount = parseFloat(amountEl?.value || '0');

  if (!accountNo) { showToast('Select an account first', true); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount', true); return; }

  const accounts = getCbsAccounts();
  const acc = accounts.find(a => a.accountNo === accountNo);
  if (!acc) { showToast('Account not found', true); return; }

  if (type === 'withdraw' && amount > acc.balance) {
    showToast('Insufficient balance for this withdrawal', true);
    return;
  }

  const btn = document.getElementById('txnSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  setTimeout(() => {
    acc.balance = type === 'deposit' ? acc.balance + amount : acc.balance - amount;
    setCbsAccounts(accounts);

    const txnRef = genRefNo('TXN');
    if (btn) { btn.disabled = false; btn.textContent = 'Process Transaction'; }
    showToast(`${type === 'deposit' ? 'Deposit' : 'Withdrawal'} of ₹${amount.toLocaleString('en-IN')} processed — Ref ${txnRef}`);

    if (amountEl) amountEl.value = '';
    loadCbsAccountsIntoSelects();

    const resultEl = document.getElementById('txnResult');
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="cbs-success-row">
          <div>
            <div class="cbs-success-label">${type === 'deposit' ? 'Deposit' : 'Withdrawal'} · Ref ${txnRef}</div>
            <div class="cbs-success-value">${escHtml(acc.name)} — ${accountNo}</div>
          </div>
          <div style="text-align:right">
            <div class="cbs-success-label">New balance</div>
            <div class="cbs-success-value">₹${acc.balance.toLocaleString('en-IN')}</div>
          </div>
        </div>`;
    }
  }, 800);
}

document.addEventListener('DOMContentLoaded', () => {
  loadOverviewStats();
  loadCbsAccountsIntoSelects();
});
window.addEventListener('load', () => {
  loadOverviewStats();
});