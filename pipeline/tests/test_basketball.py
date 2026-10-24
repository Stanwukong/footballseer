import numpy as np
import pandas as pd
import pytest

from footballseer.basketball import markets as mk
from footballseer.basketball import model
from footballseer.basketball.sources import american


def synthetic(n_teams=12, rounds=6, hfa=3.0, seed=0) -> tuple[pd.DataFrame, np.ndarray]:
    rng = np.random.default_rng(seed)
    strength = rng.normal(0, 6, n_teams)
    rows, day = [], pd.Timestamp("2025-11-01")
    for _ in range(rounds):
        for h in range(n_teams):
            for a in range(n_teams):
                if h == a:
                    continue
                # Four quarters, each a quarter of the game's expectation plus its own noise.
                qm = (strength[h] - strength[a] + hfa) / 4 + rng.normal(0, 5.5, 4)
                qt = 55 + rng.normal(0, 8.5, 4)
                qh, qa = np.round((qt + qm) / 2), np.round((qt - qm) / 2)
                if qh.sum() == qa.sum():
                    qh[3] += 1
                rows.append({"date": day, "home": f"T{h}", "away": f"T{a}", "hg": qh.sum(), "ag": qa.sum(),
                             "neutral": False, "h1h": qh[:2].sum(), "h1a": qa[:2].sum(), "ot": False,
                             **{f"q{k + 1}h": qh[k] for k in range(4)}, **{f"q{k + 1}a": qa[k] for k in range(4)}})
            day += pd.Timedelta(days=1)
    return pd.DataFrame(rows), strength


def test_fit_recovers_home_advantage_and_order():
    df, strength = synthetic()
    r = model.fit(df, xi=0.0, reg=0.5)
    assert r.hfa == pytest.approx(3.0, abs=1.0)
    net = [r.off[i] - r.dfn[i] for i in range(len(r.teams))]
    assert np.corrcoef([strength[int(t[1:])] for t in r.teams], net)[0, 1] > 0.9
    assert 9 < r.sigma_m < 14 and 13 < r.sigma_t < 22


def test_rare_teams_left_out_of_fit():
    df, _ = synthetic(rounds=2)
    extra = pd.DataFrame([{"date": df["date"].max(), "home": "T0", "away": "Tiny", "hg": 120, "ag": 50,
                           "neutral": False, "h1h": np.nan, "h1a": np.nan, "ot": False}])
    r = model.fit(pd.concat([df, extra], ignore_index=True))
    assert "Tiny" not in r.teams
    assert r.rating("Tiny") == (0.0, 0.0)


def test_markets_are_coherent():
    df, _ = synthetic()
    r = model.fit(df)
    eh, ea = 115.0, 108.0
    ln = mk.lines_for(r, eh, ea, spread=-6.5, total=224.5)
    p = mk.markets(r, eh, ea, ln)
    assert p["1"] + p["2"] == pytest.approx(1, abs=1e-3)  # no draws in basketball
    for per in ("H1", "H2", "Q1", "Q2", "Q3", "Q4"):
        assert p[f"{per}_1"] + p[f"{per}_X"] + p[f"{per}_2"] == pytest.approx(1, abs=1e-3)
        assert p[f"{per}_1"] > p[f"{per}_2"]  # the home side is better in every period
    assert r.per["Q1"][0] == pytest.approx(0.25, abs=0.02) and r.per["H1"][0] + r.per["H2"][0] == pytest.approx(1)
    assert ln["Q1to"] == 56.5 and ln["H1sp"] == -3.5  # 224.5 × ¼ and −6.5 × ½, on x.5 lines
    hf = {k: v for k, v in p.items() if k.startswith("HF_")}
    assert sum(hf.values()) == pytest.approx(1, abs=2e-3)
    assert hf["HF_11"] + hf["HF_X1"] + hf["HF_21"] == pytest.approx(p["1"], abs=2e-3)
    assert hf["HF_11"] > hf["HF_12"] and hf["HF_22"] > hf["HF_21"]
    assert p["1"] > 0.6 and p["WM_H6"] < p["1"] and p["WM_H11"] < p["WM_H6"]
    assert p["SP_H"] == pytest.approx(0.5, abs=0.08)  # expected margin 7 vs a 6.5 line
    assert ln["src"] == "book"
    assert sum(b["p"] for b in mk.bands(r, eh, ea)) == pytest.approx(1, abs=1e-3)


def test_half_line_never_pushes():
    assert mk.half_line(228.3) == 228.5
    assert mk.half_line(-5.2) == -5.5
    assert mk.half_line(7.0) == 7.5


def test_settle_frame_uses_stored_lines_and_pushes():
    df = pd.DataFrame({"hg": [110, 100, 100], "ag": [100, 103, 97], "h1h": [55, np.nan, 50], "h1a": [50, np.nan, 50],
                       "q1h": [30, np.nan, 25], "q1a": [20, np.nan, 25],
                       "ln_sp": [-6.5, 2.5, -3.0], "ln_to": [209.5, 205.5, 197.0],
                       "ln_ht": [104.5, 101.5, 99.5], "ln_at": [103.5, 102.5, 98.5], "ln_H1to": [104.5, 100.5, 99.5],
                       "ln_H2to": [100.5, 100.5, 97.0], "ln_Q1sp": [-3.5, 1.5, -0.5]})
    w = mk.settle_frame(df)
    assert list(w["SP_H"][:2]) == [1.0, 0.0]
    assert np.isnan(w["SP_H"][2]) and np.isnan(w["SP_A"][2])  # won by exactly 3: push
    assert list(w["TO_O"][:2]) == [1.0, 0.0] and np.isnan(w["TO_O"][2])
    assert w["H1_1"][0] == 1.0 and np.isnan(w["H1_1"][1]) and w["H1_X"][2] == 1.0
    assert w["H2_1"][0] == 1.0 and w["H2_1"][2] == 1.0  # 55-50 then 55-50; 50-50 then 50-47
    assert w["H2_O"][0] == 1.0 and np.isnan(w["H2_O"][2])  # 105 over 100.5; 97 on a 97 line pushes
    assert w["Q1_SP_H"][0] == 1.0 and w["Q1_X"][2] == 1.0
    assert w["HF_11"][0] == 1.0 and w["HF_X1"][2] == 1.0 and np.isnan(w["HF_11"][1])


def test_american_odds():
    assert american("-110") == pytest.approx(1.909, abs=1e-3)
    assert american("+150") == 2.5
    assert american("EVEN") == 2.0
    assert np.isnan(american("OFF"))
