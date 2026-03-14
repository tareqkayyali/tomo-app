/**
 * Test Catalog API — Smart search for athlete tests
 *
 * GET /api/v1/tests/catalog?q=sprint
 *
 * Returns a comprehensive list of standard athletic tests.
 * No auth required (public catalog), but we still gate behind auth
 * so only logged-in users can access.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// ── Static test catalog (comprehensive, sport-agnostic) ──────────────

interface TestCatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  emoji: string;
  description: string;
  direction: "higher" | "lower"; // higher=better or lower=better
  tags: string[];
}

const TEST_CATALOG: TestCatalogItem[] = [
  // Speed
  { id: "10m-sprint", name: "10m Sprint", category: "Speed", unit: "sec", emoji: "🏃", description: "Acceleration over 10 meters", direction: "lower", tags: ["sprint", "acceleration", "speed", "running"] },
  { id: "20m-sprint", name: "20m Sprint", category: "Speed", unit: "sec", emoji: "🏃", description: "Short sprint over 20 meters", direction: "lower", tags: ["sprint", "speed", "running"] },
  { id: "30m-sprint", name: "30m Sprint", category: "Speed", unit: "sec", emoji: "🏃", description: "Sprint speed over 30 meters", direction: "lower", tags: ["sprint", "speed", "running"] },
  { id: "40m-sprint", name: "40m Sprint", category: "Speed", unit: "sec", emoji: "🏃", description: "Sprint over 40 meters", direction: "lower", tags: ["sprint", "speed"] },
  { id: "60m-sprint", name: "60m Sprint", category: "Speed", unit: "sec", emoji: "🏃", description: "Sprint over 60 meters", direction: "lower", tags: ["sprint", "speed", "track"] },
  { id: "100m-sprint", name: "100m Sprint", category: "Speed", unit: "sec", emoji: "🏃", description: "Track 100m sprint", direction: "lower", tags: ["sprint", "speed", "track"] },
  { id: "flying-10m", name: "Flying 10m Sprint", category: "Speed", unit: "sec", emoji: "💨", description: "Max velocity over 10m with running start", direction: "lower", tags: ["sprint", "velocity", "flying"] },

  // Power / Jumping
  { id: "cmj", name: "Counter Movement Jump", category: "Power", unit: "cm", emoji: "🦘", description: "Vertical jump height with countermovement", direction: "higher", tags: ["jump", "power", "vertical", "cmj"] },
  { id: "squat-jump", name: "Squat Jump", category: "Power", unit: "cm", emoji: "🦘", description: "Vertical jump from static squat position", direction: "higher", tags: ["jump", "power", "squat"] },
  { id: "broad-jump", name: "Standing Broad Jump", category: "Power", unit: "cm", emoji: "🦘", description: "Horizontal jump distance from standing", direction: "higher", tags: ["jump", "broad", "power", "horizontal"] },
  { id: "drop-jump", name: "Drop Jump (RSI)", category: "Power", unit: "rsi", emoji: "⚡", description: "Reactive strength index from drop jump", direction: "higher", tags: ["jump", "reactive", "power", "rsi"] },
  { id: "vertical-jump", name: "Vertical Jump", category: "Power", unit: "cm", emoji: "🦘", description: "Maximum vertical jump reach", direction: "higher", tags: ["jump", "vertical", "power"] },
  { id: "triple-hop", name: "Triple Hop Test", category: "Power", unit: "cm", emoji: "🦘", description: "Three consecutive single-leg hops for distance", direction: "higher", tags: ["hop", "power", "single-leg"] },

  // Agility
  { id: "t-test", name: "Agility T-Test", category: "Agility", unit: "sec", emoji: "🔀", description: "Forward/lateral/backward T-shaped run", direction: "lower", tags: ["agility", "change of direction", "t-test"] },
  { id: "5-0-5", name: "5-0-5 Agility", category: "Agility", unit: "sec", emoji: "🔀", description: "5m sprint, turn, 5m sprint back", direction: "lower", tags: ["agility", "change of direction", "505"] },
  { id: "illinois-agility", name: "Illinois Agility", category: "Agility", unit: "sec", emoji: "🔀", description: "Illinois course agility run", direction: "lower", tags: ["agility", "illinois", "running"] },
  { id: "pro-agility", name: "Pro Agility (5-10-5)", category: "Agility", unit: "sec", emoji: "🔀", description: "NFL combine style shuttle", direction: "lower", tags: ["agility", "shuttle", "nfl"] },
  { id: "arrowhead-agility", name: "Arrowhead Agility", category: "Agility", unit: "sec", emoji: "🔀", description: "Multi-directional arrowhead course", direction: "lower", tags: ["agility", "arrowhead", "change of direction"] },

  // Endurance / Aerobic
  { id: "yo-yo-ir1", name: "Yo-Yo IR1", category: "Endurance", unit: "level", emoji: "🫁", description: "Intermittent recovery test level 1", direction: "higher", tags: ["endurance", "yo-yo", "aerobic", "running"] },
  { id: "yo-yo-ir2", name: "Yo-Yo IR2", category: "Endurance", unit: "level", emoji: "🫁", description: "Intermittent recovery test level 2", direction: "higher", tags: ["endurance", "yo-yo", "aerobic"] },
  { id: "beep-test", name: "Beep Test (20m)", category: "Endurance", unit: "level", emoji: "🫁", description: "20m multi-stage fitness test", direction: "higher", tags: ["endurance", "beep", "shuttle", "aerobic"] },
  { id: "cooper-12min", name: "Cooper 12-min Run", category: "Endurance", unit: "m", emoji: "🫁", description: "Distance covered in 12 minutes", direction: "higher", tags: ["endurance", "cooper", "running", "vo2max"] },
  { id: "1-5km-run", name: "1.5km Run", category: "Endurance", unit: "min", emoji: "🫁", description: "Time to complete 1.5 kilometers", direction: "lower", tags: ["endurance", "running", "aerobic"] },
  { id: "vo2max", name: "Estimated VO2max", category: "Endurance", unit: "ml/kg/min", emoji: "🫁", description: "Estimated maximal oxygen uptake", direction: "higher", tags: ["endurance", "vo2max", "aerobic", "fitness"] },

  // Strength
  { id: "bench-press-1rm", name: "Bench Press 1RM", category: "Strength", unit: "kg", emoji: "🏋️", description: "One rep max bench press", direction: "higher", tags: ["strength", "bench", "upper body", "1rm"] },
  { id: "squat-1rm", name: "Back Squat 1RM", category: "Strength", unit: "kg", emoji: "🏋️", description: "One rep max back squat", direction: "higher", tags: ["strength", "squat", "lower body", "1rm"] },
  { id: "deadlift-1rm", name: "Deadlift 1RM", category: "Strength", unit: "kg", emoji: "🏋️", description: "One rep max deadlift", direction: "higher", tags: ["strength", "deadlift", "1rm"] },
  { id: "pull-ups", name: "Pull-Ups (Max)", category: "Strength", unit: "reps", emoji: "💪", description: "Maximum pull-ups in one set", direction: "higher", tags: ["strength", "pull-up", "upper body"] },
  { id: "push-ups", name: "Push-Ups (Max)", category: "Strength", unit: "reps", emoji: "💪", description: "Maximum push-ups in one set", direction: "higher", tags: ["strength", "push-up", "endurance"] },
  { id: "plank-hold", name: "Plank Hold", category: "Strength", unit: "sec", emoji: "💪", description: "Maximum plank hold duration", direction: "higher", tags: ["strength", "core", "plank", "stability"] },
  { id: "grip-strength", name: "Grip Strength", category: "Strength", unit: "kg", emoji: "✊", description: "Hand dynamometer measurement", direction: "higher", tags: ["strength", "grip", "hand"] },

  // Flexibility / Mobility
  { id: "sit-reach", name: "Sit & Reach", category: "Flexibility", unit: "cm", emoji: "🧘", description: "Hamstring and lower back flexibility", direction: "higher", tags: ["flexibility", "hamstring", "sit and reach"] },
  { id: "shoulder-mobility", name: "Shoulder Mobility", category: "Flexibility", unit: "cm", emoji: "🧘", description: "Overhead shoulder reach distance", direction: "lower", tags: ["flexibility", "shoulder", "mobility"] },
  { id: "ankle-dorsiflexion", name: "Ankle Dorsiflexion", category: "Flexibility", unit: "cm", emoji: "🧘", description: "Knee-to-wall ankle mobility test", direction: "higher", tags: ["flexibility", "ankle", "mobility"] },

  // Reaction / Cognitive
  { id: "reaction-time", name: "Reaction Time", category: "Reaction", unit: "ms", emoji: "⚡", description: "Visual stimulus reaction speed", direction: "lower", tags: ["reaction", "speed", "cognitive", "reflex"] },
  { id: "choice-reaction", name: "Choice Reaction Time", category: "Reaction", unit: "ms", emoji: "⚡", description: "Reaction with decision-making component", direction: "lower", tags: ["reaction", "cognitive", "choice"] },

  // Balance
  { id: "single-leg-balance", name: "Single Leg Balance", category: "Balance", unit: "sec", emoji: "🧘", description: "Eyes-closed single leg stance", direction: "higher", tags: ["balance", "stability", "single-leg"] },
  { id: "y-balance", name: "Y-Balance Test", category: "Balance", unit: "cm", emoji: "🧘", description: "Dynamic balance in 3 reach directions", direction: "higher", tags: ["balance", "dynamic", "y-balance", "stability"] },
  { id: "star-excursion", name: "Star Excursion Balance", category: "Balance", unit: "cm", emoji: "🧘", description: "Multi-directional dynamic reach test", direction: "higher", tags: ["balance", "star", "dynamic"] },

  // Body Composition
  { id: "body-weight", name: "Body Weight", category: "Body Comp", unit: "kg", emoji: "⚖️", description: "Total body mass", direction: "lower", tags: ["body", "weight", "composition"] },
  { id: "body-fat", name: "Body Fat %", category: "Body Comp", unit: "%", emoji: "⚖️", description: "Body fat percentage", direction: "lower", tags: ["body", "fat", "composition"] },
  { id: "height", name: "Height", category: "Body Comp", unit: "cm", emoji: "📏", description: "Standing height measurement", direction: "higher", tags: ["body", "height", "anthropometry"] },
  { id: "bmi", name: "BMI", category: "Body Comp", unit: "kg/m²", emoji: "⚖️", description: "Body mass index", direction: "lower", tags: ["body", "bmi", "composition"] },

  // Sport-Specific
  { id: "free-kicks-10", name: "Free Kicks (out of 10)", category: "Sport Skill", unit: "scored", emoji: "⚽", description: "Free kick accuracy out of 10 attempts", direction: "higher", tags: ["football", "soccer", "free kick", "skill", "accuracy"] },
  { id: "penalty-kicks-10", name: "Penalties (out of 10)", category: "Sport Skill", unit: "scored", emoji: "⚽", description: "Penalty accuracy out of 10 attempts", direction: "higher", tags: ["football", "soccer", "penalty", "skill"] },
  { id: "ball-juggling", name: "Ball Juggling", category: "Sport Skill", unit: "touches", emoji: "⚽", description: "Maximum consecutive ball juggles", direction: "higher", tags: ["football", "soccer", "juggling", "skill"] },
  { id: "serve-speed", name: "Serve Speed", category: "Sport Skill", unit: "km/h", emoji: "🎾", description: "Maximum serve speed", direction: "higher", tags: ["tennis", "padel", "serve", "speed"] },
  { id: "smash-speed", name: "Smash Speed", category: "Sport Skill", unit: "km/h", emoji: "🎾", description: "Overhead smash speed", direction: "higher", tags: ["padel", "badminton", "smash"] },
  { id: "3pt-shooting", name: "3-Point Shooting %", category: "Sport Skill", unit: "%", emoji: "🏀", description: "3-point shooting accuracy", direction: "higher", tags: ["basketball", "shooting", "3-point"] },
  { id: "free-throw", name: "Free Throw %", category: "Sport Skill", unit: "%", emoji: "🏀", description: "Free throw accuracy percentage", direction: "higher", tags: ["basketball", "shooting", "free throw"] },
];

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  const category = searchParams.get("category") || undefined;

  let results = TEST_CATALOG;

  // Filter by category
  if (category) {
    results = results.filter((t) => t.category.toLowerCase() === category.toLowerCase());
  }

  // Filter by search query (match name, description, or tags)
  if (q) {
    results = results.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q)) ||
        t.category.toLowerCase().includes(q),
    );
  }

  return NextResponse.json(
    { tests: results, count: results.length },
    { headers: { "api-version": "v1" } },
  );
}
