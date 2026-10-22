# FootballSeer

Football prediction dashboard in the spirit of BetMines: probabilities for every
goals-based market across 38 leagues, a screener, value bets, a matchup
predictor, and a public track record that compares the model with the bookmakers.

```
pipeline/  Python: data ingest, Dixon-Coles model, backtest, JSON export
web/       Next.js app that renders the exported JSON as static pages
data/      Prediction ledger + backtest (committed, so the track record is auditable)
```

## How it works

1. **Data**: [football-data.co.uk](https://www.football-data.co.uk) results and
   bookmaker odds for 22 European divisions plus 16 extra leagues worldwide. If the
   site is unreachable, the pipeline falls back to the newest Wayback Machine
   snapshot. For fixtures it falls back to [openfootball](https://github.com/openfootball/football.json)
   schedules.
2. **Model**: one Dixon-Coles model per league. It estimates each team's attack and
   defence strength, plus home advantage and a low-score correction. Recent matches
   count more (half-life ≈ 1 year), and a ridge penalty pulls teams with little data
   towards the league average.
3. **Markets**: the model produces a probability for every scoreline, and every
   market is derived from that one table: 1X2, double chance, draw-no-bet,
   over/under 0.5–4.5, BTTS, team goals, clean sheets and correct score.
4. **Value**: if model probability × average bookmaker odds − 1 is above 5%, the bet
   is flagged.
5. **Track record**: live predictions go into `data/ledger.csv` before kick-off and
   are settled when results arrive. `backtest` replays the season week by week,
   using only data that existed at the time.

## Running it

```bash
# pipeline
cd pipeline
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q
python -m footballseer backtest --start 2025-08-01   # one-off, ~10-20 min on first download
python -m footballseer run                           # daily

# web
cd web
npm install
npm run dev
```

## Deploying (≈ $0/month)

- **Web**: import the repo into Vercel (or Cloudflare Pages) with root directory `web`.
  Every page is static, so it serves from the CDN.
- **Pipeline**: `.github/workflows/predict.yml` runs twice a day on GitHub Actions,
  commits the refreshed JSON, and the push triggers a redeploy.
- A database (e.g. Neon Postgres) is only needed once you add accounts, saved
  strategies or alerts.

## Known limitations / next steps

- The model only sees goals. Adding xG, shots, lineups and injuries is the biggest
  accuracy upgrade. A LightGBM layer on top of these ratings is the natural next step.
- Promoted teams start at the league average and take a few weeks to settle.
- Odds-based markets are limited to 1X2 and O/U 2.5 (what football-data publishes).
  Use The Odds API or API-Football for BTTS, Asian handicap, corners and so on.
- Cups, European competitions and leagues outside these 38 need another data
  source (API-Football covers 1,000+ competitions).
- Gambling regulation differs by country. Check the local rules before adding
  affiliate links or charging for tips.
