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
    <nav className="flex min-w-0 items-center gap-4 overflow-x-auto sm:gap-6" aria-label="Primary">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap py-2 text-[13.5px] font-medium transition-colors md:-mb-px md:border-b-2 md:py-0 md:pb-[19px] md:pt-[21px] md:text-[14px] ${
              active
                ? "font-semibold text-brand md:border-brand"
                : "text-muted hover:text-ink md:border-transparent"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
