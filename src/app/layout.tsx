import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import SideNav from "./components/side-nav";
import { countBySource } from "@/lib/engine/retrieve";

// Type system: Fraunces (display, used sparingly), Public Sans (UI — the
// US government's own web face), IBM Plex Mono (ledger numbers + data).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Opportunity Radar", template: "%s — Opportunity Radar" },
  description: "Match your startup to US government funding — honestly.",
};

/** Tiny scope glyph — the wordmark's instrument, not an emoji. */
function ScopeMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <circle cx="9" cy="9" r="8" fill="none" stroke="var(--color-hairline)" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="4.5" fill="none" stroke="var(--color-hairline)" strokeWidth="1" />
      <line x1="9" y1="9" x2="15.5" y2="4.5" stroke="var(--color-brass)" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="1.5" fill="var(--color-brass)" />
      <circle cx="5.5" cy="11.5" r="1.2" fill="var(--color-treasury)" />
    </svg>
  );
}

/** Live program count for the sidebar; falls back quietly if the DB is cold. */
function programCount(): string {
  try {
    const counts = countBySource();
    const total = Object.values(counts).reduce((a, n) => a + n, 0);
    if (total > 0) return total.toLocaleString("en-US");
  } catch {
    // ingest hasn't run — show nothing rather than a made-up number
  }
  return "";
}

// App shell: mission control. Desktop gets a fixed left rail (brand, nav,
// monitoring status); mobile keeps a slim top bar. Every page renders in the
// remaining space; per-page layout composes canvas + agent dock itself.
export default function RootLayout({ children }: LayoutProps<"/">) {
  const count = programCount();
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* left rail — desktop only */}
        <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-hairline bg-panel/30 px-4 py-6 lg:flex">
          <Link href="/" className="flex items-center gap-2.5 px-1">
            <ScopeMark size={22} />
            <span className="font-display text-lg font-semibold leading-tight tracking-tight text-paper">
              Opportunity
              <br />
              Radar
            </span>
          </Link>

          <SideNav />

          <div className="flex-1" />

          <div className="space-y-3 px-1">
            {count && (
              <p className="font-mono text-[10px] leading-relaxed tracking-[0.14em] text-faint">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-treasury align-middle" />
                MONITORING
                <br />
                <span className="text-sm tracking-normal text-muted">{count} programs</span>
              </p>
            )}
            <p className="font-mono text-[10px] leading-relaxed text-faint">
              Grants.gov · SAM.gov
              <br />
              USAspending · Utah
            </p>
            <p className="border-t border-hairline pt-3 text-[11px] leading-snug text-faint">
              Honest matches only — we say so when there&apos;s no fit.
            </p>
          </div>
        </aside>

        {/* content column */}
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-hairline bg-ink/90 backdrop-blur lg:hidden">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2.5">
                <ScopeMark />
                <span className="whitespace-nowrap font-display text-base font-semibold tracking-tight text-paper sm:text-lg">
                  <span className="hidden sm:inline">Opportunity </span>Radar
                </span>
              </Link>
              <nav className="flex items-center gap-5 text-sm text-muted">
                <Link href="/" className="transition-colors hover:text-paper">
                  Analyze
                </Link>
                <Link href="/pursuits" className="transition-colors hover:text-paper">
                  Pursuits
                </Link>
                <Link href="/radar" className="transition-colors hover:text-paper">
                  Radar
                </Link>
              </nav>
            </div>
          </header>

          <div className="flex-1">{children}</div>

          <footer className="border-t border-hairline lg:hidden">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-[11px] text-faint">
              <p>
                <span className="text-muted">SOURCES</span> — Grants.gov · SAM.gov Assistance
                Listings · USAspending · Utah state programs
              </p>
              <p>Honest matches only — we say so when there&apos;s no fit.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
