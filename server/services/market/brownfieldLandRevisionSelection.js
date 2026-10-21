/**
 * Deterministic effective observation selection for brownfield revisions.
 * Uses source entry-date only. Never uses ingest/retrieval time or import order.
 */

const BROWNFIELD_SELECTION = Object.freeze({
  RESOLVED: 'RESOLVED',
  AMBIGUOUS: 'AMBIGUOUS',
  NONE: 'NONE',
});

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function revisionIdentity(row) {
  return {
    sourceEntityId: row.sourceEntityId,
    contentFingerprint: row.contentFingerprint,
    entryDate: row.entryDate || null,
    reference: row.reference || null,
  };
}

function uniqueByFingerprint(observations) {
  const byFingerprint = new Map();
  (observations || []).forEach((row) => {
    if (!row || !row.contentFingerprint) return;
    if (!byFingerprint.has(row.contentFingerprint)) {
      byFingerprint.set(row.contentFingerprint, row);
    }
  });
  return [...byFingerprint.values()];
}

function ambiguousResult(candidates, reason) {
  const sorted = candidates.slice().sort((a, b) => (
    String(a.contentFingerprint).localeCompare(String(b.contentFingerprint))
  ));
  return {
    selectionStatus: BROWNFIELD_SELECTION.AMBIGUOUS,
    effectiveObservation: null,
    candidateCount: sorted.length,
    revisionCount: sorted.length,
    selectionBasis: null,
    ambiguityReason: reason,
    ambiguousRevisions: sorted.map(revisionIdentity),
  };
}

/**
 * Select the effective brownfield observation from retained revisions.
 *
 * Defensible chronology: Planning Data `entry-date` (stored as entryDate) —
 * the platform's source entry/update date for the entity payload. Not ingest time.
 *
 * Rules:
 * - 0 revisions → NONE
 * - 1 unique fingerprint → RESOLVED (single_observation)
 * - multiple fingerprints, all with ISO entryDate, unique maximum → RESOLVED (source_entry_date)
 * - otherwise → AMBIGUOUS (never guess; never use ingestedAt/retrievedAt/import order)
 */
function selectEffectiveBrownfieldObservation(observations) {
  const unique = uniqueByFingerprint(observations);
  if (!unique.length) {
    return {
      selectionStatus: BROWNFIELD_SELECTION.NONE,
      effectiveObservation: null,
      candidateCount: 0,
      revisionCount: 0,
      selectionBasis: null,
      ambiguityReason: null,
      ambiguousRevisions: [],
    };
  }
  if (unique.length === 1) {
    return {
      selectionStatus: BROWNFIELD_SELECTION.RESOLVED,
      effectiveObservation: unique[0],
      candidateCount: 1,
      revisionCount: 1,
      selectionBasis: 'single_observation',
      ambiguityReason: null,
      ambiguousRevisions: [],
    };
  }

  const dated = unique.map((row) => ({
    row,
    entryDate: isIsoDate(row.entryDate) ? row.entryDate : null,
  }));
  if (!dated.every((item) => item.entryDate)) {
    return ambiguousResult(unique, 'missing_or_unusable_source_entry_date');
  }

  let maxDate = dated[0].entryDate;
  dated.forEach((item) => {
    if (item.entryDate > maxDate) maxDate = item.entryDate;
  });
  const winners = dated.filter((item) => item.entryDate === maxDate);
  if (winners.length !== 1) {
    return ambiguousResult(unique, 'tied_source_entry_date');
  }

  return {
    selectionStatus: BROWNFIELD_SELECTION.RESOLVED,
    effectiveObservation: winners[0].row,
    candidateCount: unique.length,
    revisionCount: unique.length,
    selectionBasis: 'source_entry_date',
    ambiguityReason: null,
    ambiguousRevisions: [],
  };
}

function compareRevisions(a, b) {
  const entryA = isIsoDate(a.entryDate) ? a.entryDate : '';
  const entryB = isIsoDate(b.entryDate) ? b.entryDate : '';
  if (entryA && entryB && entryA !== entryB) return entryA.localeCompare(entryB);
  if (entryA && !entryB) return -1;
  if (!entryA && entryB) return 1;
  return String(a.contentFingerprint || '').localeCompare(String(b.contentFingerprint || ''));
}

module.exports = {
  BROWNFIELD_SELECTION,
  isIsoDate,
  uniqueByFingerprint,
  selectEffectiveBrownfieldObservation,
  compareRevisions,
};
