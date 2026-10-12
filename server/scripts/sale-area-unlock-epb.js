/**
 * V1.2 — Residential Sale Area Unlock: Existing EPB path only.
 * READ: runs existing acquireOfficialEpbEvidence for the 17 MISSING_INTERNAL_AREA
 * sale subjects. No fuzzy matching, no SAON weakening, no production code changes.
 *
 * node server/scripts/sale-area-unlock-epb.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { extractCanonicalAddress } = require('../services/identity/canonicalAddress');
const { acquireOfficialEpbEvidence, getEpbCapability } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const {
  buildValuationSaleRequest,
} = require('../services/providers/propertyData/propertyTypeMapping');

// The 17 confirmed MISSING_INTERNAL_AREA residential sale subjects
const TARGET_IDS = [123, 127, 128, 130, 131, 134, 145, 148, 149, 150, 151, 152, 153, 154, 155, 164, 167];

(async () => {
  await ensureIntelligenceSchema();

  const capability = getEpbCapability(propertyIntelligenceConfig.providers.mhclgEpb);
  if (!capability.available) {
    console.log(JSON.stringify({
      blocked: true,
      reason: 'UNAVAILABLE_MISSING_CREDENTIAL',
      message: 'MHCLG_EPB_BEARER_TOKEN not set — EPB acquisition unavailable.',
    }, null, 2));
    await pool.end();
    return;
  }

  // Load the 17 target properties
  const propRows = await pool.query(
    'SELECT * FROM properties WHERE id = ANY($1) ORDER BY id',
    [TARGET_IDS]
  );
  const properties = propRows.rows;

  // Load their identity rows
  const identRows = await pool.query(
    'SELECT * FROM property_identities WHERE property_id = ANY($1)',
    [TARGET_IDS]
  );
  const identityByProp = new Map(identRows.rows.map((r) => [String(r.property_id), r]));

  const results = [];

  for (const property of properties) {
    const stored = identityByProp.get(String(property.id)) || {};
    const identity = extractCanonicalAddress({
      ...property,
      paon: stored.paon,
      saon: stored.saon,
      postcode: stored.postcode || property.zip_code,
      uprn: stored.uprn,
    });

    // Classify identity sufficiency before attempting
    const isUnitLike = ['flat', 'apartment', 'maisonette', 'studio'].includes(
      String(property.property_type || '').toLowerCase().replace(/[{}"]/g, '').split(',')[0].trim()
    );
    const hasSaon = Boolean(identity.saon);
    const hasPostcode = Boolean(identity.postcode);
    const hasPaon = Boolean(identity.paon);

    // Run EPB acquisition through the existing function
    let epbResult;
    try {
      epbResult = await acquireOfficialEpbEvidence({ property, identity, deps: { skipCoalesce: true } });
    } catch (err) {
      epbResult = { status: 'SOURCE_ERROR', reason: err.message, searchAttempted: false };
    }

    const status = epbResult.status || epbResult.attachmentStatus;
    const uniqueAttach = status === EPB_ATTACHMENT.UNIQUE_ATTACH || epbResult.attachmentStatus === EPB_ATTACHMENT.UNIQUE_ATTACH;
    const reused = epbResult.attachmentStatus === EPB_ATTACHMENT.REUSED;
    const usableArea = uniqueAttach || reused
      ? Boolean(epbResult.client?.current?.floorAreaSqm)
      : false;
    const certType = epbResult.client?.current?.certificateType || epbResult.currentCertificate?.certificateType;
    const isDomestic = certType && !String(certType).toUpperCase().includes('NON_DOMESTIC') && !String(certType).toUpperCase().includes('CEPC');

    // After EPB attempt, re-resolve canonical area
    const resolution = await resolveCanonicalInternalArea({
      property,
      identity: { uprn: stored.uprn || epbResult.uprn, saon: identity.saon },
      loadPersistedEpb: true,
    });
    const applied = applyCanonicalInternalAreaToProperty(property, resolution);
    const avm = buildValuationSaleRequest(applied);

    results.push({
      id: property.id,
      property_type: property.property_type,
      postcode: property.zip_code,
      paon: identity.paon,
      saon: identity.saon,
      uprn: stored.uprn || null,
      is_unit_like: isUnitLike,
      identity_sufficient: hasPostcode && hasPaon,
      epb_attempted: Boolean(epbResult.searchAttempted),
      epb_status: status,
      unique_match: uniqueAttach || reused,
      usable_floor_area: usableArea,
      cert_type: certType || null,
      domestic: isDomestic,
      area_persisted: usableArea,
      canonical_area_available: resolution.available,
      canonical_area_sqft: resolution.normalisedValueSqft,
      canonical_area_source: resolution.selectedSource,
      provider_eligible: avm.readiness?.state === 'PROVIDER_ELIGIBLE',
      avm_readiness_reason: avm.readiness?.reasonCode || null,
      failure_reason: !uniqueAttach && !reused ? (status || 'UNKNOWN') : null,
    });
  }

  // Tally
  const attempted = results.filter((r) => r.epb_attempted);
  const uniqueMatched = results.filter((r) => r.unique_match);
  const usableArea = results.filter((r) => r.usable_floor_area);
  const canonicalAvail = results.filter((r) => r.canonical_area_available);
  const eligible = results.filter((r) => r.provider_eligible);
  const unitBlocked = results.filter((r) => r.epb_status === EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
  const noMatch = results.filter((r) => r.epb_status === EPB_ATTACHMENT.NO_MATCH_FOUND);
  const insuffIdent = results.filter((r) => r.epb_status === EPB_ATTACHMENT.UNRESOLVED_IDENTITY || r.epb_status === EPB_ATTACHMENT.INSUFFICIENT_IDENTITY);
  const stillMissing = results.filter((r) => !r.canonical_area_available);
  const userRequired = stillMissing;

  const summary = {
    cohort_size: results.length,
    epb_attempted: attempted.length,
    unique_match: uniqueMatched.length,
    usable_official_floor_area: usableArea.length,
    canonical_area_available: canonicalAvail.length,
    provider_eligible: eligible.length,
    unit_saon_blocked: unitBlocked.length,
    no_match: noMatch.length,
    insufficient_identity: insuffIdent.length,
    still_missing_area: stillMissing.length,
    user_completion_required: userRequired.length,
  };

  const output = {
    study: 'V1.2_SALE_AREA_UNLOCK_EPB',
    measuredAt: new Date().toISOString(),
    epb_credential_available: true,
    summary,
    per_subject: results,
  };

  const outPath = path.join(__dirname, 'sale-area-unlock-epb-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify({ summary, eligible_ids: eligible.map((r) => r.id) }, null, 2));

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
