from datetime import date

import numpy as np
import pandas as pd
import pytest

from footballseer.tennis import model


def synthetic(n_players=16, rounds=40, seed=0) -> tuple[pd.DataFrame, np.ndarray]:
    """Round robins between players of known strength (in Elo points)."""
    rng = np.random.default_rng(seed)
    skill = rng.normal(0, 200, n_players)
    rows, day = [], pd.Timestamp("2025-01-01")
    for _ in range(rounds):
        for a in range(n_players):
            for b in range(a + 1, n_players):
                win = rng.random() < model.expected(skill[a], skill[b])
                rows.append({"date": day, "p1": f"P{a}", "p2": f"P{b}", "p1_id": str(a), "p2_id": str(b),
                             "winner": 1 if win else 2, "best_of": 3})
        day += pd.Timedelta(days=7)
    return pd.DataFrame(rows), skill


def test_ratings_recover_order():
    df, skill = synthetic()
    r, _, _ = model.walk(df)
    elo = [r.players[str(k)].elo for k in range(len(skill))]
    assert np.corrcoef(skill, elo)[0, 1] > 0.95


def test_win_moves_both_players_and_newcomers_move_more():
    r = model.Ratings()
    r.update("a", "b")
    assert r.players["a"].elo > model.START > r.players["b"].elo
    first = r.players["a"].elo - model.START
    for _ in range(30):
        r.update("c", "d")
    before = r.players["c"].elo
    r.update("c", "e")
    assert r.players["c"].elo - before < first
    assert r.players["a"].form == "W" and r.players["b"].form == "L"


def test_walk_only_prices_established_players():
    df, _ = synthetic(n_players=4, rounds=5)
    _, gap, _ = model.walk(df, min_prior=10)
    # Each player plays 3 matches a round, so nobody has 10 before round 4.
    assert np.isnan(gap[:18]).all() and not np.isnan(gap[-1])


def test_best_of_five_favours_the_favourite():
    assert model.best_of_five(0.5) == pytest.approx(0.5)
    assert model.best_of_five(0.7) > 0.7
    assert model.best_of_five(0.3) < 0.3
    assert model.price(100, 5) > model.price(100, 3)


def test_fit_scale_recovers_shrinkage():
    rng = np.random.default_rng(1)
    gap = rng.normal(0, 250, 20000)
    y = (rng.random(gap.size) < model.price(gap, 3, 0.7)).astype(float)
    assert model.fit_scale(gap, np.full(gap.size, 3), y) == pytest.approx(0.7, abs=0.06)


def test_surface_from_tournament_name():
    from datetime import date

    from footballseer.tennis.sources import surface

    assert surface("Roland Garros", date(2026, 5, 30)) == "clay"
    assert surface("Wimbledon", date(2026, 7, 1)) == "grass"
    assert surface("Terra Wortmann Open", date(2026, 6, 18)) == "grass"
    assert surface("US Open", date(2026, 9, 1)) == "hard"
    assert surface("Olympics", date(2024, 7, 30)) == "clay"
    assert surface("Olympics", date(2028, 7, 30)) == "hard"


def test_player_stats_counts_sets_tiebreaks_and_deciders():
    from footballseer.tennis import stats

    day = pd.Timestamp("2026-10-01")
    rows = [
        # a beats b from a set down, with a tiebreak in the decider
        {"date": day, "event": "Basel", "surface": "hard", "p1_id": "a", "p2_id": "b", "winner": 1, "sets": "4-6 6-3 7-6", "best_of": 3, "status": "final"},
        # b retires against a: a win, but no sets counted
        {"date": day, "event": "Basel", "surface": "hard", "p1_id": "b", "p2_id": "a", "winner": 2, "sets": "3-2", "best_of": 3, "status": "retired"},
        # a loses on clay in straight sets
        {"date": day, "event": "Roland Garros", "surface": "clay", "p1_id": "c", "p2_id": "a", "winner": 1, "sets": "6-1 6-2 6-3", "best_of": 5, "status": "final"},
    ]
    df = pd.DataFrame(rows)
    elos = np.full((len(df), 2), 1500.0)
    s = stats.player_stats(df, elos, 1.0, {"a": 1, "b": 2, "c": 30}, {"a", "b"}, date(2026, 10, 28))["a"]
    assert s["all"] == [2, 1] and s["year"] == [2, 1]
    assert s["surface"] == {"hard": [2, 0], "clay": [0, 1], "grass": [0, 0]}
    assert s["slams"] == [0, 1]
    assert s["sets"] == [2, 4] and s["games"] == [23, 33]
    assert s["tiebreaks"] == [1, 0] and s["deciders"] == [1, 0]
    assert s["lost_first"] == [1, 1] and s["straight"] == [0, 1]
    assert s["top10"] == [2, 0] and s["top50"] == [2, 1]
    assert s["streak"] == "L1"
    # Even prices: two wins from three 50% matches is half a win above the model.
    assert s["vs_model"] == 0.5
    assert stats.player_stats(df, elos, 1.0, {}, {"b"}, date(2026, 10, 28))["b"]["retired"] == 1


def test_streak():
    from footballseer.tennis.stats import streak

    assert streak([False, True, True, True]) == "W3"
    assert streak([True, False]) == "L1"
    assert streak([]) == ""
