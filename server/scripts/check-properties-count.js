require('dotenv').config();
const pool = require('../models/db');

async function main() {
  const counts = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
    FROM properties
  `);
  console.log('properties:', counts.rows[0]);

  const sample = await pool.query(`
    SELECT id, title, status, city, zip_code FROM properties ORDER BY id LIMIT 5
  `);
  console.log('sample:', sample.rows);
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
