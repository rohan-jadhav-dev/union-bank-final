# services/stt_service.py
# Pipeline (auto-detect mode): Groq Whisper auto-detect -> Sarvam auto-detect fallback
# Pipeline (explicit language mode): Bhashini -> Groq Whisper -> Sarvam
#
# KEY FIX vs previous version:
#   - Auto-detect mode previously had NO fallback at all — if Groq Whisper
#     errored (bad key, rate limit, bad audio, etc) it just returned empty
#     text with engine="none", which the frontend treats as "transcription
#     failed" and falls back to the manual language picker. That's why the
#     dashboard never showed a detected language even though nothing was
#     "wrong" with language detection itself — STT was failing silently.
#   - Now: errors are logged with the ACTUAL response body (not just the
#     exception message), and Sarvam is tried as a real fallback in
#     auto-detect mode too.
#   - Groq is preferred when it confidently detects English (Whisper is
#     stronger on English than Sarvam); Sarvam is preferred for Indic
#     languages (much better at telling Hindi/Marathi/Tamil/Telugu apart).
#
# TIMEOUT FIX (this revision):
#   - Explicit-language mode always tries Bhashini STT FIRST. With a bad/
#     invalid Bhashini key, that call doesn't fail fast — it was timing out
#     near its 15s/20s httpx ceilings (observed ~12-19s in production logs)
#     before falling through to Groq Whisper, which actually responds in
#     under 1s. Every single customer recording was eating that delay.
#   - Bhashini's STT timeouts are now capped at 5s each (~10s worst case
#     instead of ~35s), so a dead/invalid key fails fast and Groq Whisper
#     picks up the transcription almost immediately after.

import httpx
import base64
import io
import logging
from config import (
    BHASHINI_USER_ID, BHASHINI_UDYAT_KEY, BHASHINI_INFERENCE_KEY,
    BHASHINI_PIPELINE_URL, BHASHINI_INFERENCE_URL,
    GROQ_API_KEY, GROQ_WHISPER_MODEL,
    SARVAM_API_KEY, SARVAM_STT_URL,
    LANGUAGE_CODES
)

logger = logging.getLogger(__name__)

# Reverse map: Whisper ISO-639-1 code -> our display language name.
WHISPER_CODE_TO_LANGUAGE = {
    "hi": "Hindi",
    "mr": "Marathi",
    "ta": "Tamil",
    "te": "Telugu",
    "en": "English",
    "ne": "Hindi",
    "ur": "Hindi",
    "sa": "Hindi",
    "gu": "Hindi",
    "bn": "Hindi",
    "pa": "Hindi",
    "kn": "Tamil",
    "ml": "Tamil",
}

# Sarvam BCP-47 code -> our display language name.
SARVAM_CODE_TO_LANGUAGE = {
    "hi-IN": "Hindi",
    "mr-IN": "Marathi",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "en-IN": "English",
    "gu-IN": "Hindi",
    "bn-IN": "Hindi",
    "pa-IN": "Hindi",
    "kn-IN": "Tamil",
    "ml-IN": "Tamil",
    "od-IN": "Hindi",
}

MIN_CONFIDENT_EN_CHARS = 6

# Fast-fail timeouts for Bhashini STT. A dead/invalid key should not cost
# the customer 12-19 seconds before Groq Whisper (which works in <1s) ever
# gets a chance to run.
BHASHINI_STT_PIPELINE_TIMEOUT = 5.0
BHASHINI_STT_INFERENCE_TIMEOUT = 5.0


async def transcribe_audio(audio_bytes: bytes, language: str) -> dict:
    """
    Transcribe audio bytes -> text.
    If language == "auto": run Groq Whisper + Sarvam in parallel-ish
    (sequential here for simplicity), prefer Groq when it confidently
    says English, otherwise prefer Sarvam (better at Indic languages).
    Returns: { "text": str, "engine": str, "language": str }
    """
    is_auto = language not in LANGUAGE_CODES

    if is_auto:
        groq_text, groq_code, groq_err = await _safe_groq_autodetect(audio_bytes)
        sarvam_text, sarvam_code, sarvam_err = await _safe_sarvam_autodetect(audio_bytes)

        if groq_err:
            logger.error(f"[STT] Groq auto-detect failed: {groq_err}")
        if sarvam_err:
            logger.error(f"[STT] Sarvam auto-detect failed: {sarvam_err}")

        # Decide which result to trust
        # 1) Groq confidently English -> use Groq
        if groq_code == "en" and len(groq_text.strip()) >= MIN_CONFIDENT_EN_CHARS:
            logger.info(f"[STT] Using Groq (confident English): {groq_text[:60]!r}")
            return {"text": groq_text, "engine": "groq_whisper_auto", "language": "English"}

        # 2) Sarvam gave a usable Indic detection -> use Sarvam
        if sarvam_text.strip():
            mapped = SARVAM_CODE_TO_LANGUAGE.get(sarvam_code, "Hindi")
            logger.info(f"[STT] Using Sarvam: lang={mapped} code={sarvam_code} text={sarvam_text[:60]!r}")
            return {"text": sarvam_text, "engine": "sarvam_auto", "language": mapped}

        # 3) Fall back to whatever Groq gave us, even if uncertain
        if groq_text.strip():
            mapped = WHISPER_CODE_TO_LANGUAGE.get(groq_code, "Hindi")
            logger.info(f"[STT] Using Groq (fallback): lang={mapped} code={groq_code} text={groq_text[:60]!r}")
            return {"text": groq_text, "engine": "groq_whisper_auto_fallback", "language": mapped}

        # 4) Both failed / both empty — surface the real reason in logs
        logger.error(
            "[STT] Both Groq and Sarvam returned no usable transcript. "
            f"groq_err={groq_err!r} sarvam_err={sarvam_err!r}"
        )
        return {"text": "", "engine": "none", "language": "Hindi"}

    # ── EXPLICIT LANGUAGE MODE (verification step, staff replies, etc.) ──
    lang_codes = LANGUAGE_CODES[language]

    try:
        result = await _bhashini_stt(audio_bytes, lang_codes["bhashini"])
        if result:
            return {"text": result, "engine": "bhashini", "language": language}
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        logger.warning(f"Bhashini STT timed out/unreachable ({BHASHINI_STT_PIPELINE_TIMEOUT}s cap): {e}")
    except Exception as e:
        logger.warning(f"Bhashini STT failed: {e}")

    try:
        result = await _groq_whisper(audio_bytes, lang_codes["groq"])
        if result:
            return {"text": result, "engine": "groq_whisper", "language": language}
    except Exception as e:
        logger.warning(f"Groq Whisper STT failed: {e}")

    try:
        result = await _sarvam_stt(audio_bytes, lang_codes["sarvam"])
        if result:
            return {"text": result, "engine": "sarvam", "language": language}
    except Exception as e:
        logger.warning(f"Sarvam STT failed: {e}")

    return {"text": "", "engine": "none", "language": language}


# ── SAFE WRAPPERS (never raise, always return error string for logging) ──────

async def _safe_groq_autodetect(audio_bytes: bytes):
    try:
        text, code = await _groq_whisper_autodetect(audio_bytes)
        return text, code, None
    except Exception as e:
        return "", "", str(e)


async def _safe_sarvam_autodetect(audio_bytes: bytes):
    try:
        text, code = await _sarvam_autodetect(audio_bytes)
        return text, code, None
    except Exception as e:
        return "", "", str(e)


# ── BHASHINI ──────────────────────────────────────────────────────────────────

async def _bhashini_stt(audio_bytes: bytes, lang_code: str) -> str:
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    pipeline_payload = {
        "pipelineTasks": [{"taskType": "asr", "config": {"language": {"sourceLanguage": lang_code}}}],
        "pipelineRequestConfig": {"pipelineId": "64392f96daac500b55c543cd"}
    }
    headers = {
        "userID": BHASHINI_USER_ID,
        "ulcaApiKey": BHASHINI_UDYAT_KEY,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=BHASHINI_STT_PIPELINE_TIMEOUT) as client:
        pipe_resp = await client.post(BHASHINI_PIPELINE_URL, json=pipeline_payload, headers=headers)
        pipe_data = pipe_resp.json()

    pipe_config = pipe_data.get("pipelineResponseConfig", [{}])[0]
    service_url = pipe_data.get("pipelineInferenceAPIEndPoint", {}).get("callbackUrl", BHASHINI_INFERENCE_URL)
    infer_key = pipe_data.get("pipelineInferenceAPIEndPoint", {}).get(
        "inferenceApiKey", {}).get("value", BHASHINI_INFERENCE_KEY)

    infer_payload = {
        "pipelineTasks": [{
            "taskType": "asr",
            "config": {
                "serviceId": pipe_config.get("config", [{}])[0].get("serviceId", ""),
                "language": {"sourceLanguage": lang_code},
                "audioFormat": "wav",
                "samplingRate": 16000
            }
        }],
        "inputData": {"audio": [{"audioContent": audio_b64}]}
    }
    infer_headers = {"Authorization": infer_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=BHASHINI_STT_INFERENCE_TIMEOUT) as client:
        resp = await client.post(service_url, json=infer_payload, headers=infer_headers)
        data = resp.json()

    output = data.get("pipelineResponse", [{}])[0].get("output", [{}])[0].get("source", "")
    return output.strip()


# ── GROQ WHISPER ──────────────────────────────────────────────────────────────

async def _groq_whisper(audio_bytes: bytes, lang_code: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files={"file": ("audio.wav", io.BytesIO(audio_bytes), "audio/wav")},
            data={"model": GROQ_WHISPER_MODEL, "language": lang_code}
        )
        data = resp.json()

    if "error" in data:
        raise Exception(f"Groq error: {data['error']}")

    return data.get("text", "").strip()


async def _groq_whisper_autodetect(audio_bytes: bytes):
    """
    Call Groq Whisper WITHOUT a language hint, verbose_json response so we
    get back the language Whisper actually detected.
    Returns: (text, detected_lang_code)
    Raises on HTTP/API error (caller wraps in _safe_groq_autodetect).
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files={"file": ("audio.wav", io.BytesIO(audio_bytes), "audio/wav")},
            data={"model": GROQ_WHISPER_MODEL, "response_format": "verbose_json"}
        )
        data = resp.json()

    if "error" in data:
        # Surface the REAL error (bad key, bad file, rate limit, etc.)
        raise Exception(f"Groq API error: {data['error']}")

    text = (data.get("text") or "").strip()
    detected_code = (data.get("language") or "").strip().lower()
    return text, detected_code


# ── SARVAM ────────────────────────────────────────────────────────────────────

async def _sarvam_stt(audio_bytes: bytes, lang_code: str) -> str:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            SARVAM_STT_URL,
            headers={"api-subscription-key": SARVAM_API_KEY},
            files={"file": ("audio.wav", io.BytesIO(audio_bytes), "audio/wav")},
            data={"language_code": lang_code, "model": "saarika:v2.5"}
        )
        data = resp.json()

    if "error" in data:
        raise Exception(f"Sarvam error: {data['error']}")

    return data.get("transcript", "").strip()


async def _sarvam_autodetect(audio_bytes: bytes):
    """
    Call Sarvam STT with language_code='unknown' so Sarvam auto-detects.
    Returns: (text, detected_lang_code e.g. 'mr-IN')
    Raises on HTTP/API error (caller wraps in _safe_sarvam_autodetect).
    """
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            SARVAM_STT_URL,
            headers={"api-subscription-key": SARVAM_API_KEY},
            files={"file": ("audio.wav", io.BytesIO(audio_bytes), "audio/wav")},
            data={"language_code": "unknown", "model": "saarika:v2.5"}
        )
        data = resp.json()

    if "error" in data:
        raise Exception(f"Sarvam API error: {data['error']}")

    text = (data.get("transcript") or "").strip()
    detected_code = (data.get("language_code") or "").strip()
    return text, detected_code