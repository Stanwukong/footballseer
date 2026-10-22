"""Registry of every league football-data.co.uk publishes.

"main" leagues ship one CSV per season (mmz4281/<season>/<code>.csv) with full
bookmaker odds. "extra" leagues ship a single all-seasons CSV (new/<code>.csv)
with closing 1X2 odds only.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class League:
    code: str  # football-data code, used as our league id
    country: str
    name: str
    tier: int
    kind: str  # "main" | "extra"
    openfootball: str | None = None  # openfootball file stem, for fixture fallback


MAIN = [
    League("E0", "England", "Premier League", 1, "main", "en.1"),
    League("E1", "England", "Championship", 2, "main", "en.2"),
    League("E2", "England", "League One", 3, "main", "en.3"),
    League("E3", "England", "League Two", 4, "main", "en.4"),
    League("EC", "England", "National League", 5, "main"),
    League("SC0", "Scotland", "Premiership", 1, "main", "sco.1"),
    League("SC1", "Scotland", "Championship", 2, "main"),
    League("SC2", "Scotland", "League One", 3, "main"),
    League("SC3", "Scotland", "League Two", 4, "main"),
    League("D1", "Germany", "Bundesliga", 1, "main", "de.1"),
    League("D2", "Germany", "2. Bundesliga", 2, "main", "de.2"),
    League("I1", "Italy", "Serie A", 1, "main", "it.1"),
    League("I2", "Italy", "Serie B", 2, "main", "it.2"),
    League("SP1", "Spain", "La Liga", 1, "main", "es.1"),
    League("SP2", "Spain", "Segunda División", 2, "main", "es.2"),
    League("F1", "France", "Ligue 1", 1, "main", "fr.1"),
    League("F2", "France", "Ligue 2", 2, "main", "fr.2"),
    League("N1", "Netherlands", "Eredivisie", 1, "main", "nl.1"),
    League("B1", "Belgium", "Pro League", 1, "main", "be.1"),
    League("P1", "Portugal", "Primeira Liga", 1, "main", "pt.1"),
    League("T1", "Turkey", "Süper Lig", 1, "main", "tr.1"),
    League("G1", "Greece", "Super League", 1, "main", "gr.1"),
]

EXTRA = [
    League("ARG", "Argentina", "Liga Profesional", 1, "extra", "ar.1"),
    League("AUT", "Austria", "Bundesliga", 1, "extra", "at.1"),
    League("BRA", "Brazil", "Série A", 1, "extra", "br.1"),
    League("CHN", "China", "Super League", 1, "extra", "cn.1"),
    League("DNK", "Denmark", "Superliga", 1, "extra"),
    League("FIN", "Finland", "Veikkausliiga", 1, "extra"),
    League("IRL", "Ireland", "Premier Division", 1, "extra"),
    League("JPN", "Japan", "J1 League", 1, "extra", "jp.1"),
    League("MEX", "Mexico", "Liga MX", 1, "extra"),
    League("NOR", "Norway", "Eliteserien", 1, "extra"),
    League("POL", "Poland", "Ekstraklasa", 1, "extra"),
    League("ROU", "Romania", "Liga I", 1, "extra"),
    League("RUS", "Russia", "Premier League", 1, "extra"),
    League("SWE", "Sweden", "Allsvenskan", 1, "extra"),
    League("SWZ", "Switzerland", "Super League", 1, "extra"),
    League("USA", "USA", "MLS", 1, "extra", "mls"),
]

ALL = MAIN + EXTRA
BY_CODE = {lg.code: lg for lg in ALL}
