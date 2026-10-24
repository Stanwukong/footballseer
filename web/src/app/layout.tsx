import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";

import { Shell } from "@/components/Shell";
import { TourLink } from "@/components/Tour";
import { getMeta as getBasketballMeta } from "@/lib/basketball/data";
import { getMeta } from "@/lib/data";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "FootballSeer: football predictions", template: "%s · FootballSeer" },
  description: "Model-driven probabilities for every major football market across 38 leagues, with an open track record.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0c" },
  ],
};

// Applies the stored theme before first paint, so a dark-mode reader never sees a light flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("fs-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

const stamp = (iso: string) => (iso ? new Date(iso).toUTCString().replace(" GMT", " UTC") : "–");

async function Footer() {
  const [meta, bb] = await Promise.all([getMeta(), getBasketballMeta()]);
  return (
    <footer className="border-t border-line text-xs text-ink-3">
      <div className="mx-auto max-w-300 space-y-1.5 px-4 py-6 lg:px-8">
        <p className="font-mono text-[11px] tracking-wide uppercase">
          Football updated {stamp(meta.generated_at)} · {meta.data_source || "–"}
        </p>
        {bb.generated_at && (
          <p className="font-mono text-[11px] tracking-wide uppercase">Basketball updated {stamp(bb.generated_at)} · {bb.data_source}</p>
        )}
        <p className="max-w-3xl leading-relaxed">
          Probabilities are estimates, not guarantees, and bookmakers&apos; prices are hard to beat over time. 18+ only.
          If gambling stops being fun, visit <a className="underline hover:text-ink" href="https://www.begambleaware.org">BeGambleAware</a>.
        </p>
        <p>
          New here? <TourLink className="underline hover:text-ink" />
        </p>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable} ${grotesk.variable} antialiased`}>
      <body className="font-sans">
        <Script id="theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <Shell footer={<Footer />}>{children}</Shell>
      </body>
    </html>
  );
}
