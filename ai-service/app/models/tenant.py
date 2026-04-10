"""
Tomo AI Service — Multi-Tenant Models
Pydantic models for the B2B foundation: tenants, memberships, knowledge hierarchy.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class TenantTier(str, Enum):
    GLOBAL = "global"
    INSTITUTION = "institution"
    GROUP = "group"


class OrgRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    INSTITUTIONAL_PD = "institutional_pd"
    COACH = "coach"
    ANALYST = "analyst"
    ATHLETE = "athlete"


class KnowledgeOverrideType(str, Enum):
    INHERIT = "inherit"
    EXTEND = "extend"
    OVERRIDE = "override"
    BLOCK = "block"


class SubscriptionTier(str, Enum):
    STANDARD = "standard"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


# ── Tenant Models ────────────────────────────────────────────────────────────

class TenantBranding(BaseModel):
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    favicon_url: Optional[str] = None


class TenantLimits(BaseModel):
    max_athletes: int = 500
    max_coaches: int = 50
    max_knowledge_chunks: int = 200


class Tenant(BaseModel):
    id: str
    name: str
    slug: str
    tier: TenantTier
    parent_id: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)
    branding: TenantBranding = Field(default_factory=TenantBranding)
    max_athletes: int = 500
    max_coaches: int = 50
    max_knowledge_chunks: int = 200
    is_active: bool = True
    subscription_tier: SubscriptionTier = SubscriptionTier.STANDARD
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    country: Optional[str] = None
    timezone: str = "UTC"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TenantCreate(BaseModel):
    name: str
    slug: str
    tier: TenantTier = TenantTier.INSTITUTION
    parent_id: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)
    branding: TenantBranding = Field(default_factory=TenantBranding)
    max_athletes: int = 500
    max_coaches: int = 50
    max_knowledge_chunks: int = 200
    subscription_tier: SubscriptionTier = SubscriptionTier.STANDARD
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    country: Optional[str] = None
    timezone: str = "UTC"


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    branding: Optional[TenantBranding] = None
    max_athletes: Optional[int] = None
    max_coaches: Optional[int] = None
    max_knowledge_chunks: Optional[int] = None
    is_active: Optional[bool] = None
    subscription_tier: Optional[SubscriptionTier] = None
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None


# ── Membership Models ────────────────────────────────────────────────────────

class Membership(BaseModel):
    id: str
    user_id: str
    tenant_id: str
    role: OrgRole
    permissions: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    invited_by: Optional[str] = None
    joined_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Populated by join
    tenant_name: Optional[str] = None
    tenant_tier: Optional[TenantTier] = None


class MembershipCreate(BaseModel):
    user_id: str
    tenant_id: str
    role: OrgRole = OrgRole.ATHLETE
    permissions: dict[str, Any] = Field(default_factory=dict)
    invited_by: Optional[str] = None


class MembershipUpdate(BaseModel):
    role: Optional[OrgRole] = None
    permissions: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


# ── Knowledge Inheritance Models ─────────────────────────────────────────────

class KnowledgeInheritance(BaseModel):
    id: str
    tenant_id: str
    knowledge_type: str  # protocol, knowledge_chunk, planning_protocol, drill, program
    knowledge_id: str
    override_type: KnowledgeOverrideType
    override_data: Optional[dict[str, Any]] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class KnowledgeInheritanceCreate(BaseModel):
    tenant_id: str
    knowledge_type: str
    knowledge_id: str
    override_type: KnowledgeOverrideType = KnowledgeOverrideType.INHERIT
    override_data: Optional[dict[str, Any]] = None
    created_by: Optional[str] = None


# ── Resolution Models (for API responses) ────────────────────────────────────

class ResolvedProtocol(BaseModel):
    """Protocol after hierarchy resolution — includes source tier info."""
    protocol_id: str
    name: str
    category: str
    safety_critical: bool = False
    is_built_in: bool = False
    priority: int = 100
    institution_id: Optional[str] = None
    source_tier: str  # 'global' or 'institution'

    @property
    def is_mandatory(self) -> bool:
        """Built-in safety-critical protocols are MANDATORY — cannot be overridden."""
        return self.safety_critical and self.is_built_in


class ResolvedKnowledgeChunk(BaseModel):
    """Knowledge chunk after hierarchy resolution."""
    chunk_id: str
    domain: str
    title: str
    content: str
    similarity: float = 0.0
    source_tier: str  # 'global' or 'institution'


class TenantContext(BaseModel):
    """
    Tenant context injected into the LangGraph state.
    Built during context_assembly, used by agents for scoped queries.
    """
    tenant_id: str
    tenant_name: str
    tenant_tier: TenantTier
    ancestry: list[str] = Field(default_factory=list)  # [self, parent, ..., global]
    user_role: OrgRole = OrgRole.ATHLETE
    permissions: dict[str, Any] = Field(default_factory=dict)
    branding: TenantBranding = Field(default_factory=TenantBranding)


# ── Constants ────────────────────────────────────────────────────────────────

GLOBAL_TENANT_ID = "00000000-0000-0000-0000-000000000001"

# Roles that can manage knowledge
KNOWLEDGE_MANAGER_ROLES = {OrgRole.SUPER_ADMIN, OrgRole.INSTITUTIONAL_PD}

# Roles that can manage athletes
ATHLETE_MANAGER_ROLES = {OrgRole.SUPER_ADMIN, OrgRole.INSTITUTIONAL_PD, OrgRole.COACH}

# Default permissions per role
DEFAULT_PERMISSIONS = {
    OrgRole.SUPER_ADMIN: {
        "can_manage_tenants": True,
        "can_manage_users": True,
        "can_edit_protocols": True,
        "can_edit_knowledge": True,
        "can_manage_athletes": True,
        "can_view_analytics": True,
        "can_manage_billing": True,
    },
    OrgRole.INSTITUTIONAL_PD: {
        "can_manage_tenants": False,
        "can_manage_users": True,
        "can_edit_protocols": True,
        "can_edit_knowledge": True,
        "can_manage_athletes": True,
        "can_view_analytics": True,
        "can_manage_billing": False,
    },
    OrgRole.COACH: {
        "can_manage_tenants": False,
        "can_manage_users": False,
        "can_edit_protocols": False,
        "can_edit_knowledge": False,
        "can_manage_athletes": True,
        "can_view_analytics": True,
        "can_manage_billing": False,
    },
    OrgRole.ANALYST: {
        "can_manage_tenants": False,
        "can_manage_users": False,
        "can_edit_protocols": False,
        "can_edit_knowledge": False,
        "can_manage_athletes": False,
        "can_view_analytics": True,
        "can_manage_billing": False,
    },
    OrgRole.ATHLETE: {
        "can_manage_tenants": False,
        "can_manage_users": False,
        "can_edit_protocols": False,
        "can_edit_knowledge": False,
        "can_manage_athletes": False,
        "can_view_analytics": False,
        "can_manage_billing": False,
    },
}
