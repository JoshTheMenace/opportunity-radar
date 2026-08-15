"use client";

// App-wide top navigation — the mock's or-nav markup bound to real routes.
// Raw kit classes rather than the TopNavBar component because the chrome
// icons need real handlers: the bell goes to Screening (where notifications
// live) and help opens the Assistant. Tabs per the approved design; Pursuits
// has no tab — it's reached via Apply Now and every "Start Pre-flight".

import { usePathname, useRouter } from "next/navigation";
import { IconButton, Button } from "./ui";
import { Wordmark } from "./brand";
import { useAssistant } from "./assistant/context";

const LINKS = [
  { label: "Opportunity Map", href: "/" },
  { label: "Profile", href: "/profile" },
  { label: "Screening", href: "/radar" },
  { label: "Utah View", href: "/utah" },
] as const;

function activeFor(pathname: string): string {
  if (pathname === "/") return "Opportunity Map";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/radar") || pathname.startsWith("/dream")) return "Screening";
  if (pathname.startsWith("/utah") || pathname.startsWith("/people")) return "Utah View";
  return ""; // pursuits + opportunity detail: no tab highlights
}

export default function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen } = useAssistant();
  const active = activeFor(pathname);

  return (
    <nav className="or-nav mk-appnav">
      <button
        type="button"
        onClick={() => router.push("/")}
        style={{ background: "none", border: 0, cursor: "pointer", padding: 0, flex: "none" }}
        aria-label="Opportunity Radar home"
      >
        <Wordmark />
      </button>
      <div className="or-nav__links mk-navlinks">
        {LINKS.map((l) => (
          <button
            key={l.label}
            type="button"
            className={`or-nav__link${l.label === active ? " or-nav__link--active" : ""}`}
            onClick={() => router.push(l.href)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="mk-navright" style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          <IconButton icon="notifications" aria-label="Notifications" title="Notifications" onClick={() => router.push("/radar")} />
          <IconButton icon="help" aria-label="Help — ask the assistant" title="Ask the assistant" onClick={() => setOpen(true)} />
        </div>
        <Button pill onClick={() => router.push("/pursuits")}>
          Apply Now
        </Button>
      </div>
    </nav>
  );
}
