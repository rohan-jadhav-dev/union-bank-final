// ============================================================================
// chat-widget.js — Floating Conversation Widget for VoiceAssist AI Dashboard
// Reuses all business logic from conversation-desk.js, adapted for widget DOM
//
// UPDATED IN THIS VERSION:
//   1. cleanTranslationText() now strips <think>...</think> reasoning
//      blocks (and the "→ <think>" pattern seen when the model's raw
//      chain-of-thought leaks into the response) BEFORE any JSON
//      unwrapping, so only the clean translation ever reaches the DOM.
//   2. Both _addCustomerBubble() and _addStaffBubble() now run the
//      ORIGINAL text through the same cleaner too (previously only the
//      translation was cleaned), and the translation line renders in a
//      larger, more legible font.
//   3. saveToRecords() no longer opens the in-widget lead popup. It now
//      stores the conversation/process/language/duration in
//      sessionStorage (the same keys lead-form.html already expects)
//      and redirects straight to lead-form.html, which auto-extracts
//      and auto-fills the lead form — and ALWAYS opens/renders that form
//      even when extraction is incomplete or fields are missing.
//   4. DPDP Act, 2023 consent gate. When "Begin conversation" opens
//      the widget, the session no longer starts immediately. A consent
//      popup is shown first, in the customer's selected language, stating
//      that the conversation will be processed/translated by AI and
//      stored in bank records. If the customer agrees, the session
//      proceeds exactly as before (auto-greeting, etc). If they decline,
//      the widget closes and no conversation/log is started. The consent
//      decision (yes/no + language + process + timestamp) is recorded in
//      sessionStorage as "va_consent_record" and is also attached to the
//      lead handoff payload in saveToRecords() for audit purposes.
//      NOTE: consent notice text below is a functional placeholder — have
//      it reviewed/finalised by legal/compliance before production use.
//   5. NEW — Consent notice is now READ ALOUD to the customer in their
//      selected language as soon as the popup appears (many customers
//      can't read, only understand spoken language). A "🔊 Listen again"
//      button lets them replay it. Speech is stopped automatically the
//      moment they tap Yes/No/Close so it never talks over the greeting.
// ============================================================================

(function () {
  "use strict";

  // ── Constants (same as conversation-desk.js) ────────────────────────────
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

  // ── DPDP Act, 2023 consent notice text (per language) ──────────────────
  // NOTE: functional placeholder copy — have legal/compliance finalise the
  // exact wording, retention period, and grievance-officer contact before
  // this goes to production. Kept short & plain-language per Section 6
  // "clear affirmative action" requirement.
  const CONSENT_TEXT = {
    Hindi: {
      title: "सहमति आवश्यक है",
      body: "डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम (DPDP Act), 2023 के अनुसार सूचित किया जाता है कि आपकी यह बातचीत AI द्वारा अनुवादित की जाएगी और Union Bank of India के रिकॉर्ड में सुरक्षित रखी जाएगी, ताकि आपकी सेवा से जुड़ी प्रक्रिया पूरी की जा सके। क्या आप इसके लिए सहमत हैं?",
      agree: "हाँ, मैं सहमत हूँ",
      decline: "नहीं",
      listen: "🔊 फिर से सुनें",
    },
    Marathi: {
      title: "संमती आवश्यक आहे",
      body: "डिजिटल वैयक्तिक डेटा संरक्षण कायदा (DPDP Act), 2023 नुसार कळवण्यात येते की तुमचे हे संभाषण AI द्वारे भाषांतरित केले जाईल आणि Union Bank of India च्या नोंदींमध्ये सुरक्षित ठेवले जाईल, जेणेकरून तुमची सेवा प्रक्रिया पूर्ण करता येईल. तुम्ही यास सहमत आहात का?",
      agree: "होय, मी सहमत आहे",
      decline: "नाही",
      listen: "🔊 पुन्हा ऐका",
    },
    Tamil: {
      title: "ஒப்புதல் தேவை",
      body: "டிஜிட்டல் தனிநபர் தரவு பாதுகாப்புச் சட்டம் (DPDP Act), 2023-ன் படி, உங்கள் இந்த உரையாடல் AI மூலம் மொழிபெயர்க்கப்பட்டு Union Bank of India-வின் பதிவுகளில் சேமிக்கப்படும் என்பதை அறிவிக்கிறோம். இதற்கு நீங்கள் ஒப்புக்கொள்கிறீர்களா?",
      agree: "ஆம், ஒப்புக்கொள்கிறேன்",
      decline: "இல்லை",
      listen: "🔊 மீண்டும் கேளுங்கள்",
    },
    Telugu: {
      title: "అనుమతి అవసరం",
      body: "డిజిటల్ పర్సనల్ డేటా ప్రొటెక్షన్ చట్టం (DPDP Act), 2023 ప్రకారం తెలియజేయడమైనది — మీ ఈ సంభాషణ AI ద్వారా అనువదించబడి Union Bank of India రికార్డులలో భద్రపరచబడుతుంది. దీనికి మీరు అంగీకరిస్తున్నారా?",
      agree: "అవును, అంగీకరిస్తున్నాను",
      decline: "వద్దు",
      listen: "🔊 మళ్ళీ వినండి",
    },
    English: {
      title: "Consent required",
      body: "As per the Digital Personal Data Protection Act (DPDP Act), 2023, this conversation will be processed and translated by AI, and stored in Union Bank of India's records to complete your requested service. Do you agree to this?",
      agree: "Yes, I agree",
      decline: "No",
      listen: "🔊 Listen again",
    },
  };

  // ── Utility functions ───────────────────────────────────────────────────
  function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function formatTime() { return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); }

  // ── cleanTranslationText ────────────────────────────────────────────────
  // UPDATED: strips <think>...</think> reasoning blocks (closed OR
  // unterminated) and the "→ <think>" leak pattern FIRST, before any
  // JSON unwrapping — this is what was showing up as huge raw reasoning
  // dumps inside the chat bubbles instead of a clean translation.
  function cleanTranslationText(text) {
    if (!text) return "";
    text = String(text).trim();

    // 1) Strip fully-closed <think>...</think> blocks (any casing, multiline)
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
    // 2) Strip an unterminated <think> block that runs to the end of the string
    text = text.replace(/<think>[\s\S]*$/gi, "");
    // 3) Strip the "→ <think>" leak pattern seen when the arrow marker precedes it
    text = text.replace(/→\s*<think>[\s\S]*/gi, "");
    // 4) Strip any other stray <think>/</think> tags that survived
    text = text.replace(/<\/?think>/gi, "");
    text = text.trim();

    if (text.includes("{") && text.includes("}")) {
      try {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        const jsonStr = text.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed.english_translation) return parsed.english_translation;
        if (parsed.translation) return parsed.translation;
      } catch (e) {
        const match = text.match(/"english_translation"\s*:\s*"([^"]+)"/);
        if (match && match[1]) return match[1];
        const match2 = text.match(/"translation"\s*:\s*"([^"]+)"/);
        if (match2 && match2[1]) return match2[1];
      }
    }
    text = text.replace(/^Here is the response:\s*/i, "");
    text = text.replace(/^"""|"""$/g, "");
    text = text.replace(/^"|"$/g, "");
    return text.trim();
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
    chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    speaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5L6 9H3v6h3l5 4V5z" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" stroke-linecap="round"/></svg>`,
  };

  // ════════════════════════════════════════════════════════════════════════
  // ChatWidget Class
  // ════════════════════════════════════════════════════════════════════════
  class ChatWidget {
    constructor() {
      // State
      this.state = "closed"; // closed | minimized | normal | maximized
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
      this.kycShown = false;
      this.panelOpen = false;
      this.isActive = false; // true when a session is running

      // DPDP consent state
      this._pendingSessionLang = null;
      this._pendingSessionProcess = null;
      this._consentRecord = null;

      // Build DOM
      this._buildDOM();
      this._bindEvents();
    }

    // ── DOM Construction ────────────────────────────────────────────────
    _buildDOM() {
      // Floating Bubble
      this.bubble = document.createElement("button");
      this.bubble.className = "cw-bubble";
      this.bubble.setAttribute("aria-label", "Open Conversation Desk");
      this.bubble.innerHTML = `${ICONS.chat}<span class="cw-bubble-label">Conversation Desk</span><span class="cw-bubble-badge" id="cwBadge"></span>`;
      document.body.appendChild(this.bubble);

      // Widget Window
      this.window = document.createElement("div");
      this.window.className = "cw-window closed";
      this.window.innerHTML = this._windowHTML();
      document.body.appendChild(this.window);

      // Audio player
      if (!document.getElementById("cwAudioPlayer")) {
        const audio = document.createElement("audio");
        audio.id = "cwAudioPlayer";
        document.body.appendChild(audio);
      }

      // Cache DOM refs
      this._cacheRefs();

      // Inject a font-size boost stylesheet so all widget text renders
      // larger/more readable, overriding whatever base sizes the external
      // stylesheet sets.
      this._injectFontBoost();
    }

    // ── Readability: bump up font sizes across the whole widget ─────────
    _injectFontBoost() {
      if (document.getElementById("cwFontBoost")) return;
      const style = document.createElement("style");
      style.id = "cwFontBoost";
      style.textContent = `
        .cw-msg-bubble { font-size: 16px !important; line-height: 1.55 !important; }
        .cw-msg-translation { font-size: 18px !important; line-height: 1.55 !important; }
        .cw-msg-meta { font-size: 12px !important; }
        .cw-system-msg { font-size: 13px !important; }
        .cw-qr-btn { font-size: 14px !important; padding: 8px 12px !important; }
        .cw-qr-label { font-size: 13px !important; }
        .cw-text-input { font-size: 15px !important; }
        .cw-checklist-item span, .cw-inline-chk-item span { font-size: 14px !important; }
        .cw-checklist-title, .cw-checklist-header { font-size: 13.5px !important; }
        .cw-step-item span, .cw-inline-step span { font-size: 14px !important; }
        .cw-guide-hint, .cw-inline-guide-tip span { font-size: 14px !important; line-height: 1.5 !important; }
        .cw-kyc-item { font-size: 13.5px !important; }
        .cw-header-title { font-size: 16px !important; }
        .cw-status-text, .cw-header-lang, .cw-header-timer { font-size: 13px !important; }
        .cw-toast { font-size: 14px !important; }
        .cw-info-badge, .cw-suggestion-badge { font-size: 13px !important; }
        .cw-empty p { font-size: 14px !important; }
        .cw-translation-missing { font-size: 15px !important; line-height: 1.5 !important; color: #B91C1C !important; font-style: italic; margin-top: 4px; }
        .cw-consent-listen-btn {
          display: inline-flex; align-items: center; gap: 6px;
          margin: 4px auto 14px; padding: 6px 14px;
          border-radius: 99px; border: 1px solid rgba(184,146,61,0.35);
          background: rgba(184,146,61,0.08); color: var(--navy);
          font-size: 13px !important; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: background 150ms ease;
        }
        .cw-consent-listen-btn:hover { background: rgba(184,146,61,0.18); }
        .cw-consent-listen-btn svg { width: 15px; height: 15px; }
        .cw-consent-listen-btn.speaking { background: rgba(184,146,61,0.28); }
        .cw-consent-english-label {
          font-size: 10px !important; font-weight: 700; letter-spacing: 0.08em;
          color: var(--slate-light); text-align: center; margin-top: 2px;
        }
      `;
      document.head.appendChild(style);
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
          <!-- CHAT AREA -->
          <div class="cw-chat-area">
            <!-- INLINE PROCESS STRIP & HINT (Always Visible) -->
            <div class="cw-inline-process-strip" id="cwInlineProcessStrip" style="display:none"></div>
            <div class="cw-inline-guide-tip" id="cwInlineGuideTip" style="display:none"></div>

            <!-- MESSAGES -->
            <div class="cw-messages" id="cwMessages">
              <div class="cw-empty" id="cwEmpty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                  <path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-4l-4 4-4-4z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <p>Select a language and process from the dashboard, then click <strong>Begin Conversation</strong> to start.</p>
              </div>
            </div>

            <!-- INLINE CHECKLIST -->
            <div class="cw-inline-checklist" id="cwInlineChecklist" style="display:none"></div>

            <!-- QUICK REPLIES -->
            <div class="cw-quick-replies" id="cwQuickReplies"></div>

            <!-- INPUT BAR -->
            <div class="cw-input-bar" id="cwInputBar" style="display:none">
              <button class="cw-mic-btn" id="cwCustomerMic" title="Record customer speech (regional)" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: auto; padding: 4px 6px;">
                ${ICONS.mic}
                <span style="font-size: 7.5px; font-weight: 700; margin-top: -1px; text-transform: uppercase;">CUST</span>
              </button>
              <textarea class="cw-text-input" id="cwTextInput" placeholder="Type reply in English…" rows="1"></textarea>
              <button class="cw-mic-btn staff-mic" id="cwStaffMic" title="Record staff speech (English)" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: auto; padding: 4px 6px; background: rgba(74, 157, 110, 0.1); color: var(--success); border: 1px solid rgba(74, 157, 110, 0.2); margin-right: 8px;">
                ${ICONS.mic}
                <span style="font-size: 7.5px; font-weight: 700; margin-top: -1px; text-transform: uppercase;">STAFF</span>
              </button>
              <button class="cw-send-btn" id="cwSendBtn" title="Send & Translate">
                ${ICONS.send}
                <div class="cw-send-spinner"></div>
              </button>
            </div>
          </div>

          <!-- PROCESS PANEL -->
          <div class="cw-process-panel" id="cwProcessPanel">
            <div class="cw-panel-header">
              <span class="cw-panel-title">Process Guide</span>
              <button class="cw-panel-close" id="cwPanelClose">${ICONS.close}</button>
            </div>
            <div class="cw-panel-body" id="cwPanelBody"></div>
          </div>
        </div>

        <!-- DPDP CONSENT MODAL — shown before every session starts -->
        <div class="cw-modal-overlay cw-consent-overlay" id="cwConsentModal">
          <div class="cw-modal cw-consent-modal">
            <button class="cw-consent-close" id="cwConsentCloseBtn" title="Decline & close" aria-label="Decline & close">${ICONS.close}</button>
            <div class="cw-consent-icon">${ICONS.shield}</div>
            <div class="cw-modal-title" id="cwConsentTitle">Consent required</div>
            <div class="cw-consent-native" id="cwConsentNative"></div>
            <button class="cw-consent-listen-btn" id="cwConsentListenBtn" type="button">
              ${ICONS.speaker}<span id="cwConsentListenLabel">Listen again</span>
            </button>
            <div class="cw-consent-english-label">ENGLISH</div>
            <div class="cw-consent-english" id="cwConsentEnglish"></div>
            <div class="cw-modal-actions cw-consent-actions">
              <button class="cw-modal-btn decline" id="cwConsentDeclineBtn">No</button>
              <button class="cw-modal-btn agree" id="cwConsentAgreeBtn">Yes, I agree</button>
            </div>
          </div>
        </div>

        <!-- TOAST -->
        <div class="cw-toast" id="cwToast"><span id="cwToastText"></span></div>

        <!-- SUMMARY MODAL -->
        <div class="cw-modal-overlay" id="cwSummaryModal">
          <div class="cw-modal">
            <div class="cw-modal-title">Session Summary</div>
            <div class="cw-modal-subtitle" id="cwSummaryMeta">Loading…</div>
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
            <div class="cw-modal-actions">
              <button class="cw-modal-btn primary" id="cwSaveRecordBtn">Save to Records</button>
              <button class="cw-modal-btn ghost" id="cwCloseSummaryBtn">Close</button>
              <button class="cw-modal-btn ghost" id="cwNewSessionBtn">New Session</button>
            </div>
          </div>
        </div>

        <!-- LEAD CONFIRMATION POPUP (legacy — kept for backwards compat but
             no longer opened by saveToRecords(); saveToRecords() now
             redirects to lead-form.html directly, see below) -->
        <div class="cw-modal-overlay" id="cwLeadPopup" style="display:none; align-items:center; justify-content:center; position:absolute; inset:0; background:rgba(15,30,61,0.55); z-index:20;">
          <div class="cw-modal" style="width: 300px; padding: 20px; border-radius: 12px; background: white; box-shadow: 0 8px 32px rgba(15,30,61,0.25); display: flex; flex-direction: column; gap: 12px;">
            <div class="cw-modal-title" style="font-size: 15px; font-weight: 700; color: var(--navy); margin-bottom: 2px;">Send to Bank Lead?</div>
            <div style="font-size: 11px; color: var(--slate-light); line-height: 1.4; margin-bottom: 4px;">Would you like to send this session to Lead Generation or skip?</div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 9px; font-weight: 700; color: var(--slate-light); text-transform: uppercase; letter-spacing: 0.05em;">Customer Name</label>
                <input type="text" id="cwLeadPopName" style="width:100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-family: inherit;" />
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 9px; font-weight: 700; color: var(--slate-light); text-transform: uppercase; letter-spacing: 0.05em;">Mobile Number</label>
                <input type="text" id="cwLeadPopPhone" style="width:100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-family: inherit;" />
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 9px; font-weight: 700; color: var(--slate-light); text-transform: uppercase; letter-spacing: 0.05em;">Product / Process</label>
                <select id="cwLeadPopProduct" style="width:100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-family: inherit; background: white; -webkit-appearance: select;">
                  <option value="saving">saving</option>
                  <option value="Account opening">Account opening</option>
                  <option value="Loan enquiry">Loan enquiry</option>
                  <option value="Credit card apply">Credit card apply</option>
                  <option value="Balance enquiry">Balance enquiry</option>
                </select>
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 9px; font-weight: 700; color: var(--slate-light); text-transform: uppercase; letter-spacing: 0.05em;">Lead Rating</label>
                <select id="cwLeadPopRating" style="width:100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-family: inherit; background: white; -webkit-appearance: select;">
                  <option value="Hot lead">Hot lead</option>
                  <option value="Warm lead">Warm lead</option>
                </select>
              </div>
            </div>

            <div class="cw-modal-actions" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">
              <button class="cw-modal-btn ghost" id="cwLeadPopSkipBtn" style="padding: 6px 12px; font-size: 12px; height: auto;">Skip</button>
              <button class="cw-modal-btn primary" id="cwLeadPopSendBtn" style="padding: 6px 12px; font-size: 12px; height: auto; background: var(--blue);">Send</button>
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
        header: this.window.querySelector(".cw-header"),
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
        saveRecordBtn: this.window.querySelector("#cwSaveRecordBtn"),
        closeSummaryBtn: this.window.querySelector("#cwCloseSummaryBtn"),
        newSessionBtn: this.window.querySelector("#cwNewSessionBtn"),
        inlineProcessStrip: this.window.querySelector("#cwInlineProcessStrip"),
        inlineGuideTip: this.window.querySelector("#cwInlineGuideTip"),
        inlineChecklist: this.window.querySelector("#cwInlineChecklist"),
        staffMic: this.window.querySelector("#cwStaffMic"),
        leadPopup: this.window.querySelector("#cwLeadPopup"),
        leadPopName: this.window.querySelector("#cwLeadPopName"),
        leadPopPhone: this.window.querySelector("#cwLeadPopPhone"),
        leadPopProduct: this.window.querySelector("#cwLeadPopProduct"),
        leadPopRating: this.window.querySelector("#cwLeadPopRating"),
        leadPopSendBtn: this.window.querySelector("#cwLeadPopSendBtn"),
        leadPopSkipBtn: this.window.querySelector("#cwLeadPopSkipBtn"),
        // Consent modal refs
        consentModal: this.window.querySelector("#cwConsentModal"),
        consentTitle: this.window.querySelector("#cwConsentTitle"),
        consentNative: this.window.querySelector("#cwConsentNative"),
        consentEnglish: this.window.querySelector("#cwConsentEnglish"),
        consentAgreeBtn: this.window.querySelector("#cwConsentAgreeBtn"),
        consentDeclineBtn: this.window.querySelector("#cwConsentDeclineBtn"),
        consentCloseBtn: this.window.querySelector("#cwConsentCloseBtn"),
        consentListenBtn: this.window.querySelector("#cwConsentListenBtn"),
        consentListenLabel: this.window.querySelector("#cwConsentListenLabel"),
      };
    }

    // ── Event Binding ───────────────────────────────────────────────────
    _bindEvents() {
      this.bubble.addEventListener("click", () => this.toggle());
      this.els.btnMinimize.addEventListener("click", () => this.minimize());
      this.els.btnMaximize.addEventListener("click", () => this.toggleMaximize());
      this.els.btnClose.addEventListener("click", () => this.close());
      this.els.header.addEventListener("click", (e) => {
        if (this.state === "minimized" && !e.target.closest(".cw-hdr-btn")) {
          this.setState("normal");
        }
      });
      this.els.btnPanel.addEventListener("click", () => this.togglePanel());
      this.els.panelClose.addEventListener("click", () => this.togglePanel());
      this.els.btnEndSession.addEventListener("click", () => this.endSession());
      this.els.customerMic.addEventListener("click", () => this.toggleCustomerRecording());
      this.els.staffMic.addEventListener("click", () => this.toggleStaffRecording());
      this.els.sendBtn.addEventListener("click", () => this.sendStaffReply());
      this.els.saveRecordBtn.addEventListener("click", () => this.saveToRecords());
      this.els.closeSummaryBtn.addEventListener("click", () => this.closeSummary());
      this.els.newSessionBtn.addEventListener("click", () => this.newSession());
      this.els.leadPopSendBtn.addEventListener("click", () => this.submitLeadFromPop());
      this.els.leadPopSkipBtn.addEventListener("click", () => this.skipLeadFromPop());

      // DPDP consent controls
      this.els.consentAgreeBtn.addEventListener("click", () => this._handleConsentAgree());
      this.els.consentDeclineBtn.addEventListener("click", () => this._handleConsentDecline());
      this.els.consentCloseBtn.addEventListener("click", () => this._handleConsentDecline());
      this.els.consentListenBtn.addEventListener("click", () => this._replayConsentNotice());

      // Text input
      this.els.textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendStaffReply(); }
      });
      this.els.textInput.addEventListener("input", () => {
        this.els.textInput.style.height = "auto";
        this.els.textInput.style.height = Math.min(this.els.textInput.scrollHeight, 100) + "px";
      });

      // ESC to restore from maximized
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.state === "maximized") {
          this.setState("normal");
        }
      });
    }

    // ── Window State Management ─────────────────────────────────────────
    toggle() {
      if (this.state === "closed" || this.state === "minimized") this.open();
      else this.close();
    }

    open(lang, process) {
      if (lang && process) {
        this.startSession(lang, process);
      }
      this.setState("normal");
    }

    minimize() {
      if (this.state === "minimized") {
        this.setState("normal");
      } else {
        this.setState("minimized");
      }
    }

    close() {
      this.setState("closed");
    }

    toggleMaximize() {
      if (this.state === "maximized") this.setState("normal");
      else this.setState("maximized");
    }

    setState(newState) {
      this.state = newState;
      this.window.classList.remove("closed", "open", "maximized", "minimized");

      switch (newState) {
        case "closed":
          this.window.classList.add("closed");
          break;
        case "minimized":
          this.window.classList.add("minimized");
          this._updateMaxBtn(false);
          break;
        case "normal":
          this.window.classList.add("open");
          this._updateMaxBtn(false);
          break;
        case "maximized":
          this.window.classList.add("open", "maximized");
          this._updateMaxBtn(true);
          break;
      }
    }

    _updateMaxBtn(isMax) {
      this.els.btnMaximize.innerHTML = isMax ? ICONS.restore : ICONS.maximize;
      this.els.btnMaximize.title = isMax ? "Restore" : "Maximize";
    }

    // ── DPDP Consent Gate ────────────────────────────────────────────────
    // Called first, in place of the old immediate session start. Stores the
    // requested lang/process, then shows the consent popup rendered in the
    // customer's language (with an English line underneath for staff
    // reference). Nothing about the session (log, timer, greeting) starts
    // until the customer explicitly agrees.
    //
    // UPDATED: the native-language notice is now also SPOKEN aloud as soon
    // as the popup appears, because many customers understand spoken
    // language far better than reading dense legal text. A "Listen again"
    // button lets them replay it as many times as needed before deciding.
    _showConsentPopup(lang, process) {
      this._pendingSessionLang = lang;
      this._pendingSessionProcess = process;

      const consent = CONSENT_TEXT[lang] || CONSENT_TEXT["English"];
      const consentEn = CONSENT_TEXT["English"];

      this.els.consentTitle.textContent = consent.title;
      // Native-language statement is what the customer sees first and what
      // gets spoken aloud. "DPDP Act" itself is intentionally left
      // untranslated inside the native sentence (it's a proper/legal term),
      // everything else is fully in the customer's identified language.
      this.els.consentNative.textContent = consent.body;
      // English line is COMPULSORY and always shown — per DPDP Act
      // disclosure requirements the English wording must be visible
      // alongside the native-language version regardless of which
      // language the customer speaks (even when that language is English,
      // so staff always have the reference text on screen too).
      this.els.consentEnglish.textContent = consentEn.body;
      this.els.consentEnglish.style.display = "block";
      this.els.consentAgreeBtn.textContent = consent.agree;
      this.els.consentDeclineBtn.textContent = consent.decline;
      this.els.consentListenLabel.textContent = (consent.listen || "🔊 Listen again").replace(/^🔊\s*/, "");

      this.els.consentModal.classList.add("show");

      // Store the current native text/lang so the replay button always
      // speaks exactly what's on screen, then read it out immediately.
      this._consentSpeechText = consent.body;
      this._consentSpeechLang = lang;
      this._speakConsentNotice();
    }

    // Speaks the currently-displayed consent notice in the customer's
    // language. Cancels any speech already in progress first so replays
    // don't stack. Toggles a "speaking" visual state on the listen button.
    async _speakConsentNotice() {
      if (!this._consentSpeechText) return;
      try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) {}
      this.els.consentListenBtn.classList.add("speaking");
      await speakWithBrowserSynthesis(this._consentSpeechText, this._consentSpeechLang);
      this.els.consentListenBtn.classList.remove("speaking");
    }

    _replayConsentNotice() {
      this._speakConsentNotice();
    }

    // Stops any consent narration in progress — called the instant the
    // customer taps Yes / No / Close so speech never talks over the
    // greeting or lingers after the popup is gone.
    _stopConsentSpeech() {
      try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) {}
      if (this.els.consentListenBtn) this.els.consentListenBtn.classList.remove("speaking");
    }

    _handleConsentAgree() {
      this._stopConsentSpeech();
      this.els.consentModal.classList.remove("show");
      const lang = this._pendingSessionLang;
      const process = this._pendingSessionProcess;

      this._consentRecord = {
        given: true,
        language: lang,
        process: process,
        timestamp: new Date().toISOString(),
      };
      try {
        sessionStorage.setItem("va_consent_record", JSON.stringify(this._consentRecord));
      } catch (e) {
        console.warn("[ChatWidget] could not persist consent record:", e);
      }

      this._beginSessionAfterConsent(lang, process);
    }

    _handleConsentDecline() {
      this._stopConsentSpeech();
      this.els.consentModal.classList.remove("show");

      this._consentRecord = {
        given: false,
        language: this._pendingSessionLang,
        process: this._pendingSessionProcess,
        timestamp: new Date().toISOString(),
      };
      try {
        sessionStorage.setItem("va_consent_record", JSON.stringify(this._consentRecord));
      } catch (e) {
        console.warn("[ChatWidget] could not persist consent record:", e);
      }

      this._pendingSessionLang = null;
      this._pendingSessionProcess = null;

      this._showToast("Consent declined — conversation not started", true);
      // No session was ever created (no log, no timer), so just close.
      this.close();
    }

    // ── Session Lifecycle ───────────────────────────────────────────────
    // Public entry point (called by the dashboard's "Begin conversation"
    // flow via open(lang, process) → startSession(lang, process)).
    // UPDATED: no longer starts the session directly — shows the DPDP
    // consent popup first. The actual session build-out moved to
    // _beginSessionAfterConsent(), which only runs once the customer taps
    // "Yes, I agree".
    startSession(lang, process) {
      this._showConsentPopup(lang, process);
    }

    _beginSessionAfterConsent(lang, process) {
      this.selectedLanguage = lang;
      this.selectedProcess = process;
      this.conversationLog = [];
      this.stepIndex = 0;
      this.kycShown = false;
      this.panelOpen = false;
      this.isActive = false; // true when a session is running
      this._pendingExtractedLead = null;
      this.sessionStart = Date.now();

      // Update header
      const meta = LANG_META[lang] || LANG_META["Hindi"];
      this.els.headerLang.textContent = `${meta.flag} ${lang}`;
      this.els.headerLang.style.display = "";
      this.els.headerTimer.style.display = "";
      this.els.btnPanel.style.display = "";
      this.els.btnEndSession.style.display = "";
      this.els.regionalLabel.textContent = `${lang} Summary`;

      // Show input bar
      this.els.inputBar.style.display = "";

      // Show inline workflow elements
      this.els.inlineProcessStrip.style.display = "flex";
      this.els.inlineGuideTip.style.display = "flex";
      this.els.inlineChecklist.style.display = "flex";

      // Clear messages
      this.els.messages.innerHTML = "";

      // Add system message
      this._addSystemMsg(`Session started · ${lang} · ${process}`);
      this._addSystemMsg(`✓ DPDP Act consent recorded`);

      // Start timer
      this._startTimer();

      // Build process panel
      this._buildProcessPanel();

      // Auto greet
      this._autoGreet();

      // Scroll
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
      this.kycShown = false;
      this.isRecording = false;
      this.staffRecording = false;

      // Reset header
      this.els.headerLang.style.display = "none";
      this.els.headerTimer.style.display = "none";
      this.els.btnPanel.style.display = "none";
      this.els.btnEndSession.style.display = "none";
      this.els.inputBar.style.display = "none";
      this.els.statusText.textContent = "Ready";
      this.els.statusDot.className = "cw-status-dot";

      // Hide and clear inline workflow elements
      this.els.inlineProcessStrip.style.display = "none";
      this.els.inlineGuideTip.style.display = "none";
      this.els.inlineChecklist.style.display = "none";
      this.els.inlineProcessStrip.innerHTML = "";
      this.els.inlineGuideTip.innerHTML = "";
      this.els.inlineChecklist.innerHTML = "";

      // Clear
      this.els.messages.innerHTML = "";
      this.els.quickReplies.innerHTML = "";
      this._closePanel();

      // Show empty
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

      // Show typing, then greeting
      this._showTyping();
      await this._delay(600);
      this._hideTyping();

      this._addStaffBubble(greetingText, greetingText, "auto", true);

      // Play audio
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
      this._advanceStep();
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

        // UI
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

        if (data.success && data.customer_text) {
          if (this._isUnclearTranscript(data.customer_text)) {
            this._addCustomerBubble(data.customer_text, "(unclear — ask customer to repeat)", data.stt_engine);
            this.conversationLog.push({ role: "customer", text: data.customer_text, translation: "(unclear)" });
            this._setStatus("", "Ready");
            this._showStaticQuickReplies();
            this._showToast("Audio unclear — ask the customer to repeat", true);
            return;
          }

          this._addCustomerBubble(data.customer_text, data.english_translation, data.stt_engine);
          if (data.intent && data.intent !== "General enquiry") {
            // Update intent display if needed
          }
          this.conversationLog.push({ role: "customer", text: data.customer_text, translation: data.english_translation });
          await this._updateStepFromLLM();
          await this._autoCheckStepCompletion();
          this._setStatus("", "Ready");
        } else {
          this._showToast(data.error || "Could not transcribe. Try again.", true);
          this._setStatus("", "Ready");
        }
      } catch (err) {
        this._hideProcessingIndicator();
        this._showToast("Backend error. Is port 8000 running?", true);
        this._setStatus("", "Ready");
      }
    }

    _isUnclearTranscript(text) {
      if (!text) return true;
      return text.trim().length < 3;
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

        // UI
        this.els.staffMic.classList.add("recording");
        this.els.staffMic.style.background = "#D32F2F";
        this.els.staffMic.style.color = "#ffffff";
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
      this.els.staffMic.style.background = "rgba(74, 157, 110, 0.1)";
      this.els.staffMic.style.color = "var(--success)";
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
          this.els.textInput.value = data.text;
          this.els.textInput.style.height = "auto";
          this.els.textInput.style.height = Math.min(this.els.textInput.scrollHeight, 100) + "px";
          this._setStatus("", "Ready");
          this._showToast("Staff reply transcribed & sending ✓");
          // Auto send!
          this.sendStaffReply();
        } else {
          this._showToast(data.error || "Could not transcribe staff audio. Try again.", true);
          this._setStatus("", "Ready");
        }
      } catch (err) {
        this._showToast("Backend error. Is port 8000 running?", true);
        this._setStatus("", "Ready");
      }
    }

    // ── Staff Reply ─────────────────────────────────────────────────────
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
          let finalData = data;
          // If the translation came back empty after stripping reasoning
          // (backend returned only <think> content, no real answer),
          // retry the call once before giving up and showing the
          // "translation unavailable" fallback in the bubble.
          if (!cleanTranslationText(data.translated_text)) {
            try {
              const retryForm = new FormData();
              retryForm.append("staff_text", text);
              retryForm.append("target_language", this.selectedLanguage);
              const retryRes = await fetch(`${API_BASE}/staff-reply`, { method: "POST", body: retryForm });
              const retryData = await retryRes.json();
              if (retryData.success && cleanTranslationText(retryData.translated_text)) {
                finalData = retryData;
              }
            } catch (e) {
              console.warn("[ChatWidget] translation retry failed:", e);
            }
          }

          this._addStaffBubble(text, finalData.translated_text, finalData.tts_engine, false);
          if (finalData.audio_b64) this._playAudio(finalData.audio_b64);
          else speakWithBrowserSynthesis(cleanTranslationText(finalData.translated_text) || text, this.selectedLanguage);
          this.conversationLog.push({ role: "staff", text, translation: finalData.translated_text });
          this.els.textInput.value = "";
          this.els.textInput.style.height = "auto";
          this.els.quickReplies.innerHTML = "";
          this._setStatus("", "Ready");
          await this._updateStepFromLLM();
          await this._autoCheckStepCompletion();
        } else {
          this._showToast(data.error || "Translation failed", true);
        }
      } catch (err) {
        this._hideTyping();
        this.els.sendBtn.disabled = false;
        this.els.sendBtn.classList.remove("loading");
        this._showToast("Backend error. Is port 8000 running?", true);
      }
    }

    // ── Step Management ─────────────────────────────────────────────────
    _advanceStep() {
      const steps = PROCESS_STEPS[this.selectedProcess] || [];
      this.stepIndex = Math.min(this.stepIndex + 1, steps.length - 1);
      this._updateProcessPanel();

      const stepName = steps[this.stepIndex] || "";
      if ((stepName === "KYC Details" || stepName === "Documents") && !this.kycShown) {
        this.kycShown = true;
      }
      this._updateProcessPanel();
    }

    _manualNextStep() {
      const steps = PROCESS_STEPS[this.selectedProcess] || [];
      const atLastStep = this.stepIndex >= steps.length - 1;
      if (atLastStep) {
        // Final step reached ("Activate" etc.) — Next now finishes the
        // conversation and opens the summary, same as "End & Summarise".
        this.endSession();
        return;
      }
      this._advanceStep();
      this._showStaticQuickReplies();
    }

    _manualBackStep() {
      if (this.stepIndex > 0) {
        this.stepIndex--;
        this._updateProcessPanel();
        this._showStaticQuickReplies();
      }
    }

    async _updateStepFromLLM() {
      if (this.conversationLog.length === 0) return;
      try {
        const res = await fetch(`${API_BASE}/detect-step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: this.conversationLog,
            process_type: this.selectedProcess,
            current_step: this.stepIndex
          })
        });
        const data = await res.json();
        if (!data.success) return;
        if (data.missing_info && data.missing_info.length > 0) {
          this._addInfoBadge(`📋 AI suggests still needed: ${data.missing_info.join(", ")}`);
        }
        if (data.next_question) this._addSuggestionBadge(`💡 Suggested: ${data.next_question}`);
        await this._fetchSmartQuickReplies();
      } catch (e) {
        console.warn("[SmartStep] failed, using static:", e);
        this._showStaticQuickReplies();
      }
    }

    async _autoCheckStepCompletion() {
      try {
        const res = await fetch(`${API_BASE}/step-complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step_index: this.stepIndex,
            conversation: this.conversationLog,
            process_type: this.selectedProcess,
            customer_language: this.selectedLanguage
          })
        });
        const data = await res.json();
        if (data.is_complete) {
          this._advanceStep();
          await this._fetchSmartQuickReplies();
        } else if (data.missing_fields) {
          this._addInfoBadge(`📋 Still need: ${data.missing_fields.join(", ")}`);
        }
      } catch (e) { console.warn("[AutoStep] failed:", e); }
    }

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
          this._renderQuickReplies(data.replies, "⚡ Smart replies");
          return;
        }
      } catch (e) { console.warn("[SmartReplies] fallback to static"); }
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
        btn.onclick = () => {
          this.els.textInput.value = text;
          this.sendStaffReply();
        };
        this.els.quickReplies.appendChild(btn);
      });
    }

    // ── End Session / Summary ───────────────────────────────────────────
    async endSession() {
      if (this.conversationLog.length === 0) { this._showToast("No conversation yet", true); return; }
      clearInterval(this.timerInterval);
      this.els.summaryModal.classList.add("show");
      this.els.englishSummary.textContent = "Generating…";
      this.els.regionalSummary.textContent = "Translating…";
      this.els.summaryMeta.textContent =
        `${this.selectedLanguage} · ${this.selectedProcess} · ${this.els.timerDisplay.textContent}`;
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
          this.els.englishSummary.textContent = cleanTranslationText(data.english_summary);
          this.els.regionalSummary.textContent = cleanTranslationText(data.regional_summary);
          if (data.action_items && data.action_items.length > 0) {
            this.els.englishSummary.textContent +=
              "\n\nACTION ITEMS:\n" + data.action_items.map(a => `• ${cleanTranslationText(a)}`).join("\n");
          }
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

    // ── Save to Records ──────────────────────────────────────────────────
    // UPDATED: no longer shows the in-widget lead popup. It stashes the
    // conversation + metadata into sessionStorage (same keys
    // lead-form.html expects) and redirects the browser straight to
    // lead-form.html, which does its own /extract-lead call and
    // ALWAYS renders the full lead form — every field the process
    // requires is shown, auto-filled where extraction succeeded and
    // left blank/"enter manually" where it didn't. The form opening is
    // not gated on extraction being complete or exact.
    // Also now attaches the DPDP consent record for audit purposes.
    saveToRecords() {
      if (this.conversationLog.length === 0) {
        this._showToast("No conversation yet", true);
        return;
      }

      try {
        sessionStorage.setItem("va_lead_conversation", JSON.stringify(this.conversationLog));
        sessionStorage.setItem("va_lead_process", this.selectedProcess || "General enquiry");
        sessionStorage.setItem("va_lead_language", this.selectedLanguage || "English");
        sessionStorage.setItem("va_lead_duration", this.els.timerDisplay.textContent || "");
        sessionStorage.setItem("va_lead_consent", JSON.stringify(this._consentRecord || {}));
      } catch (e) {
        console.warn("[ChatWidget] could not write sessionStorage for lead handoff:", e);
      }

      this.els.summaryModal.classList.remove("show");
      // Redirect to the dedicated lead form page — it opens unconditionally
      // and handles its own extraction + manual-fill fallback.
      // NOTE: filename must match the actual file in /pages exactly
      // (case-sensitive on Vercel). Your project's file is "lead-form.html".
      window.location.href = "lead-form.html";
    }

    // ── Legacy popup handlers (kept so nothing else in the file breaks if
    // referenced elsewhere; the popup itself is no longer opened by
    // saveToRecords() above). ──────────────────────────────────────────
    async submitLeadFromPop() {
      const name = this.els.leadPopName.value.trim();
      const phone = this.els.leadPopPhone.value.trim();
      const product = this.els.leadPopProduct.value;

      if (!name || !phone) {
        this._showToast("Name and Phone are required", true);
        return;
      }

      this.els.leadPopSendBtn.disabled = true;
      this.els.leadPopSendBtn.textContent = "Sending…";

      const lead = {
        ...(this._pendingExtractedLead || {}),
        customer_name: name,
        phone: phone,
      };

      try {
        const res = await fetch(`${API_BASE}/submit-lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            process_type: product,
            customer_language: this.selectedLanguage || "English",
            lead,
            session_duration: this.els.timerDisplay.textContent || "",
          }),
        });
        const data = await res.json();
        if (data.success) {
          this.els.leadPopup.style.display = "none";
          this.els.leadPopSendBtn.textContent = "Send";
          this._showToast("Lead sent to bank ✓");
          setTimeout(() => this.newSession(), 1200);
        } else {
          this._showToast(data.error || "Failed to send lead", true);
          this.els.leadPopSendBtn.disabled = false;
          this.els.leadPopSendBtn.textContent = "Send";
        }
      } catch (e) {
        this._showToast("Network error sending lead", true);
        this.els.leadPopSendBtn.disabled = false;
        this.els.leadPopSendBtn.textContent = "Send";
      }
    }

    skipLeadFromPop() {
      this.els.leadPopup.style.display = "none";
    }

    // ── Chat Bubble Rendering ───────────────────────────────────────────
    // UPDATED: both `orig` and `trans` now go through cleanTranslationText()
    // so a leaked <think> block never reaches the DOM in either line, and
    // the translation line renders in a larger font (18px) for legibility.
    _addCustomerBubble(orig, trans, engine) {
      this._removeEmpty();
      const langMeta = LANG_META[this.selectedLanguage] || {};
      const msg = document.createElement("div");
      msg.className = "cw-msg customer";
      const cleanOrig = cleanTranslationText(orig);
      const cleanTrans = cleanTranslationText(trans);
      const translationLine = cleanTrans
        ? `<div class="cw-msg-translation" style="font-weight:500;">🌐 ${escHtml(cleanTrans)}</div>`
        : `<div class="cw-translation-missing">⚠️ Translation unavailable — please resend</div>`;
      msg.innerHTML = `
        <div class="cw-msg-avatar">${langMeta.flag || "C"}</div>
        <div class="cw-msg-content">
          <div class="cw-msg-bubble">${escHtml(cleanOrig)}</div>
          ${translationLine}
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
      const cleanOrig = cleanTranslationText(orig);
      const cleanTrans = cleanTranslationText(trans);
      let translationLine = "";
      if (!isGreeting) {
        translationLine = cleanTrans
          ? `<div class="cw-msg-translation" style="font-weight:500;">→ ${escHtml(cleanTrans)}</div>`
          : `<div class="cw-translation-missing">⚠️ Translation unavailable — please resend this reply</div>`;
      }
      msg.innerHTML = `
        <div class="cw-msg-avatar">RJ</div>
        <div class="cw-msg-content">
          <div class="${bubbleClass}">
            ${greetingLabel}
            ${escHtml(cleanOrig)}
          </div>
          ${translationLine}
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

    _addInfoBadge(msg) {
      const prev = this.els.messages.querySelector(".cw-info-badge");
      if (prev) prev.remove();
      const el = document.createElement("div");
      el.className = "cw-info-badge";
      el.textContent = msg;
      this.els.messages.appendChild(el);
      this._scrollChat();
      setTimeout(() => el.remove(), 8000);
    }

    _addSuggestionBadge(msg) {
      const prev = this.els.messages.querySelector(".cw-suggestion-badge");
      if (prev) prev.remove();
      const el = document.createElement("div");
      el.className = "cw-suggestion-badge";
      el.textContent = msg;
      this.els.messages.appendChild(el);
      this._scrollChat();
      setTimeout(() => el.remove(), 10000);
    }

    // ── Typing Indicator ────────────────────────────────────────────────
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

    _hideTyping() {
      const typing = this.els.messages.querySelector(".cw-typing");
      if (typing) typing.remove();
    }

    // ── Recording Indicator ─────────────────────────────────────────────
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

    _hideRecordingIndicator() {
      const rec = this.els.messages.querySelector(".cw-recording-indicator");
      if (rec) rec.remove();
    }

    // ── Processing Indicator ────────────────────────────────────────────
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

    _hideProcessingIndicator() {
      const proc = this.els.messages.querySelector(".cw-processing");
      if (proc) proc.remove();
    }

    // ── Process Panel ───────────────────────────────────────────────────
    togglePanel() {
      this.panelOpen = !this.panelOpen;
      this.els.processPanel.classList.toggle("open", this.panelOpen);
    }

    _closePanel() {
      this.panelOpen = false;
      this.els.processPanel.classList.remove("open");
    }

    _buildProcessPanel() {
      this._updateProcessPanel();
    }

    _updateProcessPanel() {
      const steps = PROCESS_STEPS[this.selectedProcess] || [];
      const checklists = STEP_CHECKLISTS[this.selectedProcess] || [];
      const hints = GUIDE_HINTS[this.selectedProcess] || [];
      const kycDocs = KYC_CHECKLIST[this.selectedProcess];
      const currentHint = hints[Math.min(this.stepIndex, hints.length - 1)] || "";
      const currentChecklist = checklists[Math.min(this.stepIndex, checklists.length - 1)] || [];

      // ── 1. RENDER INLINE PROGRESS ELEMENTS ──
      // Process Strip
      let inlineStepsHtml = "";
      steps.forEach((step, i) => {
        let cls = "cw-inline-step";
        if (i < this.stepIndex) cls += " done";
        else if (i === this.stepIndex) cls += " active";
        const numContent = i < this.stepIndex ? "✓" : (i + 1);
        inlineStepsHtml += `
          <div class="${cls}">
            <div class="cw-inline-step-num">${numContent}</div>
            <span>${escHtml(step)}</span>
          </div>`;
      });
      this.els.inlineProcessStrip.innerHTML = inlineStepsHtml;

      // Guide Tip Bar
      if (currentHint) {
        this.els.inlineGuideTip.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 12v4M12 8h.01" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>${escHtml(currentHint)}</span>`;
        this.els.inlineGuideTip.style.display = "flex";
      } else {
        this.els.inlineGuideTip.style.display = "none";
      }

      // Checklist (grid above input)
      if (currentChecklist.length > 0) {
        let checklistHtml = `
          <div class="cw-checklist-header">Checklist — ${escHtml(steps[this.stepIndex] || "")}</div>
          <div class="cw-checklist-grid">`;
        currentChecklist.forEach((item, idx) => {
          const checkId = `cw-inline-chk-${this.stepIndex}-${idx}`;
          checklistHtml += `
            <label class="cw-inline-chk-item" for="${checkId}">
              <input type="checkbox" id="${checkId}" />
              <span>${escHtml(item)}</span>
            </label>`;
        });
        checklistHtml += `</div>`;
        this.els.inlineChecklist.innerHTML = checklistHtml;
        this.els.inlineChecklist.style.display = "flex";
      } else {
        this.els.inlineChecklist.innerHTML = "";
        this.els.inlineChecklist.style.display = "none";
      }

      // ── 2. RENDER SIDEBAR PROCESS PANEL ELEMENTS ──
      let html = "";

      // Step indicator
      html += `<div class="cw-step-indicator">
        <div class="step-badge">${this.stepIndex + 1}</div>
        <span>${steps[this.stepIndex] || "—"}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--slate-light);font-weight:400;">Step ${this.stepIndex + 1} of ${steps.length}</span>
      </div>`;

      // Guide hint
      if (currentHint) {
        html += `<div class="cw-guide-hint">${escHtml(currentHint)}</div>`;
      }

      // Steps list
      html += `<div class="cw-steps-list">`;
      steps.forEach((step, i) => {
        let cls = "cw-step-item";
        if (i < this.stepIndex) cls += " done";
        else if (i === this.stepIndex) cls += " active";
        const numContent = i < this.stepIndex ? "✓" : (i + 1);
        html += `<div class="${cls}"><div class="cw-step-num">${numContent}</div><span>${escHtml(step)}</span></div>`;
      });
      html += `</div>`;

      // Checklist
      if (currentChecklist.length > 0) {
        html += `<div class="cw-checklist-section">
          <div class="cw-checklist-title">Checklist — ${steps[this.stepIndex] || ""}</div>`;
        currentChecklist.forEach((item, idx) => {
          const checkId = `cw-chk-${this.stepIndex}-${idx}`;
          html += `<label class="cw-checklist-item" for="${checkId}">
            <input type="checkbox" id="${checkId}" />
            <span>${escHtml(item)}</span>
          </label>`;
        });
        html += `</div>`;
      }

      // KYC docs
      if (kycDocs && (this.stepIndex >= 2)) {
        html += `<div class="cw-kyc-section">
          <div class="cw-checklist-title">📋 Required Documents</div>`;
        kycDocs.forEach(doc => {
          html += `<div class="cw-kyc-item">✅ ${escHtml(doc)}</div>`;
        });
        html += `</div>`;
      }

      // Manual step controls
      const atLastStep = this.stepIndex >= steps.length - 1;
      html += `<div class="cw-step-controls">
        <button class="cw-step-btn back" id="cwStepBack">← Back</button>
        <button class="cw-step-btn next" id="cwStepNext">${atLastStep ? "Finish &amp; Summarise ✓" : "Next ✓"}</button>
      </div>`;

      this.els.panelBody.innerHTML = html;

      // ── 3. BIND CHECKLIST SYNC & CONTROLS ──
      // Bind inline checklist toggles to sidebar checklist
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

      // Bind step controls
      const backBtn = this.els.panelBody.querySelector("#cwStepBack");
      const nextBtn = this.els.panelBody.querySelector("#cwStepNext");
      if (backBtn) backBtn.addEventListener("click", () => this._manualBackStep());
      if (nextBtn) nextBtn.addEventListener("click", () => this._manualNextStep());
    }

    // ── Audio ───────────────────────────────────────────────────────────
    _playAudio(b64) {
      const p = document.getElementById("cwAudioPlayer");
      p.src = `data:audio/wav;base64,${b64}`;
      p.play().catch(() => {
        p.src = `data:audio/mpeg;base64,${b64}`;
        p.play().catch(() => { });
      });
    }

    // ── Status ──────────────────────────────────────────────────────────
    _setStatus(state, text) {
      this.els.statusDot.className = "cw-status-dot" + (state ? " " + state : "");
      this.els.statusText.textContent = text;
    }

    // ── Toast ───────────────────────────────────────────────────────────
    _showToast(msg, isError = false) {
      this.els.toastText.textContent = msg;
      this.els.toast.className = "cw-toast show" + (isError ? " error" : "");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.els.toast.classList.remove("show");
      }, 3000);
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    _removeEmpty() {
      const empty = this.els.messages.querySelector(".cw-empty");
      if (empty) empty.remove();
    }

    _scrollChat() {
      requestAnimationFrame(() => {
        this.els.messages.scrollTop = this.els.messages.scrollHeight;
      });
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    newSession() {
      this.resetSession();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Initialize Widget
  // ════════════════════════════════════════════════════════════════════════
  window.chatWidget = new ChatWidget();

})();