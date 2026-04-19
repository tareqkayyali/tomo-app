/**
 * User Admin Service — CMS operator view over auth.users +
 * organization_memberships.
 *
 * Used by /admin/users for search / role assignment / deactivation.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrgRole } from "@/lib/admin/enterpriseAuth";

export interface UserListItem {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  memberships: Array<{
    id: string;
    tenant_id: string;
    tenant_name: string;
    role: OrgRole;
    is_active: boolean;
  }>;
}

export interface ListUsersInput {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListUsersResult {
  users: UserListItem[];
  total: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return supabaseAdmin();
}

/**
 * Paginated user list with optional email/name search, each row enriched
 * with their org memberships so the UI can render role badges inline.
 */
export async function listUsers(
  input: ListUsersInput
): Promise<ListUsersResult> {
  const limit = Math.min(input.limit ?? 25, 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const search = (input.search ?? "").trim();

  let query = db()
    .from("users")
    .select("id, email, name, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    // ILIKE across email + name; two matches are rare enough that the
    // extra OR is cheap.
    query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
  }

  const { data: userRows, error, count } = await query;
  if (error) throw new Error(error.message);
  const users = (userRows ?? []) as Array<{
    id: string;
    email: string | null;
    name: string | null;
    created_at: string;
  }>;
  if (users.length === 0) return { users: [], total: count ?? 0 };

  // Batch-fetch memberships for this page's user ids so we don't N+1.
  const ids = users.map((u) => u.id);
  const { data: mem, error: memErr } = await db()
    .from("organization_memberships")
    .select(
      "id, user_id, tenant_id, role, is_active, cms_tenants!inner(name)"
    )
    .in("user_id", ids);
  if (memErr) throw new Error(memErr.message);

  type MembershipRow = {
    id: string;
    user_id: string;
    tenant_id: string;
    role: OrgRole;
    is_active: boolean;
    cms_tenants?: { name: string } | null;
  };
  const byUser = new Map<string, UserListItem["memberships"]>();
  for (const row of (mem ?? []) as MembershipRow[]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push({
      id: row.id,
      tenant_id: row.tenant_id,
      tenant_name: row.cms_tenants?.name ?? "Unknown",
      role: row.role,
      is_active: row.is_active,
    });
  }

  // last_sign_in_at lives on auth.users — not usually queryable from
  // the REST API, but supabaseAdmin() uses the service role so we can
  // look it up via the admin listUsers endpoint. We batch this in one
  // call to avoid N+1.
  let lastSignInByUser = new Map<string, string | null>();
  try {
    const authClient = (db() as { auth?: { admin?: unknown } }).auth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = (authClient as any)?.admin;
    if (admin?.listUsers) {
      const listed = await admin.listUsers({
        page: 1,
        perPage: Math.max(ids.length, 50),
      });
      const all = (listed?.data?.users ?? []) as Array<{
        id: string;
        last_sign_in_at: string | null;
      }>;
      lastSignInByUser = new Map(all.map((u) => [u.id, u.last_sign_in_at]));
    }
  } catch {
    // Best-effort — if the admin API call fails, leave last_sign_in as null.
    lastSignInByUser = new Map();
  }

  return {
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      created_at: u.created_at,
      last_sign_in_at: lastSignInByUser.get(u.id) ?? null,
      memberships: byUser.get(u.id) ?? [],
    })),
    total: count ?? users.length,
  };
}

/**
 * Set / upsert a user's role on a given tenant. If no membership row
 * exists it is created; if one exists it is updated.
 */
export async function assignMembership(input: {
  user_id: string;
  tenant_id: string;
  role: OrgRole;
  is_active?: boolean;
}): Promise<void> {
  const { error } = await db()
    .from("organization_memberships")
    .upsert(
      {
        user_id: input.user_id,
        tenant_id: input.tenant_id,
        role: input.role,
        is_active: input.is_active ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tenant_id" }
    );
  if (error) throw new Error(error.message);
}

export async function setMembershipActive(
  membership_id: string,
  is_active: boolean
): Promise<void> {
  const { error } = await db()
    .from("organization_memberships")
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq("id", membership_id);
  if (error) throw new Error(error.message);
}

/**
 * List tenants for the role-assignment dropdown.
 */
export async function listTenants(): Promise<
  Array<{ id: string; name: string; tier: string; slug: string }>
> {
  const { data, error } = await db()
    .from("cms_tenants")
    .select("id, name, tier, slug")
    .eq("is_active", true)
    .order("tier")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    name: string;
    tier: string;
    slug: string;
  }>;
}
