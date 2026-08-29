/**
 * Comparable property similarity engine — transparent weighted scoring.
 */

const SIMILARITY_WEIGHTS = {
  location: 0.3,
  propertyType: 0.15,
  size: 0.15,
  bedrooms: 0.1,
  bathrooms: 0.1,
  features: 0.1,
  recency: 0.1,
};

const DISTANCE_DECAY_KM = 8;

/**
 * A comparable matched on less than this share of the weight vector is too thinly
 * evidenced to enter a comparable set — its similarity rests on too few attributes
 * to mean anything, however high it happens to be.
 */
const MIN_COMPARISON_COVERAGE = 0.4;

function normStr(v) {
  return (v || '').toString().toLowerCase().trim();
}

function normalisePostcode(pc) {
  return normStr(pc).replace(/\s+/g, '');
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function locationScore(target, comp) {
  const tCity = normStr(target.city);
  const cCity = normStr(comp.city);
  const tZip = normalisePostcode(target.zip_code || target.postcode);
  const cZip = normalisePostcode(comp.zip_code || comp.postcode);

  const hasTargetGeo = Boolean(tCity || tZip || (target.latitude && target.longitude));
  const hasCompGeo = Boolean(cCity || cZip || (comp.latitude && comp.longitude));
  if (!hasTargetGeo || !hasCompGeo) {
    return { score: null, tier: 'Location not comparable' };
  }

  if (tZip && cZip && tZip === cZip) return { score: 1, tier: 'Same postcode' };

  const distanceKm = haversineKm(
    Number(target.latitude),
    Number(target.longitude),
    Number(comp.latitude),
    Number(comp.longitude)
  );
  if (distanceKm !== null) {
    const distScore = Math.exp(-distanceKm / DISTANCE_DECAY_KM);
    if (distanceKm <= 1) return { score: Math.max(0.92, distScore), tier: 'Within 1km' };
    if (distanceKm <= 5) return { score: distScore, tier: 'Nearby area' };
    if (distanceKm <= 15 && tCity === cCity) return { score: distScore * 0.85, tier: 'Same city' };
    if (tCity === cCity) return { score: distScore * 0.6, tier: 'Same city (distant)' };
    return { score: distScore * 0.25, tier: 'Different area' };
  }

  if (tZip && cZip) {
    const tOut = tZip.slice(0, -3);
    const cOut = cZip.slice(0, -3);
    if (tOut && tOut === cOut) return { score: 0.9, tier: 'Same postcode district' };
    if (tZip.slice(0, 3) === cZip.slice(0, 3)) return { score: 0.82, tier: 'Nearby postcode' };
  }

  if (tCity && cCity && tCity === cCity) return { score: 0.65, tier: 'Same city' };
  if (tCity && cCity && (tCity.includes(cCity) || cCity.includes(tCity))) {
    return { score: 0.5, tier: 'Similar city name' };
  }
  return { score: 0.2, tier: 'Different location' };
}

/**
 * Sub-scores return null when the attribute is missing on either side.
 * A missing attribute is not "moderately similar" — it is unmeasured, and it
 * reduces comparison coverage instead of contributing a fabricated 0.5.
 */
function sizeScore(targetSqft, compSqft) {
  if (!targetSqft || !compSqft) return null;
  return Math.min(targetSqft, compSqft) / Math.max(targetSqft, compSqft);
}

function bedroomScore(target, comp) {
  if (!target || !comp) return null;
  const diff = Math.abs(Number(target) - Number(comp));
  if (diff === 0) return 1;
  if (diff === 1) return 0.75;
  return 0.4;
}

function typeScore(target, comp) {
  const t = normStr(target);
  const c = normStr(comp);
  if (!t || !c) return null;
  if (t === c) return 1;
  if (t.includes(c) || c.includes(t)) return 0.7;
  return 0.3;
}

function featureScore(target, comp) {
  let checks = 0;
  let matches = 0;
  const pairs = [
    ['furnished', 'furnished'],
    ['has_garden', 'has_garden'],
    ['has_garage', 'has_garage'],
    ['parking_spaces', 'parking_spaces'],
  ];
  pairs.forEach(([a, b]) => {
    if (target[a] !== undefined && target[a] !== null && comp[b] !== undefined && comp[b] !== null) {
      checks += 1;
      if (Boolean(target[a]) === Boolean(comp[b]) || Number(target[a]) === Number(comp[b])) {
        matches += 1;
      }
    }
  });
  return checks > 0 ? matches / checks : null;
}

function transactionSoldDate(comp = {}) {
  return comp.sold_date || comp.last_sold_date || comp.transfer_date || null;
}

function recencyScore(comp) {
  const raw = transactionSoldDate(comp);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 30) return 1;
  if (days <= 90) return 0.85;
  if (days <= 180) return 0.7;
  if (days <= 365) return 0.55;
  return 0.4;
}

function buildSelectionReasons(breakdown, locationMeta) {
  const reasons = [];
  if (locationMeta?.tier) reasons.push(locationMeta.tier);
  if (breakdown.propertyType >= 0.9) reasons.push('Matching property type');
  if (breakdown.bedrooms >= 0.9) reasons.push('Same bedroom count');
  if (breakdown.size >= 0.85) reasons.push('Similar floor area');
  if (breakdown.features >= 0.8) reasons.push('Similar features');
  if (breakdown.recency >= 0.85) reasons.push('Recent sold transaction');
  return reasons.length ? reasons : ['Best available match in database'];
}

/**
 * Similarity is renormalised over the attributes both properties actually have.
 * `coverage` reports how much of the weight vector could be assessed, so a
 * comparable matched on two fields is distinguishable from one matched on seven.
 */
function calculateSimilarity(target, comp, weights = SIMILARITY_WEIGHTS) {
  const locationMeta = locationScore(target, comp);
  const scores = {
    location: locationMeta.score,
    size: sizeScore(Number(target.square_feet), Number(comp.square_feet)),
    propertyType: typeScore(target.property_type, comp.property_type),
    bedrooms: bedroomScore(target.bedrooms, comp.bedrooms),
    bathrooms: bedroomScore(target.bathrooms, comp.bathrooms),
    features: featureScore(target, comp),
    recency: recencyScore(comp),
  };

  let weightedSum = 0;
  let retainedWeight = 0;
  let totalWeight = 0;
  const notComparable = [];

  Object.entries(weights).forEach(([key, weight]) => {
    totalWeight += weight;
    if (Number.isFinite(scores[key])) {
      weightedSum += scores[key] * weight;
      retainedWeight += weight;
    } else {
      notComparable.push(key);
    }
  });

  const similarity = retainedWeight > 0 ? Math.round((weightedSum / retainedWeight) * 100) : null;
  const coverage = totalWeight > 0 ? Math.round((retainedWeight / totalWeight) * 100) / 100 : 0;

  return {
    similarity,
    comparable: similarity !== null && coverage >= MIN_COMPARISON_COVERAGE,
    breakdown: scores,
    weights,
    coverage,
    notComparable,
    // Weight used when this comparable contributes to a median. Scaling similarity
    // by coverage stops a record matched on one attribute counting as heavily as
    // one matched on seven.
    evidenceWeight: similarity === null ? 0 : Math.round(similarity * coverage),
    locationTier: locationMeta.tier,
    selectionReasons: buildSelectionReasons(scores, locationMeta),
  };
}

function rankComparables(target, comparables, minSimilarity = 40) {
  return comparables
    .filter((c) => c.id !== target.id)
    .map((comp) => {
      const {
        similarity,
        breakdown,
        weights,
        locationTier,
        selectionReasons,
        coverage,
        notComparable,
        comparable,
        evidenceWeight,
      } = calculateSimilarity(target, comp);
      const rent = Number(comp.monthly_rent || comp.weekly_rent * 4.33 || 0);
      return {
        id: comp.id,
        title: comp.title,
        city: comp.city,
        zip_code: comp.zip_code,
        bedrooms: comp.bedrooms,
        bathrooms: comp.bathrooms,
        square_feet: comp.square_feet,
        property_type: comp.property_type,
        monthly_rent: rent,
        sold_date: transactionSoldDate(comp),
        similarity,
        breakdown,
        weights,
        similarityCoverage: coverage,
        evidenceWeight,
        comparable,
        notComparable,
        locationTier,
        selectionReasons,
        reasons: selectionReasons,
      };
    })
    .filter((c) => c.comparable && c.similarity >= minSimilarity && c.monthly_rent > 0)
    .sort((a, b) => b.similarity - a.similarity);
}

/** Similarity scaled by comparison coverage, so thinly-matched records count less. */
function evidenceWeightOf(comp) {
  if (Number.isFinite(comp.evidenceWeight)) return comp.evidenceWeight;
  const coverage = Number.isFinite(comp.similarityCoverage) ? comp.similarityCoverage : 1;
  return (Number(comp.similarity) || 0) * coverage;
}

function weightedMedianRent(rankedComps) {
  if (!rankedComps.length) return null;
  const sorted = [...rankedComps].sort((a, b) => a.monthly_rent - b.monthly_rent);
  const weights = sorted.map(evidenceWeightOf);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += weights[i];
    if (cumulative >= totalWeight / 2) return sorted[i].monthly_rent;
  }
  return sorted[Math.floor(sorted.length / 2)].monthly_rent;
}

function trimmedMeanRent(rankedComps, trimPct = 0.1) {
  if (!rankedComps.length) return null;
  const rents = rankedComps.map((c) => c.monthly_rent).sort((a, b) => a - b);
  const trim = Math.floor(rents.length * trimPct);
  const trimmed = rents.slice(trim, rents.length - trim || undefined);
  if (!trimmed.length) return rents[Math.floor(rents.length / 2)];
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

function rankSaleComparables(target, comparables, minSimilarity = 35) {
  return comparables
    .filter((c) => c.id !== target.id)
    .map((comp) => {
      const {
        similarity,
        breakdown,
        weights,
        locationTier,
        selectionReasons,
        coverage,
        notComparable,
        comparable,
        evidenceWeight,
      } = calculateSimilarity(target, comp);
      const price = Number(comp.price || comp.sold_price || 0);
      const sqft = Number(comp.square_feet) || null;
      return {
        id: comp.id,
        title: comp.title,
        city: comp.city,
        zip_code: comp.zip_code,
        bedrooms: comp.bedrooms,
        bathrooms: comp.bathrooms,
        square_feet: comp.square_feet,
        property_type: comp.property_type,
        price,
        price_per_sqft: sqft && price ? Math.round(price / sqft) : null,
        sold_date: transactionSoldDate(comp),
        similarity,
        breakdown,
        weights,
        similarityCoverage: coverage,
        evidenceWeight,
        comparable,
        notComparable,
        locationTier,
        selectionReasons,
        reasons: selectionReasons,
        source: comp.source || 'application_database',
      };
    })
    .filter((c) => c.comparable && c.similarity >= minSimilarity && c.price > 0)
    .sort((a, b) => b.similarity - a.similarity);
}

function weightedMedianValue(rankedComps, valueKey = 'price') {
  if (!rankedComps.length) return null;
  const sorted = [...rankedComps].sort((a, b) => a[valueKey] - b[valueKey]);
  const weights = sorted.map(evidenceWeightOf);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += weights[i];
    if (cumulative >= totalWeight / 2) return sorted[i][valueKey];
  }
  return sorted[Math.floor(sorted.length / 2)][valueKey];
}

function trimmedMeanValue(rankedComps, valueKey = 'price', trimPct = 0.1) {
  if (!rankedComps.length) return null;
  const values = rankedComps.map((c) => c[valueKey]).sort((a, b) => a - b);
  const trim = Math.floor(values.length * trimPct);
  const trimmed = values.slice(trim, values.length - trim || undefined);
  if (!trimmed.length) return values[Math.floor(values.length / 2)];
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

module.exports = {
  SIMILARITY_WEIGHTS,
  MIN_COMPARISON_COVERAGE,
  transactionSoldDate,
  calculateSimilarity,
  rankComparables,
  rankSaleComparables,
  weightedMedianRent,
  trimmedMeanRent,
  weightedMedianValue,
  trimmedMeanValue,
};
