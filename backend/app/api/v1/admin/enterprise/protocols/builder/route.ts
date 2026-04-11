import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VALID_CATEGORIES = [
  "safety",
  "development",
  "recovery",
  "performance",
  "academic",
] as const;

const VALID_INTENSITY_CAPS = ["full", "moderate", "light", "rest"] as const;
const VALID_PRIORITY_OVERRIDES = ["P0", "P1", "P2", "P3"] as const;
const VALID_EVIDENCE_GRADES = ["A", "B", "C"] as const;

/**
 * GET /api/v1/admin/enterprise/protocols/builder
 * Fetch a single protocol by ?id=UUID for editing,
 * OR list all editable protocols (non-built-in, or all for super_admin).
 * Tenant-scoped: non-super-admins see only their institution's + global.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req);
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const protocolId = searchParams.get("id");

  try {
    // Single protocol fetch for editing
    if (protocolId) {
      const { data, error } = await (db as any)
        .from("pd_protocols")
        .select("*")
        .eq("protocol_id", protocolId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Protocol not found" },
          { status: 404 }
        );
      }

      // Access check: super_admin sees all, others need institution match
      if (!auth.user.isSuperAdmin) {
        const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
        if (
          data.institution_id !== null &&
          !tenantIds.includes(data.institution_id)
        ) {
          return NextResponse.json(
            { error: "No access to this protocol" },
            { status: 403 }
          );
        }
      }

      return NextResponse.json({ protocol: data });
    }

    // List editable protocols
    let query = (db as any)
      .from("pd_protocols")
      .select("*")
      .order("priority")
      .order("name");

    if (auth.user.isSuperAdmin) {
      // Super admins see everything
    } else {
      // Non-super-admins: only non-built-in + scoped to their tenants + global
      const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
      query = query
        .eq("is_built_in", false)
        .or(
          `institution_id.is.null,institution_id.in.(${tenantIds.join(",")})`
        );
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ protocols: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch protocols" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/admin/enterprise/protocols/builder
 * Create a new protocol. Requires institutional_pd role minimum.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();

  try {
    const body = await req.json();

    // --- Validation ---
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (
      !body.category ||
      !VALID_CATEGORIES.includes(body.category)
    ) {
      return NextResponse.json(
        {
          error: `category must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (
      !body.conditions ||
      !["all", "any"].includes(body.conditions.match) ||
      !Array.isArray(body.conditions.conditions)
    ) {
      return NextResponse.json(
        {
          error:
            'conditions must have a "match" field ("all"|"any") and a "conditions" array',
        },
        { status: 400 }
      );
    }

    const priority =
      body.priority !== undefined ? Number(body.priority) : 100;
    if (isNaN(priority) || priority < 21 || priority > 200) {
      return NextResponse.json(
        { error: "priority must be between 21 and 200 (1-20 reserved for built-in)" },
        { status: 400 }
      );
    }

    // Optional field validation
    if (
      body.intensity_cap &&
      !VALID_INTENSITY_CAPS.includes(body.intensity_cap)
    ) {
      return NextResponse.json(
        {
          error: `intensity_cap must be one of: ${VALID_INTENSITY_CAPS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (
      body.priority_override &&
      !VALID_PRIORITY_OVERRIDES.includes(body.priority_override)
    ) {
      return NextResponse.json(
        {
          error: `priority_override must be one of: ${VALID_PRIORITY_OVERRIDES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (
      body.evidence_grade &&
      !VALID_EVIDENCE_GRADES.includes(body.evidence_grade)
    ) {
      return NextResponse.json(
        {
          error: `evidence_grade must be one of: ${VALID_EVIDENCE_GRADES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Resolve institution_id from active tenant cookie or primary tenant
    const activeTenant =
      req.cookies.get("cms_active_tenant")?.value ||
      auth.user.primaryTenantId;

    const insertPayload: Record<string, unknown> = {
      name: body.name.trim(),
      description: body.description || null,
      category: body.category,
      conditions: body.conditions,
      priority,
      load_multiplier: body.load_multiplier ?? null,
      intensity_cap: body.intensity_cap || null,
      contraindications: body.contraindications || null,
      required_elements: body.required_elements || null,
      session_cap_minutes: body.session_cap_minutes ?? null,
      blocked_rec_categories: body.blocked_rec_categories || null,
      mandatory_rec_categories: body.mandatory_rec_categories || null,
      priority_override: body.priority_override || null,
      override_message: body.override_message || null,
      forced_rag_domains: body.forced_rag_domains || null,
      blocked_rag_domains: body.blocked_rag_domains || null,
      rag_condition_tags: body.rag_condition_tags || null,
      ai_system_injection: body.ai_system_injection || null,
      safety_critical: body.safety_critical ?? false,
      sport_filter: body.sport_filter || null,
      phv_filter: body.phv_filter || null,
      age_band_filter: body.age_band_filter || null,
      position_filter: body.position_filter || null,
      is_built_in: false, // Users can never create built-in protocols
      is_enabled: true,
      version: 1,
      evidence_source: body.evidence_source || null,
      evidence_grade: body.evidence_grade || null,
      institution_id: auth.user.isSuperAdmin ? (body.institution_id || null) : activeTenant,
    };

    const { data, error } = await (db as any)
      .from("pd_protocols")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ protocol: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create protocol" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/admin/enterprise/protocols/builder?id=UUID
 * Update an existing protocol. Requires institutional_pd role minimum.
 * Built-in + safety_critical protocols are immutable.
 * Increments version by 1.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const protocolId = searchParams.get("id");

  if (!protocolId) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch existing protocol
    const { data: existing, error: fetchError } = await (db as any)
      .from("pd_protocols")
      .select("*")
      .eq("protocol_id", protocolId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Protocol not found" },
        { status: 404 }
      );
    }

    // Immutability guard: built-in + safety_critical cannot be edited
    if (existing.is_built_in && existing.safety_critical) {
      return NextResponse.json(
        { error: "Built-in safety-critical protocols are immutable" },
        { status: 403 }
      );
    }

    // Access check: super_admin can edit any, others need institution match
    if (!auth.user.isSuperAdmin) {
      const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
      if (
        existing.institution_id !== null &&
        !tenantIds.includes(existing.institution_id)
      ) {
        return NextResponse.json(
          { error: "No access to this protocol" },
          { status: 403 }
        );
      }
    }

    const body = await req.json();

    // Optional field validation on update
    if (
      body.category &&
      !VALID_CATEGORIES.includes(body.category)
    ) {
      return NextResponse.json(
        {
          error: `category must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (body.priority !== undefined) {
      const p = Number(body.priority);
      if (isNaN(p) || p < 21 || p > 200) {
        return NextResponse.json(
          { error: "priority must be between 21 and 200 (1-20 reserved for built-in)" },
          { status: 400 }
        );
      }
    }

    if (
      body.conditions &&
      (!["all", "any"].includes(body.conditions.match) ||
        !Array.isArray(body.conditions.conditions))
    ) {
      return NextResponse.json(
        {
          error:
            'conditions must have a "match" field ("all"|"any") and a "conditions" array',
        },
        { status: 400 }
      );
    }

    if (
      body.intensity_cap &&
      !VALID_INTENSITY_CAPS.includes(body.intensity_cap)
    ) {
      return NextResponse.json(
        {
          error: `intensity_cap must be one of: ${VALID_INTENSITY_CAPS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (
      body.priority_override &&
      !VALID_PRIORITY_OVERRIDES.includes(body.priority_override)
    ) {
      return NextResponse.json(
        {
          error: `priority_override must be one of: ${VALID_PRIORITY_OVERRIDES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (
      body.evidence_grade &&
      !VALID_EVIDENCE_GRADES.includes(body.evidence_grade)
    ) {
      return NextResponse.json(
        {
          error: `evidence_grade must be one of: ${VALID_EVIDENCE_GRADES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Build update payload — only include fields that were provided
    const updateFields: string[] = [
      "name",
      "description",
      "category",
      "conditions",
      "priority",
      "load_multiplier",
      "intensity_cap",
      "contraindications",
      "required_elements",
      "session_cap_minutes",
      "blocked_rec_categories",
      "mandatory_rec_categories",
      "priority_override",
      "override_message",
      "forced_rag_domains",
      "blocked_rag_domains",
      "rag_condition_tags",
      "ai_system_injection",
      "safety_critical",
      "sport_filter",
      "phv_filter",
      "age_band_filter",
      "position_filter",
      "evidence_source",
      "evidence_grade",
    ];

    const updatePayload: Record<string, unknown> = {};
    for (const field of updateFields) {
      if (body[field] !== undefined) {
        updatePayload[field] = body[field];
      }
    }

    // Always increment version
    updatePayload.version = (existing.version || 1) + 1;

    // Prevent users from flipping is_built_in
    delete (updatePayload as any).is_built_in;

    const { data, error } = await (db as any)
      .from("pd_protocols")
      .update(updatePayload)
      .eq("protocol_id", protocolId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ protocol: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update protocol" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/admin/enterprise/protocols/builder?id=UUID
 * Soft-delete a protocol by setting is_enabled = false.
 * Built-in protocols cannot be deleted.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const protocolId = searchParams.get("id");

  if (!protocolId) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch existing protocol
    const { data: existing, error: fetchError } = await (db as any)
      .from("pd_protocols")
      .select("protocol_id, is_built_in, institution_id")
      .eq("protocol_id", protocolId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Protocol not found" },
        { status: 404 }
      );
    }

    // Built-in protocols cannot be deleted
    if (existing.is_built_in) {
      return NextResponse.json(
        { error: "Built-in protocols cannot be deleted" },
        { status: 403 }
      );
    }

    // Access check: super_admin can delete any, others need institution match
    if (!auth.user.isSuperAdmin) {
      const tenantIds = auth.user.memberships.map((m) => m.tenant_id);
      if (
        existing.institution_id !== null &&
        !tenantIds.includes(existing.institution_id)
      ) {
        return NextResponse.json(
          { error: "No access to this protocol" },
          { status: 403 }
        );
      }
    }

    // Soft-delete: set is_enabled = false
    const { data, error } = await (db as any)
      .from("pd_protocols")
      .update({ is_enabled: false })
      .eq("protocol_id", protocolId)
      .select("protocol_id, name, is_enabled")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ protocol: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete protocol" },
      { status: 500 }
    );
  }
}
