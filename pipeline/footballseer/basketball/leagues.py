"""Registry of the basketball leagues we cover.

ESPN's public site API (no key) serves the North American leagues and
Australia's NBL; EuroLeague and EuroCup come from the EuroLeague's own public
API. Codes must not collide with football league codes: favourites and the
live feed share a namespace across sports.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class League:
    code: str
    country: str
    name: str
    tier: int
    source: str  # "espn" | "euroleague"
    slug: str  # ESPN league slug, or EuroLeague competition code ("E", "U")
    tz: str  # league-local time zone: game dates and tip-off times are shown in it
    tz_label: str
    periods: int = 4  # NCAA men's plays two halves
    minutes: int = 40
    groups: str | None = None  # ESPN `groups` filter (NCAA Division I = 50)
    xi: float = 0.005  # rating decay per day (model.fit); tuned on the walk-forward backtest
    reg: float = 2.0  # ridge penalty in game-equivalents; NCAA's sparse schedule needs far less


ALL = [
    League("NBA", "USA", "NBA", 1, "espn", "nba", "America/New_York", "ET", minutes=48, xi=0.008),
    League("WNBA", "USA", "WNBA", 1, "espn", "wnba", "America/New_York", "ET"),
    League("NCAAM", "USA", "NCAA Men's", 1, "espn", "mens-college-basketball", "America/New_York", "ET", periods=2, groups="50", reg=0.3),
    League("GLG", "USA", "G League", 2, "espn", "nba-development", "America/New_York", "ET", minutes=48),
    League("NBL", "Australia", "NBL", 1, "espn", "nbl", "Australia/Sydney", "AEST"),
    League("EL", "Europe", "EuroLeague", 1, "euroleague", "E", "Europe/Berlin", "CET"),
    League("ECUP", "Europe", "EuroCup", 2, "euroleague", "U", "Europe/Berlin", "CET"),
]

BY_CODE = {lg.code: lg for lg in ALL}
ESPN_SLUGS = {lg.code: lg.slug for lg in ALL if lg.source == "espn"}
