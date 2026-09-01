/**
 * Full property intelligence analysis — deterministic engine + structured facts for LLM.
 */

const { fetchPropertyForIntelligence, getMonthlyRent, toListingNumber } = require('./propertyDataAggregator');
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
const { extractCanonicalAddress } = require('../identity/canonicalAddress');
const { CANONICAL_IDENTITY_VERSION } = require('../../architecture/canonicalIdentity');
const { isExternalEnrichmentAvailable } = require('../../config/propertyIntelligence.config');
const {
  logIntelligenceFailure,
  EXTERNAL_ENRICHMENT_FAILED_PUBLIC,
} = require('./propertyIntelligenceProduction');
const { calculatePropertyValuation } = require('./valuationEngine');
const { calculatePricePosition } = require('./pricePositionEngine');
const {
  ASSESSMENT_SAFETY_VERSION,
  isDefensibleAssessedValuation,
} = require('./valuationAssessmentSafety');
const {
  getPostcodeMarketIntelligence,
  buildPropertyMarketContext,
  buildDecisionContext,
} = require('./postcodeMarketIntelligenceService');
const { listingObservedCharges } = require('./listingObservedFields');
const {
  resolveRuntimeClassification,
  residentialMethodologyGate,
  unsupportedResidentialValuation,
  unsupportedResidentialRent,
  attachIdentityBoundary,
  attachPersistedClassification,
} = require('../identity/assetClassificationRuntime');
const { evaluatePlatformApplicability } = require('../identity/domainApplicability');
const { attachPlanningDomain } = require('../domains/planningDomain');
const { attachEnvironmentDomain } = require('../domains/environmentDomain');
const { attachLegalTitleFoundation } = require('../domains/legalTitleDomain');
const { attachMarketDomain } = require('../domains/marketDomain');
const { composeLiveDomainEnvelopes } = require('../domains/composeLiveDomains');
const { resolveMarketAcquisitionPolicy } = require('../identity/marketAcquisitionPolicy');
const { loadLegalEvidenceForAnalysis, snapshotLegalEvidence } = require('../evidence/legalEvidenceConsumer');
const {
  queryOfficialSaleTransactions,
  emptyResult,
} = require('../market/officialSaleTransactionQuery');
const { IMPORT_STATUS } = require('../../architecture/officialSaleTransaction');
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
  getSchoolEvidence,
  unattachedSchoolFact,
  notAssessedSchools,
  UNAVAILABLE_REASONS: SCHOOL_UNAVAILABLE_REASONS,
} = require('./schoolEvidence');
const {
  getListedBuildingEvidence,
  unattachedListedBuildingFact,
  notAssessedListedBuilding,
  UNAVAILABLE_REASONS: LISTED_BUILDING_UNAVAILABLE_REASONS,
} = require('./listedBuildingEvidence');
const {
  getConservationAreaEvidence,
  unattachedConservationAreaFact,
  notAssessedConservationArea,
  UNAVAILABLE_REASONS: CONSERVATION_AREA_UNAVAILABLE_REASONS,
} = require('./conservationAreaEvidence');
const {
  getArticle4Evidence,
  unattachedArticle4Fact,
  notAssessedArticle4,
  UNAVAILABLE_REASONS: ARTICLE_4_UNAVAILABLE_REASONS,
} = require('./article4Evidence');
const {
  attachFinanceInputsToDecisionContext,
  publicFinanceInputsForExplanation,
  parseFinancePayload,
  parseAnalyseFinanceRequest,
  pickRecognisedFinanceKeys,
  buildFinanceRequestTransparency,
  resolveRentBasis,
  resolvePurchasePriceBasis,
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
const { assembleDecisionIntelligence } = require('./decisionIntelligence');
const { explainDecisionIntelligence } = require('./decisionIntelligenceExplanation');
const { buildRisks } = require('./legacyHeuristicIntelligence');
const CANONICAL_ENGINE_VERSION = 'property-intelligence-v2';

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
    skipSchools,
    schools,
    schoolEvidence,
    schoolScore,
    catchment,
    educationScore,
    skipListedBuilding,
    listedBuilding,
    listedBuildingEvidence,
    listedBuildings,
    listed,
    heritageScore,
    listedBuildingScore,
    listedScore,
    heritageRiskScore,
    skipConservationArea,
    conservationArea,
    conservationAreaEvidence,
    conservationEvidence,
    conservationScore,
    skipArticle4,
    article4,
    article4Evidence,
    article4Direction,
    article4Score,
    article4Restrictions,
    article4DirectionArea,
    article4Areas,
    article4Membership,
    permittedDevelopmentRights,
    permittedDevelopmentRight,
    pdRights,
    restrictionSchedule,
    decisionIntelligence,
    unresolvedDependencies,
    investigationPriorities,
    importance,
    importanceScore,
    evidenceRefs,
    affects,
    dependencyScore,
    dependencyScores,
    materialFindings,
    materialFinding,
    findingScore,
    materialityScore,
    effect,
    findingImportance,
    sensitivityDrivers,
    sensitivityDriver,
    sensitivityScore,
    rankScore,
    driverImportance,
    directionality,
    dependencyGraph,
    explanation,
    overview,
    currentDriversSummary,
    unresolvedSummary,
    verificationSummary,
    sensitivitySummary,
    generatedExplanation,
    llmInstructions,
    systemPrompt,
    systemPrompts,
    propertyFacts,
    riskScore,
    floodScore,
    planningScore,
    developmentScore,
    asOf,
    providerCallLog,
    skipValidation,
    skipOfficialSales,
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
  const persisted = externalEnrichment?.identity || {};
  const listing = extractCanonicalAddress(property || {});
  const uprn =
    access?.uprn ?? property?.uprn ?? persisted.uprn ?? null;
  let source = property?.source || access?.source || persisted.identity_source || persisted.identitySource || null;
  if (!source) {
    if (subjectId && listingId) source = 'linked_marketplace_listing';
    else if (subjectId) source = 'intelligence_subject';
    else source = 'marketplace_listing';
  }
  const paon = persisted.paon || listing.paon || null;
  const saon = persisted.saon || listing.saon || null;
  const postcode = persisted.postcode || listing.postcode || property?.zip_code || property?.postcode || null;
  const verificationState =
    persisted.verification_state || persisted.verificationState || listing.verificationState || 'UNRESOLVED';
  return {
    listingId,
    subjectId,
    uprn,
    paon,
    saon,
    postcode,
    postcodeCompact: persisted.postcode_compact || persisted.postcodeCompact || listing.postcodeCompact || null,
    canonicalAddress: persisted.normalized_address || persisted.canonicalAddress || listing.canonicalAddress || null,
    identitySource: persisted.identity_source || persisted.identitySource || listing.identitySource || source,
    evidenceSourceType: persisted.evidence_source_type || persisted.evidenceSourceType || listing.evidenceSourceType || null,
    verificationState,
    identityState: persisted.identity_state || persisted.identityState || listing.identityState || verificationState,
    retrievedAt: persisted.retrieved_at || persisted.retrievedAt || listing.retrievedAt || null,
    identityContractVersion: persisted.identity_contract_version || CANONICAL_IDENTITY_VERSION,
    source,
    listingIdIsNotUprn: listingId == null || String(listingId) !== String(uprn || ''),
    uprnIsNotListingId: !uprn || String(uprn) !== String(listingId || ''),
    uprnIsNotTitleNumber: true,
    inferredIsNotVerified: true,
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
    property = await attachPersistedClassification(property, access, target);
    const subjectAcquisition = resolveMarketAcquisitionPolicy({
      classification: resolveRuntimeClassification({ property, access, target, options }),
      property,
    });
    mark('enrichment', 'Loading external property intelligence');
    try {
      const subject = await require('../enrichment/intelligenceSubjectRepository').findSubjectById(
        target.subjectId
      );
      externalEnrichment = await enrichSubjectForIntelligence(subject, property, userId, {
        acquisition: subjectAcquisition,
      });
    } catch (err) {
      logIntelligenceFailure('enrichSubjectForIntelligence', err);
      externalEnrichment = {
        available: false,
        partial: true,
        error: 'EXTERNAL_ENRICHMENT_FAILED',
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

    property = await attachPersistedClassification(property, access, target);
    const listingClassification = resolveRuntimeClassification({
      property,
      access,
      target,
      options,
    });
    const listingAcquisition = resolveMarketAcquisitionPolicy({
      classification: listingClassification,
      property,
    });

    mark('enrichment', 'Loading external property intelligence');
    if (isExternalEnrichmentAvailable()) {
      try {
        externalEnrichment = await enrichPropertyForIntelligence(property, {
          userId,
          uprn: property.uprn || access?.uprn || null,
          subjectId: property.subjectId || access?.subjectId || null,
          classification: listingClassification,
          acquisition: listingAcquisition,
          allowPaidIdentity: false,
        });
      } catch (err) {
        logIntelligenceFailure('enrichPropertyForIntelligence', err);
        externalEnrichment = {
          available: false,
          partial: true,
          error: 'EXTERNAL_ENRICHMENT_FAILED',
          message: EXTERNAL_ENRICHMENT_FAILED_PUBLIC,
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

  property = await attachPersistedClassification(property, access, target);

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

  let schoolEvidence = unattachedSchoolFact();
  if (options.skipSchools) {
    schoolEvidence = unattachedSchoolFact({
      note: 'School evidence was not retrieved for this assembly. Missing schools is not “no schools”, and nearby is not catchment.',
    });
  } else {
    stamp('school_evidence', 'Retrieving DfE educational establishment evidence');
    try {
      noteCanonicalStep(options, 'school_evidence');
      const getSchoolEvidenceFn = deps.getSchoolEvidence || getSchoolEvidence;
      schoolEvidence = await getSchoolEvidenceFn(property, {
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
      schoolEvidence = notAssessedSchools({
        reason: SCHOOL_UNAVAILABLE_REASONS.providerUnavailable,
        note: 'The educational-establishment service could not be reached. Missing schools is not “no schools”.',
        identity: {
          listingId: property.id ?? target.propertyId ?? null,
          uprn: property.uprn ?? access?.uprn ?? null,
        },
      });
    }
  }

  let listedBuildingEvidence = unattachedListedBuildingFact();
  if (options.skipListedBuilding) {
    listedBuildingEvidence = unattachedListedBuildingFact({
      note: 'Listed-building evidence was not retrieved for this assembly. Missing listed-building status is not “not listed”.',
    });
  } else {
    stamp('listed_building_evidence', 'Retrieving Historic England listed-building evidence');
    try {
      noteCanonicalStep(options, 'listed_building_evidence');
      const getListedBuildingEvidenceFn = deps.getListedBuildingEvidence || getListedBuildingEvidence;
      listedBuildingEvidence = await getListedBuildingEvidenceFn(property, {
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
      listedBuildingEvidence = notAssessedListedBuilding({
        reason: LISTED_BUILDING_UNAVAILABLE_REASONS.providerUnavailable,
        note: 'The listed-building service could not be reached. Missing listed-building status is not “not listed”.',
        identity: {
          listingId: property.id ?? target.propertyId ?? null,
          uprn: property.uprn ?? access?.uprn ?? null,
        },
      });
    }
  }

  let conservationAreaEvidence = unattachedConservationAreaFact();
  if (options.skipConservationArea) {
    conservationAreaEvidence = unattachedConservationAreaFact({
      note: 'Conservation-area evidence was not retrieved for this assembly. Missing conservation-area status is not “not in a conservation area”.',
    });
  } else {
    stamp('conservation_area_evidence', 'Retrieving conservation-area membership evidence');
    try {
      noteCanonicalStep(options, 'conservation_area_evidence');
      const getConservationAreaEvidenceFn = deps.getConservationAreaEvidence || getConservationAreaEvidence;
      conservationAreaEvidence = await getConservationAreaEvidenceFn(property, {
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
      conservationAreaEvidence = notAssessedConservationArea({
        reason: CONSERVATION_AREA_UNAVAILABLE_REASONS.providerUnavailable,
        note: 'The conservation-area service could not be reached. Missing conservation-area status is not “not in a conservation area”.',
        identity: {
          listingId: property.id ?? target.propertyId ?? null,
          uprn: property.uprn ?? access?.uprn ?? null,
        },
      });
    }
  }

  let article4Evidence = unattachedArticle4Fact();
  if (options.skipArticle4) {
    article4Evidence = unattachedArticle4Fact({
      note: 'Article 4 evidence was not retrieved for this assembly. Missing Article 4 status is not “not in an Article 4 area”.',
    });
  } else {
    stamp('article_4_evidence', 'Retrieving Article 4 direction-area membership evidence');
    try {
      noteCanonicalStep(options, 'article_4_evidence');
      const getArticle4EvidenceFn = deps.getArticle4Evidence || getArticle4Evidence;
      article4Evidence = await getArticle4EvidenceFn(property, {
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
      article4Evidence = notAssessedArticle4({
        reason: ARTICLE_4_UNAVAILABLE_REASONS.providerUnavailable,
        note: 'The Article 4 service could not be reached. Missing Article 4 status is not “not in an Article 4 area”.',
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
    schoolEvidence,
    listedBuildingEvidence,
    conservationAreaEvidence,
    article4Evidence,
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

  const assetClassification = resolveRuntimeClassification({
    property,
    access,
    target,
    options,
  });
  const methodologyGate = residentialMethodologyGate(assetClassification);

  let postcodeIntelligence = null;
  let marketContext = null;
  let decisionContext = null;
  const postcodeForMarket = property.zip_code || property.postcode;
  if (postcodeForMarket && !options.skipPostcodeMarket) {
    try {
      noteCanonicalStep(options, 'postcode_market');
      postcodeIntelligence = await postcodeFn(postcodeForMarket, {
        userId,
        skipResidentialRents: !methodologyGate.allowed,
      });
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
  if (!methodologyGate.allowed) {
    saleValuation = unsupportedResidentialValuation(methodologyGate);
    pricePosition = {
      success: false,
      notAssessed: true,
      assessmentState: 'notAssessed',
      message: methodologyGate.note,
      askingPrice: Number(property.price) || null,
    };
  } else if (property.category === 'sale' || Number(property.price) > 0) {
    noteCanonicalStep(options, 'valuation');
    try {
      saleValuation = await valuationFn(property, externalEnrichment);
      if (isDefensibleAssessedValuation(saleValuation)) {
        pricePosition = calculatePricePosition(Number(property.price), saleValuation);
      } else if (saleValuation) {
        pricePosition = {
          success: false,
          notAssessed: true,
          assessmentState: 'notAssessed',
          message: saleValuation.message || 'Sale valuation was not assessed.',
          askingPrice: Number(property.price) || null,
        };
      }
    } catch {
      saleValuation = {
        success: false,
        insufficientEvidence: true,
        message: 'Valuation service could not be reached.',
      };
    }
  }

  stamp('comparables', 'Finding comparable properties');
  let rentIntel = null;
  const canEstimateRent =
    (property.city || property.zip_code) &&
    (monthlyRent > 0 || property.category === 'sale' || Number(property.price) > 0);
  if (!methodologyGate.allowed) {
    rentIntel = unsupportedResidentialRent(methodologyGate);
  } else if (canEstimateRent) {
    noteCanonicalStep(options, 'rent');
    try {
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
    } catch {
      rentIntel = {
        success: false,
        message: 'Rental intelligence could not be reached.',
        comparables: [],
      };
    }
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
  const listingAskingPrice = toListingNumber(property.price);
  const listingMonthlyRent = monthlyRent;
  const marketRent = rentIntel?.recommendedRent || rentIntel?.estimatedRent || null;
  const scenarioPurchasePrice = financeContractPreview.fields.purchasePrice?.available
    ? financeContractPreview.fields.purchasePrice.value
    : null;
  const scenarioExpectedRent = financeContractPreview.fields.expectedRent?.available
    ? financeContractPreview.fields.expectedRent.value
    : null;
  const priceBasis = resolvePurchasePriceBasis({
    listingAskingPrice,
    scenarioPurchasePrice,
  });
  const rentBasis = resolveRentBasis({
    listingMonthlyRent,
    marketRent,
    scenarioExpectedRent,
  });
  const purchasePriceBase = priceBasis.selectedPrice;
  const rentForInvestment = rentBasis.selectedRent;

  if (purchasePriceBase > 0 && rentForInvestment > 0) {
    prepared = prepareEvidencedInvestment({
      purchasePrice: purchasePriceBase,
      expectedRent: rentForInvestment,
      options: analysisOptions,
      property,
      propertyFacts,
    });
    const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
    metrics.rentBasis = rentBasis;
    const presented = presentEvidencedInvestment(metrics, prepared.operatingCostEvidence, { rentBasis });
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
      rentBasis,
      expectedRentIsNotMarketRent: rentBasis.kind !== 'MARKET',
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
    listingAskingPrice,
    listingMonthlyRent,
    marketRent,
    propertyFacts,
    calculationInput: prepared?.input || null,
  });
  if (investment && !investment.partial) {
    investment.financeRequest = financeRequest;
  }

  const marketingGaps = isProfessional ? detectMarketingGaps(property) : [];
  const documents = buildDocumentIntelligence(property);

  stamp('scoring', 'Calculating intelligence scores');
  const comparableCount = rentIntel?.comparables?.length || 0;
  const avgSimilarity =
    comparableCount > 0
      ? rentIntel.comparables.reduce((s, c) => s + c.similarity, 0) / comparableCount
      : null;

  // TECHNICAL DEBT: buildRisks is still invoked so Personal Decision dimensions.risk
  // and What-if re-score from report.risks stay numerically stable. Invented
  // probability / riskExposure must not enter Decision Intelligence or the
  // property-overview narrative. Do not change this scoring input in a cleanup phase.
  const risks = buildRisks(property, rentIntel, investment, dataQuality);

  const scores = calculateIntelligenceScores({
    property,
    dataQuality,
    rentIntel,
    investment,
    risks,
    opportunities: null,
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
      opportunities: null,
      comparableCount,
      presentedInvestment: investment?.presented || null,
    }),
    asOf: options.asOf || evidenceAsOf,
  });

  const decisionIntelligence = assembleDecisionIntelligence({
    propertyFacts,
    investment,
    personalDecision,
    evidenceAsOf,
    rentIntel,
    pricePosition,
    financeRequest,
  });
  try {
    decisionIntelligence.explanation = await explainDecisionIntelligence({
      decisionIntelligence,
      personalDecision,
      confidence,
      skipLlm: options.skipExplanation,
      generateJson: deps.generateDecisionIntelligenceExplanation || null,
    });
  } catch {
    decisionIntelligence.explanation = await explainDecisionIntelligence({
      decisionIntelligence,
      personalDecision,
      confidence,
      skipLlm: true,
    });
  }

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
          rentBasis: investment.rentBasis
            ? {
                kind: investment.rentBasis.kind,
                label: investment.rentBasis.label,
                marketSubstitutedForMissingListing: Boolean(
                  investment.rentBasis.marketSubstitutedForMissingListing
                ),
              }
            : null,
          grossYieldBasis: investment.presented.grossYieldBasis || investment.presented.grossYield?.basis || null,
          expectedRentIsNotMarketRent: investment.expectedRentIsNotMarketRent !== false,
          scenarioIsNotObservedResult: Boolean(investment.scenarioIsNotObservedResult),
        }
      : null,
    externalEnrichment: externalEnrichment?.available
      ? {
          uprn: externalEnrichment.identity?.uprn || null,
          sources: externalEnrichment.sources,
          hasSoldPrices: Boolean(externalEnrichment.enrichments?.sold_prices?.success),
          hasValuation: Boolean(externalEnrichment.enrichments?.valuation_sale?.success),
        }
      : null,
    saleValuation: isDefensibleAssessedValuation(saleValuation)
      ? {
          centralEstimate: saleValuation.centralEstimate?.value ?? saleValuation.centralEstimate,
          lowerEstimate: saleValuation.lowerEstimate?.value ?? saleValuation.lowerEstimate,
          upperEstimate: saleValuation.upperEstimate?.value ?? saleValuation.upperEstimate,
          confidence: saleValuation.confidence,
          evidenceCount: saleValuation.evidenceCount,
        }
      : null,
    pricePosition: pricePosition?.success && !pricePosition?.notAssessed
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
  let explanation;
  try {
    explanation = options.skipExplanation
      ? { summary: templateSummary(structuredFacts), source: 'template', model: null, tokensUsed: 0 }
      : await explainFn(structuredFacts);
  } catch {
    explanation = {
      summary: templateSummary(structuredFacts),
      source: 'template',
      model: null,
      tokensUsed: 0,
    };
  }

  const identity = attachIdentityBoundary(
    buildCanonicalIdentity(property, access, externalEnrichment, target),
    assetClassification
  );

  const planningAttachment = attachPlanningDomain({
    planningEvidence: propertyFacts?.facts?.planning || planningEvidence,
    identity,
    assetClassification,
    analysisAt: evidenceAsOf,
  });
  const environmentAttachment = attachEnvironmentDomain({
    floodEvidence: propertyFacts?.facts?.flood || floodEvidence,
    identity,
    assetClassification,
    analysisAt: evidenceAsOf,
  });
  let legalDocuments = [];
  let legalTitleRefs = [];
  try {
    const loaded = await loadLegalEvidenceForAnalysis({
      ownerUserId: userId,
      propertyId: target.propertyId || property.id || access?.propertyId || null,
      subjectId: target.subjectId || access?.subjectId || null,
    });
    legalDocuments = loaded.documents || [];
    legalTitleRefs = loaded.titleRefs || [];
  } catch {
    legalDocuments = [];
    legalTitleRefs = [];
  }
  const legalAttachment = attachLegalTitleFoundation({
    propertyFacts,
    listingTenure: property.tenure || propertyFacts?.facts?.tenure?.value || null,
    documents: legalDocuments,
    titleRefs: legalTitleRefs,
    identity,
    assetClassification,
    analysisAt: evidenceAsOf,
  });
  let officialSales = null;
  if (options.skipOfficialSales) {
    officialSales = null;
  } else {
    try {
      const queryOfficialSalesFn = deps.queryOfficialSaleTransactions || queryOfficialSaleTransactions;
      officialSales = await queryOfficialSalesFn({
        identity,
        property,
        store: deps.officialSaleStore || null,
      });
      noteCanonicalStep(options, 'official_sale_transactions');
    } catch {
      officialSales = emptyResult(IMPORT_STATUS.SOURCE_NOT_AVAILABLE, {
        officialTransactionSourceAvailable: false,
      });
    }
  }
  const marketAttachment = attachMarketDomain({
    property,
    identity,
    assetClassification,
    externalEnrichment,
    comparableCount,
    saleComparableCount: saleValuation?.internalComparables?.length || 0,
    analysisAt: evidenceAsOf,
    officialSales,
  });
  const liveDomains = composeLiveDomainEnvelopes([
    marketAttachment.marketDomain,
    planningAttachment.planningDomain,
    environmentAttachment.environmentDomain,
    legalAttachment.legalTitleDomain,
  ]);

  const insufficientData =
    !dataQuality.sufficientForAnalysis && comparableCount === 0 && !monthlyRent && !rentIntel?.success;

  const report = {
    success: true,
    insufficientData,
    analysisMode: 'canonical',
    engineVersion: CANONICAL_ENGINE_VERSION,
    assessmentSafetyVersion: ASSESSMENT_SAFETY_VERSION,
    evidenceAsOf,
    analysisDate: evidenceAsOf,
    modelVersion: CANONICAL_ENGINE_VERSION,
    identity,
    assetClassification,
    residentialMethodology: methodologyGate,
    domainApplicability: evaluatePlatformApplicability({
      assetClass: assetClassification.assetClass,
      subjectKind: identity.entityKind,
    }),
    marketDomain: marketAttachment.marketDomain,
    planningDomain: planningAttachment.planningDomain,
    environmentDomain: environmentAttachment.environmentDomain,
    legalTitleDomain: {
      ...legalAttachment.legalTitleDomain,
      documents: snapshotLegalEvidence(legalDocuments),
    },
    domains: liveDomains,
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
      monthly_rent: listingMonthlyRent,
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
      assetClassification,
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
      rent: listingMonthlyRent,
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
    decisionIntelligence,
    // Retained for Personal Decision risk scoring and What-if re-score from
    // saved output. Not a landlord decision narrative. UI hides this when
    // Decision Intelligence is present.
    risks,
    documents,
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
