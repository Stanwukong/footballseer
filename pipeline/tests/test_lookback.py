from datetime import date

import numpy as np
import pandas as pd

from footballseer import pipeline


def rows(dates, hg):
    df = pd.DataFrame({
        "id": [f"E0-{d}-{i}" for i, d in enumerate(dates)], "league": "E0", "date": pd.to_datetime(dates),
        "time": "15:00", "home": "A", "away": "B", "xg_h": 1.5, "xg_a": 1.1, "hg": hg, "ag": [0 if pd.notna(h) else np.nan for h in hg],
    })
    for m in pipeline.MARKETS:
        df[m] = 0.5
    for c in pipeline.ODDS_MARKETS.values():
        df[c] = np.nan
    return df


def test_lookback_prefers_live_days_and_keeps_pending():
    today = date(2026, 10, 24)
    ledger = rows(["2026-10-22", "2026-10-23", "2026-10-24"], [1, np.nan, np.nan])
    bt = rows(["2026-10-16", "2026-10-17", "2026-10-22"], [2, 0, 3])
    out = pipeline.results_json(ledger, bt, today)
    got = [(r["date"], r["source"], r["score"]) for r in out]
    # 16 Oct is outside the week; 22 Oct has live predictions, so its backtest row goes; today is not history yet.
    assert got == [("2026-10-17", "backtest", [0, 0]), ("2026-10-22", "live", [1, 0]), ("2026-10-23", "live", None)]


def test_lookback_empty():
    assert pipeline.results_json(pd.DataFrame(), pd.DataFrame(), date(2026, 10, 24)) == []
