You are running the FootballSeer self-improvement routine, headless from Cay on Windows. Work ONLY in the routine's own clone, C:\Users\DELL 7300\Documents\GitHub\footballseer-routine. Never touch C:\Users\DELL 7300\Documents\GitHub\footballseer, which is my working copy. Each run makes ONE small, verified improvement, logs it, and stops. Nobody is watching: decide sensibly, state your assumptions, and only ask (AskUserQuestion) when a decision really belongs to me.

SETTINGS
- PUSH: no   (yes = push the branch and open a DRAFT PR with gh; no = commit locally only)
- Max one backlog item per run. Keep diffs small (about 300 changed lines at most, excluding generated data).

0. READ FIRST
- docs/self-improvement-plan.md: model backlog P0–P3 and items 1–20, product/UI backlog U1–U13, reliability backlog R1–R4, the evaluation protocol, and the roadmap.
- docs/improvement-log.md: create it if missing, as a table of date | track | item | hypothesis | result | decision | branch | next.
- docs/experiments.md: model experiment details. Create it if missing.
- web/AGENTS.md: this Next.js version has breaking changes. Read the relevant guide in web/node_modules/next/dist/docs/ before writing any web code.

1. PREPARE THE REPO SAFELY
- Run `git status`. If there are uncommitted changes outside data/ and web/public/data/, they are mine: STOP and report. Do not stash, reset or overwrite them.
- Run `git checkout main` and `git pull --ff-only`. GitHub Actions commits prediction data to main three times a day, so always start from the latest.
- Create a branch named `routine/<YYYY-MM-DD>-<item-id>` (for example routine/2026-11-06-P0-2).
- Never edit or rewrite historical data in data/ledger.csv or data/backtest.csv by hand. Regenerating them through the pipeline is fine.

2. CHOOSE THE TRACK (rotate so every area improves)
Look at the last 3 rows of improvement-log.md and pick:
- MODEL (football items 1–18) by default;
- UI/UX (U1–U13) if none of the last 3 runs was UI/UX;
- RELIABILITY (R1–R4) if none of the last 4 was reliability, or if the last pipeline/CI run failed (check `gh run list --limit 3` if gh is available);
- OTHER SPORTS (items 19–20) if none of the last 6 was basketball or tennis.
Within the track, take the highest-priority item that is not Done or Rejected, and whose prerequisites are done (e.g. U1 needs P0-3/5 data; if it isn't there, ship the parts that are possible or pick the next item). Skip anything needing new paid APIs, credentials, or scraping beyond football-data, openfootball, ESPN, Euroleague, or sources already in pipeline/footballseer/sources.py. Mark those Blocked with the reason.

3. STATE A FALSIFIABLE HYPOTHESIS AND A SUCCESS CHECK BEFORE CODING
- MODEL: "Change X lowers walk-forward 1X2 log-loss on matches with odds by at least 0.001 nats", or the item's own metric: Brier/calibration for secondary markets, ROI/CLV CI for staking.
- UI/UX: a concrete, checkable outcome, e.g. "MatchesBoard has no horizontal overflow at 360px", "every icon-only button has an aria-label", "track-record page shows model-vs-market log-loss with a plain-language note".
- RELIABILITY: e.g. "a source returning 0 fixtures now logs a warning and adds an alert to track_record.json", proven by a test.

4. IMPLEMENT
- Pipeline (pipeline/footballseer): match the existing style (dataclasses, vectorised numpy/pandas, docstrings that explain the maths). Add or extend tests in pipeline/tests. Use only data from before the prediction date (no leakage).
- Web (web/src): reuse the components in web/src/components and the types in web/src/lib. Keep the JSON schema the pipeline exports backwards-compatible: add fields, never rename or remove them, and update the TS types and Python export together. Follow Tailwind 4 conventions already in globals.css. Every UI change has to work at 360px and on desktop, be keyboard-reachable, use AA contrast, and not show won/lost by colour alone.
- Copy: be honest about accuracy (the model currently trails the bookmaker). Never use wording like "sure win" or "guaranteed".

5. VERIFY (all must pass; capture the numbers)
- Python: always use the project venv, `pipeline\.venv\Scripts\python.exe`, because system Python lacks scipy. If the venv is missing or broken, recreate it inside pipeline/ with `python -m venv .venv` and then `.venv\Scripts\python.exe -m pip install -r requirements.txt`.
- `cd pipeline && .venv\Scripts\python.exe -m pytest -q`
- MODEL items: `.venv\Scripts\python.exe -m footballseer backtest` (plus `basketball backtest` for basketball). Read the before/after metrics from the resulting summary. Accept only under the protocol: improvement ≥ 0.001 nats, bootstrap 95% CI excluding 0, and no league worse by more than 0.003. Report the CI.
- WEB changes: `cd web && npm run lint && npm run build` (run `npm ci` first if node_modules is missing or package-lock.json changed). Note route sizes from the build output against the previous run if they're in the log. Check the change against its success check by reading the rendered code paths. If you start a server (`next start`) to check pages with curl, stop it before finishing; never leave servers or watchers running.
- If a check fails and you can't fix it within this run: revert the code changes, keep only the log entry, and mark the item Rejected or Retry with the reason.

6. RECORD
- Append a row to docs/improvement-log.md. For MODEL items, also write the full experiment in docs/experiments.md (hypothesis, change, metrics before and after with CIs, decision, what it suggests next).
- Update the item's status in docs/self-improvement-plan.md (Done / Rejected / Blocked / Partial). Add newly discovered ideas to the right backlog with an ID; don't silently expand scope.
- Commit on the branch: "<track>: <item-id> <short description> (<accepted|rejected>[, Δlogloss=…])", ending with the Co-Authored-By line from the session's attribution instructions.
- If PUSH is yes: push the branch and run `gh pr create --draft` with the hypothesis, the evidence (metrics or before/after notes), and the risks. Never push to main, never merge, never force-push, and never change the GitHub Actions schedule or secrets.
- Finally `git checkout main` so the next scheduled data commit isn't disturbed.

7. STOP CONDITIONS (report instead of continuing)
- My uncommitted work is present; main can't fast-forward; tests on main were already failing (report this, and make fixing it the next RELIABILITY item).
- Three MODEL items in a row rejected: suggest re-prioritising in the summary.
- A change would need credentials, paid data, a breaking JSON schema change, or deleting user-visible features.

FINAL SUMMARY (short; this is what I read in Cay)
Track and item · hypothesis · result with numbers · accepted or rejected · branch and commit (and PR link if pushed) · what's next · anything that needs my decision.
