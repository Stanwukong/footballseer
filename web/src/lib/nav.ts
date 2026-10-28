export type NavIcon =
  | "live" | "matches" | "value" | "daily" | "previews" | "filters" | "machine" | "scanner" | "trends"
  | "teamStats" | "leagueStats" | "predictor" | "leagues" | "favourites" | "record" | "lookback" | "ratings" | "code";

export type Sport = "football" | "basketball" | "tennis";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Sports that have this page; all but tennis when left out. */
  sports?: Sport[];
}

const TENNIS: Sport[] = ["tennis"];

export const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Predictions",
    items: [
      { href: "/", label: "Matches", icon: "matches", sports: ["football", "basketball", "tennis"] },
      { href: "/live", label: "Live scores", icon: "live", sports: ["football", "basketball", "tennis"] },
      { href: "/lookback", label: "Lookback", icon: "lookback" },
      { href: "/value", label: "Value bets", icon: "value" },
      { href: "/daily", label: "Daily bets", icon: "daily" },
      { href: "/previews", label: "Match previews", icon: "previews" },
      { href: "/favourites", label: "Favourites", icon: "favourites" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/booking-code", label: "Booking code", icon: "code", sports: ["football", "basketball", "tennis"] },
      { href: "/filters", label: "Advanced filters", icon: "filters" },
      { href: "/generator", label: "Bet generator", icon: "machine" },
      { href: "/scanner", label: "Pre-match scanner", icon: "scanner" },
      { href: "/trends", label: "Trends", icon: "trends" },
      { href: "/team-stats", label: "Team stats", icon: "teamStats" },
      { href: "/league-stats", label: "League stats", icon: "leagueStats" },
      { href: "/predictor", label: "Matchup predictor", icon: "predictor" },
    ],
  },
  {
    title: "Explore",
    items: [
      { href: "/leagues", label: "Leagues", icon: "leagues" },
      { href: "/ratings", label: "Player ratings", icon: "ratings", sports: TENNIS },
      { href: "/track-record", label: "Track record", icon: "record", sports: ["football", "basketball", "tennis"] },
    ],
  },
];

/** The nav for one sport: sections with none of its pages are left out. */
export const navFor = (sport: Sport) =>
  NAV.map((s) => ({ ...s, items: s.items.filter((i) => (i.sports ?? ["football", "basketball"]).includes(sport)) })).filter((s) => s.items.length);

export const SPORTS: { id: Sport; label: string; prefix: string; blurb: string }[] = [
  { id: "football", label: "Football", prefix: "", blurb: "38 leagues · goals model" },
  { id: "basketball", label: "Basketball", prefix: "/basketball", blurb: "NBA, EuroLeague and more" },
  { id: "tennis", label: "Tennis", prefix: "/tennis", blurb: "ATP and WTA · Elo ratings" },
];

/** Basketball and tennis live under their own prefix with the same page names as football. */
export const sportOf = (pathname: string): Sport =>
  SPORTS.find((s) => s.prefix && (pathname === s.prefix || pathname.startsWith(`${s.prefix}/`)))?.id ?? "football";

export const sportHref = (sport: Sport, href: string) => {
  const prefix = SPORTS.find((s) => s.id === sport)!.prefix;
  return !prefix ? href : href === "/" ? prefix : `${prefix}${href}`;
};
