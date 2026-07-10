from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .errors import AppError
from .routers import generate, jobs, measure
from .services.meshy import STORAGE_DIR

load_dotenv()

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

app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")
