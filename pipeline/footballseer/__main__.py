import argparse
import logging
from datetime import date

from . import pipeline
from .basketball import pipeline as basketball
from .tennis import pipeline as tennis


def main() -> None:
    ap = argparse.ArgumentParser(prog="footballseer")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="fit models, predict fixtures, settle ledger, export JSON")
    r.add_argument("--date", type=date.fromisoformat, help="pretend today is this date")
    b = sub.add_parser("backtest", help="walk-forward backtest for the track record")
    b.add_argument("--start", default="2025-08-01")
    b.add_argument("--refit-days", type=int, default=7)
    b.add_argument("--out", help="write the backtest CSV here instead of data/backtest.csv")
    cp = sub.add_parser("compare", help="paired A/B 1X2 log-loss comparison of two backtest CSVs")
    cp.add_argument("base")
    cp.add_argument("cand")
    bb = sub.add_parser("basketball", help="the same jobs for basketball")
    bb.add_argument("job", choices=["run", "backtest"])
    bb.add_argument("--date", type=date.fromisoformat, help="pretend today is this date")
    bb.add_argument("--start", default="2025-05-01", help="backtest start (covers the 2025 WNBA season)")
    bb.add_argument("--refit-days", type=int, default=7)
    tn = sub.add_parser("tennis", help="rate players and export JSON for tennis")
    tn.add_argument("job", choices=["run"])
    tn.add_argument("--date", type=date.fromisoformat, help="pretend today is this date")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    if args.cmd == "run":
        pipeline.run(args.date)
    elif args.cmd == "backtest":
        pipeline.backtest(args.start, refit_days=args.refit_days, out=args.out)
    elif args.cmd == "compare":
        import json
        import pandas as pd
        res = pipeline.compare_backtests(pd.read_csv(args.base), pd.read_csv(args.cand))
        print(json.dumps(res, indent=1))
    elif args.cmd == "tennis":
        tennis.run(args.date)
    elif args.job == "run":
        basketball.run(args.date)
    else:
        basketball.backtest(args.start, args.date, refit_days=args.refit_days)


if __name__ == "__main__":
    main()
