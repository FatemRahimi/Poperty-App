/**
 * Migration and legacy-record checks.
 *
 * Proves that analyses saved before the confidence_level column and the four-state
 * confidence model still load correctly, and that the repository layer works both
 * before and after migration 015 is applied.
 *
 * The database is stubbed, so this runs without a live Postgres instance.
 *
 * Run: node server/tests/legacyRecords.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

async function asyncTest(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

// ---------------------------------------------------------------------------
// Stubbed pool: lets us drive the "column exists" branch both ways.
// ---------------------------------------------------------------------------

const dbPath = require.resolve('../models/db');

function loadAiRequestWith({ confidenceLevelColumn, subjectIdColumn = true, rows = [] }) {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('information_schema.columns')) {
        const column = params[0];
        const present =
          (column === 'confidence_level' && confidenceLevelColumn) ||
          (column === 'subject_id' && subjectIdColumn);
        return { rows: present ? [{ 1: 1 }] : [] };
      }
      if (sql.trim().startsWith('INSERT')) {
        return { rows: [{ id: 1 }] };
      }
      return { rows };
    },
  };

  // Fresh module instances so the column cache does not leak between cases.
  delete require.cache[dbPath];
  delete require.cache[require.resolve('../models/AiRequest')];
  require.cache[dbPath] = new Module(dbPath, null);
  require.cache[dbPath].exports = pool;
  require.cache[dbPath].loaded = true;
  require.cache[dbPath].filename = dbPath;

  const AiRequest = require('../models/AiRequest');
  return { AiRequest, queries };
}

// ---------------------------------------------------------------------------
// Migration file
// ---------------------------------------------------------------------------

const MIGRATION = '015_confidence_level.sql';
const migrationSql = fs.readFileSync(
  path.join(__dirname, '..', 'db', 'migrations', MIGRATION),
  'utf8'
);

test('migration 015 exists and is additive only', () => {
  assert.ok(/ALTER TABLE ai_requests/i.test(migrationSql));
  assert.ok(
    /ADD COLUMN IF NOT EXISTS confidence_level/i.test(migrationSql),
    'must be idempotent'
  );
  assert.ok(
    !/DROP\s+(COLUMN|TABLE)/i.test(migrationSql),
    'migration must not drop anything — old records must survive'
  );
  assert.ok(
    !/UPDATE\s+ai_requests/i.test(migrationSql),
    'migration must not backfill a guessed level into historical rows'
  );
});

test('migration 015 is registered so existing installs pick it up', () => {
  const ensure = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'ensureIntelligenceSchema.js'),
    'utf8'
  );
  assert.ok(ensure.includes(MIGRATION), 'must be listed in MIGRATION_FILES');
  assert.ok(
    /confidence_level/.test(ensure),
    'the boot check must detect the missing column, or the migration never runs'
  );
});

// ---------------------------------------------------------------------------
// Legacy row shapes
// ---------------------------------------------------------------------------

/** Oldest shape: numeric confidence only, no level anywhere. */
const LEGACY_ROW = {
  id: 11,
  title: 'Legacy analysis',
  created_at: '2025-01-04T10:00:00Z',
  confidence: 82,
  data_quality: 'high',
  model_version: 'property-intelligence-v2',
  output_data: {
    scores: { overall: 71, components: { market: 68, rent: 50, investment: 35 } },
  },
};

/**
 * Middle shape: the report payload carries a three-state level produced by an
 * earlier confidence model, and the column does not exist yet.
 */
const REPORT_LEVEL_ROW = {
  id: 12,
  created_at: '2026-03-01T10:00:00Z',
  confidence: 61,
  data_quality: 'medium',
  model_version: 'property-intelligence-v2',
  output_data: {
    confidence: {
      level: 'Medium',
      score: 61,
      assessment: { modelVersion: 'confidence-1.0.0' },
    },
  },
};

/** Current shape. */
const CURRENT_ROW = {
  id: 13,
  created_at: '2026-06-01T10:00:00Z',
  confidence: null,
  confidence_level: 'Not assessed',
  data_quality: null,
  model_version: 'property-intelligence-v2',
  output_data: {
    confidence: {
      level: 'Not assessed',
      score: null,
      assessment: { model: { baseVersion: 'confidence-1.1.0', version: 'confidence-1.1.0' } },
    },
  },
};

/** Current model, but the column has not been added yet (mid-deploy). */
const CURRENT_MODEL_NO_COLUMN_ROW = {
  id: 14,
  created_at: '2026-06-02T10:00:00Z',
  confidence: 84,
  output_data: {
    confidence: {
      level: 'High',
      score: 84,
      assessment: { model: { baseVersion: 'confidence-1.1.0', version: 'confidence-1.1.0' } },
    },
  },
};

const { AiRequest } = loadAiRequestWith({ confidenceLevelColumn: true });
const {
  mapHistoryRow,
  resolveConfidenceLevel,
  deriveLegacyConfidenceLevel,
  CONFIDENCE_STATES,
  CURRENT_CONFIDENCE_MODEL,
} = AiRequest;

test('legacy rows with only a numeric index still resolve to a level', () => {
  const r = mapHistoryRow(LEGACY_ROW);
  assert.strictEqual(r.confidenceLevel, 'High', '82 mapped to High under the old model');
  assert.strictEqual(r.confidenceLevelSource, 'legacy_index');
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, true, 'must be flagged as reconstructed');
  assert.strictEqual(r.confidenceIndex, 82);
  assert.strictEqual(r.id, 11);
  assert.strictEqual(r.title, 'Legacy analysis');
});

test('legacy derivation is confined to legacy rows', () => {
  // A current-model row with a persisted level must never consult the numeric index.
  const current = mapHistoryRow({ ...CURRENT_ROW, confidence: 90 });
  assert.strictEqual(current.confidenceLevel, 'Not assessed');
  assert.strictEqual(current.confidenceLevelSource, 'persisted');
  assert.strictEqual(current.confidenceLevelIsLegacyEstimate, false);
});

test('current-model persisted level is native', () => {
  const r = mapHistoryRow({
    id: 21,
    confidence: 84,
    confidence_level: 'High',
    model_version: 'property-intelligence-v2',
    output_data: {
      modelVersion: 'property-intelligence-v2',
      confidence: {
        level: 'High',
        score: 84,
        assessment: { model: { baseVersion: CURRENT_CONFIDENCE_MODEL, version: CURRENT_CONFIDENCE_MODEL } },
      },
    },
  });
  assert.strictEqual(r.confidenceLevel, 'High');
  assert.strictEqual(r.confidenceLevelSource, 'persisted');
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, false);
  assert.strictEqual(r.confidenceModelVersion, CURRENT_CONFIDENCE_MODEL);
  assert.strictEqual(r.modelVersion, 'property-intelligence-v2');
});

test('older-model persisted level is legacy even though a level is already stored', () => {
  // Numeric 90 would be High under the current model. The stored level is Medium.
  // Reinterpreting would rewrite history — that must not happen.
  const originalOutput = {
    modelVersion: 'property-intelligence-v2',
    confidence: {
      level: 'Medium',
      score: 90,
      assessment: { modelVersion: 'confidence-1.0.0' },
    },
  };
  const snapshot = JSON.stringify(originalOutput);
  const r = mapHistoryRow({
    id: 22,
    confidence: 90,
    confidence_level: 'Medium',
    model_version: 'property-intelligence-v2',
    output_data: originalOutput,
  });
  assert.strictEqual(r.confidenceLevel, 'Medium', 'the original stored level is preserved');
  assert.strictEqual(r.confidenceLevelSource, 'persisted_legacy_model');
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, true);
  assert.strictEqual(r.confidenceModelVersion, 'confidence-1.0.0');
  assert.strictEqual(
    JSON.stringify(originalOutput),
    snapshot,
    'historical output_data must not be rewritten'
  );
});

test('request/report model version must not make an older confidence assessment native', () => {
  const r = mapHistoryRow({
    id: 23,
    confidence: 80,
    confidence_level: 'High',
    model_version: 'property-intelligence-v2',
    output_data: {
      modelVersion: 'property-intelligence-v2',
      confidence: { level: 'High', assessment: { modelVersion: 'confidence-1.0.0' } },
    },
  });
  assert.strictEqual(r.modelVersion, 'property-intelligence-v2');
  assert.strictEqual(r.confidenceModelVersion, 'confidence-1.0.0');
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, true);
});

test('a level from an earlier confidence model is flagged, not treated as native', () => {
  const r = mapHistoryRow(REPORT_LEVEL_ROW);
  assert.strictEqual(r.confidenceLevel, 'Medium', 'the recorded level is preserved verbatim');
  assert.strictEqual(r.confidenceLevelSource, 'report_legacy_model');
  assert.strictEqual(
    r.confidenceLevelIsLegacyEstimate,
    true,
    'confidence-1.0.0 had no Not assessed state and scored a single method as neutral'
  );
  assert.strictEqual(r.confidenceModelVersion, 'confidence-1.0.0');
});

test('a level from the current model is native even without the column', () => {
  const r = mapHistoryRow(CURRENT_MODEL_NO_COLUMN_ROW);
  assert.strictEqual(r.confidenceLevel, 'High');
  assert.strictEqual(r.confidenceLevelSource, 'report');
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, false);
  assert.strictEqual(r.confidenceModelVersion, CURRENT_CONFIDENCE_MODEL);
});

test('overridden thresholds on the current base model are still native', () => {
  const r = mapHistoryRow({
    id: 15,
    confidence: 80,
    output_data: {
      confidence: {
        level: 'High',
        assessment: { model: { version: `${CURRENT_CONFIDENCE_MODEL}+custom` } },
      },
    },
  });
  assert.strictEqual(r.confidenceLevelSource, 'report');
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, false);
});

test('a report level with no recorded model version is treated as legacy', () => {
  const r = mapHistoryRow({
    id: 16,
    confidence: 70,
    output_data: { confidence: { level: 'Medium' } },
  });
  assert.strictEqual(r.confidenceLevel, 'Medium');
  assert.strictEqual(r.confidenceLevelSource, 'report_legacy_model');
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, true);
  assert.strictEqual(r.confidenceModelVersion, null);
});

test('mixed historical payloads keep original levels and distinguish native from legacy', () => {
  const mixed = [
    CURRENT_ROW,
    {
      id: 31,
      confidence: 90,
      confidence_level: 'Medium',
      model_version: 'property-intelligence-v2',
      output_data: {
        confidence: { level: 'Medium', assessment: { modelVersion: 'confidence-1.0.0' } },
      },
    },
    {
      id: 32,
      confidence: 70,
      output_data: { confidence: { level: 'Low' } },
    },
    LEGACY_ROW,
    CURRENT_MODEL_NO_COLUMN_ROW,
  ].map((row) => {
    const snapshot = JSON.stringify(row.output_data);
    const mapped = mapHistoryRow(row);
    assert.strictEqual(JSON.stringify(row.output_data), snapshot);
    return mapped;
  });

  const byId = Object.fromEntries(mixed.map((r) => [r.id, r]));

  assert.strictEqual(byId[13].confidenceLevel, 'Not assessed');
  assert.strictEqual(byId[13].confidenceLevelIsLegacyEstimate, false, 'current persisted');

  assert.strictEqual(byId[31].confidenceLevel, 'Medium');
  assert.strictEqual(byId[31].confidenceLevelIsLegacyEstimate, true, 'older-model persisted');
  assert.notStrictEqual(byId[31].confidenceLevel, 'High', 'must not reinterpret 90 as High');

  assert.strictEqual(byId[32].confidenceLevel, 'Low');
  assert.strictEqual(byId[32].confidenceLevelIsLegacyEstimate, true, 'no modelVersion');

  assert.strictEqual(byId[11].confidenceLevel, 'High');
  assert.strictEqual(byId[11].confidenceLevelSource, 'legacy_index', 'numeric-only');
  assert.strictEqual(byId[11].confidenceLevelIsLegacyEstimate, true);

  assert.strictEqual(byId[14].confidenceLevel, 'High');
  assert.strictEqual(byId[14].confidenceLevelIsLegacyEstimate, false, 'current model, no column');

  mixed.forEach((r) => assert.strictEqual(r.overallScore, null));
});

test('legacy thresholds reproduce the levels users were originally shown', () => {
  assert.strictEqual(deriveLegacyConfidenceLevel(78), 'High');
  assert.strictEqual(deriveLegacyConfidenceLevel(77), 'Medium');
  assert.strictEqual(deriveLegacyConfidenceLevel(55), 'Medium');
  assert.strictEqual(deriveLegacyConfidenceLevel(54), 'Low');
  assert.strictEqual(deriveLegacyConfidenceLevel(0), 'Low');
  // Absent means unknown, not Low.
  assert.strictEqual(deriveLegacyConfidenceLevel(null), null);
  assert.strictEqual(deriveLegacyConfidenceLevel(undefined), null);
  assert.strictEqual(deriveLegacyConfidenceLevel('abc'), null);
});

test('a row with neither a level nor an index reports unknown, not Low', () => {
  const r = mapHistoryRow({ id: 1, confidence: null, output_data: {} });
  assert.strictEqual(r.confidenceLevel, null);
  assert.strictEqual(r.confidenceLevelSource, null);
  assert.strictEqual(r.confidenceLevelIsLegacyEstimate, false);
});

test('every resolved level is one of the four declared states', () => {
  [LEGACY_ROW, REPORT_LEVEL_ROW, CURRENT_ROW].forEach((row) => {
    const { confidenceLevel } = resolveConfidenceLevel(row);
    assert.ok(
      confidenceLevel === null || CONFIDENCE_STATES.includes(confidenceLevel),
      `unexpected level: ${confidenceLevel}`
    );
  });
});

test('the deprecated overall score is not resurrected from legacy payloads', () => {
  const r = mapHistoryRow(LEGACY_ROW);
  assert.strictEqual(
    r.overallScore,
    null,
    'a stored overall of 71 must not be re-exposed as business data'
  );
});

test('confidence and dataQuality remain separate fields', () => {
  const r = mapHistoryRow(LEGACY_ROW);
  assert.strictEqual(r.dataQuality, 'high');
  assert.strictEqual(r.confidenceLevel, 'High');
  // Same word, different concepts — the mapping must not conflate them.
  const mismatched = mapHistoryRow({ ...LEGACY_ROW, data_quality: 'low', confidence: 82 });
  assert.strictEqual(mismatched.dataQuality, 'low');
  assert.strictEqual(mismatched.confidenceLevel, 'High');
});

// ---------------------------------------------------------------------------
// Repository behaviour either side of the migration
// ---------------------------------------------------------------------------

(async () => {
  await asyncTest('reads select confidence_level once the column exists', async () => {
    const { AiRequest: Repo } = loadAiRequestWith({
      confidenceLevelColumn: true,
      rows: [CURRENT_ROW],
    });
    const cols = await Repo.historySelectColumns();
    assert.ok(cols.includes('confidence_level'));

    const history = await Repo.findByProperty(1, 2);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].confidenceLevel, 'Not assessed');
  });

  await asyncTest('reads omit confidence_level before the migration is applied', async () => {
    const { AiRequest: Repo } = loadAiRequestWith({
      confidenceLevelColumn: false,
      rows: [REPORT_LEVEL_ROW],
    });
    const cols = await Repo.historySelectColumns();
    assert.ok(
      !cols.includes('confidence_level'),
      'selecting a missing column would throw on un-migrated installs'
    );

    const history = await Repo.findByProperty(1, 2);
    assert.strictEqual(history[0].confidenceLevel, 'Medium', 'falls back to the report payload');
    assert.strictEqual(history[0].confidenceLevelIsLegacyEstimate, true, 'and flags the old model');
  });

  await asyncTest('legacy rows load through the repository before migration', async () => {
    const { AiRequest: Repo } = loadAiRequestWith({
      confidenceLevelColumn: false,
      rows: [LEGACY_ROW],
    });
    const history = await Repo.findByProperty(1, 2);
    assert.strictEqual(history[0].confidenceLevel, 'High');
    assert.strictEqual(history[0].confidenceLevelIsLegacyEstimate, true);
  });

  await asyncTest('writes omit confidence_level before the migration is applied', async () => {
    const { AiRequest: Repo, queries } = loadAiRequestWith({ confidenceLevelColumn: false });
    await Repo.create({
      userId: 1,
      requestType: 'property_intelligence',
      inputData: {},
      outputData: {},
      confidence: null,
      confidenceLevel: 'Not assessed',
    });
    const insert = queries.find((q) => q.sql.trim().startsWith('INSERT'));
    assert.ok(insert, 'an insert must have been issued');
    assert.ok(
      !insert.sql.includes('confidence_level'),
      'writing to a missing column would fail on un-migrated installs'
    );
    assert.ok(insert.sql.includes('confidence'), 'the numeric index is still written');
  });

  await asyncTest('writes include confidence_level after the migration', async () => {
    const { AiRequest: Repo, queries } = loadAiRequestWith({ confidenceLevelColumn: true });
    await Repo.create({
      userId: 1,
      requestType: 'property_intelligence',
      inputData: {},
      outputData: {},
      confidence: null,
      confidenceLevel: 'Not assessed',
    });
    const insert = queries.find((q) => q.sql.trim().startsWith('INSERT'));
    assert.ok(insert.sql.includes('confidence_level'));
    assert.ok(
      insert.params.includes('Not assessed'),
      'the four-state level must be persisted verbatim'
    );
  });

  await asyncTest('placeholder count always matches the value count', async () => {
    for (const confidenceLevelColumn of [true, false]) {
      for (const subjectIdColumn of [true, false]) {
        const { AiRequest: Repo, queries } = loadAiRequestWith({
          confidenceLevelColumn,
          subjectIdColumn,
        });
        await Repo.create({
          userId: 1,
          requestType: 'x',
          inputData: {},
          outputData: {},
        });
        const insert = queries.find((q) => q.sql.trim().startsWith('INSERT'));
        const columnCount = insert.sql
          .slice(insert.sql.indexOf('(') + 1, insert.sql.indexOf(')'))
          .split(',').length;
        assert.strictEqual(
          columnCount,
          insert.params.length,
          `column/value mismatch for confidenceLevel=${confidenceLevelColumn} subjectId=${subjectIdColumn}`
        );
      }
    }
  });

  await asyncTest('findById annotates provenance without rewriting output_data', async () => {
    const stored = {
      id: 40,
      request_type: 'property_intelligence',
      confidence: 90,
      confidence_level: 'Medium',
      model_version: 'property-intelligence-v2',
      output_data: {
        modelVersion: 'property-intelligence-v2',
        confidence: { level: 'Medium', assessment: { modelVersion: 'confidence-1.0.0' } },
        scores: { overall: 71 },
      },
    };
    const snapshot = JSON.stringify(stored.output_data);
    const { AiRequest: Repo } = loadAiRequestWith({
      confidenceLevelColumn: true,
      rows: [stored],
    });
    const item = await Repo.findById(40, 1);
    assert.strictEqual(item.confidenceLevel, 'Medium');
    assert.strictEqual(item.confidenceLevelIsLegacyEstimate, true);
    assert.strictEqual(item.confidenceModelVersion, 'confidence-1.0.0');
    assert.strictEqual(item.overallScore, null);
    assert.strictEqual(
      JSON.stringify(item.output_data),
      snapshot,
      'findById must not rewrite the stored report payload'
    );
  });

  console.log('\nlegacyRecords.test.js — all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
