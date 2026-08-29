const pool = require('../../models/db');
const { rankComparables, weightedMedianRent, trimmedMeanRent } = require('./comparableEngine');
const { assessDataQuality } = require('./dataQualityEngine');
const { assessConfidence } = require('./confidenceEngine');
const { getProviderRegistry } = require('../providers/ProviderRegistry');
const { isPropertyDataConfigured } = require('../../config/propertyIntelligence.config');
const { parseRentsResponse, buildRentalEvidence } = require('../providers/propertyData/propertyDataParsers');
const {
  buildSoldPriceFilters,
  isResidentialRentsEligible,
} = require('../providers/propertyData/propertyTypeMapping');
const { normalisePostcode } = require('../../utils/ukAddress');

async function fetchRentalComparables(criteria = {}) {
  const params = [];
  const filters = ["p.status = 'approved'", "(p.monthly_rent IS NOT NULL AND p.monthly_rent > 0 OR p.weekly_rent IS NOT NULL AND p.weekly_rent > 0)"];

  if (criteria.city) {
    params.push(`%${criteria.city}%`);
    filters.push(`p.city ILIKE $${params.length}`);
  }
  if (criteria.propertyType) {
    params.push(criteria.propertyType);
    filters.push(`(p.property_type = $${params.length} OR p.property_category = $${params.length})`);
  }
  if (criteria.bedrooms) {
    params.push(Number(criteria.bedrooms));
    filters.push(`(p.bedrooms IS NULL OR ABS(p.bedrooms - $${params.length}) <= 1)`);
  }

  const sql = `
    SELECT p.id, p.title, p.city, p.zip_code, p.bedrooms, p.bathrooms,
           p.square_feet, p.property_type, p.property_category, p.furnished,
           p.has_garden, p.has_garage, p.parking_spaces,
           p.latitude, p.longitude,
           p.monthly_rent, p.weekly_rent, p.created_at, p.updated_at
    FROM properties p
    WHERE ${filters.join(' AND ')}
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 80
  `;

  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    ...r,
    monthly_rent: Number(r.monthly_rent) || Number(r.weekly_rent) * 4.33,
  }));
}

function listingAskingRent(target = {}) {
  const n = Number(target.monthly_rent);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function evidenceFromEnrichment(externalEnrichment) {
  const rents = externalEnrichment?.enrichments?.rents;
  if (!rents || rents.success === false) return null;
  const payload = rents.data || rents.payload || rents.profile || null;
  const parsed = parseRentsResponse(payload);
  return buildRentalEvidence(parsed, {
    retrievedAt: rents.provenance?.retrievedAt || null,
  });
}

function selectRentRecommendation({ pdEvidence, internalRecommended, internalSpread }) {
  const pdMonthly = pdEvidence?.available ? pdEvidence.centralMonthly : null;
  const pdMatched = pdEvidence?.available && pdEvidence.scope === 'matched_area_segment' && pdMonthly != null;
  const pdArea = pdEvidence?.available && pdEvidence.scope === 'area_radius' && pdMonthly != null;

  if (pdMatched) {
    return {
      recommended: pdMonthly,
      marketRange: { low: pdEvidence.lowerMonthly, high: pdEvidence.upperMonthly },
      source: 'PropertyData',
      scope: pdEvidence.scope,
      rentType: pdEvidence.rentType,
    };
  }
  if (internalRecommended != null) {
    return {
      recommended: internalRecommended,
      marketRange: {
        low: internalRecommended - internalSpread,
        high: internalRecommended + internalSpread,
      },
      source: 'application_data',
      scope: 'internal_comparables',
      rentType: 'asking_internal_listing',
    };
  }
  if (pdArea) {
    return {
      recommended: pdMonthly,
      marketRange: { low: pdEvidence.lowerMonthly, high: pdEvidence.upperMonthly },
      source: 'PropertyData',
      scope: pdEvidence.scope,
      rentType: pdEvidence.rentType,
    };
  }
  return null;
}

function buildRentIntelligence({
  target = {},
  ranked = [],
  pdEvidence = null,
  propertyCategory = null,
}) {
  const currentRent = listingAskingRent(target);
  const residential = isResidentialRentsEligible({
    category: propertyCategory || target.category,
    property_type: target.property_type,
    property_category: target.property_category,
  });
  const evidence = residential ? pdEvidence : null;

  const median = ranked.length ? weightedMedianRent(ranked) : null;
  const trimmed = ranked.length ? trimmedMeanRent(ranked) : null;
  const internalRecommended =
    median != null ? Math.round((median + (trimmed || median)) / 2) : null;
  const internalSpread =
    internalRecommended != null ? Math.max(50, Math.round(internalRecommended * 0.05)) : 0;

  const selected = selectRentRecommendation({
    pdEvidence: evidence,
    internalRecommended,
    internalSpread,
  });

  const dataQuality = assessDataQuality({
    comparableCount: (ranked.length || 0) + (evidence?.sampleSize || 0),
    fieldsPresent: [target.city, target.bedrooms, target.property_type].filter(Boolean).length,
    fieldsTotal: 3,
  });

  if (!selected) {
    return {
      success: false,
      insufficientData: true,
      message: 'Insufficient comparable rental data in the application database for this location and property type.',
      dataQuality,
      comparables: [],
      currentRent,
      source: 'application_data',
      propertyDataRents: evidence && evidence.available ? evidence : buildRentalEvidence(null),
      expectedDemand: {
        available: false,
        value: null,
        state: 'no_demand_data_source',
        note: 'Rent evidence is not market demand. Demand remains notAssessed until a demand source exists.',
      },
      timeToLet: null,
      timeToLetNote: 'days_on_market on asking listings is not time-to-let.',
      disclaimer:
        'Estimate based only on internal application listings. No external market data connected.',
    };
  }

  const methodEstimates = [];
  if (internalRecommended != null) {
    methodEstimates.push({ method: 'weighted_median_rent', value: median });
    methodEstimates.push({ method: 'trimmed_mean_rent', value: trimmed });
  }
  if (evidence?.available && evidence.centralMonthly != null) {
    methodEstimates.push({ method: 'propertydata_rents_asking', value: evidence.centralMonthly });
  }

  const confidenceAssessment = assessConfidence({
    scope: 'rent_estimate',
    comparables: ranked,
    target,
    dataQuality,
    methodEstimates,
  });

  const recommended = selected.recommended;
  const underRented = currentRent != null && recommended > currentRent * 1.03;
  const spread =
    selected.marketRange.low != null && selected.marketRange.high != null
      ? Math.round((selected.marketRange.high - selected.marketRange.low) / 2)
      : Math.max(50, Math.round(recommended * 0.05));

  const priceSensitivity = [
    { rent: Math.round(recommended * 1.07), demand: null, label: 'Premium positioning' },
    { rent: recommended, demand: null, label: 'Recommended' },
    { rent: Math.round(recommended * 0.97), demand: null, label: 'Volume positioning' },
  ];

  const mixed = Boolean(evidence?.available && ranked.length);
  return {
    success: true,
    recommendedRent: recommended,
    marketRange: selected.marketRange,
    currentRent,
    confidence: confidenceAssessment.score,
    confidenceLevel: confidenceAssessment.level,
    confidenceAssessment,
    expectedDemand: {
      available: false,
      value: null,
      state: 'no_demand_data_source',
      note: 'Estimate confidence is not market demand. Demand remains notAssessed until a demand source exists.',
    },
    timeToLet: null,
    timeToLetNote: 'days_on_market on asking listings is not time-to-let. Time-to-let remains notAssessed.',
    priceSensitivity,
    comparables: ranked.slice(0, 8),
    propertyDataRents: evidence && evidence.available ? evidence : buildRentalEvidence(null),
    dataQuality,
    underRented,
    potentialAnnualUplift:
      underRented && currentRent != null && selected.marketRange.low != null
        ? {
            low: (selected.marketRange.low - currentRent) * 12,
            high: ((selected.marketRange.high != null ? selected.marketRange.high : recommended) - currentRent) * 12,
          }
        : null,
    methodology: {
      primary:
        selected.source === 'PropertyData'
          ? 'PropertyData area long-let asking rents (weekly converted with 52/12)'
          : 'Weighted median of internal comparable rentals',
      secondary:
        selected.source === 'PropertyData'
          ? mixed
            ? 'Internal marketplace asking rents retained as comparables'
            : '80pc asking-rent range where the provider returned it'
          : 'Trimmed mean for outlier resistance',
      weights: 'Location 25%, Size 20%, Type 15%, Beds/Baths 10% each',
      sourcePrecedence:
        'matched PropertyData segment > internal marketplace comparables > PropertyData area-wide asking context. Listing asking rent is never overwritten. Area asking rent is not achieved rent and is not property-specific valuation.',
    },
    source: mixed ? 'mixed' : selected.source,
    scope: selected.scope,
    rentType: selected.rentType,
    achievedRent: null,
    disclaimer:
      selected.source === 'PropertyData'
        ? 'PropertyData figures are area long-let asking rents from live listings, not achieved lettings and not a property-specific rental valuation. This is not financial advice.'
        : 'Estimate based only on internal application listings. This is not financial advice.',
  };
}

async function resolvePropertyDataRents(input, userId, externalEnrichment) {
  const fromEnrichment = evidenceFromEnrichment(externalEnrichment);
  if (fromEnrichment?.available) return fromEnrichment;

  const postcode = normalisePostcode(input.postcode || input.zip_code);
  const eligible = isResidentialRentsEligible({
    category: input.category,
    property_type: input.propertyType || input.property_type,
    property_category: input.property_category,
  });
  if (!eligible || !postcode || !isPropertyDataConfigured()) return buildRentalEvidence(null);

  try {
    const registry = getProviderRegistry();
    const provider = registry.getPrimaryMarketDataProvider();
    if (!provider?.isAvailable() || typeof provider.getRents !== 'function') return buildRentalEvidence(null);
    const filters = buildSoldPriceFilters({
      bedrooms: input.bedrooms,
      property_type: input.propertyType || input.property_type,
    });
    const fetched = await provider.getRents(postcode, { userId, propertyId: input.propertyId }, filters);
    if (!fetched?.success) return buildRentalEvidence(null);
    const parsed = parseRentsResponse(fetched.data);
    return buildRentalEvidence(parsed, { retrievedAt: fetched.provenance?.retrievedAt || null });
  } catch {
    return buildRentalEvidence(null);
  }
}

async function analyseRent(input, userId, extra = {}) {
  const target = {
    id: input.propertyId || input.property_id,
    city: input.city,
    zip_code: input.postcode || input.zip_code,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    square_feet: input.squareFeet || input.square_feet,
    property_type: input.propertyType || input.property_type,
    property_category: input.property_category,
    category: input.category,
    monthly_rent: input.currentRent || input.current_rent,
    latitude: input.latitude,
    longitude: input.longitude,
    furnished: input.furnished,
    has_garden: input.has_garden,
    has_garage: input.has_garage,
    parking_spaces: input.parking_spaces,
  };

  const comparables = target.city
    ? await fetchRentalComparables({
        city: target.city,
        propertyType: target.property_type,
        bedrooms: target.bedrooms,
      })
    : [];

  const ranked = rankComparables(target, comparables, 35);
  const pdEvidence = await resolvePropertyDataRents(input, userId, extra.externalEnrichment);

  return buildRentIntelligence({
    target,
    ranked,
    pdEvidence,
    propertyCategory: input.category,
  });
}

module.exports = {
  analyseRent,
  fetchRentalComparables,
  buildRentIntelligence,
  selectRentRecommendation,
  listingAskingRent,
};
