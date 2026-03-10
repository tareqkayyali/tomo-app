import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_SPORTS, type Sport } from "@/types";

const SPORT_POSITIONS: Record<Sport, string[]> = {
  soccer: [
    "Goalkeeper",
    "Center Back",
    "Full Back",
    "Defensive Midfielder",
    "Central Midfielder",
    "Attacking Midfielder",
    "Winger",
    "Striker",
  ],
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

const PLAYING_STYLES: Record<Sport, string[]> = {
  soccer: ["Attacking", "Defensive", "Balanced", "Technical", "Physical"],
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
