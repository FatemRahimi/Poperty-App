/**
 * Read-only private-evidence reconcile classification.
 * Never deletes unknown files. Never prints filenames, hashes, keys, or owners.
 */

function classifyStorageReconcile({
  dbRows = [],
  diskKeys = [],
  listingSupported = true,
} = {}) {
  const diskSet = new Set(diskKeys);
  const dbKeySet = new Set(dbRows.map((row) => row.storageKey).filter(Boolean));
  let missingStoredObjects = 0;
  let activeWithoutFile = 0;
  let archivedWithFile = 0;
  let archivedWithoutFile = 0;
  let deleteFailed = 0;
  let quarantined = 0;
  let scanFailures = 0;
  let integrityMismatch = 0;

  dbRows.forEach((row) => {
    const onDisk = listingSupported ? Boolean(row.storageKey && diskSet.has(row.storageKey)) : null;
    const archived = Boolean(row.archivedAt) || row.lifecycleState === 'ARCHIVED'
      || row.lifecycleState === 'DELETE_FAILED'
      || row.lifecycleState === 'DELETED';
    if (listingSupported) {
      if (!onDisk && !row.bytesRemoved) missingStoredObjects += 1;
      if (!archived && !onDisk) activeWithoutFile += 1;
      if (archived && onDisk) archivedWithFile += 1;
      if (archived && !onDisk) archivedWithoutFile += 1;
    }
    if (row.lifecycleState === 'DELETE_FAILED') deleteFailed += 1;
    if (row.availabilityState === 'QUARANTINED' || row.scanState === 'SCAN_PENDING') quarantined += 1;
    if (row.scanState === 'ERROR' || row.scanState === 'REJECTED') scanFailures += 1;
    if (row.lastIntegrityOk === false) integrityMismatch += 1;
  });

  let orphanStoredObjects = 0;
  if (listingSupported) {
    diskKeys.forEach((key) => {
      if (!dbKeySet.has(key)) orphanStoredObjects += 1;
    });
  }

  return {
    dbRows: dbRows.length,
    storedObjects: listingSupported ? diskKeys.length : 'NOT_VERIFIED',
    listingSupported,
    missingStoredObjects: listingSupported ? missingStoredObjects : 'NOT_VERIFIED',
    orphanStoredObjects: listingSupported ? orphanStoredObjects : 'NOT_VERIFIED',
    activeWithoutFile: listingSupported ? activeWithoutFile : 'NOT_VERIFIED',
    archivedWithFile: listingSupported ? archivedWithFile : 'NOT_VERIFIED',
    archivedWithoutFile: listingSupported ? archivedWithoutFile : 'NOT_VERIFIED',
    deleteFailed,
    quarantined,
    scanFailures,
    integrityMismatch,
  };
}

function buildSafeAuditReport({
  counts = {},
  reconcile = {},
  analysesWithLegalEvidence = 'NOT VERIFIED',
  analysesWithoutLegalEvidence = 'NOT VERIFIED',
  capability = null,
} = {}) {
  return {
    activeDocuments: Number(counts.active || 0),
    archivedDocuments: Number(counts.archived || 0),
    legalDocuments: Number(counts.legal || 0),
    scanUnavailable: Number(counts.scan_unavailable || 0),
    scanClean: Number(counts.scan_clean || 0),
    quarantined: Number(counts.quarantined || reconcile.quarantined || 0),
    scanFailures: Number(counts.scan_failures || reconcile.scanFailures || 0),
    deleteFailed: Number(counts.delete_failed || reconcile.deleteFailed || 0),
    missingStoredObjects: reconcile.missingStoredObjects,
    orphanStoredObjects: reconcile.orphanStoredObjects,
    activeWithoutFile: reconcile.activeWithoutFile,
    archivedWithFile: reconcile.archivedWithFile,
    integrityMismatch: Number(counts.integrity_mismatch || reconcile.integrityMismatch || 0),
    listingSupported: reconcile.listingSupported !== false,
    analysesWithLegalEvidence,
    analysesWithoutLegalEvidence,
    capabilityStatus: capability?.status || 'UNAVAILABLE',
    durability: capability?.durability || 'UNAVAILABLE',
    ingestAvailable: capability?.ingestAvailable === true,
    encryptionAtRest: capability?.encryptionAtRest || 'NOT_VERIFIED',
    backupRecovery: capability?.backupRecovery || 'NOT_VERIFIED',
    scannerClass: capability?.scannerClass || 'NO_SCANNER_AVAILABLE',
  };
}

module.exports = {
  classifyStorageReconcile,
  buildSafeAuditReport,
};
