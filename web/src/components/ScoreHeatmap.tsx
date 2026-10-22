import { pct } from "@/lib/format";

const STEPS = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6"];

/** Correct-score probabilities, home goals down, away goals across. */
export function ScoreHeatmap({ matrix, home, away }: { matrix: number[][]; home: string; away: string }) {
  const n = Math.min(matrix.length, 6);
  const max = Math.max(...matrix.slice(0, n).flatMap((r) => r.slice(0, n)));
  const step = (p: number) => STEPS[Math.min(STEPS.length - 1, Math.round((p / max) * (STEPS.length - 1)))];

  return (
    <figure>
      <div className="mb-2 text-xs text-ink-3">
        <span className="font-medium text-ink-2">{away}</span> goals →
      </div>
      <div className="flex gap-2">
        <div className="flex items-center text-xs text-ink-3 [writing-mode:vertical-rl] rotate-180">
          <span><span className="font-medium text-ink-2">{home}</span> goals →</span>
        </div>
        <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs tabular">
          <thead>
            <tr>
              <th />
              {Array.from({ length: n }, (_, j) => (
                <th key={j} className="pb-1 font-normal text-ink-3">{j}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.slice(0, n).map((row, i) => (
              <tr key={i}>
                <th className="pr-1 font-normal text-ink-3">{i}</th>
                {row.slice(0, n).map((p, j) => {
                  const s = STEPS.indexOf(step(p));
                  return (
                    <td
                      key={j}
                      title={`${home} ${i}–${j} ${away}: ${pct(p, 1)}`}
                      className="h-9 rounded-sm text-center align-middle"
                      style={{
                        background: `var(${step(p)})`,
                        color: s >= 4 ? "#fff" : "var(--text-2)",
                      }}
                    >
                      {p >= 0.03 ? pct(p) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="mt-2 text-xs text-ink-3">Darker = more likely. Scores with under 3% are left blank; hover for the exact figure.</figcaption>
    </figure>
  );
}
