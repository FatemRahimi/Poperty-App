/**
 * Display selectors for the one-property dossier.
 * Reads server objects only. Does not score, rank, or calculate finance.
 */

const CANONICAL_RENT_PHRASE = Object.freeze({
  ACHIEVED_RENT: 'Achieved rent',
  LISTING_ASKING_RENT: 'Listing asking rent, not achieved rent',
  AREA_ASKING_RENT_ESTIMATE: 'Area asking-rent estimate, not this property’s achieved rent and not its confirmed asking rent',
  USER_SCENARIO_RENT: 'Your rent assumption, not achieved rent',
  UNKNOWN: 'Rent basis unknown',
});

const KIND_TO_CANONICAL = Object.freeze({
  MARKET: 'AREA_ASKING_RENT_ESTIMATE',
  LISTING: 'LISTING_ASKING_RENT',
  SCENARIO: 'USER_SCENARIO_RENT',
  NONE: 'UNKNOWN',
});

const EVIDENCE_LABELS = Object.freeze({
  identity: 'Property identity',
  askingPrice: 'Asking price',
  valuationSupport: 'Valuation support',
  soldComparableSupport: 'Sold comparables',
  deposit: 'Deposit',
  ltv: 'Loan to value',
  affordability: 'Affordability',
  cashToComplete: 'Cash to complete',
  ongoingHousingCost: 'Ongoing housing cost',
  tenure: 'Tenure',
  leaseYearsRemaining: 'Remaining lease',
  serviceCharge: 'Service charge',
  groundRent: 'Ground rent',
});

const MATERIAL_EVIDENCE_KEYS = Object.freeze([
  'identity',
  'askingPrice',
  'valuationSupport',
  'soldComparableSupport',
  'deposit',
  'ltv',
  'affordability',
  'cashToComplete',
  'ongoingHousingCost',
  'tenure',
  'leaseYearsRemaining',
  'serviceCharge',
  'groundRent',
]);

const MONEY_KEYS = new Set(['askingPrice', 'deposit', 'serviceCharge', 'groundRent']);

export function purchaseConclusionText(buyDecision) {
  const recommendation = buyDecision?.buyRecommendation;
  if (recommendation == null || recommendation === '') {
    return 'Purchase conclusion not available yet';
  }
  return String(recommendation);
}

export function rentBasisPresentation(rentBasis) {
  if (!rentBasis || typeof rentBasis !== 'object') return null;
  const code = Object.prototype.hasOwnProperty.call(CANONICAL_RENT_PHRASE, rentBasis.canonicalBasis)
    ? rentBasis.canonicalBasis
    : (KIND_TO_CANONICAL[rentBasis.kind] || null);
  const limitation = typeof rentBasis.limitation === 'string' && rentBasis.limitation.trim()
    ? rentBasis.limitation.trim()
    : null;
  if (!code && !limitation && !rentBasis.kind) return null;
  return {
    code,
    phrase: code ? CANONICAL_RENT_PHRASE[code] : null,
    limitation,
    kind: rentBasis.kind || null,
  };
}

export function yieldBasisText(rentBasis) {
  const view = rentBasisPresentation(rentBasis);
  if (!view) return null;
  if (view.code && view.phrase) {
    return view.limitation && view.limitation !== view.phrase
      ? `${view.code}: ${view.phrase}. ${view.limitation}`
      : `${view.code}: ${view.phrase}`;
  }
  return view.limitation;
}

function evidenceState(field) {
  if (!field || typeof field !== 'object') return 'UNKNOWN';
  if (field.state) return field.state;
  if (field.available === true) return 'KNOWN';
  if (field.assessed === true && field.value != null) return 'KNOWN';
  return 'UNKNOWN';
}

function humanState(state) {
  if (state === 'KNOWN') return 'Known';
  if (state === 'UNKNOWN') return 'Unknown';
  if (state === 'NOT_APPLICABLE') return 'Not applicable';
  if (state === 'CONFLICTED') return 'Conflicting evidence';
  if (state === 'NOT_ASSESSED') return 'Not assessed';
  return 'Not assessed';
}

function knownDisplay(key, field) {
  if (key === 'leaseYearsRemaining') return `${field.value} years`;
  if (MONEY_KEYS.has(key) && field.value != null && Number.isFinite(Number(field.value))) {
    return `£${Number(field.value).toLocaleString('en-GB')}`;
  }
  if (key === 'ltv' && field.value != null && Number.isFinite(Number(field.value))) {
    return `${field.value}%`;
  }
  if (key === 'identity') {
    return field.value?.uprn
      ? 'UPRN recorded. A UPRN is not a title.'
      : 'Identity recorded';
  }
  if (field.value != null && (typeof field.value === 'string' || typeof field.value === 'number')) {
    return String(field.value);
  }
  return 'Known';
}

function evidenceRow(key, field) {
  const state = evidenceState(field);
  const value = state === 'KNOWN' ? knownDisplay(key, field) : humanState(state);
  return {
    id: key,
    label: EVIDENCE_LABELS[key] || key,
    state,
    value,
  };
}

export function buyEvidenceRows(buyDecision) {
  const evidence = buyDecision?.evidence;
  if (!evidence || typeof evidence !== 'object') return [];
  return MATERIAL_EVIDENCE_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(evidence, key))
    .map((key) => evidenceRow(key, evidence[key]));
}

export function decisionRelevantPriorities(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && (item.title || item.explanation))
    .filter((item) => item.importance === 'decision_relevant' || item.importance == null)
    .map((item) => ({
      id: item.id || item.title,
      title: item.title || 'Needs investigation',
      explanation: item.explanation || '',
    }));
}

export function contextPriorities(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.importance === 'worth_reviewing' && (item.title || item.explanation))
    .map((item) => ({
      id: item.id || item.title,
      title: item.title,
      explanation: item.explanation || '',
    }));
}

export function buyContextLines(buyDecision) {
  const lines = contextPriorities(buyDecision?.investigationPriorities).map((item) => ({
    id: item.id,
    text: item.explanation ? `${item.title}. ${item.explanation}` : item.title,
  }));
  const schools = buyDecision?.evidence?.schools;
  if (schools) {
    const count = Number.isFinite(Number(schools.nearbyCount)) ? Number(schools.nearbyCount) : null;
    lines.push({
      id: 'schools',
      text: count != null
        ? `Nearby schools recorded: ${count}. Admission, catchment eligibility, and school quality are not assessed.`
        : 'Schools were not assessed. Admission, catchment eligibility, and school quality are not assessed.',
    });
  }
  const area = buyDecision?.areaMarketContext;
  if (area) {
    const sales = area.salesDemand?.available && area.salesDemand?.band
      ? `Area sales-market label: ${area.salesDemand.band}. `
      : '';
    const rental = area.rentalDemand?.available && area.rentalDemand?.band
      ? `Area rental-market label: ${area.rentalDemand.band}. `
      : '';
    lines.push({
      id: 'area-market',
      text: `${sales}${rental}Area market context only. It is not demand for this home, and it is not a chance of selling or letting.`.trim(),
    });
  }
  return lines;
}

export function buyDossierView(buyDecision) {
  const rows = buyEvidenceRows(buyDecision);
  return {
    conclusion: purchaseConclusionText(buyDecision),
    applicable: buyDecision?.applicable !== false,
    known: rows.filter((row) => row.state === 'KNOWN'),
    unknown: rows.filter((row) => row.state === 'UNKNOWN' || row.state === 'CONFLICTED'),
    notApplicable: rows.filter((row) => row.state === 'NOT_APPLICABLE'),
    investigation: decisionRelevantPriorities(buyDecision?.investigationPriorities),
    context: buyContextLines(buyDecision),
    preferenceNote: buyDecision?.preferenceFit?.note || null,
  };
}
