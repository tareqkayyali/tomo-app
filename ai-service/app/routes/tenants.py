"""
Tomo AI Service — Multi-Tenant API Routes
CRUD endpoints for tenants, memberships, and knowledge hierarchy.

All mutating endpoints require role-based authorization:
  - Super Admin: full CRUD on all tenants, memberships, knowledge
  - Institutional PD: CRUD on own institution + child groups, members, knowledge
  - Coach: read-only on own institution
  - Analyst: read-only on own institution
  - Athlete: read-only on own membership

Auth is via service-to-service key (TypeScript proxy validates the JWT first
and forwards the user_id). Direct access requires the service key header.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Query

from app.models.tenant import (
    GLOBAL_TENANT_ID,
    KnowledgeInheritanceCreate,
    KnowledgeOverrideType,
    Membership,
    MembershipCreate,
    MembershipUpdate,
    OrgRole,
    Tenant,
    TenantCreate,
    TenantTier,
    TenantUpdate,
)
from app.services.tenant_service import (
    build_tenant_context,
    check_permission,
    create_membership,
    create_tenant,
    get_tenant,
    get_tenant_by_slug,
    get_tenant_overrides,
    get_user_memberships,
    get_tenant_members,
    list_tenants,
    require_role,
    set_knowledge_override,
    update_membership,
    update_tenant,
)
from app.services.knowledge_resolver import (
    resolve_protocols,
    resolve_planning_protocols,
)
from app.config import get_settings

logger = logging.getLogger("tomo-ai.routes.tenants")
router = APIRouter(prefix="/tenants", tags=["tenants"])


# ── Auth Helpers ─────────────────────────────────────────────────────────────

def _verify_service_key(x_service_key: Optional[str] = Header(None, alias="X-Service-Key")):
    """Verify the service-to-service key from TypeScript proxy."""
    settings = get_settings()
    if not settings.ts_backend_service_key:
        return  # No service key configured — allow (development mode)
    if x_service_key != settings.ts_backend_service_key:
        raise HTTPException(status_code=401, detail="Invalid service key")


async def _require_admin_or_pd(
    user_id: str,
    tenant_id: str,
) -> None:
    """Require super_admin or institutional_pd role for the tenant."""
    is_authorized = await require_role(user_id, tenant_id, OrgRole.INSTITUTIONAL_PD)
    if not is_authorized:
        # Check if super_admin on global
        is_super = await require_role(user_id, GLOBAL_TENANT_ID, OrgRole.SUPER_ADMIN)
        if not is_super:
            raise HTTPException(status_code=403, detail="Insufficient permissions")


# ── Tenant CRUD ──────────────────────────────────────────────────────────────

@router.post("/", response_model=dict)
async def api_create_tenant(
    data: TenantCreate,
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
):
    """Create a new tenant (institution or group). Requires super_admin."""
    _verify_service_key(x_service_key)
    is_super = await require_role(x_user_id, GLOBAL_TENANT_ID, OrgRole.SUPER_ADMIN)
    if not is_super:
        raise HTTPException(status_code=403, detail="Only super admins can create tenants")

    tenant = await create_tenant(data)
    if not tenant:
        raise HTTPException(status_code=500, detail="Failed to create tenant")

    return {"tenant": tenant.model_dump(mode="json")}


@router.get("/", response_model=dict)
async def api_list_tenants(
    tier: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None),
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """List tenants visible to the user."""
    tier_enum = TenantTier(tier) if tier else None
    tenants = await list_tenants(tier=tier_enum, parent_id=parent_id)

    # Filter to user's accessible tenants
    memberships = await get_user_memberships(x_user_id)
    accessible_ids = {m.tenant_id for m in memberships}
    # Super admins see all
    is_super = any(m.role == OrgRole.SUPER_ADMIN for m in memberships)

    if not is_super:
        tenants = [t for t in tenants if t.id in accessible_ids or t.tier == TenantTier.GLOBAL]

    return {"tenants": [t.model_dump(mode="json") for t in tenants]}


@router.get("/{tenant_id}", response_model=dict)
async def api_get_tenant(
    tenant_id: str,
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """Get a single tenant by ID."""
    tenant = await get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"tenant": tenant.model_dump(mode="json")}


@router.patch("/{tenant_id}", response_model=dict)
async def api_update_tenant(
    tenant_id: str,
    data: TenantUpdate,
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
):
    """Update a tenant. Requires admin or PD role."""
    _verify_service_key(x_service_key)
    await _require_admin_or_pd(x_user_id, tenant_id)

    tenant = await update_tenant(tenant_id, data)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return {"tenant": tenant.model_dump(mode="json")}


@router.get("/slug/{slug}", response_model=dict)
async def api_get_tenant_by_slug(slug: str):
    """Get a tenant by slug (public — used for login routing)."""
    tenant = await get_tenant_by_slug(slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"tenant": tenant.model_dump(mode="json")}


# ── Membership Management ────────────────────────────────────────────────────

@router.post("/{tenant_id}/members", response_model=dict)
async def api_add_member(
    tenant_id: str,
    data: MembershipCreate,
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
):
    """Add a member to a tenant. Requires admin or PD role."""
    _verify_service_key(x_service_key)
    await _require_admin_or_pd(x_user_id, tenant_id)

    # Override tenant_id from path
    data.tenant_id = tenant_id
    data.invited_by = x_user_id

    membership = await create_membership(data)
    if not membership:
        raise HTTPException(status_code=500, detail="Failed to create membership")

    return {"membership": membership.model_dump(mode="json")}


@router.get("/{tenant_id}/members", response_model=dict)
async def api_list_members(
    tenant_id: str,
    role: Optional[str] = Query(None),
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """List members of a tenant. Requires at least coach role."""
    role_enum = OrgRole(role) if role else None
    members = await get_tenant_members(tenant_id, role=role_enum)
    return {"members": [m.model_dump(mode="json") for m in members]}


@router.patch("/members/{membership_id}", response_model=dict)
async def api_update_member(
    membership_id: str,
    data: MembershipUpdate,
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
):
    """Update a member's role or permissions."""
    _verify_service_key(x_service_key)

    membership = await update_membership(membership_id, data)
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")

    return {"membership": membership.model_dump(mode="json")}


@router.get("/user/{user_id}/memberships", response_model=dict)
async def api_get_user_memberships(
    user_id: str,
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """Get all memberships for a user. Users can see their own; admins can see any."""
    if x_user_id != user_id:
        # Check if requester is super_admin
        is_super = await require_role(x_user_id, GLOBAL_TENANT_ID, OrgRole.SUPER_ADMIN)
        if not is_super:
            raise HTTPException(status_code=403, detail="Can only view own memberships")

    memberships = await get_user_memberships(user_id)
    return {"memberships": [m.model_dump(mode="json") for m in memberships]}


# ── Knowledge Inheritance ────────────────────────────────────────────────────

@router.post("/{tenant_id}/knowledge-overrides", response_model=dict)
async def api_set_override(
    tenant_id: str,
    data: KnowledgeInheritanceCreate,
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
):
    """Set a knowledge override rule for a tenant. Requires admin or PD."""
    _verify_service_key(x_service_key)
    await _require_admin_or_pd(x_user_id, tenant_id)

    # Override tenant_id from path
    data.tenant_id = tenant_id
    data.created_by = x_user_id

    override = await set_knowledge_override(data)
    if not override:
        raise HTTPException(status_code=500, detail="Failed to set override")

    return {"override": override.model_dump(mode="json")}


@router.get("/{tenant_id}/knowledge-overrides", response_model=dict)
async def api_get_overrides(
    tenant_id: str,
    knowledge_type: Optional[str] = Query(None),
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """List knowledge override rules for a tenant."""
    overrides = await get_tenant_overrides(tenant_id, knowledge_type)
    return {"overrides": [o.model_dump(mode="json") for o in overrides]}


# ── Resolved Views (hierarchy-aware) ─────────────────────────────────────────

@router.get("/{tenant_id}/resolved-protocols", response_model=dict)
async def api_resolved_protocols(
    tenant_id: str,
    category: Optional[str] = Query(None),
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """Get protocols resolved through the tenant hierarchy."""
    tenant_ctx = await build_tenant_context(x_user_id)
    if not tenant_ctx:
        raise HTTPException(status_code=500, detail="Failed to build tenant context")

    protocols = await resolve_protocols(tenant_ctx, category=category)
    return {
        "protocols": [p.model_dump(mode="json") for p in protocols],
        "total": len(protocols),
        "mandatory_count": len([p for p in protocols if p.safety_critical and p.is_built_in]),
    }


@router.get("/{tenant_id}/resolved-planning-protocols", response_model=dict)
async def api_resolved_planning_protocols(
    tenant_id: str,
    category: Optional[str] = Query(None),
    x_user_id: str = Header(..., alias="X-User-Id"),
):
    """Get planning protocols resolved through the tenant hierarchy."""
    tenant_ctx = await build_tenant_context(x_user_id)
    if not tenant_ctx:
        raise HTTPException(status_code=500, detail="Failed to build tenant context")

    protocols = await resolve_planning_protocols(tenant_ctx, category=category)
    return {"protocols": protocols, "total": len(protocols)}


# ── Tenant Context (for LangGraph integration) ───────────────────────────────

@router.get("/context/{user_id}", response_model=dict)
async def api_tenant_context(
    user_id: str,
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
):
    """
    Get the resolved tenant context for a user.
    Used by context_assembly_node to inject tenant info into LangGraph state.
    """
    _verify_service_key(x_service_key)
    ctx = await build_tenant_context(user_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="No tenant context found")

    return {"tenant_context": ctx.model_dump(mode="json")}
