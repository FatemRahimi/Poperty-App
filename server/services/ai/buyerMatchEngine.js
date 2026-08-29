/**
 * Deterministic buyer-property matching — weighted scoring, no LLM for ranks.
 */

const { createProvenance } = require('../../utils/provenance');
const { normalisePostcode } = require('../../utils/ukAddress');

const WEIGHTS = {
  budget: 0.3,
  location: 0.25,
  bedrooms: 0.15,
  lifestyle: 0.15,
  transport: 0.08,
  schools: 0.07,
};

function formatCurrency(n) {
  if (!n || Number.isNaN(Number(n))) return '';
  return `£${Number(n).toLocaleString()}`;
}

function tokenizeLocation(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function preferredLocationParts(prefs) {
  if (Array.isArray(prefs.locations) && prefs.locations.length) {
    return prefs.locations.map((s) => String(s).trim()).filter(Boolean);
  }
  if (Array.isArray(prefs.location)) {
    return prefs.location.map((s) => String(s).trim()).filter(Boolean);
  }
  const raw = String(prefs.location || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function locationStringImpliesNonArea(text) {
  return /\b(minutes?|mins?|commute|radius|destination)\b|\bwithin\s+\d|\d+\s*(miles?|km)\s+of\b/i.test(
    String(text || '')
  );
}

function locationExtras(prefs) {
  const locationType = String(prefs.locationType || prefs.locationMode || '')
    .toLowerCase()
    .trim();
  const locationText = Array.isArray(prefs.location)
    ? prefs.location.join(' ')
    : String(prefs.location || '');
  const commuteFromText = locationStringImpliesNonArea(locationText);
  const commute = locationType === 'commute' || commuteFromText;
  const radiusMiles = Number(prefs.radius || prefs.radiusMiles || prefs.maxRadiusMiles);
  const radiusKm = Number(prefs.radiusKm || prefs.maxRadiusKm);
  const radius =
    locationType === 'radius' ||
    (Number.isFinite(radiusMiles) && radiusMiles > 0) ||
    (Number.isFinite(radiusKm) && radiusKm > 0);
  const destinationRaw = prefs.destination || '';
  const destination =
    locationType === 'destination' || Boolean(String(destinationRaw).trim());
  return {
    commute,
    radius,
    destination,
    radiusMiles: Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : null,
    destinationText: String(destinationRaw).trim() || null,
    locationType: locationType || (commuteFromText ? 'commute' : radius ? 'radius' : ''),
  };
}

function pickRadiusEvidence(property, intelligence = {}) {
  const miles = Number(
    property.distanceMiles ||
      property.distanceFromSearchMiles ||
      intelligence.location?.distanceMiles ||
      intelligence.distanceMiles
  );
  return Number.isFinite(miles) && miles >= 0 ? miles : null;
}

/** A dimension we can genuinely assess. Extra fields (complete, etc.) pass through. */
function scored(score, state, reasons = [], extra = {}) {
  return { available: true, score, state, reasons, ...extra };
}

/**
 * A dimension we cannot assess. Score is null — never a neutral stand-in — so the
 * weight renormalises out instead of inventing a fit that was never measured.
 */
function unavailable(state, reason) {
  return { available: false, score: null, state, reasons: [], unavailableReason: reason };
}

function scoreBudget(property, prefs) {
  const price = Number(property.price || property.monthly_rent || property.rent_pcm || 0);
  const maxBudget = Number(prefs.budgetMax || prefs.budget || 0);
  const minBudget = Number(prefs.budgetMin || 0);
  const reasons = [];

  if (!price && !maxBudget) {
    return unavailable(
      'no_price_or_budget',
      'Property has no price and no budget was supplied — affordability cannot be assessed.'
    );
  }
  if (!price) {
    return unavailable('no_price', 'Property has no listed price — affordability cannot be assessed.');
  }
  if (!maxBudget) {
    return unavailable(
      'no_budget_preference',
      'No budget supplied — affordability cannot be assessed against your requirements.'
    );
  }

  let score = 0;
  const ratio = price / maxBudget;

  if (ratio <= 0.85) {
    score = 100;
    reasons.push('Well within budget');
  } else if (ratio <= 1) {
    score = 85;
    reasons.push('Within budget');
  } else if (ratio <= 1.08) {
    score = 55;
    reasons.push('Slightly above budget');
  } else if (ratio <= 1.15) {
    score = 30;
    reasons.push('Above budget');
  } else {
    score = 5;
    reasons.push('Significantly above budget');
  }

  if (minBudget && price >= minBudget) {
    score = Math.min(100, score + 5);
  }

  return scored(score, 'assessed', reasons);
}

function scoreAreaAgainstParts(property, parts) {
  const haystack = [
    property.city,
    property.town,
    property.address_line1,
    property.address,
    property.zip_code,
    property.postcode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!haystack.trim()) {
    return unavailable(
      'no_property_location',
      'Property has no city, address or postcode recorded — location fit cannot be assessed.'
    );
  }

  const propPostcode = normalisePostcode(property.zip_code || property.postcode).toLowerCase();
  const reasons = [];
  let best = 0;
  let matchedPart = null;

  parts.forEach((part) => {
    const prefix = normalisePostcode(part).split(' ')[0]?.toLowerCase();
    const looksLikePostcode = /^[a-z]{1,2}\d/i.test(prefix || '');
    if (looksLikePostcode && prefix && propPostcode.startsWith(prefix)) {
      const exact = propPostcode === normalisePostcode(part).toLowerCase();
      const partScore = exact ? 100 : 95;
      if (partScore > best) {
        best = partScore;
        matchedPart = part;
        reasons.length = 0;
        reasons.push(exact ? 'Exact postcode match' : 'Postcode area match');
      }
      return;
    }
    const tokens = tokenizeLocation(part);
    const hits = tokens.filter((t) => haystack.includes(t));
    let partScore = 0;
    if (hits.length >= 2) partScore = 90;
    else if (hits.length === 1) partScore = 70;
    if (partScore > best) {
      best = partScore;
      matchedPart = part;
      reasons.length = 0;
      reasons.push(hits.length >= 2 ? 'Strong location match' : 'Partial location match');
    }
  });

  if (best === 0) {
    return scored(20, 'outside_preferred_location', ['Outside preferred location'], {
      complete: true,
      matchedPart: null,
    });
  }

  const multi = parts.length > 1;
  if (multi) {
    reasons.push(`Matches one of ${parts.length} preferred areas (${matchedPart})`);
  }

  return scored(best, multi ? 'matches_one_preferred_area' : 'assessed', reasons, {
    complete: true,
    matchedPart,
  });
}

function scoreLocation(property, prefs, intelligence = {}) {
  const parts = preferredLocationParts(prefs);
  const extras = locationExtras(prefs);
  const areaTokens = parts.filter((p) => !locationStringImpliesNonArea(p));

  if (!areaTokens.length && !extras.radius && !extras.destination && !extras.commute) {
    return unavailable(
      'no_location_preference',
      'No preferred location supplied — location fit cannot be assessed.'
    );
  }

  if (!areaTokens.length && extras.commute && !extras.radius && !extras.destination) {
    return unavailable(
      'commute_is_not_location',
      'Commute time is a transport preference. Location fit cannot be assessed from commute alone.'
    );
  }

  const radiusEvidence = pickRadiusEvidence(property, intelligence);
  const unmet = [];
  if (extras.commute) {
    unmet.push(
      'commute time was requested as a location preference but is not a complete area assessment'
    );
  }
  if (extras.radius && radiusEvidence == null) {
    unmet.push('search radius was requested but no distance evidence is available');
  }
  if (extras.destination) {
    const dest = extras.destinationText || 'the stated destination';
    unmet.push(`destination (${dest}) was requested but no destination-distance evidence is available`);
  }

  if (!areaTokens.length && extras.radius && radiusEvidence == null) {
    return unavailable(
      'no_radius_evidence',
      'Search radius was specified but no distance evidence is available — location fit cannot be assessed.'
    );
  }

  if (!areaTokens.length && extras.destination && radiusEvidence == null) {
    return unavailable(
      'no_destination_evidence',
      'A destination was specified but no distance evidence is available — location fit cannot be assessed.'
    );
  }

  if (areaTokens.length) {
    const area = scoreAreaAgainstParts(property, areaTokens);
    if (area.available === false) return area;

    if (extras.radius && radiusEvidence != null && extras.radiusMiles != null) {
      const within = radiusEvidence <= extras.radiusMiles;
      const radiusResult = scored(
        within ? Math.max(area.score, 90) : Math.min(area.score, 25),
        within ? 'within_radius' : 'outside_radius',
        [
          ...(area.reasons || []),
          within
            ? `${radiusEvidence} miles is within the ${extras.radiusMiles}-mile search radius`
            : `${radiusEvidence} miles is outside the ${extras.radiusMiles}-mile search radius`,
        ],
        { complete: !unmet.length }
      );
      if (unmet.length) {
        return scored(
          Math.min(radiusResult.score, 60),
          'incomplete_preference',
          [
            ...(radiusResult.reasons || []),
            `Radius match is not a complete location assessment: ${unmet.join('; ')}.`,
          ],
          { complete: false }
        );
      }
      return radiusResult;
    }

    if (unmet.length) {
      return scored(
        Math.min(area.score, 60),
        'incomplete_preference',
        [
          ...(area.reasons || []),
          `Postcode or area match is not a complete location assessment: ${unmet.join('; ')}.`,
        ],
        { complete: false }
      );
    }

    return area;
  }

  if (extras.radius && radiusEvidence != null && extras.radiusMiles != null) {
    const within = radiusEvidence <= extras.radiusMiles;
    return scored(
      within ? 90 : 25,
      within ? 'within_radius' : 'outside_radius',
      [
        within
          ? `${radiusEvidence} miles is within the ${extras.radiusMiles}-mile search radius`
          : `${radiusEvidence} miles is outside the ${extras.radiusMiles}-mile search radius`,
      ],
      { complete: true }
    );
  }

  return unavailable(
    'incomplete_preference',
    `Location fit cannot be assessed: ${unmet.join('; ') || 'the stated location preference is not an area, postcode, or evidenced radius'}.`
  );
}

function scoreBedrooms(property, prefs) {
  const beds = Number(property.bedrooms || 0);
  const want = Number(prefs.bedrooms || 0);

  if (!want) {
    return unavailable(
      'no_bedroom_preference',
      'No bedroom requirement supplied — space fit cannot be assessed.'
    );
  }
  if (!beds) {
    return unavailable(
      'no_property_bedrooms',
      'Property has no bedroom count recorded — space fit cannot be assessed.'
    );
  }

  if (beds >= want) {
    const bonus = beds === want ? 100 : Math.max(75, 100 - (beds - want) * 8);
    return scored(bonus, 'meets_requirement', [`${beds} bedrooms (wanted ${want}+)`]);
  }
  return scored(Math.max(0, 40 - (want - beds) * 15), 'below_requirement', [
    `Only ${beds} bedrooms`,
  ]);
}

function scoreLifestyle(property, prefs) {
  const lifestyle = (prefs.lifestyle || '').toLowerCase();
  if (!lifestyle) {
    return unavailable(
      'no_lifestyle_preference',
      'No lifestyle preference supplied — lifestyle fit cannot be assessed.'
    );
  }

  const beds = Number(property.bedrooms || 0);
  const text = `${property.title || ''} ${property.description || ''} ${property.property_type || ''}`.toLowerCase();

  // Without descriptive text or attributes there is nothing to assess the preference against.
  const hasAttributes =
    beds > 0 ||
    property.has_garden !== undefined ||
    property.has_garage !== undefined ||
    property.parking_spaces !== undefined;
  if (!text.trim() && !hasAttributes) {
    return unavailable(
      'no_property_detail',
      'Property has no description or attributes to assess lifestyle preferences against.'
    );
  }

  let score = 55;
  const reasons = [];

  if (lifestyle.includes('family') && beds >= 3) {
    score += 25;
    reasons.push('Family-sized home');
  }
  if (lifestyle.includes('garden') && (property.has_garden || text.includes('garden'))) {
    score += 20;
    reasons.push('Garden mentioned');
  }
  if (lifestyle.includes('quiet') || lifestyle.includes('peaceful')) {
    score += 5;
    reasons.push('May suit quiet-area preference');
  }
  if (lifestyle.includes('investor') || lifestyle.includes('investment')) {
    if (property.category === 'rent' || property.monthly_rent) {
      score += 15;
      reasons.push('Rental / investment listing');
    }
  }

  const wantsParking =
    /\b(parking|garage|driveway)\b/i.test(lifestyle) || prefs.parking === true;
  if (wantsParking) {
    const hasParkingData =
      property.parking_spaces !== undefined || property.has_garage !== undefined;
    if (hasParkingData) {
      const hasParking = Number(property.parking_spaces) > 0 || Boolean(property.has_garage);
      if (hasParking) {
        score += 15;
        reasons.push('Parking available');
      } else {
        score = Math.max(0, score - 20);
        reasons.push('No parking recorded');
      }
    }
  }

  return scored(Math.min(100, score), 'assessed', reasons);
}

const PARKING_WORDS = /\b(parking|garage|driveway)\b/i;
const TRANSPORT_WORDS =
  /\b(train|rail|station|tube|underground|metro|tram|bus|cycle|cycling|walk|walking|commute|transport|transit|motorway)\b/i;

function resolveTransportPreference(prefs) {
  const raw = String(prefs.transport || '').trim();
  const maxCommute = Number(prefs.maxCommuteMinutes || prefs.commuteMinutes);
  const hasCommutePref =
    (Number.isFinite(maxCommute) && maxCommute > 0) ||
    Boolean(String(prefs.commute || '').trim());
  const maxStation = Number(prefs.maxStationMiles || prefs.maxStationKm);
  const hasStationPref = Number.isFinite(maxStation) && maxStation > 0;

  if (!raw && !hasCommutePref && !hasStationPref) {
    return { wanted: false };
  }

  const parkingMention = PARKING_WORDS.test(raw);
  const transportMention = TRANSPORT_WORDS.test(raw);
  const onlyParking =
    Boolean(raw) && parkingMention && !transportMention && !hasCommutePref && !hasStationPref;

  return {
    wanted: true,
    onlyParking,
    raw,
    maxCommuteMinutes: Number.isFinite(maxCommute) && maxCommute > 0 ? maxCommute : null,
    maxStationMiles: hasStationPref ? maxStation : null,
  };
}

function pickTransportEvidence(property, intelligence = {}) {
  const commuteMinutes = Number(
    property.commuteMinutes ||
      property.travelTimeMinutes ||
      intelligence.commute?.minutes ||
      intelligence.transport?.commuteMinutes
  );
  const stationMiles = Number(
    property.distanceToStationMiles ||
      property.nearestStationMiles ||
      intelligence.transport?.distanceToStationMiles ||
      intelligence.commute?.distanceToStationMiles
  );

  const hasCommute = Number.isFinite(commuteMinutes) && commuteMinutes >= 0;
  const hasStation = Number.isFinite(stationMiles) && stationMiles >= 0;

  return {
    available: hasCommute || hasStation,
    commuteMinutes: hasCommute ? commuteMinutes : null,
    stationMiles: hasStation ? stationMiles : null,
    stationName: property.nearestStation || intelligence.transport?.nearestStation || null,
  };
}

function scoreTransport(property, prefs, intelligence = {}) {
  const preference = resolveTransportPreference(prefs);
  if (!preference.wanted) {
    return unavailable(
      'no_transport_preference',
      'No transport or commute preference supplied — commute fit cannot be assessed.'
    );
  }

  if (preference.onlyParking) {
    return unavailable(
      'parking_is_not_transport',
      'Parking, garage and driveway are lifestyle amenities, not transport evidence. Commute fit cannot be assessed from parking.'
    );
  }

  const evidence = pickTransportEvidence(property, intelligence);
  if (!evidence.available) {
    return unavailable(
      'no_transport_data',
      'No transport or commute data is available for this property — listing mentions of stations, gardens or parking are not used as transport evidence.'
    );
  }

  const reasons = [];
  const parts = [];

  if (preference.maxCommuteMinutes != null && evidence.commuteMinutes != null) {
    const actual = evidence.commuteMinutes;
    const max = preference.maxCommuteMinutes;
    let commuteScore;
    if (actual <= max) commuteScore = 95;
    else if (actual <= max * 1.2) commuteScore = 70;
    else commuteScore = 25;
    parts.push(commuteScore);
    reasons.push(
      actual <= max
        ? `Commute ${actual} minutes is within the ${max}-minute preference`
        : `Commute ${actual} minutes exceeds the ${max}-minute preference`
    );
  }

  if (preference.maxStationMiles != null && evidence.stationMiles != null) {
    const actual = evidence.stationMiles;
    const max = preference.maxStationMiles;
    const stationScore = actual <= max ? 90 : actual <= max * 1.5 ? 60 : 25;
    parts.push(stationScore);
    reasons.push(
      actual <= max
        ? `${actual} miles to station is within the ${max}-mile preference`
        : `${actual} miles to station exceeds the ${max}-mile preference`
    );
  } else if (evidence.stationMiles != null && TRANSPORT_WORDS.test(preference.raw)) {
    const miles = evidence.stationMiles;
    parts.push(miles <= 0.5 ? 90 : miles <= 1 ? 75 : miles <= 2 ? 55 : 30);
    reasons.push(
      evidence.stationName
        ? `${miles} miles from ${evidence.stationName}`
        : `${miles} miles from the nearest station`
    );
  }

  if (!parts.length) {
    return unavailable(
      'no_transport_data',
      'Transport preference does not overlap with the commute or station evidence on this property.'
    );
  }

  const score = Math.round(parts.reduce((s, n) => s + n, 0) / parts.length);
  return scored(score, 'assessed', reasons);
}

/**
 * Schools are not assessable: the application has no schools, catchment or Ofsted
 * data source. Previously this returned 60–75 from keyword sniffing, which invented
 * a finding. It now reports unavailable until a schools provider is connected.
 */
function scoreSchools(property, prefs) {
  if (!(prefs.schools || '').trim()) {
    return unavailable(
      'no_school_preference',
      'No school requirement supplied — school fit cannot be assessed.'
    );
  }
  return unavailable(
    'no_school_data_source',
    'No schools or catchment data source is connected, so school fit cannot be assessed.'
  );
}

function scorePropertyMatch(property, prefs) {
  const dimensions = {
    budget: scoreBudget(property, prefs),
    location: scoreLocation(property, prefs),
    bedrooms: scoreBedrooms(property, prefs),
    lifestyle: scoreLifestyle(property, prefs),
    transport: scoreTransport(property, prefs),
    schools: scoreSchools(property, prefs),
  };

  const matchReasons = [];
  let weightedSum = 0;
  let retainedWeight = 0;

  Object.entries(dimensions).forEach(([key, dim]) => {
    const w = WEIGHTS[key] || 0.1;
    if (!dim.available) return;
    weightedSum += dim.score * w;
    retainedWeight += w;
    dim.reasons.forEach((r) => {
      if (matchReasons.length < 5 && !matchReasons.includes(r)) matchReasons.push(r);
    });
  });

  const totalWeight = Object.keys(dimensions).reduce((s, k) => s + (WEIGHTS[k] || 0.1), 0);
  const assessed = Object.entries(dimensions).filter(([, d]) => d.available);
  const notAssessed = Object.entries(dimensions).filter(([, d]) => !d.available);

  // Renormalise over evidenced dimensions only.
  const matchScore = retainedWeight > 0 ? Math.round(weightedSum / retainedWeight) : null;

  return {
    matchScore: matchScore === null ? null : Math.max(0, Math.min(100, matchScore)),
    available: matchScore !== null,
    matchReasons,
    coverage: {
      weightRetained: Math.round((retainedWeight / totalWeight) * 100) / 100,
      dimensionsAssessed: assessed.length,
      dimensionsTotal: assessed.length + notAssessed.length,
    },
    notAssessed: notAssessed.map(([key, dim]) => ({
      dimension: key,
      weight: WEIGHTS[key] || 0.1,
      state: dim.state,
      reason: dim.unavailableReason,
    })),
    dimensions,
    // Compatibility: legacy consumers read a flat map of scores. Unavailable
    // dimensions are null here rather than a neutral number.
    dimensionScores: Object.fromEntries(
      Object.entries(dimensions).map(([k, v]) => [k, v.score])
    ),
  };
}

function buildPropertySummary(property, prefs, matchScore) {
  const loc = prefs.location ? ` in ${prefs.location}` : '';
  if (matchScore === null) {
    return `Not enough evidence to score this property against your requirements${loc}.`;
  }
  if (matchScore >= 80) {
    return `Strong fit for your search${loc} — high alignment on budget, location and requirements.`;
  }
  if (matchScore >= 60) {
    return `Solid candidate${loc} with good overall alignment to your stated preferences.`;
  }
  return `Partial match${loc} — review details against your must-haves.`;
}

function rankBuyerMatches(prefs, properties = []) {
  const ranked = (properties || [])
    .map((p) => {
      const { matchScore, matchReasons, dimensionScores, coverage, notAssessed } =
        scorePropertyMatch(p, prefs);
      const address = p.address || [p.address_line1, p.city, p.zip_code || p.postcode].filter(Boolean).join(', ');
      return {
        id: p.id,
        slug: p.slug,
        title: p.title || p.property_title || `${p.bedrooms || ''} Bed Property`.trim(),
        address,
        price: p.price || p.monthly_rent || p.rent_pcm,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        propertyType: p.property_type || p.type,
        category: p.category,
        image: p.main_image || p.image_url || (Array.isArray(p.images) ? p.images[0] : null),
        matchScore,
        matchReasons,
        dimensionScores,
        coverage,
        notAssessed,
        summary: buildPropertySummary(p, prefs, matchScore),
      };
    })
    .filter((r) => r.matchScore !== null && r.matchScore >= 35)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  const assistantMessage = ranked.length
    ? `I ranked ${ranked.length} propert${ranked.length === 1 ? 'y' : 'ies'} using deterministic scoring (budget, location, bedrooms, lifestyle, transport and schools). Top match: ${ranked[0].matchScore}%${prefs.budgetMax || prefs.budget ? ` · Budget up to ${formatCurrency(Number(prefs.budgetMax || prefs.budget))}` : ''}${prefs.location ? ` · ${prefs.location}` : ''}.`
    : `No listings scored above the minimum threshold for your filters. Try widening budget or location.`;

  return {
    assistantMessage,
    preferencesSummary: {
      budget: prefs.budgetMax || prefs.budget || null,
      location: prefs.location || null,
      lifestyle: prefs.lifestyle || null,
      transport: prefs.transport || null,
      schools: prefs.schools || null,
      bedrooms: prefs.bedrooms || null,
    },
    recommendations: ranked,
    methodology:
      'Weighted deterministic scoring — budget 30%, location 25%, bedrooms 15%, lifestyle 15%, transport 8%, schools 7%. Dimensions without evidence are excluded and the remaining weights renormalised, never given a neutral default. LLM may polish narrative only.',
    provenance: createProvenance({
      source: 'ApplicationDatabase',
      method: 'buyer_match_weighted_rank',
      confidence: ranked.length >= 3 ? 'high' : ranked.length ? 'medium' : 'low',
    }),
    engine: 'buyer-match-v2',
  };
}

module.exports = {
  rankBuyerMatches,
  scorePropertyMatch,
  scoreBudget,
  scoreLocation,
  scoreBedrooms,
  scoreLifestyle,
  scoreTransport,
  WEIGHTS,
};

