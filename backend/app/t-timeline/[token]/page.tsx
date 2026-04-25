/**
 * Public Timeline export — /t-timeline/<token>
 *
 * Anonymous, token-bound view of an athlete's calendar grid for a fixed
 * date range and event-type set. Resolved via service-role admin client
 * (mirrors /t/<slug> for the CV). Used as the source page Browserless
 * loads when generating the PDF.
 *
 * Query params:
 *   ?print=1   — print-friendly layout (used by the PDF renderer)
 *   ?tz=...    — IANA timezone for "today" highlighting (default UTC)
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveTimelineToken, recordTimelineView } from "@/lib/timelineToken";
import { assembleTimelineGrid } from "@/services/timeline/timelineExport";
import { TimelineGridDocument } from "./TimelineGridDocument";
import "./timeline-print.css";

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  const t = await resolveTimelineToken(token);
  if (!t) {
    return {
      title: "Timeline — Tomo",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `Timeline ${t.from_date} → ${t.to_date} — Tomo`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ print?: string; tz?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const printMode = sp.print === "1";
  const tz = sp.tz || "UTC";

  const resolved = await resolveTimelineToken(token);
  if (!resolved) notFound();

  const doc = await assembleTimelineGrid({
    userId: resolved.user_id,
    fromDate: resolved.from_date,
    toDate: resolved.to_date,
    eventTypes: resolved.event_types,
    tz,
  });

  if (!printMode) {
    recordTimelineView(token).catch(() => {});
  }

  return <TimelineGridDocument doc={doc} printMode={printMode} />;
}
