"""
Tomo AI Service — Observability Metadata Builder
Computes 40+ metadata fields and categorical tags from graph state
for LangSmith trace enrichment.

Called by persist_node (last node before END) so the auto-tracer
captures the data in the graph output — no PATCH/update_run needed.
"""

from __future__ import annotations


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
    metadata["rag_used"] = bool(rag_meta.get("chunk_count", 0))
    metadata["rag_entity_count"] = rag_meta.get("entity_count", 0)
    metadata["rag_chunk_count"] = rag_meta.get("chunk_count", 0)
    metadata["rag_graph_hops"] = rag_meta.get("graph_hops", 0)
    metadata["rag_sub_questions"] = rag_meta.get("sub_questions", 0)
    metadata["rag_cost_usd"] = rag_meta.get("retrieval_cost_usd", 0.0)
    metadata["rag_latency_ms"] = rag_meta.get("latency_ms", 0.0)
    if metadata["rag_used"]:
        tags.append("rag:yes")

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
        readiness = getattr(player_ctx, "readiness_score", None)

        if sport:
            metadata["sport"] = sport
            tags.append(f"sport:{sport}")
        if position:
            metadata["position"] = position
        if age_band:
            metadata["age_band"] = age_band
            tags.append(f"age:{age_band}")
        if readiness:
            metadata["readiness_score"] = readiness
            tags.append(f"readiness:{readiness}")

        # PHV stage from snapshot enrichment
        snapshot = getattr(player_ctx, "snapshot_enrichment", None)
        if snapshot:
            phv = getattr(snapshot, "phv_stage", None)
            if phv:
                metadata["phv_stage"] = phv
                tags.append(f"phv:{phv}")

    return metadata, tags
