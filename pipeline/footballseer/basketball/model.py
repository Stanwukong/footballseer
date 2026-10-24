"""Points model: weighted ridge regression on each side's score.

    home_pts = μ + h/2 + off[home] + def[away]
    away_pts = μ − h/2 + off[away] + def[home]

h is the home advantage in points of margin (0 at neutral sites); off and def
are points scored and allowed above a league-average side. Older games count
less, exp(−ξ · days_ago), and a ridge penalty pulls teams with little data
towards average. Fast teams score and allow more, so pace lives in off + def.

The final margin and total are then treated as normal around the expected
values, with spreads measured from the weighted residuals. Each period (halves,
quarters) gets the league's share of the points and its own spreads, so period
markets scale the game's expectation rather than needing a model of their own.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from scipy import sparse

XI = 0.005          # decay per day: a half-life of about 140 days
REG = 2.0           # ridge penalty, in game-equivalents
MIN_GAMES = 5       # teams with fewer games (NCAA's non-Division I visitors) are left out of the fit
SIGMA_INFLATE = 1.04  # in-sample residuals understate out-of-sample spread
PERIODS = ["H1", "H2", "Q1", "Q2", "Q3", "Q4"]


def period_scores(df: pd.DataFrame) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Home and away points per period, NaN where unknown. The second half
    includes overtime, as bookmakers grade it; quarters are regulation only."""
    num = lambda c: df[c].to_numpy(float) if c in df else np.full(len(df), np.nan)  # noqa: E731
    h1h, h1a = num("h1h"), num("h1a")
    out = {"H1": (h1h, h1a), "H2": (num("hg") - h1h, num("ag") - h1a)}
    for k in range(1, 5):
        out[f"Q{k}"] = (num(f"q{k}h"), num(f"q{k}a"))
    return out


@dataclass
class Ratings:
    league: str
    teams: list[str]
    off: list[float]
    dfn: list[float]
    mu: float
    hfa: float
    sigma_m: float  # sd of the final margin
    sigma_t: float  # sd of the final total
    # Period -> [share of the game's points, sd of its margin, sd of its total]. Missing
    # periods have no data (NCAA men's plays halves, so no quarters).
    per: dict[str, list[float]]
    avg_total: float  # recent league average total, the default totals line
    n_games: int
    last_game: str

    def index(self, team: str) -> int:
        return self.teams.index(team)

    def rating(self, team: str) -> tuple[float, float]:
        """(off, def); a team with no games yet (an expansion side) rates as league average."""
        try:
            i = self.index(team)
        except ValueError:
            return 0.0, 0.0
        return self.off[i], self.dfn[i]

    def expected(self, home: str, away: str, neutral: bool = False) -> tuple[float, float]:
        (oh, dh), (oa, da) = self.rating(home), self.rating(away)
        adv = 0.0 if neutral else self.hfa / 2
        return self.mu + adv + oh + da, self.mu - adv + oa + dh

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("off", "dfn"):
            d[k] = [round(x, 3) for x in d[k]]
        for k in ("mu", "hfa", "sigma_m", "sigma_t", "avg_total"):
            d[k] = round(d[k], 4)
        d["per"] = {p: [round(v, 4) for v in vals] for p, vals in d["per"].items()}
        return d


def _wsd(x: np.ndarray, w: np.ndarray) -> float:
    return float(np.sqrt((w * x ** 2).sum() / w.sum()))


def fit(df: pd.DataFrame, as_of: pd.Timestamp | None = None, xi: float = XI, reg: float = REG,
        league: str = "") -> Ratings:
    """Fit on completed games (columns: date, home, away, hg, ag, neutral, ot, and period scores)."""
    as_of = as_of if as_of is not None else df["date"].max()
    df = df[df["date"] <= as_of]
    # A side seen once or twice, always away (a small college on a paid road trip), would be
    # shrunk to average and its heavy defeats read as home advantage.
    games = pd.concat([df["home"], df["away"]]).value_counts()
    ok = games.index[games >= MIN_GAMES]
    df = df[df["home"].isin(ok) & df["away"].isin(ok)]
    teams = sorted(set(df["home"]) | set(df["away"]))
    n, g = len(teams), len(df)
    idx = {t: i for i, t in enumerate(teams)}
    hi = df["home"].map(idx).to_numpy()
    ai = df["away"].map(idx).to_numpy()
    x = df["hg"].to_numpy(float)
    y = df["ag"].to_numpy(float)
    adv = np.where(df["neutral"].to_numpy(bool), 0.0, 0.5)
    w = np.exp(-xi * (as_of - df["date"]).dt.days.to_numpy(float))

    # Two equations per game; columns [off(n), def(n), mu, hfa].
    rows = np.repeat(np.arange(2 * g), 4)
    cols = np.column_stack([hi, n + ai, np.full(g, 2 * n), np.full(g, 2 * n + 1),
                            ai, n + hi, np.full(g, 2 * n), np.full(g, 2 * n + 1)]).reshape(-1)
    vals = np.column_stack([np.ones(g), np.ones(g), np.ones(g), adv,
                            np.ones(g), np.ones(g), np.ones(g), -adv]).reshape(-1)
    # Interleave so row 2k is game k's home score and 2k+1 its away score.
    X = sparse.csr_matrix((vals, (rows, cols)), shape=(2 * g, 2 * n + 2))
    target = np.column_stack([x, y]).reshape(-1)
    ww = np.repeat(w, 2)
    A = (X.T @ sparse.diags(ww) @ X).toarray()
    A[np.arange(2 * n), np.arange(2 * n)] += reg
    beta = np.linalg.solve(A, X.T @ (ww * target))

    off, dfn, mu, hfa = beta[:n], beta[n:2 * n], float(beta[2 * n]), float(beta[2 * n + 1])
    pred = (X @ beta).reshape(g, 2)
    rh, ra = x - pred[:, 0], y - pred[:, 1]
    sigma_m = _wsd(rh - ra, w) * SIGMA_INFLATE
    sigma_t = _wsd(rh + ra, w) * SIGMA_INFLATE

    # Periods: share of the game's points, and the spread around that share of the expectation.
    per = {}
    for p, (ph, pa) in period_scores(df).items():
        ok = ~np.isnan(ph) & ~np.isnan(pa)
        if ok.sum() < 50:
            continue
        share = float((ph[ok] + pa[ok]).sum() / (x[ok] + y[ok]).sum())
        pm, pt = pred[ok, 0] - pred[ok, 1], pred[ok].sum(1)
        per[p] = [share, _wsd((ph[ok] - pa[ok]) - share * pm, w[ok]) * SIGMA_INFLATE,
                  _wsd((ph[ok] + pa[ok]) - share * pt, w[ok]) * SIGMA_INFLATE]

    recent = df.tail(200)
    return Ratings(
        league=league, teams=teams, off=off.tolist(), dfn=dfn.tolist(), mu=mu, hfa=hfa,
        sigma_m=sigma_m, sigma_t=sigma_t, per=per,
        avg_total=float((recent["hg"] + recent["ag"]).mean()),
        n_games=int(g), last_game=str(df["date"].max().date()),
    )
