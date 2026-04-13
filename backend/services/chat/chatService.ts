/**
 * Chat Service — Tomo AI Coach
 *
 * Three modes (priority order):
 *   1. Anthropic Claude (when ANTHROPIC_API_KEY is set)
 *   2. Rule-based responder (default, free)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { ArchetypeInfo, type Archetype } from "@/types";
import { resolveSession, getSessionMessages } from "./sessionManager";
import {
  generateClaudeResponse,
  generateClaudeResponseStream,
} from "./claudeService";

// ─── Intent Detection ───────────────────────────────────────────────────────

const INTENTS = {
  LOG_WORKOUT: "log_workout",
  CHECK_IN: "check_in",
  QUESTION_RECOVERY: "question_recovery",
  QUESTION_TRAINING: "question_training",
  QUESTION_NUTRITION: "question_nutrition",
  QUESTION_ACADEMIC: "question_academic",
  SCHEDULE_EVENT: "schedule_event",
  GENERAL_CHAT: "general_chat",
} as const;

function detectIntent(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  if (
    /\b(did|finished|completed|just did|ran|played|trained|worked out|practiced)\b/.test(msg) &&
    /\b(minutes|mins|hours|hrs|km|miles|sets|reps|session|game|match|practice)\b/.test(msg)
  ) return INTENTS.LOG_WORKOUT;

  if (
    /\b(feeling|feel|tired|sore|hurt|pain|energy|sleep|slept|exhausted|fatigued)\b/.test(msg) &&
    /\b(today|right now|this morning|currently|lately)\b/.test(msg)
  ) return INTENTS.CHECK_IN;

  if (/\b(recover|recovery|rest|ice|stretch|foam roll|massage|sore|soreness|ache|stiff)\b/.test(msg))
    return INTENTS.QUESTION_RECOVERY;

  if (/\b(train|training|workout|exercise|drill|practice|session|warm.?up|cool.?down|technique)\b/.test(msg))
    return INTENTS.QUESTION_TRAINING;

  if (/\b(eat|food|nutrition|diet|hydrat|water|protein|carb|meal|snack|supplement|fuel)\b/.test(msg))
    return INTENTS.QUESTION_NUTRITION;

  if (/\b(exam|exams|test|study|studying|homework|school|class|classes|assignment|finals|midterm)\b/.test(msg))
    return INTENTS.QUESTION_ACADEMIC;

  if (
    /\b(schedule|add to calendar|put on calendar|add.*event|plan for)\b/i.test(msg) ||
    (/\b(i have|i've got|there's a|there is a|got a)\b/i.test(msg) &&
      /\b(practice|training|match|game|session|exam|test|class|tournament)\b/i.test(msg) &&
      /\b(at \d|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next)\b/i.test(msg))
  ) return INTENTS.SCHEDULE_EVENT;

  return INTENTS.GENERAL_CHAT;
}

// ─── System Prompt Builder ──────────────────────────────────────────────────

interface UserRow {
  name: string;
  age: number | null;
  sport: string;
  archetype: string | null;
  current_streak: number;
  days_since_rest: number;
}

interface CheckinRow {
  date: string;
  energy: number;
  soreness: number;
  sleep_hours: number;
  readiness: string;
  pain_flag: boolean;
  academic_stress: number | null;
}

interface PlanRow {
  intensity: string;
  workout_type: string;
  duration: number;
  readiness: string;
  status: string;
}

function buildSystemPrompt(
  user: UserRow,
  recentCheckins: CheckinRow[],
  todayPlan: PlanRow | null
): string {
  const archetypeDetail = user.archetype
    ? ArchetypeInfo[user.archetype as Archetype]
    : null;
  const sport = user.sport || "football";

  const checkinSummary =
    recentCheckins.length > 0
      ? recentCheckins
          .map(
            (c) =>
              `  ${c.date}: energy=${c.energy}/10, soreness=${c.soreness}/10, sleep=${c.sleep_hours}h, readiness=${c.readiness || "N/A"}${c.pain_flag ? " [PAIN]" : ""}`
          )
          .join("\n")
      : "  No recent check-ins";

  const planSummary = todayPlan
    ? `Intensity: ${todayPlan.intensity}, Type: ${todayPlan.workout_type}, Duration: ${todayPlan.duration}min, Readiness: ${todayPlan.readiness}, Status: ${todayPlan.status}`
    : "No plan yet (check-in not completed)";

  const latestCheckin = recentCheckins[0];
  const academicContext = latestCheckin?.academic_stress
    ? `\nACADEMIC LOAD: ${latestCheckin.academic_stress}/10 today`
    : "";

  return `You are Tomo, a personal AI sports coach and mentor for young athletes aged 13-23.
You are like the athlete's favorite coach — someone who genuinely knows them, their data, their sport, and always has their back.

PERSONALITY & TONE:
- Warm, friendly, relatable — like texting a cool older coach who actually cares
- Keep tone warm and relatable
- Use the athlete's first name naturally
- Be specific and direct — reference their ACTUAL numbers
- Full mentor scope: training, recovery, mental wellness, motivation, nutrition, sleep, school-sport balance

SAFETY RULES:
- If the athlete reports pain -> ALWAYS recommend rest
- If readiness is Red -> recommend rest
- 6+ days without rest -> suggest a rest day
- For persistent pain, recommend seeing a doctor/physio

ATHLETE PROFILE:
- Name: ${user.name || "Athlete"}
- Age: ${user.age}
- Sport: ${sport}
- Current Streak: ${user.current_streak} days
- Days Since Rest: ${user.days_since_rest}
${archetypeDetail ? `- Archetype: ${archetypeDetail.name} — ${archetypeDetail.description}` : "- Archetype: Not yet assigned (needs 14+ check-ins)"}
${archetypeDetail ? `- Fatal Flaw: ${archetypeDetail.fatalFlaw}` : ""}

RECENT CHECK-INS (last 5):
${checkinSummary}

TODAY'S PLAN:
${planSummary}${academicContext}

TOOL USE GUIDELINES:
- Use tools to look up data rather than guessing
- For padel players: use get_padel_progress
- PROACTIVE SCHEDULING: If the athlete mentions a future event, offer to add it to their calendar
- Confirm with the athlete before executing actions

Keep responses concise but personal (2-6 sentences typically).`;
}

// ─── Rule-Based Responder ───────────────────────────────────────────────────

function generateRuleBasedResponse(
  userMessage: string,
  intent: string,
  user: UserRow,
  recentCheckins: CheckinRow[],
  todayPlan: PlanRow | null
): string {
  const name = user.name || "there";
  const sport = user.sport || "your sport";
  const archetypeDetail = user.archetype
    ? ArchetypeInfo[user.archetype as Archetype]
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const todayCheckin = recentCheckins.find((c) => c.date === today);
  const hasPain = todayCheckin?.pain_flag;
  const readiness = todayCheckin?.readiness || todayPlan?.readiness;

  // Pain override
  if (hasPain || /\b(pain|hurt|injury|injured|hurts)\b/i.test(userMessage)) {
    return `Hey ${name}, if you're dealing with pain, your body is asking for a break. Rest up today — taking a day off now saves you weeks later. If it keeps up, definitely check in with a doctor or physio.`;
  }

  // Red readiness
  if (readiness === "Red") {
    return `${name}, your body is in the red zone today. Recovery is the priority — light stretching, lots of water, and an early night will help you bounce back. You've got this!`;
  }

  switch (intent) {
    case INTENTS.LOG_WORKOUT:
      return `Let's go ${name}! Great work getting after it. Head to your daily check-in to log this session — it helps me dial in your recovery and next training plan perfectly.`;

    case INTENTS.CHECK_IN:
      if (todayCheckin) {
        return `Already checked in today, ${name}! Energy at ${todayCheckin.energy}/10, soreness at ${todayCheckin.soreness}/10.${archetypeDetail ? ` As a ${archetypeDetail.name}, ${archetypeDetail.calmMessage}` : ""}`;
      }
      return `Hey ${name}! Head to the check-in screen to log your energy, soreness, and sleep — then I'll build you a personalized ${sport} plan!`;

    case INTENTS.QUESTION_RECOVERY:
      return `Great question, ${name}! Try 5-10 minutes of foam rolling on your tight spots — it makes a huge difference for ${sport} athletes.${user.current_streak >= 7 ? ` You're on a ${user.current_streak}-day streak — smart recovery keeps that going!` : ""}`;

    case INTENTS.QUESTION_TRAINING:
      if (todayPlan) {
        return `Your plan today is a ${todayPlan.intensity} ${todayPlan.workout_type} session, about ${todayPlan.duration} minutes. ${todayPlan.intensity === "light" ? "Keep it controlled and focus on technique." : "Bring the energy but listen to your body!"}`;
      }
      return `Complete your daily check-in first, ${name}! Then I'll build you a personalized ${sport} session.`;

    case INTENTS.QUESTION_NUTRITION:
      return `For ${sport}, carbs before training and protein within 30 mins after is the winning combo. Every athlete is different — find what works for your body!`;

    case INTENTS.QUESTION_ACADEMIC:
      return `Balancing ${sport} and school is no joke, ${name}. Log your academic stress during check-in — I'll adjust your training plan so you don't burn out on both ends.`;

    default:
      return `Hey ${name}! ${user.current_streak > 0 ? `${user.current_streak}-day streak going strong.` : "Ready to start building a streak?"} What can I help with?`;
  }
}

// ─── Suggestion Chips ───────────────────────────────────────────────────────

export async function getSuggestionChips(
  userId: string
): Promise<{ label: string; message: string }[]> {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [checkinRes, planRes] = await Promise.all([
      db
        .from("checkins")
        .select("energy, soreness, academic_stress")
        .eq("user_id", userId)
        .eq("date", today)
        .single(),
      db
        .from("plans")
        .select("status")
        .eq("user_id", userId)
        .eq("date", today)
        .single(),
    ]);

    const chips: { label: string; message: string }[] = [];

    if (!checkinRes.data) {
      chips.push({
        label: "How am I feeling?",
        message: "How are you feeling today?",
      });
    }

    if (checkinRes.data && planRes.data?.status === "pending") {
      chips.push({
        label: "Training update",
        message: "How did training go?",
      });
    }

    if (
      checkinRes.data?.academic_stress &&
      checkinRes.data.academic_stress >= 7
    ) {
      chips.push({
        label: "Study + Training",
        message: "How should I balance studying and training today?",
      });
    }

    const defaults = [
      {
        label: "Recovery tips",
        message: "What are some good recovery tips for me?",
      },
      {
        label: "Training advice",
        message: "What should I focus on in training?",
      },
      {
        label: "Sleep & energy",
        message: "How can I improve my energy levels?",
      },
    ];

    for (const d of defaults) {
      if (chips.length >= 3) break;
      if (!chips.find((c) => c.label === d.label)) {
        chips.push(d);
      }
    }

    return chips.slice(0, 3);
  } catch {
    return [
      { label: "How am I feeling?", message: "How are you feeling today?" },
      {
        label: "Recovery tips",
        message: "What are some good recovery tips for me?",
      },
      {
        label: "Training advice",
        message: "What should I focus on in training?",
      },
    ];
  }
}

// ─── Main Chat Handler ──────────────────────────────────────────────────────

export interface ChatResult {
  userMsg: { role: string; content: string };
  aiMsg: { role: string; content: string };
  intent: string;
}

export async function processMessage(
  userId: string,
  userMessage: string
): Promise<ChatResult> {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { sessionId } = await resolveSession(userId);

  // Load context in parallel
  const [userRes, checkinsRes, planRes, sessionMessages] = await Promise.all([
    db.from("users").select("*").eq("id", userId).single(),
    db
      .from("checkins")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(5),
    db.from("plans").select("*").eq("user_id", userId).eq("date", today).single(),
    getSessionMessages(userId, sessionId),
  ]);

  // Use sensible defaults if user hasn't completed profile registration yet
  const user = (userRes.data ?? {
    name: "Athlete",
    age: null,
    sport: "football",
    archetype: null,
    current_streak: 0,
    days_since_rest: 0,
  }) as unknown as UserRow;

  const recentCheckins = (checkinsRes.data || []) as unknown as CheckinRow[];
  const todayPlan = planRes.data as unknown as PlanRow | null;
  const intent = detectIntent(userMessage);

  let aiContent: string;
  let mode = "rules";

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const systemPrompt = buildSystemPrompt(
        user as unknown as UserRow,
        recentCheckins,
        todayPlan
      );
      const result = await generateClaudeResponse(
        userMessage,
        sessionMessages,
        systemPrompt,
        userId
      );
      aiContent = result.content;
      mode = "claude";
    } catch {
      aiContent = generateRuleBasedResponse(
        userMessage,
        intent,
        user as unknown as UserRow,
        recentCheckins,
        todayPlan
      );
    }
  } else {
    aiContent = generateRuleBasedResponse(
      userMessage,
      intent,
      user as unknown as UserRow,
      recentCheckins,
      todayPlan
    );
  }

  // Store both messages
  const [userMsg, aiMsg] = await Promise.all([
    db
      .from("chat_messages")
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: "user",
        content: userMessage,
        metadata: { intent, sessionId },
      })
      .select()
      .single(),
    db
      .from("chat_messages")
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: "assistant",
        content: aiContent,
        metadata: { intent, mode, sessionId },
      })
      .select()
      .single(),
  ]);

  return {
    userMsg: { role: "user", content: userMessage },
    aiMsg: { role: "assistant", content: aiContent },
    intent,
  };
}

export async function processMessageStream(
  userId: string,
  userMessage: string,
  onDelta: (text: string) => void,
  onStatus: (status: string) => void
): Promise<ChatResult> {
  const db = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { sessionId } = await resolveSession(userId);

  const [userRes, checkinsRes, planRes, sessionMessages] = await Promise.all([
    db.from("users").select("*").eq("id", userId).single(),
    db
      .from("checkins")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(5),
    db.from("plans").select("*").eq("user_id", userId).eq("date", today).single(),
    getSessionMessages(userId, sessionId),
  ]);

  // Use sensible defaults if user hasn't completed profile registration yet
  const user = (userRes.data ?? {
    name: "Athlete",
    age: null,
    sport: "football",
    archetype: null,
    current_streak: 0,
    days_since_rest: 0,
  }) as unknown as UserRow;

  const recentCheckins = (checkinsRes.data || []) as unknown as CheckinRow[];
  const todayPlan = planRes.data as unknown as PlanRow | null;
  const intent = detectIntent(userMessage);

  let aiContent: string;
  let mode = "rules";

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const systemPrompt = buildSystemPrompt(
        user as unknown as UserRow,
        recentCheckins,
        todayPlan
      );
      const result = await generateClaudeResponseStream(
        userMessage,
        sessionMessages,
        systemPrompt,
        userId,
        onDelta,
        onStatus
      );
      aiContent = result.content;
      mode = "claude";
    } catch {
      aiContent = generateRuleBasedResponse(
        userMessage,
        intent,
        user as unknown as UserRow,
        recentCheckins,
        todayPlan
      );
      onDelta(aiContent);
    }
  } else {
    aiContent = generateRuleBasedResponse(
      userMessage,
      intent,
      user as unknown as UserRow,
      recentCheckins,
      todayPlan
    );
    onDelta(aiContent);
  }

  // Store messages
  await Promise.all([
    db.from("chat_messages").insert({
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: userMessage,
      metadata: { intent, sessionId },
    }),
    db.from("chat_messages").insert({
      user_id: userId,
      session_id: sessionId,
      role: "assistant",
      content: aiContent,
      metadata: { intent, mode, sessionId },
    }),
  ]);

  return {
    userMsg: { role: "user", content: userMessage },
    aiMsg: { role: "assistant", content: aiContent },
    intent,
  };
}
