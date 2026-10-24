"""Descriptive statistics from match history: standings, form, head-to-head,
per-team market hit rates, streaks ("trends"), league profiles, plus the
half-time and corners markets the goals model does not price directly.

Everything here is computed from league matches only (football-data has no
cup or European fixtures), so "last 10" means the last 10 league matches.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import poisson

GOAL_LINES = (0.5, 1.5, 2.5, 3.5, 4.5)
CORNER_LINES = (7.5, 8.5, 9.5, 10.5)
DEFAULT_H1_SHARE = 0.45  # share of goals scored before half-time, when a league has no HT data
STREAK_MIN = 4


# --------------------------------------------------------------------------- #
# Extra markets
# --------------------------------------------------------------------------- #

def h1_share(df: pd.DataFrame) -> float:
    ht = df.dropna(subset=["hthg", "htag"]) if "hthg" in df else pd.DataFrame()
    if len(ht) < 100:
        return DEFAULT_H1_SHARE
    total = (ht["hg"] + ht["ag"]).sum()
    return float((ht["hthg"] + ht["htag"]).sum() / total) if total else DEFAULT_H1_SHARE


def _half(lh: float, la: float, prefix: str, with_result: bool) -> dict[str, float]:
    g = np.arange(9)
    m = np.outer(poisson.pmf(g, lh), poisson.pmf(g, la))
    m /= m.sum()
    i, j = np.indices(m.shape)
    out = {f"{prefix}_O0.5": 1 - m[0, 0], f"{prefix}_O1.5": m[i + j > 1].sum(), f"{prefix}_BTTS_Y": m[1:, 1:].sum()}
    if with_result:
        out |= {f"{prefix}_1": m[i > j].sum(), f"{prefix}_X": np.trace(m), f"{prefix}_2": m[i < j].sum()}
    return out


def period_markets(lh: float, la: float, share: float) -> dict[str, float]:
    """First- and second-half markets, splitting each side's goal rate by the
    league's first-half share. Halves are treated as independent Poisson."""
    out = _half(lh * share, la * share, "HT", True) | _half(lh * (1 - share), la * (1 - share), "2H", False)
    return {k: round(float(v), 4) for k, v in out.items()}


class Corners:
    """Multiplicative corners model: expected home corners =
    league home average × home side's for-rate × away side's against-rate,
    each rate shrunk towards 1 by `k` pseudo-matches."""

    def __init__(self, df: pd.DataFrame, today: pd.Timestamp, k: float = 6):
        d = df[df["date"] >= today - pd.Timedelta(days=400)].dropna(subset=["hc", "ac"]) if "hc" in df else df.iloc[:0]
        self.ok = len(d) >= 80
        if not self.ok:
            return
        self.avg_h, self.avg_a = d["hc"].mean(), d["ac"].mean()

        def rate(team_col: str, val: str, avg: float) -> dict[str, float]:
            g = d.groupby(team_col)[val].agg(["sum", "count"])
            return ((g["sum"] / avg + k) / (g["count"] + k)).to_dict()

        self.h_for = rate("home", "hc", self.avg_h)
        self.h_against = rate("home", "ac", self.avg_a)
        self.a_for = rate("away", "ac", self.avg_a)
        self.a_against = rate("away", "hc", self.avg_h)

    def expected(self, home: str, away: str) -> tuple[float, float] | None:
        if not self.ok:
            return None
        ch = self.avg_h * self.h_for.get(home, 1) * self.a_against.get(away, 1)
        ca = self.avg_a * self.a_for.get(away, 1) * self.h_against.get(home, 1)
        return float(ch), float(ca)

    def markets(self, home: str, away: str) -> dict[str, float]:
        e = self.expected(home, away)
        if e is None:
            return {}
        lam = sum(e)
        out = {}
        for line in CORNER_LINES:
            over = 1 - poisson.cdf(int(line), lam)
            out[f"C_O{line}"], out[f"C_U{line}"] = round(float(over), 4), round(float(1 - over), 4)
        return out


# --------------------------------------------------------------------------- #
# Team views
# --------------------------------------------------------------------------- #

def team_rows(df: pd.DataFrame, team: str) -> pd.DataFrame:
    """One row per match from `team`'s side: gf, ga, venue, ht goals, corners. Oldest first."""
    h = df[df["home"] == team]
    a = df[df["away"] == team]
    cols = lambda g, us, them: pd.DataFrame({  # noqa: E731
        "date": g["date"], "season": g["season"], "opp": g[them], "venue": "H" if us == "home" else "A",
        "gf": g["hg" if us == "home" else "ag"], "ga": g["ag" if us == "home" else "hg"],
        "htgf": g["hthg" if us == "home" else "htag"], "htga": g["htag" if us == "home" else "hthg"],
        "cf": g["hc" if us == "home" else "ac"], "ca": g["ac" if us == "home" else "hc"],
    })
    return pd.concat([cols(h, "home", "away"), cols(a, "away", "home")]).sort_values("date").reset_index(drop=True)


def events(r: pd.DataFrame) -> dict[str, np.ndarray]:
    """Boolean event arrays for a team's matches; NaN half-time data counts as False."""
    gf, ga = r["gf"].to_numpy(), r["ga"].to_numpy()
    t = gf + ga
    ht = (r["htgf"] + r["htga"]).to_numpy()
    out = {
        "W": gf > ga, "D": gf == ga, "L": gf < ga, "UNB": gf >= ga, "WL": gf <= ga, "ND": gf != ga,
        "BTTS_Y": (gf > 0) & (ga > 0), "BTTS_N": ~((gf > 0) & (ga > 0)),
        "CS": ga == 0, "FTS": gf == 0, "SC": gf > 0, "CON": ga > 0,
        "HT_O0.5": ht > 0.5, "HT_O1.5": ht > 1.5,
    }
    for line in GOAL_LINES:
        out[f"O{line}"], out[f"U{line}"] = t > line, t < line
    return out


RATE_EVENTS = ["W", "D", "L", "O0.5", "O1.5", "O2.5", "O3.5", "O4.5", "BTTS_Y", "CS", "FTS", "HT_O0.5", "HT_O1.5"]
TREND_EVENTS = ["W", "UNB", "L", "WL", "D", "ND", "O1.5", "U1.5", "O2.5", "U2.5", "O3.5", "U3.5",
                "BTTS_Y", "BTTS_N", "CS", "FTS", "SC", "CON", "HT_O0.5"]


def rate(r: pd.DataFrame) -> dict:
    """Hit counts over a set of matches. `n` is the denominator for every event
    except half-time ones, which use `nht` (some rows lack HT scores)."""
    if r.empty:
        return {"n": 0}
    ev = events(r)
    has_ht = r["htgf"].notna().to_numpy()
    has_c = r["cf"].notna().to_numpy()
    out = {"n": int(len(r)), "nht": int(has_ht.sum()), "gf": int(r["gf"].sum()), "ga": int(r["ga"].sum()),
           "c": {e: int(ev[e].sum()) for e in RATE_EVENTS}}
    if has_c.sum():
        out["corners"] = [round(float(r.loc[has_c, "cf"].mean()), 2), round(float(r.loc[has_c, "ca"].mean()), 2)]
    return out


def streaks(r: pd.DataFrame) -> list[dict]:
    """Current runs of at least STREAK_MIN matches, overall and at this venue."""
    out = []
    for scope, sub in (("all", r), ("home", r[r["venue"] == "H"]), ("away", r[r["venue"] == "A"])):
        if len(sub) < STREAK_MIN:
            continue
        ev = events(sub)
        has_ht = sub["htgf"].notna().to_numpy()
        for e in TREND_EVENTS:
            x = ev[e][::-1]
            if e.startswith("HT") and not has_ht[::-1][:STREAK_MIN].all():
                continue
            n = int(np.argmin(x)) if not x.all() else len(x)
            if n >= STREAK_MIN:
                out.append({"e": e, "n": n, "s": scope})
    # Implied runs add noise ("unbeaten 9" next to "won 9"): keep the stronger statement.
    implied = {"UNB": "W", "WL": "L", "ND": "W", "SC": "O0.5", "O1.5": "O2.5", "U3.5": "U2.5", "CON": "BTTS_Y"}
    best = {(t["e"], t["s"]): t["n"] for t in out}
    out = [t for t in out if not (t["e"] in implied and best.get((implied[t["e"]], t["s"]), 0) >= t["n"])]
    return sorted(out, key=lambda t: -t["n"])


def team_stats(df: pd.DataFrame, team: str) -> dict:
    r = team_rows(df, team)
    if r.empty:
        return {}
    season = r[r["season"] == df["season"].iloc[-1]]
    last = r.tail(10).iloc[::-1]
    res = np.where(r["gf"] > r["ga"], "W", np.where(r["gf"] == r["ga"], "D", "L"))
    ht = lambda v: None if pd.isna(v) else int(v)  # noqa: E731
    l5 = r.tail(5)
    return {
        "form": "".join(res[-5:]),
        "last": [[str(x.date.date()), x.opp, x.venue, int(x.gf), int(x.ga), ht(x.htgf), ht(x.htga)] for x in last.itertuples()],
        "rates": {"l10": rate(r.tail(10)), "all": rate(season),
                  "home": rate(season[season["venue"] == "H"]), "away": rate(season[season["venue"] == "A"])},
        "avg5": [round(float(l5["gf"].mean()), 2), round(float(l5["ga"].mean()), 2)],
        "trends": streaks(season if len(season) >= 8 else r.tail(20)),
    }


def h2h(df: pd.DataFrame, home: str, away: str, n: int = 6) -> list[list]:
    m = df[((df["home"] == home) & (df["away"] == away)) | ((df["home"] == away) & (df["away"] == home))]
    return [[str(x.date.date()), x.home, x.away, int(x.hg), int(x.ag)] for x in m.tail(n).iloc[::-1].itertuples()]


# --------------------------------------------------------------------------- #
# League views
# --------------------------------------------------------------------------- #

def standings(df: pd.DataFrame, teams: list[str]) -> list[dict]:
    """Current-season table: [played, won, drawn, lost, for, against, points] in total, home and away."""
    season = df[df["season"] == df["season"].iloc[-1]]
    rows = []
    for t in teams:
        r = team_rows(season, t)
        if r.empty:
            continue

        def line(x: pd.DataFrame) -> list[int]:
            w, d = int((x["gf"] > x["ga"]).sum()), int((x["gf"] == x["ga"]).sum())
            return [len(x), w, d, len(x) - w - d, int(x["gf"].sum()), int(x["ga"].sum()), 3 * w + d]

        res = np.where(r["gf"] > r["ga"], "W", np.where(r["gf"] == r["ga"], "D", "L"))
        rows.append({"team": t, "all": line(r), "home": line(r[r["venue"] == "H"]),
                     "away": line(r[r["venue"] == "A"]), "form": "".join(res[-5:])})
    return sorted(rows, key=lambda x: (-x["all"][6], -(x["all"][4] - x["all"][5]), -x["all"][4], x["team"]))


def league_profile(df: pd.DataFrame) -> dict:
    """How often each market lands in the league this season, plus averages."""
    season = df[df["season"] == df["season"].iloc[-1]]
    s = season if len(season) >= 30 else df.tail(300)
    hg, ag = s["hg"].to_numpy(), s["ag"].to_numpy()
    t = hg + ag
    rates = {"1": (hg > ag).mean(), "X": (hg == ag).mean(), "2": (hg < ag).mean(), "BTTS_Y": ((hg > 0) & (ag > 0)).mean()}
    for line in (*GOAL_LINES, 5.5):
        rates[f"O{line}"] = (t > line).mean()
    out = {"n": int(len(s)), "season": str(s["season"].iloc[-1]), "goals": round(float(t.mean()), 2),
           "home_goals": round(float(hg.mean()), 2), "away_goals": round(float(ag.mean()), 2),
           "rates": {k: round(float(v), 4) for k, v in rates.items()}}
    ht = s.dropna(subset=["hthg", "htag"])
    if len(ht) >= 20 and (ht["hg"] + ht["ag"]).sum():
        out["h1_share"] = round(float((ht["hthg"] + ht["htag"]).sum() / (ht["hg"] + ht["ag"]).sum()), 4)
        out["rates"]["HT_O0.5"] = round(float(((ht["hthg"] + ht["htag"]) > 0).mean()), 4)
        out["rates"]["HT_O1.5"] = round(float(((ht["hthg"] + ht["htag"]) > 1).mean()), 4)
    for key, (a, b) in {"corners": ("hc", "ac"), "yellows": ("hy", "ay"), "reds": ("hr", "ar")}.items():
        x = s.dropna(subset=[a, b])
        if len(x) >= 20:
            out[key] = round(float((x[a] + x[b]).mean()), 2)
    return out
