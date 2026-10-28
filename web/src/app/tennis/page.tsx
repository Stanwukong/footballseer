import type { Metadata } from "next";

import { TennisBoard } from "@/components/tennis/Board";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Tennis predictions" };

export default function TennisHome() {
  return (
    <>
      <PageHeader eyebrow="Matches · ATP, WTA, Challenger, ITF" title="Tennis predictions">
        Every match SportyBet prices in the next 36 hours. Where both players are rated, our Elo model&apos;s chance sits beside the
        market&apos;s, and a gap of five points or more is flagged. Ratings are rebuilt daily from three years of results.
      </PageHeader>
      <TennisBoard initial="pre" />
    </>
  );
}
