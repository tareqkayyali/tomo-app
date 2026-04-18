// Compliance service
//
// Phase 1 of the registration/onboarding overhaul. Pure functions for:
//   - deriving age + age-band from DOB (server-authoritative)
//   - reading the currently-served legal versions from
//     backend/public/legal/*.html so we can reject stale acceptances
//   - computing the initial consent_status for a new user given their
//     age + region
//
// Keep this module free of I/O on the request path: legal version
// reads are cached after first call so the register route stays fast.

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Age bands ──────────────────────────────────────────────────────
// Canonical bands per MEMORY.md / contextBuilder.ts and the SQL
// helper in migration 060 (public.get_age_band). Keep this in sync
// with the SQL function.
export type AgeBand = "U13" | "U15" | "U17" | "U19" | "U21" | "SEN" | "VET" | "unknown";

export function ageFromDob(dob: Date, now: Date = new Date()): number {
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) years--;
  return years;
}

export function ageBandFromAge(age: number): AgeBand {
  if (age < 0) return "unknown";
  if (age < 13) return "U13";
  if (age < 15) return "U15";
  if (age < 17) return "U17";
  if (age < 19) return "U19";
  if (age < 21) return "U21";
  if (age < 30) return "SEN";
  return "VET";
}

export function parseDobOrThrow(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid DOB format: ${iso}`);
  }
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) throw new Error(`Invalid DOB: ${iso}`);
  // Guard against future DOB or impossible ages.
  const now = Date.now();
  if (dt.getTime() > now) throw new Error(`DOB is in the future: ${iso}`);
  const earliestPlausible = new Date(Date.UTC(1900, 0, 1));
  if (dt < earliestPlausible) throw new Error(`DOB is implausibly early: ${iso}`);
  return dt;
}

// ── Minimum age ────────────────────────────────────────────────────
// Hard floor. Under this the register route returns UNDER_MIN_AGE and
// no user row is created. Per the approved plan: 13.
export const MIN_SIGNUP_AGE = 13;

// ── EU/UK countries for GDPR-K 16 floor ────────────────────────────
// Matches the Edge Function's list. Keep in sync.
const EU_UK_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "GB",
]);

export type ConsentStatus = "active" | "awaiting_parent" | "revoked";

// Deciding the initial consent status is a simple two-axis table:
//
//              age >= 16    13 <= age < 16
//   EU / UK    active       awaiting_parent
//   Other      active       active   (self-consent; ship plain for US/UAE)
//
// Under-13 is rejected upstream in the register route — this function
// should never see age < 13.
export function initialConsentStatus(age: number, regionCode: string | null): ConsentStatus {
  if (age < MIN_SIGNUP_AGE) {
    throw new Error(`initialConsentStatus called with sub-minimum age ${age}`);
  }
  if (age >= 16) return "active";
  if (regionCode && EU_UK_COUNTRIES.has(regionCode)) return "awaiting_parent";
  return "active";
}

// ── Legal versions ────────────────────────────────────────────────
// Reads `<meta name="tomo-version" content="x.y.z">` from the legal
// HTML docs. Cached after first read per process — docs are only
// redeployed with the bundle, so in-memory cache is safe.

type LegalCache = { privacy: string; terms: string } | null;
let cache: LegalCache = null;

function readMetaVersion(html: string): string {
  const m = html.match(/<meta\s+name="tomo-version"\s+content="([^"]+)"\s*\/?>/i);
  if (!m) throw new Error("tomo-version meta missing from legal HTML");
  return m[1];
}

export function getCurrentLegalVersions(): { privacy: string; terms: string } {
  if (cache) return cache;
  const root = process.cwd();
  const privacyHtml = readFileSync(join(root, "public/legal/privacy.html"), "utf8");
  const termsHtml = readFileSync(join(root, "public/legal/terms.html"), "utf8");
  cache = {
    privacy: readMetaVersion(privacyHtml),
    terms: readMetaVersion(termsHtml),
  };
  return cache;
}

// For tests only.
export function __resetLegalVersionCacheForTests(): void {
  cache = null;
}
