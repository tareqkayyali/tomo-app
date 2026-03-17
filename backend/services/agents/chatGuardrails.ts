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
