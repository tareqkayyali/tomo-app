import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_SPORTS, type Sport } from "@/types";

const _FOOTBALL_POSITIONS = [
  "Goalkeeper",
  "Center Back",
  "Full Back",
  "Defensive Midfielder",
  "Central Midfielder",
  "Attacking Midfielder",
  "Winger",
  "Striker",
];

const SPORT_POSITIONS: Record<Sport, string[]> = {
  football: _FOOTBALL_POSITIONS,
  soccer: _FOOTBALL_POSITIONS, // alias
  basketball: [
    "Point Guard",
    "Shooting Guard",
    "Small Forward",
    "Power Forward",
    "Center",
  ],
  tennis: ["Baseline Player", "Serve & Volley", "All-Court Player"],
  padel: ["Right Side (Drive)", "Left Side (Backhand)", "Both Sides"],
};

const _FOOTBALL_STYLES = ["Attacking", "Defensive", "Balanced", "Technical", "Physical"];

const PLAYING_STYLES: Record<Sport, string[]> = {
  football: _FOOTBALL_STYLES,
  soccer: _FOOTBALL_STYLES, // alias
  basketball: [
    "Scoring",
    "Playmaking",
    "Defensive",
    "Rebounding",
    "All-Around",
  ],
  tennis: ["Aggressive", "Defensive", "Counter-Puncher", "All-Court"],
  padel: ["Aggressive", "Defensive", "Tactical", "All-Around"],
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { sport } = await params;
  const sportLower = sport.toLowerCase() as Sport;

  if (!ALLOWED_SPORTS.includes(sportLower)) {
    return NextResponse.json(
      {
        error: `Invalid sport. Must be one of: ${ALLOWED_SPORTS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      sport: sportLower,
      positions: SPORT_POSITIONS[sportLower],
      playingStyles: PLAYING_STYLES[sportLower],
    },
    { headers: { "api-version": "v1" } }
  );
}
