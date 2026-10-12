/**
 * Controlled official MHCLG EPB enrichment against the current inventory.
 * Does not use PropertyData paid identity.
 *
 * Usage:
 *   node scripts/enrich-epb-evidence.js
 *   node scripts/enrich-epb-evidence.js --property-id=12
 */
require('../config/loadEnv');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { extractCanonicalAddress } = require('../services/identity/canonicalAddress');
const { acquireOfficialEpbEvidence, getEpbCapability } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { queryOfficialSaleTransactions } = require('../services/market/officialSaleTransactionQuery');
const { MATCH_METHOD } = require('../architecture/officialSaleTransaction');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');

function argValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function identitySnapshot() {
  const properties = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM properties
  `);
  const identities = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE uprn IS NOT NULL AND BTRIM(uprn) <> '')::int AS uprn
    FROM property_identities
  `);
  let epb = { certificates: 0, propertiesWithEpb: 0, floorArea: 0, energyRating: 0, ageBand: 0 };
  try {
    const rows = await pool.query(`
      SELECT
        COUNT(*)::int AS certificates,
        COUNT(DISTINCT property_id)::int AS properties_with_epb,
        COUNT(*) FILTER (WHERE facts ? 'totalFloorAreaSqm' AND facts->>'totalFloorAreaSqm' IS NOT NULL)::int AS floor_area,
        COUNT(*) FILTER (WHERE COALESCE(facts->>'currentEnergyRating', facts->>'energyBand') IS NOT NULL)::int AS energy_rating,
        COUNT(*) FILTER (WHERE facts ? 'constructionAgeBand' AND facts->>'constructionAgeBand' IS NOT NULL)::int AS age_band,
        COUNT(*) FILTER (WHERE
          (facts ? 'wallDescription' AND facts->>'wallDescription' IS NOT NULL)
          OR (facts ? 'roofDescription' AND facts->>'roofDescription' IS NOT NULL)
          OR (facts ? 'heatingDescription' AND facts->>'heatingDescription' IS NOT NULL)
        )::int AS physical
      FROM official_epb_certificates
      WHERE is_current = TRUE
    `);
    epb = {
      certificates: rows.rows[0].certificates,
      propertiesWithEpb: rows.rows[0].properties_with_epb,
      floorArea: rows.rows[0].floor_area,
      energyRating: rows.rows[0].energy_rating,
      ageBand: rows.rows[0].age_band,
      physical: rows.rows[0].physical,
    };
  } catch {
    epb = { certificates: 0, propertiesWithEpb: 0, floorArea: 0, energyRating: 0, ageBand: 0, tableMissing: true };
  }
  return { total: properties.rows[0].total, uprn: identities.rows[0].uprn, epb };
}

async function matchAll(properties) {
  const tallies = { EXACT_UPRN: 0, EXACT_CANONICAL_ADDRESS: 0, AREA_POSTCODE: 0, NO_TRANSACTIONS_FOUND: 0 };
  for (const property of properties) {
    const identity = extractCanonicalAddress(property);
    const result = await queryOfficialSaleTransactions({
      identity: { ...identity, uprn: property.uprn || identity.uprn },
      property,
    });
    const method = result.matchMethod;
    if (tallies[method] != null) tallies[method] += 1;
    else if (method === MATCH_METHOD.EXACT_UPRN) tallies.EXACT_UPRN += 1;
  }
  return tallies;
}

async function main() {
  await ensureIntelligenceSchema();
  const propertyId = argValue('--property-id');
  const properties = propertyId
    ? (await pool.query('SELECT * FROM properties WHERE id = $1', [propertyId])).rows
    : (await pool.query('SELECT * FROM properties ORDER BY id')).rows;

  const beforeIdentity = await identitySnapshot();
  const beforeHmlr = await matchAll(properties);
  const before = {
    properties: properties.length,
    uprn: beforeIdentity.uprn,
    officialPhysical: beforeIdentity.epb.floorArea,
    officialEnergy: beforeIdentity.epb.energyRating,
    hmlrExactUprn: beforeHmlr.EXACT_UPRN,
    hmlrExactAddress: beforeHmlr.EXACT_CANONICAL_ADDRESS,
  };

  const capability = getEpbCapability(propertyIntelligenceConfig.providers.mhclgEpb);
  if (!capability.available) {
    console.log(JSON.stringify({
      REAL_BACKFILL_BLOCKED_BY_MISSING_EPBD_CREDENTIAL: true,
      before,
      after: null,
    }, null, 2));
    await pool.end();
    return;
  }

  const identityRows = (await pool.query('SELECT * FROM property_identities')).rows;
  const identityByProperty = new Map(identityRows.map((row) => [String(row.property_id), row]));

  const tallies = {
    UNAVAILABLE_MISSING_CREDENTIAL: 0,
    SOURCE_OUTSIDE_GEOGRAPHY: 0,
    GEOGRAPHY_NOT_ESTABLISHED: 0,
    INSUFFICIENT_IDENTITY: 0,
    UNRESOLVED_UNIT_IDENTITY: 0,
    NO_MATCH_FOUND: 0,
    MULTIPLE_SUBJECT_CANDIDATES: 0,
    MULTIPLE_UPRNS: 0,
    UNIQUE_ATTACH: 0,
    SOURCE_ERROR: 0,
    REUSED: 0,
    UNRESOLVED_IDENTITY: 0,
    searchAttempted: 0,
    uprnAcquired: 0,
    domestic: 0,
    nonDomestic: 0,
    floorArea: 0,
    energyRating: 0,
    physicalCharacteristics: 0,
    ageBand: 0,
  };
  const samples = [];

  for (const property of properties) {
    const stored = identityByProperty.get(String(property.id)) || {};
    const identity = extractCanonicalAddress({
      ...property,
      paon: stored.paon,
      saon: stored.saon,
      postcode: stored.postcode || property.zip_code,
      uprn: stored.uprn,
    });
    const result = await acquireOfficialEpbEvidence({
      property,
      identity,
      deps: { skipCoalesce: true },
    });
    if (result.searchAttempted) tallies.searchAttempted += 1;
    const status = result.status;
    const reason = result.reason;
    if (status === EPB_ATTACHMENT.UNIQUE_ATTACH || result.attachmentStatus === EPB_ATTACHMENT.REUSED) {
      if (result.attachmentStatus === EPB_ATTACHMENT.REUSED) tallies.REUSED += 1;
      tallies.UNIQUE_ATTACH += 1;
      if (result.uprn) tallies.uprnAcquired += 1;
      const type = result.currentCertificate?.certificateType || result.client?.certificateType;
      if (type === 'NON_DOMESTIC') tallies.nonDomestic += 1;
      else tallies.domestic += 1;
      if (result.client?.current?.floorAreaSqm) tallies.floorArea += 1;
      if (result.client?.current?.energyRating || result.client?.current?.energyBand) tallies.energyRating += 1;
      if (result.client?.current?.constructionAgeBand) tallies.ageBand += 1;
      const facts = result.currentCertificate?.facts || {};
      if (facts.wallDescription || facts.roofDescription || facts.windowDescription || facts.heatingDescription) {
        tallies.physicalCharacteristics += 1;
      }
      if (samples.length < 8) {
        samples.push({
          listingId: property.id,
          hasPaon: Boolean(identity.paon),
          hasSaon: Boolean(identity.saon),
          certificateNumberPresent: Boolean(result.client?.certificateNumber),
          hasUprn: Boolean(result.uprn),
          certificateType: type,
          status: result.status,
          historyCount: result.client?.historyCount || 0,
        });
      }
    } else if (status === EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY) {
      tallies.UNRESOLVED_UNIT_IDENTITY += 1;
    } else if (status === EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED) {
      tallies.GEOGRAPHY_NOT_ESTABLISHED += 1;
    } else if (status === EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY) {
      tallies.SOURCE_OUTSIDE_GEOGRAPHY += 1;
    } else if (status === EPB_ATTACHMENT.UNAVAILABLE_MISSING_CREDENTIAL) {
      tallies.UNAVAILABLE_MISSING_CREDENTIAL += 1;
    } else if (status === EPB_ATTACHMENT.SOURCE_ERROR) {
      tallies.SOURCE_ERROR += 1;
    } else if (status === EPB_ATTACHMENT.NO_MATCH_FOUND) {
      tallies.NO_MATCH_FOUND += 1;
    } else if (status === EPB_ATTACHMENT.UNRESOLVED_IDENTITY && reason === 'MULTIPLE_UPRNS') {
      tallies.MULTIPLE_UPRNS += 1;
    } else if (status === EPB_ATTACHMENT.UNRESOLVED_IDENTITY && reason === 'MULTIPLE_SUBJECTS') {
      tallies.MULTIPLE_SUBJECT_CANDIDATES += 1;
    } else if (status === EPB_ATTACHMENT.UNRESOLVED_IDENTITY && (reason === 'POSTCODE_ONLY' || reason === 'MISSING_POSTCODE')) {
      tallies.INSUFFICIENT_IDENTITY += 1;
    } else if (status === EPB_ATTACHMENT.UNRESOLVED_IDENTITY) {
      tallies.UNRESOLVED_IDENTITY += 1;
    } else {
      tallies.UNRESOLVED_IDENTITY += 1;
    }
  }

  const identitiesAfter = await pool.query('SELECT property_id, uprn, paon, saon, postcode FROM property_identities');
  const propertiesAfter = (await pool.query('SELECT * FROM properties ORDER BY id')).rows;
  propertiesAfter.forEach((row) => {
    const ident = identitiesAfter.rows.find((item) => String(item.property_id) === String(row.id));
    if (ident?.uprn) row.uprn = ident.uprn;
  });
  const afterIdentity = await identitySnapshot();
  const afterHmlr = await matchAll(propertiesAfter);

  console.log(JSON.stringify({
    REAL_BACKFILL_BLOCKED_BY_MISSING_EPBD_CREDENTIAL: false,
    before,
    after: {
      ...tallies,
      uprnCoverage: afterIdentity.uprn,
      officialEpcCoverage: afterIdentity.epb.propertiesWithEpb,
      officialFloorArea: afterIdentity.epb.floorArea,
      officialEnergyRating: afterIdentity.epb.energyRating,
      officialAgeBand: afterIdentity.epb.ageBand,
      officialPhysical: afterIdentity.epb.physical,
      hmlrExactUprn: afterHmlr.EXACT_UPRN,
      hmlrExactAddress: afterHmlr.EXACT_CANONICAL_ADDRESS,
    },
    safetySample: samples,
  }, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
