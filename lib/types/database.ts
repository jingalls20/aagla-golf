/**
 * Generated from the Supabase schema. Do not edit by hand.
 *
 * Regenerate after every migration:
 *   npm run db:types
 *
 * This placeholder keeps `tsc` happy on a fresh clone before anyone has run
 * the generator. Running it replaces this file wholesale.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown> }>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      event_type: 'event' | 'major' | 'championship';
      event_status: 'scheduled' | 'played' | 'cancelled';
      player_status: 'active' | 'inactive';
      member_role: 'owner' | 'admin' | 'member';
      score_source: 'historical' | 'new' | 'missed' | 'dnp';
    };
  };
};
