import type { Metadata } from "next";
import Link from "next/link";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "./components/side-nav";
import { Wordmark } from "./components/brand";
import { countBySource } from "@/lib/engine/retrieve";

// Type system (Federal Catalyst kit): Hanken Grotesk headlines,
// Inter body, JetBrains Mono labels/data/buttons.
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Opportunity Radar", template: "%s — Opportunity Radar" },
  description: "Match your startup to US government funding — honestly.",
};

/** Live program count for the navbar; falls back quietly if the DB is cold. */
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

// App shell (Federal Catalyst): white top navbar — wordmark in the federal
// blue, section tabs with the active underline, live monitoring count on the
// right. Pages render full-width below and compose their own columns.
export default function RootLayout({ children }: LayoutProps<"/">) {
  const count = programCount();
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${inter.variable} ${jbMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-card shadow-sm">
          <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-4 sm:gap-8 sm:px-6 lg:px-10">
            <Link href="/" className="shrink-0">
              <Wordmark />
            </Link>
            <TopNav />
            <div className="flex-1" />
            {count && (
              <p className="hidden items-center gap-2 rounded-full bg-good-soft px-3.5 py-1.5 text-[12.5px] font-medium text-good md:flex">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                Monitoring <span className="tnum font-semibold">{count}</span> programs
              </p>
            )}
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-hairline bg-card">
          <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-6 text-[12.5px] text-faint sm:px-6 lg:px-10">
            <p>
              <span className="font-semibold text-muted">Sources</span> · Grants.gov · SAM.gov
              Assistance Listings · USAspending · Utah state programs
            </p>
            <p>Honest matches only — we say so when there&apos;s no fit.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
