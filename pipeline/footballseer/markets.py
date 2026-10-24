"""Turn a score-probability matrix into betting-market probabilities.

One matrix (rows = home goals, cols = away goals) prices every goals market,
so adding a market is a one-liner here rather than a new model.
"""

from __future__ import annotations

import numpy as np

GOAL_LINES = (0.5, 1.5, 2.5, 3.5, 4.5)

# Display names, also used by the web app.
LABELS = {
    "1": "Home win", "X": "Draw", "2": "Away win",
    "1X": "Home or draw", "12": "No draw", "X2": "Away or draw",
    "DNB1": "Home draw-no-bet", "DNB2": "Away draw-no-bet",
    "BTTS_Y": "Both teams score", "BTTS_N": "Not both teams score",
    **{f"O{l}": f"Over {l} goals" for l in GOAL_LINES},
    **{f"U{l}": f"Under {l} goals" for l in GOAL_LINES},
    "H_O0.5": "Home scores", "H_O1.5": "Home over 1.5", "A_O0.5": "Away scores", "A_O1.5": "Away over 1.5",
    "H_CS": "Home clean sheet", "A_CS": "Away clean sheet",
}

# Half-time and corners markets (stats.py). Exported, but not kept in the ledger.
EXTRA_LABELS = {
    "HT_1": "Home leads at half-time", "HT_X": "Level at half-time", "HT_2": "Away leads at half-time",
    "HT_O0.5": "Over 0.5 goals 1st half", "HT_O1.5": "Over 1.5 goals 1st half", "HT_BTTS_Y": "Both score 1st half",
    "2H_O0.5": "Over 0.5 goals 2nd half", "2H_O1.5": "Over 1.5 goals 2nd half", "2H_BTTS_Y": "Both score 2nd half",
    **{f"C_O{l}": f"Over {l} corners" for l in (7.5, 8.5, 9.5, 10.5)},
    **{f"C_U{l}": f"Under {l} corners" for l in (7.5, 8.5, 9.5, 10.5)},
}


def markets(m: np.ndarray) -> dict[str, float]:
    i, j = np.indices(m.shape)
    total = i + j
    home, draw, away = m[i > j].sum(), np.trace(m), m[i < j].sum()

    out = {
        "1": home, "X": draw, "2": away,
        "1X": home + draw, "12": home + away, "X2": draw + away,
        "DNB1": home / (home + away), "DNB2": away / (home + away),
        "BTTS_Y": m[1:, 1:].sum(),
        "H_O0.5": m[1:, :].sum(), "H_O1.5": m[2:, :].sum(),
        "A_O0.5": m[:, 1:].sum(), "A_O1.5": m[:, 2:].sum(),
        "H_CS": m[:, 0].sum(), "A_CS": m[0, :].sum(),
    }
    out["BTTS_N"] = 1 - out["BTTS_Y"]
    for line in GOAL_LINES:
        over = m[total > line].sum()
        out[f"O{line}"], out[f"U{line}"] = over, 1 - over
    return {k: round(float(v), 4) for k, v in out.items()}


def top_scores(m: np.ndarray, k: int = 6) -> list[dict]:
    flat = np.argsort(m, axis=None)[::-1][:k]
    return [{"score": f"{a}-{b}", "p": round(float(m[a, b]), 4)}
            for a, b in zip(*np.unravel_index(flat, m.shape))]


def settle_frame(hg: np.ndarray, ag: np.ndarray) -> dict[str, np.ndarray]:
    """Vectorised settle(): market -> float array of 1 (won), 0 (lost), nan (void)."""
    hg, ag = np.asarray(hg, dtype=float), np.asarray(ag, dtype=float)
    t = hg + ag
    draw = hg == ag
    res = {
        "1": hg > ag, "X": draw, "2": hg < ag, "1X": hg >= ag, "12": ~draw, "X2": hg <= ag,
        "DNB1": hg > ag, "DNB2": ag > hg,
        "BTTS_Y": (hg > 0) & (ag > 0), "BTTS_N": ~((hg > 0) & (ag > 0)),
        "H_O0.5": hg > 0, "H_O1.5": hg > 1, "A_O0.5": ag > 0, "A_O1.5": ag > 1,
        "H_CS": ag == 0, "A_CS": hg == 0,
    }
    for line in GOAL_LINES:
        res[f"O{line}"], res[f"U{line}"] = t > line, t < line
    out = {k: v.astype(float) for k, v in res.items()}
    out["DNB1"][draw] = np.nan
    out["DNB2"][draw] = np.nan
    return out


def settle(market: str, hg: int, ag: int) -> bool | None:
    """Did `market` win for final score hg-ag? None for a void (DNB draw)."""
    t = hg + ag
    if market in ("DNB1", "DNB2") and hg == ag:
        return None
    rules = {
        "1": hg > ag, "X": hg == ag, "2": hg < ag,
        "1X": hg >= ag, "12": hg != ag, "X2": hg <= ag,
        "DNB1": hg > ag, "DNB2": ag > hg,
        "BTTS_Y": hg > 0 and ag > 0, "BTTS_N": not (hg > 0 and ag > 0),
        "H_O0.5": hg > 0, "H_O1.5": hg > 1, "A_O0.5": ag > 0, "A_O1.5": ag > 1,
        "H_CS": ag == 0, "A_CS": hg == 0,
    }
    for line in GOAL_LINES:
        rules[f"O{line}"], rules[f"U{line}"] = t > line, t < line
    return rules[market]
