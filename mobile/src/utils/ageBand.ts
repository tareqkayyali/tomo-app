/**
 * Age-band helper
 *
 * Mirrors the backend `get_age_band()` SQL function + the TS helper
 * in backend/services/compliance/index.ts. Client-side derivation is
 * occasionally useful (Mastery DNA identity header, Own It copy,
 * onboarding branches) when we don't want a round-trip just to bucket
 * a user.
 *
 * Keep this synchronised with the canonical bands in MEMORY.md:
 * U13 / U15 / U17 / U19 / U21 / SEN / VET.
 */

export type AgeBand = 'U13' | 'U15' | 'U17' | 'U19' | 'U21' | 'SEN' | 'VET' | 'unknown';

export function ageBandFromAge(age: number | null | undefined): AgeBand {
  if (age == null || !Number.isFinite(age) || age < 0) return 'unknown';
  if (age < 13) return 'U13';
  if (age < 15) return 'U15';
  if (age < 17) return 'U17';
  if (age < 19) return 'U19';
  if (age < 21) return 'U21';
  if (age < 30) return 'SEN';
  return 'VET';
}

export function ageFromDob(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null;
  // YYYY-MM-DD only. Ignore timezone so DOBs don't drift by day.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [_, y, mm, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mm) - 1, Number(d)));
  if (Number.isNaN(dt.getTime())) return null;
  let years = now.getUTCFullYear() - dt.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dt.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dt.getUTCDate())) years--;
  return years;
}

export function ageBandFromDob(dob: string | null | undefined): AgeBand {
  return ageBandFromAge(ageFromDob(dob));
}

/**
 * Prefer server-provided age when available, fall back to DOB-derived.
 * Most consumers call this with `profile.age` + `profile.dateOfBirth`.
 */
export function ageBandFromProfile(input: {
  age?: number | null;
  dateOfBirth?: string | null;
}): AgeBand {
  if (typeof input.age === 'number' && input.age > 0) return ageBandFromAge(input.age);
  return ageBandFromDob(input.dateOfBirth ?? null);
}
