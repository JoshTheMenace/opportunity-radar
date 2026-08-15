import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "./components/app-nav";
import { AssistantProvider } from "./components/assistant/context";
import AssistantDrawer from "./components/assistant/drawer";

// Type system (Federal Catalyst kit): Hanken Grotesk headlines,
// Inter body, JetBrains Mono labels/data. globals.css rebinds the kit's
// --font-* roles to these next/font variables.
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

// App shell (Federal Catalyst): kit top nav, page below, Assistant drawer
// floating over everything. Pages compose their own mk-page/mk-grid columns.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${inter.variable} ${jbMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Material Symbols — the kit's only icon source. React hoists these. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          precedence="default"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        <AssistantProvider>
          <header className="sticky top-0 z-30">
            <AppNav />
          </header>

          <div className="flex-1">{children}</div>

          <footer style={{ borderTop: "1px solid var(--color-border-ice)", background: "var(--surface-card)" }}>
            <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-6 text-[12.5px] text-faint sm:px-6 lg:px-10">
              <p>
                <span className="font-semibold text-muted">Sources</span> · Grants.gov · SAM.gov
                Assistance Listings · USAspending · Utah state programs
              </p>
              <p>Honest matches only — we say so when there&apos;s no fit.</p>
            </div>
          </footer>

          <AssistantDrawer />
        </AssistantProvider>
      </body>
    </html>
  );
}
