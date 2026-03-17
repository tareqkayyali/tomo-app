/**
 * Football Training Program Database — Seed Script
 *
 * Seeds:
 *   1. football_training_programs (31+ programs)
 *   2. position_training_matrix (9 positions)
 *
 * Usage: cd backend && npx tsx scripts/seeds/football_training_program_db.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load env from backend/.env.local (without dotenv dependency)
const envPath = path.resolve(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Age Band Prescription Template ──────────────────────────────────────

interface Prescription {
  sets: number;
  reps: string;
  intensity: string;
  rpe: string;
  rest: string;
  frequency: string;
  coachingCues: string[];
}

function makePrescriptions(
  base: Omit<Prescription, "frequency"> & { frequency?: string },
  overrides?: Partial<Record<string, Partial<Prescription>>>
): Record<string, Prescription> {
  const bands = ["U13", "U15", "U17", "U19", "U21", "SEN", "VET"];
  const result: Record<string, Prescription> = {};

  // Age-band scaling factors
  const scaling: Record<string, { setsMul: number; rpeMul: number }> = {
    U13: { setsMul: 0.5, rpeMul: 0.7 },
    U15: { setsMul: 0.65, rpeMul: 0.8 },
    U17: { setsMul: 0.8, rpeMul: 0.85 },
    U19: { setsMul: 0.9, rpeMul: 0.9 },
    U21: { setsMul: 0.95, rpeMul: 0.95 },
    SEN: { setsMul: 1.0, rpeMul: 1.0 },
    VET: { setsMul: 0.85, rpeMul: 0.9 },
  };

  for (const band of bands) {
    const scale = scaling[band];
    const override = overrides?.[band] ?? {};
    result[band] = {
      sets: override.sets ?? Math.max(1, Math.round(base.sets * scale.setsMul)),
      reps: override.reps ?? base.reps,
      intensity: override.intensity ?? base.intensity,
      rpe: override.rpe ?? base.rpe,
      rest: override.rest ?? base.rest,
      frequency: override.frequency ?? base.frequency ?? "2x/week",
      coachingCues: override.coachingCues ?? base.coachingCues,
    };
  }

  return result;
}

// ── PHV Guidance Template ───────────────────────────────────────────────

interface PHVGuidance {
  pre_phv?: { warnings: string[]; modifiedPrescription?: Partial<Prescription> };
  mid_phv?: { contraindicated?: boolean; warnings: string[]; modifiedPrescription?: Partial<Prescription> };
  post_phv?: { warnings: string[]; modifiedPrescription?: Partial<Prescription> };
}

const STANDARD_PHV: PHVGuidance = {
  pre_phv: {
    warnings: ["Focus on technique over load", "Bodyweight variations preferred"],
  },
  mid_phv: {
    warnings: [
      "Reduce load by 40%",
      "No maximal efforts",
      "Monitor growth-related pain",
    ],
    modifiedPrescription: { rpe: "4-5", intensity: "light" },
  },
  post_phv: {
    warnings: ["Progress gradually", "Monitor tendon adaptation"],
  },
};

const CONTRAINDICATED_MID_PHV: PHVGuidance = {
  ...STANDARD_PHV,
  mid_phv: {
    contraindicated: true,
    warnings: ["Program not suitable during mid-PHV growth spurt"],
  },
};

// ── Programs ────────────────────────────────────────────────────────────

interface ProgramDef {
  id: string;
  name: string;
  category: string;
  type: "physical" | "technical";
  description: string;
  equipment: string[];
  duration_minutes: number;
  position_emphasis: string[];
  difficulty: string;
  tags: string[];
  prescriptions: Record<string, Prescription>;
  phv_guidance: PHVGuidance;
}

const PROGRAMS: ProgramDef[] = [
  // ── PHYSICAL PROGRAMS (18) ─────────────────────────────────────────

  // Sprint
  {
    id: "sprint_linear_10_30",
    name: "Linear Sprint Development (10-30m)",
    category: "sprint",
    type: "physical",
    description: "Develops acceleration and max velocity over short distances. Progressive overload through volume and recovery manipulation.",
    equipment: ["cones", "stopwatch"],
    duration_minutes: 25,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["speed", "acceleration", "power"],
    prescriptions: makePrescriptions({
      sets: 6, reps: "4-6 reps", intensity: "95-100%", rpe: "8-9",
      rest: "2-3 min", coachingCues: ["Drive phase: 45° body angle", "Punch arms aggressively", "Triple extension through ankle-knee-hip"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "sprint_flying_20_40",
    name: "Flying Sprint (20-40m)",
    category: "sprint",
    type: "physical",
    description: "Max velocity development with a rolling start. Targets top-end speed mechanics.",
    equipment: ["cones", "stopwatch"],
    duration_minutes: 25,
    position_emphasis: ["W", "ST", "FB"],
    difficulty: "advanced",
    tags: ["speed", "max_velocity"],
    prescriptions: makePrescriptions({
      sets: 5, reps: "3-4 reps", intensity: "100%", rpe: "9",
      rest: "3-4 min", coachingCues: ["Upright posture at max speed", "Relaxed shoulders", "Ground contact under center of mass"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // Sled
  {
    id: "sled_resisted_sprint",
    name: "Resisted Sled Sprint",
    category: "sled",
    type: "physical",
    description: "Develops horizontal force production through resisted sprinting. Load at 10-20% bodyweight.",
    equipment: ["sled", "harness", "cones"],
    duration_minutes: 20,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["speed", "power", "acceleration"],
    prescriptions: makePrescriptions({
      sets: 5, reps: "4 x 20m", intensity: "10-20% BW load", rpe: "8",
      rest: "3 min", coachingCues: ["Maintain forward lean", "Full extension each stride", "Don't overstride — short, powerful contacts"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // Strength
  {
    id: "strength_lower_compound",
    name: "Lower Body Compound Strength",
    category: "strength",
    type: "physical",
    description: "Squat, deadlift, and lunge patterns for lower body maximal strength. Foundation for all athletic qualities.",
    equipment: ["barbell", "squat_rack", "plates"],
    duration_minutes: 45,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["strength", "power", "legs"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "4-6", intensity: "80-85% 1RM", rpe: "7-8",
      rest: "2-3 min", coachingCues: ["Brace core before each rep", "Control eccentric (3-4s)", "Full depth on squats"],
    }),
    phv_guidance: CONTRAINDICATED_MID_PHV,
  },
  {
    id: "strength_upper_push_pull",
    name: "Upper Body Push-Pull",
    category: "strength",
    type: "physical",
    description: "Bench press, rows, overhead press for upper body balance. Important for physicality in duels.",
    equipment: ["barbell", "dumbbells", "bench"],
    duration_minutes: 40,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["strength", "upper_body", "physicality"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "6-8", intensity: "75-80% 1RM", rpe: "7",
      rest: "90s-2 min", coachingCues: ["Retract scapulae on presses", "Full range of motion", "Balanced push:pull ratio"],
    }),
    phv_guidance: CONTRAINDICATED_MID_PHV,
  },
  {
    id: "strength_single_leg",
    name: "Single-Leg Strength Development",
    category: "strength",
    type: "physical",
    description: "Bulgarian split squats, step-ups, single-leg RDLs. Addresses bilateral deficits and improves stability.",
    equipment: ["dumbbells", "bench", "kettlebell"],
    duration_minutes: 35,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["strength", "stability", "injury_prevention"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "8-10 each side", intensity: "moderate", rpe: "7",
      rest: "60-90s", coachingCues: ["Control knee tracking", "Level hips throughout", "Slow eccentric"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // Nordic / Hamstring
  {
    id: "nordic_hamstring_protocol",
    name: "Nordic Hamstring Protocol",
    category: "nordic",
    type: "physical",
    description: "Gold standard hamstring injury prevention. Eccentric loading to protect against sprinting injuries. FIFA 11+ recommended.",
    equipment: ["partner_or_anchor"],
    duration_minutes: 15,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["injury_prevention", "hamstring", "eccentric"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "5-8", intensity: "bodyweight", rpe: "7-8",
      rest: "60s", coachingCues: ["Slow eccentric (3-5 seconds)", "Break at hips at bottom if needed", "Control the descent — don't just fall"],
    }, {
      U13: { reps: "3-4", sets: 2 },
      U15: { reps: "4-5", sets: 2 },
    }),
    phv_guidance: {
      pre_phv: { warnings: ["Use band-assisted or partial-range only"] },
      mid_phv: {
        warnings: [
          "Partial range eccentric ONLY",
          "Max 3 reps per set",
          "Stop immediately if knee/heel pain",
        ],
        modifiedPrescription: { sets: 2, reps: "2-3", rpe: "4-5" },
      },
      post_phv: { warnings: ["Progress to full range gradually over 4 weeks"] },
    },
  },

  // Plyometric
  {
    id: "plyo_lower_body",
    name: "Lower Body Plyometrics",
    category: "plyometric",
    type: "physical",
    description: "Box jumps, depth jumps, bounding. Develops reactive strength and stretch-shortening cycle efficiency.",
    equipment: ["plyo_box", "cones"],
    duration_minutes: 25,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["power", "explosiveness", "reactive_strength"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "5-6", intensity: "maximal effort", rpe: "8-9",
      rest: "90s-2 min", coachingCues: ["Minimize ground contact time", "Land softly — absorb through knees and hips", "Quality over quantity"],
    }),
    phv_guidance: {
      pre_phv: {
        warnings: ["Low-intensity only: skipping, hopping, bounding"],
        modifiedPrescription: { reps: "6-8", intensity: "submaximal" },
      },
      mid_phv: {
        warnings: [
          "Reduce volume by 50%",
          "No depth jumps",
          "Bilateral landings only",
        ],
        modifiedPrescription: { sets: 2, reps: "3-4", rpe: "5-6" },
      },
      post_phv: { warnings: ["Reintroduce depth jumps gradually"] },
    },
  },

  // Agility
  {
    id: "agility_cod",
    name: "Change of Direction (COD) Training",
    category: "agility",
    type: "physical",
    description: "Planned agility — T-test, 505, pro agility patterns. Develops deceleration and re-acceleration mechanics.",
    equipment: ["cones", "stopwatch"],
    duration_minutes: 25,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["agility", "speed", "deceleration"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "4-5", intensity: "95-100%", rpe: "8",
      rest: "90s-2 min", coachingCues: ["Lower center of gravity before cut", "Plant outside foot hard", "Aggressive first step out of cut"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "agility_reactive",
    name: "Reactive Agility Training",
    category: "agility",
    type: "physical",
    description: "Unplanned agility — react to visual/auditory cues. More game-realistic than planned COD.",
    equipment: ["cones", "partner"],
    duration_minutes: 25,
    position_emphasis: ["CB", "CDM", "CM", "FB"],
    difficulty: "advanced",
    tags: ["agility", "reaction", "decision_making"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "5-6", intensity: "maximal", rpe: "8-9",
      rest: "2 min", coachingCues: ["Read the trigger early", "Pre-load position: low, balanced", "Trust first instinct"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // Endurance
  {
    id: "endurance_hiit",
    name: "High-Intensity Interval Training (HIIT)",
    category: "endurance",
    type: "physical",
    description: "Repeat sprint ability and aerobic power development. Mimics football match demands.",
    equipment: ["cones", "heart_rate_monitor"],
    duration_minutes: 30,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["endurance", "aerobic", "conditioning"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "4-6 intervals", intensity: "85-95% HRmax", rpe: "8",
      rest: "90s between intervals", frequency: "2-3x/week",
      coachingCues: ["30-60s work intervals", "Active recovery between sets", "Target 85-95% max heart rate"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "endurance_aerobic_base",
    name: "Aerobic Base Building",
    category: "endurance",
    type: "physical",
    description: "Low-intensity continuous running or tempo work. Builds the foundation for all other fitness qualities.",
    equipment: ["heart_rate_monitor"],
    duration_minutes: 30,
    position_emphasis: ["ALL"],
    difficulty: "beginner",
    tags: ["endurance", "aerobic", "recovery"],
    prescriptions: makePrescriptions({
      sets: 1, reps: "20-30 min continuous", intensity: "60-75% HRmax", rpe: "4-5",
      rest: "N/A", frequency: "2-3x/week",
      coachingCues: ["Conversational pace", "Nasal breathing if possible", "Steady rhythm"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // Power
  {
    id: "power_olympic_lifts",
    name: "Olympic Lifting Derivatives",
    category: "power",
    type: "physical",
    description: "Hang cleans, clean pulls, push press. Develops rate of force development for explosive actions.",
    equipment: ["barbell", "plates", "platform"],
    duration_minutes: 35,
    position_emphasis: ["ALL"],
    difficulty: "advanced",
    tags: ["power", "explosiveness", "strength"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "3-5", intensity: "70-80% 1RM", rpe: "7-8",
      rest: "2-3 min", coachingCues: ["Triple extension: ankles, knees, hips", "Bar stays close to body", "Catch position: strong front rack"],
    }),
    phv_guidance: CONTRAINDICATED_MID_PHV,
  },

  // Mobility
  {
    id: "mobility_hip_ankle",
    name: "Hip & Ankle Mobility Protocol",
    category: "hip_mobility",
    type: "physical",
    description: "Targeted mobility work for the two joints most important for football movement quality.",
    equipment: ["foam_roller", "band"],
    duration_minutes: 15,
    position_emphasis: ["ALL"],
    difficulty: "beginner",
    tags: ["mobility", "injury_prevention", "recovery"],
    prescriptions: makePrescriptions({
      sets: 2, reps: "30s holds or 10 reps each", intensity: "light", rpe: "3-4",
      rest: "30s", frequency: "3-4x/week",
      coachingCues: ["Breathe into the stretch", "Move through full range", "No bouncing"],
    }),
    phv_guidance: {
      pre_phv: { warnings: ["Focus on active flexibility"] },
      mid_phv: {
        warnings: ["PRIORITY: Flexibility work is critical during growth spurt"],
        modifiedPrescription: { frequency: "daily" },
      },
      post_phv: { warnings: ["Maintain mobility gained during growth phase"] },
    },
  },

  // ACL Prevention
  {
    id: "acl_prevention_protocol",
    name: "ACL Injury Prevention Protocol",
    category: "acl_prevention",
    type: "physical",
    description: "Neuromuscular training to reduce ACL injury risk. Based on FIFA 11+ and PEP protocol research.",
    equipment: ["cones", "balance_board"],
    duration_minutes: 20,
    position_emphasis: ["ALL"],
    difficulty: "beginner",
    tags: ["injury_prevention", "acl", "neuromuscular"],
    prescriptions: makePrescriptions({
      sets: 2, reps: "8-10 each exercise", intensity: "moderate", rpe: "5-6",
      rest: "30-45s", frequency: "3x/week",
      coachingCues: ["Knee over toe alignment", "Soft landings — never locked knees", "Single-leg balance progression"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // Groin
  {
    id: "groin_copenhagen",
    name: "Copenhagen Adductor Protocol",
    category: "groin",
    type: "physical",
    description: "Eccentric adductor strengthening — gold standard for groin injury prevention in football.",
    equipment: ["bench_or_partner"],
    duration_minutes: 10,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["injury_prevention", "groin", "adductor"],
    prescriptions: makePrescriptions({
      sets: 2, reps: "6-8 each side", intensity: "bodyweight", rpe: "6-7",
      rest: "45s", frequency: "2-3x/week",
      coachingCues: ["Slow eccentric (3s)", "Hips stacked vertically", "Start with short lever (knee) before long lever (ankle)"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // Ankle Stability
  {
    id: "ankle_stability_protocol",
    name: "Ankle Stability & Proprioception",
    category: "ankle_stability",
    type: "physical",
    description: "Balance and proprioception work to reduce ankle sprain risk — the most common football injury.",
    equipment: ["wobble_board", "bands"],
    duration_minutes: 10,
    position_emphasis: ["ALL"],
    difficulty: "beginner",
    tags: ["injury_prevention", "ankle", "balance"],
    prescriptions: makePrescriptions({
      sets: 2, reps: "30s each side", intensity: "light", rpe: "4-5",
      rest: "15s", frequency: "3-4x/week",
      coachingCues: ["Eyes forward, not down", "Engage small foot muscles", "Progress: eyes closed, ball throws while balancing"],
    }),
    phv_guidance: STANDARD_PHV,
  },

  // ── TECHNICAL PROGRAMS (13) ────────────────────────────────────────

  {
    id: "tech_passing_short",
    name: "Short Passing Mastery",
    category: "passing",
    type: "technical",
    description: "1-touch and 2-touch passing circuits. Develops accuracy, weight of pass, and receiving under pressure.",
    equipment: ["footballs", "cones", "passing_wall"],
    duration_minutes: 25,
    position_emphasis: ["CM", "CAM", "CDM"],
    difficulty: "beginner",
    tags: ["passing", "technique", "first_touch"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "10-15 passes per drill", intensity: "technical focus", rpe: "4-5",
      rest: "30s", frequency: "3x/week",
      coachingCues: ["Lock ankle", "Strike through center of ball", "Body shape: open to receive"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_passing_long",
    name: "Long-Range Passing & Switching",
    category: "passing",
    type: "technical",
    description: "Driven passes, lofted switches, diagonal balls. Essential for centre-backs and central midfielders.",
    equipment: ["footballs", "cones"],
    duration_minutes: 25,
    position_emphasis: ["CB", "CM", "CDM", "FB"],
    difficulty: "intermediate",
    tags: ["passing", "technique", "vision"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "8-10 passes per drill", intensity: "technical focus", rpe: "5-6",
      rest: "30-45s", frequency: "2-3x/week",
      coachingCues: ["Approach angle matters", "Strike underneath for loft, through middle for driven", "Follow through toward target"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_shooting",
    name: "Finishing & Shooting",
    category: "shooting",
    type: "technical",
    description: "Shooting from various distances and angles. 1v1 finishing, volleys, and placed finishes.",
    equipment: ["footballs", "cones", "goal"],
    duration_minutes: 30,
    position_emphasis: ["ST", "W", "CAM"],
    difficulty: "intermediate",
    tags: ["shooting", "finishing", "technique"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "6-8 shots per drill", intensity: "match pace", rpe: "6-7",
      rest: "30-45s", frequency: "3x/week",
      coachingCues: ["Head over ball for low drives", "Pick your spot before shooting", "Plant foot pointing at target"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_dribbling",
    name: "1v1 Dribbling & Ball Mastery",
    category: "dribbling",
    type: "technical",
    description: "Close control, skill moves, and 1v1 situations. Develops confidence on the ball in tight spaces.",
    equipment: ["footballs", "cones"],
    duration_minutes: 25,
    position_emphasis: ["W", "CAM", "ST"],
    difficulty: "beginner",
    tags: ["dribbling", "skill_moves", "1v1"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "5-6 attempts per drill", intensity: "progressive", rpe: "5-6",
      rest: "30s", frequency: "3-4x/week",
      coachingCues: ["Keep ball close at speed", "Use both feet", "Head up to scan defenders"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_first_touch",
    name: "First Touch & Receiving",
    category: "first_touch",
    type: "technical",
    description: "Receiving on the half-turn, cushioned control, directional first touches. The skill that separates levels.",
    equipment: ["footballs", "cones", "passing_wall"],
    duration_minutes: 20,
    position_emphasis: ["ALL"],
    difficulty: "beginner",
    tags: ["first_touch", "receiving", "technique"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "10-12 per drill", intensity: "technical focus", rpe: "4-5",
      rest: "20-30s", frequency: "4x/week",
      coachingCues: ["Check shoulder before receiving", "Cushion with the surface", "First touch sets up next action"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_crossing",
    name: "Crossing & Delivery",
    category: "crossing",
    type: "technical",
    description: "Early crosses, byline cut-backs, in-swinging and out-swinging deliveries. Fullback and winger essential.",
    equipment: ["footballs", "cones", "goal"],
    duration_minutes: 25,
    position_emphasis: ["FB", "W"],
    difficulty: "intermediate",
    tags: ["crossing", "delivery", "wide_play"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "6-8 deliveries per set", intensity: "match pace", rpe: "5-6",
      rest: "30-45s", frequency: "2-3x/week",
      coachingCues: ["Early cross: strike in stride, don't stop", "Whipped delivery: wrap foot around ball", "Target far post or cut-back zone"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_heading",
    name: "Heading Technique & Timing",
    category: "heading",
    type: "technical",
    description: "Defensive and attacking headers. Timing, body position, and neck strength.",
    equipment: ["footballs"],
    duration_minutes: 15,
    position_emphasis: ["CB", "ST"],
    difficulty: "intermediate",
    tags: ["heading", "aerial", "defending"],
    prescriptions: makePrescriptions({
      sets: 2, reps: "6-8", intensity: "moderate", rpe: "5-6",
      rest: "45s", frequency: "1-2x/week",
      coachingCues: ["Eyes open through contact", "Forehead — not top of head", "Attack the ball — don't let it hit you"],
    }, {
      U13: { sets: 1, reps: "3-4", frequency: "1x/week" },
      U15: { sets: 2, reps: "4-5", frequency: "1x/week" },
    }),
    phv_guidance: {
      pre_phv: { warnings: ["Limited heading: max 10 headers per week (FA guidelines)"] },
      mid_phv: {
        warnings: ["Restricted heading: max 10 headers per week", "Light ball recommended"],
        modifiedPrescription: { sets: 1, reps: "3-4" },
      },
      post_phv: { warnings: ["Follow FA heading guidelines — controlled progression"] },
    },
  },
  {
    id: "tech_defending_1v1",
    name: "1v1 Defending",
    category: "defensive",
    type: "technical",
    description: "Jockeying, body positioning, tackle timing, and recovery runs. Defensive fundamentals.",
    equipment: ["cones", "footballs"],
    duration_minutes: 25,
    position_emphasis: ["CB", "FB", "CDM"],
    difficulty: "intermediate",
    tags: ["defending", "1v1", "technique"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "5-6 per scenario", intensity: "match pace", rpe: "7",
      rest: "45s", frequency: "2-3x/week",
      coachingCues: ["Side-on body shape", "Show attacker onto weaker foot", "Stay on toes — don't dive in"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_goalkeeping",
    name: "Goalkeeper Technical Training",
    category: "goalkeeping",
    type: "technical",
    description: "Shot stopping, distribution, crosses, 1v1s. Position-specific technical development.",
    equipment: ["footballs", "goal", "cones"],
    duration_minutes: 40,
    position_emphasis: ["GK"],
    difficulty: "intermediate",
    tags: ["goalkeeping", "technique", "positioning"],
    prescriptions: makePrescriptions({
      sets: 4, reps: "6-8 actions per drill", intensity: "match pace", rpe: "7",
      rest: "45-60s", frequency: "3-4x/week",
      coachingCues: ["Set position before each action", "Hands together, fingers spread", "Attack the ball on crosses"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_set_pieces",
    name: "Set Piece Delivery & Routines",
    category: "set_piece",
    type: "technical",
    description: "Free kicks, corners, throw-ins. Rehearsed routines and delivery quality.",
    equipment: ["footballs", "cones", "goal", "mannequins"],
    duration_minutes: 20,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["set_pieces", "dead_ball", "technique"],
    prescriptions: makePrescriptions({
      sets: 2, reps: "8-10 deliveries per set", intensity: "technical focus", rpe: "5",
      rest: "30s", frequency: "1-2x/week",
      coachingCues: ["Consistent run-up", "Aim for target zones, not people", "Vary delivery: in-swing, out-swing, driven"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_tactical_positioning",
    name: "Positional Play & Shape",
    category: "tactical",
    type: "technical",
    description: "Understanding spatial relationships, defensive/attacking shape, pressing triggers, and transition moments.",
    equipment: ["cones", "bibs", "footballs"],
    duration_minutes: 30,
    position_emphasis: ["ALL"],
    difficulty: "intermediate",
    tags: ["tactical", "positioning", "game_intelligence"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "5-7 min per activity", intensity: "moderate", rpe: "5-6",
      rest: "2 min between activities", frequency: "2x/week",
      coachingCues: ["Constant scanning — check shoulders", "Communication: talk early and clearly", "Body shape open to pitch"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_scanning_decision",
    name: "Scanning & Decision Making",
    category: "scanning",
    type: "technical",
    description: "Pre-reception scanning, option identification, and decision speed. The cognitive side of football.",
    equipment: ["cones", "bibs", "footballs"],
    duration_minutes: 25,
    position_emphasis: ["CM", "CAM", "CDM"],
    difficulty: "advanced",
    tags: ["scanning", "decision_making", "game_intelligence"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "5-6 min per activity", intensity: "match pace", rpe: "6-7",
      rest: "90s", frequency: "2-3x/week",
      coachingCues: ["Scan before the ball arrives", "Identify 2 options minimum before receiving", "Speed of thought > speed of feet"],
    }),
    phv_guidance: STANDARD_PHV,
  },
  {
    id: "tech_combination_play",
    name: "Combination Play & Link-Up",
    category: "combination_play",
    type: "technical",
    description: "Wall passes, overlaps, underlaps, third-man runs. How to play together in tight spaces.",
    equipment: ["cones", "footballs", "bibs"],
    duration_minutes: 25,
    position_emphasis: ["CM", "CAM", "W", "ST"],
    difficulty: "intermediate",
    tags: ["combination_play", "teamwork", "passing"],
    prescriptions: makePrescriptions({
      sets: 3, reps: "5-6 patterns per set", intensity: "match pace", rpe: "6",
      rest: "45s", frequency: "2-3x/week",
      coachingCues: ["Timing of run = timing of pass", "Play and move — never stand still", "Use first touch to set up the next play"],
    }),
    phv_guidance: STANDARD_PHV,
  },
];

// ── Position Training Matrix ────────────────────────────────────────────

interface PositionMatrixEntry {
  position: string;
  gps_targets: Record<string, number>;
  strength_targets: Record<string, number>;
  speed_targets: Record<string, number>;
  mandatory_programs: string[];
  recommended_programs: string[];
  weekly_structure: Record<string, any>;
}

const POSITION_MATRIX: PositionMatrixEntry[] = [
  {
    position: "GK",
    gps_targets: { totalDistanceM: 5500, highSpeedRunM: 50, sprintDistanceM: 20, accels: 15, decels: 15 },
    strength_targets: { squat1RM_bw: 1.5, bench1RM_bw: 1.0, deadlift1RM_bw: 1.8, nordicReps: 6 },
    speed_targets: { tenM_s: 1.75, twentyM_s: 3.05, fortyM_s: 5.5 },
    mandatory_programs: ["tech_goalkeeping", "plyo_lower_body", "agility_reactive"],
    recommended_programs: ["strength_lower_compound", "mobility_hip_ankle", "nordic_hamstring_protocol"],
    weekly_structure: { strength: 2, technical: 4, agility: 2, endurance: 1, recovery: 2 },
  },
  {
    position: "CB",
    gps_targets: { totalDistanceM: 9500, highSpeedRunM: 400, sprintDistanceM: 150, accels: 35, decels: 40 },
    strength_targets: { squat1RM_bw: 1.8, bench1RM_bw: 1.2, deadlift1RM_bw: 2.2, nordicReps: 8 },
    speed_targets: { tenM_s: 1.7, twentyM_s: 2.95, fortyM_s: 5.2 },
    mandatory_programs: ["strength_lower_compound", "nordic_hamstring_protocol", "tech_defending_1v1", "tech_heading"],
    recommended_programs: ["agility_reactive", "sprint_linear_10_30", "tech_passing_long", "acl_prevention_protocol"],
    weekly_structure: { strength: 3, technical: 3, agility: 2, endurance: 2, recovery: 2 },
  },
  {
    position: "FB",
    gps_targets: { totalDistanceM: 10500, highSpeedRunM: 700, sprintDistanceM: 300, accels: 45, decels: 40 },
    strength_targets: { squat1RM_bw: 1.6, bench1RM_bw: 1.0, deadlift1RM_bw: 2.0, nordicReps: 8 },
    speed_targets: { tenM_s: 1.65, twentyM_s: 2.85, fortyM_s: 5.0 },
    mandatory_programs: ["sprint_linear_10_30", "endurance_hiit", "tech_crossing", "nordic_hamstring_protocol"],
    recommended_programs: ["sprint_flying_20_40", "agility_cod", "tech_defending_1v1", "groin_copenhagen"],
    weekly_structure: { strength: 2, technical: 3, speed: 2, endurance: 3, recovery: 2 },
  },
  {
    position: "CDM",
    gps_targets: { totalDistanceM: 11000, highSpeedRunM: 500, sprintDistanceM: 200, accels: 40, decels: 45 },
    strength_targets: { squat1RM_bw: 1.7, bench1RM_bw: 1.1, deadlift1RM_bw: 2.0, nordicReps: 8 },
    speed_targets: { tenM_s: 1.7, twentyM_s: 2.9, fortyM_s: 5.15 },
    mandatory_programs: ["endurance_hiit", "tech_passing_short", "tech_defending_1v1", "nordic_hamstring_protocol"],
    recommended_programs: ["strength_lower_compound", "agility_reactive", "tech_scanning_decision", "tech_tactical_positioning"],
    weekly_structure: { strength: 2, technical: 3, endurance: 3, agility: 2, recovery: 2 },
  },
  {
    position: "CM",
    gps_targets: { totalDistanceM: 11500, highSpeedRunM: 600, sprintDistanceM: 250, accels: 45, decels: 40 },
    strength_targets: { squat1RM_bw: 1.6, bench1RM_bw: 1.0, deadlift1RM_bw: 1.9, nordicReps: 8 },
    speed_targets: { tenM_s: 1.68, twentyM_s: 2.88, fortyM_s: 5.1 },
    mandatory_programs: ["endurance_hiit", "tech_passing_short", "tech_scanning_decision", "nordic_hamstring_protocol"],
    recommended_programs: ["tech_passing_long", "tech_combination_play", "agility_cod", "strength_single_leg"],
    weekly_structure: { strength: 2, technical: 4, endurance: 3, agility: 1, recovery: 2 },
  },
  {
    position: "CAM",
    gps_targets: { totalDistanceM: 10800, highSpeedRunM: 650, sprintDistanceM: 280, accels: 50, decels: 40 },
    strength_targets: { squat1RM_bw: 1.5, bench1RM_bw: 0.9, deadlift1RM_bw: 1.8, nordicReps: 8 },
    speed_targets: { tenM_s: 1.65, twentyM_s: 2.85, fortyM_s: 5.05 },
    mandatory_programs: ["tech_first_touch", "tech_shooting", "tech_dribbling", "nordic_hamstring_protocol"],
    recommended_programs: ["sprint_linear_10_30", "tech_combination_play", "tech_scanning_decision", "agility_cod"],
    weekly_structure: { strength: 2, technical: 4, speed: 2, endurance: 2, recovery: 2 },
  },
  {
    position: "W",
    gps_targets: { totalDistanceM: 10500, highSpeedRunM: 800, sprintDistanceM: 350, accels: 50, decels: 35 },
    strength_targets: { squat1RM_bw: 1.5, bench1RM_bw: 0.9, deadlift1RM_bw: 1.8, nordicReps: 8 },
    speed_targets: { tenM_s: 1.6, twentyM_s: 2.8, fortyM_s: 4.9 },
    mandatory_programs: ["sprint_linear_10_30", "sprint_flying_20_40", "tech_dribbling", "nordic_hamstring_protocol"],
    recommended_programs: ["tech_crossing", "tech_shooting", "agility_cod", "plyo_lower_body"],
    weekly_structure: { strength: 2, technical: 3, speed: 3, endurance: 2, recovery: 2 },
  },
  {
    position: "ST",
    gps_targets: { totalDistanceM: 9800, highSpeedRunM: 700, sprintDistanceM: 300, accels: 45, decels: 35 },
    strength_targets: { squat1RM_bw: 1.6, bench1RM_bw: 1.1, deadlift1RM_bw: 2.0, nordicReps: 8 },
    speed_targets: { tenM_s: 1.62, twentyM_s: 2.82, fortyM_s: 4.95 },
    mandatory_programs: ["tech_shooting", "sprint_linear_10_30", "tech_first_touch", "nordic_hamstring_protocol"],
    recommended_programs: ["tech_heading", "plyo_lower_body", "strength_lower_compound", "tech_dribbling"],
    weekly_structure: { strength: 2, technical: 4, speed: 2, endurance: 2, recovery: 2 },
  },
  {
    position: "ALL",
    gps_targets: { totalDistanceM: 10500, highSpeedRunM: 600, sprintDistanceM: 250, accels: 40, decels: 38 },
    strength_targets: { squat1RM_bw: 1.6, bench1RM_bw: 1.0, deadlift1RM_bw: 2.0, nordicReps: 8 },
    speed_targets: { tenM_s: 1.68, twentyM_s: 2.88, fortyM_s: 5.1 },
    mandatory_programs: ["nordic_hamstring_protocol", "acl_prevention_protocol", "mobility_hip_ankle"],
    recommended_programs: ["strength_lower_compound", "endurance_hiit", "sprint_linear_10_30", "agility_cod"],
    weekly_structure: { strength: 2, technical: 3, speed: 2, endurance: 2, recovery: 2 },
  },
];

// ── Seed Function ───────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding football training programs...");

  // Upsert programs in batches
  for (let i = 0; i < PROGRAMS.length; i += 10) {
    const batch = PROGRAMS.slice(i, i + 10).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      type: p.type,
      description: p.description,
      equipment: p.equipment,
      duration_minutes: p.duration_minutes,
      position_emphasis: p.position_emphasis,
      difficulty: p.difficulty,
      tags: p.tags,
      prescriptions: p.prescriptions,
      phv_guidance: p.phv_guidance,
      session_structure: null,
    }));

    const { error } = await supabase
      .from("football_training_programs")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(`Program batch ${i} error:`, error.message);
    } else {
      console.log(`  Programs ${i + 1}-${Math.min(i + 10, PROGRAMS.length)} upserted`);
    }
  }

  console.log(`Total programs: ${PROGRAMS.length}`);

  // Upsert position matrix
  console.log("\nSeeding position training matrix...");

  for (const entry of POSITION_MATRIX) {
    const { error } = await supabase
      .from("position_training_matrix")
      .upsert(
        {
          position: entry.position,
          gps_targets: entry.gps_targets,
          strength_targets: entry.strength_targets,
          speed_targets: entry.speed_targets,
          mandatory_programs: entry.mandatory_programs,
          recommended_programs: entry.recommended_programs,
          weekly_structure: entry.weekly_structure,
        },
        { onConflict: "position" }
      );

    if (error) {
      console.error(`Position ${entry.position} error:`, error.message);
    } else {
      console.log(`  ${entry.position} upserted`);
    }
  }

  console.log(`\nTotal positions: ${POSITION_MATRIX.length}`);
  console.log("Done!");
}

seed().catch(console.error);
