# BetMines feature inventory and FootballSeer parity

Crawled 24 Oct 2026 from betmines.com (home, match, match preview, league, and every page under Tools and VIP).
Status: **Built** = in FootballSeer now · **Partial** = built with a stated gap · **Not built** = needs data or services we don't have.

## Free features

| BetMines | What it shows | FootballSeer | Status |
|---|---|---|---|
| Matches (home) | Date strip (Live, −1…+4 days), market tabs (Top tips, 1X2, BTTS, U/O 1.5/2.5/3.5, Double chance, HT/2H goals, BTTS HT/2H, Corners 7.5–10.5), search, league grouping, favourite star, Prob / Market / Pick / Odds columns | `/` with the same tabs, date strip (incl. **Live** with a count), search, sort by league / kick-off / probability, favourite matches and leagues; live minute, score, red cards and in-play probability on each row; picks marked won/lost at full time | Built |
| Predictions for today / tomorrow / yesterday | Same list per day, with settled results for yesterday | Date strip days plus a **Results** day: pick ✓/✗ against the final score | Built: falls back to the latest backtest week until live predictions settle |
| Match page | Header (form, kick-off, venue), Who will win, written preview, predictions per market and period, odds, standings (total/home/away, O/U, BTTS…), last 5 / home-away / H2H with first-half results, pre-match stats (last 10, per goal line), trends, alerts, FAQ | `/match/[id]`: header with form and table position, 1X2 bar, key figures, generated preview, all markets (incl. 1st/2nd half and corners), correct-score heatmap, odds vs model with edge, standings with toggles, last 5/10/venue with HT scores, stats comparison (last 10 / venue / season), team strength, trends, H2H, FAQ | Built (no alerts, no venue/weather) |
| Leagues / league page | League list, fixtures, standings | `/leagues`, `/leagues/[code]`: standings, team market table, league profile, power ratings, upcoming matches | Built |
| Match previews | Editorial articles by staff writers | `/previews`: previews generated from model, table, form and H2H | Partial: data-written, not journalism (no line-ups or injury news) |
| Advanced filters | Event, dates, leagues, % last 10, % home-at-home / away-away, % all league matches, H2H %, avg scored/conceded last 5, odds and probability range, saved searches | `/filters`: all of these, saved searches in the browser | Built |
| BetMines Machine | Events, dates, leagues, number of matches 1–20, odds range, probability range, generated accumulator | `/generator` | Built |
| Leagues stats | Rank leagues by event %: goal lines, BTTS, cards, corners, goals home/away, % goals per half; "only leagues with upcoming matches" | `/league-stats` | Built |
| Daily bets | Expert "Double" and "Risk" accumulators | `/daily`: model-picked double and three-leg risk per day | Built (model, not experts) |
| Settings | Theme, language, odds format (decimal/fractional/American) | Light/dark/system theme, odds format | Built (English only) |
| Favourites | Starred matches and leagues | `/favourites`, stored in the browser | Built (per browser, no account) |

## Premium features

| BetMines | What it does | FootballSeer | Status |
|---|---|---|---|
| All market predictions unlocked | Every market's probability | All markets free on every match | Built |
| Pre-match scanner + backtesting (12–36 months) | Strategy from odds/probabilities/stats; desired outcome; backtest picks, success rate, mean odd, ROI, per-league; suggested filters; Excel export; Telegram alerts | `/scanner`: outcome + up to 10 rules on model probability, bookmaker odds and edge; backtest over 3/6/12 months or all; picks, hit rate, break-even odds, mean odds, flat-stake ROI, profit curve, per-league; suggested and saved strategies; CSV export; upcoming matches that fit | Partial: rules can't use team stats historically; no Telegram alerts |
| Value bet bot | Hourly value-bet notifications | `/value`: matches where model × odds beats the price by 5%+ | Partial: list, no push notifications |
| Trends | Streaks for teams with upcoming matches: wins, unbeaten, defeats, winless, draws, goals lines, BTTS, 1st half…; top trends or by match | `/trends` with event, day, league and minimum-run filters | Built |
| Advanced team stats | For 100+ events, teams with the most occurrences, with next match | `/team-stats`: 15 events over last 10 / season / home / away | Built (goals, results, sheets; no cards or corners per team yet) |
| Exclusive events in filters / Machine | Corners 7.5/8.5, 1X2, half markets | Included in filters, generator and matches | Built |
| Live scores / match centre | Live score, minute, stats, events, line-ups, commentary | `/live` and the match page's Live panel: score, minute, goals and cards, full stats box, timeline, line-ups, commentary, and in-play probabilities (result, goals, BTTS, next goal) | Built (ESPN, 30 s refresh) |
| Live scanner | Alerts on in-play stats (shots, xG, possession, cards…) | – | Not built: the feed is there now; needs rules plus push notifications |
| Monitoring (live radar) | Live momentum, scenarios (hot match, goal pressure…) | `/live` cards show possession, shots and shots on target per match | Partial: no momentum graph or scenario filters |
| Match alerts | Notify on live conditions | – | Not built: needs live data and push |
| VIP Telegram group | Community and support | – | Not applicable |

## Data behind it

All new data comes from football-data.co.uk history the pipeline already downloads (`pipeline/footballseer/stats.py`):
standings, form, last 10 with half-time scores, head-to-head, per-team hit rates (last 10, season, home, away), streaks,
league market profiles, first/second-half markets (league first-half goal share), and a corners model (main leagues only,
since the extra leagues have no corner data). Everything is league matches only: cups and European games aren't in the source.

## Live data

Live scores come from ESPN's public site API (`site.api.espn.com`, no key), proxied by `/api/live` (all of today's
matches in covered leagues) and `/api/live/[league]/[event]` (one match in full). SofaScore was tried first but refuses
non-browser clients. The pipeline links each fixture to its ESPN event (`pipeline/footballseer/espn.py`), so the web app
never matches team names at request time; 37 of 38 leagues have a feed (not Poland). ESPN's API is unofficial and
undocumented: it can change without notice, and its terms should be checked before commercial use. Swapping in a
licensed provider means replacing `web/src/lib/live.ts` and the linker; the `LiveEvent` shape stays the same.
