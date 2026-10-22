"""Dixon-Coles goals model with exponential time decay.

    log λ_home = μ + home_adv + attack[home] + defence[away]
    log λ_away = μ            + attack[away] + defence[home]

Goals are Poisson with the Dixon-Coles τ correction for the 0-0, 1-0, 0-1 and
1-1 scorelines. Older matches are down-weighted by exp(-ξ · days_ago), and an
L2 penalty on attack/defence both identifies the model and shrinks teams with
little data (e.g. newly promoted sides) towards the league average.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson

MAX_GOALS = 10


@dataclass
class Ratings:
    league: str
    teams: list[str]
    attack: list[float]
    defence: list[float]
    mu: float
    home_adv: float
    rho: float
    n_matches: int
    last_match: str

    def index(self, team: str) -> int:
        return self.teams.index(team)

    def rates(self, home: str, away: str) -> tuple[float, float]:
        h, a = self.index(home), self.index(away)
        lh = np.exp(self.mu + self.home_adv + self.attack[h] + self.defence[a])
        la = np.exp(self.mu + self.attack[a] + self.defence[h])
        return float(lh), float(la)

    def score_matrix(self, home: str, away: str) -> np.ndarray:
        return score_matrix(*self.rates(home, away), self.rho)

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("attack", "defence"):
            d[k] = [round(x, 4) for x in d[k]]
        for k in ("mu", "home_adv", "rho"):
            d[k] = round(d[k], 4)
        return d


def score_matrix(lh: float, la: float, rho: float, max_goals: int = MAX_GOALS) -> np.ndarray:
    """P(home=i, away=j) for i, j in 0..max_goals, normalised to sum to 1."""
    g = np.arange(max_goals + 1)
    m = np.outer(poisson.pmf(g, lh), poisson.pmf(g, la))
    m[0, 0] *= 1 - lh * la * rho
    m[0, 1] *= 1 + lh * rho
    m[1, 0] *= 1 + la * rho
    m[1, 1] *= 1 - rho
    m = np.clip(m, 0, None)
    return m / m.sum()


def objective(p: np.ndarray, n: int, hi: np.ndarray, ai: np.ndarray, x: np.ndarray,
              y: np.ndarray, w: np.ndarray, reg: float) -> tuple[float, np.ndarray]:
    """Penalised negative log-likelihood and its gradient.

    params p: [attack(n), defence(n), mu, home_adv, rho]
    """
    c00 = (x == 0) & (y == 0)
    c01 = (x == 0) & (y == 1)
    c10 = (x == 1) & (y == 0)
    c11 = (x == 1) & (y == 1)
    att, dfn, mu, home, rho = p[:n], p[n:2 * n], p[2 * n], p[2 * n + 1], p[2 * n + 2]
    llh = mu + home + att[hi] + dfn[ai]
    lla = mu + att[ai] + dfn[hi]
    lh, la = np.exp(llh), np.exp(lla)

    tau = np.ones_like(lh)
    tau[c00] = 1 - lh[c00] * la[c00] * rho
    tau[c01] = 1 + lh[c01] * rho
    tau[c10] = 1 + la[c10] * rho
    tau[c11] = 1 - rho
    tau = np.clip(tau, 1e-10, None)

    ll = w * (np.log(tau) + x * llh - lh + y * lla - la)
    penalty = reg * (att @ att + dfn @ dfn)

    # d(ll)/d(log λ) and d(ll)/dρ per match
    gh = x - lh
    ga = y - la
    grho = np.zeros_like(lh)
    gh[c00] -= lh[c00] * la[c00] * rho / tau[c00]
    ga[c00] -= lh[c00] * la[c00] * rho / tau[c00]
    grho[c00] = -lh[c00] * la[c00] / tau[c00]
    gh[c01] += lh[c01] * rho / tau[c01]
    grho[c01] = lh[c01] / tau[c01]
    ga[c10] += la[c10] * rho / tau[c10]
    grho[c10] = la[c10] / tau[c10]
    grho[c11] = -1 / tau[c11]
    gh, ga, grho = w * gh, w * ga, w * grho

    grad = np.zeros_like(p)
    grad[:n] = np.bincount(hi, gh, n) + np.bincount(ai, ga, n)
    grad[n:2 * n] = np.bincount(ai, gh, n) + np.bincount(hi, ga, n)
    grad[2 * n] = gh.sum() + ga.sum()
    grad[2 * n + 1] = gh.sum()
    grad[2 * n + 2] = grho.sum()
    grad = -grad
    grad[:2 * n] += 2 * reg * p[:2 * n]
    return -ll.sum() + penalty, grad


def fit(df: pd.DataFrame, as_of: pd.Timestamp | None = None, xi: float = 0.0019,
        reg: float = 4.0, league: str = "") -> Ratings:
    """Fit on completed matches in df (columns: date, home, away, hg, ag)."""
    as_of = as_of if as_of is not None else df["date"].max()
    df = df[df["date"] <= as_of]
    teams = sorted(set(df["home"]) | set(df["away"]))
    n = len(teams)
    idx = {t: i for i, t in enumerate(teams)}
    hi = df["home"].map(idx).to_numpy()
    ai = df["away"].map(idx).to_numpy()
    x = df["hg"].to_numpy(dtype=float)
    y = df["ag"].to_numpy(dtype=float)
    w = np.exp(-xi * (as_of - df["date"]).dt.days.to_numpy(dtype=float))

    mean_goals = max((x.mean() + y.mean()) / 2, 0.1)
    p0 = np.concatenate([np.zeros(2 * n), [np.log(mean_goals), 0.25, -0.05]])
    bounds = [(-3, 3)] * (2 * n) + [(-3, 3), (-1, 1), (-0.2, 0.2)]
    res = minimize(objective, p0, jac=True, method="L-BFGS-B", bounds=bounds,
                   args=(n, hi, ai, x, y, w, reg))
    p = res.x
    return Ratings(
        league=league,
        teams=teams,
        attack=p[:n].tolist(),
        defence=p[n:2 * n].tolist(),
        mu=float(p[2 * n]),
        home_adv=float(p[2 * n + 1]),
        rho=float(p[2 * n + 2]),
        n_matches=int(len(df)),
        last_match=str(df["date"].max().date()),
    )
