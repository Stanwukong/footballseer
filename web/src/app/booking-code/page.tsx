import type { Metadata } from "next";

import { BookingCode } from "@/components/BookingCode";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "SportyBet booking code checker" };

/** Shared by all three sports: a code can mix football, basketball and tennis. */
export default function BookingCodePage() {
  return (
    <>
      <PageHeader eyebrow="Tools · SportyBet" title="Booking code checker">
        Bring a booking code from SportyBet and we&apos;ll decode the slip and price every selection with our football, basketball and tennis
        models: our chance next to the bookmaker&apos;s, the edge on each pick, the slip&apos;s expected return and which picks drag it down.
      </PageHeader>
      <BookingCode />
    </>
  );
}
