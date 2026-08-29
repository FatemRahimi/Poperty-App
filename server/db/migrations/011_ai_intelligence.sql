-- Extend AI tables for Property Intelligence platform

ALTER TABLE ai_requests
  ADD COLUMN IF NOT EXISTS property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS data_quality VARCHAR(20),
  ADD COLUMN IF NOT EXISTS model_version VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_ai_requests_property_id ON ai_requests(property_id);

-- Extend request types via application code:
-- property_intelligence, investment_analyst, rent_intelligence, portfolio_optimiser, etc.
