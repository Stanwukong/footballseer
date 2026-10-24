import numpy as np
import pandas as pd
import pytest

from footballseer import stats


def history():
    # A wins every home game 2-0 (HT 1-0); B and C draw 1-1 with each other.
    rows = []
    day = pd.Timestamp("2026-08-01")
    for k in range(6):
        rows += [
            (day + pd.Timedelta(days=7 * k), "A", "B", 2, 0, 1, 0, 6, 3),
            (day + pd.Timedelta(days=7 * k + 1), "C", "A", 0, 1, 0, 0, 4, 5),
            (day + pd.Timedelta(days=7 * k + 2), "B", "C", 1, 1, 0, 1, 5, 5),
        ]
    df = pd.DataFrame(rows, columns=["date", "home", "away", "hg", "ag", "hthg", "htag", "hc", "ac"])
    df["season"] = "2627"
    for c in ("hy", "ay", "hr", "ar"):
        df[c] = np.nan
    return df


def test_standings_order_and_points():
    table = stats.standings(history(), ["A", "B", "C"])
    assert [r["team"] for r in table] == ["A", "C", "B"]  # C concedes fewer than B
    a = table[0]
    assert a["team"] == "A" and a["all"] == [12, 12, 0, 0, 18, 0, 36]
    assert a["home"][0] == 6 and a["away"][0] == 6 and a["form"] == "WWWWW"


def test_team_rates_and_streaks():
    s = stats.team_stats(history(), "A")
    assert s["rates"]["l10"]["n"] == 10 and s["rates"]["l10"]["c"]["W"] == 10
    assert s["rates"]["home"]["c"]["CS"] == 6
    assert s["last"][0][1] == "C" and s["last"][0][2] == "A"
    trend = {(t["e"], t["s"]): t["n"] for t in s["trends"]}
    assert trend[("W", "all")] == 12
    assert ("UNB", "all") not in trend  # implied by the winning run


def test_h2h_newest_first():
    h = stats.h2h(history(), "A", "B")
    assert len(h) == 6 and h[0][0] > h[-1][0] and h[0][1:] == ["A", "B", 2, 0]


def test_period_markets_split_goals():
    p = stats.period_markets(1.5, 1.2, 0.45)
    assert p["HT_1"] + p["HT_X"] + p["HT_2"] == pytest.approx(1, abs=1e-3)
    assert p["2H_O0.5"] > p["HT_O0.5"]  # more goals after the break
    assert p["HT_O0.5"] > p["HT_O1.5"]


def test_corners_model_prices_lines():
    df = pd.concat([history()] * 6, ignore_index=True)
    c = stats.Corners(df, pd.Timestamp("2026-10-01"))
    assert c.ok
    m = c.markets("A", "B")
    assert m["C_O7.5"] > m["C_O8.5"] > m["C_O9.5"] > m["C_O10.5"]
    assert m["C_O9.5"] + m["C_U9.5"] == pytest.approx(1, abs=1e-3)


def test_league_profile_rates():
    p = stats.league_profile(history())
    assert p["n"] == 18 and p["rates"]["1"] == pytest.approx(6 / 18, abs=1e-3)
    assert p["rates"]["2"] == pytest.approx(6 / 18, abs=1e-3)
    assert "corners" not in p  # under 20 matches with corner data
    big = stats.league_profile(pd.concat([history()] * 2, ignore_index=True))
    assert big["corners"] == pytest.approx(28 / 3, abs=0.01) and big["h1_share"] == pytest.approx(2 / 5, abs=1e-3)
