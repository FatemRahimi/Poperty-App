/**
 * V1.2 Sale Evidence Activation Audit - read-only investigation.
 * Run: node server/scripts/sale-evidence-activation-audit.js
 */
require('../config/loadEnv');
const pool = require('../models/db');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const {
  buildValuationSaleRequest,
  mapToPropertyDataType,
} = require('../services/providers/propertyData/propertyTypeMapping');
const { parseUprnProfile } = require('../services/providers/propertyData/propertyDataParsers');
const { canonicalPropertyTypeToken } = require('../utils/canonicalPropertyType');
const fs = require('fs');
const path = require('path');

const SQFT_RE = /(\d[\d,]*)\s*(?:sq\.?\s*f(?:ee)?t|sqft|ft2|square\s*feet)/gi;
const SQM_RE = /(\d[\d,]*)\s*(?:sq\.?\s*m(?:etres?|eters?)?|sqm|m2|square\s*met)/gi;

function textAreaMentions(text) {
  if (!text) return [];
  const hits = [];
  let m;
  while ((m = SQFT_RE.exec(text))) hits.push({ value: parseInt(m[1].replace(/,/g,''),10), unit:'sqft', raw:m[0] });
  SQFT_RE.lastIndex = 0;
  while ((m = SQM_RE.exec(text))) hits.push({ value: parseInt(m[1].replace(/,/g,''),10), unit:'sqm', raw:m[0] });
  SQM_RE.lastIndex = 0;
  return hits;
}

(async () => {
  const sale = await pool.query(`
    SELECT p.*,
      pi.uprn, pi.paon, pi.saon, pi.building_name,
      e.facts AS epb_facts, e.attachment_status AS epb_status,
      e.facts->>'totalFloorAreaSqm' AS epb_sqm,
      e.is_current AS epb_current
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    LEFT JOIN official_epb_certificates e ON e.property_id = p.id AND e.is_current = TRUE
    WHERE p.category = 'sale' AND p.price IS NOT NULL AND p.price::numeric > 0
    ORDER BY p.id
  `);
  console.log('Found ' + sale.rows.length + ' sale+price properties');

  const ids = sale.rows.map(r => r.id);
  const enrichments = await pool.query(
    'SELECT property_id, enrichment_type, source, payload, retrieved_at, expires_at FROM property_enrichments WHERE property_id = ANY($1) ORDER BY property_id, enrichment_type',
    [ids]
  );
  const enrichMap = {};
  for (const row of enrichments.rows) {
    if (!enrichMap[row.property_id]) enrichMap[row.property_id] = [];
    enrichMap[row.property_id].push(row);
  }

  let factsRows = [];
  try {
    const fr = await pool.query('SELECT property_id, fact_type, payload FROM property_facts WHERE property_id = ANY($1)', [ids]);
    factsRows = fr.rows;
  } catch(e) { /* table may not exist */ }
  const factsMap = {};
  for (const row of factsRows) {
    if (!factsMap[row.property_id]) factsMap[row.property_id] = [];
    factsMap[row.property_id].push(row);
  }

  const subjects = [];
  const unmappedTypeIds = new Set([129,132,135,137,146,147]);

  for (const row of sale.rows) {
    const enrichList = enrichMap[row.id] || [];
    const uprnEnrich = enrichList.find(e => e.enrichment_type === 'uprn_profile');
    const externalEnrichment = uprnEnrich ? {
      enrichments: {
        uprn_profile: {
          success: true,
          data: uprnEnrich.payload && uprnEnrich.payload.data ? uprnEnrich.payload.data : uprnEnrich.payload,
          provenance: (uprnEnrich.payload && uprnEnrich.payload.provenance) || {},
        },
      },
      identity: { uprn: row.uprn },
    } : null;

    let uprnInternalArea = null;
    if (uprnEnrich && uprnEnrich.payload) {
      const parsed = parseUprnProfile(uprnEnrich.payload.data || uprnEnrich.payload);
      uprnInternalArea = parsed.internalArea;
    }

    const resolution = await resolveCanonicalInternalArea({
      property: row,
      identity: { uprn: row.uprn, saon: row.saon },
      externalEnrichment: externalEnrichment,
      loadPersistedEpb: true,
    });
    const applied = applyCanonicalInternalAreaToProperty(row, resolution);
    const valReq = buildValuationSaleRequest(applied);

    const textFields = [row.description, row.features, row.title, row.notes].filter(Boolean).join(' ');
    const textMentions = textAreaMentions(textFields);

    const enrichmentAreaKeys = [];
    for (const e of enrichList) {
      if (!e.payload || typeof e.payload !== 'object') continue;
      const flat = JSON.stringify(e.payload);
      if (/internalArea|floorArea|square_feet|sqft|floor_area|property_type/i.test(flat)) {
        enrichmentAreaKeys.push({
          type: e.enrichment_type, source: e.source,
          hasInternalArea: /internalArea|internal_area/i.test(flat),
          hasFloorArea: /floorArea|floor_area/i.test(flat),
          hasSqft: /sqft|square_feet/i.test(flat),
          hasPropertyType: /property_type|propertyType/i.test(flat),
        });
      }
    }

    const valSaleEnrich = enrichList.find(e => e.enrichment_type === 'valuation_sale');

    const entry = {
      id: row.id, title: (row.title||'').substring(0,80), price: row.price, category: row.category,
      property_type_raw: row.property_type, property_type_mapped: mapToPropertyDataType(row.property_type),
      square_feet: row.square_feet, floor_area: row.floor_area, floor_area_unit: row.floor_area_unit,
      year_built: row.year_built != null ? row.year_built : null,
      bedrooms: row.bedrooms, postcode: row.zip_code, uprn: row.uprn, saon: row.saon || null,
      epb_status: row.epb_status || null, epb_sqm: row.epb_sqm || null, epb_current: row.epb_current || false,
      epb_construction_age_band: (row.epb_facts && (row.epb_facts.constructionAgeBand || row.epb_facts.construction_age_band)) || null,
      uprn_internal_area: uprnInternalArea,
      resolution_available: resolution.available, resolution_source: resolution.selectedSource || null,
      resolution_sqft: resolution.normalisedValueSqft || null,
      resolution_readiness: resolution.readiness ? resolution.readiness.state : null,
      resolution_reasonCode: resolution.readiness ? resolution.readiness.reasonCode : null,
      observation_count: resolution.observations ? resolution.observations.length : 0,
      observations: (resolution.observations||[]).map(o => ({
        source:o.source, rawValue:o.rawValue, rawUnit:o.rawUnit,
        normalisedSqft:o.normalisedValueSqft, available:o.available, subjectScope:o.subjectScope,
      })),
      valReq_canAvm: valReq.canRequestAvm,
      valReq_readiness: valReq.readiness ? valReq.readiness.state : null,
      valReq_reasonCode: valReq.readiness ? valReq.readiness.reasonCode : null,
      valReq_params: valReq.params || null,
      construction_available: valReq.construction?.available === true,
      construction_value: valReq.construction?.value || null,
      has_latent_structured_area: false, has_only_text_mentions: false, latent_detail: null,
      text_area_mentions: textMentions.length > 0 ? textMentions : null,
      enrichment_area_keys: enrichmentAreaKeys.length > 0 ? enrichmentAreaKeys : null,
      has_valuation_sale_enrichment: !!valSaleEnrich,
      enrichment_types: enrichList.map((e) => e.enrichment_type),
    };

    const latentReasons = [];
    if (uprnInternalArea && !resolution.available) {
      latentReasons.push('uprn_profile has internalArea=' + uprnInternalArea + ' but resolver did not use it');
    }
    if (row.epb_sqm && !resolution.available) {
      latentReasons.push('EPB has totalFloorAreaSqm=' + row.epb_sqm + ' but resolver did not use it');
    }
    if (row.floor_area > 0 && !resolution.available) {
      latentReasons.push('listing has floor_area=' + row.floor_area + ' unit=' + row.floor_area_unit + ' but resolver did not consume');
    }
    for (const eak of enrichmentAreaKeys) {
      if (eak.hasInternalArea && !resolution.available) {
        // Key presence alone is not evidence — only a finite parsed area is latent.
        if (uprnInternalArea != null && Number.isFinite(Number(uprnInternalArea))) {
          latentReasons.push(eak.type + '/' + eak.source + ' enrichment has internalArea key but area not resolved');
        }
      }
    }
    if (row.square_feet > 0 && !resolution.available) {
      // Implausible listing values are INVALID, not latent unused evidence.
      if (resolution.readiness?.reasonCode !== 'INVALID_INTERNAL_AREA') {
        latentReasons.push('listing has square_feet=' + row.square_feet + ' but resolver did not consume');
      }
    }
    if (latentReasons.length > 0) {
      entry.has_latent_structured_area = true;
      entry.latent_detail = latentReasons;
    }
    if (!entry.has_latent_structured_area && textMentions.length > 0) {
      entry.has_only_text_mentions = true;
    }

    if (unmappedTypeIds.has(row.id) || (valReq.readiness && valReq.readiness.reasonCode === 'UNMAPPED_PROPERTY_TYPE')) {
      entry.unmapped_type_detail = {
        raw_property_type: row.property_type,
        canonical_token: canonicalPropertyTypeToken(row.property_type),
        mapped_result: mapToPropertyDataType(row.property_type),
        property_category: row.property_category || null,
        features: row.features ? (typeof row.features === 'string' ? row.features.substring(0,200) : row.features) : null,
      };
    }

    if (row.id === 133) {
      entry.property_133_detail = {
        square_feet: row.square_feet, floor_area: row.floor_area, floor_area_unit: row.floor_area_unit,
        resolution_available: resolution.available, resolution_readiness: resolution.readiness,
        applied_square_feet: applied.square_feet, ready_for_avm: valReq.canRequestAvm,
      };
    }

    subjects.push(entry);
  }

  const summary = {
    total_sale_price_properties: subjects.length,
    avm_ready: subjects.filter(s => s.valReq_canAvm).length,
    reason_counts: subjects.reduce((acc, s) => {
      const key = s.valReq_reasonCode || (s.valReq_canAvm ? 'PROVIDER_ELIGIBLE' : 'UNKNOWN');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    with_year_built: subjects.filter(s => s.year_built != null).map(s => ({ id: s.id, year_built: s.year_built })),
    with_construction_mapped: subjects.filter(s => s.construction_available).map(s => ({ id: s.id, band: s.construction_value })),
    unmapped_type: subjects.filter(s => s.valReq_reasonCode === 'UNMAPPED_PROPERTY_TYPE').map(s => ({
      id:s.id, raw_type:s.property_type_raw, mapped:s.property_type_mapped, unmapped_detail:s.unmapped_type_detail||null,
    })),
    missing_area: subjects.filter(s => s.valReq_reasonCode === 'MISSING_INTERNAL_AREA').map(s => s.id),
    missing_construction_date: subjects.filter(s => s.valReq_reasonCode === 'MISSING_CONSTRUCTION_DATE').map(s => s.id),
    invalid_area: subjects.filter(s => s.valReq_reasonCode === 'INVALID_INTERNAL_AREA').map(s => s.id),
    latent_structured_evidence: subjects.filter(s => s.has_latent_structured_area).map(s => ({
      id:s.id, detail:s.latent_detail,
    })),
    text_only_mentions: subjects.filter(s => s.has_only_text_mentions).map(s => ({
      id:s.id, mentions:s.text_area_mentions,
    })),
    epb_matches_on_sale: subjects.filter(s => s.epb_sqm).map(s => ({
      id:s.id, epb_sqm:s.epb_sqm, epb_status:s.epb_status, used_by_resolver: s.resolution_source === 'MHCLG_EPBD',
    })),
    uprn_profile_internal_area: subjects.filter(s => s.uprn_internal_area != null).map(s => ({
      id:s.id, uprn_area:s.uprn_internal_area, used_by_resolver: s.resolution_source === 'PROPERTYDATA_UPRN',
    })),
    property_133: subjects.find(s => s.id === 133) ? subjects.find(s => s.id === 133).property_133_detail : null,
    recommended_wiring_fixes: [],
  };

  if (summary.unmapped_type.length > 0) {
    const residentialUnsupported = summary.unmapped_type.filter((u) => {
      const t = String(u.unmapped_detail?.canonical_token || '').toLowerCase();
      return t === 'park-home' || t === 'park_home' || t === 'mobile-home';
    });
    const nonResidential = summary.unmapped_type.filter((u) => !residentialUnsupported.includes(u));
    if (nonResidential.length) {
      summary.recommended_wiring_fixes.push({
        fix: 'NONE — leave non-residential types unmapped',
        detail: nonResidential.length + ' sale subjects are commercial/office/retail/warehouse and must not be forced into residential PropertyData enums.',
        ids: nonResidential.map((u) => u.id),
      });
    }
    if (residentialUnsupported.length) {
      summary.recommended_wiring_fixes.push({
        fix: 'NONE — park-home / unsupported subtype stays UNKNOWN',
        detail: 'PropertyData has no park-home enum; do not invent a residential mapping.',
        ids: residentialUnsupported.map((u) => u.id),
      });
    }
  }
  if (summary.latent_structured_evidence.length > 0) {
    summary.recommended_wiring_fixes.push({
      fix: 'Wire externalEnrichment (uprn_profile) into resolveCanonicalInternalArea call in production pipeline',
      detail: summary.latent_structured_evidence.length + ' properties have structured area evidence in enrichments that the resolver does not receive because externalEnrichment is not passed at call sites.',
      ids: summary.latent_structured_evidence.map(l => l.id),
    });
  }
  const epbNotUsed = summary.epb_matches_on_sale.filter(e => !e.used_by_resolver);
  if (epbNotUsed.length > 0) {
    summary.recommended_wiring_fixes.push({
      fix: 'EPB evidence present but not consumed by resolver - check attachment_status and unit-vs-building scope',
      detail: epbNotUsed.length + ' properties have EPB sqm but resolver did not select EPB source.',
      ids: epbNotUsed.map(e => e.id),
    });
  }

  const output = { generatedAt: new Date().toISOString(), summary: summary, subjects: subjects };
  const outPath = path.join(__dirname, 'sale-evidence-activation-audit-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('\nOutput written to ' + outPath);
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
})().catch(function(e) { console.error(e); process.exit(1); });
