/**
 * Observed listing fields that engines previously ignored or zero-filled.
 * Missing values stay notAssessed — never coerced to 0 or a default band.
 *
 * Frequency is a listing-column contract, not a guess:
 * - service_charges (residential AddList/PropertyView): monthly
 * - service_charge (commercial column comment): monthly
 * - ground_rent (AddList/PropertyView/DB comment): annual
 */
const LISTING_COST_FREQUENCY = Object.freeze({
  service_charges: 'monthly',
  service_charge: 'monthly',
  ground_rent: 'annual',
});

const { createProvenance } = require('../../utils/provenance');

function isSupplied(value) {
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
}

function isText(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function observedNumber(value, { field, observedAt = null, notes = null } = {}) {
  if (!isSupplied(value)) {
    return {
      available: false,
      value: null,
      state: 'notAssessed',
      field,
      kind: 'observed',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'listing_field',
        observedAt,
        notes: notes || `${field} was not supplied on the listing.`,
      }),
    };
  }
  return {
    available: true,
    value: Number(value),
    state: 'observed',
    field,
    kind: 'observed',
    provenance: createProvenance({
      source: 'InternalListing',
      method: 'listing_field',
      observedAt,
      notes,
    }),
  };
}

function observedText(value, { field, observedAt = null } = {}) {
  if (!isText(value)) {
    return {
      available: false,
      value: null,
      state: 'notAssessed',
      field,
      kind: 'observed',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'listing_field',
        observedAt,
        notes: `${field} was not supplied on the listing.`,
      }),
    };
  }
  return {
    available: true,
    value: String(value).trim(),
    state: 'observed',
    field,
    kind: 'observed',
    provenance: createProvenance({
      source: 'InternalListing',
      method: 'listing_field',
      observedAt,
    }),
  };
}

function freshnessFrom(property) {
  return property?.updated_at || property?.created_at || null;
}

/**
 * Residential listings store `service_charges`; commercial/lease uses `service_charge`.
 * Do not silently pick the other column when both are present and disagree without category.
 */
function pickServiceCharge(property = {}) {
  const observedAt = freshnessFrom(property);
  const residential = isSupplied(property.service_charges) ? Number(property.service_charges) : null;
  const commercial = isSupplied(property.service_charge) ? Number(property.service_charge) : null;
  const category = String(property.category || property.property_category || '').toLowerCase();

  if (residential != null && commercial != null && residential !== commercial) {
    if (category === 'lease' || category === 'commercial') {
      return observedNumber(commercial, {
        field: 'service_charge',
        observedAt,
        notes: 'Commercial/lease service_charge used; residential service_charges also present.',
      });
    }
    return observedNumber(residential, {
      field: 'service_charges',
      observedAt,
      notes: 'Residential service_charges used; commercial service_charge also present.',
    });
  }

  if (residential != null) {
    return observedNumber(residential, { field: 'service_charges', observedAt });
  }
  if (commercial != null) {
    return observedNumber(commercial, { field: 'service_charge', observedAt });
  }
  return observedNumber(null, { field: 'service_charges', observedAt });
}

function pickGroundRent(property = {}) {
  return observedNumber(property.ground_rent, {
    field: 'ground_rent',
    observedAt: freshnessFrom(property),
    notes: 'Missing ground rent is notAssessed and must not be treated as £0.',
  });
}

function pickCouncilTax(property = {}) {
  const observedAt = freshnessFrom(property);
  const band = observedText(property.council_tax_band, { field: 'council_tax_band', observedAt });
  const status = observedText(property.council_tax_status, {
    field: 'council_tax_status',
    observedAt,
  });
  return { band, status };
}

function pickBroadband(property = {}) {
  return observedText(property.broadband_availability, {
    field: 'broadband_availability',
    observedAt: freshnessFrom(property),
  });
}

function listingObservedCharges(property = {}) {
  return {
    serviceCharge: pickServiceCharge(property),
    groundRent: pickGroundRent(property),
    councilTax: pickCouncilTax(property),
    broadband: pickBroadband(property),
  };
}

/**
 * Boolean listing columns default to false / 0 in the schema.
 * Only an explicit positive value is treated as observed evidence.
 */
function pickPositiveBoolean(value, { field, observedAt = null, missingNote } = {}) {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return {
      available: true,
      value: true,
      state: 'observed',
      field,
      kind: 'observed',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'listing_field',
        observedAt,
      }),
    };
  }
  return {
    available: false,
    value: null,
    state: 'notAssessed',
    field,
    kind: 'observed',
    provenance: createProvenance({
      source: 'InternalListing',
      method: 'listing_field',
      observedAt,
      notes:
        missingNote ||
        `${field} is notAssessed unless explicitly true. Schema default false/0 is not evidence of absence.`,
    }),
  };
}

function pickPositiveCount(value, { field, observedAt = null } = {}) {
  if (!isSupplied(value) || Number(value) <= 0) {
    return {
      available: false,
      value: null,
      state: 'notAssessed',
      field,
      kind: 'observed',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'listing_field',
        observedAt,
        notes: `${field} of 0, false or blank is notAssessed because the listing column defaults to 0.`,
      }),
    };
  }
  return observedNumber(value, { field, observedAt });
}

function pickHeating(property = {}) {
  const observedAt = freshnessFrom(property);
  const residential = observedText(property.heating_type, { field: 'heating_type', observedAt });
  if (residential.available) return residential;
  return observedText(property.heating_cooling, { field: 'heating_cooling', observedAt });
}

function listingObservedAmenities(property = {}) {
  const observedAt = freshnessFrom(property);
  return {
    outdoorSpace: pickPositiveBoolean(property.has_garden, {
      field: 'has_garden',
      observedAt,
      missingNote:
        'Outdoor space is notAssessed unless has_garden is explicitly true. Default false is not “no garden”.',
    }),
    garage: pickPositiveBoolean(property.has_garage, {
      field: 'has_garage',
      observedAt,
      missingNote:
        'Garage is notAssessed unless has_garage is explicitly true. Default false is not “no garage”.',
    }),
    parkingSpaces: pickPositiveCount(property.parking_spaces, {
      field: 'parking_spaces',
      observedAt,
    }),
    heating: pickHeating(property),
    broadband: pickBroadband(property),
  };
}

function financeHintsFromListing(property = {}) {
  const charges = listingObservedCharges(property);
  const hints = {};
  if (charges.serviceCharge.available) hints.serviceCharge = 'property_data';
  if (charges.groundRent.available) hints.groundRent = 'property_data';
  return { charges, hints };
}

function frequencyForListingField(field) {
  return LISTING_COST_FREQUENCY[field] || null;
}

module.exports = {
  isSupplied,
  LISTING_COST_FREQUENCY,
  frequencyForListingField,
  listingObservedCharges,
  listingObservedAmenities,
  pickServiceCharge,
  pickGroundRent,
  pickCouncilTax,
  pickBroadband,
  pickHeating,
  pickPositiveBoolean,
  pickPositiveCount,
  financeHintsFromListing,
};
