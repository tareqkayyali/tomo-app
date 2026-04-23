/**
 * CV Service — CRUD for all CV-domain tables (single-flow schema, migration 094).
 *
 * Organized by resource:
 *   - Career (cv_career_entries)
 *   - Media (cv_media_links)
 *   - References (cv_references) + state machine (request / submit / verify / reject)
 *   - Awards & Character (cv_character_traits)
 *   - Injury log (cv_injury_log)
 *   - Medical consent (cv_profiles.medical_consent_*)
 *   - Profile (cv_profiles head-row)
 *   - Share (slug generation, publish/unpublish)
 *   - AI summary versions (read-only list)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

const db = () => supabaseAdmin();

// ═══════════════════════════════════════════════════════════════════════════
// CAREER (cv_career_entries)
// ═══════════════════════════════════════════════════════════════════════════

export type CareerEntryType = "club" | "academy" | "national_team" | "trial" | "camp" | "showcase";

export interface CareerEntryInput {
  athlete_id: string;
  entry_type?: CareerEntryType;
  club_name: string;
  league_level?: string | null;
  country?: string | null;
  position?: string | null;
  started_month?: string | null;
  ended_month?: string | null;
  is_current?: boolean;
  appearances?: number | null;
  goals?: number | null;
  assists?: number | null;
  clean_sheets?: number | null;
  achievements?: string[];
  injury_note?: string | null;
}

export async function listCareer(athleteId: string) {
  const { data, error } = await (db() as any)
    .from("cv_career_entries")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCareer(input: CareerEntryInput) {
  if (input.is_current) {
    await (db() as any)
      .from("cv_career_entries")
      .update({ is_current: false })
      .eq("athlete_id", input.athlete_id)
      .eq("is_current", true);
  }

  const { data, error } = await (db() as any)
    .from("cv_career_entries")
    .insert({
      athlete_id: input.athlete_id,
      entry_type: input.entry_type ?? "club",
      club_name: input.club_name,
      league_level: input.league_level ?? null,
      country: input.country ?? null,
      position: input.position ?? null,
      started_month: input.started_month ?? null,
      ended_month: input.ended_month ?? null,
      is_current: input.is_current ?? false,
      appearances: input.appearances ?? null,
      goals: input.goals ?? null,
      assists: input.assists ?? null,
      clean_sheets: input.clean_sheets ?? null,
      achievements: input.achievements ?? [],
      injury_note: input.injury_note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCareer(
  id: string,
  athleteId: string,
  patch: Partial<Omit<CareerEntryInput, "athlete_id">>
) {
  if (patch.is_current) {
    await (db() as any)
      .from("cv_career_entries")
      .update({ is_current: false })
      .eq("athlete_id", athleteId)
      .eq("is_current", true)
      .neq("id", id);
  }

  const { data, error } = await (db() as any)
    .from("cv_career_entries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("athlete_id", athleteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCareer(id: string, athleteId: string) {
  const { error } = await (db() as any)
    .from("cv_career_entries")
    .delete()
    .eq("id", id)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA (cv_media_links)
// ═══════════════════════════════════════════════════════════════════════════

export type MediaType = "highlight_reel" | "full_match" | "training" | "social";
export type MediaPlatform = "youtube" | "vimeo" | "instagram" | "tiktok" | "wyscout" | "hudl" | "other";

export interface MediaLinkInput {
  athlete_id: string;
  media_type: MediaType;
  platform?: MediaPlatform | null;
  url: string;
  title?: string | null;
  is_primary?: boolean;
}

export async function createMediaLink(input: MediaLinkInput) {
  if (input.is_primary) {
    await (db() as any)
      .from("cv_media_links")
      .update({ is_primary: false })
      .eq("athlete_id", input.athlete_id)
      .eq("media_type", input.media_type);
  }

  const { data, error } = await (db() as any)
    .from("cv_media_links")
    .insert({
      athlete_id: input.athlete_id,
      media_type: input.media_type,
      platform: input.platform ?? null,
      url: input.url,
      title: input.title ?? null,
      is_primary: input.is_primary ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMediaLink(id: string, athleteId: string) {
  const { error } = await (db() as any)
    .from("cv_media_links")
    .delete()
    .eq("id", id)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════════
// REFERENCES (cv_references) — state machine
// ═══════════════════════════════════════════════════════════════════════════

export type ReferenceStatus = "requested" | "submitted" | "identity_verified" | "published" | "rejected";

export interface ReferenceRequestInput {
  athlete_id: string;
  referee_name: string;
  referee_role: string;
  club_institution: string;
  email: string;
  relationship?: string | null;
  phone?: string | null;
}

/**
 * Athlete initiates a reference request. Creates a row in 'requested' status
 * with a unique request_token. The email flow (Phase 3 API route) sends the
 * token to the referee.
 */
export async function requestReference(input: ReferenceRequestInput) {
  const token = randomBytes(24).toString("base64url");

  const { data, error } = await (db() as any)
    .from("cv_references")
    .insert({
      athlete_id: input.athlete_id,
      referee_name: input.referee_name,
      referee_role: input.referee_role,
      club_institution: input.club_institution,
      email: input.email,
      phone: input.phone ?? null,
      relationship: input.relationship ?? null,
      status: "requested",
      request_token: token,
      request_sent_at: new Date().toISOString(),
      consent_given: false,
    })
    .select()
    .single();
  if (error) throw error;
  return { row: data, token };
}

/**
 * Referee submits their note via the token link. Moves status to 'submitted'.
 * Called from an anon route; RLS policy allows UPDATE when status='requested'
 * and request_token matches.
 */
export async function submitReferenceByToken(
  token: string,
  payload: { rating: number; note: string }
): Promise<{ ok: boolean; reason?: string }> {
  const { data: row, error: findErr } = await (db() as any)
    .from("cv_references")
    .select("id, status")
    .eq("request_token", token)
    .single();
  if (findErr || !row) return { ok: false, reason: "invalid_token" };
  if (row.status !== "requested") return { ok: false, reason: "already_submitted" };
  if (payload.rating < 1 || payload.rating > 5) return { ok: false, reason: "invalid_rating" };

  const { error } = await (db() as any)
    .from("cv_references")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_rating: payload.rating,
      submitted_note: payload.note,
      consent_given: true,
    })
    .eq("id", row.id);
  if (error) return { ok: false, reason: "db_error" };

  return { ok: true };
}

/**
 * Admin marks the submission as identity-verified. Then auto-publishes.
 */
export async function verifyAndPublishReference(referenceId: string, adminId: string) {
  const now = new Date().toISOString();
  const { error } = await (db() as any)
    .from("cv_references")
    .update({
      status: "published",
      identity_verified_at: now,
      identity_verified_by: adminId,
      published_at: now,
    })
    .eq("id", referenceId)
    .eq("status", "submitted");
  if (error) throw error;
}

export async function rejectReference(referenceId: string, adminId: string, reason: string) {
  const { error } = await (db() as any)
    .from("cv_references")
    .update({
      status: "rejected",
      identity_verified_by: adminId,
      identity_verified_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", referenceId);
  if (error) throw error;
}

export async function deleteReference(id: string, athleteId: string) {
  const { error } = await (db() as any)
    .from("cv_references")
    .delete()
    .eq("id", id)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

/**
 * CMS queue: all references awaiting identity verification, ordered by
 * submission time (oldest first — FIFO).
 */
export async function listPendingReferenceReviews(limit = 50) {
  const { data, error } = await (db() as any)
    .from("cv_references")
    .select("*, athlete:athlete_id(id, name, email, avatar_url)")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════
// AWARDS & CHARACTER (cv_character_traits)
// ═══════════════════════════════════════════════════════════════════════════

export type TraitCategory = "award" | "leadership" | "language" | "character";

export interface TraitInput {
  athlete_id: string;
  trait_category: TraitCategory;
  title: string;
  description?: string | null;
  level?: string | null;
  date?: string | null;
}

export async function createTrait(input: TraitInput) {
  const { data, error } = await (db() as any)
    .from("cv_character_traits")
    .insert({
      athlete_id: input.athlete_id,
      trait_category: input.trait_category,
      title: input.title,
      description: input.description ?? null,
      level: input.level ?? null,
      date: input.date ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrait(id: string, athleteId: string) {
  const { error } = await (db() as any)
    .from("cv_character_traits")
    .delete()
    .eq("id", id)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════════
// INJURY LOG (cv_injury_log)
// ═══════════════════════════════════════════════════════════════════════════

export type InjurySeverity = "minor" | "moderate" | "major";
export type InjuryStatus = "active" | "recovering" | "cleared";

export interface InjuryInput {
  athlete_id: string;
  body_part: string;
  side?: "left" | "right" | "bilateral" | "central" | null;
  severity: InjurySeverity;
  status?: InjuryStatus;
  date_occurred: string;
  cleared_at?: string | null;
  notes?: string | null;
}

export async function createInjury(input: InjuryInput) {
  const { data, error } = await (db() as any)
    .from("cv_injury_log")
    .insert({
      athlete_id: input.athlete_id,
      body_part: input.body_part,
      side: input.side ?? null,
      severity: input.severity,
      status: input.status ?? "active",
      date_occurred: input.date_occurred,
      cleared_at: input.cleared_at ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInjury(
  id: string,
  athleteId: string,
  patch: Partial<Omit<InjuryInput, "athlete_id">>
) {
  const { data, error } = await (db() as any)
    .from("cv_injury_log")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("athlete_id", athleteId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInjury(id: string, athleteId: string) {
  const { error } = await (db() as any)
    .from("cv_injury_log")
    .delete()
    .eq("id", id)
    .eq("athlete_id", athleteId);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICAL CONSENT (cv_profiles.medical_consent_*)
// ═══════════════════════════════════════════════════════════════════════════

export interface MedicalConsentInput {
  share_with_coach?: boolean;
  share_with_scouts_summary?: boolean;
  share_raw_data?: boolean;
  last_screening_date?: string | null;
}

export async function updateMedicalConsent(athleteId: string, patch: MedicalConsentInput) {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.share_with_coach != null)         updates.medical_consent_coach = patch.share_with_coach;
  if (patch.share_with_scouts_summary != null) updates.medical_consent_scouts_summary = patch.share_with_scouts_summary;
  if (patch.share_raw_data != null)           updates.medical_consent_raw = patch.share_raw_data;
  if (patch.last_screening_date !== undefined) updates.last_screening_date = patch.last_screening_date;

  await (db() as any)
    .from("cv_profiles")
    .upsert({ athlete_id: athleteId, ...updates }, { onConflict: "athlete_id" });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE (head row cv_profiles fields)
// ═══════════════════════════════════════════════════════════════════════════

export interface ProfilePatch {
  formation_preference?: string | null;
  dominant_zone?: string | null;
  show_performance_data?: boolean;
  show_coachability?: boolean;
}

export async function updateCVProfile(athleteId: string, patch: ProfilePatch) {
  await (db() as any)
    .from("cv_profiles")
    .upsert(
      { athlete_id: athleteId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id" }
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARE (publishing + slug generation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Publish the CV — generates a share_slug if none exists, sets is_published=true.
 * The slug is URL-safe and derived from the athlete's name plus a short random
 * suffix to guarantee uniqueness.
 */
export async function publishCV(athleteId: string): Promise<{ slug: string; url: string }> {
  const { data: existing } = await (db() as any)
    .from("cv_profiles")
    .select("share_slug")
    .eq("athlete_id", athleteId)
    .single();

  let slug: string = existing?.share_slug ?? "";
  if (!slug) {
    slug = await generateUniqueSlug(athleteId);
  }

  await (db() as any)
    .from("cv_profiles")
    .upsert(
      {
        athlete_id: athleteId,
        share_slug: slug,
        is_published: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "athlete_id" }
    );

  const base = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.my-tomo.com";
  return { slug, url: `${base}/t/${slug}` };
}

export async function unpublishCV(athleteId: string) {
  await (db() as any)
    .from("cv_profiles")
    .update({
      is_published: false,
      updated_at: new Date().toISOString(),
    })
    .eq("athlete_id", athleteId);
}

export async function incrementShareView(slug: string) {
  // Call via RPC in Phase 3 for atomicity. For now, optimistic read-then-write.
  const { data } = await (db() as any)
    .from("cv_profiles")
    .select("athlete_id, share_views_count")
    .eq("share_slug", slug)
    .single();
  if (!data) return;

  await (db() as any)
    .from("cv_profiles")
    .update({ share_views_count: (data.share_views_count ?? 0) + 1 })
    .eq("share_slug", slug);
}

async function generateUniqueSlug(athleteId: string): Promise<string> {
  const { data: user } = await (db() as any)
    .from("users")
    .select("name")
    .eq("id", athleteId)
    .single();

  const base = slugify(user?.name ?? "athlete");

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const { data: clash } = await (db() as any)
      .from("cv_profiles")
      .select("athlete_id")
      .eq("share_slug", candidate)
      .maybeSingle();
    if (!clash) return candidate;
  }

  // Fallback: always unique
  return `${base}-${randomBytes(4).toString("hex")}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "athlete";
}

// ═══════════════════════════════════════════════════════════════════════════
// AI SUMMARY VERSIONS (read-only list)
// ═══════════════════════════════════════════════════════════════════════════

export async function listSummaryVersions(athleteId: string) {
  const { data, error } = await (db() as any)
    .from("cv_ai_summary_versions")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
