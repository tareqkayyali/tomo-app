/**
 * CV Next Steps — Ordered roadmap of the 5 highest-impact actions an athlete
 * can take to raise their CV completeness.
 *
 * Impact weights are hardcoded per product call (mock 12):
 *   Add secondary positions     +4%   · 1 min  · Playing profile
 *   Add your club or academy    +12%  · 2 min  · Career
 *   Add a highlight video       +15%  · 4x more views · Media
 *   Request a coach reference   +8%   · 3 min  · References
 *   Add awards & character      +6%   · 2 min  · Recognition
 *
 * Total possible gain = 45% → renders as "51% → 96%" on the Next Steps screen.
 *
 * Steps already satisfied by the athlete are dropped from the list; the
 * remaining are returned in the fixed priority order above.
 */

import type {
  CVPositions,
  CVCareerEntry,
  CVMediaLink,
  CVReferenceEntry,
  CVAwardsCharacter,
  CVPlayerProfile,
  CVHealthStatus,
} from "./cvAssembler";

export interface CVNextStep {
  key: CVNextStepKey;
  title: string;
  subtitle: string;
  category: string;
  impact_pct: number;
  estimated_minutes: number;
  target_section: CVTargetSection;
}

export type CVNextStepKey =
  | "secondary_positions"
  | "career_history"
  | "highlight_video"
  | "coach_reference"
  | "awards_character"
  | "approve_ai_summary"
  | "health_screening";

export type CVTargetSection =
  | "playing_positions"
  | "career_history"
  | "video_media"
  | "references"
  | "awards_character"
  | "player_profile"
  | "health_status";

interface BuildInput {
  completenessPct: number;
  positions: CVPositions;
  career: CVCareerEntry[];
  media: CVMediaLink[];
  references: CVReferenceEntry[];
  awardsCharacter: CVAwardsCharacter;
  playerProfile: CVPlayerProfile;
  healthStatus: CVHealthStatus;
}

const ALL_STEPS: Array<CVNextStep & { test: (i: BuildInput) => boolean }> = [
  {
    key: "secondary_positions",
    title: "Add secondary positions",
    subtitle: "Playing profile · 1 min",
    category: "Playing profile",
    impact_pct: 4,
    estimated_minutes: 1,
    target_section: "playing_positions",
    test: (i) => i.positions.secondary_positions.length === 0,
  },
  {
    key: "career_history",
    title: "Add your club or academy history",
    subtitle: "Career · 2 min",
    category: "Career",
    impact_pct: 12,
    estimated_minutes: 2,
    target_section: "career_history",
    test: (i) => i.career.length === 0,
  },
  {
    key: "highlight_video",
    title: "Add a highlight video",
    subtitle: "Media · 4x more views",
    category: "Media",
    impact_pct: 15,
    estimated_minutes: 4,
    target_section: "video_media",
    test: (i) => !i.media.some((m) => m.media_type === "highlight_reel"),
  },
  {
    key: "coach_reference",
    title: "Request a coach reference",
    subtitle: "References · 3 min",
    category: "References",
    impact_pct: 8,
    estimated_minutes: 3,
    target_section: "references",
    test: (i) => !i.references.some((r) => r.status === "published"),
  },
  {
    key: "awards_character",
    title: "Add awards & character traits",
    subtitle: "Recognition · 2 min",
    category: "Recognition",
    impact_pct: 6,
    estimated_minutes: 2,
    target_section: "awards_character",
    test: (i) => i.awardsCharacter.total_count === 0,
  },
  {
    key: "approve_ai_summary",
    title: "Approve your player profile summary",
    subtitle: "Profile · 1 min",
    category: "Profile",
    impact_pct: 5,
    estimated_minutes: 1,
    target_section: "player_profile",
    test: (i) =>
      i.playerProfile.ai_summary !== null &&
      i.playerProfile.ai_summary_status !== "approved",
  },
  {
    key: "health_screening",
    title: "Log a recent screening",
    subtitle: "Health · 1 min",
    category: "Health",
    impact_pct: 3,
    estimated_minutes: 1,
    target_section: "health_status",
    test: (i) => i.healthStatus.availability.last_screening_date === null,
  },
];

export function buildNextSteps(input: BuildInput): CVNextStep[] {
  return ALL_STEPS
    .filter((step) => step.test(input))
    .slice(0, 5)
    .map(({ test: _test, ...step }) => step);
}
