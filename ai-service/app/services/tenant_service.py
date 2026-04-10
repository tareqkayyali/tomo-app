"""
Tomo AI Service — Tenant Service
CRUD operations for multi-tenant B2B: tenants, memberships, knowledge inheritance.
All queries use the async psycopg3 pool with parameterized SQL.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.db.supabase import get_pool
from app.models.tenant import (
    DEFAULT_PERMISSIONS,
    GLOBAL_TENANT_ID,
    KnowledgeInheritance,
    KnowledgeInheritanceCreate,
    KnowledgeOverrideType,
    Membership,
    MembershipCreate,
    MembershipUpdate,
    OrgRole,
    Tenant,
    TenantBranding,
    TenantContext,
    TenantCreate,
    TenantTier,
    TenantUpdate,
)

logger = logging.getLogger("tomo-ai.tenant_service")


# ── Tenant CRUD ──────────────────────────────────────────────────────────────

async def create_tenant(data: TenantCreate) -> Optional[Tenant]:
    """Create a new tenant (institution or group)."""
    pool = get_pool()
    if not pool:
        logger.error("DB pool not available")
        return None

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            INSERT INTO cms_tenants (
                name, slug, tier, parent_id, config, branding,
                max_athletes, max_coaches, max_knowledge_chunks,
                subscription_tier, contact_email, contact_name,
                country, timezone
            ) VALUES (
                %(name)s, %(slug)s, %(tier)s, %(parent_id)s, %(config)s, %(branding)s,
                %(max_athletes)s, %(max_coaches)s, %(max_knowledge_chunks)s,
                %(subscription_tier)s, %(contact_email)s, %(contact_name)s,
                %(country)s, %(timezone)s
            )
            RETURNING *
            """,
            {
                "name": data.name,
                "slug": data.slug,
                "tier": data.tier.value,
                "parent_id": data.parent_id or GLOBAL_TENANT_ID,
                "config": data.config,
                "branding": data.branding.model_dump() if data.branding else {},
                "max_athletes": data.max_athletes,
                "max_coaches": data.max_coaches,
                "max_knowledge_chunks": data.max_knowledge_chunks,
                "subscription_tier": data.subscription_tier.value,
                "contact_email": data.contact_email,
                "contact_name": data.contact_name,
                "country": data.country,
                "timezone": data.timezone,
            },
        )
        row = await result.fetchone()
        if row:
            return _row_to_tenant(row, result.description)

    return None


async def get_tenant(tenant_id: str) -> Optional[Tenant]:
    """Get a tenant by ID."""
    pool = get_pool()
    if not pool:
        return None

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT * FROM cms_tenants WHERE id = %s", (tenant_id,)
        )
        row = await result.fetchone()
        if row:
            return _row_to_tenant(row, result.description)

    return None


async def get_tenant_by_slug(slug: str) -> Optional[Tenant]:
    """Get a tenant by slug."""
    pool = get_pool()
    if not pool:
        return None

    async with pool.connection() as conn:
        result = await conn.execute(
            "SELECT * FROM cms_tenants WHERE slug = %s", (slug,)
        )
        row = await result.fetchone()
        if row:
            return _row_to_tenant(row, result.description)

    return None


async def list_tenants(
    tier: Optional[TenantTier] = None,
    parent_id: Optional[str] = None,
    active_only: bool = True,
) -> list[Tenant]:
    """List tenants with optional filters."""
    pool = get_pool()
    if not pool:
        return []

    conditions = []
    params: dict = {}

    if tier:
        conditions.append("tier = %(tier)s")
        params["tier"] = tier.value

    if parent_id:
        conditions.append("parent_id = %(parent_id)s")
        params["parent_id"] = parent_id

    if active_only:
        conditions.append("is_active = true")

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    async with pool.connection() as conn:
        result = await conn.execute(
            f"SELECT * FROM cms_tenants {where} ORDER BY name",
            params,
        )
        rows = await result.fetchall()
        return [_row_to_tenant(row, result.description) for row in rows]


async def update_tenant(tenant_id: str, data: TenantUpdate) -> Optional[Tenant]:
    """Update a tenant's mutable fields."""
    pool = get_pool()
    if not pool:
        return None

    updates = []
    params: dict = {"tenant_id": tenant_id}

    for field_name, value in data.model_dump(exclude_none=True).items():
        if field_name == "branding" and value:
            updates.append("branding = %(branding)s")
            params["branding"] = value if isinstance(value, dict) else value.model_dump()
        else:
            updates.append(f"{field_name} = %({field_name})s")
            params[field_name] = value.value if hasattr(value, "value") else value

    if not updates:
        return await get_tenant(tenant_id)

    async with pool.connection() as conn:
        result = await conn.execute(
            f"UPDATE cms_tenants SET {', '.join(updates)} WHERE id = %(tenant_id)s RETURNING *",
            params,
        )
        row = await result.fetchone()
        if row:
            return _row_to_tenant(row, result.description)

    return None


# ── Membership CRUD ──────────────────────────────────────────────────────────

async def create_membership(data: MembershipCreate) -> Optional[Membership]:
    """Create or reactivate a membership with default permissions for the role."""
    pool = get_pool()
    if not pool:
        return None

    permissions = data.permissions or DEFAULT_PERMISSIONS.get(data.role, {})

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            INSERT INTO organization_memberships (
                user_id, tenant_id, role, permissions, invited_by
            ) VALUES (%(user_id)s, %(tenant_id)s, %(role)s, %(permissions)s, %(invited_by)s)
            ON CONFLICT (user_id, tenant_id) DO UPDATE SET
                role = EXCLUDED.role,
                permissions = EXCLUDED.permissions,
                is_active = true,
                updated_at = now()
            RETURNING *
            """,
            {
                "user_id": data.user_id,
                "tenant_id": data.tenant_id,
                "role": data.role.value,
                "permissions": permissions,
                "invited_by": data.invited_by,
            },
        )
        row = await result.fetchone()
        if row:
            return _row_to_membership(row, result.description)

    return None


async def get_user_memberships(user_id: str) -> list[Membership]:
    """Get all active memberships for a user (with tenant info)."""
    pool = get_pool()
    if not pool:
        return []

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT m.*, t.name AS tenant_name, t.tier AS tenant_tier
            FROM organization_memberships m
            JOIN cms_tenants t ON t.id = m.tenant_id
            WHERE m.user_id = %s AND m.is_active = true
            ORDER BY t.tier, t.name
            """,
            (user_id,),
        )
        rows = await result.fetchall()
        return [_row_to_membership(row, result.description) for row in rows]


async def get_tenant_members(
    tenant_id: str,
    role: Optional[OrgRole] = None,
) -> list[Membership]:
    """Get all active members of a tenant."""
    pool = get_pool()
    if not pool:
        return []

    if role:
        query = """
            SELECT * FROM organization_memberships
            WHERE tenant_id = %s AND role = %s AND is_active = true
            ORDER BY role, joined_at
        """
        params = (tenant_id, role.value)
    else:
        query = """
            SELECT * FROM organization_memberships
            WHERE tenant_id = %s AND is_active = true
            ORDER BY role, joined_at
        """
        params = (tenant_id,)

    async with pool.connection() as conn:
        result = await conn.execute(query, params)
        rows = await result.fetchall()
        return [_row_to_membership(row, result.description) for row in rows]


async def update_membership(
    membership_id: str,
    data: MembershipUpdate,
) -> Optional[Membership]:
    """Update a membership (role, permissions, active status)."""
    pool = get_pool()
    if not pool:
        return None

    updates = []
    params: dict = {"membership_id": membership_id}

    for field_name, value in data.model_dump(exclude_none=True).items():
        if field_name == "role":
            updates.append("role = %(role)s")
            params["role"] = value.value if hasattr(value, "value") else value
        elif field_name == "permissions":
            updates.append("permissions = %(permissions)s")
            params["permissions"] = value
        elif field_name == "is_active":
            updates.append("is_active = %(is_active)s")
            params["is_active"] = value

    if not updates:
        return None

    async with pool.connection() as conn:
        result = await conn.execute(
            f"UPDATE organization_memberships SET {', '.join(updates)} WHERE id = %(membership_id)s RETURNING *",
            params,
        )
        row = await result.fetchone()
        if row:
            return _row_to_membership(row, result.description)

    return None


# ── Knowledge Inheritance ────────────────────────────────────────────────────

async def set_knowledge_override(data: KnowledgeInheritanceCreate) -> Optional[KnowledgeInheritance]:
    """Set or update a knowledge inheritance rule for a tenant."""
    pool = get_pool()
    if not pool:
        return None

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            INSERT INTO cms_knowledge_inheritance (
                tenant_id, knowledge_type, knowledge_id, override_type, override_data, created_by
            ) VALUES (
                %(tenant_id)s, %(knowledge_type)s, %(knowledge_id)s,
                %(override_type)s, %(override_data)s, %(created_by)s
            )
            ON CONFLICT (tenant_id, knowledge_type, knowledge_id) DO UPDATE SET
                override_type = EXCLUDED.override_type,
                override_data = EXCLUDED.override_data,
                updated_at = now()
            RETURNING *
            """,
            {
                "tenant_id": data.tenant_id,
                "knowledge_type": data.knowledge_type,
                "knowledge_id": data.knowledge_id,
                "override_type": data.override_type.value,
                "override_data": data.override_data,
                "created_by": data.created_by,
            },
        )
        row = await result.fetchone()
        if row:
            return _row_to_knowledge_inheritance(row, result.description)

    return None


async def get_tenant_overrides(
    tenant_id: str,
    knowledge_type: Optional[str] = None,
) -> list[KnowledgeInheritance]:
    """Get all knowledge inheritance rules for a tenant."""
    pool = get_pool()
    if not pool:
        return []

    if knowledge_type:
        query = """
            SELECT * FROM cms_knowledge_inheritance
            WHERE tenant_id = %s AND knowledge_type = %s
            ORDER BY knowledge_type, knowledge_id
        """
        params = (tenant_id, knowledge_type)
    else:
        query = """
            SELECT * FROM cms_knowledge_inheritance
            WHERE tenant_id = %s
            ORDER BY knowledge_type, knowledge_id
        """
        params = (tenant_id,)

    async with pool.connection() as conn:
        result = await conn.execute(query, params)
        rows = await result.fetchall()
        return [_row_to_knowledge_inheritance(row, result.description) for row in rows]


# ── Tenant Context Builder ───────────────────────────────────────────────────

async def build_tenant_context(user_id: str) -> Optional[TenantContext]:
    """
    Build the TenantContext for a user — injected into LangGraph state.
    Resolves the user's primary tenant, ancestry chain, and permissions.
    """
    pool = get_pool()
    if not pool:
        return None

    async with pool.connection() as conn:
        # Get user's primary membership (highest-role, most specific tenant)
        result = await conn.execute(
            """
            SELECT m.*, t.name AS tenant_name, t.tier AS tenant_tier,
                   t.branding AS tenant_branding
            FROM organization_memberships m
            JOIN cms_tenants t ON t.id = m.tenant_id
            WHERE m.user_id = %s AND m.is_active = true AND t.is_active = true
            ORDER BY
                CASE m.role
                    WHEN 'super_admin' THEN 0
                    WHEN 'institutional_pd' THEN 1
                    WHEN 'coach' THEN 2
                    WHEN 'analyst' THEN 3
                    WHEN 'athlete' THEN 4
                END,
                CASE t.tier
                    WHEN 'group' THEN 0
                    WHEN 'institution' THEN 1
                    WHEN 'global' THEN 2
                END
            LIMIT 1
            """,
            (user_id,),
        )
        row = await result.fetchone()

        if not row:
            # User has no membership — default to global tenant, athlete role
            return TenantContext(
                tenant_id=GLOBAL_TENANT_ID,
                tenant_name="Tomo Global",
                tenant_tier=TenantTier.GLOBAL,
                ancestry=[GLOBAL_TENANT_ID],
                user_role=OrgRole.ATHLETE,
                permissions=DEFAULT_PERMISSIONS[OrgRole.ATHLETE],
            )

        cols = [desc[0] for desc in result.description]
        row_dict = dict(zip(cols, row))

        # Get ancestry chain
        ancestry_result = await conn.execute(
            "SELECT get_tenant_ancestry(%s)", (row_dict["tenant_id"],)
        )
        ancestry_row = await ancestry_result.fetchone()
        ancestry = list(ancestry_row[0]) if ancestry_row and ancestry_row[0] else [row_dict["tenant_id"]]

        branding_data = row_dict.get("tenant_branding") or {}
        branding = TenantBranding(**branding_data) if isinstance(branding_data, dict) else TenantBranding()

        return TenantContext(
            tenant_id=str(row_dict["tenant_id"]),
            tenant_name=row_dict.get("tenant_name", ""),
            tenant_tier=TenantTier(row_dict.get("tenant_tier", "global")),
            ancestry=[str(a) for a in ancestry],
            user_role=OrgRole(row_dict["role"]),
            permissions=row_dict.get("permissions") or DEFAULT_PERMISSIONS.get(OrgRole(row_dict["role"]), {}),
            branding=branding,
        )


# ── Authorization Helpers ────────────────────────────────────────────────────

async def check_permission(user_id: str, tenant_id: str, permission: str) -> bool:
    """Check if a user has a specific permission for a tenant."""
    pool = get_pool()
    if not pool:
        return False

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT permissions FROM organization_memberships
            WHERE user_id = %s AND tenant_id = %s AND is_active = true
            """,
            (user_id, tenant_id),
        )
        row = await result.fetchone()
        if row and row[0]:
            return row[0].get(permission, False)

    return False


async def require_role(user_id: str, tenant_id: str, min_role: OrgRole) -> bool:
    """Check if user has at least the minimum role for a tenant."""
    role_hierarchy = {
        OrgRole.SUPER_ADMIN: 0,
        OrgRole.INSTITUTIONAL_PD: 1,
        OrgRole.COACH: 2,
        OrgRole.ANALYST: 3,
        OrgRole.ATHLETE: 4,
    }

    pool = get_pool()
    if not pool:
        return False

    async with pool.connection() as conn:
        result = await conn.execute(
            """
            SELECT role FROM organization_memberships
            WHERE user_id = %s AND tenant_id = %s AND is_active = true
            """,
            (user_id, tenant_id),
        )
        row = await result.fetchone()
        if row:
            user_role = OrgRole(row[0])
            return role_hierarchy.get(user_role, 99) <= role_hierarchy.get(min_role, 99)

    return False


# ── Row Mappers ──────────────────────────────────────────────────────────────

def _row_to_tenant(row, description) -> Tenant:
    cols = [desc[0] for desc in description]
    d = dict(zip(cols, row))
    branding = d.get("branding") or {}
    return Tenant(
        id=str(d["id"]),
        name=d["name"],
        slug=d["slug"],
        tier=TenantTier(d["tier"]),
        parent_id=str(d["parent_id"]) if d.get("parent_id") else None,
        config=d.get("config") or {},
        branding=TenantBranding(**branding) if isinstance(branding, dict) else TenantBranding(),
        max_athletes=d.get("max_athletes", 500),
        max_coaches=d.get("max_coaches", 50),
        max_knowledge_chunks=d.get("max_knowledge_chunks", 200),
        is_active=d.get("is_active", True),
        subscription_tier=d.get("subscription_tier", "standard"),
        contact_email=d.get("contact_email"),
        contact_name=d.get("contact_name"),
        country=d.get("country"),
        timezone=d.get("timezone", "UTC"),
        created_at=d.get("created_at"),
        updated_at=d.get("updated_at"),
    )


def _row_to_membership(row, description) -> Membership:
    cols = [desc[0] for desc in description]
    d = dict(zip(cols, row))
    return Membership(
        id=str(d["id"]),
        user_id=str(d["user_id"]),
        tenant_id=str(d["tenant_id"]),
        role=OrgRole(d["role"]),
        permissions=d.get("permissions") or {},
        is_active=d.get("is_active", True),
        invited_by=str(d["invited_by"]) if d.get("invited_by") else None,
        joined_at=d.get("joined_at"),
        created_at=d.get("created_at"),
        updated_at=d.get("updated_at"),
        tenant_name=d.get("tenant_name"),
        tenant_tier=TenantTier(d["tenant_tier"]) if d.get("tenant_tier") else None,
    )


def _row_to_knowledge_inheritance(row, description) -> KnowledgeInheritance:
    cols = [desc[0] for desc in description]
    d = dict(zip(cols, row))
    return KnowledgeInheritance(
        id=str(d["id"]),
        tenant_id=str(d["tenant_id"]),
        knowledge_type=d["knowledge_type"],
        knowledge_id=d["knowledge_id"],
        override_type=KnowledgeOverrideType(d["override_type"]),
        override_data=d.get("override_data"),
        created_by=str(d["created_by"]) if d.get("created_by") else None,
        created_at=d.get("created_at"),
        updated_at=d.get("updated_at"),
    )
