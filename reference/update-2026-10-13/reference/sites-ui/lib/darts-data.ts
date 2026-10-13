export type PlayerStatus = "Speelt" | "Kijkt mee" | "Beschikbaar";
export type PlayerRole = "owner" | "admin" | "vip" | "player";
export type DartsPlayer = {
  name: string;
  role: PlayerRole;
  rating: number;
  average: number;
  status: PlayerStatus;
  initials: string;
  wins: number;
  played: number;
  oneEighties: number;
  country: string;
};

export const players: DartsPlayer[] = [
  { name: "Nick", role: "owner", rating: 1684, average: 72.4, status: "Speelt", initials: "N", wins: 142, played: 236, oneEighties: 18, country: "Nederland" },
  { name: "Bullseye", role: "vip", rating: 1500, average: 65.2, status: "Speelt", initials: "B", wins: 94, played: 188, oneEighties: 12, country: "Nederland" },
  { name: "Mila", role: "admin", rating: 1620, average: 69.8, status: "Beschikbaar", initials: "M", wins: 118, played: 204, oneEighties: 15, country: "Nederland" },
  { name: "DartMaster", role: "player", rating: 1810, average: 84.6, status: "Speelt", initials: "DM", wins: 286, played: 412, oneEighties: 48, country: "België" },
  { name: "Rookie", role: "player", rating: 1382, average: 48.7, status: "Kijkt mee", initials: "R", wins: 19, played: 62, oneEighties: 2, country: "Nederland" },
  { name: "TripleKim", role: "vip", rating: 1732, average: 78.2, status: "Speelt", initials: "TK", wins: 186, played: 294, oneEighties: 31, country: "Nederland" },
  { name: "DoubleOut", role: "player", rating: 1558, average: 67.1, status: "Speelt", initials: "DO", wins: 76, played: 142, oneEighties: 11, country: "België" },
  { name: "Joey180", role: "player", rating: 1584, average: 68.6, status: "Speelt", initials: "J", wins: 91, played: 174, oneEighties: 14, country: "Nederland" },
  { name: "Sophie", role: "player", rating: 1490, average: 58.4, status: "Kijkt mee", initials: "S", wins: 41, played: 86, oneEighties: 5, country: "Nederland" },
  { name: "NightOwl", role: "player", rating: 1436, average: 54.8, status: "Beschikbaar", initials: "NO", wins: 28, played: 73, oneEighties: 3, country: "Nederland" },
  { name: "FreshDart", role: "player", rating: 1500, average: 0, status: "Beschikbaar", initials: "FD", wins: 0, played: 0, oneEighties: 0, country: "Nederland" },
];

export const rooms = [
  { name: "Nederland 1", subtitle: "De vaste hangout", count: 38, matches: 8, emoji: "🇳🇱", category: "Sociaal" },
  { name: "Nederland 2", subtitle: "Altijd een potje", count: 27, matches: 5, emoji: "🎯", category: "Sociaal" },
  { name: "Ranked", subtitle: "Elke dart telt", count: 49, matches: 14, emoji: "⚡", category: "Competitief" },
  { name: "Beginners", subtitle: "Iedereen begint ergens", count: 22, matches: 4, emoji: "✨", category: "Ontspannen" },
  { name: "Afterhours", subtitle: "Nog één laatste leg", count: 31, matches: 7, emoji: "🌙", category: "Sociaal" },
  { name: "Toernooikamer", subtitle: "Friday Night Open", count: 50, matches: 16, emoji: "🏆", category: "Toernooi" },
];

export function ratingTone(rating: number, played = 0, distinctOpponents = played >= 10 ? 5 : 0) {
  if (played < 10 || distinctOpponents < 5) return "rating-white";
  const displayed = Math.round(rating);
  return displayed >= 1550 ? "rating-green" : displayed < 1450 ? "rating-red" : "rating-amber";
}

export function playerByName(name: string): DartsPlayer {
  return players.find((player) => player.name === name) ?? {
    name, role: "player", rating: 1500, average: 0, status: "Beschikbaar",
    initials: name.trim().slice(0, 2).toUpperCase() || "?", wins: 0, played: 0,
    oneEighties: 0, country: "Nederland",
  };
}
