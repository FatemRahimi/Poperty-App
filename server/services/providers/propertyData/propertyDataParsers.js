/**
 * Parse PropertyData API responses into normalized intelligence shapes.
 * Only keys already referenced by adapters, tests, or persisted-attribute mappers.
 * Missing values stay null — never invent bounds, types, years, or dates.
 */

function unwrapPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  let node = payload.profile && typeof payload.profile === 'object' ? payload.profile : payload;
  if (node.data && typeof node.data === 'object' && !Array.isArray(node.data)) {
    node = node.data;
  }
  if (node.result && typeof node.result === 'object' && !Array.isArray(node.result)) {
    node = node.result;
  }
  return node;
}

function pickText(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const text = String(candidate).trim();
    if (text) return text;
  }
  return null;
}

function pickPositiveNumber(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function pickNonNegativeInteger(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 0 && Math.floor(n) === n) return n;
  }
  return null;
}

function pickDate(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const text = String(candidate).trim();
    if (!text) continue;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return text;
  }
  return null;
}

function parseValuationSaleResponse(payload) {
  if (!payload) return null;
  const result = unwrapPayload(payload);
  const estimate = pickPositiveNumber(result.estimate, result.value, result.price);
  if (!estimate) return null;

  const rawMargin = result.margin ?? result.error_margin;
  const margin = pickPositiveNumber(rawMargin);
  const rawConfidence = pickText(result.confidence);

  return {
    centralEstimate: estimate,
    lowerEstimate: margin != null ? estimate - margin : null,
    upperEstimate: margin != null ? estimate + margin : null,
    margin: margin,
    confidence: rawConfidence ? rawConfidence.toLowerCase() : null,
    source: 'PropertyData',
    method: 'valuation_sale_avm',
  };
}

function parseSoldPricesStats(payload) {
  if (!payload) return null;
  const data = unwrapPayload(payload);
  const average = pickPositiveNumber(
    data.average,
    data.mean,
    data.interquartile_mean,
    data.avg_price
  );
  if (!average) return null;

  const low = pickPositiveNumber(data['80pc_low'], data.range_low, data.low, data.percentile_10);
  const high = pickPositiveNumber(data['80pc_high'], data.range_high, data.high, data.percentile_90);
  const points = pickNonNegativeInteger(data.points, data.count, data.sample_size);

  return {
    average,
    range: {
      low: low,
      high: high,
    },
    sampleSize: points,
    source: 'PropertyData',
    method: 'sold_prices_statistics',
    underlyingSource: 'HM Land Registry',
  };
}

function parseSoldPricesPerSqf(payload) {
  if (!payload) return null;
  const data = unwrapPayload(payload);
  const average = pickPositiveNumber(data.average, data.mean, data.interquartile_mean);
  if (!average) return null;

  return {
    averagePerSqft: average,
    range: {
      low: pickPositiveNumber(data['80pc_low'], data.range_low, data.low),
      high: pickPositiveNumber(data['80pc_high'], data.range_high, data.high),
    },
    source: 'PropertyData',
    method: 'sold_prices_per_sqf',
    underlyingSource: 'HM Land Registry + MHCLG EPC',
  };
}

function emptyUprnProfile() {
  return {
    uprn: null,
    address: null,
    postcode: null,
    latitude: null,
    longitude: null,
    bedrooms: null,
    bathrooms: null,
    internalArea: null,
    propertyType: null,
    epcRating: null,
    epcScore: null,
    epcCertificateNumber: null,
    occupancyTenure: null,
    legalTenure: null,
    tenure: null,
    councilTaxBand: null,
    councilTaxRate: null,
    registeredLeases: [],
    leaseYearsRemaining: null,
    constructionAgeBand: null,
    yearBuilt: null,
    lastSoldPrice: null,
    lastSoldDate: null,
    currentSaleEstimate: null,
    transactions: [],
  };
}

function yearsRemainingFromEndDate(endDate, asOf = null) {
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  const origin = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(origin.getTime())) return null;
  return Math.round(((end.getTime() - origin.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
}

function parseRegisteredLease(row) {
  if (!row || typeof row !== 'object') return null;
  const termYears = pickPositiveNumber(row.term_years, row.termYears);
  const start = pickDate(row.term_start_date, row.termStartDate, row.start_date);
  const end = pickDate(row.term_end_date, row.termEndDate, row.end_date);
  let yearsRemaining = null;
  if (row.years_remaining !== undefined && row.years_remaining !== null && row.years_remaining !== '') {
    const n = Number(row.years_remaining);
    if (Number.isFinite(n)) yearsRemaining = n;
  } else if (end) {
    yearsRemaining = yearsRemainingFromEndDate(end);
  } else if (start && termYears != null) {
    const startDate = new Date(start);
    if (!Number.isNaN(startDate.getTime())) {
      startDate.setFullYear(startDate.getFullYear() + Number(termYears));
      yearsRemaining = yearsRemainingFromEndDate(startDate.toISOString());
    }
  }
  return {
    leaseId: pickText(row.lease_id, row.leaseId, row.id),
    termYears: termYears != null ? Math.round(termYears) : null,
    termStartDate: start,
    termEndDate: end,
    yearsRemaining,
  };
}

function parseRegisteredLeases(data) {
  const raw = data?.registeredLeases || data?.registered_leases;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map(parseRegisteredLease).filter(Boolean);
}

function legalTenureFromLeases(leases) {
  const evidenced = (leases || []).filter(
    (lease) =>
      lease &&
      (lease.termEndDate ||
        lease.termStartDate ||
        lease.termYears != null ||
        lease.yearsRemaining != null ||
        lease.leaseId)
  );
  if (!evidenced.length) return null;
  return 'Leasehold';
}

function canonicalLeaseYearsRemaining(leases) {
  const values = (leases || [])
    .map((lease) => lease?.yearsRemaining)
    .filter((n) => n != null && Number.isFinite(Number(n)))
    .map(Number);
  if (!values.length) return null;
  return Math.min(...values);
}

function parseUprnProfile(payload) {
  const data = unwrapPayload(payload);
  if (!data || typeof data !== 'object') {
    return emptyUprnProfile();
  }

  const yearBuilt = pickPositiveNumber(data.year_built);
  const registeredLeases = parseRegisteredLeases(data);
  const occupancyTenure = pickText(data.tenure);
  const legalTenure = legalTenureFromLeases(registeredLeases);

  return {
    uprn: pickText(data.uprn),
    address: pickText(data.address, data.full_address),
    postcode: pickText(data.postcode, data.addressParts?.postcode),
    latitude: pickFiniteCoordinate(data.latitude, data.lat),
    longitude: pickFiniteCoordinate(data.longitude, data.lng),
    bedrooms: pickNonNegativeInteger(data.bedrooms, data.number_of_bedrooms),
    bathrooms: pickNonNegativeInteger(data.bathrooms, data.number_of_bathrooms),
    internalArea: pickPositiveNumber(
      data.internalArea,
      data.internal_area,
      data.floor_area,
      data.total_floor_area
    ),
    propertyType: pickText(data.propertyType, data.property_type, data.type),
    epcRating: pickText(data.energyScore, data.current_energy_rating, data.epc_rating),
    epcScore: pickPositiveNumber(data.energyScoreNumerical, data.current_energy_efficiency),
    epcCertificateNumber: pickText(data.certNum, data.certificate_number),
    occupancyTenure,
    legalTenure,
    tenure: legalTenure,
    councilTaxBand: pickText(data.taxBand, data.tax_band, data.council_tax_band),
    councilTaxRate: pickPositiveNumber(data.taxRate, data.tax_rate),
    registeredLeases,
    leaseYearsRemaining: canonicalLeaseYearsRemaining(registeredLeases),
    constructionAgeBand: pickText(data.constructionAgeBand, data.construction_age_band),
    yearBuilt: yearBuilt != null ? Math.round(yearBuilt) : null,
    lastSoldPrice: pickPositiveNumber(data.lastSoldAmount, data.last_sold_amount, data.last_sold_price),
    lastSoldDate: pickDate(data.lastSoldDate, data.last_sold_date),
    currentSaleEstimate: pickPositiveNumber(
      data.current_sale_estimate,
      data.sale_estimate,
      data.estimate,
      data.valuation
    ),
    transactions: parseSoldTransactionsFromPayload(data),
  };
}

function pickFiniteCoordinate(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseUprnSaleEstimate(payload) {
  const profile = parseUprnProfile(payload);
  if (!profile.currentSaleEstimate) return null;

  return {
    centralEstimate: profile.currentSaleEstimate,
    lowerEstimate: null,
    upperEstimate: null,
    lastSoldPrice: profile.lastSoldPrice,
    lastSoldDate: profile.lastSoldDate,
    internalArea: profile.internalArea,
    source: 'PropertyData',
    method: 'uprn_profile',
    underlyingSource: 'HM Land Registry / EPC where available',
  };
}

/** Live /rents unit. Monthly conversion uses 52/12 and is not a provider monthly figure. */
const RENTS_WEEKLY_TO_MONTHLY = 52 / 12;
const RENTS_UNIT_GBP_PER_WEEK = 'gbp_per_week';

function parseRangePair(range) {
  if (!Array.isArray(range) || range.length < 2) return { low: null, high: null };
  const low = pickPositiveNumber(range[0]);
  const high = pickPositiveNumber(range[1]);
  if (low == null || high == null) return { low: null, high: null };
  return { low, high };
}

function weeklyToMonthly(weekly, unit) {
  if (weekly == null) return null;
  if (unit !== RENTS_UNIT_GBP_PER_WEEK) return null;
  return Math.round(Number(weekly) * RENTS_WEEKLY_TO_MONTHLY);
}

/**
 * Parse a live PropertyData /rents payload.
 * Verified keys only: status, postcode, postcode_type, bedrooms, type,
 * data.long_let.{points_analysed,radius,unit,average,70/80/90/100pc_range,raw_data}.
 * Asking long-let area stats — not achieved rent, not property-specific AVM.
 */
function parseRentsResponse(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const dataNode = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : payload;
  const longLet = dataNode.long_let && typeof dataNode.long_let === 'object' ? dataNode.long_let : null;
  if (!longLet) return null;

  const unit = pickText(longLet.unit);
  const averageWeekly = pickPositiveNumber(longLet.average);
  if (!averageWeekly) return null;

  const range80 = parseRangePair(longLet['80pc_range']);
  const bedrooms =
    payload.bedrooms === undefined || payload.bedrooms === null || payload.bedrooms === ''
      ? null
      : pickNonNegativeInteger(payload.bedrooms);
  const propertyType = pickText(payload.type);

  return {
    postcode: pickText(payload.postcode),
    postcodeType: pickText(payload.postcode_type),
    bedrooms,
    propertyType,
    pointsAnalysed: pickNonNegativeInteger(longLet.points_analysed),
    radius: pickText(longLet.radius) || (pickPositiveNumber(longLet.radius) != null ? String(longLet.radius) : null),
    unit,
    averageWeekly,
    averageMonthly: weeklyToMonthly(averageWeekly, unit),
    range80Weekly: range80,
    range80Monthly: {
      low: weeklyToMonthly(range80.low, unit),
      high: weeklyToMonthly(range80.high, unit),
    },
    listings: parseRentsListings(longLet.raw_data, unit),
  };
}

function parseRentsListings(raw, unit) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null;
      const weekly = pickPositiveNumber(row.price);
      if (!weekly) return null;
      const bedrooms =
        row.bedrooms === undefined || row.bedrooms === null || row.bedrooms === ''
          ? null
          : pickNonNegativeInteger(row.bedrooms);
      return {
        id: row.id || `pd-rent-${index}`,
        address: pickText(row.address),
        weeklyAskingRent: weekly,
        monthlyAskingRent: weeklyToMonthly(weekly, unit),
        latitude: pickFiniteCoordinate(row.lat, row.latitude),
        longitude: pickFiniteCoordinate(row.lng, row.longitude),
        bedrooms,
        property_type: pickText(row.type, row.property_type),
        distance: pickPositiveNumber(row.distance),
        days_on_market: pickNonNegativeInteger(row.days_on_market),
        sstc: row.sstc === undefined || row.sstc === null || row.sstc === '' ? null : Number(row.sstc),
        portal: pickText(row.portal),
        url: pickText(row.url),
        source: 'PropertyData',
        rentType: 'asking_long_let',
      };
    })
    .filter(Boolean);
}

function buildRentalEvidence(parsed, { retrievedAt = null, filters = {} } = {}) {
  if (!parsed) {
    return {
      available: false,
      source: 'PropertyData',
      provider: 'propertydata',
      endpoint: '/rents',
      providerEndpoint: '/rents',
      scope: null,
      rentType: null,
      central: null,
      lower: null,
      upper: null,
      centralMonthly: null,
      lowerMonthly: null,
      upperMonthly: null,
      sampleSize: null,
      bedrooms: null,
      propertyType: null,
      observationPeriod: null,
      observedAt: null,
      retrievedAt: retrievedAt || null,
      confidence: null,
      state: 'notAssessed',
      unit: null,
      radius: null,
      propertyLevel: false,
      achieved: false,
      listings: [],
    };
  }

  const matched = parsed.bedrooms != null || parsed.propertyType != null;
  const provenance = {
    source: 'PropertyData',
    method: 'rents_asking_long_let',
    providerEndpoint: '/rents',
    retrievedAt: retrievedAt || null,
    observedAt: null,
    notes:
      'Area long-let asking rents from live portal listings. Not achieved lettings. Not a property-specific rental valuation. Weekly figures converted to monthly with 52/12 when unit is gbp_per_week.',
  };

  return {
    available: true,
    source: 'PropertyData',
    provider: 'propertydata',
    endpoint: '/rents',
    providerEndpoint: '/rents',
    scope: matched ? 'matched_area_segment' : 'area_radius',
    rentType: 'asking_long_let',
    central: parsed.averageWeekly,
    lower: parsed.range80Weekly.low,
    upper: parsed.range80Weekly.high,
    centralMonthly: parsed.averageMonthly,
    lowerMonthly: parsed.range80Monthly.low,
    upperMonthly: parsed.range80Monthly.high,
    sampleSize: parsed.pointsAnalysed,
    bedrooms: parsed.bedrooms,
    propertyType: parsed.propertyType,
    observationPeriod: null,
    observedAt: null,
    retrievedAt: retrievedAt || null,
    confidence: null,
    state: 'observed',
    unit: parsed.unit,
    radius: parsed.radius,
    postcode: parsed.postcode,
    postcodeType: parsed.postcodeType,
    propertyLevel: false,
    achieved: false,
    listings: parsed.listings,
    provenance,
    filtersApplied: {
      bedrooms: filters.bedrooms ?? parsed.bedrooms,
      type: filters.type ?? parsed.propertyType,
    },
  };
}

function parsePercentString(value) {
  if (value === undefined || value === null || value === '') {
    return { raw: null, percent: null };
  }
  const raw = String(value).trim();
  if (!raw) return { raw: null, percent: null };
  const n = Number(raw.replace(/%/g, '').trim());
  return { raw, percent: Number.isFinite(n) ? n : null };
}

/**
 * Parse a live PropertyData /demand payload.
 * Verified top-level keys only (flat body, no nested data):
 * status, postcode, postcode_type, radius, total_for_sale,
 * average_sales_per_month, turnover_per_month, months_of_inventory,
 * days_on_market, demand_rating, process_time.
 * Area sales-market snapshot — not property-specific demand, not rental demand.
 */
function parseDemandResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const band = pickText(payload.demand_rating);
  const postcode = pickText(payload.postcode);
  const postcodeType = pickText(payload.postcode_type);
  const radius = pickPositiveNumber(payload.radius);
  const totalForSale = pickNonNegativeInteger(payload.total_for_sale);
  const averageSalesPerMonth = pickPositiveNumber(payload.average_sales_per_month);
  const turnover = parsePercentString(payload.turnover_per_month);
  const monthsOfInventory = pickPositiveNumber(payload.months_of_inventory);
  const daysOnMarket = pickNonNegativeInteger(payload.days_on_market);

  if (
    !band &&
    postcode == null &&
    radius == null &&
    totalForSale == null &&
    averageSalesPerMonth == null &&
    turnover.raw == null &&
    monthsOfInventory == null &&
    daysOnMarket == null
  ) {
    return null;
  }

  return {
    postcode,
    postcodeType,
    radius,
    totalForSale,
    averageSalesPerMonth,
    turnoverPerMonth: turnover.raw,
    turnoverPerMonthPercent: turnover.percent,
    monthsOfInventory,
    daysOnMarket,
    demandRating: band,
  };
}

function emptyMarketDemandEvidence(retrievedAt = null) {
  return {
    available: false,
    provider: 'propertydata',
    source: 'PropertyData',
    providerEndpoint: '/demand',
    endpoint: '/demand',
    scope: null,
    demandType: null,
    propertyLevel: false,
    rentalDemand: false,
    value: null,
    band: null,
    sampleSize: null,
    observationPeriod: null,
    observedAt: null,
    retrievedAt: retrievedAt || null,
    confidence: null,
    state: 'notAssessed',
    methodology: null,
    provenance: null,
    postcode: null,
    postcodeType: null,
    radius: null,
    radiusUnit: null,
    totalForSale: null,
    averageSalesPerMonth: null,
    turnoverPerMonth: null,
    turnoverPerMonthPercent: null,
    monthsOfInventory: null,
    daysOnMarket: null,
  };
}

function buildMarketDemandEvidence(parsed, { retrievedAt = null } = {}) {
  if (!parsed || !parsed.demandRating) {
    return emptyMarketDemandEvidence(retrievedAt);
  }

  const provenance = {
    source: 'PropertyData',
    method: 'demand_area_buyer_market',
    providerEndpoint: '/demand',
    retrievedAt: retrievedAt || null,
    observedAt: null,
    notes:
      'Area sales-market snapshot from PropertyData /demand. demand_rating is the provider market-balance label for the surrounding area. Not property-specific demand, not rental demand, and not a numeric demand score. Stock, turnover, inventory and days-on-market are supporting liquidity/supply figures, not a demand index.',
  };

  return {
    available: true,
    provider: 'propertydata',
    source: 'PropertyData',
    providerEndpoint: '/demand',
    endpoint: '/demand',
    scope: 'area',
    demandType: 'buyer_market',
    propertyLevel: false,
    rentalDemand: false,
    value: null,
    band: parsed.demandRating,
    sampleSize: null,
    observationPeriod: null,
    observedAt: null,
    retrievedAt: retrievedAt || null,
    confidence: null,
    state: 'observed',
    methodology:
      'PropertyData /demand area sales-market snapshot. demand_rating is used as the provider label only. No numeric demand score is derived. Liquidity and listing-stock fields are reported separately from demand.',
    provenance,
    postcode: parsed.postcode,
    postcodeType: parsed.postcodeType,
    radius: parsed.radius,
    radiusUnit: null,
    totalForSale: parsed.totalForSale,
    averageSalesPerMonth: parsed.averageSalesPerMonth,
    turnoverPerMonth: parsed.turnoverPerMonth,
    turnoverPerMonthPercent: parsed.turnoverPerMonthPercent,
    monthsOfInventory: parsed.monthsOfInventory,
    daysOnMarket: parsed.daysOnMarket,
  };
}

function demandEvidenceFromEnrichment(externalEnrichment) {
  const block = externalEnrichment?.enrichments?.demand;
  if (!block || block.success === false) return emptyMarketDemandEvidence();
  const payload = block.data || block.payload || null;
  return buildMarketDemandEvidence(parseDemandResponse(payload), {
    retrievedAt: block.provenance?.retrievedAt || null,
  });
}

/**
 * Parse a live PropertyData /demand-rent payload.
 * Verified top-level keys only (flat body, no nested data):
 * status, postcode, postcode_type, radius, total_for_rent,
 * transactions_per_month, turnover_per_month, months_of_inventory,
 * days_on_market, rental_demand_rating, process_time.
 * Area rental-market snapshot — not property-specific tenant demand,
 * not sales /demand, not rent valuation.
 */
function parseDemandRentResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const band = pickText(payload.rental_demand_rating);
  const postcode = pickText(payload.postcode);
  const postcodeType = pickText(payload.postcode_type);
  const radius = pickPositiveNumber(payload.radius);
  const totalForRent = pickNonNegativeInteger(payload.total_for_rent);
  const transactionsPerMonth = pickPositiveNumber(payload.transactions_per_month);
  const turnover = parsePercentString(payload.turnover_per_month);
  const monthsOfInventory = pickPositiveNumber(payload.months_of_inventory);
  const daysOnMarket = pickNonNegativeInteger(payload.days_on_market);

  if (
    !band &&
    postcode == null &&
    radius == null &&
    totalForRent == null &&
    transactionsPerMonth == null &&
    turnover.raw == null &&
    monthsOfInventory == null &&
    daysOnMarket == null
  ) {
    return null;
  }

  return {
    postcode,
    postcodeType,
    radius,
    totalForRent,
    transactionsPerMonth,
    turnoverPerMonth: turnover.raw,
    turnoverPerMonthPercent: turnover.percent,
    monthsOfInventory,
    daysOnMarket,
    rentalDemandRating: band,
  };
}

function emptyRentalDemandEvidence(retrievedAt = null) {
  return {
    available: false,
    provider: 'propertydata',
    source: 'PropertyData',
    providerEndpoint: '/demand-rent',
    endpoint: '/demand-rent',
    scope: null,
    demandType: null,
    propertyLevel: false,
    rentalDemand: false,
    value: null,
    band: null,
    sampleSize: null,
    observationPeriod: null,
    observedAt: null,
    retrievedAt: retrievedAt || null,
    confidence: null,
    state: 'notAssessed',
    methodology: null,
    provenance: null,
    postcode: null,
    postcodeType: null,
    radius: null,
    radiusUnit: null,
    totalForRent: null,
    transactionsPerMonth: null,
    turnoverPerMonth: null,
    turnoverPerMonthPercent: null,
    monthsOfInventory: null,
    daysOnMarket: null,
  };
}

function buildRentalDemandEvidence(parsed, { retrievedAt = null } = {}) {
  if (!parsed || !parsed.rentalDemandRating) {
    return emptyRentalDemandEvidence(retrievedAt);
  }

  const provenance = {
    source: 'PropertyData',
    method: 'demand_area_rental_market',
    providerEndpoint: '/demand-rent',
    retrievedAt: retrievedAt || null,
    observedAt: null,
    notes:
      'Area rental-market snapshot from PropertyData /demand-rent. rental_demand_rating is the provider market-balance label for the surrounding area. Not property-specific tenant demand, not sales /demand, not rent valuation, and not a numeric demand score. Stock, turnover, inventory and days-on-market are supporting liquidity/supply figures, not a demand index or time-to-let.',
  };

  return {
    available: true,
    provider: 'propertydata',
    source: 'PropertyData',
    providerEndpoint: '/demand-rent',
    endpoint: '/demand-rent',
    scope: 'area',
    demandType: 'rental_market',
    propertyLevel: false,
    rentalDemand: true,
    value: null,
    band: parsed.rentalDemandRating,
    sampleSize: null,
    observationPeriod: null,
    observedAt: null,
    retrievedAt: retrievedAt || null,
    confidence: null,
    state: 'observed',
    methodology:
      'PropertyData /demand-rent area rental-market snapshot. rental_demand_rating is used as the provider label only. No numeric demand score is derived. Liquidity and listing-stock fields are reported separately from demand.',
    provenance,
    postcode: parsed.postcode,
    postcodeType: parsed.postcodeType,
    radius: parsed.radius,
    radiusUnit: null,
    totalForRent: parsed.totalForRent,
    transactionsPerMonth: parsed.transactionsPerMonth,
    turnoverPerMonth: parsed.turnoverPerMonth,
    turnoverPerMonthPercent: parsed.turnoverPerMonthPercent,
    monthsOfInventory: parsed.monthsOfInventory,
    daysOnMarket: parsed.daysOnMarket,
  };
}

function rentalDemandEvidenceFromEnrichment(externalEnrichment) {
  const block = externalEnrichment?.enrichments?.demand_rent;
  if (!block || block.success === false) return emptyRentalDemandEvidence();
  const payload = block.data || block.payload || null;
  return buildRentalDemandEvidence(parseDemandRentResponse(payload), {
    retrievedAt: block.provenance?.retrievedAt || null,
  });
}

function parseSoldTransactionsFromPayload(payload) {
  const data = unwrapPayload(payload);
  const raw =
    data?.raw_data ||
    data?.transactions ||
    data?.sales ||
    payload?.raw_data ||
    [];

  if (!Array.isArray(raw)) return [];

  return raw
    .map((row, index) => {
      const price = pickPositiveNumber(row.price, row.amount, row.sold_price);
      if (!price) return null;
      return {
        id: row.id || `pd-${index}`,
        address: pickText(row.address, row.full_address),
        price,
        sold_date: pickDate(row.date, row.sold_date, row.transfer_date),
        property_type: pickText(row.type, row.property_type),
        bedrooms: pickNonNegativeInteger(row.bedrooms),
        square_feet: pickPositiveNumber(row.sqft, row.internal_area, row.floor_area),
        distance_km: pickPositiveNumber(row.distance),
        source: 'PropertyData',
        underlyingSource: 'HM Land Registry',
      };
    })
    .filter(Boolean);
}

module.exports = {
  unwrapPayload,
  parseValuationSaleResponse,
  parseSoldPricesStats,
  parseSoldPricesPerSqf,
  parseUprnProfile,
  parseUprnSaleEstimate,
  parseSoldTransactionsFromPayload,
  parseRegisteredLeases,
  legalTenureFromLeases,
  canonicalLeaseYearsRemaining,
  parseRentsResponse,
  parseRentsListings,
  buildRentalEvidence,
  weeklyToMonthly,
  RENTS_WEEKLY_TO_MONTHLY,
  RENTS_UNIT_GBP_PER_WEEK,
  parseDemandResponse,
  buildMarketDemandEvidence,
  demandEvidenceFromEnrichment,
  parseDemandRentResponse,
  buildRentalDemandEvidence,
  rentalDemandEvidenceFromEnrichment,
};
