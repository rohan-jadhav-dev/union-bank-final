# services/tts_service.py
# Pipeline: Bhashini TTS → Sarvam TTS fallback
#
# TIMEOUT FIX: Bhashini's pipeline+inference calls previously used 15s/25s
# httpx timeouts. When Bhashini is down or the API key is invalid, the
# request doesn't fail fast — it hangs close to the full timeout window
# (observed ~26s in production logs) before giving up and falling through
# to Sarvam, and only after Sarvam also fails does the frontend's browser
# speech-synthesis fallback kick in. That made every failed TTS call feel
# like a ~30+ second freeze to the customer.
#
# Both Bhashini calls are now capped at 6s (matching the frontend's own
# TTS_TIMEOUT_MS), so a dead/slow Bhashini endpoint fails fast and the
# Sarvam → browser-voice fallback chain kicks in much sooner.

import httpx
import base64
import hashlib
import logging
from collections import OrderedDict
from services.http_client import client as http
from config import (
    BHASHINI_USER_ID, BHASHINI_UDYAT_KEY, BHASHINI_INFERENCE_KEY,
    BHASHINI_PIPELINE_URL, BHASHINI_INFERENCE_URL,
    SARVAM_API_KEY, SARVAM_TTS_URL,
    LANGUAGE_CODES
)

logger = logging.getLogger(__name__)

# Sarvam speaker map per language
SARVAM_SPEAKERS = {
    "hi-IN": "ritu",
    "mr-IN": "ritu",
    "ta-IN": "ritu",
    "te-IN": "ritu",
    "en-IN": "ritu",
}

# Short, fast-fail timeouts. Bhashini being slow/down should not make the
# customer wait — better to fail in ~6s and let Sarvam or the browser voice
# fallback take over than to hang for 15-25s per call.
BHASHINI_PIPELINE_TIMEOUT = 6.0
BHASHINI_INFERENCE_TIMEOUT = 6.0
SARVAM_TTS_TIMEOUT = 8.0

# ── TTS AUDIO CACHE ───────────────────────────────────────────────────────────
# Speaking the SAME text in the SAME language always produces the same audio, so
# there's no reason to re-synthesize it every time. The DPDP consent notice and
# the per-process greetings are FIXED strings repeated on every single session —
# generating them live was costing the customer ~10-20s each. We now cache the
# generated audio (keyed by language + a hash of the exact text) and return it
# instantly on repeat. This is 100% accuracy-safe: it's the identical audio, not
# a re-generation. Bounded to the most recent N entries so memory stays flat.
_TTS_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_TTS_CACHE_MAX = 128


def _tts_cache_key(text: str, language: str) -> str:
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()
    return f"{language}::{digest}"


def _tts_cache_get(text: str, language: str):
    key = _tts_cache_key(text, language)
    hit = _TTS_CACHE.get(key)
    if hit is not None:
        _TTS_CACHE.move_to_end(key)  # mark as most-recently used
        return dict(hit)  # copy so callers can't mutate the cached entry
    return None


def _tts_cache_put(text: str, language: str, result: dict) -> None:
    # Only cache real, non-empty audio — never cache a failed/empty synth.
    if not result or not result.get("audio_b64"):
        return
    key = _tts_cache_key(text, language)
    _TTS_CACHE[key] = dict(result)
    _TTS_CACHE.move_to_end(key)
    while len(_TTS_CACHE) > _TTS_CACHE_MAX:
        _TTS_CACHE.popitem(last=False)  # evict least-recently used


async def synthesize_speech(text: str, language: str) -> dict:
    """
    Convert text → audio bytes (base64 encoded WAV/MP3).
    Returns: { "audio_b64": str, "engine": str, "language": str }
    """
    # Cache hit → return the identical audio instantly (no network, no synth).
    cached = _tts_cache_get(text, language)
    if cached is not None:
        logger.info(f"[TTS] cache hit ({language}, {len(text)} chars) — instant")
        cached["cached"] = True
        return cached

    lang_codes = LANGUAGE_CODES.get(language, LANGUAGE_CODES["Hindi"])

    # ORDER FIX: Bhashini TTS used to run FIRST, but with a dead/invalid key it
    # hangs up to ~12s (6s pipeline + 6s inference) before falling through to
    # Sarvam, which works. So every staff reply was eating that dead wait. Sarvam
    # now runs first; Bhashini is a last resort that almost never fires.
    # 1️⃣ Try Sarvam TTS (working engine)
    try:
        audio_b64 = await _sarvam_tts(text, lang_codes["sarvam"])
        if audio_b64:
            result = {"audio_b64": audio_b64, "engine": "sarvam", "language": language}
            _tts_cache_put(text, language, result)
            return result
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        logger.warning(f"Sarvam TTS timed out/unreachable ({SARVAM_TTS_TIMEOUT}s cap): {e}")
    except Exception as e:
        logger.warning(f"Sarvam TTS failed: {e}")

    # 2️⃣ Last resort — Bhashini key is currently dead, so this rarely runs.
    try:
        audio_b64 = await _bhashini_tts(text, lang_codes["bhashini"])
        if audio_b64:
            result = {"audio_b64": audio_b64, "engine": "bhashini", "language": language}
            _tts_cache_put(text, language, result)
            return result
    except (httpx.TimeoutException, httpx.ConnectError) as e:
        logger.warning(f"Bhashini TTS timed out/unreachable ({BHASHINI_PIPELINE_TIMEOUT}s cap): {e}")
    except Exception as e:
        logger.warning(f"Bhashini TTS failed: {e}")

    # Both failed fast — frontend's speakWithBrowserSynthesis() takes over
    # from here using the browser's built-in voice.
    return {"audio_b64": "", "engine": "none", "language": language}


async def _bhashini_tts(text: str, lang_code: str) -> str:
    """Call Bhashini TTS pipeline, return base64 audio."""
    pipeline_payload = {
        "pipelineTasks": [{"taskType": "tts", "config": {
            "language": {"sourceLanguage": lang_code},
            "gender": "female"
        }}],
        "pipelineRequestConfig": {"pipelineId": "64392f96daac500b55c543cd"}
    }
    headers = {
        "userID": BHASHINI_USER_ID,
        "ulcaApiKey": BHASHINI_UDYAT_KEY,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=BHASHINI_PIPELINE_TIMEOUT) as client:
        pipe_resp = await client.post(BHASHINI_PIPELINE_URL, json=pipeline_payload, headers=headers)
        pipe_data = pipe_resp.json()

    pipe_config = pipe_data.get("pipelineResponseConfig", [{}])[0]
    service_url = pipe_data.get("pipelineInferenceAPIEndPoint", {}).get("callbackUrl", BHASHINI_INFERENCE_URL)
    infer_key   = pipe_data.get("pipelineInferenceAPIEndPoint", {}).get(
        "inferenceApiKey", {}).get("value", BHASHINI_INFERENCE_KEY)

    infer_payload = {
        "pipelineTasks": [{
            "taskType": "tts",
            "config": {
                "serviceId": pipe_config.get("config", [{}])[0].get("serviceId", ""),
                "language": {"sourceLanguage": lang_code},
                "gender": "female",
                "samplingRate": 8000
            }
        }],
        "inputData": {"input": [{"source": text}]}
    }
    infer_headers = {"Authorization": infer_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=BHASHINI_INFERENCE_TIMEOUT) as client:
        resp = await client.post(service_url, json=infer_payload, headers=infer_headers)
        data = resp.json()

    audio_content = (data.get("pipelineResponse", [{}])[0]
                     .get("audio", [{}])[0]
                     .get("audioContent", ""))
    return audio_content  # already base64


async def _sarvam_tts(text: str, lang_code: str) -> str:
    """Call Sarvam AI TTS, return base64 audio."""
    speaker = SARVAM_SPEAKERS.get(lang_code, "anushka")
    payload = {
        "inputs": [text],
        "target_language_code": lang_code,
        "speaker": speaker,
        "model": "bulbul:v3",
        "enable_preprocessing": True
    }
    resp = await http.post(
        SARVAM_TTS_URL,
        headers={
            "api-subscription-key": SARVAM_API_KEY,
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=SARVAM_TTS_TIMEOUT,
    )
    data = resp.json()

    audios = data.get("audios", [])
    if audios:
        return audios[0]
    return ""