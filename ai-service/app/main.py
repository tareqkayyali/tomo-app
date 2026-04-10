"""
Tomo AI Service — FastAPI Entry Point
Enterprise coaching intelligence powered by LangGraph + LangSmith.
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.supabase import init_db_pool, close_db_pool
from app.routes.chat import router as chat_router
from app.routes.health import router as health_router
from app.routes.aib import router as aib_router


logger = logging.getLogger("tomo-ai")


def configure_langsmith():
    """Configure LangSmith tracing — auto-traces all LangGraph executions."""
    settings = get_settings()
    if settings.langsmith_api_key:
        os.environ["LANGCHAIN_TRACING_V2"] = str(settings.langchain_tracing_v2).lower()
        os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
        os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
        logger.info(
            f"LangSmith tracing enabled → project: {settings.langchain_project}"
        )
    else:
        os.environ["LANGCHAIN_TRACING_V2"] = "false"
        logger.warning("LangSmith API key not set — tracing disabled")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown."""
    settings = get_settings()

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    )

    # Configure LangSmith (must be before any LangGraph imports)
    configure_langsmith()

    # Initialize database connection pool
    await init_db_pool()

    logger.info(
        f"Tomo AI Service started | env={settings.environment} | port={settings.port}"
    )

    yield

    # Shutdown
    await close_db_pool()
    logger.info("Tomo AI Service stopped")


app = FastAPI(
    title="Tomo AI Service",
    description="Enterprise coaching intelligence — LangGraph + Zep + LlamaIndex",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — only allow internal Railway traffic + local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8081",
        "https://app.my-tomo.com",
        "https://5qakhaec.up.railway.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health_router)
app.include_router(chat_router, prefix="/api/v1")
app.include_router(aib_router, prefix="/api/v1")
