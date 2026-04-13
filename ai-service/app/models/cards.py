"""
Tomo AI Service — Response Card Models
Pydantic models for the 12 structured card types rendered by the mobile app.

These are the Python equivalents of the TypeScript card interfaces in responseFormatter.ts.
Used by format_response_node to validate and structure agent output.
"""

from __future__ import annotations

from typing import Optional, Any
from pydantic import BaseModel, Field


# ── Individual Card Types ──────────────────────────────────────────

class StatRowCard(BaseModel):
    """Single metric highlight."""
    type: str = "stat_row"
    label: str
    value: str
    unit: Optional[str] = None
    trend: Optional[str] = None  # "up" | "down" | "stable"
    emoji: Optional[str] = None
    highlight: Optional[str] = None  # "green" | "yellow" | "red"


class StatGridItem(BaseModel):
    """Single item in a stat grid."""
    label: str
    value: str
    unit: Optional[str] = None
    highlight: Optional[str] = None  # "green" | "yellow" | "red"
    emoji: Optional[str] = None


class StatGridCard(BaseModel):
    """3+ metrics in a grid layout."""
    type: str = "stat_grid"
    items: list[StatGridItem]


class ScheduleItem(BaseModel):
    """Single item in a schedule list."""
    time: str
    title: str
    event_type: str = Field(alias="type", default="training")  # training | match | gym | study | exam | rest
    intensity: Optional[str] = None
    clash: Optional[bool] = False
    notes: Optional[str] = None

    model_config = {"populate_by_name": True}  # Accept both "type" and "event_type"


class ScheduleListCard(BaseModel):
    """Calendar/schedule view for a day or range."""
    type: str = "schedule_list"
    date: str
    items: list[ScheduleItem]


class ZoneLevel(BaseModel):
    """Single zone in a zone stack."""
    zone: str  # green | yellow | red
    label: str
    detail: str


class ZoneStackCard(BaseModel):
    """Load zone or exam zone visualization."""
    type: str = "zone_stack"
    current: str  # Current zone name
    levels: list[ZoneLevel]


class TextCard(BaseModel):
    """Prose advice — max 2 sentences."""
    type: str = "text_card"
    headline: Optional[str] = None
    body: str
    emoji: Optional[str] = None


class CoachNoteCard(BaseModel):
    """Single coaching insight line."""
    type: str = "coach_note"
    note: str
    emoji: Optional[str] = None


class SessionDrill(BaseModel):
    """Single drill in a session plan."""
    drill_id: Optional[str] = None
    name: str
    category: str
    duration_min: int
    intensity: str  # LIGHT | MODERATE | HARD
    sets: Optional[int] = None
    reps: Optional[str] = None
    reason: Optional[str] = None


class SessionPlanCard(BaseModel):
    """Full training session / workout plan."""
    type: str = "session_plan"
    title: str
    total_duration_min: int
    readiness_level: Optional[str] = None  # GREEN | YELLOW | RED
    items: list[SessionDrill]
    notes: Optional[str] = None


class ProgramItem(BaseModel):
    """Single program recommendation."""
    program_id: str
    name: str
    category: str
    priority: int  # 1 = highest
    weekly_frequency: int
    duration_min: int
    match_reason: Optional[str] = None


class ProgramRecommendationCard(BaseModel):
    """Training program recommendation list (max 5)."""
    type: str = "program_recommendation"
    programs: list[ProgramItem]
    player_profile: Optional[str] = None


class DrillCard(BaseModel):
    """Single drill detail."""
    type: str = "drill_card"
    drill_id: str
    name: str
    category: str
    equipment: Optional[str] = None
    duration_min: int
    intensity: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    progressions: Optional[list[str]] = None


class BenchmarkBar(BaseModel):
    """Percentile comparison bar."""
    type: str = "benchmark_bar"
    metric: str
    value: float
    percentile: float
    unit: Optional[str] = None
    age_band: Optional[str] = None
    position: Optional[str] = None


class ClashItem(BaseModel):
    """Single scheduling conflict."""
    event_a: str
    event_b: str
    overlap_minutes: int
    suggestion: str


class ClashListCard(BaseModel):
    """Scheduling conflicts list."""
    type: str = "clash_list"
    clashes: list[ClashItem]


class PhvAssessmentCard(BaseModel):
    """PHV maturity assessment result."""
    type: str = "phv_assessment"
    phv_stage: str  # PRE | MID | POST
    offset_years: float
    loading_multiplier: float
    blocked_movements: list[str]
    safe_alternatives: list[str]
    recommendation: str


class ConfirmCard(BaseModel):
    """Confirmation UI for write actions."""
    type: str = "confirm_card"
    headline: str
    body: str
    confirm_label: str = "Confirm"
    cancel_label: str = "Cancel"
    action_data: Optional[dict[str, Any]] = None


# ── Action Chips ───────────────────────────────────────────────────

class ActionChip(BaseModel):
    """Follow-up action suggestion chip."""
    label: str  # Display text (max 25 chars)
    message: str  # Message to send when tapped


# ── Full Response Structure ────────────────────────────────────────

class TomoResponse(BaseModel):
    """
    Complete Tomo AI response structure sent to mobile.
    Maps 1:1 to the mobile ResponseRenderer component.
    """
    headline: str = ""  # Max 8 words, Gen Z first
    body: Optional[str] = None  # Max 2 sentences
    cards: list[dict[str, Any]] = Field(default_factory=list)  # 1-3 cards
    chips: list[ActionChip] = Field(default_factory=list)  # 1-3 follow-up chips
    confirm: Optional[dict[str, Any]] = None  # Confirmation metadata


# ── Card Type Registry ─────────────────────────────────────────────

CARD_TYPE_MAP: dict[str, type[BaseModel]] = {
    "stat_row": StatRowCard,
    "stat_grid": StatGridCard,
    "schedule_list": ScheduleListCard,
    "zone_stack": ZoneStackCard,
    "text_card": TextCard,
    "coach_note": CoachNoteCard,
    "session_plan": SessionPlanCard,
    "program_recommendation": ProgramRecommendationCard,
    "drill_card": DrillCard,
    "benchmark_bar": BenchmarkBar,
    "clash_list": ClashListCard,
    "phv_assessment": PhvAssessmentCard,
    "confirm_card": ConfirmCard,
}
