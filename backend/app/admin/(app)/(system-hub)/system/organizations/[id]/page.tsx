"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { enterpriseDashboardHelp } from "@/lib/cms-help/enterprise-dashboard";

/**
 * Organization Detail — Super Admin / Institutional PD
 * Shows org info, member list, knowledge overrides, protocol inheritance.
 */

interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: string;
  is_active: boolean;
  subscription_tier: string;
  max_athletes: number;
  max_coaches: number;
  max_knowledge_chunks: number;
  contact_email: string | null;
  country: string | null;
  timezone: string;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  permissions: Record<string, boolean>;
  is_active: boolean;
  joined_at: string;
}

export default function OrgDetailPage() {
  const params = useParams();
  const orgId = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);

  useEffect(() => {
    if (orgId) {
      fetchOrgData();
    }
  }, [orgId]);

  async function fetchOrgData() {
    try {
      const [tenantRes, membersRes] = await Promise.all([
        fetch(`/api/v1/admin/enterprise/organizations/${orgId}`),
        fetch(`/api/v1/admin/enterprise/organizations/${orgId}/members`),
      ]);

      if (tenantRes.ok) {
        const tenantData = await tenantRes.json();
        setTenant(tenantData.tenant);
      }

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData.members || []);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMember(membershipId: string) {
    try {
      const res = await fetch(
        `/api/v1/admin/enterprise/organizations/${orgId}/members/${membershipId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false }),
        }
      );
      if (!res.ok) throw new Error("Failed to remove member");
      toast.success("Member removed");
      fetchOrgData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Organization Not Found</h1>
        <Link href="/admin/system/organizations">
          <Button variant="ghost">Back to Organizations</Button>
        </Link>
      </div>
    );
  }

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      super_admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      institutional_pd: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      coach: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      analyst: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
      athlete: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] || ""}`}>
        {role.replace("_", " ")}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <Badge variant={tenant.is_active ? "default" : "secondary"}>
              {tenant.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <PageGuide {...enterpriseDashboardHelp.organization_detail.page} />
          <p className="text-muted-foreground">
            {tenant.slug} &middot; {tenant.tier} &middot;{" "}
            {tenant.subscription_tier}
          </p>
        </div>
        <Link href="/admin/system/organizations">
          <Button variant="ghost">Back</Button>
        </Link>
      </div>

      {/* Org Info */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Organization Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Max Athletes</p>
            <p className="font-medium">{tenant.max_athletes}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Max Coaches</p>
            <p className="font-medium">{tenant.max_coaches}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Max Knowledge Chunks</p>
            <p className="font-medium">{tenant.max_knowledge_chunks}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Contact</p>
            <p className="font-medium">{tenant.contact_email || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Country</p>
            <p className="font-medium">{tenant.country || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Timezone</p>
            <p className="font-medium">{tenant.timezone}</p>
          </div>
        </div>
      </Card>

      {/* Members */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Members ({members.length})
          </h2>
          <Button size="sm" onClick={() => setShowAddMember(true)}>
            Add Member
          </Button>
        </div>

        {showAddMember && (
          <AddMemberForm
            orgId={orgId}
            onAdded={() => {
              setShowAddMember(false);
              fetchOrgData();
            }}
            onCancel={() => setShowAddMember(false)}
          />
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">
                  {m.user_id.slice(0, 8)}...
                </TableCell>
                <TableCell>{roleBadge(m.role)}</TableCell>
                <TableCell className="text-sm">
                  {new Date(m.joined_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge variant={m.is_active ? "default" : "secondary"}>
                    {m.is_active ? "Active" : "Removed"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {m.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => handleRemoveMember(m.id)}
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No members yet. Add the first member above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ── Add Member Form ─────────────────────────────────────────────────── */

function AddMemberForm({
  orgId,
  onAdded,
  onCancel,
}: {
  orgId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("coach");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) {
      toast.error("User ID is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/admin/enterprise/organizations/${orgId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId.trim(), role }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add member");
      }

      toast.success("Member added");
      onAdded();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 p-4 border rounded-lg bg-muted/30">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="text-sm font-medium">User ID</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Supabase user UUID"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="institutional_pd">Institutional PD</option>
            <option value="coach">Coach</option>
            <option value="analyst">Analyst</option>
            <option value="athlete">Athlete</option>
          </select>
        </div>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Adding..." : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </form>
    </div>
  );
}
