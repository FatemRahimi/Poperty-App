/**
 * Standalone address valuation — evidence-driven, no LLM arithmetic.
 * Used by /api/ai/valuation for ad-hoc property lookups (no listing required).
 */

const { getProviderRegistry } = require('../providers/ProviderRegistry');
const { buildSoldPriceFilters } = require('../providers/propertyData/propertyTypeMapping');
const { propertyIntelligenceConfig, isExternalEnrichmentAvailable } = require('../../config/propertyIntelligence.config');
const {
  extractPostcodeFromAddress,
  parseCityFromAddress,
  normalisePostcode,
} = require('../../utils/ukAddress');
const { calculatePropertyValuation } = require('./valuationEngine');
const { calculatePricePosition } = require('./pricePositionEngine');
const { applyPropertyDataEvidence } = require('../providers/propertyData/propertyDataEvidence');

function buildSyntheticProperty(input) {
  const address = String(input.address || '').trim();
  const postcode = normalisePostcode(input.postcode || extractPostcodeFromAddress(address));
  const city = input.city || parseCityFromAddress(address) || '';
  const suppliedType = input.propertyType ? String(input.propertyType).trim() : '';
  const propertyType = suppliedType
    ? suppliedType.toLowerCase().replace(/\s+/g, '-')
    : null;
  const bedrooms = Number(input.bedrooms);
  const bathrooms = Number(input.bathrooms);
  const size = Number(input.sizeSqFt || input.size);

  return {
    id: null,
    title: suppliedType ? `${suppliedType} valuation` : 'Standalone valuation',
    address_display: address,
    address_line1: address.split(',')[0]?.trim() || address,
    city,
    zip_code: postcode,
    postcode,
    property_type: propertyType,
    property_category: propertyType,
    category: 'sale',
    price: Number(input.price || input.askingPrice || 0) || null,
    bedrooms: Number.isFinite(bedrooms) && bedrooms > 0 ? bedrooms : null,
    bathrooms: Number.isFinite(bathrooms) && bathrooms > 0 ? bathrooms : null,
    square_feet: Number.isFinite(size) && size > 0 ? size : null,
    condition: input.condition ? String(input.condition) : null,
    status: 'approved',
  };
}

async function enrichStandaloneProperty(property, context = {}) {
  if (!isExternalEnrichmentAvailable()) {
    return {
      available: false,
      enrichments: {},
      sources: ['InternalComparables'],
      identity: { postcode: property.zip_code, normalized_address: property.address_display },
    };
  }

  const registry = getProviderRegistry();
  const marketProvider = registry.getPrimaryMarketDataProvider();
  const enrichments = {};
  const ctx = { userId: context.userId, propertyId: null };
  const postcode = normalisePostcode(property.zip_code || property.postcode);

  if (marketProvider?.isAvailable() && postcode) {
    const soldFilters = buildSoldPriceFilters(property);
    for (const [type, method] of [
      ['sold_prices', 'getSoldPrices'],
      ['sold_prices_per_sqf', 'getSoldPricesPerSqf'],
    ]) {
      try {
        const fetched = await marketProvider[method](postcode, ctx, soldFilters);
        enrichments[type] = {
          success: true,
          data: fetched.data,
          provenance: fetched.provenance,
          creditsUsed: fetched.creditsUsed || 0,
        };
      } catch (err) {
        enrichments[type] = { success: false, message: err.message };
      }
    }
  }

  let identity = { postcode, normalized_address: property.address_display };
  if (marketProvider?.isAvailable()) {
    try {
      const resolved = await marketProvider.resolveIdentity(property, ctx);
      if (resolved.success) {
        identity = { ...identity, uprn: resolved.uprn, matchConfidence: resolved.matchConfidence };
        if (resolved.uprn) {
          const profile = await marketProvider.getUprnProfile(resolved.uprn, ctx);
          enrichments.uprn_profile = {
            success: true,
            data: profile.profile || profile.data,
            provenance: profile.provenance,
            creditsUsed: profile.creditsUsed || 0,
          };
        }
      }
    } catch {
      /* optional UPRN path */
    }
  }

  const applied = applyPropertyDataEvidence(property, { enrichments, identity });

  if (marketProvider?.isAvailable()) {
    try {
      const val = await marketProvider.getSaleValuation(applied.property, ctx);
      enrichments.valuation_sale = val.success
        ? {
            success: true,
            data: val.valuation || val.data,
            provenance: val.provenance,
            creditsUsed: val.creditsUsed || 0,
          }
        : { success: false, message: val.message, unavailable: val.unavailable };
    } catch (err) {
      enrichments.valuation_sale = { success: false, message: err.message };
    }
  }

  return {
    available: true,
    enrichments,
    identity,
    property: applied.property,
    evidence: applied.evidence,
    sources: ['PropertyData', 'InternalComparables'],
    totalCreditsUsed: Object.values(enrichments).reduce(
      (sum, e) => sum + (e.creditsUsed || 0),
      0
    ),
  };
}

function formatGbp(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `£${Number(n).toLocaleString()}`;
}

function buildImprovementSuggestions(input, valuation) {
  const condition = (input.condition || '').toLowerCase();
  const suggestions = [];

  if (condition.includes('renovation') || condition.includes('poor') || condition.includes('fair')) {
    suggestions.push({
      title: 'Kitchen & bathroom refresh',
      impact: 'High',
      estimatedCost: '£8,000–£25,000',
      valueUplift: '5–12%',
      detail: 'Modernising wet rooms typically improves buyer appeal and achievable sale price in similar markets.',
    });
  }

  if (!input.sizeSqFt && !input.size) {
    suggestions.push({
      title: 'Confirm floor area (EPC / survey)',
      impact: 'Medium',
      estimatedCost: '£150–£400',
      valueUplift: 'Improves accuracy',
      detail: 'Adding verified sq ft strengthens £/sqft evidence and narrows the valuation range.',
    });
  }

  suggestions.push({
    title: 'Professional photography & staging',
    impact: 'Medium',
    estimatedCost: '£300–£1,200',
    valueUplift: 'Faster sale',
    detail: 'Presentation improvements rarely change fundamental value but can reduce time-on-market.',
  });

  if (valuation?.pricePerSqft) {
    suggestions.push({
      title: 'Benchmark against local £/sqft',
      impact: 'Medium',
      estimatedCost: 'Included in analysis',
      valueUplift: 'Pricing clarity',
      detail: `Local implied £/sqft in this analysis: ${formatGbp(valuation.pricePerSqft?.value ?? valuation.pricePerSqft)}.`,
    });
  }

  return suggestions.slice(0, 4);
}

/**
 * @param {object} input - address, propertyType, bedrooms, bathrooms, sizeSqFt, condition, price?
 */
async function generateDeterministicValuation(input, context = {}) {
  const seeded = buildSyntheticProperty(input);
  const externalEnrichment = await enrichStandaloneProperty(seeded, context);
  const property = externalEnrichment.property || seeded;
  const valuation = await calculatePropertyValuation(property, externalEnrichment);

  if (!valuation.success) {
    return {
      success: false,
      message: valuation.message,
      insufficientEvidence: valuation.insufficientEvidence,
      property,
      externalEnrichment,
    };
  }

  const central = valuation.centralEstimate?.value ?? valuation.centralEstimate;
  const lower = valuation.lowerEstimate?.value ?? valuation.lowerEstimate;
  const upper = valuation.upperEstimate?.value ?? valuation.upperEstimate;

  let pricePosition = null;
  if (property.price) {
    pricePosition = calculatePricePosition(property.price, valuation);
  }

  const demandLevel = {
    available: false,
    value: null,
    state: 'no_demand_data_source',
    note: 'Evidence count is not market demand. Demand remains notAssessed until a demand source exists.',
  };

  const output = {
    estimatedValue: {
      low: lower,
      mid: central,
      high: upper,
      currency: 'GBP',
      formatted: {
        low: formatGbp(lower),
        mid: formatGbp(central),
        high: formatGbp(upper),
      },
    },
    confidence: valuation.confidence,
    // Reportable state of the four (High | Medium | Low | Not assessed). `confidence`
    // above is the legacy lower-cased string kept for existing consumers.
    confidenceLevel: valuation.confidenceAssessment?.level ?? null,
    confidenceAssessment: valuation.confidenceAssessment ?? null,
    evidenceCount: valuation.evidenceCount,
    methodology: valuation.methodology,
    pricePerSqft: valuation.pricePerSqft?.value ?? valuation.pricePerSqft ?? null,
    pricePosition: pricePosition?.success ? pricePosition : null,
    marketAnalysis: {
      summary: `Evidence-based estimate from ${valuation.evidenceCount} source${valuation.evidenceCount === 1 ? '' : 's'}${property.zip_code ? ` for ${property.zip_code}` : ''}. ${valuation.methodology}`,
      localTrend: externalEnrichment.enrichments?.sold_prices?.success
        ? 'Derived from recent sold-price statistics in the postcode area (HM Land Registry via PropertyData where configured).'
        : 'Based on internal comparable listings — enable PropertyData for postcode-level sold statistics.',
      daysOnMarketAvg: 'Not available in standalone mode',
      demandLevel,
      comparablesNote: valuation.internalComparables?.length
        ? `${valuation.internalComparables.length} internal comparable listing(s) used.`
        : 'No closely matched internal comparables — estimate relies on market statistics.',
    },
    improvementSuggestions: buildImprovementSuggestions(input, valuation),
    components: valuation.components,
    internalComparables: valuation.internalComparables,
    report: {
      title: 'Evidence-Based Property Valuation',
      propertySummary: `${input.propertyType || 'Property'} · ${input.bedrooms || '—'} bed · ${property.address_display}`,
      generatedAt: new Date().toISOString(),
      disclaimer:
        valuation.disclaimer ||
        'Indicative analytical estimate only — not a RICS survey or mortgage valuation.',
    },
    engine: 'deterministic-v2',
  };

  return {
    success: true,
    data: output,
    model: 'deterministic-valuation-v2',
    tokensUsed: 0,
    source: externalEnrichment.available ? 'evidence+propertydata' : 'evidence+internal',
    creditsUsed: externalEnrichment.totalCreditsUsed || 0,
  };
}

module.exports = {
  buildSyntheticProperty,
  enrichStandaloneProperty,
  generateDeterministicValuation,
};
