"""Basketball markets from the points model.

The margin and total are discretised normals on whole points. Basketball has
no draws: a level score after regulation goes to overtime, so that mass is
moved to small wins for either side in proportion to their chances. Periods
(halves, quarters) can end level, so their result markets are three-way.

Spread and totals markets are priced at a line: the bookmaker's when we have
one, otherwise a stand-in (`lines_for`). Period lines are the game's lines
scaled by the period's share of the points. Integer lines can push;
probabilities are quoted given no push, which is how the bet is settled.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.stats import norm

from .model import PERIODS, Ratings, period_scores

SPAN = 120  # margins and team totals considered: ±SPAN around the mean
OT_SD = 5.0  # spread of overtime winning margins

PERIOD_NAMES = {"H1": "1st half", "H2": "2nd half", "Q1": "1st quarter", "Q2": "2nd quarter", "Q3": "3rd quarter", "Q4": "4th quarter"}
# Outcomes priced for every period, and how each reads.
PERIOD_OUTCOMES = {
    "1": "Home wins the {p}", "X": "{P} level", "2": "Away wins the {p}",
    "SP_H": "Home covers the {p} spread", "SP_A": "Away covers the {p} spread",
    "O": "Over the {p} total", "U": "Under the {p} total",
    "HT_O": "Home over {p} team total", "HT_U": "Home under {p} team total",
    "AT_O": "Away over {p} team total", "AT_U": "Away under {p} team total",
}
HTFT = {"HF_11": "Home leads at half, home wins", "HF_12": "Home leads at half, away wins",
        "HF_X1": "Level at half, home wins", "HF_X2": "Level at half, away wins",
        "HF_21": "Away leads at half, home wins", "HF_22": "Away leads at half, away wins"}

LABELS = {
    "1": "Home win", "2": "Away win",
    "SP_H": "Home covers the spread", "SP_A": "Away covers the spread",
    "TO_O": "Over the total", "TO_U": "Under the total",
    "HT_O": "Home over team total", "HT_U": "Home under team total",
    "AT_O": "Away over team total", "AT_U": "Away under team total",
    "WM_H6": "Home wins by 6+", "WM_A6": "Away wins by 6+",
    "WM_H11": "Home wins by 11+", "WM_A11": "Away wins by 11+",
    "WM_C5": "Decided by 5 or fewer",
    **{f"{p}_{o}": t.format(p=name, P=name[0].upper() + name[1:]) for p, name in PERIOD_NAMES.items() for o, t in PERIOD_OUTCOMES.items()},
    **HTFT,
}
MARKETS = list(LABELS)
GAME_MARKETS = MARKETS[:15]
# Margin bands for the "winning margin" table, like correct score in football.
BANDS = [("H", 21, 999), ("H", 16, 20), ("H", 11, 15), ("H", 6, 10), ("H", 1, 5),
         ("A", 1, 5), ("A", 6, 10), ("A", 11, 15), ("A", 16, 20), ("A", 21, 999)]
LINE_KEYS = ["sp", "to", "ht", "at", *[f"{p}{k}" for p in PERIODS for k in ("sp", "to", "ht", "at")]]


def half_line(x: float) -> float:
    """The nearest x.5 line, so it can never push: 228.3 → 228.5, -5.2 → -5.5."""
    return math.floor(x) + 0.5


def _pmf(mu: float, sd: float, lo: int, hi: int) -> tuple[np.ndarray, np.ndarray]:
    k = np.arange(lo, hi + 1)
    p = norm.cdf(k + 0.5, mu, sd) - norm.cdf(k - 0.5, mu, sd)
    return k, p / p.sum()


def margin_pmf(mu: float, sd: float) -> tuple[np.ndarray, np.ndarray]:
    """Final home margin on whole points, with ties resolved by overtime."""
    lo, hi = int(math.floor(mu - SPAN)), int(math.ceil(mu + SPAN))
    lo, hi = min(lo, -20), max(hi, 20)
    k, p = _pmf(mu, sd, lo, hi)
    zero = k == 0
    tie = p[zero].sum()
    p[zero] = 0
    win, lose = p[k > 0].sum(), p[k < 0].sum()
    ot = np.exp(-(np.arange(1, 16) ** 2) / (2 * OT_SD ** 2))
    ot /= ot.sum()
    for j, wt in enumerate(ot, start=1):
        p[k == j] += tie * wt * win / (win + lose)
        p[k == -j] += tie * wt * lose / (win + lose)
    return k, p


def over(k: np.ndarray, p: np.ndarray, line: float) -> float:
    """P(value > line) given no push."""
    push = p[k == line].sum() if float(line).is_integer() else 0.0
    return float(p[k > line].sum() / (1 - push)) if push < 1 else 0.5


def lines_for(r: Ratings, eh: float, ea: float, spread: float = float("nan"), total: float = float("nan")) -> dict:
    """The line each market is priced at. Book lines where given; otherwise the
    model's fair spread and the league's recent average total. Period lines
    scale the game's by the period's share of the points."""
    book_sp, book_to = np.isfinite(spread), np.isfinite(total)
    sp = float(spread) if book_sp else half_line(-(eh - ea))
    to = float(total) if book_to else half_line(r.avg_total)
    out = {"sp": sp, "to": to, "ht": half_line((to - sp) / 2), "at": half_line((to + sp) / 2)}
    for p, (share, _, _) in r.per.items():
        psp, pto = half_line(sp * share), half_line(to * share)
        out |= {f"{p}sp": psp, f"{p}to": pto, f"{p}ht": half_line((pto - psp) / 2), f"{p}at": half_line((pto + psp) / 2)}
    out["src"] = "book" if book_sp and book_to else "mixed" if book_sp or book_to else "model"
    return out


def _period(share: float, sm: float, st: float, eh: float, ea: float, ln: dict, p: str) -> tuple[dict, tuple]:
    mm, mt = share * (eh - ea), share * (eh + ea)
    k, pm = _pmf(mm, sm, int(mm - SPAN), int(mm + SPAN))
    kt, pt = _pmf(mt, st, int(mt - 2 * SPAN), int(mt + 2 * SPAN))
    team_sd = math.sqrt(st ** 2 + sm ** 2) / 2
    kh, ph = _pmf(share * eh, team_sd, int(share * eh - SPAN), int(share * eh + SPAN))
    ka, pa = _pmf(share * ea, team_sd, int(share * ea - SPAN), int(share * ea + SPAN))
    out = {
        f"{p}_1": pm[k > 0].sum(), f"{p}_X": pm[k == 0].sum(), f"{p}_2": pm[k < 0].sum(),
        f"{p}_SP_H": over(k, pm, -ln[f"{p}sp"]), f"{p}_O": over(kt, pt, ln[f"{p}to"]),
        f"{p}_HT_O": over(kh, ph, ln[f"{p}ht"]), f"{p}_AT_O": over(ka, pa, ln[f"{p}at"]),
    }
    for a, b in (("SP_H", "SP_A"), ("O", "U"), ("HT_O", "HT_U"), ("AT_O", "AT_U")):
        out[f"{p}_{b}"] = 1 - out[f"{p}_{a}"]
    return out, (k, pm)


def markets(r: Ratings, eh: float, ea: float, ln: dict) -> dict[str, float]:
    mm, mt = eh - ea, eh + ea
    k, pm = margin_pmf(mm, r.sigma_m)
    kt, pt = _pmf(mt, r.sigma_t, int(mt - 3 * SPAN), int(mt + 3 * SPAN))
    team_sd = math.sqrt(r.sigma_t ** 2 + r.sigma_m ** 2) / 2
    kh, ph = _pmf(eh, team_sd, int(eh - SPAN), int(eh + SPAN))
    ka, pa = _pmf(ea, team_sd, int(ea - SPAN), int(ea + SPAN))

    out = {
        "1": pm[k > 0].sum(), "2": pm[k < 0].sum(),
        "SP_H": over(k, pm, -ln["sp"]), "TO_O": over(kt, pt, ln["to"]),
        "HT_O": over(kh, ph, ln["ht"]), "AT_O": over(ka, pa, ln["at"]),
        "WM_H6": pm[k >= 6].sum(), "WM_A6": pm[k <= -6].sum(),
        "WM_H11": pm[k >= 11].sum(), "WM_A11": pm[k <= -11].sum(),
        "WM_C5": pm[np.abs(k) <= 5].sum(),
    }
    for a, b in (("SP_H", "SP_A"), ("TO_O", "TO_U"), ("HT_O", "HT_U"), ("AT_O", "AT_U")):
        out[b] = 1 - out[a]
    halves = {}
    for p, (share, sm, st) in r.per.items():
        o, halves[p] = _period(share, sm, st, eh, ea, ln, p)
        out |= o
    if "H1" in halves and "H2" in halves:
        out |= _htft(halves["H1"], halves["H2"], out["1"])
    return {m: round(float(v), 4) for m, v in out.items()}


def _htft(h1: tuple, h2: tuple, p_home: float) -> dict[str, float]:
    """Half-time/full-time from independent halves: the game margin is the sum of
    the two halves' margins, a level game going to overtime."""
    (k1, p1), (k2, p2) = h1, h2
    above = np.array([p2[k2 > -m].sum() for m in k1])
    level = np.array([p2[k2 == -m].sum() for m in k1])
    q = p_home  # overtime goes the way the game was leaning
    home = p1 * (above + q * level)
    away = p1 - home
    joint = {}
    for tag, sel in (("1", k1 > 0), ("X", k1 == 0), ("2", k1 < 0)):
        joint[f"HF_{tag}1"], joint[f"HF_{tag}2"] = home[sel].sum(), away[sel].sum()
    # Rescale so full-game wins agree with the moneyline priced above.
    hs, as_ = sum(v for k, v in joint.items() if k.endswith("1")), sum(v for k, v in joint.items() if k.endswith("2"))
    return {k: v * (p_home / hs if k.endswith("1") else (1 - p_home) / as_) for k, v in joint.items()}


def bands(r: Ratings, eh: float, ea: float) -> list[dict]:
    k, pm = margin_pmf(eh - ea, r.sigma_m)
    out = []
    for side, a, b in BANDS:
        sel = (k >= a) & (k <= b) if side == "H" else (k <= -a) & (k >= -b)
        label = f"{'Home' if side == 'H' else 'Away'} by {a}+" if b > 100 else f"{'Home' if side == 'H' else 'Away'} by {a}–{b}"
        out.append({"band": label, "p": round(float(pm[sel].sum()), 4)})
    return out


def ladders(r: Ratings, eh: float, ea: float, ln: dict) -> dict:
    """Alternative lines around the main ones: [home handicap, P(home covers)] and [total, P(over)]."""
    k, pm = margin_pmf(eh - ea, r.sigma_m)
    mt = eh + ea
    kt, pt = _pmf(mt, r.sigma_t, int(mt - 3 * SPAN), int(mt + 3 * SPAN))
    return {
        "spread": [[ln["sp"] + d, round(over(k, pm, -(ln["sp"] + d)), 4)] for d in range(-6, 7, 2)],
        "total": [[ln["to"] + d, round(over(kt, pt, ln["to"] + d), 4)] for d in range(-12, 13, 4)],
    }


def settle_frame(df) -> dict[str, np.ndarray]:
    """market -> float array of 1 (won), 0 (lost), nan (push / no data), from scores and stored lines."""
    hg, ag = df["hg"].to_numpy(float), df["ag"].to_numpy(float)
    m, t = hg - ag, hg + ag
    lncol = lambda k: df[f"ln_{k}"].to_numpy(float) if f"ln_{k}" in df else np.full(len(df), np.nan)  # noqa: E731

    def line(v, ln):
        out = (v > ln).astype(float)
        out[(v == ln) | np.isnan(v) | np.isnan(ln)] = np.nan
        return out

    def flag(cond, known):
        out = cond.astype(float)
        out[~known] = np.nan
        return out

    res = {
        "1": (m > 0).astype(float), "2": (m < 0).astype(float),
        "SP_H": line(m, -lncol("sp")), "TO_O": line(t, lncol("to")),
        "HT_O": line(hg, lncol("ht")), "AT_O": line(ag, lncol("at")),
        "WM_H6": (m >= 6).astype(float), "WM_A6": (m <= -6).astype(float),
        "WM_H11": (m >= 11).astype(float), "WM_A11": (m <= -11).astype(float),
        "WM_C5": (np.abs(m) <= 5).astype(float),
    }
    pairs = [("SP_H", "SP_A"), ("TO_O", "TO_U"), ("HT_O", "HT_U"), ("AT_O", "AT_U")]
    for p, (ph, pa) in period_scores(df).items():
        known = ~np.isnan(ph) & ~np.isnan(pa)
        pm = ph - pa
        res |= {f"{p}_1": flag(pm > 0, known), f"{p}_X": flag(pm == 0, known), f"{p}_2": flag(pm < 0, known),
                f"{p}_SP_H": line(pm, -lncol(f"{p}sp")), f"{p}_O": line(ph + pa, lncol(f"{p}to")),
                f"{p}_HT_O": line(ph, lncol(f"{p}ht")), f"{p}_AT_O": line(pa, lncol(f"{p}at"))}
        pairs += [(f"{p}_SP_H", f"{p}_SP_A"), (f"{p}_O", f"{p}_U"), (f"{p}_HT_O", f"{p}_HT_U"), (f"{p}_AT_O", f"{p}_AT_U")]
    for a, b in pairs:
        res[b] = 1 - res[a]
    m1 = res["H1_1"] - res["H1_2"]  # +1 home led, 0 level, -1 away led, nan unknown
    for tag, val in (("1", 1), ("X", 0), ("2", -1)):
        res[f"HF_{tag}1"] = np.where(np.isnan(m1), np.nan, ((m1 == val) & (m > 0)).astype(float))
        res[f"HF_{tag}2"] = np.where(np.isnan(m1), np.nan, ((m1 == val) & (m < 0)).astype(float))
    return res
