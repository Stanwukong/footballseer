import numpy as np
import pandas as pd

from footballseer.pipeline import compare_backtests


def _bt(n=600, seed=1):
    rng = np.random.default_rng(seed)
    p = rng.dirichlet([4, 3, 3], size=n)
    o = np.array([rng.choice(3, p=row) for row in p])
    hg = np.where(o == 0, 2, np.where(o == 1, 1, 0))
    ag = np.where(o == 2, 2, np.where(o == 1, 1, 0))
    return pd.DataFrame({"id": [f"m{i}" for i in range(n)], "league": np.where(np.arange(n) % 2, "E0", "D1"),
                         "hg": hg, "ag": ag, "odds_h": 2.0, "odds_d": 3.3, "odds_a": 3.8,
                         "1": p[:, 0], "X": p[:, 1], "2": p[:, 2]}), p


def test_identical_backtests_have_zero_delta_and_are_rejected():
    bt, _ = _bt()
    r = compare_backtests(bt, bt.copy())
    assert r["n"] == 600 and r["delta"] == 0 and r["delta_ci"] == [0, 0] and not r["accepted"]


def test_sharper_true_probabilities_beat_flattened_baseline():
    cand, p = _bt()
    base = cand.copy()
    base[["1", "X", "2"]] = 0.5 * p + 0.5 / 3  # shrink towards uniform: worse
    r = compare_backtests(base, cand)
    assert r["delta"] < -0.001 and r["delta_ci"][1] < 0 and r["accepted"]
    assert {x["league"] for x in r["leagues"]} == {"E0", "D1"}


def test_pairs_only_shared_matches_with_odds():
    bt, _ = _bt()
    cand = bt.iloc[100:].copy()
    cand.loc[cand.index[:50], "odds_h"] = np.nan
    assert compare_backtests(bt, cand)["n"] == 450


def test_one_bad_league_blocks_acceptance():
    cand, p = _bt()
    base = cand.copy()
    base[["1", "X", "2"]] = 0.5 * p + 0.5 / 3
    e0 = cand["league"] == "E0"
    cand.loc[e0, ["1", "X", "2"]] = 1 / 3  # candidate ruins one league
    r = compare_backtests(base, cand)
    assert r["worst_league"]["league"] == "E0" and not r["accepted"]
