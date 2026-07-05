# services/http_client.py
# Shared, connection-pooled httpx client.
#
# WHY: previously every STT / TTS / LLM call created a brand-new
# httpx.AsyncClient (`async with httpx.AsyncClient(...) as client:`). That
# opens a fresh TCP connection AND does a full TLS handshake on every single
# request — ~100-300ms of pure overhead per call, and we make several calls
# per conversation turn (STT -> translate -> detect-step -> quick-replies -> TTS).
#
# Reusing one client with keep-alive keeps warm connections to Groq / Sarvam /
# Bhashini open, so repeated calls skip the handshake entirely. No behaviour or
# accuracy change — identical requests, just a warm socket.
#
# Per-request timeouts are still honoured: pass `timeout=` to each .post()/.get()
# and it overrides the client default for that call.

import httpx

# Keep a pool of warm connections per host. 20 idle sockets is plenty for a
# hackathon-scale deployment and costs nothing when unused.
_limits = httpx.Limits(
    max_keepalive_connections=20,
    max_connections=50,
    keepalive_expiry=30.0,
)

# Default timeout is a safety net only — callers override per request.
client = httpx.AsyncClient(limits=_limits, timeout=30.0)


async def aclose() -> None:
    """Close the shared client cleanly on app shutdown."""
    await client.aclose()
