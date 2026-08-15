import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Opportunity Radar", template: "%s — Opportunity Radar" },
  description: "Match your startup to US government funding — honestly.",
};

// App shell: sticky top nav + page slot + footer. Every page renders inside
// this frame; restyle here for site-wide chrome.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-950 text-neutral-100">
        <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-base font-bold tracking-tight">
              📡 Opportunity Radar
            </Link>
            <nav className="flex items-center gap-5 text-sm text-neutral-400">
              <Link href="/" className="hover:text-neutral-100">
                Analyze
              </Link>
              <Link href="/pursuits" className="hover:text-neutral-100">
                Pursuits
              </Link>
              <Link href="/radar" className="hover:text-neutral-100">
                Radar
              </Link>
            </nav>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-neutral-800">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-neutral-500">
            <p>
              Data: Grants.gov · SAM.gov Assistance Listings · USAspending · Utah state
              programs
            </p>
            <p>Honest matches only — we say so when there&apos;s no fit.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
