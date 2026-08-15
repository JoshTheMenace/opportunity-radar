"use client";

// App-wide top navigation — the kit's TopNavBar bound to real routes.
// Tabs per the approved design: Opportunity Map / Profile / Screening /
// Utah View. Pursuits has no tab; it's reached via Apply Now (and every
// "Start Pre-flight" button), exactly like the mock.

import { usePathname, useRouter } from "next/navigation";
import { TopNavBar } from "./ui";
import { Wordmark } from "./brand";

const LINKS = [
  { label: "Opportunity Map", href: "/" },
  { label: "Profile", href: "/profile" },
  { label: "Screening", href: "/radar" },
  { label: "Utah View", href: "/utah" },
] as const;

function activeFor(pathname: string): string {
  if (pathname === "/") return "Opportunity Map";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/radar")) return "Screening";
  if (pathname.startsWith("/utah") || pathname.startsWith("/people")) return "Utah View";
  return ""; // pursuits + opportunity detail: no tab highlights
}

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <TopNavBar
      brand={<Wordmark />}
      links={LINKS.map((l) => l.label)}
      activeLink={activeFor(pathname)}
      onNavigate={(label) => {
        const link = LINKS.find((l) => l.label === label);
        if (link) router.push(link.href);
      }}
      actions={["notifications", "help"]}
      cta="Apply Now"
      onCta={() => router.push("/pursuits")}
    />
  );
}
