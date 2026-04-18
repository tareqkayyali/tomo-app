// Triangle — effective-weight computation.
//
// Pure function. Zero I/O. Computes the runtime weight for a triangle
// input given its base weight (from the tier × domain × role matrix)
// and the input's recency. Half-life depends on input_type — standing
// instructions decay slowly, observations decay fast.
//
// Formula:
//   effective = base * 0.5 ^ (ageDays / halfLifeDays)
// where ageDays is clamped at 0. Retracted or out-of-window inputs
// return 0.
//
// Safety domain: base is always the table value (never decays below a
// floor programmatically — the pure function is neutral; the caller
// that assembles the prompt may choose to keep safety inputs at 1.0
// regardless of age if that's the policy).

export type AuthorRole = "coach" | "parent";
export type Domain = "training" | "academic" | "wellbeing" | "safety" | "logistics";
export type InputType = "standing_instruction" | "constraint" | "preference" | "observation" | "goal";

// Half-life per input_type. Observations decay in two weeks because
// they capture a moment in time ("athlete looked tired yesterday");
// standing instructions decay in ~6 months because they represent a
// durable coaching stance ("no heavy lower-body in-season").
export const HALF_LIFE_DAYS: Readonly<Record<InputType, number>> = Object.freeze({
  standing_instruction: 180,
  constraint: 120,
  preference: 90,
  goal: 90,
  observation: 14,
});

export interface TriangleInput {
  id: string;
  athlete_id: string;
  author_id: string;
  author_role: AuthorRole;
  domain: Domain;
  input_type: InputType;
  body: string;
  event_scope_id: string | null;
  effective_from: string; // ISO
  effective_until: string | null; // ISO or null
  retracted_at: string | null;
  created_at: string;
}

export interface WeightedInput extends TriangleInput {
  baseWeight: number;
  effectiveWeight: number;
}

const DAY_MS = 86_400_000;

export function ageDays(input: TriangleInput, now: Date = new Date()): number {
  const created = new Date(input.created_at).getTime();
  const ms = Math.max(0, now.getTime() - created);
  return ms / DAY_MS;
}

export function isActive(input: TriangleInput, now: Date = new Date()): boolean {
  if (input.retracted_at) return false;
  const start = new Date(input.effective_from).getTime();
  if (now.getTime() < start) return false;
  if (input.effective_until) {
    const end = new Date(input.effective_until).getTime();
    if (now.getTime() > end) return false;
  }
  return true;
}

export function effectiveWeight(
  input: TriangleInput,
  baseWeight: number,
  now: Date = new Date()
): number {
  if (!isActive(input, now)) return 0;
  if (baseWeight <= 0) return 0;
  const halfLife = HALF_LIFE_DAYS[input.input_type] ?? 90;
  const age = ageDays(input, now);
  const decay = Math.pow(0.5, age / halfLife);
  return baseWeight * decay;
}
