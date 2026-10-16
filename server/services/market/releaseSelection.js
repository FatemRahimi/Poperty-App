/**
 * Effective official release selection.
 * Chronology is used only for YYYY-MM and YYYY-MM-DD labels.
 * Text labels are not ordered. Import time is not publication time.
 */

const EFFECTIVE_SELECTION = Object.freeze({
  RESOLVED: 'RESOLVED',
  AMBIGUOUS: 'AMBIGUOUS',
  NONE: 'NONE',
});

function releaseLabelOrUnspecified(label) {
  const text = label == null ? '' : String(label).trim();
  return text || 'unspecified';
}

function datedReleaseValue(label) {
  const text = String(label == null ? '' : label).trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = match[3] == null ? 1 : Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dayText = match[3] || '01';
  return `${match[1]}-${match[2]}-${dayText}`;
}

function compareDatedReleaseLabels(left, right) {
  const a = datedReleaseValue(left);
  const b = datedReleaseValue(right);
  if (!a || !b) return null;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function identityKey(record, fields) {
  return fields.map((field) => (record[field] == null ? '' : String(record[field]))).join('|');
}

function selectEffectiveRecords(records, {
  identityFields,
  succeededReleaseLabels = null,
} = {}) {
  const allowed = succeededReleaseLabels == null
    ? null
    : new Set(succeededReleaseLabels.map(releaseLabelOrUnspecified));
  const groups = new Map();
  (records || []).forEach((record) => {
    const release = releaseLabelOrUnspecified(record.releaseLabel || record.release_label);
    if (allowed && !allowed.has(release)) return;
    const key = identityKey(record, identityFields);
    if (!groups.has(key)) groups.set(key, new Map());
    const byRelease = groups.get(key);
    if (!byRelease.has(release)) byRelease.set(release, record);
  });

  const resolved = [];
  const ambiguous = [];
  groups.forEach((byRelease, key) => {
    const releases = [...byRelease.keys()];
    if (releases.length === 1) {
      resolved.push(byRelease.get(releases[0]));
      return;
    }
    const dated = releases.map((release) => ({ release, value: datedReleaseValue(release) }));
    if (dated.every((item) => item.value)) {
      dated.sort((a, b) => (a.value < b.value ? -1 : 1));
      resolved.push(byRelease.get(dated[dated.length - 1].release));
      return;
    }
    ambiguous.push({
      identity: key,
      releases: releases.slice().sort(),
      records: releases.slice().sort().map((release) => byRelease.get(release)),
    });
  });

  let status = EFFECTIVE_SELECTION.NONE;
  if (ambiguous.length) status = EFFECTIVE_SELECTION.AMBIGUOUS;
  else if (resolved.length) status = EFFECTIVE_SELECTION.RESOLVED;

  return {
    status,
    records: resolved,
    ambiguous,
  };
}

module.exports = {
  EFFECTIVE_SELECTION,
  releaseLabelOrUnspecified,
  datedReleaseValue,
  compareDatedReleaseLabels,
  selectEffectiveRecords,
};
