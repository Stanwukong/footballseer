"""Link fixtures to ESPN events, so the web app can show live scores and stats.

ESPN's public scoreboard API (no key) lists each league's matches for a day.
We match its team names onto football-data names once here, with the same
one-to-one matcher used for fixtures, and store "slug/eventId" on each fixture.
The web app then polls ESPN by id, with no name matching at request time.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

from .sources import fetch, match_teams

log = logging.getLogger(__name__)

BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"

# Our league code -> ESPN league slug. Poland's Ekstraklasa has no ESPN feed.
SLUGS = {
    "E0": "eng.1", "E1": "eng.2", "E2": "eng.3", "E3": "eng.4", "EC": "eng.5",
    "SC0": "sco.1", "SC1": "sco.2", "SC2": "sco.3", "SC3": "sco.4",
    "D1": "ger.1", "D2": "ger.2", "I1": "ita.1", "I2": "ita.2", "SP1": "esp.1", "SP2": "esp.2",
    "F1": "fra.1", "F2": "fra.2", "N1": "ned.1", "B1": "bel.1", "P1": "por.1", "T1": "tur.1", "G1": "gre.1",
    "ARG": "arg.1", "AUT": "aut.1", "BRA": "bra.1", "CHN": "chn.1", "DNK": "den.1", "FIN": "fin.1",
    "IRL": "irl.1", "JPN": "jpn.1", "MEX": "mex.1", "NOR": "nor.1", "ROU": "rou.1", "RUS": "rus.1",
    "SWE": "swe.1", "SWZ": "sui.1", "USA": "usa.1",
}


def _events(slug: str, day: pd.Timestamp) -> list[dict]:
    """ESPN events for one league and day: [{id, date, home, away, final}]. `final` is
    [hg, ag] once the match is over, else None. Dates are queried a day either side
    by the caller, since ESPN groups matches by US Eastern date."""
    raw = fetch(f"{slug}/scoreboard?dates={day:%Y%m%d}", max_age_hours=3, base=BASE)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except ValueError:
        return []
    out = []
    for e in data.get("events", []):
        comp = (e.get("competitions") or [{}])[0]
        sides = {c.get("homeAway"): c for c in comp.get("competitors", [])}
        teams = {k: c.get("team", {}).get("displayName") for k, c in sides.items()}
        if teams.get("home") and teams.get("away"):
            final = None
            if (e.get("status") or {}).get("type", {}).get("completed"):
                try:
                    final = [int(sides["home"]["score"]), int(sides["away"]["score"])]
                except (KeyError, TypeError, ValueError):
                    pass
            out.append({"id": e["id"], "date": pd.Timestamp(e["date"]).tz_convert(None),
                        "home": teams["home"], "away": teams["away"], "final": final})
    return out


def link(fixtures: pd.DataFrame, known: dict[str, list[str]]) -> dict[str, str]:
    """fixture row index -> "slug/eventId" for every fixture found on ESPN."""
    out = {idx: f"{e['slug']}/{e['id']}" for idx, e in _match(fixtures, known).items()}
    log.info("linked %d of %d fixtures to ESPN events", len(out), len(fixtures))
    return out


def finals(games: pd.DataFrame, known: dict[str, list[str]]) -> dict[str, list[int]]:
    """row index -> [hg, ag] for every game ESPN reports as finished. football-data
    publishes results a day or two late; ESPN has them minutes after full time."""
    out = {idx: e["final"] for idx, e in _match(games, known).items() if e["final"]}
    log.info("ESPN has final scores for %d of %d games", len(out), len(games))
    return out


def _match(fixtures: pd.DataFrame, known: dict[str, list[str]]) -> dict:
    """fixture row index -> its ESPN event."""
    if fixtures.empty:
        return {}
    jobs = []
    for code, g in fixtures.groupby("league"):
        slug = SLUGS.get(code)
        if not slug:
            continue
        days = sorted({d.normalize() + pd.Timedelta(days=k) for d in g["date"] for k in (-1, 0, 1)})
        jobs += [(code, slug, d) for d in days]

    with ThreadPoolExecutor(max_workers=8) as ex:
        found = list(ex.map(lambda j: (j[0], j[1], _events(j[1], j[2])), jobs))

    by_league: dict[str, list[dict]] = {}
    for code, slug, evs in found:
        for e in evs:
            by_league.setdefault(code, []).append({**e, "slug": slug})

    out: dict = {}
    for code, g in fixtures.groupby("league"):
        evs = list({e["id"]: e for e in by_league.get(code, [])}.values())
        if not evs:
            continue
        names = match_teams([e[k] for e in evs for k in ("home", "away")], known.get(code, []))
        for e in evs:
            h, a = names.get(e["home"]), names.get(e["away"])
            if not h or not a:
                continue
            # Same teams within two days of the scheduled date (time zones, small reschedules).
            hit = g[(g["home"] == h) & (g["away"] == a) & ((g["date"] - e["date"].normalize()).abs() <= pd.Timedelta(days=2))]
            for idx in hit.index:
                out[idx] = e
    return out
