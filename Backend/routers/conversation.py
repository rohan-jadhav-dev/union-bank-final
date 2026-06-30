# routers/conversation.py — pydantic v1 compatible
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import logging
import json
import os
import re
from datetime import datetime

from services.stt_service import transcribe_audio
from services.tts_service import synthesize_speech
from services import llm_service
from services.llm_service import translate_and_analyze, translate_staff_reply, generate_bilingual_summary
from services.rag_service import get_rag_context

router = APIRouter(prefix="/api/conversation", tags=["conversation"])
logger = logging.getLogger(__name__)

    
@router.post("/customer-speak")
async def customer_speak(
    audio: UploadFile = File(...),
    language: str = Form("auto"),
    process_type: str = Form("General enquiry")
):
    try:
        audio_bytes = await audio.read()
        if len(audio_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Audio too large")

        if len(audio_bytes) < 100:
            logger.warning(f"[customer-speak] Audio payload suspiciously small: {len(audio_bytes)} bytes")
            return JSONResponse({
                "success": False,
                "error": f"Audio file too small ({len(audio_bytes)} bytes) — mic may not have captured anything",
                "customer_text": "",
                "english_translation": "",
                "language": "Hindi"
            })

        stt_result = await transcribe_audio(audio_bytes, language)
        customer_text = stt_result["text"]
        detected_language = stt_result["language"]
        stt_engine = stt_result["engine"]

        if not customer_text:
            logger.error(
                f"[customer-speak] STT returned no text. engine={stt_engine} "
                f"language_input={language} detected={detected_language}. "
                "Check backend console above for the actual Groq/Sarvam API error."
            )
            return JSONResponse({
                "success": False,
                "error": f"Could not transcribe audio (engine={stt_engine}). Check server logs for the real API error (bad key, rate limit, or audio format issue).",
                "customer_text": "",
                "english_translation": "",
                "language": detected_language
            })

        rag_ctx = get_rag_context(customer_text, process_type)
        analysis = await translate_and_analyze(customer_text, detected_language, rag_ctx)

        return JSONResponse({
            "success": True,
            "customer_text": customer_text,
            "english_translation": analysis.get("english_translation", ""),
            "intent": analysis.get("intent", process_type),
            "confidence": analysis.get("confidence", 0.8),
            "key_details": analysis.get("key_details", ""),
            "stt_engine": stt_engine,
            "language": detected_language
        })
    except Exception as e:
        logger.error(f"customer-speak error: {e}", exc_info=True)
        return JSONResponse({"success": False, "error": str(e), "customer_text": "", "english_translation": "", "language": "English"})


@router.post("/staff-reply")
async def staff_reply(
    staff_text: str = Form(...),
    target_language: str = Form("Hindi")
):
    try:
        translation = await translate_staff_reply(staff_text, target_language)
        translated_text = translation["translated_text"]
        tts_result = await synthesize_speech(translated_text, target_language)
        return JSONResponse({
            "success": True,
            "original_text": staff_text,
            "translated_text": translated_text,
            "audio_b64": tts_result["audio_b64"],
            "tts_engine": tts_result["engine"],
            "language": target_language
        })
    except Exception as e:
        logger.error(f"staff-reply error: {e}", exc_info=True)
        return JSONResponse({"success": False, "error": str(e), "translated_text": "", "audio_b64": ""})


@router.post("/staff-speak")
async def staff_speak(audio: UploadFile = File(...)):
    try:
        audio_bytes = await audio.read()
        stt_result = await transcribe_audio(audio_bytes, "English")
        return JSONResponse({"success": True, "text": stt_result["text"], "engine": stt_result["engine"]})
    except Exception as e:
        logger.error(f"staff-speak error: {e}", exc_info=True)
        return JSONResponse({"success": False, "error": str(e), "text": ""})


class SummaryRequest(BaseModel):
    conversation: List[dict]
    customer_language: str
    process_type: str


@router.post("/summary")
async def generate_summary(req: SummaryRequest):
    try:
        summary = await generate_bilingual_summary(req.conversation, req.customer_language, req.process_type)
        return JSONResponse({"success": True, **summary})
    except Exception as e:
        logger.error(f"summary error: {e}", exc_info=True)
        return JSONResponse({"success": False, "error": str(e)})


class TTSRequest(BaseModel):
    text: str
    language: str


@router.post("/tts")
async def text_to_speech(req: TTSRequest):
    try:
        result = await synthesize_speech(req.text, req.language)
        return JSONResponse({"success": True, **result})
    except Exception as e:
        logger.error(f"tts error: {e}", exc_info=True)
        return JSONResponse({"success": False, "error": str(e), "audio_b64": ""})


@router.get("/health")
async def health():
    return {"status": "ok", "service": "VoiceAssist AI"}


# ── AUTO STEP DETECTION (Main Flow) ──────────────────────────────────────────
class StepDetectRequest(BaseModel):
    conversation: list
    process_type: str = "General enquiry"
    current_step: int = 0


@router.post("/detect-step")
async def detect_step(req: StepDetectRequest):
    """
    Analyzes conversation to detect:
    - If current step is COMPLETE (auto-advance trigger)
    - What info is still MISSING
    - What to ask NEXT
    
    Frontend calls this after EVERY customer message.
    If step_complete=True, frontend auto-advances to next step.
    """
    try:
        result = await llm_service.detect_process_step(
            conversation_history=req.conversation,
            process_type=req.process_type,
            current_step=req.current_step
        )
        return {
            "success": True,
            "step_complete": result.get("step_complete", False),  # ← AUTO-ADVANCE TRIGGER
            "actual_step": result.get("actual_step", req.current_step),
            "missing_info": result.get("missing_info", []),  # What still needed
            "next_question": result.get("next_question", ""),  # What to ask next
            "step_name": result.get("step_name", ""),
            "collected_info": result.get("collected_info", "")
        }
    except Exception as e:
        logger.error(f"detect-step error: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "step_complete": False,
            "actual_step": req.current_step,
            "missing_info": [],
            "next_question": ""
        }


# ── SMART QUICK REPLIES ──────────────────────────────────────────────────────
class SmartRepliesRequest(BaseModel):
    conversation: list
    process_type: str = "General enquiry"
    step_index: int = 0
    customer_language: str = "Hindi"


@router.post("/smart-replies")
async def smart_replies(req: SmartRepliesRequest):
    """
    Get contextual quick reply suggestions for staff based on current step.
    Falls back to static replies if LLM fails.
    """
    try:
        replies = await llm_service.get_smart_quick_replies(
            process_type=req.process_type,
            step_index=req.step_index,
            conversation_history=req.conversation,
            customer_language=req.customer_language
        )
        return {"success": True, "replies": replies}
    except Exception as e:
        logger.error(f"smart-replies error: {e}", exc_info=True)
        return {"success": False, "error": str(e), "replies": []}


# ── LEAD EXTRACTION & SUBMISSION ──────────────────────────────────────────────
# These were missing entirely (404 on the frontend) — added below.
# extract-lead is implemented with regex over the conversation text rather
# than an LLM call, so it has zero dependency on llm_service internals and
# works immediately on redeploy, with no extra API quota burned per lead.

FIELD_PATTERNS = {
    "customer_name": [
        r"my name is\s+([A-Za-z][A-Za-z.\s]*?)(?:\s+and\b|[.,!]|$)",
        r"this is\s+([A-Za-z][A-Za-z.\s]*?)(?:\s+speaking|\s+here|[.,!]|$)",
        r"i am\s+([A-Za-z][A-Za-z.\s]*?)(?:\s+and\b|[.,!]|$)",
    ],
    "dob": [
        r"(?:date of birth|dob|born on)\s*(?:is)?\s*[:\-]?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4})",
        r"(?:date of birth|dob|born on)\s*(?:is)?\s*[:\-]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})",
    ],
    "phone": [
        r"(?:phone|mobile|number|contact)\D{0,15}?([6-9][0-9]{9})\b",
        r"\b([6-9][0-9]{9})\b",
    ],
    "address": [
        r"(?:my address is|i live at|address is|residing at)\s*([^.,;\n]+)",
    ],
    "account_type": [
        r"\b(union junior|savings account|current account|pmjdy|fixed deposit|fd account|savings|current)\b",
    ],
    "nominee_name": [
        r"nominee(?:'s)?\s*name\s*(?:is)?\s*[:\-]?\s*([A-Za-z][A-Za-z.\s]*?)(?:[.,]|$)",
    ],
    "nominee_relation": [
        r"nominee.*?relation(?:ship)?\s*(?:is)?\s*[:\-]?\s*([A-Za-z][A-Za-z\s]*?)(?:[.,]|$)",
        r"(?:my\s+)?(son|daughter|wife|husband|spouse|father|mother|brother|sister)\s+(?:is|as)\s+(?:my\s+)?nominee",
    ],
    "loan_type": [
        r"\b(home loan|personal loan|car loan|education loan|gold loan)\b",
    ],
    "loan_amount": [
        r"(?:loan amount|need|want|require)\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*\s*(?:lakh|lac|crore)?)",
    ],
    "tenure": [
        r"(?:tenure|for|over)\s*([0-9]+\s*(?:years?|yrs?|months?))",
    ],
    "monthly_income": [
        r"monthly income\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)",
    ],
    "employment_type": [
        r"\b(salaried|self[\s-]?employed|business owner|government employee)\b",
    ],
    "cibil_score": [
        r"cibil\D{0,10}?([0-9]{3})\b",
    ],
    "existing_emi": [
        r"existing emi\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)",
    ],
    "annual_income": [
        r"annual income\D{0,10}?(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)",
    ],
    "card_selected": [
        r"\b(union classic|union platinum|union signature)\b",
    ],
    "account_last4": [
        r"(?:account number|account no\.?|last 4 digits?)\D{0,10}?([0-9]{4})\b",
    ],
    "query_summary": [],
}


def _build_conversation_text(conversation: List[dict]) -> str:
    parts = []
    for turn in conversation:
        role = turn.get("role", "")
        text = turn.get("translation") or turn.get("text") or ""
        if text:
            parts.append(f"{role}: {text}")
    return ". ".join(parts)


def _clean_value(field_key: str, value: str) -> str:
    value = re.sub(r"\s{2,}", " ", value.strip())
    if field_key in ("customer_name", "nominee_name"):
        value = " ".join(w.capitalize() for w in value.split())
    if field_key == "phone":
        # strip any stray trailing/leading non-digit characters
        digits = re.sub(r"\D", "", value)
        value = digits[-10:] if len(digits) >= 10 else digits
    return value


def extract_lead_from_text(conversation: List[dict], fields: List[str]) -> Dict[str, str]:
    text = _build_conversation_text(conversation)
    result = {}
    for field_key in fields:
        patterns = FIELD_PATTERNS.get(field_key, [])
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m and m.group(1) and m.group(1).strip():
                result[field_key] = _clean_value(field_key, m.group(1))
                break
    return result


class ExtractLeadRequest(BaseModel):
    conversation: List[dict]
    process_type: str = "General enquiry"
    fields: List[str] = []


@router.post("/extract-lead")
async def extract_lead(req: ExtractLeadRequest):
    try:
        lead = extract_lead_from_text(req.conversation, req.fields)
        return JSONResponse({"success": True, "lead": lead})
    except Exception as e:
        logger.error(f"extract-lead error: {e}", exc_info=True)
        return JSONResponse({"success": False, "error": str(e), "lead": {}})


class SubmitLeadRequest(BaseModel):
    process_type: str = "General enquiry"
    customer_language: str = "Hindi"
    lead: Dict[str, str] = {}
    session_duration: Optional[str] = ""


@router.post("/submit-lead")
async def submit_lead(req: SubmitLeadRequest):
    try:
        os.makedirs("leads", exist_ok=True)
        record = {
            "timestamp": datetime.utcnow().isoformat(),
            "process_type": req.process_type,
            "customer_language": req.customer_language,
            "session_duration": req.session_duration,
            "lead": req.lead,
        }
        with open("leads/leads.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        logger.info(f"[submit-lead] saved lead for process={req.process_type}")
        return JSONResponse({"success": True})
    except Exception as e:
        logger.error(f"submit-lead error: {e}", exc_info=True)
        return JSONResponse({"success": False, "error": str(e)})
    
    
@router.get("/leads")
async def get_leads():
    try:
        if not os.path.exists("leads/leads.jsonl"):
            return {"success": True, "leads": []}
        leads = []
        with open("leads/leads.jsonl", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    leads.append(json.loads(line))
        return {"success": True, "count": len(leads), "leads": leads}
    except Exception as e:
        return {"success": False, "error": str(e)}    