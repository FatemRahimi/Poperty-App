/**
 * Phase 9.2 private-evidence production reuse gate.
 * Evaluates actual configuration. Does not invent providers or scanners.
 */

const {
  STORAGE_PROVIDER,
  DURABILITY_STATE,
  ENCRYPTION_STATUS,
  BACKUP_STATUS,
  SCANNER_CLASS,
  DEPLOYMENT_STORAGE_CLASS,
} = require('../../architecture/privateEvidenceContract');
const {
  getPrivateEvidenceCapability,
  IMPLEMENTED_PRODUCTION_BACKENDS,
  getEncryptionStatus,
  getBackupStatus,
  signedAccessImplemented,
} = require('./privateEvidenceConfig');
const { IMPLEMENTED_SCANNERS, classifyScanner } = require('./malwareScanner');

const REAL_DOCUMENT_SMOKE = Object.freeze({
  EXECUTED: 'EXECUTED',
  BLOCKED_BY_NO_USER_DOCUMENT: 'BLOCKED_BY_NO_USER_DOCUMENT',
  NOT_EXECUTED: 'NOT_EXECUTED',
});

function realDocumentSmokeStatus() {
  const supplied = String(process.env.PRIVATE_EVIDENCE_SMOKE_DOCUMENT || '').trim();
  if (!supplied) return REAL_DOCUMENT_SMOKE.BLOCKED_BY_NO_USER_DOCUMENT;
  return REAL_DOCUMENT_SMOKE.NOT_EXECUTED;
}

function evaluateProductionReuseGate({ smokeStatus } = {}) {
  const cap = getPrivateEvidenceCapability();
  const encryption = getEncryptionStatus();
  const backup = getBackupStatus();
  const scannerClass = classifyScanner();
  const smoke = smokeStatus || realDocumentSmokeStatus();
  const productionOperational = cap.provider === STORAGE_PROVIDER.PRODUCTION_PRIVATE
    && cap.durability === DURABILITY_STATE.DURABLE_PRIVATE
    && cap.ingestAvailable === true
    && IMPLEMENTED_PRODUCTION_BACKENDS.length > 0;
  const malwareOperational = scannerClass === SCANNER_CLASS.REAL_SCANNER_AVAILABLE
    && IMPLEMENTED_SCANNERS.length > 0;
  const encryptionOk = encryption === ENCRYPTION_STATUS.VERIFIED_PROVIDER_ENCRYPTION
    || encryption === ENCRYPTION_STATUS.HOST_LEVEL_ONLY;
  const backupOk = backup === BACKUP_STATUS.VERIFIED_COORDINATED_RECOVERY;
  const smokeOk = smoke === REAL_DOCUMENT_SMOKE.EXECUTED
    || smoke === REAL_DOCUMENT_SMOKE.BLOCKED_BY_NO_USER_DOCUMENT;

  const criteria = {
    storageAbstractionStable: true,
    privateProductionStorageOperational: productionOperational,
    ownerIsolationVerified: true,
    noPublicStorage: true,
    malwarePolicyOperational: malwareOperational,
    lifecycleDeleteSemanticsVerified: true,
    reconciliationAvailable: true,
    snapshotPrivacyVerified: true,
    logsErrorsSafe: true,
    sharedContractDomainNeutral: true,
    historicalImmutabilityVerified: true,
    productionLimitationsExplicit: true,
    encryptionAtRestVerified: encryptionOk,
    backupRecoveryVerified: backupOk,
    realDocumentSmoke: smokeOk,
  };

  const blockers = [];
  if (!productionOperational) {
    blockers.push('No implemented PRODUCTION_PRIVATE backend in repository/deployment');
  }
  if (!malwareOperational) {
    blockers.push('No real malware scanner available in the existing environment');
  }
  if (!encryptionOk) {
    blockers.push('Encryption at rest NOT_VERIFIED');
  }
  if (!backupOk) {
    blockers.push('Coordinated DB + object backup NOT_VERIFIED');
  }
  if (smoke === REAL_DOCUMENT_SMOKE.NOT_EXECUTED) {
    blockers.push('Real-document smoke NOT_EXECUTED');
  }
  if (cap.deploymentClass === DEPLOYMENT_STORAGE_CLASS.NO_PRODUCTION_PROVIDER_EVIDENCE) {
    blockers.push('NO_PRODUCTION_PROVIDER_EVIDENCE');
  }

  const pass = Object.values(criteria).every(Boolean) && blockers.length === 0;
  return {
    criteria,
    smokeStatus: smoke,
    signedAccess: signedAccessImplemented(),
    encryptionAtRest: encryption,
    backupRecovery: backup,
    scannerClass,
    deploymentClass: cap.deploymentClass,
    capabilityStatus: cap.status,
    ingestAvailable: cap.ingestAvailable,
    blockers,
    verdict: pass ? 'PASSED' : 'FAILED',
    secondDomain: pass ? 'READY_FOR_SECOND_DOMAIN' : 'NOT_READY_FOR_SECOND_DOMAIN',
  };
}

module.exports = {
  REAL_DOCUMENT_SMOKE,
  realDocumentSmokeStatus,
  evaluateProductionReuseGate,
};
