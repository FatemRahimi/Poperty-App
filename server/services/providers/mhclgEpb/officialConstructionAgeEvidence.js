/**
 * Canonical official construction-age evidence contract.
 *
 * Distinguishes:
 * - raw official RdSAP age code(s)
 * - normalized official construction period/band (never an invented exact year)
 * - exact year only when genuinely known from a separate path
 * - source/provenance
 * - confidence / assessment / ambiguity
 * - subject binding
 *
 * Never converts an age band into yearBuilt.
 */

const {
  AUTHORITATIVE_SOURCE,
  decodeRdSapConstructionAgeBandCode,
  mapOfficialPeriodLabelToPropertyData,
} = require('./rdSapConstructionAgeBand');

const PROVENANCE = Object.freeze({
  OFFICIAL_EPB: 'OFFICIAL_EPB',
  USER_DECLARED: 'USER_DECLARED',
  LISTING_FIRST_PARTY: 'LISTING_FIRST_PARTY',
  LICENSED_PROVIDER: 'LICENSED_PROVIDER',
});

const ASSESSMENT = Object.freeze({
  ASSESSED: 'ASSESSED',
  NOT_ASSESSED: 'NOT_ASSESSED',
  AMBIGUOUS: 'AMBIGUOUS',
});

const MAIN_DWELLING_ID = 'main dwelling';

function isMainDwelling(identifier) {
  return String(identifier || '').trim().toLowerCase() === MAIN_DWELLING_ID;
}

/**
 * Build canonical evidence from parsed EPB facts (including sapBuildingParts).
 * Canonical period uses Main Dwelling only when present — certificate semantics,
 * not newest/oldest/average of extensions.
 */
function buildOfficialConstructionAgeEvidence({
  facts = {},
  certificateNumber = null,
  subjectId = null,
  uprn = null,
} = {}) {
  const schemaType = facts.schemaType || null;
  const asOf = facts.lodgementDate || facts.inspectionDate || null;
  const parts = Array.isArray(facts.sapBuildingParts) ? facts.sapBuildingParts : [];

  const buildingParts = parts.map((part) => {
    const rawCode = part.constructionAgeBandCode || part.construction_age_band || null;
    const decoded = decodeRdSapConstructionAgeBandCode(rawCode, schemaType);
    return {
      identifier: part.identifier || null,
      rawCode: rawCode ? String(rawCode).trim().toUpperCase() : null,
      periodLabel: decoded.ok ? decoded.periodLabel : null,
      decodeOk: decoded.ok === true,
      decodeReason: decoded.reason || null,
      isMainDwelling: isMainDwelling(part.identifier),
    };
  });

  const topLevelRaw = facts.constructionAgeBandRawCode || null;
  const topLevelLabel = facts.constructionAgeBand || null;

  const main = buildingParts.find((p) => p.isMainDwelling) || null;
  const distinctCodes = [...new Set(buildingParts.map((p) => p.rawCode).filter(Boolean))];
  const multiplePartsDiffer =
    distinctCodes.length > 1;

  let canonicalRawCode = null;
  let canonicalPeriodLabel = null;
  let assessment = ASSESSMENT.NOT_ASSESSED;
  let ambiguity = null;
  let confidence = 'none';

  if (main && main.rawCode && main.decodeOk) {
    canonicalRawCode = main.rawCode;
    canonicalPeriodLabel = main.periodLabel;
    assessment = ASSESSMENT.ASSESSED;
    confidence = 'official_rdsap_main_dwelling';
    if (multiplePartsDiffer) {
      ambiguity = {
        status: 'extensions_differ_from_main_dwelling',
        note: 'Multiple sap_building_parts expose different construction_age_band codes. Canonical uses Main Dwelling only; all parts preserved. No newest/oldest/average.',
        distinctCodes,
      };
    }
  } else if (main && main.rawCode && !main.decodeOk) {
    canonicalRawCode = main.rawCode;
    assessment = ASSESSMENT.NOT_ASSESSED;
    ambiguity = { status: 'main_dwelling_code_not_decodable', reason: main.decodeReason };
  } else if (!main && distinctCodes.length === 1 && buildingParts.length >= 1) {
    // No Main Dwelling identifier — refuse to invent which part is primary.
    assessment = ASSESSMENT.AMBIGUOUS;
    ambiguity = {
      status: 'no_main_dwelling_part',
      note: 'Building parts present without Main Dwelling identifier; canonical period not selected.',
      distinctCodes,
    };
  } else if (!main && distinctCodes.length > 1) {
    assessment = ASSESSMENT.AMBIGUOUS;
    ambiguity = {
      status: 'multiple_parts_no_main_dwelling',
      note: 'Multiple differing age codes without Main Dwelling; no arbitrary selection.',
      distinctCodes,
    };
  } else if (topLevelLabel || topLevelRaw) {
    // Top-level human label or code (rare on Register JSON; preserved when present).
    if (topLevelRaw && /^[A-M]$/i.test(String(topLevelRaw).trim())) {
      const decoded = decodeRdSapConstructionAgeBandCode(topLevelRaw, schemaType);
      if (decoded.ok) {
        canonicalRawCode = decoded.code;
        canonicalPeriodLabel = decoded.periodLabel;
        assessment = ASSESSMENT.ASSESSED;
        confidence = 'official_rdsap_top_level_code';
      }
    } else if (topLevelLabel && !/^not recorded$/i.test(String(topLevelLabel))) {
      canonicalPeriodLabel = String(topLevelLabel);
      assessment = ASSESSMENT.ASSESSED;
      confidence = 'official_epb_top_level_label';
    }
  }

  const pd = canonicalPeriodLabel
    ? mapOfficialPeriodLabelToPropertyData(canonicalPeriodLabel)
    : { mappable: false, value: null, reason: 'no_canonical_period' };

  return {
    subjectId: subjectId != null ? subjectId : null,
    uprn: uprn || facts.uprn || null,
    certificateNumber: certificateNumber || null,
    schemaType,
    asOf,
    provenance: PROVENANCE.OFFICIAL_EPB,
    source: 'MHCLG_EPBD',
    authoritativeMapping: AUTHORITATIVE_SOURCE,
    buildingParts,
    rawOfficialAgeCode: canonicalRawCode,
    normalizedOfficialPeriod: canonicalPeriodLabel,
    exactYear: null, // never invent year from band
    yearBuilt: null, // never alias band as yearBuilt
    assessment,
    confidence,
    ambiguity,
    propertyDataConstructionDate: pd.mappable ? pd.value : null,
    propertyDataMappable: pd.mappable === true,
    propertyDataMappingReason: pd.reason || null,
    propertyDataBounds: pd.bounds || null,
  };
}

module.exports = {
  PROVENANCE,
  ASSESSMENT,
  buildOfficialConstructionAgeEvidence,
  isMainDwelling,
};
