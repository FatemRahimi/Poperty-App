/**
 * One-shot viewport restoration when a result view first becomes active.
 * Display/navigation only — does not change report content or ordering.
 */

export function letResultsRestoreKey({
  report = null,
  loading = false,
  analysisId = null,
  historyView = false,
  subjectKey = '',
} = {}) {
  if (loading || !report || report.insufficientData) return null;
  const id = analysisId || report.analysisDate || 'open';
  return `${historyView ? 'saved' : 'live'}::${id}::${subjectKey || ''}`;
}

export function shouldRestoreResultsViewport(previousKey, nextKey) {
  if (!nextKey) return false;
  return previousKey !== nextKey;
}

export function restoreResultsViewport(node) {
  if (!node || typeof node.scrollIntoView !== 'function') return false;
  node.scrollIntoView({ behavior: 'auto', block: 'start' });
  return true;
}
