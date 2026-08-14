# Notes from the integration agent

## Contract change wanted next iteration: MatchReport.evidence

`pipeline.ts` fetches `EvidenceBundle`s (USAspending / NIH / NSF historical
awards) for the top 5 ranked matches, but `MatchReport` (types.ts) has no
field to carry them, so today they surface only as SSE activity lines
("Evidence: 12 similar awards, $420K median award for <title>").

Proposed addition to types.ts:

```ts
export interface MatchReport {
  // ...existing fields...
  /** opportunityId -> historical-award evidence for top matches. */
  evidence?: Record<string, EvidenceBundle>;
}
```

(`EvidenceBundle` currently lives in `src/lib/engine/evidence.ts`; it would
move to or be re-exported from types.ts.) The UI could then render evidence
on match cards instead of the activity feed.

## Pipeline contract as implemented

```ts
export async function runAnalysis(
  founderText: string,
  prior: Partial<CompanyProfile> | null = null,
  emit: (e: AnalyzeEvent) => void = () => {},
): Promise<MatchReport>;
```

Satisfies both callers: `eval/run.ts` passes only `founderText`; the API
facade passes all three. It emits a final `report` event itself (harmless
duplicate — /api/analyze also emits one; the client keeps the last).
