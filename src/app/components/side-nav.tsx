"use client";

// Region: primary navigation — horizontal mono links in the top navbar with
// active-route state (blue underline, reference style).

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Opportunity Map" },
  { href: "/pursuits", label: "Pursuit Workspace" },
  { href: "/radar", label: "Monitor" },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-4 sm:gap-6" aria-label="Primary">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-[19px] pt-[21px] text-[14px] font-medium transition-colors ${
              active
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
