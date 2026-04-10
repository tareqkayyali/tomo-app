"""
Tomo AI Service — Supabase/PostgreSQL Database Layer
Async connection pool via psycopg3 for direct queries.
Supabase client for auth-aware operations.

Uses psycopg3 (not asyncpg) because Supabase Supavisor pooler uses
dot-format usernames (postgres.{project_ref}) which asyncpg cannot
handle during SCRAM authentication. psycopg3 passes the full username
correctly via libpq, making it the enterprise-grade choice for Supabase.
"""

import logging
from typing import Optional

from psycopg_pool import AsyncConnectionPool
from psycopg import AsyncConnection
from supabase import create_client, Client

from app.config import get_settings

logger = logging.getLogger("tomo-ai.db")

# Module-level pool and client references
_pool: Optional[AsyncConnectionPool] = None
_supabase: Optional[Client] = None


async def init_db_pool() -> None:
    """
    Initialize the psycopg3 async connection pool.
    Uses Supabase Supavisor pooler (port 6543) for connection pooling
    across 3 Railway services (tomo-app, tomo-ai, tomo-zep).
    """
    global _pool, _supabase
    settings = get_settings()

    try:
        _pool = AsyncConnectionPool(
            conninfo=settings.supabase_db_url,
            min_size=2,
            max_size=10,
            open=False,
            # Supavisor requires no prepared statements
            kwargs={"prepare_threshold": None},
        )
        await _pool.open()
        logger.info("psycopg3 pool initialized (Supavisor mode)")

        # Verify connectivity
        async with _pool.connection() as conn:
            result = await conn.execute("SELECT version()")
            row = await result.fetchone()
            if row:
                logger.info(f"PostgreSQL connected: {str(row[0])[:60]}...")

    except Exception as e:
        logger.error(f"Failed to initialize psycopg3 pool: {e}")
        _pool = None

    # Initialize Supabase client (for auth-aware operations)
    try:
        _supabase = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        logger.info("Supabase client initialized (service role)")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        _supabase = None


async def close_db_pool() -> None:
    """Gracefully close the psycopg3 pool on shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        logger.info("psycopg3 pool closed")
        _pool = None


def get_pool() -> Optional[AsyncConnectionPool]:
    """Get the psycopg3 async connection pool."""
    return _pool


def get_supabase() -> Optional[Client]:
    """Get the Supabase client (service role)."""
    return _supabase


async def get_db_status() -> dict:
    """
    Database health status for /health endpoint.
    Returns pool stats and connectivity check.
    """
    if not _pool:
        return {
            "connected": False,
            "error": "Pool not initialized",
        }

    try:
        async with _pool.connection() as conn:
            result = await conn.execute("SELECT 1")
            await result.fetchone()

        pool_stats = _pool.get_stats()
        return {
            "connected": True,
            "pool_size": pool_stats.get("pool_size", 0),
            "pool_available": pool_stats.get("pool_available", 0),
            "requests_waiting": pool_stats.get("requests_waiting", 0),
        }
    except Exception as e:
        return {
            "connected": False,
            "error": str(e),
        }
