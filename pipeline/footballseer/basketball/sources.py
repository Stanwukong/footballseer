"""Download and normalise basketball games.

ESPN (NBA, WNBA, NCAA men's, G League, NBL): each season's scoreboard
calendar lists the days with games, and each day's scoreboard lists the games,
final scores, quarter scores and, for upcoming games, a bookmaker's lines.
ESPN keeps no odds for past games, so history carries none.

EuroLeague / EuroCup: the EuroLeague's public API returns a whole season,
played and upcoming, in one request.

Every loader returns one row per game:
    league, id, date, time, kickoff, home, away, hg, ag, h1h, h1a, q1h..q4h, q1a..q4a, ot, neutral, season
(quarters are empty for NCAA men's, which plays halves) plus, for upcoming ESPN games, the odds columns in ODDS_COLS. `date` and `time`
are in the league's own time zone; `kickoff` is UTC.
"""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import numpy as np
import pandas as pd

from ..sources import fetch
from .leagues import League

log = logging.getLogger(__name__)

ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball"
EUROLEAGUE = "https://api-live.euroleague.net/v2/competitions"

# Home handicap and total, then decimal prices: moneyline, spread, total.
ODDS_COLS = ["spread", "total", "odds_h", "odds_a", "odds_sph", "odds_spa", "odds_o", "odds_u"]
QUARTER_COLS = [f"q{k}{s}" for k in range(1, 5) for s in "ha"]
COLS = ["league", "id", "date", "time", "kickoff", "home", "away", "home_id", "away_id",
        "hg", "ag", "h1h", "h1a", *QUARTER_COLS, "ot", "neutral", "season"]


def _period_scores(row: dict, lg: League, home: list, away: list) -> None:
    """First-half and quarter scores from regulation periods, when every one is present."""
    try:
        home, away = [float(x) for x in home[:lg.periods]], [float(x) for x in away[:lg.periods]]
    except (TypeError, ValueError):
        return
    if len(home) < lg.periods or len(away) < lg.periods:
        return
    half = lg.periods // 2
    row["h1h"], row["h1a"] = sum(home[:half]), sum(away[:half])
    if lg.periods == 4:
        for k in range(4):
            row[f"q{k + 1}h"], row[f"q{k + 1}a"] = home[k], away[k]


def american(v) -> float:
    """American odds ("-110", "+120", "EVEN") as a decimal price, NaN if unreadable."""
    s = str(v).strip().upper()
    if s == "EVEN":
        return 2.0
    try:
        a = float(s)
    except ValueError:
        return float("nan")
    if a >= 100:
        return 1 + a / 100
    if a <= -100:
        return 1 + 100 / -a
    return float("nan")


def _num(v) -> float:
    try:
        return float(str(v).replace("+", "").lstrip("ou"))
    except (TypeError, ValueError):
        return float("nan")


def _fetch(path: str, max_age_hours: float, base: str) -> bytes | None:
    """fetch() with retries: both APIs drop requests under a bulk history download."""
    for attempt in range(4):
        raw = fetch(path, max_age_hours=max_age_hours, base=base)
        if raw is not None:
            return raw
        time.sleep(2 * 2 ** attempt)
    log.warning("gave up on %s/%s", base, path)
    return None


def _local(ts: pd.Timestamp, lg: League) -> tuple[pd.Timestamp, str]:
    loc = ts.tz_convert(lg.tz)
    return pd.Timestamp(loc.date()), f"{loc:%H:%M}"


def _row(lg: League, gid: str, kickoff: str, home: dict, away: dict, **extra) -> dict:
    ts = pd.Timestamp(kickoff)
    ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
    d, t = _local(ts, lg)
    return {"league": lg.code, "id": gid, "date": d, "time": t, "kickoff": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "home": home["name"], "away": away["name"], "home_id": home["id"], "away_id": away["id"], **extra}


# --------------------------------------------------------------------------- #
# ESPN
# --------------------------------------------------------------------------- #

def _espn_json(lg: League, query: str, max_age_hours: float) -> dict:
    extra = f"&groups={lg.groups}&limit=500" if lg.groups else "&limit=500"
    raw = _fetch(f"{lg.slug}/scoreboard?{query}{extra}", max_age_hours, ESPN)
    try:
        return json.loads(raw) if raw else {}
    except ValueError:
        return {}


def _espn_odds(comp: dict) -> dict:
    out = {c: float("nan") for c in ODDS_COLS}
    odds = (comp.get("odds") or [None])[0]
    if not odds:
        return out
    ml, ps, tot = odds.get("moneyline") or {}, odds.get("pointSpread") or {}, odds.get("total") or {}
    close = lambda d, side, k: ((d.get(side) or {}).get("close") or {}).get(k)  # noqa: E731
    out["odds_h"], out["odds_a"] = american(close(ml, "home", "odds")), american(close(ml, "away", "odds"))
    out["spread"] = _num(close(ps, "home", "line"))
    out["odds_sph"], out["odds_spa"] = american(close(ps, "home", "odds")), american(close(ps, "away", "odds"))
    out["total"] = _num(close(tot, "over", "line"))
    out["odds_o"], out["odds_u"] = american(close(tot, "over", "odds")), american(close(tot, "under", "odds"))
    if np.isnan(out["total"]):
        out["total"] = _num(odds.get("overUnder"))
    if np.isnan(out["spread"]) and odds.get("spread") is not None:
        # Older payloads: unsigned spread plus which side is favoured.
        fav_home = (odds.get("homeTeamOdds") or {}).get("favorite")
        s = abs(_num(odds.get("spread")))
        out["spread"] = -s if fav_home else s
    # A real two-way book is 100-115%; anything else is a feed glitch.
    for a, b in (("odds_h", "odds_a"), ("odds_sph", "odds_spa"), ("odds_o", "odds_u")):
        book = 1 / out[a] + 1 / out[b]
        if not (1.0 <= book <= 1.15):
            out[a] = out[b] = float("nan")
    return out


def _espn_events(lg: League, data: dict) -> list[dict]:
    rows = []
    for e in data.get("events", []):
        season = e.get("season") or {}
        comp = (e.get("competitions") or [{}])[0]
        # Preseason and All-Star games tell us nothing about league form.
        if season.get("type") == 1 or (comp.get("type") or {}).get("abbreviation") == "ALLSTAR":
            continue
        sides = {c.get("homeAway"): c for c in comp.get("competitors", [])}
        if "home" not in sides or "away" not in sides:
            continue
        team = lambda c: {"name": c["team"].get("displayName") or c["team"].get("name"), "id": f"{lg.code}:{c['team'].get('id')}"}  # noqa: E731
        try:
            home, away = team(sides["home"]), team(sides["away"])
        except KeyError:
            continue
        st = (e.get("status") or comp.get("status") or {}).get("type", {})
        row = _row(lg, str(e["id"]), e["date"], home, away, neutral=bool(comp.get("neutralSite")),
                   season=str(season.get("year", "")))
        if st.get("completed"):
            try:
                row["hg"], row["ag"] = int(sides["home"]["score"]), int(sides["away"]["score"])
            except (KeyError, TypeError, ValueError):
                continue
            ls = [[x.get("value") for x in sides[s].get("linescores", [])] for s in ("home", "away")]
            _period_scores(row, lg, ls[0], ls[1])
            row["ot"] = max(len(ls[0]), len(ls[1])) > lg.periods
        elif st.get("state") == "pre" and not st.get("name", "").endswith(("POSTPONED", "CANCELED")):
            row |= _espn_odds(comp)
        else:
            continue
        rows.append(row)
    return rows


def _espn_calendar(lg: League, year: int, today: date) -> tuple[list[date], date | None]:
    """Game days of ESPN season `year` (named for the year it ends), and its start."""
    current = year >= today.year
    data = _espn_json(lg, f"dates={year}", max_age_hours=24 if current else 24 * 365)
    league = (data.get("leagues") or [{}])[0]
    start = (league.get("season") or {}).get("startDate")
    days = [pd.Timestamp(c).date() for c in league.get("calendar", []) if isinstance(c, str)]
    return days, (pd.Timestamp(start).date() if start else None)


def _espn_day(lg: League, d: date, today: date) -> list[dict]:
    # Settled days never change; recent ones can still gain late results.
    age = 24 * 365 if d < today - timedelta(days=3) else 2
    return _espn_events(lg, _espn_json(lg, f"dates={d:%Y%m%d}", max_age_hours=age))


def _espn_games(lg: League, today: date, seasons: int, horizon_days: int) -> list[dict]:
    # The last `seasons` seasons with games played, plus a season that has started
    # on paper but not on court (its first games are the fixtures).
    years, played = [], 0
    for y in range(today.year + 1, today.year - seasons - 2, -1):
        days, start = _espn_calendar(lg, y, today)
        if not days or not start or start > today:
            continue
        years.append(days)
        played += min(days) <= today
        if played == seasons:
            break
    days = sorted({d for ds in years for d in ds if d <= today}
                  | {today + timedelta(days=k) for k in range(horizon_days + 1)})
    with ThreadPoolExecutor(max_workers=6) as ex:
        return [r for rows in ex.map(lambda d: _espn_day(lg, d, today), days) for r in rows]


# --------------------------------------------------------------------------- #
# EuroLeague / EuroCup
# --------------------------------------------------------------------------- #

def _euroleague_games(lg: League, today: date, seasons: int) -> list[dict]:
    start = today.year if today.month >= 7 else today.year - 1
    rows = []
    for y in range(start - seasons + 1, start + 1):
        raw = _fetch(f"{lg.slug}/seasons/{lg.slug}{y}/games", 2 if y == start else 24 * 365, EUROLEAGUE)
        try:
            data = json.loads(raw) if raw else {}
        except ValueError:
            continue
        games = data.get("data", data) if isinstance(data, dict) else data
        for g in games or []:
            try:
                club = lambda s: {"name": g[s]["club"]["name"], "id": f"{lg.code}:{g[s]['club']['code']}"}  # noqa: E731
                home, away = club("local"), club("road")
                kickoff = g["utcDate"]
            except (KeyError, TypeError):
                continue
            row = _row(lg, str(g.get("identifier") or g.get("id")), kickoff, home, away,
                       neutral=(g.get("phaseType") or {}).get("code") == "FF", season=str(y))
            if g.get("played"):
                p = [g[s].get("partials") or {} for s in ("local", "road")]
                row["hg"], row["ag"] = int(g["local"]["score"]), int(g["road"]["score"])
                _period_scores(row, lg, *[[x.get(f"partials{k}") for k in range(1, 5)] for x in p])
                row["ot"] = any(bool(x.get("extraPeriods")) for x in p)
            rows.append(row)
    return rows


# --------------------------------------------------------------------------- #
# Public loaders
# --------------------------------------------------------------------------- #

def load_games(lg: League, today: date, seasons: int = 3, horizon_days: int = 7) -> pd.DataFrame:
    """Every game of the last `seasons` seasons plus the next `horizon_days` days, played or not."""
    rows = _espn_games(lg, today, seasons, horizon_days) if lg.source == "espn" else _euroleague_games(lg, today, seasons)
    if not rows:
        return pd.DataFrame(columns=COLS + ODDS_COLS)
    df = pd.DataFrame(rows).drop_duplicates("id", keep="last")
    for c in COLS + ODDS_COLS:
        if c not in df:
            df[c] = np.nan
    df["ot"] = df["ot"].astype("boolean").fillna(False).astype(bool)
    df["neutral"] = df["neutral"].fillna(False).astype(bool)
    # Clubs rename (sponsors, relocations): one team per id, under its latest name.
    df = df.sort_values("kickoff").reset_index(drop=True)
    latest = pd.concat([df[["home_id", "home"]].set_axis(["tid", "name"], axis=1),
                        df[["away_id", "away"]].set_axis(["tid", "name"], axis=1)]).groupby("tid")["name"].last()
    df["home"], df["away"] = df["home_id"].map(latest), df["away_id"].map(latest)
    return df


def split(df: pd.DataFrame, today: date, horizon_days: int = 7) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(results up to today, fixtures from today to the horizon)."""
    played = df["hg"].notna() & df["ag"].notna()
    res = df[played & (df["date"] <= pd.Timestamp(today))].reset_index(drop=True)
    end = pd.Timestamp(today) + pd.Timedelta(days=horizon_days)
    fix = df[~played & (df["date"] >= pd.Timestamp(today)) & (df["date"] <= end)].reset_index(drop=True)
    return res, fix
