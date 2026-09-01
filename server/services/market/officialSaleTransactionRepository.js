/**
 * Persistence for official sale transactions.
 * Offline ingest only. Idempotent upserts by source + source transaction id.
 */

const pool = require('../../models/db');

const UPSERT_SQL = `
INSERT INTO official_sale_transactions (
  source, source_transaction_id, record_status, live, price_gbp, price_present,
  transfer_date, postcode, postcode_compact, property_type_code, new_build_indicator,
  tenure_code, paon, saon, street, locality, town_city, district, county, category_type,
  uprn, inspire_id, match_method, dataset_version, retrieved_at, evidence_as_of,
  provenance, limitations
) VALUES (
  $1,$2,$3,$4,$5,$6,
  $7,$8,$9,$10,$11,
  $12,$13,$14,$15,$16,$17,$18,$19,$20,
  $21,$22,$23,$24,$25,$26,
  $27::jsonb,$28::jsonb
)
ON CONFLICT (source, source_transaction_id) DO UPDATE SET
  record_status = EXCLUDED.record_status,
  live = EXCLUDED.live,
  price_gbp = EXCLUDED.price_gbp,
  price_present = EXCLUDED.price_present,
  transfer_date = EXCLUDED.transfer_date,
  postcode = EXCLUDED.postcode,
  postcode_compact = EXCLUDED.postcode_compact,
  property_type_code = EXCLUDED.property_type_code,
  new_build_indicator = EXCLUDED.new_build_indicator,
  tenure_code = EXCLUDED.tenure_code,
  paon = EXCLUDED.paon,
  saon = EXCLUDED.saon,
  street = EXCLUDED.street,
  locality = EXCLUDED.locality,
  town_city = EXCLUDED.town_city,
  district = EXCLUDED.district,
  county = EXCLUDED.county,
  category_type = EXCLUDED.category_type,
  uprn = COALESCE(EXCLUDED.uprn, official_sale_transactions.uprn),
  inspire_id = COALESCE(EXCLUDED.inspire_id, official_sale_transactions.inspire_id),
  match_method = COALESCE(EXCLUDED.match_method, official_sale_transactions.match_method),
  dataset_version = COALESCE(EXCLUDED.dataset_version, official_sale_transactions.dataset_version),
  retrieved_at = COALESCE(EXCLUDED.retrieved_at, official_sale_transactions.retrieved_at),
  evidence_as_of = EXCLUDED.evidence_as_of,
  provenance = EXCLUDED.provenance,
  limitations = EXCLUDED.limitations,
  imported_at = CURRENT_TIMESTAMP
RETURNING (xmax = 0) AS inserted
`;

function paramsFromRow(row) {
  return [
    row.source,
    row.source_transaction_id,
    row.record_status || null,
    row.live !== false,
    row.price_gbp,
    row.price_present === true,
    row.transfer_date,
    row.postcode,
    row.postcode_compact,
    row.property_type_code,
    row.new_build_indicator,
    row.tenure_code,
    row.paon,
    row.saon,
    row.street,
    row.locality,
    row.town_city,
    row.district,
    row.county,
    row.category_type,
    row.uprn || null,
    row.inspire_id || null,
    row.match_method || null,
    row.dataset_version || null,
    row.retrieved_at || null,
    row.evidence_as_of || row.transfer_date || null,
    JSON.stringify(row.provenance || {}),
    JSON.stringify(row.limitations || []),
  ];
}

function createMemoryOfficialSaleStore() {
  const byId = new Map();
  const runs = [];
  return {
    kind: 'memory',
    async upsertBatch(rows = []) {
      let inserted = 0;
      let updated = 0;
      rows.forEach((row) => {
        const key = `${row.source}:${row.source_transaction_id}`;
        const existing = byId.get(key);
        if (existing) {
          byId.set(key, {
            ...existing,
            ...row,
            uprn: row.uprn || existing.uprn,
            inspire_id: row.inspire_id || existing.inspire_id,
            live: row.live !== false,
          });
          updated += 1;
        } else {
          byId.set(key, { ...row, live: row.live !== false, id: byId.size + 1 });
          inserted += 1;
        }
      });
      return { inserted, updated, unchanged: 0 };
    },
    async applyLookups(kind, pairs = []) {
      let matched = 0;
      pairs.forEach(({ sourceTransactionId, value }) => {
        const row = [...byId.values()].find((item) => item.source_transaction_id === sourceTransactionId);
        if (!row || !value) return;
        if (!row.lookup_links) row.lookup_links = { uprn: [], inspire: [] };
        const bucket = kind === 'inspire' ? row.lookup_links.inspire : row.lookup_links.uprn;
        if (!bucket.includes(value)) bucket.push(value);
        if (kind === 'uprn') {
          row.uprn_ids = row.lookup_links.uprn.slice();
          row.uprn = row.uprn_ids.length === 1 ? row.uprn_ids[0] : null;
        }
        if (kind === 'inspire') {
          row.inspire_ids = row.lookup_links.inspire.slice();
          row.inspire_id = row.inspire_ids.length === 1 ? row.inspire_ids[0] : null;
        }
        matched += 1;
      });
      return matched;
    },
    async markDeleted(ids = []) {
      let deleted = 0;
      ids.forEach((id) => {
        const row = [...byId.values()].find((item) => item.source_transaction_id === id);
        if (!row) return;
        row.live = false;
        row.record_status = 'D';
        deleted += 1;
      });
      return deleted;
    },
    async startImportRun(meta = {}) {
      const run = { id: runs.length + 1, status: 'STARTED', ...meta, started_at: new Date().toISOString() };
      runs.push(run);
      return run;
    },
    async finishImportRun(id, stats = {}) {
      const run = runs.find((item) => item.id === id);
      if (run) Object.assign(run, stats, { finished_at: new Date().toISOString() });
      return run;
    },
    async latestRun() {
      return runs.length ? runs[runs.length - 1] : null;
    },
    async latestSuccessfulRun() {
      return [...runs].reverse().find((item) => item.status === 'SUCCEEDED') || null;
    },
    async findLiveByUprn(uprn) {
      if (!uprn) return [];
      return [...byId.values()].filter((row) => row.live !== false && row.uprn === String(uprn));
    },
    async findLiveByExactAddress(postcodeCompact, paon, saon) {
      if (!postcodeCompact || !paon) return [];
      const saonKey = saon || null;
      return [...byId.values()].filter((row) => (
        row.live !== false
        && row.postcode_compact === postcodeCompact
        && String(row.paon || '').toUpperCase() === String(paon).toUpperCase()
        && (saonKey == null
          ? !row.saon
          : String(row.saon || '').toUpperCase() === String(saonKey).toUpperCase())
      ));
    },
    async findLiveByPostcode(postcodeCompact, { limit = 25 } = {}) {
      if (!postcodeCompact) return [];
      return [...byId.values()]
        .filter((row) => row.live !== false && row.postcode_compact === postcodeCompact)
        .sort((a, b) => String(b.transfer_date || '').localeCompare(String(a.transfer_date || '')))
        .slice(0, limit);
    },
    snapshot() {
      return [...byId.values()];
    },
  };
}

function buildBatchUpsertSql(rowCount) {
  const cols = 28;
  const values = [];
  for (let i = 0; i < rowCount; i += 1) {
    const offset = i * cols;
    const placeholders = [];
    for (let j = 1; j <= cols; j += 1) placeholders.push(`$${offset + j}`);
    values.push(`(${placeholders.join(',')})`);
  }
  return `
INSERT INTO official_sale_transactions (
  source, source_transaction_id, record_status, live, price_gbp, price_present,
  transfer_date, postcode, postcode_compact, property_type_code, new_build_indicator,
  tenure_code, paon, saon, street, locality, town_city, district, county, category_type,
  uprn, inspire_id, match_method, dataset_version, retrieved_at, evidence_as_of,
  provenance, limitations
) VALUES ${values.join(',')}
ON CONFLICT (source, source_transaction_id) DO UPDATE SET
  record_status = EXCLUDED.record_status,
  live = EXCLUDED.live,
  price_gbp = EXCLUDED.price_gbp,
  price_present = EXCLUDED.price_present,
  transfer_date = EXCLUDED.transfer_date,
  postcode = EXCLUDED.postcode,
  postcode_compact = EXCLUDED.postcode_compact,
  property_type_code = EXCLUDED.property_type_code,
  new_build_indicator = EXCLUDED.new_build_indicator,
  tenure_code = EXCLUDED.tenure_code,
  paon = EXCLUDED.paon,
  saon = EXCLUDED.saon,
  street = EXCLUDED.street,
  locality = EXCLUDED.locality,
  town_city = EXCLUDED.town_city,
  district = EXCLUDED.district,
  county = EXCLUDED.county,
  category_type = EXCLUDED.category_type,
  uprn = COALESCE(EXCLUDED.uprn, official_sale_transactions.uprn),
  inspire_id = COALESCE(EXCLUDED.inspire_id, official_sale_transactions.inspire_id),
  match_method = COALESCE(EXCLUDED.match_method, official_sale_transactions.match_method),
  dataset_version = COALESCE(EXCLUDED.dataset_version, official_sale_transactions.dataset_version),
  retrieved_at = COALESCE(EXCLUDED.retrieved_at, official_sale_transactions.retrieved_at),
  evidence_as_of = EXCLUDED.evidence_as_of,
  provenance = EXCLUDED.provenance,
  limitations = EXCLUDED.limitations,
  imported_at = CURRENT_TIMESTAMP
RETURNING (xmax = 0) AS inserted`;
}

function createPostgresOfficialSaleStore(db = pool) {
  const store = {
    kind: 'postgres',
    async upsertBatch(rows = []) {
      if (!rows.length) return { inserted: 0, updated: 0, unchanged: 0 };
      const params = [];
      rows.forEach((row) => params.push(...paramsFromRow(row)));
      const result = await db.query(buildBatchUpsertSql(rows.length), params);
      let inserted = 0;
      (result.rows || []).forEach((item) => {
        if (item.inserted) inserted += 1;
      });
      return { inserted, updated: (result.rows || []).length - inserted, unchanged: 0 };
    },
    async applyLookups(kind, pairs = []) {
      if (!pairs.length) return 0;
      const linkKind = kind === 'inspire' ? 'inspire' : 'uprn';
      let matched = 0;
      for (let i = 0; i < pairs.length; i += 200) {
        const chunk = pairs.slice(i, i + 200);
        const ids = chunk.map((item) => item.sourceTransactionId);
        const values = chunk.map((item) => item.value);
        const inserted = await db.query(
          `INSERT INTO official_sale_lookup_links (source, source_transaction_id, kind, identifier)
           SELECT 'HMLR_PRICE_PAID_DATA', data.id, $3, data.value
           FROM unnest($1::text[], $2::text[]) AS data(id, value)
           ON CONFLICT (source, source_transaction_id, kind, identifier) DO NOTHING`,
          [ids, values, linkKind]
        );
        matched += inserted.rowCount || 0;
        if (linkKind === 'uprn') {
          await db.query(
            `UPDATE official_sale_transactions AS t
             SET uprn = data.value
             FROM unnest($1::text[], $2::text[]) AS data(id, value)
             WHERE t.source = 'HMLR_PRICE_PAID_DATA'
               AND t.source_transaction_id = data.id`,
            [ids, values]
          );
        }
      }
      if (linkKind === 'inspire') {
        const txIds = [...new Set(pairs.map((item) => item.sourceTransactionId))];
        for (let i = 0; i < txIds.length; i += 500) {
          const chunk = txIds.slice(i, i + 500);
          await db.query(
            `UPDATE official_sale_transactions AS t
             SET inspire_id = CASE WHEN c.n = 1 THEN c.one_id ELSE NULL END
             FROM (
               SELECT source_transaction_id, COUNT(*)::int AS n, MIN(identifier) AS one_id
               FROM official_sale_lookup_links
               WHERE source = 'HMLR_PRICE_PAID_DATA'
                 AND kind = 'inspire'
                 AND source_transaction_id = ANY($1::text[])
               GROUP BY source_transaction_id
             ) c
             WHERE t.source = 'HMLR_PRICE_PAID_DATA'
               AND t.source_transaction_id = c.source_transaction_id`,
            [chunk]
          );
        }
      }
      return matched;
    },
    async attachLookupIds(rows = []) {
      if (!rows.length) return rows;
      const ids = rows.map((row) => row.source_transaction_id);
      const result = await db.query(
        `SELECT source_transaction_id, kind, identifier
         FROM official_sale_lookup_links
         WHERE source = 'HMLR_PRICE_PAID_DATA'
           AND source_transaction_id = ANY($1::text[])
         ORDER BY identifier`,
        [ids]
      );
      const byTx = new Map();
      result.rows.forEach((link) => {
        if (!byTx.has(link.source_transaction_id)) {
          byTx.set(link.source_transaction_id, { uprn: [], inspire: [] });
        }
        const bucket = link.kind === 'inspire' ? 'inspire' : 'uprn';
        byTx.get(link.source_transaction_id)[bucket].push(link.identifier);
      });
      rows.forEach((row) => {
        const links = byTx.get(row.source_transaction_id) || { uprn: [], inspire: [] };
        row.uprn_ids = links.uprn;
        row.inspire_ids = links.inspire;
        if (links.uprn.length === 1) row.uprn = links.uprn[0];
        row.inspire_id = links.inspire.length === 1 ? links.inspire[0] : null;
      });
      return rows;
    },
    async markDeleted(ids = []) {
      if (!ids.length) return 0;
      const result = await db.query(
        `UPDATE official_sale_transactions
         SET live = false, record_status = 'D'
         WHERE source = 'HMLR_PRICE_PAID_DATA'
           AND source_transaction_id = ANY($1::text[])`,
        [ids]
      );
      return result.rowCount || 0;
    },
    async startImportRun(meta = {}) {
      const result = await db.query(
        `INSERT INTO official_sale_import_runs
          (source, release_label, ppd_path, uprn_path, inspire_path, status)
         VALUES ('HMLR_PRICE_PAID_DATA', $1, $2, $3, $4, 'STARTED')
         RETURNING *`,
        [meta.release_label || null, meta.ppd_path || null, meta.uprn_path || null, meta.inspire_path || null]
      );
      return result.rows[0];
    },
    async finishImportRun(id, stats = {}) {
      const result = await db.query(
        `UPDATE official_sale_import_runs SET
           status = $2,
           rows_processed = $3,
           inserted_count = $4,
           updated_count = $5,
           unchanged_count = $6,
           deleted_count = $7,
           rejected_count = $8,
           invalid_count = $9,
           uprn_matched_count = $10,
           inspire_matched_count = $11,
           failure_reason = $12,
           finished_at = CURRENT_TIMESTAMP,
           duration_ms = $13
         WHERE id = $1
         RETURNING *`,
        [
          id,
          stats.status || 'SUCCEEDED',
          stats.rows_processed || 0,
          stats.inserted_count || 0,
          stats.updated_count || 0,
          stats.unchanged_count || 0,
          stats.deleted_count || 0,
          stats.rejected_count || 0,
          stats.invalid_count || 0,
          stats.uprn_matched_count || 0,
          stats.inspire_matched_count || 0,
          stats.failure_reason || null,
          stats.duration_ms || null,
        ]
      );
      return result.rows[0] || null;
    },
    async latestRun() {
      const result = await db.query(
        `SELECT * FROM official_sale_import_runs
         ORDER BY id DESC
         LIMIT 1`
      );
      return result.rows[0] || null;
    },
    async latestSuccessfulRun() {
      const result = await db.query(
        `SELECT * FROM official_sale_import_runs
         WHERE status = 'SUCCEEDED'
         ORDER BY finished_at DESC NULLS LAST
         LIMIT 1`
      );
      return result.rows[0] || null;
    },
    async findLiveByUprn(uprn) {
      if (!uprn) return [];
      const result = await db.query(
        `SELECT t.*
         FROM official_sale_transactions t
         WHERE t.live
           AND (
             t.uprn = $1
             OR EXISTS (
               SELECT 1 FROM official_sale_lookup_links l
               WHERE l.source = t.source
                 AND l.source_transaction_id = t.source_transaction_id
                 AND l.kind = 'uprn'
                 AND l.identifier = $1
             )
           )
         ORDER BY t.transfer_date DESC NULLS LAST`,
        [String(uprn)]
      );
      return store.attachLookupIds(result.rows);
    },
    async findLiveByExactAddress(postcodeCompact, paon, saon) {
      if (!postcodeCompact || !paon) return [];
      const result = await db.query(
        `SELECT * FROM official_sale_transactions
         WHERE live
           AND postcode_compact = $1
           AND UPPER(paon) = UPPER($2)
           AND (($3::text IS NULL AND (saon IS NULL OR saon = ''))
                OR UPPER(COALESCE(saon, '')) = UPPER($3))
         ORDER BY transfer_date DESC NULLS LAST`,
        [postcodeCompact, paon, saon || null]
      );
      return store.attachLookupIds(result.rows);
    },
    async findLiveByPostcode(postcodeCompact, { limit = 25 } = {}) {
      if (!postcodeCompact) return [];
      const result = await db.query(
        `SELECT * FROM official_sale_transactions
         WHERE live AND postcode_compact = $1
         ORDER BY transfer_date DESC NULLS LAST
         LIMIT $2`,
        [postcodeCompact, limit]
      );
      return store.attachLookupIds(result.rows);
    },
  };
  return store;
}

module.exports = {
  createMemoryOfficialSaleStore,
  createPostgresOfficialSaleStore,
  UPSERT_SQL,
  buildBatchUpsertSql,
};
