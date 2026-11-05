# Model experiments

## 2026-11-05 · P0-5 Bootstrap confidence intervals

**Hypothesis.** Adding percentile-bootstrap 95% CIs (2,000 resamples, fixed seed) to the backtest summary shows whether the model's gap to the market and the value-bet losses are statistically real. This is measurement only, so predictions don't change.

**Change.** `pipeline.bootstrap_ci()`; `summarize()` adds `one_x_two.logloss_gap` and `logloss_gap_ci` (paired per-match model − de-margined market log-loss), plus `value.roi_ci` and `value.by_market[m].roi_ci` (per-bet flat-stake profit). These are additive JSON fields, and they're optional in `web/src/lib/types.ts`.

**Metrics (existing data/backtest.csv, 2026-11-05).**

| metric | value | 95% CI |
|---|---|---|
| model log-loss (with odds, n=14,187) | 1.0263 | |
| market log-loss | 1.0057 | |
| gap, model − market | +0.0206 | [+0.0177, +0.0234] |
| value ROI, all (11,486 bets) | −13.5% | [−16.3%, −10.8%] |
| ROI 1 / X / 2 | −17.0% / −11.1% / −16.3% | [−21.5, −12.3] / [−19.3, −2.4] / [−21.7, −10.9] |
| ROI O2.5 / U2.5 | −4.3% / −8.5% | [−10.3, +1.6] / [−13.1, −3.8] |

**Decision.** Accepted. The bookmaker is significantly better than the model, and value betting loses money significantly in every market except O2.5.

**Next.** The acceptance rule compares *before vs after* on the same matches. That needs a paired A/B helper that runs two backtests and gives a CI on the per-match difference (P0-5b). Then P0-2 (Shin) and P0-1 (model+market blend), the biggest expected gain.
