javascript

// conversation-desk.js — VoiceAssist AI (Final — Smart Greeting + Smart Steps + Manual Checklist Control)

const API_BASE = "http://localhost:8000/api/conversation";

const LANG_META = {
  "Hindi":   { flag: "हि", tag: "हिन्दी" },
  "Marathi": { flag: "मा", tag: "मराठी" },
  "Tamil":   { flag: "த",  tag: "தமிழ்" },
  "Telugu":  { flag: "తె", tag: "తెలుగు" },
  "English": { flag: "EN", tag: "English" },
};

const PROCESS_STEPS = {
  "Loan enquiry":      ["Greeting", "Loan Options", "Eligibility", "Documents", "Next Steps"],
  "Account opening":   ["Greeting", "Account Type", "KYC Details", "Documents", "Activate"],
  "Balance enquiry":   ["Greeting", "Verify Identity", "Show Balance", "Done"],
  "Credit card apply": ["Greeting", "Eligibility", "Card Selection", "Documents", "Apply"],
  "General enquiry":   ["Greeting", "Understand", "Answer", "Resolved"],
};

const STEP_CHECKLISTS = {
  "Loan enquiry": [
    ["Customer greeted in their language"],
    ["Interest rate explained", "Loan type confirmed (Home/Personal/Car/Education)", "Tenure preference confirmed"],
    ["Monthly income confirmed", "Occupation / employment type confirmed", "ITR or salary slips checked",
     "Last 6 months bank statement reviewed", "CIBIL score checked", "Existing EMI obligations checked"],
    ["Aadhaar collected", "PAN collected", "Salary slips / bank statement collected",
     "Property documents collected (if home loan)"],
    ["Processing fee explained", "Disbursement timeline explained", "Application forwarded to bank portal"],
  ],
  "Account opening": [
    ["Customer greeted in their language"],
    ["Account type confirmed (Savings/Current/PMJDY/FD)", "Min balance & interest explained"],
    ["Name, DOB, address confirmed", "Mobile number confirmed for OTP", "Nominee name & relation confirmed"],
    ["Aadhaar collected", "PAN collected", "2 photographs collected", "Address proof collected"],
    ["Initial deposit received", "Passbook & debit card issued", "Net banking / UPI set up"],
  ],
  "Balance enquiry": [
    ["Customer greeted in their language"],
    ["Account number last 4 digits confirmed", "OTP verified on registered mobile"],
    ["Balance shown to customer", "Last 5 transactions shown (if requested)"],
    ["Passbook update offered", "Net banking / UPI enrollment offered"],
  ],
  "Credit card apply": [
    ["Customer greeted in their language"],
    ["Annual income confirmed", "Existing cards checked", "CIBIL score checked"],
    ["Card type recommended (Classic/Platinum/Signature)", "Customer selected a card"],
    ["Aadhaar collected", "PAN collected", "Salary slips / ITR collected", "Photograph collected"],
    ["Application submitted", "Delivery timeline explained (15 working days)"],
  ],
  "General enquiry": [
    ["Customer greeted in their language"],
    ["Query understood — clarifying questions asked if needed"],
    ["Accurate answer provided from knowledge base"],
    ["Customer confirms query resolved"],
  ],
};

const GREETINGS = {
  "Loan enquiry": {
    "Hindi":   "नमस्ते! Union Bank of India में आपका स्वागत है। आज मैं आपकी loan के बारे में कैसे मदद कर सकता हूँ?",
    "Marathi": "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे। आज मी तुम्हाला loan बद्दल कशी मदत करू शकतो?",
    "Tamil":   "வணக்கம்! Union Bank of India-வில் உங்களை வரவேற்கிறோம். இன்று கடன் பற்றி உங்களுக்கு எவ்வாறு உதவலாம்?",
    "Telugu":  "నమస్కారం! Union Bank of India కి స్వాగతం. ఈ రోజు రుణం గురించి మీకు ఎలా సహాయపడగలను?",
    "English": "Welcome to Union Bank of India! How can I assist you with your loan enquiry today?",
  },
  "Account opening": {
    "Hindi":   "नमस्ते! Union Bank of India में आपका स्वागत है। नया खाता खोलने के लिए आप सही जगह पर आए हैं!",
    "Marathi": "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे। नवीन खाते उघडण्यासाठी आपण योग्य ठिकाणी आलात!",
    "Tamil":   "வணக்கம்! புதிய வங்கி கணக்கு திறக்க Union Bank of India-வில் நீங்கள் சரியான இடத்திற்கு வந்துள்ளீர்கள்!",
    "Telugu":  "నమస్కారం! కొత్త ఖాతా తెరవడానికి Union Bank of India లో మీరు సరైన చోటికి వచ్చారు!",
    "English": "Welcome to Union Bank of India! You're in the right place to open a new bank account today.",
  },
  "Balance enquiry": {
    "Hindi":   "नमस्ते! Union Bank of India में आपका स्वागत है। मैं आपका account balance जाँचने में मदद करूँगा।",
    "Marathi": "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे। मी तुमचे account balance तपासण्यास मदत करतो.",
    "Tamil":   "வணக்கம்! உங்கள் கணக்கு இருப்பை சரிபார்க்க உதவுகிறேன்.",
    "Telugu":  "నమస్కారం! మీ ఖాతా బ్యాలెన్స్ తనిఖీ చేయడంలో సహాయపడతాను.",
    "English": "Welcome to Union Bank of India! I'll help you check your account balance today.",
  },
  "Credit card apply": {
    "Hindi":   "नमस्ते! Union Bank of India में आपका स्वागत है। Credit card apply करने में मैं आपकी मदद करूँगा।",
    "Marathi": "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे. Credit card साठी apply करण्यास मी मदत करतो.",
    "Tamil":   "வணக்கம்! கிரெடிட் கார்டு விண்ணப்பிக்க உதவுகிறேன்.",
    "Telugu":  "నమస్కారం! క్రెడిట్ కార్డు దరఖాస్తుకు సహాయపడతాను.",
    "English": "Welcome to Union Bank of India! I'll help you apply for a credit card today.",
  },
  "General enquiry": {
    "Hindi":   "नमस्ते! Union Bank of India में आपका स्वागत है। आज मैं आपकी कैसे मदद कर सकता हूँ?",
    "Marathi": "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे. मी तुम्हाला कशी मदत करू?",
    "Tamil":   "வணக்கம்! இன்று உங்களுக்கு எவ்வாறு உதவலாம்?",
    "Telugu":  "నమస్కారం! ఈ రోజు మీకు ఎలా సహాయపడగలను?",
    "English": "Welcome to Union Bank of India! How can I help you today?",
  },
};

const STATIC_QUICK_REPLIES = {
  "Loan enquiry": [
    [],
    [
      "🏠 Home Loan — 8.35% p.a., up to 30 years, max ₹10 crore",
      "💳 Personal Loan — 11.40% p.a., up to ₹15 lakh, 5 years",
      "🚗 Car Loan — 8.70% p.a., up to 90% on-road price, 7 years",
      "🎓 Education Loan — 9.90% p.a., up to ₹20 lakh abroad",
    ],
    [
      "What is your monthly income?",
      "Are you salaried or self-employed?",
      "Do you have any existing loan EMIs?",
      "What is your approximate CIBIL score?",
    ],
    [
      "Please bring Aadhaar Card original + photocopy",
      "PAN Card original + photocopy needed",
      "Last 3 months salary slips + 6 months bank statement",
      "Form 16 + property sale agreement + NOC from builder",
    ],
    [
      "Processing fee is 0.5% of loan amount — one time payment",
      "Approval takes 7–10 working days after document submission",
      "Loan disbursed directly to builder or seller account",
    ],
  ],
  "Account opening": [
    [],
    [
      "💰 Savings Account — ₹1000 min balance, 2.75% interest p.a.",
      "🏢 Current Account — ₹5000 min balance, unlimited transactions",
      "🆓 PMJDY Zero-Balance — free RuPay card + ₹2L accident insurance",
      "📈 Fixed Deposit — up to 7.00% interest, 7 days to 10 years",
    ],
    [
      "Please fill KYC form — need Aadhaar, PAN, nominee details",
      "What is the nominee name and relation to you?",
      "Is your Aadhaar linked to mobile number for OTP verification?",
    ],
    [
      "Aadhaar Card original + photocopy",
      "PAN Card original + photocopy",
      "2 passport size photographs + address proof (utility bill)",
    ],
    [
      "Initial deposit ₹1000 — account activates in 30 minutes",
      "You will receive passbook and debit card today",
      "Net banking and UPI will be set up immediately",
    ],
  ],
  "Balance enquiry": [
    [],
    [
      "Please share your account number last 4 digits",
      "OTP will be sent to your registered mobile number",
    ],
    [
      "Your balance is being fetched — one moment please",
      "Would you like last 5 transactions as well?",
    ],
    [
      "Would you like passbook update today?",
      "SMS BAL to 09223008586 anytime to check balance",
      "Download Union Bank Mobile app for 24x7 access",
    ],
  ],
  "Credit card apply": [
    [],
    [
      "What is your annual income?",
      "Do you currently have any credit cards?",
      "What is your approximate CIBIL score?",
    ],
    [
      "Union Classic — Free, 1% cashback on all spends",
      "Union Platinum — ₹499/year, 2X rewards, airport lounge access",
      "Union Signature — ₹2999/year, 3X rewards, unlimited lounge",
    ],
    [
      "Aadhaar Card + PAN Card required",
      "Last 3 months salary slips or ITR (self-employed)",
      "1 passport size photograph",
    ],
    [
      "Application submitted — credit limit SMS in 7 days",
      "Card delivery takes 15 working days to your address",
      "Activate card via net banking or branch visit",
    ],
  ],
  "General enquiry": [
    [],
    [
      "How can I help you today?",
      "Which banking service do you need information about?",
    ],
    [
      "Let me check that for you — one moment",
      "Could you give me more details about your query?",
    ],
    [
      "Is there anything else I can help you with?",
      "Your query has been resolved successfully",
    ],
  ],
};

const GUIDE_HINTS = {
  "Loan enquiry": [
    "Step 1: Greet customer warmly — session just started",
    "Step 2: Show all loan options — Home 8.35%, Personal 11.40%, Car 8.70%, Education 9.90%",
    "Step 3: Check eligibility — monthly income, employment type, existing EMIs, CIBIL score",
    "Step 4: Give full document checklist based on loan type selected",
    "Step 5: Explain 0.5% processing fee and 7–10 day disbursement timeline",
  ],
  "Account opening": [
    "Step 1: Greet customer — ask what brings them to the branch today",
    "Step 2: Explain account types — Savings ₹1000 min, Current ₹5000, PMJDY zero-balance, FD up to 7%",
    "Step 3: Fill KYC — name, DOB, address, mobile number, nominee details",
    "Step 4: Collect Aadhaar, PAN, 2 photos, address proof",
    "Step 5: Initial deposit, activate account, issue passbook and debit card",
  ],
  "Balance enquiry": [
    "Step 1: Greet customer — welcome them to the branch",
    "Step 2: Verify identity — account last 4 digits + OTP on registered mobile",
    "Step 3: Share balance and last 5 transactions",
    "Step 4: Offer passbook update or net banking / UPI enrollment",
  ],
  "Credit card apply": [
    "Step 1: Greet customer — ask what kind of card they need",
    "Step 2: Check eligibility — annual income min ₹2.5L, CIBIL min 700",
    "Step 3: Recommend card — Classic (free) / Platinum (₹499) / Signature (₹2999)",
    "Step 4: Collect Aadhaar, PAN, salary slips, passport photo",
    "Step 5: Submit application — card delivery in 15 working days",
  ],
  "General enquiry": [
    "Step 1: Greet customer warmly",
    "Step 2: Understand their query — ask clarifying questions if needed",
    "Step 3: Provide accurate information from Union Bank knowledge base",
    "Step 4: Confirm resolved — offer further help",
  ],
};

const KYC_CHECKLIST = {
  "Loan enquiry": [
    "✅ Aadhaar Card (original + photocopy)",
    "✅ PAN Card (original + photocopy)",
    "✅ Last 3 months salary slips",
    "✅ Last 6 months bank statement",
    "✅ Form 16 / Income Tax Return",
    "✅ Property documents (sale agreement, NOC from builder)",
    "✅ Employment certificate",
  ],
  "Account opening": [
    "✅ Aadhaar Card (original + photocopy)",
    "✅ PAN Card (original + photocopy)",
    "✅ 2 Passport size photographs",
    "✅ Address proof (utility bill / rental agreement < 3 months)",
    "✅ Mobile number (to be registered)",
    "✅ Initial deposit — min ₹1000 savings",
    "✅ Nominee details (name, relation, DOB)",
  ],
  "Credit card apply": [
    "✅ Aadhaar Card + PAN Card",
    "✅ Last 3 months salary slips",
    "✅ ITR for last 2 years (if self-employed)",
    "✅ 1 Passport size photograph",
    "✅ Last 3 months bank statement",
  ],
};

const TTS_TIMEOUT_MS = 6000;
const SPEECH_SYNTH_LOCALE = {
  "Hindi": "hi-IN", "Marathi": "mr-IN", "Tamil": "ta-IN", "Telugu": "te-IN", "English": "en-IN",
};

const params = new URLSearchParams(window.location.search);
const selectedLanguage = (params.get("lang") || sessionStorage.getItem("va_lang") || "Hindi").trim();
const selectedProcess  = (params.get("process") || sessionStorage.getItem("va_process") || "General enquiry").trim();

let conversationLog = [];
let sessionStart    = Date.now();
let timerInterval   = null;
let stepIndex       = 0;
let isRecording     = false;
let mediaRecorder   = null;
let audioChunks     = [];
let staffRecording  = false;
let staffRecorder   = null;
let staffChunks     = [];
let kycShown        = false;
let smartReplies    = [];
let checklistState  = {};

document.addEventListener("DOMContentLoaded", () => {
  try { initUI(); }            catch (e) { console.error("[Init] initUI:", e); }
  try { startTimer(); }        catch (e) { console.error("[Init] startTimer:", e); }
  try { bindEvents(); }        catch (e) { console.error("[Init] bindEvents:", e); }
  try { startConversation(); } catch (e) { console.error("[Init] startConversation:", e); }
});

function initUI() {
  const meta = LANG_META[selectedLanguage] || LANG_META["Hindi"];
  document.getElementById("langChipFlag").textContent = meta.flag;
  document.getElementById("langChipName").textContent = selectedLanguage;
  document.getElementById("customerLangTag").textContent = meta.tag;
  document.getElementById("intentChipText").textContent = selectedProcess;
  if (selectedProcess !== "General enquiry") document.getElementById("intentChip").classList.add("show");
  document.getElementById("regionalLabel").textContent = `${selectedLanguage} Summary`;
  buildProcessStrip(selectedProcess);
  lockStaffInput(false);
  updateGuideHint(0);
}

function lockStaffInput(locked) {
  const row = document.getElementById("staffInputRow");
  if (!row) return;
  row.style.opacity = locked ? "0.4" : "1";
  row.style.pointerEvents = locked ? "none" : "all";
  const s = document.getElementById("staffStatusText");
  if (s) s.textContent = locked ? "Not ready" : "Ready";
}

function buildProcessStrip(process) {
  const steps = PROCESS_STEPS[process] || PROCESS_STEPS["General enquiry"];
  const strip = document.getElementById("processStrip");
  strip.innerHTML = "";
  steps.forEach((step, i) => {
    const div = document.createElement("div");
    div.className = "process-step" + (i === 0 ? " active" : "");
    div.id = `step-${i}`;
    div.innerHTML = `
      <div class="step-num">${i + 1}</div>
      <div class="step-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span>${step}</span>`;
    strip.appendChild(div);
  });
  strip.classList.add("show");
}

function startConversation() {
  lockStaffInput(false);
  setCustomerStatus("", "Ready");
  setStaffStatus("", "Ready");
  const meta = LANG_META[selectedLanguage] || {};
  const emptyHint = document.getElementById("customerEmpty");
  if (emptyHint) {
    const p = emptyHint.querySelector("p");
    if (p) p.textContent = `Tap the mic to record the customer in ${meta.tag || selectedLanguage}`;
  }
  updateGuideHint(0);
  autoGreetCustomer();
}

async function autoGreetCustomer() {
  const greetingMap = GREETINGS[selectedProcess] || GREETINGS["General enquiry"];
  const greetingText = greetingMap[selectedLanguage] || greetingMap["English"];

  hideEl("staffEmpty");
  const wrap = document.createElement("div");
  wrap.className = "staff-bubble-wrap";
  wrap.innerHTML = `
    <div class="bubble-staff" style="border-left:3px solid var(--gold)">
      <span style="font-size:11px;color:var(--gold);display:block;margin-bottom:4px">👋 Auto Greeting</span>
      ${escHtml(greetingText)}
    </div>
    <div class="bubble-staff-meta">
      <span>${formatTime()}</span>
      <span class="engine-tag">auto</span>
    </div>`;
  document.getElementById("staffTranscript").appendChild(wrap);
  document.getElementById("staffTranscript").scrollTop = 99999;

  try {
    const form = new FormData();
    form.append("staff_text", greetingText);
    form.append("target_language", selectedLanguage);
    const res  = await fetch(`${API_BASE}/staff-reply`, { method: "POST", body: form });
    const data = await res.json();
    if (data.audio_b64) playAudio(data.audio_b64);
    else speakWithBrowserSynthesis(greetingText, selectedLanguage);
  } catch (e) {
    speakWithBrowserSynthesis(greetingText, selectedLanguage);
  }

  conversationLog.push({ role: "staff", text: greetingText, translation: greetingText });

  advanceStep();
  showStaticQuickReplies();
}

async function updateStepFromLLM() {
  if (conversationLog.length === 0) return;
  try {
    const res = await fetch(`${API_BASE}/detect-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: conversationLog,
        process_type: selectedProcess,
        current_step: stepIndex
      })
    });
    const data = await res.json();
    if (!data.success) return;

    if (data.missing_info && data.missing_info.length > 0) {
      addInfoBadge(`📋 AI suggests still needed: ${data.missing_info.join(", ")}`);
    }
    if (data.next_question) showNextQuestionHint(data.next_question);

    await fetchSmartQuickReplies();
  } catch (e) {
    console.warn("[SmartStep] failed, using static:", e);
    showStaticQuickReplies();
  }
}

async function fetchSmartQuickReplies() {
  try {
    const res = await fetch(`${API_BASE}/smart-replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: conversationLog.slice(-6),
        process_type: selectedProcess,
        step_index: stepIndex,
        customer_language: selectedLanguage
      })
    });
    const data = await res.json();
    if (data.success && data.replies && data.replies.length > 0) {
      smartReplies = data.replies;
      showQuickReplies(smartReplies);
      return;
    }
  } catch (e) { console.warn("[SmartReplies] fallback to static"); }
  showStaticQuickReplies();
}

function advanceStep() {
  const steps = PROCESS_STEPS[selectedProcess] || [];
  const done = document.getElementById(`step-${stepIndex}`);
  if (done) { done.classList.remove("active"); done.classList.add("done"); }
  stepIndex = Math.min(stepIndex + 1, steps.length - 1);
  const next = document.getElementById(`step-${stepIndex}`);
  if (next && !next.classList.contains("done")) next.classList.add("active");
  updateGuideHint(stepIndex);

  const stepName = (PROCESS_STEPS[selectedProcess] || [])[stepIndex] || "";
  if ((stepName === "KYC Details" || stepName === "Documents") && !kycShown) {
    kycShown = true;
    showKycChecklist();
  }
}


function updateGuideHint(step) {
  const hints = GUIDE_HINTS[selectedProcess] || GUIDE_HINTS["General enquiry"];
  const hint = hints[Math.min(step, hints.length - 1)];
  const el = document.getElementById("guideHint");
  const txt = document.getElementById("guideHintText");
  if (el && txt && hint) { txt.textContent = hint; el.style.display = "flex"; }
}

function showNextQuestionHint(question) {
  document.getElementById("nextQuestionHint")?.remove();
  const div = document.createElement("div");
  div.id = "nextQuestionHint";
  div.style.cssText = `margin:6px 20px;padding:8px 14px;border-radius:8px;
    background:rgba(56,189,248,0.10);border-left:3px solid #38bdf8;
    font-size:12.5px;color:var(--navy);`;
  div.innerHTML = `<span style="color:#38bdf8;font-weight:600">💡 Suggested: </span>${escHtml(question)}`;
  const controls = document.querySelector(".pane:last-child .pane-controls");
  if (controls) controls.insertBefore(div, controls.firstChild);
}

function showQuickReplies(replies) {
  document.getElementById("quickRepliesBar")?.remove();
  document.getElementById("nextQuestionHint")?.remove();
  if (!replies || replies.length === 0) { showStaticQuickReplies(); return; }
  renderQuickReplyBar(replies, "⚡ Smart replies — tap to send instantly");
}

function showStaticQuickReplies() {
  document.getElementById("quickRepliesBar")?.remove();
  const allReplies = STATIC_QUICK_REPLIES[selectedProcess] || STATIC_QUICK_REPLIES["General enquiry"];
  const stepReplies = allReplies[Math.min(stepIndex, allReplies.length - 1)] || [];
  if (stepReplies.length === 0) return;
  renderQuickReplyBar(stepReplies, "⚡ Quick replies — tap to send instantly");
}

function renderQuickReplyBar(replies, label) {
  if (!replies || replies.length === 0) return;
  const bar = document.createElement("div");
  bar.id = "quickRepliesBar";
  bar.style.cssText = `display:flex;gap:8px;flex-wrap:wrap;
    padding:10px 20px 8px;background:var(--white);border-top:1px solid var(--border);`;

  const lbl = document.createElement("div");
  lbl.style.cssText = `width:100%;font-size:10.5px;text-transform:uppercase;
    letter-spacing:0.07em;color:var(--slate-light);font-weight:600;margin-bottom:2px;`;
  lbl.textContent = label;
  bar.appendChild(lbl);

  replies.forEach(text => {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.style.cssText = `padding:6px 14px;border-radius:99px;border:1px solid var(--gold);
      background:rgba(184,146,61,0.08);color:var(--navy);font-size:12.5px;cursor:pointer;
      font-family:inherit;transition:all 150ms ease;white-space:nowrap;`;
    btn.onmouseover = () => { btn.style.background = "rgba(184,146,61,0.22)"; btn.style.transform = "scale(1.03)"; };
    btn.onmouseout  = () => { btn.style.background = "rgba(184,146,61,0.08)"; btn.style.transform = "scale(1)"; };
    btn.onclick = () => { document.getElementById("staffInput").value = text; sendStaffReply(); bar.remove(); };
    bar.appendChild(btn);
  });

  const controls = document.querySelector(".pane:last-child .pane-controls");
  if (controls) controls.insertBefore(bar, controls.firstChild);
}

function showKycChecklist() {
  const checklist = KYC_CHECKLIST[selectedProcess];
  if (!checklist) return;
  document.getElementById("kycPopup")?.remove();
  const popup = document.createElement("div");
  popup.id = "kycPopup";
  popup.style.cssText = `position:fixed;bottom:100px;right:24px;z-index:300;
    background:var(--white);border:1px solid var(--gold);border-radius:10px;
    padding:16px 18px;width:280px;box-shadow:0 8px 24px rgba(15,30,61,0.15);
    animation:bubbleIn 300ms ease-out;`;
  popup.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-size:13px;font-weight:600;color:var(--navy);">📋 Document Checklist</div>
      <button onclick="document.getElementById('kycPopup').remove()"
        style="background:none;border:none;cursor:pointer;color:var(--slate-light);font-size:16px;">×</button>
    </div>
    <div style="font-size:12px;color:var(--slate);line-height:2;">
      ${checklist.map(i => `<div>${i}</div>`).join("")}
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--gold);font-weight:500;">
      Show this checklist to the customer
    </div>`;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 15000);
}

function startTimer() {
  timerInterval = setInterval(() => {
    const e = Math.floor((Date.now() - sessionStart) / 1000);
    document.getElementById("timerDisplay").textContent =
      `${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}`;
  }, 1000);
}

async function toggleCustomerRecording() {
  if (isRecording) stopCustomerRecording();
  else await startCustomerRecording();
}

async function startCustomerRecording() {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) {
    showToast(err.name === "NotAllowedError" ? "Microphone permission denied." : `Mic error: ${err.message}`, true);
    return;
  }
  try {
    const mime = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = () => processCustomerAudio();
    mediaRecorder.start(100);
    isRecording = true;
    const mic  = document.getElementById("customerMicBtn");
    const hint = document.getElementById("customerMicHint");
    if (mic)  mic.classList.add("recording");
    if (hint) { hint.textContent = "Recording… Tap to stop"; hint.classList.add("recording"); }
    setCustomerStatus("listening", "Listening…");
    hideEl("customerEmpty");
    addCustomerWaveform();
    document.getElementById("quickRepliesBar")?.remove();
  } catch (err) {
    showToast(`Recording setup failed: ${err.message}`, true);
    stream.getTracks().forEach(t => t.stop());
  }
}

function stopCustomerRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  isRecording = false;
  const mic  = document.getElementById("customerMicBtn");
  const hint = document.getElementById("customerMicHint");
  if (mic)  mic.classList.remove("recording");
  if (hint) { hint.textContent = "Tap to record customer"; hint.classList.remove("recording"); }
  setCustomerStatus("processing", "Processing…");
}

function isUnclearTranscript(text) {
  if (!text) return true;
  const trimmed = text.trim();
  return trimmed.length < 3;
}

async function processCustomerAudio() {
  removeEl("customerWaveform");
  showEl("customerProcessing");
  try {
    const mime = getSupportedMimeType();
    const blob = new Blob(audioChunks, { type: mime || "audio/webm" });
    const wav  = await convertToWav(blob);
    const form = new FormData();
    form.append("audio", wav, "customer.wav");
    form.append("language", selectedLanguage);
    form.append("process_type", selectedProcess);

    const res  = await fetch(`${API_BASE}/customer-speak`, { method: "POST", body: form });
    const data = await res.json();
    hideEl("customerProcessing");

    if (data.success && data.customer_text) {

      if (isUnclearTranscript(data.customer_text)) {
        addCustomerBubble(data.customer_text, "(unclear — ask customer to repeat)", data.stt_engine, null);
        conversationLog.push({ role: "customer", text: data.customer_text, translation: "(unclear)" });
        setCustomerStatus("", "Ready");
        showStaticQuickReplies();
        showToast("Audio unclear — ask the customer to repeat", true);
        return;
      }

      addCustomerBubble(data.customer_text, data.english_translation, data.stt_engine, data.intent);
      if (data.intent && data.intent !== "General enquiry") {
        document.getElementById("intentChipText").textContent = data.intent;
        document.getElementById("intentChip").classList.add("show");
      }
      conversationLog.push({ role: "customer", text: data.customer_text, translation: data.english_translation });
    await updateStepFromLLM();
await autoCheckStepCompletion();  // ADD THIS
      setCustomerStatus("done", "Transcribed");
    } else {
      showToast(data.error || "Could not transcribe. Try again.", true);
      setCustomerStatus("", "Ready");
    }
  } catch (err) {
    hideEl("customerProcessing");
    showToast("Backend error. Is port 8000 running?", true);
    setCustomerStatus("", "Ready");
  }
}
// After processCustomerAudio() completes, add:
async function autoCheckStepCompletion() {
  try {
    const res = await fetch(`${API_BASE}/step-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step_index: stepIndex,
        conversation: conversationLog,
        process_type: selectedProcess,
        customer_language: selectedLanguage
      })
    });
    
    const data = await res.json();
    
    // If step is complete, auto-advance
    if (data.is_complete) {
      advanceStep();
      // renderStepChecklist(); // Shows new step checklist auto
      await fetchSmartQuickReplies();
    } else if (data.missing_fields) {
      // Show what's still needed
      addInfoBadge(`📋 Still need: ${data.missing_fields.join(", ")}`);
    }
  } catch (e) {
    console.warn("[AutoStep] failed:", e);
  }
}

async function sendStaffReply() {
  const input = document.getElementById("staffInput");
  const text  = input.value.trim();
  if (!text) return;
  const btn = document.getElementById("staffSendBtn");
  btn.disabled = true; btn.classList.add("loading");
  showEl("staffProcessing"); hideEl("staffEmpty");
  try {
    const form = new FormData();
    form.append("staff_text", text);
    form.append("target_language", selectedLanguage);
    const res  = await fetch(`${API_BASE}/staff-reply`, { method: "POST", body: form });
    const data = await res.json();
    hideEl("staffProcessing");
    btn.disabled = false; btn.classList.remove("loading");
    if (data.success) {
      addStaffBubble(text, data.translated_text, data.tts_engine);
      if (data.audio_b64) playAudio(data.audio_b64);
      else speakWithBrowserSynthesis(data.translated_text, selectedLanguage);
      conversationLog.push({ role: "staff", text, translation: data.translated_text });
      input.value = ""; input.style.height = "auto";
      setStaffStatus("done", "Sent");
      setTimeout(() => setStaffStatus("", "Ready"), 2000);
      document.getElementById("quickRepliesBar")?.remove();
      document.getElementById("nextQuestionHint")?.remove();
    } else { showToast(data.error || "Translation failed", true); }
  } catch (err) {
    hideEl("staffProcessing");
    btn.disabled = false; btn.classList.remove("loading");
    showToast("Backend error. Is port 8000 running?", true);
  }
}

async function toggleStaffRecording() {
  const btn = document.getElementById("staffMicBtn");
  if (staffRecording) {
    if (staffRecorder && staffRecorder.state !== "inactive") {
      staffRecorder.stop(); staffRecorder.stream.getTracks().forEach(t => t.stop());
    }
    staffRecording = false; btn.classList.remove("recording");
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getSupportedMimeType();
      staffRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      staffChunks = [];
      staffRecorder.ondataavailable = e => { if (e.data.size > 0) staffChunks.push(e.data); };
      staffRecorder.onstop = async () => {
        btn.classList.remove("recording"); staffRecording = false;
        const blob = new Blob(staffChunks, { type: mime || "audio/webm" });
        const wav  = await convertToWav(blob);
        const form = new FormData(); form.append("audio", wav, "staff.wav");
        try {
          const res  = await fetch(`${API_BASE}/staff-speak`, { method: "POST", body: form });
          const data = await res.json();
          if (data.success && data.text) {
            document.getElementById("staffInput").value = data.text;
            document.getElementById("staffInput").dispatchEvent(new Event("input"));
          }
        } catch (e) { showToast("Staff mic failed", true); }
      };
      staffRecorder.start(100); staffRecording = true; btn.classList.add("recording");
    } catch (e) { showToast("Mic denied", true); }
  }
}

function addInfoBadge(msg) {
  document.getElementById("infoBadge")?.remove();
  const div = document.createElement("div");
  div.id = "infoBadge";
  div.style.cssText = `margin:4px 20px;padding:6px 12px;border-radius:6px;
    background:rgba(251,191,36,0.12);border-left:3px solid #fbbf24;
    font-size:12px;color:var(--navy);`;
  div.textContent = msg;
  const controls = document.querySelector(".pane:last-child .pane-controls");
  if (controls) controls.insertBefore(div, controls.firstChild);
  setTimeout(() => div.remove(), 8000);
}

async function endSession() {
  if (conversationLog.length === 0) { showToast("No conversation yet", true); return; }
  clearInterval(timerInterval);
  document.getElementById("summaryModal").classList.add("show");
  document.getElementById("englishSummary").textContent = "Generating…";
  document.getElementById("regionalSummary").textContent = "Translating…";
  document.getElementById("summaryMeta").textContent =
    `${selectedLanguage} · ${selectedProcess} · ${document.getElementById("timerDisplay").textContent}`;
  try {
    const res  = await fetch(`${API_BASE}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: conversationLog.map(t => ({ role: t.role, text: t.text })),
        customer_language: selectedLanguage,
        process_type: selectedProcess
      })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("englishSummary").textContent = data.english_summary;
      document.getElementById("regionalSummary").textContent = data.regional_summary;
      if (data.action_items && data.action_items.length > 0) {
        document.getElementById("englishSummary").textContent +=
          "\n\nACTION ITEMS:\n" + data.action_items.map(a => `• ${a}`).join("\n");
      }
    } else {
      document.getElementById("englishSummary").textContent = "Error: " + (data.error || "");
    }
  } catch (e) { document.getElementById("englishSummary").textContent = "Network error."; }
}

function closeSummary() { document.getElementById("summaryModal").classList.remove("show"); startTimer(); }
function newSession()   { window.location.href = "dashboard.html"; }
function saveToRecords(){ showToast("Saved ✓"); setTimeout(() => { window.location.href = "dashboard.html"; }, 1500); }

function bindEvents() {
  const bind = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (!el) { console.error(`[bindEvents] #${id} not found`); return; }
    el.addEventListener(ev, fn);
  };
  bind("customerMicBtn", "click", toggleCustomerRecording);
  bind("staffSendBtn",   "click", sendStaffReply);
  bind("staffMicBtn",    "click", toggleStaffRecording);
  bind("endSessionBtn",  "click", endSession);
  bind("saveRecordBtn",  "click", saveToRecords);
  bind("manualNextBtn",  "click", manualNextStep);
  bind("manualBackBtn",  "click", manualBackStep);
  const inp = document.getElementById("staffInput");
  if (inp) {
    inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendStaffReply(); } });
    inp.addEventListener("input",   () => { inp.style.height = "auto"; inp.style.height = Math.min(inp.scrollHeight, 120) + "px"; });
  }
}

function addCustomerBubble(orig, trans, engine, intent) {
  hideEl("customerEmpty");
  const wrap = document.createElement("div");
  wrap.className = "transcript-bubble";
  wrap.innerHTML = `<div class="bubble-original">${escHtml(orig)}</div>
    ${trans ? `<div class="bubble-translation">🌐 ${escHtml(trans)}</div>` : ""}
    <div class="bubble-meta"><span>${formatTime()}</span><span class="engine-tag">${engine}</span>${intent ? `<span class="engine-tag">${intent}</span>` : ""}</div>`;
  document.getElementById("customerTranscript").appendChild(wrap);
  document.getElementById("customerTranscript").scrollTop = 99999;
}

function addStaffBubble(orig, trans, engine) {
  hideEl("staffEmpty");
  const wrap = document.createElement("div");
  wrap.className = "staff-bubble-wrap";
  wrap.innerHTML = `<div class="bubble-staff">${escHtml(orig)}</div>
    ${trans ? `<div class="bubble-staff-translated">→ ${escHtml(trans)}</div>` : ""}
    <div class="bubble-staff-meta"><span>${formatTime()}</span><span class="engine-tag">${engine || "llm"}</span></div>`;
  document.getElementById("staffTranscript").appendChild(wrap);
  document.getElementById("staffTranscript").scrollTop = 99999;
}

function addCustomerWaveform() {
  const d = document.createElement("div");
  d.className = "waveform-inline show"; d.id = "customerWaveform";
  d.innerHTML = "<span></span><span></span><span></span><span></span><span></span>";
  document.getElementById("customerTranscript").appendChild(d);
  document.getElementById("customerTranscript").scrollTop = 99999;
}

function hideEl(id) { const e = document.getElementById(id); if (e) e.style.display = "none"; }
function showEl(id) { const e = document.getElementById(id); if (e) e.classList.add("show"); }
function removeEl(id) { document.getElementById(id)?.remove(); }
function setCustomerStatus(state, text) {
  document.getElementById("customerDot").className = "pane-status-dot" + (state ? " " + state : "");
  document.getElementById("customerStatusText").textContent = text;
}
function setStaffStatus(state, text) {
  document.getElementById("staffDot").className = "pane-status-dot" + (state ? " " + state : "");
  document.getElementById("staffStatusText").textContent = text;
}

function speakWithBrowserSynthesis(text, language) {
  return new Promise(resolve => {
    if (!text || !("speechSynthesis" in window)) { resolve(false); return; }
    const locale = SPEECH_SYNTH_LOCALE[language] || "en-IN";
    const utter  = new SpeechSynthesisUtterance(text);
    utter.lang = locale; utter.rate = 0.95;
    const go = () => {
      const voices = window.speechSynthesis.getVoices();
      const chosen = voices.find(v => v.lang === locale) || voices.find(v => v.lang?.startsWith(locale.split("-")[0]));
      if (chosen) utter.voice = chosen;
      if (!voices.length) { resolve(false); return; }
      utter.onend = () => resolve(true); utter.onerror = () => resolve(false);
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(utter);
    };
    if (window.speechSynthesis.getVoices().length > 0) go();
    else { window.speechSynthesis.onvoiceschanged = go; setTimeout(go, 500); }
  });
}

function playAudio(b64) {
  const p = document.getElementById("audioPlayer");
  p.src = `data:audio/wav;base64,${b64}`;
  p.play().catch(() => { p.src = `data:audio/mpeg;base64,${b64}`; p.play().catch(() => {}); });
}

function getSupportedMimeType() {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"])
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

async function convertToWav(blob) {
  try {
    const ab  = await blob.arrayBuffer();
    const ctx = new AudioContext({ sampleRate: 16000 });
    const dec = await ctx.decodeAudioData(ab);
    const s = dec.getChannelData(0), n = s.length;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const ws = (o, str) => { for (let i=0;i<str.length;i++) v.setUint8(o+i, str.charCodeAt(i)); };
    ws(0,"RIFF"); v.setUint32(4,36+n*2,true); ws(8,"WAVE");
    ws(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,16000,true); v.setUint32(28,32000,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
    ws(36,"data"); v.setUint32(40,n*2,true);
    let off=44;
    for (let i=0;i<n;i++,off+=2) { const x=Math.max(-1,Math.min(1,s[i])); v.setInt16(off,x<0?x*0x8000:x*0x7FFF,true); }
    await ctx.close();
    return new Blob([buf], { type:"audio/wav" });
  } catch(e) { return blob; }
}

function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function formatTime() { return new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true}); }
function showToast(msg, isError=false) {
  const t = document.getElementById("toast");
  document.getElementById("toastText").textContent = msg;
  t.style.background = isError ? "var(--error)" : "var(--navy)";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}