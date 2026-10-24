import type { Metadata } from "next";

import { Predictor } from "@/components/Predictor";
import { PageHeader } from "@/components/ui";
import { getLeagues } from "@/lib/data";

export const metadata: Metadata = { title: "Matchup predictor" };

export default async function PredictorPage() {
  const leagues = await getLeagues();
  return (
    <>
      <PageHeader eyebrow="Tools" title="Matchup predictor">
        Price any pairing in any league, including matches that aren&apos;t scheduled.
        It runs the same model as the predictions page, in your browser.
      </PageHeader>
      <Predictor leagues={leagues} />
    </>
  );
}
