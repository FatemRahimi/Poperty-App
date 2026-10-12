/**
 * Resolve and persist subject property attributes (beds/baths/outdoor/parking).
 * Listing attributes used only when subject.property_id binds to that listing.
 * USER_REPORTED never upgrades to OFFICIAL.
 */

const {
  ATTRIBUTE,
  PROVENANCE,
  ASSESSMENT,
  OUTDOOR_VALUE,
  emptyObservation,
  assessedObservation,
  observationFromStored,
  parseSubjectAttributeInput,
  PROVIDER_FINISH_ENUMS,
} = require('../../architecture/subjectPropertyAttributes');
const {
  findSubjectById,
  upsertSubject,
  userHasSubjectLookup,
} = require('../enrichment/intelligenceSubjectRepository');

function parseAttrs(subject) {
  let attrs = subject?.attributes;
  if (typeof attrs === 'string') {
    try { attrs = JSON.parse(attrs); } catch { attrs = {}; }
  }
  return attrs && typeof attrs === 'object' ? attrs : {};
}

/**
 * Listing-bound first-party observations.
 * UNKNOWN != ZERO: DB defaults (has_garden false, parking_spaces 0) are NOT confirmed absence.
 */
function observationsFromListing(property = {}, { subjectId = null } = {}) {
  const out = {
    bedrooms: emptyObservation(ATTRIBUTE.BEDROOMS),
    bathrooms: emptyObservation(ATTRIBUTE.BATHROOMS),
    outdoor: emptyObservation(ATTRIBUTE.OUTDOOR),
    offStreetParking: emptyObservation(ATTRIBUTE.OFF_STREET_PARKING),
  };
  if (!property || property.id == null) return out;

  const beds = property.bedrooms;
  if (beds !== undefined && beds !== null && beds !== '') {
    const n = Number(beds);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0) {
      out.bedrooms = assessedObservation(ATTRIBUTE.BEDROOMS, n, {
        provenance: PROVENANCE.FIRST_PARTY,
        source: 'listing_properties',
        note: `Bound listing id=${property.id}`,
      });
    }
  }

  const baths = property.bathrooms;
  if (baths !== undefined && baths !== null && baths !== '') {
    const n = Number(baths);
    if (Number.isFinite(n) && n >= 0) {
      out.bathrooms = assessedObservation(ATTRIBUTE.BATHROOMS, Math.floor(n), {
        provenance: PROVENANCE.FIRST_PARTY,
        source: 'listing_properties',
        note: `Bound listing id=${property.id}`,
      });
    }
  }

  // Only explicit true counts as garden; false default is unknown.
  if (property.has_garden === true || property.hasGarden === true) {
    out.outdoor = assessedObservation(ATTRIBUTE.OUTDOOR, OUTDOOR_VALUE.GARDEN, {
      provenance: PROVENANCE.FIRST_PARTY,
      source: 'listing_properties',
    });
  } else if (property.has_balcony_terrace === true || property.hasBalcony === true || property.has_balcony === true) {
    out.outdoor = assessedObservation(ATTRIBUTE.OUTDOOR, OUTDOOR_VALUE.BALCONY_TERRACE, {
      provenance: PROVENANCE.FIRST_PARTY,
      source: 'listing_properties',
    });
  }
  // Explicit listing confirmation of no outdoor (rare); require outdoor_none_confirmed
  if (property.outdoor_none_confirmed === true || property.outdoorNoneConfirmed === true) {
    out.outdoor = assessedObservation(ATTRIBUTE.OUTDOOR, OUTDOOR_VALUE.NONE, {
      provenance: PROVENANCE.FIRST_PARTY,
      source: 'listing_properties',
    });
  }

  const parking = property.parking_spaces ?? property.parkingSpaces;
  if (property.parking_confirmed === true || property.parkingConfirmed === true) {
    const n = Number(parking);
    if (Number.isFinite(n) && n >= 0) {
      out.offStreetParking = assessedObservation(ATTRIBUTE.OFF_STREET_PARKING, Math.floor(n), {
        provenance: PROVENANCE.FIRST_PARTY,
        source: 'listing_properties',
      });
    }
  } else if (parking !== undefined && parking !== null && parking !== '') {
    const n = Number(parking);
    // Positive counts are treated as observed; zero alone is ambiguous with DEFAULT 0.
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
      out.offStreetParking = assessedObservation(ATTRIBUTE.OFF_STREET_PARKING, n, {
        provenance: PROVENANCE.FIRST_PARTY,
        source: 'listing_properties',
      });
    }
  }

  out.subjectId = subjectId;
  out.listingId = property.id;
  return out;
}

function observationsFromSubjectAttributes(attrs = {}, subjectId = null) {
  const bag = attrs.propertyAttributes || {};
  const out = {
    bedrooms: observationFromStored(ATTRIBUTE.BEDROOMS, bag.bedrooms),
    bathrooms: observationFromStored(ATTRIBUTE.BATHROOMS, bag.bathrooms),
    outdoor: observationFromStored(ATTRIBUTE.OUTDOOR, bag.outdoor),
    offStreetParking: observationFromStored(ATTRIBUTE.OFF_STREET_PARKING, bag.offStreetParking),
    subjectId,
    listingId: null,
  };
  const pri = attrs.providerRequestInputs || {};
  if (pri.finishQuality && PROVIDER_FINISH_ENUMS.includes(String(pri.finishQuality))) {
    out.finishQualityProviderRequest = {
      available: true,
      value: pri.finishQuality,
      provenance: pri.provenance || PROVENANCE.USER_REPORTED,
      providerRequestOnly: true,
      source: pri.source || 'subject_provider_request_input',
      asOf: pri.asOf || null,
    };
  } else {
    out.finishQualityProviderRequest = { available: false, value: null, providerRequestOnly: true };
  }
  return out;
}

function prefer(userReported, listing, field) {
  if (userReported?.available) {
    if (listing?.available && listing.value !== userReported.value) {
      return {
        ...userReported,
        state: ASSESSMENT.CONFLICT,
        conflict: {
          status: 'user_reported_differs_from_listing',
          listingValue: listing.value,
          listingProvenance: listing.provenance,
          retained: 'USER_REPORTED',
        },
      };
    }
    return userReported;
  }
  if (listing?.available) return listing;
  return emptyObservation(field);
}

/**
 * Resolve attributes for a subject. Listing used only when property_id matches.
 */
function resolveSubjectPropertyAttributes({
  subject = null,
  listingProperty = null,
} = {}) {
  const subjectId = subject?.id ?? null;
  const attrs = parseAttrs(subject);
  const fromSubject = observationsFromSubjectAttributes(attrs, subjectId);

  const boundListingId = subject?.property_id ?? subject?.propertyId ?? null;
  let fromListing = {
    bedrooms: emptyObservation(ATTRIBUTE.BEDROOMS),
    bathrooms: emptyObservation(ATTRIBUTE.BATHROOMS),
    outdoor: emptyObservation(ATTRIBUTE.OUTDOOR),
    offStreetParking: emptyObservation(ATTRIBUTE.OFF_STREET_PARKING),
  };

  if (
    listingProperty
    && boundListingId != null
    && Number(listingProperty.id) === Number(boundListingId)
  ) {
    fromListing = observationsFromListing(listingProperty, { subjectId });
  }

  const finishFromProperty = listingProperty?.finish_quality || listingProperty?.finishQuality || null;
  let finishQualityProviderRequest = fromSubject.finishQualityProviderRequest;
  if (!finishQualityProviderRequest?.available && finishFromProperty
    && PROVIDER_FINISH_ENUMS.includes(String(finishFromProperty).toLowerCase().replace(/[\s-]+/g, '_'))) {
    finishQualityProviderRequest = {
      available: true,
      value: String(finishFromProperty).toLowerCase().replace(/[\s-]+/g, '_'),
      provenance: PROVENANCE.FIRST_PARTY,
      providerRequestOnly: true,
      source: 'listing_provider_request_input',
    };
  }

  return {
    subjectId,
    boundListingId: boundListingId != null ? Number(boundListingId) : null,
    bedrooms: prefer(fromSubject.bedrooms, fromListing.bedrooms, ATTRIBUTE.BEDROOMS),
    bathrooms: prefer(fromSubject.bathrooms, fromListing.bathrooms, ATTRIBUTE.BATHROOMS),
    outdoor: prefer(fromSubject.outdoor, fromListing.outdoor, ATTRIBUTE.OUTDOOR),
    offStreetParking: prefer(fromSubject.offStreetParking, fromListing.offStreetParking, ATTRIBUTE.OFF_STREET_PARKING),
    finishQualityProviderRequest,
  };
}

/**
 * Apply resolved attributes onto a valuation property object (adapter input).
 */
function applySubjectAttributesToProperty(property = {}, resolved) {
  const next = { ...property };
  if (resolved.bedrooms?.available) {
    next.bedrooms = resolved.bedrooms.value;
    next.bedroomsProvenance = resolved.bedrooms.provenance;
  }
  if (resolved.bathrooms?.available) {
    next.bathrooms = resolved.bathrooms.value;
    next.bathroomsProvenance = resolved.bathrooms.provenance;
  }
  if (resolved.outdoor?.available) {
    next.outdoor = resolved.outdoor.value;
    next.outdoorProvenance = resolved.outdoor.provenance;
    // Convenience flags for legacy mappers — confirmed none is explicit
    if (resolved.outdoor.value === OUTDOOR_VALUE.GARDEN) next.has_garden = true;
    if (resolved.outdoor.value === OUTDOOR_VALUE.BALCONY_TERRACE) next.has_balcony_terrace = true;
    if (resolved.outdoor.value === OUTDOOR_VALUE.NONE) {
      next.has_garden = false;
      next.outdoor_none_confirmed = true;
    }
  }
  if (resolved.offStreetParking?.available) {
    next.parking_spaces = resolved.offStreetParking.value;
    next.parking_confirmed = true;
    next.parkingProvenance = resolved.offStreetParking.provenance;
  }
  if (resolved.finishQualityProviderRequest?.available) {
    next.finish_quality = resolved.finishQualityProviderRequest.value;
    next.finishQualityProvenance = resolved.finishQualityProviderRequest.provenance;
    next.finishQualityProviderRequestOnly = true;
  }
  next.subjectPropertyAttributes = resolved;
  return next;
}

async function saveUserReportedSubjectAttributes({
  subjectId,
  userId,
  body,
  isAdmin = false,
  deps = {},
} = {}) {
  const find = deps.findSubjectById || findSubjectById;
  const hasLookup = deps.userHasSubjectLookup || userHasSubjectLookup;
  const upsert = deps.upsertSubject || upsertSubject;

  const subject = await find(subjectId);
  if (!subject) {
    return { success: false, code: 'NOT_FOUND', message: 'Subject not found.' };
  }
  if (!isAdmin) {
    const allowed = await hasLookup(userId, subjectId);
    if (!allowed) {
      return { success: false, code: 'FORBIDDEN', message: 'Not authorized for this subject.' };
    }
  }

  const parsed = parseSubjectAttributeInput(body || {});
  if (!parsed.ok) {
    return { success: false, code: 'INVALID_INPUT', message: 'Invalid attribute input.', errors: parsed.errors };
  }

  const now = new Date().toISOString();
  const existing = parseAttrs(subject);
  const propertyAttributes = { ...(existing.propertyAttributes || {}) };
  const providerRequestInputs = { ...(existing.providerRequestInputs || {}) };

  for (const [key, value] of Object.entries(parsed.attributes)) {
    const prior = propertyAttributes[key];
    propertyAttributes[key] = {
      value,
      provenance: PROVENANCE.USER_REPORTED,
      source: 'subject_attribute_capture',
      asOf: now,
      updatedAt: now,
      previousValue: prior?.value !== undefined ? prior.value : null,
      conflict: prior?.value != null && prior.value !== value
        ? { status: 'replaced_prior_user_or_stored_value', prior: prior.value }
        : null,
    };
  }

  if (parsed.providerRequestInputs.finishQuality) {
    providerRequestInputs.finishQuality = parsed.providerRequestInputs.finishQuality;
    providerRequestInputs.finishQualityIsProviderRequestOnly = true;
    providerRequestInputs.provenance = PROVENANCE.USER_REPORTED;
    providerRequestInputs.source = 'subject_provider_request_input';
    providerRequestInputs.asOf = now;
  }

  const saved = await upsert({
    uprn: subject.uprn,
    normalizedAddress: subject.normalized_address,
    postcode: subject.postcode,
    latitude: subject.latitude,
    longitude: subject.longitude,
    propertyId: subject.property_id,
    attributes: {
      propertyAttributes,
      providerRequestInputs,
    },
    profileSnapshot: {},
    provider: subject.provider || 'USER_REPORTED',
    matchConfidence: subject.match_confidence || 'medium',
    matchMethod: subject.match_method || 'subject_attribute_capture',
    createdBy: userId,
  });

  const resolved = resolveSubjectPropertyAttributes({ subject: saved });
  const readinessPreview = previewAvmReadinessFromPropertyContext({
    propertyContext: body?.propertyContext || body?.readinessProperty || null,
    resolved,
  });
  return {
    success: true,
    subjectId: saved.id,
    attributes: resolved,
    readiness: readinessPreview,
    message: 'Subject property attributes saved as USER_REPORTED.',
  };
}

/**
 * Dry-run AVM readiness after attribute resolution. Never calls the provider.
 * propertyContext must already carry legitimate postcode/type/area/construction
 * when those are known — this helper does not invent them.
 */
function previewAvmReadinessFromPropertyContext({ propertyContext = null, resolved = null } = {}) {
  if (!propertyContext || typeof propertyContext !== 'object') {
    return null;
  }
  const { buildValuationSaleRequest } = require('../providers/propertyData/propertyTypeMapping');
  const base = {
    zip_code: propertyContext.zip_code || propertyContext.postcode || propertyContext.zipCode || null,
    postcode: propertyContext.postcode || propertyContext.zip_code || null,
    property_type: propertyContext.property_type || propertyContext.propertyType || null,
    square_feet: propertyContext.square_feet ?? propertyContext.squareFeet ?? null,
    floor_area: propertyContext.floor_area ?? propertyContext.floorArea ?? null,
    floor_area_unit: propertyContext.floor_area_unit || propertyContext.floorAreaUnit || null,
    year_built: propertyContext.year_built ?? propertyContext.yearBuilt ?? null,
    construction_age_band: propertyContext.construction_age_band
      || propertyContext.constructionAgeBand
      || null,
    constructionAgeBand: propertyContext.construction_age_band
      || propertyContext.constructionAgeBand
      || null,
    officialConstructionAge: propertyContext.officialConstructionAge || null,
    bedrooms: propertyContext.bedrooms ?? null,
    bathrooms: propertyContext.bathrooms ?? null,
    has_garden: propertyContext.has_garden,
    outdoor: propertyContext.outdoor || null,
    outdoor_none_confirmed: propertyContext.outdoor_none_confirmed,
    parking_spaces: propertyContext.parking_spaces ?? propertyContext.parkingSpaces ?? null,
    parking_confirmed: propertyContext.parking_confirmed,
    finish_quality: propertyContext.finish_quality || propertyContext.finishQuality || null,
  };
  const applied = resolved
    ? applySubjectAttributesToProperty(base, resolved)
    : base;
  const built = buildValuationSaleRequest(applied);
  return {
    canRequestAvm: built.canRequestAvm === true,
    state: built.readiness?.state || null,
    reasonCode: built.readiness?.reasonCode || null,
    missingFields: built.readiness?.missingFields || [],
    providerCalled: false,
  };
}

module.exports = {
  observationsFromListing,
  observationsFromSubjectAttributes,
  resolveSubjectPropertyAttributes,
  applySubjectAttributesToProperty,
  saveUserReportedSubjectAttributes,
  previewAvmReadinessFromPropertyContext,
  parseSubjectAttributeInput,
};
