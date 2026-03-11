import general from "./general";
import soccer from "./soccer";
import basketball from "./basketball";
import tennis from "./tennis";
import padel from "./padel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templates: Record<string, any> = {
  general,
  soccer,
  football: soccer,   // "football" and "soccer" use the same template
  basketball,
  tennis,
  padel,
};

export const ALLOWED_SPORTS = ["football", "soccer", "basketball", "tennis", "padel"] as const;

export function getTemplate(sport: string) {
  const normalizedSport = (sport || "").toLowerCase();
  return templates[normalizedSport] || templates.general;
}

export function isValidSport(sport: string): boolean {
  return ALLOWED_SPORTS.includes(
    (sport || "").toLowerCase() as (typeof ALLOWED_SPORTS)[number]
  );
}
