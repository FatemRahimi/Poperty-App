/**
 * Private evidence deployment configuration.
 * Production never silently falls back to public /uploads.
 */

const path = require('path');
const {
  MAX_EVIDENCE_BYTES,
  STORAGE_PROVIDER,
  DURABILITY_STATE,
  CAPABILITY_STATUS,
  ENCRYPTION_STATUS,
  BACKUP_STATUS,
  SCANNER_CLASS,
  DEPLOYMENT_STORAGE_CLASS,
} = require('../../architecture/privateEvidenceContract');
const { IMPLEMENTED_PRODUCTION_BACKENDS, getProductionAdapter } = require('./storageAdapters/productionRegistry');
const { classifyScanner, realScannerAvailable } = require('./malwareScanner');

const DEFAULT_LOCAL_ROOT = path.join(__dirname, '../../private-evidence');

function nodeEnv() {
  return String(process.env.NODE_ENV || 'development').toLowerCase();
}

function isProductionRuntime() {
  return nodeEnv() === 'production';
}

function configuredProvider() {
  const raw = String(process.env.PRIVATE_EVIDENCE_PROVIDER || 'local').toLowerCase();
  if (raw === 'production' || raw === 'production_private') return STORAGE_PROVIDER.PRODUCTION_PRIVATE;
  if (raw === 'local' || raw === 'local_private') return STORAGE_PROVIDER.LOCAL_PRIVATE;
  return STORAGE_PROVIDER.UNAVAILABLE;
}

function maxEvidenceBytes() {
  const parsed = Number(process.env.PRIVATE_EVIDENCE_MAX_BYTES);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_EVIDENCE_BYTES) {
    return Math.floor(parsed);
  }
  return MAX_EVIDENCE_BYTES;
}

function localRoot() {
  return process.env.PRIVATE_EVIDENCE_ROOT || DEFAULT_LOCAL_ROOT;
}

function publicUploadsDir() {
  return path.resolve(__dirname, '../../uploads');
}

function isPublicUploadsPath(candidate) {
  if (!candidate) return false;
  const resolved = path.resolve(candidate);
  const uploads = publicUploadsDir();
  const prefix = uploads.endsWith(path.sep) ? uploads : `${uploads}${path.sep}`;
  return resolved === uploads || resolved.startsWith(prefix);
}

function configuredProductionBackend() {
  return String(process.env.PRIVATE_EVIDENCE_PRODUCTION_BACKEND || '').trim().toLowerCase();
}

function durableProductionConfigured() {
  const backend = configuredProductionBackend();
  if (!backend) return false;
  if (IMPLEMENTED_PRODUCTION_BACKENDS.includes(backend)) return true;
  if (!isProductionRuntime() && getProductionAdapter(backend)) return true;
  return false;
}

function classifyDeploymentStorage() {
  if (IMPLEMENTED_PRODUCTION_BACKENDS.length > 0) {
    return durableProductionConfigured()
      ? DEPLOYMENT_STORAGE_CLASS.EXISTING_CONFIGURED_PROVIDER
      : DEPLOYMENT_STORAGE_CLASS.EXISTING_PROVIDER_BUT_INCOMPLETE_CONFIG;
  }
  return DEPLOYMENT_STORAGE_CLASS.NO_PRODUCTION_PROVIDER_EVIDENCE;
}

function getEncryptionStatus() {
  return ENCRYPTION_STATUS.NOT_VERIFIED;
}

function getBackupStatus() {
  return BACKUP_STATUS.NOT_VERIFIED;
}

function getDatabaseBackupStatus() {
  return BACKUP_STATUS.NOT_VERIFIED;
}

function getObjectBackupStatus() {
  return BACKUP_STATUS.NOT_VERIFIED;
}

function signedAccessImplemented() {
  return false;
}

function resolveStorageMode() {
  if (isPublicUploadsPath(localRoot())) {
    return {
      provider: STORAGE_PROVIDER.UNAVAILABLE,
      durability: DURABILITY_STATE.UNAVAILABLE,
      ingestAvailable: false,
      reason: 'PUBLIC_UPLOADS_FORBIDDEN',
    };
  }
  const provider = configuredProvider();
  if (isProductionRuntime()) {
    if (
      provider === STORAGE_PROVIDER.PRODUCTION_PRIVATE
      && durableProductionConfigured()
      && realScannerAvailable()
    ) {
      return {
        provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE,
        durability: DURABILITY_STATE.DURABLE_PRIVATE,
        ingestAvailable: true,
        reason: null,
      };
    }
    return {
      provider: STORAGE_PROVIDER.UNAVAILABLE,
      durability: DURABILITY_STATE.UNAVAILABLE,
      ingestAvailable: false,
      reason: 'PRODUCTION_STORAGE_UNAVAILABLE',
    };
  }
  if (provider === STORAGE_PROVIDER.PRODUCTION_PRIVATE) {
    if (durableProductionConfigured() && realScannerAvailable()) {
      return {
        provider: STORAGE_PROVIDER.PRODUCTION_PRIVATE,
        durability: DURABILITY_STATE.DURABLE_PRIVATE,
        ingestAvailable: true,
        reason: null,
      };
    }
    return {
      provider: STORAGE_PROVIDER.UNAVAILABLE,
      durability: DURABILITY_STATE.UNAVAILABLE,
      ingestAvailable: false,
      reason: 'PRODUCTION_STORAGE_UNAVAILABLE',
    };
  }
  if (provider === STORAGE_PROVIDER.LOCAL_PRIVATE) {
    return {
      provider: STORAGE_PROVIDER.LOCAL_PRIVATE,
      durability: DURABILITY_STATE.DEVELOPMENT_LOCAL,
      ingestAvailable: true,
      reason: null,
    };
  }
  return {
    provider: STORAGE_PROVIDER.UNAVAILABLE,
    durability: DURABILITY_STATE.UNAVAILABLE,
    ingestAvailable: false,
    reason: 'PRIVATE_EVIDENCE_PROVIDER_UNAVAILABLE',
  };
}

function getPrivateEvidenceCapability() {
  const mode = resolveStorageMode();
  const scannerClass = classifyScanner();
  const scanState = scannerClass === SCANNER_CLASS.REAL_SCANNER_AVAILABLE
    ? 'SCAN_PENDING'
    : 'SCAN_UNAVAILABLE';
  if (!mode.ingestAvailable) {
    return {
      status: CAPABILITY_STATUS.UNAVAILABLE,
      ingestAvailable: false,
      downloadAvailable: false,
      durability: mode.durability,
      provider: mode.provider,
      scanState,
      scannerClass,
      encryptionAtRest: getEncryptionStatus(),
      backupRecovery: getBackupStatus(),
      databaseBackup: getDatabaseBackupStatus(),
      objectBackup: getObjectBackupStatus(),
      deploymentClass: classifyDeploymentStorage(),
      signedAccess: signedAccessImplemented(),
      publicReason: 'Private evidence is temporarily unavailable.',
      internalReason: mode.reason,
    };
  }
  return {
    status: mode.durability === DURABILITY_STATE.DEVELOPMENT_LOCAL
      ? CAPABILITY_STATUS.DEGRADED
      : CAPABILITY_STATUS.AVAILABLE,
    ingestAvailable: true,
    downloadAvailable: true,
    durability: mode.durability,
    provider: mode.provider,
    scanState,
    scannerClass,
    encryptionAtRest: getEncryptionStatus(),
    backupRecovery: getBackupStatus(),
    databaseBackup: getDatabaseBackupStatus(),
    objectBackup: getObjectBackupStatus(),
    deploymentClass: classifyDeploymentStorage(),
    signedAccess: signedAccessImplemented(),
    publicReason: null,
    internalReason: mode.durability === DURABILITY_STATE.DEVELOPMENT_LOCAL
      ? 'DEVELOPMENT_LOCAL'
      : null,
  };
}

function publicCapabilityView() {
  const cap = getPrivateEvidenceCapability();
  return {
    status: cap.status,
    ingestAvailable: cap.ingestAvailable,
  };
}

module.exports = {
  DEFAULT_LOCAL_ROOT,
  nodeEnv,
  isProductionRuntime,
  configuredProvider,
  maxEvidenceBytes,
  localRoot,
  publicUploadsDir,
  isPublicUploadsPath,
  IMPLEMENTED_PRODUCTION_BACKENDS,
  configuredProductionBackend,
  durableProductionConfigured,
  classifyDeploymentStorage,
  getEncryptionStatus,
  getBackupStatus,
  getDatabaseBackupStatus,
  getObjectBackupStatus,
  signedAccessImplemented,
  resolveStorageMode,
  getPrivateEvidenceCapability,
  publicCapabilityView,
};
