import { savedIntelligenceReportFromRow } from './savedIntelligenceReport';

describe('savedIntelligenceReportFromRow', () => {
  test('overlays read-time confidence provenance without mutating stored output_data', () => {
    const output = {
      title: 'Property Intelligence – Snapshot',
      personalDecision: { score: 61, explanation: { overall: 'Operating costs were not supplied.' } },
      confidence: { level: 'High' },
    };
    const snapshot = JSON.stringify(output);
    const report = savedIntelligenceReportFromRow({
      id: 9,
      request_type: 'property_intelligence',
      confidenceLevel: 'Medium',
      confidenceLevelSource: 'column',
      confidenceModelVersion: 'confidence-1.0.0',
      confidenceLevelIsLegacyEstimate: true,
      output_data: output,
    });
    expect(JSON.stringify(output)).toBe(snapshot);
    expect(report.title).toBe('Property Intelligence – Snapshot');
    expect(report.personalDecision.score).toBe(61);
    expect(report.confidenceProvenance).toEqual({
      level: 'Medium',
      source: 'column',
      modelVersion: 'confidence-1.0.0',
      legacy: true,
    });
  });

  test('returns null when the snapshot is missing', () => {
    expect(savedIntelligenceReportFromRow(null)).toBeNull();
    expect(savedIntelligenceReportFromRow({ id: 1, output_data: null })).toBeNull();
    expect(savedIntelligenceReportFromRow({ output_data: [] })).toBeNull();
  });
});
