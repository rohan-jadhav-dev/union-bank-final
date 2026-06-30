// conversation-desk.js — VoiceAssist AI
// Manual-step edition: no auto-advance. Staff ticks checklist items and
// clicks "Next" themselves. Top auto-strip removed; step indicator + checklist
// + Back/Next now live entirely in the staff panel.
//
// PATCH (this version): added cleanModelText() to strip stray JSON / markdown
// fences / "Here is the response:" preambles that the backend LLM sometimes
// returns instead of a clean string. Applied at every place a translation or
// transcript string from the backend gets shown or stored.
//
// PATCH 2 (this version): added LEAD AUTO-FILL — after a session ends,
// alongside the bilingual summary, conversation data is sent to a new
// backend endpoint that extracts structured form fields (name, loan type,
// income, etc.) using the LLM. Staff reviews/corrects the auto-filled form,
// then clicks "Send to Bank" to submit it as a lead via /submit-lead.
//
// PATCH 3 (this version): "Save to Records" no longer just toasts and
// returns to the dashboard. It now stores the conversation in sessionStorage
// (the same keys lead-form.html reads) and redirects straight to
// lead-form.html, where the lead is auto-extracted/auto-filled and staff
// only needs to review and click "Send to Bank".
//
// PATCH 4 (this version): DPDP ACT 2023 CONSENT GATE — added a mandatory
// consent step before ANY recording, transcription, or AI processing.
// The consent notice is shown (and read aloud) to the customer in their
// own selected language, per Section 5/6 of the Digital Personal Data
// Protection Act, 2023 (informed, specific, unambiguous consent for
// processing personal data — including voice data — before collection).
// Mic input and the auto-greeting are both locked until staff confirms
// the customer has given explicit consent. A decline path is provided
// that halts the session without recording anything. Consent is logged
// with a timestamp and carried through to the saved record / lead payload.

const API_BASE = "https://rohan667-voiceassist-ai-backend-kj.hf.space/api/conversation";

const LANG_META = {
  "Hindi":   { flag: "हि", tag: "हिन्दी" },
  "Marathi": { flag: "मा", tag: "मराठी" },
  "Tamil":   { flag: "த",  tag: "தமிழ்" },
  "Telugu":  { flag: "తె", tag: "తెలుగు" },
  "English": { flag: "EN", tag: "English" },
};

// ═══════════════════════════════════════════════════════════
// DPDP ACT 2023 — CONSENT NOTICE TEXT (per language)
// Plain-language notice + the explicit yes/no prompt, shown to the
// customer in their own language before any recording/processing begins.
// NOTE: These translations are functional drafts for the consent UI.
// Have your compliance/legal team review the exact wording before
// production use — this is not legal advice.
// ═══════════════════════════════════════════════════════════
const CONSENT_NOTICE = {
  "Hindi": "बैंक अधिकारी आपकी सहायता के लिए एक AI सहायक का उपयोग कर रहे हैं। बातचीत के दौरान आपकी आवाज़़ रिकॉर्ड की जाएगी और सही जानकारी देने के लिए AI द्वारा संसाधित (process) की जाएगी। यह जानकारी केवल इस बैंकिंग सेवा के लिए उपयोग होगी और डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 (DPDP Act) के अनुसार सुरक्षित रखी जाएगी। आप किसी भी समय सहमति वापस ले सकते हैं। क्या आप इसके लिए सहमत हैं?",
  "Marathi": "बँक अधिकारी तुम्हाला मदत करण्यासाठी AI सहाय्यक वापरत आहेत. संभाषणादरम्यान तुमचा आवाज रेकॉर्ड केला जाईल आणि अचूक माहिती देण्यासाठी AI द्वारे प्रक्रिया केली जाईल. ही माहिती फक्त या बँकिंग सेवेसाठी वापरली जाईल आणि डिजिटल वैयक्तिक डेटा संरक्षण कायदा, 2023 (DPDP Act) नुसार सुरक्षित ठेवली जाईल. तुम्ही कधीही संमती मागे घेऊ शकता. तुम्ही याला सहमत आहात का?",
  "Tamil": "வங்கி அதிகாரிகள் உங்களுக்கு உதவ AI உதவியாளரைப் பயன்படுத்துகின்றனர். உரையாடலின் போது உங்கள் குரல் பதிவு செய்யப்பட்டு, துல்லியமான தகவலை வழங்க AI மூலம் செயலாக்கப்படும். இந்தத் தகவல் இந்த வங்கி சேவைக்கு மட்டுமே பயன்படுத்தப்படும், மேலும் டிஜிட்டல் தனிநபர் தரவுப் பாதுகாப்புச் சட்டம், 2023 (DPDP Act) படி பாதுகாக்கப்படும். நீங்கள் எந்த நேரத்திலும் உங்கள் ஒப்புதலைத் திரும்பப் பெறலாம். இதற்கு நீங்கள் ஒப்புக்கொள்கிறீர்களா?",
  "Telugu": "మిమ్మల్ని సహాయం చేయడానికి బ్యాంక్ సిబ్బంది AI అసిస్టెంట్‌ను ఉపయోగిస్తున్నారు. సంభాషణ సమయంలో మీ స్వరం రికార్డ్ చేయబడి, ఖచ్చితమైన సమాచారం అందించడానికి AI ద్వారా ప్రాసెస్ చేయబడుతుంది. ఈ సమాచారం ఈ బ్యాంకింగ్ సేవ కోసం మాత్రమే ఉపయోగించబడుతుంది మరియు డిజిటల్ పర్సనల్ డేటా ప్రొటెక్షన్ యాక్ట్, 2023 (DPDP Act) ప్రకారం రక్షించబడుతుంది. మీరు ఎప్పుడైనా మీ సమ్మతిని ఉపసంహరించుకోవచ్చు. దీనికి మీరు అంగీకరిస్తున్నారా?",
  "English": "Bank staff are using an AI assistant to help you today. During this conversation, your voice will be recorded and processed by AI to give you accurate information. This data will be used only for this banking service and protected under the Digital Personal Data Protection Act, 2023 (DPDP Act). You can withdraw your consent at any time. Do you consent to this?",
};

const CONSENT_DECLINED_NOTICE = {
  "Hindi": "ठीक है, हम आपकी आवाज़ रिकॉर्ड या प्रोसेस नहीं करेंगे। हमारा स्टाफ आपकी मदद बिना रिकॉर्डिंग के करेगा।",
  "Marathi": "ठीक आहे, आम्ही तुमचा आवाज रेकॉर्ड किंवा प्रक्रिया करणार नाही. आमचे कर्मचारी रेकॉर्डिंगशिवाय तुम्हाला मदत करतील.",
  "Tamil": "சரி, நாங்கள் உங்கள் குரலை பதிவு செய்யவோ செயலாக்கவோ மாட்டோம். எங்கள் ஊழியர்கள் பதிவு செய்யாமல் உங்களுக்கு உதவுவார்கள்.",
  "Telugu": "సరే, మేము మీ స్వరాన్ని రికార్డ్ చేయము లేదా ప్రాసెస్ చేయము. మా సిబ్బంది రికార్డింగ్ లేకుండా మీకు సహాయం చేస్తారు.",
  "English": "Understood — we will not record or process your voice. Our staff will assist you manually without recording.",
};

const PROCESS_STEPS = {
  "Loan enquiry":      ["Greeting", "Loan Options", "Eligibility", "Documents", "Next Steps"],
  "Account opening":   ["Greeting", "Account Type", "KYC Details", "Documents", "Activate"],
  "Balance enquiry":   ["Greeting", "Verify Identity", "Show Balance", "Done"],
  "Credit card apply": ["Greeting", "Eligibility", "Card Selection", "Documents", "Apply"],
  "General enquiry":   ["Greeting", "Understand", "Answer", "Resolved"],
};

// Per-step checklist items. Staff taps each box as they cover it with the
// customer. This was previously defined but never rendered — now it drives
// the manual checklist UI in the staff pane.
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
    [
      "How can I help you today?",
      "Which type of loan are you interested in?",
      "Are you an existing Union Bank customer?",
    ],
    [
      "🏠 Home Loan — 8.35% p.a., up to 30 years, max ₹10 crore",
      "💳 Personal Loan — 11.40% p.a., up to ₹15 lakh, 5 years",
      "🚗 Car Loan — 8.70% p.a., up to 90% on-road price, 7 years",
      "🎓 Education Loan — 9.90% p.a., up to ₹20 lakh abroad",
      "🏗️ Loan Against Property — 9.25% p.a., up to ₹5 crore",
      "Which loan type would you like?",
      "Tenure options: 5 / 10 / 15 / 20 / 30 years",
      "Would you prefer a shorter or longer tenure?",
      "Shorter tenure means higher EMI but less total interest",
      "Longer tenure means lower EMI but more total interest",
      "What loan amount are you looking for?",
    ],
    [
      "What is your monthly income?",
      "Are you salaried or self-employed?",
      "Do you have any existing loan EMIs?",
      "What is your approximate CIBIL score?",
      "How many years of work experience do you have?",
      "Do you have a co-applicant for this loan?",
      "Minimum CIBIL score required is 700",
      "Minimum monthly income required is ₹25,000",
      "Your EMI should not exceed 50% of monthly income",
    ],
    [
      "Please bring Aadhaar Card original + photocopy",
      "PAN Card original + photocopy needed",
      "Last 3 months salary slips required",
      "Last 6 months bank statement required",
      "Form 16 / Income Tax Return needed",
      "Property sale agreement required (home loan)",
      "NOC from builder required (home loan)",
      "Employment certificate required",
      "Self-employed: please bring last 2 years ITR",
    ],
    [
      "Processing fee is 0.5% of loan amount — one time payment",
      "Approval takes 7–10 working days after document submission",
      "Loan disbursed directly to builder or seller account",
      "You will get an SMS once your loan is approved",
      "Our loan officer will call you within 24 hours",
      "You can track your application status on our app",
      "Is there anything else I can help you with?",
    ],
  ],
  "Account opening": [
    [
      "What brings you to the branch today?",
      "Are you looking to open a new account?",
      "Do you already bank with us?",
    ],
    [
      "💰 Savings Account — ₹1000 min balance, 2.75% interest p.a.",
      "🏢 Current Account — ₹5000 min balance, unlimited transactions",
      "🆓 PMJDY Zero-Balance — free RuPay card + ₹2L accident insurance",
      "📈 Fixed Deposit — up to 7.00% interest, 7 days to 10 years",
      "👴 Senior Citizen Savings — 3.25% interest, extra benefits",
      "👨‍👩‍👧 Joint Account — two or more holders, shared access",
      "FD tenure options: 1 / 3 / 5 / 10 years",
      "Which account type would you prefer?",
    ],
    [
      "Please fill KYC form — need Aadhaar, PAN, nominee details",
      "What is your full name as per Aadhaar?",
      "What is your date of birth?",
      "What is your current address?",
      "What is the nominee name and relation to you?",
      "Is your Aadhaar linked to mobile number for OTP verification?",
      "What is your occupation?",
    ],
    [
      "Aadhaar Card original + photocopy",
      "PAN Card original + photocopy",
      "2 passport size photographs",
      "Address proof (utility bill, < 3 months old)",
      "Address proof (rental agreement) accepted too",
    ],
    [
      "Initial deposit ₹1000 — account activates in 30 minutes",
      "You will receive passbook and debit card today",
      "Net banking and UPI will be set up immediately",
      "Your account number will be shared via SMS",
      "Would you like a chequebook as well?",
    ],
  ],
  "Balance enquiry": [
    [
      "Welcome! How can I help you today?",
      "Would you like to check your account balance?",
    ],
    [
      "Please share your account number last 4 digits",
      "OTP will be sent to your registered mobile number",
      "Please confirm your registered mobile number",
      "Could you confirm your name as per the account?",
    ],
    [
      "Your balance is being fetched — one moment please",
      "Would you like last 5 transactions as well?",
      "Would you like a mini statement printed?",
      "Your available balance is shown on screen",
    ],
    [
      "Would you like passbook update today?",
      "SMS BAL to 09223008586 anytime to check balance",
      "Download Union Bank Mobile app for 24x7 access",
      "Is there anything else I can help you with?",
    ],
  ],
  "Credit card apply": [
    [
      "What kind of credit card are you looking for?",
      "Do you already hold a Union Bank account?",
    ],
    [
      "What is your annual income?",
      "Do you currently have any credit cards?",
      "What is your approximate CIBIL score?",
      "Are you salaried or self-employed?",
      "Minimum annual income required is ₹2.5 lakh",
      "Minimum CIBIL score required is 700",
    ],
    [
      "Union Classic — Free, 1% cashback on all spends",
      "Union Platinum — ₹499/year, 2X rewards, airport lounge access",
      "Union Signature — ₹2999/year, 3X rewards, unlimited lounge",
      "Union Travel Card — ₹999/year, 5X miles on travel spends",
      "Which card would you like to apply for?",
    ],
    [
      "Aadhaar Card + PAN Card required",
      "Last 3 months salary slips required",
      "ITR for last 2 years (if self-employed)",
      "1 passport size photograph required",
      "Last 3 months bank statement required",
    ],
    [
      "Application submitted — credit limit SMS in 7 days",
      "Card delivery takes 15 working days to your address",
      "Activate card via net banking or branch visit",
      "You can set your PIN at any Union Bank ATM",
      "Is there anything else I can help you with?",
    ],
  ],
  "General enquiry": [
    [
      "How can I help you today?",
      "Which banking service do you need information about?",
    ],
    [
      "Could you give me more details about your query?",
      "Let me check that for you — one moment",
      "Is this regarding an existing account or a new service?",
    ],
    [
      "Here is the information you requested",
      "Would you like me to explain that in more detail?",
      "Let me connect you to the right department for this",
    ],
    [
      "Is there anything else I can help you with?",
      "Your query has been resolved successfully",
      "Thank you for visiting Union Bank of India",
    ],
  ],
};

const GUIDE_HINTS = {
  "Loan enquiry": [
    "Step 1: Greet customer warmly — session just started",
    "Step 2: Show loan options, rates, and tenure choices",
    "Step 3: Check eligibility — income, employment, EMIs, CIBIL score",
    "Step 4: Give full document checklist based on loan type selected",
    "Step 5: Explain processing fee and disbursement timeline",
  ],
  "Account opening": [
    "Step 1: Greet customer — ask what brings them to the branch today",
    "Step 2: Explain account types and FD tenure options",
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
    "Step 3: Recommend a card based on spends and lifestyle",
    "Step 4: Collect Aadhaar, PAN, salary slips, passport photo",
    "Step 5: Submit application — explain delivery timeline",
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

const LEAD_FORM_FIELDS = {
  "Loan enquiry": [
    { key: "customer_name",    label: "Customer Name" },
    { key: "phone",            label: "Phone Number" },
    { key: "loan_type",        label: "Loan Type" },
    { key: "loan_amount",      label: "Loan Amount Requested" },
    { key: "tenure",           label: "Tenure Preference" },
    { key: "monthly_income",   label: "Monthly Income" },
    { key: "employment_type",  label: "Employment Type" },
    { key: "cibil_score",      label: "CIBIL Score (approx)" },
    { key: "existing_emi",     label: "Existing EMI Obligations" },
  ],
  "Account opening": [
    { key: "customer_name",     label: "Customer Name" },
    { key: "dob",                label: "Date of Birth" },
    { key: "phone",              label: "Phone Number" },
    { key: "address",            label: "Address" },
    { key: "account_type",       label: "Account Type" },
    { key: "nominee_name",       label: "Nominee Name" },
    { key: "nominee_relation",   label: "Nominee Relation" },
  ],
  "Balance enquiry": [
    { key: "customer_name",   label: "Customer Name" },
    { key: "account_last4",   label: "Account No. (last 4)" },
  ],
  "Credit card apply": [
    { key: "customer_name",   label: "Customer Name" },
    { key: "phone",           label: "Phone Number" },
    { key: "annual_income",   label: "Annual Income" },
    { key: "cibil_score",     label: "CIBIL Score (approx)" },
    { key: "card_selected",   label: "Card Selected" },
  ],
  "General enquiry": [
    { key: "customer_name",   label: "Customer Name" },
    { key: "query_summary",   label: "Query Summary" },
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

// DPDP consent state
let consentGiven     = false;
let consentDeclined  = false;
let consentTimestamp = null;

document.addEventListener("DOMContentLoaded", () => {
  try { initUI(); }            catch (e) { console.error("[Init] initUI:", e); }
  try { startTimer(); }        catch (e) { console.error("[Init] startTimer:", e); }
  try { bindEvents(); }        catch (e) { console.error("[Init] bindEvents:", e); }
  try { startConversation(); } catch (e) { console.error("[Init] startConversation:", e); }
});

function cleanModelText(raw) {
  if (raw === null || raw === undefined) return raw;
  let t = String(raw).trim();
  if (!t) return t;

  const looksJsonWrapped =
    t.includes("```") ||
    /"english_translation"|"customer_text"|"translated_text"|"text"\s*:/.test(t) ||
    (t.includes("{") && t.includes("}"));
  if (!looksJsonWrapped) return t;

  let stripped = t
    .replace(/^[^{]*?```(?:json)?/is, "")
    .replace(/```[^]*$/i, "")
    .trim();

  if (!stripped.startsWith("{")) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      stripped = t.slice(start, end + 1);
    }
  }

  if (!stripped.startsWith("{")) return t;

  try {
    const obj = JSON.parse(stripped);
    return (
      obj.english_translation ??
      obj.customer_text ??
      obj.translated_text ??
      obj.text ??
      t
    );
  } catch (e) {
    console.warn("[cleanModelText] failed to parse model JSON, showing raw text:", e);
    return t;
  }
}

function initUI() {
  const meta = LANG_META[selectedLanguage] || LANG_META["Hindi"];
  document.getElementById("langChipFlag").textContent = meta.flag;
  document.getElementById("langChipName").textContent = selectedLanguage;
  document.getElementById("customerLangTag").textContent = meta.tag;
  document.getElementById("intentChipText").textContent = selectedProcess;
  if (selectedProcess !== "General enquiry") document.getElementById("intentChip").classList.add("show");
  document.getElementById("regionalLabel").textContent = `${selectedLanguage} Summary`;

  const strip = document.getElementById("processStrip");
  if (strip) strip.style.display = "none";

  // Everything starts locked until DPDP consent is captured.
  lockStaffInput(true);
  lockCustomerMic(true);
  updateGuideHint(0);
  updateStepIndicator();
  updateManualStepButtons();
  renderStepChecklist();
}

function lockStaffInput(locked) {
  const row = document.getElementById("staffInputRow");
  if (!row) return;
  row.style.opacity = locked ? "0.4" : "1";
  row.style.pointerEvents = locked ? "none" : "all";
  const s = document.getElementById("staffStatusText");
  if (s) s.textContent = locked ? "Awaiting consent" : "Ready";
}

function lockCustomerMic(locked) {
  const mic = document.getElementById("customerMicBtn");
  if (mic) {
    mic.disabled = locked;
    mic.style.opacity = locked ? "0.4" : "1";
    mic.style.cursor = locked ? "not-allowed" : "pointer";
  }
  const hint = document.getElementById("customerMicHint");
  if (hint && locked) hint.textContent = "Awaiting consent before recording";
}

function startConversation() {
  setCustomerStatus("", "Awaiting consent");
  setStaffStatus("", "Awaiting consent");
  const meta = LANG_META[selectedLanguage] || {};
  const emptyHint = document.getElementById("customerEmpty");
  if (emptyHint) {
    const p = emptyHint.querySelector("p");
    if (p) p.textContent = `Tap the mic to record the customer in ${meta.tag || selectedLanguage}`;
  }
  updateGuideHint(0);
  showConsentGate();
}

// ═══════════════════════════════════════════════════════════
// DPDP ACT 2023 — CONSENT GATE
// Shown before anything is recorded or sent to the AI backend.
// Notice text is in the customer's own language (read aloud via TTS
// too). Staff confirms verbally-obtained consent with a tap; only then
// does recording/processing unlock and the auto-greeting fire.
// ═══════════════════════════════════════════════════════════
function showConsentGate() {
  document.getElementById("consentGateOverlay")?.remove();
  const meta = LANG_META[selectedLanguage] || LANG_META["Hindi"];
  const noticeText = CONSENT_NOTICE[selectedLanguage] || CONSENT_NOTICE["English"];

  const overlay = document.createElement("div");
  overlay.id = "consentGateOverlay";
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(15,30,61,0.6);z-index:500;
    display:flex;align-items:center;justify-content:center;padding:20px;`;

  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:12px;max-width:560px;width:100%;
      padding:26px;box-shadow:0 12px 40px rgba(15,30,61,0.3);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:18px;">🔐</span>
        <div style="font-size:16px;font-weight:600;color:var(--navy);">Consent Required — DPDP Act, 2023</div>
      </div>
      <div style="font-size:12px;color:var(--slate-light);margin-bottom:16px;">
        Read or play this notice to the customer in <strong>${escHtml(meta.tag || selectedLanguage)}</strong> before recording anything.
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;
        padding:14px 16px;font-size:14px;line-height:1.7;color:var(--navy);margin-bottom:14px;">
        ${escHtml(noticeText)}
      </div>
      <button id="consentPlayBtn" style="width:100%;margin-bottom:16px;padding:9px;border-radius:7px;
        border:1px solid var(--gold);background:var(--gold-bg);color:var(--navy);font-size:13px;
        font-weight:500;cursor:pointer;font-family:inherit;">🔊 Play notice to customer (${escHtml(selectedLanguage)})</button>
      <div style="font-size:11.5px;color:var(--slate-light);margin-bottom:14px;">
        Only confirm consent below after the customer has clearly said yes in their own words.
      </div>
      <div style="display:flex;gap:10px;">
        <button id="consentDeclineBtn" style="flex:1;padding:11px;border-radius:7px;border:1px solid var(--border);
          background:var(--white);color:var(--error);font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;">
          ❌ Customer Declined
        </button>
        <button id="consentAcceptBtn" style="flex:1.4;padding:11px;border-radius:7px;border:none;
          background:var(--success);color:var(--white);font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;">
          ✅ Customer Consented — Begin
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById("consentPlayBtn").addEventListener("click", () => {
    speakWithBrowserSynthesis(noticeText, selectedLanguage);
  });
  document.getElementById("consentAcceptBtn").addEventListener("click", onConsentAccepted);
  document.getElementById("consentDeclineBtn").addEventListener("click", onConsentDeclined);
}

function onConsentAccepted() {
  consentGiven = true;
  consentDeclined = false;
  consentTimestamp = new Date().toISOString();
  document.getElementById("consentGateOverlay")?.remove();

  conversationLog.push({
    role: "system",
    text: `[DPDP consent obtained — ${selectedLanguage} — ${consentTimestamp}]`,
    translation: `[DPDP consent obtained — ${selectedLanguage} — ${consentTimestamp}]`,
  });

  lockStaffInput(false);
  lockCustomerMic(false);
  setCustomerStatus("", "Ready");
  setStaffStatus("", "Ready");
  showToast("✓ Consent recorded — session unlocked");

  autoGreetCustomer();
}

function onConsentDeclined() {
  consentGiven = false;
  consentDeclined = true;
  document.getElementById("consentGateOverlay")?.remove();

  const declineText = CONSENT_DECLINED_NOTICE[selectedLanguage] || CONSENT_DECLINED_NOTICE["English"];
  speakWithBrowserSynthesis(declineText, selectedLanguage);

  lockStaffInput(true);
  lockCustomerMic(true);
  setCustomerStatus("", "Consent declined");
  setStaffStatus("", "Consent declined");
  showToast("Customer declined — no recording or AI processing will occur", true);

  const transcript = document.getElementById("customerTranscript");
  if (transcript) {
    const note = document.createElement("div");
    note.style.cssText = "padding:12px;text-align:center;color:var(--error);font-size:13px;";
    note.textContent = "Customer declined consent under the DPDP Act, 2023. Please assist manually without recording.";
    transcript.appendChild(note);
  }
}

async function autoGreetCustomer() {
  if (!consentGiven) { showConsentGate(); return; }
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
      addInfoBadge(`📋 Still needed: ${data.missing_info.join(", ")}`);
    }
    if (data.next_question) showNextQuestionHint(cleanModelText(data.next_question));

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
      smartReplies = data.replies.map(cleanModelText);
      showQuickReplies(smartReplies);
      return;
    }
  } catch (e) { console.warn("[SmartReplies] fallback to static"); }
  showStaticQuickReplies();
}

function updateStepIndicator() {
  const steps = PROCESS_STEPS[selectedProcess] || PROCESS_STEPS["General enquiry"];
  const el = document.getElementById("stepIndicator");
  if (el) el.textContent = `Step ${stepIndex + 1} of ${steps.length}: ${steps[stepIndex] || ""}`;
}

function updateManualStepButtons() {
  const steps = PROCESS_STEPS[selectedProcess] || PROCESS_STEPS["General enquiry"];
  const backBtn = document.getElementById("manualBackBtn");
  const nextBtn = document.getElementById("manualNextBtn");
  if (backBtn) {
    const atStart = stepIndex <= 0;
    backBtn.disabled = atStart;
    backBtn.style.opacity = atStart ? "0.4" : "1";
    backBtn.style.cursor = atStart ? "not-allowed" : "pointer";
  }
  if (nextBtn) {
    const atEnd = stepIndex >= steps.length - 1;
    nextBtn.textContent = atEnd ? "Finished ✓" : "Next ✓";
    nextBtn.disabled = atEnd;
    nextBtn.style.opacity = atEnd ? "0.5" : "1";
    nextBtn.style.cursor = atEnd ? "not-allowed" : "pointer";
  }
}

function manualNextStep() {
  const steps = PROCESS_STEPS[selectedProcess] || [];
  if (stepIndex >= steps.length - 1) return;

  stepIndex += 1;

  updateGuideHint(stepIndex);
  updateStepIndicator();
  updateManualStepButtons();
  renderStepChecklist();

  const stepName = steps[stepIndex] || "";
  if ((stepName === "KYC Details" || stepName === "Documents") && !kycShown) {
    kycShown = true;
    showKycChecklist();
  }

  showStaticQuickReplies();
  showToast(`✓ Moved to: ${stepName}`);
}

function manualBackStep() {
  if (stepIndex <= 0) return;

  stepIndex -= 1;

  updateGuideHint(stepIndex);
  updateStepIndicator();
  updateManualStepButtons();
  renderStepChecklist();

  const steps = PROCESS_STEPS[selectedProcess] || [];
  showStaticQuickReplies();
  showToast(`← Back to: ${steps[stepIndex] || ""}`);
}

function renderStepChecklist() {
  document.getElementById("stepChecklistBar")?.remove();

  const checklists = STEP_CHECKLISTS[selectedProcess] || STEP_CHECKLISTS["General enquiry"];
  const items = checklists[Math.min(stepIndex, checklists.length - 1)] || [];
  if (items.length === 0) return;

  if (!checklistState[stepIndex]) checklistState[stepIndex] = new Set();
  const checkedSet = checklistState[stepIndex];

  const bar = document.createElement("div");
  bar.id = "stepChecklistBar";
  bar.style.cssText = `padding:12px 20px 4px;background:var(--white);
    border-top:1px solid var(--border);`;

  const steps = PROCESS_STEPS[selectedProcess] || [];
  const lbl = document.createElement("div");
  lbl.style.cssText = `font-size:10.5px;text-transform:uppercase;
    letter-spacing:0.07em;color:var(--slate-light);font-weight:600;margin-bottom:8px;
    display:flex;align-items:center;justify-content:space-between;`;
  lbl.innerHTML = `<span>📋 Checklist — ${escHtml(steps[stepIndex] || "")}</span>
    <span id="checklistProgress" style="color:var(--gold);font-weight:700;"></span>`;
  bar.appendChild(lbl);

  const list = document.createElement("div");
  list.style.cssText = `display:flex;flex-direction:column;gap:6px;`;

  items.forEach((label, i) => {
    const row = document.createElement("label");
    row.style.cssText = `display:flex;align-items:flex-start;gap:8px;cursor:pointer;
      font-size:12.5px;color:var(--navy);line-height:1.4;user-select:none;`;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checkedSet.has(i);
    cb.style.cssText = `margin-top:2px;width:15px;height:15px;accent-color:var(--gold);cursor:pointer;flex-shrink:0;`;
    cb.addEventListener("change", () => {
      if (cb.checked) checkedSet.add(i); else checkedSet.delete(i);
      updateChecklistProgress(items.length);
      row.style.color = cb.checked ? "var(--slate-light)" : "var(--navy)";
      row.style.textDecoration = cb.checked ? "line-through" : "none";
    });

    const span = document.createElement("span");
    span.textContent = label;

    if (cb.checked) { row.style.color = "var(--slate-light)"; row.style.textDecoration = "line-through"; }

    row.appendChild(cb);
    row.appendChild(span);
    list.appendChild(row);
  });

  bar.appendChild(list);
  const controls = document.querySelector(".pane:last-child .pane-controls");
  if (controls) controls.insertBefore(bar, controls.firstChild);

  updateChecklistProgress(items.length);
}

function updateChecklistProgress(total) {
  const el = document.getElementById("checklistProgress");
  if (!el) return;
  const checkedSet = checklistState[stepIndex] || new Set();
  el.textContent = `${checkedSet.size}/${total}`;
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
  bar.style.cssText = `display:flex;gap:8px;flex-wrap:wrap;max-height:160px;overflow-y:auto;
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
    btn.onclick = () => { document.getElementById("staffInput").value = text; sendStaffReply(); };
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
  if (!consentGiven) { showToast("Customer consent is required before recording (DPDP Act, 2023)", true); showConsentGate(); return; }
  if (isRecording) stopCustomerRecording();
  else await startCustomerRecording();
}

async function startCustomerRecording() {
  if (!consentGiven) { showToast("Customer consent is required before recording (DPDP Act, 2023)", true); showConsentGate(); return; }
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

    const cleanCustomerText  = cleanModelText(data.customer_text);
    const cleanTranslation   = cleanModelText(data.english_translation);
    const cleanIntent        = cleanModelText(data.intent);

    if (data.success && cleanCustomerText) {

      if (isUnclearTranscript(cleanCustomerText)) {
        addCustomerBubble(cleanCustomerText, "(unclear — ask customer to repeat)", data.stt_engine, null);
        conversationLog.push({ role: "customer", text: cleanCustomerText, translation: "(unclear)" });
        setCustomerStatus("", "Ready");
        showStaticQuickReplies();
        showToast("Audio unclear — ask the customer to repeat", true);
        return;
      }

      addCustomerBubble(cleanCustomerText, cleanTranslation, data.stt_engine, cleanIntent);
      if (cleanIntent && cleanIntent !== "General enquiry") {
        document.getElementById("intentChipText").textContent = cleanIntent;
        document.getElementById("intentChip").classList.add("show");
      }
      conversationLog.push({ role: "customer", text: cleanCustomerText, translation: cleanTranslation });

      await updateStepFromLLM();
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

async function sendStaffReply() {
  if (!consentGiven) { showToast("Customer consent is required first (DPDP Act, 2023)", true); showConsentGate(); return; }
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
      const cleanTranslated = cleanModelText(data.translated_text);
      addStaffBubble(text, cleanTranslated, data.tts_engine);
      if (data.audio_b64) playAudio(data.audio_b64);
      else speakWithBrowserSynthesis(cleanTranslated, selectedLanguage);
      conversationLog.push({ role: "staff", text, translation: cleanTranslated });
      input.value = ""; input.style.height = "auto";
      setStaffStatus("done", "Sent");
      setTimeout(() => setStaffStatus("", "Ready"), 2000);
      document.getElementById("nextQuestionHint")?.remove();
    } else { showToast(data.error || "Translation failed", true); }
  } catch (err) {
    hideEl("staffProcessing");
    btn.disabled = false; btn.classList.remove("loading");
    showToast("Backend error. Is port 8000 running?", true);
  }
}

async function toggleStaffRecording() {
  if (!consentGiven) { showToast("Customer consent is required first (DPDP Act, 2023)", true); showConsentGate(); return; }
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
            document.getElementById("staffInput").value = cleanModelText(data.text);
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

async function fetchLeadForm() {
  const fields = LEAD_FORM_FIELDS[selectedProcess] || LEAD_FORM_FIELDS["General enquiry"];
  const leadContainer = document.getElementById("leadFormBody");
  if (leadContainer) {
    leadContainer.innerHTML = `<div style="color:var(--slate-light);font-size:12px;">Extracting lead details…</div>`;
  }

  try {
    const res = await fetch(`${API_BASE}/extract-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: conversationLog.map(t => ({ role: t.role, text: t.text, translation: t.translation })),
        process_type: selectedProcess,
        fields: fields.map(f => f.key),
      })
    });
    const data = await res.json();
    if (data.success && data.lead) {
      renderLeadForm(fields, data.lead);
    } else {
      renderLeadForm(fields, {});
      showToast("Could not auto-extract lead — fill manually", true);
    }
  } catch (e) {
    renderLeadForm(fields, {});
    showToast("Lead extraction failed — fill manually", true);
  }
}

function renderLeadForm(fields, leadData) {
  const container = document.getElementById("leadFormBody");
  if (!container) return;
  container.innerHTML = "";

  fields.forEach(f => {
    const raw = leadData[f.key];
    const value = (raw === undefined || raw === null) ? "" : cleanModelText(String(raw));

    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:10px;";
    row.innerHTML = `
      <label style="display:block;font-size:11px;color:var(--slate-light);
        text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">${escHtml(f.label)}</label>
      <input type="text" data-field="${escHtml(f.key)}" value="${escHtml(value)}"
        style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;
        font-size:13px;font-family:inherit;color:var(--navy);"
        placeholder="${value ? "" : "Not captured — enter manually"}" />`;
    container.appendChild(row);
  });
}

async function submitLead() {
  const inputs = document.querySelectorAll("#leadFormBody input[data-field]");
  if (inputs.length === 0) { showToast("No lead form to submit", true); return; }

  const lead = {};
  inputs.forEach(inp => { lead[inp.dataset.field] = inp.value.trim(); });

  const btn = document.getElementById("submitLeadBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const res = await fetch(`${API_BASE}/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        process_type: selectedProcess,
        customer_language: selectedLanguage,
        lead,
        session_duration: document.getElementById("timerDisplay")?.textContent || "",
        consent_given: consentGiven,
        consent_timestamp: consentTimestamp,
        consent_language: selectedLanguage,
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Lead sent to bank ✓");
      if (btn) btn.textContent = "Sent ✓";
    } else {
      showToast(data.error || "Submit failed", true);
      if (btn) { btn.disabled = false; btn.textContent = "Send to Bank"; }
    }
  } catch (e) {
    showToast("Network error sending lead", true);
    if (btn) { btn.disabled = false; btn.textContent = "Send to Bank"; }
  }
}

async function endSession() {
  if (conversationLog.length === 0) { showToast("No conversation yet", true); return; }
  clearInterval(timerInterval);
  document.getElementById("summaryModal").classList.add("show");
  document.getElementById("englishSummary").textContent = "Generating…";
  document.getElementById("regionalSummary").textContent = "Translating…";
  document.getElementById("summaryMeta").textContent =
    `${selectedLanguage} · ${selectedProcess} · ${document.getElementById("timerDisplay").textContent}`;

  const leadBtn = document.getElementById("submitLeadBtn");
  if (leadBtn) { leadBtn.disabled = false; leadBtn.textContent = "Send to Bank"; }

  await Promise.all([fetchSummary(), fetchLeadForm()]);
}

async function fetchSummary() {
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
      document.getElementById("englishSummary").textContent = cleanModelText(data.english_summary);
      document.getElementById("regionalSummary").textContent = cleanModelText(data.regional_summary);
      if (data.action_items && data.action_items.length > 0) {
        document.getElementById("englishSummary").textContent +=
          "\n\nACTION ITEMS:\n" + data.action_items.map(a => `• ${cleanModelText(a)}`).join("\n");
      }
    } else {
      document.getElementById("englishSummary").textContent = "Error: " + (data.error || "");
    }
  } catch (e) {
    document.getElementById("englishSummary").textContent = "Network error.";
  }
}

function closeSummary() { document.getElementById("summaryModal").classList.remove("show"); startTimer(); }
function newSession()   { window.location.href = "dashboard.html"; }

// ═══════════════════════════════════════════════════════════
// PATCH 3: SAVE TO RECORDS → redirect straight to lead-form.html
// Stores the conversation (and everything lead-form.html needs) into
// sessionStorage using the SAME keys lead-form.html already reads on
// load, then redirects there immediately. lead-form.html auto-extracts
// and auto-fills the form on its own — staff just reviews and clicks
// "Send to Bank". Nothing here auto-submits the lead.
// Also carries the DPDP consent record through to lead-form.html.
// ═══════════════════════════════════════════════════════════
function saveToRecords() {
  const duration = document.getElementById("timerDisplay")?.textContent || "";

  showToast("Summary saved — opening lead form ✓");

  sessionStorage.setItem("va_lead_conversation", JSON.stringify(conversationLog));
  sessionStorage.setItem("va_lead_process", selectedProcess);
  sessionStorage.setItem("va_lead_language", selectedLanguage);
  sessionStorage.setItem("va_lead_duration", duration);
  sessionStorage.setItem("va_lead_consent_given", JSON.stringify(consentGiven));
  sessionStorage.setItem("va_lead_consent_timestamp", consentTimestamp || "");

  setTimeout(() => { window.location.href = "lead-form.html"; }, 900);
}

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
  bind("submitLeadBtn",  "click", submitLead);
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
    <div class="bubble-meta"><span>${formatTime()}</span><span class="engine-tag">${engine}</span>${intent ? `<span class="engine-tag">${escHtml(intent)}</span>` : ""}</div>`;
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