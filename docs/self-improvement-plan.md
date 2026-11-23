# FootballSeer self-improvement plan

Written 5 Nov 2026 from a read of `pipeline/footballseer/` and the current `web/public/data/*track_record.json`.

## 1. Where things stand

| Area | Model today | Measured result |
|---|---|---|
| Football goals | Dixon-Coles Poisson with time decay. `xi=0.0019` (half-life about 1 year) and `reg=4.0` are hard-coded in `model.fit` and shared by every league | 1X2 log-loss **1.0263** vs de-margined bookmaker **1.0057** (n=14,187). RPS 0.2116 |
| Football value bets | Flags any market where `p*odds-1 > 5%` (`VALUE_EDGE`), on 1X2 and O/U 2.5 | Flat-stake ROI **−13.5%** (1: −17%, X: −11%, 2: −16%, O2.5: −4%, U2.5: −8%) |
| HT / 2H | Full-time λ split by the league's first-half share; the halves are treated as independent Poisson | Not backtested (left out of the ledger) |
| Corners | Multiplicative for/against rates and a Poisson total | Not backtested |
| Basketball | Weighted ridge on points, normal margin and total | Log-loss 0.607 vs market 0.558 (NBA); most value-bet ROIs are negative |
| Tennis | Elo with FiveThirtyEight K, a fitted scale, and a best-of-five conversion | Unknown |

**Main conclusion:** the model is clearly worse than the market (about 0.02 nats per match), so the "value" flags mostly catch model error, not real edge. Fix that first. Every other change should be judged by whether it closes this gap.

## 2. Ideas from the research, ranked by expected gain per unit of effort

### P0: stop losing money and measure properly
1. **Combine model and market prices.** Use `p = softmax(a·log p_model + b·log p_market)`, or logistic stacking with the market as a feature, and fit it walk-forward. The research consistently finds that market odds hold most of the information and models add only a small amount on top (Štrumbelj 2014; Hubáček et al. 2019). Value is then flagged only where the combined price disagrees with the market.
2. **Remove the bookmaker margin correctly.** The code divides 1/odds by the total (basic normalisation). Shin's method or the power method corrects favourite–longshot bias better (Štrumbelj 2014; Clarke et al. 2017). This also affects the benchmark log-loss.
3. **Benchmark against Pinnacle closing odds.** football-data.co.uk provides `PSH/PSD/PSA` and closing `PSCH/PSCD/PSCA`. Use Pinnacle closing as the "truth" benchmark. Track **closing-line value (CLV)** for every flagged bet, because CLV gives a reliable signal long before ROI does.
4. **Staking.** Use fractional Kelly (¼) with a minimum edge that depends on the odds. Look into raising `VALUE_EDGE` and capping longshots, since the losses are largest on 1 and 2.
5. **Statistical honesty.** Report bootstrap confidence intervals on the log-loss difference and on ROI. Never accept a change that wins by less than its standard error. **Status: Done (2026-11-05)**: `summarize()` exports `logloss_gap`/`logloss_gap_ci` and `roi_ci` (overall and per market). Paired per-match CIs for *before vs after* experiments (A/B on the same matches) remain a follow-up, P0-5b.
- **P0-5b** **Status: Done (2026-11-08)**: `compare_backtests()` + `python -m footballseer compare BASE CAND` and `backtest --out`. Paired A/B backtest helper: run baseline and candidate on identical matches and report a bootstrap CI on the per-match log-loss difference, plus per-league deltas (needed to apply the acceptance rule).

### P1: better football ratings
6. **Tune `xi` and `reg` per league** with walk-forward log-loss/RPS (a grid of xi in {0.001…0.004} and reg in {1…10}). Dixon and Coles (1997) chose ξ by optimising predictive likelihood, not by fixing it.
7. **Shots and shots on target as signal.** football-data CSVs include `HS/AS/HST/AST`. Shot-based and xG-based ratings predict future goals better than goals do (e.g. Wheatcroft 2020 "GAP ratings"). Options: (a) fit a second Dixon-Coles on shots on target × league conversion rate and blend the two λ values; (b) use a mixed target, `goals_eff = α·goals + (1-α)·SOT·conv`.
8. **Real xG where it can be had.** Understat or FBref xG for the top 5 leagues. Ratings fitted on xG are the strongest public single-source predictor (see the xG-based Dixon-Coles variants in the "penaltyblog" and "soccerdata" ecosystems).
9. **Dynamic team strength.** Replace static decay with a state-space or random-walk model (Koopman & Lit 2015, dynamic bivariate Poisson; Rue & Salvesen 2000) or a cheap stand-in: **pi-ratings** (Constantinou & Fenton 2013) or goal-based Elo (Hvattum & Arntzen 2010) as extra features.
10. **Promoted and relegated teams.** Load the lower division (`en.2` is already cached) and fit across tiers, or seed promoted sides with a prior learned from history (they usually perform like about the 17th-placed team). Today L2 shrinkage pulls them towards the league *average*, which is too optimistic.
11. **Home advantage per team, with season/COVID effects.** Use a team-level home effect with shrinkage, and allow home advantage to drift over time.
12. **Overdispersion and the draw rate.** Check calibration of X and of scores like 0-0 and 1-1. Consider a bivariate Poisson (Karlis & Ntzoufras 2003), a negative-binomial, or a Weibull-count model (Boshnakov et al. 2017). The current `rho` bound of ±0.2 may be too tight. Check where it ends up.

### P2: a feature-based meta-model (the Soccer Prediction Challenge approach)
13. **Gradient-boosted stacker** (LightGBM or CatBoost) predicting 1X2 and O/U, with inputs: DC λh/λa, pi-ratings, Elo, shot ratings, market-implied probabilities, rest days, congestion, travel distance, form deltas, league goal profile, and month of season. Hubáček et al. (2019) won the 2017 Soccer Prediction Challenge this way (rating features + GBM). Use ordered or multinomial output with walk-forward training only.
14. **Schedule features.** Rest days and fixture congestion. Cup and European fixtures are missing from football-data, but ESPN (`espn.py`) or openfootball can supply them.
15. **Team news (later).** Injuries, suspensions, and lineup strength (minutes-weighted player ratings). This has a big effect but needs a new data source. Treat it as a stretch goal.

### P3: the secondary markets
16. **HT/2H.** Replace the fixed share with per-team first-half shares, shrunk towards the league share, and add half-level DC correlation. Add HT and corners to the ledger so they are actually measured.
17. **Corners.** Use negative-binomial instead of Poisson (corner counts are overdispersed). Include shots and possession proxies, and the expected goal difference (trailing teams win more corners).
18. **Cards.** The data has `HY/AY/HR/AR`. A referee-plus-team cards model is a cheap new market.

### Basketball and tennis
19. **Basketball.** *(19a back-to-back term Rejected 2026-11-09: Δlogloss=+0.0001, CI [-0.0007,+0.0010])* Add rest and back-to-back effects, travel, and an adjustment for injured or rested stars. Fit the margin standard deviation per matchup. Combine with the market as in (1). Model team pace and efficiency separately (possessions × points per possession) instead of folding them into off/def.
20. **Tennis.** Use surface-specific Elo blended with overall Elo (Kovalchik 2016 compared Elo variants; the surface blend is the standard improvement). Add a serve/return point-win model (Barnett & Clarke 2005) for set and game markets, and a fatigue term (sets played in the last N days).

## 2b. Product, UI/UX and reliability backlog

The web app (`web/`, Next.js 16 + React 19 + Tailwind 4) is a near-complete BetMines-style site for football and basketball (about 20 routes each); tennis has only 5. It has no frontend tests, and only 28 source files use `aria-` or `sr-only`. Each item below is one routine-sized change.

### Trust and honesty (most important, because the model trails the market)
- **U1** *(Partial 2026-11-05: model-vs-market note with gap CI and ROI CIs shipped; CLV CI waits on P0-3)* Track record: show model-vs-market log-loss with a plain-language note ("the bookmaker is currently more accurate than us by X"). Show bootstrap CIs on ROI and CLV once they exist (P0-3/5).
- **U2** Value page: label picks with confidence and sample size. Show historical ROI for that market and odds band next to each pick. Hide or grey out markets whose backtested ROI CI is below 0.
- **U3** A data-freshness badge (last pipeline run, last odds update) in `Shell.tsx`, with a warning state when data is more than 24h old.
- **U4** A "How it works" explainer per prediction (λ home/away, home advantage, key drivers) on `/match/[id]`.
- **U5** A responsible-gambling notice and an 18+ footer link. Avoid "sure tip" wording anywhere in the UI copy.

### UX and parity
- **U6** Tennis parity: track record, value, daily and filters pages using the shared components.
- **U7** Mobile pass on `MatchesBoard`, `MarketsGrid`, `ScoreHeatmap` and the standings tables: no horizontal overflow at 360px, sticky team column, tap targets of at least 44px.
- **U8** Loading, empty and error states on every board (no fixtures today, live feed down, league with no odds).
- **U9** Keep filters, sort and selected market in the URL so views can be shared and survive a refresh.
- **U10** Prediction-change indicator: show how far probabilities and odds moved since the morning run.

### Accessibility and performance
- **U11** Accessibility sweep: semantic tables, `aria-label` on icon-only buttons, visible focus rings, WCAG AA colour contrast (red/green won/lost must not rely on colour alone), and keyboard-usable date strip and tabs.
- **U12** Payload size: split the large per-day JSON, lazy-load match details, and check the bundle size from `next build`.
- **U13** SEO: `generateMetadata` per match, league and team page, plus Open Graph images and a sitemap.
- **U14** Show `track_record.json["alerts"]` (pipeline health warnings, e.g. a league with 0 fixtures) on the track-record page, in text and not only by colour.

### Reliability and code health
- **R1** (Done 2026-11-06) Pipeline resilience: retries and backoff on sources, clear logs when a league silently returns 0 fixtures, and an alert row in the track-record JSON.
- **R2** Schema contract: one typed definition of the JSON the pipeline exports, checked on both sides (pydantic or JSON Schema in Python, the matching TS type in `web/src/lib`).
- **R3** Tests: pipeline tests for the markets maths and settlement edge cases; `npm run lint` and `npm run build` in CI; a smoke test that renders the main routes.
- **R4** Cleanup: remove duplicated football and basketball component logic where a shared component fits; prune unused routes.

## 3. Evaluation protocol (the rules every experiment follows)
- **Walk-forward only.** Fit on data before date *t*, predict matchday *t*. No information from after kick-off.
- **Primary metric:** 1X2 log-loss on matches with Pinnacle odds, model minus market (lower is better). **Secondary:** RPS, Brier per market, calibration slope, CLV, ROI with a 95% confidence interval.
- **Acceptance:** an improvement of ≥ 0.001 nats with a bootstrap 95% CI that excludes 0, and no league getting worse by more than 0.003.
- **Logging:** record every experiment in `docs/experiments.md` (hypothesis, change, metrics before and after, accept or reject).
- Keep `pytest` green. Add a test for each new model component, following `tests/test_model.py`.

## 4. Roadmap
| Sprint | Work | Exit criterion |
|---|---|---|
| 1 | Shin de-margining, Pinnacle closing benchmark, CLV in ledger, bootstrap CIs, experiment log | The track record shows CLV and CIs |
| 2 | Per-league xi/reg tuning; model+market blend; value rule rebuilt on the blend | Value-bet ROI CI includes 0 or better; CLV ≥ 0 |
| 3 | Shots-on-target ratings; promoted-team prior | Model-only log-loss gap to market shrinks by ≥ 25% |
| 4 | Pi-ratings/Elo features + GBM stacker; rest/congestion | Further gain, accepted under the rule above |
| 5 | HT/corners into ledger, NB corners, cards market; basketball and tennis upgrades | Each new market calibrated within ±3% per bin |

## 5. Routine prompt

The Cay routine prompt is kept in `docs/cay-routine-prompt.md`. Its run log is `docs/improvement-log.md`.

## 6. Key references
- Dixon & Coles (1997), *Modelling association football scores and inefficiencies in the football betting market*. JRSS-C.
- Karlis & Ntzoufras (2003), bivariate Poisson for football. *The Statistician*.
- Rue & Salvesen (2000); Koopman & Lit (2015): dynamic team strengths. JRSS-A.
- Hvattum & Arntzen (2010), Elo-based prediction in football. *IJF*.
- Constantinou & Fenton (2013), pi-ratings. *JQAS*.
- Štrumbelj (2014), on determining probability forecasts from betting odds (Shin method). *IJF*.
- Boshnakov, Kharrat & McHale (2017), Weibull count model for football. *IJF*.
- Hubáček, Šourek & Železný (2019), learning to predict soccer results from relational data with GBMs (the 2017 Soccer Prediction Challenge). *Machine Learning*.
- Wheatcroft (2020), forecasting football matches with shot-based (GAP) ratings. *IJF*.
- Kovalchik (2016), searching for the GOAT of tennis win prediction. *JQAS*.
- Barnett & Clarke (2005), combining player statistics to predict tennis outcomes. *IMA JMM*.
