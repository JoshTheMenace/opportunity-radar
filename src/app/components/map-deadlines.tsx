"use client";

// Right-rail Deadlines card: the visible matches' REAL close dates in date
// order on the kit timeline. Rolling programs list last, stated plainly —
// we never invent a date. The soonest dated deadline is "current" and gets
// an IN-N-DAYS danger chip only when it's a week or less out.

import type { Opportunity, RankedMatch } from "@/lib/types";
import { Timeline, type TimelineItem } from "./ui";
import { daysUntil, fmtDate, humanize, type UiReport } from "./shared";

/** Timeline rows stay one line; full titles ride on the card tooltip. */
function trim(s: string, max = 44): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function MapDeadlines({
  report,
  matches,
}: {
  report: UiReport;
  matches: RankedMatch[];
}) {
  const opps = report.opportunities ?? {};
  const resolved = matches
    .map((m) => opps[m.opportunityId])
    .filter((o): o is Opportunity => o != null);
  if (resolved.length === 0) return null;

  const dated = resolved
    .filter((o) => o.closeDate != null)
    .sort((a, b) => a.closeDate!.localeCompare(b.closeDate!));
  const rolling = resolved.filter((o) => o.closeDate == null);

  const items: TimelineItem[] = [
    ...dated.map((o, i): TimelineItem => {
      const d = daysUntil(o.closeDate);
      return {
        date: fmtDate(o.closeDate)!.toUpperCase(),
        title: trim(humanize(o.title)),
        state: i === 0 ? "current" : "todo",
        badge:
          i === 0 && d != null && d >= 0 && d <= 7
            ? d === 0
              ? "DUE TODAY"
              : `IN ${d} DAY${d === 1 ? "" : "S"}`
            : undefined,
      };
    }),
    ...rolling.map(
      (o): TimelineItem => ({
        date: "Rolling",
        title: trim(humanize(o.title)),
        detail: "No fixed close date — we won't invent one.",
      }),
    ),
  ];

  return (
    <div className="or-card or-card--flush">
      <div className="mk-cardhead">Deadlines</div>
      <div className="mk-cardbody">
        <Timeline items={items} />
      </div>
    </div>
  );
}
