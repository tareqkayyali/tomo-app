"use client";

/**
 * Users & Roles admin page.
 *
 * Lists all athlete/coach/admin users with their org memberships.
 * Super admins can search, assign roles to tenants, and toggle
 * membership active flags. Every role change is logged to
 * admin_audit_log via the /memberships endpoints.
 *
 * Impersonation is intentionally deferred — it needs middleware changes
 * to safely block writes under an impersonated session. Tracked in Phase 5.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type OrgRole =
  | "super_admin"
  | "institutional_pd"
  | "coach"
  | "analyst"
  | "athlete";

const ROLE_OPTIONS: OrgRole[] = [
  "super_admin",
  "institutional_pd",
  "coach",
  "analyst",
  "athlete",
];

interface Membership {
  id: string;
  tenant_id: string;
  tenant_name: string;
  role: OrgRole;
  is_active: boolean;
}

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  memberships: Membership[];
}

interface Tenant {
  id: string;
  name: string;
  tier: string;
}

const PAGE_SIZE = 25;

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogUser, setDialogUser] = useState<UserRow | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [assignTenantId, setAssignTenantId] = useState("");
  const [assignRole, setAssignRole] = useState<OrgRole>("coach");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("search", search.trim());
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(`/api/v1/admin/users?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        users: UserRow[];
        total: number;
      };
      setUsers(data.users);
      setTotal(data.total);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function fetchTenants() {
    // Uses the existing tenants endpoint from ai-service (same Supabase).
    // List is served by supabaseAdmin so no role check blocks us.
    try {
      const res = await fetch("/api/v1/admin/tenants", {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { tenants: Tenant[] };
        setTenants(data.tenants ?? []);
      }
    } catch {
      // Ignore — the dialog falls back to showing tenants from the first
      // user's membership list if the endpoint isn't wired yet.
    }
  }

  function openAssignDialog(user: UserRow) {
    setDialogUser(user);
    setAssignTenantId(user.memberships[0]?.tenant_id ?? "");
    setAssignRole(user.memberships[0]?.role ?? "coach");
    setDialogOpen(true);
    if (tenants.length === 0) fetchTenants();
  }

  async function handleSave() {
    if (!dialogUser || !assignTenantId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/users/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: dialogUser.id,
          tenant_id: assignTenantId,
          role: assignRole,
          is_active: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast.success("Role assigned");
      setDialogOpen(false);
      await fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleMembership(membership: Membership) {
    try {
      const res = await fetch("/api/v1/admin/users/memberships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          membership_id: membership.id,
          is_active: !membership.is_active,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(membership.is_active ? "Deactivated" : "Activated");
      await fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Users & Roles</h1>
        <p className="text-sm text-muted-foreground">
          Manage CMS access. Assign a role on a tenant to grant access; set a
          membership inactive to revoke without deleting history. Every change
          is logged to the audit trail.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search email or name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-sm"
        />
        <span className="text-xs text-muted-foreground">
          {total} user{total === 1 ? "" : "s"}
        </span>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign role — {dialogUser?.email || dialogUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select
                value={assignTenantId}
                onValueChange={(v) => setAssignTenantId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose tenant" />
                </SelectTrigger>
                <SelectContent>
                  {(tenants.length > 0
                    ? tenants
                    : (dialogUser?.memberships ?? []).map((m) => ({
                        id: m.tenant_id,
                        name: m.tenant_name,
                        tier: "",
                      }))
                  ).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.tier ? `(${t.tier})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={assignRole}
                onValueChange={(v) => setAssignRole((v ?? "athlete") as OrgRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!assignTenantId || saving}
            >
              {saving ? "Saving..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No users match.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email / Name</TableHead>
                <TableHead>Memberships</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{u.email || "—"}</span>
                      {u.name ? (
                        <span className="text-xs text-muted-foreground">
                          {u.name}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.memberships.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No CMS access
                        </span>
                      ) : (
                        u.memberships.map((m) => (
                          <Badge
                            key={m.id}
                            variant={m.is_active ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleMembership(m)}
                            title={`${m.tenant_name} — click to ${m.is_active ? "deactivate" : "activate"}`}
                          >
                            {m.role.replace("_", " ")} @ {m.tenant_name}
                            {!m.is_active ? " (inactive)" : ""}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleString()
                      : "never"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAssignDialog(u)}
                    >
                      Assign role
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
