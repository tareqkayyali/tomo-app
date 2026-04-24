/**
 * ResponseRenderer — renders a structured TomoResponse as a single
 * chat turn using the Tomo chat design primitives.
 *
 * Turn shape (per tomo-ai-chat.jsx):
 *   <TomoTitle>       — bold diagnostic sentence (response.headline)
 *   <TomoBody>        — one paragraph of reasoning   (response.body)
 *   ONE interactive ending per card:
 *     <MetricRow>     — numeric readouts (stat_row / stat_grid / benchmark_bar)
 *     <Table>         — label · value · tier rows (schedules, clashes, programs…)
 *     <Suggestions>   — dotted-underline follow-ups (chips)
 *     <FormSection + RadioRow + CTA> — interactive choice / confirm
 *     CapsuleRenderer — full interactive capsule flows
 *
 * Each card is wrapped in a per-card error boundary so a malformed
 * card never kills the whole screen (blast-radius containment rule).
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sentry } from '../../services/sentry';
import type {
  TomoResponse,
  VisualCard,
  StatRow,
  StatGrid,
  ScheduleList,
  ScheduleItem,
  WeekSchedule,
  WeekPlan,
  ZoneStack,
  ClashList,
  BenchmarkBar,
  TextCard,
  CoachNote,
  ConfirmCard,
  SessionPlan,
  DrillCard,
  SchedulePreviewCard,
  CapsuleAction,
  ProgramRecommendationCard,
  ProgramDetailCard,
  ChoiceCard,
  InjuryCard,
  GoalCard,
  DailyBriefingCard,
} from '../../types/chat';
import { CapsuleRenderer, isCapsuleCard } from './capsules/CapsuleRenderer';
import { ProgramRecommendationList } from './ProgramRecommendationList';
import { ProgramDetailChatCard } from './ProgramDetailChatCard';
import {
  T,
  TomoTitle,
  TomoBody,
  MetricRow,
  Table,
  Suggestions,
  FormSection,
  RadioRow,
  CTA,
  type MetricItem,
  type TableRow,
  type TierKind,
} from './tomo';

// ─── helpers ─────────────────────────────────────────────────────────

const stripForCompare = (s: string) =>
  (s ?? '')
    .replace(/[*_#•\-`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 80);

const SELF_CONTAINED_TYPES = new Set(['confirm_card', 'choice_card']);

const intensityTier = (v?: string): TierKind | undefined => {
  const s = (v ?? '').toLowerCase();
  if (s === 'hard') return 'alert';
  if (s === 'light' || s === 'rest') return 'elite';
  return undefined;
};

const readinessTier = (color?: string): TierKind | undefined => {
  const s = (color ?? '').toLowerCase();
  if (s.includes('red')) return 'alert';
  if (s.includes('green')) return 'elite';
  return undefined;
};

const zoneTier = (
  zone: string,
  current: string,
): TierKind | undefined => {
  if (zone === current) {
    return zone === 'red' ? 'alert' : zone === 'green' ? 'elite' : 'ontrack';
  }
  return undefined;
};

const fmtPercentile = (p: number | undefined): string | undefined =>
  typeof p === 'number' ? `P${Math.round(p)}` : undefined;

// ─── per-card error boundary ─────────────────────────────────────────

class CardErrorBoundary extends Component<
  { children: ReactNode; cardType: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { surface: 'chat_card', cardType: this.props.cardType },
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>
            Couldn’t render a card in this reply.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── card renderers ──────────────────────────────────────────────────

function renderStatRow(card: StatRow) {
  const items: MetricItem[] = [
    {
      value: `${card.value}${card.unit ? ` ${card.unit}` : ''}`,
      label: card.label,
    },
  ];
  return <MetricRow items={items} />;
}

function renderStatGrid(card: StatGrid) {
  const raw = Array.isArray(card.items) ? card.items : [];
  const items: MetricItem[] = raw.slice(0, 4).map((it) => ({
    value: `${it.value}${it.unit ? ` ${it.unit}` : ''}`,
    label: it.label,
    tone: it.highlight ? 'alert' : 'default',
  }));
  return <MetricRow items={items} />;
}

function renderBenchmarkBar(card: BenchmarkBar) {
  const pct = fmtPercentile(card.percentile);
  const tone: MetricItem['tone'] =
    typeof card.percentile === 'number' && card.percentile < 25
      ? 'alert'
      : 'default';
  return (
    <MetricRow
      items={[
        {
          value: `${card.value}${card.unit ? ` ${card.unit}` : ''}`,
          label: card.metric,
          pct,
          tone,
        },
      ]}
    />
  );
}

function renderScheduleList(card: ScheduleList) {
  const items: ScheduleItem[] = Array.isArray(card.items) ? card.items : [];
  const rows: TableRow[] = items.map((it) => ({
    label: `${it.time}  ·  ${it.title}`,
    tier: it.clash ? 'alert' : undefined,
  }));
  return (
    <>
      {card.date ? <TomoBody>{card.date}</TomoBody> : null}
      <Table rows={rows} />
    </>
  );
}

function renderWeekSchedule(card: WeekSchedule) {
  const days = Array.isArray(card.days) ? card.days : [];
  return (
    <>
      {card.summary ? <TomoBody>{card.summary}</TomoBody> : null}
      {days.map((day, i) => {
        const items = Array.isArray(day.items) ? day.items : [];
        const rows: TableRow[] = items.map((it) => ({
          label: `${it.time}  ·  ${it.title}`,
          tier: it.clash ? 'alert' : undefined,
        }));
        return (
          <FormSection key={`${day.dayLabel}-${i}`} label={day.dayLabel}>
            <Table rows={rows} />
          </FormSection>
        );
      })}
    </>
  );
}

function renderWeekPlan(card: WeekPlan) {
  const days = Array.isArray(card.days) ? card.days : [];
  const rows: TableRow[] = days.map((d) => {
    const tags = Array.isArray(d.tags) ? d.tags : [];
    const tagLabel = tags.map((t) => t.label).join(' · ');
    const valueBits: string[] = [];
    if (d.time) valueBits.push(d.time);
    if (tagLabel) valueBits.push(tagLabel);
    const hasRed = tags.some((t) => t.color === 'red');
    const hasGreen = tags.some((t) => t.color === 'green');
    return {
      label: d.day,
      value: valueBits.join('  ·  ') || (d.note ?? ''),
      tier: hasRed ? 'alert' : hasGreen ? 'elite' : undefined,
    };
  });
  return <Table rows={rows} />;
}

function renderZoneStack(card: ZoneStack) {
  const levels = Array.isArray(card.levels) ? card.levels : [];
  const rows: TableRow[] = levels.map((lvl) => ({
    label: lvl.label,
    value: lvl.detail,
    tier: zoneTier(lvl.zone, card.current),
  }));
  return <Table rows={rows} />;
}

function renderClashList(card: ClashList) {
  const clashes = Array.isArray(card.clashes) ? card.clashes : [];
  const rows: TableRow[] = clashes.map((c) => ({
    label: `${c.time}  ·  ${c.event1} vs ${c.event2}`,
    value: c.fix,
    tier: 'alert' as TierKind,
  }));
  return <Table rows={rows} />;
}

function renderTextCard(card: TextCard, skipHeadline: boolean) {
  return (
    <>
      {!skipHeadline && card.headline ? (
        <TomoTitle>{card.headline}</TomoTitle>
      ) : null}
      {card.body ? <TomoBody>{card.body}</TomoBody> : null}
    </>
  );
}

function renderCoachNote(card: CoachNote) {
  return (
    <>
      {card.note ? <TomoBody>{card.note}</TomoBody> : null}
      {card.source ? (
        <Text style={styles.source}>— {card.source}</Text>
      ) : null}
    </>
  );
}

function renderConfirmCard(
  card: ConfirmCard,
  onConfirm?: () => void,
  onCancel?: () => void,
) {
  return (
    <>
      {card.headline ? <TomoTitle>{card.headline}</TomoTitle> : null}
      {card.body ? <TomoBody>{card.body}</TomoBody> : null}
      {onConfirm && (
        <CTA tone="primary" onPress={onConfirm}>
          {card.confirmLabel || 'Confirm'}
        </CTA>
      )}
      {onCancel && (
        <CTA tone="muted" onPress={onCancel}>
          {card.cancelLabel || 'Cancel'}
        </CTA>
      )}
    </>
  );
}

function renderChoiceCard(
  card: ChoiceCard,
  onChipPress?: (action: string) => void,
  skipHeadline?: boolean,
) {
  const options = Array.isArray(card.options) ? card.options : [];
  return (
    <>
      {!skipHeadline && card.headline ? (
        <TomoTitle>{card.headline}</TomoTitle>
      ) : null}
      <FormSection label="Pick one">
        {options.map((opt, i) => (
          <RadioRow
            key={`${opt.value}-${i}`}
            title={opt.label}
            sub={opt.description}
            onPress={
              onChipPress ? () => onChipPress(opt.value) : undefined
            }
            last={i === options.length - 1}
          />
        ))}
      </FormSection>
    </>
  );
}

function renderSessionPlan(card: SessionPlan) {
  const items = Array.isArray(card.items) ? card.items : [];
  const rows: TableRow[] = items.map((it) => ({
    label: it.name,
    value: `${it.duration}m`,
    tier: intensityTier(it.intensity),
  }));
  return (
    <>
      {card.title ? <TomoBody>{card.title}</TomoBody> : null}
      <MetricRow
        items={[
          {
            value: `${card.totalDuration ?? 0}m`,
            label: 'Total',
          },
          {
            value: card.readiness ?? '—',
            label: 'Readiness',
          },
          {
            value: String(items.length),
            label: 'Drills',
          },
        ]}
      />
      <Table rows={rows} />
    </>
  );
}

function renderDrillCard(card: DrillCard) {
  const equipment = Array.isArray(card.equipment) ? card.equipment : [];
  const instructions = Array.isArray(card.instructions)
    ? card.instructions
    : [];
  const rows: TableRow[] = [
    { label: 'Duration', value: `${card.duration}m` },
    {
      label: 'Intensity',
      value: card.intensity,
      tier: intensityTier(card.intensity),
    },
    {
      label: 'Equipment',
      value: equipment.length ? equipment.join(', ') : '—',
    },
  ];
  return (
    <>
      {card.name ? <TomoTitle>{card.name}</TomoTitle> : null}
      {card.description ? <TomoBody>{card.description}</TomoBody> : null}
      <Table rows={rows} />
      {instructions.length > 0 && (
        <FormSection label="Steps">
          {instructions.map((step, i) => (
            <Text
              key={`instr-${i}`}
              style={styles.listItem}
            >{`${i + 1}.  ${step}`}</Text>
          ))}
        </FormSection>
      )}
    </>
  );
}

function renderSchedulePreview(
  card: SchedulePreviewCard,
  onConfirm?: () => void,
) {
  const events = Array.isArray(card.events) ? card.events : [];
  const rows: TableRow[] = events.map((e) => ({
    label: `${e.date}  ·  ${e.startTime}–${e.endTime}`,
    value: e.title,
    tier: e.violations && e.violations.length ? 'alert' : undefined,
  }));
  const summary: MetricItem[] = [
    { value: String(card.summary?.total ?? events.length), label: 'Total' },
    {
      value: String(card.summary?.withViolations ?? 0),
      label: 'Clashes',
      tone: (card.summary?.withViolations ?? 0) > 0 ? 'alert' : 'default',
    },
    { value: String(card.summary?.blocked ?? 0), label: 'Blocked' },
  ];
  return (
    <>
      <MetricRow items={summary} />
      <Table rows={rows} />
      {onConfirm && (
        <CTA tone="primary" onPress={onConfirm}>
          Confirm schedule
        </CTA>
      )}
    </>
  );
}

function renderProgramRecommendation(
  card: ProgramRecommendationCard,
  onChipPress?: (message: string) => void,
) {
  return (
    <ProgramRecommendationList card={card} onChipPress={onChipPress} />
  );
}

function renderProgramDetail(card: ProgramDetailCard) {
  return <ProgramDetailChatCard card={card} />;
}

function renderInjuryCard(card: InjuryCard) {
  const rows: TableRow[] = [
    { label: 'Location', value: card.location },
    {
      label: 'Severity',
      value: card.severityLabel,
      tier: card.severity >= 2 ? 'alert' : 'ontrack',
    },
  ];
  if (card.autoAdjustedSession) {
    rows.push({
      label: "Today's session",
      value: 'Auto-adjusted',
      tier: 'elite',
    });
  }
  return (
    <>
      {card.recoveryTip ? <TomoBody>{card.recoveryTip}</TomoBody> : null}
      <Table rows={rows} />
    </>
  );
}

function renderGoalCard(card: GoalCard) {
  const items: MetricItem[] = [];
  if (typeof card.currentValue === 'number') {
    items.push({
      value: `${card.currentValue}${card.targetUnit ? ` ${card.targetUnit}` : ''}`,
      label: 'Current',
    });
  }
  if (typeof card.targetValue === 'number') {
    items.push({
      value: `${card.targetValue}${card.targetUnit ? ` ${card.targetUnit}` : ''}`,
      label: 'Target',
    });
  }
  items.push({
    value: `${Math.round(card.progressPct ?? 0)}%`,
    label: 'Progress',
    tone: card.trend === 'behind' ? 'alert' : 'default',
  });
  return (
    <>
      {card.title ? <TomoTitle>{card.title}</TomoTitle> : null}
      <MetricRow items={items} />
      {card.deadline ? (
        <TomoBody>Deadline: {card.deadline}</TomoBody>
      ) : null}
    </>
  );
}

function renderDailyBriefing(card: DailyBriefingCard) {
  const items: MetricItem[] = [
    {
      value: String(card.readinessScore ?? '—'),
      label: 'Readiness',
      tone: readinessTier(card.readinessColor) === 'alert' ? 'alert' : 'default',
    },
    { value: String(card.eventCount ?? 0), label: 'Events' },
    { value: String(card.trainingCount ?? 0), label: 'Training' },
  ];
  if (card.matchCount && card.matchCount > 0) {
    items.push({ value: String(card.matchCount), label: 'Matches' });
  }
  return (
    <>
      {card.briefingSummary ? (
        <TomoBody>{card.briefingSummary}</TomoBody>
      ) : null}
      <MetricRow items={items.slice(0, 4)} />
    </>
  );
}

// ─── dispatcher ──────────────────────────────────────────────────────

function RenderCard({
  card,
  onConfirm,
  onCancel,
  onChipPress,
  onCapsuleSubmit,
  onNavigate,
  skipHeadline,
}: {
  card: VisualCard;
  onConfirm?: () => void;
  onCancel?: () => void;
  onChipPress?: (action: string) => void;
  onCapsuleSubmit?: (action: CapsuleAction) => void;
  onNavigate?: (deepLink: {
    tabName: string;
    params?: Record<string, any>;
    screen?: string;
    highlight?: string;
    autoOpen?: string;
  }) => void;
  skipHeadline?: boolean;
}) {
  // Capsules keep their existing interactive renderers — restyled
  // internally in their own component files.
  if (isCapsuleCard(card.type)) {
    return (
      <CapsuleRenderer
        card={card as any}
        onSubmit={onCapsuleSubmit ?? (() => {})}
        onNavigate={onNavigate}
      />
    );
  }

  switch (card.type) {
    case 'stat_row':
      return renderStatRow(card as StatRow);
    case 'stat_grid':
      return renderStatGrid(card as StatGrid);
    case 'benchmark_bar':
      return renderBenchmarkBar(card as BenchmarkBar);
    case 'schedule_list':
      return renderScheduleList(card as ScheduleList);
    case 'week_schedule':
      return renderWeekSchedule(card as WeekSchedule);
    case 'week_plan':
      return renderWeekPlan(card as WeekPlan);
    case 'zone_stack':
      return renderZoneStack(card as ZoneStack);
    case 'clash_list':
      return renderClashList(card as ClashList);
    case 'text_card':
      return renderTextCard(card as TextCard, !!skipHeadline);
    case 'coach_note':
      return renderCoachNote(card as CoachNote);
    case 'confirm_card':
      return renderConfirmCard(card as ConfirmCard, onConfirm, onCancel);
    case 'choice_card':
      return renderChoiceCard(
        card as ChoiceCard,
        onChipPress,
        !!skipHeadline,
      );
    case 'session_plan':
      return renderSessionPlan(card as SessionPlan);
    case 'drill_card':
      return renderDrillCard(card as DrillCard);
    case 'schedule_preview':
      return renderSchedulePreview(card as SchedulePreviewCard, onConfirm);
    case 'program_recommendation':
      return renderProgramRecommendation(
        card as ProgramRecommendationCard,
        onChipPress,
      );
    case 'program_detail':
      return renderProgramDetail(card as ProgramDetailCard);
    case 'injury_card':
      return renderInjuryCard(card as InjuryCard);
    case 'goal_card':
      return renderGoalCard(card as GoalCard);
    case 'daily_briefing_card':
      return renderDailyBriefing(card as DailyBriefingCard);
    default: {
      // Unknown type — try body/headline fallback
      const any = card as any;
      if (any.headline || any.body) {
        return (
          <>
            {any.headline ? <TomoTitle>{any.headline}</TomoTitle> : null}
            {any.body ? <TomoBody>{any.body}</TomoBody> : null}
          </>
        );
      }
      return null;
    }
  }
}

// ─── ResponseRenderer ────────────────────────────────────────────────

interface ResponseRendererProps {
  response: TomoResponse;
  onChipPress?: (action: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onCapsuleSubmit?: (action: CapsuleAction) => void;
  onNavigate?: (deepLink: {
    tabName: string;
    params?: Record<string, any>;
    screen?: string;
    highlight?: string;
    autoOpen?: string;
  }) => void;
}

export function ResponseRenderer({
  response,
  onChipPress,
  onConfirm,
  onCancel,
  onCapsuleSubmit,
  onNavigate,
}: ResponseRendererProps) {
  const cards = Array.isArray(response.cards) ? response.cards : [];
  const chips = Array.isArray(response.chips) ? response.chips : [];

  // Self-contained cards render their own headline/body. Skip the
  // top-level title if the first non-capsule card IS self-contained
  // and matches.
  const hasSelfContained = cards.some((c) => SELF_CONTAINED_TYPES.has(c.type));

  const headlineNorm = stripForCompare(response.headline || '');
  const bodyNorm = stripForCompare(response.body || '');

  // Dedup: drop text_card / coach_note cards whose body or headline
  // is a near-duplicate of the response-level title/body, so the same
  // paragraph never renders twice.
  const filteredCards = cards.filter((card) => {
    if (card.type === 'text_card') {
      const tc = card as TextCard;
      const cardBody = stripForCompare(tc.body || '');
      const cardHeadline = stripForCompare(tc.headline || '');
      if (bodyNorm && cardBody && cardBody === bodyNorm) return false;
      if (headlineNorm && cardHeadline && cardHeadline === headlineNorm)
        return false;
    }
    if (card.type === 'coach_note') {
      const noteBody = stripForCompare((card as CoachNote).note || '');
      if (bodyNorm && noteBody && noteBody === bodyNorm) return false;
    }
    return true;
  });

  const showTopHeadline = !!response.headline && !hasSelfContained;
  const showTopBody =
    !!response.body &&
    response.body.trim() !== '' &&
    stripForCompare(response.body) !== headlineNorm &&
    !hasSelfContained;

  return (
    <View style={styles.container}>
      {showTopHeadline ? <TomoTitle>{response.headline}</TomoTitle> : null}
      {showTopBody ? <TomoBody>{response.body}</TomoBody> : null}

      {filteredCards.map((card, i) => (
        <CardErrorBoundary
          key={`${card.type}-${i}`}
          cardType={card?.type || 'unknown'}
        >
          <RenderCard
            card={card}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onChipPress={onChipPress}
            onCapsuleSubmit={onCapsuleSubmit}
            onNavigate={onNavigate}
            skipHeadline={showTopHeadline}
          />
        </CardErrorBoundary>
      ))}

      {chips.length > 0 && onChipPress ? (
        <Suggestions
          items={chips.map((c) => c.label).filter(Boolean)}
          onPick={(label) => {
            const chip = chips.find((c) => c.label === label);
            if (chip) onChipPress(chip.message || chip.action);
          }}
        />
      ) : null}
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    width: '100%',
  },
  errorWrap: {
    padding: 10,
    borderWidth: 1,
    borderColor: T.red10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    fontFamily: T.fontRegular,
    color: T.red,
  },
  source: {
    fontSize: 11,
    fontFamily: T.fontLight,
    color: T.cream55,
    marginTop: 2,
    marginBottom: 10,
  },
  listItem: {
    fontSize: 13,
    fontFamily: T.fontRegular,
    color: T.cream90,
    lineHeight: 20,
    paddingVertical: 4,
  },
});
