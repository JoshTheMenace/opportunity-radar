import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import TopNav from "./components/side-nav";
import { countBySource } from "@/lib/engine/retrieve";

// Type system: Inter (all UI text), IBM Plex Mono (labels, data, buttons).
const inter = Inter({
  variable: "--font-inter",
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

/** Live program count for the footer; falls back quietly if the DB is cold. */
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

// App shell: white sticky top navbar (wordmark, section links, live program
// count) over the cool page ground. Every page renders below in full width;
// per-page layout composes canvas + agent rail itself.
export default function RootLayout({ children }: LayoutProps<"/">) {
  const count = programCount();
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-card/90 backdrop-blur">
          <div className="mx-auto flex h-[58px] w-full max-w-6xl items-center gap-4 px-4 sm:gap-7 sm:px-6">
            <Link href="/" className="shrink-0 text-base font-extrabold tracking-tight sm:text-lg">
              <span className="text-brand">Opportunity</span>
              <span className="text-ink">Radar</span>
            </Link>
            <TopNav />
            <div className="flex-1" />
            {count && (
              <p className="hidden font-mono text-[11px] text-faint md:block">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good align-middle" />
                MONITORING <span className="text-muted">{count}</span> PROGRAMS
              </p>
            )}
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-hairline bg-card">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-[11px] text-faint sm:px-6">
            <p>
              <span className="font-semibold text-muted">SOURCES</span> — Grants.gov · SAM.gov
              Assistance Listings · USAspending · Utah state programs
            </p>
            <p>Honest matches only — we say so when there&apos;s no fit.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
