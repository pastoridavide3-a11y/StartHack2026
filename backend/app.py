"""
FastAPI application for extraction, validation, requests, and process endpoints.
Run with: uvicorn backend.app:app --port 8010
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.extract import router as extract_router
from backend.routes.health import router as health_router
from backend.routes.process import router as process_router
from backend.routes.requests import router as requests_router
from backend.routes.validate import router as validate_router
from backend.routes.processed_outputs import router as processed_outputs_router


def _parse_allow_origins(value: str) -> list[str]:
    value = (value or "").strip()
    if not value:
        return ["*"]
    if value == "*":
        return ["*"]
    return [v.strip() for v in value.split(",") if v.strip()]


app = FastAPI(
    title="Extraction & Validation Service",
    version="0.1.0",
)

allow_origins = _parse_allow_origins(os.getenv("CORS_ALLOW_ORIGINS", "*"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(extract_router)
app.include_router(validate_router)
app.include_router(requests_router)
app.include_router(process_router)
app.include_router(processed_outputs_router)


@app.get("/")
def root():
    return {"service": "extraction-validation", "status": "ok"}
