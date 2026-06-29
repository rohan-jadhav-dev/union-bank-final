# services/llm_service.py
# Groq LLaMA-3.3-70B — Translation, intent detection, smart step tracking, bilingual summary
# Covers: Account Opening, Loan Enquiry, Balance Check, Credit Card Apply, all banking jargon

import httpx
import json
import logging
from config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger(__name__)
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

# ── BANKING KNOWLEDGE BASE ────────────────────────────────────────────────────
BANKING_CONTEXT = """
You are VoiceAssist AI — a multilingual assistant for Union Bank of India branch staff.
Help staff communicate with customers in Hindi, Marathi, Tamil, Telugu, English.

=== UNION BANK PRODUCTS & RATES (2024–25) ===

SAVINGS ACCOUNTS:
- Regular Savings: Min balance ₹1000 (urban), ₹500 (rural). Interest 2.75% p.a.
- Union Salary Account: Zero balance, for salaried employees
- PMJDY (Jan Dhan): Zero balance, RuPay card, ₹2 lakh accident insurance
- Senior Citizen Savings: Extra 0.50% interest, priority service
- Union Junior: For minors below 18

CURRENT ACCOUNTS:
- Regular Current: Min balance ₹5000, unlimited transactions
- Union Vyapar: For small businesses, ₹10,000 min balance
- Union Premium Current: ₹50,000 min, relationship manager

FIXED DEPOSITS (FD):
- Tenure: 7 days to 10 years
- Interest rates: 3.00% (7-45 days) → 7.00% (1-2 years) → 6.70% (5-10 years)
- Senior citizen: Additional 0.50% on all tenures
- Premature withdrawal: 1% penalty on applicable rate
- TDS: 10% if interest > ₹40,000/year (₹50,000 for senior citizens)

RECURRING DEPOSITS (RD):
- Min ₹100/month, tenure 6 months to 10 years
- Interest same as FD rates for same tenure

HOME LOANS:
- Interest: 8.35% p.a. onwards (floating, linked to RLLR)
- Max amount: Up to ₹10 crore (based on income)
- Tenure: Up to 30 years
- LTV: Up to 90% of property value (for loans < ₹30 lakh)
- Processing fee: 0.50% of loan amount (min ₹7,500)
- Disbursement: 7–10 working days after document verification
- Prepayment: Zero charges for floating rate loans
- Documents: Aadhaar, PAN, salary slips (3 months), bank statement (6 months),
             Form 16, property documents, NOC from builder, sale agreement

PERSONAL LOANS:
- Interest: 11.40% p.a. onwards
- Amount: ₹50,000 to ₹15 lakh
- Tenure: 12 to 60 months
- Processing fee: 1% of loan amount
- Min salary: ₹15,000/month (salaried), ₹2 lakh/year (self-employed)
- Min CIBIL score: 700
- Documents: Aadhaar, PAN, 3 months salary slips, 6 months bank statement

EDUCATION LOANS:
- Up to ₹10 lakh (India), ₹20 lakh (abroad) — no collateral
- Above ₹7.5 lakh — collateral required
- Interest: 9.90% p.a. (0.50% concession for girl students)
- Moratorium: Course duration + 1 year

VEHICLE LOANS (Car/Two-wheeler):
- Car: Up to 90% of on-road price, 7 years tenure, 8.70% p.a.
- Two-wheeler: Up to 85%, 5 years, 12% p.a.

CREDIT CARDS:
- Union Classic: No annual fee, 1% cashback
- Union Platinum: ₹499/year, 2X reward points, lounge access
- Union Signature: ₹2,999/year, 3X points, unlimited lounge
- Eligibility: Min income ₹2.5 lakh/year, CIBIL > 700
- Documents: Aadhaar, PAN, last 3 months salary slip or ITR

BALANCE / ACCOUNT ENQUIRY:
- Ways to check: Branch passbook, ATM, Net banking, Mobile app (Union Bank Mobile)
- SMS banking: Send BAL to 09223008586
- Missed call: Give missed call to 09223008586
- Net banking: www.unionbankofindia.co.in
- UPI: @unionbank on any UPI app

KYC (Know Your Customer):
- Mandatory for all accounts and loans
- Valid ID: Aadhaar, PAN, Passport, Voter ID, Driving License
- Valid address proof: Aadhaar, utility bill (< 3 months), rental agreement
- Video KYC available for digital accounts
- KYC renewal: Every 2 years for high-risk, 8 years for low-risk customers

KEY BANKING TERMS:
- EMI: Equated Monthly Installment — fixed monthly loan repayment
- CIBIL/Credit Score: 300–900 scale; 750+ = excellent; below 650 = risky
- NEFT: National Electronic Funds Transfer — batch, any amount, Mon–Sat
- RTGS: Real Time Gross Settlement — real-time, min ₹2 lakh
- IMPS: Immediate Payment Service — instant, 24x7, up to ₹5 lakh
- UPI: Unified Payments Interface — instant, up to ₹1 lakh
- Cheque bounce: ₹500 penalty + bank charges
- Lien: Bank holds funds in account (loan collateral)
- Nominee: Person who receives account funds after account holder's death
- TDS: Tax Deducted at Source on interest income
- NACH: National Automated Clearing House — auto EMI debit mandate
- RLLR: Repo Linked Lending Rate — RBI repo rate + bank spread
- LTV: Loan-to-Value ratio — % of property value bank will lend
- NOC: No Objection Certificate from housing society/builder
- Form 16: Employer-issued income tax certificate
- ITR: Income Tax Return — required for self-employed borrowers
"""

# ── PROCESS STEP DEFINITIONS ──────────────────────────────────────────────────
PROCESS_STEPS_DEFINITION = {
    "Loan enquiry": {
        "steps": ["Welcome", "Eligibility Check", "Loan Details", "Documents", "Next Steps"],
        "step_logic": """
STEP 1 - WELCOME: Customer just arrived. Share basic loan info (interest rate, tenure, max amount).
STEP 2 - ELIGIBILITY CHECK: Collect — monthly income, employment type (salaried/self-employed), 
         existing EMIs, CIBIL score. Step complete when income + employment confirmed.
STEP 3 - LOAN DETAILS: Collect — exact loan amount needed, property value/location, 
         preferred tenure, type (home/personal/car/education). Step complete when amount + tenure confirmed.
STEP 4 - DOCUMENTS: Tell customer full document checklist. Confirm they have/can get them.
         Step complete when customer acknowledges document list.
STEP 5 - NEXT STEPS: Explain processing fee, application process, disbursement timeline, next appointment.
""",
        "missing_fields": {
            2: ["monthly_income", "employment_type", "existing_emis", "cibil_score"],
            3: ["loan_amount", "property_value", "tenure", "loan_type"],
            4: ["documents_confirmed"],
            5: []
        }
    },
    "Account opening": {
        "steps": ["Welcome", "Account Type", "KYC Form", "Documents", "Deposit & Activate"],
        "step_logic": """
STEP 1 - WELCOME: Customer wants to open account. Ask what type (savings/current/FD/RD).
STEP 2 - ACCOUNT TYPE: Confirm account type, explain features, min balance, interest rate.
         Step complete when account type confirmed.
STEP 3 - KYC FORM: Guide to fill KYC. Collect name, DOB, address, mobile, nominee details.
         Step complete when form filling confirmed.
STEP 4 - DOCUMENTS: Aadhaar original+copy, PAN original+copy, 2 photos, address proof.
         Step complete when customer brings/confirms documents.
STEP 5 - DEPOSIT & ACTIVATE: Initial deposit, account number generation, debit card, passbook, net banking setup.
""",
        "missing_fields": {
            2: ["account_type", "purpose"],
            3: ["name_confirmed", "address_confirmed", "nominee_confirmed"],
            4: ["aadhaar", "pan", "photo", "address_proof"],
            5: ["initial_deposit"]
        }
    },
    "Balance enquiry": {
        "steps": ["Welcome", "Identity Verify", "Balance Display", "Additional Help"],
        "step_logic": """
STEP 1 - WELCOME: Customer wants balance. Ask which account/which mode (passbook/net banking/ATM/SMS).
STEP 2 - IDENTITY VERIFY: Verify identity — ask account number last 4 digits + registered mobile OTP.
         Step complete when identity confirmed.
STEP 3 - BALANCE DISPLAY: Show balance, last 5 transactions, available overdraft if any.
         Step complete when customer sees balance.
STEP 4 - ADDITIONAL HELP: Offer passbook update, mini statement print, net banking enrollment.
""",
        "missing_fields": {
            2: ["account_last4", "identity_verified"],
            3: ["balance_shown"],
            4: []
        }
    },
    "Credit card apply": {
        "steps": ["Welcome", "Eligibility Check", "Card Selection", "Documents", "Application"],
        "step_logic": """
STEP 1 - WELCOME: Customer wants credit card. Share card types and benefits.
STEP 2 - ELIGIBILITY CHECK: Collect — annual income, employment type, existing credit cards, CIBIL score.
         Min income ₹2.5 lakh/year, CIBIL > 700. Step complete when eligibility confirmed.
STEP 3 - CARD SELECTION: Based on income, recommend appropriate card (Classic/Platinum/Signature).
         Step complete when customer selects card.
STEP 4 - DOCUMENTS: Aadhaar, PAN, 3 months salary slip/ITR, passport photo.
         Step complete when customer confirms document availability.
STEP 5 - APPLICATION: Fill form, submit docs, processing time 7–10 working days, card delivery 15 days.
""",
        "missing_fields": {
            2: ["annual_income", "employment_type", "cibil_score"],
            3: ["card_type_selected"],
            4: ["documents_confirmed"],
            5: []
        }
    },
    "General enquiry": {
        "steps": ["Welcome", "Understand Query", "Answer", "Resolved"],
        "step_logic": """
STEP 1 - WELCOME: Greet customer, understand what they need.
STEP 2 - UNDERSTAND QUERY: Ask clarifying questions if needed.
STEP 3 - ANSWER: Provide accurate banking information from knowledge base.
STEP 4 - RESOLVED: Confirm query resolved, offer additional help.
""",
        "missing_fields": {2: ["query_details"], 3: ["answer_given"], 4: []}
    }
}

# ── INTENT DETECTION ──────────────────────────────────────────────────────────
INTENT_KEYWORDS = {
    "Account opening": ["account", "open", "new account", "savings", "current", "jan dhan",
                        "खाता", "खोलना", "खाते", "बचत", "चालू", "खाता उघडणे"],
    "Loan enquiry": ["loan", "borrow", "EMI", "home loan", "personal loan", "car loan",
                     "कर्ज", "लोन", "ऋण", "होम लोन", "कर्ज घेणे", "கடன்", "రుణం"],
    "Balance enquiry": ["balance", "how much", "statement", "transaction", "passbook",
                        "शेष", "बैलेंस", "पासबुक", "शिल्लक"],
    "Credit card apply": ["credit card", "card apply", "credit", "क्रेडिट कार्ड", "कार्ड"],
    "KYC": ["kyc", "document", "aadhaar", "pan", "verify", "दस्तावेज़", "आधार"],
    "Transfer": ["transfer", "send money", "neft", "rtgs", "imps", "upi", "भेजना", "ट्रांसफर"],
    "FD/RD": ["fixed deposit", "fd", "recurring", "rd", "सावधि जमा", "आवर्ती"],
    "General enquiry": []
}


# ── MAIN FUNCTIONS ────────────────────────────────────────────────────────────

async def translate_and_analyze(customer_text: str, customer_language: str, rag_context: str = "") -> dict:
    """
    Translate customer speech → English for staff.
    Detect banking intent + key details.
    Returns: { "english_translation", "intent", "confidence", "key_details" }
    """
    system_prompt = f"""{BANKING_CONTEXT}

{rag_context}

Your task:
1. Translate the customer message from {customer_language} to English accurately
2. Preserve all banking terms, amounts (₹), numbers exactly as spoken
3. Detect intent from: Account opening, Loan enquiry, Balance enquiry, Credit card apply, KYC, Transfer, FD/RD, General enquiry
4. Extract any key details mentioned (amounts, account numbers, names, tenures)

Return ONLY valid JSON:
{{"english_translation": "...", "intent": "...", "confidence": 0.0-1.0, "key_details": "extracted amounts/numbers/names"}}
"""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Customer said in {customer_language}: {customer_text}"}
    ]
    response = await _groq_chat(messages, max_tokens=400)
    try:
        clean = response.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except Exception:
        return {
            "english_translation": response,
            "intent": "General enquiry",
            "confidence": 0.5,
            "key_details": ""
        }


async def detect_process_step(conversation_history: list, process_type: str, current_step: int) -> dict:
    """
    Smart step detection — based on full conversation, determine:
    - Which step are we ACTUALLY on (may skip or stay)
    - What info is still missing
    - Exact next question staff should ask
    - Whether current step is complete

    Returns: { "actual_step", "step_complete", "missing_info", "next_question", "step_name", "collected_info" }
    """
    process_def = PROCESS_STEPS_DEFINITION.get(process_type, PROCESS_STEPS_DEFINITION["General enquiry"])
    steps = process_def["steps"]
    step_logic = process_def["step_logic"]

    # Format conversation for LLM
    conv_text = "\n".join([
        f"{'CUSTOMER' if t['role'] == 'customer' else 'STAFF'}: {t.get('translation') or t.get('text', '')}"
        for t in conversation_history
    ])

    system_prompt = f"""{BANKING_CONTEXT}

You are tracking a Union Bank of India {process_type} conversation.

PROCESS STEPS:
{chr(10).join(f"Step {i+1}: {s}" for i, s in enumerate(steps))}

STEP LOGIC:
{step_logic}

Based on the conversation, determine:
1. Which step (1-{len(steps)}) are we currently on?
2. Is the current step complete (all needed info collected)?
3. What info is still missing for current step?
4. What exact question should staff ask next IN ENGLISH?
5. What has been collected so far?

Return ONLY valid JSON:
{{
  "actual_step": 1-{len(steps)},
  "step_complete": true/false,
  "missing_info": ["list of missing information items"],
  "next_question": "exact next question for staff to ask",
  "step_name": "name of current step",
  "collected_info": "summary of what customer has already told us"
}}
"""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Conversation so far:\n{conv_text}\n\nCurrent step index: {current_step + 1}"}
    ]
    response = await _groq_chat(messages, max_tokens=400)
    try:
        clean = response.strip().replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        # Convert 1-indexed to 0-indexed for frontend
        result["actual_step"] = max(0, int(result.get("actual_step", current_step + 1)) - 1)
        return result
    except Exception as e:
        logger.error(f"Step detection parse error: {e} | raw: {response}")
        return {
            "actual_step": current_step,
            "step_complete": False,
            "missing_info": [],
            "next_question": "",
            "step_name": steps[min(current_step, len(steps)-1)],
            "collected_info": ""
        }


async def get_smart_quick_replies(process_type: str, step_index: int,
                                   conversation_history: list, customer_language: str) -> list:
    """
    Generate context-aware quick reply suggestions based on what's been said.
    Returns list of 2-3 reply strings staff can tap to send.
    """
    process_def = PROCESS_STEPS_DEFINITION.get(process_type, PROCESS_STEPS_DEFINITION["General enquiry"])
    steps = process_def["steps"]
    step_name = steps[min(step_index, len(steps)-1)]

    conv_text = "\n".join([
        f"{'CUSTOMER' if t['role'] == 'customer' else 'STAFF'}: {t.get('translation') or t.get('text', '')}"
        for t in conversation_history[-6:]  # last 6 turns only
    ])

    system_prompt = f"""{BANKING_CONTEXT}

Generate 2-3 quick reply suggestions for a Union Bank branch staff member.
Process: {process_type} | Current step: {step_name} | Customer language: {customer_language}

Rules:
- Each reply should be in English (will be auto-translated to {customer_language})
- Replies should be SHORT, clear, professional banking phrases
- Based on what customer said, suggest the most relevant next responses
- Include actual Union Bank rates/details where applicable
- Each reply max 15 words
- NEVER output meta-commentary like "complex query" or "I cannot answer" — only output actual reply text a staff member could say

Return ONLY valid JSON array:
["reply 1", "reply 2", "reply 3"]
"""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Recent conversation:\n{conv_text}"}
    ]
    response = await _groq_chat(messages, max_tokens=200)
    logger.info(f"[smart-replies] raw Groq response: {response!r}")
    try:
        clean = response.strip().replace("```json", "").replace("```", "").strip()
        replies = json.loads(clean)
        if not isinstance(replies, list):
            logger.warning(f"[smart-replies] non-list response: {replies!r}")
            return []

        # Reject junk/boilerplate replies so they never reach the UI as if valid
        BAD_MARKERS = ["complex query", "i cannot", "i'm unable", "as an ai",
                       "i don't have enough", "use quick replies"]
        clean_replies = []
        for r in replies:
            if not isinstance(r, str) or not r.strip():
                continue
            if any(marker in r.lower() for marker in BAD_MARKERS):
                logger.warning(f"[smart-replies] rejected junk reply: {r!r}")
                continue
            clean_replies.append(r.strip())

        if not clean_replies:
            logger.warning(f"[smart-replies] all replies rejected as junk, raw was: {response!r}")
        return clean_replies
    except Exception as e:
        logger.error(f"[smart-replies] parse failed: {e} | raw: {response!r}")
        return []


async def translate_staff_reply(staff_english: str, target_language: str) -> dict:
    """
    Translate staff's English reply → customer's language.
    Returns: { "translated_text", "language" }
    """
    system_prompt = f"""{BANKING_CONTEXT}

Translate the following bank staff reply from English to {target_language}.
- Simple, clear language appropriate for a bank customer
- Preserve all numbers, amounts (₹), account numbers exactly
- Keep banking terms (EMI, KYC, CIBIL, NEFT, etc.) as-is — do NOT translate them
- Use formal/respectful tone (आप/तुम्ही not तू)
- Return ONLY the translated text, nothing else
"""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Translate to {target_language}: {staff_english}"}
    ]
    translated = await _groq_chat(messages, max_tokens=300)
    return {"translated_text": translated.strip(), "language": target_language}


async def answer_banking_query(query_english: str, process_type: str, customer_language: str) -> dict:
    """
    For simple/auto-answerable queries — generate a banking answer directly.
    Returns: { "answer_english", "answer_translated" }
    """
    system_prompt = f"""{BANKING_CONTEXT}

A customer at Union Bank asked a banking question. 
Provide a concise, accurate, helpful answer using the knowledge base above.
- Include specific rates, amounts, timelines from Union Bank data
- Keep answer to 2-3 sentences max
- Use friendly, professional tone
- If the query is ambiguous, ask ONE clarifying question

Return ONLY valid JSON:
{{"answer_english": "...", "needs_clarification": false, "clarification_question": ""}}
"""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Customer query: {query_english}\nProcess context: {process_type}"}
    ]
    response = await _groq_chat(messages, max_tokens=300)
    try:
        clean = response.strip().replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        # Translate answer to customer language
        if result.get("answer_english"):
            trans = await translate_staff_reply(result["answer_english"], customer_language)
            result["answer_translated"] = trans["translated_text"]
        return result
    except Exception:
        return {
            "answer_english": response,
            "answer_translated": response,
            "needs_clarification": False
        }


async def generate_bilingual_summary(conversation_turns: list, customer_language: str, process_type: str) -> dict:
    """
    Generate bilingual session summary with action items.
    Returns: { "english_summary", "regional_summary", "action_items" }
    """
    conversation_text = "\n".join([
        f"{'Customer' if t['role'] == 'customer' else 'Staff'}: {t['text']}"
        for t in conversation_turns
    ])

    system_prompt = f"""{BANKING_CONTEXT}

Generate a professional bilingual banking session summary.
Process: {process_type} | Customer language: {customer_language}

Return ONLY valid JSON:
{{
  "english_summary": "2-3 paragraph professional English summary. Include: what customer needed, key details collected (amounts/income/documents), what was resolved, pending action items.",
  "regional_summary": "Same summary fully in {customer_language}. Formal banking register.",
  "action_items": ["list of next steps / follow-up actions needed"],
  "customer_name": "name if mentioned in conversation, else empty string",
  "amount_discussed": "loan amount / deposit amount if mentioned, else empty"
}}
"""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Conversation:\n{conversation_text}"}
    ]
    response = await _groq_chat(messages, max_tokens=1000)
    try:
        clean = response.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except Exception:
        return {
            "english_summary": response,
            "regional_summary": f"({customer_language} translation unavailable)",
            "action_items": [],
            "customer_name": "",
            "amount_discussed": ""
        }


async def _groq_chat(messages: list, max_tokens: int = 500) -> str:
    """Raw Groq LLaMA chat call."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GROQ_CHAT_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.3
            }
        )
        data = resp.json()

    if "error" in data:
        logger.error(f"Groq error: {data['error']}")
        raise Exception(data["error"].get("message", "Groq API error"))

    return data["choices"][0]["message"]["content"]