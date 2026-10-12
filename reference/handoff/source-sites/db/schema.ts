import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Demo-game capabilities are deliberately separate from player accounts/ratings.
export const fairPlayGames = sqliteTable("fair_play_games", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  state: text("state").notNull(),
  sequence: integer("sequence").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  lastThrowAt: integer("last_throw_at").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
});

export const fairPlayDarts = sqliteTable("fair_play_darts", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull().references(() => fairPlayGames.id),
  sequence: integer("sequence").notNull(),
  fingerprint: text("fingerprint").notNull(),
  result: text("result").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [uniqueIndex("fair_play_darts_game_sequence").on(table.gameId, table.sequence)]);
