/**
 * Display-only Property Facts helpers for Property Intelligence.
 * Does not invent facts. Does not change backend semantics.
 *
 * Parking: listing `parking_spaces` means off-street space count when a
 * plausible integer. Subject-attribute capture already caps at 20 — values
 * outside that accepted range are treated as unsafe for human display.
 */

import { FINISH_QUALITY_UI_OPTIONS } from './finishQualityProviderInput';

/** Mirrors server subjectPropertyAttributes.parseNonNegativeInt max for parking. */
export const MAX_SAFE_PARKING_SPACES_DISPLAY = 20;

const TITLE_WORDS = {
  flat: 'Flat',
  apartment: 'Apartment',
  house: 'House',
  terraced: 'Terraced house',
  terrace: 'Terraced house',
  'semi-detached': 'Semi-detached house',
  semidetached: 'Semi-detached house',
  detached: 'Detached house',
  bungalow: 'Bungalow',
  maisonette: 'Maisonette',
  studio: 'Studio',
  retail: 'Retail',
  office: 'Office',
  industrial: 'Industrial',
  restaurant: 'Restaurant',
  warehouse: 'Warehouse',
  land: 'Land',
  'park-home': 'Park home',
  parkhome: 'Park home',
};

export function provenanceClassLabel(kind) {
  if (kind === 'official') return 'Official';
  if (kind === 'licensed') return 'Licensed';
  if (kind === 'listing') return 'Listing supplied';
  if (kind === 'user') return 'User provided';
  return null;
}

/**
 * Map stored observation provenance strings → display class.
 * Conservative: unknown tokens → listing only when first-party listing-like.
 */
export function mapStoredProvenanceToClass(raw) {
  if (raw == null || raw === '') return null;
  const u = String(raw).toUpperCase();
  if (u === 'USER_REPORTED' || u === 'USER' || u === 'USER_PROVIDED') return 'user';
  if (u === 'OFFICIAL') return 'official';
  if (u === 'LICENSED' || u === 'THIRD_PARTY_LICENSED') return 'licensed';
  if (u === 'FIRST_PARTY' || u === 'LISTING' || u === 'INTERNAL') return 'listing';
  return null;
}

function titleCaseToken(token) {
  const key = String(token || '').toLowerCase().trim();
  if (!key) return null;
  if (TITLE_WORDS[key]) return TITLE_WORDS[key];
  return key.replace(/(^|[\s_-])(\w)/g, (_, a, b) => `${a === '_' || a === '-' ? ' ' : a}${b.toUpperCase()}`);
}

/**
 * Safe display for property_type including Postgres array strings like {"flat","flat"}.
 * Ambiguous multi-distinct tokens → joined with " / ". Empty → null (Unknown).
 */
export function sanitizePropertyTypeDisplay(raw) {
  if (raw == null || raw === '') return null;
  if (Array.isArray(raw)) {
    const tokens = [...new Set(raw.map((v) => String(v).toLowerCase().trim()).filter(Boolean))];
    if (!tokens.length) return null;
    return tokens.map(titleCaseToken).filter(Boolean).join(' / ');
  }
  const text = String(raw).trim();
  if (!text || /^unknown$/i.test(text) || text === '—' || text === '-') return null;
  const pg = text.match(/^\{([\s\S]*)\}$/);
  if (pg) {
    const tokens = [
      ...new Set(
        pg[1]
          .split(',')
          .map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase())
          .filter(Boolean)
      ),
    ];
    if (!tokens.length) return null;
    return tokens.map(titleCaseToken).filter(Boolean).join(' / ');
  }
  return titleCaseToken(text) || text;
}

function presentScalar(value) {
  return value != null && value !== '';
}

function factRow(id, label, value, provenance, extras = {}) {
  const known = presentScalar(value);
  return {
    id,
    label,
    value: known ? value : null,
    known,
    provenance: known ? provenance : null,
    provenanceLabel: known ? provenanceClassLabel(provenance) : null,
    sourceDetail: known && extras.sourceDetail ? extras.sourceDetail : null,
    editable: Boolean(extras.editable),
    editAction: extras.editAction || null,
  };
}

function finishDisplayLabel(raw, { allowAverage = false } = {}) {
  if (!presentScalar(raw)) return null;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'average' && !allowAverage) return null;
  const opt = FINISH_QUALITY_UI_OPTIONS.find((o) => o.providerValue === key);
  if (opt) return opt.userLabel;
  return String(raw);
}

function outdoorDisplayFromListing(preview) {
  if (preview.outdoor_none_confirmed === true || preview.outdoorNoneConfirmed === true) {
    return 'No outdoor space';
  }
  if (preview.has_garden === true || preview.has_balcony_terrace === true) {
    const bits = [];
    if (preview.has_garden === true) bits.push('Garden');
    if (preview.has_balcony_terrace === true) bits.push('Balcony / terrace');
    return bits.join(', ');
  }
  return null;
}

function outdoorDisplayFromAttribute(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'garden') return 'Garden';
  if (v === 'balcony_terrace' || v === 'balcony' || v === 'terrace') return 'Balcony / terrace';
  if (v === 'none') return 'No outdoor space';
  return presentScalar(value) ? String(value) : null;
}

/**
 * Safe parking display from listing fields.
 * - has_parking true → Available
 * - parking_spaces 1..MAX_SAFE → "N spaces"
 * - 0 alone / false / null / out-of-range (e.g. 230) → Unknown
 */
export function sanitizeParkingDisplay(preview = {}) {
  const confirmed =
    preview.parking_confirmed === true || preview.parkingConfirmed === true;
  const raw = preview.parking_spaces ?? preview.parkingSpaces;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0) {
      if (n === 0) {
        return confirmed ? { value: 'None confirmed', safe: true } : { value: null, safe: true };
      }
      if (n > MAX_SAFE_PARKING_SPACES_DISPLAY) {
        return {
          value: null,
          safe: false,
          reason: 'parking_spaces_outside_accepted_display_range',
          raw: n,
        };
      }
      return {
        value: n === 1 ? '1 space' : `${n} spaces`,
        safe: true,
      };
    }
    return { value: null, safe: false, reason: 'parking_spaces_non_integer', raw };
  }
  if (preview.has_parking === true || preview.hasParking === true) {
    return { value: 'Available', safe: true };
  }
  return { value: null, safe: true };
}

function pickObservation(attributes, key) {
  if (!attributes || typeof attributes !== 'object') return null;
  const obs = attributes[key];
  if (!obs || typeof obs !== 'object' || !obs.available) return null;
  return obs;
}

/**
 * Build compact What-we-know rows from preview (+ optional subject attributes).
 * Does not include UPRN/reference (secondary identity stays on PropertyHeader).
 * Does not include area/postcode market metrics or scenario assumptions.
 */
export function buildPropertyFactsFromPreview(
  preview,
  { isExternal = false, attributes = null } = {}
) {
  if (!preview) return [];

  const defaultListingProvenance = isExternal ? null : 'listing';
  const rows = [];

  // --- Property type ---
  const typeObs = pickObservation(attributes, 'propertyType');
  const typeDisplay =
    (typeObs && sanitizePropertyTypeDisplay(typeObs.value))
    || sanitizePropertyTypeDisplay(preview.property_type || preview.propertyType);
  const typeProv =
    (typeObs && mapStoredProvenanceToClass(typeObs.provenance))
    || (typeDisplay ? (defaultListingProvenance || (isExternal ? 'licensed' : 'listing')) : null);
  rows.push(factRow('propertyType', 'Property type', typeDisplay, typeProv));

  // --- Bedrooms ---
  const bedObs = pickObservation(attributes, 'bedrooms');
  if (bedObs && bedObs.value != null && bedObs.value !== '') {
    rows.push(
      factRow(
        'bedrooms',
        'Bedrooms',
        String(bedObs.value),
        mapStoredProvenanceToClass(bedObs.provenance) || 'user',
        { editable: true, editAction: 'edit' }
      )
    );
  } else if (presentScalar(preview.bedrooms)) {
    rows.push(
      factRow(
        'bedrooms',
        'Bedrooms',
        String(preview.bedrooms),
        defaultListingProvenance || 'listing',
        { editable: true, editAction: 'edit' }
      )
    );
  } else {
    rows.push(
      factRow('bedrooms', 'Bedrooms', null, null, { editable: true, editAction: 'add' })
    );
  }

  // --- Bathrooms ---
  const bathObs = pickObservation(attributes, 'bathrooms');
  if (bathObs && bathObs.value != null && bathObs.value !== '') {
    rows.push(
      factRow(
        'bathrooms',
        'Bathrooms',
        String(bathObs.value).replace(/\.0$/, ''),
        mapStoredProvenanceToClass(bathObs.provenance) || 'user',
        { editable: true, editAction: 'edit' }
      )
    );
  } else if (presentScalar(preview.bathrooms)) {
    const baths = String(preview.bathrooms).replace(/\.0$/, '');
    rows.push(
      factRow('bathrooms', 'Bathrooms', baths, defaultListingProvenance || 'listing', {
        editable: true,
        editAction: 'edit',
      })
    );
  } else {
    rows.push(
      factRow('bathrooms', 'Bathrooms', null, null, { editable: true, editAction: 'add' })
    );
  }

  // --- Floor area ---
  const area =
    preview.floor_area != null && preview.floor_area !== ''
      ? preview.floor_area
      : preview.square_feet != null && preview.square_feet !== ''
        ? preview.square_feet
        : null;
  if (area != null && area !== '' && Number.isFinite(Number(area))) {
    const fromFloorAreaField = preview.floor_area != null && preview.floor_area !== '';
    const unit =
      fromFloorAreaField
      && (preview.floor_area_unit === 'sq_m' || preview.floorAreaUnit === 'sq_m')
        ? 'm²'
        : 'sq ft';
    rows.push(
      factRow(
        'floorArea',
        'Floor area',
        `${area} ${unit}`,
        defaultListingProvenance || (isExternal ? 'licensed' : 'listing')
      )
    );
  } else {
    rows.push(factRow('floorArea', 'Floor area', null, null));
  }

  // --- Construction age ---
  const officialAge =
    preview.officialConstructionAge
    || preview.official_construction_age
    || null;
  const ageBand =
    preview.construction_age_band
    || preview.constructionAgeBand
    || null;
  const yearBuilt = preview.year_built ?? preview.yearBuilt ?? null;
  if (presentScalar(officialAge)) {
    rows.push(
      factRow('constructionAge', 'Construction age', String(officialAge), 'official', {
        sourceDetail: 'EPC',
      })
    );
  } else if (presentScalar(ageBand)) {
    rows.push(
      factRow(
        'constructionAge',
        'Construction age',
        String(ageBand),
        defaultListingProvenance || 'listing'
      )
    );
  } else if (presentScalar(yearBuilt)) {
    rows.push(
      factRow(
        'constructionAge',
        'Construction age',
        String(yearBuilt),
        defaultListingProvenance || 'listing'
      )
    );
  } else {
    rows.push(factRow('constructionAge', 'Construction age', null, null));
  }

  // --- Finish / condition ---
  const finishObs =
    pickObservation(attributes, 'finishQualityProviderRequest')
    || pickObservation(attributes, 'finishQuality');
  if (finishObs && finishObs.value != null && finishObs.value !== '') {
    const finishLabel = finishDisplayLabel(finishObs.value, { allowAverage: true });
    rows.push(
      factRow(
        'finish',
        'Finish / condition',
        finishLabel,
        mapStoredProvenanceToClass(finishObs.provenance) || 'user',
        {
          editable: true,
          editAction: 'edit',
          sourceDetail: finishObs.providerRequestOnly ? 'User input' : null,
        }
      )
    );
  } else {
    const finishRaw =
      preview.finish_quality
      || preview.finishQuality
      || preview.condition;
    // Listing "average" is commonly a form default — never treat as known evidence here.
    const finishLabel = finishDisplayLabel(finishRaw, { allowAverage: false });
    if (finishLabel) {
      rows.push(
        factRow('finish', 'Finish / condition', finishLabel, defaultListingProvenance || 'listing', {
          editable: true,
          editAction: 'edit',
        })
      );
    } else {
      rows.push(
        factRow('finish', 'Finish / condition', null, null, {
          editable: true,
          editAction: 'add',
        })
      );
    }
  }

  // --- Parking ---
  const parkObs = pickObservation(attributes, 'offStreetParking');
  if (parkObs && parkObs.value != null && parkObs.value !== '') {
    const n = Number(parkObs.value);
    const parkLabel =
      Number.isFinite(n) && n === 0
        ? 'None confirmed'
        : Number.isFinite(n) && n > 0
          ? n === 1
            ? '1 space'
            : `${Math.floor(n)} spaces`
          : String(parkObs.value);
    rows.push(
      factRow(
        'parking',
        'Parking',
        parkLabel,
        mapStoredProvenanceToClass(parkObs.provenance) || 'user',
        { editable: true, editAction: 'edit' }
      )
    );
  } else {
    const parking = sanitizeParkingDisplay(preview);
    rows.push(
      factRow(
        'parking',
        'Parking',
        parking.value,
        parking.value ? defaultListingProvenance || 'listing' : null,
        { editable: true, editAction: parking.value ? 'edit' : 'add' }
      )
    );
  }

  // --- Outdoor ---
  const outdoorObs = pickObservation(attributes, 'outdoor');
  if (outdoorObs && outdoorObs.value != null && outdoorObs.value !== '') {
    rows.push(
      factRow(
        'outdoor',
        'Outdoor space',
        outdoorDisplayFromAttribute(outdoorObs.value),
        mapStoredProvenanceToClass(outdoorObs.provenance) || 'user',
        { editable: true, editAction: 'edit' }
      )
    );
  } else {
    const outdoorValue = outdoorDisplayFromListing(preview);
    rows.push(
      factRow(
        'outdoor',
        'Outdoor space',
        outdoorValue,
        outdoorValue ? defaultListingProvenance || 'listing' : null,
        { editable: true, editAction: outdoorValue ? 'edit' : 'add' }
      )
    );
  }

  return rows;
}
