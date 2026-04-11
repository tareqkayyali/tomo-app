"use client";

import { useEffect, useState } from "react";
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
 * Organization Management — Super Admin Only
 * List all tenants, create new institutions/groups, manage hierarchy.
 */

interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: string;
  parent_id: string | null;
  is_active: boolean;
  subscription_tier: string;
  max_athletes: number;
  contact_email: string | null;
  country: string | null;
  created_at: string;
}

export default function OrganizationsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  async function fetchTenants() {
    try {
      const res = await fetch("/api/v1/admin/enterprise/organizations");
      if (!res.ok) throw new Error("Failed to fetch organizations");
      const data = await res.json();
      setTenants(data.tenants || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const tierBadge = (tier: string) => {
    const variants: Record<string, string> = {
      global: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      institution: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      group: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[tier] || ""}`}>
        {tier}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <PageGuide {...enterpriseDashboardHelp.organizations_list.page} />
          <p className="text-muted-foreground">
            Manage institutions and groups in the tenant hierarchy
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          New Organization
        </Button>
      </div>

      {showCreateForm && (
        <CreateOrgForm
          onCreated={() => {
            setShowCreateForm(false);
            fetchTenants();
          }}
          onCancel={() => setShowCreateForm(false)}
          existingTenants={tenants}
        />
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Max Athletes</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link
                    href={`/admin/enterprise/organizations/${t.id}`}
                    className="font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{t.slug}</div>
                </TableCell>
                <TableCell>{tierBadge(t.tier)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs capitalize">
                    {t.subscription_tier}
                  </Badge>
                </TableCell>
                <TableCell>{t.max_athletes}</TableCell>
                <TableCell>{t.country || "—"}</TableCell>
                <TableCell>
                  <Badge variant={t.is_active ? "default" : "secondary"}>
                    {t.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/enterprise/organizations/${t.id}`}>
                    <Button variant="ghost" size="sm">
                      Manage
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ── Inline Create Form ────────────────────────────────────────────────── */

function CreateOrgForm({
  onCreated,
  onCancel,
  existingTenants,
}: {
  onCreated: () => void;
  onCancel: () => void;
  existingTenants: Tenant[];
}) {
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    tier: "institution",
    parent_id: "",
    subscription_tier: "standard",
    max_athletes: 500,
    contact_email: "",
    country: "",
    timezone: "UTC",
  });
  const [saving, setSaving] = useState(false);

  function handleNameChange(name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setFormData({ ...formData, name, slug });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name || !formData.slug) {
      toast.error("Name and slug are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/enterprise/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }

      toast.success("Organization created");
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const institutions = existingTenants.filter(
    (t) => t.tier === "global" || t.tier === "institution"
  );

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">New Organization</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Academy Name"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Slug</label>
          <input
            type="text"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="academy-name"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Tier</label>
          <select
            value={formData.tier}
            onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="institution">Institution</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Parent Organization</label>
          <select
            value={formData.parent_id}
            onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Tomo Global (default)</option>
            {institutions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.tier})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Subscription</label>
          <select
            value={formData.subscription_tier}
            onChange={(e) => setFormData({ ...formData, subscription_tier: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="standard">Standard</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Max Athletes</label>
          <input
            type="number"
            value={formData.max_athletes}
            onChange={(e) => setFormData({ ...formData, max_athletes: parseInt(e.target.value) || 500 })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Contact Email</label>
          <input
            type="email"
            value={formData.contact_email}
            onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="admin@academy.com"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Country</label>
          <input
            type="text"
            value={formData.country}
            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="UAE"
          />
        </div>

        <div className="col-span-full flex gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create Organization"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
