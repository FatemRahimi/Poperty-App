/**
 * Controlled listing identity backfill.
 * Default: listing-field canonicalisation only (no paid provider).
 * Optional: --paid-uprn for unique PropertyData UPRN resolution.
 *
 * Usage:
 *   node scripts/enrich-listing-identity.js
 *   node scripts/enrich-listing-identity.js --paid-uprn
 *   node scripts/enrich-listing-identity.js --property-id=145
 */
require('dotenv').config();
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { extractCanonicalAddress } = require('../services/identity/canonicalAddress');
const { persistListingCanonicalIdentity } = require('../services/identity/canonicalIdentityService');
const { resolvePropertyIdentity } = require('../services/enrichment/propertyEnrichmentService');
const { queryOfficialSaleTransactions } = require('../services/market/officialSaleTransactionQuery');
const { MATCH_METHOD, IMPORT_STATUS } = require('../architecture/officialSaleTransaction');

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function countBy(rows, key) {
  const out = {};
  rows.forEach((row) => {
    const value = row[key] || 'null';
    out[value] = (out[value] || 0) + 1;
  });
  return out;
}

async function loadProperties(propertyId) {
  const result = propertyId
    ? await pool.query('SELECT * FROM properties WHERE id = $1', [propertyId])
    : await pool.query('SELECT * FROM properties ORDER BY id');
  return result.rows;
}

async function identitySnapshot() {
  const properties = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE zip_code IS NOT NULL AND BTRIM(zip_code) <> '')::int AS postcode
    FROM properties
  `);
  const identities = await pool.query(`
    SELECT
      COUNT(*)::int AS identity_rows,
      COUNT(*) FILTER (WHERE uprn IS NOT NULL AND BTRIM(uprn) <> '')::int AS uprn,
      COUNT(*) FILTER (WHERE paon IS NOT NULL AND BTRIM(paon) <> '')::int AS paon,
      COUNT(*) FILTER (WHERE saon IS NOT NULL AND BTRIM(saon) <> '')::int AS saon,
      COUNT(*) FILTER (WHERE identity_state = 'VERIFIED_EXACT')::int AS verified_exact,
      COUNT(*) FILTER (WHERE identity_state = 'SOURCE_ASSERTED')::int AS source_asserted,
      COUNT(*) FILTER (WHERE identity_state = 'USER_DECLARED')::int AS user_declared,
      COUNT(*) FILTER (WHERE identity_state = 'INFERRED')::int AS inferred,
      COUNT(*) FILTER (WHERE identity_state = 'UNRESOLVED' OR identity_state IS NULL)::int AS unresolved
    FROM property_identities
  `);
  return { ...properties.rows[0], ...identities.rows[0] };
}

async function matchAll(properties) {
  const tallies = {
    EXACT_UPRN: 0,
    EXACT_CANONICAL_ADDRESS: 0,
    AREA_POSTCODE: 0,
    NO_TRANSACTIONS_FOUND: 0,
    SOURCE_OUTSIDE_GEOGRAPHY: 0,
    UNRESOLVED_IDENTITY: 0,
    NO_MATCH: 0,
  };
  const exactSamples = [];
  for (const property of properties) {
    const listing = extractCanonicalAddress(property);
    const ident = await pool.query('SELECT * FROM property_identities WHERE property_id = $1', [property.id]);
    const row = ident.rows[0] || {};
    const identity = {
      listingId: property.id,
      uprn: row.uprn || null,
      paon: row.paon || listing.paon,
      saon: row.saon || listing.saon,
      postcode: row.postcode || listing.postcode,
      verificationState: row.verification_state || listing.verificationState,
    };
    if (!identity.uprn && !identity.paon) tallies.UNRESOLVED_IDENTITY += 1;
    const result = await queryOfficialSaleTransactions({ identity, property });
    if (result.matchMethod === MATCH_METHOD.EXACT_UPRN) tallies.EXACT_UPRN += 1;
    else if (result.matchMethod === MATCH_METHOD.EXACT_CANONICAL_ADDRESS) {
      tallies.EXACT_CANONICAL_ADDRESS += 1;
    } else if (result.status === IMPORT_STATUS.SOURCE_OUTSIDE_GEOGRAPHY) {
      tallies.SOURCE_OUTSIDE_GEOGRAPHY += 1;
    } else if (result.status === IMPORT_STATUS.NO_TRANSACTIONS_FOUND) {
      tallies.NO_TRANSACTIONS_FOUND += 1;
    } else if (result.status === IMPORT_STATUS.NO_MATCH) {
      tallies.AREA_POSTCODE += 1;
      tallies.NO_MATCH += 1;
    }
    if (
      result.matchMethod === MATCH_METHOD.EXACT_UPRN
      || result.matchMethod === MATCH_METHOD.EXACT_CANONICAL_ADDRESS
    ) {
      exactSamples.push({
        propertyId: property.id,
        sourceAddress: {
          house_number: property.house_number,
          address_line1: property.address_line1,
          zip_code: property.zip_code,
        },
        canonical: {
          paon: identity.paon,
          saon: identity.saon,
          postcode: identity.postcode,
          uprn: identity.uprn,
        },
        matchMethod: result.matchMethod,
        transactions: (result.subjectTransactions || []).slice(0, 8).map((tx) => ({
          id: tx.source_transaction_id,
          date: tx.transfer_date,
          price: tx.price_gbp,
          paon: tx.paon,
          saon: tx.saon,
          postcode: tx.postcode,
          uprn: tx.uprn,
        })),
      });
    }
  }
  return { tallies, exactSamples };
}

async function run() {
  const paid = argFlag('--paid-uprn');
  const propertyId = argValue('--property-id');
  await ensureIntelligenceSchema();
  const before = await identitySnapshot();
  const properties = await loadProperties(propertyId ? Number(propertyId) : null);
  const results = [];
  for (const property of properties) {
    try {
      if (paid) {
        const resolved = await resolvePropertyIdentity(property, {
          allowPaidIdentity: true,
          userId: property.user_id,
        });
        results.push({
          id: property.id,
          ok: true,
          uprn: resolved.identity?.uprn || null,
          paon: resolved.identity?.paon || null,
          state: resolved.identity?.identity_state || resolved.identity?.verificationState || null,
          paidSkipped: resolved.paidSkipped || false,
          unresolved: Boolean(resolved.unresolved),
        });
      } else {
        const persisted = await persistListingCanonicalIdentity(property);
        results.push({
          id: property.id,
          ok: persisted.success,
          uprn: persisted.identity?.uprn || null,
          paon: persisted.identity?.paon || persisted.identity?.paon || null,
          state: persisted.identity?.identity_state || persisted.identity?.identityState || null,
        });
      }
    } catch (err) {
      results.push({ id: property.id, ok: false, error: err.message });
    }
  }
  const after = await identitySnapshot();
  const matching = await matchAll(properties);
  const report = {
    mode: paid ? 'listing_fields_plus_unique_uprn' : 'listing_fields_only',
    before,
    after,
    processed: results.length,
    failed: results.filter((row) => !row.ok).length,
    hmlr: matching.tallies,
    exactSamples: matching.exactSamples,
    identityStates: countBy(results, 'state'),
  };
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
