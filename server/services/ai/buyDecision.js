/**
 * Canonical BUY decision object.
 * Preference fit stays on buyer_general. This object is not a recommendation.
 */

const { calculateSafeLtv } = require('./safeLtv');
const { leaseholdEvidence } = require('./leaseholdTruth');
const { buildAreaMarketContext } = require('./areaMarketContext');

const ENGINE = 'buyDecision';
const VERSION = 'buy-decision-1.1.0';

const IMPORTANCE = Object.freeze({
  decisionCritical: 'decision_critical',
  decisionRelevant: 'decision_relevant',
  worthReviewing: 'worth_reviewing',
});

const RESOLUTION = Object.freeze({
  automaticExistingData: 'automatic_existing_data',
  userInputRequired: 'user_input_required',
  externalEvidenceRequired: 'external_evidence_required',
  notCurrentlySupported: 'not_currently_supported',
});

const INVESTIGATION_ORDER = Object.freeze([
  'identity_unresolved',
  'affordability_evidence_incomplete',
  'lease_years_unknown',
  'deposit_unknown',
  'service_charge_unknown',
  'ground_rent_unknown',
  'sold_comparable_market_context',
  'sold_comparable_support_unknown',
  'valuation_support_unavailable',
  'environment_evidence_unresolved',
]);

const IMPORTANCE_RANK = Object.freeze({
  decision_critical: 0,
  decision_relevant: 1,
  worth_reviewing: 2,
});

function unknown(reason) {
  return { state: 'UNKNOWN', assessed: false, value: null, reason };
}

function known(value, extra = {}) {
  return { state: 'KNOWN', assessed: true, value, ...extra };
}

function factKnown(fact) {
  return Boolean(fact && fact.available === true && fact.value != null && fact.value !== '');
}

function environmentState(fact) {
  if (!fact) return unknown('Not assessed.');
  if (fact.trust === 'conflictingEvidence' || fact.state === 'conflictingEvidence') {
    return { state: 'CONFLICTED', assessed: false, value: fact.value ?? null, role: 'context' };
  }
  if (fact.available === true) {
    return { state: 'KNOWN', assessed: true, value: fact.value ?? null, role: 'context', notAClearance: true };
  }
  return { state: 'UNKNOWN', assessed: false, value: null, role: 'context', notAClearance: true, reason: fact.note || fact.reason || 'Not assessed. Unknown is not clear.' };
}

function valuationSupport(pricePosition, saleValuation) {
  const positionAssessed = Boolean(
    pricePosition && (pricePosition.available === true || pricePosition.state === 'assessed') && pricePosition.value != null
  );
  const saleAssessed = Boolean(
    saleValuation && (saleValuation.available === true || saleValuation.success === true) && (
      saleValuation.estimatedValue != null || saleValuation.value != null || saleValuation.range
    )
  );
  if (positionAssessed || saleAssessed) {
    return {
      state: 'KNOWN',
      assessed: true,
      pricePosition: positionAssessed ? pricePosition.value : null,
      notNegotiationCertainty: true,
    };
  }
  return unknown('Valuation support is not assessed. Asking price is not itself a valuation.');
}

function soldPriceContext() {
  return {
    state: 'KNOWN',
    assessed: true,
    role: 'sold_price_context',
    evidenceClass: 'SOLD_PRICE_CONTEXT',
    value: 'Sold-price context',
    notAValuation: true,
    notSubjectValue: true,
    notExactUnitTransactions: true,
    notABuyRecommendation: true,
    cohort: 'same_postcode_type_recent',
    limitation: 'Same-postcode official sales are price context. They are not this home\'s value, not a valuation, and not a recommendation to buy.',
  };
}

function marketSoldContext() {
  return {
    state: 'CONTEXT',
    assessed: false,
    role: 'market_context',
    evidenceClass: 'MARKET_CONTEXT',
    value: null,
    notAValuation: true,
    notSubjectValue: true,
    notPropertyEvidence: true,
    notABuyRecommendation: true,
    limitation: 'Local sold transactions are market context. A large transaction count does not make them evidence for this home.',
  };
}

function comparableSupport(comparableSoldEvidence) {
  if (!comparableSoldEvidence || typeof comparableSoldEvidence !== 'object') {
    return unknown('Defensible sold-comparable support is not assessed.');
  }
  const assessment = comparableSoldEvidence.assessment;
  if (assessment === 'ASSESSED') return soldPriceContext();
  if (assessment === 'MARKET_CONTEXT') return marketSoldContext();
  if (assessment === 'NOT_APPLICABLE') {
    return {
      state: 'NOT_APPLICABLE',
      assessed: false,
      value: null,
      evidenceClass: 'NOT_APPLICABLE',
      reason: 'Official comparable assessment does not apply to this subject.',
    };
  }
  if (assessment) {
    return unknown('Official sold-comparable support is not sufficient. No typical price is used.');
  }
  if (comparableSoldEvidence.available === true || comparableSoldEvidence.sufficient === true) {
    return soldPriceContext();
  }
  if (comparableSoldEvidence.state && comparableSoldEvidence.state !== 'notAssessed') {
    return {
      state: 'KNOWN',
      assessed: true,
      role: comparableSoldEvidence.role || 'context',
      value: comparableSoldEvidence.state,
    };
  }
  return unknown('Defensible sold-comparable support is not assessed.');
}

function investigationItem({
  id,
  evidenceKey,
  state,
  importance,
  title,
  explanation,
  whatNext,
  resolution,
}) {
  return {
    id,
    type: 'investigation_priority',
    evidenceKey,
    state,
    importance,
    title,
    explanation,
    whatNext,
    resolution,
    notARecommendation: true,
  };
}

function needsInvestigation(field) {
  return Boolean(field && (field.state === 'UNKNOWN' || field.state === 'CONFLICTED'));
}

function soldPriceContextKnown(field) {
  return Boolean(
    field
    && field.state === 'KNOWN'
    && (field.evidenceClass === 'SOLD_PRICE_CONTEXT' || field.role === 'sold_price_context')
  );
}

function deriveBuyInvestigation(evidence) {
  const items = [];
  if (needsInvestigation(evidence?.identity)) {
    items.push(investigationItem({
      id: 'identity_unresolved',
      evidenceKey: 'identity',
      state: evidence.identity.state,
      importance: IMPORTANCE.decisionCritical,
      title: 'Property identity unresolved',
      explanation: 'This decision is about one dwelling. Without a canonical listing identity or UPRN, later evidence cannot be tied to this home. A UPRN is not a title.',
      whatNext: 'Record the canonical listing or a unique UPRN. This analysis has not established which dwelling the other evidence belongs to.',
      resolution: RESOLUTION.externalEvidenceRequired,
    }));
  }
  if (needsInvestigation(evidence?.affordability)) {
    items.push(investigationItem({
      id: 'affordability_evidence_incomplete',
      evidenceKey: 'affordability',
      state: evidence.affordability.state,
      importance: IMPORTANCE.decisionCritical,
      title: 'Affordability evidence incomplete',
      explanation: 'Income, commitments, and expenditure were not supplied. Budget-versus-price preference fit is not affordability and is not a reason to buy.',
      whatNext: 'Supply income, commitments, and expenditure. They are not read from the listing and they are not inferred.',
      resolution: RESOLUTION.userInputRequired,
    }));
  }
  if (needsInvestigation(evidence?.leaseYearsRemaining)) {
    items.push(investigationItem({
      id: 'lease_years_unknown',
      evidenceKey: 'leaseYearsRemaining',
      state: evidence.leaseYearsRemaining.state,
      importance: IMPORTANCE.decisionCritical,
      title: 'Lease length unknown',
      explanation: 'Tenure is leasehold and the remaining term was not evidenced. Lease length can change ownership risk. No lender rule is applied.',
      whatNext: 'Obtain the remaining term from the lease or title. This analysis has not retrieved it.',
      resolution: RESOLUTION.externalEvidenceRequired,
    }));
  }
  if (needsInvestigation(evidence?.deposit)) {
    items.push(investigationItem({
      id: 'deposit_unknown',
      evidenceKey: 'deposit',
      state: evidence.deposit.state,
      importance: IMPORTANCE.decisionRelevant,
      title: 'Deposit unknown',
      explanation: 'Deposit was not supplied, so loan-to-value is not assessed. A budget is not a deposit. An unknown deposit is not zero.',
      whatNext: 'Supply the deposit for this purchase. It is not taken from the asking price or from a budget.',
      resolution: RESOLUTION.userInputRequired,
    }));
  }
  if (needsInvestigation(evidence?.serviceCharge)) {
    items.push(investigationItem({
      id: 'service_charge_unknown',
      evidenceKey: 'serviceCharge',
      state: evidence.serviceCharge.state,
      importance: IMPORTANCE.decisionRelevant,
      title: 'Service charge unknown',
      explanation: 'Leasehold service charge was not evidenced. Unknown is not zero, and a missing charge is not a saving.',
      whatNext: 'Obtain the service charge for this leasehold. This analysis has not retrieved it.',
      resolution: RESOLUTION.externalEvidenceRequired,
    }));
  }
  if (needsInvestigation(evidence?.groundRent)) {
    items.push(investigationItem({
      id: 'ground_rent_unknown',
      evidenceKey: 'groundRent',
      state: evidence.groundRent.state,
      importance: IMPORTANCE.decisionRelevant,
      title: 'Ground rent unknown',
      explanation: 'Leasehold ground rent was not evidenced. Unknown is not zero.',
      whatNext: 'Obtain the ground rent for this leasehold. This analysis has not retrieved it.',
      resolution: RESOLUTION.externalEvidenceRequired,
    }));
  }
  const sold = evidence?.soldComparableSupport;
  if (sold && (sold.evidenceClass === 'MARKET_CONTEXT' || sold.state === 'CONTEXT')) {
    items.push(investigationItem({
      id: 'sold_comparable_market_context',
      evidenceKey: 'soldComparableSupport',
      state: 'CONTEXT',
      importance: IMPORTANCE.decisionRelevant,
      title: 'Sold sales are market context only',
      explanation: sold.limitation || 'Local sold transactions are market context. A large transaction count does not make them evidence for this home.',
      whatNext: 'Keep these sales as local market context. They are not this home\'s value, and this analysis does not turn them into a valuation.',
      resolution: RESOLUTION.notCurrentlySupported,
    }));
  } else if (!soldPriceContextKnown(sold) && sold?.state !== 'NOT_APPLICABLE' && needsInvestigation(sold || { state: 'UNKNOWN' })) {
    items.push(investigationItem({
      id: 'sold_comparable_support_unknown',
      evidenceKey: 'soldComparableSupport',
      state: sold?.state || 'UNKNOWN',
      importance: IMPORTANCE.decisionRelevant,
      title: 'Sold-comparable support not established',
      explanation: 'Official sold-comparable support is not sufficient for this home. No typical price is used.',
      whatNext: 'Do not substitute a postcode average or a valuation. This analysis does not create a value for this home from missing sold evidence.',
      resolution: RESOLUTION.notCurrentlySupported,
    }));
  }
  if (needsInvestigation(evidence?.valuationSupport)) {
    items.push(investigationItem({
      id: 'valuation_support_unavailable',
      evidenceKey: 'valuationSupport',
      state: evidence.valuationSupport.state,
      importance: IMPORTANCE.decisionRelevant,
      title: 'Valuation support unavailable',
      explanation: 'Asking price is not a supported value. No valuation has been assessed for this home.',
      whatNext: 'Do not treat the asking price as a valuation. This analysis does not produce one.',
      resolution: RESOLUTION.notCurrentlySupported,
    }));
  }
  const environment = evidence?.environment || {};
  const environmentUnresolved = ['flood', 'planning', 'listedBuilding', 'conservationArea', 'article4']
    .filter((key) => needsInvestigation(environment[key]));
  if (environmentUnresolved.length) {
    items.push(investigationItem({
      id: 'environment_evidence_unresolved',
      evidenceKey: 'environment',
      state: environmentUnresolved.some((key) => environment[key].state === 'CONFLICTED') && environmentUnresolved.every((key) => environment[key].state === 'CONFLICTED')
        ? 'CONFLICTED'
        : 'UNKNOWN',
      importance: IMPORTANCE.worthReviewing,
      title: 'Property or environment evidence unresolved',
      explanation: `These context facts are not assessed: ${environmentUnresolved.join(', ')}. Unknown is not a clearance.`,
      whatNext: 'Missing environment context stays unknown. This analysis does not turn it into a clearance.',
      resolution: RESOLUTION.notCurrentlySupported,
    }));
  }
  return items.slice().sort((a, b) => {
    const byImportance = (IMPORTANCE_RANK[a.importance] ?? 9) - (IMPORTANCE_RANK[b.importance] ?? 9);
    if (byImportance !== 0) return byImportance;
    const left = INVESTIGATION_ORDER.indexOf(a.id);
    const right = INVESTIGATION_ORDER.indexOf(b.id);
    return (left === -1 ? INVESTIGATION_ORDER.length : left) - (right === -1 ? INVESTIGATION_ORDER.length : right);
  });
}

function assembleBuyDecision({
  propertyFacts = null,
  personalDecision = null,
  pricePosition = null,
  saleValuation = null,
  comparableSoldEvidence = null,
  purchasePrice = null,
  deposit = null,
  areaMarketDemand = null,
  areaRentalDemand = null,
  evidenceAsOf = null,
} = {}) {
  const lease = leaseholdEvidence(propertyFacts);
  const ltv = calculateSafeLtv({ purchasePrice, deposit });
  const identityKnown = Boolean(
    propertyFacts?.identity?.listingId?.value || propertyFacts?.identity?.uprn?.value
  );
  const asking = propertyFacts?.facts?.askingPrice;
  const schools = propertyFacts?.facts?.schools;
  const valuation = valuationSupport(pricePosition, saleValuation);
  const comparables = comparableSupport(comparableSoldEvidence);
  const evidence = {
    identity: identityKnown
      ? known({
        listingId: propertyFacts?.identity?.listingId?.value ?? null,
        uprn: propertyFacts?.identity?.uprn?.value ?? null,
        uprnIsNotVerifiedTitle: true,
      })
      : unknown('Canonical listing or UPRN identity was not available.'),
    askingPrice: factKnown(asking)
      ? known(asking.value, { evidenceClass: 'asking', notAValuation: true })
      : unknown('Asking or purchase price was not evidenced.'),
    valuationSupport: valuation,
    soldComparableSupport: comparables,
    deposit: ltv.deposit != null && explicitlyKnownDeposit(deposit)
      ? known(ltv.deposit, { provenance: ltv.provenance.deposit })
      : unknown('Deposit was not supplied.'),
    ltv,
    affordability: unknown('Income, commitments, and expenditure were not assessed. Missing affordability evidence is not a positive fit.'),
    cashToComplete: unknown('Transaction costs are not calculated. A supplied deposit does not make cash to complete known.'),
    ongoingHousingCost: unknown('Ongoing housing cost is not assessed. Missing mortgage, service charge, ground rent, or council tax inputs are not zero.'),
    tenure: lease.tenure,
    leaseYearsRemaining: lease.leaseYearsRemaining,
    serviceCharge: lease.serviceCharge,
    groundRent: lease.groundRent,
    schools: {
      role: 'context',
      state: schools?.available ? 'KNOWN' : 'UNKNOWN',
      nearbyCount: Array.isArray(schools?.nearbySchools) ? schools.nearbySchools.length : null,
      catchment: 'NOT_ASSESSED',
      admission: 'NOT_ASSESSED',
      quality: 'NOT_ASSESSED',
      notAScore: true,
    },
    environment: {
      flood: environmentState(propertyFacts?.facts?.flood),
      planning: environmentState(propertyFacts?.facts?.planning),
      listedBuilding: environmentState(propertyFacts?.facts?.listedBuilding),
      conservationArea: environmentState(propertyFacts?.facts?.conservationArea),
      article4: environmentState(propertyFacts?.facts?.article4),
    },
  };
  const priorities = deriveBuyInvestigation(evidence);

  return {
    engine: ENGINE,
    version: VERSION,
    applicable: true,
    notARecommendation: true,
    notPurchaseAdvice: true,
    buyRecommendation: null,
    evidenceAsOf,
    preferenceFit: {
      role: 'preference_fit',
      notABuyRecommendation: true,
      profile: personalDecision?.profile || 'buyer_general',
      score: personalDecision?.available ? personalDecision.score : null,
      outcome: personalDecision?.outcome || null,
      note: 'Preference fit compares the listing with stated living preferences. It is not a recommendation to buy and it is not income affordability.',
    },
    evidence,
    areaMarketContext: buildAreaMarketContext({ areaMarketDemand, areaRentalDemand }),
    materialUnknowns: priorities
      .filter((row) => row.state === 'UNKNOWN' || row.state === 'CONFLICTED')
      .map((row) => row.id),
    investigationPriorities: priorities,
  };
}

function explicitlyKnownDeposit(deposit) {
  if (deposit == null || deposit === '') return false;
  if (typeof deposit === 'object') {
    if (deposit.supplied === false || deposit.available === false) return false;
    return deposit.value != null && deposit.value !== '';
  }
  return Number.isFinite(Number(deposit));
}

function buyDecisionNotApplicable(reason) {
  return {
    engine: ENGINE,
    version: VERSION,
    applicable: false,
    state: 'notApplicable',
    notARecommendation: true,
    notPurchaseAdvice: true,
    buyRecommendation: null,
    note: reason || 'BUY decision evidence is not applicable to this decision job.',
  };
}

module.exports = {
  ENGINE,
  VERSION,
  IMPORTANCE,
  RESOLUTION,
  assembleBuyDecision,
  buyDecisionNotApplicable,
};
