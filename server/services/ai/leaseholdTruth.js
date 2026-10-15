/**
 * Leasehold evidence states. Missing service charge and ground rent stay
 * UNKNOWN, never zero. No mortgageability threshold is applied.
 */

const EVIDENCE_STATE = Object.freeze({
  KNOWN: 'KNOWN',
  UNKNOWN: 'UNKNOWN',
  CONFLICTED: 'CONFLICTED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

function conflicted(propertyFacts, fields) {
  const names = new Set(fields);
  return (propertyFacts?.conflicts || []).some((row) => names.has(row.field));
}

function classifyTenure(propertyFacts) {
  const fact = propertyFacts?.facts?.tenure;
  if (conflicted(propertyFacts, ['tenure', 'legalTenure'])) {
    return {
      state: EVIDENCE_STATE.CONFLICTED,
      value: fact?.value ?? null,
      kind: null,
      applicableLeasehold: false,
    };
  }
  if (!fact?.available || fact.value == null || String(fact.value).trim() === '') {
    return {
      state: EVIDENCE_STATE.UNKNOWN,
      value: null,
      kind: null,
      applicableLeasehold: false,
    };
  }
  const text = String(fact.value).toLowerCase();
  if (text.includes('leasehold')) {
    return { state: EVIDENCE_STATE.KNOWN, value: fact.value, kind: 'leasehold', applicableLeasehold: true };
  }
  if (text.includes('freehold')) {
    return { state: EVIDENCE_STATE.KNOWN, value: fact.value, kind: 'freehold', applicableLeasehold: false };
  }
  return { state: EVIDENCE_STATE.KNOWN, value: fact.value, kind: 'other', applicableLeasehold: false };
}

function numericFactState(fact, { applicable, conflict }) {
  if (!applicable) {
    return { state: EVIDENCE_STATE.NOT_APPLICABLE, value: null, zeroIsNotUnknown: true };
  }
  if (conflict || fact?.trust === 'conflictingEvidence' || fact?.state === 'conflictingEvidence') {
    return { state: EVIDENCE_STATE.CONFLICTED, value: fact?.value ?? null };
  }
  if (fact?.available && fact.value != null && fact.value !== '' && Number.isFinite(Number(fact.value))) {
    return {
      state: EVIDENCE_STATE.KNOWN,
      value: Number(fact.value),
      explicitZero: Number(fact.value) === 0,
    };
  }
  return { state: EVIDENCE_STATE.UNKNOWN, value: null, explicitZero: false };
}

function leaseholdEvidence(propertyFacts) {
  const tenure = classifyTenure(propertyFacts);
  const applicable = tenure.applicableLeasehold;
  const yearsFact = propertyFacts?.implications?.leaseRemaining || propertyFacts?.facts?.leaseRemaining;
  const serviceFact = propertyFacts?.facts?.serviceCharge;
  const groundFact = propertyFacts?.facts?.groundRent;
  return {
    tenure,
    leaseYearsRemaining: numericFactState(yearsFact, {
      applicable,
      conflict: conflicted(propertyFacts, ['leaseYearsRemaining', 'leaseRemaining', 'lease_years_remaining']),
    }),
    serviceCharge: numericFactState(serviceFact, {
      applicable,
      conflict: conflicted(propertyFacts, ['serviceCharge', 'service_charge']),
    }),
    groundRent: numericFactState(groundFact, {
      applicable,
      conflict: conflicted(propertyFacts, ['groundRent', 'ground_rent']),
    }),
    mortgageabilityAssessed: false,
    notAMortgageabilityDecision: true,
  };
}

module.exports = {
  EVIDENCE_STATE,
  classifyTenure,
  leaseholdEvidence,
};
