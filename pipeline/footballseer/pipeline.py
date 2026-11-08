"""End-to-end jobs: predict upcoming fixtures, backtest, and export JSON for the web app.

    python -m footballseer run         # daily: fit, predict, settle, export
    python -m footballseer backtest    # walk-forward history for the track record
"""

from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from . import markets as mk
from . import espn, model, sources, stats
from .leagues import ALL, BY_CODE, League

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "data"
LEDGER = ROOT / "data" / "ledger.csv"
BACKTEST = ROOT / "data" / "backtest.csv"

MARKETS = list(mk.LABELS)
# Markets we have bookmaker odds for, and the odds column that prices them.
ODDS_MARKETS = {"1": "odds_h", "X": "odds_d", "2": "odds_a", "O2.5": "odds_o25", "U2.5": "odds_u25"}
VALUE_EDGE = 0.05      # flag when model_prob * odds - 1 exceeds this
VALUE_MAX_ODDS = 8.0   # long shots are where model error is largest
CURRENT_DAYS = 120     # a team is in the league now if it played this close to the league's latest match


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def match_id(league: str, d: pd.Timestamp, home: str, away: str) -> str:
    return f"{league}-{d:%Y%m%d}-{slug(home)}-{slug(away)}"


# --------------------------------------------------------------------------- #
# Prediction
# --------------------------------------------------------------------------- #

def predict_frame(r: model.Ratings, games: pd.DataFrame) -> pd.DataFrame:
    """Add xg_h, xg_a and one probability column per market to `games`."""
    rows = []
    for g in games.itertuples():
        lh, la = r.rates(g.home, g.away)
        rows.append({"xg_h": lh, "xg_a": la, **mk.markets(model.score_matrix(lh, la, r.rho))})
    return pd.concat([games.reset_index(drop=True), pd.DataFrame(rows)], axis=1)


def current_teams(df: pd.DataFrame, today: date) -> list[str]:
    """Teams still in the league: relegated sides stop playing in it, so their
    last match falls well behind the league's latest one."""
    df = df[df["date"] <= pd.Timestamp(today)]
    last = pd.concat([df[["home", "date"]].rename(columns={"home": "team"}),
                      df[["away", "date"]].rename(columns={"away": "team"})]).groupby("team")["date"].max()
    return sorted(last[last >= last.max() - pd.Timedelta(days=CURRENT_DAYS)].index)


def value_bets(row: pd.Series) -> list[dict]:
    out = []
    for m, col in ODDS_MARKETS.items():
        odds = row.get(col)
        if odds is None or not np.isfinite(odds) or odds <= 1 or odds > VALUE_MAX_ODDS:
            continue
        edge = row[m] * odds - 1
        if edge > VALUE_EDGE:
            out.append({"market": m, "p": round(row[m], 4), "odds": round(float(odds), 2), "edge": round(edge, 4)})
    return sorted(out, key=lambda v: -v["edge"])


def _load_all(today: date, seasons: int) -> dict[str, pd.DataFrame]:
    def load(lg: League):
        try:
            return lg.code, sources.load_results(lg, today, seasons)
        except Exception:
            log.exception("%s: failed to load", lg.code)
            return lg.code, pd.DataFrame()

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = dict(ex.map(load, ALL))
    for code, df in results.items():
        log.info("%-4s %5d matches%s", code, len(df), f" (to {df['date'].max().date()})" if len(df) else "")
    return {c: df for c, df in results.items() if len(df) >= 50}


# --------------------------------------------------------------------------- #
# Ledger: every live prediction, settled once the result is in
# --------------------------------------------------------------------------- #

def _read(path: Path) -> pd.DataFrame:
    if path.exists():
        return pd.read_csv(path, parse_dates=["date"])
    return pd.DataFrame()


def update_ledger(preds: pd.DataFrame, results: dict[str, pd.DataFrame], today: date) -> pd.DataFrame:
    ledger = _read(LEDGER)
    if not preds.empty:
        new = preds.copy()
        new["predicted_at"] = str(today)
        if not ledger.empty:
            # Keep the latest pre-kickoff prediction; never touch settled rows.
            ledger = ledger[~ledger["id"].isin(new["id"]) | ledger["hg"].notna()]
            new = new[~new["id"].isin(ledger["id"])]
        ledger = pd.concat([ledger, new], ignore_index=True)

    if ledger.empty:
        return ledger
    if "hg" not in ledger:
        ledger["hg"] = np.nan
        ledger["ag"] = np.nan
    all_res = pd.concat(results.values(), ignore_index=True)[["league", "date", "home", "away", "hg", "ag"]]
    open_ = ledger[ledger["hg"].isna()]
    if not open_.empty:
        # Match on teams within a week of the scheduled date (handles small reschedules).
        m = open_[["id", "league", "home", "away", "date"]].merge(
            all_res, on=["league", "home", "away"], suffixes=("", "_r"))
        m = m[(m["date_r"] - m["date"]).abs() <= pd.Timedelta(days=7)].drop_duplicates("id")
        score = m.set_index("id")[["hg", "ag"]].astype(float)
        before = ledger["hg"].notna().sum()
        ledger["hg"] = ledger["hg"].astype(float).fillna(ledger["id"].map(score["hg"]))
        ledger["ag"] = ledger["ag"].astype(float).fillna(ledger["id"].map(score["ag"]))
        log.info("settled %d predictions", int(ledger["hg"].notna().sum() - before))
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    ledger.sort_values(["date", "league"]).to_csv(LEDGER, index=False, float_format="%.4f")
    return ledger


# --------------------------------------------------------------------------- #
# Track record
# --------------------------------------------------------------------------- #

TRACK_MARKETS = ["1", "X", "2", "1X", "X2", "12", "O1.5", "O2.5", "O3.5", "U2.5", "U3.5", "BTTS_Y", "BTTS_N"]


def _logloss_1x2(p: np.ndarray, outcome: np.ndarray) -> float:
    return float(-np.log(np.clip(p[np.arange(len(p)), outcome], 1e-9, 1)).mean())


def bootstrap_ci(x: np.ndarray, n_boot: int = 2000, level: float = 0.95, seed: int = 0) -> list[float] | None:
    """Percentile bootstrap CI for the mean of per-item values `x`.

    Resamples items with replacement `n_boot` times and takes the (1-level)/2 and
    (1+level)/2 quantiles of the resampled means. Used on paired per-match
    differences (model minus market log-loss) and on per-bet profits, so a change is
    only called real when the interval excludes 0. Fixed seed keeps exports stable.
    """
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if len(x) < 2:
        return None
    rng = np.random.default_rng(seed)
    means = np.empty(n_boot)
    for i in range(0, n_boot, 200):  # chunks keep memory at 200 x n
        k = min(200, n_boot - i)
        means[i:i + k] = x[rng.integers(0, len(x), size=(k, len(x)))].mean(1)
    a = (1 - level) / 2
    return [round(float(np.quantile(means, a)), 4), round(float(np.quantile(means, 1 - a)), 4)]


def _match_logloss_1x2(df: pd.DataFrame) -> pd.Series:
    """Per-match 1X2 log-loss -log p(observed outcome), indexed by match id."""
    o = np.where(df["hg"] > df["ag"], 0, np.where(df["hg"] == df["ag"], 1, 2))
    p = df[["1", "X", "2"]].to_numpy(float)
    return pd.Series(-np.log(np.clip(p[np.arange(len(p)), o], 1e-9, 1)), index=df["id"].to_numpy())


def compare_backtests(base: pd.DataFrame, cand: pd.DataFrame, min_gain: float = 0.001,
                      max_league_loss: float = 0.003) -> dict | None:
    """Paired A/B comparison of two walk-forward backtests (P0-5b).

    Both frames are restricted to the *same* settled matches with full 1X2 odds
    (inner join on `id`), so match-to-match noise cancels: with d_i = LL_cand,i -
    LL_base,i, the mean of d estimates the change in log-loss and its percentile
    bootstrap CI (resampling matches) is far tighter than comparing two unpaired
    means. Negative delta means the candidate is better.

    Acceptance (evaluation protocol): delta <= -min_gain, the CI's upper bound < 0,
    and no league's mean delta worse than +max_league_loss.
    """
    def ready(df: pd.DataFrame) -> pd.DataFrame:
        df = df.dropna(subset=["hg", "ag", "odds_h", "odds_d", "odds_a", "1", "X", "2"])
        return df.drop_duplicates("id").set_index("id", drop=False)

    b, c = ready(base), ready(cand)
    ids = b.index.intersection(c.index)
    if len(ids) < 2:
        return None
    b, c = b.loc[ids], c.loc[ids]
    d = _match_logloss_1x2(c).to_numpy() - _match_logloss_1x2(b).to_numpy()
    leagues = []
    for code, idx in pd.Series(np.arange(len(ids))).groupby(b["league"].to_numpy()):
        dl = d[idx.to_numpy()]
        leagues.append({"league": code, "n": int(len(dl)), "delta": round(float(dl.mean()), 4)})
    delta, ci = float(d.mean()), bootstrap_ci(d)
    worst = max(leagues, key=lambda r: r["delta"])
    accepted = bool(delta <= -min_gain and ci is not None and ci[1] < 0 and worst["delta"] <= max_league_loss)
    return {"n": int(len(ids)), "base_logloss": round(float(_match_logloss_1x2(b).mean()), 4),
            "cand_logloss": round(float(_match_logloss_1x2(c).mean()), 4), "delta": round(delta, 4),
            "delta_ci": ci, "worst_league": worst, "leagues": leagues, "accepted": accepted}


def _rps(p: np.ndarray, outcome: np.ndarray) -> float:
    """Ranked probability score for ordered H/D/A outcomes (lower is better)."""
    o = np.zeros_like(p)
    o[np.arange(len(p)), outcome] = 1
    return float((((np.cumsum(p, 1) - np.cumsum(o, 1))[:, :2]) ** 2).sum(1).mean() / 2)


def summarize(df: pd.DataFrame) -> dict | None:
    df = df.dropna(subset=["hg", "ag"]).reset_index(drop=True)
    if df.empty:
        return None
    won = mk.settle_frame(df["hg"].to_numpy(), df["ag"].to_numpy())
    out: dict = {"matches": int(len(df)), "from": str(df["date"].min().date()),
                 "to": str(df["date"].max().date()), "markets": {}}

    for m in TRACK_MARKETS:
        p, w = df[m].to_numpy(), won[m]
        ok = ~np.isnan(w)
        p, w = p[ok], w[ok]
        bins = np.minimum((p * 10).astype(int), 9)
        calib = [{"bin": b / 10, "n": int((bins == b).sum()), "predicted": round(float(p[bins == b].mean()), 4),
                  "actual": round(float(w[bins == b].mean()), 4)} for b in range(10) if (bins == b).sum() >= 10]
        thresholds = [{"min_p": t, "n": int((p >= t).sum()),
                       "hit_rate": round(float(w[p >= t].mean()), 4) if (p >= t).any() else None}
                      for t in (0.5, 0.6, 0.7, 0.8, 0.9)]
        out["markets"][m] = {"brier": round(float(((p - w) ** 2).mean()), 4), "base_rate": round(float(w.mean()), 4),
                             "calibration": calib, "thresholds": thresholds}

    # 1X2 model vs bookmaker (odds normalised to remove the margin).
    outcome = np.where(df["hg"] > df["ag"], 0, np.where(df["hg"] == df["ag"], 1, 2))
    has_odds = df[["odds_h", "odds_d", "odds_a"]].notna().all(1).to_numpy()
    pm = df[["1", "X", "2"]].to_numpy()
    cmp = {"n": int(len(df)), "model_logloss": round(_logloss_1x2(pm, outcome), 4),
           "model_rps": round(_rps(pm, outcome), 4),
           "model_accuracy": round(float((pm.argmax(1) == outcome).mean()), 4)}
    if has_odds.sum() >= 50:
        imp = 1 / df.loc[has_odds, ["odds_h", "odds_d", "odds_a"]].to_numpy()
        imp = imp / imp.sum(1, keepdims=True)
        o, pmo = outcome[has_odds], pm[has_odds]
        cmp |= {"n_with_odds": int(has_odds.sum()),
                "model_logloss_same": round(_logloss_1x2(pmo, o), 4),
                "market_logloss": round(_logloss_1x2(imp, o), 4),
                "market_rps": round(_rps(imp, o), 4),
                "market_accuracy": round(float((imp.argmax(1) == o).mean()), 4)}
        # Paired per-match gap (model minus market), > 0 means the market is better.
        idx = np.arange(len(o))
        gap = (-np.log(np.clip(pmo[idx, o], 1e-9, 1))) - (-np.log(np.clip(imp[idx, o], 1e-9, 1)))
        cmp |= {"logloss_gap": round(float(gap.mean()), 4), "logloss_gap_ci": bootstrap_ci(gap)}
    out["one_x_two"] = cmp

    # Flat-stake value betting at the recorded (pre-match average) odds.
    vb, profits = {}, []
    for m, col in ODDS_MARKETS.items():
        odds = df[col].to_numpy()
        pick = np.isfinite(odds) & (odds > 1) & (odds <= VALUE_MAX_ODDS) & (df[m].to_numpy() * odds - 1 > VALUE_EDGE)
        w = won[m][pick]
        profit = np.where(w == 1, odds[pick] - 1, -1.0)
        vb[m] = {"bets": int(pick.sum()), "hit_rate": round(float(w.mean()), 4) if pick.any() else None,
                 "profit": round(float(profit.sum()), 2), "roi": round(float(profit.mean()), 4) if pick.any() else None,
                 "roi_ci": bootstrap_ci(profit)}
        profits.append(profit)
    tot_bets = sum(v["bets"] for v in vb.values())
    tot_profit = sum(v["profit"] for v in vb.values())
    out["value"] = {"edge_threshold": VALUE_EDGE, "by_market": vb, "bets": tot_bets,
                    "profit": round(tot_profit, 2), "roi": round(tot_profit / tot_bets, 4) if tot_bets else None,
                    "roi_ci": bootstrap_ci(np.concatenate(profits)) if profits else None}

    # Per-league 1X2 quality, so users can see where the model is weakest.
    leagues = []
    for code, g in df.groupby("league"):
        o = outcome[g.index]
        p = pm[g.index]
        row = {"league": code, "n": int(len(g)), "model_logloss": round(_logloss_1x2(p, o), 4),
               "accuracy": round(float((p.argmax(1) == o).mean()), 4)}
        h = has_odds[g.index]
        if h.sum() >= 30:
            imp = 1 / g.loc[h, ["odds_h", "odds_d", "odds_a"]].to_numpy()
            imp = imp / imp.sum(1, keepdims=True)
            row["market_logloss"] = round(_logloss_1x2(imp, o[h]), 4)
            row["model_logloss_same"] = round(_logloss_1x2(p[h], o[h]), 4)
        leagues.append(row)
    out["leagues"] = sorted(leagues, key=lambda r: -r["n"])

    recent = df.sort_values("date").tail(150)
    out["recent"] = [{
        "id": r["id"], "league": r["league"], "date": str(r["date"].date()), "home": r["home"], "away": r["away"],
        "score": f"{int(r['hg'])}-{int(r['ag'])}", "p": {k: r[k] for k in ("1", "X", "2", "O2.5", "BTTS_Y")},
    } for _, r in recent.iterrows()][::-1]
    return out


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

def _write(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False),
                            encoding="utf-8")
    log.info("wrote %s (%.0f KB)", name, (OUT / name).stat().st_size / 1024)


def _clean(v):
    if isinstance(v, (float, np.floating)):
        return None if not np.isfinite(v) else round(float(v), 4)
    return v


def fixture_json(row: pd.Series, r: model.Ratings, history: pd.DataFrame, share: float,
                 corners: stats.Corners, espn_id: str | None = None) -> dict:
    m = model.score_matrix(row["xg_h"], row["xg_a"], r.rho)
    odds = {k: _clean(row.get(c)) for k, c in ODDS_MARKETS.items()}
    xc = corners.expected(row["home"], row["away"])
    return {
        "id": row["id"], "league": row["league"], "date": str(row["date"].date()),
        "time": row.get("time") if isinstance(row.get("time"), str) else None,
        "home": row["home"], "away": row["away"],
        "xg": [round(row["xg_h"], 2), round(row["xg_a"], 2)],
        "xc": [round(xc[0], 1), round(xc[1], 1)] if xc else None,
        "p": {k: row[k] for k in MARKETS} | stats.period_markets(row["xg_h"], row["xg_a"], share)
             | corners.markets(row["home"], row["away"]),
        "scores": mk.top_scores(m, 8),
        "matrix": [[round(float(v), 4) for v in rowv[:6]] for rowv in m[:6]],
        "odds": odds if any(v is not None for v in odds.values()) else None,
        "value": value_bets(row),
        "h2h": stats.h2h(history, row["home"], row["away"]),
        "espn": espn_id,
    }


RESULT_DAYS = 7
BACKTEST_COLS = ["1", "X", "2", "1X", "X2", "O1.5", "O2.5", "O3.5", "U2.5", "U3.5", "BTTS_Y", "BTTS_N",
                 "odds_h", "odds_d", "odds_a", "odds_o25", "odds_u25"]


def results_json(ledger: pd.DataFrame, bt: pd.DataFrame, today: date,
                 known: dict[str, list[str]] | None = None) -> list[dict]:
    """Every prediction from the last RESULT_DAYS days, settled or not, for the lookback.

    A day uses the live ledger when it has predictions for that day, else the
    walk-forward backtest, marked as such. football-data publishes results a day
    or two late, so games it hasn't settled yet take ESPN's final score; the rest
    go out with score null (still to be confirmed)."""
    lo, hi = pd.Timestamp(today) - pd.Timedelta(days=RESULT_DAYS), pd.Timestamp(today)

    def window(df: pd.DataFrame, source: str) -> pd.DataFrame:
        return df[(df["date"] >= lo) & (df["date"] < hi)].assign(source=source) if not df.empty else df

    live, back = window(ledger, "live"), window(bt, "backtest")
    if not live.empty and not back.empty:
        back = back[~back["date"].isin(live["date"])]
    parts = [d for d in (live, back) if not d.empty]
    if not parts:
        return []
    done = pd.concat(parts, ignore_index=True)
    for col in ("hg", "ag"):
        if col not in done:
            done[col] = np.nan
    done = done.sort_values(["date", "time"], na_position="last").reset_index(drop=True)

    open_ = done[done["hg"].isna()]
    late: dict = {}
    if known and not open_.empty:
        try:
            late = espn.finals(open_, known)
        except Exception:  # a bonus, like live scores; never fail the run over it
            log.exception("ESPN results failed")

    def score(i, r):
        if pd.notna(r["hg"]) and pd.notna(r["ag"]):
            return [int(r["hg"]), int(r["ag"])]
        return late.get(i)

    return [{
        "id": r["id"], "source": r["source"], "league": r["league"], "date": str(r["date"].date()),
        "time": r["time"] if isinstance(r.get("time"), str) else None, "home": r["home"], "away": r["away"],
        "xg": [round(r["xg_h"], 2), round(r["xg_a"], 2)], "score": score(i, r),
        "p": {k: _clean(r[k]) for k in MARKETS},
        "odds": {k: _clean(r.get(c)) for k, c in ODDS_MARKETS.items()},
    } for i, r in done.iterrows()]


def backtest_json(bt: pd.DataFrame) -> dict:
    """Columnar copy of the walk-forward predictions, for the browser-side strategy backtester."""
    bt = bt.dropna(subset=["hg", "ag"]).sort_values("date")
    cols = {c: [None if pd.isna(v) else round(float(v), 3 if c.startswith("odds") else 4) for v in bt[c]]
            for c in BACKTEST_COLS}
    return {"n": int(len(bt)), "league": bt["league"].tolist(), "date": bt["date"].dt.strftime("%Y-%m-%d").tolist(),
            "hg": bt["hg"].astype(int).tolist(), "ag": bt["ag"].astype(int).tolist(), **cols}


def run(today: date | None = None) -> None:
    today = today or sources.today_utc()
    log.info("run for %s", today)
    results = _load_all(today, seasons=3)

    ratings: dict[str, model.Ratings] = {}
    known: dict[str, list[str]] = {}
    for code, df in results.items():
        ratings[code] = model.fit(df, as_of=pd.Timestamp(today), league=code)
        known[code] = current_teams(df, today)

    fixtures = sources.load_fixtures(today, known)
    alerts = sources.fixture_alerts(fixtures, list(known))
    log.info("%d upcoming fixtures across %d leagues", len(fixtures), fixtures["league"].nunique() if len(fixtures) else 0)
    preds = []
    for code, g in fixtures.groupby("league"):
        p = predict_frame(ratings[code], g)
        p.insert(0, "id", [match_id(code, d, h, a) for d, h, a in zip(p["date"], p["home"], p["away"])])
        preds.append(p)
    preds = pd.concat(preds, ignore_index=True) if preds else pd.DataFrame()
    for col in ODDS_MARKETS.values():
        if col not in preds:
            preds[col] = np.nan

    ledger = update_ledger(preds, results, today)

    # ---- JSON for the web app
    try:
        links = espn.link(preds, known)
    except Exception:  # live data is a bonus; never fail the run over it
        log.exception("ESPN linking failed")
        links = {}
    shares = {c: stats.h1_share(df) for c, df in results.items()}
    corners = {c: stats.Corners(df, pd.Timestamp(today)) for c, df in results.items()}
    _write("fixtures.json", [fixture_json(r, ratings[r["league"]], results[r["league"]], shares[r["league"]],
                                          corners[r["league"]], links.get(i))
                             for i, r in preds.sort_values(["date", "time"], na_position="last").iterrows()]
           if len(preds) else [])
    _write("teams.json", {c: {t: stats.team_stats(results[c], t) for t in known[c]} for c in ratings})
    bt = _read(BACKTEST)
    _write("results.json", results_json(ledger, bt, today, known))
    if not bt.empty:
        _write("backtest.json", backtest_json(bt))

    leagues_out = []
    for lg in ALL:
        if lg.code not in ratings:
            continue
        r = ratings[lg.code]
        df = results[lg.code]
        teams = []
        for t in known[lg.code]:
            i = r.index(t)
            # Expected goals vs a league-average side at a neutral venue.
            gf, ga = np.exp(r.mu + r.home_adv / 2 + r.attack[i]), np.exp(r.mu + r.home_adv / 2 + r.defence[i])
            teams.append({"team": t, "attack": round(r.attack[i], 4), "defence": round(r.defence[i], 4),
                          "xgf": round(float(gf), 2), "xga": round(float(ga), 2)})
        teams.sort(key=lambda t: t["xga"] - t["xgf"])
        recent = df[df["date"] >= pd.Timestamp(today) - pd.Timedelta(days=365)]
        leagues_out.append({
            "code": lg.code, "country": lg.country, "name": lg.name, "tier": lg.tier,
            "mu": round(r.mu, 4), "home_adv": round(r.home_adv, 4), "rho": round(r.rho, 4),
            "matches": r.n_matches, "last_match": r.last_match,
            "avg_goals": round(float((recent["hg"] + recent["ag"]).mean()), 2) if len(recent) else None,
            "home_win_rate": round(float((recent["hg"] > recent["ag"]).mean()), 3) if len(recent) else None,
            "fixtures": int((preds["league"] == lg.code).sum()) if len(preds) else 0,
            "teams": teams,
            "standings": stats.standings(df, known[lg.code]),
            "profile": stats.league_profile(df),
        })
    _write("leagues.json", leagues_out)

    track = {"live": summarize(ledger) if not ledger.empty else None,
             "backtest": summarize(_read(BACKTEST)) if BACKTEST.exists() else None,
             "alerts": alerts}
    _write("track_record.json", track)
    _write("meta.json", {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "as_of": str(today), "leagues": len(leagues_out), "fixtures": int(len(preds)),
        "value_bets": int(sum(len(value_bets(r)) for _, r in preds.iterrows())) if len(preds) else 0,
        "data_source": "football-data.co.uk (Wayback mirror)" if sources._fd_down else "football-data.co.uk",
        "labels": mk.LABELS | mk.EXTRA_LABELS,
    })


def backtest(start: str, today: date | None = None, refit_days: int = 7, out: Path | None = None) -> None:
    """Walk-forward: refit every `refit_days` using only matches before the cutoff.

    `out` writes a candidate backtest elsewhere (for `compare`) instead of data/backtest.csv.
    """
    out = Path(out) if out else BACKTEST
    today = today or sources.today_utc()
    results = _load_all(today, seasons=4)
    rows = []
    for code, df in results.items():
        cutoffs = pd.date_range(pd.Timestamp(start), pd.Timestamp(today), freq=f"{refit_days}D")
        n = 0
        for c in cutoffs:
            test = df[(df["date"] >= c) & (df["date"] < c + pd.Timedelta(days=refit_days))]
            train = df[df["date"] < c]
            if test.empty or len(train) < 100:
                continue
            r = model.fit(train, as_of=c - pd.Timedelta(days=1), league=code)
            test = test[test["home"].isin(r.teams) & test["away"].isin(r.teams)]
            if test.empty:
                continue
            p = predict_frame(r, test)
            p.insert(0, "id", [match_id(code, d, h, a) for d, h, a in zip(p["date"], p["home"], p["away"])])
            rows.append(p)
            n += len(p)
        log.info("%-4s backtested %d matches", code, n)
    bt = pd.concat(rows, ignore_index=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    bt.to_csv(out, index=False, float_format="%.4f")
    s = summarize(bt)
    log.info("backtest: %d matches; 1X2 %s; value %s", s["matches"], s["one_x_two"],
             {k: s["value"][k] for k in ("bets", "profit", "roi")})
