"""
Tomo AI Service — Observability Metadata Builder
Computes 40+ metadata fields and categorical tags from graph state
for LangSmith trace enrichment.

Two delivery mechanisms:
  1. persist_node returns _observability in state → visible in trace output
  2. create_observability_trace() creates a separate lightweight trace with
     all fields as native LangSmith metadata + tags → fully filterable
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import os

logger = logging.getLogger("tomo-ai.observability")

_ls_client = None


def _get_langsmith_client():
    """Lazy singleton for LangSmith client."""
    global _ls_client
    if _ls_client is None:
        from langsmith import Client
        _ls_client = Client()
    return _ls_client


def _create_observability_trace_sync(
    result: dict,
    message: str,
    user_id: str,
    session_id: str,
    request_id: str,
) -> None:
    """
    Synchronous implementation — called via asyncio.to_thread() so it
    never blocks the FastAPI event loop.

    Uses POST /runs (not PATCH) so it works on Personal plan.
    All computed fields become native LangSmith metadata (filterable)
    and tags (filterable).
    """
    post_metadata, post_tags = build_post_execution_metadata(result)

    # Add identity fields so we can cross-reference with main traces
    post_metadata["request_id"] = request_id
    post_metadata["user_id"] = user_id
    post_metadata["session_id"] = session_id

    obs_project = os.environ.get("LANGCHAIN_PROJECT", "tomo-ai")

    client = _get_langsmith_client()
    now = datetime.datetime.now(datetime.timezone.utc)

    path_type = post_metadata.get("path_type", "ai")
    agent_type = post_metadata.get("agent_type", "unknown")

    client.create_run(
        name=f"tomo:{path_type}:{agent_type}",
        run_type="chain",
        inputs={"message": message},
        outputs={"summary": post_metadata},
        extra={"metadata": post_metadata},
        tags=post_tags,
        project_name=obs_project,
        start_time=now,
        end_time=now,
    )


async def create_observability_trace(
    result: dict,
    message: str,
    user_id: str,
    session_id: str,
    request_id: str,
) -> None:
    """
    Fire-and-forget observability trace — runs in a background thread
    so it NEVER blocks the chat response to the user.

    Enterprise pattern: analytics/observability must never impact
    user-facing latency.
    """
    try:
        await asyncio.to_thread(
            _create_observability_trace_sync,
            result=result,
            message=message,
            user_id=user_id,
            session_id=session_id,
            request_id=request_id,
        )
    except Exception as e:
        # Observability failure must never propagate
        logger.debug(f"Observability trace failed (non-blocking): {e}")


def build_post_execution_metadata(state: dict) -> tuple[dict, list[str]]:
    """
    Extract post-execution metadata + tags from graph state.

    Returns:
        (metadata_dict, tags_list) — injected into state._observability
        and captured by LangSmith auto-tracer in the graph output.
    """
    metadata: dict = {}
    tags: list[str] = []

    # ── Path type ──
    route = state.get("route_decision", "ai")
    write_confirmed = state.get("write_confirmed", False)
    if write_confirmed:
        path_type = "confirmed_write"
    elif route == "capsule":
        path_type = "capsule"
    else:
        path_type = "full_ai"
    metadata["path_type"] = path_type
    tags.append(f"path:{path_type}")

    # ── Agent type ──
    agent = state.get("selected_agent", "unknown")
    metadata["agent_type"] = agent
    tags.append(f"agent:{agent}")

    # ── Classification layer + intent ──
    layer = state.get("classification_layer", "unknown")
    metadata["classification_layer"] = layer
    tags.append(f"layer:{layer}")
    metadata["intent_id"] = state.get("intent_id", "unknown")

    # ── Confidence + bucket ──
    conf = state.get("routing_confidence", 0.0) or 0.0
    metadata["routing_confidence"] = conf
    if conf < 0.65:
        conf_bucket = "low"
    elif conf <= 0.85:
        conf_bucket = "medium"
    else:
        conf_bucket = "high"
    metadata["confidence_bucket"] = conf_bucket
    tags.append(f"confidence:{conf_bucket}")

    # ── Tool count + bucket ──
    tool_calls = state.get("tool_calls", [])
    tool_count = len(tool_calls)
    metadata["tool_count"] = tool_count
    metadata["tool_names"] = [tc.get("name", "") for tc in tool_calls]
    if tool_count == 0:
        tool_bucket = "none"
    elif tool_count <= 2:
        tool_bucket = "light"
    else:
        tool_bucket = "heavy"
    metadata["tool_bucket"] = tool_bucket
    tags.append(f"tools:{tool_bucket}")

    # ── Cost + bucket ──
    cost = state.get("total_cost_usd", 0.0) or 0.0
    metadata["total_cost_usd"] = cost
    if route == "capsule":
        cost_bucket = "free"
    elif cost < 0.001:
        cost_bucket = "cheap"
    elif cost < 0.01:
        cost_bucket = "moderate"
    else:
        cost_bucket = "expensive"
    metadata["cost_bucket"] = cost_bucket
    tags.append(f"cost:{cost_bucket}")

    # ── Tokens ──
    metadata["total_tokens"] = state.get("total_tokens", 0)

    # ── Latency + bucket ──
    latency = state.get("latency_ms", 0.0) or 0.0
    metadata["latency_ms"] = latency
    if latency < 500:
        latency_bucket = "fast"
    elif latency <= 2000:
        latency_bucket = "normal"
    else:
        latency_bucket = "slow"
    metadata["latency_bucket"] = latency_bucket
    tags.append(f"latency:{latency_bucket}")

    # ── Validation ──
    metadata["validation_passed"] = state.get("validation_passed", True)
    flags = state.get("validation_flags", [])
    metadata["validation_flags"] = flags
    metadata["validation_flag_count"] = len(flags)

    # Safety-specific boolean flags for direct filtering
    metadata["phv_gate_fired"] = "phv_safety_violation" in flags
    metadata["crisis_detected"] = "crisis_content_detected" in flags
    metadata["ped_detected"] = "ped_content_detected" in flags
    metadata["medical_warning"] = "medical_diagnosis_warning" in flags

    if metadata["phv_gate_fired"]:
        tags.append("safety:phv")
    if metadata["crisis_detected"]:
        tags.append("safety:crisis")
    if metadata["ped_detected"]:
        tags.append("safety:ped")
    if metadata["medical_warning"]:
        tags.append("safety:medical")
    if not flags:
        tags.append("validation:clean")
    else:
        tags.append("validation:flagged")

    # ── RAG ──
    rag_meta = state.get("rag_metadata") or {}
    metadata["rag_used"] = (
        rag_meta.get("entity_count", 0) > 0 or
        rag_meta.get("chunk_count", 0) > 0
    )
    metadata["rag_entity_count"] = rag_meta.get("entity_count", 0)
    metadata["rag_chunk_count"] = rag_meta.get("chunk_count", 0)
    metadata["rag_graph_hops"] = rag_meta.get("graph_hops", 0)
    metadata["rag_sub_questions"] = rag_meta.get("sub_questions", 0)
    metadata["rag_cost_usd"] = rag_meta.get("retrieval_cost_usd", 0.0)
    metadata["rag_latency_ms"] = rag_meta.get("latency_ms", 0.0)
    tags.append("rag:used" if metadata["rag_used"] else "rag:skipped")

    # ── Write actions ──
    has_pending = state.get("pending_write_action") is not None
    metadata["has_pending_write"] = has_pending
    metadata["write_confirmed"] = write_confirmed
    if has_pending:
        tags.append("write:pending")
    if write_confirmed:
        tags.append("write:confirmed")

    # ── Capsule type ──
    capsule = state.get("capsule_type")
    if capsule:
        metadata["capsule_type"] = capsule
        tags.append(f"capsule:{capsule}")

    # ── Player context demographics ──
    player_ctx = state.get("player_context")
    if player_ctx:
        sport = getattr(player_ctx, "sport", None)
        position = getattr(player_ctx, "position", None)
        age_band = getattr(player_ctx, "age_band", None)
        readiness_rag = getattr(player_ctx, "readiness_score", None)  # "Yellow"/"Green"/"Red"

        if sport:
            metadata["sport"] = sport
            tags.append(f"sport:{sport}")
        if position:
            metadata["position"] = position
        if age_band:
            metadata["age_band"] = age_band
            tags.append(f"age:{age_band}")
        if readiness_rag:
            metadata["readiness_rag"] = readiness_rag
            tags.append(f"readiness:{readiness_rag}")

        # Snapshot enrichment — PHV, numeric readiness, injury, ACWR, dual load
        snapshot = getattr(player_ctx, "snapshot_enrichment", None)
        if snapshot:
            # PHV stage
            phv = getattr(snapshot, "phv_stage", None)
            if phv:
                metadata["phv_stage"] = phv
                tags.append(f"phv:{phv}")

            # Numeric readiness (0-100) + bucket
            numeric_readiness = getattr(snapshot, "readiness_score", 0) or 0
            metadata["readiness_score"] = numeric_readiness
            readiness_bucket = (
                "low" if numeric_readiness < 50 else
                "medium" if numeric_readiness < 75 else
                "high"
            )
            metadata["readiness_bucket"] = readiness_bucket

            # Injury risk flag
            injury_risk = getattr(snapshot, "injury_risk_flag", "UNKNOWN") or "UNKNOWN"
            metadata["injury_risk"] = injury_risk
            tags.append(f"injury:{injury_risk.lower()}")

            # ACWR + bucket
            acwr = getattr(snapshot, "acwr", 0.0) or 0.0
            metadata["acwr"] = acwr
            acwr_bucket = (
                "danger" if acwr > 1.5 else
                "caution" if acwr > 1.3 else
                "safe"
            )
            metadata["acwr_bucket"] = acwr_bucket
            tags.append(f"acwr:{acwr_bucket}")

            # Dual load zone
            dlz = getattr(snapshot, "dual_load_zone", None)
            if dlz:
                metadata["dual_load_zone"] = dlz
                tags.append(f"dlz:{dlz.lower()}")

            # Data confidence score (0-100)
            data_conf = getattr(snapshot, "data_confidence_score", 0) or 0
            metadata["data_confidence_score"] = data_conf

            # Check-in staleness (days since last check-in)
            last_checkin = getattr(snapshot, "last_checkin_at", None)
            today_date = getattr(player_ctx, "today_date", None)
            if last_checkin and today_date:
                try:
                    from datetime import datetime as dt
                    checkin_date_str = str(last_checkin)[:10]
                    staleness = (
                        dt.strptime(today_date, "%Y-%m-%d")
                        - dt.strptime(checkin_date_str, "%Y-%m-%d")
                    ).days
                    metadata["checkin_staleness_days"] = staleness
                    tags.append(f"stale:{staleness}d")
                except Exception:
                    metadata["checkin_staleness_days"] = -1
            else:
                metadata["checkin_staleness_days"] = -1

    return metadata, tags
