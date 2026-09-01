/**
 * Operational helper: download official yearly HMLR PPD CSVs and import
 * through the existing importer. Not invoked from user analyse.
 *
 * Usage:
 *   node scripts/backfill-hmlr-yearly-files.js [--from 2026] [--to 1995] [--keep-files]
 */

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

require('dotenv').config();

const { importPricePaid } = require('./import-hmlr-price-paid');
const { parsePpdRow } = require('../services/market/hmlrPricePaidParser');

const HOST = 'price-paid-data.publicdata.landregistry.gov.uk';
const DATA_DIR = path.join(__dirname, '..', 'data', 'hmlr');
const MANIFEST = path.join(DATA_DIR, 'historical-backfill-manifest.json');

function parseArgs(argv) {
  const args = { from: 2026, to: 1995, keepFiles: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--from' && argv[i + 1]) {
      args.from = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--to' && argv[i + 1]) {
      args.to = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--keep-files') {
      args.keepFiles = true;
    }
  }
  return args;
}

async function withRetry(label, fn, attempts = 5) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts) break;
      const delay = Math.min(30000, 2000 * i * i);
      console.log(JSON.stringify({
        stage: 'retry',
        label,
        attempt: i,
        attempts,
        delayMs: delay,
        error: err.message,
      }));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function yearsDescending(from, to) {
  const start = Math.max(from, to);
  const end = Math.min(from, to);
  const list = [];
  for (let year = start; year >= end; year -= 1) list.push(year);
  return list;
}

function head(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      resolve({
        status: res.statusCode,
        length: Number(res.headers['content-length'] || 0),
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`HEAD timeout ${url}`));
    });
    req.end();
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        out.close();
        reject(new Error(`GET ${url} status ${res.statusCode}`));
        return;
      }
      res.on('data', (chunk) => hash.update(chunk));
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => resolve({
          bytes: fs.statSync(dest).size,
          sha256: hash.digest('hex').toUpperCase(),
        }));
      });
    });
    req.on('error', (err) => {
      out.close();
      reject(err);
    });
  });
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return { files: [], imports: [] };
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function saveManifest(manifest) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function sampleFirstLine(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024);
  const n = fs.readSync(fd, buf, 0, 1024, 0);
  fs.closeSync(fd);
  return buf.slice(0, n).toString('utf8').split(/\r?\n/)[0];
}

async function processYear(year, keepFiles, manifest) {
  const url = `https://${HOST}/pp-${year}.csv`;
  const dest = path.join(DATA_DIR, `pp-${year}.csv`);
  const release = String(year);
  const meta = {
    year,
    url,
    sourcePage: 'https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads',
    geography: 'England and Wales',
    retrievedAt: new Date().toISOString(),
  };

  const remote = await withRetry(`HEAD ${year}`, () => head(url));
  if (remote.status !== 200 || !remote.length) {
    throw new Error(`Year ${year} HEAD failed: ${JSON.stringify(remote)}`);
  }
  meta.expectedBytes = remote.length;

  const existing = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  if (existing !== remote.length) {
    if (existing) fs.unlinkSync(dest);
    const downloaded = await withRetry(`GET ${year}`, () => download(url, dest));
    meta.bytes = downloaded.bytes;
    meta.sha256 = downloaded.sha256;
  } else {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
      fs.createReadStream(dest)
        .on('data', (chunk) => hash.update(chunk))
        .on('end', resolve)
        .on('error', reject);
    });
    meta.bytes = existing;
    meta.sha256 = hash.digest('hex').toUpperCase();
    meta.reusedExistingFile = true;
  }

  const firstLine = sampleFirstLine(dest);
  const parsed = parsePpdRow(firstLine, { datasetVersion: release, retrievedAt: meta.retrievedAt });
  if (!parsed.ok) {
    throw new Error(`Year ${year} first row failed parser: ${parsed.reason}`);
  }
  meta.formatOk = true;
  meta.sampleTransferDate = parsed.row.transfer_date;

  console.log(JSON.stringify({ stage: 'downloaded', ...meta }, null, 2));

  const result = await importPricePaid({
    ppdPath: dest,
    releaseLabel: release,
    retrievedAt: meta.retrievedAt,
  });
  meta.import = result;
  console.log(JSON.stringify({ stage: 'imported', year, result }, null, 2));

  if (!result.ok) {
    throw new Error(`Year ${year} import failed: ${result.failure_reason || 'unknown'}`);
  }

  if (!keepFiles) {
    fs.unlinkSync(dest);
    meta.fileDeletedAfterImport = true;
  }

  manifest.files = (manifest.files || []).filter((row) => row.year !== year);
  manifest.files.push(meta);
  manifest.updatedAt = new Date().toISOString();
  saveManifest(manifest);
  return meta;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const manifest = loadManifest();
  manifest.source = {
    host: HOST,
    page: 'https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads',
    strategy: 'official yearly CSV files, existing importer, no historical UPRN/INSPIRE fabrication',
    startedAt: manifest.source?.startedAt || new Date().toISOString(),
  };
  saveManifest(manifest);

  const list = yearsDescending(args.from, args.to);
  const done = new Set(
    (manifest.files || [])
      .filter((row) => row.import && row.import.ok)
      .map((row) => row.year)
  );

  for (const year of list) {
    if (done.has(year)) {
      console.log(JSON.stringify({ stage: 'skip-already-imported', year }));
      continue;
    }
    await processYear(year, args.keepFiles, manifest);
  }
  console.log(JSON.stringify({ stage: 'complete', years: list }, null, 2));
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { parseArgs, yearsDescending };
