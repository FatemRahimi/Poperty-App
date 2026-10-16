/**
 * Deterministic release order for official observations and geography rows.
 * A newer dated release stays effective even if an older release is imported later.
 */

function releaseLabelOrUnspecified(label) {
  const text = label == null ? '' : String(label).trim();
  return text || 'unspecified';
}

function releaseRank(label) {
  const text = releaseLabelOrUnspecified(label);
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return { kind: 'text', value: text };
  return { kind: 'date', value: `${match[1]}-${match[2]}-${match[3] || '01'}` };
}

function compareReleaseLabels(left, right) {
  const a = releaseRank(left);
  const b = releaseRank(right);
  if (a.kind === 'date' && b.kind === 'date') return a.value.localeCompare(b.value);
  if (a.kind === 'date') return 1;
  if (b.kind === 'date') return -1;
  return a.value.localeCompare(b.value);
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
  const chosen = new Map();
  (records || []).forEach((record) => {
    const release = releaseLabelOrUnspecified(record.releaseLabel || record.release_label);
    if (allowed && !allowed.has(release)) return;
    const key = identityKey({ ...record, releaseLabel: release }, identityFields);
    const current = chosen.get(key);
    if (!current || compareReleaseLabels(release, current.releaseLabel || current.release_label) > 0) {
      chosen.set(key, record);
    }
  });
  return [...chosen.values()];
}

module.exports = {
  releaseLabelOrUnspecified,
  compareReleaseLabels,
  selectEffectiveRecords,
};
