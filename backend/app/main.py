import logging
import sys

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .errors import AppError
from .routers import assistant, character, generate, jobs, measure, voice
from .services.meshy import STORAGE_DIR

# OpenVoice's phoneme cleaner prints IPA characters straight to stdout; on
# Windows that's cp1252 by default and crashes with UnicodeEncodeError the
# first time real voice synthesis runs. Reconfiguring here (not via an env
# var) means it's fixed regardless of who starts the process or how.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()
logging.basicConfig(level=logging.INFO)

STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Tulasi.ai backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.detail.model_dump())


app.include_router(generate.router)
app.include_router(jobs.router)
app.include_router(measure.router)
app.include_router(assistant.router)
app.include_router(voice.router)
app.include_router(character.router)

app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")
