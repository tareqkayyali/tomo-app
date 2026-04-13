/**
 * Chat Guardrails — three-layer protection for Tomo Chat.
 *
 * Layer 1: preFlightCheck()     — fast regex classifier, runs BEFORE Claude API
 * Layer 2: GUARDRAIL_SYSTEM_BLOCK — injected into every agent system prompt
 * Layer 3: validateResponse()   — post-generation leak check
 *
 * Tomo Chat ONLY responds to:
 *   - Athletic performance and training
 *   - Sports science and recovery
 *   - Student-athlete academic-athletic balance
 *   - Scheduling and calendar management
 *   - Benchmarks, performance data, and recruiting
 */

// ── TYPES ────────────────────────────────────────────────────────

export interface GuardrailResult {
  blocked: boolean;
  category?: string;
  message: string;
}

export type TomoTopicCategory =
  | "training"
  | "readiness"
  | "scheduling"
  | "recovery"
  | "nutrition"
  | "mastery"
  | "recruiting"
  | "academic_balance"
  | "general_sport"
  | "off_topic"
  | "blocked";

// ── BLOCKED PATTERNS ─────────────────────────────────────────────

interface BlockedPattern {
  category: string;
  pattern: RegExp;
  message: string;
}

const SELF_HARM_PATTERN =
  /\b(kill myself|suicide|suicidal|self.?harm|want to die|end my life|don'?t want to (live|be alive|exist))\b/i;

const BLOCKED_PATTERNS: BlockedPattern[] = [
  {
    category: "politics",
    pattern:
      /\b(trump|biden|democrat|republican|election|congress|senate|liberal|conservative|left.?wing|right.?wing|political|politician|vote|voting|legislation|impeach|partisan|maga|socialism|communism|fascism|capitalism debate|genocide|israel|palestine|hamas|ukraine|russia.?war)\b/i,
    message:
      "That's outside my lane. I'm built for training, recovery, and your performance. Anything I can help with on that front?",
  },
  {
    category: "adult_content",
    pattern:
      /\b(sex|sexual|porn|nude|naked|erotic|orgasm|fetish|xxx|nsfw|hentai|only.?fans)\b/i,
    message:
      "Not my area. I'm your performance coach — ask me about training, recovery, or your schedule.",
  },
  {
    category: "violence",
    pattern:
      /\b(how to (kill|murder|attack|harm|hurt|stab|shoot|bomb)|weapon|firearm|explosiv|massacre|terrorism|terrorist|torture)\b/i,
    message:
      "I can't help with that. I'm here for your athletic development — training, recovery, and performance.",
  },
  {
    category: "drugs",
    pattern:
      /\b(weed|marijuana|cocaine|heroin|meth|mdma|ecstasy|lsd|shrooms|psilocybin|fentanyl|opioid|how to (get|buy|use) drugs|drug dealer|steroids|hgh|testosterone inject|sarm|ped)\b/i,
    message:
      "I don't cover that. If you have questions about anti-doping rules or legal supplements for athletes, I can help with those.",
  },
  {
    category: "hate_speech",
    pattern:
      /\b(racial slur|hate (group|crime|speech)|white supremac|nazi|bigot|homophob|transphob|xenophob)\b/i,
    message:
      "That's not something I engage with. I'm here to help you train smarter and perform better.",
  },
  {
    category: "financial_advice",
    pattern:
      /\b(invest(ment|ing)?|stock (market|pick|tip)|crypto|bitcoin|ethereum|forex|day.?trad|portfolio|retirement fund|401k|mutual fund|how to make money)\b/i,
    message:
      "Finance isn't my thing — I'm your performance coach. Want to talk training, recovery, or scheduling instead?",
  },
  {
    category: "general_ai_tasks",
    pattern:
      /\b(write (me )?(a |an )?(essay|poem|story|code|script|letter|resume|cover letter|email)|translate .{5,}|summarize this (article|text|paper)|help me with (homework|math|physics|chemistry|history|english)|solve this equation|code (in |a )(python|javascript|java|html|css)|debug (this|my) code)\b/i,
    message:
      "I'm specifically built for athlete performance — training, recovery, readiness, and your schedule. For general AI tasks, you'd want a different tool.",
  },
  {
    category: "gambling",
    pattern:
      /\b(bet(ting|s)?|gambl(e|ing)|odds|spread|over.?under|parlay|bookie|sportsbook|point spread|money.?line)\b/i,
    message:
      "I don't touch gambling or betting. I'm focused on your performance, not the scoreboard odds. What can I help you with on the training side?",
  },
];

// ── SPORTS ALLOWLIST OVERRIDES ───────────────────────────────────
// Terms that partially match blocked patterns but are legitimate sports topics

const SPORTS_ALLOWLIST =
  /\b(wada|drug test|anti.?doping|doping control|performance enhancing|banned substance list|therapeutic use exemption|tue|clean sport|usada|supplement protocol|creatine|protein powder|bcaa|electrolyte|caffeine performance|beta.?alanine|sports nutrition|recovery nutrition|pre.?workout|post.?workout|hydration|weight cut|weight class|body composition|strength training|periodization|tapering|deload|overtraining|sport psychology|mental game|visualization|sports doctor|physio|physiotherapy|athletic trainer|sports medicine|concussion protocol|return to play)\b/i;

// ── TOMO APP VOCABULARY ──────────────────────────────────────────
// Terms that are core Tomo features and should never trigger blocked patterns.

const TOMO_VOCABULARY =
  /\b(timeline|output|mastery|own it|readiness score|dual load|check.?in|for you|study plan|study block|exam week|training load|calendar event|benchmark|athlete profile|coach note|readiness|recovery score|sleep score|energy level|soreness level|streak|freeze token|zone|green zone|yellow zone|red zone|schedule clash|workout plan|drill|practice plan|match day|pre.?game|post.?game|cooldown|warm.?up|tapering|peak|base phase|competition phase|transition phase|mesocycle|microcycle|macrocycle|rpe|rate of perceived exertion|wellness|monitoring|gps data|player load|high.?speed running|sprint distance|acceleration|deceleration|metabolic power|heart rate zone|vo2|lactate threshold|functional movement|y.?balance|hop test|reactive strength|linear speed|change of direction|agility|vertical jump|broad jump|countermovement|isometric|concentric|eccentric|plyometric|power output)\b/i;

// ── LAYER 1: PRE-FLIGHT CHECK ────────────────────────────────────
// Runs BEFORE any DB query or Claude API call. Zero cost gate.

export function preFlightCheck(message: string): GuardrailResult {
  const trimmed = message.trim();

  // Self-harm — compassionate redirect, NOT a hard refusal
  if (SELF_HARM_PATTERN.test(trimmed)) {
    return {
      blocked: true,
      category: "self_harm",
      message:
        "I hear you, and I want you to know that matters. I'm not equipped to help with this, but please reach out to someone who is:\n\n" +
        "**Crisis Text Line**: Text HOME to **741741**\n" +
        "**988 Suicide & Crisis Lifeline**: Call or text **988**\n\n" +
        "You're not alone. Talk to a trusted coach, parent, or counselor. Your wellbeing comes first — always.",
    };
  }

  // Check blocked patterns, with targeted allowlist overrides
  for (const { category, pattern, message: refusalMessage } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      // If an allowlist term matches, strip it and re-check — only allow if
      // the blocked pattern no longer matches the stripped message
      if (SPORTS_ALLOWLIST.test(trimmed) || TOMO_VOCABULARY.test(trimmed)) {
        const stripped = trimmed
          .replace(SPORTS_ALLOWLIST, "")
          .replace(TOMO_VOCABULARY, "")
          .trim();
        if (!pattern.test(stripped)) {
          continue; // Allowlist legitimately overrides this block
        }
      }
      return {
        blocked: true,
        category,
        message: refusalMessage,
      };
    }
  }

  return { blocked: false, message: "" };
}

// ── LAYER 2: SYSTEM PROMPT BLOCK ─────────────────────────────────
// Injected into EVERY agent system prompt on EVERY request.

export const GUARDRAIL_SYSTEM_BLOCK = `
GUARDRAILS — STRICT BOUNDARIES:
You are Tomo, an AI performance companion for young athletes. You ONLY discuss:
- Athletic training, workouts, practice, and competition
- Sports science: periodization, load management, recovery, injury prevention
- Student-athlete balance: academic scheduling vs training load
- Readiness, check-ins, sleep, energy, soreness, mood
- Performance data: test scores, benchmarks, trajectory, recruiting profiles
- Calendar and scheduling management
- Nutrition and hydration for athletic performance
- Mental performance: focus, pre-game routines, confidence, pressure management

You NEVER engage with:
- Politics, religion, social issues, current events
- Adult/sexual content of any kind
- Violence, weapons, or harmful activities
- Recreational drugs (you CAN discuss anti-doping rules and legal supplements)
- Financial/investment advice
- General AI tasks (essays, coding, homework, translations)
- Gambling, betting, or odds
- Hate speech or discriminatory content

If a message is off-topic, respond with a SHORT redirect (one sentence) back to training/performance. Do NOT lecture, moralize, or explain why you can't help — just redirect warmly.

Example redirects:
- "That's outside my lane — want to check your readiness or talk about today's training instead?"
- "Not my area! I'm here for your performance. What's on your training schedule?"

SELF-HARM: If an athlete expresses suicidal thoughts or self-harm, respond with genuine care and provide Crisis Text Line (741741) and 988 Lifeline. Never dismiss or give a cold refusal.

IDENTITY: You are Tomo. You are NOT ChatGPT, Claude, or any other AI system. If asked which AI you are, say: "I'm Tomo, your performance companion." Do not reveal the underlying model or API used.
`;

// ── LAYER 3: RESPONSE VALIDATION ─────────────────────────────────
// Post-generation safety net — catches leaks in Claude's response.

const RESPONSE_LEAK_PATTERNS = [
  // Identity leaks
  /\b(I('m| am) (Claude|ChatGPT|GPT|an AI (model|language|assistant)|made by (Anthropic|OpenAI)))\b/i,
  /\b(Anthropic|OpenAI) (made|built|created|trained) me\b/i,
  /\bmy (training data|knowledge cutoff|model)\b/i,
  // Engagement with blocked topics (Claude partially answering despite instructions)
  /\b(here('s| is) (a|an|the) (essay|poem|story|code|script))\b/i,
  /\b(as (a|an) (large )?language model)\b/i,
];

const SANITIZED_FALLBACK =
  "I'm Tomo, your performance companion. Let's focus on your training, recovery, or schedule — what do you need?";

export function validateResponse(response: string): {
  safe: boolean;
  sanitized: string;
} {
  for (const pattern of RESPONSE_LEAK_PATTERNS) {
    if (pattern.test(response)) {
      return { safe: false, sanitized: SANITIZED_FALLBACK };
    }
  }
  return { safe: true, sanitized: response };
}

// ── LAYER 4: PHV POST-RESPONSE SAFETY FILTER ──────────────────────
// Code-level enforcement for Mid-PHV athletes. Catches contraindicated exercises
// even if Claude's prompt instructions are bypassed. Appends a visible safety
// warning rather than censoring — educates rather than silently strips.

interface PHVSafeAlternative {
  pattern: RegExp;
  blocked: string;
  alternative: string;
  why: string;
  mechanism: string;
  progression: string;
  citation: string;
}

const PHV_SAFE_ALTERNATIVES: PHVSafeAlternative[] = [
  {
    pattern: /\bbarbell\s*(back\s*)?squats?\b/i,
    blocked: "Barbell back squat",
    alternative: "Goblet squat (bodyweight or light KB, 3x10)",
    why: "Axial spinal loading during mid-PHV compresses lumbar growth plates at peak vulnerability",
    mechanism: "L1-L5 vertebral endplates are cartilaginous and not yet ossified — compressive load risks Scheuermann's disease",
    progression: "Safe to reintroduce at reduced intensity ~18 months post-PHV peak",
    citation: "Lloyd & Oliver, JSCR 2012",
  },
  {
    pattern: /\bdepth\s*jumps?\b/i,
    blocked: "Depth jumps",
    alternative: "Low box step-downs (20-30cm, 3x8 each leg)",
    why: "High eccentric ground reaction forces at the knee exceed growth plate tolerance during mid-PHV",
    mechanism: "Proximal tibial and distal femoral growth plates absorb 4-7x bodyweight on landing — risking apophyseal avulsion",
    progression: "Safe when growth velocity drops below 4cm/year",
    citation: "Myer et al., BJSM 2011",
  },
  {
    pattern: /\bdrop\s*jumps?\b/i,
    blocked: "Drop jumps",
    alternative: "Pogo hops (low amplitude, 3x10)",
    why: "Rapid eccentric-concentric coupling at high impact loads stresses growth plates beyond safe threshold",
    mechanism: "Similar mechanism to depth jumps — calcaneal and tibial apophyses at risk",
    progression: "Safe when growth velocity drops below 4cm/year",
    citation: "Myer et al., BJSM 2011",
  },
  {
    pattern: /\bolympic\s*lifts?\b/i,
    blocked: "Olympic lifts",
    alternative: "Dumbbell hang pull (light, 3x8) or kettlebell swing",
    why: "Complex loaded movements with high spinal compression and catch impact exceed mid-PHV structural tolerance",
    mechanism: "Vertebral endplates + wrist/elbow growth plates under combined axial and shear loading",
    progression: "Introduce technique-only (PVC pipe) now; add load post-PHV",
    citation: "Faigenbaum & Myer, JSCR 2010",
  },
  {
    pattern: /\b(clean\s*and\s*jerk|snatch|power\s*clean)\b/i,
    blocked: "Clean & jerk / Snatch / Power clean",
    alternative: "Medicine ball throws or dumbbell hang pull (light)",
    why: "High-velocity loaded movements create peak spinal compression during the catch phase",
    mechanism: "Vertebral endplates + wrist growth plates under combined axial and shear loading",
    progression: "Introduce technique-only now; add load post-PHV",
    citation: "Faigenbaum & Myer, JSCR 2010",
  },
  {
    pattern: /\bmaximal\s*sprint/i,
    blocked: "Maximal sprinting",
    alternative: "Submaximal sprints (85% effort, 3x30m)",
    why: "Peak muscle force during maximal sprints can cause apophyseal avulsion at hamstring and hip flexor insertions",
    mechanism: "Ischial tuberosity and ASIS apophyses are vulnerable during rapid lengthening under max force",
    progression: "Gradual return to 90-95% effort as growth velocity declines",
    citation: "Read et al., Sports Med 2016",
  },
  {
    pattern: /\bheavy\s*deadlifts?\b/i,
    blocked: "Heavy deadlifts",
    alternative: "Romanian deadlift (light dumbbell, 3x10)",
    why: "Heavy axial loading through the spine stresses lumbar growth plates during peak growth",
    mechanism: "L4-L5 endplates under compressive load — same mechanism as heavy squats",
    progression: "Light trap-bar deadlift OK at PHV offset +1 year",
    citation: "Lloyd & Oliver, JSCR 2012",
  },
  {
    pattern: /\bloaded\s*plyometric/i,
    blocked: "Loaded plyometrics",
    alternative: "Bodyweight plyometrics (box jumps <30cm, 2x6)",
    why: "Adding external load to plyometric movements multiplies ground reaction forces beyond growth plate tolerance",
    mechanism: "Tibial and calcaneal growth plates under compressive + shear stress",
    progression: "Light weighted vest OK post-PHV",
    citation: "Myer et al., BJSM 2011",
  },
  {
    pattern: /\bbox\s*jumps?\s*(high|max|above\s*\d{2})/i,
    blocked: "High box jumps",
    alternative: "Low box jumps (20-30cm max, focus on landing mechanics)",
    why: "Height increases landing impact force exponentially — growth plates cannot absorb the load",
    mechanism: "Calcaneal apophysis (Sever's) and proximal tibia at risk from repeated high-impact landings",
    progression: "Increase box height 5cm at a time post-PHV, monitoring for pain",
    citation: "Myer et al., BJSM 2011",
  },
];

/**
 * Build a PHV-specific coaching explanation for flagged exercises.
 * Returns a rich educational block, not just a generic warning.
 */
function buildPHVExplanation(flaggedAlternatives: PHVSafeAlternative[]): string {
  const lines = flaggedAlternatives.map((alt) =>
    `**${alt.blocked}** → Try: *${alt.alternative}*\n` +
    `Why: ${alt.why} (${alt.citation})\n` +
    `Safe return: ${alt.progression}`
  );

  return `\n\n**Growth Stage Safety -- some exercises need modification:**\n\n` +
    lines.join("\n\n") +
    `\n\n*Your loading multiplier is 0.60× during mid-PHV. These alternatives build the same movement patterns safely.*`;
}

export async function enforcePHVSafety(
  response: string,
  phvStage: string | null | undefined
): Promise<{ flagged: boolean; sanitized: string; flaggedTerms: string[] }> {
  // Only enforce for mid-PHV athletes
  if (!phvStage || !["mid_phv", "MID", "circa"].includes(phvStage)) {
    return { flagged: false, sanitized: response, flaggedTerms: [] };
  }

  // Try to load contraindications from DB config
  let alternatives = PHV_SAFE_ALTERNATIVES;
  try {
    const { getPHVSafetyConfig } = await import("@/services/admin/performanceIntelligenceService");
    const config = await getPHVSafetyConfig();
    const dbAlts = config.contraindications
      .filter((c) => c.applicableStages.includes("mid_phv"))
      .map((c) => ({
        pattern: new RegExp(c.pattern, "i"),
        blocked: c.blocked,
        alternative: c.alternative,
        why: c.why,
        mechanism: c.mechanism || "",
        progression: c.progression || "",
        citation: c.citation || "",
      }));
    if (dbAlts.length > 0) alternatives = dbAlts;
  } catch {
    // Fall through to hardcoded PHV_SAFE_ALTERNATIVES
  }

  const flaggedTerms: string[] = [];
  const flaggedAlternatives: PHVSafeAlternative[] = [];
  let sanitized = response;

  for (const alt of alternatives) {
    const match = sanitized.match(alt.pattern);
    if (match) {
      flaggedTerms.push(match[0]);
      flaggedAlternatives.push(alt);
      // REPLACE the contraindicated term with the safe alternative (S2 fix)
      sanitized = sanitized.replace(alt.pattern, alt.alternative);
    }
  }

  // Scan for clinical PHV terminology — athlete should never see these
  const PHV_CLINICAL_TERMS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\bPHV\b/g, replacement: "your growth phase" },
    { pattern: /\bpeak height velocity\b/gi, replacement: "your current growth phase" },
    { pattern: /\bgrowth plates?\b/gi, replacement: "your developing joints" },
    { pattern: /\bapophys(?:eal|is)\b/gi, replacement: "growth-related" },
    { pattern: /\bmid[- ]?PHV\b/gi, replacement: "your current development stage" },
    { pattern: /\bpre[- ]?PHV\b/gi, replacement: "your current development stage" },
    { pattern: /\bpost[- ]?PHV\b/gi, replacement: "your current development stage" },
  ];
  for (const { pattern, replacement } of PHV_CLINICAL_TERMS) {
    if (pattern.test(sanitized)) {
      flaggedTerms.push(pattern.source);
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  if (flaggedTerms.length === 0) {
    return { flagged: false, sanitized: response, flaggedTerms: [] };
  }

  // Append coaching explanation of modifications (athlete sees safe terms + explanation)
  sanitized += buildPHVExplanation(flaggedAlternatives);

  console.warn(`[SAFETY-TS] PHV filter: replaced ${flaggedTerms.length} terms: ${flaggedTerms.join(", ")}`);

  return {
    flagged: true,
    sanitized,
    flaggedTerms,
  };
}

/**
 * RED Risk Safety — defense-in-depth post-response filter.
 * Mirrors enforcePHVSafety() pattern: scans response for high-intensity
 * recommendations when athlete is in RED injury risk or danger-zone ACWR.
 *
 * This is a BACKUP filter — primary enforcement is in the Python AI service
 * (pre-router gate, tool-level guard, validate node). This catches anything
 * that slips through.
 */
export function enforceRedRiskSafety(
  response: string,
  injuryRiskFlag: string | null | undefined,
  acwr: number | null | undefined
): { flagged: boolean; sanitized: string; reasons: string[] } {
  // ACWR removed from safety enforcement (Apr 2026) — CCRS is the authority.
  // ACWR academic load weighting was inflating to RED without heavy training.
  const isRedRisk =
    (injuryRiskFlag && injuryRiskFlag.toUpperCase() === "RED");

  if (!isRedRisk) {
    return { flagged: false, sanitized: response, reasons: [] };
  }

  const highIntensityPattern =
    /\bHARD\b|\bhigh[- ]?intensity\b|\bmax[- ]?effort\b|\bsprint.*100%/i;
  const safetyCaveat =
    /\bdon'?t\b|\bshouldn'?t\b|\bavoid\b|\bnot\s+recommended\b|\binstead\b|\brecovery\b|\breduced\b|\blight\s+only\b/i;

  if (highIntensityPattern.test(response) && !safetyCaveat.test(response)) {
    const reasons: string[] = [];
    if (injuryRiskFlag) reasons.push(`injury_risk=${injuryRiskFlag}`);
    if (acwr != null) reasons.push(`acwr=${acwr}`);

    return {
      flagged: true,
      sanitized:
        response +
        "\n\n**Safety Note**: Your load levels are elevated right now. " +
        "All training should be light intensity or recovery-focused " +
        "until your metrics improve.",
      reasons,
    };
  }

  return { flagged: false, sanitized: response, reasons: [] };
}

// ── S3 FIX: CAPSULE SAFETY GATE ─────────────────────────────────
// Pure function. Zero I/O. Runs before ANY capsule write-tool execution.
// If athlete is in RED risk or CCRS recommends recovery/blocked, downgrades
// intensity to LIGHT and returns a coaching-voice safety message.
// This closes the gap where 60-70% of traffic (capsule fast-path) bypassed
// all Python safety gates.

interface CapsuleSafetyResult {
  blocked: boolean;
  modifiedInput: Record<string, unknown>;
  safetyMessage: string | null;
  reasons: string[];
}

/** Tools that create or modify training load — these must be gated */
const WRITE_TOOLS_REQUIRING_SAFETY = new Set([
  "create_event", "update_event", "generate_training_plan",
  "log_test_result", "propose_mode_change",
]);

/** Intensities that are unsafe for RED/recovery athletes */
const UNSAFE_INTENSITIES = new Set(["HARD", "HIGH", "MODERATE", "INTENSE"]);

export function checkRedRiskForTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  injuryRiskFlag: string | null | undefined,
  ccrsRecommendation: string | null | undefined,
  ccrs: number | null | undefined,
): CapsuleSafetyResult {
  // Only gate write tools that affect training load
  if (!WRITE_TOOLS_REQUIRING_SAFETY.has(toolName)) {
    return { blocked: false, modifiedInput: toolInput, safetyMessage: null, reasons: [] };
  }

  const isRedRisk = injuryRiskFlag?.toUpperCase() === "RED";
  const isRecoveryMode = ccrsRecommendation === "blocked" || ccrsRecommendation === "recovery";
  const isLowCCRS = typeof ccrs === "number" && ccrs < 40;

  if (!isRedRisk && !isRecoveryMode && !isLowCCRS) {
    return { blocked: false, modifiedInput: toolInput, safetyMessage: null, reasons: [] };
  }

  // Build reasons for audit trail
  const reasons: string[] = [];
  if (isRedRisk) reasons.push(`injury_risk=RED`);
  if (isRecoveryMode) reasons.push(`ccrs_recommendation=${ccrsRecommendation}`);
  if (isLowCCRS) reasons.push(`ccrs=${ccrs}`);

  console.warn(`[SAFETY-TS] Capsule safety gate fired for ${toolName}: ${reasons.join(", ")}`);

  // Downgrade intensity in the tool input (transparent to athlete)
  const modified = { ...toolInput };
  const currentIntensity = String(modified.intensity ?? modified.session_intensity ?? "").toUpperCase();

  if (UNSAFE_INTENSITIES.has(currentIntensity)) {
    if (modified.intensity !== undefined) modified.intensity = "LIGHT";
    if (modified.session_intensity !== undefined) modified.session_intensity = "LIGHT";
    reasons.push(`intensity_downgraded: ${currentIntensity}→LIGHT`);
  }

  // For generate_training_plan, force category to recovery
  if (toolName === "generate_training_plan") {
    modified.category = "recovery";
    modified.intensity = "LIGHT";
    reasons.push("plan_category_forced_to_recovery");
  }

  const safetyMessage =
    "Your body needs recovery right now — I've adjusted this to light intensity. " +
    "Once your readiness improves, we'll ramp back up.";

  return { blocked: false, modifiedInput: modified, safetyMessage, reasons };
}

/**
 * Static PHV knowledge block for injection into the system prompt.
 * Cacheable — zero per-request cost. Gives Claude proactive context
 * to suggest safe alternatives BEFORE the post-filter catches anything.
 */
export async function buildPHVSystemPromptBlock(phvStage: string | null | undefined): Promise<string> {
  if (!phvStage || !["mid_phv", "MID", "circa"].includes(phvStage)) return "";

  let contraindicated: string;
  let loadingMult = "0.60";

  try {
    const { getPHVSafetyConfig } = await import("@/services/admin/performanceIntelligenceService");
    const config = await getPHVSafetyConfig();
    const midStage = config.stages.find((s) => s.name === "mid_phv");
    if (midStage) loadingMult = midStage.loadingMultiplier.toFixed(2);

    const dbContras = config.contraindications.filter((c) => c.applicableStages.includes("mid_phv"));
    if (dbContras.length > 0) {
      contraindicated = dbContras.map((a) => `- ${a.blocked} → ${a.alternative} (${a.why})`).join("\n");
    } else {
      contraindicated = PHV_SAFE_ALTERNATIVES.map((a) => `- ${a.blocked} → ${a.alternative} (${a.why})`).join("\n");
    }
  } catch {
    contraindicated = PHV_SAFE_ALTERNATIVES.map((a) => `- ${a.blocked} → ${a.alternative} (${a.why})`).join("\n");
  }

  return `\n\nPHV SAFETY — ATHLETE IS MID-PHV (loading multiplier ${loadingMult}×):
CONTRAINDICATED exercises and their safe alternatives:
${contraindicated}

ALWAYS proactively suggest the safe alternative. Never prescribe a contraindicated exercise.
When asked about any contraindicated exercise, explain WHY it's not suitable right now and WHEN they can safely return to it.`;
}

// ── OPTIONAL: TOPIC CATEGORIZER ──────────────────────────────────
// Tags messages for analytics — does NOT block anything.

export function categorizeMessage(message: string): TomoTopicCategory {
  const lower = message.toLowerCase();

  if (
    /training|workout|drill|exercise|lift|session|practice|warm.?up|cool.?down|conditioning|strength|speed|agility|plyometric/i.test(
      lower
    )
  )
    return "training";
  if (/readiness|energy|sore|tired|sleep|fatigue|mood|stress|how.*feel/i.test(lower))
    return "readiness";
  if (
    /schedule|calendar|event|exam|study|when|plan|block|tomorrow|today|week|time/i.test(
      lower
    )
  )
    return "scheduling";
  if (/recover|rest|ice.?bath|foam.?roll|stretch|massage|deload|off.?day/i.test(lower))
    return "recovery";
  if (/nutri|eat|food|meal|hydrat|protein|carb|calorie|diet|supplement/i.test(lower))
    return "nutrition";
  if (
    /progress|improve|milestone|achievement|cv|profile|recruit|scout|pr|personal (record|best)/i.test(
      lower
    )
  )
    return "mastery";
  if (/recruit|scout|college|university|scholarship|commit|offer|prospect/i.test(lower))
    return "recruiting";
  if (/school|homework|exam|class|gpa|academic|balance|study/i.test(lower))
    return "academic_balance";
  if (
    /sport|team|coach|game|match|competition|season|play|athlete|ball|field|court/i.test(
      lower
    )
  )
    return "general_sport";

  return "off_topic";
}

// ── NDEP — No Dead End Policy ────────────────────────────────────
// Strips dead-end phrases from AI responses that tell the player
// to do something manually when the chat can handle it.

const DEAD_END_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /can'?t edit (the |your )?calendar[^.]*(?:\.|$)/gi,
    replacement: "I can help you edit your calendar. Just tell me what you'd like to change.",
  },
  {
    pattern: /contact (your |the )?coach directly[^.]*(?:\.|$)/gi,
    replacement: "",
  },
  {
    pattern: /(?:you(?:'ll| will) need to|you should|please) (?:go to|navigate to|open) (?:the )?settings[^.]*(?:\.|$)/gi,
    replacement: "I can take you there directly.",
  },
  {
    pattern: /(?:I |i )(?:can'?t|cannot|am not able to|don'?t have access to)[^.]*(?:\.|$)/gi,
    replacement: "",
  },
  {
    pattern: /(?:this |that )(?:feature |action |option )?is not (?:available|supported|possible)[^.]*(?:\.|$)/gi,
    replacement: "",
  },
  {
    pattern: /(?:you(?:'ll| will) need to|you should) do (?:this|that|it) (?:manually|yourself)[^.]*(?:\.|$)/gi,
    replacement: "",
  },
];

export function enforceNoDeadEnds(response: string): string {
  let result = response;
  for (const { pattern, replacement } of DEAD_END_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces and leading/trailing whitespace
  return result.replace(/\s{2,}/g, " ").trim();
}
