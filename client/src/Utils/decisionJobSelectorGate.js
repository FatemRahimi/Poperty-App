/**
 * Exact-property job selector visibility (frontend only).
 *
 * The selector is subject-native: a legitimate exact property must already be
 * selected/resolved and have a preview. Listing identity is not the product gate.
 *
 * Does NOT inspect listingId, approved, ownership, price, monthly_rent, or
 * marketplace state. Postcode/area context (no preview / no selected subject)
 * must not unlock Buy / Let / Sell.
 */

function hasIdentity(value) {
  if (value == null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

export function hasExactPropertySubject({
  preview = null,
  selectedSubjectId = null,
  selectedId = null,
} = {}) {
  if (!preview || typeof preview !== 'object') return false;
  return hasIdentity(selectedSubjectId) || hasIdentity(selectedId);
}

export function shouldRenderDecisionJobSelector({
  preview = null,
  selectedSubjectId = null,
  selectedId = null,
  report = null,
  isAuthenticated = true,
} = {}) {
  return Boolean(
    isAuthenticated
      && !report
      && hasExactPropertySubject({ preview, selectedSubjectId, selectedId })
  );
}
