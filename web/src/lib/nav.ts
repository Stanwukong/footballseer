export type NavIcon =
  | "live" | "matches" | "value" | "daily" | "previews" | "filters" | "machine" | "scanner" | "trends"
  | "teamStats" | "leagueStats" | "predictor" | "leagues" | "favourites" | "record" | "lookback";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Predictions",
    items: [
      { href: "/", label: "Matches", icon: "matches" },
      { href: "/live", label: "Live scores", icon: "live" },
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
      { href: "/track-record", label: "Track record", icon: "record" },
    ],
  },
];

export type Sport = "football" | "basketball";

export const SPORTS: { id: Sport; label: string }[] = [
  { id: "football", label: "Football" },
  { id: "basketball", label: "Basketball" },
];

/** Basketball lives under /basketball with the same page names as football. */
export const sportOf = (pathname: string): Sport =>
  pathname === "/basketball" || pathname.startsWith("/basketball/") ? "basketball" : "football";

export const sportHref = (sport: Sport, href: string) =>
  sport === "football" ? href : href === "/" ? "/basketball" : `/basketball${href}`;
