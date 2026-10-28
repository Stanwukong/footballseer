/*
 * Matching names across feeds: SportyBet writes "Djokovic, Novak" and
 * "FC Dynamo Kiev", ESPN and LiveScore "Novak Djokovic" and "Dynamo Kyiv".
 */

const NOISE = new Set(["fc", "cf", "sc", "afc", "ac", "as", "cd", "ud", "sd", "fk", "sk", "if", "bk", "club", "de", "the", "u19", "u21", "u23", "ii", "women", "w"]);

/** Lower-case ASCII words, with "Last, First" turned round and club noise dropped. */
export function nameWords(name: string): string[] {
  const swapped = name.includes(",") && !name.includes("/") ? name.split(",").reverse().join(" ") : name;
  return swapped
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !NOISE.has(w));
}

/** Two names for the same side: they share a word, or two longer words share their first four letters ("Gladbach"/"Gladbacher"). */
export function sameSide(a: string, b: string) {
  const wb = nameWords(b);
  return nameWords(a).some((w) => wb.some((x) => x === w || (w.length >= 4 && x.length >= 4 && x.slice(0, 4) === w.slice(0, 4))));
}

/** Lookup keys for a player, most specific first: all words, then first initial and last word. */
export function playerKeys(name: string): string[] {
  const w = nameWords(name);
  if (!w.length) return [];
  return w.length > 1 ? [w.join(" "), `${w[0][0]} ${w.at(-1)}`] : [w[0]];
}
