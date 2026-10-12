/**
 * Residential decision workspace adapter.
 * Presentation only. Does not score, value, or change frozen methodology.
 */

const { KERNEL_ASSESSMENT, mapExistingAssessment } = require('../../architecture/assessmentStates');
const { DECISION_JOB } = require('../../architecture/decisionContextContract');
const {
  buildMissingUnderwritingInputs,
  metricResolutionHint,
  ROOT_CAUSE,
} = require('./underwritingInputCompletion');
const {
  mergeInternalAreaGap,
  applyListingAttributeHints,
} = require('./internalAreaEvidenceGap');
const { mergeSubjectAttributeGaps } = require('./subjectPropertyAttributeGap');

function assessmentFromField(field) {
  if (!field || typeof field !== 'object') {
    return { state: KERNEL_ASSESSMENT.NOT_ASSESSED, available: false };
  }
  const state = mapExistingAssessment(field);
  return {
    state,
    available: state === KERNEL_ASSESSMENT.ASSESSED,
    reason: field.reason || field.message || field.unavailableReason || field.note || null,
  };
}

function item({ id, label, field, whyItMatters, howToResolve, kind = 'metric' }) {
  const assessment = assessmentFromField(field);
  return {
    id,
    label,
    kind,
    state: assessment.state,
    available: assessment.available,
    value: assessment.available ? (field.value ?? field.centralEstimate ?? field.score ?? null) : null,
    display: field,
    whyItMatters: whyItMatters || null,
    howToResolve: assessment.available ? null : (howToResolve || assessment.reason),
  };
}

function formatSoldRangeValue(range, median) {
  if (!range) return null;
  let value = `£${Number(range.lowGbp).toLocaleString()}–£${Number(range.highGbp).toLocaleString()}`;
  if (median?.valueGbp != null) {
    value += ` (median £${Number(median.valueGbp).toLocaleString()})`;
  }
  return value;
}

/**
 * MARKET_CONTEXT sold £ figures must not occupy Key Intelligence with assessed styling.
 * They belong in supporting context only.
 */
function localSoldTransactionContextItem(evidence) {
  if (!evidence || evidence.assessment !== 'MARKET_CONTEXT') return null;

  const localRange = evidence.observedLocalTransactionRange || evidence.observedSoldPriceRange || null;
  const localMedian = evidence.observedLocalMedian || evidence.observedMedian || null;
  const value = formatSoldRangeValue(localRange, localMedian);

  return {
    id: 'local_sold_transaction_context',
    label: 'Local sold transaction context',
    kind: 'marketTransactionContext',
    presentationRole: 'supporting_context',
    state: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
    // Has figures to show as orientation — never treated as assessed key intelligence.
    available: Boolean(value),
    value,
    display: evidence,
    whyItMatters:
      'Broader relevant official sold transactions for orientation only. Defensible comparable sufficiency was not met. Not subject value and not asking-price judgement.',
    howToResolve: evidence.unresolvedDependencies?.[0]?.why
      || evidence.message
      || 'More same-postcode recent sales of the same type are needed for comparable assessment.',
    whatNext: evidence.investigationPriorities?.[0]?.whatNext
      || 'Use as supporting market orientation only; do not treat as comparable sold evidence or a valuation.',
    notValuation: true,
    notDefensibleComparable: true,
    notAskingPriceJudgement: true,
    comparableCount: evidence.defensibleComparableCount || 0,
    relevantMarketTransactionCount: evidence.relevantMarketTransactionCount || 0,
  };
}

function comparableSoldEvidenceItem(evidence) {
  if (!evidence) {
    return {
      id: 'comparable_sold_evidence',
      label: 'Comparable sold evidence',
      kind: 'comparableSoldEvidence',
      state: KERNEL_ASSESSMENT.NOT_ASSESSED,
      available: false,
      value: null,
      display: null,
      whyItMatters: 'Official completed sales provide price context without claiming a valuation.',
      howToResolve: 'Comparable sold evidence was not attached to this analysis.',
    };
  }

  const defensible = evidence.assessment === 'ASSESSED';
  const marketOnly = evidence.assessment === 'MARKET_CONTEXT';
  const comparableRange = evidence.observedComparableRange || (defensible ? evidence.observedSoldPriceRange : null);
  const comparableMedian = evidence.observedComparableMedian || (defensible ? evidence.observedMedian : null);

  if (defensible) {
    return {
      id: 'comparable_sold_evidence',
      label: 'Comparable sold evidence',
      kind: 'comparableSoldEvidence',
      state: KERNEL_ASSESSMENT.ASSESSED,
      available: true,
      value: formatSoldRangeValue(comparableRange, comparableMedian),
      display: evidence,
      whyItMatters:
        'Observed sold prices of a defensible same-postcode HIGH-similarity official set — price context only, not a valuation or deal rating.',
      howToResolve: null,
      notValuation: true,
      comparableCount: evidence.defensibleComparableCount || evidence.comparableCount || 0,
    };
  }

  if (marketOnly) {
    // Key Intelligence: comparable assessment is insufficient — do not surface local £ range here.
    return {
      id: 'comparable_sold_evidence',
      label: 'Comparable sold evidence',
      kind: 'comparableSoldEvidence',
      state: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
      available: false,
      value: null,
      display: evidence,
      whyItMatters:
        'Defensible comparable sold evidence requires sufficient HIGH-similarity official sales. Local sold transaction context may appear under supporting evidence — it is not comparable assessment, subject value, or asking-price judgement.',
      howToResolve: evidence.unresolvedDependencies?.[0]?.why
        || evidence.message
        || 'More same-postcode recent sales of the same type are needed for comparable assessment.',
      whatNext: evidence.investigationPriorities?.[0]?.whatNext
        || 'Review supporting local sold transaction context for orientation only.',
      notValuation: true,
      notDefensibleComparable: true,
      notAskingPriceJudgement: true,
      comparableCount: evidence.defensibleComparableCount || 0,
      relevantMarketTransactionCount: evidence.relevantMarketTransactionCount || 0,
    };
  }

  return {
    id: 'comparable_sold_evidence',
    label: 'Comparable sold evidence',
    kind: 'comparableSoldEvidence',
    state: evidence.assessment === 'NOT_APPLICABLE'
      ? KERNEL_ASSESSMENT.NOT_APPLICABLE
      : KERNEL_ASSESSMENT.NOT_ASSESSED,
    available: false,
    value: null,
    display: evidence,
    whyItMatters:
      'Official completed sales can provide price context without claiming a valuation — only when comparability is defensible.',
    howToResolve: evidence.message
      || evidence.unresolvedDependencies?.[0]?.why
      || evidence.investigationPriorities?.[0]?.howToResolve
      || 'Insufficient official comparable sales after hard filters.',
    whatNext: evidence.investigationPriorities?.[0]?.whatNext || null,
    notValuation: true,
    comparableCount: evidence.defensibleComparableCount || evidence.comparableCount || 0,
  };
}

function buySellContextEvidence(report = {}) {
  const supportingMarket = localSoldTransactionContextItem(
    report?.marketIntelligence?.comparableSoldEvidence
  );
  return [
    ...(supportingMarket ? [supportingMarket] : []),
    ...collectContextEvidence(report),
  ];
}

function valuationItem(sale, report = null) {
  const assessed = Boolean(sale?.success) && sale?.notAssessed !== true && sale?.centralEstimate != null;
  const base = {
    id: 'valuation_range',
    label: 'Residential valuation range',
    kind: 'valuation',
    state: assessed ? KERNEL_ASSESSMENT.ASSESSED : KERNEL_ASSESSMENT.NOT_ASSESSED,
    available: assessed,
    value: assessed ? sale.centralEstimate : null,
    display: sale || { notAssessed: true },
    whyItMatters: 'A defensible range is required before price position can be assessed.',
    howToResolve: assessed ? null : (sale?.message || 'Valuation was not assessed from available evidence.'),
  };
  return report ? applyListingAttributeHints(base, report) : base;
}

function pricePositionItem(pricePosition, report = null) {
  const assessed = Boolean(pricePosition) && pricePosition.notAssessed !== true && pricePosition.success !== false;
  const base = {
    id: 'price_position',
    label: 'Asking-price position',
    kind: 'pricePosition',
    state: assessed ? KERNEL_ASSESSMENT.ASSESSED : KERNEL_ASSESSMENT.NOT_ASSESSED,
    available: assessed,
    value: assessed ? (pricePosition.position || pricePosition.label) : null,
    display: pricePosition || { notAssessed: true },
    whyItMatters: 'Compares asking price to the assessed valuation range. It is not a negotiation certainty.',
    howToResolve: assessed ? null : (pricePosition?.message || 'Price position is not assessed without a defensible valuation and asking price.'),
  };
  return report ? applyListingAttributeHints(base, report) : base;
}

function presentedMetric(investment, key, label, whyItMatters, howToResolve, report = null) {
  const field = investment?.presented?.[key] || investment?.[key] || null;
  const hint = report ? metricResolutionHint(key, report) : null;
  const resolutionCause = hint?.cause || null;
  const resolutionInputKeys = hint?.inputKeys || [];
  const resolvedHowTo = field?.reason || hint?.detail || howToResolve;
  return {
    ...item({
      id: key,
      label,
      field: field && typeof field === 'object' ? field : { available: false, reason: resolvedHowTo },
      whyItMatters,
      howToResolve: resolvedHowTo,
    }),
    resolutionCause,
    resolutionInputKeys,
    isUserInput: resolutionCause === ROOT_CAUSE.MISSING_USER_INPUT,
    isPlatformEvidence: resolutionCause === ROOT_CAUSE.MISSING_PLATFORM_EVIDENCE,
  };
}

function evidenceChip(id, label, fact, whyItMatters) {
  const available = Boolean(fact?.available);
  const state = available
    ? KERNEL_ASSESSMENT.ASSESSED
    : mapExistingAssessment(fact || { state: 'notAssessed' });
  return {
    id,
    label,
    kind: 'evidence',
    state,
    available,
    whyItMatters,
    howToResolve: available ? null : (fact?.reason || fact?.note || 'No assessed evidence from this source.'),
    display: fact || null,
  };
}

function collectContextEvidence(report = {}) {
  const facts = report.propertyFacts?.facts || {};
  const domains = report.domains || {};
  return [
    evidenceChip('planning', 'Planning evidence', facts.planning || domains.PLANNING?.client, 'Nearby applications are not permission.'),
    evidenceChip('flood', 'Flood evidence', facts.flood || domains.ENVIRONMENT?.client, 'Empty flood results are not “safe” or Flood Zone 1.'),
    evidenceChip('heritage', 'Heritage / listed context', facts.listedBuilding || facts.listed, 'Context only. Not a legal restriction conclusion.'),
    evidenceChip('conservation', 'Conservation area', facts.conservationArea, 'Context only.'),
    evidenceChip('article4', 'Article 4', facts.article4, 'Context only. Not a PD-rights determination.'),
    evidenceChip('epb', 'Energy / physical (EPB)', facts.epc || facts.energyRating || domains.BUILDING_CONDITION?.client, 'An EPC is not a building survey.'),
    evidenceChip('schools', 'Schools context', facts.schools, 'Area context. Not school suitability.'),
  ];
}

function unresolvedFromItems(items = []) {
  return items
    .filter((row) => row && row.state && row.state !== KERNEL_ASSESSMENT.ASSESSED && row.state !== KERNEL_ASSESSMENT.NOT_APPLICABLE)
    .map((row) => ({
      id: row.id,
      label: row.label,
      state: row.state,
      whatIsMissing: row.label,
      whyItMatters: row.whyItMatters,
      howToResolve: row.howToResolve,
    }));
}

function buildBuyWorkspace(report) {
  const sale = report.marketIntelligence?.sale;
  const pricePosition = report.marketIntelligence?.pricePosition;
  const pd = report.personalDecision?.profile === 'buyer_general' ? report.personalDecision : null;
  const keyIntelligence = [
    valuationItem(sale, report),
    pricePositionItem(pricePosition, report),
    comparableSoldEvidenceItem(report?.marketIntelligence?.comparableSoldEvidence),
    {
      id: 'buyer_general_fit',
      label: 'Owner-occupier fit',
      kind: 'personalDecision',
      state: pd?.available ? KERNEL_ASSESSMENT.ASSESSED : KERNEL_ASSESSMENT.NOT_ASSESSED,
      available: Boolean(pd?.available),
      value: pd?.available ? pd.score : null,
      display: pd,
      whyItMatters: 'Existing buyer_general suitability against stated living requirements. Not purchase advice and not a buy score.',
      howToResolve: pd?.available
        ? null
        : (pd?.unavailableReason || 'Many owner-occupier dimensions stay not assessed until preferences or evidence exist.'),
    },
  ];
  const optionalInvestment = [
    presentedMetric(report.investment, 'grossYield', 'Gross yield (optional investment view)', 'Not a Buy conclusion. Shown only if assessed.', 'Requires purchase price and rent.'),
    presentedMetric(report.investment, 'annualCashFlow', 'Cash flow (optional investment view)', 'Not a Buy conclusion.', 'Requires complete operating costs and finance inputs.'),
  ].filter((row) => row.available);
  const contextEvidence = buySellContextEvidence(report);
  return {
    keyIntelligence,
    optionalInvestmentView: optionalInvestment,
    decisionIntelligenceApplicable: false,
    whatIfProfile: 'buyer_general',
    whatIfApplicable: true,
    personalDecisionApplicable: true,
    contextEvidence,
    unresolved: mergeSubjectAttributeGaps(mergeInternalAreaGap([
      ...unresolvedFromItems(keyIntelligence),
      ...unresolvedFromItems(contextEvidence),
    ], report), report),
    nextActions: unresolvedFromItems(keyIntelligence).map((row) => ({
      id: row.id,
      title: row.label,
      importance: 'decision_relevant',
      state: row.state,
      whyItMatters: row.whyItMatters,
      howToResolve: row.howToResolve,
    })),
    findings: [],
    copy: {
      headline: 'You are assessing this property to BUY',
      notAdvice: 'This is not purchase advice, legal advice, or a survey.',
    },
  };
}

function buildLetInvestWorkspace(report) {
  const sale = report.marketIntelligence?.sale;
  const pricePosition = report.marketIntelligence?.pricePosition;
  const pd = report.personalDecision?.profile === 'landlord' ? report.personalDecision : null;
  const di = report.decisionIntelligence || null;
  const missingUnderwritingInputs = buildMissingUnderwritingInputs(report);
  const keyIntelligence = [
    valuationItem(sale, report),
    pricePositionItem(pricePosition, report),
    presentedMetric(report.investment, 'grossYield', 'Gross yield', 'Income relative to purchase price when both are assessed.', 'Requires purchase price and expected or market rent.', report),
    presentedMetric(report.investment, 'noi', 'NOI', 'Net operating income after evidenced operating costs.', 'Requires complete operating-cost inputs. Missing costs are not zero.', report),
    presentedMetric(report.investment, 'annualCashFlow', 'Annual cash flow', 'After debt service when finance inputs are complete.', 'Requires NOI plus deposit, rate, and term. Missing mortgage inputs are not a cash purchase.', report),
    presentedMetric(report.investment, 'dscr', 'DSCR', 'Debt-service coverage when finance inputs are complete.', 'Requires NOI and mortgage inputs.', report),
    {
      id: 'landlord_fit',
      label: 'Landlord fit',
      kind: 'personalDecision',
      state: pd?.available ? KERNEL_ASSESSMENT.ASSESSED : KERNEL_ASSESSMENT.NOT_ASSESSED,
      available: Boolean(pd?.available),
      value: pd?.available ? pd.score : null,
      display: pd,
      whyItMatters: 'Existing landlord Personal Decision. Not purchase advice.',
      howToResolve: pd?.available ? null : (pd?.unavailableReason || 'Landlord fit is not assessed until enough dimensions have evidence.'),
    },
  ];
  const contextEvidence = collectContextEvidence(report);
  const userInputUnresolved = (missingUnderwritingInputs.items || [])
    .filter((row) => row.cause === ROOT_CAUSE.MISSING_USER_INPUT && row.inputKey)
    .map((row) => ({
      id: row.id,
      label: row.label,
      state: KERNEL_ASSESSMENT.NOT_ASSESSED,
      whatIsMissing: row.label,
      whyItMatters: `Required for: ${row.unlockLabels.join(', ')}`,
      howToResolve: row.detail,
      cause: row.cause,
      inputKey: row.inputKey,
      section: row.section,
      unlocks: row.unlocks,
    }));

  return {
    keyIntelligence,
    missingUnderwritingInputs,
    optionalInvestmentView: [],
    decisionIntelligenceApplicable: true,
    whatIfProfile: 'landlord',
    whatIfApplicable: true,
    personalDecisionApplicable: true,
    contextEvidence,
    unresolved: mergeSubjectAttributeGaps(mergeInternalAreaGap(
      userInputUnresolved.length
        ? userInputUnresolved
        : (di?.unresolvedDependencies || unresolvedFromItems(keyIntelligence)),
      report
    ), report),
    nextActions: di?.investigationPriorities || [],
    findings: di?.materialFindings || [],
    sensitivityDrivers: di?.sensitivityDrivers || [],
    copy: {
      headline: 'You are assessing this property to LET / INVEST',
      notAdvice: 'This is not financial, investment, or legal advice.',
    },
  };
}

function buildSellWorkspace(report) {
  const sale = report.marketIntelligence?.sale;
  const pricePosition = report.marketIntelligence?.pricePosition;
  const keyIntelligence = [
    valuationItem(sale, report),
    pricePositionItem(pricePosition, report),
    comparableSoldEvidenceItem(report?.marketIntelligence?.comparableSoldEvidence),
  ];
  const contextEvidence = buySellContextEvidence(report);
  return {
    keyIntelligence,
    optionalInvestmentView: [],
    decisionIntelligenceApplicable: false,
    whatIfProfile: null,
    whatIfApplicable: false,
    personalDecisionApplicable: false,
    contextEvidence,
    unresolved: mergeSubjectAttributeGaps(mergeInternalAreaGap([
      ...unresolvedFromItems(keyIntelligence),
      ...unresolvedFromItems(contextEvidence),
    ], report), report),
    nextActions: unresolvedFromItems(keyIntelligence).map((row) => ({
      id: row.id,
      title: row.label,
      importance: 'decision_relevant',
      state: row.state,
      whyItMatters: row.whyItMatters,
      howToResolve: row.howToResolve,
    })),
    findings: [],
    copy: {
      headline: 'You are assessing this property to SELL',
      notAdvice: 'No optimal asking price, days-to-sell, or demand prediction is assessed. This is not agent strategy.',
    },
  };
}

function buildResidentialDecisionWorkspace({
  decisionContext,
  report,
  methodologyGate = null,
} = {}) {
  const job = decisionContext?.decisionJob || null;
  const assetClass = decisionContext?.assetClass || report?.assetClassification?.assetClass || null;
  const notApplicable = methodologyGate && methodologyGate.mode === 'NOT_SUPPORTED_FOR_ASSET_CLASS';

  const base = {
    contractVersion: decisionContext?.contractVersion || 'residential-decision-context-1.0.0',
    decisionJob: job,
    assetClass,
    residentialMethodology: methodologyGate || null,
    applicable: Boolean(job) && !notApplicable,
    state: notApplicable ? KERNEL_ASSESSMENT.NOT_APPLICABLE : (job ? KERNEL_ASSESSMENT.ASSESSED : KERNEL_ASSESSMENT.NOT_ASSESSED),
  };

  if (notApplicable) {
    return {
      ...base,
      copy: {
        headline: 'Residential decision workspace is not applicable for this asset class',
        notAdvice: 'Residential valuation and rent methodology was not run.',
      },
      keyIntelligence: [],
      unresolved: [{
        id: 'asset_class',
        label: 'Residential decision jobs',
        state: KERNEL_ASSESSMENT.NOT_APPLICABLE,
        whatIsMissing: 'A specialised methodology for this asset class',
        whyItMatters: 'Buy / Let-Invest / Sell in this workspace are residential jobs.',
        howToResolve: methodologyGate?.note || null,
      }],
      nextActions: [],
      findings: [],
      contextEvidence: collectContextEvidence(report),
      whatIfApplicable: false,
      personalDecisionApplicable: false,
      decisionIntelligenceApplicable: false,
    };
  }

  const built = job === DECISION_JOB.BUY
    ? buildBuyWorkspace(report)
    : job === DECISION_JOB.SELL
      ? buildSellWorkspace(report)
      : buildLetInvestWorkspace(report);

  return {
    ...base,
    ...built,
    unknownCompatibility: methodologyGate?.mode === 'LEGACY_RESIDENTIAL_COMPATIBILITY',
    legacySnapshot: Boolean(decisionContext?.provenance?.legacySnapshot),
    unspecifiedCompatibility: Boolean(decisionContext?.provenance?.unspecifiedCompatibility),
  };
}

module.exports = {
  buildResidentialDecisionWorkspace,
  assessmentFromField,
};
