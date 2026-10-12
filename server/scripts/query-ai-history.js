require('../config/loadEnv');
const pool = require('../models/db');
(async () => {
  const h = await pool.query(
    "SELECT COUNT(*)::int AS n FROM ai_requests WHERE request_type = 'property_intelligence'"
  );
  const recent = await pool.query(`
    SELECT id, property_id, created_at,
      output_data->'residentialDecisionContext'->>'decisionJob' AS job,
      output_data->'marketIntelligence'->'sale'->>'centralEstimate' AS val,
      output_data->'decisionWorkspace' IS NOT NULL AS has_workspace
    FROM ai_requests
    WHERE request_type = 'property_intelligence'
    ORDER BY id DESC
    LIMIT 10
  `);
  console.log(JSON.stringify({ historyCount: h.rows[0].n, recent: recent.rows }, null, 2));
  await pool.end();
})();
