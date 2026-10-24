"""Download and normalise match data.

Primary source is football-data.co.uk. When it is unreachable we fall back to
the newest Wayback Machine snapshot of the same file, and for fixtures we fall
back further to openfootball's published season schedules.

Every loader returns a DataFrame with the same core columns:
    league, date, home, away, hg, ag                (results)
    league, date, home, away                        (fixtures)
plus optional odds columns: odds_h, odds_d, odds_a, odds_o25, odds_u25.
"""

from __future__ import annotations

import difflib
import io
import logging
import re
import threading
import time
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from .leagues import ALL, BY_CODE, EXTRA, League

log = logging.getLogger(__name__)

FD = "https://www.football-data.co.uk"
WAYBACK = "https://web.archive.org/web/2099id_/"
OPENFOOTBALL = "https://raw.githubusercontent.com/openfootball/football.json/master"
CACHE = Path(__file__).resolve().parent.parent / ".cache"
UA = {"User-Agent": "footballseer/0.1 (+https://github.com)"}
_fd_down = False  # circuit breaker: skip the direct host once it has failed this run
_lock = threading.Lock()
_wb_lock = threading.Lock()
_wb_last = 0.0

# First column present wins. Pre-match market average first, then fallbacks.
ODDS_COLUMNS = {
    "odds_h": ["AvgH", "BbAvH", "B365H", "PSH", "AvgCH", "PSCH", "PH"],
    "odds_d": ["AvgD", "BbAvD", "B365D", "PSD", "AvgCD", "PSCD", "PD"],
    "odds_a": ["AvgA", "BbAvA", "B365A", "PSA", "AvgCA", "PSCA", "PA"],
    "odds_o25": ["Avg>2.5", "BbAv>2.5", "B365>2.5", "AvgC>2.5"],
    "odds_u25": ["Avg<2.5", "BbAv<2.5", "B365<2.5", "AvgC<2.5"],
}
# Match statistics, only published for the main leagues: half-time goals, corners, cards.
STAT_COLUMNS = {"hthg": "HTHG", "htag": "HTAG", "hc": "HC", "ac": "AC",
                "hy": "HY", "ay": "AY", "hr": "HR", "ar": "AR"}


# --------------------------------------------------------------------------- #
# HTTP with cache + fallbacks
# --------------------------------------------------------------------------- #

class NotFound(Exception):
    pass


def _get(url: str, timeout: int = 30) -> bytes | None:
    """Body on 200; None on network errors/throttling; raises NotFound on 404."""
    try:
        r = requests.get(url, headers=UA, timeout=timeout)
        if r.status_code == 200 and r.content:
            return r.content
        log.debug("GET %s -> %s", url, r.status_code)
        if r.status_code == 404:
            raise NotFound(url)
    except requests.RequestException as e:
        log.debug("GET %s failed: %s", url, e)
    return None


def _wayback(url: str) -> bytes | None:
    """Newest Wayback snapshot of url. Requests are serialised: the archive
    throttles parallel clients hard."""
    global _wb_last
    for attempt in range(6):
        with _wb_lock:
            time.sleep(max(0.0, _wb_last + 3 - time.monotonic()))
            try:
                data = _get(WAYBACK + url, timeout=90)
            except NotFound:
                log.warning("no Wayback snapshot for %s", url)
                return None
            finally:
                _wb_last = time.monotonic()
        if data is not None:
            return data
        # The archive refuses connections for a while once it decides you're too busy.
        time.sleep(min(120, 10 * 2 ** attempt))
    log.warning("Wayback unavailable for %s", url)
    return None


def fetch(path: str, max_age_hours: float = 6, base: str = FD) -> bytes | None:
    """Fetch base/path, caching on disk. Falls back to Wayback, then stale cache."""
    cache_file = CACHE / re.sub(r"[^A-Za-z0-9._-]", "_", f"{base}/{path}")
    if cache_file.exists() and time.time() - cache_file.stat().st_mtime < max_age_hours * 3600:
        return cache_file.read_bytes()

    global _fd_down
    url = f"{base}/{path}"
    try:
        data = None if (base == FD and _fd_down) else _get(url, timeout=20)
    except NotFound:
        return None
    if data is None and base == FD:
        with _lock:
            if not _fd_down:
                log.warning("football-data unreachable, using Wayback snapshots for this run")
                _fd_down = True
        data = _wayback(url)
    if data is None:
        if cache_file.exists():
            log.warning("using stale cache for %s", path)
            return cache_file.read_bytes()
        return None

    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file.write_bytes(data)
    return data


def _read_csv(raw: bytes) -> pd.DataFrame:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(raw), encoding=enc, on_bad_lines="skip")
        except UnicodeDecodeError:
            continue
    raise ValueError("undecodable CSV")


# --------------------------------------------------------------------------- #
# Normalisation
# --------------------------------------------------------------------------- #

def _first(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    out = pd.Series(float("nan"), index=df.index)
    for c in cols:
        if c in df.columns:
            out = out.fillna(pd.to_numeric(df[c], errors="coerce"))
    return out


def _normalise(df: pd.DataFrame, league: str, home_col: str, away_col: str,
               hg_col: str | None, ag_col: str | None, season: str | None = None) -> pd.DataFrame:
    out = pd.DataFrame({
        "league": league,
        "date": pd.to_datetime(df["Date"], dayfirst=True, format="mixed", errors="coerce"),
        "home": df[home_col].astype(str).str.strip(),
        "away": df[away_col].astype(str).str.strip(),
    })
    if "Time" in df.columns:
        out["time"] = df["Time"].astype(str).str.strip().replace({"nan": None})
    if hg_col:
        out["hg"] = pd.to_numeric(df[hg_col], errors="coerce")
        out["ag"] = pd.to_numeric(df[ag_col], errors="coerce")
        for name, col in STAT_COLUMNS.items():
            out[name] = pd.to_numeric(df[col], errors="coerce") if col in df.columns else float("nan")
        # Extra leagues carry their own season label ("2026", "2025/2026").
        out["season"] = season if season else df["Season"].astype(str) if "Season" in df.columns else ""
    for name, cols in ODDS_COLUMNS.items():
        out[name] = _first(df, cols)
    # Drop obviously broken prices (typos, swapped columns): a real book is 98-130%.
    book = 1 / out["odds_h"] + 1 / out["odds_d"] + 1 / out["odds_a"]
    out.loc[(book < 0.98) | (book > 1.3), ["odds_h", "odds_d", "odds_a"]] = float("nan")
    book = 1 / out["odds_o25"] + 1 / out["odds_u25"]
    out.loc[(book < 0.98) | (book > 1.3), ["odds_o25", "odds_u25"]] = float("nan")
    out = out.dropna(subset=["date"])
    out = out[(out["home"] != "nan") & (out["away"] != "nan")]
    return out


def season_codes(today: date, n: int) -> list[str]:
    """Last n European season codes, e.g. ['2425', '2526', '2627'] in Oct 2026."""
    start = today.year if today.month >= 7 else today.year - 1
    return [f"{(y % 100):02d}{((y + 1) % 100):02d}" for y in range(start - n + 1, start + 1)]


def load_results(lg: League, today: date, seasons: int = 3) -> pd.DataFrame:
    """Completed matches for the last `seasons` seasons of a league."""
    frames = []
    if lg.kind == "main":
        codes = season_codes(today, seasons)
        for s in codes:
            # Past seasons never change; the current one is refreshed every 6h.
            age = 6 if s == codes[-1] else 24 * 365
            raw = fetch(f"mmz4281/{s}/{lg.code}.csv", max_age_hours=age)
            if raw:
                frames.append(_normalise(_read_csv(raw), lg.code, "HomeTeam", "AwayTeam", "FTHG", "FTAG", season=s))
    else:
        raw = fetch(f"new/{lg.code}.csv")
        if raw:
            df = _normalise(_read_csv(raw), lg.code, "Home", "Away", "HG", "AG")
            cutoff = pd.Timestamp(today) - pd.DateOffset(years=seasons)
            frames.append(df[df["date"] >= cutoff])
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True).dropna(subset=["hg", "ag"])
    df = df[df["date"] <= pd.Timestamp(today)]
    return df.sort_values("date").reset_index(drop=True)


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

def _fd_fixtures(today: date) -> pd.DataFrame:
    frames = []
    raw = fetch("fixtures.csv", max_age_hours=3)
    if raw:
        df = _read_csv(raw)
        if "Div" in df.columns:
            for code, g in df.groupby("Div"):
                if code in BY_CODE:
                    frames.append(_normalise(g, code, "HomeTeam", "AwayTeam", None, None))
    raw = fetch("new_league_fixtures.csv", max_age_hours=3)
    if raw:
        df = _read_csv(raw)
        by_country = {lg.country: lg.code for lg in EXTRA}
        if "Country" in df.columns:
            for country, g in df.groupby("Country"):
                code = by_country.get(str(country).strip())
                if code:
                    frames.append(_normalise(g, code, "Home", "Away", None, None))
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    return df[df["date"] >= pd.Timestamp(today)]


_NOISE = {"fc", "afc", "cf", "sc", "ac", "ssc", "sv", "fk", "cd", "ud", "rc", "rcd", "club", "clube", "de", "da", "do",
          "calcio", "1", "1901", "1846", "1899", "1904", "1907", "1909", "1910", "05", "04", "fbpa", "sad"}
# football-data abbreviations -> extra words that appear in fuller names elsewhere.
_ALIASES = {
    "man": "manchester", "nottm": "nottingham", "sp": "sporting", "sp lisbon": "portugal cp", "ath": "athletic atletico", "ein": "eintracht",
    "wolves": "wolverhampton wanderers", "qpr": "queens park rangers", "psg": "paris saint germain",
    "paris sg": "paris saint germain", "mgladbach": "monchengladbach borussia", "sheffield weds": "wednesday",
    "west brom": "west bromwich albion", "nijmegen": "nec", "rennes": "stade rennais", "st etienne": "saint",
    "atletico mg": "ca mineiro", "athletico pr": "ca paranaense", "for sittard": "fortuna", "sociedad": "real",
    "betis": "real", "la coruna": "deportivo", "vallecano": "rayo", "espanol": "espanyol",
    # ESPN spellings
    "koln": "cologne", "rvs": "rovers", "inverness c": "caledonian thistle", "hamkam": "hamarkameratene",
    "buyuksehyr": "istanbul basaksehir",
}


def _key(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"['’.]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(t for t in s.split() if t not in _NOISE)


def _expand(key: str) -> str:
    extra = [v for k, v in _ALIASES.items() if re.search(rf"\b{k}\b", key)]
    return " ".join([key, *extra])


def _tok_match(x: str, y: str) -> bool:
    # Prefixes count as abbreviations ("sp" -> "sporting", "ein" -> "eintracht").
    if min(len(x), len(y)) >= 2 and (x.startswith(y) or y.startswith(x)):
        return True
    return difflib.SequenceMatcher(None, x, y).ratio() >= 0.8


def _similarity(a: str, base: str, expanded: str) -> float:
    """a: external key; base/expanded: football-data key without/with aliases. 0..1."""
    ta, tb, te = a.split(), base.split(), expanded.split()
    if not ta or not tb:
        return 0.0
    cov_a = sum(any(_tok_match(x, y) for y in te) for x in ta) / len(ta)  # external words explained
    cov_b = sum(any(_tok_match(y, x) for x in ta) for y in tb) / len(tb)  # football-data words present
    ratio = difflib.SequenceMatcher(None, a, base).ratio()
    return 0.45 * cov_a + 0.35 * cov_b + 0.2 * ratio


def match_teams(names: list[str], known: list[str], threshold: float = 0.45) -> dict[str, str | None]:
    """One-to-one map of external team names onto football-data names.

    Scores every pair, then solves the assignment so two clubs can never be
    mapped to the same team (e.g. Espanyol and Barcelona both -> "Barcelona").
    """
    from scipy.optimize import linear_sum_assignment

    names = list(dict.fromkeys(names))
    ka = [_key(n) for n in names]
    kb = [_key(k) for k in known]
    exact = dict(zip(kb, known))
    score = np.array([[1.0 if a == b else _similarity(a, b, _expand(b)) for b in kb] for a in ka])
    rows, cols = linear_sum_assignment(-score)
    out: dict[str, str | None] = {n: None for n in names}
    for r, c in zip(rows, cols):
        if score[r, c] >= threshold:
            out[names[r]] = known[c]
    for n, a in zip(names, ka):  # exact key matches always win
        if a in exact:
            out[n] = exact[a]
    return out


def _openfootball_fixtures(lg: League, today: date, known: list[str]) -> pd.DataFrame:
    if not lg.openfootball:
        return pd.DataFrame()
    start = today.year if today.month >= 7 else today.year - 1
    season = str(today.year) if lg.kind == "extra" else f"{start}-{(start + 1) % 100:02d}"
    raw = fetch(f"{season}/{lg.openfootball}.json", max_age_hours=12, base=OPENFOOTBALL)
    if not raw:
        return pd.DataFrame()
    import json

    matches = json.loads(raw.decode("utf-8")).get("matches", [])
    mapping = match_teams([m[k] for m in matches for k in ("team1", "team2")], known)
    unmapped = sorted(n for n, t in mapping.items() if t is None)
    if unmapped:
        log.info("%s: no rating for %s", lg.code, ", ".join(unmapped))
    rows = []
    for m in matches:
        score = m.get("score")
        if isinstance(score, dict) and score.get("ft"):
            continue  # already played
        d = pd.to_datetime(m.get("date"), errors="coerce")
        if pd.isna(d) or d < pd.Timestamp(today):
            continue
        home, away = mapping[m["team1"]], mapping[m["team2"]]
        if home and away:
            rows.append({"league": lg.code, "date": d, "time": m.get("time"), "home": home, "away": away})
        else:
            log.debug("%s: unmapped %s v %s", lg.code, m["team1"], m["team2"])
    return pd.DataFrame(rows)


def load_fixtures(today: date, known_teams: dict[str, list[str]], horizon_days: int = 10) -> pd.DataFrame:
    """Upcoming fixtures for every league within `horizon_days`.

    football-data fixtures (with odds) are used where present; leagues missing
    from them fall back to openfootball schedules (no odds).
    """
    end = pd.Timestamp(today) + pd.Timedelta(days=horizon_days)
    fd = _fd_fixtures(today)
    covered = set(fd["league"]) if not fd.empty else set()
    frames = [fd] if not fd.empty else []
    for lg in ALL:
        if lg.code not in covered and lg.code in known_teams:
            of = _openfootball_fixtures(lg, today, known_teams[lg.code])
            if not of.empty:
                frames.append(of)
    if not frames:
        return pd.DataFrame(columns=["league", "date", "home", "away"])
    df = pd.concat(frames, ignore_index=True)
    df = df[df["date"] <= end].drop_duplicates(subset=["league", "date", "home", "away"])
    # Only predict teams the model knows for that league.
    df = df[[h in known_teams.get(l, []) and a in known_teams.get(l, [])
             for l, h, a in zip(df["league"], df["home"], df["away"])]]
    return df.sort_values(["date", "league"]).reset_index(drop=True)


def today_utc() -> date:
    return datetime.now(timezone.utc).date()
