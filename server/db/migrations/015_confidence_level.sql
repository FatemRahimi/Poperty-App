-- Persist the reportable confidence state alongside the internal ordering index.
--
-- ai_requests.confidence is NUMERIC(5,2) and holds the confidence engine's internal
-- index, which is null whenever nothing could be assessed. A numeric column cannot
-- distinguish "Low" from "Not assessed", and reading the index as a percentage is
-- explicitly disallowed. This column stores one of: High, Medium, Low, Not assessed.

ALTER TABLE ai_requests
  ADD COLUMN IF NOT EXISTS confidence_level VARCHAR(20);

COMMENT ON COLUMN ai_requests.confidence_level IS
  'Reportable confidence state: High | Medium | Low | Not assessed. Null for request types that produce no estimate.';

COMMENT ON COLUMN ai_requests.confidence IS
  'Internal confidence ordering index (0-100). Not a percentage or accuracy figure. Null when not assessed.';
