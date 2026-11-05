# Improvement log

| date | track | item | hypothesis | result | decision | branch | next |
|---|---|---|---|---|---|---|---|
| 2026-11-05 | MODEL | P0-5 | Backtest summary reports a bootstrap 95% CI on the model−market 1X2 log-loss gap and on value-bet ROI (overall and per market); the CIs are deterministic and a unit test proves coverage/exclusion of 0 | Gap 0.0206 nats, CI [0.0177, 0.0234] (n=14,187). ROI −13.5%, CI [−16.3%, −10.8%] (11,486 bets). Only O2.5's ROI CI includes 0 ([−10.3%, +1.6%]). 43 tests pass | accepted (measurement only, Δlogloss=0) | routine/2026-11-05-P0-5 | P0-2 Shin de-margining (needs P0-5b paired A/B CI helper); U1 can now show the CIs |
