import { savedIntelligenceReportFromRow } from './savedIntelligenceReport';
import { isLegacyLandlordSnapshot } from './decisionWorkspaceDisplay';

describe('saved intelligence report decision context', () => {
  test('spreads stored output without rewriting snapshots', () => {
    const stored = {
      decisionJob: 'BUY',
      residentialDecisionContext: { decisionJob: 'BUY' },
      decisionWorkspace: { decisionJob: 'BUY' },
      personalDecision: { profile: 'buyer_general' },
    };
    const row = { output_data: stored, confidenceLevel: 'Medium' };
    const report = savedIntelligenceReportFromRow(row);
    expect(report.decisionJob).toBe('BUY');
    expect(report.residentialDecisionContext).toEqual(stored.residentialDecisionContext);
    expect(report.decisionWorkspace).toBe(stored.decisionWorkspace);
    expect(report.personalDecision).toBe(stored.personalDecision);
  });

  test('legacy landlord snapshots are not reinterpreted as Buy or Sell', () => {
    const report = savedIntelligenceReportFromRow({
      output_data: {
        personalDecision: { profile: 'landlord', score: 70 },
        decisionIntelligence: { engine: 'decisionIntelligence' },
      },
    });
    expect(isLegacyLandlordSnapshot(report)).toBe(true);
    expect(report.decisionJob).toBeUndefined();
    expect(report.residentialDecisionContext).toBeUndefined();
  });
});
