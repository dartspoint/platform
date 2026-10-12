CREATE TABLE `fair_play_darts` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `fair_play_games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fair_play_darts_game_sequence` ON `fair_play_darts` (`game_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `fair_play_games` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`state` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_throw_at` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
