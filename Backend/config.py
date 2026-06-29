# config.py — VoiceAssist AI Backend Configuration
# All secrets now load from environment variables (.env file) instead of
# being hardcoded — your previous keys were exposed in plaintext and MUST
# be rotated on each provider's dashboard before you put new ones here.

import os
from dotenv import load_dotenv

load_dotenv()  # reads .env in the project root

# ── Groq ──────────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3")

# ── Bhashini ──────────────────────────────────────────────────────────────────
BHASHINI_USER_ID       = os.getenv("BHASHINI_USER_ID", "")
BHASHINI_UDYAT_KEY     = os.getenv("BHASHINI_UDYAT_KEY", "")
BHASHINI_INFERENCE_KEY = os.getenv("BHASHINI_INFERENCE_KEY", "")
BHASHINI_PIPELINE_URL  = os.getenv("BHASHINI_PIPELINE_URL", "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline")
BHASHINI_INFERENCE_URL = os.getenv("BHASHINI_INFERENCE_URL", "https://dhruva-api.bhashini.gov.in/services/inference/pipeline")

# ── Sarvam AI ─────────────────────────────────────────────────────────────────
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_TTS_URL = os.getenv("SARVAM_TTS_URL", "https://api.sarvam.ai/text-to-speech")
SARVAM_STT_URL = os.getenv("SARVAM_STT_URL", "https://api.sarvam.ai/speech-to-text")

# ── Deepgram (optional) ───────────────────────────────────────────────────────
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# ── Language Codes ────────────────────────────────────────────────────────────
LANGUAGE_CODES = {
    "Hindi":   {"bhashini": "hi", "sarvam": "hi-IN", "groq": "hi"},
    "Marathi": {"bhashini": "mr", "sarvam": "mr-IN", "groq": "mr"},
    "Tamil":   {"bhashini": "ta", "sarvam": "ta-IN", "groq": "ta"},
    "Telugu":  {"bhashini": "te", "sarvam": "te-IN", "groq": "te"},
    "English": {"bhashini": "en", "sarvam": "en-IN", "groq": "en"},
}

# ── App ───────────────────────────────────────────────────────────────────────
CORS_ORIGINS = ["*"]
MAX_AUDIO_SIZE_MB = 10