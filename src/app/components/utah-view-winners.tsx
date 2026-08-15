"use client";

// Utah View — one winners section (grant paths OR federal contract paths).
// Renders the top-ranked cards plus a full compact list behind "Show all".
// Comparison chips appear ONLY when they are computable from the stored
// report — a missing report means a plain, still-truthful feed.

import { useState } from "react";
import type { UtahWinner } from "../utah/data";
import { Badge, Button, type BadgeTone } from "./ui";
import { fmtUsdBig, humanize, norm, sameAgency, type UtahPersona } from "./utah-view-format";

interface Chip {
  label: string;
  tone: BadgeTone;
  title?: string;
}

/** Honest comparison chips. Each condition is fully computable from data we
 *  hold; anything we can't compute (team size at award, etc.) is simply
 *  never rendered. */
function chipsFor(w: UtahWinner, persona: UtahPersona | null): Chip[] {
  if (!persona) return [];
  const chips: Chip[] = [];
  // "Same program": the #1 match is an SBIR/STTR (or procurement) opportunity
  // and this winner won through the same agency on the same path kind.
  const kindPair =
    (w.kind === "grant" && persona.topKind === "sbir_sttr") ||
    (w.kind === "contract" && persona.topKind === "procurement");
  if (kindPair && persona.topAgency && w.agencies.some((a) => sameAgency(a, persona.topAgency))) {
    chips.push({
      label: "Same program as your #1 match",
      tone: "secondary",
      title: persona.topTitle ?? undefined,
    });
  }
  if (persona.city && w.city && norm(persona.city) === norm(w.city)) {
    chips.push({ label: "Same city as you", tone: "primary" });
  }
  return chips;
}

/** Rank for the founder: same-program first, then same-city, then documented
 *  total, then recency. Without a stored report this is just amount-first. */
function rankScore(w: UtahWinner, persona: UtahPersona | null): number {
  const c = chipsFor(w, persona);
  return (
    (c.some((x) => x.tone === "secondary") ? 4 : 0) + (c.some((x) => x.tone === "primary") ? 2 : 0)
  );
}

export function rankWinners(list: UtahWinner[], persona: UtahPersona | null): UtahWinner[] {
  return [...list].sort(
    (a, b) =>
      rankScore(b, persona) - rankScore(a, persona) ||
      (b.amountUsd ?? 0) - (a.amountUsd ?? 0) ||
      (b.year ?? 0) - (a.year ?? 0),
  );
}

function WinnerCard({ w, persona }: { w: UtahWinner; persona: UtahPersona | null }) {
  const chips = chipsFor(w, persona);
  const meta = [
    `${humanize(w.city ?? "Utah")}, UT`,
    humanize(w.program),
    w.year ? `FY${w.year}` : null,
    `${w.awards} documented ${w.kind === "grant" ? "award" : "contract"}${w.awards === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="or-card">
      <div className="mk-between" style={{ marginBottom: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: 0, font: "600 18px/26px var(--font-headline)", color: "var(--color-text-deep)" }}>
            {humanize(w.company)}
          </h4>
          <span className="mk-label">{meta}</span>
        </div>
        <span className="mk-num" style={{ fontSize: 20, color: "var(--color-secondary)", whiteSpace: "nowrap" }}>
          {fmtUsdBig(w.amountUsd)}
        </span>
      </div>
      {w.desc ? (
        <p style={{ margin: "0 0 12px", font: "400 14px/20px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
          {humanize(w.desc)}
          {w.desc.length >= 200 ? "…" : ""}
        </p>
      ) : null}
      <div className="mk-row" style={{ gap: 8 }}>
        {chips.map((c) => (
          <Badge key={c.label} tone={c.tone} title={c.title}>
            {c.label}
          </Badge>
        ))}
        {w.sourceUrl ? (
          <a
            href={w.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mk-label"
            style={{ marginLeft: "auto", color: "var(--color-primary)", textDecoration: "none" }}
          >
            Source ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function UtahViewWinners({
  title,
  intro,
  winners,
  persona,
  showAllLabel,
  initial = 3,
}: {
  title: string;
  intro: string;
  winners: UtahWinner[]; // pre-ranked (rankWinners)
  persona: UtahPersona | null;
  showAllLabel: string; // e.g. "Show all 442 Utah grant winners"
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Meeting feedback: the three content families get BIG, BOLD titles. */}
      <div>
        <h3 style={{ margin: 0, font: "800 26px/32px var(--font-headline)", color: "var(--color-text-deep)" }}>
          {title}
        </h3>
        <p style={{ margin: "4px 0 0", font: "400 14px/20px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
          {intro}
        </p>
      </div>
      {winners.slice(0, initial).map((w) => (
        <WinnerCard key={w.id} w={w} persona={persona} />
      ))}
      {expanded ? (
        <div className="or-card or-card--flush">
          <div className="mk-cardbody mk-stack">
            {winners.slice(initial).map((w) => (
              <div className="or-kv" key={w.id}>
                <span className="or-kv__label" style={{ minWidth: 0 }}>
                  <span style={{ color: "var(--color-text-deep)", fontWeight: 600 }}>{humanize(w.company)}</span>
                  {" · "}
                  {humanize(w.city ?? "Utah")}
                  {" · "}
                  {humanize(w.program)}
                  {w.year ? ` · FY${w.year}` : ""}
                </span>
                <span className="mk-row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  {chipsFor(w, persona).map((c) => (
                    <Badge key={c.label} tone={c.tone}>
                      {c.label}
                    </Badge>
                  ))}
                  <span className="mk-num">{fmtUsdBig(w.amountUsd)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {winners.length > initial ? (
        <Button variant="outline" block onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : showAllLabel}
        </Button>
      ) : null}
    </section>
  );
}
