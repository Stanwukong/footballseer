/** SportyBet's country sites; a booking code only opens on the site it was made on. */
export const COUNTRIES = { ng: "Nigeria", gh: "Ghana", ke: "Kenya", tz: "Tanzania", ug: "Uganda", zm: "Zambia" } as const;
export type Country = keyof typeof COUNTRIES;
