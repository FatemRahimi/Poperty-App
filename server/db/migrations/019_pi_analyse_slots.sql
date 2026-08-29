-- V1.1 Phase 1 — shared Property Intelligence analyse execution lease.
-- One in-flight analyse per user across Node instances.
-- Heartbeat keeps a live run from being stolen after the stale TTL.
--
-- Rollback: DROP TABLE IF EXISTS pi_analyse_slots;

CREATE TABLE IF NOT EXISTS pi_analyse_slots (
  user_id INTEGER PRIMARY KEY,
  lease_token TEXT NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pi_analyse_slots IS
  'Single in-flight Property Intelligence analyse lease per user. Steal only when heartbeat is stale.';
