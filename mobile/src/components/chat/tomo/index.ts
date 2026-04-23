/**
 * Tomo AI Chat — design primitives
 *
 * Ported from `tomo-ai-chat.jsx`. A chat turn has this shape:
 *
 *   <UserBubble>       — right-aligned receipt
 *   <TomoTitle>        — bold diagnostic sentence
 *   <TomoBody>         — one paragraph of reasoning
 *   ONE of:
 *     <MetricRow>      — 2–4 numeric readouts
 *     <Table>          — >4 label · value · tier rows
 *     <Suggestions>    — dotted-underline follow-ups
 *     <FormSection/RadioRow/NumberChipRow/PillChipRow/CTA>
 *
 * Between completed turns: <TurnMark/>. A full turn fits ~560px.
 */

export { T, TIER_LABEL, tierColor } from './tokens';
export type { TierKind } from './tokens';

export { UserBubble } from './UserBubble';
export { TomoTitle } from './TomoTitle';
export { TomoBody } from './TomoBody';
export { TurnMark } from './TurnMark';

export { MetricRow } from './MetricRow';
export type { MetricItem } from './MetricRow';

export { Table } from './Table';
export type { TableRow } from './Table';

export { Suggestions } from './Suggestions';

export { FormSection } from './FormSection';
export { RadioRow } from './RadioRow';
export { NumberChipRow } from './NumberChipRow';
export { PillChipRow } from './PillChipRow';
export { CTA } from './CTA';

export { Composer } from './Composer';
