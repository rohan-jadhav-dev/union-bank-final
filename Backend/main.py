# main.py — VoiceAssist AI FastAPI Backend
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.conversation import router as conversation_router
from config import CORS_ORIGINS
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")

app = FastAPI(
    title="VoiceAssist AI",
    description="Multilingual banking voice assistant API",
    version="2.5"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversation_router)


@app.get("/")
async def root():
    return {"message": "VoiceAssist AI Backend running", "version": "2.5"}