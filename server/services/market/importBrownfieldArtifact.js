/**
 * Import one immutable brownfield-land CSV artifact through the existing
 * entity parser and the Phase 3D atomic batch.
 *
 * Memory: the file stays on disk. CSV records are streamed. One array of
 * accepted observations is held for the single database transaction. The raw
 * artifact is not also retained as a string.
 *
 * Artifact SHA-256, retrieval time, and manifest id do not select the
 * effective site revision. Entry-date selection is unchanged.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const {
  BROWNFIELD_SOURCE,
  BROWNFIELD_DATASET_LABEL,
  BROWNFIELD_SOURCE_PRODUCT,
  BROWNFIELD_BULK_CSV_URL,
  BROWNFIELD_RELEASE_LABEL,
} = require('../../architecture/officialBrownfieldLandDataset');
const { parseBrownfieldCsvFile, headerFromSample } = require('./brownfieldArtifactCsv');
const { retrieveBrownfieldArtifact } = require('./retrieveBrownfieldArtifact');

function assertSafeNationalDatabase(authorization) {
  if (!authorization || authorization.confirmed !== true || authorization.disposable !== true) {
    throw Object.assign(new Error('national_brownfield_import_not_authorized'), {
      code: 'national_brownfield_import_not_authorized',
    });
  }
  const databaseName = String(authorization.databaseName || '');
  if (!databaseName || databaseName.toLowerCase() === 'propertydb') {
    throw Object.assign(new Error('national_brownfield_import_refuses_unsafe_database'), {
      code: 'national_brownfield_import_refuses_unsafe_database',
    });
  }
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const sample = [];
  let sampleBytes = 0;
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      bytes += buffer.length;
      if (sampleBytes < 4096) {
        sample.push(buffer);
        sampleBytes += buffer.length;
      }
      callback();
    },
  });
  await pipeline(fs.createReadStream(filePath), hasher);
  return {
    sha256: hash.digest('hex'),
    byteLength: bytes,
    sample: Buffer.concat(sample).subarray(0, 4096),
  };
}

async function storeImmutableCopy(sourcePath, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const hashed = await hashFile(sourcePath);
  if (hashed.byteLength === 0) {
    throw Object.assign(new Error('brownfield_artifact_empty'), { code: 'brownfield_artifact_empty' });
  }
  headerFromSample(hashed.sample);
  const finalPath = path.join(directory, `${hashed.sha256}.csv`);
  if (fs.existsSync(finalPath)) {
    return { ...hashed, filePath: finalPath, reused: true };
  }
  if (path.resolve(sourcePath) !== path.resolve(finalPath)) {
    const tempPath = path.join(directory, `.partial-${crypto.randomBytes(8).toString('hex')}.csv`);
    try {
      await pipeline(fs.createReadStream(sourcePath), fs.createWriteStream(tempPath));
      fs.renameSync(tempPath, finalPath);
    } catch (error) {
      fs.rmSync(tempPath, { force: true });
      throw error;
    }
  }
  return { ...hashed, filePath: finalPath, reused: false };
}

function withArtifactProvenance(row, artifact, retrievedAt) {
  const retrievalStamp = typeof retrievedAt === 'string' && retrievedAt
    ? retrievedAt
    : (artifact.retrieved_at || row.retrievedAt || null);
  return {
    ...row,
    retrievedAt: retrievalStamp,
    provenance: {
      ...(row.provenance || {}),
      artifactSha256: artifact.sha256,
      artifactSourceUrl: artifact.source_url,
      artifactRetrievedAt: retrievalStamp,
    },
  };
}

async function recordFailedRun(landStore, artifact, reason, rejectedCount) {
  const run = await landStore.startRun({
    release_label: BROWNFIELD_RELEASE_LABEL,
    retrieved_at: artifact.retrieved_at,
    artifact_id: artifact.id,
  });
  await landStore.finishRun(run.id, {
    status: 'FAILED',
    failure_reason: reason,
    rows_processed: 0,
    inserted_count: 0,
    unchanged_count: 0,
    rejected_count: rejectedCount,
    conflict_count: 0,
  });
  return run;
}

async function importBrownfieldArtifactFile({
  filePath,
  directory,
  landStore,
  artifactStore,
  sourceUrl = BROWNFIELD_BULK_CSV_URL,
  resolvedUrl = null,
  contentType = 'text/csv',
  contentLength = null,
  etag = null,
  lastModified = null,
  retrievedAt = new Date().toISOString(),
  failAtIndex = null,
} = {}) {
  if (!landStore || !artifactStore) {
    throw Object.assign(new Error('brownfield_artifact_store_required'), {
      code: 'brownfield_artifact_store_required',
    });
  }
  const stored = await storeImmutableCopy(filePath, directory);
  const recorded = await artifactStore.insertRetrieved({
    source: BROWNFIELD_SOURCE,
    dataset: BROWNFIELD_DATASET_LABEL,
    sourceProduct: BROWNFIELD_SOURCE_PRODUCT,
    sourceUrl,
    resolvedUrl,
    artifactFilename: path.basename(stored.filePath),
    contentType,
    contentLength,
    byteLength: stored.byteLength,
    etag,
    lastModified,
    sha256: stored.sha256,
    retrievedAt,
    status: 'RETRIEVED',
  });
  const artifact = recorded.artifact;
  const prior = await landStore.successfulRunForArtifact(artifact.id);
  if (prior) {
    return {
      status: 'SKIPPED_AS_ALREADY_IMPORTED',
      artifact,
      runId: prior.id,
      reusedArtifact: true,
      inserted_count: 0,
      unchanged_count: 0,
      rejected_count: 0,
      artifactDataRowCount: null,
      sha256: artifact.sha256,
    };
  }
  let parsed;
  try {
    parsed = await parseBrownfieldCsvFile(stored.filePath, { retrievedAt });
  } catch (error) {
    await artifactStore.markStatus(artifact.id, 'IMPORT_FAILED');
    const run = await recordFailedRun(landStore, artifact, error.code || error.message, 0);
    return {
      status: 'FAILED',
      failure_reason: error.code || error.message,
      artifact,
      runId: run.id,
      inserted_count: 0,
      unchanged_count: 0,
      rejected_count: 0,
      artifactDataRowCount: 0,
      sha256: artifact.sha256,
    };
  }
  if (!parsed.rows.length) {
    await artifactStore.markStatus(artifact.id, 'IMPORT_FAILED');
    const reason = parsed.rejected[0]?.reason || 'brownfield_artifact_no_data_rows';
    const run = await recordFailedRun(landStore, artifact, reason, parsed.rejected.length);
    return {
      status: 'FAILED',
      failure_reason: reason,
      artifact,
      runId: run.id,
      inserted_count: 0,
      unchanged_count: 0,
      rejected_count: parsed.rejected.length,
      rejected: parsed.rejected,
      artifactDataRowCount: parsed.dataRows,
      sha256: artifact.sha256,
    };
  }
  const result = await landStore.importAcceptedBatch({
    rows: parsed.rows.map((row) => withArtifactProvenance(row, artifact, retrievedAt)),
    rejectedCount: parsed.rejected.length,
    releaseLabel: BROWNFIELD_RELEASE_LABEL,
    retrievedAt,
    failAtIndex,
    artifactId: artifact.id,
  });
  await artifactStore.markStatus(
    artifact.id,
    result.status === 'SUCCEEDED' ? 'IMPORT_SUCCEEDED' : 'IMPORT_FAILED'
  );
  return {
    ...result,
    artifact,
    reusedArtifact: stored.reused,
    rejected: parsed.rejected,
    artifactDataRowCount: parsed.dataRows,
    sha256: artifact.sha256,
  };
}

async function importOfficialNationalBrownfieldArtifact(options = {}) {
  assertSafeNationalDatabase(options.authorization);
  const retrieved = await retrieveBrownfieldArtifact({
    url: options.url || BROWNFIELD_BULK_CSV_URL,
    directory: options.directory,
    request: options.request,
    timeoutMs: options.timeoutMs,
  });
  return importBrownfieldArtifactFile({
    filePath: retrieved.filePath,
    directory: options.directory,
    landStore: options.landStore,
    artifactStore: options.artifactStore,
    sourceUrl: retrieved.sourceUrl,
    resolvedUrl: retrieved.resolvedUrl,
    contentType: retrieved.contentType,
    contentLength: retrieved.contentLength,
    etag: retrieved.etag,
    lastModified: retrieved.lastModified,
    retrievedAt: retrieved.retrievedAt,
    failAtIndex: options.failAtIndex,
  });
}

module.exports = {
  assertSafeNationalDatabase,
  importBrownfieldArtifactFile,
  importOfficialNationalBrownfieldArtifact,
};
