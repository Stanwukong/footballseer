import type { Metadata } from "next";

import { TennisBoard } from "@/components/tennis/Board";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Live tennis scores" };

export default function TennisLivePage() {
  return (
    <>
      <PageHeader eyebrow="Matches" title="Live scores">
        Sets, games and points from SportyBet, refreshed every 30 seconds; the dot marks who is serving. Finished matches show
        whether the model&apos;s pick won.
      </PageHeader>
      <TennisBoard initial="in" />
    </>
  );
}
