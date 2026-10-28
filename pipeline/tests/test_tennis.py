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
    r, _ = model.walk(df)
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
    _, gap = model.walk(df, min_prior=10)
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
