import numpy as np
import pandas as pd
import pytest
from scipy.optimize import approx_fprime

from footballseer import markets, model
from footballseer.sources import match_teams, season_codes


def synthetic_league(n_teams=12, seasons=3, seed=0):
    rng = np.random.default_rng(seed)
    att = rng.normal(0, 0.3, n_teams)
    dfn = rng.normal(0, 0.25, n_teams)
    teams = [f"T{i:02d}" for i in range(n_teams)]
    rows, day = [], pd.Timestamp("2023-08-01")
    for _ in range(seasons * 2):
        for h in range(n_teams):
            for a in range(n_teams):
                if h == a:
                    continue
                lh = np.exp(0.15 + 0.25 + att[h] + dfn[a])
                la = np.exp(0.15 + att[a] + dfn[h])
                rows.append((day, teams[h], teams[a], rng.poisson(lh), rng.poisson(la)))
                day += pd.Timedelta(hours=6)
    df = pd.DataFrame(rows, columns=["date", "home", "away", "hg", "ag"])
    return df, att, dfn


def test_gradient_matches_numerical():
    rng = np.random.default_rng(1)
    n, m = 6, 200
    hi, ai = rng.integers(0, n, m), rng.integers(0, n, m)
    x, y = rng.poisson(1.4, m).astype(float), rng.poisson(1.1, m).astype(float)
    w = rng.uniform(0.3, 1, m)
    p = np.concatenate([rng.normal(0, 0.2, 2 * n), [0.2, 0.3, -0.08]])
    _, g = model.objective(p, n, hi, ai, x, y, w, 2.0)
    num = approx_fprime(p, lambda q: model.objective(q, n, hi, ai, x, y, w, 2.0)[0], 1e-6)
    np.testing.assert_allclose(g, num, rtol=1e-4, atol=1e-4)


def test_fit_recovers_team_strengths():
    df, att, dfn = synthetic_league()
    r = model.fit(df, xi=0.0, reg=0.5)
    # Ranking of attack/defence should be close to the truth.
    assert np.corrcoef(r.attack, att)[0, 1] > 0.9
    assert np.corrcoef(r.defence, dfn)[0, 1] > 0.9
    # With a balanced schedule, home advantage is the log ratio of home/away goals.
    assert r.home_adv == pytest.approx(np.log(df.hg.mean() / df.ag.mean()), abs=0.01)


def test_score_matrix_and_markets_are_consistent():
    m = model.score_matrix(1.6, 1.1, -0.08)
    assert m.sum() == pytest.approx(1)
    mk = markets.markets(m)
    assert mk["1"] + mk["X"] + mk["2"] == pytest.approx(1, abs=1e-3)
    assert mk["O2.5"] + mk["U2.5"] == pytest.approx(1, abs=1e-3)
    assert mk["1"] > mk["2"]
    assert mk["O0.5"] > mk["O1.5"] > mk["O2.5"] > mk["O3.5"]
    assert mk["1X"] == pytest.approx(mk["1"] + mk["X"], abs=1e-3)


@pytest.mark.parametrize("market,hg,ag,expected", [
    ("1", 2, 1, True), ("X", 1, 1, True), ("2", 1, 1, False),
    ("O2.5", 2, 1, True), ("U2.5", 1, 1, True), ("BTTS_Y", 1, 0, False),
    ("DNB1", 0, 0, None), ("H_CS", 3, 0, True), ("A_O1.5", 0, 2, True),
])
def test_settle(market, hg, ag, expected):
    assert markets.settle(market, hg, ag) is expected


def test_settle_frame_matches_scalar_settle():
    hg = np.array([0, 1, 2, 0, 3, 1, 4])
    ag = np.array([0, 1, 0, 2, 3, 0, 1])
    frame = markets.settle_frame(hg, ag)
    assert set(frame) == set(markets.LABELS)
    for k, arr in frame.items():
        for h, a, v in zip(hg, ag, arr):
            s = markets.settle(k, int(h), int(a))
            assert (np.isnan(v) and s is None) or v == float(s), (k, h, a)


def test_season_codes():
    assert season_codes(pd.Timestamp("2026-10-22").date(), 3) == ["2425", "2526", "2627"]
    assert season_codes(pd.Timestamp("2026-03-01").date(), 2) == ["2425", "2526"]


@pytest.mark.parametrize("known,expected", [
    (["Arsenal", "Man United", "Man City", "Tottenham", "Nott'm Forest", "Newcastle", "Wolves", "QPR"],
     {"Arsenal FC": "Arsenal", "Manchester United FC": "Man United", "Manchester City FC": "Man City",
      "Tottenham Hotspur FC": "Tottenham", "Nottingham Forest FC": "Nott'm Forest",
      "Wolverhampton Wanderers FC": "Wolves", "Queens Park Rangers FC": "QPR"}),
    (["Barcelona", "Espanol", "Ath Madrid", "Ath Bilbao", "Alaves", "La Coruna", "Real Madrid", "Betis"],
     {"FC Barcelona": "Barcelona", "RCD Espanyol de Barcelona": "Espanol", "Club Atlético de Madrid": "Ath Madrid",
      "Athletic Club": "Ath Bilbao", "Deportivo Alavés": "Alaves", "RC Deportivo La Coruña": "La Coruna",
      "Real Madrid CF": "Real Madrid", "Real Betis Balompié": "Betis"}),
    (["Paris SG", "Paris FC", "Rennes", "Lens"],
     {"Paris Saint-Germain FC": "Paris SG", "Paris FC": "Paris FC", "Stade Rennais FC 1901": "Rennes", "RC Lens": "Lens"}),
    (["Sp Lisbon", "Sp Braga", "Benfica", "Porto"],
     {"Sporting Clube de Portugal": "Sp Lisbon", "Sporting Clube de Braga": "Sp Braga", "SL Benfica": "Benfica",
      "FC Porto": "Porto"}),
    (["M'gladbach", "Dortmund", "Bayern Munich"],
     {"Borussia Mönchengladbach": "M'gladbach", "Borussia Dortmund": "Dortmund", "FC Bayern München": "Bayern Munich"}),
    (["FC Koln", "Schalke 04", "Raith Rvs", "Inverness C", "HamKam", "Buyuksehyr", "Besiktas"],
     {"FC Cologne": "FC Koln", "Schalke 04": "Schalke 04", "Raith Rovers": "Raith Rvs",
      "Inverness Caledonian Thistle": "Inverness C", "Hamarkameratene": "HamKam",
      "Istanbul Basaksehir": "Buyuksehyr", "Besiktas": "Besiktas"}),
])
def test_match_teams_one_to_one(known, expected):
    assert match_teams(list(expected), known) == expected
