/**
 * Display-only labels for canonical asset classification.
 * Does not infer a class or rewrite historical snapshots.
 */

export const ASSET_CLASS_LABELS = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  INDUSTRIAL: 'Industrial',
  AGRICULTURAL: 'Agricultural',
  LAND: 'Land',
  DEVELOPMENT_SITE: 'Development site',
  MIXED_USE: 'Mixed-use',
  UNKNOWN: 'Not classified',
};

export function formatAssetClassLabel(classification, { historical = false } = {}) {
  if (!classification || classification.assetClass == null || classification.assetClass === '') {
    return historical ? 'Not recorded' : 'Not classified';
  }
  return ASSET_CLASS_LABELS[classification.assetClass] || (historical ? 'Not recorded' : 'Not classified');
}

export function formatClassificationStateLabel(classification) {
  if (!classification || !classification.state || classification.state === 'UNKNOWN') return null;
  if (classification.state === 'INFERRED') return 'Inferred from labelled evidence';
  if (classification.state === 'AUTHORITATIVE') return 'Authoritative source';
  if (classification.state === 'DECLARED') return 'Declared';
  return null;
}
