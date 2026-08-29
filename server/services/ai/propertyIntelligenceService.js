/**
 * Lightweight Property Intelligence overview.
 *
 * This is not a second analysis engine. Numeric valuation, rent, yield and
 * demand facts are projected from a persisted canonical report when one
 * exists. Otherwise only listing-operational flags and listing-evidenced
 * gross yield (shared financialEngine helpers) are shown.
 *
 * Live analyseRent / valuation / PropertyData calls are never made here.
 */

const pool = require('../../models/db');
const AiRequest = require('../../models/AiRequest');
const { calculateInvestmentMetrics } = require('./financialEngine');
const { getMonthlyRent, buildAddress: aggregatorBuildAddress } = require('./propertyDataAggregator');
const {
  prepareEvidencedInvestment,
  presentEvidencedInvestment,
  evidencedValue,
} = require('./evidencedInvestment');

async function fetchUserProperties(userId) {
  const result = await pool.query(
    `SELECT p.*,
      (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = p.id ORDER BY pi.id LIMIT 1) AS main_image
     FROM properties p
     WHERE p.user_id = $1 AND p.status IN ('approved', 'pending')
     ORDER BY p.updated_at DESC NULLS LAST
     LIMIT 50`,
    [userId]
  );
  return result.rows;
}

async function fetchPropertyById(propertyId, userId) {
  const result = await pool.query(
    `SELECT p.* FROM properties p WHERE p.id = $1 AND p.user_id = $2`,
    [propertyId, userId]
  );
  return result.rows[0] || null;
}

function buildAddress(p) {
  if (typeof aggregatorBuildAddress === 'function') {
    const formatted = aggregatorBuildAddress(p);
    if (formatted) return formatted;
  }
  return [p.address_line1, p.address_line2, p.city, p.zip_code].filter(Boolean).join(', ');
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function parseOutputPayload(row) {
  if (!row) return null;
  const raw = row.output_data || row.output || row;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw && typeof raw === 'object' ? raw : null;
}

function extractCanonicalCoreFacts(row) {
  const out = parseOutputPayload(row);
  if (!out || out.success === false) return null;

  const presented = out.investment?.presented || null;
  const rentIntel = out.marketIntelligence?.rent || out.rentIntel || null;
  const sale = out.marketIntelligence?.sale || out.sale || null;
  const areaMarketDemand =
    out.marketIntelligence?.areaMarketDemand || out.areaMarketDemand || null;
  const areaRentalDemand =
    out.marketIntelligence?.areaRentalDemand || out.areaRentalDemand || null;

  return {
    analysisMode: out.analysisMode || 'canonical',
    engineVersion: out.engineVersion || out.modelVersion || null,
    evidenceAsOf: out.evidenceAsOf || out.analysisDate || row.createdAt || row.created_at || null,
    analysisId: row.id || null,
    grossYield: evidencedValue(presented?.grossYield),
    netYield: evidencedValue(presented?.netYield),
    noi: evidencedValue(presented?.noi),
    annualCashFlow: evidencedValue(presented?.annualCashFlow),
    dscr: evidencedValue(presented?.dscr),
    valuation:
      sale?.centralEstimate?.value ??
      (typeof sale?.centralEstimate === 'number' ? sale.centralEstimate : null),
    underRented: Boolean(rentIntel?.success && rentIntel?.underRented),
    marketRange: rentIntel?.marketRange || null,
    recommendedRent: rentIntel?.recommendedRent || null,
    currentRent: rentIntel?.currentRent || null,
    comparableCount: Array.isArray(rentIntel?.comparables) ? rentIntel.comparables.length : 0,
    potentialAnnualUplift: rentIntel?.potentialAnnualUplift || null,
    rentConfidence: rentIntel?.confidence || null,
    rentDataQuality: rentIntel?.dataQuality?.level || out.dataQuality?.level || null,
    areaMarketDemand,
    areaRentalDemand,
    propertySpecificDemand: out.marketIntelligence?.propertySpecificDemand || {
      available: false,
      state: 'notAssessed',
    },
    propertySpecificTenantDemand: out.marketIntelligence?.propertySpecificTenantDemand || {
      available: false,
      state: 'notAssessed',
    },
    propertyFacts: out.propertyFacts || out.property?.propertyFacts || null,
    decisionIntelligence: out.decisionIntelligence || null,
  };
}

function collectListingOperationalInsights(property) {
  const risks = [];
  const actions = [];

  if (!property.epc_rating && !property.epc_document_url) {
    risks.push({
      id: 'missing-epc',
      title: 'EPC documentation missing',
      category: 'Documentation',
      probability: 'High',
      impact: 'Medium',
      evidence: 'No EPC rating or document on file',
      mitigation: 'Upload EPC certificate to complete property record',
      source: 'application_data',
    });
    actions.push({ title: 'Add EPC documentation', priority: 'Medium', propertyId: property.id });
  }

  if (property.category === 'lease' || property.lease_type) {
    const leaseEnd = property.availability_date;
    const days = daysUntil(leaseEnd);
    if (days !== null && days > 0 && days <= 180) {
      risks.push({
        id: 'lease-approaching',
        title: 'Key lease date approaching',
        category: 'Lease',
        probability: 'High',
        impact: days <= 90 ? 'High' : 'Medium',
        evidence: `Availability/lease-related date in ${days} days`,
        mitigation: 'Review lease terms and renewal strategy',
        source: 'application_data',
      });
    }
  }

  if (property.status === 'pending') {
    risks.push({
      id: 'not-live',
      title: 'Property not yet approved for marketing',
      category: 'Operational',
      probability: 'High',
      impact: 'Medium',
      evidence: `Status: ${property.status}`,
      mitigation: 'Complete approval workflow to begin marketing',
      source: 'application_data',
    });
  }

  return { risks, actions };
}

function listingEvidencedInvestment(property) {
  const rent = getMonthlyRent(property);
  const price = Number(property.price) || 0;
  if (!(price > 0 && rent > 0)) {
    return { price, rent, metrics: null, presented: null };
  }
  const prepared = prepareEvidencedInvestment({ purchasePrice: price, expectedRent: rent, property });
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  return {
    price,
    rent,
    metrics,
    presented: presentEvidencedInvestment(metrics, prepared.operatingCostEvidence),
  };
}

/**
 * Lightweight projection for dashboard/portfolio. Does not recalculate
 * valuation, market rent, or demand. Canonical snapshot wins for those facts.
 */
function projectPropertyOverview(property, { canonicalReport } = {}) {
  const opportunities = [];
  const risks = [];
  const actions = [];
  const canonical = extractCanonicalCoreFacts(canonicalReport);
  const listing = listingEvidencedInvestment(property);
  const operational = collectListingOperationalInsights(property);

  const currentRent = canonical?.currentRent || listing.rent || 0;

  if (canonical?.underRented && canonical.marketRange) {
    const upliftLow = canonical.potentialAnnualUplift?.low || 0;
    const upliftHigh = canonical.potentialAnnualUplift?.high || 0;
    opportunities.push({
      id: 'rent-below-market',
      title: 'Rent appears below market',
      priority: 'Medium',
      reason: `Current rent £${Number(currentRent).toLocaleString()} vs estimated range £${canonical.marketRange.low}–£${canonical.marketRange.high}`,
      evidence: `${canonical.comparableCount} internal comparables · Data quality: ${canonical.rentDataQuality || 'notAssessed'}`,
      estimatedImpact: `£${Math.round(upliftLow).toLocaleString()}–£${Math.round(upliftHigh).toLocaleString()} / year`,
      confidence: canonical.rentConfidence,
      action: 'Review rent at next tenancy event',
      source: 'canonical_snapshot',
    });
    actions.push({
      title: 'Review rent positioning',
      priority: 'Medium',
      propertyId: property.id,
      impact: opportunities[opportunities.length - 1].estimatedImpact,
    });
  }

  const cashFlow = canonical
    ? canonical.annualCashFlow
    : evidencedValue(listing.presented?.annualCashFlow);
  const cashFlowAvailable = canonical
    ? canonical.annualCashFlow != null
    : Boolean(listing.presented?.annualCashFlow?.available);
  if (cashFlowAvailable && cashFlow < 0) {
    risks.push({
      id: 'negative-cashflow',
      title: 'Negative cash flow under current assumptions',
      category: 'Financial',
      probability: 'Medium',
      impact: 'High',
      evidence: `Estimated annual cash flow: £${Number(cashFlow).toLocaleString()} from supplied operating costs and finance inputs`,
      mitigation: 'Review financing, costs, or rent positioning',
      source: canonical ? 'canonical_snapshot' : 'calculated_data',
    });
  }

  const grossYield = canonical
    ? canonical.grossYield
    : evidencedValue(listing.presented?.grossYield);
  if (grossYield != null && grossYield >= 6) {
    opportunities.push({
      id: 'strong-yield',
      title: 'Strong gross yield indicated',
      priority: 'Low',
      reason: `Gross yield ${grossYield}% from listing price and rent`,
      evidence: 'Deterministic gross yield from evidenced price and rent. Net yield is notAssessed unless operating costs are supplied.',
      confidence: 70,
      action: 'Validate operating costs and finance inputs before an investment decision',
      source: canonical ? 'canonical_snapshot' : 'calculated_data',
    });
  }

  risks.push(...operational.risks);
  actions.push(...operational.actions);

  return {
    propertyId: property.id,
    title: property.title,
    address: buildAddress(property),
    analysisMode: 'lightweight',
    coreFactsSource: canonical ? 'canonical_snapshot' : 'listing_evidence',
    canonicalAnalysisId: canonical?.analysisId || null,
    engineVersion: canonical?.engineVersion || null,
    evidenceAsOf: canonical?.evidenceAsOf || null,
    opportunities,
    risks,
    recommendedActions: actions,
    summary: {
      opportunityCount: opportunities.length,
      riskCount: risks.length,
      actionCount: actions.length,
    },
    propertyFacts: canonical?.propertyFacts || null,
    decisionIntelligence: canonical?.decisionIntelligence || null,
  };
}

async function loadCanonicalReportsByPropertyId(userId) {
  const map = new Map();
  try {
    const rows = await AiRequest.findLatestPropertyIntelligenceForUser(userId);
    (rows || []).forEach((row) => {
      const id = Number(row.property_id);
      if (Number.isFinite(id) && !map.has(id)) map.set(id, row);
    });
  } catch {
    return map;
  }
  return map;
}

async function analyseProperty(property, _userId, extras = {}) {
  return projectPropertyOverview(property, extras);
}

async function getPropertyIntelligence(userId, propertyId = null) {
  let properties;
  if (propertyId) {
    const p = await fetchPropertyById(propertyId, userId);
    if (!p) return { success: false, message: 'Property not found or access denied' };
    properties = [p];
  } else {
    properties = await fetchUserProperties(userId);
  }

  if (!properties.length) {
    return {
      success: true,
      analysisMode: 'lightweight',
      canonicalEngine: 'propertyIntelligenceEngine',
      properties: [],
      opportunities: [],
      risks: [],
      recommendedActions: [],
      message: 'No properties found for analysis. Add properties to your account to receive intelligence insights.',
      dataSource: 'application_data',
    };
  }

  const canonicalMap = await loadCanonicalReportsByPropertyId(userId);
  const analyses = properties.map((p) =>
    projectPropertyOverview(p, { canonicalReport: canonicalMap.get(Number(p.id)) })
  );

  const opportunities = analyses.flatMap((a) =>
    a.opportunities.map((o) => ({ ...o, propertyTitle: a.title, propertyId: a.propertyId }))
  );
  const risks = analyses.flatMap((a) =>
    a.risks.map((r) => ({ ...r, propertyTitle: a.title, propertyId: a.propertyId }))
  );
  const recommendedActions = analyses.flatMap((a) =>
    a.recommendedActions.map((act) => ({ ...act, propertyTitle: a.title }))
  );

  opportunities.sort((a, b) => {
    const pri = { High: 3, Medium: 2, Low: 1 };
    return (pri[b.priority] || 0) - (pri[a.priority] || 0);
  });

  return {
    success: true,
    analysisMode: 'lightweight',
    canonicalEngine: 'propertyIntelligenceEngine',
    propertiesAnalysed: properties.length,
    propertyAnalyses: analyses,
    opportunities: opportunities.slice(0, 10),
    risks: risks.slice(0, 10),
    recommendedActions: recommendedActions.slice(0, 8),
    dataSource: 'application_data',
    disclaimer:
      'Insights are based on data stored in this application and user-supplied assumptions. External market data is not connected unless stated. Valuation, market rent and demand facts come from a saved Property Intelligence analysis when one exists; they are not recalculated on this overview.',
  };
}

module.exports = {
  getPropertyIntelligence,
  analyseProperty,
  projectPropertyOverview,
  extractCanonicalCoreFacts,
  collectListingOperationalInsights,
  loadCanonicalReportsByPropertyId,
  fetchUserProperties,
  fetchPropertyById,
};
