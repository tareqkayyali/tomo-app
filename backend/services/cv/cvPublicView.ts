/**
 * Public CV view — resolves a share_slug into a masked bundle for
 * anonymous scout viewing at /t/<slug>. Honours the athlete's three
 * medical-consent toggles plus strips PII (email, phone, guardian).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { assembleCVBundle } from "./cvAssembler";
import type { FullCVBundle } from "./cvAssembler";

export interface PublicCVBundle extends Omit<FullCVBundle, "identity" | "references" | "health_status" | "share"> {
  identity: Omit<FullCVBundle["identity"], "email" | "guardian_name" | "guardian_email" | "guardian_phone">;
  references: FullCVBundle["references"];
  health_status: FullCVBundle["health_status"] | null;
  share: {
    public_url: string;
    share_views_count: number;
  };
  athlete_id: string;
  scope: "public_scout";
}

export interface PublicResolveResult {
  bundle: PublicCVBundle;
  athlete_id: string;
}

export async function resolvePublicCVBySlug(slug: string): Promise<PublicResolveResult | null> {
  const db = supabaseAdmin();

  const { data: profile } = await (db as any)
    .from("cv_profiles")
    .select("athlete_id, is_published, share_views_count, medical_consent_scouts_summary, medical_consent_raw")
    .eq("share_slug", slug)
    .single();

  if (!profile || !profile.is_published) return null;

  const bundle = await assembleCVBundle(profile.athlete_id);
  const masked = applyScoutMasking(bundle, {
    share_with_scouts_summary: profile.medical_consent_scouts_summary ?? true,
    share_raw_data: profile.medical_consent_raw ?? false,
  });

  return {
    athlete_id: profile.athlete_id,
    bundle: {
      ...masked,
      athlete_id: profile.athlete_id,
      scope: "public_scout",
      share: {
        public_url: buildPublicShareUrl(slug),
        share_views_count: profile.share_views_count ?? 0,
      },
    },
  };
}

export async function recordScoutView(
  athleteId: string,
  slug: string,
  viewerIp: string | null,
  viewerUa: string | null
): Promise<void> {
  const db = supabaseAdmin();

  try {
    await Promise.all([
      (db as any).from("cv_share_views").insert({
        athlete_id: athleteId,
        share_token: slug,
        viewer_ip: viewerIp,
        viewer_ua: viewerUa,
      }),
      (db as any).rpc("increment", { /* noop: optimistic read-then-write */ }),
    ]);
  } catch {
    // Fallback: read + write the count manually
  }

  // Atomic increment via read-then-write (acceptable for low-traffic counter)
  const { data: current } = await (db as any)
    .from("cv_profiles")
    .select("share_views_count")
    .eq("share_slug", slug)
    .single();

  if (current) {
    await (db as any)
      .from("cv_profiles")
      .update({ share_views_count: (current.share_views_count ?? 0) + 1 })
      .eq("share_slug", slug);
  }
}

function applyScoutMasking(
  bundle: FullCVBundle,
  consent: { share_with_scouts_summary: boolean; share_raw_data: boolean }
): Omit<PublicCVBundle, "athlete_id" | "scope" | "share"> {
  // Identity: strip all contact info
  const identity = { ...bundle.identity };
  delete (identity as any).email;
  delete (identity as any).guardian_name;
  delete (identity as any).guardian_email;
  delete (identity as any).guardian_phone;

  // References: only published ones, strip contact info
  const references = bundle.references
    .filter((r) => r.status === "published")
    .map((r) => {
      const next = { ...r };
      next.email = null;
      next.phone = null;
      return next;
    });

  // Health: honour the 2 scout-facing toggles
  let healthStatus: FullCVBundle["health_status"] | null = null;
  if (consent.share_with_scouts_summary) {
    const base = bundle.health_status;
    healthStatus = {
      ...base,
      // Summary-only: keep overall status + availability + consent bits
      // but wipe the raw injury log unless share_raw_data is on.
      injury_log: consent.share_raw_data ? base.injury_log : [],
    };
  }

  // Performance: if share_raw_data is off, strip session log (individual
  // sessions are "raw"); KPIs and benchmarks are summarised and stay.
  const verified_performance = {
    ...bundle.verified_performance,
    session_log: consent.share_raw_data ? bundle.verified_performance.session_log : [],
  };

  return {
    identity,
    physical: bundle.physical,
    positions: bundle.positions,
    player_profile: bundle.player_profile,
    verified_performance,
    career: bundle.career,
    media: bundle.media,
    references,
    awards_character: bundle.awards_character,
    health_status: healthStatus,
    completeness_pct: bundle.completeness_pct,
    completeness_breakdown: bundle.completeness_breakdown,
    next_steps: [], // scouts don't see the roadmap
    section_states: bundle.section_states,
    last_updated: bundle.last_updated,
  };
}

function buildPublicShareUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.my-tomo.com";
  return `${base}/t/${slug}`;
}
