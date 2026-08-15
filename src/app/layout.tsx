import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

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
function ScopeMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <circle cx="9" cy="9" r="8" fill="none" stroke="var(--color-hairline)" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="4.5" fill="none" stroke="var(--color-hairline)" strokeWidth="1" />
      <line x1="9" y1="9" x2="15.5" y2="4.5" stroke="var(--color-brass)" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="1.5" fill="var(--color-brass)" />
      <circle cx="5.5" cy="11.5" r="1.2" fill="var(--color-treasury)" />
    </svg>
  );
}

// App shell: sticky top nav + page slot + footer. Every page renders inside
// this frame; restyle here for site-wide chrome.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-hairline bg-ink/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2.5">
              <ScopeMark />
              <span className="whitespace-nowrap font-display text-base font-semibold tracking-tight text-paper sm:text-lg">
                Opportunity Radar
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

        <footer className="border-t border-hairline">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-[11px] text-faint">
            <p>
              <span className="text-muted">SOURCES</span> — Grants.gov · SAM.gov Assistance
              Listings · USAspending · Utah state programs
            </p>
            <p>Honest matches only — we say so when there&apos;s no fit.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
