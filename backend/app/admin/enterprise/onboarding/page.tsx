"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Institutional Onboarding — Phase 10
 * Guided 5-step wizard for onboarding new institutions.
 * Creates tenant, PD account, initial config, protocol inheritance, and first athletes.
 *
 * Steps:
 * 1. Organization Details
 * 2. Performance Director Setup
 * 3. Sport & Position Configuration
 * 4. Protocol Inheritance
 * 5. Review & Activate
 */

// ── Types ───────────────────���──────────────────────────────────────────────

interface OrgDetails {
  name: string;
  tier: "institution" | "group";
  parentId: string | null;
  country: string;
  timezone: string;
  logo_url: string;
  description: string;
}

interface PDSetup {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  qualifications: string;
}

interface SportConfig {
  sports: string[];
  primarySport: string;
  positions: Record<string, string[]>;
  ageBands: string[];
}

interface ProtocolConfig {
  inheritGlobal: boolean;
  inheritanceBehavior: "inherit" | "extend" | "override";
  enabledCategories: string[];
  customProtocolCount: number;
}

interface OnboardingState {
  org: OrgDetails;
  pd: PDSetup;
  sport: SportConfig;
  protocol: ProtocolConfig;
}

// ── Constants ─────────────────���────────────────────────────────────────────

const STEPS = [
  { id: 1, name: "Organization", description: "Institution details" },
  { id: 2, name: "Performance Director", description: "Primary PD account" },
  { id: 3, name: "Sport Configuration", description: "Sports & positions" },
  { id: 4, name: "Protocol Inheritance", description: "Safety & rules" },
  { id: 5, name: "Review & Activate", description: "Confirm and go live" },
];

const AVAILABLE_SPORTS = [
  { id: "football", name: "Football", positions: ["goalkeeper", "defender", "midfielder", "striker", "winger"] },
  { id: "basketball", name: "Basketball", positions: ["point_guard", "shooting_guard", "small_forward", "power_forward", "center"] },
  { id: "padel", name: "Padel", positions: ["drive", "revés", "all_court"] },
  { id: "tennis", name: "Tennis", positions: ["baseline", "serve_volley", "all_court"] },
  { id: "athletics", name: "Athletics", positions: ["sprinter", "middle_distance", "long_distance", "jumper", "thrower"] },
];

const PROTOCOL_CATEGORIES = [
  "safety", "development", "recovery", "performance", "academic",
];

const TIMEZONES = [
  "Europe/London", "Europe/Madrid", "Europe/Berlin", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Asia/Dubai", "Asia/Singapore", "Australia/Sydney",
];

// ── Component ───────────────────────────────────────────────────���──────────

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [state, setState] = useState<OnboardingState>({
    org: {
      name: "",
      tier: "institution",
      parentId: null,
      country: "",
      timezone: "Europe/London",
      logo_url: "",
      description: "",
    },
    pd: {
      email: "",
      firstName: "",
      lastName: "",
      role: "Head of Performance",
      qualifications: "",
    },
    sport: {
      sports: [],
      primarySport: "",
      positions: {},
      ageBands: ["U13", "U15", "U17", "U19"],
    },
    protocol: {
      inheritGlobal: true,
      inheritanceBehavior: "inherit",
      enabledCategories: ["safety", "development", "recovery"],
      customProtocolCount: 0,
    },
  });

  function updateOrg(updates: Partial<OrgDetails>) {
    setState((s) => ({ ...s, org: { ...s.org, ...updates } }));
  }

  function updatePD(updates: Partial<PDSetup>) {
    setState((s) => ({ ...s, pd: { ...s.pd, ...updates } }));
  }

  function updateSport(updates: Partial<SportConfig>) {
    setState((s) => ({ ...s, sport: { ...s.sport, ...updates } }));
  }

  function updateProtocol(updates: Partial<ProtocolConfig>) {
    setState((s) => ({ ...s, protocol: { ...s.protocol, ...updates } }));
  }

  function toggleSport(sportId: string) {
    const current = state.sport.sports;
    const updated = current.includes(sportId)
      ? current.filter((s) => s !== sportId)
      : [...current, sportId];
    const primary =
      updated.length > 0 && !updated.includes(state.sport.primarySport)
        ? updated[0]
        : state.sport.primarySport;
    updateSport({ sports: updated, primarySport: primary });
  }

  function togglePosition(sportId: string, position: string) {
    const current = state.sport.positions[sportId] || [];
    const updated = current.includes(position)
      ? current.filter((p) => p !== position)
      : [...current, position];
    updateSport({
      positions: { ...state.sport.positions, [sportId]: updated },
    });
  }

  function toggleAgeBand(band: string) {
    const current = state.sport.ageBands;
    const updated = current.includes(band)
      ? current.filter((b) => b !== band)
      : [...current, band];
    updateSport({ ageBands: updated });
  }

  function canAdvance(): boolean {
    switch (step) {
      case 1:
        return !!state.org.name && !!state.org.country;
      case 2:
        return !!state.pd.email && !!state.pd.firstName && !!state.pd.lastName;
      case 3:
        return state.sport.sports.length > 0 && !!state.sport.primarySport;
      case 4:
        return true;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/admin/enterprise/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Onboarding failed");
      }

      toast.success("Institution onboarded successfully!");
      // Reset
      setStep(1);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Onboarding failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Institutional Onboarding</h1>
        <p className="text-muted-foreground">
          Set up a new institution on the Tomo platform
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              onClick={() => s.id < step && setStep(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                s.id === step
                  ? "bg-primary text-primary-foreground"
                  : s.id < step
                    ? "bg-green-500/10 text-green-600 dark:text-green-400 cursor-pointer"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold ${
                  s.id < step
                    ? "bg-green-500 text-white"
                    : s.id === step
                      ? "bg-primary-foreground text-primary"
                      : "bg-muted-foreground/20"
                }`}
              >
                {s.id < step ? "\u2713" : s.id}
              </span>
              <span className="hidden md:inline">{s.name}</span>
            </button>
            {s.id < STEPS.length && (
              <div
                className={`w-8 h-px ${
                  s.id < step ? "bg-green-500" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card className="p-6">
        {/* Step 1: Organization */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Organization Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Institution Name *</Label>
                <Input
                  value={state.org.name}
                  onChange={(e) => updateOrg({ name: e.target.value })}
                  placeholder="Academy FC"
                />
              </div>
              <div>
                <Label>Country *</Label>
                <Input
                  value={state.org.country}
                  onChange={(e) => updateOrg({ country: e.target.value })}
                  placeholder="United Kingdom"
                />
              </div>
              <div>
                <Label>Timezone</Label>
                <Select
                  value={state.org.timezone}
                  onValueChange={(v) => v && updateOrg({ timezone: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tier</Label>
                <Select
                  value={state.org.tier}
                  onValueChange={(v) =>
                    v && updateOrg({ tier: v as "institution" | "group" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="institution">Institution</SelectItem>
                    <SelectItem value="group">Group (under existing institution)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Logo URL</Label>
                <Input
                  value={state.org.logo_url}
                  onChange={(e) => updateOrg({ logo_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={state.org.description}
                  onChange={(e) => updateOrg({ description: e.target.value })}
                  placeholder="Brief description of the institution..."
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Performance Director */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Performance Director Setup
            </h2>
            <p className="text-sm text-muted-foreground">
              The primary PD will have full admin access to this institution.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>First Name *</Label>
                <Input
                  value={state.pd.firstName}
                  onChange={(e) => updatePD({ firstName: e.target.value })}
                  placeholder="James"
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  value={state.pd.lastName}
                  onChange={(e) => updatePD({ lastName: e.target.value })}
                  placeholder="Smith"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={state.pd.email}
                  onChange={(e) => updatePD({ email: e.target.value })}
                  placeholder="james@academy.com"
                />
              </div>
              <div>
                <Label>Role Title</Label>
                <Input
                  value={state.pd.role}
                  onChange={(e) => updatePD({ role: e.target.value })}
                  placeholder="Head of Performance"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Qualifications</Label>
                <Textarea
                  value={state.pd.qualifications}
                  onChange={(e) =>
                    updatePD({ qualifications: e.target.value })
                  }
                  placeholder="MSc Sports Science, NSCA-CSCS, 10 years academy experience..."
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Sport Configuration */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Sport Configuration</h2>
            <div>
              <Label className="text-sm">Select Sports *</Label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                {AVAILABLE_SPORTS.map((sport) => (
                  <button
                    key={sport.id}
                    onClick={() => toggleSport(sport.id)}
                    className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                      state.sport.sports.includes(sport.id)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {sport.name}
                    {state.sport.primarySport === sport.id && (
                      <Badge className="ml-1 text-xs" variant="default">
                        Primary
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {state.sport.sports.length > 1 && (
              <div>
                <Label className="text-sm">Primary Sport</Label>
                <Select
                  value={state.sport.primarySport}
                  onValueChange={(v) => v && updateSport({ primarySport: v })}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {state.sport.sports.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Positions per sport */}
            {state.sport.sports.map((sportId) => {
              const sport = AVAILABLE_SPORTS.find((s) => s.id === sportId);
              if (!sport) return null;
              return (
                <div key={sportId}>
                  <Label className="text-sm">
                    {sport.name} — Positions
                  </Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sport.positions.map((pos) => (
                      <button
                        key={pos}
                        onClick={() => togglePosition(sportId, pos)}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          (state.sport.positions[sportId] || []).includes(pos)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {pos.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Age bands */}
            <div>
              <Label className="text-sm">Age Bands</Label>
              <div className="flex gap-1 mt-1">
                {["U13", "U15", "U17", "U19", "Senior"].map((band) => (
                  <button
                    key={band}
                    onClick={() => toggleAgeBand(band)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      state.sport.ageBands.includes(band)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Protocol Inheritance */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Protocol Inheritance</h2>
            <p className="text-sm text-muted-foreground">
              Configure how global safety protocols flow to this institution.
              Mandatory protocols (PHV, RED readiness, ACWR) are always enforced.
            </p>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <div>
                <p className="text-sm font-medium">
                  Inherit Global Protocols
                </p>
                <p className="text-xs text-muted-foreground">
                  Include all global advisory protocols alongside mandatory
                  safety protocols
                </p>
              </div>
              <Switch
                checked={state.protocol.inheritGlobal}
                onCheckedChange={(v) =>
                  updateProtocol({ inheritGlobal: v })
                }
              />
            </div>

            {state.protocol.inheritGlobal && (
              <div>
                <Label className="text-sm">Inheritance Behavior</Label>
                <Select
                  value={state.protocol.inheritanceBehavior}
                  onValueChange={(v) =>
                    v && updateProtocol({
                      inheritanceBehavior: v as
                        | "inherit"
                        | "extend"
                        | "override",
                    })
                  }
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">
                      Inherit — Use global protocols as-is
                    </SelectItem>
                    <SelectItem value="extend">
                      Extend — Add institution-specific rules on top
                    </SelectItem>
                    <SelectItem value="override">
                      Override — Replace non-mandatory global protocols
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-sm">Enabled Protocol Categories</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {PROTOCOL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      const current = state.protocol.enabledCategories;
                      if (cat === "safety") return; // Safety always on
                      updateProtocol({
                        enabledCategories: current.includes(cat)
                          ? current.filter((c) => c !== cat)
                          : [...current, cat],
                      });
                    }}
                    className={`px-3 py-1 text-xs rounded-full capitalize transition-colors ${
                      state.protocol.enabledCategories.includes(cat)
                        ? cat === "safety"
                          ? "bg-red-500 text-white cursor-not-allowed"
                          : "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {cat}
                    {cat === "safety" && " (required)"}
                  </button>
                ))}
              </div>
            </div>

            <Card className="p-4 border-l-4 border-l-red-500">
              <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
                Mandatory Safety Floor
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                These protocols are enforced globally and cannot be disabled:
              </p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                <li>
                  \u2022 PHV Mid Safety Gate — Blocks heavy loading during growth
                  spurts
                </li>
                <li>
                  \u2022 RED Readiness Block — Stops all high intensity when
                  readiness is RED
                </li>
                <li>
                  \u2022 ACWR Danger Zone — Deload when acute:chronic ratio
                  exceeds 1.5
                </li>
                <li>
                  \u2022 Injury Severity Gate — Adjusts load based on injury
                  status
                </li>
              </ul>
            </Card>
          </div>
        )}

        {/* Step 5: Review & Activate */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Review &amp; Activate</h2>
            <p className="text-sm text-muted-foreground">
              Review the configuration before activating this institution.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2">Organization</h3>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{state.org.name || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Country</dt>
                    <dd>{state.org.country || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Timezone</dt>
                    <dd>{state.org.timezone}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tier</dt>
                    <dd className="capitalize">{state.org.tier}</dd>
                  </div>
                </dl>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2">
                  Performance Director
                </h3>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">
                      {state.pd.firstName} {state.pd.lastName}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd>{state.pd.email || "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Role</dt>
                    <dd>{state.pd.role}</dd>
                  </div>
                </dl>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2">Sports</h3>
                <div className="flex flex-wrap gap-1">
                  {state.sport.sports.map((s) => (
                    <Badge
                      key={s}
                      variant={
                        s === state.sport.primarySport
                          ? "default"
                          : "outline"
                      }
                      className="text-xs capitalize"
                    >
                      {s}
                      {s === state.sport.primarySport && " (primary)"}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {state.sport.ageBands.map((b) => (
                    <Badge key={b} variant="secondary" className="text-xs">
                      {b}
                    </Badge>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2">Protocols</h3>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Inherit Global
                    </dt>
                    <dd>
                      {state.protocol.inheritGlobal ? "Yes" : "No"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Behavior</dt>
                    <dd className="capitalize">
                      {state.protocol.inheritanceBehavior}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Categories</dt>
                    <dd>
                      {state.protocol.enabledCategories.join(", ")}
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>

            <Card className="p-4 border-l-4 border-l-green-500">
              <p className="text-sm">
                Activating will create the tenant, send an invitation email
                to the PD, and configure protocol inheritance. The PD can
                immediately start managing their institution.
              </p>
            </Card>
          </div>
        )}
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
        >
          Back
        </Button>
        <div className="flex gap-2">
          {step < 5 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance()}
            >
              Continue
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Activating..." : "Activate Institution"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
