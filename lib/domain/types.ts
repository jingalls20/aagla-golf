/**
 * Domain types for the league's scoring rules.
 *
 * These describe the *shape the rules operate on*, deliberately not the shape
 * of the database rows. The functions in this directory are pure: no Supabase
 * client, no `fetch`, no clock, no randomness. Everything they need arrives as
 * an argument and everything they decide comes back as a return value.
 *
 * That constraint is the point. The league's rules are the part of this app
 * that must not quietly change, and pure functions are the only kind you can
 * exhaustively test without standing up a database.
 */

export type EventType = 'event' | 'major' | 'championship';
export type ScoreSource = 'historical' | 'new' | 'missed';
export type PlayerStatus = 'active' | 'inactive';

/**
 * Points awarded per finishing place, by event type.
 *
 * Stored per-season in `seasons.points_table` so that changing the rules in a
 * future year cannot retroactively rewrite a past season's standings. Keys are
 * stringified place numbers because this round-trips through JSONB.
 *
 * Lower is better throughout this app: 1st place scores 0 points, and the
 * season is won by the lowest total. Championship events carry an empty table
 * because they are worth no season points at all by design.
 */
export interface PointsTable {
  cap_place: number;
  event: Record<string, number>;
  major: Record<string, number>;
  championship: Record<string, number>;
}

/** The handicap and points rules in force for one season. */
export interface SeasonRules {
  /** Average the best N true scores... */
  handicapBestOf: number;
  /** ...drawn from the player's most recent M rounds of the prior season. */
  handicapWindowEvents: number;
  pointsTable: PointsTable;
}

/** An event, reduced to what the rules care about. */
export interface DomainEvent {
  id: string;
  eventType: EventType;
  /** Chronological position within its season. Ascending = later. */
  sequence: number;
}

/** A score row as the rules see it. */
export interface DomainScore {
  playerId: string;
  /** Strokes relative to par. Null only for a 'missed' row. */
  trueScore: number | null;
  /** The handicap actually applied when this round was recorded. */
  fsApplied: number | null;
  courseDifferential: number;
  source: ScoreSource;
}

/** One round of a player's history, used by the handicap calculation. */
export interface HistoricalRound {
  eventId: string;
  eventName: string | null;
  eventType: EventType;
  /** Chronological position within its season. */
  sequence: number;
  trueScore: number;
}

/** What the rules decide about one player in one event. */
export interface ScoreResult {
  playerId: string;
  netScore: number | null;
  place: number;
  eventPoints: number;
  source: ScoreSource;
}

/** A player's standing in a season. */
export interface StandingRow {
  playerId: string;
  totalPoints: number;
  eventsPlayed: number;
  seasonRank: number;
}

/** The outcome of a handicap calculation, with its reasoning attached. */
export interface HandicapResult {
  /** The handicap ("free strokes") figure itself. */
  fs: number;
  /** The rounds that were averaged to produce it. */
  roundsUsed: HistoricalRound[];
  /** How many rounds were in the window before taking the best N. */
  consideredCount: number;
  /** Machine-readable caveat, empty when the calculation had full data. */
  note: string;
}
