"use client";

// Region: sidebar navigation — the mission-control rail's nav links with
// active-route state. Lives inside the layout sidebar (desktop only).

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; hint: string }[] = [
  { href: "/", label: "Analyze", hint: "run a funding fit" },
  { href: "/pursuits", label: "Pursuits", hint: "applications in flight" },
  { href: "/radar", label: "Radar", hint: "watching for you" },
];

export default function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`group rounded-md border-l-2 px-3 py-2 transition-colors ${
              active
                ? "border-brass bg-panel text-paper"
                : "border-transparent text-muted hover:bg-panel/60 hover:text-paper"
            }`}
          >
            <span className="block text-sm font-semibold">{l.label}</span>
            <span className="block font-mono text-[10px] tracking-wide text-faint group-hover:text-muted">
              {l.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
