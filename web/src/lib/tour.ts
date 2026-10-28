import { sportHref, type Sport } from "./nav";

/*
 * The first-visit tour. Each step points at an element marked with data-tour
 * (or any selector) and moves on either when the reader acknowledges it
 * ("ack") or when they click the element itself ("click"). Steps belong to a
 * page; the tour only shows a step on its page, so a click that navigates
 * carries the tour on to the next page.
 */

export type TourPage = "home" | "match" | "any";

export interface TourStep {
  id: string;
  page: TourPage;
  /** CSS selector; the first visible match is highlighted. None: a centred card. */
  target?: string;
  /** Used when the target is hidden at this width (sidebar and header items on small screens). */
  fallback?: string;
  /** Added to the body while the fallback is shown. */
  fallbackHint?: string;
  title: string;
  body: string;
  advance: "ack" | "click";
  cta?: string;
}

const MENU = '[data-tour="menu"]';

export function tourSteps(sport: Sport): TourStep[] {
  const bb = sport === "basketball";
  const game = bb ? "game" : "match";
  return [
    {
      id: "welcome",
      page: "home",
      title: bb ? "Welcome to BasketballSeer" : "Welcome to FootballSeer",
      body: bb
        ? "Model-driven probabilities for every game: moneyline, spread, totals and more, refitted daily, with an open track record. Here is a quick look around."
        : "Model-driven probabilities for every major market across 38 leagues, refitted daily, with an open track record. Here is a quick look around.",
      advance: "ack",
      cta: "Show me around",
    },
    {
      id: "sport",
      page: "home",
      target: '[data-tour="sport"]',
      fallback: MENU,
      fallbackHint: "Open the menu to find it.",
      title: "Football, basketball and tennis",
      body: "Switch sport here. Football and basketball have every page; tennis has live scores, Elo ratings and its track record.",
      advance: "ack",
    },
    {
      id: "days",
      page: "home",
      target: '[data-tour="days"]',
      title: "Pick a day",
      body: `Today's ${game}s by default. Step forward through the week, or open Lookback to see how recent picks landed.`,
      advance: "ack",
    },
    {
      id: "markets",
      page: "home",
      target: '[data-tour="markets"]',
      title: "Choose a market",
      body: bb
        ? "Moneyline, spread, totals and more. The list re-prices for whichever market you pick."
        : "1X2, goals, both teams to score, corners and more. The list re-prices for whichever market you pick.",
      advance: "ack",
    },
    {
      id: "sort",
      page: "home",
      target: '[data-tour="sort"]',
      title: "Most likely first",
      body: "Sort by probability to bring the model's strongest picks to the top.",
      advance: "ack",
    },
    {
      id: "match",
      page: "home",
      target: '[data-tour="match"]',
      title: `Open a ${game}`,
      body: `Click this ${game} to see the full breakdown behind the pick.`,
      advance: "click",
    },
    {
      id: "prob",
      page: "match",
      target: '[data-tour="prob"]',
      title: bb ? "Who wins" : "Win, draw or lose",
      body: "The model's pre-match probabilities. Every market on this page comes from the same simulation.",
      advance: "ack",
    },
    {
      id: "star",
      page: "match",
      target: '[data-tour="match-head"] button[aria-pressed]',
      title: "Keep it handy",
      body: `Star a ${game} or a league and it collects under Favourites, saved in this browser.`,
      advance: "ack",
    },
    {
      id: "all-markets",
      page: "match",
      target: "#markets",
      title: "Every market",
      body: "Probabilities with the fair odds beside them. A bookmaker price above the fair price is where value lives.",
      advance: "ack",
    },
    {
      id: "odds",
      page: "any",
      target: '[data-tour="odds"]',
      fallback: MENU,
      fallbackHint: "Open the menu to find it.",
      title: "Your odds format",
      body: "Decimal, fractional or American, plus light and dark themes.",
      advance: "ack",
    },
    {
      id: "value",
      page: "any",
      target: '[data-tour="nav-value"]',
      fallback: MENU,
      fallbackHint: "Open the menu, then tap Value bets.",
      title: "Find value",
      body: "Click Value bets: the prices where the model and the bookmakers disagree most.",
      advance: "click",
    },
    {
      id: "record",
      page: "any",
      target: '[data-tour="nav-record"]',
      fallback: MENU,
      fallbackHint: "It's in the menu.",
      title: "Judge us on results",
      body: "Every prediction is logged and settled. The track record shows how the model has really done. Enjoy, and bet responsibly.",
      advance: "ack",
      cta: "Finish",
    },
  ];
}

export function onPage(page: TourPage, pathname: string, sport: Sport) {
  if (page === "any") return true;
  if (page === "home") return pathname === sportHref(sport, "/");
  return pathname.startsWith(sportHref(sport, "/match/"));
}

export const tourKey = (sport: Sport) => (sport === "basketball" ? "fs-tour-bb" : "fs-tour");
