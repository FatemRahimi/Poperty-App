/**
 * Property-type-aware data quality scoring from actual field completeness.
 */

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return !Number.isNaN(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
}

const RESIDENTIAL_FIELDS = [
  { key: 'title', label: 'Property title', weight: 8, required: true },
  { key: 'city', label: 'City', weight: 8, required: true },
  { key: 'address_line1', label: 'Address', weight: 6, required: true },
  { key: 'property_type', label: 'Property type', weight: 6, required: true },
  { key: 'bedrooms', label: 'Bedrooms', weight: 7, required: true },
  { key: 'bathrooms', label: 'Bathrooms', weight: 6, required: true },
  { key: 'square_feet', label: 'Square feet', weight: 7, required: true },
  { key: 'price', label: 'Price', weight: 5, required: false, alt: 'monthly_rent' },
  { key: 'monthly_rent', label: 'Monthly rent', weight: 5, required: false, alt: 'price' },
  { key: 'description', label: 'Description', weight: 5, required: false },
  { key: 'epc_rating', label: 'EPC rating', weight: 4, required: false, alt: 'epc_document_url' },
  { key: 'epc_document_url', label: 'EPC document', weight: 4, required: false, alt: 'epc_rating' },
  { key: 'year_built', label: 'Year built', weight: 3, required: false },
  { key: 'images', label: 'Images', weight: 5, required: false, isArray: true },
  { key: 'zip_code', label: 'Postcode', weight: 4, required: false },
  { key: 'council_tax_band', label: 'Council tax band', weight: 3, required: false },
  { key: 'broadband_availability', label: 'Broadband availability', weight: 2, required: false },
  { key: 'service_charges', label: 'Service charges', weight: 3, required: false, alt: 'service_charge' },
  { key: 'ground_rent', label: 'Ground rent', weight: 3, required: false },
];

const COMMERCIAL_FIELDS = [
  { key: 'title', label: 'Property title', weight: 8, required: true },
  { key: 'city', label: 'City', weight: 8, required: true },
  { key: 'address_line1', label: 'Address', weight: 6, required: true },
  { key: 'property_type', label: 'Property type', weight: 6, required: true },
  { key: 'square_feet', label: 'Floor area', weight: 8, required: true },
  { key: 'use_class', label: 'Use class', weight: 6, required: false },
  { key: 'lease_type', label: 'Lease type', weight: 5, required: false },
  { key: 'service_charge', label: 'Service charge', weight: 5, required: false },
  { key: 'business_rates', label: 'Business rates', weight: 4, required: false },
  { key: 'price', label: 'Price', weight: 5, required: false, alt: 'monthly_rent' },
  { key: 'monthly_rent', label: 'Rent', weight: 5, required: false, alt: 'price' },
  { key: 'description', label: 'Description', weight: 5, required: false },
  { key: 'epc_rating', label: 'EPC rating', weight: 4, required: false },
  { key: 'images', label: 'Images', weight: 5, required: false, isArray: true },
];

function fieldPresent(property, field) {
  if (field.isArray) {
    return Array.isArray(property.images) && property.images.length > 0;
  }
  if (hasValue(property[field.key])) return true;
  if (field.alt && hasValue(property[field.alt])) return true;
  return false;
}

function assessPropertyDataQuality(property) {
  const isCommercial =
    property.property_category === 'commercial' ||
    (property.category === 'lease' && property.use_class);

  const fields = isCommercial ? COMMERCIAL_FIELDS : RESIDENTIAL_FIELDS;
  let earned = 0;
  let total = 0;
  const available = [];
  const missing = [];

  fields.forEach((field) => {
    total += field.weight;
    const present = fieldPresent(property, field);
    if (present) {
      earned += field.weight;
      available.push(field.label);
    } else if (field.required) {
      missing.push({ label: field.label, severity: 'required' });
    } else {
      missing.push({ label: field.label, severity: 'optional' });
    }
  });

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  let level = 'Low';
  if (score >= 75) level = 'High';
  else if (score >= 50) level = 'Medium';

  const requiredMissing = missing.filter((m) => m.severity === 'required').map((m) => m.label);

  return {
    score,
    level,
    available: [...new Set(available)],
    missing: missing.map((m) => m.label),
    requiredMissing,
    sufficientForAnalysis: requiredMissing.length <= 2 && score >= 40,
    fieldBreakdown: fields.map((f) => ({
      label: f.label,
      present: fieldPresent(property, f),
      weight: f.weight,
    })),
  };
}

module.exports = { assessPropertyDataQuality };
