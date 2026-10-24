import type { Metadata } from "next";

import { Predictor } from "@/components/basketball/Boards";
import { PageHeader } from "@/components/ui";
import { getLeagues } from "@/lib/basketball/data";

export const metadata: Metadata = { title: "Basketball matchup predictor" };

export default async function PredictorPage() {
  const leagues = await getLeagues();
  return (
    <>
      <PageHeader eyebrow="Tools" title="Matchup predictor">
        Price any pairing in any league, including games that aren&apos;t scheduled, at home or on a neutral floor. It runs the same
        model as the predictions page, in your browser.
      </PageHeader>
      <Predictor leagues={leagues} />
    </>
  );
}
