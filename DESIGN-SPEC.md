# Opportunity Radar — "Catalyst" design system (2026-08 redesign)

The paper-ledger dark theme is RETIRED. New direction: light, institutional,
gov-tech SaaS (reference: Federal Catalyst). Trust, clarity, progress.
Reference mockup: `public/design-mocks/final.html` (open it — it is the law).

## Tokens (defined in globals.css @theme — USE THESE, never raw hex)

Surfaces:   bg `#F3F6FB` page · card `#FFFFFF` · hairline `#E3E9F2` borders
Text:       ink `#14213A` headings/body · muted `#5A6B85` · faint `#8DA0BC`
Brand:      brand `#1D4F91` (primary buttons, active nav, key numbers)
            brand-strong `#163C6E` hover · accent `#2E6FDB` links/live
            soft `#E8F0FC` tinted fills
Status:     good `#1B7F4D` / good-soft `#E4F4EA`   (pass, money, strong fit)
            warn `#B07C10` / warn-soft `#FCF3E1`   (verify-eligibility tier)
            risk `#C03A2B` / risk-soft `#FBEAE7`   (deadlines, fails, alerts)
Legacy aliases still compile (paper→ink, brass→brand, treasury→good,
signal→risk, panel→card, panel-2→bg) but MIGRATE every class you touch.

## Type

- Sans: Inter (`font-sans`, and `font-display` now also = Inter). Headings:
  font-semibold/bold, tracking-tight. Body 15px default.
- Mono: IBM Plex Mono (`font-mono`) — ONLY for: tiny uppercase labels, data
  values (dates, dollars, counts), nav links, buttons, badges. NEVER paragraphs.
- Kill every `font-display` serif assumption — no serifs anywhere.

## Core patterns (copy these Tailwind recipes)

- Card:        `rounded-2xl border border-hairline bg-card p-5 shadow-card`
               (`shadow-card` utility is defined in globals.css)
- Section/label: `font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint`
- Primary btn: `rounded-full bg-brand px-5 py-2.5 font-mono text-[12.5px] font-semibold text-white hover:bg-brand-strong` (rounded-xl ok for large CTAs)
- Secondary:   `rounded-xl border border-hairline bg-card px-4 py-2 font-mono text-[12.5px] font-semibold text-brand hover:bg-soft`
- Soft btn (answer chips): `rounded-xl bg-soft text-brand font-mono text-[12.5px] font-semibold hover:bg-brand hover:text-white`
- Tier chip:   strong fit `rounded-full bg-good-soft px-3 py-1 font-mono text-[11px] font-semibold text-good`; verify → warn/warn-soft; deadline `bg-risk-soft text-risk`
- Score tile:  56px `rounded-[14px] bg-good-soft text-good font-mono font-semibold text-lg grid place-items-center` + 3px progress bar underneath (`bg-hairline` track, `bg-good` fill at score%)
- Facts row (match cards): flex row, each fact = big value (`text-[15.5px] font-bold text-ink`) over small-caps mono label; divided from body by `border-t border-hairline pt-3.5 mt-3.5`
- Question card: `rounded-xl border border-hairline border-l-[3px] border-l-accent bg-[#FBFCFE] p-3.5`; unlock line `font-mono text-[11px] text-good`
- Dossier rows: `flex justify-between border-b border-dashed border-hairline py-1.5 text-[13.5px]`; key `text-muted`, value `font-mono text-[12.5px] text-ink`, unknown `text-faint`
- Alert (risk): `rounded-2xl border border-[#F2C4BC] bg-risk-soft p-4`; title mono risk; body `text-[13px] text-[#7A3A31]`
- Timeline row: mono date (`text-[11px] font-semibold text-brand w-[50px]`) + sans text
- Stepper (pipeline/pursuit stages): 30px dots — done `bg-brand text-white`,
  current `border-2 border-brand text-brand ring-4 ring-soft`, todo
  `border border-hairline text-faint`; 3px connector bars (`bg-brand` when done).
- Inputs: `rounded-xl border border-hairline bg-[#FBFCFE] p-3.5 text-ink placeholder:text-faint focus:border-brand`

## Rules

1. One blue. good/warn/risk only mean status. NOTHING decorative.
2. Red appears ONLY for deadlines/alerts/failures — keep it rare so it stays loud.
3. Uppercase mono = labels ≤ 12px only. Values keep normal case (except chips).
4. Hierarchy: each region gets ONE big number or ONE heading, everything else
   supports it. If two things shout, demote one.
5. Backgrounds are bg/card/soft ONLY (plus *-soft status tints). No gradients
   except the tiny agent orb (`radial-gradient(circle at 32% 28%, #4C86E8, #1D4F91)`).
6. Keep every existing behavior, prop, handler, and data flow — this is a
   reskin, not a refactor. Do not rename exports or change component APIs.
7. Keep `card-in` / `card-spotlight` animation hooks (they're retuned in
   globals.css). RadarScope: recolor to brand/accent on light bg.
8. Dark mode: none. The app is light-only now.
