"use client";

/**
 * PayloadForm — renders the essential fields for a directive payload,
 * keyed by directive_type. For Phase 1 we surface the 2–4 most important
 * fields per type, with sensible defaults for the rest of the schema so
 * the PD can save a working directive without ever seeing JSON.
 *
 * Full payload editing for advanced fields will land in Phase 2 once the
 * methodology parser populates them automatically.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldGuide } from "@/components/admin/FieldGuide";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

export interface PayloadFormProps {
  type: DirectiveType;
  payload: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
}

/**
 * Component types that consume a metric_key. For everything else the
 * metric_key field is hidden — those component types pull from other
 * data sources (signals, calendar, recommendations, snapshot fields).
 */
const METRIC_DRIVEN_COMPONENTS = new Set([
  "kpi_row",
  "sparkline_row",
  "status_ring",
  "benchmark",
]);

interface AvailableMetric {
  metric_key: string;
  display_name: string;
  display_unit: string;
  category: string;
  sport_filter: string[] | null;
}

/**
 * Module-level cache for the metrics list — small, doesn't change often,
 * and the dropdown is opened many times across a PD's authoring session.
 */
let _metricsCache: AvailableMetric[] | null = null;

async function fetchAvailableMetrics(): Promise<AvailableMetric[]> {
  if (_metricsCache) return _metricsCache;
  try {
    const res = await fetch("/api/v1/admin/pd/instructions/metrics", {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    _metricsCache = (data.metrics ?? []) as AvailableMetric[];
    return _metricsCache;
  } catch {
    return [];
  }
}

/** Helper: comma-separated string -> string array (trimmed, empty filtered). */
function csvToList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
function listToCsv(a: string[] | undefined): string {
  return (a ?? []).join(", ");
}

/** Dispatch — render the right essentials block for this type. */
export function PayloadForm({ type, payload, onChange }: PayloadFormProps) {
  function set<K extends string>(key: K, value: any) {
    onChange({ ...payload, [key]: value });
  }

  switch (type) {
    case "identity":
      return (
        <div className="space-y-4">
          <Field
            label="Persona name"
            help={{ text: "What Tomo calls itself.", example: "e.g. 'Tomo', 'Coach Tomo'." }}
          >
            <Input
              value={payload.persona_name ?? ""}
              onChange={(e) => set("persona_name", e.target.value)}
              placeholder="Tomo"
            />
          </Field>
          <Field
            label="How would you describe Tomo's personality?"
            help={{
              text: "Describe Tomo's personality and approach in 1–3 sentences.",
              example: "e.g. 'A steady, knowledgeable coach. Warm but direct. Always gives a reason for advice.'",
            }}
          >
            <Textarea
              rows={3}
              value={payload.persona_description ?? ""}
              onChange={(e) => set("persona_description", e.target.value)}
            />
          </Field>
          <Field
            label="Voice attributes"
            help={{
              text: "A few keywords that capture how Tomo speaks. Comma-separated.",
              example: "e.g. warm, direct, evidence-based",
            }}
          >
            <Input
              value={listToCsv(payload.voice_attributes)}
              onChange={(e) => set("voice_attributes", csvToList(e.target.value))}
              placeholder="warm, direct, evidence-based"
            />
          </Field>
          <Field
            label="Use of emojis"
            help={{ text: "How often Tomo should use emojis." }}
          >
            <Select
              value={payload.emoji_policy ?? "sparing"}
              onValueChange={(v) => set("emoji_policy", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Never</SelectItem>
                <SelectItem value="sparing">Sparingly</SelectItem>
                <SelectItem value="moderate">Sometimes</SelectItem>
                <SelectItem value="frequent">Often</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "tone":
      return (
        <div className="space-y-4">
          <Field
            label="Phrases Tomo must never use"
            help={{
              text: "Comma-separated. Tomo will never include these in any response.",
              example: "e.g. great effort, fantastic work, according to your data",
            }}
          >
            <Textarea
              rows={3}
              value={listToCsv(payload.banned_phrases)}
              onChange={(e) => set("banned_phrases", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="Clinical/jargon language to avoid"
            help={{
              text: "Comma-separated. Phrases that sound too technical for athletes.",
              example: "e.g. ACWR, peak height velocity",
            }}
          >
            <Input
              value={listToCsv(payload.clinical_language_rules)}
              onChange={(e) => set("clinical_language_rules", csvToList(e.target.value))}
            />
          </Field>
        </div>
      );

    case "response_shape":
      return (
        <div className="space-y-4">
          <Field
            label="Use of bullet lists"
            help={{ text: "Should Tomo use bullets?" }}
          >
            <Select
              value={payload.bullet_policy ?? "allow"}
              onValueChange={(v) => set("bullet_policy", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="avoid">Avoid bullets</SelectItem>
                <SelectItem value="allow">Allow bullets when useful</SelectItem>
                <SelectItem value="prefer">Prefer bullets</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Emoji density"
            help={{ text: "How densely emojis can appear." }}
          >
            <Select
              value={payload.emoji_density ?? "low"}
              onValueChange={(v) => set("emoji_density", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No emojis</SelectItem>
                <SelectItem value="low">Low (occasional)</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Reply structure template (optional)"
            help={{
              text: "An outline Tomo follows for replies.",
              example: "e.g. 'Acknowledge → 1-line takeaway → 2 bullets → next step.'",
            }}
          >
            <Textarea
              rows={3}
              value={payload.structure_template ?? ""}
              onChange={(e) => set("structure_template", e.target.value)}
            />
          </Field>
        </div>
      );

    case "guardrail_phv":
      return (
        <div className="space-y-4">
          <Field
            label="Exercises Tomo must never recommend during a growth spurt"
            help={{
              text: "Comma-separated.",
              example: "e.g. barbell back squat at >70% 1RM, depth jumps, max sprint",
            }}
          >
            <Textarea
              rows={3}
              value={listToCsv(payload.blocked_exercises)}
              onChange={(e) => set("blocked_exercises", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="How strict?"
            help={{
              text: "'Advisory' adds a warning before responding. 'Blocking' refuses to answer.",
              example: "Advisory is the default — Tomo will suggest a safe alternative.",
            }}
          >
            <Select
              value={payload.advisory_or_blocking ?? "advisory"}
              onValueChange={(v) => set("advisory_or_blocking", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="advisory">Advisory (warn + suggest alternative)</SelectItem>
                <SelectItem value="blocking">Blocking (refuse)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="When age is unknown, what should Tomo do?"
            help={{
              text: "If we don't know the athlete's age band, default behaviour.",
            }}
          >
            <Select
              value={payload.unknown_age_default ?? "conservative"}
              onValueChange={(v) => set("unknown_age_default", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Be cautious (recommended)</SelectItem>
                <SelectItem value="permissive">Allow it</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "guardrail_age":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            For Phase 1, set the age scope (above) and add notes here. Per-age detailed
            limits can be set when the parser fills them from your methodology document.
          </p>
          <Field
            label="Notes for this age-rule"
            help={{ text: "What this rule covers — for your reference." }}
          >
            <Textarea
              rows={3}
              value={payload._notes ?? ""}
              onChange={(e) => set("_notes", e.target.value)}
            />
          </Field>
        </div>
      );

    case "guardrail_load":
      return (
        <div className="space-y-4">
          <Field
            label="Maximum hard sessions in a row"
            help={{ text: "After this many, Tomo recommends a recovery session." }}
          >
            <Input
              type="number"
              min={1}
              value={payload.consecutive_hard_day_limit ?? ""}
              onChange={(e) =>
                set("consecutive_hard_day_limit",
                  e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 3"
            />
          </Field>
          <Field
            label="Recovery gap (hours) between hard sessions"
            help={{ text: "Minimum hours between two hard sessions." }}
          >
            <Input
              type="number"
              min={0}
              value={payload.recovery_gap_hours ?? ""}
              onChange={(e) =>
                set("recovery_gap_hours",
                  e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 24"
            />
          </Field>
          <Field
            label="Weekly load cap"
            help={{
              text: "Maximum total load (in arbitrary units) per week. Leave blank for no cap.",
            }}
          >
            <Input
              type="number"
              min={0}
              step="any"
              value={payload.weekly_load_cap ?? ""}
              onChange={(e) =>
                set("weekly_load_cap",
                  e.target.value ? Number(e.target.value) : undefined)}
            />
          </Field>
        </div>
      );

    case "safety_gate":
      return (
        <div className="space-y-4">
          <Field
            label="What triggers this hard stop?"
            help={{
              text: "Describe in plain language when Tomo must refuse or redirect.",
              example: "e.g. 'Athlete reports concussion symptoms within 14 days.'",
            }}
          >
            <Textarea
              rows={2}
              value={payload.trigger_condition ?? ""}
              onChange={(e) => set("trigger_condition", e.target.value)}
            />
          </Field>
          <Field
            label="What should Tomo do?"
            help={{ text: "How to handle this trigger." }}
          >
            <Select
              value={payload.block_action ?? "redirect_to_coach"}
              onValueChange={(v) => set("block_action", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="refuse">Refuse to answer</SelectItem>
                <SelectItem value="redirect_to_coach">Redirect to a coach</SelectItem>
                <SelectItem value="require_override">Require override</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Message shown to the athlete"
            help={{
              text: "Plain-English explanation the athlete sees.",
              example: "e.g. 'I want to hand this to your coach — they're better placed to help.'",
            }}
          >
            <Textarea
              rows={2}
              value={payload.user_facing_reason_template ?? ""}
              onChange={(e) => set("user_facing_reason_template", e.target.value)}
            />
          </Field>
        </div>
      );

    case "threshold":
      return (
        <div className="space-y-4">
          <Field
            label="Which signal is this for?"
            help={{
              text: "The metric this threshold applies to.",
              example: "e.g. readiness, sleep, soreness, ccrs",
            }}
          >
            <Input
              value={payload.metric_name ?? ""}
              onChange={(e) => set("metric_name", e.target.value)}
            />
          </Field>
          <ZoneInputs
            zones={payload.zone_boundaries}
            onChange={(z) => set("zone_boundaries", z)}
          />
        </div>
      );

    case "performance_model":
      return (
        <div className="space-y-4">
          <Field
            label="Layer names (comma-separated)"
            help={{
              text: "The performance dimensions you measure.",
              example: "e.g. Physical, Technical, Tactical, Mental",
            }}
          >
            <Input
              value={(payload.layers ?? []).map((l: any) => l.name).join(", ")}
              onChange={(e) =>
                set(
                  "layers",
                  csvToList(e.target.value).map((name) => ({ name, anchor_metrics: [] })),
                )
              }
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Per-layer thresholds and per-position priorities can be added when the parser
            fills them from your methodology document.
          </p>
        </div>
      );

    case "mode_definition":
      return (
        <div className="space-y-4">
          <Field
            label="Mode name"
            help={{ text: "What you call this training mode.", example: "e.g. Build, Taper, Recovery" }}
          >
            <Input
              value={payload.mode_name ?? ""}
              onChange={(e) => set("mode_name", e.target.value)}
            />
          </Field>
          <Field
            label="Maximum intensity in this mode"
            help={{ text: "The hardest a session can be in this mode." }}
          >
            <Select
              value={payload.intensity_caps ?? "full"}
              onValueChange={(v) => set("intensity_caps", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rest">Rest only</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="full">Full intensity</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Load multiplier"
            help={{ text: "Scale the recommended load. 1.0 is normal. 0.7 means 70%." }}
          >
            <Input
              type="number"
              min={0} max={2} step="0.05"
              value={payload.load_multipliers ?? ""}
              onChange={(e) =>
                set("load_multipliers",
                  e.target.value ? Number(e.target.value) : undefined)}
            />
          </Field>
        </div>
      );

    case "routing_intent":
      return (
        <div className="space-y-4">
          <Field
            label="Intent name"
            help={{
              text: "What kind of question this rule handles.",
              example: "e.g. build_session, plan_training, readiness_check",
            }}
          >
            <Input
              value={payload.intent_id ?? ""}
              onChange={(e) => set("intent_id", e.target.value)}
            />
          </Field>
          <Field
            label="How should Tomo respond?"
            help={{ text: "The response style for this intent." }}
          >
            <Select
              value={payload.response_pattern ?? "open_coaching"}
              onValueChange={(v) => set("response_pattern", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="capsule_direct">Quick action (no LLM)</SelectItem>
                <SelectItem value="data_display">Show data + brief comment</SelectItem>
                <SelectItem value="multi_step">Multi-step flow</SelectItem>
                <SelectItem value="write_action">Take an action</SelectItem>
                <SelectItem value="open_coaching">Open coaching conversation</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "recommendation_policy":
      return (
        <div className="space-y-4">
          <Field
            label="Categories Tomo must never suggest"
            help={{
              text: "Comma-separated.",
              example: "e.g. olympic_lifts, max_sprint",
            }}
          >
            <Input
              value={listToCsv(payload.blocked_categories)}
              onChange={(e) => set("blocked_categories", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="Categories Tomo must always include"
            help={{ text: "Comma-separated." }}
          >
            <Input
              value={listToCsv(payload.mandatory_categories)}
              onChange={(e) => set("mandatory_categories", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="Maximum suggestions per reply"
            help={{ text: "Cap on how many recommendations Tomo gives at once." }}
          >
            <Input
              type="number" min={1}
              value={payload.max_recs_per_turn ?? ""}
              onChange={(e) =>
                set("max_recs_per_turn",
                  e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 3"
            />
          </Field>
        </div>
      );

    case "rag_policy":
      return (
        <div className="space-y-4">
          <Field
            label="Knowledge sources Tomo MUST use"
            help={{
              text: "Comma-separated.",
              example: "e.g. tomo_methodology, sports_science",
            }}
          >
            <Input
              value={listToCsv(payload.forced_domains)}
              onChange={(e) => set("forced_domains", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="Knowledge sources Tomo must SKIP"
            help={{ text: "Comma-separated." }}
          >
            <Input
              value={listToCsv(payload.blocked_domains)}
              onChange={(e) => set("blocked_domains", csvToList(e.target.value))}
            />
          </Field>
        </div>
      );

    case "memory_policy":
      return (
        <div className="space-y-4">
          <Field
            label="What kinds of things should Tomo remember?"
            help={{
              text: "Comma-separated atom types.",
              example: "e.g. current_goals, injury_history, behavioral_patterns",
            }}
          >
            <Input
              value={listToCsv(payload.atom_types)}
              onChange={(e) => set("atom_types", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="How long to keep memories (days)"
            help={{ text: "After this, memories are archived." }}
          >
            <Input
              type="number" min={1}
              value={payload.retention_days ?? ""}
              onChange={(e) =>
                set("retention_days",
                  e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 365"
            />
          </Field>
          <Field
            label="Extraction prompt"
            help={{
              text: "The instruction Tomo uses to pull these memories from a chat. Plain language.",
              example: "e.g. 'Read the conversation and extract any new goals, injuries, or preferences mentioned.'",
            }}
          >
            <Textarea
              rows={4}
              value={payload.extraction_prompt_template ?? ""}
              onChange={(e) => set("extraction_prompt_template", e.target.value)}
            />
          </Field>
        </div>
      );

    case "surface_policy":
      return (
        <div className="space-y-4">
          <Field
            label="Audience this rule shapes"
            help={{ text: "Whose view this rule controls." }}
          >
            <Select
              value={payload.audience ?? "athlete"}
              onValueChange={(v) => set("audience", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="athlete">Athletes</SelectItem>
                <SelectItem value="coach">Coaches</SelectItem>
                <SelectItem value="parent">Parents</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Things to show this audience (comma-separated)"
            help={{ text: "What this audience sees." }}
          >
            <Input
              value={listToCsv(payload.what_to_show)}
              onChange={(e) => set("what_to_show", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="Things to hide from this audience (comma-separated)"
            help={{ text: "What this audience does NOT see." }}
          >
            <Input
              value={listToCsv(payload.what_to_hide)}
              onChange={(e) => set("what_to_hide", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="Language simplification"
            help={{ text: "Should language be made simpler for this audience?" }}
          >
            <Select
              value={payload.language_simplification_level ?? "none"}
              onValueChange={(v) => set("language_simplification_level", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No simplification</SelectItem>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="strong">Strong</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "escalation":
      return (
        <div className="space-y-4">
          <Field
            label="Who should be alerted?"
            help={{ text: "Coach, parent, or both." }}
          >
            <Select
              value={payload.target_audience ?? "coach"}
              onValueChange={(v) => set("target_audience", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="coach">Coach</SelectItem>
                <SelectItem value="parent">Parent</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="When should the alert fire?"
            help={{
              text: "Describe the trigger in plain language. The parser will turn this into a rule.",
              example: "e.g. 'Three nights of poor sleep in a row.'",
            }}
          >
            <Textarea
              rows={2}
              value={payload._trigger_description ?? ""}
              onChange={(e) => {
                set("_trigger_description", e.target.value);
                // Stash a placeholder structured trigger so payload validates
                if (!payload.trigger_conditions) {
                  set("trigger_conditions", { description: e.target.value });
                }
              }}
            />
          </Field>
          <Field
            label="Notification message"
            help={{
              text: "What the recipient sees.",
              example: "e.g. '{{athlete_name}} has logged 3 poor-sleep nights this week. Suggest a low-intensity adjustment.'",
            }}
          >
            <Textarea
              rows={3}
              value={payload.notification_template ?? ""}
              onChange={(e) => set("notification_template", e.target.value)}
            />
          </Field>
          <Field
            label="Urgency"
            help={{ text: "How loudly to alert." }}
          >
            <Select
              value={payload.urgency ?? "normal"}
              onValueChange={(v) => set("urgency", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Cooldown (hours)"
            help={{ text: "Don't re-alert again within this many hours." }}
          >
            <Input
              type="number" min={0}
              value={payload.cooldown_hours ?? 24}
              onChange={(e) => set("cooldown_hours", Number(e.target.value))}
            />
          </Field>
        </div>
      );

    case "coach_dashboard_policy":
      return (
        <div className="space-y-4">
          <Field
            label="Widgets to show on the coach dashboard"
            help={{ text: "Comma-separated widget names." }}
          >
            <Input
              value={listToCsv(payload.dashboard_widgets)}
              onChange={(e) => set("dashboard_widgets", csvToList(e.target.value))}
            />
          </Field>
          <Field
            label="Coach summary template"
            help={{
              text: "How a coach's daily summary should read.",
              example: "e.g. 'Top 3 athletes needing attention today, plus one quick win.'",
            }}
          >
            <Textarea
              rows={3}
              value={payload.summary_template ?? ""}
              onChange={(e) => set("summary_template", e.target.value)}
            />
          </Field>
        </div>
      );

    case "parent_report_policy":
      return (
        <div className="space-y-4">
          <Field
            label="How often to send parent reports"
            help={{ text: "Frequency of the recurring report." }}
          >
            <Select
              value={payload.report_frequency ?? "weekly"}
              onValueChange={(v) => set("report_frequency", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="event_only">Only when something happens</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Report template"
            help={{
              text: "The structure / wording of the report.",
              example: "e.g. 'Hi {{parent_name}}, here's how {{athlete_name}} did this week…'",
            }}
          >
            <Textarea
              rows={4}
              value={payload.report_template ?? ""}
              onChange={(e) => set("report_template", e.target.value)}
            />
          </Field>
          <Field
            label="Topics to never include in parent reports"
            help={{
              text: "Comma-separated.",
              example: "e.g. mental_health_details, personal_chat_content",
            }}
          >
            <Input
              value={listToCsv(payload.blocked_topics)}
              onChange={(e) => set("blocked_topics", csvToList(e.target.value))}
            />
          </Field>
        </div>
      );

    case "dashboard_section":
      return <DashboardSectionForm payload={payload} set={set} />;
    case "signal_definition":
      return (
        <div className="space-y-4">
          <Field
            label="Signal name (internal key)"
            help={{
              text: "Short uppercase key — used internally for analytics & rollback.",
              example: "e.g. PRIMED, OVERLOADED, RECOVERING",
            }}
          >
            <Input
              value={payload.signal_key ?? ""}
              onChange={(e) => set("signal_key", e.target.value)}
              placeholder="PRIMED"
            />
          </Field>
          <Field
            label="What the athlete sees as the signal title"
            help={{ text: "Plain-language headline shown at the top of the dashboard." }}
          >
            <Input
              value={payload.display_name ?? ""}
              onChange={(e) => set("display_name", e.target.value)}
              placeholder="You're primed."
            />
          </Field>
          <Field
            label="Subtitle (optional)"
            help={{ text: "One-line context under the title." }}
          >
            <Input
              value={payload.subtitle ?? ""}
              onChange={(e) => set("subtitle", e.target.value || null)}
              placeholder="Sleep, HRV, and load are all in the green."
            />
          </Field>
          <Field
            label="Coaching text (optional)"
            help={{
              text: "Plain-language explanation. Supports {field} placeholders.",
              example: "e.g. \"Your HRV is up {hrv_delta_pct}% — go for it today.\"",
            }}
          >
            <Textarea
              rows={3}
              value={payload.coaching_text_template ?? ""}
              onChange={(e) =>
                set("coaching_text_template", e.target.value || null)
              }
            />
          </Field>
          <Field
            label="Show urgency badge?"
            help={{ text: "Tick for safety-critical signals (e.g. injury concern)." }}
          >
            <Select
              value={String(payload.show_urgency_badge ?? false)}
              onValueChange={(v) =>
                set("show_urgency_badge", v === "true")
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">No</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            Trigger conditions, pill config, and visual styling are populated by
            the parser when this signal is generated from a methodology document.
            For hand-authored signals, use the Description field for now and the
            data team will fill in the structured fields.
          </p>
        </div>
      );

    case "program_rule":
      return (
        <div className="space-y-4">
          <Field
            label="Rule name"
            help={{
              text: "A short label so you can find this rule later.",
              example: "e.g. U15 strikers — mandate ACL prevention",
            }}
          >
            <Input
              value={payload.rule_name ?? ""}
              onChange={(e) => set("rule_name", e.target.value)}
              placeholder="U15 strikers — mandate ACL prevention"
            />
          </Field>
          <Field
            label="Category"
            help={{
              text: "Helps you find related rules later. Doesn't change behaviour.",
            }}
          >
            <Select
              value={payload.category ?? "development"}
              onValueChange={(v) => set("category", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="development">Development</SelectItem>
                <SelectItem value="recovery">Recovery</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="injury_prevention">Injury prevention</SelectItem>
                <SelectItem value="position_specific">Position-specific</SelectItem>
                <SelectItem value="load_management">Load management</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Programs Tomo MUST recommend"
            help={{
              text: "Comma-separated program IDs or slugs.",
              example: "e.g. acl_prevention, mobility_basics",
            }}
          >
            <Input
              value={listToCsv(payload.mandatory_programs)}
              onChange={(e) =>
                set("mandatory_programs", csvToList(e.target.value))
              }
            />
          </Field>
          <Field
            label="Programs Tomo MUST NEVER recommend"
            help={{
              text: "Comma-separated.",
              example: "e.g. olympic_lifts, max_sprint_protocol",
            }}
          >
            <Input
              value={listToCsv(payload.blocked_programs)}
              onChange={(e) =>
                set("blocked_programs", csvToList(e.target.value))
              }
            />
          </Field>
          <Field
            label="Categories Tomo should prioritise"
            help={{
              text: "Comma-separated. Programs in these categories get bumped up.",
            }}
          >
            <Input
              value={listToCsv(payload.prioritize_categories)}
              onChange={(e) =>
                set("prioritize_categories", csvToList(e.target.value))
              }
            />
          </Field>
          <Field
            label="Categories Tomo should skip"
            help={{ text: "Comma-separated." }}
          >
            <Input
              value={listToCsv(payload.block_categories)}
              onChange={(e) =>
                set("block_categories", csvToList(e.target.value))
              }
            />
          </Field>
          <Field
            label="Load multiplier (0.0 – 2.0)"
            help={{
              text: "Scales prescribed load. 1.0 = unchanged. 0.7 = 70% of usual.",
            }}
          >
            <Input
              type="number"
              min={0}
              max={2}
              step="0.05"
              value={payload.load_multiplier ?? ""}
              onChange={(e) =>
                set(
                  "load_multiplier",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </Field>
          <Field
            label="Maximum intensity"
            help={{ text: "The hardest a session can be when this rule fires." }}
          >
            <Select
              value={payload.intensity_cap ?? ""}
              onValueChange={(v) => set("intensity_cap", v || null)}
            >
              <SelectTrigger><SelectValue placeholder="(no cap)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(no cap)</SelectItem>
                <SelectItem value="rest">Rest only</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="AI guidance text"
            help={{
              text: "Plain-language note injected into Tomo's prompt when this rule applies.",
              example: "e.g. \"Frame everything around safe progression. No 1RM testing.\"",
            }}
          >
            <Textarea
              rows={3}
              value={payload.ai_guidance_text ?? ""}
              onChange={(e) =>
                set("ai_guidance_text", e.target.value || null)
              }
            />
          </Field>
          <Field
            label="Safety-critical?"
            help={{
              text: "Mark if Tomo's AI must never override this rule. Use sparingly — only true safety hard-stops.",
            }}
          >
            <Select
              value={String(payload.safety_critical ?? false)}
              onValueChange={(v) => set("safety_critical", v === "true")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">No</SelectItem>
                <SelectItem value="true">Yes — hard safety rule</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );

    case "planning_policy":
    case "scheduling_policy":
    case "routing_classifier":
    case "meta_parser":
    case "meta_conflict":
    default:
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            This rule type is best authored from a methodology document — the parser will
            fill in the structured fields automatically. For now, you can describe the rule
            in your own words below; it will be saved as a note on the rule.
          </p>
          <Field
            label="Description"
            help={{ text: "Your description of this rule. Stored as a note for now." }}
          >
            <Textarea
              rows={4}
              value={payload._description ?? ""}
              onChange={(e) => set("_description", e.target.value)}
            />
          </Field>
        </div>
      );
  }
}

/** Build a sensible default payload for a directive_type so the form
 *  produces a payload that passes the Zod schema on first save. */
export function defaultPayloadFor(type: DirectiveType): Record<string, any> {
  switch (type) {
    case "identity":
      return {
        persona_name: "Tomo",
        persona_description: "A steady, knowledgeable coach who explains the why.",
        voice_attributes: ["warm", "direct", "evidence-based"],
        emoji_policy: "sparing",
      };
    case "tone":
      return { banned_phrases: [], banned_patterns: [], required_companion_clauses: {}, clinical_language_rules: [], acronym_scaffolding_rules: [] };
    case "response_shape":
      return { max_length_by_intent: {}, bullet_policy: "allow", emoji_density: "low", card_vs_text_rules: {}, chip_suggestions: {} };
    case "guardrail_phv":
      return { blocked_exercises: [], phv_stage_rules: {}, advisory_or_blocking: "advisory", safe_alternatives: {}, unknown_age_default: "conservative" };
    case "guardrail_age":
      return { age_band_overrides: {} };
    case "guardrail_load":
      return {};
    case "safety_gate":
      return { trigger_condition: "", block_action: "redirect_to_coach", override_role: "none", user_facing_reason_template: "" };
    case "threshold":
      return { metric_name: "", zone_boundaries: { green: [0, 0], yellow: [0, 0], red: [0, 0] } };
    case "performance_model":
      return {
        layers: [{ name: "Physical", anchor_metrics: [] }, { name: "Technical", anchor_metrics: [] }, { name: "Tactical", anchor_metrics: [] }, { name: "Mental", anchor_metrics: [] }],
        per_position_priorities: {},
        gap_thresholds: { strength: 75, on_track: 55, developing: 35, gap: 0 },
      };
    case "mode_definition":
      return { mode_name: "", activation_conditions: {}, recommended_categories: [], blocked_categories: [] };
    case "planning_policy":
      return { phase_definitions: [], transition_rules: {}, taper_rules: {}, peak_rules: {}, competition_proximity_rules: {} };
    case "scheduling_policy":
      return { exam_window_overrides: {}, school_day_constraints: {}, cognitive_window_rules: {} };
    case "routing_intent":
      return { intent_id: "", response_pattern: "open_coaching", tool_chain: [] };
    case "routing_classifier":
      return { intent_examples: {}, fallback_intent: "open_coaching", agent_lock_rules: {}, smalltalk_routing: {}, classifier_version: "sonnet_v1", confidence_threshold: 0.6 };
    case "recommendation_policy":
      return { scope_conditions: {}, blocked_categories: [], mandatory_categories: [], forced_inclusions: {} };
    case "rag_policy":
      return { forced_domains: [], blocked_domains: [], chunk_count: 5, sport_filter: [], age_filter: [], phv_filter: [], min_similarity: 0.7 };
    case "memory_policy":
      return {
        extraction_prompt_template: "Read the conversation and extract any new goals, concerns, injuries, preferences, and milestones the athlete mentioned.",
        atom_types: ["current_goals", "unresolved_concerns", "injury_history", "behavioral_patterns", "coaching_preferences", "last_topics", "key_milestones"],
        truncation_tokens: 500,
        dedup_strategy: "embedding",
        retention_days: 365,
        sport_aware_rules: {},
        extraction_trigger: { on_signal: [] },
      };
    case "surface_policy":
      return { audience: "athlete", what_to_show: [], what_to_hide: [], language_simplification_level: "none", terminology_translations: {} };
    case "escalation":
      return { trigger_conditions: { description: "" }, target_audience: "coach", notification_template: "", urgency: "normal", cooldown_hours: 24, requires_athlete_consent: false };
    case "coach_dashboard_policy":
      return { dashboard_widgets: [], alert_rules: {}, roster_sort_rules: {} };
    case "parent_report_policy":
      return { report_frequency: "weekly", report_template: "Hi {{parent_name}}, here's how {{athlete_name}} did this week.", blocked_topics: [], language_simplification_level: "mild", consent_requirements: [] };
    case "meta_parser":
      return { extraction_prompt: "Extract directives from the methodology document, mapping each to one of the 23 directive types.", extraction_schema_version: 1, extraction_model: "claude-sonnet-4-6", chunking_strategy: "section", confidence_threshold_for_auto_propose: 0.5 };
    case "meta_conflict":
      return { merge_rules_per_type: { load_multiplier: "MIN", intensity_cap: "MOST_RESTRICTIVE", arrays: "UNION" }, priority_tiebreakers: ["priority", "audience_specificity", "updated_at"], audience_inheritance_rules: {} };
    // Phase 7
    case "dashboard_section":
      return {
        section_key: "",
        display_name: "",
        component_type: "kpi_row",
        panel_key: "main",
        sort_order: 100,
        metric_key: null,
        coaching_text_template: null,
        config: {},
        is_enabled: true,
      };
    case "signal_definition":
      return {
        signal_key: "",
        display_name: "",
        subtitle: null,
        conditions: { match: "all", conditions: [] },
        coaching_text_template: null,
        pill_config: [],
        trigger_config: [],
        show_urgency_badge: false,
        urgency_label: null,
        is_enabled: true,
      };
    case "program_rule":
      return {
        rule_name: "",
        description: null,
        category: "development",
        conditions: { match: "all", conditions: [] },
        mandatory_programs: [],
        blocked_programs: [],
        high_priority_programs: [],
        prioritize_categories: [],
        block_categories: [],
        load_multiplier: null,
        session_cap_minutes: null,
        frequency_cap: null,
        intensity_cap: null,
        ai_guidance_text: null,
        safety_critical: false,
        evidence_source: null,
        evidence_grade: null,
        is_enabled: true,
      };
    // Phase 8: Bucketed verticals — share a common guidance shape.
    case "sleep_policy":
    case "nutrition_policy":
    case "wellbeing_policy":
    case "injury_policy":
    case "career_policy":
      return {
        name: "",
        description: "",
        notes: null,
        hard_stops: [],
        applies_when: [],
        ai_overridable: true,
        evidence_source: null,
        evidence_grade: null,
        extras: {},
      };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help: { text: string; example?: string; warning?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      <FieldGuide {...help} />
    </div>
  );
}

function ZoneInputs({
  zones,
  onChange,
}: {
  zones?: { green?: [number, number]; yellow?: [number, number]; red?: [number, number] };
  onChange: (z: any) => void;
}) {
  const z = zones ?? {};
  function setZone(name: "green" | "yellow" | "red", idx: 0 | 1, value: string) {
    const arr = [...(z[name] ?? [0, 0])];
    arr[idx] = value === "" ? 0 : Number(value);
    onChange({ ...z, [name]: arr });
  }
  return (
    <div className="space-y-2">
      <Label>Zone boundaries</Label>
      {(["green", "yellow", "red"] as const).map((name) => (
        <div key={name} className="grid grid-cols-[80px_1fr_1fr] items-center gap-2">
          <span className="text-sm capitalize text-muted-foreground">{name}</span>
          <Input
            type="number"
            step="any"
            placeholder="from"
            value={z[name]?.[0] ?? ""}
            onChange={(e) => setZone(name, 0, e.target.value)}
          />
          <Input
            type="number"
            step="any"
            placeholder="to"
            value={z[name]?.[1] ?? ""}
            onChange={(e) => setZone(name, 1, e.target.value)}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Green = healthy. Yellow = warning. Red = stop / unsafe.
      </p>
    </div>
  );
}


// ─── DashboardSectionForm ───────────────────────────────────────────────
// Standalone sub-component because (a) it's the only payload type that
// needs to fetch the metrics registry on mount, and (b) its metric_key
// field is conditionally rendered based on component_type.

function DashboardSectionForm({
  payload,
  set,
}: {
  payload: Record<string, any>;
  set: (key: string, value: any) => void;
}) {
  const componentType: string = payload.component_type ?? "kpi_row";
  const showsMetric = METRIC_DRIVEN_COMPONENTS.has(componentType);

  const [metrics, setMetrics] = useState<AvailableMetric[]>([]);
  const [metricsLoaded, setMetricsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAvailableMetrics().then((m) => {
      if (!active) return;
      setMetrics(m);
      setMetricsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // If the PD switches to a non-metric component type, clear the stale value.
  useEffect(() => {
    if (!showsMetric && payload.metric_key) {
      set("metric_key", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentType]);

  return (
    <div className="space-y-4">
      <Field
        label="Card type"
        help={{
          text: "What kind of card is this on the athlete's dashboard?",
          example:
            "KPI row, Sparkline, Status ring, and Benchmark show a single metric. The others pull from elsewhere (signals, calendar, recommendations, snapshot fields).",
        }}
      >
        <Select
          value={componentType}
          onValueChange={(v) => set("component_type", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="signal_hero">Hero alert (uses a Dashboard alert rule)</SelectItem>
            <SelectItem value="status_ring">Status ring (shows a metric)</SelectItem>
            <SelectItem value="kpi_row">KPI row (shows a metric)</SelectItem>
            <SelectItem value="sparkline_row">Sparkline (shows a metric trend)</SelectItem>
            <SelectItem value="benchmark">Benchmark (shows a metric percentile)</SelectItem>
            <SelectItem value="dual_load">Dual-load gauge (uses snapshot)</SelectItem>
            <SelectItem value="rec_list">Recommendation list (uses recs system)</SelectItem>
            <SelectItem value="event_list">Upcoming events (uses calendar)</SelectItem>
            <SelectItem value="growth_card">Growth card (uses snapshot)</SelectItem>
            <SelectItem value="engagement_bar">Engagement bar</SelectItem>
            <SelectItem value="protocol_banner">Protocol banner (your text)</SelectItem>
            <SelectItem value="custom_card">Custom card</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Where on screen"
        help={{
          text: "Main dashboard, or one of the sub-panels (Programs, Metrics, Progress).",
        }}
      >
        <Select
          value={payload.panel_key ?? "main"}
          onValueChange={(v) => set("panel_key", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">Main dashboard</SelectItem>
            <SelectItem value="program">Programs panel</SelectItem>
            <SelectItem value="metrics">Metrics panel</SelectItem>
            <SelectItem value="progress">Progress panel</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Internal name (your label)"
        help={{
          text: "An internal label so you can find this rule later. The PD invents it. Lowercase, underscores. Does NOT pull data — it's just a name.",
          example:
            "e.g. u15_striker_sleep_trend, gk_reactive_agility, recovery_mode_banner.",
          warning:
            "If two rules share the same internal name, only the higher-priority one applies. Use distinct names per scope.",
        }}
      >
        <Input
          value={payload.section_key ?? ""}
          onChange={(e) => set("section_key", e.target.value)}
          placeholder="u15_striker_sleep_trend"
        />
      </Field>

      <Field
        label="Display name (what the athlete reads)"
        help={{ text: "The card title shown to the athlete." }}
      >
        <Input
          value={payload.display_name ?? ""}
          onChange={(e) => set("display_name", e.target.value)}
          placeholder="Sleep — last 7 days"
        />
      </Field>

      <Field
        label="Order on screen"
        help={{
          text: "Lower number = higher up. Default 100. Use 5–10 for top, 100 for middle, 200+ for bottom.",
        }}
      >
        <Input
          type="number"
          value={payload.sort_order ?? 100}
          onChange={(e) => set("sort_order", Number(e.target.value))}
        />
      </Field>

      {/* metric_key only shown for component types that consume one */}
      {showsMetric && (
        <Field
          label="Which metric this card shows"
          help={{
            text: "Pick from the registered metrics in the platform. The metric tells Tomo where to fetch the actual value (snapshot field, daily vitals, check-in, etc.).",
            example:
              "Sleep hours, HRV morning, CCRS score, Mood. New metrics require a developer change.",
            warning:
              metricsLoaded && metrics.length === 0
                ? "No metrics found in the registry. Ask your data team to add one before authoring metric-driven cards."
                : undefined,
          }}
        >
          <Select
            value={payload.metric_key ?? "_none"}
            onValueChange={(v) =>
              set("metric_key", v === "_none" ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  metricsLoaded ? "Pick a metric…" : "Loading metrics…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">(none — leave empty)</SelectItem>
              {metrics.map((m) => (
                <SelectItem key={m.metric_key} value={m.metric_key}>
                  {m.display_name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {m.metric_key}
                    {m.display_unit ? ` · ${m.display_unit}` : ""}
                    {m.category ? ` · ${m.category}` : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field
        label="Coaching text (optional)"
        help={{
          text: "Plain-language template shown alongside the card. Use {field} placeholders that get replaced with the athlete's live values.",
          example:
            'e.g. "You\'ve slept {sleep_hours}h on average this week."',
        }}
      >
        <Textarea
          rows={3}
          value={payload.coaching_text_template ?? ""}
          onChange={(e) =>
            set("coaching_text_template", e.target.value || null)
          }
        />
      </Field>
    </div>
  );
}
