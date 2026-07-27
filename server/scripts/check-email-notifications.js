require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const recent = await pool.query(
    `SELECT notification_type, sent_to, status, sent_at
     FROM email_notifications
     ORDER BY sent_at DESC NULLS LAST
     LIMIT 10`
  );
  console.log('Recent notifications:\n', JSON.stringify(recent.rows, null, 2));

  const failed = await pool.query(
    `SELECT notification_type, sent_to, status, sent_at
     FROM email_notifications
     WHERE status = 'failed'
     ORDER BY sent_at DESC NULLS LAST
     LIMIT 5`
  );
  console.log('\nFailed notifications:\n', JSON.stringify(failed.rows, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  pool.end();
});
