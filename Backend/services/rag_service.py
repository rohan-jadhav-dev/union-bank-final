# services/rag_service.py
# Simple keyword-based RAG over banking_docs/info.txt
# (Upgrade to vector embeddings when you have more docs)

import os
import logging

logger = logging.getLogger(__name__)

# Load banking docs at startup
DOCS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "banking_docs", "info.txt")
_DOC_CONTENT = ""

def _load_docs():
    global _DOC_CONTENT
    try:
        with open(DOCS_PATH, "r", encoding="utf-8") as f:
            _DOC_CONTENT = f.read()
        logger.info(f"RAG: Loaded {len(_DOC_CONTENT)} chars from banking_docs/info.txt")
    except FileNotFoundError:
        logger.warning("RAG: banking_docs/info.txt not found, using empty context")
        _DOC_CONTENT = ""

_load_docs()


def get_rag_context(query: str, intent: str = "") -> str:
    """
    Retrieve relevant banking context for a query.
    Simple keyword search — replace with FAISS/chroma for production.
    """
    if not _DOC_CONTENT:
        return ""

    query_lower = query.lower()
    intent_lower = intent.lower()

    # Split doc into paragraphs
    paragraphs = [p.strip() for p in _DOC_CONTENT.split("\n\n") if p.strip()]

    # Score each paragraph by keyword overlap
    keywords = set(query_lower.split() + intent_lower.split())
    scored = []
    for para in paragraphs:
        para_lower = para.lower()
        score = sum(1 for kw in keywords if kw in para_lower and len(kw) > 3)
        if score > 0:
            scored.append((score, para))

    # Return top 3 most relevant paragraphs
    scored.sort(reverse=True, key=lambda x: x[0])
    top_paras = [p for _, p in scored[:3]]

    if top_paras:
        return "\n\nAdditional banking context from knowledge base:\n" + "\n\n".join(top_paras)
    return ""