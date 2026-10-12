/**
 * Safe parsing of MHCLG Energy Certificate Data API payloads.
 * Schema-version tolerant. Restricted address fields stay transient.
 * Does not treat LMK_KEY as certificate identity.
 */

const {
  CERTIFICATE_TYPE,
  isOfficialMissing,
  officialPresent,
  officialNumber,
  officialEnergyScore,
  compactPresentFields,
  normalizeCertificateNumber,
  stripRestrictedAddress,
  EPB_SOURCE,
  EPB_SOURCE_TYPE,
  EPB_SOURCE_GEOGRAPHY,
} = require('../../../architecture/epbEvidenceContract');

function pick(row, keys) {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && !isOfficialMissing(row[key])) {
      return row[key];
    }
  }
  return undefined;
}

function asIsoDate(value) {
  if (isOfficialMissing(value)) return null;
  const text = String(value).trim();
  const day = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (day) return day[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function asText(value) {
  const present = officialPresent(value);
  if (present == null) return null;
  const text = String(present).trim();
  return text || null;
}

function asCharacteristicText(value) {
  if (typeof value === 'number') return null;
  return asText(value);
}

function nestedDescription(value) {
  if (Array.isArray(value)) {
    const first = value.find((row) => row && typeof row === 'object') || value[0];
    return nestedDescription(first);
  }
  if (value && typeof value === 'object') {
    return asText(
      value.description
      || value.summary
      || value.energyDescription
      || value.energy_description
      || null
    );
  }
  return asText(value);
}

/**
 * Retain nested RdSAP sap_building_parts[].construction_age_band letter codes.
 * Does not overwrite with normalized period labels — raw codes stay on each part.
 */
function parseSapBuildingParts(row = {}) {
  const raw = row.sap_building_parts || row.sapBuildingParts || null;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw
    .filter((part) => part && typeof part === 'object')
    .map((part) => {
      const identifier = asText(part.identifier || part.name || null);
      const code = asText(
        part.construction_age_band
        ?? part.constructionAgeBand
        ?? null
      );
      if (!identifier && !code) return null;
      return {
        identifier: identifier || null,
        constructionAgeBandCode: code || null,
      };
    })
    .filter(Boolean);
}

function mainDwellingConstructionAgeCode(parts = []) {
  if (!Array.isArray(parts) || !parts.length) return null;
  const main = parts.find(
    (p) => String(p.identifier || '').trim().toLowerCase() === 'main dwelling'
  );
  return (main && main.constructionAgeBandCode) || null;
}

function asUprn(value) {
  if (isOfficialMissing(value)) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return null;
  return digits.replace(/^0+/, '') || null;
}

function extractSearchRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((row) => row && typeof row === 'object');
  if (Array.isArray(payload.data)) return payload.data.filter((row) => row && typeof row === 'object');
  if (Array.isArray(payload.rows)) return payload.rows.filter((row) => row && typeof row === 'object');
  if (payload.data && Array.isArray(payload.data.rows)) {
    return payload.data.rows.filter((row) => row && typeof row === 'object');
  }
  return [];
}

function extractPagination(payload) {
  const page = payload?.pagination || payload?.data?.pagination || null;
  if (!page || typeof page !== 'object') {
    return { totalRecords: null, currentPage: 1, totalPages: 1, pageSize: null };
  }
  return {
    totalRecords: page.totalRecords ?? page.total_records ?? null,
    currentPage: page.currentPage ?? page.current_page ?? 1,
    totalPages: page.totalPages ?? page.total_pages ?? 1,
    pageSize: page.pageSize ?? page.page_size ?? null,
  };
}

function extractCertificateBody(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
}

function transientAddress(row = {}) {
  return {
    addressLine1: asText(pick(row, ['addressLine1', 'address_line_1', 'address1', 'ADDRESS1'])),
    addressLine2: asText(pick(row, ['addressLine2', 'address_line_2', 'address2', 'ADDRESS2'])),
    addressLine3: asText(pick(row, ['addressLine3', 'address_line_3', 'address3', 'ADDRESS3'])),
    addressLine4: asText(pick(row, ['addressLine4', 'address_line_4', 'address4', 'ADDRESS4'])),
    postcode: asText(pick(row, ['postcode', 'post_code', 'POSTCODE'])),
    postTown: asText(pick(row, ['postTown', 'post_town', 'posttown'])),
  };
}

function parseSearchCandidate(row, certificateType) {
  const certificateNumber = normalizeCertificateNumber(pick(row, [
    'certificateNumber',
    'certificate_number',
    'CERTIFICATE_NUMBER',
  ]));
  if (!certificateNumber) return null;
  const address = transientAddress(row);
  return {
    certificateNumber,
    certificateType,
    uprn: asUprn(pick(row, ['uprn', 'UPRN'])),
    uprnSource: asText(pick(row, ['uprnSource', 'uprn_source', 'UPRN_SOURCE'])),
    currentEnergyRating: asText(pick(row, [
      'currentEnergyEfficiencyBand',
      'current_energy_efficiency_band',
      'currentEnergyRating',
      'current_energy_rating',
      'energyBand',
      'asset_rating_band',
    ])),
    registrationDate: asIsoDate(pick(row, [
      'registrationDate',
      'registration_date',
      'lodgementDate',
      'lodgement_date',
      'lodgement_datetime',
    ])),
    inspectionDate: asIsoDate(pick(row, ['inspectionDate', 'inspection_date'])),
    schemaType: asText(pick(row, ['schemaType', 'schema_type', 'assessment_type'])),
    address,
    lmkKeyIgnored: pick(row, ['lmk-key', 'lmk_key', 'lmkKey', 'LMK_KEY']) != null,
  };
}

function parseDomesticFacts(row = {}) {
  const sapBuildingParts = parseSapBuildingParts(row);
  const topLevelAge = asText(pick(row, [
    'constructionAgeBand',
    'construction_age_band',
    'CONSTRUCTION_AGE_BAND',
  ]));
  // Prefer nested Main Dwelling raw letter when top-level age is absent (Register JSON).
  // Do not invent a human period here — decoding stays in rdSapConstructionAgeBand.
  const nestedMainCode = mainDwellingConstructionAgeCode(sapBuildingParts);
  const constructionAgeBandRawCode = nestedMainCode
    || (topLevelAge && /^[A-Ma-m]$/.test(String(topLevelAge).trim()) ? String(topLevelAge).trim().toUpperCase() : null);

  return {
    uprn: asUprn(pick(row, ['uprn', 'UPRN'])),
    uprnSource: asText(pick(row, ['uprnSource', 'uprn_source', 'UPRN_SOURCE'])),
    propertyType: asCharacteristicText(pick(row, ['propertyType', 'property_type', 'dwelling_type', 'PROPERTY_TYPE'])),
    builtForm: asText(pick(row, ['builtForm', 'built_form', 'BUILT_FORM'])),
    totalFloorAreaSqm: officialNumber(pick(row, [
      'totalFloorArea',
      'total_floor_area',
      'TOTAL_FLOOR_AREA',
    ])),
    currentEnergyRating: asText(pick(row, [
      'currentEnergyRating',
      'current_energy_rating',
      'currentEnergyEfficiencyBand',
      'current_energy_efficiency_band',
      'CURRENT_ENERGY_RATING',
    ])),
    potentialEnergyRating: asText(pick(row, [
      'potentialEnergyRating',
      'potential_energy_rating',
      'potentialEnergyEfficiencyBand',
      'potential_energy_efficiency_band',
      'POTENTIAL_ENERGY_RATING',
    ])),
    currentEnergyEfficiency: officialEnergyScore(pick(row, [
      'currentEnergyEfficiency',
      'current_energy_efficiency',
      'energy_rating_current',
      'CURRENT_ENERGY_EFFICIENCY',
    ])),
    potentialEnergyEfficiency: officialEnergyScore(pick(row, [
      'potentialEnergyEfficiency',
      'potential_energy_efficiency',
      'energy_rating_potential',
      'POTENTIAL_ENERGY_EFFICIENCY',
    ])),
    // Top-level human label when present; otherwise leave null (raw letter lives on sapBuildingParts).
    constructionAgeBand: topLevelAge && !/^[A-Ma-m]$/.test(String(topLevelAge).trim())
      ? topLevelAge
      : null,
    constructionAgeBandRawCode: constructionAgeBandRawCode || null,
    sapBuildingParts: sapBuildingParts.length ? sapBuildingParts : undefined,
    wallDescription: nestedDescription(row.walls)
      || asText(pick(row, ['wallsDescription', 'walls_description', 'WALLS_DESCRIPTION'])),
    wallEnergyRating: asText(pick(row, ['wallsEnergyEff', 'walls_energy_eff', 'WALLS_ENERGY_EFF'])),
    roofDescription: nestedDescription(row.roofs)
      || asText(pick(row, ['roofDescription', 'roof_description', 'ROOF_DESCRIPTION'])),
    roofEnergyRating: asText(pick(row, ['roofEnergyEff', 'roof_energy_eff', 'ROOF_ENERGY_EFF'])),
    windowDescription: nestedDescription(row.window || row.windows)
      || asText(pick(row, ['windowsDescription', 'windows_description', 'WINDOWS_DESCRIPTION'])),
    windowEnergyRating: asText(pick(row, ['windowsEnergyEff', 'windows_energy_eff', 'WINDOWS_ENERGY_EFF'])),
    heatingDescription: nestedDescription(row.main_heating || row.mainHeating)
      || asText(pick(row, [
      'mainheatDescription',
      'mainheat_description',
      'MAINHEAT_DESCRIPTION',
    ])),
    heatingEnergyRating: asText(pick(row, [
      'mainheatEnergyEff',
      'mainheat_energy_eff',
      'MAINHEAT_ENERGY_EFF',
    ])),
    hotWaterDescription: nestedDescription(row.hot_water || row.hotWater)
      || asText(pick(row, [
      'hotwaterDescription',
      'hotwater_description',
      'HOTWATER_DESCRIPTION',
    ])),
    hotWaterEnergyRating: asText(pick(row, [
      'hotWaterEnergyEff',
      'hot_water_energy_eff',
      'HOT_WATER_ENERGY_EFF',
    ])),
    occupancyTenure: asCharacteristicText(pick(row, ['tenure', 'TENURE'])),
    inspectionDate: asIsoDate(pick(row, ['inspectionDate', 'inspection_date', 'INSPECTION_DATE'])),
    lodgementDate: asIsoDate(pick(row, [
      'lodgementDate',
      'lodgement_date',
      'registrationDate',
      'registration_date',
      'LODGEMENT_DATE',
    ])),
    schemaType: asText(pick(row, ['schemaType', 'schema_type', 'assessment_type', 'assessmentType'])),
  };
}

function parseNonDomesticFacts(row = {}) {
  return {
    uprn: asUprn(pick(row, ['uprn', 'UPRN'])),
    uprnSource: asText(pick(row, ['uprnSource', 'uprn_source', 'UPRN_SOURCE'])),
    propertyType: asText(pick(row, [
      'propertyType',
      'property_type',
      'buildingUseType',
      'building_use_type',
    ])),
    totalFloorAreaSqm: officialNumber(pick(row, [
      'floorArea',
      'floor_area',
      'totalUsefulFloorArea',
      'total_useful_floor_area',
      'TOTAL_FLOOR_AREA',
    ])),
    assetRating: officialEnergyScore(pick(row, ['assetRating', 'asset_rating', 'ASSET_RATING'])),
    energyBand: asText(pick(row, [
      'assetRatingBand',
      'asset_rating_band',
      'energyBand',
      'currentEnergyEfficiencyBand',
    ])),
    mainHeatingFuel: asText(pick(row, [
      'mainHeatingFuel',
      'main_heating_fuel',
      'MAIN_HEATING_FUEL',
    ])),
    buildingEnvironment: asText(pick(row, [
      'buildingEnvironment',
      'building_environment',
      'BUILDING_ENVIRONMENT',
    ])),
    inspectionDate: asIsoDate(pick(row, ['inspectionDate', 'inspection_date'])),
    lodgementDate: asIsoDate(pick(row, [
      'lodgementDate',
      'lodgement_date',
      'registrationDate',
      'registration_date',
    ])),
    schemaType: asText(pick(row, ['schemaType', 'schema_type', 'assessment_type', 'assessmentType'])),
  };
}

function parseCertificate(payload, certificateType = CERTIFICATE_TYPE.DOMESTIC, fallbackCertificateNumber = null) {
  const body = extractCertificateBody(payload);
  if (!body) return null;
  const certificateNumber = normalizeCertificateNumber(pick(body, [
    'certificateNumber',
    'certificate_number',
    'CERTIFICATE_NUMBER',
  ]) || fallbackCertificateNumber);
  const facts = certificateType === CERTIFICATE_TYPE.NON_DOMESTIC
    ? parseNonDomesticFacts(body)
    : parseDomesticFacts(body);
  return {
    certificateNumber,
    certificateType,
    address: transientAddress(body),
    facts: compactPresentFields(stripRestrictedAddress(facts)),
    lmkKeyIgnored: pick(body, ['lmk-key', 'lmk_key', 'lmkKey', 'LMK_KEY']) != null,
  };
}

function latestCertificate(certificates = []) {
  const list = (certificates || []).filter(Boolean);
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const left = a.lodgementDate || a.registrationDate || a.inspectionDate || '';
    const right = b.lodgementDate || b.registrationDate || b.inspectionDate || '';
    if (left !== right) return String(right).localeCompare(String(left));
    return String(b.certificateNumber || '').localeCompare(String(a.certificateNumber || ''));
  })[0];
}

function attribution() {
  return {
    source: EPB_SOURCE,
    sourceType: EPB_SOURCE_TYPE,
    sourceGeography: EPB_SOURCE_GEOGRAPHY,
    licence: 'OGL-v3.0',
    attribution:
      'Contains Energy Performance of Buildings data (MHCLG). Non-address fields including UPRN are licensed under the Open Government Licence v3.0. UPRN is an Ordnance Survey identifier. Address and postcode fields are restricted and are not stored as a gazetteer.',
    osIdentifierNotice: 'UPRN © Ordnance Survey',
  };
}

module.exports = {
  pick,
  asIsoDate,
  asText,
  asUprn,
  extractSearchRows,
  extractPagination,
  extractCertificateBody,
  transientAddress,
  parseSearchCandidate,
  parseSapBuildingParts,
  mainDwellingConstructionAgeCode,
  parseDomesticFacts,
  parseNonDomesticFacts,
  parseCertificate,
  latestCertificate,
  attribution,
};
