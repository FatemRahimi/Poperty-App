/**
 * Strip private storage internals from API and AiRequest snapshots.
 */

const SENSITIVE_KEYS = new Set([
  'storageKey',
  'storage_key',
  'storageProvider',
  'storage_provider',
  'storagePath',
  'storage_path',
  'objectKey',
  'object_key',
  'absolutePath',
  'filePath',
  'file_path',
  'buffer',
  'fileBytes',
  'rawBytes',
  'extractedText',
  'rawText',
  'contentHash',
  'content_hash',
  'ownerUserId',
  'owner_user_id',
  'uploadedBy',
  'signedUrl',
  'signed_url',
  'presignedUrl',
  'presigned_url',
  'storageUrl',
  'objectUrl',
  'providerUrl',
  'bucket',
  'container',
  'endpoint',
  'accessKey',
  'accessKeyId',
  'secretKey',
  'secretAccessKey',
  'encryptionKey',
  'credentials',
  'connectionString',
]);

function sanitizePrivateEvidenceSnapshot(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePrivateEvidenceSnapshot(item));
  }
  if (Buffer.isBuffer(value)) return undefined;
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, child]) => {
      if (SENSITIVE_KEYS.has(key)) return;
      if (key === 'bytes' && (typeof child === 'string' || Buffer.isBuffer(child))) return;
      const next = sanitizePrivateEvidenceSnapshot(child);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }
  return value;
}

module.exports = {
  sanitizePrivateEvidenceSnapshot,
};
