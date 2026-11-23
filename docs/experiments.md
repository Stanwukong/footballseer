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

## 2026-11-08 · P0-5b paired A/B backtest comparison (measurement only)

- **Hypothesis:** a paired comparison on identical matches gives a usable Δlog-loss CI so the protocol (Δ ≤ −0.001, CI excluding 0, no league worse by > 0.003) can actually be applied. Self-comparison must give Δ=0, and a known-worse candidate must be rejected.
- **Change:** `pipeline.compare_backtests(base, cand)` inner-joins two backtests on `id` (settled matches with full 1X2 odds only), computes per-match d = LL_cand − LL_base, and reports the mean, a percentile bootstrap 95% CI (2,000 resamples, seed 0), per-league deltas, the worst league, and `accepted`. CLI: `python -m footballseer backtest --out cand.csv` writes a candidate without touching data/backtest.csv; `python -m footballseer compare data/backtest.csv cand.csv` prints the JSON.
- **Metrics:** the predictions are unchanged. On data/backtest.csv vs itself: n=14,187 (matches the P0-5 gap n), Δ=0.0000. Sanity candidate (each 1X2 probability shrunk 10% towards 1/3): base 1.0263 → 1.0273, Δ=+0.0010, CI [+0.0003, +0.0016], worst league P1 +0.0087 → rejected. A 0.001-nat change is resolvable here: the paired CI half-width is ~0.0007.
- **Decision:** accepted (infrastructure).
- **Next:** P0-2 (Shin or power de-margining). It changes the benchmark rather than the model, so report the market log-loss under each method. Then P0-1 (model+market blend), judged with `compare`.

## 2026-11-09 · 19a basketball back-to-back terms (rejected)
- **Hypothesis:** adding two league-wide ridge terms (points scored / allowed by a side that played the day before) to the basketball points model lowers walk-forward moneyline log-loss by ≥ 0.001 nats.
- **Change:** `model.back_to_back()` flags from the schedule; two extra columns in the weighted ridge regression (ridge-shrunk to 0); `expected()` takes the flags. Reverted.
- **Metric:** `basketball backtest` (start 2025-05-01, weekly refits), paired on the same 10,017 games; ESPN has no historical odds, so this is model log-loss, not vs-market.
- **Result:** 0.5589 → 0.5590, Δ = +0.0001, bootstrap 95% CI [−0.0007, +0.0010]. Per league: GLG −0.0016, NCAAM +0.0004, WNBA +0.0003, NBA/EL/ECUP/NBL ≈ 0.
- **Decision:** rejected. The fatigue effect is small next to team-strength noise, and most games (NCAAM, Euro leagues) rarely have back-to-backs.
- **Next:** pace × efficiency split (rest of item 19), or a per-league b2b term limited to NBA/WNBA with a larger sample.
