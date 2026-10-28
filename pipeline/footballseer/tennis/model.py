"""Elo ratings for tennis players.

Each player starts at 1500. After a match the winner takes K * (1 - p) points
from the loser, where p was the winner's expected chance. K shrinks as a player
builds a record (FiveThirtyEight's 250 / (n + 5) ** 0.4), so newcomers move fast
and established players slowly.

Raw Elo gaps are overconfident for tennis, so prices use the gap times a
scale fitted on past matches (see fit_scale).

Elo prices a best-of-three match. For best-of-five, the per-set chance that
gives that best-of-three price is solved for, then played over five sets.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import brentq

START = 1500.0
PEAK_AFTER = 20   # a peak counts once a player's rating has settled


def k_factor(n: int) -> float:
    return 250.0 / (n + 5) ** 0.4


def expected(ra: float, rb: float) -> float:
    return 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))


def price(gap, best_of=3, scale: float = 1.0):
    """Chance for the player `gap` Elo points ahead. Works on arrays."""
    p = 1.0 / (1.0 + 10 ** (-np.asarray(gap, dtype=float) * scale / 400.0))
    five = np.asarray(best_of) == 5
    if np.any(five):
        p = np.where(five, np.vectorize(best_of_five)(p), p)
    return p


def fit_scale(gap: np.ndarray, best_of: np.ndarray, y: np.ndarray) -> float:
    """The gap multiplier with the lowest log loss on (gap, outcome) pairs."""
    grid = np.round(np.arange(0.5, 1.21, 0.02), 2)
    def ll(c):
        q = np.clip(price(gap, best_of, c), 1e-6, 1 - 1e-6)
        return -np.mean(y * np.log(q) + (1 - y) * np.log(1 - q))
    return float(min(grid, key=ll)) if len(y) else 1.0


def bo3(s: float) -> float:
    return s * s * (3 - 2 * s)


def bo5(s: float) -> float:
    return s ** 3 * (10 - 15 * s + 6 * s * s)


def best_of_five(p: float) -> float:
    """Best-of-five chance for a player whose best-of-three chance is p."""
    if p <= 0 or p >= 1:
        return p
    s = brentq(lambda x: bo3(x) - p, 0.0, 1.0)
    return float(bo5(s))


@dataclass
class Player:
    name: str
    elo: float = START
    n: int = 0
    last: str = ""
    form: str = ""
    peak: float = START
    peak_day: str = ""


@dataclass
class Ratings:
    players: dict[str, Player] = field(default_factory=dict)

    def get(self, pid: str, name: str = "") -> Player:
        p = self.players.get(pid)
        if p is None:
            p = self.players[pid] = Player(name)
        elif name:
            p.name = name
        return p

    def update(self, winner: str, loser: str, wname: str = "", lname: str = "", day: str = "") -> None:
        w, l = self.get(winner, wname), self.get(loser, lname)
        p = expected(w.elo, l.elo)
        w.elo += k_factor(w.n) * (1 - p)
        l.elo -= k_factor(l.n) * (1 - p)
        w.n += 1
        l.n += 1
        w.last = l.last = day
        w.form = ("W" + w.form)[:5]
        l.form = ("L" + l.form)[:5]
        if w.n >= PEAK_AFTER and w.elo > w.peak:
            w.peak, w.peak_day = w.elo, day


def walk(matches, min_prior: int = 10) -> tuple[Ratings, np.ndarray, np.ndarray]:
    """Rate matches in order. Returns the final ratings; per match, p1's
    pre-match Elo lead (NaN when either player had fewer than min_prior matches);
    and both players' pre-match Elos, shape (n, 2)."""
    r = Ratings()
    pre = np.full(len(matches), np.nan)
    elos = np.full((len(matches), 2), START)
    for i, m in enumerate(matches.itertuples(index=False)):
        a, b = r.players.get(m.p1_id), r.players.get(m.p2_id)
        if a:
            elos[i, 0] = a.elo
        if b:
            elos[i, 1] = b.elo
        if a and b and a.n >= min_prior and b.n >= min_prior:
            pre[i] = a.elo - b.elo
        day = f"{m.date:%Y-%m-%d}"
        if m.winner == 1:
            r.update(m.p1_id, m.p2_id, m.p1, m.p2, day)
        else:
            r.update(m.p2_id, m.p1_id, m.p2, m.p1, day)
    return r, pre, elos
