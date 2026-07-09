import logging

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .errors import AppError
from .routers import assistant, generate, jobs, measure
from .services.meshy import STORAGE_DIR

load_dotenv()

logger = logging.getLogger("tulasi")

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


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Last-resort net: every specific failure mode should already be caught
    # and converted to an AppError closer to where it happens. This exists so
    # an exception type nobody anticipated still returns the product error
    # contract instead of a raw stack trace — "errors are product" applies
    # even to bugs we haven't found yet.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error_code": "internal_error",
            "human_message": "Something went wrong on our end.",
            "suggested_action": "Try again in a moment.",
        },
    )


app.include_router(generate.router)
app.include_router(jobs.router)
app.include_router(measure.router)
app.include_router(assistant.router)

app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")
