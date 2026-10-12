/**
 * Bounded residential comparable assessment from official HMLR PPD rows.
 * Does not mutate valuation, finance, PD, DI, or What-if.
 * Does not extend listing comparableEngine.js.
 */

const { compactPostcode } = require('./hmlrPricePaidParser');
const { canonicalPropertyTypeToken } = require('../../utils/canonicalPropertyType');
const {
  METHODOLOGY_ID,
  METHODOLOGY_VERSION,
  ASSESSMENT,
  SIMILARITY,
  SUFFICIENCY_MIN_HIGH_COMPARABLES,
  SUFFICIENCY_MIN_COMPARABLES,
  MARKET_CONTEXT_MIN_TRANSACTIONS,
  MAX_RECENCY_YEARS,
  HIGH_RECENCY_YEARS,
  CANDIDATE_LIMIT_POSTCODE,
  CANDIDATE_LIMIT_DISTRICT,
  UX_COMPARABLE_LIMIT,
  UX_MARKET_CONTEXT_LIMIT,
  PPD_TYPE_TO_LABEL,
  LABEL_TO_PPD,
  DEFAULT_LIMITATIONS,
} = require('../../architecture/officialTransactionComparableAssessment');
const { PPD_PROPERTY_TYPE } = require('../../architecture/officialSaleTransaction');

function emptyAssessment(state, extras = {}) {
  return {
    methodologyId: METHODOLOGY_ID,
    methodologyVersion: METHODOLOGY_VERSION,
    assessment: state,
    asOf: extras.asOf || null,
    subject: extras.subject || null,
    candidateCount: extras.candidateCount || 0,
    eligibleCount: extras.eligibleCount || 0,
    relevantMarketTransactionCount: extras.relevantMarketTransactionCount || 0,
    defensibleComparableCount: 0,
    comparableCount: 0,
    comparables: [],
    marketContextTransactions: [],
    similarityQuality: extras.similarityQuality || null,
    funnel: extras.funnel || null,
    observedSoldPriceRange: null,
    observedMedian: null,
    observedLocalTransactionRange: null,
    observedLocalMedian: null,
    observedComparableRange: null,
    observedComparableMedian: null,
    evidenceStrength: null,
    limitations: [...DEFAULT_LIMITATIONS, ...(extras.limitations || [])],
    unresolvedDependencies: extras.unresolvedDependencies || [],
    investigationPriorities: extras.investigationPriorities || [],
    exclusionTallies: extras.exclusionTallies || {},
    searchHierarchy: extras.searchHierarchy || [],
    provenance: {
      source: 'HMLR_PRICE_PAID_DATA',
      provenanceClass: 'OFFICIAL',
      notValuation: true,
      notDealQuality: true,
      notDefensibleComparableUnlessAssessed: true,
    },
    reasonCode: extras.reasonCode || null,
    message: extras.message || null,
  };
}

function postcodeDistrict(compact) {
  if (!compact || compact.length < 2) return null;
  // Outward code: all but last 3 inward characters.
  if (compact.length <= 3) return compact;
  return compact.slice(0, -3);
}

function parseAsOf(raw) {
  if (raw == null || raw === '') return new Date();
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function yearsBetween(earlier, later) {
  const ms = later.getTime() - earlier.getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

function mapSubjectToPpdType(property = {}, identity = {}) {
  const code = property.property_type_code
    || identity.property_type_code
    || property.hmlrPropertyTypeCode
    || null;
  if (code && PPD_TYPE_TO_LABEL[code]) return code;

  const token = canonicalPropertyTypeToken(
    property.property_type || property.propertyType || identity.propertyType || ''
  );
  if (!token) return null;
  if (LABEL_TO_PPD[token]) return LABEL_TO_PPD[token];
  // soft contains
  if (token.includes('detach') && !token.includes('semi')) return 'D';
  if (token.includes('semi')) return 'S';
  if (token.includes('terrace')) return 'T';
  if (token.includes('flat') || token.includes('apartment') || token.includes('maisonette')) return 'F';
  return null;
}

function isSelfMatch(row, subject = {}) {
  if (!row) return false;
  if (subject.excludeTransactionIds
    && subject.excludeTransactionIds.includes(row.source_transaction_id)) {
    return true;
  }
  if (subject.uprn && row.uprn && String(subject.uprn) === String(row.uprn)) {
    return true;
  }
  const subPc = compactPostcode(subject.postcode);
  const rowPc = compactPostcode(row.postcode_compact || row.postcode);
  if (subPc && rowPc && subPc === rowPc && subject.paon) {
    const paonMatch = String(row.paon || '').toUpperCase() === String(subject.paon).toUpperCase();
    if (paonMatch) {
      const subSaon = subject.saon ? String(subject.saon).toUpperCase() : '';
      const rowSaon = row.saon ? String(row.saon).toUpperCase() : '';
      if (subSaon === rowSaon) return true;
    }
  }
  return false;
}

function hardEligibility(row, {
  asOf,
  ppdType,
  subject,
  geographyMode,
  postcodeCompact,
  district,
}) {
  const reasons = [];
  if (row.live === false) reasons.push('not_live');
  const price = Number(row.price_gbp);
  if (!(row.price_present === true && Number.isFinite(price) && price > 0)) {
    reasons.push('invalid_price');
  }
  if (!row.transfer_date) reasons.push('missing_transfer_date');
  const txDate = row.transfer_date ? new Date(row.transfer_date) : null;
  if (txDate && Number.isNaN(txDate.getTime())) reasons.push('invalid_transfer_date');
  if (txDate && txDate.getTime() > asOf.getTime()) reasons.push('after_as_of');
  if (txDate && yearsBetween(txDate, asOf) > MAX_RECENCY_YEARS) reasons.push('too_old');
  if (!row.property_type_code || row.property_type_code === 'O') reasons.push('unsupported_type');
  if (ppdType && row.property_type_code !== ppdType) reasons.push('type_mismatch');
  if (isSelfMatch(row, subject)) reasons.push('self_match');

  const rowCompact = compactPostcode(row.postcode_compact || row.postcode);
  if (geographyMode === 'postcode') {
    if (!postcodeCompact || rowCompact !== postcodeCompact) reasons.push('geography_mismatch');
  } else if (geographyMode === 'district') {
    const rowDist = postcodeDistrict(rowCompact);
    if (!district || rowDist !== district) reasons.push('geography_mismatch');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Similarity (v1.1):
 * HIGH   — same postcode + type + ≤3y  → only tier that can form defensible comparables
 * MEDIUM — same postcode + type + ≤5y  → relevant market; not defensible alone
 * LOW    — same district + type + ≤5y  → relevant market context only
 * District sales are never HIGH or MEDIUM (v1.0 wrongly ranked district≤3y as MEDIUM).
 */
function similarityCategory(row, { asOf, postcodeCompact }) {
  const txDate = new Date(row.transfer_date);
  const ageYears = yearsBetween(txDate, asOf);
  const rowCompact = compactPostcode(row.postcode_compact || row.postcode);
  const samePostcode = Boolean(postcodeCompact && rowCompact === postcodeCompact);
  const reasons = [];
  const limitations = [];

  reasons.push(`Property type ${PPD_PROPERTY_TYPE[row.property_type_code] || row.property_type_code}`);
  if (samePostcode) reasons.push('Same postcode');
  else reasons.push('Same postcode district (market context only — not a defensible comparable)');

  if (ageYears <= HIGH_RECENCY_YEARS) reasons.push(`Sold within ${HIGH_RECENCY_YEARS} years of analysis date`);
  else if (ageYears <= MAX_RECENCY_YEARS) reasons.push(`Sold within ${MAX_RECENCY_YEARS} years of analysis date`);

  if (row.tenure_code === 'F') reasons.push('Freehold');
  if (row.tenure_code === 'L') reasons.push('Leasehold');

  limitations.push('Bedrooms/bathrooms/floor area not available on HMLR Price Paid for this transaction.');

  if (samePostcode && ageYears <= HIGH_RECENCY_YEARS) {
    return { category: SIMILARITY.HIGH, reasons, limitations };
  }
  if (samePostcode && ageYears <= MAX_RECENCY_YEARS) {
    return { category: SIMILARITY.MEDIUM, reasons, limitations };
  }
  if (!samePostcode && ageYears <= MAX_RECENCY_YEARS) {
    return { category: SIMILARITY.LOW, reasons, limitations };
  }
  return { category: SIMILARITY.INSUFFICIENT, reasons, limitations };
}

function priceStats(rows, label) {
  const prices = rows
    .map((s) => Number(s.row.price_gbp))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return { range: null, median: null };
  const med = median(prices);
  return {
    range: {
      lowGbp: Math.min(...prices),
      highGbp: Math.max(...prices),
      label,
      transactionCount: prices.length,
    },
    median: med != null
      ? {
        valueGbp: med,
        label: label.replace(/range/i, 'median'),
        transactionCount: prices.length,
      }
      : null,
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

function toComparableRow(row, sim, { includeAddress = true } = {}) {
  const price = Number(row.price_gbp);
  return {
    sourceTransactionId: row.source_transaction_id,
    soldPriceGbp: price,
    soldDate: row.transfer_date,
    postcode: row.postcode || null,
    locationDescriptor: includeAddress
      ? [row.paon, row.saon, row.street, row.postcode].filter(Boolean).join(', ')
      : (row.postcode || postcodeDistrict(compactPostcode(row.postcode_compact || row.postcode))),
    propertyTypeCode: row.property_type_code,
    propertyTypeLabel: PPD_TYPE_TO_LABEL[row.property_type_code] || null,
    tenureCode: row.tenure_code || null,
    uprn: row.uprn || null,
    inspireId: row.inspire_id || null,
    knownAttributes: {
      price: true,
      transferDate: true,
      propertyType: true,
      tenure: row.tenure_code != null,
      bedrooms: false,
      bathrooms: false,
      internalArea: false,
      constructionAge: false,
    },
    similarityCategory: sim.category,
    reasonsForSimilarity: sim.reasons,
    limitations: sim.limitations,
    provenance: {
      source: 'HMLR_PRICE_PAID_DATA',
      provenanceClass: 'OFFICIAL',
      datasetVersion: row.dataset_version || null,
    },
  };
}

/**
 * Pure assessment given already-fetched candidate rows.
 */
function assessOfficialTransactionComparables({
  candidates = [],
  property = {},
  identity = {},
  asOf: asOfRaw = null,
  geographyMode = 'postcode',
  searchHierarchy = [],
  includeAddress = true,
} = {}) {
  const asOf = parseAsOf(asOfRaw);
  if (!asOf) {
    return emptyAssessment(ASSESSMENT.INVALID_INPUT, {
      reasonCode: 'INVALID_AS_OF',
      message: 'Analysis as-of date is invalid.',
      unresolvedDependencies: [{ id: 'as_of', label: 'Valid analysis date' }],
      investigationPriorities: [{ id: 'as_of', title: 'Provide a valid analysis as-of date' }],
    });
  }

  const postcodeCompact = compactPostcode(
    property.zip_code || property.postcode || identity.postcode || null
  );
  if (!postcodeCompact) {
    return emptyAssessment(ASSESSMENT.INVALID_INPUT, {
      asOf: toDateOnly(asOf),
      reasonCode: 'MISSING_POSTCODE',
      message: 'Postcode is required for official comparable candidate generation.',
      unresolvedDependencies: [{ id: 'postcode', label: 'Subject postcode' }],
      investigationPriorities: [{ id: 'postcode', title: 'Confirm subject postcode' }],
    });
  }

  const ppdType = mapSubjectToPpdType(property, identity);
  if (!ppdType) {
    return emptyAssessment(ASSESSMENT.NOT_APPLICABLE, {
      asOf: toDateOnly(asOf),
      subject: { postcode: postcodeCompact, ppdType: null },
      candidateCount: candidates.length,
      reasonCode: 'TYPE_UNMAPPABLE',
      message: 'Subject property type cannot be mapped to a residential HMLR Price Paid type.',
      unresolvedDependencies: [{ id: 'property_type', label: 'Mappable residential property type' }],
      investigationPriorities: [{
        id: 'property_type',
        title: 'Confirm detached / semi-detached / terraced / flat',
      }],
      searchHierarchy,
    });
  }

  const subject = {
    postcode: postcodeCompact,
    paon: identity.paon || property.paon || property.house_number || null,
    saon: identity.saon || property.saon || property.flat_number || null,
    uprn: identity.uprn || property.uprn || null,
    excludeTransactionIds: property.excludeTransactionIds || identity.excludeTransactionIds || [],
    ppdType,
  };

  const district = postcodeDistrict(postcodeCompact);
  const exclusionTallies = {};
  const eligible = [];

  for (const row of candidates) {
    const { ok, reasons } = hardEligibility(row, {
      asOf,
      ppdType,
      subject,
      geographyMode,
      postcodeCompact,
      district,
    });
    if (!ok) {
      reasons.forEach((r) => {
        exclusionTallies[r] = (exclusionTallies[r] || 0) + 1;
      });
      continue;
    }
    eligible.push(row);
  }

  const scored = eligible.map((row) => {
    const sim = similarityCategory(row, { asOf, postcodeCompact });
    return { row, sim };
  });

  const similarityQuality = {
    high: scored.filter((s) => s.sim.category === SIMILARITY.HIGH).length,
    medium: scored.filter((s) => s.sim.category === SIMILARITY.MEDIUM).length,
    low: scored.filter((s) => s.sim.category === SIMILARITY.LOW).length,
    insufficient: scored.filter((s) => s.sim.category === SIMILARITY.INSUFFICIENT).length,
  };

  // Relevant market transactions: any HARD-eligible sale with assessable similarity (H/M/L).
  const relevantMarket = scored.filter((s) => (
    s.sim.category === SIMILARITY.HIGH
    || s.sim.category === SIMILARITY.MEDIUM
    || s.sim.category === SIMILARITY.LOW
  ));

  // Defensible comparables: HIGH only — same postcode + type + ≤3y.
  const defensiblePool = scored.filter((s) => s.sim.category === SIMILARITY.HIGH);

  const rankOrder = {
    [SIMILARITY.HIGH]: 0,
    [SIMILARITY.MEDIUM]: 1,
    [SIMILARITY.LOW]: 2,
  };
  const sortByQualityThenDate = (a, b) => {
    const cat = (rankOrder[a.sim.category] ?? 9) - (rankOrder[b.sim.category] ?? 9);
    if (cat !== 0) return cat;
    return String(b.row.transfer_date || '').localeCompare(String(a.row.transfer_date || ''));
  };
  defensiblePool.sort(sortByQualityThenDate);
  relevantMarket.sort(sortByQualityThenDate);

  const localStats = priceStats(
    relevantMarket,
    'Observed local transaction range (market context — not a valuation; not a defensible comparable set)'
  );
  const comparableStats = priceStats(
    defensiblePool,
    'Observed defensible comparable sold-price range (not a valuation)'
  );

  const defensibleOk = defensiblePool.length >= SUFFICIENCY_MIN_HIGH_COMPARABLES;
  const marketContextOk = !defensibleOk
    && relevantMarket.length >= MARKET_CONTEXT_MIN_TRANSACTIONS;

  let assessmentState = ASSESSMENT.INSUFFICIENT_EVIDENCE;
  if (defensibleOk) assessmentState = ASSESSMENT.ASSESSED;
  else if (marketContextOk) assessmentState = ASSESSMENT.MARKET_CONTEXT;

  const comparables = defensibleOk
    ? defensiblePool.slice(0, UX_COMPARABLE_LIMIT).map((s) => toComparableRow(s.row, s.sim, { includeAddress }))
    : [];
  const marketContextTransactions = relevantMarket
    .slice(0, UX_MARKET_CONTEXT_LIMIT)
    .map((s) => toComparableRow(s.row, s.sim, { includeAddress }));

  const evidenceStrength = defensibleOk
    ? 'MODERATE'
    : (marketContextOk ? 'LIMITED' : 'INSUFFICIENT');

  const funnel = {
    candidates: candidates.length,
    hardEligible: eligible.length,
    relevantMarketTransactions: relevantMarket.length,
    similarityAssessable: relevantMarket.length,
    defensibleComparables: defensiblePool.length,
    boundedComparables: defensiblePool.length,
    assessedOrInsufficient: assessmentState,
  };

  // Legacy aliases: comparable stats only when ASSESSED; else market-context stats with clear labels.
  const observedSoldPriceRange = defensibleOk
    ? comparableStats.range
    : (marketContextOk ? localStats.range : null);
  const observedMedian = defensibleOk
    ? comparableStats.median
    : (marketContextOk ? localStats.median : null);

  const base = {
    asOf: toDateOnly(asOf),
    subject: {
      postcode: postcodeCompact,
      district,
      ppdType,
      propertyTypeLabel: PPD_TYPE_TO_LABEL[ppdType],
      uprn: subject.uprn,
      paon: subject.paon,
      saon: subject.saon,
    },
    candidateCount: candidates.length,
    eligibleCount: eligible.length,
    relevantMarketTransactionCount: relevantMarket.length,
    defensibleComparableCount: defensiblePool.length,
    // comparableCount = defensible only (do not equate to market volume)
    comparableCount: defensiblePool.length,
    comparables,
    marketContextTransactions,
    similarityQuality,
    funnel,
    observedLocalTransactionRange: localStats.range,
    observedLocalMedian: localStats.median,
    observedComparableRange: defensibleOk ? comparableStats.range : null,
    observedComparableMedian: defensibleOk ? comparableStats.median : null,
    observedSoldPriceRange,
    observedMedian,
    evidenceStrength,
    exclusionTallies,
    searchHierarchy,
    limitations: [...DEFAULT_LIMITATIONS],
  };

  if (assessmentState === ASSESSMENT.ASSESSED) {
    return {
      ...emptyAssessment(ASSESSMENT.ASSESSED, base),
      ...base,
      assessment: ASSESSMENT.ASSESSED,
      message: 'Defensible same-postcode HIGH-similarity official sales assessed for price context only — not a valuation.',
      unresolvedDependencies: [],
      investigationPriorities: [],
    };
  }

  if (assessmentState === ASSESSMENT.MARKET_CONTEXT) {
    const missing = [{
      id: 'defensible_high_comparables',
      label: `At least ${SUFFICIENCY_MIN_HIGH_COMPARABLES} HIGH-similarity (same postcode, ≤${HIGH_RECENCY_YEARS}y) official sales`,
      why: `Found ${defensiblePool.length} HIGH comparable(s) and ${similarityQuality.medium} MEDIUM / ${similarityQuality.low} LOW market transactions. Volume of district or older sales is market context only.`,
    }];
    return {
      ...emptyAssessment(ASSESSMENT.MARKET_CONTEXT, base),
      ...base,
      assessment: ASSESSMENT.MARKET_CONTEXT,
      reasonCode: 'MARKET_CONTEXT_NOT_DEFENSIBLE_COMPARABLES',
      message: 'Official local sold transactions provide market context, but comparability is too weak for a defensible comparable assessment.',
      unresolvedDependencies: missing,
      investigationPriorities: missing.map((m) => ({
        id: m.id,
        title: m.label,
        howToResolve: m.why,
        whatNext: 'Use local transaction context for orientation only; do not treat it as property-comparable evidence until more same-postcode recent sales exist.',
      })),
    };
  }

  const missing = [];
  if (eligible.length === 0) {
    missing.push({
      id: 'eligible_transactions',
      label: 'Hard-eligible official sales',
      why: 'No transactions passed type, date, geography, and self-match filters.',
      whatNext: 'Confirm postcode, property type, and that official Price Paid data covers this area.',
    });
  } else if (defensiblePool.length < SUFFICIENCY_MIN_HIGH_COMPARABLES) {
    missing.push({
      id: 'defensible_high_comparables',
      label: `At least ${SUFFICIENCY_MIN_HIGH_COMPARABLES} HIGH-similarity (same postcode, ≤${HIGH_RECENCY_YEARS}y) official sales`,
      why: `Only ${defensiblePool.length} HIGH comparable(s); ${relevantMarket.length} relevant market transaction(s) total (H=${similarityQuality.high} M=${similarityQuality.medium} L=${similarityQuality.low}).`,
      whatNext: 'Wait for more recent same-postcode sales of the same type, or treat available figures as weak orientation only.',
    });
  }

  return {
    ...emptyAssessment(ASSESSMENT.INSUFFICIENT_EVIDENCE, base),
    ...base,
    assessment: ASSESSMENT.INSUFFICIENT_EVIDENCE,
    reasonCode: 'INSUFFICIENT_COMPARABLE_SET',
    message: 'Official sales were searched, but neither a defensible comparable set nor usable market-context set met methodology floors.',
    unresolvedDependencies: missing,
    investigationPriorities: missing.map((m) => ({
      id: m.id,
      title: m.label,
      howToResolve: m.why,
      whatNext: m.whatNext,
    })),
  };
}

/**
 * Fetch candidates (bounded) then assess.
 */
async function buildOfficialTransactionComparableAssessment({
  property = {},
  identity = {},
  asOf = null,
  store = null,
  deps = {},
} = {}) {
  const asOfDate = parseAsOf(asOf);
  if (!asOfDate) {
    return emptyAssessment(ASSESSMENT.INVALID_INPUT, {
      reasonCode: 'INVALID_AS_OF',
      message: 'Analysis as-of date is invalid.',
    });
  }

  const postcodeCompact = compactPostcode(
    property.zip_code || property.postcode || identity.postcode || null
  );
  if (!postcodeCompact) {
    return emptyAssessment(ASSESSMENT.INVALID_INPUT, {
      asOf: toDateOnly(asOfDate),
      reasonCode: 'MISSING_POSTCODE',
      message: 'Postcode is required.',
    });
  }

  // Outside E&W — Price Paid geography
  const SCOTLAND_OR_NI = /^(AB|DD|DG|EH|FK|G|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE|BT)\d/i;
  if (SCOTLAND_OR_NI.test(postcodeCompact)) {
    return emptyAssessment(ASSESSMENT.NOT_APPLICABLE, {
      asOf: toDateOnly(asOfDate),
      reasonCode: 'SOURCE_OUTSIDE_GEOGRAPHY',
      message: 'HM Land Registry Price Paid covers England and Wales only.',
    });
  }

  const ppdType = mapSubjectToPpdType(property, identity);
  if (!ppdType) {
    return assessOfficialTransactionComparables({
      candidates: [],
      property,
      identity,
      asOf: asOfDate,
      searchHierarchy: [],
    });
  }

  let dbStore = store;
  if (!dbStore) {
    try {
      const { tableExists } = require('../../db/ensureIntelligenceSchema');
      if (!(await tableExists('official_sale_transactions'))) {
        return emptyAssessment(ASSESSMENT.UNAVAILABLE, {
          asOf: toDateOnly(asOfDate),
          reasonCode: 'IMPORT_NOT_RUN',
          message: 'Official sale transactions table is not available.',
        });
      }
      const { createPostgresOfficialSaleStore } = require('./officialSaleTransactionRepository');
      dbStore = createPostgresOfficialSaleStore();
    } catch {
      return emptyAssessment(ASSESSMENT.UNAVAILABLE, {
        asOf: toDateOnly(asOfDate),
        reasonCode: 'SOURCE_NOT_AVAILABLE',
        message: 'Official sale store could not be opened.',
      });
    }
  }

  const asOfStr = toDateOnly(asOfDate);
  const findCandidates = deps.findComparableCandidates
    || (dbStore.findComparableCandidates
      ? dbStore.findComparableCandidates.bind(dbStore)
      : null);

  const searchHierarchy = [];
  let candidates = [];

  if (findCandidates) {
    candidates = await findCandidates({
      postcodeCompact,
      propertyTypeCode: ppdType,
      asOf: asOfStr,
      limit: CANDIDATE_LIMIT_POSTCODE,
      mode: 'postcode',
    });
    searchHierarchy.push({
      step: 1,
      mode: 'postcode',
      postcodeCompact,
      propertyTypeCode: ppdType,
      limit: CANDIDATE_LIMIT_POSTCODE,
      fetched: candidates.length,
    });
  } else if (dbStore.findLiveByPostcode) {
    candidates = await dbStore.findLiveByPostcode(postcodeCompact, { limit: CANDIDATE_LIMIT_POSTCODE });
    searchHierarchy.push({
      step: 1,
      mode: 'postcode',
      postcodeCompact,
      fetched: candidates.length,
      note: 'Fallback findLiveByPostcode without type/asOf SQL pushdown',
    });
  }

  let geographyMode = 'postcode';
  let assessed = assessOfficialTransactionComparables({
    candidates,
    property,
    identity,
    asOf: asOfDate,
    geographyMode,
    searchHierarchy,
  });

  if (
    assessed.assessment !== ASSESSMENT.ASSESSED
    && findCandidates
  ) {
    const district = postcodeDistrict(postcodeCompact);
    const districtRows = await findCandidates({
      postcodeCompact,
      postcodeDistrict: district,
      propertyTypeCode: ppdType,
      asOf: asOfStr,
      limit: CANDIDATE_LIMIT_DISTRICT,
      mode: 'district',
    });
    searchHierarchy.push({
      step: 2,
      mode: 'district',
      postcodeDistrict: district,
      propertyTypeCode: ppdType,
      limit: CANDIDATE_LIMIT_DISTRICT,
      fetched: districtRows.length,
    });
    // Merge unique by source_transaction_id
    const byId = new Map();
    [...candidates, ...districtRows].forEach((row) => {
      byId.set(row.source_transaction_id, row);
    });
    geographyMode = 'district';
    assessed = assessOfficialTransactionComparables({
      candidates: [...byId.values()],
      property,
      identity,
      asOf: asOfDate,
      geographyMode,
      searchHierarchy,
    });
  }

  return assessed;
}

module.exports = {
  assessOfficialTransactionComparables,
  buildOfficialTransactionComparableAssessment,
  mapSubjectToPpdType,
  isSelfMatch,
  hardEligibility,
  similarityCategory,
  postcodeDistrict,
  median,
  emptyAssessment,
  METHODOLOGY_ID,
  METHODOLOGY_VERSION,
  ASSESSMENT,
  SIMILARITY,
  SUFFICIENCY_MIN_COMPARABLES,
  SUFFICIENCY_MIN_HIGH_COMPARABLES,
  MARKET_CONTEXT_MIN_TRANSACTIONS,
};
