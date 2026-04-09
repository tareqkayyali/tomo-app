"use client";

import { useState } from "react";

interface PageGuideProps {
  summary: string;
  details: string[];
  examples?: string[];
}

/**
 * Expandable educational guide for CMS admin pages.
 * Shows a short summary always visible, with a "Learn more" toggle
 * that reveals detailed guidance and examples.
 */
export function PageGuide({ summary, details, examples }: PageGuideProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-5 py-4">
      <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
      {(details.length > 0 || (examples && examples.length > 0)) && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer"
          >
            {expanded ? "Show less" : "Learn more"}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              {details.length > 0 && (
                <ul className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">
                  {details.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-primary/50" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
              {examples && examples.length > 0 && (
                <div className="rounded-md bg-muted/60 px-4 py-3">
                  <p className="text-xs font-medium text-foreground mb-2">Examples</p>
                  <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                    {examples.map((ex, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 text-primary/70">-</span>
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
