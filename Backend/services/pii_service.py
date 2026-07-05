# services/pii_service.py
# PII masking layer — sensitive identifiers are replaced with opaque tokens
# BEFORE any text is sent to a third-party LLM (Groq), and restored in the
# response afterwards. The third party therefore never sees real Aadhaar,
# PAN, phone or account numbers — only placeholders like <PHONE_1>.
#
# This is the concrete answer to "customer data goes through US-based /
# third-party APIs — what about security?":
#   raw speech -> transcript -> [MASK PII] -> LLM -> response -> [UNMASK]
#
# Masking is applied only to USER-role message content (the customer's /
# staff's words). System prompts contain the bank's own published numbers
# (helpline 09223008586, rates, etc.) which must NOT be masked.

import re
from typing import Dict, Tuple

# Order matters: longer/more specific patterns first so e.g. a 12-digit
# Aadhaar isn't partially consumed by the 10-digit phone pattern.
PII_PATTERNS = [
    # Aadhaar: 12 digits, optionally grouped 4-4-4
    ("AADHAAR", re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b")),
    # PAN: 5 letters, 4 digits, 1 letter
    ("PAN", re.compile(r"\b[A-Za-z]{5}\d{4}[A-Za-z]\b")),
    # Bank account number: 11-16 consecutive digits
    ("ACCOUNT", re.compile(r"\b\d{11,16}\b")),
    # Indian mobile: 10 digits starting 6-9, optional +91/0 prefix
    ("PHONE", re.compile(r"(?:\+91[\s-]?|0)?\b[6-9]\d{9}\b")),
]


def mask_text(text: str) -> Tuple[str, Dict[str, str]]:
    """
    Replace PII in `text` with tokens. Returns (masked_text, mapping)
    where mapping is {token: original_value} for later restoration.
    """
    mapping: Dict[str, str] = {}
    counters: Dict[str, int] = {}

    def _replace(kind):
        def _sub(m):
            value = m.group(0)
            # Reuse token if the same value appears again
            for tok, orig in mapping.items():
                if orig == value:
                    return tok
            counters[kind] = counters.get(kind, 0) + 1
            token = f"<{kind}_{counters[kind]}>"
            mapping[token] = value
            return token
        return _sub

    masked = text
    for kind, pattern in PII_PATTERNS:
        masked = pattern.sub(_replace(kind), masked)
    return masked, mapping


def unmask_text(text: str, mapping: Dict[str, str]) -> str:
    """Restore original PII values for tokens the LLM echoed back."""
    for token, original in mapping.items():
        text = text.replace(token, original)
    return text


def mask_for_display(value: str, kind: str = "AADHAAR") -> str:
    """
    Human-facing partial mask for UI display, e.g. 'XXXX XXXX 6789'.
    Never show a full Aadhaar/account number on screen.
    """
    digits = re.sub(r"\D", "", value)
    if not digits:
        return value
    visible = digits[-4:]
    if kind == "AADHAAR":
        return f"XXXX XXXX {visible}"
    return "X" * max(0, len(digits) - 4) + visible
