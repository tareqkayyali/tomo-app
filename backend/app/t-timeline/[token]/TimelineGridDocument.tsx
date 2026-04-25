/**
 * Server component — renders one or more A4 month pages of an athlete's
 * Timeline as a Sun-Sat calendar grid. Each cell shows date number + a
 * stack of one-liner events ("7:00 AM · Squat"). One month per page; uses
 * `page-break-before: always` so multi-month exports paginate cleanly.
 *
 * Layout follows the school-calendar reference: 7-column grid, hairline
 * dividers, weekday headers, month label centered above the grid.
 */

import * as React from "react";
import type { TimelineGridDoc } from "@/services/timeline/timelineExport";

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const TYPE_DOT_CLASS: Record<string, string> = {
  training: "tg-dot--training",
  match: "tg-dot--match",
  recovery: "tg-dot--recovery",
  study_block: "tg-dot--study",
  exam: "tg-dot--exam",
  other: "tg-dot--other",
};

export function TimelineGridDocument({
  doc,
  printMode,
}: {
  doc: TimelineGridDoc;
  printMode: boolean;
}) {
  return (
    <div className={printMode ? "tg-root tg-root--print" : "tg-root"}>
      {doc.months.map((month) => (
        <section className="tg-page" key={`${month.year}-${month.month}`}>
          <header className="tg-header">
            <div className="tg-header__title">{month.label}</div>
            <div className="tg-header__meta">
              {doc.athlete.name}
              {doc.athlete.sport ? ` · ${capitalize(doc.athlete.sport)}` : ""}
            </div>
          </header>

          <div className="tg-weekdays">
            {WEEKDAY_LABELS.map((w) => (
              <div className="tg-weekday" key={w}>
                {w}
              </div>
            ))}
          </div>

          <div className="tg-grid">
            {month.weeks.map((week, wi) => (
              <div className="tg-week" key={`${month.year}-${month.month}-w${wi}`}>
                {week.map((cell, ci) => (
                  <div
                    key={`c${ci}`}
                    className={[
                      "tg-cell",
                      cell.in_range ? "" : "tg-cell--blank",
                      cell.is_weekend ? "tg-cell--weekend" : "",
                      cell.is_today ? "tg-cell--today" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {cell.in_range && (
                      <>
                        <div className="tg-cell__day">{cell.day_num}</div>
                        <ul className="tg-cell__events">
                          {cell.events.map((ev, ei) => (
                            <li
                              className="tg-event"
                              key={ei}
                              title={`${ev.time_local}${ev.time_local ? " · " : ""}${ev.title}`}
                            >
                              <span
                                className={`tg-dot ${TYPE_DOT_CLASS[ev.type] ?? "tg-dot--other"}`}
                                aria-hidden
                              />
                              <span className="tg-event__text">
                                {ev.time_local && (
                                  <span className="tg-event__time">{ev.time_local}</span>
                                )}
                                {ev.time_local && <span className="tg-event__sep"> · </span>}
                                <span className="tg-event__title">{ev.title}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <footer className="tg-footer">
            <span>Tomo · {doc.range.from} → {doc.range.to}</span>
          </footer>
        </section>
      ))}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
