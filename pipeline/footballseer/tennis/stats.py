"""Per-player statistics from the rated results.

Records overall, over the last year, by surface and at the Grand Slams; the
moments that decide matches (tiebreaks, deciding sets, after winning or losing
the first set); results against the current top 10 and top 50; and how a
player has done against the model's own pre-match prices.

Win-loss counts include retirements. Set, game, tiebreak and deciding-set
counts leave them out, since the last set was never finished.

Counts are [won, lost] pairs, so the web app can show both and a rate.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, timedelta

import pandas as pd

from . import model

SLAMS = re.compile(r"australian open|roland garros|french open|wimbledon|us open", re.I)
SURFACES = ("hard", "clay", "grass")
PAIRS = ("all", "year", "slams", "top10", "top50", "favourite", "underdog", "sets", "games",
         "tiebreaks", "deciders", "won_first", "lost_first", "straight")
YEAR_DAYS = 365


def parse_sets(text: str) -> list[tuple[int, int]]:
    """"7-6 3-6 6-3" -> [(7, 6), (3, 6), (6, 3)], from p1's side."""
    out = []
    for s in text.split():
        a, _, b = s.partition("-")
        if a.isdigit() and b.isdigit():
            out.append((int(a), int(b)))
    return out


def player_stats(df: pd.DataFrame, elos, scale: float, rank: dict[str, int], ids: set[str], today: date) -> dict[str, dict]:
    """Stats for the players in `ids`. `elos` holds both players' pre-match Elos per row of df, in order;
    `rank` is each listed player's current Elo rank on their tour."""
    since = pd.Timestamp(today - timedelta(days=YEAR_DAYS))
    c: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    expected: dict[str, float] = defaultdict(float)
    results: dict[str, list[bool]] = defaultdict(list)

    for i, m in enumerate(df.itertuples(index=False)):
        sets = parse_sets(m.sets)
        recent = m.date >= since
        for side, pid, opp in ((0, m.p1_id, m.p2_id), (1, m.p2_id, m.p1_id)):
            if pid not in ids:
                continue
            x = c[pid]
            won = m.winner == side + 1
            k = 0 if won else 1
            results[pid].append(won)
            for key in ("all", m.surface, *(["year"] if recent else []), *(["slams"] if SLAMS.search(m.event) else [])):
                x[key][k] += 1
            r = rank.get(opp)
            if r and r <= 10:
                x["top10"][k] += 1
            if r and r <= 50:
                x["top50"][k] += 1
            if m.status == "retired" and not won:
                x["retired"][0] += 1

            if recent:
                # The model's pre-match chance, priced as the track record prices it.
                p = float(model.price(elos[i][side] - elos[i][1 - side], m.best_of, scale))
                expected[pid] += p - won
                x["favourite" if p >= 0.5 else "underdog"][k] += 1

            if m.status != "final" or not sets:
                continue
            own = [(s[side], s[1 - side]) for s in sets]
            for a, b in own:
                x["sets"][0 if a > b else 1] += 1
                x["games"][0] += a
                x["games"][1] += b
                if {a, b} == {6, 7}:
                    x["tiebreaks"][0 if a > b else 1] += 1
            if len(own) == m.best_of:
                x["deciders"][k] += 1
            x["won_first" if own[0][0] > own[0][1] else "lost_first"][k] += 1
            if won:
                # Won without dropping a set, or not.
                x["straight"][0 if all(a > b for a, b in own) else 1] += 1

    return {
        pid: {
            **{key: x.get(key, [0, 0]) for key in PAIRS},
            "surface": {s: x.get(s, [0, 0]) for s in SURFACES},
            "retired": x.get("retired", [0, 0])[0],
            # Wins over the last year above (positive) or below what the model's prices expected.
            "vs_model": round(-expected[pid], 1) if x.get("year") else None,
            "streak": streak(results[pid]),
        }
        for pid, x in c.items()
    }


def streak(results: list[bool]) -> str:
    """"W4": four wins in a row, from results oldest first."""
    if not results:
        return ""
    last, n = results[-1], 0
    for r in reversed(results):
        if r != last:
            break
        n += 1
    return f"{'W' if last else 'L'}{n}"
