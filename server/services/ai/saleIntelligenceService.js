const pool = require('../../models/db');
const {
  rankSaleComparables,
  weightedMedianValue,
  trimmedMeanValue,
} = require('../ai/comparableEngine');
const { assessDataQuality } = require('../ai/dataQualityEngine');
const { createProvenance } = require('../../utils/provenance');
const { isFinitePositiveMoney } = require('../ai/valuationIntegrity');

async function fetchSaleComparables(criteria = {}) {
  const params = [];
  const filters = [
    "p.status = 'approved'",
    "p.category = 'sale'",
    'p.price IS NOT NULL',
    'p.price > 0',
  ];

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
           p.square_feet, p.property_type, p.property_category,
           p.latitude, p.longitude, p.price, p.furnished,
           p.has_garden, p.has_garage, p.parking_spaces,
           p.created_at, p.updated_at
    FROM properties p
    WHERE ${filters.join(' AND ')}
    ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
    LIMIT 80
  `;

  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({ ...r, source: 'application_database' }));
}

async function analyseSaleComparables(property) {
  const target = {
    id: property.id,
    city: property.city,
    zip_code: property.zip_code,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    square_feet: property.square_feet,
    property_type: property.property_type,
    price: property.price,
    latitude: property.latitude,
    longitude: property.longitude,
    furnished: property.furnished,
    has_garden: property.has_garden,
    has_garage: property.has_garage,
    parking_spaces: property.parking_spaces,
  };

  const comparables = await fetchSaleComparables({
    city: target.city,
    propertyType: target.property_type,
    bedrooms: target.bedrooms,
  });

  const ranked = rankSaleComparables(target, comparables, 30);
  const median = weightedMedianValue(ranked, 'price');
  const trimmed = trimmedMeanValue(ranked, 'price');

  const dataQuality = assessDataQuality({
    comparableCount: ranked.length,
    fieldsPresent: [target.city, target.bedrooms, target.property_type, target.price].filter(Boolean)
      .length,
    fieldsTotal: 4,
  });

  if (!ranked.length || !isFinitePositiveMoney(median)) {
    return {
      success: false,
      insufficientData: true,
      evidenceKind: 'asking_listing',
      notTransactionEvidence: true,
      cannotSolelyAssessValuation: true,
      message: 'Insufficient comparable sale data in the application database.',
      comparables: [],
      dataQuality,
      source: 'application_database',
    };
  }

  const recommended = Math.round((median + (trimmed || median)) / 2);
  if (!isFinitePositiveMoney(recommended)) {
    return {
      success: false,
      insufficientData: true,
      evidenceKind: 'asking_listing',
      notTransactionEvidence: true,
      cannotSolelyAssessValuation: true,
      message: 'Internal asking-listing prices were not valid sale valuation evidence.',
      comparables: ranked.slice(0, 8),
      dataQuality,
      source: 'application_database',
    };
  }

  const spread = Math.max(5000, Math.round(recommended * 0.04));
  const rawLow = recommended - spread;
  const rawHigh = recommended + spread;

  return {
    success: true,
    evidenceKind: 'asking_listing',
    notTransactionEvidence: true,
    cannotSolelyAssessValuation: true,
    recommendedPrice: recommended,
    marketRange: {
      low: isFinitePositiveMoney(rawLow) ? rawLow : null,
      high: isFinitePositiveMoney(rawHigh) ? rawHigh : null,
      synthetic: true,
      notTransactionEvidenced: true,
      excludedFromAssessedBlend: true,
    },
    comparables: ranked.slice(0, 8),
    comparableCount: ranked.length,
    dataQuality,
    methodology:
      'Weighted median of internal approved sale listings. Asking-listing context only — not sold transactions and not sufficient to assess sale value.',
    provenance: createProvenance({
      source: 'ApplicationDatabase',
      method: 'internal_sale_comparables',
      confidence: dataQuality.level.toLowerCase(),
      notes:
        'Asking-listing context only. Not a sold transaction set and cannot solely assess sale value. Synthetic ±4% band is display metadata and is excluded from the assessed blend.',
    }),
    source: 'application_database',
  };
}

module.exports = { analyseSaleComparables, fetchSaleComparables };
