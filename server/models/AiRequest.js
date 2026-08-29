const pool = require('./db');

const columnCache = new Map();

async function hasColumn(column) {
  if (columnCache.has(column)) return columnCache.get(column);
  let present = false;
  try {
    const result = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ai_requests' AND column_name = $1`,
      [column]
    );
    present = result.rows.length > 0;
  } catch {
    present = false;
  }
  columnCache.set(column, present);
  return present;
}

const hasSubjectIdColumn = () => hasColumn('subject_id');
const hasConfidenceLevelColumn = () => hasColumn('confidence_level');

/**
 * Field contract for every analysis record and API response:
 *
 *   confidence / confidenceIndex — internal numeric ordering index, or null.
 *                                  Never a percentage, never an accuracy figure.
 *   confidenceLevel              — one of CONFIDENCE_STATES, or null if unknown.
 *   dataQuality                  — completeness of the property record. A separate
 *                                  concept; it must never stand in for confidence.
 *
 * New code must not derive confidenceLevel from the numeric index. The single
 * exception is reading rows written before the four-state model existed, which is
 * handled explicitly by resolveConfidenceLevel below and always flagged.
 */
const CONFIDENCE_STATES = ['High', 'Medium', 'Low', 'Not assessed'];

function normaliseConfidenceLevel(value) {
  if (!value) return null;
  const match = CONFIDENCE_STATES.find(
    (s) => s.toLowerCase() === String(value).trim().toLowerCase()
  );
  return match || null;
}

/**
 * LEGACY ONLY. Rows written before confidence_level existed stored just a numeric
 * index. These thresholds match the pre-1.1.0 model that produced it, so a stored
 * index can be read back as the level the user was originally shown. Results are
 * always marked `confidenceLevelIsLegacyEstimate` and must never be treated as a
 * current assessment. Do not call this for new analyses.
 */
const LEGACY_LEVEL_THRESHOLDS = { high: 78, medium: 55 };

/** Base version of the confidence model currently in use, for legacy detection. */
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');

const CURRENT_CONFIDENCE_MODEL = CONFIDENCE_MODEL.baseVersion;

function deriveLegacyConfidenceLevel(index) {
  // Number(null) and Number('') are both 0, which would turn "no stored index"
  // into a Low confidence level. Absent must stay absent.
  if (index === null || index === undefined || index === '') return null;
  const n = Number(index);
  if (!Number.isFinite(n)) return null;
  if (n >= LEGACY_LEVEL_THRESHOLDS.high) return 'High';
  if (n >= LEGACY_LEVEL_THRESHOLDS.medium) return 'Medium';
  return 'Low';
}

/**
 * Which *confidence engine* produced this assessment. Never use
 * `ai_requests.model_version` or `output_data.modelVersion` — those are the
 * Property Intelligence report/request version (e.g. property-intelligence-v2)
 * and are unrelated to the confidence scale.
 */
function reportConfidenceModelVersion(row) {
  const confidence = row.output_data?.confidence;
  const assessment = confidence?.assessment;
  return (
    assessment?.model?.baseVersion ||
    assessment?.model?.version ||
    assessment?.modelVersion ||
    confidence?.modelVersion ||
    null
  );
}

function isCurrentConfidenceModel(version) {
  if (!version) return false;
  // `+custom` marks overridden thresholds on the same base model.
  return version === CURRENT_CONFIDENCE_MODEL || version.startsWith(`${CURRENT_CONFIDENCE_MODEL}+`);
}

/**
 * Read-time resolution. Stored records are never rewritten.
 *
 * Native vs legacy is decided solely by the confidence-model version on the
 * assessment. A persisted or payload level from an older model is kept verbatim
 * for historical display and flagged as legacy — it is never re-derived from the
 * numeric index under the current model's thresholds.
 *
 * The numeric index is consulted only when no level was stored at all (pre-engine
 * rows). That reconstruction is always flagged `legacy_index`.
 */
function resolveConfidenceLevel(row) {
  const confidenceModelVersion = reportConfidenceModelVersion(row);
  const native = isCurrentConfidenceModel(confidenceModelVersion);

  const persisted = normaliseConfidenceLevel(row.confidence_level);
  const fromReport = normaliseConfidenceLevel(row.output_data?.confidence?.level);
  const storedLevel = persisted || fromReport;

  if (storedLevel) {
    const source = persisted
      ? native
        ? 'persisted'
        : 'persisted_legacy_model'
      : native
        ? 'report'
        : 'report_legacy_model';
    return {
      confidenceLevel: storedLevel,
      confidenceLevelSource: source,
      confidenceModelVersion,
      legacy: !native,
    };
  }

  const derived = deriveLegacyConfidenceLevel(row.confidence);
  if (derived) {
    return {
      confidenceLevel: derived,
      confidenceLevelSource: 'legacy_index',
      confidenceModelVersion,
      legacy: true,
    };
  }

  return {
    confidenceLevel: null,
    confidenceLevelSource: null,
    confidenceModelVersion,
    legacy: false,
  };
}

function mapHistoryRow(row) {
  const { confidenceLevel, confidenceLevelSource, confidenceModelVersion, legacy } =
    resolveConfidenceLevel(row);
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    // Internal ordering index, null when not assessed. Never render as a percentage.
    confidenceIndex: row.confidence ?? null,
    confidence: row.confidence ?? null,
    confidenceLevel,
    confidenceLevelSource,
    confidenceModelVersion,
    confidenceLevelIsLegacyEstimate: legacy,
    // Separate concept from confidence: completeness of the property record.
    dataQuality: row.data_quality,
    // Request/report version (e.g. property-intelligence-v2). Distinct from
    // confidenceModelVersion — never used to decide native vs legacy.
    modelVersion: row.model_version,
    // Deprecated — the blended overall score is no longer produced. Kept as null
    // for API compatibility; use confidenceLevel and the report's componentDetail.
    overallScore: null,
  };
}

/**
 * Read-time annotation. Stored `output_data` is returned unchanged — provenance
 * lives alongside it so historical records are never rewritten.
 */
function annotateStoredAnalysis(row) {
  if (!row) return null;
  const mapped = mapHistoryRow(row);
  return {
    ...row,
    confidenceLevel: mapped.confidenceLevel,
    confidenceLevelSource: mapped.confidenceLevelSource,
    confidenceModelVersion: mapped.confidenceModelVersion,
    confidenceLevelIsLegacyEstimate: mapped.confidenceLevelIsLegacyEstimate,
    confidenceIndex: mapped.confidenceIndex,
    overallScore: null,
  };
}

class AiRequest {
  static async create({
    userId,
    requestType,
    inputData,
    outputData,
    creditsUsed = 1,
    modelUsed = null,
    tokensUsed = 0,
    status = 'completed',
    errorMessage = null,
    title = null,
    propertyId = null,
    subjectId = null,
    confidence = null,
    confidenceLevel = null,
    dataQuality = null,
    modelVersion = null,
  }) {
    const includeSubject = await hasSubjectIdColumn();
    const includeConfidenceLevel = await hasConfidenceLevelColumn();

    const baseColumns = [
      'user_id',
      'request_type',
      'status',
      'input_data',
      'output_data',
      'credits_used',
      'model_used',
      'tokens_used',
      'error_message',
      'title',
      'property_id',
    ];
    const baseValues = [
      userId,
      requestType,
      status,
      inputData || {},
      outputData || {},
      creditsUsed,
      modelUsed,
      tokensUsed,
      errorMessage,
      title,
      propertyId,
    ];

    if (includeSubject) {
      baseColumns.push('subject_id');
      baseValues.push(subjectId);
    }

    baseColumns.push('confidence', 'data_quality', 'model_version');
    baseValues.push(confidence, dataQuality, modelVersion);

    if (includeConfidenceLevel) {
      baseColumns.push('confidence_level');
      baseValues.push(confidenceLevel);
    }

    const placeholders = baseValues.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO ai_requests (${baseColumns.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      baseValues
    );
    return result.rows[0];
  }

  static async historySelectColumns() {
    const base = 'id, title, created_at, confidence, data_quality, model_version, output_data';
    return (await hasConfidenceLevelColumn()) ? `${base}, confidence_level` : base;
  }

  static async findBySubject(userId, subjectId, { limit = 20 } = {}) {
    if (!(await hasSubjectIdColumn())) return [];

    const result = await pool.query(
      `SELECT ${await AiRequest.historySelectColumns()}
       FROM ai_requests
       WHERE user_id = $1 AND subject_id = $2 AND request_type = 'property_intelligence'
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, subjectId, limit]
    );
    return result.rows.map(mapHistoryRow);
  }

  static async findByProperty(userId, propertyId, { limit = 20 } = {}) {
    const result = await pool.query(
      `SELECT ${await AiRequest.historySelectColumns()}
       FROM ai_requests
       WHERE user_id = $1 AND property_id = $2 AND request_type = 'property_intelligence'
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, propertyId, limit]
    );
    return result.rows.map(mapHistoryRow);
  }

  static async findLatestPropertyIntelligenceForUser(userId) {
    try {
      if (!(await hasColumn('property_id'))) return [];
      const includeSubject = await hasSubjectIdColumn();
      const extra = includeSubject ? ', subject_id' : '';
      const result = await pool.query(
        `SELECT DISTINCT ON (property_id) ${await AiRequest.historySelectColumns()}, property_id${extra}
         FROM ai_requests
         WHERE user_id = $1
           AND request_type = 'property_intelligence'
           AND property_id IS NOT NULL
         ORDER BY property_id, created_at DESC`,
        [userId]
      );
      return result.rows.map((row) => ({
        ...mapHistoryRow(row),
        property_id: row.property_id,
        subject_id: includeSubject ? row.subject_id ?? null : null,
        output_data: row.output_data,
      }));
    } catch {
      return [];
    }
  }

  static async findById(id, userId = null) {
    const params = [id];
    let sql = 'SELECT * FROM ai_requests WHERE id = $1';
    if (userId) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }
    const result = await pool.query(sql, params);
    return annotateStoredAnalysis(result.rows[0] || null);
  }

  static async findByUser(userId, { type = null, limit = 50, offset = 0 } = {}) {
    const params = [userId];
    let sql = 'SELECT * FROM ai_requests WHERE user_id = $1';

    if (type) {
      params.push(type);
      sql += ` AND request_type = $${params.length}`;
    }

    params.push(limit);
    params.push(offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(sql, params);
    return result.rows.map(annotateStoredAnalysis);
  }

  static async countByUser(userId, type = null) {
    const params = [userId];
    let sql = 'SELECT COUNT(*)::int AS count FROM ai_requests WHERE user_id = $1';
    if (type) {
      params.push(type);
      sql += ` AND request_type = $${params.length}`;
    }
    const result = await pool.query(sql, params);
    return result.rows[0].count;
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM ai_requests WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rows[0] || null;
  }
}

module.exports = AiRequest;
// Exported for tests: history mapping must never invent a confidence state.
module.exports.mapHistoryRow = mapHistoryRow;
module.exports.normaliseConfidenceLevel = normaliseConfidenceLevel;
module.exports.resolveConfidenceLevel = resolveConfidenceLevel;
module.exports.deriveLegacyConfidenceLevel = deriveLegacyConfidenceLevel;
module.exports.annotateStoredAnalysis = annotateStoredAnalysis;
module.exports.reportConfidenceModelVersion = reportConfidenceModelVersion;
module.exports.isCurrentConfidenceModel = isCurrentConfidenceModel;
module.exports.CONFIDENCE_STATES = CONFIDENCE_STATES;
module.exports.CURRENT_CONFIDENCE_MODEL = CURRENT_CONFIDENCE_MODEL;
