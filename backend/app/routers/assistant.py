# Phase 3: POST /api/assistant/message, backed by services/assistant.py.
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["assistant"])
