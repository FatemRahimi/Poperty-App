/**
 * Offline HMLR Price Paid import.
 * Streaming / batched. Never invoked from user analyse.
 *
 * Usage:
 *   node scripts/import-hmlr-price-paid.js --ppd path.csv [--uprn path.csv] [--inspire path.csv] [--release 2026-07]
 */

const fs = require('fs');
const path = require('path');

const { parsePpdRow, parseLookupRow } = require('../services/market/hmlrPricePaidParser');
const { createPostgresOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');

const BATCH_SIZE = 500;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--') && argv[i + 1]) {
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function streamLines(filePath, onLine) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
  let buf = '';
  for await (const chunk of stream) {
    buf += chunk;
    let newline = buf.indexOf('\n');
    while (newline >= 0) {
      const line = buf.slice(0, newline).replace(/\r$/, '');
      buf = buf.slice(newline + 1);
      if (line.trim()) await onLine(line);
      newline = buf.indexOf('\n');
    }
  }
  const last = buf.replace(/\r$/, '');
  if (last.trim()) await onLine(last);
}

async function importPricePaid({
  ppdPath,
  uprnPath = null,
  inspirePath = null,
  releaseLabel = null,
  store = null,
  batchSize = BATCH_SIZE,
  retrievedAt = new Date().toISOString(),
} = {}) {
  if (!ppdPath) {
    throw new Error('ppdPath is required');
  }
  const started = Date.now();
  const dbStore = store || createPostgresOfficialSaleStore();
  const run = await dbStore.startImportRun({
    release_label: releaseLabel,
    ppd_path: ppdPath,
    uprn_path: uprnPath,
    inspire_path: inspirePath,
  });

  const stats = {
    rows_processed: 0,
    inserted_count: 0,
    updated_count: 0,
    unchanged_count: 0,
    deleted_count: 0,
    rejected_count: 0,
    invalid_count: 0,
    uprn_matched_count: 0,
    inspire_matched_count: 0,
  };

  try {
    let batch = [];
    let deletes = [];
    const flush = async () => {
      if (batch.length) {
        const result = await dbStore.upsertBatch(batch);
        stats.inserted_count += result.inserted || 0;
        stats.updated_count += result.updated || 0;
        stats.unchanged_count += result.unchanged || 0;
        batch = [];
      }
      if (deletes.length) {
        stats.deleted_count += await dbStore.markDeleted(deletes);
        deletes = [];
      }
    };

    await streamLines(ppdPath, async (line) => {
      stats.rows_processed += 1;
      const parsed = parsePpdRow(line, { datasetVersion: releaseLabel, retrievedAt });
      if (!parsed.ok) {
        if (parsed.reason === 'invalid_price') stats.invalid_count += 1;
        else stats.rejected_count += 1;
        return;
      }
      if (parsed.deleted) {
        deletes.push(parsed.row.source_transaction_id);
      } else {
        batch.push(parsed.row);
      }
      if (batch.length + deletes.length >= batchSize) await flush();
    });
    await flush();

    if (uprnPath) {
      let pairs = [];
      await streamLines(uprnPath, async (line) => {
        const lookup = parseLookupRow(line);
        if (!lookup) return;
        pairs.push(lookup);
        if (pairs.length >= batchSize) {
          stats.uprn_matched_count += await dbStore.applyLookups('uprn', pairs);
          pairs = [];
        }
      });
      if (pairs.length) stats.uprn_matched_count += await dbStore.applyLookups('uprn', pairs);
    }

    if (inspirePath) {
      let pairs = [];
      await streamLines(inspirePath, async (line) => {
        const lookup = parseLookupRow(line);
        if (!lookup) return;
        pairs.push(lookup);
        if (pairs.length >= batchSize) {
          stats.inspire_matched_count += await dbStore.applyLookups('inspire', pairs);
          pairs = [];
        }
      });
      if (pairs.length) stats.inspire_matched_count += await dbStore.applyLookups('inspire', pairs);
    }

    stats.status = 'SUCCEEDED';
    stats.duration_ms = Date.now() - started;
    await dbStore.finishImportRun(run.id, stats);
    return { ok: true, runId: run.id, ...stats };
  } catch (error) {
    stats.status = 'FAILED';
    stats.failure_reason = error.message;
    stats.duration_ms = Date.now() - started;
    await dbStore.finishImportRun(run.id, stats);
    return { ok: false, runId: run.id, ...stats };
  }
}

async function main() {
  require('dotenv').config();
  const args = parseArgs(process.argv.slice(2));
  if (!args.ppd) {
    console.error('Usage: node scripts/import-hmlr-price-paid.js --ppd <file> [--uprn <file>] [--inspire <file>] [--release <label>]');
    process.exit(1);
  }
  const result = await importPricePaid({
    ppdPath: path.resolve(args.ppd),
    uprnPath: args.uprn ? path.resolve(args.uprn) : null,
    inspirePath: args.inspire ? path.resolve(args.inspire) : null,
    releaseLabel: args.release || null,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  BATCH_SIZE,
  importPricePaid,
  parseArgs,
};
