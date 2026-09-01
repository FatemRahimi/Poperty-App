import { formatAssetClassLabel, formatClassificationStateLabel } from './assetClassificationDisplay';

describe('assetClassificationDisplay', () => {
  test('UNKNOWN and missing snapshots do not become Residential', () => {
    expect(formatAssetClassLabel({ assetClass: 'UNKNOWN' })).toBe('Not classified');
    expect(formatAssetClassLabel(null, { historical: true })).toBe('Not recorded');
    expect(formatAssetClassLabel(undefined, { historical: true })).toBe('Not recorded');
    expect(formatAssetClassLabel({})).toBe('Not classified');
  });

  test('canonical classes have conservative labels', () => {
    expect(formatAssetClassLabel({ assetClass: 'RESIDENTIAL' })).toBe('Residential');
    expect(formatAssetClassLabel({ assetClass: 'COMMERCIAL' })).toBe('Commercial');
    expect(formatAssetClassLabel({ assetClass: 'INDUSTRIAL' })).toBe('Industrial');
    expect(formatAssetClassLabel({ assetClass: 'AGRICULTURAL' })).toBe('Agricultural');
    expect(formatAssetClassLabel({ assetClass: 'LAND' })).toBe('Land');
    expect(formatAssetClassLabel({ assetClass: 'DEVELOPMENT_SITE' })).toBe('Development site');
    expect(formatAssetClassLabel({ assetClass: 'MIXED_USE' })).toBe('Mixed-use');
  });

  test('inferred state is not presented as AI certainty', () => {
    expect(formatClassificationStateLabel({ state: 'INFERRED' })).toBe('Inferred from labelled evidence');
    expect(formatClassificationStateLabel({ state: 'UNKNOWN' })).toBeNull();
  });
});
