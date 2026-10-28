"""Download tennis singles results from ESPN's public tennis scoreboards.

A dated scoreboard lists every tournament running that day with its whole
draw, qualifying included, so sampling one date every few days covers every
tour-level match. Both tours come back from either endpoint.

Returns one row per completed singles match:
    id, date, tour, event, surface, round, p1, p2, p1_id, p2_id, p1_country, p2_country (three-letter codes),
    winner (1 or 2), sets, best_of, status
where `status` is "final" or "retired". Walkovers are dropped: nobody played.

ESPN doesn't give the court surface, so it comes from the tournament's name
(see surface): the clay and grass swings are short lists, everything else is hard.
"""

from __future__ import annotations

import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pandas as pd

from ..sources import fetch

log = logging.getLogger(__name__)

ESPN = "https://site.api.espn.com/apis/site/v2/sports/tennis"
TOURS = {"mens-singles": "ATP", "womens-singles": "WTA"}
STEP_DAYS = 3        # tournaments run at least five days, so every third day sees each draw
SETTLED_DAYS = 30    # older scoreboards no longer change; cache them for good
COLS = ["id", "date", "tour", "event", "surface", "round", "p1", "p2", "p1_id", "p2_id", "p1_country", "p2_country",
        "winner", "sets", "best_of", "status"]

CLAY = re.compile(
    r"roland garros|french open|madrid|internazionali|italia|monte.carlo|barcelona|hamburg|rio open|bmw open|munich|"
    r"generali open|kitzb|tiriac|bucharest|clay court|chile open|santiago|umag|croatia open|gstaad|swiss open|geneva|"
    r"hassan|marrakech|argentina open|buenos aires|estoril|colsanitas|bogota|cordoba|nordea|bastad|charleston|"
    r"rabat|strasbourg|palermo|prague|lausanne|budapest|parma|rouen",
    re.I,
)
GRASS = re.compile(r"wimbledon|eastbourne|lib[eé]ma|hertogenbosch|halle|terra wortmann|queen|hsbc championships|mallorca|"
                   r"boss open|hall of fame|newport|birmingham|nottingham|bad homburg|berlin", re.I)


def surface(event: str, day: date) -> str:
    """"hard", "clay" or "grass" for a tour-level event, from its name and date."""
    if GRASS.search(event) and day.month in (6, 7):
        return "grass"
    # Stuttgart is grass for the men in June, clay for the women in April; Lyon moved off clay in 2025.
    if CLAY.search(event) or (re.search(r"stuttgart|porsche", event, re.I) and day.month == 4)             or (re.search(r"auvergne|lyon", event, re.I) and day.month == 5) or (event == "Olympics" and day.year == 2024):
        return "clay"
    return "hard"


def _day(d: date, today: date) -> dict:
    age = (today - d).days
    path = f"atp/scoreboard?dates={d:%Y%m%d}"
    for attempt in range(4):
        raw = fetch(path, max_age_hours=24 * 365 if age > SETTLED_DAYS else 6, base=ESPN)
        if raw is not None:
            try:
                return json.loads(raw)
            except ValueError:
                return {}
        time.sleep(2 * 2 ** attempt)
    log.warning("gave up on tennis scoreboard %s", d)
    return {}


def _country(athlete: dict) -> str:
    """Three-letter code from the flag's file name: ".../countries/500/bul.png" -> "BUL"."""
    m = re.search(r"/([a-z]{3})\.png", athlete.get("flag", {}).get("href", ""))
    return m.group(1).upper() if m else ""


def _match(c: dict, tour: str, event: str) -> dict | None:
    status = c.get("status", {}).get("type", {}).get("name", "")
    if status not in ("STATUS_FINAL", "STATUS_RETIRED"):
        return None
    sides = sorted(c.get("competitors", []), key=lambda x: x.get("order", 0))
    if len(sides) != 2 or not all("athlete" in s for s in sides):
        return None
    w = [bool(s.get("winner")) for s in sides]
    if w.count(True) != 1:
        return None
    sets = [[int(ls.get("value", 0)) for ls in s.get("linescores", [])] for s in sides]
    won = [sum(a > b for a, b in zip(sets[k], sets[1 - k])) for k in (0, 1)]
    day = pd.Timestamp(c["date"][:10])
    return {
        "id": str(c["id"]),
        "date": day,
        "tour": tour,
        "event": event,
        "surface": surface(event, day),
        "round": c.get("round", {}).get("displayName", ""),
        "p1": sides[0]["athlete"].get("displayName", ""),
        "p2": sides[1]["athlete"].get("displayName", ""),
        "p1_id": str(sides[0].get("id") or sides[0]["athlete"].get("id")),
        "p2_id": str(sides[1].get("id") or sides[1]["athlete"].get("id")),
        "p1_country": _country(sides[0]["athlete"]),
        "p2_country": _country(sides[1]["athlete"]),
        "winner": 1 if w[0] else 2,
        "sets": " ".join(f"{a}-{b}" for a, b in zip(*sets)),
        # Three sets won only happens in best-of-five.
        "best_of": 5 if max(won) == 3 else 3,
        "status": "final" if status == "STATUS_FINAL" else "retired",
    }


def load_matches(today: date, start: date) -> pd.DataFrame:
    days = [start + timedelta(days=k) for k in range(0, (today - start).days + 1, STEP_DAYS)]
    if days[-1] != today:
        days.append(today)
    with ThreadPoolExecutor(8) as ex:
        pages = list(ex.map(lambda d: _day(d, today), days))
    rows: dict[str, dict] = {}
    for data in pages:
        for e in data.get("events", []):
            for g in e.get("groupings", []):
                tour = TOURS.get(g.get("grouping", {}).get("slug", ""))
                if not tour:
                    continue
                for c in g.get("competitions", []):
                    m = _match(c, tour, e.get("name", ""))
                    if m:
                        rows[m["id"]] = m
    df = pd.DataFrame(list(rows.values()), columns=COLS)
    df = df[df["date"] <= pd.Timestamp(today)].sort_values(["date", "id"]).reset_index(drop=True)
    log.info("tennis: %d singles matches from %d scoreboards", len(df), len(days))
    return df
