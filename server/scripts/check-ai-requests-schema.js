require('dotenv').config();
const pool = require('../models/db');

(async () => {
  const db = await pool.query('SELECT current_database() AS db');
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ai_requests'
     ORDER BY ordinal_position`
  );
  console.log('DATABASE_URL host/db:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
  console.log('Connected database:', db.rows[0].db);
  console.log('ai_requests columns:', cols.rows.map((r) => r.column_name).join(', '));
  const hasSubject = cols.rows.some((r) => r.column_name === 'subject_id');
  console.log('subject_id exists:', hasSubject);
  await pool.end();
  process.exit(hasSubject ? 0 : 1);
})().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
