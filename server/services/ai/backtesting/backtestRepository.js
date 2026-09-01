/**
 * Load backtesting inputs from the database.
 * Current enrichments are outcome candidates only (transaction date > T).
 * They are never treated as historical prediction evidence.
 */

const { parseUprnProfile } = require('../../providers/propertyData/propertyDataParsers');
const { extractListingOutcomes, extractTransactionOutcome } = require('./backtestFoundation');

async function tableExists(pool, table) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rows.length > 0;
}

async function columnExists(pool, table, column) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rows.length > 0;
}

async function auditSchema(pool) {
  const tables = {};
  for (const table of [
    'ai_requests',
    'properties',
    'listing_events',
    'property_identities',
    'property_enrichments',
    'intelligence_subjects',
  ]) {
    tables[table] = await tableExists(pool, table);
  }
  const columns = {};
  if (tables.properties) {
    for (const col of [
      'achieved_price',
      'achieved_rent',
      'sold_at',
      'let_at',
      'first_published_at',
      'updated_at',
      'created_at',
      'price',
      'monthly_rent',
    ]) {
      columns[`properties.${col}`] = await columnExists(pool, 'properties', col);
    }
  }
  if (tables.ai_requests) {
    for (const col of ['output_data', 'property_id', 'subject_id', 'created_at', 'confidence_level']) {
      columns[`ai_requests.${col}`] = await columnExists(pool, 'ai_requests', col);
    }
  }
  return { tables, columns };
}

async function loadSnapshots(pool) {
  if (!(await tableExists(pool, 'ai_requests'))) return [];
  const hasSubject = await columnExists(pool, 'ai_requests', 'subject_id');
  const hasLevel = await columnExists(pool, 'ai_requests', 'confidence_level');
  const extra = [hasSubject ? 'subject_id' : null, hasLevel ? 'confidence_level' : null]
    .filter(Boolean)
    .map((c) => `, ${c}`)
    .join('');
  const result = await pool.query(
    `SELECT id, property_id, created_at, model_version, confidence, data_quality, output_data${extra}
     FROM ai_requests
     WHERE request_type = 'property_intelligence' AND status = 'completed'
     ORDER BY created_at ASC`
  );
  return result.rows.map((row) => ({
    id: row.id,
    property_id: row.property_id,
    subject_id: row.subject_id ?? null,
    created_at: row.created_at,
    model_version: row.model_version,
    output_data: row.output_data,
    confidence_level: row.confidence_level ?? null,
  }));
}

async function loadListingOutcomes(pool) {
  if (!(await tableExists(pool, 'properties'))) return [];
  const hasAchievedPrice = await columnExists(pool, 'properties', 'achieved_price');
  const hasSoldAt = await columnExists(pool, 'properties', 'sold_at');
  const hasAchievedRent = await columnExists(pool, 'properties', 'achieved_rent');
  const hasLetAt = await columnExists(pool, 'properties', 'let_at');
  if (!hasAchievedPrice && !hasAchievedRent) return [];

  const hasIdentities = await tableExists(pool, 'property_identities');
  const sql = `
    SELECT p.id,
           ${hasAchievedPrice ? 'p.achieved_price' : 'NULL::numeric AS achieved_price'},
           ${hasAchievedRent ? 'p.achieved_rent' : 'NULL::numeric AS achieved_rent'},
           ${hasSoldAt ? 'p.sold_at' : 'NULL::timestamp AS sold_at'},
           ${hasLetAt ? 'p.let_at' : 'NULL::timestamp AS let_at'}
           ${hasIdentities ? ', i.uprn' : ', NULL::text AS uprn'}
    FROM properties p
    ${hasIdentities ? 'LEFT JOIN property_identities i ON i.property_id = p.id' : ''}
  `;
  const result = await pool.query(sql);
  return result.rows.flatMap((row) => extractListingOutcomes(row));
}

function transactionsFromEnrichmentRow(row) {
  if (row.enrichment_type && row.enrichment_type !== 'uprn_profile') return [];
  const payload = row.payload || {};
  const listingId = row.property_id || null;
  const parsed = parseUprnProfile(payload);
  const uprn = parsed.uprn || row.uprn || null;
  const last = extractTransactionOutcome({
    uprn,
    listingId,
    price: parsed.lastSoldPrice,
    date: parsed.lastSoldDate,
    source: 'hmlr_via_propertydata',
    provider: 'PropertyData',
  });
  return last ? [last] : [];
}

async function loadTransactionOutcomes(pool) {
  if (!(await tableExists(pool, 'property_enrichments'))) return [];
  const hasSubject = await columnExists(pool, 'property_enrichments', 'subject_id');
  const hasIdentities = await tableExists(pool, 'property_identities');
  const hasSubjects = await tableExists(pool, 'intelligence_subjects');
  const result = await pool.query(
    `SELECT e.property_id, e.payload, e.enrichment_type
            ${hasSubject ? ', e.subject_id' : ''}
     FROM property_enrichments e
     WHERE e.enrichment_type = 'uprn_profile'`
  );
  const identityUprn = new Map();
  if (hasIdentities) {
    const ids = await pool.query(
      `SELECT property_id, uprn FROM property_identities WHERE uprn IS NOT NULL`
    );
    ids.rows.forEach((r) => identityUprn.set(r.property_id, String(r.uprn)));
  }
  if (hasSubjects && hasSubject) {
    const subs = await pool.query(
      `SELECT id, uprn, property_id FROM intelligence_subjects WHERE uprn IS NOT NULL`
    );
    subs.rows.forEach((r) => {
      if (r.property_id) identityUprn.set(r.property_id, String(r.uprn));
    });
  }
  return result.rows.flatMap((row) =>
    transactionsFromEnrichmentRow({
      ...row,
      uprn: identityUprn.get(row.property_id) || null,
    })
  );
}

async function countListingEvents(pool) {
  if (!(await tableExists(pool, 'listing_events'))) {
    return { available: false, byType: {} };
  }
  const result = await pool.query(
    `SELECT event_type, COUNT(*)::int AS count
     FROM listing_events
     GROUP BY event_type`
  );
  const byType = {};
  result.rows.forEach((r) => {
    byType[r.event_type] = r.count;
  });
  return { available: true, byType };
}

async function loadListingsForCollection(pool) {
  if (!(await tableExists(pool, 'properties'))) return [];
  const result = await pool.query(`
    SELECT id, category, status,
           first_published_at, sold_at, let_at, under_offer_at, withdrawn_at,
           achieved_price, achieved_rent, price
    FROM properties
  `);
  return result.rows;
}

async function loadBacktestDataset(pool) {
  const schema = await auditSchema(pool);
  const snapshots = schema.tables.ai_requests ? await loadSnapshots(pool) : [];
  const listingOutcomes = schema.tables.properties ? await loadListingOutcomes(pool) : [];
  const transactions = schema.tables.property_enrichments
    ? await loadTransactionOutcomes(pool)
    : [];
  const listingEvents = await countListingEvents(pool);
  const genuineSaleOutcomes = [
    ...listingOutcomes.filter((o) => o.kind === 'sale'),
    ...transactions,
  ];
  const genuineRentOutcomes = listingOutcomes.filter((o) => o.kind === 'rent');

  return {
    schema,
    snapshots,
    outcomes: [...listingOutcomes, ...transactions],
    audit: {
      historicalPredictionSnapshots: snapshots.length,
      genuineSaleOutcomes: genuineSaleOutcomes.length,
      genuineRentalOutcomes: genuineRentOutcomes.length,
      firstPartySaleOutcomes: listingOutcomes.filter((o) => o.kind === 'sale').length,
      firstPartyRentOutcomes: genuineRentOutcomes.length,
      uprnLinkedTransactions: transactions.length,
      listingEvents,
    },
  };
}

module.exports = {
  auditSchema,
  loadSnapshots,
  loadListingOutcomes,
  loadTransactionOutcomes,
  loadBacktestDataset,
  loadListingsForCollection,
  countListingEvents,
};
