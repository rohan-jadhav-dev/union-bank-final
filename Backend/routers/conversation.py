# routers/conversation.py — pydantic v1 compatible
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import logging

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