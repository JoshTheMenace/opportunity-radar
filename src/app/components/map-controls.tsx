"use client";

// Pagehead controls for the Opportunity Map: filter + sort popovers and the
// collapse-all toggle (mock's mk-pop pattern). Pure view state — the
// orchestrator owns the filter/sort values; this file owns which popover is
// open (one at a time; Escape or an outside click closes it).

import { useEffect, useRef, useState } from "react";
import type { FitTier } from "@/lib/types";
import { IconButton } from "./ui";
import { FILTERABLE_TIERS, TIER_META, type SortMode } from "./shared";

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: "score", label: "Best fit" },
  { mode: "deadline", label: "Deadline soonest" },
  { mode: "amount", label: "Largest award" },
];

export default function MapControls({
  counts,
  filters,
  onFilters,
  sort,
  onSort,
  collapsed,
  onToggleCollapsed,
}: {
  /** Cards per tier among score-cleared matches (chip counts in the menu). */
  counts: Record<FitTier, number>;
  filters: ReadonlySet<FitTier>;
  onFilters: (next: Set<FitTier>) => void;
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [open, setOpen] = useState<"filter" | "sort" | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleTier = (tier: FitTier) => {
    const next = new Set(filters);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    onFilters(next);
  };

  return (
    <div ref={rootRef} className="mk-row" style={{ gap: 4 }}>
      <div className="mk-pop">
        <IconButton
          icon="filter_list"
          active={open === "filter"}
          aria-haspopup="true"
          aria-expanded={open === "filter"}
          aria-controls="map-filter-menu"
          aria-label="Filter matches"
          onClick={() => setOpen((o) => (o === "filter" ? null : "filter"))}
        />
        <div
          className="mk-pop__menu"
          id="map-filter-menu"
          role="group"
          aria-label="Filter by fit tier"
          hidden={open !== "filter"}
        >
          <p className="mk-pop__title">Show</p>
          {FILTERABLE_TIERS.map((tier) => (
            <label key={tier} className="mk-pop__row">
              <input type="checkbox" checked={filters.has(tier)} onChange={() => toggleTier(tier)} />
              <span>{TIER_META[tier].label}</span>
              <span className="mk-num">{counts[tier] ?? 0}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mk-pop">
        <IconButton
          icon="swap_vert"
          active={open === "sort"}
          aria-haspopup="true"
          aria-expanded={open === "sort"}
          aria-controls="map-sort-menu"
          aria-label="Sort matches"
          onClick={() => setOpen((o) => (o === "sort" ? null : "sort"))}
        />
        <div
          className="mk-pop__menu"
          id="map-sort-menu"
          role="group"
          aria-label="Sort order"
          hidden={open !== "sort"}
        >
          <p className="mk-pop__title">Order by</p>
          {SORTS.map((s) => (
            <label key={s.mode} className="mk-pop__row">
              <input
                type="radio"
                name="map-sort"
                checked={sort === s.mode}
                onChange={() => {
                  onSort(s.mode);
                  setOpen(null);
                }}
              />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </div>
      <IconButton
        icon={collapsed ? "unfold_more" : "unfold_less"}
        aria-label={collapsed ? "Expand all matches" : "Collapse all matches"}
        title={collapsed ? "Expand all" : "Collapse all"}
        onClick={onToggleCollapsed}
      />
    </div>
  );
}
