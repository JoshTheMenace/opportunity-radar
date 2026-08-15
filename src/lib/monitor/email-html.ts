// HTML notification emails — the site's Federal Catalyst theme translated
// to email-safe markup: 600px table layout, everything inline-styled,
// precomputed hex only (no CSS vars, no rgba, no webfonts — Gmail strips
// <style> and Outlook ignores half of CSS). The plain-text body stays the
// source of truth for the DB + .eml outbox; this is a presentation layer.

import type { Opportunity, RankedMatch } from "../types";
import { formatUsdCompact } from "../engine/meter";
import type { CompanyRecord } from "./db";

export type EmailKind = "match" | "unlock";

// Palette = catalyst-kit tokens flattened onto white (hairline is the kit's
// rgba(3,105,161,.12) precomposited).
const C = {
  page: "#f7f9fb",
  card: "#ffffff",
  hairline: "#e1edf4",
  ink: "#0f172a",
  muted: "#40474f",
  faint: "#707881",
  brand: "#00507d",
  accent: "#0369a1",
  soft: "#eef5fb",
  good: "#006c4a",
  risk: "#ba1a1a",
  riskSoft: "#ffdad6",
  warn: "#92400e",
  warnSoft: "#faf3e8",
};
const SANS = "'Hanken Grotesk',Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const label = (text: string, color = C.faint) =>
  `<p style="margin:0 0 6px;font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${color};">${esc(text)}</p>`;

/** Section: mono kicker label + body copy. */
const section = (title: string, body: string, extra = "") =>
  `<tr><td style="padding:22px 0 0;">${label(title)}<p style="margin:0;font-family:${SANS};font-size:14.5px;line-height:1.65;color:${C.ink};${extra}">${esc(body)}</p></td></tr>`;

function awardRangeText(opp: Opportunity): string {
  if (opp.awardFloorUsd && opp.awardCeilingUsd)
    return `${formatUsdCompact(opp.awardFloorUsd)}–${formatUsdCompact(opp.awardCeilingUsd)}`;
  if (opp.awardCeilingUsd) return `up to ${formatUsdCompact(opp.awardCeilingUsd)}`;
  if (opp.estimatedTotalUsd) return `${formatUsdCompact(opp.estimatedTotalUsd)} total`;
  return "varies";
}

function statCell(lab: string, value: string, color: string, sub?: string): string {
  return `<td valign="top" style="padding:14px 16px 14px 0;">
    ${label(lab)}
    <p style="margin:0;font-family:${MONO};font-size:17px;font-weight:600;color:${color};">${esc(value)}</p>
    ${sub ? `<p style="margin:3px 0 0;font-family:${SANS};font-size:12px;color:${C.faint};">${esc(sub)}</p>` : ""}
  </td>`;
}

export function renderMatchEmailHtml(
  company: CompanyRecord,
  opp: Opportunity,
  match: RankedMatch,
  kind: EmailKind = "match",
): string {
  const days = opp.closeDate
    ? Math.ceil((Date.parse(opp.closeDate) - Date.now()) / 86400000)
    : null;
  const closeSoon = days != null && days >= 0 && days <= 30;
  const kicker = kind === "unlock" ? "You grew into this" : "New funding match";
  const intro =
    kind === "unlock"
      ? "A program that previously blocked you now clears every eligibility gate for your updated profile:"
      : "Opportunity Radar found a new government funding opportunity that matches your profile:";
  const odds =
    opp.expectedAwards && opp.expectedApplications
      ? `1-in-${Math.max(1, Math.round(opp.expectedApplications / opp.expectedAwards))}`
      : null;

  const stats = [
    statCell("Award range", awardRangeText(opp), C.good),
    statCell(
      "Closes",
      opp.closeDate ?? "Rolling",
      closeSoon ? C.risk : C.ink,
      closeSoon ? `${days} days left` : undefined,
    ),
    ...(odds ? [statCell("Approx. odds", odds, C.ink, `~${opp.expectedAwards} awards expected`)] : []),
  ].join("");

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:36px 16px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

  <!-- masthead -->
  <tr><td style="padding:0 6px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SANS};font-size:17px;font-weight:800;letter-spacing:-0.2px;color:${C.ink};">Opportunity<span style="color:${C.brand};">Radar</span></td>
      <td align="right">${label("Monitoring active", C.accent)}</td>
    </tr></table>
  </td></tr>

  <!-- card -->
  <tr><td style="background:${C.card};border:1px solid ${C.hairline};border-radius:18px;padding:34px 34px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

      <tr><td>
        <span style="display:inline-block;background:${C.soft};color:${C.brand};border-radius:999px;padding:6px 14px;font-family:${MONO};font-size:10.5px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;">${esc(kicker)}</span>
      </td></tr>

      <tr><td style="padding:18px 0 0;">
        <p style="margin:0 0 10px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.muted};">Hi ${esc(company.name)} team — ${esc(intro)}</p>
        <h1 style="margin:0;font-family:${SANS};font-size:23px;line-height:1.3;font-weight:800;letter-spacing:-0.3px;color:${C.ink};">${esc(opp.title)}</h1>
        <p style="margin:8px 0 0;font-family:${MONO};font-size:11px;font-weight:500;letter-spacing:0.8px;text-transform:uppercase;color:${C.faint};">${esc(opp.agency)}</p>
      </td></tr>

      <!-- stat strip -->
      <tr><td style="padding:20px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.hairline};border-bottom:1px solid ${C.hairline};"><tr>${stats}</tr></table>
      </td></tr>

      <!-- why fit: accent-left panel, mirrors the site's question cards -->
      <tr><td style="padding:22px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:${C.soft};border-left:3px solid ${C.accent};border-radius:0 12px 12px 0;padding:16px 18px;">
            ${label("Why this looks like a fit", C.brand)}
            <p style="margin:0;font-family:${SANS};font-size:14.5px;line-height:1.65;color:${C.ink};">${esc(match.whyFit)}</p>
          </td>
        </tr></table>
      </td></tr>

      ${
        match.whatCouldDisqualify
          ? `<tr><td style="padding:14px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:${C.warnSoft};border-left:3px solid ${C.warn};border-radius:0 12px 12px 0;padding:16px 18px;">
            ${label("Worth checking first", C.warn)}
            <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.65;color:${C.ink};">${esc(match.whatCouldDisqualify)}</p>
          </td>
        </tr></table>
      </td></tr>`
          : ""
      }

      ${section("Next steps", match.nextSteps)}

      ${
        opp.url
          ? `<tr><td style="padding:26px 0 4px;">
        <a href="${esc(opp.url)}" style="display:inline-block;background:${C.brand};color:#ffffff;text-decoration:none;border-radius:12px;padding:13px 26px;font-family:${SANS};font-size:14.5px;font-weight:600;">Review the official notice&nbsp;&nbsp;&#8594;</a>
      </td></tr>`
          : ""
      }
    </table>
  </td></tr>

  <!-- footer -->
  <tr><td style="padding:20px 10px 0;">
    <p style="margin:0 0 4px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.faint};">Sources: Grants.gov &middot; SAM.gov Assistance Listings &middot; USAspending &middot; Utah state programs</p>
    <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.faint};">You're receiving this because you saved your company profile for monitoring. Reply STOP to unsubscribe.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
