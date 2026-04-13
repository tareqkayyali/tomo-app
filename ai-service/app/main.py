"""
Tomo AI Service — FastAPI Entry Point
Enterprise coaching intelligence powered by LangGraph + LangSmith.

Includes APScheduler for LangSmith feedback loop:
  - Layer 1: 6h acute pulse (collect + analyze)
  - Layer 2: Weekly trend analysis (Monday 02:00 UTC)
  - Layer 3: Monthly digest (1st of month 03:00 UTC)
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
from app.routes.tenants import router as tenants_router
from app.routes.admin_ai_health import router as ai_health_router


logger = logging.getLogger("tomo-ai")

# APScheduler instance — initialized in lifespan
_scheduler = None


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

    # Start LangSmith feedback loop scheduler
    global _scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.interval import IntervalTrigger
        from apscheduler.triggers.cron import CronTrigger
        from app.services.langsmith_collector import run_collection_cycle
        from app.services.issue_analyzer import analyze_open_issues
        from app.services.weekly_trend_analyzer import run_weekly_trend_analysis
        from app.services.monthly_digest_generator import run_monthly_digest

        async def _layer1_job():
            """Layer 1: 6h acute pulse — collect + analyze."""
            try:
                result = await run_collection_cycle()
                fixes = await analyze_open_issues()
                logger.info(
                    f"Feedback loop L1: {result.get('issues_detected', 0)} issues, "
                    f"{fixes} fixes generated"
                )
            except Exception as e:
                logger.error(f"Feedback loop L1 failed: {e}")

        async def _layer2_job():
            """Layer 2: Weekly trend analysis."""
            try:
                result = await run_weekly_trend_analysis()
                logger.info(f"Feedback loop L2: {result}")
            except Exception as e:
                logger.error(f"Feedback loop L2 failed: {e}")

        async def _layer3_job():
            """Layer 3: Monthly digest."""
            try:
                result = await run_monthly_digest()
                logger.info(f"Feedback loop L3: {result}")
            except Exception as e:
                logger.error(f"Feedback loop L3 failed: {e}")

        _scheduler = AsyncIOScheduler()

        # Layer 1: every 6 hours
        _scheduler.add_job(_layer1_job, IntervalTrigger(hours=6), id="langsmith_l1")

        # Layer 2: Monday 02:00 UTC
        _scheduler.add_job(_layer2_job, CronTrigger(day_of_week="mon", hour=2), id="langsmith_l2")

        # Layer 3: 1st of month 03:00 UTC
        _scheduler.add_job(_layer3_job, CronTrigger(day=1, hour=3), id="langsmith_l3")

        _scheduler.start()
        logger.info("LangSmith feedback loop scheduler started (L1=6h, L2=Mon, L3=1st)")

    except ImportError:
        logger.warning("apscheduler not installed — feedback loop scheduler disabled")
    except Exception as e:
        logger.error(f"Feedback loop scheduler failed to start: {e}")

    # ── v2 Architecture Diagnostic ──────────────────────────────────
    # Log exact env var values so deploy logs confirm v2 activation
    _cv = os.environ.get("CLASSIFIER_VERSION", "NOT_SET")
    _av = os.environ.get("AGENT_VERSION", "NOT_SET")
    _ss = os.environ.get("SONNET_SHADOW", "NOT_SET")
    logger.info(
        f"[V2 CONFIG] CLASSIFIER_VERSION={repr(_cv)} "
        f"AGENT_VERSION={repr(_av)} "
        f"SONNET_SHADOW={repr(_ss)}"
    )
    if _cv != "sonnet":
        logger.warning(
            f"[V2 CONFIG] Sonnet classifier NOT active! "
            f"CLASSIFIER_VERSION={repr(_cv)} (expected 'sonnet'). "
            f"Check Railway env vars for extra quotes or spaces."
        )

    logger.info(
        f"Tomo AI Service started | env={settings.environment} | port={settings.port}"
    )

    yield

    # Shutdown scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        logger.info("Feedback loop scheduler stopped")

    # Shutdown database
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
app.include_router(tenants_router, prefix="/api/v1")
app.include_router(ai_health_router)
