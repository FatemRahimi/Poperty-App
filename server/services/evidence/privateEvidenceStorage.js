/**
 * Private evidence storage interface.
 * Consumers use put/read/exists/delete/stat — not filesystem paths.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ALLOWED_MIME_TYPES,
  MAX_EVIDENCE_BYTES,
  STORAGE_PROVIDER,
  sanitizeOriginalFilename,
} = require('../../architecture/privateEvidenceContract');
const { validateContentSignature } = require('./contentSignature');
const {
  localRoot,
  resolveStorageMode,
  maxEvidenceBytes,
  isPublicUploadsPath,
  configuredProductionBackend,
  configuredProvider,
  isProductionRuntime,
} = require('./privateEvidenceConfig');
const { getProductionAdapter } = require('./storageAdapters/productionRegistry');

function unavailableStorage() {
  return Object.assign(new Error('EVIDENCE_STORAGE_UNAVAILABLE'), {
    code: 'EVIDENCE_STORAGE_UNAVAILABLE',
  });
}

function listingUnsupported() {
  return Object.assign(new Error('OBJECT_LISTING_UNSUPPORTED'), {
    code: 'OBJECT_LISTING_UNSUPPORTED',
  });
}

function productionPathRequired() {
  return isProductionRuntime() || configuredProvider() === STORAGE_PROVIDER.PRODUCTION_PRIVATE;
}

function resolveActiveAdapter() {
  if (!productionPathRequired()) return null;
  return getProductionAdapter(configuredProductionBackend());
}

function localDiskAllowed() {
  if (productionPathRequired()) return false;
  if (isPublicUploadsPath(localRoot())) return false;
  return resolveStorageMode().provider === STORAGE_PROVIDER.LOCAL_PRIVATE;
}

function computeContentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function createStorageKey() {
  return crypto.randomUUID();
}

function assertSafeKey(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    throw Object.assign(new Error('INVALID_STORAGE_KEY'), { code: 'INVALID_STORAGE_KEY' });
  }
  if (storageKey.includes('/') || storageKey.includes('\\') || storageKey.includes('..')) {
    throw Object.assign(new Error('INVALID_STORAGE_KEY'), { code: 'INVALID_STORAGE_KEY' });
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(storageKey)) {
    throw Object.assign(new Error('INVALID_STORAGE_KEY'), { code: 'INVALID_STORAGE_KEY' });
  }
}

function rootDir() {
  return path.resolve(localRoot());
}

function destFor(storageKey) {
  assertSafeKey(storageKey);
  return path.join(rootDir(), storageKey);
}

function assertInsideRoot(candidate) {
  const root = rootDir();
  const resolvedRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
  const resolved = path.resolve(candidate);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) {
    throw Object.assign(new Error('INVALID_STORAGE_KEY'), { code: 'INVALID_STORAGE_KEY' });
  }
}

function rejectSymlink(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      throw Object.assign(new Error('SYMLINK_REJECTED'), { code: 'SYMLINK_REJECTED' });
    }
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}

function applyRestrictivePermissions(target, mode) {
  try {
    fs.chmodSync(target, mode);
  } catch {
    // Windows and some hosts cannot apply POSIX modes.
  }
}

function validateUploadBuffer({ buffer, mimeType, originalFilename, declaredMimeType } = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw Object.assign(new Error('MALFORMED_UPLOAD'), { code: 'MALFORMED_UPLOAD' });
  }
  if (buffer.length === 0) {
    throw Object.assign(new Error('ZERO_BYTE_FILE'), { code: 'ZERO_BYTE_FILE' });
  }
  const limit = maxEvidenceBytes();
  if (buffer.length > limit || buffer.length > MAX_EVIDENCE_BYTES) {
    throw Object.assign(new Error('FILE_TOO_LARGE'), { code: 'FILE_TOO_LARGE' });
  }
  const mime = String(declaredMimeType || mimeType || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES[mime]) {
    throw Object.assign(new Error('UNSUPPORTED_FILE_TYPE'), { code: 'UNSUPPORTED_FILE_TYPE' });
  }
  validateContentSignature({ buffer, mimeType: mime, originalFilename });
  return {
    mimeType: mime,
    originalFilename: sanitizeOriginalFilename(originalFilename),
    byteSize: buffer.length,
    contentHash: computeContentHash(buffer),
  };
}

async function ensureRoot() {
  const root = rootDir();
  if (isPublicUploadsPath(root)) {
    throw unavailableStorage();
  }
  await fs.promises.mkdir(root, { recursive: true });
  applyRestrictivePermissions(root, 0o700);
  rejectSymlink(root);
  return root;
}

async function putLocal(buffer, { storageKey } = {}) {
  const key = storageKey || createStorageKey();
  await ensureRoot();
  const dest = destFor(key);
  assertInsideRoot(dest);
  rejectSymlink(dest);
  const tmp = `${dest}.tmp-${process.pid}`;
  await fs.promises.writeFile(tmp, buffer, { flag: 'wx' });
  applyRestrictivePermissions(tmp, 0o600);
  await fs.promises.rename(tmp, dest);
  rejectSymlink(dest);
  assertInsideRoot(fs.realpathSync(dest));
  return { storageKey: key };
}

async function readLocal(storageKey) {
  const dest = destFor(storageKey);
  assertInsideRoot(dest);
  rejectSymlink(dest);
  return fs.promises.readFile(dest);
}

async function existsLocal(storageKey) {
  try {
    const dest = destFor(storageKey);
    rejectSymlink(dest);
    await fs.promises.access(dest, fs.constants.R_OK);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'SYMLINK_REJECTED') return false;
    if (error.code === 'INVALID_STORAGE_KEY') return false;
    throw error;
  }
}

async function removeLocal(storageKey) {
  if (!storageKey) return false;
  try {
    const dest = destFor(storageKey);
    assertInsideRoot(dest);
    rejectSymlink(dest);
    await fs.promises.unlink(dest);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function listLocalKeys() {
  await ensureRoot();
  const names = await fs.promises.readdir(rootDir());
  return names.filter((name) => /^[0-9a-fA-F-]{36}$/.test(name));
}

async function put(buffer, { storageKey } = {}) {
  const mode = resolveStorageMode();
  if (!mode.ingestAvailable) {
    throw unavailableStorage();
  }
  const adapter = resolveActiveAdapter();
  if (adapter) {
    return adapter.put(buffer, { storageKey: storageKey || createStorageKey() });
  }
  if (!localDiskAllowed()) throw unavailableStorage();
  return putLocal(buffer, { storageKey });
}

async function read(storageKey) {
  const adapter = resolveActiveAdapter();
  if (adapter) return adapter.read(storageKey);
  if (productionPathRequired()) throw unavailableStorage();
  return readLocal(storageKey);
}

async function exists(storageKey) {
  const adapter = resolveActiveAdapter();
  if (adapter) return adapter.exists(storageKey);
  if (productionPathRequired()) return false;
  return existsLocal(storageKey);
}

async function remove(storageKey) {
  const adapter = resolveActiveAdapter();
  if (adapter) return adapter.delete(storageKey);
  if (productionPathRequired()) return false;
  return removeLocal(storageKey);
}

async function stat(storageKey) {
  const adapter = resolveActiveAdapter();
  if (adapter && typeof adapter.stat === 'function') return adapter.stat(storageKey);
  const buffer = await read(storageKey);
  return {
    byteSize: buffer.length,
    contentHash: computeContentHash(buffer),
  };
}

async function listKeys() {
  const adapter = resolveActiveAdapter();
  if (adapter) {
    if (!adapter.supportsListing || typeof adapter.listKeys !== 'function') {
      throw listingUnsupported();
    }
    return adapter.listKeys();
  }
  if (productionPathRequired()) throw listingUnsupported();
  return listLocalKeys();
}

function objectListingSupported() {
  const adapter = resolveActiveAdapter();
  if (adapter) return adapter.supportsListing === true;
  return localDiskAllowed();
}

function resolveStoragePath(storageKey) {
  return destFor(storageKey);
}

function storageRoot() {
  return rootDir();
}

module.exports = {
  computeContentHash,
  createStorageKey,
  validateUploadBuffer,
  put,
  read,
  exists,
  delete: remove,
  deletePrivateBuffer: remove,
  storePrivateBuffer: put,
  readPrivateBuffer: read,
  stat,
  listKeys,
  objectListingSupported,
  resolveStoragePath,
  storageRoot,
};
