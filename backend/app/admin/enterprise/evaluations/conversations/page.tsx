"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/* ------------------------------------------------------------------
   Conversation Browser & PD Annotation
   Browse production AI chat conversations and annotate for quality.
   Annotations feed into LangSmith labeled datasets for eval improvement.
   ------------------------------------------------------------------ */

// ── Types ──────────────────────────────────────────────────────────

interface ChatSession {
  id: string;
  user_id: string;
  agent_type: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  conversation_state: Record<string, unknown> | null;
  // Joined display fields
  athlete_name: string;
  sport: string;
  position: string;
  age_band: string;
  has_safety_flag: boolean;
}

interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

interface AnnotationDimension {
  key: string;
  label: string;
  description: string;
}

interface Annotation {
  session_id: string;
  overall_rating: number;
  dimensions: Record<string, number>;
  notes: string;
}

// ── Constants ──────────────────────────────────────────────────────

const ANNOTATION_DIMENSIONS: AnnotationDimension[] = [
  {
    key: "safety",
    label: "Safety",
    description: "Respected PHV / readiness / injury constraints",
  },
  {
    key: "specificity",
    label: "Specificity",
    description: "Advice specific to sport, position, and level",
  },
  {
    key: "protocol_citation",
    label: "Protocol Citation",
    description: "Referenced relevant protocols or evidence",
  },
  {
    key: "tone",
    label: "Tone Appropriateness",
    description: "Communication was age-appropriate",
  },
  {
    key: "actionability",
    label: "Actionability",
    description: "Recommendations were immediately actionable",
  },
];

const AGENT_TYPES = ["all", "output", "timeline", "mastery"] as const;

const SAFETY_FILTERS = ["all", "flagged", "clean"] as const;

// ── Mock data (until API is wired) ─────────────────────────────────
// TODO: wire to real API

function getMockSessions(): ChatSession[] {
  return [
    {
      id: "a1b2c3d4-0001-4000-8000-000000000001",
      user_id: "u-001",
      agent_type: "output",
      created_at: "2026-04-11T08:12:00Z",
      updated_at: "2026-04-11T08:18:00Z",
      message_count: 5,
      conversation_state: null,
      athlete_name: "Lucas M.",
      sport: "football",
      position: "CM",
      age_band: "U15",
      has_safety_flag: false,
    },
    {
      id: "a1b2c3d4-0002-4000-8000-000000000002",
      user_id: "u-002",
      agent_type: "output",
      created_at: "2026-04-11T07:45:00Z",
      updated_at: "2026-04-11T07:52:00Z",
      message_count: 4,
      conversation_state: null,
      athlete_name: "Sofia R.",
      sport: "padel",
      position: "Right",
      age_band: "U17",
      has_safety_flag: false,
    },
    {
      id: "a1b2c3d4-0003-4000-8000-000000000003",
      user_id: "u-003",
      agent_type: "timeline",
      created_at: "2026-04-10T19:30:00Z",
      updated_at: "2026-04-10T19:38:00Z",
      message_count: 3,
      conversation_state: null,
      athlete_name: "Karim B.",
      sport: "football",
      position: "ST",
      age_band: "U15",
      has_safety_flag: true,
    },
    {
      id: "a1b2c3d4-0004-4000-8000-000000000004",
      user_id: "u-004",
      agent_type: "mastery",
      created_at: "2026-04-10T16:10:00Z",
      updated_at: "2026-04-10T16:15:00Z",
      message_count: 4,
      conversation_state: null,
      athlete_name: "Maya T.",
      sport: "athletics",
      position: "Sprinter",
      age_band: "U19",
      has_safety_flag: false,
    },
    {
      id: "a1b2c3d4-0005-4000-8000-000000000005",
      user_id: "u-005",
      agent_type: "output",
      created_at: "2026-04-10T14:00:00Z",
      updated_at: "2026-04-10T14:12:00Z",
      message_count: 5,
      conversation_state: null,
      athlete_name: "Omar J.",
      sport: "basketball",
      position: "PG",
      age_band: "U17",
      has_safety_flag: true,
    },
  ];
}

function getMockMessages(sessionId: string): ChatMessage[] {
  const bank: Record<string, ChatMessage[]> = {
    "a1b2c3d4-0001-4000-8000-000000000001": [
      { id: "m1", session_id: sessionId, role: "user", content: "How do I improve my sprint speed for midfield?", created_at: "2026-04-11T08:12:00Z" },
      { id: "m2", session_id: sessionId, role: "assistant", content: "Based on your profile as a U15 CM, your sprint metrics show room for improvement in acceleration. I recommend focusing on resisted sprint drills 2x per week, specifically sled pulls at 10% body weight over 20m. Your ACWR is currently 0.9, so we have headroom to add volume safely.", created_at: "2026-04-11T08:12:30Z" },
      { id: "m3", session_id: sessionId, role: "user", content: "What about plyometrics?", created_at: "2026-04-11T08:14:00Z" },
      { id: "m4", session_id: sessionId, role: "assistant", content: "Plyometrics are excellent for a CM your age. I suggest starting with low-intensity bounds and pogos (2 sets of 8) before progressing to depth jumps. Given your current growth phase, we should keep ground contact times short and avoid excessive eccentric loading.", created_at: "2026-04-11T08:14:45Z" },
      { id: "m5", session_id: sessionId, role: "user", content: "Thanks, how often should I do those?", created_at: "2026-04-11T08:16:00Z" },
    ],
    "a1b2c3d4-0002-4000-8000-000000000002": [
      { id: "m6", session_id: sessionId, role: "user", content: "I want to improve my volley technique for padel", created_at: "2026-04-11T07:45:00Z" },
      { id: "m7", session_id: sessionId, role: "assistant", content: "As a right-side padel player at U17, your volley is one of the most important weapons. Focus on continental grip stability and compact preparation. I recommend 3 drills: wall volleys (50 reps), partner cross-court volleys, and approach volley sequences.", created_at: "2026-04-11T07:45:40Z" },
      { id: "m8", session_id: sessionId, role: "user", content: "My wrist hurts after long sessions", created_at: "2026-04-11T07:48:00Z" },
      { id: "m9", session_id: sessionId, role: "assistant", content: "Wrist discomfort after long padel sessions is common at your age. I recommend reducing session duration by 15 minutes and adding a structured wrist warm-up routine. Please consult your physio if the pain persists beyond 48 hours or occurs during daily activities.", created_at: "2026-04-11T07:48:30Z" },
    ],
    "a1b2c3d4-0003-4000-8000-000000000003": [
      { id: "m10", session_id: sessionId, role: "user", content: "Schedule me a heavy gym session tomorrow", created_at: "2026-04-10T19:30:00Z" },
      { id: "m11", session_id: sessionId, role: "assistant", content: "I notice your readiness is currently RED. Heavy gym work is not recommended right now. Your recovery score has been below threshold for 2 days. I suggest a light mobility session instead, focusing on hip and ankle mobility that will benefit your ST position.", created_at: "2026-04-10T19:30:45Z" },
      { id: "m12", session_id: sessionId, role: "user", content: "Ok fine, what should I do?", created_at: "2026-04-10T19:33:00Z" },
    ],
    "a1b2c3d4-0004-4000-8000-000000000004": [
      { id: "m13", session_id: sessionId, role: "user", content: "Show me my mastery progress", created_at: "2026-04-10T16:10:00Z" },
      { id: "m14", session_id: sessionId, role: "assistant", content: "Here's your mastery snapshot. Your Speed pillar is at 72nd percentile among U19 sprinters, up from 65th last month. Your Endurance pillar improved 8% this cycle. Areas for focus: Agility sits at 58th percentile. Would you like a targeted plan?", created_at: "2026-04-10T16:10:35Z" },
      { id: "m15", session_id: sessionId, role: "user", content: "Yes, build me a plan for agility", created_at: "2026-04-10T16:12:00Z" },
      { id: "m16", session_id: sessionId, role: "assistant", content: "I've prepared a 4-week agility focus block for you. It includes ladder drills 3x/week, cone agility sequences, and reactive sprint work. Given your sprinter profile, we'll emphasize change-of-direction speed over prolonged agility endurance.", created_at: "2026-04-10T16:12:40Z" },
    ],
    "a1b2c3d4-0005-4000-8000-000000000005": [
      { id: "m17", session_id: sessionId, role: "user", content: "My knee has been hurting after games", created_at: "2026-04-10T14:00:00Z" },
      { id: "m18", session_id: sessionId, role: "assistant", content: "Knee pain after games is something we need to take seriously, especially for a U17 PG with high-impact landing patterns. I strongly recommend seeing your physiotherapist before your next training session. In the meantime, avoid jumping drills and high-intensity court work.", created_at: "2026-04-10T14:00:50Z" },
      { id: "m19", session_id: sessionId, role: "user", content: "Can I still do upper body work?", created_at: "2026-04-10T14:03:00Z" },
      { id: "m20", session_id: sessionId, role: "assistant", content: "Yes, seated upper-body work is fine. Focus on pressing and pulling movements that keep you off your feet. I'd recommend seated dumbbell press, cable rows, and band pull-aparts. Avoid standing overhead work until the knee is cleared.", created_at: "2026-04-10T14:03:35Z" },
      { id: "m21", session_id: sessionId, role: "user", content: "Thanks Tomo", created_at: "2026-04-10T14:05:00Z" },
    ],
  };
  return bank[sessionId] || [];
}

// ── Subcomponents ──────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          className={`text-lg transition-colors ${
            star <= value
              ? "text-yellow-500"
              : "text-muted-foreground/30 hover:text-yellow-500/50"
          } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          aria-label={`Rate ${star} of 5`}
        >
          &#9733;
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-muted text-foreground"
            : "bg-primary/10 text-foreground"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium">
            {isUser ? "Athlete" : "Tomo AI"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(msg.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="leading-relaxed">{msg.content}</p>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  isSelected,
  onClick,
}: {
  session: ChatSession;
  isSelected: boolean;
  onClick: () => void;
}) {
  const timeAgo = getTimeAgo(session.updated_at);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-transparent hover:bg-muted/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{session.athlete_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px] capitalize">
              {session.sport}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {session.position} {session.age_band}
            </span>
          </div>
        </div>
        {session.has_safety_flag && (
          <Badge variant="destructive" className="text-[10px] shrink-0">
            Flagged
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground font-mono">
          {session.agent_type}
        </span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{session.message_count} msgs</span>
          <span>{timeAgo}</span>
        </div>
      </div>
    </button>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main Page ──────────────────────────────────────────────────────

export default function ConversationBrowserPage() {
  // Session list state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterSafety, setFilterSafety] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Detail state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Annotation state
  const [overallRating, setOverallRating] = useState(0);
  const [dimensionScores, setDimensionScores] = useState<Record<string, number>>({});
  const [annotationNotes, setAnnotationNotes] = useState("");
  const [submittingAnnotation, setSubmittingAnnotation] = useState(false);

  // ── Fetch sessions ─────────────────────────────────────────────

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    try {
      // TODO: wire to real API
      const res = await fetch("/api/v1/admin/enterprise/evaluations/conversations");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      } else {
        setSessions(getMockSessions());
      }
    } catch {
      setSessions(getMockSessions());
    } finally {
      setLoadingSessions(false);
    }
  }

  // ── Fetch messages for selected session ────────────────────────

  const fetchMessages = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    resetAnnotation();
    try {
      // TODO: wire to real API
      const res = await fetch(
        `/api/v1/admin/enterprise/evaluations/conversations?id=${sessionId}`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        setMessages(getMockMessages(sessionId));
      }
    } catch {
      setMessages(getMockMessages(sessionId));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    fetchMessages(sessionId);
  }

  // ── Annotation handlers ────────────────────────────────────────

  function resetAnnotation() {
    setOverallRating(0);
    setDimensionScores({});
    setAnnotationNotes("");
  }

  function setDimensionScore(key: string, score: number) {
    setDimensionScores((prev) => ({ ...prev, [key]: score }));
  }

  const isAnnotationValid =
    overallRating > 0 &&
    ANNOTATION_DIMENSIONS.every((d) => (dimensionScores[d.key] || 0) > 0);

  async function submitAnnotation() {
    if (!selectedSessionId || !isAnnotationValid) return;
    setSubmittingAnnotation(true);

    const payload: Annotation = {
      session_id: selectedSessionId,
      overall_rating: overallRating,
      dimensions: dimensionScores,
      notes: annotationNotes.trim(),
    };

    try {
      // TODO: wire to real API
      const res = await fetch("/api/v1/admin/enterprise/evaluations/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Annotation saved");
        resetAnnotation();
      } else {
        // Mock success until API exists
        toast.success("Annotation saved (mock)");
        resetAnnotation();
      }
    } catch {
      // Mock success until API exists
      toast.success("Annotation saved (mock)");
      resetAnnotation();
    } finally {
      setSubmittingAnnotation(false);
    }
  }

  // ── Filter sessions ────────────────────────────────────────────

  const filteredSessions = sessions.filter((s) => {
    if (filterAgent !== "all" && s.agent_type !== filterAgent) return false;
    if (filterSafety === "flagged" && !s.has_safety_flag) return false;
    if (filterSafety === "clean" && s.has_safety_flag) return false;
    if (
      searchQuery &&
      !s.athlete_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.sport.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.id.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  // ── Loading state ──────────────────────────────────────────────

  if (loadingSessions) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Conversation Browser</h1>
          <p className="text-muted-foreground">
            Browse and annotate AI coaching conversations
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <Card className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </Card>
          <Card className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </Card>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Conversation Browser</h1>
        <p className="text-muted-foreground">
          Browse and annotate AI coaching conversations
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
        {/* ── Left panel: Session list ─────────────────────────── */}
        <Card className="p-4">
          {/* Filters */}
          <div className="space-y-3 mb-4">
            <Input
              placeholder="Search athlete, sport, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Select
                value={filterAgent}
                onValueChange={(v) => setFilterAgent(v ?? "all")}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Agent" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "all" ? "All Agents" : t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterSafety}
                onValueChange={(v) => setFilterSafety(v ?? "all")}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Safety" />
                </SelectTrigger>
                <SelectContent>
                  {SAFETY_FILTERS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f === "all" ? "All" : f === "flagged" ? "Flagged" : "Clean"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Session list */}
          <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto">
            {filteredSessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No sessions match filters
              </p>
            ) : (
              filteredSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  isSelected={s.id === selectedSessionId}
                  onClick={() => handleSelectSession(s.id)}
                />
              ))
            )}
          </div>

          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            {filteredSessions.length} of {sessions.length} sessions
          </p>
        </Card>

        {/* ── Right panel: Detail + Annotation ─────────────────── */}
        <div className="space-y-4">
          {!selectedSession ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground text-sm">
                Select a session to view the conversation
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Choose from the list on the left to review and annotate
              </p>
            </Card>
          ) : (
            <>
              {/* Session header */}
              <Card className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">
                      {selectedSession.athlete_name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {selectedSession.sport}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {selectedSession.position} &middot;{" "}
                        {selectedSession.age_band}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-mono"
                      >
                        {selectedSession.agent_type}
                      </Badge>
                      {selectedSession.has_safety_flag && (
                        <Badge variant="destructive" className="text-[10px]">
                          Safety Flagged
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <p>{new Date(selectedSession.created_at).toLocaleString()}</p>
                    <p className="font-mono">{selectedSession.id.slice(0, 8)}...</p>
                  </div>
                </div>
              </Card>

              {/* Messages */}
              <Card className="p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Messages ({messages.length})
                </h3>
                {loadingMessages ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No messages in this session
                  </p>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto pr-1">
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} msg={msg} />
                    ))}
                  </div>
                )}
              </Card>

              {/* Annotation panel */}
              <Card className="p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  PD Annotation
                </h3>

                {/* Overall rating */}
                <div className="mb-4">
                  <Label className="text-sm font-medium">Overall Rating</Label>
                  <div className="mt-1">
                    <StarRating value={overallRating} onChange={setOverallRating} />
                  </div>
                </div>

                {/* Dimension scores */}
                <div className="space-y-3 mb-4">
                  {ANNOTATION_DIMENSIONS.map((dim) => (
                    <div
                      key={dim.key}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{dim.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {dim.description}
                        </p>
                      </div>
                      <StarRating
                        value={dimensionScores[dim.key] || 0}
                        onChange={(v) => setDimensionScore(dim.key, v)}
                      />
                    </div>
                  ))}
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <Label htmlFor="annotation-notes" className="text-sm font-medium">
                    Notes
                  </Label>
                  <Textarea
                    id="annotation-notes"
                    placeholder="Optional observations, flags, or improvement suggestions..."
                    value={annotationNotes}
                    onChange={(e) => setAnnotationNotes(e.target.value)}
                    rows={3}
                    className="mt-1 text-sm"
                  />
                </div>

                {/* Submit */}
                <Button
                  onClick={submitAnnotation}
                  disabled={!isAnnotationValid || submittingAnnotation}
                  className="w-full"
                >
                  {submittingAnnotation ? "Saving..." : "Submit Annotation"}
                </Button>

                {!isAnnotationValid && overallRating > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    Rate all dimensions to submit
                  </p>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
