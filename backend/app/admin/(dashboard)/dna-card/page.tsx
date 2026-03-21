"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ── Types ──

interface TierConfig {
  gradient: [string, string];
  text: string;
  icon: string;
  label: string;
  minRating: number;
}

interface DNATierConfigValue {
  tiers: Record<string, TierConfig>;
}

const TIER_ORDER = ["bronze", "silver", "gold", "diamond"] as const;

const ICON_OPTIONS = [
  { value: "shield", label: "Shield" },
  { value: "star", label: "Star" },
  { value: "diamond", label: "Diamond" },
  { value: "trophy", label: "Trophy" },
  { value: "flame", label: "Flame" },
  { value: "ribbon", label: "Ribbon" },
];

const DEFAULT_TIERS: DNATierConfigValue = {
  tiers: {
    bronze: {
      gradient: ["#CD7F32", "#8B5E3C"],
      text: "#FFF8F0",
      icon: "shield",
      label: "Bronze",
      minRating: 0,
    },
    silver: {
      gradient: ["#C0C0C0", "#808080"],
      text: "#FFFFFF",
      icon: "shield",
      label: "Silver",
      minRating: 30,
    },
    gold: {
      gradient: ["#FF6B35", "#00B4D8"],
      text: "#FFFFFF",
      icon: "star",
      label: "Gold",
      minRating: 60,
    },
    diamond: {
      gradient: ["#6366F1", "#8B5CF6"],
      text: "#FFFFFF",
      icon: "diamond",
      label: "Diamond",
      minRating: 85,
    },
  },
};

// ── Tier Preview Card ──

function TierPreview({ tier }: { tier: TierConfig }) {
  return (
    <div
      className="relative rounded-xl p-4 min-h-[100px] flex items-center justify-between overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${tier.gradient[0]}, ${tier.gradient[1]})`,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold" style={{ color: tier.text }}>
          75
        </span>
        <div>
          <div
            className="text-xs font-semibold tracking-wider uppercase opacity-80"
            style={{ color: tier.text }}
          >
            OVR
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
          style={{
            color: tier.text,
            backgroundColor: "rgba(0,0,0,0.2)",
          }}
        >
          {tier.label}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function DNACardConfigPage() {
  const [config, setConfig] = useState<DNATierConfigValue>(DEFAULT_TIERS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/content/ui-config?key=dna_card_tiers");
      if (res.ok) {
        const data = await res.json();
        if (data?.tiers) {
          setConfig(data);
        }
      }
    } catch {
      // Use defaults
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  function updateTier(tierKey: string, field: string, value: string | number) {
    setConfig((prev) => {
      const tier = prev.tiers[tierKey];
      if (!tier) return prev;

      let updated: TierConfig;
      if (field === "gradient0") {
        updated = { ...tier, gradient: [value as string, tier.gradient[1]] };
      } else if (field === "gradient1") {
        updated = { ...tier, gradient: [tier.gradient[0], value as string] };
      } else if (field === "minRating") {
        updated = { ...tier, minRating: Number(value) };
      } else {
        updated = { ...tier, [field]: value };
      }

      return {
        ...prev,
        tiers: { ...prev.tiers, [tierKey]: updated },
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/ui-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config_key: "dna_card_tiers",
          config_value: config,
        }),
      });
      if (res.ok) {
        toast.success("DNA Card tier config saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch (err) {
      toast.error("Failed to save tier config");
    }
    setSaving(false);
  }

  function handleReset() {
    setConfig(DEFAULT_TIERS);
    toast.info("Reset to default values (not saved yet)");
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading DNA Card tier config...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">DNA Card Tiers</h1>
          <p className="text-muted-foreground">
            Configure tier gradients, colors, icons, labels, and rating thresholds
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset Defaults
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Config"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {TIER_ORDER.map((tierKey) => {
          const tier = config.tiers[tierKey];
          if (!tier) return null;

          return (
            <Card key={tierKey}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg capitalize flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ backgroundColor: tier.gradient[0] }}
                  />
                  {tierKey} Tier
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Live Preview */}
                <TierPreview tier={tier} />

                {/* Gradient Colors */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Gradient Start
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={tier.gradient[0]}
                        onChange={(e) =>
                          updateTier(tierKey, "gradient0", e.target.value)
                        }
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input
                        value={tier.gradient[0]}
                        onChange={(e) =>
                          updateTier(tierKey, "gradient0", e.target.value)
                        }
                        className="font-mono text-xs"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Gradient End
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={tier.gradient[1]}
                        onChange={(e) =>
                          updateTier(tierKey, "gradient1", e.target.value)
                        }
                        className="w-8 h-8 rounded border cursor-pointer"
                      />
                      <Input
                        value={tier.gradient[1]}
                        onChange={(e) =>
                          updateTier(tierKey, "gradient1", e.target.value)
                        }
                        className="font-mono text-xs"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                </div>

                {/* Text Color */}
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Text Color
                  </Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={tier.text}
                      onChange={(e) =>
                        updateTier(tierKey, "text", e.target.value)
                      }
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    <Input
                      value={tier.text}
                      onChange={(e) =>
                        updateTier(tierKey, "text", e.target.value)
                      }
                      className="font-mono text-xs"
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>

                {/* Icon + Label + MinRating */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Icon
                    </Label>
                    <Select
                      value={tier.icon}
                      onValueChange={(val) => {
                        if (val) updateTier(tierKey, "icon", val);
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Label
                    </Label>
                    <Input
                      value={tier.label}
                      onChange={(e) =>
                        updateTier(tierKey, "label", e.target.value)
                      }
                      className="mt-1"
                      placeholder="Tier name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Min Rating
                    </Label>
                    <Input
                      type="number"
                      value={tier.minRating}
                      onChange={(e) =>
                        updateTier(tierKey, "minRating", e.target.value)
                      }
                      className="mt-1"
                      placeholder="0"
                      min={0}
                      max={99}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
