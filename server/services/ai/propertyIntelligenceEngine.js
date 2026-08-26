/**
 * Full property intelligence analysis — deterministic engine + structured facts for LLM.
 */

const { fetchPropertyForIntelligence, getMonthlyRent } = require('./propertyDataAggregator');
const { applyReportAccessPolicy } = require('./propertyIntelligenceAccess');
const { assessPropertyDataQuality } = require('./propertyDataQuality');
const { analyseRent } = require('./rentIntelligenceService');
const {
  calculateInvestmentMetrics,
  buildDetailedScenarios,
  buildCashFlowSensitivityMatrix,
  sensitivityAnalysis,
} = require('./financialEngine');
const { calculateIntelligenceScores, calculateConfidence } = require('./propertyScoring');
const { generatePropertyExplanation, templateSummary } = require('./propertyExplanationService');
const { enrichPropertyForIntelligence } = require('../enrichment/propertyEnrichmentService');
const { isExternalEnrichmentAvailable } = require('../../config/propertyIntelligence.config');
const { calculatePropertyValuation } = require('./valuationEngine');
const { calculatePricePosition } = require('./pricePositionEngine');
const {
  getPostcodeMarketIntelligence,
  buildPropertyMarketContext,
  buildDecisionContext,
} = require('./postcodeMarketIntelligenceService');
const { listingObservedCharges } = require('./listingObservedFields');
const {
  assemblePropertyFacts,
  attachPropertyFactsToDecisionContext,
  publicPropertyFactsForExplanation,
} = require('./propertyFacts');
const { applyPropertyDataEvidence } = require('../providers/propertyData/propertyDataEvidence');
const {
  getFloodEvidence,
  unattachedFloodFact,
  notAssessedFlood,
  UNAVAILABLE_REASONS,
} = require('./floodEvidence');
const {
  getPlanningEvidence,
  unattachedPlanningFact,
  notAssessedPlanning,
  UNAVAILABLE_REASONS: PLANNING_UNAVAILABLE_REASONS,
} = require('./planningEvidence');
const {
  attachFinanceInputsToDecisionContext,
  publicFinanceInputsForExplanation,
  parseFinancePayload,
  parseAnalyseFinanceRequest,
  pickRecognisedFinanceKeys,
  buildFinanceRequestTransparency,
  FINANCE_INPUT_VERSION,
} = require('./financeInputContract');
const {
  demandEvidenceFromEnrichment,
  buildMarketDemandEvidence,
  rentalDemandEvidenceFromEnrichment,
  buildRentalDemandEvidence,
} = require('../providers/propertyData/propertyDataParsers');
const {
  prepareEvidencedInvestment,
  presentEvidencedInvestment,
  evidencedValue,
} = require('./evidencedInvestment');
const {
  intelligenceForLandlordScore,
  scorePublicLandlordPersonalDecision,
} = require('./personalDecisionCanonical');
const CANONICAL_ENGINE_VERSION = 'property-intelligence-v2';
const IMPACT_WEIGHT = { Low: 0.33, Medium: 0.66, High: 1 };

function publicAnalysisOptions(options = {}) {
  const {
    deps,
    skipExplanation,
    skipPostcodeMarket,
    skipFlood,
    flood,
    floodEvidence,
    skipPlanning,
    planning,
    planningEvidence,
    propertyFacts,
    riskScore,
    floodScore,
    planningScore,
    developmentScore,
    asOf,
    providerCallLog,
    skipValidation,
    ...rest
  } = options;
  const parsed = parseAnalyseFinanceRequest(rest);
  if (parsed.ok) return parsed.options;
  return pickRecognisedFinanceKeys(rest);
}

function noteCanonicalStep(options, name) {
  if (Array.isArray(options?.providerCallLog)) options.providerCallLog.push(name);
}

function buildCanonicalIdentity(property, access, externalEnrichment, target = {}) {
  const listingId =
    access?.linkedPropertyId ??
    access?.propertyId ??
    (property?.id != null ? property.id : null);
  const subjectId =
    access?.subjectId ?? property?.subjectId ?? target.subjectId ?? null;
  const uprn =
    access?.uprn ?? property?.uprn ?? externalEnrichment?.identity?.uprn ?? null;
  let source = property?.source || access?.source || null;
  if (!source) {
    if (subjectId && listingId) source = 'linked_marketplace_listing';
    else if (subjectId) source = 'intelligence_subject';
    else source = 'marketplace_listing';
  }
  return {
    listingId,
    subjectId,
    uprn,
    source,
    listingIdIsNotUprn: listingId == null || String(listingId) !== String(uprn || ''),
    uprnIsNotListingId: !uprn || String(uprn) !== String(listingId || ''),
  };
}

function impactLabel(score) {
  if (score >= 0.66) return 'High';
  if (score >= 0.33) return 'Medium';
  return 'Low';
}

function buildInvestmentInput(property, monthlyRent, options = {}, propertyFacts = null) {
  return prepareEvidencedInvestment({
    purchasePrice: property.price,
    expectedRent: monthlyRent,
    options,
    property,
    propertyFacts,
  }).input;
}

function detectMarketingGaps(property) {
  const gaps = [];
  const desc = (property.description || '').toLowerCase();

  const checks = [
    { field: 'parking_spaces', value: property.parking_spaces, keywords: ['parking', 'garage', 'driveway'] },
    { field: 'has_garden', value: property.has_garden, keywords: ['garden', 'outdoor', 'patio'] },
    { field: 'has_garage', value: property.has_garage, keywords: ['garage'] },
    { field: 'has_pool', value: property.has_pool, keywords: ['pool', 'swimming'] },
    { field: 'furnished', value: property.furnished, keywords: ['furnished'] },
    { field: 'pets_allowed', value: property.pets_allowed, keywords: ['pet', 'pets'] },
    { field: 'epc_rating', value: property.epc_rating, keywords: ['epc', 'energy'] },
  ];

  checks.forEach(({ field, value, keywords }) => {
    if (!value) return;
    const mentioned = keywords.some((k) => desc.includes(k));
    if (!mentioned) {
      gaps.push({
        field,
        message: `Property record shows ${field.replace(/_/g, ' ')} but the listing description does not mention it.`,
        evidence: `${field} = ${value}`,
      });
    }
  });

  if (!property.description || property.description.trim().length < 80) {
    gaps.push({
      field: 'description',
      message: 'Listing description is very short and may under-sell the property.',
      evidence: `Description length: ${(property.description || '').length} characters`,
    });
  }

  return gaps;
}

function buildDocumentIntelligence(property) {
  const items = [];

  if (property.epc_rating) {
    items.push({
      label: 'EPC rating',
      value: property.epc_rating,
      source: 'Property record (epc_rating field)',
    });
  }
  if (property.epc_document_url || property.epc_document_name) {
    items.push({
      label: 'EPC document',
      value: property.epc_document_name || 'On file',
      source: 'Property record (epc_document)',
      url: property.epc_document_url || null,
    });
  }
  if (property.layout_file_url || property.layout_file_name) {
    items.push({
      label: 'Layout file',
      value: property.layout_file_name || 'On file',
      source: 'Property record (layout_file)',
      url: property.layout_file_url || null,
    });
  }
  if (property.lease_type) {
    items.push({ label: 'Lease type', value: property.lease_type, source: 'Property record' });
  }
  if (property.break_clause !== null && property.break_clause !== undefined) {
    items.push({
      label: 'Break clause',
      value: property.break_clause ? 'Yes' : 'No',
      source: 'Property record',
    });
  }
  if (property.vat_on_rent) {
    items.push({ label: 'VAT on rent', value: property.vat_on_rent, source: 'Property record' });
  }
  if (property.repairing_obligation) {
    items.push({
      label: 'Repairing obligation',
      value: property.repairing_obligation,
      source: 'Property record',
    });
  }
  if (property.rent_review_frequency) {
    items.push({
      label: 'Rent review',
      value: property.rent_review_frequency,
      source: 'Property record',
    });
  }
  if (property.deposit_amount) {
    items.push({
      label: 'Deposit',
      value: `£${Number(property.deposit_amount).toLocaleString()}`,
      source: 'Property record',
    });
  }

  return {
    available: items.length > 0,
    items,
    note:
      items.length === 0
        ? 'No structured document fields available. Upload EPC or lease documents to enrich analysis.'
        : null,
    parsingStatus: 'Structured fields only — full document parsing not yet connected.',
  };
}

function buildStrengths(property, rentIntel, investment, dataQuality) {
  const strengths = [];

  if (property.city && property.zip_code) {
    strengths.push({
      title: 'Location data on file',
      evidence: `${property.city}, ${property.zip_code}`,
    });
  }
  if (Number(property.square_feet) >= 900) {
    strengths.push({
      title: 'Generous floor area',
      evidence: `${Number(property.square_feet).toLocaleString()} sq ft`,
    });
  }
  if (property.parking_spaces > 0 || property.has_garage) {
    strengths.push({
      title: 'Parking provision',
      evidence: property.has_garage
        ? 'Garage available'
        : `${property.parking_spaces} parking space(s)`,
    });
  }
  if (property.has_garden) {
    strengths.push({ title: 'Garden', evidence: 'Garden flagged in property record' });
  }
  if (property.epc_rating && ['A', 'B', 'C'].includes(String(property.epc_rating).toUpperCase().charAt(0))) {
    strengths.push({ title: 'Good EPC rating', evidence: `EPC: ${property.epc_rating}` });
  }
  if (rentIntel?.success && rentIntel.underRented) {
    strengths.push({
      title: 'Rent uplift opportunity',
      evidence: `Current rent below estimated market range (£${rentIntel.marketRange.low}–£${rentIntel.marketRange.high})`,
    });
  }
  if (investment?.metrics?.grossYield >= 5) {
    strengths.push({
      title: 'Competitive gross yield',
      evidence: `${investment.metrics.grossYield}% gross yield under stated assumptions`,
    });
  }
  if (rentIntel?.success && rentIntel.comparables?.length >= 3) {
    strengths.push({
      title: 'Comparable rental listings in database',
      evidence: `${rentIntel.comparables.length} comparable rental listings identified`,
    });
  }
  if (dataQuality.score >= 75) {
    strengths.push({
      title: 'Strong property data completeness',
      evidence: `Data quality score: ${dataQuality.score}/100`,
    });
  }

  return strengths;
}

function buildWeaknesses(property, rentIntel, investment, dataQuality, marketingGaps) {
  const weaknesses = [];

  if (rentIntel?.success && rentIntel.currentRent > 0) {
    const mid = (rentIntel.marketRange.low + rentIntel.marketRange.high) / 2;
    if (rentIntel.currentRent > mid * 1.05) {
      weaknesses.push({
        title: 'Rent above comparable midpoint',
        evidence: `Current £${rentIntel.currentRent.toLocaleString()} vs midpoint ~£${Math.round(mid).toLocaleString()}`,
      });
    }
  }
  if (!property.epc_rating && !property.epc_document_url) {
    weaknesses.push({ title: 'Missing EPC information', evidence: 'No EPC rating or document on file' });
  }
  if (Number(listingObservedCharges(property).serviceCharge.value) > 2000) {
    weaknesses.push({
      title: 'High service charge',
      evidence: `£${Number(property.service_charge).toLocaleString()} annual service charge`,
    });
  }
  if (investment?.presented?.annualCashFlow?.available && investment.metrics.annualCashFlow < 0) {
    weaknesses.push({
      title: 'Negative cash flow under assumptions',
      evidence: `Estimated annual cash flow: £${investment.metrics.annualCashFlow.toLocaleString()}`,
    });
  }
  if (!rentIntel?.success) {
    weaknesses.push({
      title: 'Limited comparable rental data',
      evidence: rentIntel?.message || 'Insufficient comparables in database',
    });
  }
  if (dataQuality.requiredMissing?.length) {
    weaknesses.push({
      title: 'Incomplete core property data',
      evidence: `Missing: ${dataQuality.requiredMissing.join(', ')}`,
    });
  }
  marketingGaps.slice(0, 2).forEach((g) => {
    weaknesses.push({ title: 'Listing positioning gap', evidence: g.message });
  });

  return weaknesses;
}

function buildOpportunities(property, rentIntel, marketingGaps) {
  const opportunities = [];

  if (rentIntel?.success && rentIntel.underRented && rentIntel.potentialAnnualUplift) {
    opportunities.push({
      id: 'rent-opportunity',
      category: 'RENT',
      title: 'Rent opportunity',
      currentRent: rentIntel.currentRent,
      marketRange: rentIntel.marketRange,
      recommendedPosition: rentIntel.recommendedRent,
      potentialAnnualImprovement: rentIntel.potentialAnnualUplift,
      confidence: rentIntel.confidence,
      // Reuse the level the confidence engine already decided. Re-deriving it from
      // the numeric index turned a null score into a fabricated "Low".
      confidenceLabel: rentIntel.confidenceLevel || 'Not assessed',
      evidence: `${rentIntel.comparables.length} internal comparables`,
    });
  }

  marketingGaps.forEach((g, i) => {
    opportunities.push({
      id: `marketing-${i}`,
      category: 'MARKETING',
      title: 'Marketing opportunity',
      description: g.message,
      evidence: g.evidence,
      confidence: 85,
      confidenceLabel: 'High',
    });
  });

  return opportunities.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

function buildRisks(property, rentIntel, investment, dataQuality) {
  const risks = [];

  if (rentIntel?.success && rentIntel.currentRent > 0) {
    const mid = (rentIntel.marketRange.low + rentIntel.marketRange.high) / 2;
    if (rentIntel.currentRent < mid * 0.94) {
      const pctBelow = ((mid - rentIntel.currentRent) / mid) * 100;
      const prob = Math.min(0.95, 0.5 + rentIntel.confidence / 200);
      const impact = pctBelow > 10 ? 'High' : 'Medium';
      risks.push({
        id: 'rent-below-market',
        category: 'RENTAL',
        title: 'Current rent appears below comparable midpoint',
        severity: impact,
        probability: Math.round(prob * 100) / 100,
        impact,
        riskExposure: Math.round(prob * IMPACT_WEIGHT[impact] * 100) / 100,
        evidence: `Current rent is ${pctBelow.toFixed(1)}% below estimated market midpoint.`,
        recommendedAction: 'Review rent at next tenancy event.',
      });
    }
    if (rentIntel.currentRent > mid * 1.06) {
      const prob = Math.min(0.9, 0.45 + rentIntel.confidence / 200);
      risks.push({
        id: 'rent-above-market',
        category: 'RENTAL',
        title: 'Current rent appears above comparable midpoint',
        severity: 'Medium',
        probability: Math.round(prob * 100) / 100,
        impact: 'Medium',
        riskExposure: Math.round(prob * IMPACT_WEIGHT.Medium * 100) / 100,
        evidence: `Current rent exceeds estimated market midpoint.`,
        recommendedAction: 'Monitor void risk and tenant retention.',
      });
    }
  }

  if (investment?.presented?.annualCashFlow?.available && investment.metrics.annualCashFlow < 0) {
    risks.push({
      id: 'negative-cashflow',
      category: 'FINANCIAL',
      title: 'Negative cash flow under current assumptions',
      severity: 'High',
      probability: 0.72,
      impact: 'High',
      riskExposure: 0.72,
      evidence: `Annual cash flow: £${investment.metrics.annualCashFlow.toLocaleString()}`,
      recommendedAction: 'Review financing, costs, or rent positioning.',
    });
  }

  if (!property.epc_rating) {
    risks.push({
      id: 'missing-epc',
      category: 'DOCUMENT',
      title: 'EPC documentation missing',
      severity: 'Medium',
      probability: 0.95,
      impact: 'Medium',
      riskExposure: 0.63,
      evidence: 'No EPC rating or document on file.',
      recommendedAction: 'Upload EPC certificate.',
    });
  }

  if (dataQuality.score < 50) {
    risks.push({
      id: 'poor-data',
      category: 'DATA',
      title: 'Insufficient property data for high-confidence analysis',
      severity: 'Medium',
      probability: 0.9,
      impact: 'Medium',
      riskExposure: 0.59,
      evidence: `Data quality score: ${dataQuality.score}/100`,
      recommendedAction: 'Complete missing property fields.',
    });
  }

  if (property.break_clause) {
    risks.push({
      id: 'break-clause',
      category: 'LEASE',
      title: 'Break clause present on lease',
      severity: 'Medium',
      probability: 0.55,
      impact: 'Medium',
      riskExposure: 0.36,
      evidence: 'Break clause flagged in property record.',
      recommendedAction: 'Review lease obligations before renewal.',
    });
  }

  return risks.sort((a, b) => b.riskExposure - a.riskExposure);
}

function buildPrimaryRecommendation({ opportunities, risks, dataQuality, investment, rentIntel }) {
  if (!dataQuality.sufficientForAnalysis) {
    return {
      action: 'Insufficient data — collect additional property information.',
      why: 'Core property fields are incomplete for reliable intelligence.',
      evidence: dataQuality.requiredMissing?.length
        ? `Missing: ${dataQuality.requiredMissing.join(', ')}`
        : `Data quality score: ${dataQuality.score}/100`,
      expectedImpact: 'Improved analysis confidence and accuracy.',
      confidence: Math.min(dataQuality.score, 40),
      confidenceLabel: 'Low',
    };
  }

  const topOpp = opportunities[0];
  if (topOpp?.category === 'RENT') {
    return {
      action: 'Review rental pricing.',
      why: 'Current rent appears below the estimated market range based on internal comparables.',
      evidence: topOpp.evidence,
      expectedImpact: topOpp.potentialAnnualImprovement
        ? `Potential £${Math.round(topOpp.potentialAnnualImprovement.low).toLocaleString()}–£${Math.round(topOpp.potentialAnnualImprovement.high).toLocaleString()} annual improvement`
        : 'Potential rental income improvement',
      confidence: topOpp.confidence,
      confidenceLabel: topOpp.confidenceLabel,
    };
  }

  const topRisk = risks[0];
  if (topRisk?.category === 'FINANCIAL') {
    return {
      action: 'Proceed with further investment analysis.',
      why: topRisk.title,
      evidence: topRisk.evidence,
      expectedImpact: 'Clarify financing and cost assumptions before committing.',
      confidence: 65,
      confidenceLabel: 'Medium',
    };
  }

  if (topOpp?.category === 'MARKETING') {
    return {
      action: 'Improve listing positioning before reducing price.',
      why: topOpp.description,
      evidence: topOpp.evidence,
      expectedImpact: 'Better marketing may improve enquiry quality without price changes.',
      confidence: topOpp.confidence,
      confidenceLabel: topOpp.confidenceLabel,
    };
  }

  if (investment?.hasMortgageAssumptions === false && investment?.metrics) {
    return {
      action: 'Add mortgage assumptions for leveraged cash-flow analysis.',
      why: 'Purchase price and rent are available but financing inputs were not supplied.',
      evidence: `Gross yield: ${investment.metrics.grossYield}%`,
      expectedImpact: 'Complete DSCR and cash-flow projections.',
      confidence: 70,
      confidenceLabel: 'Medium',
    };
  }

  return {
    action: rentIntel?.success ? 'Monitor market position and maintain listing quality.' : 'Expand property data and comparable coverage.',
    why: 'No dominant opportunity or risk identified from current data.',
    evidence: `Intelligence based on ${dataQuality.score}/100 data quality score.`,
    expectedImpact: 'Maintains current positioning.',
    confidence: 55,
    confidenceLabel: 'Medium',
  };
}

async function runFullPropertyAnalysis(propertyIdOrTarget, userId, options = {}) {
  const target =
    typeof propertyIdOrTarget === 'object'
      ? propertyIdOrTarget
      : { propertyId: propertyIdOrTarget };

  const asOf = options.asOf || new Date().toISOString();
  const stages = [];
  const mark = (id, label) => {
    const entry = { id, label, completed: true, at: asOf };
    stages.push(entry);
    return entry;
  };

  mark('collect', 'Collecting property data');

  let property;
  let access;
  let externalEnrichment;
  const isExternalSubject = Boolean(target.subjectId);

  if (isExternalSubject) {
    const { getSubjectPreview, enrichSubjectForIntelligence } = require('./externalPropertyLookupService');
    const preview = await getSubjectPreview(target.subjectId);
    if (!preview.success) {
      return { success: false, message: preview.message, code: 'NOT_FOUND' };
    }
    property = preview.property;
    const linkedId = preview.accessContext?.linkedPropertyId || preview.linkedListing?.id;
    if (linkedId) {
      const { property: listing, access: listingAccess } = await fetchPropertyForIntelligence(
        linkedId,
        userId
      );
      if (listing && listingAccess?.allowed) {
        property = {
          ...listing,
          subjectId: target.subjectId,
          uprn: preview.property?.uprn,
          source: 'linked_marketplace_listing',
        };
      }
    }
    access = {
      allowed: true,
      userId,
      role: 'buyer',
      relationship: linkedId ? 'external_linked_listing' : 'external_lookup',
      accessLevel: 'public_intelligence',
      propertyId: linkedId || null,
      subjectId: target.subjectId,
      linkedPropertyId: linkedId || null,
      uprn: preview.property?.uprn,
      source: 'PropertyData',
    };
    mark('enrichment', 'Loading external property intelligence');
    try {
      const subject = await require('../enrichment/intelligenceSubjectRepository').findSubjectById(
        target.subjectId
      );
      externalEnrichment = await enrichSubjectForIntelligence(subject, property, userId);
    } catch (err) {
      externalEnrichment = {
        available: false,
        partial: true,
        error: err.message,
        message: 'External enrichment failed — continuing with UPRN profile only',
      };
    }
  } else {
    const { property: loaded, access: resolvedAccess } = await fetchPropertyForIntelligence(
      target.propertyId,
      userId
    );
    property = loaded;
    access = resolvedAccess;
    if (!property || !access?.allowed) {
      return {
        success: false,
        message: 'Property not found or you do not have permission to analyse it.',
        code: 'ACCESS_DENIED',
      };
    }

    mark('enrichment', 'Loading external property intelligence');
    if (isExternalEnrichmentAvailable()) {
      try {
        externalEnrichment = await enrichPropertyForIntelligence(property, { userId });
      } catch (err) {
        externalEnrichment = {
          available: false,
          partial: true,
          error: err.message,
          message: 'External enrichment failed — continuing with internal data only',
        };
      }
    } else {
      externalEnrichment = {
        available: false,
        partial: true,
        message: 'External providers not configured — internal analysis only',
      };
    }
  }

  return assemblePropertyIntelligenceReport({
    property,
    access,
    externalEnrichment: externalEnrichment || { available: false, enrichments: {} },
    userId,
    options,
    target,
    stages,
    mark,
    asOf,
  });
}

async function assemblePropertyIntelligenceReport({
  property: rawProperty,
  access,
  externalEnrichment = { available: false, enrichments: {} },
  userId,
  options = {},
  target = {},
  stages = [],
  mark,
  asOf,
}) {
  const evidenceAsOf = asOf || options.asOf || new Date().toISOString();
  const stamp = (id, label) => {
    if (typeof mark === 'function') return mark(id, label);
    const entry = { id, label, completed: true, at: evidenceAsOf };
    stages.push(entry);
    return entry;
  };

  const deps = options.deps || {};
  const analyseRentFn = deps.analyseRent || analyseRent;
  const valuationFn = deps.calculatePropertyValuation || calculatePropertyValuation;
  const postcodeFn = deps.getPostcodeMarketIntelligence || getPostcodeMarketIntelligence;
  const explainFn = deps.generatePropertyExplanation || generatePropertyExplanation;

  const appliedEvidence = applyPropertyDataEvidence(rawProperty, externalEnrichment);
  let property = appliedEvidence.property;
  const propertyDataEvidence = appliedEvidence.evidence;
  const listingCharges = listingObservedCharges(rawProperty);

  let floodEvidence = unattachedFloodFact();
  if (options.skipFlood) {
    floodEvidence = unattachedFloodFact({
      note: 'Flood evidence was not retrieved for this assembly. Missing flood is not low risk.',
    });
  } else {
    stamp('flood_evidence', 'Retrieving Environment Agency flood evidence');
    try {
      noteCanonicalStep(options, 'flood_evidence');
      const getFloodEvidenceFn = deps.getFloodEvidence || getFloodEvidence;
      floodEvidence = await getFloodEvidenceFn(property, {
        asOf: evidenceAsOf,
        identity: {
          listingId: property.id ?? target.propertyId ?? access?.propertyId ?? null,
          subjectId: property.subjectId ?? target.subjectId ?? access?.subjectId ?? null,
          uprn: property.uprn ?? access?.uprn ?? null,
          postcode: property.zip_code || property.postcode || null,
          latitude: Number.isFinite(Number(property.latitude)) ? Number(property.latitude) : null,
          longitude: Number.isFinite(Number(property.longitude)) ? Number(property.longitude) : null,
          coordinateSource: 'property_record',
        },
      });
    } catch {
      floodEvidence = notAssessedFlood({
        reason: UNAVAILABLE_REASONS.providerUnavailable,
        note: 'The Environment Agency flood service could not be reached. Missing flood is not low risk.',
        identity: {
          listingId: property.id ?? target.propertyId ?? null,
          uprn: property.uprn ?? access?.uprn ?? null,
        },
      });
    }
  }

  let planningEvidence = unattachedPlanningFact();
  if (options.skipPlanning) {
    planningEvidence = unattachedPlanningFact({
      note: 'Planning evidence was not retrieved for this assembly. Missing planning is not “no planning activity”.',
    });
  } else {
    stamp('planning_evidence', 'Retrieving MHCLG planning application evidence');
    try {
      noteCanonicalStep(options, 'planning_evidence');
      const getPlanningEvidenceFn = deps.getPlanningEvidence || getPlanningEvidence;
      planningEvidence = await getPlanningEvidenceFn(property, {
        asOf: evidenceAsOf,
        identity: {
          listingId: property.id ?? target.propertyId ?? access?.propertyId ?? null,
          subjectId: property.subjectId ?? target.subjectId ?? access?.subjectId ?? null,
          uprn: property.uprn ?? access?.uprn ?? null,
          postcode: property.zip_code || property.postcode || null,
          latitude: Number.isFinite(Number(property.latitude)) ? Number(property.latitude) : null,
          longitude: Number.isFinite(Number(property.longitude)) ? Number(property.longitude) : null,
          coordinateSource: 'property_record',
        },
      });
    } catch {
      planningEvidence = notAssessedPlanning({
        reason: PLANNING_UNAVAILABLE_REASONS.providerUnavailable,
        note: 'The Planning Data service could not be reached. Missing planning is not “no planning activity”.',
        identity: {
          listingId: property.id ?? target.propertyId ?? null,
          uprn: property.uprn ?? access?.uprn ?? null,
        },
      });
    }
  }

  const propertyFacts = assemblePropertyFacts({
    property,
    evidence: propertyDataEvidence,
    identity: {
      listingId: property.id ?? target.propertyId ?? null,
      uprn: property.uprn ?? access?.uprn ?? null,
    },
    listingCharges,
    floodEvidence,
    planningEvidence,
  });

  if (!access) {
    access = {
      allowed: true,
      userId,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: property.id ?? null,
      subjectId: property.subjectId ?? target.subjectId ?? null,
      uprn: property.uprn ?? null,
    };
  }

  const isProfessional = access.accessLevel === 'professional_intelligence';

  let postcodeIntelligence = null;
  let marketContext = null;
  let decisionContext = null;
  const postcodeForMarket = property.zip_code || property.postcode;
  if (postcodeForMarket && !options.skipPostcodeMarket) {
    try {
      noteCanonicalStep(options, 'postcode_market');
      postcodeIntelligence = await postcodeFn(postcodeForMarket, { userId });
      if (postcodeIntelligence?.success) {
        marketContext = buildPropertyMarketContext(property, postcodeIntelligence);
        decisionContext = attachPropertyFactsToDecisionContext(
          buildDecisionContext(postcodeIntelligence, marketContext),
          propertyFacts
        );
      }
    } catch {
      postcodeIntelligence = null;
      marketContext = null;
      decisionContext = null;
    }
  }

  let areaMarketDemand = demandEvidenceFromEnrichment(externalEnrichment);
  if (!areaMarketDemand.available && postcodeIntelligence?.snapshot?.areaMarketDemand?.available) {
    areaMarketDemand = postcodeIntelligence.snapshot.areaMarketDemand;
  }
  if (!areaMarketDemand) areaMarketDemand = buildMarketDemandEvidence(null);

  let areaRentalDemand = rentalDemandEvidenceFromEnrichment(externalEnrichment);
  if (!areaRentalDemand.available && postcodeIntelligence?.snapshot?.areaRentalDemand?.available) {
    areaRentalDemand = postcodeIntelligence.snapshot.areaRentalDemand;
  }
  if (!areaRentalDemand) areaRentalDemand = buildRentalDemandEvidence(null);

  stamp('quality', 'Checking data quality');
  const dataQuality = assessPropertyDataQuality(property);
  const monthlyRent = getMonthlyRent(property);

  stamp('valuation', 'Calculating sale valuation');
  let saleValuation = null;
  let pricePosition = null;
  if (property.category === 'sale' || Number(property.price) > 0) {
    noteCanonicalStep(options, 'valuation');
    saleValuation = await valuationFn(property, externalEnrichment);
    if (saleValuation?.success) {
      pricePosition = calculatePricePosition(Number(property.price), saleValuation);
    }
  }

  stamp('comparables', 'Finding comparable properties');
  let rentIntel = null;
  const canEstimateRent =
    (property.city || property.zip_code) &&
    (monthlyRent > 0 || property.category === 'sale' || Number(property.price) > 0);
  if (canEstimateRent) {
    noteCanonicalStep(options, 'rent');
    rentIntel = await analyseRentFn(
      {
        city: property.city,
        postcode: property.zip_code,
        zip_code: property.zip_code,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        squareFeet: property.square_feet,
        propertyType: property.property_type,
        property_category: property.property_category,
        category: property.category,
        currentRent: monthlyRent > 0 ? monthlyRent : undefined,
        propertyId: property.id,
        latitude: property.latitude,
        longitude: property.longitude,
        furnished: property.furnished,
        has_garden: property.has_garden,
        has_garage: property.has_garage,
        parking_spaces: property.parking_spaces,
      },
      userId,
      { externalEnrichment }
    );
    if (rentIntel.success && monthlyRent > 0) {
      rentIntel.currentRent = monthlyRent;
    } else if (rentIntel.success && rentIntel.recommendedRent) {
      rentIntel.estimatedRent = rentIntel.recommendedRent;
    }
  } else {
    rentIntel = {
      success: false,
      message: monthlyRent > 0 ? 'City required for comparable search.' : 'No rental information on file.',
    };
  }

  stamp('financial', 'Calculating financial metrics');
  let investment = null;
  let prepared = null;
  const analysisOptions = publicAnalysisOptions(options);
  const financeContractPreview = parseFinancePayload(analysisOptions);
  const listingAskingPrice = Number(property.price) || 0;
  const listingMonthlyRent = monthlyRent > 0 ? monthlyRent : 0;
  const marketRent = rentIntel?.recommendedRent || rentIntel?.estimatedRent || null;
  const scenarioPurchasePrice = financeContractPreview.fields.purchasePrice?.available
    ? financeContractPreview.fields.purchasePrice.value
    : null;
  const scenarioExpectedRent = financeContractPreview.fields.expectedRent?.available
    ? financeContractPreview.fields.expectedRent.value
    : null;
  const purchasePriceBase =
    listingAskingPrice > 0 ? listingAskingPrice : Number(scenarioPurchasePrice) || 0;
  const listingOrMarketRent =
    listingMonthlyRent > 0 ? listingMonthlyRent : Number(marketRent) > 0 ? Number(marketRent) : 0;
  const rentForInvestment =
    listingOrMarketRent > 0 ? listingOrMarketRent : Number(scenarioExpectedRent) || 0;

  if (purchasePriceBase > 0 && rentForInvestment > 0) {
    prepared = prepareEvidencedInvestment({
      purchasePrice: purchasePriceBase,
      expectedRent: rentForInvestment,
      options: analysisOptions,
      property,
      propertyFacts,
    });
    const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
    const presented = presentEvidencedInvestment(metrics, prepared.operatingCostEvidence);
    if (decisionContext) {
      decisionContext = attachFinanceInputsToDecisionContext(decisionContext, prepared.financeInputs);
    }
    const financeComplete = presented.costsAssessed && presented.financeAssessed;
    investment = {
      hasMortgageAssumptions: presented.financeAssessed,
      analysisKind: prepared.analysisKind,
      metrics,
      presented,
      operatingCostEvidence: presented.costEvidence,
      financeEvidence: presented.financeEvidence,
      financeInputs: publicFinanceInputsForExplanation(prepared.financeInputs),
      scenarioOverrides: prepared.scenarioOverrides,
      expectedRentIsNotMarketRent: true,
      scenarioIsNotObservedResult: prepared.analysisKind === 'user_scenario',
      scenarios: financeComplete
        ? buildDetailedScenarios(prepared.input)
        : {
            available: false,
            state: 'notAssessed',
            reason:
              'Scenarios are not generated from invented finance or cost assumptions. Supply operating costs and complete finance inputs for evidenced scenarios.',
          },
      sensitivity: financeComplete
        ? sensitivityAnalysis(prepared.input)
        : { available: false, state: 'notAssessed' },
      sensitivityMatrix: financeComplete
        ? buildCashFlowSensitivityMatrix(prepared.input)
        : { available: false, state: 'notAssessed' },
      assumptions: metrics.assumptions,
      mortgageNote: financeComplete
        ? null
        : 'Gross yield is evidenced from price and rent. NOI, net yield, cash flow and DSCR are notAssessed until operating costs and complete finance inputs are supplied. Default deposit, rate, vacancy, maintenance, insurance and term were not applied.',
    };
  } else if (purchasePriceBase > 0 || monthlyRent > 0 || rentForInvestment > 0 || scenarioExpectedRent || scenarioPurchasePrice) {
    investment = {
      partial: true,
      message:
        purchasePriceBase <= 0
          ? 'Purchase price not available for yield calculation.'
          : 'Rental income not available for yield calculation.',
    };
  }

  const financeRequest = buildFinanceRequestTransparency({
    contract: prepared?.financeInputs || financeContractPreview,
    presented: investment?.presented || null,
    submitted: analysisOptions,
    listingAskingPrice: listingAskingPrice || null,
    listingMonthlyRent: listingMonthlyRent || null,
    marketRent,
    propertyFacts,
    calculationInput: prepared?.input || null,
  });
  if (investment && !investment.partial) {
    investment.financeRequest = financeRequest;
  }

  stamp('risks', 'Analysing risks');
  const marketingGaps = isProfessional ? detectMarketingGaps(property) : [];
  const risks = buildRisks(property, rentIntel, investment, dataQuality);

  stamp('opportunities', 'Identifying opportunities');
  const opportunities = buildOpportunities(property, rentIntel, marketingGaps);
  const strengths = buildStrengths(property, rentIntel, investment, dataQuality);
  const weaknesses = buildWeaknesses(property, rentIntel, investment, dataQuality, marketingGaps);
  const documents = buildDocumentIntelligence(property);

  stamp('scoring', 'Calculating intelligence scores');
  const comparableCount = rentIntel?.comparables?.length || 0;
  const avgSimilarity =
    comparableCount > 0
      ? rentIntel.comparables.reduce((s, c) => s + c.similarity, 0) / comparableCount
      : null;

  const scores = calculateIntelligenceScores({
    property,
    dataQuality,
    rentIntel,
    investment,
    risks,
    opportunities,
    comparableCount,
    monthlyRent,
  });

  const confidence = calculateConfidence({
    dataQuality,
    comparableCount,
    avgSimilarity,
    comparables: rentIntel?.comparables || null,
    target: property,
    // Method agreement only compares estimates of the same quantity, so this uses
    // the sale valuation's own components — never rent and price together.
    methodEstimates: (saleValuation?.components || []).map((c) => ({
      method: c.method,
      value: c.centralEstimate,
    })),
    providerCoverageAvailable: Boolean(externalEnrichment?.available),
  });

  const recommendation = buildPrimaryRecommendation({
    opportunities,
    risks,
    dataQuality,
    investment,
    rentIntel,
  });

  const personalDecision = scorePublicLandlordPersonalDecision({
    property,
    finance: analysisOptions,
    intelligence: intelligenceForLandlordScore({
      confidence,
      sale: saleValuation,
      rentIntel,
      pricePosition,
      decisionContext,
      areaRentalDemand,
      risks,
      dataQuality,
      opportunities,
      comparableCount,
    }),
    asOf: options.asOf || evidenceAsOf,
  });

  const structuredFacts = {
    property: {
      id: property.id,
      title: property.title,
      address: property.address_display,
      type: property.property_type,
      category: property.category,
    },
    // Only the per-dimension results are exposed to the explanation layer. The
    // deprecated overall and the internal weights/methodology prose are withheld
    // so the LLM cannot narrate or reconstruct an aggregate score.
    scores: {
      componentDetail: scores.componentDetail,
      notAssessed: scores.notAssessed,
      coverage: scores.coverage,
      labels: scores.labels,
    },
    confidence,
    dataQuality,
    rentIntel: rentIntel?.success
      ? {
          currentRent: monthlyRent,
          marketRange: rentIntel.marketRange,
          recommendedRent: rentIntel.recommendedRent,
          underRented: rentIntel.underRented,
          potentialAnnualUplift: rentIntel.potentialAnnualUplift,
          comparableCount,
        }
      : null,
    investment: investment?.presented
      ? {
          grossYield: evidencedValue(investment.presented.grossYield),
          netYield: evidencedValue(investment.presented.netYield),
          noi: evidencedValue(investment.presented.noi),
          annualCashFlow: evidencedValue(investment.presented.annualCashFlow),
          dscr: evidencedValue(investment.presented.dscr),
          netYieldState: investment.presented.netYield.state,
          noiState: investment.presented.noi.state,
          cashFlowState: investment.presented.annualCashFlow.state,
          dscrState: investment.presented.dscr.state,
          costCompleteness: investment.presented.costEvidence?.completeness || null,
          financeCompleteness: investment.presented.financeEvidence?.completeness || null,
          includedCosts: investment.presented.costEvidence?.included || [],
          missingCosts: investment.presented.costEvidence?.missing || [],
          councilTaxTreatedAsLandlordCost: false,
          analysisKind: investment.analysisKind || null,
          expectedRentIsNotMarketRent: true,
          scenarioIsNotObservedResult: Boolean(investment.scenarioIsNotObservedResult),
        }
      : null,
    topOpportunity: opportunities[0] || null,
    topRisk: risks[0] || null,
    recommendation,
    externalEnrichment: externalEnrichment?.available
      ? {
          uprn: externalEnrichment.identity?.uprn || null,
          sources: externalEnrichment.sources,
          hasSoldPrices: Boolean(externalEnrichment.enrichments?.sold_prices?.success),
          hasValuation: Boolean(externalEnrichment.enrichments?.valuation_sale?.success),
        }
      : null,
    saleValuation: saleValuation?.success
      ? {
          centralEstimate: saleValuation.centralEstimate?.value ?? saleValuation.centralEstimate,
          lowerEstimate: saleValuation.lowerEstimate?.value ?? saleValuation.lowerEstimate,
          upperEstimate: saleValuation.upperEstimate?.value ?? saleValuation.upperEstimate,
          confidence: saleValuation.confidence,
          evidenceCount: saleValuation.evidenceCount,
        }
      : null,
    pricePosition: pricePosition?.success
      ? {
          label: pricePosition.label,
          position: pricePosition.position,
          differencePercent: pricePosition.differenceFromCentral?.percent,
        }
      : null,
    marketContext: marketContext
      ? {
          typicalPostcodeValue: marketContext.typicalPostcodeValue?.value,
          matchedSegment: marketContext.matchedSegment?.label,
          vsMatchedEvidence: marketContext.vsMatchedEvidence?.summary,
          segmentYield: marketContext.matchedSegment?.indicativeGrossYield?.grossYieldPercent,
        }
      : null,
    areaMarketDemand: areaMarketDemand?.available
      ? {
          available: true,
          scope: areaMarketDemand.scope,
          demandType: areaMarketDemand.demandType,
          propertyLevel: false,
          rentalDemand: false,
          band: areaMarketDemand.band,
          value: areaMarketDemand.value,
          source: areaMarketDemand.source,
          providerEndpoint: areaMarketDemand.providerEndpoint,
          retrievedAt: areaMarketDemand.retrievedAt,
          observationPeriod: areaMarketDemand.observationPeriod,
          sampleSize: areaMarketDemand.sampleSize,
          confidence: areaMarketDemand.confidence,
          totalForSale: areaMarketDemand.totalForSale,
          averageSalesPerMonth: areaMarketDemand.averageSalesPerMonth,
          turnoverPerMonth: areaMarketDemand.turnoverPerMonth,
          monthsOfInventory: areaMarketDemand.monthsOfInventory,
          daysOnMarket: areaMarketDemand.daysOnMarket,
          methodology: areaMarketDemand.methodology,
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'buyer_market',
          propertyLevel: false,
          rentalDemand: false,
          state: 'notAssessed',
        },
    propertySpecificDemand: {
      available: false,
      state: 'notAssessed',
      note: 'Property-specific buyer demand is not assessed from area-level PropertyData /demand.',
    },
    areaRentalDemand: areaRentalDemand?.available
      ? {
          available: true,
          scope: areaRentalDemand.scope,
          demandType: areaRentalDemand.demandType,
          propertyLevel: false,
          rentalDemand: true,
          band: areaRentalDemand.band,
          value: areaRentalDemand.value,
          source: areaRentalDemand.source,
          providerEndpoint: areaRentalDemand.providerEndpoint,
          retrievedAt: areaRentalDemand.retrievedAt,
          observationPeriod: areaRentalDemand.observationPeriod,
          sampleSize: areaRentalDemand.sampleSize,
          confidence: areaRentalDemand.confidence,
          totalForRent: areaRentalDemand.totalForRent,
          transactionsPerMonth: areaRentalDemand.transactionsPerMonth,
          turnoverPerMonth: areaRentalDemand.turnoverPerMonth,
          monthsOfInventory: areaRentalDemand.monthsOfInventory,
          daysOnMarket: areaRentalDemand.daysOnMarket,
          radius: areaRentalDemand.radius,
          radiusUnit: areaRentalDemand.radiusUnit,
          methodology: areaRentalDemand.methodology,
        }
      : {
          available: false,
          scope: 'area',
          demandType: 'rental_market',
          propertyLevel: false,
          rentalDemand: true,
          state: 'notAssessed',
        },
    propertySpecificTenantDemand: {
      available: false,
      state: 'notAssessed',
      note: 'Property-specific tenant demand is not assessed from area-level PropertyData /demand-rent.',
    },
    propertyFacts: publicPropertyFactsForExplanation(propertyFacts),
  };

  stamp('explanation', 'Preparing AI explanation');
  const explanation = options.skipExplanation
    ? { summary: templateSummary(structuredFacts), source: 'template', model: null, tokensUsed: 0 }
    : await explainFn(structuredFacts);

  const identity = buildCanonicalIdentity(property, access, externalEnrichment, target);

  const insufficientData =
    !dataQuality.sufficientForAnalysis && comparableCount === 0 && !monthlyRent && !rentIntel?.success;

  const report = {
    success: true,
    insufficientData,
    analysisMode: 'canonical',
    engineVersion: CANONICAL_ENGINE_VERSION,
    evidenceAsOf,
    analysisDate: evidenceAsOf,
    modelVersion: CANONICAL_ENGINE_VERSION,
    identity,
    stages,
    property: {
      id: property.id,
      listingId: identity.listingId,
      subjectId: identity.subjectId,
      uprn: identity.uprn,
      title: property.title,
      address: property.address_display,
      main_image: property.main_image,
      property_type: property.property_type,
      property_category: property.property_category,
      category: property.category,
      price: property.price,
      monthly_rent: monthlyRent,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      square_feet: property.square_feet,
      epc_rating: property.epc_rating,
      tenure: property.tenure,
      council_tax_band: property.council_tax_band,
      council_tax_status: property.council_tax_status,
      year_built: property.year_built,
      last_sold_price: property.last_sold_price,
      last_sold_date: property.last_sold_date,
      status: property.status,
      observedFields: listingCharges,
      propertyDataEvidence,
      openDataAttributes: propertyDataEvidence?.openDataAttributes || null,
      propertyFacts,
    },
    propertyFacts,
    inputSnapshot: {
      propertyId: identity.listingId,
      listingId: identity.listingId,
      subjectId: identity.subjectId,
      uprn: identity.uprn,
      options: analysisOptions,
      finance: {
        version: FINANCE_INPUT_VERSION,
        persistence: 'request_scoped',
        notPropertyTruth: true,
        notUserFinanceProfile: true,
        notListingAttribute: true,
        submitted: analysisOptions,
      },
      fieldsUsed: Object.keys(property).filter(
        (k) => property[k] !== null && property[k] !== undefined && property[k] !== ''
      ),
    },
    dataQuality,
    scores,
    labels: scores.labels,
    confidence,
    executiveSummary: explanation.summary,
    explanation,
    snapshot: {
      price: property.price,
      rent: monthlyRent > 0 ? monthlyRent : rentIntel?.recommendedRent || null,
      size: property.square_feet,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      epc: property.epc_rating,
      propertyType: property.property_type,
      tenure: property.tenure,
      councilTaxBand: property.council_tax_band,
      yearBuilt: property.year_built,
      lastSoldPrice: property.last_sold_price,
      lastSoldDate: property.last_sold_date,
    },
    marketIntelligence: {
      rent: rentIntel,
      sale: saleValuation,
      pricePosition,
      marketContext,
      decisionContext,
      areaMarketDemand,
      propertySpecificDemand: {
        available: false,
        state: 'notAssessed',
        note: 'Property-specific buyer demand is not assessed from area-level PropertyData /demand.',
      },
      areaRentalDemand,
      propertySpecificTenantDemand: {
        available: false,
        state: 'notAssessed',
        note: 'Property-specific tenant demand is not assessed from area-level PropertyData /demand-rent.',
      },
      postcodeIntelligence: postcodeIntelligence?.success ? postcodeIntelligence : null,
      comparableCount,
      saleComparableCount: saleValuation?.internalComparables?.length || 0,
      modelPerformance: {
        available: comparableCount >= 20,
        note:
          comparableCount >= 20
            ? 'Sufficient comparable sample for weighted median estimation.'
            : 'Model unavailable because insufficient training data for advanced regression. Using weighted comparable analysis.',
      },
    },
    investment,
    financeRequest,
    personalDecision,
    opportunities,
    risks,
    strengths,
    weaknesses,
    documents,
    recommendation,
    externalIntelligence: externalEnrichment,
    professionalInsights:
      isProfessional && marketingGaps.length > 0
        ? {
            marketingGaps,
            listingQualityNote:
              'Marketing and listing-quality insights are available because you manage this property.',
          }
        : null,
    assumptions: {
      dataSources: externalEnrichment?.sources?.length
        ? externalEnrichment.sources
        : ['application_database'],
      mortgageDefaultsUsed: false,
      comparablesSource: saleValuation?.internalComparables?.length
        ? 'Internal approved listings + external market data where configured'
        : 'Internal approved listings only',
      externalProvidersConfigured: isExternalEnrichmentAvailable(),
    },
    disclaimer:
      'This analysis is generated from available property data and stated assumptions. It is an analytical estimate and is not financial, investment, legal, valuation or tax advice.',
  };

  return applyReportAccessPolicy(report, access);
}

module.exports = {
  runFullPropertyAnalysis,
  assemblePropertyIntelligenceReport,
  buildInvestmentInput,
  CANONICAL_ENGINE_VERSION,
};
