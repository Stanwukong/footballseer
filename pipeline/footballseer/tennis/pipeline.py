"""Tennis job: rate every player from recent results and export JSON for the web app.

    python -m footballseer tennis run

Upcoming matches aren't predicted here. The web app reads them live from
SportyBet and prices each one from these ratings, so writes go only to
web/public/data/tennis/: ratings.json, backtest.json, players.json (each
listed player's stats, see stats.py) and matches.json (every result with both
players' pre-match Elos, for recent matches, head-to-heads and rating history).
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd

from ..basketball.pipeline import ROOT
from ..sources import today_utc
from . import model, sources, stats

log = logging.getLogger(__name__)

OUT = ROOT / "web" / "public" / "data" / "tennis"
HISTORY_DAYS = 3 * 365    # results the ratings are built from
ACTIVE_DAYS = 365         # a player is listed if they played this recently
MIN_MATCHES = 5
BACKTEST_DAYS = 365       # the walk-forward window scored for the track record
BINS = 10


def _write(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    log.info("wrote tennis/%s (%.0f KB)", name, (OUT / name).stat().st_size / 1024)


def scores(p: np.ndarray, y: np.ndarray) -> dict:
    """Accuracy, log loss, Brier and calibration of chances p for outcomes y (1 = happened)."""
    q = np.clip(p, 1e-6, 1 - 1e-6)
    out = {
        "n": int(len(p)),
        "accuracy": round(float(np.mean((p > 0.5) == (y == 1))), 4),
        "logloss": round(float(-np.mean(y * np.log(q) + (1 - y) * np.log(1 - q))), 4),
        "brier": round(float(np.mean((p - y) ** 2)), 4),
        "calibration": [],
    }
    bins = np.minimum((p * BINS).astype(int), BINS - 1)
    for b in range(BINS):
        m = bins == b
        if m.sum():
            out["calibration"].append({"bin": b, "n": int(m.sum()), "predicted": round(float(p[m].mean()), 4), "actual": round(float(y[m].mean()), 4)})
    return out


def calibrate(df: pd.DataFrame, gap: np.ndarray, today: date) -> float:
    """Fit the Elo gap scale on matches before the backtest window, so the backtest never sees its own fit."""
    since = pd.Timestamp(today - timedelta(days=BACKTEST_DAYS))
    m = (df["date"] < since).to_numpy() & ~np.isnan(gap) & (df["status"] == "final").to_numpy()
    return model.fit_scale(gap[m], df["best_of"].to_numpy()[m], (df["winner"].to_numpy()[m] == 1).astype(float))


def backtest_json(df: pd.DataFrame, gap: np.ndarray, scale: float, today: date) -> dict:
    since = pd.Timestamp(today - timedelta(days=BACKTEST_DAYS))
    keep = (df["date"] >= since).to_numpy() & ~np.isnan(gap) & (df["status"] == "final").to_numpy()
    sub = df[keep]
    y = (sub["winner"] == 1).to_numpy().astype(float)
    if not len(sub):
        return {"from": None, "to": None, "overall": None, "tours": {}}
    p = model.price(gap[keep], sub["best_of"].to_numpy(), scale)
    # p1 is whoever ESPN listed first, so p spans both sides of 50% and calibration covers the whole range.
    tours = {t: scores(p[(sub["tour"] == t).to_numpy()], y[(sub["tour"] == t).to_numpy()]) for t in sorted(sub["tour"].unique())}
    return {"from": f"{sub['date'].min():%Y-%m-%d}", "to": f"{sub['date'].max():%Y-%m-%d}", "overall": scores(p, y), "tours": tours}


def ratings_json(r: model.Ratings, df: pd.DataFrame, today: date) -> list[dict]:
    tour_of = {**dict(zip(df["p1_id"], df["tour"])), **dict(zip(df["p2_id"], df["tour"]))}
    country = {**dict(zip(df["p1_id"], df["p1_country"])), **dict(zip(df["p2_id"], df["p2_country"]))}
    cutoff = f"{today - timedelta(days=ACTIVE_DAYS):%Y-%m-%d}"
    rows = [
        {"id": pid, "name": p.name, "tour": tour_of[pid], "country": country.get(pid, ""), "elo": round(p.elo, 1), "n": p.n,
         "last": p.last, "form": p.form, "peak": round(p.peak, 1) if p.peak_day else None, "peak_day": p.peak_day or None}
        for pid, p in r.players.items()
        if p.n >= MIN_MATCHES and p.last >= cutoff
    ]
    rows.sort(key=lambda x: -x["elo"])
    for tour in ("ATP", "WTA"):
        for k, row in enumerate(x for x in rows if x["tour"] == tour):
            row["rank"] = k + 1
    return rows


def matches_json(df: pd.DataFrame, elos: np.ndarray, r: model.Ratings) -> dict:
    """Every result, compactly: tournaments and rounds as indexes into their own lists.
    Each row is [date, event, round, p1_id, p2_id, winner, sets, best_of, retired, p1_elo, p2_elo] with pre-match Elos."""
    events = list(dict.fromkeys(zip(df["event"], df["surface"])))
    rounds = list(dict.fromkeys(df["round"]))
    ev, rd = {e: k for k, e in enumerate(events)}, {x: k for k, x in enumerate(rounds)}
    rows = [
        [f"{m.date:%Y-%m-%d}", ev[(m.event, m.surface)], rd[m.round], m.p1_id, m.p2_id, int(m.winner), m.sets, int(m.best_of),
         int(m.status == "retired"), round(float(e[0]), 1), round(float(e[1]), 1)]
        for m, e in zip(df.itertuples(index=False), elos)
    ]
    return {"events": [list(e) for e in events], "rounds": rounds, "names": {pid: p.name for pid, p in r.players.items()}, "rows": rows}


def run(today: date | None = None) -> None:
    today = today or today_utc()
    df = sources.load_matches(today, today - timedelta(days=HISTORY_DAYS))
    if df.empty:
        raise RuntimeError("no tennis results downloaded")
    r, gap, elos = model.walk(df)
    scale = calibrate(df, gap, today)
    players = ratings_json(r, df, today)
    bt = backtest_json(df, gap, scale, today)
    rank = {p["id"]: p["rank"] for p in players}
    profile = stats.player_stats(df, elos, scale, rank, set(rank), today)
    _write("ratings.json", {"as_of": f"{today:%Y-%m-%d}", "matches": len(df), "from": f"{df['date'].min():%Y-%m-%d}", "scale": scale, "players": players})
    _write("backtest.json", bt)
    _write("players.json", {"as_of": f"{today:%Y-%m-%d}", "players": profile})
    _write("matches.json", matches_json(df, elos, r))
    if bt["overall"]:
        o = bt["overall"]
        log.info("tennis backtest: %d matches, scale %.2f, accuracy %.1f%%, log loss %.3f", o["n"], scale, 100 * o["accuracy"], o["logloss"])
