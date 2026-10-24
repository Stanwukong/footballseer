"""Descriptive statistics from game history: standings, form, head-to-head,
per-team event rates, streaks ("trends") and league profiles.

Points lines differ by league (an NBA game totals ~225, NCAA ~145), so the
totals events are relative to the league's own season average: "over" means a
higher-scoring game than that league's norm.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

STREAK_MIN = 3
CLOSE = 5   # "close game": decided by this many points or fewer
BIG = 10    # "big win/loss"


def season_of(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["season"] == df["season"].iloc[-1]]


def averages(df: pd.DataFrame) -> tuple[float, float]:
    """(average total, average team score) this season, falling back to recent games early on."""
    s = season_of(df)
    s = s if len(s) >= 30 else df.tail(200)
    t = float((s["hg"] + s["ag"]).mean())
    return t, t / 2


# --------------------------------------------------------------------------- #
# Team views
# --------------------------------------------------------------------------- #

def team_rows(df: pd.DataFrame, team: str) -> pd.DataFrame:
    """One row per game from `team`'s side, oldest first. Venue N is a neutral site."""
    def side(g: pd.DataFrame, us: str, them: str) -> pd.DataFrame:
        home = us == "home"
        return pd.DataFrame({
            "date": g["date"], "season": g["season"], "opp": g[them],
            "venue": np.where(g["neutral"], "N", "H" if home else "A"),
            "pf": g["hg" if home else "ag"], "pa": g["ag" if home else "hg"],
            "h1f": g["h1h" if home else "h1a"], "h1a": g["h1a" if home else "h1h"], "ot": g["ot"],
            "q1f": g["q1h" if home else "q1a"] if "q1h" in g else np.nan,
            "q1a": g["q1a" if home else "q1h"] if "q1h" in g else np.nan,
        })
    return pd.concat([side(df[df["home"] == team], "home", "away"),
                      side(df[df["away"] == team], "away", "home")]).sort_values("date").reset_index(drop=True)


def events(r: pd.DataFrame, avg_total: float, avg_team: float) -> dict[str, np.ndarray]:
    """Boolean event arrays for a team's games; missing half-time scores count as False."""
    pf, pa = r["pf"].to_numpy(float), r["pa"].to_numpy(float)
    m, t = pf - pa, pf + pa
    m1 = (r["h1f"] - r["h1a"]).to_numpy(float)
    m2 = m - m1
    q1 = (r["q1f"] - r["q1a"]).to_numpy(float)
    return {
        "W": m > 0, "L": m < 0, "W10": m >= BIG, "L10": m <= -BIG, "CLOSE": np.abs(m) <= CLOSE,
        "OVR": t > avg_total, "UND": t < avg_total, "SA": pf > avg_team, "CA": pa > avg_team,
        "H1W": m1 > 0, "H1L": m1 < 0, "CB": (m1 < 0) & (m > 0), "OT": r["ot"].to_numpy(bool),
        "H2W": m2 > 0, "H2L": m2 < 0, "Q1W": q1 > 0, "Q1L": q1 < 0,
    }


RATE_EVENTS = ["W", "L", "W10", "L10", "CLOSE", "OVR", "UND", "SA", "CA", "H1W", "H1L", "H2W", "H2L", "Q1W", "Q1L", "CB", "OT"]
H1_EVENTS = {"H1W", "H1L", "H2W", "H2L", "CB"}  # need half-time scores: denominator nh1
Q_EVENTS = {"Q1W", "Q1L"}  # need quarter scores: denominator nq
TREND_EVENTS = ["W", "L", "W10", "L10", "OVR", "UND", "SA", "CA", "H1W", "H1L", "H2W", "Q1W"]


def rate(r: pd.DataFrame, avg_total: float, avg_team: float) -> dict:
    """Hit counts over a set of games. `n` is the denominator, except for
    half-time events, which use `nh1`, and quarter events, which use `nq`
    (some games lack period scores; NCAA men's has no quarters)."""
    if r.empty:
        return {"n": 0}
    ev = events(r, avg_total, avg_team)
    return {"n": int(len(r)), "nh1": int(r["h1f"].notna().sum()), "nq": int(r["q1f"].notna().sum()), "pf": int(r["pf"].sum()), "pa": int(r["pa"].sum()),
            "c": {e: int(ev[e].sum()) for e in RATE_EVENTS}}


def streaks(r: pd.DataFrame, avg_total: float, avg_team: float) -> list[dict]:
    """Current runs of at least STREAK_MIN games, overall and at this venue."""
    out = []
    for scope, sub in (("all", r), ("home", r[r["venue"] == "H"]), ("away", r[r["venue"] == "A"])):
        if len(sub) < STREAK_MIN:
            continue
        ev = events(sub, avg_total, avg_team)
        has_h1, has_q = sub["h1f"].notna().to_numpy(), sub["q1f"].notna().to_numpy()
        for e in TREND_EVENTS:
            x = ev[e][::-1]
            if e in H1_EVENTS and not has_h1[::-1][:STREAK_MIN].all():
                continue
            if e in Q_EVENTS and not has_q[::-1][:STREAK_MIN].all():
                continue
            n = int(np.argmin(x)) if not x.all() else len(x)
            if n >= STREAK_MIN:
                out.append({"e": e, "n": n, "s": scope})
    # "Won 6" next to "won by 10+ in 6" is noise: keep the stronger statement.
    stronger = {"W": "W10", "L": "L10"}
    best = {(t["e"], t["s"]): t["n"] for t in out}
    out = [t for t in out if not (t["e"] in stronger and best.get((stronger[t["e"]], t["s"]), 0) >= t["n"])]
    return sorted(out, key=lambda t: -t["n"])


def _streak(res: np.ndarray) -> str:
    if not len(res):
        return ""
    last = res[-1]
    n = int(np.argmax(res[::-1] != last)) if (res != last).any() else len(res)
    return f"{last}{n}"


def team_stats(df: pd.DataFrame, team: str) -> dict:
    r = team_rows(df, team)
    if r.empty:
        return {}
    avg_total, avg_team = averages(df)
    season = r[r["season"] == df["season"].iloc[-1]]
    if season.empty:  # between seasons: describe the last one
        season = r[r["season"] == r["season"].iloc[-1]]
    last = r.tail(10).iloc[::-1]
    res = np.where(r["pf"] > r["pa"], "W", "L")
    h1 = lambda v: None if pd.isna(v) else int(v)  # noqa: E731
    l5 = r.tail(5)
    return {
        "form": "".join(res[-5:]),
        "streak": _streak(np.where(season["pf"] > season["pa"], "W", "L")),
        "last": [[str(x.date.date()), x.opp, x.venue, int(x.pf), int(x.pa), h1(x.h1f), h1(x.h1a), bool(x.ot)]
                 for x in last.itertuples()],
        "rates": {"l10": rate(r.tail(10), avg_total, avg_team), "all": rate(season, avg_total, avg_team),
                  "home": rate(season[season["venue"] == "H"], avg_total, avg_team),
                  "away": rate(season[season["venue"] == "A"], avg_total, avg_team)},
        "avg5": [round(float(l5["pf"].mean()), 1), round(float(l5["pa"].mean()), 1)],
        "trends": streaks(season if len(season) >= 6 else r.tail(15), avg_total, avg_team),
    }


def h2h(df: pd.DataFrame, home: str, away: str, n: int = 6) -> list[list]:
    m = df[((df["home"] == home) & (df["away"] == away)) | ((df["home"] == away) & (df["away"] == home))]
    return [[str(x.date.date()), x.home, x.away, int(x.hg), int(x.ag)] for x in m.tail(n).iloc[::-1].itertuples()]


# --------------------------------------------------------------------------- #
# League views
# --------------------------------------------------------------------------- #

def standings(df: pd.DataFrame, teams: list[str]) -> list[dict]:
    """Season table: [played, won, lost, points for, points against] in total, home and away."""
    season = season_of(df)
    rows = []
    for t in teams:
        r = team_rows(season, t)
        if r.empty:
            continue

        def line(x: pd.DataFrame) -> list[int]:
            w = int((x["pf"] > x["pa"]).sum())
            return [len(x), w, len(x) - w, int(x["pf"].sum()), int(x["pa"].sum())]

        res = np.where(r["pf"] > r["pa"], "W", "L")
        rows.append({"team": t, "all": line(r), "home": line(r[r["venue"] == "H"]), "away": line(r[r["venue"] == "A"]),
                     "form": "".join(res[-5:]), "streak": _streak(res)})
    pct = lambda x: x["all"][1] / x["all"][0] if x["all"][0] else 0  # noqa: E731
    return sorted(rows, key=lambda x: (-pct(x), -(x["all"][3] - x["all"][4]) / max(1, x["all"][0]), x["team"]))


def league_profile(df: pd.DataFrame) -> dict:
    """How the league plays this season: scoring, home edge, margins, overtime."""
    season = season_of(df)
    s = season if len(season) >= 30 else df.tail(300)
    hg, ag = s["hg"].to_numpy(float), s["ag"].to_numpy(float)
    m, t = hg - ag, hg + ag
    out = {
        "n": int(len(s)), "season": str(s["season"].iloc[-1]),
        "total": round(float(t.mean()), 1), "home_pts": round(float(hg.mean()), 1), "away_pts": round(float(ag.mean()), 1),
        "margin": round(float(np.abs(m).mean()), 1),
        "rates": {
            "1": round(float((m > 0).mean()), 4), "2": round(float((m < 0).mean()), 4),
            "CLOSE": round(float((np.abs(m) <= CLOSE).mean()), 4), "BIG": round(float((np.abs(m) >= BIG).mean()), 4),
            "BLOW": round(float((np.abs(m) >= 20).mean()), 4), "OT": round(float(s["ot"].mean()), 4),
        },
    }
    h1 = s.dropna(subset=["h1h", "h1a"])
    h1 = h1[~h1["ot"]]
    if len(h1) >= 20:
        out["h1_share"] = round(float((h1["h1h"] + h1["h1a"]).sum() / (h1["hg"] + h1["ag"]).sum()), 4)
        m1 = h1["h1h"] - h1["h1a"]
        out["rates"]["H1_1"] = round(float((m1 > 0).mean()), 4)
        out["rates"]["CB"] = round(float((((m1 < 0) & (h1["hg"] > h1["ag"])) | ((m1 > 0) & (h1["hg"] < h1["ag"]))).mean()), 4)
        out["rates"]["H2_1"] = round(float((((h1["hg"] - h1["h1h"]) - (h1["ag"] - h1["h1a"])) > 0).mean()), 4)
    q = s.dropna(subset=["q1h", "q4h"]) if "q1h" in s else s.iloc[:0]
    q = q[~q["ot"]]
    if len(q) >= 20:
        tot = (q["hg"] + q["ag"]).sum()
        out["q_share"] = [round(float((q[f"q{k}h"] + q[f"q{k}a"]).sum() / tot), 4) for k in range(1, 5)]
        out["rates"]["Q1_1"] = round(float((q["q1h"] > q["q1a"]).mean()), 4)
    return out
