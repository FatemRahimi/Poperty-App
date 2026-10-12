import {
  letResultsRestoreKey,
  restoreResultsViewport,
  shouldRestoreResultsViewport,
} from './resultsViewport';

describe('resultsViewport', () => {
  test('new and saved visible LET results produce restore keys', () => {
    const live = letResultsRestoreKey({
      report: { decisionJob: 'LET_INVEST' },
      loading: false,
      analysisId: 9001,
      historyView: false,
      subjectKey: '42',
    });
    const saved = letResultsRestoreKey({
      report: { decisionJob: 'LET_INVEST' },
      loading: false,
      analysisId: 77,
      historyView: true,
      subjectKey: '42',
    });
    expect(live).toBe('live::9001::42');
    expect(saved).toBe('saved::77::42');
    expect(live).not.toBe(saved);
  });

  test('loading, missing, or insufficient reports do not restore', () => {
    expect(letResultsRestoreKey({ report: { decisionJob: 'LET_INVEST' }, loading: true, analysisId: 1 })).toBeNull();
    expect(letResultsRestoreKey({ report: null, loading: false })).toBeNull();
    expect(letResultsRestoreKey({
      report: { insufficientData: true },
      loading: false,
      analysisId: 1,
    })).toBeNull();
  });

  test('ordinary rerenders keep the same key so restore happens once', () => {
    const base = {
      report: { decisionJob: 'LET_INVEST', analysisDate: '2026-09-21' },
      loading: false,
      analysisId: 9001,
      historyView: false,
      subjectKey: '42',
    };
    const first = letResultsRestoreKey(base);
    const again = letResultsRestoreKey({ ...base, report: { ...base.report, personalDecision: { score: 58 } } });
    expect(shouldRestoreResultsViewport(null, first)).toBe(true);
    expect(shouldRestoreResultsViewport(first, again)).toBe(false);
    expect(shouldRestoreResultsViewport(first, null)).toBe(false);
  });

  test('changing subject or analysis does not reuse an obsolete restore', () => {
    const first = letResultsRestoreKey({
      report: { decisionJob: 'LET_INVEST' },
      analysisId: 1,
      subjectKey: 'A',
    });
    const nextSubject = letResultsRestoreKey({
      report: { decisionJob: 'LET_INVEST' },
      analysisId: 1,
      subjectKey: 'B',
    });
    const nextAnalysis = letResultsRestoreKey({
      report: { decisionJob: 'LET_INVEST' },
      analysisId: 2,
      subjectKey: 'A',
    });
    expect(shouldRestoreResultsViewport(first, nextSubject)).toBe(true);
    expect(shouldRestoreResultsViewport(first, nextAnalysis)).toBe(true);
    expect(shouldRestoreResultsViewport(first, null)).toBe(false);
  });

  test('restore uses deterministic non-animated scrollIntoView', () => {
    const scrollIntoView = jest.fn();
    expect(restoreResultsViewport({ scrollIntoView })).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(restoreResultsViewport(null)).toBe(false);
  });
});
