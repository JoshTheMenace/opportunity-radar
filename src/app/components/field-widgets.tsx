"use client";

// Adaptive answer widgets: for each askable profile field, the control that
// makes answering fastest — a tap on a map beats typing "UT". Used by the
// text interview panel AND pushed on screen by the voice agent
// (ask_with_widget). Hosts decide how a pick is submitted; widgets only
// report {field, value, sayAs}.

import { useState } from "react";

export interface WidgetAnswer {
  field: string;
  /** Machine value, in the shape answer_question/applyAnswer expects. */
  value: string | number | boolean;
  /** Human phrasing, for transcripts and voice acknowledgment. */
  sayAs: string;
}

interface WidgetProps {
  field: string;
  disabled?: boolean;
  onPick: (ans: WidgetAnswer) => void;
}

/** Fields with a purpose-built control (booleans render big Yes/No). */
const RICH_FIELDS = new Set([
  "location",
  "capitalNeed",
  "employees",
  "productMaturity",
  "annualRevenueUsd",
]);
const BOOL_FIELDS = new Set([
  "majorityUsOwned",
  "hasActiveRnD",
  "isForProfit",
  "isSmallBusiness",
  "samRegistered",
]);

export function hasRichWidget(field: string): boolean {
  return RICH_FIELDS.has(field);
}

export default function FieldWidget({ field, disabled, onPick }: WidgetProps) {
  if (field === "location") return <UsStateMap disabled={disabled} onPick={onPick} />;
  if (field === "capitalNeed")
    return (
      <AmountPicker
        field="capitalNeed"
        disabled={disabled}
        onPick={onPick}
        presets={[
          ["$100K", "100k"],
          ["$250K", "250k"],
          ["$500K", "500k"],
          ["$1M", "1m"],
          ["$2M", "2m"],
          ["$5M+", "5m"],
        ]}
      />
    );
  if (field === "annualRevenueUsd")
    return (
      <AmountPicker
        field="annualRevenueUsd"
        disabled={disabled}
        onPick={onPick}
        presets={[
          ["Pre-revenue", "0"],
          ["<$100K", "50k"],
          ["$100K–$1M", "500k"],
          ["$1M–$5M", "2.5m"],
          ["$5M+", "7.5m"],
        ]}
      />
    );
  if (field === "employees") return <TeamSizePicker disabled={disabled} onPick={onPick} />;
  if (field === "productMaturity") return <MaturityStepper disabled={disabled} onPick={onPick} />;
  if (BOOL_FIELDS.has(field)) return <BigYesNo field={field} disabled={disabled} onPick={onPick} />;
  return null;
}

// ---------- US tile map (classic square-grid cartogram) ----------

const STATE_TILES: [string, number, number][] = [
  ["AK", 0, 0], ["ME", 11, 0],
  ["VT", 10, 1], ["NH", 11, 1],
  ["WA", 1, 2], ["ID", 2, 2], ["MT", 3, 2], ["ND", 4, 2], ["MN", 5, 2],
  ["WI", 6, 2], ["MI", 8, 2], ["NY", 9, 2], ["MA", 10, 2], ["RI", 11, 2],
  ["OR", 1, 3], ["NV", 2, 3], ["WY", 3, 3], ["SD", 4, 3], ["IA", 5, 3],
  ["IL", 6, 3], ["IN", 7, 3], ["OH", 8, 3], ["PA", 9, 3], ["NJ", 10, 3], ["CT", 11, 3],
  ["CA", 1, 4], ["UT", 2, 4], ["CO", 3, 4], ["NE", 4, 4], ["MO", 5, 4],
  ["KY", 6, 4], ["WV", 7, 4], ["VA", 8, 4], ["MD", 9, 4], ["DE", 10, 4],
  ["AZ", 2, 5], ["NM", 3, 5], ["KS", 4, 5], ["AR", 5, 5], ["TN", 6, 5],
  ["NC", 7, 5], ["SC", 8, 5], ["DC", 9, 5],
  ["OK", 4, 6], ["LA", 5, 6], ["MS", 6, 6], ["AL", 7, 6], ["GA", 8, 6],
  ["HI", 0, 7], ["TX", 4, 7], ["FL", 8, 7],
];

const STATE_NAMES: Record<string, string> = {
  AK: "Alaska", AL: "Alabama", AR: "Arkansas", AZ: "Arizona", CA: "California",
  CO: "Colorado", CT: "Connecticut", DC: "Washington DC", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan",
  MN: "Minnesota", MO: "Missouri", MS: "Mississippi", MT: "Montana",
  NC: "North Carolina", ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VA: "Virginia", VT: "Vermont", WA: "Washington",
  WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming",
};

const CELL = 30;
const GAP = 3;

function UsStateMap({ disabled, onPick }: Omit<WidgetProps, "field">) {
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const w = 12 * (CELL + GAP);
  const h = 8 * (CELL + GAP);
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="listbox" aria-label="Pick your state">
        {STATE_TILES.map(([code, cx, cy]) => {
          const active = picked === code;
          const lit = hover === code || active;
          return (
            <g
              key={code}
              transform={`translate(${cx * (CELL + GAP)}, ${cy * (CELL + GAP)})`}
              onMouseEnter={() => setHover(code)}
              onMouseLeave={() => setHover((s) => (s === code ? null : s))}
              onClick={() => {
                if (disabled) return;
                setPicked(code);
                onPick({ field: "location", value: code, sayAs: STATE_NAMES[code] ?? code });
              }}
              className={disabled ? "" : "cursor-pointer"}
              role="option"
              aria-selected={active}
            >
              <rect
                width={CELL}
                height={CELL}
                rx={4}
                className={
                  active
                    ? "fill-treasury"
                    : lit
                      ? "fill-brass"
                      : "fill-panel-2"
                }
                style={{ transition: "fill 120ms" }}
              />
              <text
                x={CELL / 2}
                y={CELL / 2 + 3.5}
                textAnchor="middle"
                className={`pointer-events-none font-mono text-[10px] font-semibold ${
                  lit || active ? "fill-ink" : "fill-muted"
                }`}
              >
                {code}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="font-mono text-[11px] text-faint">
        {hover ? STATE_NAMES[hover] : picked ? `${STATE_NAMES[picked]} ✓` : "tap your state"}
      </p>
    </div>
  );
}

// ---------- amount picker (funding sought / revenue) ----------

function AmountPicker({
  field,
  disabled,
  onPick,
  presets,
}: Omit<WidgetProps, "field"> & { field: string; presets: [label: string, value: string][] }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, value]) => (
          <button
            key={label}
            disabled={disabled}
            onClick={() =>
              onPick({
                field,
                value: field === "annualRevenueUsd" ? parseAmount(value) : value,
                sayAs: label,
              })
            }
            className="rounded-md border border-hairline px-3 py-1.5 font-mono text-sm text-paper/85 transition-colors hover:border-brass hover:bg-brass/10 hover:text-paper disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = custom.trim();
          if (!v) return;
          onPick({
            field,
            value: field === "annualRevenueUsd" ? parseAmount(v) : v,
            sayAs: v.startsWith("$") ? v : `$${v}`,
          });
        }}
        className="flex gap-1.5"
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="or exact: 750k"
          className="w-32 rounded-md border border-hairline bg-panel px-2 py-1 font-mono text-sm text-paper placeholder:text-faint focus:border-brass focus:outline-none"
        />
        <button
          disabled={disabled || !custom.trim()}
          className="rounded-md border border-hairline px-2.5 py-1 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-paper disabled:opacity-40"
        >
          Set
        </button>
      </form>
    </div>
  );
}

function parseAmount(s: string): number {
  const m = s.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return 0;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return parseFloat(m[1]) * mult;
}

// ---------- team size ----------

const TEAM_BANDS: [label: string, value: number][] = [
  ["Just me", 1],
  ["2–10", 6],
  ["11–50", 30],
  ["51–200", 120],
  ["201–500", 350],
  ["500+", 600],
];

function TeamSizePicker({ disabled, onPick }: Omit<WidgetProps, "field">) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEAM_BANDS.map(([label, value]) => (
        <button
          key={label}
          disabled={disabled}
          onClick={() => onPick({ field: "employees", value, sayAs: `${label} people` })}
          className="rounded-md border border-hairline px-3 py-1.5 font-mono text-sm text-paper/85 transition-colors hover:border-brass hover:bg-brass/10 hover:text-paper disabled:opacity-40"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------- product maturity ----------

const STAGES: [key: string, label: string, hint: string][] = [
  ["concept", "Concept", "idea stage"],
  ["prototype", "Prototype", "it works in the lab"],
  ["pilot", "Pilot", "real users testing"],
  ["in-market", "In market", "customers paying"],
];

function MaturityStepper({ disabled, onPick }: Omit<WidgetProps, "field">) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {STAGES.map(([key, label, hint], i) => (
        <button
          key={key}
          disabled={disabled}
          onClick={() => onPick({ field: "productMaturity", value: key, sayAs: `${label} stage` })}
          className="rounded-md border border-hairline p-2 text-left transition-colors hover:border-brass hover:bg-brass/10 disabled:opacity-40"
        >
          <span className="font-mono text-[10px] text-faint">0{i + 1}</span>
          <span className="block text-sm font-semibold text-paper">{label}</span>
          <span className="block text-[11px] text-muted">{hint}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- big yes/no (voice stage for boolean gates) ----------

function BigYesNo({ field, disabled, onPick }: WidgetProps) {
  return (
    <div className="flex gap-2">
      <button
        disabled={disabled}
        onClick={() => onPick({ field, value: "true", sayAs: "yes" })}
        className="flex-1 rounded-md border border-treasury/60 py-2.5 text-sm font-semibold text-treasury transition-colors hover:bg-treasury/10 disabled:opacity-40"
      >
        Yes
      </button>
      <button
        disabled={disabled}
        onClick={() => onPick({ field, value: "false", sayAs: "no" })}
        className="flex-1 rounded-md border border-hairline py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-panel-2 hover:text-paper disabled:opacity-40"
      >
        No
      </button>
    </div>
  );
}
