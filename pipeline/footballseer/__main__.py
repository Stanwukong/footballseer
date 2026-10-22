import argparse
import logging
from datetime import date

from . import pipeline


def main() -> None:
    ap = argparse.ArgumentParser(prog="footballseer")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="fit models, predict fixtures, settle ledger, export JSON")
    r.add_argument("--date", type=date.fromisoformat, help="pretend today is this date")
    b = sub.add_parser("backtest", help="walk-forward backtest for the track record")
    b.add_argument("--start", default="2025-08-01")
    b.add_argument("--refit-days", type=int, default=7)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    if args.cmd == "run":
        pipeline.run(args.date)
    else:
        pipeline.backtest(args.start, refit_days=args.refit_days)


if __name__ == "__main__":
    main()
