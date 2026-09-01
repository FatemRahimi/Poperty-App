-- Official lookup associations for HMLR PPD UPRN / INSPIRE identifiers.
-- A transaction may have multiple INSPIRE polygons. Do not collapse to one ID.
-- UPRN is identity only. INSPIRE ID is not a title number.

CREATE TABLE IF NOT EXISTS official_sale_lookup_links (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(40) NOT NULL DEFAULT 'HMLR_PRICE_PAID_DATA',
  source_transaction_id VARCHAR(80) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  identifier TEXT NOT NULL,
  UNIQUE (source, source_transaction_id, kind, identifier)
);

CREATE INDEX IF NOT EXISTS idx_official_sale_links_kind_id
  ON official_sale_lookup_links (kind, identifier);

CREATE INDEX IF NOT EXISTS idx_official_sale_links_tx
  ON official_sale_lookup_links (source, source_transaction_id, kind);

COMMENT ON TABLE official_sale_lookup_links IS
  'All official PPD lookup associations. Multiple INSPIRE IDs per transaction are valid. UPRN is not title. INSPIRE ID is not title number.';
