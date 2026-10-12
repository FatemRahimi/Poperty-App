require('../config/loadEnv');
const pool = require('../models/db');
(async () => {
  const q = await pool.query(`
    SELECT p.id, p.title, p.category, p.price, p.monthly_rent, p.property_type, p.city, p.zip_code,
      pi.uprn,
      (SELECT COUNT(*)::int FROM official_epb_certificates e WHERE e.property_id = p.id AND is_current) AS epb
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    WHERE p.price IS NOT NULL AND p.price::numeric > 0
    ORDER BY p.price::numeric DESC
    LIMIT 20
  `);
  console.log(JSON.stringify(q.rows, null, 2));
  await pool.end();
})();
