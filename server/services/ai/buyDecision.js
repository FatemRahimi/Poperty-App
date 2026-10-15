/**
 * Canonical BUY decision object.
 * Preference fit stays on buyer_general. This object is not a recommendation.
 */

const { calculateSafeLtv } = require('./safeLtv');
const { leaseholdEvidence, EVIDENCE_STATE } = require('./leaseholdTruth');
const { buildAreaMarketContext } = require('./areaMarketContext');

const ENGINE = 'buyDecision';
const VERSION = 'buy-decision-1.0.0';

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

function comparableSupport(comparableSoldEvidence) {
  if (comparableSoldEvidence?.available === true || comparableSoldEvidence?.sufficient === true) {
    return { state: 'KNOWN', assessed: true, role: 'sold_evidence' };
  }
  if (comparableSoldEvidence && comparableSoldEvidence.state && comparableSoldEvidence.state !== 'notAssessed') {
    return {
      state: 'KNOWN',
      assessed: true,
      role: comparableSoldEvidence.role || 'context',
      value: comparableSoldEvidence.state,
    };
  }
  return unknown('Defensible sold-comparable support is not assessed.');
}

function investigation(id, title, explanation) {
  return {
    id,
    type: 'investigation_priority',
    importance: 'decision_relevant',
    state: 'UNKNOWN',
    title,
    explanation,
    notARecommendation: true,
  };
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

  const priorities = [
    investigation(
      'affordability_evidence_incomplete',
      'Affordability evidence incomplete',
      'Income, commitments, and expenditure were not assessed. Budget-versus-price preference fit is not affordability and is not a reason to buy.'
    ),
    ltv.available ? null : investigation(
      'deposit_unknown',
      'Deposit unknown',
      'Deposit was not supplied, so LTV and cash toward the purchase are not assessed. Budget is not used as a deposit.'
    ),
    investigation(
      'ongoing_housing_cost_unknown',
      'Ongoing housing cost unknown',
      'Mortgage payment, service charge, ground rent, and council tax have not been combined into an occupancy cost. Missing costs are not zero.'
    ),
    valuation.assessed ? null : investigation(
      'valuation_support_unavailable',
      'Valuation support unavailable',
      'Asking price is not treated as a supported value until a defensible valuation or price position exists.'
    ),
    lease.tenure.applicableLeasehold && lease.leaseYearsRemaining.state === EVIDENCE_STATE.UNKNOWN
      ? investigation(
        'lease_years_unknown',
        'Lease years remaining unknown',
        'Tenure is leasehold and remaining term was not evidenced. This is an investigation item. No lender rule is applied.'
      )
      : null,
    lease.tenure.applicableLeasehold && lease.serviceCharge.state === EVIDENCE_STATE.UNKNOWN
      ? investigation(
        'service_charge_unknown',
        'Service charge unknown',
        'Leasehold service charge was not evidenced. Unknown is not £0.'
      )
      : null,
    lease.tenure.applicableLeasehold && lease.groundRent.state === EVIDENCE_STATE.UNKNOWN
      ? investigation(
        'ground_rent_unknown',
        'Ground rent unknown',
        'Leasehold ground rent was not evidenced. Unknown is not £0.'
      )
      : null,
  ].filter(Boolean);

  const environmentUnresolved = ['flood', 'planning', 'listedBuilding', 'conservationArea', 'article4']
    .filter((key) => !factKnown(propertyFacts?.facts?.[key]));
  if (environmentUnresolved.length) {
    priorities.push({
      ...investigation(
        'environment_evidence_unresolved',
        'Property or environment evidence unresolved',
        `These context facts are not assessed: ${environmentUnresolved.join(', ')}. Unknown is not a clearance.`
      ),
      importance: 'worth_reviewing',
    });
  }

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
    evidence: {
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
    },
    areaMarketContext: buildAreaMarketContext({ areaMarketDemand, areaRentalDemand }),
    materialUnknowns: priorities.map((row) => row.id),
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
  assembleBuyDecision,
  buyDecisionNotApplicable,
};
