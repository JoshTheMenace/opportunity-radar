"use client";

// Utah View — the PEOPLE content family: public navigators (Nucleus Grow
// first — Utah's official SBIR/STTR resource partner) plus the UTIF
// microgrant route. Everything shown is a public route; the disclaimer is
// rendered prominently because the meeting asked for it verbatim.

import { useState } from "react";
import type { UtahNavigatorRow, UtahViewData } from "../utah/data";
import { AlertCard, Badge, Button } from "./ui";
import { fmtUsdFull, humanize } from "./utah-view-format";

function NavigatorCard({ n }: { n: UtahNavigatorRow }) {
  return (
    <div className="or-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="mk-label" style={{ textTransform: "uppercase" }}>
        {n.kind === "person" ? "Utah navigator" : humanize(n.kind)}
      </span>
      <div>
        <h4 style={{ margin: 0, font: "600 17px/24px var(--font-headline)", color: "var(--color-text-deep)" }}>
          {humanize(n.name)}
        </h4>
        <span className="mk-label">
          {[n.title, n.organization].filter(Boolean).map((s) => humanize(String(s))).join(" · ")}
        </span>
      </div>
      {n.summary ? (
        <p style={{ margin: 0, font: "400 13px/19px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
          {n.summary}
        </p>
      ) : null}
      {n.topics.length > 0 ? (
        <div className="mk-row" style={{ gap: 6 }}>
          {n.topics.slice(0, 3).map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </div>
      ) : null}
      <div
        className="mk-row"
        style={{ gap: 12, marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--color-border-ice)" }}
      >
        {n.email ? (
          <a className="mk-label" style={{ color: "var(--color-primary)", textDecoration: "none" }} href={`mailto:${n.email}`}>
            Email ↗
          </a>
        ) : null}
        {n.url ? (
          <a className="mk-label" style={{ color: "var(--color-primary)", textDecoration: "none" }} href={n.url} target="_blank" rel="noreferrer">
            Website ↗
          </a>
        ) : null}
        {n.sourceUrl ? (
          <a className="mk-label" style={{ color: "var(--color-primary)", textDecoration: "none" }} href={n.sourceUrl} target="_blank" rel="noreferrer">
            Source ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** UTIF microgrant — its own small card. Dollar range comes from the real
 *  DB row (utah:utif-sbir-microgrant); the route copy is the verified
 *  Nucleus Grow guidance carried over from the previous /people page. */
function UtifCard({ utif }: { utif: NonNullable<UtahViewData["utif"]> }) {
  return (
    <div className="or-card mk-ask" style={{ gridColumn: "1 / -1" }}>
      <span className="mk-label" style={{ textTransform: "uppercase" }}>
        Utah SBIR first-timer support
      </span>
      <h4 style={{ margin: "6px 0 8px", font: "600 19px/26px var(--font-headline)", color: "var(--color-text-deep)" }}>
        UTIF (Utah Technology Innovation Funding) microgrant:{" "}
        <span className="mk-num">
          {fmtUsdFull(utif.floorUsd)}–{fmtUsdFull(utif.ceilingUsd)}
        </span>{" "}
        toward your first Phase I proposal
      </h4>
      <p style={{ margin: "0 0 12px", font: "400 14px/20px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
        Eligible Utah small businesses can use UTIF money for first-time SBIR/STTR Phase I proposal
        preparation — topic matching, proposal review and editing, registrations, budgeting, and
        final-submission support through Nucleus Grow. Before applying: choose a specific Phase I
        solicitation and contact Nucleus Grow for required pre-approval, at least four weeks before
        the related federal deadline.
      </p>
      <div className="mk-row">
        <a className="or-btn or-btn--filled" href="mailto:grow@nucleusutah.org">
          Contact Nucleus Grow
        </a>
        {utif.url ? (
          <a className="or-btn or-btn--outline" href={utif.url} target="_blank" rel="noreferrer">
            UTIF details ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function UtahViewPeople({
  navigators,
  utif,
  initial = 6,
}: {
  navigators: UtahNavigatorRow[];
  utif: UtahViewData["utif"];
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? navigators : navigators.slice(0, initial);
  return (
    <section style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Meeting feedback: the three content families get BIG, BOLD titles. */}
      <div>
        <h3 style={{ margin: 0, font: "800 26px/32px var(--font-headline)", color: "var(--color-text-deep)" }}>
          People
        </h3>
        <p style={{ margin: "4px 0 0", font: "400 14px/20px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
          Public Utah navigators and support programs. Nucleus Grow leads because it is Utah&apos;s
          official SBIR/STTR (Small Business Innovation Research / Small Business Technology
          Transfer) resource partner.
        </p>
      </div>
      <AlertCard tone="info" title="These are public routes — no introduction or commitment is implied.">
        Every contact below is published by the organization itself. Reaching out is on you; nothing
        here promises a reply, an endorsement, or funding.
      </AlertCard>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
        {shown.map((n) => (
          <NavigatorCard key={n.id} n={n} />
        ))}
        {utif ? <UtifCard utif={utif} /> : null}
      </div>
      {navigators.length > initial ? (
        <Button variant="outline" block onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${navigators.length} Utah navigators`}
        </Button>
      ) : null}
    </section>
  );
}
