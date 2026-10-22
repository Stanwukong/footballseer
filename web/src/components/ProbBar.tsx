import { pct } from "@/lib/format";

/** Home / draw / away split as one bar: blue ↔ neutral ↔ orange. */
export function ProbBar({
  p,
  home,
  away,
  size = "sm",
}: {
  p: Record<string, number>;
  home?: string;
  away?: string;
  size?: "sm" | "lg";
}) {
  const parts = [
    { key: "1", label: home ? `${home} win` : "Home", color: "bg-home", v: p["1"] },
    { key: "X", label: "Draw", color: "bg-draw", v: p["X"] },
    { key: "2", label: away ? `${away} win` : "Away", color: "bg-away", v: p["2"] },
  ];
  return (
    <div className="w-full">
      <div
        className={`flex w-full gap-[2px] overflow-hidden rounded ${size === "lg" ? "h-3" : "h-1.5"}`}
        role="img"
        aria-label={parts.map((x) => `${x.label} ${pct(x.v)}`).join(", ")}
      >
        {parts.map((x) => (
          <div key={x.key} className={`${x.color} h-full`} style={{ width: `${x.v * 100}%` }} title={`${x.label}: ${pct(x.v, 1)}`} />
        ))}
      </div>
      {size === "lg" && (
        <div className="mt-2 grid grid-cols-3 text-sm">
          {parts.map((x, i) => (
            <div key={x.key} className={i === 1 ? "text-center" : i === 2 ? "text-right" : ""}>
              <div className="text-2xl font-semibold tabular">{pct(x.v)}</div>
              <div className="flex items-center gap-1.5 text-ink-2" style={{ justifyContent: i === 1 ? "center" : i === 2 ? "flex-end" : "flex-start" }}>
                <span className={`inline-block size-2 rounded-full ${x.color}`} aria-hidden />
                <span className="truncate">{x.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
