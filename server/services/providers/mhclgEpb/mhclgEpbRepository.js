/**
 * Persistence for official EPB certificates.
 * Idempotent on (property_id, certificate_number). Restricted addresses are never stored.
 */

const {
  EPB_SOURCE,
  EPB_SOURCE_GEOGRAPHY,
  stripRestrictedAddress,
  normalizeCertificateNumber,
} = require('../../../architecture/epbEvidenceContract');
const { attribution } = require('./mhclgEpbParser');

function jsonValue(value, fallback) {
  if (value == null) return JSON.stringify(fallback);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function createMemoryEpbStore() {
  const certificates = [];
  const runs = [];
  let certId = 1;
  let runId = 1;

  return {
    async listByProperty(propertyId) {
      return certificates.filter((row) => String(row.property_id) === String(propertyId));
    },
    async upsertCertificate(row) {
      const certificateNumber = normalizeCertificateNumber(row.certificateNumber);
      const existing = certificates.find(
        (item) => String(item.property_id) === String(row.propertyId)
          && item.certificate_number === certificateNumber
      );
      const facts = stripRestrictedAddress(row.facts || {});
      const next = {
        id: existing?.id || certId++,
        property_id: row.propertyId,
        certificate_number: certificateNumber,
        certificate_type: row.certificateType,
        uprn: row.uprn || null,
        uprn_source: row.uprnSource || null,
        inspection_date: row.inspectionDate || null,
        lodgement_date: row.lodgementDate || null,
        is_current: row.isCurrent === true,
        attachment_status: row.attachmentStatus,
        schema_type: row.schemaType || null,
        facts,
        provenance: row.provenance || attribution(),
        limitations: row.limitations || [],
        retrieved_at: row.retrievedAt || new Date().toISOString(),
        source: EPB_SOURCE,
        source_geography: EPB_SOURCE_GEOGRAPHY,
      };
      if (existing) {
        Object.assign(existing, next, { id: existing.id });
        return existing;
      }
      certificates.push(next);
      return next;
    },
    async markCurrent(propertyId, certificateNumber) {
      certificates.forEach((row) => {
        if (String(row.property_id) === String(propertyId)) {
          row.is_current = row.certificate_number === normalizeCertificateNumber(certificateNumber);
        }
      });
    },
    async recordRun(row) {
      const next = {
        id: runId++,
        property_id: row.propertyId || null,
        status: row.status,
        attachment_status: row.attachmentStatus,
        search_attempted: row.searchAttempted === true,
        cache_hit: row.cacheHit === true,
        candidate_count: row.candidateCount ?? null,
        unique_attach: row.uniqueAttach === true,
        certificate_refresh: row.certificateRefresh === true,
        error_code: row.errorCode || null,
        retrieved_at: row.retrievedAt || new Date().toISOString(),
        payload: row.payload || {},
      };
      runs.push(next);
      return next;
    },
    _certificates: certificates,
    _runs: runs,
  };
}

function createPostgresEpbStore(pool) {
  return {
    async listByProperty(propertyId) {
      const result = await pool.query(
        `SELECT * FROM official_epb_certificates
         WHERE property_id = $1
         ORDER BY lodgement_date DESC NULLS LAST, retrieved_at DESC`,
        [propertyId]
      );
      return result.rows;
    },
    async upsertCertificate(row) {
      const certificateNumber = normalizeCertificateNumber(row.certificateNumber);
      const result = await pool.query(
        `INSERT INTO official_epb_certificates (
           property_id, certificate_number, certificate_type, uprn, uprn_source,
           inspection_date, lodgement_date, is_current, attachment_status, schema_type,
           facts, provenance, limitations, retrieved_at, source, source_geography, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, CURRENT_TIMESTAMP
         )
         ON CONFLICT (property_id, certificate_number) DO UPDATE SET
           certificate_type = EXCLUDED.certificate_type,
           uprn = COALESCE(EXCLUDED.uprn, official_epb_certificates.uprn),
           uprn_source = COALESCE(EXCLUDED.uprn_source, official_epb_certificates.uprn_source),
           inspection_date = COALESCE(EXCLUDED.inspection_date, official_epb_certificates.inspection_date),
           lodgement_date = COALESCE(EXCLUDED.lodgement_date, official_epb_certificates.lodgement_date),
           is_current = EXCLUDED.is_current,
           attachment_status = EXCLUDED.attachment_status,
           schema_type = COALESCE(EXCLUDED.schema_type, official_epb_certificates.schema_type),
           facts = EXCLUDED.facts,
           provenance = EXCLUDED.provenance,
           limitations = EXCLUDED.limitations,
           retrieved_at = EXCLUDED.retrieved_at,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          row.propertyId,
          certificateNumber,
          row.certificateType,
          row.uprn || null,
          row.uprnSource || null,
          row.inspectionDate || null,
          row.lodgementDate || null,
          row.isCurrent === true,
          row.attachmentStatus,
          row.schemaType || null,
          jsonValue(stripRestrictedAddress(row.facts || {}), {}),
          jsonValue(row.provenance || attribution(), {}),
          jsonValue(row.limitations || [], []),
          row.retrievedAt || new Date().toISOString(),
          EPB_SOURCE,
          EPB_SOURCE_GEOGRAPHY,
        ]
      );
      return result.rows[0];
    },
    async markCurrent(propertyId, certificateNumber) {
      await pool.query(
        `UPDATE official_epb_certificates
         SET is_current = (certificate_number = $2), updated_at = CURRENT_TIMESTAMP
         WHERE property_id = $1`,
        [propertyId, normalizeCertificateNumber(certificateNumber)]
      );
    },
    async recordRun(row) {
      try {
        const result = await pool.query(
          `INSERT INTO official_epb_acquisition_runs (
             property_id, status, attachment_status, search_attempted, cache_hit,
             candidate_count, unique_attach, certificate_refresh, error_code, retrieved_at, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
           RETURNING *`,
          [
            row.propertyId || null,
            row.status,
            row.attachmentStatus,
            row.searchAttempted === true,
            row.cacheHit === true,
            row.candidateCount ?? null,
            row.uniqueAttach === true,
            row.certificateRefresh === true,
            row.errorCode || null,
            row.retrievedAt || new Date().toISOString(),
            jsonValue(row.payload || {}, {}),
          ]
        );
        return result.rows[0];
      } catch {
        return null;
      }
    },
  };
}

module.exports = {
  createMemoryEpbStore,
  createPostgresEpbStore,
};
