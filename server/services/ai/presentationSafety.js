/**
 * Presentation gates. Financial formulas are not modified here.
 * Defaulted price growth is withheld. Scenario blocks are labelled assumptions.
 */

function suppliedSource(row) {
  if (!row) return false;
  return row.source === 'user_supplied' || row.source === 'property_data' || row.source === 'provider';
}

function withholdDefaultedGrowth(metrics) {
  if (!metrics || typeof metrics !== 'object') return metrics;
  const assumptions = metrics.assumptionCoverage?.assumptions || {};
  const appreciationSupplied = suppliedSource(assumptions.expectedAppreciation);
  const holdingSupplied = suppliedSource(assumptions.holdingPeriod);
  if (appreciationSupplied && holdingSupplied) {
    return {
      ...metrics,
      growthEvidence: {
        presented: true,
        evidenceClass: 'ASSUMPTION',
        notFact: true,
        reason: 'Appreciation and holding period were supplied. The resulting future value is a scenario assumption, not an observed fact.',
      },
    };
  }
  return {
    ...metrics,
    futureValue: null,
    equityGain: null,
    totalCashFlow: null,
    equityMultiple: null,
    growthEvidence: {
      presented: false,
      state: 'not_evidence',
      evidenceClass: 'ASSUMPTION',
      notFact: true,
      reason: 'Price growth is not decision evidence because appreciation or holding period was not supplied. Defaults of 0% and 5 years are not facts.',
    },
  };
}

function labelScenarioBlock(scenarios) {
  if (!scenarios || typeof scenarios !== 'object') return scenarios;
  if (scenarios.available === false) {
    return { ...scenarios, evidenceClass: 'UNKNOWN', notFact: true };
  }
  const labelled = { ...scenarios, evidenceClass: 'SCENARIO', notFact: true, notObservedEvidence: true };
  ['conservative', 'base', 'optimistic'].forEach((key) => {
    if (labelled[key] && typeof labelled[key] === 'object') {
      labelled[key] = {
        ...labelled[key],
        evidenceClass: 'SCENARIO',
        notFact: true,
      };
    }
  });
  return labelled;
}

function withholdScenarioGrowth(row, { appreciationSupplied, holdingSupplied }) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row, evidenceClass: 'SCENARIO', notFact: true };
  if (!appreciationSupplied || !holdingSupplied) {
    next.futureValue = null;
    next.equityGain = null;
    next.futureValueWithheld = {
      presented: false,
      evidenceClass: 'ASSUMPTION',
      reason: 'Future value is withheld because appreciation or holding period was not supplied.',
    };
  }
  return next;
}

module.exports = {
  withholdDefaultedGrowth,
  labelScenarioBlock,
  withholdScenarioGrowth,
};
