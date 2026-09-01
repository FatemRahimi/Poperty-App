/**
 * Retry physical deletion for DELETE_FAILED rows only.
 * Does not delete unknown files or active objects.
 *
 * Run: node scripts/reconcile-private-evidence.js
 */
require('dotenv').config();
const pool = require('../models/db');
const { retryFailedDeletes } = require('../services/evidence/privateEvidenceIngest');

async function run() {
  const results = await retryFailedDeletes();
  const removed = results.filter((row) => row.bytesRemoved).length;
  const failed = results.filter((row) => !row.bytesRemoved).length;
  console.log(JSON.stringify({
    attempted: results.length,
    bytesRemoved: removed,
    stillFailed: failed,
    unknownFilesDeleted: 0,
  }, null, 2));
}

run()
  .catch((err) => {
    console.log('PRIVATE EVIDENCE RECONCILE: NOT VERIFIED');
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
