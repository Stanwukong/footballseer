"""Basketball jobs: predict upcoming games, backtest, and export JSON for the web app.

    python -m footballseer basketball run        # daily: fit, predict, settle, export
    python -m footballseer basketball backtest   # walk-forward history for the track record

Output goes to web/public/data/basketball/, the ledger and backtest to data/basketball/.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from ..pipeline import slug
from ..sources import today_utc
from . import markets as mk
from . import model, sources, stats
from .leagues import ALL, BY_CODE, League

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "web" / "public" / "data" / "basketball"
LEDGER = ROOT / "data" / "basketball" / "ledger.csv"
BACKTEST = ROOT / "data" / "basketball" / "backtest.csv"

# Markets we can have bookmaker prices for, and the column holding the price.
ODDS_MARKETS = {"1": "odds_h", "2": "odds_a", "SP_H": "odds_sph", "SP_A": "odds_spa", "TO_O": "odds_o", "TO_U": "odds_u"}
LINE_COLS = [f"ln_{k}" for k in mk.LINE_KEYS]
SCORE_COLS = ["hg", "ag", "h1h", "h1a", *sources.QUARTER_COLS]
VALUE_EDGE = 0.05
VALUE_MAX_ODDS = 6.0
CURRENT_DAYS = 240   # a team is current if it played this close to the league's latest game
MIN_GAMES = 150      # leagues with less history aren't modelled
HORIZON = 7


def match_id(league: str, d: pd.Timestamp, home: str, away: str) -> str:
    return f"{league}-{d:%Y%m%d}-{slug(home)}-{slug(away)}"


# --------------------------------------------------------------------------- #
# Prediction
# --------------------------------------------------------------------------- #

def predict_frame(r: model.Ratings, games: pd.DataFrame) -> pd.DataFrame:
    """Add expected points, the lines priced, and one probability column per market."""
    rows = []
    for g in games.itertuples():
        eh, ea = r.expected(g.home, g.away, bool(g.neutral))
        ln = mk.lines_for(r, eh, ea, getattr(g, "spread", np.nan), getattr(g, "total", np.nan))
        rows.append({"eh": eh, "ea": ea, **{f"ln_{k}": v for k, v in ln.items()}, **mk.markets(r, eh, ea, ln)})
    out = pd.concat([games.reset_index(drop=True), pd.DataFrame(rows)], axis=1)
    out.insert(0, "id", [match_id(r.league, d, h, a) for d, h, a in zip(out["date"], out["home"], out["away"])])
    return out


def current_teams(df: pd.DataFrame) -> list[str]:
    last = pd.concat([df[["home", "date"]].rename(columns={"home": "team"}),
                      df[["away", "date"]].rename(columns={"away": "team"})]).groupby("team")["date"].agg(["max", "count"])
    keep = (last["max"] >= last["max"].max() - pd.Timedelta(days=CURRENT_DAYS)) & (last["count"] >= 5)
    return sorted(last[keep].index)


def value_bets(row) -> list[dict]:
    out = []
    for m, col in ODDS_MARKETS.items():
        odds = row.get(col)
        if odds is None or not np.isfinite(odds) or odds <= 1 or odds > VALUE_MAX_ODDS:
            continue
        edge = row[m] * odds - 1
        if edge > VALUE_EDGE:
            out.append({"market": m, "p": round(row[m], 4), "odds": round(float(odds), 3), "edge": round(edge, 4)})
    return sorted(out, key=lambda v: -v["edge"])


def _load_all(today: date, seasons: int) -> dict[str, pd.DataFrame]:
    def load(lg: League):
        try:
            return lg.code, sources.load_games(lg, today, seasons, HORIZON)
        except Exception:
            log.exception("%s: failed to load", lg.code)
            return lg.code, pd.DataFrame()

    with ThreadPoolExecutor(max_workers=2) as ex:
        games = dict(ex.map(load, ALL))
    for code, df in games.items():
        log.info("%-5s %5d games", code, len(df))
    return games


# --------------------------------------------------------------------------- #
# Ledger
# --------------------------------------------------------------------------- #

def _read(path: Path) -> pd.DataFrame:
    if path.exists():
        return pd.read_csv(path, parse_dates=["date"])
    return pd.DataFrame()


def update_ledger(preds: pd.DataFrame, results: dict[str, pd.DataFrame], today: date) -> pd.DataFrame:
    ledger = _read(LEDGER)
    if not preds.empty:
        new = preds.drop(columns=[c for c in (*SCORE_COLS, "ot") if c in preds]).copy()
        new["predicted_at"] = str(today)
        if not ledger.empty:
            # Keep the latest pre-tip-off prediction; never touch settled rows.
            ledger = ledger[~ledger["id"].isin(new["id"]) | ledger["hg"].notna()]
            new = new[~new["id"].isin(ledger["id"])]
        ledger = pd.concat([ledger, new], ignore_index=True)
    if ledger.empty:
        return ledger
    for c in SCORE_COLS:
        if c not in ledger:
            ledger[c] = np.nan
    res = [df for df in results.values() if not df.empty]
    open_ = ledger[ledger["hg"].isna()]
    if res and not open_.empty:
        # By the source's game id: these leagues play back-to-backs against the same opponent,
        # so teams and date alone can settle a prediction against the wrong game.
        all_res = pd.concat(res, ignore_index=True)[["league", "id", *SCORE_COLS]].rename(columns={"id": "gid"})
        all_res["gid"] = all_res["gid"].astype(str)
        m = open_[["id", "league", "gid"]].astype({"gid": str}).merge(all_res, on=["league", "gid"]).drop_duplicates("id").set_index("id")
        before = ledger["hg"].notna().sum()
        for c in SCORE_COLS:
            ledger[c] = ledger[c].astype(float).fillna(ledger["id"].map(m[c].astype(float)))
        log.info("settled %d predictions", int(ledger["hg"].notna().sum() - before))
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    ledger.sort_values(["date", "league"]).to_csv(LEDGER, index=False, float_format="%.4f")
    return ledger


# --------------------------------------------------------------------------- #
# Track record
# --------------------------------------------------------------------------- #

TRACK_MARKETS = ["1", "2", "SP_H", "SP_A", "TO_O", "TO_U", "HT_O", "AT_O", "WM_H6", "WM_A6", "WM_C5",
                 "H1_1", "H1_2", "H1_SP_H", "H1_O", "H1_U", "H2_1", "H2_2", "H2_O", "H2_U",
                 "Q1_1", "Q1_2", "Q1_O", "Q4_O", "HF_11", "HF_22"]


def _ll(p: np.ndarray, y: np.ndarray) -> float:
    return float(-np.log(np.clip(np.where(y, p, 1 - p), 1e-9, 1)).mean())


def summarize(df: pd.DataFrame) -> dict | None:
    df = df.dropna(subset=["hg", "ag"]).reset_index(drop=True)
    if df.empty:
        return None
    for c in (*SCORE_COLS, *LINE_COLS, *ODDS_MARKETS.values(), "spread", "total"):
        if c not in df:
            df[c] = np.nan
    won = mk.settle_frame(df)
    out: dict = {"games": int(len(df)), "from": str(df["date"].min().date()), "to": str(df["date"].max().date()), "markets": {}}

    for m in TRACK_MARKETS:
        if m not in df:
            continue
        p, w = df[m].to_numpy(float), won[m]
        ok = ~np.isnan(w) & ~np.isnan(p)
        if ok.sum() < 30:
            continue
        p, w = p[ok], w[ok]
        bins = np.minimum((p * 10).astype(int), 9)
        calib = [{"bin": b / 10, "n": int((bins == b).sum()), "predicted": round(float(p[bins == b].mean()), 4),
                  "actual": round(float(w[bins == b].mean()), 4)} for b in range(10) if (bins == b).sum() >= 10]
        thresholds = [{"min_p": t, "n": int((p >= t).sum()),
                       "hit_rate": round(float(w[p >= t].mean()), 4) if (p >= t).any() else None}
                      for t in (0.5, 0.6, 0.7, 0.8, 0.9)]
        out["markets"][m] = {"brier": round(float(((p - w) ** 2).mean()), 4), "base_rate": round(float(w.mean()), 4),
                             "calibration": calib, "thresholds": thresholds}

    # Moneyline, and the margin and total against the final score.
    y = (df["hg"] > df["ag"]).to_numpy()
    p1 = df["1"].to_numpy(float)
    margin, total = (df["hg"] - df["ag"]).to_numpy(float), (df["hg"] + df["ag"]).to_numpy(float)
    em, et = (df["eh"] - df["ea"]).to_numpy(float), (df["eh"] + df["ea"]).to_numpy(float)
    ml = {"n": int(len(df)), "model_logloss": round(_ll(p1, y), 4), "model_accuracy": round(float(((p1 > 0.5) == y).mean()), 4),
          "margin_mae": round(float(np.abs(em - margin).mean()), 2), "total_mae": round(float(np.abs(et - total).mean()), 2)}
    has_ml = df[["odds_h", "odds_a"]].notna().all(1).to_numpy()
    if has_ml.sum() >= 30:
        imp = 1 / df.loc[has_ml, "odds_h"].to_numpy() / (1 / df.loc[has_ml, "odds_h"].to_numpy() + 1 / df.loc[has_ml, "odds_a"].to_numpy())
        ml |= {"n_with_odds": int(has_ml.sum()), "model_logloss_same": round(_ll(p1[has_ml], y[has_ml]), 4),
               "market_logloss": round(_ll(imp, y[has_ml]), 4), "market_accuracy": round(float(((imp > 0.5) == y[has_ml]).mean()), 4)}
    # Against the bookmaker's lines: how far off each was, and how often the model's side won.
    sp, to = df["spread"].to_numpy(float), df["total"].to_numpy(float)
    has_sp, has_to = np.isfinite(sp), np.isfinite(to)
    if has_sp.sum() >= 30:
        ats = won["SP_H"][has_sp]
        pick_home = df["SP_H"].to_numpy(float)[has_sp] >= 0.5
        hit = np.where(pick_home, ats, 1 - ats)
        ml |= {"n_spread": int(has_sp.sum()), "book_margin_mae": round(float(np.abs(-sp[has_sp] - margin[has_sp]).mean()), 2),
               "model_margin_mae_same": round(float(np.abs(em[has_sp] - margin[has_sp]).mean()), 2),
               "ats_hit": round(float(np.nanmean(hit)), 4)}
    if has_to.sum() >= 30:
        ou = won["TO_O"][has_to]
        pick_over = df["TO_O"].to_numpy(float)[has_to] >= 0.5
        hit = np.where(pick_over, ou, 1 - ou)
        ml |= {"n_total": int(has_to.sum()), "book_total_mae": round(float(np.abs(to[has_to] - total[has_to]).mean()), 2),
               "model_total_mae_same": round(float(np.abs(et[has_to] - total[has_to]).mean()), 2),
               "ou_hit": round(float(np.nanmean(hit)), 4)}
    out["moneyline"] = ml

    vb = {}
    for m, col in ODDS_MARKETS.items():
        odds = df[col].to_numpy(float)
        w = won[m]
        pick = np.isfinite(odds) & (odds > 1) & (odds <= VALUE_MAX_ODDS) & (df[m].to_numpy(float) * odds - 1 > VALUE_EDGE) & ~np.isnan(w)
        profit = np.where(w[pick] == 1, odds[pick] - 1, -1.0)
        vb[m] = {"bets": int(pick.sum()), "hit_rate": round(float(w[pick].mean()), 4) if pick.any() else None,
                 "profit": round(float(profit.sum()), 2), "roi": round(float(profit.mean()), 4) if pick.any() else None}
    bets = sum(v["bets"] for v in vb.values())
    profit = sum(v["profit"] for v in vb.values())
    out["value"] = {"edge_threshold": VALUE_EDGE, "by_market": vb, "bets": bets,
                    "profit": round(profit, 2), "roi": round(profit / bets, 4) if bets else None}

    leagues = []
    for code, g in df.groupby("league"):
        yi, pi = y[g.index], p1[g.index]
        row = {"league": code, "n": int(len(g)), "model_logloss": round(_ll(pi, yi), 4),
               "accuracy": round(float(((pi > 0.5) == yi).mean()), 4),
               "margin_mae": round(float(np.abs(em[g.index] - margin[g.index]).mean()), 2)}
        h = has_ml[g.index]
        if h.sum() >= 20:
            oh, oa = g.loc[h, "odds_h"].to_numpy(), g.loc[h, "odds_a"].to_numpy()
            row["market_logloss"] = round(_ll((1 / oh) / (1 / oh + 1 / oa), yi[h]), 4)
            row["model_logloss_same"] = round(_ll(pi[h], yi[h]), 4)
        leagues.append(row)
    out["leagues"] = sorted(leagues, key=lambda r: -r["n"])

    recent = df.sort_values("date").tail(150)
    out["recent"] = [{
        "id": r["id"], "league": r["league"], "date": str(r["date"].date()), "home": r["home"], "away": r["away"],
        "score": [int(r["hg"]), int(r["ag"])], "p": {k: _clean(r[k]) for k in ("1", "2", "SP_H", "TO_O")},
        "lines": {"sp": _clean(r["ln_sp"]), "to": _clean(r["ln_to"])},
    } for _, r in recent.iterrows()][::-1]
    return out


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

def _write(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    log.info("wrote basketball/%s (%.0f KB)", name, (OUT / name).stat().st_size / 1024)


def _clean(v):
    if isinstance(v, (float, np.floating)):
        return None if not np.isfinite(v) else round(float(v), 4)
    if isinstance(v, (np.integer,)):
        return int(v)
    return v


def _lines(row) -> dict:
    return {**{c[3:]: row[c] for c in LINE_COLS if c in row and pd.notna(row[c])}, "src": row["ln_src"]}


def fixture_json(row: pd.Series, r: model.Ratings, history: pd.DataFrame) -> dict:
    lg = BY_CODE[row["league"]]
    eh, ea = row["eh"], row["ea"]
    ln = _lines(row)
    odds = {k: _clean(row.get(c)) for k, c in ODDS_MARKETS.items()}
    return {
        "id": row["id"], "league": row["league"], "date": str(row["date"].date()), "time": row["time"],
        "kickoff": row["kickoff"], "home": row["home"], "away": row["away"], "neutral": bool(row["neutral"]),
        "pts": [round(eh, 1), round(ea, 1)],
        # Spread of the final margin and total, and the first-half share: the in-play model needs them.
        "sd": [round(r.sigma_m, 2), round(r.sigma_t, 2)],
        "lines": {k: (_clean(v) if k != "src" else v) for k, v in ln.items()},
        "p": {k: row[k] for k in mk.MARKETS if k in row and pd.notna(row[k])},
        "bands": mk.bands(r, eh, ea),
        "ladders": mk.ladders(r, eh, ea, ln),
        "odds": odds if any(v is not None for v in odds.values()) else None,
        "value": value_bets(row),
        "h2h": stats.h2h(history, row["home"], row["away"]),
        # Live data: ESPN events by "slug/id"; EuroLeague games by "E|U/identifier".
        "live": f"{lg.slug}/{row['gid']}",
    }


RESULT_DAYS = 7
# The scanner backtests these; it derives unders as 1 − p. Period spreads are left out: with no
# historical lines they're priced at the model's own line, a coin flip by construction.
BACKTEST_MARKETS = [*mk.GAME_MARKETS, *[f"{p}_{o}" for p in model.PERIODS for o in ("1", "X", "2", "O")], *mk.HTFT]
BACKTEST_LINES = ["ln_sp", "ln_to", "ln_ht", "ln_at", *[f"ln_{p}to" for p in model.PERIODS]]
BACKTEST_COLS = [*BACKTEST_MARKETS, *BACKTEST_LINES, "eh", "ea", *ODDS_MARKETS.values()]


def results_json(ledger: pd.DataFrame, bt: pd.DataFrame, today: date) -> list[dict]:
    """Every prediction from the last RESULT_DAYS days, for the lookback; the
    backtest stands in on days without live predictions."""
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
    for c in (*SCORE_COLS, *LINE_COLS, *mk.MARKETS, "time", *ODDS_MARKETS.values()):
        if c not in done:
            done[c] = np.nan
    done = done.sort_values(["date", "time"], na_position="last")
    num = lambda v: None if pd.isna(v) else int(v)  # noqa: E731
    per = model.period_scores(done)
    pos = {i: j for j, i in enumerate(done.index)}
    return [{
        "id": r["id"], "source": r["source"], "league": r["league"], "date": str(r["date"].date()),
        "time": r["time"] if isinstance(r["time"], str) else None, "home": r["home"], "away": r["away"],
        "pts": [round(r["eh"], 1), round(r["ea"], 1)],
        "score": [num(r["hg"]), num(r["ag"])] if pd.notna(r["hg"]) else None,
        # Points per period, for settling half and quarter picks.
        "per": {p: [num(h[pos[i]]), num(a[pos[i]])] for p, (h, a) in per.items() if pd.notna(h[pos[i]]) and pd.notna(a[pos[i]])},
        "lines": {k[3:]: _clean(r[k]) for k in LINE_COLS if pd.notna(r[k])},
        "p": {k: _clean(r[k]) for k in mk.MARKETS if pd.notna(r[k])},
        "odds": {k: _clean(r.get(c)) for k, c in ODDS_MARKETS.items()},
    } for i, r in done.iterrows()]


def backtest_json(bt: pd.DataFrame) -> dict:
    """Columnar copy of the walk-forward predictions, for the browser-side scanner."""
    bt = bt.dropna(subset=["hg", "ag"]).sort_values("date")
    for c in BACKTEST_COLS + SCORE_COLS:
        if c not in bt:
            bt[c] = np.nan
    cols = {c: [None if pd.isna(v) else round(float(v), 3 if c in mk.LABELS else 1) for v in bt[c]] for c in BACKTEST_COLS}
    num = lambda s: [None if pd.isna(v) else int(v) for v in s]  # noqa: E731
    return {"n": int(len(bt)), "league": bt["league"].tolist(), "date": bt["date"].dt.strftime("%Y-%m-%d").tolist(),
            **{c: num(bt[c]) for c in SCORE_COLS}, **cols}


def league_json(lg: League, r: model.Ratings, df: pd.DataFrame, known: list[str], n_fixtures: int) -> dict:
    teams = []
    for t in known:
        off, dfn = r.rating(t)
        # Points for and against a league-average side at a neutral site.
        teams.append({"team": t, "off": round(off, 2), "dfn": round(dfn, 2),
                      "pf": round(r.mu + off, 1), "pa": round(r.mu + dfn, 1), "net": round(off - dfn, 1)})
    teams.sort(key=lambda x: -x["net"])
    return {
        "code": lg.code, "country": lg.country, "name": lg.name, "tier": lg.tier, "tz": lg.tz_label,
        "periods": lg.periods, "minutes": lg.minutes,
        **{k: v for k, v in r.to_dict().items() if k in ("mu", "hfa", "sigma_m", "sigma_t", "per", "avg_total")},
        "games": r.n_games, "last_game": r.last_game, "fixtures": n_fixtures,
        "teams": teams,
        "standings": stats.standings(df, known),
        "profile": stats.league_profile(df),
    }


def run(today: date | None = None) -> None:
    today = today or today_utc()
    log.info("basketball run for %s", today)
    games = _load_all(today, seasons=3)

    ratings: dict[str, model.Ratings] = {}
    results: dict[str, pd.DataFrame] = {}
    known: dict[str, list[str]] = {}
    preds = []
    for lg in ALL:
        df = games.get(lg.code, pd.DataFrame())
        if df.empty:
            continue
        res, fix = sources.split(df, today, HORIZON)
        if len(res) < MIN_GAMES:
            log.info("%s: only %d games, skipped", lg.code, len(res))
            continue
        results[lg.code] = res
        ratings[lg.code] = r = model.fit(res, as_of=pd.Timestamp(today), xi=lg.xi, reg=lg.reg, league=lg.code)
        known[lg.code] = current_teams(res)
        if not fix.empty:
            p = predict_frame(r, fix.rename(columns={"id": "gid"}))
            preds.append(p)
    preds = pd.concat(preds, ignore_index=True) if preds else pd.DataFrame()
    log.info("%d upcoming games across %d leagues", len(preds), preds["league"].nunique() if len(preds) else 0)

    ledger = update_ledger(preds.drop(columns=["home_id", "away_id"], errors="ignore"), results, today)

    _write("fixtures.json", [fixture_json(row, ratings[row["league"]], results[row["league"]])
                             for _, row in preds.sort_values(["date", "kickoff"]).iterrows()] if len(preds) else [])
    _write("teams.json", {c: {t: stats.team_stats(results[c], t) for t in known[c]} for c in ratings})
    bt = _read(BACKTEST)
    _write("results.json", results_json(ledger, bt, today))
    if not bt.empty:
        _write("backtest.json", backtest_json(bt))
    _write("leagues.json", [league_json(lg, ratings[lg.code], results[lg.code], known[lg.code],
                                        int((preds["league"] == lg.code).sum()) if len(preds) else 0)
                            for lg in ALL if lg.code in ratings])
    _write("track_record.json", {"live": summarize(ledger) if not ledger.empty else None,
                                 "backtest": summarize(bt) if not bt.empty else None})
    _write("meta.json", {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "as_of": str(today), "leagues": len(ratings), "fixtures": int(len(preds)),
        "value_bets": int(sum(len(value_bets(r)) for _, r in preds.iterrows())) if len(preds) else 0,
        "data_source": "ESPN · EuroLeague",
        "labels": mk.LABELS,
    })


def backtest(start: str, today: date | None = None, refit_days: int = 7) -> None:
    """Walk-forward: refit every `refit_days` using only games before the cutoff.
    ESPN keeps no historical odds, so lines are the model's own (spread) and the
    league's trailing average (total), as for any game without a book."""
    today = today or today_utc()
    games = _load_all(today, seasons=3)
    rows = []
    for lg in ALL:
        df = games.get(lg.code, pd.DataFrame())
        if df.empty:
            continue
        res, _ = sources.split(df, today, HORIZON)
        n = 0
        for c in pd.date_range(pd.Timestamp(start), pd.Timestamp(today), freq=f"{refit_days}D"):
            test = res[(res["date"] >= c) & (res["date"] < c + pd.Timedelta(days=refit_days))]
            train = res[res["date"] < c]
            if test.empty or len(train) < MIN_GAMES:
                continue
            r = model.fit(train, as_of=c - pd.Timedelta(days=1), xi=lg.xi, reg=lg.reg, league=lg.code)
            test = test[test["home"].isin(r.teams) & test["away"].isin(r.teams)]
            if test.empty:
                continue
            rows.append(predict_frame(r, test.drop(columns=sources.ODDS_COLS).rename(columns={"id": "gid"})))
            n += len(test)
        log.info("%-5s backtested %d games", lg.code, n)
    bt = pd.concat(rows, ignore_index=True).drop(columns=["home_id", "away_id"], errors="ignore")
    BACKTEST.parent.mkdir(parents=True, exist_ok=True)
    bt.to_csv(BACKTEST, index=False, float_format="%.4f")
    s = summarize(bt)
    log.info("backtest: %d games; moneyline %s", s["games"], s["moneyline"])
