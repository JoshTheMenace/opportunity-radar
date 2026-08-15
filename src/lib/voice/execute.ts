// ============================================================
// Voice mode (Gemini Live) — server-side tool execution.
// Bridges Live API function calls onto the SAME engine the text
// agent uses (engine-facade/pipeline). Stateless: the client
// sends its current profile with each call. Server-only.
// ============================================================

import type { CompanyProfile, GateField, MatchReport, Opportunity } from "@/lib/types";
import { applyAnswer, deriveFields } from "@/lib/engine/profile";
import { ALL_GATE_FIELDS } from "@/lib/engine/meter";
import { profileReadiness } from "@/lib/engine/readiness";
import { refineReport } from "@/lib/engine/refine";
import { getOpportunityById } from "@/lib/engine/retrieve";
import { getUtahContext } from "@/lib/engine/utah-intelligence";
import { getDb, rowToOpportunity } from "@/lib/db";
import { runAnalysis, withOpportunities, type UiMatchReport } from "@/app/api/engine-facade";

/** "$500K", "2m", "250,000" -> USD number, or null. */
function parseMoney(s: string): number | null {
  const m = s.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return parseFloat(m[1]) * mult;
}

export interface VoiceToolResult {
  /** Compact JSON handed back to the voice model (keep it small — it's spoken context). */
  result: unknown;
  /** Full report for the UI when the tool ran the pipeline. */
  report?: UiMatchReport;
}

export async function executeVoiceTool(
  name: string,
  args: Record<string, unknown>,
  profile: CompanyProfile | null,
  priorReport: MatchReport | null = null,
): Promise<VoiceToolResult> {
  switch (name) {
    case "analyze_company": {
      const description = String(args.description ?? "").trim();
      if (!description) return { result: { error: "description is required" } };
      const report = await runAnalysis(description, null, () => {});
      return { result: compactReport(report), report };
    }
    case "answer_question": {
      if (!profile?.description)
        return { result: { error: "No company profile yet — call analyze_company first." } };
      const rawField = String(args.field ?? "");
      let updated: CompanyProfile;
      if (rawField === "capitalNeed") {
        const usd = parseMoney(String(args.answer ?? ""));
        if (usd == null)
          return { result: { error: "couldn't parse the amount — answer like '500k' or '2m'" } };
        updated = deriveFields({ ...profile, capitalNeedUsd: { min: usd, max: profile.capitalNeedUsd.max } });
      } else {
        const field = rawField as GateField;
        if (!ALL_GATE_FIELDS.includes(field))
          return {
            result: { error: `field must be capitalNeed or one of: ${ALL_GATE_FIELDS.join(", ")}` },
          };
        updated = applyAnswer(profile, field, String(args.answer ?? ""));
      }
      // Incremental fast path: re-gate + subtract, reusing prior LLM scores.
      const report =
        priorReport != null && Array.isArray(priorReport.matches)
          ? withOpportunities(refineReport(priorReport, updated))
          : await runAnalysis(updated.description, updated, () => {});
      return { result: compactReport(report), report };
    }
    case "search_opportunities": {
      const words = String(args.query ?? "")
        .replace(/[^A-Za-z0-9\s]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (words.length === 0) return { result: { error: "query is required" } };
      const limit = Math.min(Math.max(1, Number(args.limit) || 8), 20);
      const rows = getDb()
        .prepare(
          `SELECT o.* FROM opportunities_fts
           JOIN opportunities o ON o.rowid = opportunities_fts.rowid
           WHERE opportunities_fts MATCH ?
           ORDER BY bm25(opportunities_fts) LIMIT ?`,
        )
        .all(words.map((w) => `"${w}"`).join(" OR "), limit) as Record<string, unknown>[];
      return { result: rows.map((r) => compactOpp(rowToOpportunity(r))) };
    }
    case "ask_with_widget": {
      // Browser-only affordance: the voice panel intercepts this client-side
      // and renders the widget. Reaching here means text mode / eval driver —
      // acknowledge as a no-op so the conversation proceeds normally.
      return {
        result: {
          status: "no_screen",
          note: "Text mode — no widget shown. Just ask the question conversationally.",
        },
      };
    }
    case "get_opportunity": {
      const opp = getOpportunityById(String(args.id ?? ""));
      if (!opp) return { result: { error: "no opportunity with that id" } };
      return {
        result: {
          ...compactOpp(opp),
          description: opp.description.slice(0, 1200),
          eligibilityText: opp.eligibilityText?.slice(0, 600) ?? null,
          awardFloorUsd: opp.awardFloorUsd,
          expectedAwards: opp.expectedAwards,
          openDate: opp.openDate,
          url: opp.url,
          contactName: opp.contactName,
          contactEmail: opp.contactEmail,
        },
      };
    }
    case "get_utah_funding_connections": {
      if (!profile) return { result: { error: "Analyze the company first so Utah connections can be matched to its funding path." } };
      const context = getUtahContext(profile);
      return {
        result: {
          note: "These are public routing options and documented precedents, not endorsements or promised introductions.",
          utif: {
            amount: "$3,000-$5,000",
            purpose: "First-time SBIR/STTR Phase I proposal preparation for eligible Utah small businesses.",
            supportRoute: "Nucleus Grow — grow@nucleusutah.org",
            requirement: "Use a specific Phase I solicitation and seek Nucleus Grow pre-approval before applying; apply at least four weeks before the federal deadline.",
            url: "https://www.nucleusutah.org/utif",
          },
          navigators: context.navigators.map((item) => ({
            name: item.name,
            organization: item.organization,
            title: item.title,
            summary: item.summary,
            email: item.publicContact?.email ?? null,
            sourceUrl: item.sourceUrl,
          })),
          grantPrecedents: context.grantPrecedents.map((item) => ({ company: item.company, city: item.city, summary: item.summary, sourceUrl: item.sourceUrl })),
          contractPrecedents: context.contractPrecedents.map((item) => ({ company: item.company, city: item.city, summary: item.summary, sourceUrl: item.sourceUrl })),
        },
      };
    }
    default:
      return { result: { error: `unknown tool: ${name}` } };
  }
}

function compactOpp(o: Opportunity) {
  return {
    id: o.id,
    title: o.title,
    agency: o.agency,
    kind: o.kind,
    awardCeilingUsd: o.awardCeilingUsd,
    closeDate: o.closeDate,
    status: o.status,
    summary: o.description.slice(0, 200),
  };
}

/** Trim a full report to what the voice model needs to talk about it. */
function compactReport(r: UiMatchReport) {
  const readiness = profileReadiness(r.profile);
  return {
    // Ranking only runs once the required basics are known; until then
    // matches is empty ON PURPOSE — gather stillNeeded, then re-analyze.
    readiness: {
      ready: readiness.ready,
      stillNeeded: readiness.missing.map((m) => ({
        // capitalNeed is askable via answer_question(field:"capitalNeed").
        field: m.key === "size" ? "employees" : m.key,
        ask: m.question,
      })),
    },
    honestNo: r.honestNo,
    honestNoExplanation: r.honestNoExplanation,
    totalMatches: r.matches.length,
    meter: {
      unlockedUsd: r.meter.unlockedUsd,
      potentialUsd: r.meter.potentialUsd,
      eligibleCount: r.meter.unlockedCount,
    },
    matches: r.matches.slice(0, 8).map((m) => {
      const o = r.opportunities[m.opportunityId];
      return {
        id: m.opportunityId,
        title: o?.title ?? m.opportunityId,
        agency: o?.agency ?? null,
        tier: m.tier,
        score: m.score,
        awardCeilingUsd: o?.awardCeilingUsd ?? null,
        closeDate: o?.closeDate ?? null,
        whyFit: m.whyFit,
        nextSteps: m.nextSteps,
      };
    }),
    questionsToAsk: r.questions.map((q) => ({
      field: q.field,
      question: q.question,
      whyAsking: q.whyAsking,
      answerType: q.answerType,
      choices: q.choices,
    })),
    rejectedCount: r.rejected.length,
  };
}
