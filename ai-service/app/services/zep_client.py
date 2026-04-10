"""
Tomo AI Service — Zep CE Async Client
Direct httpx client for Zep CE REST API (self-hosted).

Uses httpx instead of zep-python SDK to avoid version compatibility issues
between Zep CE and Zep Cloud SDKs. Full control, no dependency drift.

Zep CE API reference:
  POST   /api/v1/users                      — Create user
  GET    /api/v1/users/{user_id}             — Get user
  POST   /api/v1/sessions                    — Create session
  GET    /api/v1/sessions/{session_id}       — Get session
  DELETE /api/v1/sessions/{session_id}       — Delete session
  POST   /api/v1/sessions/{session_id}/memory — Add memory (messages)
  GET    /api/v1/sessions/{session_id}/memory — Get memory (with facts)
  POST   /api/v1/sessions/{session_id}/search — Search memory
  GET    /api/v1/users/{user_id}/sessions    — List user sessions
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger("tomo-ai.zep")


# ── Data classes ──────────────────────────────────────────────────────

@dataclass
class ZepMessage:
    """A single message in Zep memory."""
    role: str  # "human" | "ai" | "system"
    content: str
    role_type: str = "user"  # "user" | "assistant" | "system"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ZepFact:
    """An extracted fact from Zep entity extraction."""
    fact: str
    rating: float = 0.0
    created_at: str = ""


@dataclass
class ZepMemoryResult:
    """Result from Zep memory retrieval."""
    facts: list[ZepFact]
    messages: list[ZepMessage]
    summary: Optional[str] = None
    relevant_facts: list[ZepFact] = field(default_factory=list)


@dataclass
class ZepSearchResult:
    """Result from Zep semantic search."""
    message: ZepMessage
    score: float
    summary: Optional[str] = None


# ── Client ────────────────────────────────────────────────────────────

class ZepClient:
    """
    Async client for Zep CE REST API.

    Usage:
        client = ZepClient()
        await client.ensure_user(user_id)
        await client.add_memory(session_id, user_id, messages)
        result = await client.get_memory(session_id)
        search = await client.search_memory(session_id, query)
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 10.0,
    ):
        settings = get_settings()
        self.base_url = (base_url or settings.zep_base_url).rstrip("/")
        self.api_key = api_key or settings.zep_api_key
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-init async httpx client."""
        if self._client is None or self._client.is_closed:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=self.timeout,
            )
        return self._client

    async def close(self) -> None:
        """Close the httpx client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ── Health ────────────────────────────────────────────────────────

    async def health_check(self) -> bool:
        """Check if Zep CE is healthy."""
        try:
            client = await self._get_client()
            resp = await client.get("/healthz")
            return resp.status_code == 200
        except Exception:
            return False

    # ── Users ─────────────────────────────────────────────────────────

    async def ensure_user(self, user_id: str, metadata: Optional[dict] = None) -> bool:
        """
        Create user if not exists. Returns True if created, False if already exists.
        """
        try:
            client = await self._get_client()

            # Check if user exists
            resp = await client.get(f"/api/v1/users/{user_id}")
            if resp.status_code == 200:
                return False

            # Create user
            payload: dict[str, Any] = {"user_id": user_id}
            if metadata:
                payload["metadata"] = metadata
            resp = await client.post("/api/v1/users", json=payload)
            resp.raise_for_status()
            logger.info(f"Zep user created: {user_id}")
            return True

        except Exception as e:
            logger.warning(f"Zep ensure_user failed for {user_id}: {e}")
            return False

    # ── Sessions ──────────────────────────────────────────────────────

    async def create_session(
        self,
        session_id: str,
        user_id: str,
        metadata: Optional[dict] = None,
    ) -> Optional[dict]:
        """Create a Zep session for a conversation."""
        try:
            client = await self._get_client()
            payload: dict[str, Any] = {
                "session_id": session_id,
                "user_id": user_id,
            }
            if metadata:
                payload["metadata"] = metadata
            resp = await client.post("/api/v1/sessions", json=payload)
            if resp.status_code in (200, 201):
                return resp.json()
            elif resp.status_code == 409:
                # Session already exists — fine
                return {"session_id": session_id, "exists": True}
            else:
                logger.warning(f"Zep create_session {session_id}: {resp.status_code}")
                return None
        except Exception as e:
            logger.warning(f"Zep create_session failed: {e}")
            return None

    async def get_user_sessions(
        self, user_id: str, limit: int = 10
    ) -> list[dict]:
        """List recent sessions for a user."""
        try:
            client = await self._get_client()
            resp = await client.get(
                f"/api/v1/users/{user_id}/sessions",
                params={"limit": limit},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else data.get("sessions", [])
            return []
        except Exception as e:
            logger.warning(f"Zep get_user_sessions failed: {e}")
            return []

    # ── Memory ────────────────────────────────────────────────────────

    async def add_memory(
        self,
        session_id: str,
        messages: list[ZepMessage],
    ) -> bool:
        """
        Add conversation messages to Zep memory.
        Zep automatically extracts entities and facts.
        """
        try:
            client = await self._get_client()
            payload = {
                "messages": [
                    {
                        "role": msg.role,
                        "role_type": msg.role_type,
                        "content": msg.content,
                        "metadata": msg.metadata,
                    }
                    for msg in messages
                ]
            }
            resp = await client.post(
                f"/api/v1/sessions/{session_id}/memory",
                json=payload,
            )
            if resp.status_code in (200, 201):
                logger.debug(f"Zep memory added: {len(messages)} messages to {session_id[:8]}...")
                return True
            else:
                logger.warning(f"Zep add_memory {session_id}: {resp.status_code} {resp.text[:200]}")
                return False
        except Exception as e:
            logger.warning(f"Zep add_memory failed: {e}")
            return False

    async def get_memory(
        self,
        session_id: str,
        lastn: int = 20,
    ) -> Optional[ZepMemoryResult]:
        """
        Get memory for a session including extracted facts.
        """
        try:
            client = await self._get_client()
            resp = await client.get(
                f"/api/v1/sessions/{session_id}/memory",
                params={"lastn": lastn},
            )
            if resp.status_code != 200:
                return None

            data = resp.json()
            facts = [
                ZepFact(
                    fact=f.get("fact", ""),
                    rating=f.get("rating", 0.0),
                    created_at=f.get("created_at", ""),
                )
                for f in data.get("facts", [])
            ]
            messages = [
                ZepMessage(
                    role=m.get("role", ""),
                    content=m.get("content", ""),
                    role_type=m.get("role_type", ""),
                    metadata=m.get("metadata", {}),
                )
                for m in data.get("messages", [])
            ]
            return ZepMemoryResult(
                facts=facts,
                messages=messages,
                summary=data.get("summary", {}).get("content") if data.get("summary") else None,
            )
        except Exception as e:
            logger.warning(f"Zep get_memory failed: {e}")
            return None

    async def search_memory(
        self,
        session_id: str,
        query: str,
        limit: int = 5,
        search_scope: str = "messages",
    ) -> list[ZepSearchResult]:
        """
        Semantic search across session memory.
        search_scope: "messages" | "summary"
        """
        try:
            client = await self._get_client()
            payload = {
                "text": query,
                "search_scope": search_scope,
                "search_type": "similarity",
                "metadata": {},
            }
            resp = await client.post(
                f"/api/v1/sessions/{session_id}/search",
                json=payload,
                params={"limit": limit},
            )
            if resp.status_code != 200:
                return []

            results = resp.json()
            if not isinstance(results, list):
                results = results.get("results", [])

            return [
                ZepSearchResult(
                    message=ZepMessage(
                        role=r.get("message", {}).get("role", ""),
                        content=r.get("message", {}).get("content", ""),
                    ),
                    score=r.get("score", 0.0),
                    summary=r.get("summary"),
                )
                for r in results
            ]
        except Exception as e:
            logger.warning(f"Zep search_memory failed: {e}")
            return []

    # ── Cross-session facts ───────────────────────────────────────────

    async def get_user_facts(
        self, user_id: str, limit: int = 20
    ) -> list[ZepFact]:
        """
        Get facts extracted across ALL sessions for a user.
        This is the key cross-session memory feature.
        """
        try:
            sessions = await self.get_user_sessions(user_id, limit=limit)
            all_facts: list[ZepFact] = []
            seen: set[str] = set()

            for session in sessions[:limit]:
                sid = session.get("session_id", "")
                if not sid:
                    continue
                memory = await self.get_memory(sid, lastn=0)
                if memory and memory.facts:
                    for fact in memory.facts:
                        # Deduplicate by content
                        key = fact.fact.lower().strip()
                        if key not in seen:
                            seen.add(key)
                            all_facts.append(fact)

            # Sort by rating (highest first)
            all_facts.sort(key=lambda f: f.rating, reverse=True)
            return all_facts[:limit]

        except Exception as e:
            logger.warning(f"Zep get_user_facts failed: {e}")
            return []


# ── Module-level singleton ────────────────────────────────────────────

_zep_client: Optional[ZepClient] = None


def get_zep_client() -> ZepClient:
    """Get or create the module-level Zep client singleton."""
    global _zep_client
    if _zep_client is None:
        _zep_client = ZepClient()
    return _zep_client
