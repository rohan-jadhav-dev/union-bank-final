// ============================================================================
// chat-widget.js — Floating Conversation Widget for VoiceAssist AI Dashboard
// NEW UI (floating bubble/window) + OLD LOGIC (same backend, same flows as
// the original conversation-desk.html): manual step nav, smart-replies,
// extract-lead / submit-lead auto-fill, save-to-records into va_sessions.
// ============================================================================

(function () {
  "use strict";

  // ── Backend (SAME as old conversation-desk.html / dashboard.js) ─────────
  const API_BASE = "https://rohan667-voiceassist-ai-backend-kj.hf.space/api/conversation";

  const LANG_META = {
    Hindi: { flag: "हि", tag: "हिन्दी" },
    Marathi: { flag: "मा", tag: "मराठी" },
    Tamil: { flag: "த", tag: "தமிழ்" },
    Telugu: { flag: "తె", tag: "తెలుగు" },
    English: { flag: "EN", tag: "English" },
  };

  const PROCESS_STEPS = {
    "Loan enquiry": ["Greeting", "Loan Options", "Eligibility", "Documents", "Next Steps"],
    "Account opening": ["Greeting", "Account Type", "KYC Details", "Documents", "Activate"],
    "Balance enquiry": ["Greeting", "Verify Identity", "Show Balance", "Done"],
    "Credit card apply": ["Greeting", "Eligibility", "Card Selection", "Documents", "Apply"],
    "General enquiry": ["Greeting", "Understand", "Answer", "Resolved"],
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
      Hindi: "नमस्ते! Union Bank of India में आपका स्वागत है। आज मैं आपकी loan के बारे में कैसे मदद कर सकता हूँ?",
      Marathi: "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे। आज मी तुम्हाला loan बद्दल कशी मदत करू शकतो?",
      Tamil: "வணக்கம்! Union Bank of India-வில் உங்களை வரவேற்கிறோம். இன்று கடன் பற்றி உங்களுக்கு எவ்வாறு உதவலாம்?",
      Telugu: "నమస్కారం! Union Bank of India కి స్వాగతం. ఈ రోజు రుణం గురించి మీకు ఎలా సహాయపడగలను?",
      English: "Welcome to Union Bank of India! How can I assist you with your loan enquiry today?",
    },
    "Account opening": {
      Hindi: "नमस्ते! Union Bank of India में आपका स्वागत है। नया खाता खोलने के लिए आप सही जगह पर आए हैं!",
      Marathi: "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे। नवीन खाते उघडण्यासाठी आपण योग्य ठिकाणी आलात!",
      Tamil: "வணக்கம்! புதிய வங்கி கணக்கு திறக்க Union Bank of India-வில் நீங்கள் சரியான இடத்திற்கு வந்துள்ளீர்கள்!",
      Telugu: "నమస్కారం! కొత్త ఖాతా తెరవడానికి Union Bank of India లో మీరు సరైన చోటికి వచ్చారు!",
      English: "Welcome to Union Bank of India! You're in the right place to open a new bank account today.",
    },
    "Balance enquiry": {
      Hindi: "नमस्ते! Union Bank of India में आपका स्वागत है। मैं आपका account balance जाँचने में मदद करूँगा।",
      Marathi: "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे। मी तुमचे account balance तपासण्यास मदत करतो.",
      Tamil: "வணக்கம்! உங்கள் கணக்கு இருப்பை சரிபார்க்க உதவுகிறேன்.",
      Telugu: "నమస్కారం! మీ ఖాతా బ్యాలెన్స్ తనిఖీ చేయడంలో సహాయపడతాను.",
      English: "Welcome to Union Bank of India! I'll help you check your account balance today.",
    },
    "Credit card apply": {
      Hindi: "नमस्ते! Union Bank of India में आपका स्वागत है। Credit card apply करने में मैं आपकी मदद करूँगा।",
      Marathi: "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे. Credit card साठी apply करण्यास मी मदत करतो.",
      Tamil: "வணக்கம்! கிரெடிட் கார்டு விண்ணப்பிக்க உதவுகிறேன்.",
      Telugu: "నమస్కారం! క్రెడిట్ కార్డు దరఖాస్తుకు సహాయపడతాను.",
      English: "Welcome to Union Bank of India! I'll help you apply for a credit card today.",
    },
    "General enquiry": {
      Hindi: "नमस्ते! Union Bank of India में आपका स्वागत है। आज मैं आपकी कैसे मदद कर सकता हूँ?",
      Marathi: "नमस्कार! Union Bank of India मध्ये आपले स्वागत आहे. मी तुम्हाला कशी मदत करू?",
      Tamil: "வணக்கம்! இன்று உங்களுக்கு எவ்வாறு உதவலாம்?",
      Telugu: "నమస్కారం! ఈ రోజు మీకు ఎలా సహాయపడగలను?",
      English: "Welcome to Union Bank of India! How can I help you today?",
    },
  };

  const STATIC_QUICK_REPLIES = {
    "Loan enquiry": [
      [],
      ["🏠 Home Loan — 8.35% p.a., up to 30 years, max ₹10 crore", "💳 Personal Loan — 11.40% p.a., up to ₹15 lakh, 5 years",
        "🚗 Car Loan — 8.70% p.a., up to 90% on-road price, 7 years", "🎓 Education Loan — 9.90% p.a., up to ₹20 lakh abroad"],
      ["What is your monthly income?", "Are you salaried or self-employed?",
        "Do you have any existing loan EMIs?", "What is your approximate CIBIL score?"],
      ["Please bring Aadhaar Card original + photocopy", "PAN Card original + photocopy needed",
        "Last 3 months salary slips + 6 months bank statement", "Form 16 + property sale agreement + NOC from builder"],
      ["Processing fee is 0.5% of loan amount — one time payment", "Approval takes 7–10 working days after document submission",
        "Loan disbursed directly to builder or seller account"],
    ],
    "Account opening": [
      [],
      ["💰 Savings Account — ₹1000 min balance, 2.75% interest p.a.", "🏢 Current Account — ₹5000 min balance, unlimited transactions",
        "🆓 PMJDY Zero-Balance — free RuPay card + ₹2L accident insurance", "📈 Fixed Deposit — up to 7.00% interest, 7 days to 10 years"],
      ["Please fill KYC form — need Aadhaar, PAN, nominee details", "What is the nominee name and relation to you?",
        "Is your Aadhaar linked to mobile number for OTP verification?"],
      ["Aadhaar Card original + photocopy", "PAN Card original + photocopy",
        "2 passport size photographs + address proof (utility bill)"],
      ["Initial deposit ₹1000 — account activates in 30 minutes", "You will receive passbook and debit card today",
        "Net banking and UPI will be set up immediately"],
    ],
    "Balance enquiry": [
      [],
      ["Please share your account number last 4 digits", "OTP will be sent to your registered mobile number"],
      ["Your balance is being fetched — one moment please", "Would you like last 5 transactions as well?"],
      ["Would you like passbook update today?", "SMS BAL to 09223008586 anytime to check balance",
        "Download Union Bank Mobile app for 24x7 access"],
    ],
    "Credit card apply": [
      [],
      ["What is your annual income?", "Do you currently have any credit cards?", "What is your approximate CIBIL score?"],
      ["Union Classic — Free, 1% cashback on all spends", "Union Platinum — ₹499/year, 2X rewards, airport lounge access",
        "Union Signature — ₹2999/year, 3X rewards, unlimited lounge"],
      ["Aadhaar Card + PAN Card required", "Last 3 months salary slips or ITR (self-employed)", "1 passport size photograph"],
      ["Application submitted — credit limit SMS in 7 days", "Card delivery takes 15 working days to your address",
        "Activate card via net banking or branch visit"],
    ],
    "General enquiry": [
      [],
      ["How can I help you today?", "Which banking service do you need information about?"],
      ["Let me check that for you — one moment", "Could you give me more details about your query?"],
      ["Is there anything else I can help you with?", "Your query has been resolved successfully"],
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
      "Aadhaar Card (original + photocopy)", "PAN Card (original + photocopy)", "Last 3 months salary slips",
      "Last 6 months bank statement", "Form 16 / Income Tax Return",
      "Property documents (sale agreement, NOC from builder)", "Employment certificate",
    ],
    "Account opening": [
      "Aadhaar Card (original + photocopy)", "PAN Card (original + photocopy)", "2 Passport size photographs",
      "Address proof (utility bill / rental agreement < 3 months)", "Mobile number (to be registered)",
      "Initial deposit — min ₹1000 savings", "Nominee details (name, relation, DOB)",
    ],
    "Credit card apply": [
      "Aadhaar Card + PAN Card", "Last 3 months salary slips",
      "ITR for last 2 years (if self-employed)", "1 Passport size photograph", "Last 3 months bank statement",
    ],
  };

  const SPEECH_SYNTH_LOCALE = {
    Hindi: "hi-IN", Marathi: "mr-IN", Tamil: "ta-IN", Telugu: "te-IN", English: "en-IN",
  };

  // ── LEAD AUTO-FILL FORM SCHEMAS (same as old conversation-desk.html) ────
  const LEAD_FORM_FIELDS = {
    "Loan enquiry": [
      { key: "customer_name", label: "Customer Name" },
      { key: "phone", label: "Phone Number" },
      { key: "loan_type", label: "Loan Type" },
      { key: "loan_amount", label: "Loan Amount Requested" },
      { key: "tenure", label: "Tenure Preference" },
      { key: "monthly_income", label: "Monthly Income" },
      { key: "employment_type", label: "Employment Type" },
      { key: "cibil_score", label: "CIBIL Score (approx)" },
      { key: "existing_emi", label: "Existing EMI Obligations" },
    ],
    "Account opening": [
      { key: "customer_name", label: "Customer Name" },
      { key: "dob", label: "Date of Birth" },
      { key: "phone", label: "Phone Number" },
      { key: "address", label: "Address" },
      { key: "account_type", label: "Account Type" },
      { key: "nominee_name", label: "Nominee Name" },
      { key: "nominee_relation", label: "Nominee Relation" },
    ],
    "Balance enquiry": [
      { key: "customer_name", label: "Customer Name" },
      { key: "account_last4", label: "Account No. (last 4)" },
    ],
    "Credit card apply": [
      { key: "customer_name", label: "Customer Name" },
      { key: "phone", label: "Phone Number" },
      { key: "annual_income", label: "Annual Income" },
      { key: "cibil_score", label: "CIBIL Score (approx)" },
      { key: "card_selected", label: "Card Selected" },
    ],
    "General enquiry": [
      { key: "customer_name", label: "Customer Name" },
      { key: "query_summary", label: "Query Summary" },
    ],
  };

  // ── Client-side lead extraction fallback (same as old code) ─────────────
  const FIELD_PATTERNS = {
    customer_name: [
      /my name is\s+([a-z][a-z.\s]*?)(?:\s+and\b|[.,!]|$)/i,
      /this is\s+([a-z][a-z.\s]*?)(?:\s+speaking|\s+here|[.,!]|$)/i,
      /i am\s+([a-z][a-z.\s]*?)(?:\s+and\b|[.,!]|$)/i,
    ],
    dob: [
      /(?:date of birth|dob|born on)\s*(?:is)?\s*[:\-]?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+[0-9]{4})/i,
      /(?:date of birth|dob|born on)\s*(?:is)?\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    ],
    phone: [
      /(?:phone|mobile|number|contact)\D{0,15}?([6-9][0-9]{9})\b/i,
      /\b([6-9][0-9]{9})\b/,
    ],
    address: [
      /(?:my address is|i live at|address is|residing at)\s*([^.,;\n]+)/i,
    ],
    account_type: [
      /\b(union junior|savings account|current account|pmjdy|fixed deposit|fd account|savings|current)\b/i,
    ],
    nominee_name: [
      /nominee(?:'s)?\s*name\s*(?:is)?\s*[:\-]?\s*([a-z][a-z.\s]*?)(?:[.,]|$)/i,
    ],
    nominee_relation: [
      /nominee.*?relation(?:ship)?\s*(?:is)?\s*[:\-]?\s*([a-z][a-z\s]*?)(?:[.,]|$)/i,
      /(?:my\s+)?(son|daughter|wife|husband|spouse|father|mother|brother|sister)\s+(?:is|as)\s+(?:my\s+)?nominee/i,
    ],
    loan_type: [
      /\b(home loan|personal loan|car loan|education loan|gold loan)\b/i,
    ],
    loan_amount: [
      /(?:loan amount|need|want|require)\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*\s*(?:lakh|lac|crore)?)/i,
    ],
    tenure: [
      /(?:tenure|for|over)\s*([0-9]+\s*(?:years?|yrs?|months?))/i,
    ],
    monthly_income: [
      /monthly income\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)/i,
    ],
    employment_type: [
      /\b(salaried|self[\s-]?employed|business owner|government employee)\b/i,
    ],
    cibil_score: [
      /cibil\D{0,10}?([0-9]{3})\b/i,
    ],
    existing_emi: [
      /existing emi\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)/i,
    ],
    annual_income: [
      /annual income\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)/i,
    ],
    card_selected: [
      /\b(union classic|union platinum|union signature)\b/i,
    ],
    account_last4: [
      /(?:account number|account no\.?|last 4 digits?)\D{0,10}?([0-9]{4})\b/i,
    ],
  };

  // ── Utility functions ───────────────────────────────────────────────────
  function escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function formatTime() { return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); }
  function titleCase(s) {
    return s.replace(/\s+/g, " ").trim().split(" ").map(w =>
      w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w
    ).join(" ");
  }

  // Same JSON-unwrap cleanup used across the old codebase (dashboard.js /
  // conversation-desk.html) for model output that sometimes comes back
  // wrapped in ```json {...} ``` instead of plain text.
  function cleanModelText(raw) {
    if (raw === null || raw === undefined) return raw;
    let t = String(raw).trim();
    if (!t) return t;
    const looksJsonWrapped =
      t.includes("```") ||
      /"english_translation"|"customer_text"|"translated_text"|"text"\s*:/.test(t) ||
      (t.includes("{") && t.includes("}"));
    if (!looksJsonWrapped) return t;
    let stripped = t.replace(/^[^{]*?```(?:json)?/is, "").replace(/```[^]*$/i, "").trim();
    if (!stripped.startsWith("{")) {
      const start = t.indexOf("{"), end = t.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) stripped = t.slice(start, end + 1);
    }
    if (!stripped.startsWith("{")) return t;
    try {
      const obj = JSON.parse(stripped);
      return obj.english_translation ?? obj.customer_text ?? obj.translated_text ?? obj.text ?? t;
    } catch (e) {
      return t;
    }
  }

  function getSupportedMimeType() {
    for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"])
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
    return "";
  }

  async function convertToWav(blob) {
    try {
      const ab = await blob.arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 16000 });
      const dec = await ctx.decodeAudioData(ab);
      const s = dec.getChannelData(0), n = s.length;
      const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      const ws = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
      ws(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); ws(8, "WAVE");
      ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      ws(36, "data"); v.setUint32(40, n * 2, true);
      let off = 44;
      for (let i = 0; i < n; i++, off += 2) { const x = Math.max(-1, Math.min(1, s[i])); v.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7FFF, true); }
      await ctx.close();
      return new Blob([buf], { type: "audio/wav" });
    } catch (e) { return blob; }
  }

  function speakWithBrowserSynthesis(text, language) {
    return new Promise(resolve => {
      if (!text || !("speechSynthesis" in window)) { resolve(false); return; }
      const locale = SPEECH_SYNTH_LOCALE[language] || "en-IN";
      const utter = new SpeechSynthesisUtterance(text);
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

  // ── SVG Icons ───────────────────────────────────────────────────────────
  const ICONS = {
    chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-4l-4 4-4-4z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    minimize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14" stroke-linecap="round"/></svg>`,
    maximize: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" stroke-linecap="round"/></svg>`,
    restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="14" height="14" rx="2"/><path d="M7 7V5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2h-2" stroke-linecap="round"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg>`,
    mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke-linecap="round"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    panel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke-linecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke-linecap="round"/><path d="M9 12h6M9 16h4" stroke-linecap="round"/></svg>`,
  };

  // ════════════════════════════════════════════════════════════════════════
  // ChatWidget Class
  // ════════════════════════════════════════════════════════════════════════
  class ChatWidget {
    constructor() {
      this.state = "minimized"; // minimized | normal | maximized
      this.selectedLanguage = null;
      this.selectedProcess = null;
      this.conversationLog = [];
      this.sessionStart = 0;
      this.timerInterval = null;
      this.stepIndex = 0;
      this.isRecording = false;
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.staffRecording = false;
      this.staffRecorder = null;
      this.staffChunks = [];
      this.panelOpen = false;
      this.isActive = false;
      this.lastLeadSources = {};

      this._buildDOM();
      this._bindEvents();
    }

    // ── DOM Construction ────────────────────────────────────────────────
    _buildDOM() {
      this.bubble = document.createElement("button");
      this.bubble.className = "cw-bubble";
      this.bubble.setAttribute("aria-label", "Open Conversation Desk");
      this.bubble.innerHTML = `${ICONS.chat}<span class="cw-bubble-label">Conversation Desk</span><span class="cw-bubble-badge" id="cwBadge"></span>`;
      document.body.appendChild(this.bubble);

      this.window = document.createElement("div");
      this.window.className = "cw-window closed";
      this.window.innerHTML = this._windowHTML();
      document.body.appendChild(this.window);

      if (!document.getElementById("cwAudioPlayer")) {
        const audio = document.createElement("audio");
        audio.id = "cwAudioPlayer";
        document.body.appendChild(audio);
      }

      this._cacheRefs();
    }

    _windowHTML() {
      return `
        <!-- HEADER -->
        <div class="cw-header">
          <div class="cw-header-info">
            <div class="cw-header-title">Conversation Desk</div>
            <div class="cw-header-meta">
              <div class="cw-status-dot" id="cwStatusDot"></div>
              <span class="cw-status-text" id="cwStatusText">Ready</span>
              <span class="cw-header-lang" id="cwHeaderLang" style="display:none"></span>
              <span class="cw-header-timer" id="cwHeaderTimer" style="display:none">Session: <span id="cwTimerDisplay">00:00</span></span>
            </div>
          </div>
          <div class="cw-header-actions">
            <button class="cw-hdr-btn" id="cwBtnPanel" title="Process Guide" style="display:none">${ICONS.panel}</button>
            <button class="cw-hdr-btn btn-end-session" id="cwBtnEndSession" style="display:none">End & Summarise</button>
            <button class="cw-hdr-btn" id="cwBtnMinimize" title="Minimize">${ICONS.minimize}</button>
            <button class="cw-hdr-btn" id="cwBtnMaximize" title="Maximize">${ICONS.maximize}</button>
            <button class="cw-hdr-btn" id="cwBtnClose" title="Close">${ICONS.close}</button>
          </div>
        </div>

        <!-- BODY -->
        <div class="cw-body">
          <div class="cw-chat-area">
            <div class="cw-inline-process-strip" id="cwInlineProcessStrip" style="display:none"></div>
            <div class="cw-inline-guide-tip" id="cwInlineGuideTip" style="display:none"></div>

            <div class="cw-messages" id="cwMessages">
              <div class="cw-empty" id="cwEmpty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                  <path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-4l-4 4-4-4z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <p>Select a language and process from the dashboard, then click <strong>Begin Conversation</strong> to start.</p>
              </div>
            </div>

            <div class="cw-inline-checklist" id="cwInlineChecklist" style="display:none"></div>
            <div class="cw-quick-replies" id="cwQuickReplies"></div>

            <div class="cw-input-bar" id="cwInputBar" style="display:none">
              <button class="cw-mic-btn" id="cwCustomerMic" title="Record customer speech (regional)" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:auto;padding:4px 6px;">
                ${ICONS.mic}<span style="font-size:7.5px;font-weight:700;margin-top:-1px;text-transform:uppercase;">CUST</span>
              </button>
              <textarea class="cw-text-input" id="cwTextInput" placeholder="Type reply in English…" rows="1"></textarea>
              <button class="cw-mic-btn staff-mic" id="cwStaffMic" title="Record staff speech (English)" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:auto;padding:4px 6px;background:rgba(74,157,110,0.1);color:var(--success);border:1px solid rgba(74,157,110,0.2);margin-right:8px;">
                ${ICONS.mic}<span style="font-size:7.5px;font-weight:700;margin-top:-1px;text-transform:uppercase;">STAFF</span>
              </button>
              <button class="cw-send-btn" id="cwSendBtn" title="Send & Translate">
                ${ICONS.send}<div class="cw-send-spinner"></div>
              </button>
            </div>
          </div>

          <div class="cw-process-panel" id="cwProcessPanel">
            <div class="cw-panel-header">
              <span class="cw-panel-title">Process Guide</span>
              <button class="cw-panel-close" id="cwPanelClose">${ICONS.close}</button>
            </div>
            <div class="cw-panel-body" id="cwPanelBody"></div>
          </div>
        </div>

        <div class="cw-toast" id="cwToast"><span id="cwToastText"></span></div>

        <!-- SUMMARY + LEAD MODAL (same flow as old conversation-desk.html) -->
        <div class="cw-modal-overlay" id="cwSummaryModal">
          <div class="cw-modal">
            <div class="cw-modal-title">Session Summary</div>
            <div class="cw-modal-subtitle" id="cwSummaryMeta">Loading…</div>

            <div id="cwSaveBanner" style="display:none;align-items:center;gap:10px;padding:10px 14px;background:rgba(22,163,74,0.1);border:1px solid rgba(22,163,74,0.3);border-radius:8px;margin-bottom:14px;font-size:12.5px;color:#166534;font-weight:600;">
              ✓ Session saved to records
            </div>

            <div class="cw-modal-summaries">
              <div class="cw-summary-card">
                <div class="cw-summary-label">English Summary</div>
                <div class="cw-summary-text" id="cwEnglishSummary">Generating…</div>
              </div>
              <div class="cw-summary-card">
                <div class="cw-summary-label" id="cwRegionalLabel">Regional Summary</div>
                <div class="cw-summary-text" id="cwRegionalSummary">Generating…</div>
              </div>
            </div>

            <!-- Lead auto-fill card (old extract-lead / submit-lead flow) -->
            <div class="cw-summary-card" style="margin-bottom:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
                <div class="cw-summary-label" style="margin-bottom:0;">📝 Lead Details (auto-filled — review &amp; edit before sending)</div>
                <div style="display:flex;gap:6px;">
                  <button class="cw-modal-btn ghost" id="cwReExtractBtn" style="height:32px;padding:0 10px;font-size:11.5px;flex:none;">↻ Re-extract</button>
                  <button class="cw-modal-btn primary" id="cwSubmitLeadBtn" style="height:32px;padding:0 12px;font-size:11.5px;flex:none;background:var(--gold);">Send to Bank</button>
                </div>
              </div>
              <div id="cwLeadFormBody" style="display:flex;flex-direction:column;gap:8px;">
                <div style="color:var(--slate-light);font-size:12px;">Extracting lead details…</div>
              </div>
            </div>

            <div class="cw-modal-actions">
              <button class="cw-modal-btn primary" id="cwSaveRecordBtn">💾 Save to Records</button>
              <button class="cw-modal-btn ghost" id="cwCloseSummaryBtn">Close</button>
              <button class="cw-modal-btn ghost" id="cwNewSessionBtn">New Session</button>
            </div>
          </div>
        </div>
      `;
    }

    _cacheRefs() {
      this.els = {
        messages: this.window.querySelector("#cwMessages"),
        empty: this.window.querySelector("#cwEmpty"),
        inputBar: this.window.querySelector("#cwInputBar"),
        textInput: this.window.querySelector("#cwTextInput"),
        sendBtn: this.window.querySelector("#cwSendBtn"),
        customerMic: this.window.querySelector("#cwCustomerMic"),
        quickReplies: this.window.querySelector("#cwQuickReplies"),
        statusDot: this.window.querySelector("#cwStatusDot"),
        statusText: this.window.querySelector("#cwStatusText"),
        headerLang: this.window.querySelector("#cwHeaderLang"),
        headerTimer: this.window.querySelector("#cwHeaderTimer"),
        timerDisplay: this.window.querySelector("#cwTimerDisplay"),
        btnPanel: this.window.querySelector("#cwBtnPanel"),
        btnEndSession: this.window.querySelector("#cwBtnEndSession"),
        btnMinimize: this.window.querySelector("#cwBtnMinimize"),
        btnMaximize: this.window.querySelector("#cwBtnMaximize"),
        btnClose: this.window.querySelector("#cwBtnClose"),
        processPanel: this.window.querySelector("#cwProcessPanel"),
        panelBody: this.window.querySelector("#cwPanelBody"),
        panelClose: this.window.querySelector("#cwPanelClose"),
        toast: this.window.querySelector("#cwToast"),
        toastText: this.window.querySelector("#cwToastText"),
        summaryModal: this.window.querySelector("#cwSummaryModal"),
        summaryMeta: this.window.querySelector("#cwSummaryMeta"),
        englishSummary: this.window.querySelector("#cwEnglishSummary"),
        regionalSummary: this.window.querySelector("#cwRegionalSummary"),
        regionalLabel: this.window.querySelector("#cwRegionalLabel"),
        saveBanner: this.window.querySelector("#cwSaveBanner"),
        saveRecordBtn: this.window.querySelector("#cwSaveRecordBtn"),
        closeSummaryBtn: this.window.querySelector("#cwCloseSummaryBtn"),
        newSessionBtn: this.window.querySelector("#cwNewSessionBtn"),
        inlineProcessStrip: this.window.querySelector("#cwInlineProcessStrip"),
        inlineGuideTip: this.window.querySelector("#cwInlineGuideTip"),
        inlineChecklist: this.window.querySelector("#cwInlineChecklist"),
        staffMic: this.window.querySelector("#cwStaffMic"),
        leadFormBody: this.window.querySelector("#cwLeadFormBody"),
        reExtractBtn: this.window.querySelector("#cwReExtractBtn"),
        submitLeadBtn: this.window.querySelector("#cwSubmitLeadBtn"),
      };
    }

    // ── Event Binding ───────────────────────────────────────────────────
    _bindEvents() {
      this.bubble.addEventListener("click", () => this.toggle());
      this.els.btnMinimize.addEventListener("click", () => this.minimize());
      this.els.btnMaximize.addEventListener("click", () => this.toggleMaximize());
      this.els.btnClose.addEventListener("click", () => this.close());
      this.els.btnPanel.addEventListener("click", () => this.togglePanel());
      this.els.panelClose.addEventListener("click", () => this.togglePanel());
      this.els.btnEndSession.addEventListener("click", () => this.endSession());
      this.els.customerMic.addEventListener("click", () => this.toggleCustomerRecording());
      this.els.staffMic.addEventListener("click", () => this.toggleStaffRecording());
      this.els.sendBtn.addEventListener("click", () => this.sendStaffReply());
      this.els.saveRecordBtn.addEventListener("click", () => this.saveToRecords());
      this.els.closeSummaryBtn.addEventListener("click", () => this.closeSummary());
      this.els.newSessionBtn.addEventListener("click", () => this.newSession());
      this.els.reExtractBtn.addEventListener("click", () => this.fetchLeadForm());
      this.els.submitLeadBtn.addEventListener("click", () => this.submitLead());

      this.els.textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendStaffReply(); }
      });
      this.els.textInput.addEventListener("input", () => {
        this.els.textInput.style.height = "auto";
        this.els.textInput.style.height = Math.min(this.els.textInput.scrollHeight, 100) + "px";
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.state === "maximized") this.setState("normal");
      });
    }

    // ── Window State Management ─────────────────────────────────────────
    toggle() { if (this.state === "minimized") this.open(); else this.minimize(); }

    open(lang, process) {
      if (lang && process) this.startSession(lang, process);
      this.setState("normal");
    }

    minimize() { this.setState("minimized"); }
    close() { this.setState("minimized"); }

    toggleMaximize() {
      this.setState(this.state === "maximized" ? "normal" : "maximized");
    }

    setState(newState) {
      this.state = newState;
      this.window.classList.remove("closed", "open", "maximized");
      this.bubble.classList.remove("hidden");
      switch (newState) {
        case "minimized": this.window.classList.add("closed"); break;
        case "normal": this.window.classList.add("open"); this.bubble.classList.add("hidden"); this._updateMaxBtn(false); break;
        case "maximized": this.window.classList.add("open", "maximized"); this.bubble.classList.add("hidden"); this._updateMaxBtn(true); break;
      }
    }

    _updateMaxBtn(isMax) {
      this.els.btnMaximize.innerHTML = isMax ? ICONS.restore : ICONS.maximize;
      this.els.btnMaximize.title = isMax ? "Restore" : "Maximize";
    }

    // ── Session Lifecycle ───────────────────────────────────────────────
    startSession(lang, process) {
      this.selectedLanguage = lang;
      this.selectedProcess = process;
      this.conversationLog = [];
      this.stepIndex = 0;
      this.isActive = true;
      this.sessionStart = Date.now();

      const meta = LANG_META[lang] || LANG_META["Hindi"];
      this.els.headerLang.textContent = `${meta.flag} ${lang}`;
      this.els.headerLang.style.display = "";
      this.els.headerTimer.style.display = "";
      this.els.btnPanel.style.display = "";
      this.els.btnEndSession.style.display = "";
      this.els.regionalLabel.textContent = `${lang} Summary`;
      this.els.inputBar.style.display = "";
      this.els.inlineProcessStrip.style.display = "flex";
      this.els.inlineGuideTip.style.display = "flex";
      this.els.inlineChecklist.style.display = "flex";
      this.els.messages.innerHTML = "";

      this._addSystemMsg(`Session started · ${lang} · ${process}`);
      this._startTimer();
      this._updateProcessPanel();
      this._autoGreet();
      this._scrollChat();
    }

    _startTimer() {
      clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        const e = Math.floor((Date.now() - this.sessionStart) / 1000);
        this.els.timerDisplay.textContent =
          `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
      }, 1000);
    }

    resetSession() {
      clearInterval(this.timerInterval);
      this.isActive = false;
      this.conversationLog = [];
      this.stepIndex = 0;
      this.isRecording = false;
      this.staffRecording = false;

      this.els.headerLang.style.display = "none";
      this.els.headerTimer.style.display = "none";
      this.els.btnPanel.style.display = "none";
      this.els.btnEndSession.style.display = "none";
      this.els.inputBar.style.display = "none";
      this.els.statusText.textContent = "Ready";
      this.els.statusDot.className = "cw-status-dot";

      this.els.inlineProcessStrip.style.display = "none";
      this.els.inlineGuideTip.style.display = "none";
      this.els.inlineChecklist.style.display = "none";
      this.els.inlineProcessStrip.innerHTML = "";
      this.els.inlineGuideTip.innerHTML = "";
      this.els.inlineChecklist.innerHTML = "";

      this.els.messages.innerHTML = "";
      this.els.quickReplies.innerHTML = "";
      this.els.saveBanner.style.display = "none";
      this.els.saveRecordBtn.disabled = false;
      this.els.saveRecordBtn.textContent = "💾 Save to Records";
      this._closePanel();

      const empty = document.createElement("div");
      empty.className = "cw-empty";
      empty.id = "cwEmpty";
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-4l-4 4-4-4z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Select a language and process from the dashboard, then click <strong>Begin Conversation</strong> to start.</p>`;
      this.els.messages.appendChild(empty);
    }

    // ── Auto Greeting ───────────────────────────────────────────────────
    async _autoGreet() {
      const greetingMap = GREETINGS[this.selectedProcess] || GREETINGS["General enquiry"];
      const greetingText = greetingMap[this.selectedLanguage] || greetingMap["English"];

      this._showTyping();
      await this._delay(500);
      this._hideTyping();

      this._addStaffBubble(greetingText, greetingText, "auto", true);

      try {
        const form = new FormData();
        form.append("staff_text", greetingText);
        form.append("target_language", this.selectedLanguage);
        const res = await fetch(`${API_BASE}/staff-reply`, { method: "POST", body: form });
        const data = await res.json();
        if (data.audio_b64) this._playAudio(data.audio_b64);
        else speakWithBrowserSynthesis(greetingText, this.selectedLanguage);
      } catch (e) {
        speakWithBrowserSynthesis(greetingText, this.selectedLanguage);
      }

      this.conversationLog.push({ role: "staff", text: greetingText, translation: greetingText });
      this._showStaticQuickReplies();
    }

    // ── Customer Recording ──────────────────────────────────────────────
    async toggleCustomerRecording() {
      if (this.isRecording) this._stopCustomerRecording();
      else await this._startCustomerRecording();
    }

    async _startCustomerRecording() {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (err) {
        this._showToast(err.name === "NotAllowedError" ? "Microphone permission denied." : `Mic error: ${err.message}`, true);
        return;
      }
      try {
        const mime = getSupportedMimeType();
        this.mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
        this.audioChunks = [];
        this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
        this.mediaRecorder.onstop = () => this._processCustomerAudio();
        this.mediaRecorder.start(100);
        this.isRecording = true;

        this.els.customerMic.classList.add("recording");
        this._setStatus("recording", "Recording…");
        this._showRecordingIndicator();
        this.els.quickReplies.innerHTML = "";
      } catch (err) {
        this._showToast(`Recording setup failed: ${err.message}`, true);
        stream.getTracks().forEach(t => t.stop());
      }
    }

    _stopCustomerRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
      }
      this.isRecording = false;
      this.els.customerMic.classList.remove("recording");
      this._setStatus("processing", "Processing…");
      this._hideRecordingIndicator();
      this._showProcessingIndicator();
    }

    // Same flow as old conversation-desk.html processCustAudio(): transcribe,
    // show bubble, push to log, fetch smart replies. NO automatic step
    // advancement — steps only move via the manual Back/Next controls.
    async _processCustomerAudio() {
      try {
        const mime = getSupportedMimeType();
        const blob = new Blob(this.audioChunks, { type: mime || "audio/webm" });
        const wav = await convertToWav(blob);
        const form = new FormData();
        form.append("audio", wav, "customer.wav");
        form.append("language", this.selectedLanguage);
        form.append("process_type", this.selectedProcess);

        const res = await fetch(`${API_BASE}/customer-speak`, { method: "POST", body: form });
        const data = await res.json();
        this._hideProcessingIndicator();

        const cleanCustomerText = cleanModelText(data.customer_text);
        const cleanTranslation = cleanModelText(data.english_translation);

        if (data.success && cleanCustomerText) {
          this._addCustomerBubble(cleanCustomerText, cleanTranslation, data.stt_engine);
          this.conversationLog.push({ role: "customer", text: cleanCustomerText, translation: cleanTranslation });
          this._setStatus("done", "Transcribed");
          await this._fetchSmartQuickReplies();
        } else {
          this._showToast(data.error || "Could not transcribe. Try again.", true);
          this._setStatus("", "Ready");
          this._showStaticQuickReplies();
        }
      } catch (err) {
        this._hideProcessingIndicator();
        this._showToast("Backend error — is the server running?", true);
        this._setStatus("", "Ready");
        this._showStaticQuickReplies();
      }
    }

    // ── Staff Recording ──────────────────────────────────────────────────
    async toggleStaffRecording() {
      if (this.staffRecording) this._stopStaffRecording();
      else await this._startStaffRecording();
    }

    async _startStaffRecording() {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (err) {
        this._showToast(err.name === "NotAllowedError" ? "Microphone permission denied." : `Mic error: ${err.message}`, true);
        return;
      }
      try {
        const mime = getSupportedMimeType();
        this.staffRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
        this.staffChunks = [];
        this.staffRecorder.ondataavailable = e => { if (e.data.size > 0) this.staffChunks.push(e.data); };
        this.staffRecorder.onstop = () => this._processStaffAudio();
        this.staffRecorder.start(100);
        this.staffRecording = true;

        this.els.staffMic.classList.add("recording");
        this._setStatus("recording", "Recording staff…");
      } catch (err) {
        this._showToast(`Recording setup failed: ${err.message}`, true);
        stream.getTracks().forEach(t => t.stop());
      }
    }

    _stopStaffRecording() {
      if (this.staffRecorder && this.staffRecorder.state !== "inactive") {
        this.staffRecorder.stop();
        this.staffRecorder.stream.getTracks().forEach(t => t.stop());
      }
      this.staffRecording = false;
      this.els.staffMic.classList.remove("recording");
      this._setStatus("processing", "Processing…");
    }

    async _processStaffAudio() {
      try {
        const mime = getSupportedMimeType();
        const blob = new Blob(this.staffChunks, { type: mime || "audio/webm" });
        const wav = await convertToWav(blob);
        const form = new FormData();
        form.append("audio", wav, "staff.wav");

        const res = await fetch(`${API_BASE}/staff-speak`, { method: "POST", body: form });
        const data = await res.json();

        if (data.success && data.text) {
          this.els.textInput.value = cleanModelText(data.text);
          this.els.textInput.style.height = "auto";
          this.els.textInput.style.height = Math.min(this.els.textInput.scrollHeight, 100) + "px";
          this._setStatus("", "Ready");
          this.sendStaffReply();
        } else {
          this._showToast(data.error || "Could not transcribe staff audio. Try again.", true);
          this._setStatus("", "Ready");
        }
      } catch (err) {
        this._showToast("Backend error — is the server running?", true);
        this._setStatus("", "Ready");
      }
    }

    // ── Staff Reply (same as old sendStaff()) ────────────────────────────
    async sendStaffReply() {
      const text = this.els.textInput.value.trim();
      if (!text) return;
      this.els.sendBtn.disabled = true;
      this.els.sendBtn.classList.add("loading");
      this._showTyping();

      try {
        const form = new FormData();
        form.append("staff_text", text);
        form.append("target_language", this.selectedLanguage);
        const res = await fetch(`${API_BASE}/staff-reply`, { method: "POST", body: form });
        const data = await res.json();

        this._hideTyping();
        this.els.sendBtn.disabled = false;
        this.els.sendBtn.classList.remove("loading");

        if (data.success) {
          const cleanTranslated = cleanModelText(data.translated_text);
          this._addStaffBubble(text, cleanTranslated, data.tts_engine, false);
          if (data.audio_b64) this._playAudio(data.audio_b64);
          else speakWithBrowserSynthesis(cleanTranslated, this.selectedLanguage);
          this.conversationLog.push({ role: "staff", text, translation: cleanTranslated });
          this.els.textInput.value = "";
          this.els.textInput.style.height = "auto";
          this._setStatus("done", "Sent");
          setTimeout(() => this._setStatus("", "Ready"), 2000);
        } else {
          this._showToast(data.error || "Translation failed", true);
        }
      } catch (err) {
        this._hideTyping();
        this.els.sendBtn.disabled = false;
        this.els.sendBtn.classList.remove("loading");
        this._showToast("Backend error — is the server running?", true);
      }
    }

    // ── Step Management — MANUAL ONLY (old logic, no LLM auto-detect) ────
    _manualNextStep() {
      const steps = PROCESS_STEPS[this.selectedProcess] || [];
      const atEnd = this.stepIndex >= steps.length - 1;
      if (atEnd) { this.endSession(); return; }
      this.stepIndex++;
      this._updateProcessPanel();
      this._showStaticQuickReplies();
      this._showToast(`✓ Moved to: ${steps[this.stepIndex]}`);
    }

    _manualBackStep() {
      if (this.stepIndex <= 0) return;
      this.stepIndex--;
      const steps = PROCESS_STEPS[this.selectedProcess] || [];
      this._updateProcessPanel();
      this._showStaticQuickReplies();
      this._showToast(`← Back to: ${steps[this.stepIndex]}`);
    }

    // Same as old fetchSmartReplies() — falls back to static quick replies.
    async _fetchSmartQuickReplies() {
      try {
        const res = await fetch(`${API_BASE}/smart-replies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: this.conversationLog.slice(-6),
            process_type: this.selectedProcess,
            step_index: this.stepIndex,
            customer_language: this.selectedLanguage
          })
        });
        const data = await res.json();
        if (data.success && data.replies && data.replies.length > 0) {
          this._renderQuickReplies(data.replies.map(cleanModelText), "⚡ Smart replies");
          return;
        }
      } catch (e) { /* fall through to static */ }
      this._showStaticQuickReplies();
    }

    _showStaticQuickReplies() {
      const allReplies = STATIC_QUICK_REPLIES[this.selectedProcess] || STATIC_QUICK_REPLIES["General enquiry"];
      const stepReplies = allReplies[Math.min(this.stepIndex, allReplies.length - 1)] || [];
      if (stepReplies.length === 0) { this.els.quickReplies.innerHTML = ""; return; }
      this._renderQuickReplies(stepReplies, "⚡ Quick replies");
    }

    _renderQuickReplies(replies, label) {
      this.els.quickReplies.innerHTML = "";
      if (!replies || replies.length === 0) return;
      const lbl = document.createElement("div");
      lbl.className = "cw-qr-label";
      lbl.textContent = label;
      this.els.quickReplies.appendChild(lbl);
      replies.forEach(text => {
        const btn = document.createElement("button");
        btn.className = "cw-qr-btn";
        btn.textContent = text;
        btn.onclick = () => { this.els.textInput.value = text; this.sendStaffReply(); };
        this.els.quickReplies.appendChild(btn);
      });
    }

    // ── Lead extraction helpers (same logic as old extract-lead flow) ────
    _buildConversationText() {
      return this.conversationLog.map(t => {
        if (t.role === "customer") return t.translation || t.text || "";
        return t.text || t.translation || "";
      }).join(". ");
    }

    _clientSideExtractLead(fields) {
      const text = this._buildConversationText();
      const result = {};
      fields.forEach(f => {
        const patterns = FIELD_PATTERNS[f.key];
        if (!patterns) return;
        for (const re of patterns) {
          const m = text.match(re);
          if (m && m[1] && m[1].trim()) {
            let val = m[1].trim().replace(/\s{2,}/g, " ");
            if (f.key === "customer_name" || f.key === "nominee_name") val = titleCase(val);
            result[f.key] = val;
            break;
          }
        }
      });
      return result;
    }

    async fetchLeadForm() {
      const fields = LEAD_FORM_FIELDS[this.selectedProcess] || LEAD_FORM_FIELDS["General enquiry"];
      this.els.leadFormBody.innerHTML = `<div style="color:var(--slate-light);font-size:12px;">Extracting lead details…</div>`;

      let backendLead = {};
      let backendOk = false;
      try {
        const res = await fetch(`${API_BASE}/extract-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: this.conversationLog.map(t => ({ role: t.role, text: t.text, translation: t.translation })),
            process_type: this.selectedProcess,
            fields: fields.map(f => f.key),
          })
        });
        const data = await res.json();
        if (data.success && data.lead) { backendLead = data.lead; backendOk = true; }
      } catch (e) { /* fall back to client-side extraction */ }

      const fallbackLead = this._clientSideExtractLead(fields);
      const merged = {};
      this.lastLeadSources = {};
      fields.forEach(f => {
        const raw = backendLead[f.key];
        const bVal = (raw === undefined || raw === null) ? "" : String(raw).trim();
        if (bVal) { merged[f.key] = bVal; this.lastLeadSources[f.key] = "backend"; }
        else if (fallbackLead[f.key]) { merged[f.key] = fallbackLead[f.key]; this.lastLeadSources[f.key] = "fallback"; }
        else { merged[f.key] = ""; this.lastLeadSources[f.key] = ""; }
      });

      this._renderLeadForm(fields, merged);

      const filledCount = Object.values(merged).filter(v => v).length;
      if (filledCount === 0) this._showToast("Could not auto-extract — fill manually", true);
      else if (!backendOk) this._showToast(`Filled ${filledCount}/${fields.length} fields from conversation (backend unavailable)`);
      else this._showToast(`Filled ${filledCount}/${fields.length} fields`);
    }

    _renderLeadForm(fields, leadData) {
      this.els.leadFormBody.innerHTML = "";
      fields.forEach(f => {
        const raw = leadData[f.key];
        const value = (raw === undefined || raw === null) ? "" : cleanModelText(String(raw));
        const src = this.lastLeadSources[f.key];
        const row = document.createElement("div");
        row.innerHTML = `
          <label style="display:block;font-size:10.5px;color:var(--slate-light);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">
            ${escHtml(f.label)}${src === "fallback" ? '<span style="color:var(--success);font-weight:700;margin-left:6px;">auto from chat</span>' : ""}
          </label>
          <input type="text" data-field="${escHtml(f.key)}" value="${escHtml(value)}"
            style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12.5px;font-family:inherit;color:var(--navy);${value ? "border-color:rgba(22,163,74,0.45);background:rgba(22,163,74,0.05);" : ""}"
            placeholder="${value ? "" : "Not captured — enter manually"}" />`;
        this.els.leadFormBody.appendChild(row);
      });
    }

    async submitLead() {
      const inputs = this.els.leadFormBody.querySelectorAll("input[data-field]");
      if (!inputs.length) { this._showToast("No lead form to submit", true); return; }
      const lead = {};
      inputs.forEach(inp => { lead[inp.dataset.field] = inp.value.trim(); });

      this.els.submitLeadBtn.disabled = true;
      this.els.submitLeadBtn.textContent = "Sending…";

      try {
        const res = await fetch(`${API_BASE}/submit-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            process_type: this.selectedProcess,
            customer_language: this.selectedLanguage,
            lead,
            session_duration: this.els.timerDisplay.textContent || "",
          })
        });
        const data = await res.json();
        if (data.success) {
          this._showToast("Lead sent to bank ✓");
          this.els.submitLeadBtn.textContent = "Sent ✓";
        } else {
          this._showToast(data.error || "Submit failed", true);
          this.els.submitLeadBtn.disabled = false;
          this.els.submitLeadBtn.textContent = "Send to Bank";
        }
      } catch (e) {
        this._showToast("Network error sending lead", true);
        this.els.submitLeadBtn.disabled = false;
        this.els.submitLeadBtn.textContent = "Send to Bank";
      }
    }

    // ── End Session / Summary (same as old endSession()) ─────────────────
    async endSession() {
      if (this.conversationLog.length === 0) { this._showToast("No conversation yet", true); return; }
      clearInterval(this.timerInterval);
      this.els.summaryModal.classList.add("show");
      this.els.englishSummary.textContent = "Generating…";
      this.els.regionalSummary.textContent = "Translating…";
      this.els.summaryMeta.textContent =
        `${this.selectedLanguage} · ${this.selectedProcess} · ${this.els.timerDisplay.textContent}`;
      this.els.saveBanner.style.display = "none";
      this.els.saveRecordBtn.disabled = false;
      this.els.saveRecordBtn.textContent = "💾 Save to Records";
      this.els.submitLeadBtn.disabled = false;
      this.els.submitLeadBtn.textContent = "Send to Bank";

      this._fetchSummary();
      this.fetchLeadForm();
    }

    async _fetchSummary() {
      try {
        const res = await fetch(`${API_BASE}/summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: this.conversationLog.map(t => ({ role: t.role, text: t.text })),
            customer_language: this.selectedLanguage,
            process_type: this.selectedProcess
          })
        });
        const data = await res.json();
        if (data.success) {
          const cleanEnglish = cleanModelText(data.english_summary);
          const cleanRegional = cleanModelText(data.regional_summary);
          let engText = cleanEnglish;
          if (data.action_items && data.action_items.length > 0) {
            engText += "\n\nACTION ITEMS:\n" + data.action_items.map(a => `• ${cleanModelText(a)}`).join("\n");
          }
          this.els.englishSummary.textContent = engText;
          this.els.regionalSummary.textContent = cleanRegional;
        } else {
          this.els.englishSummary.textContent = "Error: " + (data.error || "Failed to generate summary.");
          this.els.regionalSummary.textContent = "Error: " + (data.error || "Failed to translate summary.");
        }
      } catch (e) {
        this.els.englishSummary.textContent = "Network error. Summary generation failed.";
        this.els.regionalSummary.textContent = "Network error. Translation failed.";
      }
    }

    closeSummary() {
      this.els.summaryModal.classList.remove("show");
      this._startTimer();
    }

    // Saves into the SAME localStorage key the rest of the dashboard reads
    // (dashboard.js → loadSessionHistory / loadOverviewStats / loadBilingualSummary)
    saveToRecords() {
      const duration = this.els.timerDisplay.textContent || "";
      try {
        const sessionRecord = {
          id: "session_" + Date.now(),
          timestamp: new Date().toISOString(),
          language: this.selectedLanguage,
          process: this.selectedProcess,
          duration: duration,
          englishSummary: this.els.englishSummary.textContent,
          regionalSummary: this.els.regionalSummary.textContent,
          conversationLog: this.conversationLog,
        };
        let sessions = [];
        try { sessions = JSON.parse(localStorage.getItem("va_sessions") || "[]"); } catch (e) { sessions = []; }
        sessions.unshift(sessionRecord);
        if (sessions.length > 50) sessions = sessions.slice(0, 50);
        localStorage.setItem("va_sessions", JSON.stringify(sessions));
      } catch (e) { console.warn("[saveToRecords] local history save failed:", e); }

      this.els.saveRecordBtn.textContent = "✓ Saved!";
      this.els.saveRecordBtn.disabled = true;
      this.els.saveBanner.style.display = "flex";
      this._showToast("Saved to records ✓");

      // Refresh dashboard overview if it's the same page context
      if (typeof window.loadOverviewStats === "function") window.loadOverviewStats();
    }

    newSession() {
      this.els.summaryModal.classList.remove("show");
      this.resetSession();
    }

    // ── Chat Bubble Rendering ───────────────────────────────────────────
    _addCustomerBubble(orig, trans, engine) {
      this._removeEmpty();
      const langMeta = LANG_META[this.selectedLanguage] || {};
      const msg = document.createElement("div");
      msg.className = "cw-msg customer";
      msg.innerHTML = `
        <div class="cw-msg-avatar">${langMeta.flag || "C"}</div>
        <div class="cw-msg-content">
          <div class="cw-msg-bubble">${escHtml(orig)}</div>
          ${trans ? `<div class="cw-msg-translation">🌐 ${escHtml(trans)}</div>` : ""}
          <div class="cw-msg-meta">
            <span>${formatTime()}</span>
            <span class="cw-msg-engine">${engine || "stt"}</span>
          </div>
        </div>`;
      this.els.messages.appendChild(msg);
      this._scrollChat();
    }

    _addStaffBubble(orig, trans, engine, isGreeting) {
      this._removeEmpty();
      const msg = document.createElement("div");
      msg.className = "cw-msg staff";
      const bubbleClass = isGreeting ? "cw-msg-bubble greeting" : "cw-msg-bubble";
      const greetingLabel = isGreeting ? `<span class="cw-msg-greeting-label">👋 Auto Greeting</span>` : "";
      msg.innerHTML = `
        <div class="cw-msg-avatar">RJ</div>
        <div class="cw-msg-content">
          <div class="${bubbleClass}">${greetingLabel}${escHtml(orig)}</div>
          ${trans && !isGreeting ? `<div class="cw-msg-translation">→ ${escHtml(trans)}</div>` : ""}
          <div class="cw-msg-meta">
            <span>${formatTime()}</span>
            <span class="cw-msg-engine">${engine || "llm"}</span>
            <span class="cw-msg-tick">✓✓</span>
          </div>
        </div>`;
      this.els.messages.appendChild(msg);
      this._scrollChat();
    }

    _addSystemMsg(text) {
      const el = document.createElement("div");
      el.className = "cw-system-msg";
      el.innerHTML = `<span>${escHtml(text)}</span>`;
      this.els.messages.appendChild(el);
    }

    // ── Typing / Recording / Processing indicators ───────────────────────
    _showTyping() {
      let typing = this.els.messages.querySelector(".cw-typing");
      if (!typing) {
        typing = document.createElement("div");
        typing.className = "cw-typing";
        typing.innerHTML = `
          <div class="cw-msg-avatar" style="background:var(--navy);color:var(--gold-light);width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;">RJ</div>
          <div class="cw-typing-dots"><span></span><span></span><span></span></div>`;
        this.els.messages.appendChild(typing);
      }
      typing.classList.add("show");
      this._scrollChat();
    }
    _hideTyping() { const t = this.els.messages.querySelector(".cw-typing"); if (t) t.remove(); }

    _showRecordingIndicator() {
      let rec = this.els.messages.querySelector(".cw-recording-indicator");
      if (!rec) {
        const langMeta = LANG_META[this.selectedLanguage] || {};
        rec = document.createElement("div");
        rec.className = "cw-recording-indicator";
        rec.innerHTML = `
          <div class="cw-msg-avatar" style="background:rgba(184,146,61,0.12);color:var(--gold);width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;">${langMeta.flag || "C"}</div>
          <div class="cw-recording-bubble">
            <span class="cw-recording-label">🎤 Recording…</span>
            <div class="cw-rec-wave"><span></span><span></span><span></span><span></span><span></span></div>
          </div>`;
        this.els.messages.appendChild(rec);
      }
      rec.classList.add("show");
      this._scrollChat();
    }
    _hideRecordingIndicator() { const r = this.els.messages.querySelector(".cw-recording-indicator"); if (r) r.remove(); }

    _showProcessingIndicator() {
      let proc = this.els.messages.querySelector(".cw-processing");
      if (!proc) {
        proc = document.createElement("div");
        proc.className = "cw-processing";
        proc.innerHTML = `<div class="cw-processing-bubble"><div class="cw-processing-dot"></div>Processing speech…</div>`;
        this.els.messages.appendChild(proc);
      }
      proc.classList.add("show");
      this._scrollChat();
    }
    _hideProcessingIndicator() { const p = this.els.messages.querySelector(".cw-processing"); if (p) p.remove(); }

    // ── Process Panel ───────────────────────────────────────────────────
    togglePanel() {
      this.panelOpen = !this.panelOpen;
      this.els.processPanel.classList.toggle("open", this.panelOpen);
    }
    _closePanel() { this.panelOpen = false; this.els.processPanel.classList.remove("open"); }

    _updateProcessPanel() {
      const steps = PROCESS_STEPS[this.selectedProcess] || [];
      const checklists = STEP_CHECKLISTS[this.selectedProcess] || [];
      const hints = GUIDE_HINTS[this.selectedProcess] || [];
      const kycDocs = KYC_CHECKLIST[this.selectedProcess];
      const currentHint = hints[Math.min(this.stepIndex, hints.length - 1)] || "";
      const currentChecklist = checklists[Math.min(this.stepIndex, checklists.length - 1)] || [];

      // Inline process strip
      let inlineStepsHtml = "";
      steps.forEach((step, i) => {
        let cls = "cw-inline-step";
        if (i < this.stepIndex) cls += " done";
        else if (i === this.stepIndex) cls += " active";
        const numContent = i < this.stepIndex ? "✓" : (i + 1);
        inlineStepsHtml += `<div class="${cls}"><div class="cw-inline-step-num">${numContent}</div><span>${escHtml(step)}</span></div>`;
      });
      this.els.inlineProcessStrip.innerHTML = inlineStepsHtml;

      if (currentHint) {
        this.els.inlineGuideTip.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 12v4M12 8h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>${escHtml(currentHint)}</span>`;
        this.els.inlineGuideTip.style.display = "flex";
      } else {
        this.els.inlineGuideTip.style.display = "none";
      }

      if (currentChecklist.length > 0) {
        let checklistHtml = `<div class="cw-checklist-header">Checklist — ${escHtml(steps[this.stepIndex] || "")}</div><div class="cw-checklist-grid">`;
        currentChecklist.forEach((item, idx) => {
          const checkId = `cw-inline-chk-${this.stepIndex}-${idx}`;
          checklistHtml += `<label class="cw-inline-chk-item" for="${checkId}"><input type="checkbox" id="${checkId}" /><span>${escHtml(item)}</span></label>`;
        });
        checklistHtml += `</div>`;
        this.els.inlineChecklist.innerHTML = checklistHtml;
        this.els.inlineChecklist.style.display = "flex";
      } else {
        this.els.inlineChecklist.innerHTML = "";
        this.els.inlineChecklist.style.display = "none";
      }

      // Sidebar panel
      let html = `<div class="cw-step-indicator">
        <div class="step-badge">${this.stepIndex + 1}</div>
        <span>${steps[this.stepIndex] || "—"}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--slate-light);font-weight:400;">Step ${this.stepIndex + 1} of ${steps.length}</span>
      </div>`;

      if (currentHint) html += `<div class="cw-guide-hint">${escHtml(currentHint)}</div>`;

      html += `<div class="cw-steps-list">`;
      steps.forEach((step, i) => {
        let cls = "cw-step-item";
        if (i < this.stepIndex) cls += " done";
        else if (i === this.stepIndex) cls += " active";
        const numContent = i < this.stepIndex ? "✓" : (i + 1);
        html += `<div class="${cls}"><div class="cw-step-num">${numContent}</div><span>${escHtml(step)}</span></div>`;
      });
      html += `</div>`;

      if (currentChecklist.length > 0) {
        html += `<div class="cw-checklist-section"><div class="cw-checklist-title">Checklist — ${steps[this.stepIndex] || ""}</div>`;
        currentChecklist.forEach((item, idx) => {
          const checkId = `cw-chk-${this.stepIndex}-${idx}`;
          html += `<label class="cw-checklist-item" for="${checkId}"><input type="checkbox" id="${checkId}" /><span>${escHtml(item)}</span></label>`;
        });
        html += `</div>`;
      }

      if (kycDocs && this.stepIndex >= 2) {
        html += `<div class="cw-kyc-section"><div class="cw-checklist-title">📋 Required Documents</div>`;
        kycDocs.forEach(doc => { html += `<div class="cw-kyc-item">✅ ${escHtml(doc)}</div>`; });
        html += `</div>`;
      }

      html += `<div class="cw-step-controls">
        <button class="cw-step-btn back" id="cwStepBack">← Back</button>
        <button class="cw-step-btn next" id="cwStepNext">${this.stepIndex >= steps.length - 1 ? "Finish & Summarise ✓" : "Next ✓"}</button>
      </div>`;

      this.els.panelBody.innerHTML = html;

      // Sync inline checklist ↔ sidebar checklist
      if (currentChecklist.length > 0) {
        currentChecklist.forEach((item, idx) => {
          const inlineChk = this.els.inlineChecklist.querySelector(`#cw-inline-chk-${this.stepIndex}-${idx}`);
          const sidebarChk = this.els.panelBody.querySelector(`#cw-chk-${this.stepIndex}-${idx}`);
          if (inlineChk && sidebarChk) {
            inlineChk.addEventListener("change", (e) => {
              sidebarChk.checked = e.target.checked;
              inlineChk.parentElement.classList.toggle("checked", e.target.checked);
              sidebarChk.parentElement.classList.toggle("checked", e.target.checked);
            });
            sidebarChk.addEventListener("change", (e) => {
              inlineChk.checked = e.target.checked;
              inlineChk.parentElement.classList.toggle("checked", e.target.checked);
              sidebarChk.parentElement.classList.toggle("checked", e.target.checked);
            });
          }
        });
      }

      const backBtn = this.els.panelBody.querySelector("#cwStepBack");
      const nextBtn = this.els.panelBody.querySelector("#cwStepNext");
      if (backBtn) backBtn.addEventListener("click", () => this._manualBackStep());
      if (nextBtn) nextBtn.addEventListener("click", () => this._manualNextStep());
    }

    // ── Audio / Status / Toast / Helpers ──────────────────────────────────
    _playAudio(b64) {
      const p = document.getElementById("cwAudioPlayer");
      p.src = `data:audio/wav;base64,${b64}`;
      p.play().catch(() => { p.src = `data:audio/mpeg;base64,${b64}`; p.play().catch(() => { }); });
    }

    _setStatus(state, text) {
      this.els.statusDot.className = "cw-status-dot" + (state ? " " + state : "");
      this.els.statusText.textContent = text;
    }

    _showToast(msg, isError = false) {
      this.els.toastText.textContent = msg;
      this.els.toast.className = "cw-toast show" + (isError ? " error" : "");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => this.els.toast.classList.remove("show"), 3000);
    }

    _removeEmpty() { const empty = this.els.messages.querySelector(".cw-empty"); if (empty) empty.remove(); }
    _scrollChat() { requestAnimationFrame(() => { this.els.messages.scrollTop = this.els.messages.scrollHeight; }); }
    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  }

  // ════════════════════════════════════════════════════════════════════════
  window.chatWidget = new ChatWidget();

})();