import type { Sport } from "@/lib/nav";

// Lucide has no ball for any of our sports; these follow its 24px, 1.75 stroke style.
const PATHS: Record<Sport, string> = {
  football: "m12 7.6 4.2 3-1.6 5H9.4l-1.6-5ZM12 7.6V2.5m4.2 8.1 4.9-1.5m-6.5 6.5 3 4.2m-8.2-4.2-3 4.2m1.4-10.2L2.9 9.1",
  basketball: "M2.5 12h19M12 2.5v19M5.6 5a12 12 0 0 1 0 14M18.4 5a12 12 0 0 0 0 14",
  tennis: "M5 5.6a9.5 9.5 0 0 1 0 12.8M19 5.6a9.5 9.5 0 0 0 0 12.8",
};

export function SportIcon({ sport, className = "size-4" }: { sport: Sport; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d={PATHS[sport]} />
    </svg>
  );
}
