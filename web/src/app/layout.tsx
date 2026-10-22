import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { getMeta } from "@/lib/data";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FootballSeer — football predictions", template: "%s · FootballSeer" },
  description: "Model-driven probabilities for every major football market across 38 leagues, with an open track record.",
};

const NAV = [
  { href: "/", label: "Predictions" },
  { href: "/value", label: "Value bets" },
  { href: "/predictor", label: "Matchup" },
  { href: "/leagues", label: "Leagues" },
  { href: "/track-record", label: "Track record" },
];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const meta = await getMeta();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-4 py-3">
            <Link href="/" className="shrink-0 font-semibold tracking-tight">
              Football<span className="text-accent">Seer</span>
            </Link>
            <nav className="flex gap-4 text-sm text-ink-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="shrink-0 hover:text-ink">{n.label}</Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line text-xs text-ink-3">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-5">
            <p>
              Model updated {meta.generated_at ? new Date(meta.generated_at).toUTCString() : "–"} · Data: {meta.data_source || "–"}
            </p>
            <p>
              Probabilities are estimates, not guarantees. Bookmakers&apos; prices are hard to beat over time. 18+ only.
              If gambling stops being fun, visit <a className="underline" href="https://www.begambleaware.org">BeGambleAware</a>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
