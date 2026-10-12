/**
 * V1.2 — Subject-native valuation live closure.
 * Forensic raw HTTP + bounded revalidation. Max 3 live /valuation-sale calls.
 * node server/scripts/subject-native-valuation-live-closure.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { acquireOfficialEpbEvidence, getEpbCapability } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const {
  buildSubjectNativeValuationProperty,
  ensureOfficialValidationSubject,
  executeSubjectNativeSaleValuation,
  assertTemporalLeakageFirewall,
} = require('../services/ai/subjectNativeSaleValuation');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const { classifyProviderFailure } = require('../services/providers/cache/providerCostProtection');
const { createProvenance } = require('../utils/provenance');

const TYPE_TO_LISTING = { D: 'detached', S: 'semi-detached', T: 'terraced' };
const MAX_LIVE = 3;
const PREFERRED = [
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}',
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}',
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}',
];

function redactUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.searchParams.has('key')) u.searchParams.set('key', '[REDACTED]');
    return u.toString();
  } catch {
    return '[invalid-url]';
  }
}

function classifyOrigin(httpStatus, parseError, thrown, errName, errMessage) {
  if (thrown) {
    if (errName === 'AbortError' || /aborted|timeout/i.test(errMessage)) return 'C';
    if (/network|fetch failed|econn|enotfound/i.test(errMessage)) return 'E';
    return 'G';
  }
  if (parseError) return 'D';
  if (httpStatus === 401 || httpStatus === 403) return 'B';
  if (httpStatus === 402) return 'F';
  if (httpStatus === 400) return 'C_CONTRACT'; // request contract / bad params
  if (httpStatus === 429 || (httpStatus >= 500 && httpStatus <= 599)) return 'A';
  if (httpStatus >= 200 && httpStatus < 300) return 'A';
  return 'G';
}

const ORIGIN_LABEL = {
  A: 'A. PropertyData HTTP/API response',
  B: 'B. authentication/account issue',
  C: 'C. timeout/network layer',
  C_CONTRACT: 'C. malformed provider request / contract',
  D: 'D. local adapter / parse classification',
  E: 'E. network/runtime failure',
  F: 'F. credit/account state',
  G: 'G. unknown',
};

async function forensicRawValuationSale(params) {
  const cfg = propertyIntelligenceConfig.providers.propertyData;
  if (!cfg.enabled || !cfg.apiKey) {
    return {
      configured: false,
      origin: 'B',
      originLabel: ORIGIN_LABEL.B,
      successPayload: false,
      detail: 'PropertyData not configured',
    };
  }

  const url = new URL(`${cfg.baseUrl.replace(/\/$/, '')}/valuation-sale`);
  url.searchParams.set('key', cfg.apiKey);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs || 15000);
  const started = Date.now();
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    let parseError = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      parseError = e.message;
    }

    let clientErrorMessage = null;
    if (parseError) clientErrorMessage = `PropertyData returned non-JSON response (${response.status})`;
    else if (!response.ok) {
      clientErrorMessage = (data && (data.message || data.error)) || `PropertyData HTTP ${response.status}`;
    } else if (data && data.status && data.status !== 'success') {
      clientErrorMessage = data.message || data.error || `PropertyData status: ${data.status}`;
    }

    const classified = clientErrorMessage
      ? classifyProviderFailure(new Error(clientErrorMessage))
      : null;
    const origin = classifyOrigin(response.status, parseError, false, null, null);
    const successPayload = Boolean(
      response.ok && data && (!data.status || data.status === 'success')
    );

    return {
      configured: true,
      urlRedacted: redactUrl(url.toString()),
      latencyMs: Date.now() - started,
      httpStatus: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      bodyPreview: String(text).slice(0, 400),
      bodyKeys: data && typeof data === 'object' ? Object.keys(data) : [],
      providerStatus: data?.status ?? null,
      providerMessage: data?.message || data?.error || null,
      parseError,
      clientErrorMessage,
      adapterClassification: classified,
      origin,
      originLabel: ORIGIN_LABEL[origin] || ORIGIN_LABEL.G,
      successPayload,
      data: successPayload ? data : null,
    };
  } catch (err) {
    const classified = classifyProviderFailure(err);
    const origin = classifyOrigin(null, null, true, err.name, String(err.message || ''));
    return {
      configured: true,
      urlRedacted: redactUrl(url.toString()),
      latencyMs: Date.now() - started,
      thrown: true,
      errorName: err.name,
      errorMessage: String(err.message || err).slice(0, 300),
      adapterClassification: classified,
      origin,
      originLabel: ORIGIN_LABEL[origin] || ORIGIN_LABEL.G,
      successPayload: false,
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function prepareEligible(row) {
  const propertyType = TYPE_TO_LISTING[row.property_type_code];
  const identity = { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn };
  const ephemeral = buildSubjectNativeValuationProperty({
    uprn: row.uprn,
    postcode: row.postcode,
    propertyType,
    paon: row.paon,
    saon: row.saon,
    street: row.street,
    town: row.town_city,
    normalizedAddress: [row.paon, row.street, row.town_city, row.postcode].filter(Boolean).join(', '),
  });
  const capability = getEpbCapability(propertyIntelligenceConfig.providers.mhclgEpb);
  if (!capability.available) return null;
  const result = await acquireOfficialEpbEvidence({
    property: ephemeral,
    identity,
    deps: { skipCoalesce: true, persistOfficialEpbUprn: async () => ({ skipped: true }) },
  });
  const status = result.status || result.attachmentStatus;
  const sqm = result.client?.current?.floorAreaSqm;
  if (status !== EPB_ATTACHMENT.UNIQUE_ATTACH || sqm == null) return null;
  const epbEvidence = {
    client: {
      attachmentStatus: 'UNIQUE_ATTACH',
      certificateType: 'DOMESTIC',
      current: {
        floorAreaSqm: Number(sqm),
        constructionAgeBand: result.client?.current?.constructionAgeBand || null,
      },
    },
  };
  const resolution = await resolveCanonicalInternalArea({
    property: ephemeral,
    identity,
    epbEvidence,
    loadPersistedEpb: false,
  });
  const applied = applyCanonicalInternalAreaToProperty(ephemeral, resolution);
  const ageBand = result.client?.current?.constructionAgeBand || null;
  if (ageBand) {
    applied.construction_age_band = ageBand;
    applied.constructionAgeBand = ageBand;
  }
  const readiness = buildValuationSaleRequest(applied);
  const leak = assertTemporalLeakageFirewall({
    property: applied,
    providerParams: readiness.params,
    historicalSoldPrice: row.price_gbp,
  });
  if (!readiness.canRequestAvm || !leak.leakageSafe) return null;
  return {
    row,
    propertyType,
    applied,
    epbEvidence,
    readiness,
    leak,
    historicalOutcome: {
      priceGbp: Number(row.price_gbp),
      transferDate: row.transfer_date,
      sourceTransactionId: row.source_transaction_id,
    },
  };
}

async function runDownstreamFromPayload(target, payload, params, creditsUsed) {
  const subject = await ensureOfficialValidationSubject({
    uprn: target.row.uprn,
    postcode: target.row.postcode,
    paon: target.row.paon,
    saon: target.row.saon,
    street: target.row.street,
    town: target.row.town_city,
    propertyType: target.propertyType,
  });
  const property = {
    ...target.applied,
    subjectId: subject.id,
    valuationExecutionMode: 'subject_native',
    category: null,
    price: null,
    id: null,
  };

  let persisted = false;
  const result = await executeSubjectNativeSaleValuation({
    subject,
    property,
    historicalOutcome: target.historicalOutcome,
    deps: {
      epbEvidence: target.epbEvidence,
      findEnrichmentBySubject: async () => null,
      upsertSubjectEnrichment: async (row) => {
        const { upsertSubjectEnrichment } = require('../services/enrichment/intelligenceSubjectRepository');
        const saved = await upsertSubjectEnrichment(row);
        persisted = true;
        return saved;
      },
      marketProvider: {
        isAvailable: () => true,
        getSaleValuation: async () => ({
          success: true,
          valuation: payload,
          data: payload,
          inputParams: params,
          provenance: createProvenance({
            source: 'PropertyData',
            method: 'valuation_sale_avm',
            providerEndpoint: '/valuation-sale',
          }),
          creditsUsed,
        }),
      },
    },
  });

  return {
    subjectId: subject.id,
    persisted,
    result,
  };
}

(async () => {
  await ensureIntelligenceSchema();

  let priorUsage = [];
  try {
    const u = await pool.query(`
      SELECT endpoint, success, error_message, credits_used, latency_ms, created_at
      FROM data_provider_usage
      WHERE provider = 'propertydata' AND endpoint IN ('valuation-sale', 'valuation_sale')
      ORDER BY id DESC
      LIMIT 15
    `);
    priorUsage = u.rows;
  } catch (e) {
    priorUsage = [{ note: `usage query failed: ${e.message}` }];
  }

  const preferred = await pool.query(
    `SELECT source_transaction_id, price_gbp, transfer_date, postcode, paon, saon, street,
            town_city, property_type_code, uprn
     FROM official_sale_transactions
     WHERE live AND source_transaction_id = ANY($1)`,
    [PREFERRED]
  );

  const candidates = [];
  for (const row of preferred.rows) {
    const prepared = await prepareEligible(row);
    if (prepared) candidates.push(prepared);
  }
  if (candidates.length < 3) {
    const more = await pool.query(`
      SELECT source_transaction_id, price_gbp, transfer_date, postcode, paon, saon, street,
             town_city, property_type_code, uprn
      FROM official_sale_transactions
      WHERE live AND uprn IS NOT NULL AND postcode IS NOT NULL AND paon IS NOT NULL
        AND property_type_code IN ('D','S','T')
        AND (saon IS NULL OR BTRIM(saon)='')
        AND price_present AND transfer_date >= DATE '2018-01-01'
      ORDER BY transfer_date DESC
      LIMIT 10
    `);
    for (const row of more.rows) {
      if (candidates.some((c) => c.row.source_transaction_id === row.source_transaction_id)) continue;
      const prepared = await prepareEligible(row);
      if (prepared) candidates.push(prepared);
      if (candidates.length >= 3) break;
    }
  }

  const selected = candidates.slice(0, MAX_LIVE);
  const contractCheck = selected.map((c) => ({
    tx: c.row.source_transaction_id,
    postcode: c.row.postcode,
    params: c.readiness.params,
    checks: {
      postcodePresent: Boolean(c.readiness.params?.postcode),
      internalAreaSqft: Number(c.readiness.params?.internal_area) >= 300,
      propertyTypeMapped: Boolean(c.readiness.params?.property_type),
      outputJson: c.readiness.params?.output === 'json',
      noHistoricalPrice: !JSON.stringify(c.readiness.params || {}).includes(String(Math.trunc(Number(c.row.price_gbp)))),
      noAskingPrice: c.applied.price == null,
      noSaleCategory: c.applied.category !== 'sale',
      noPropertyId: c.applied.id == null,
    },
  }));

  const traces = [];
  let liveCount = 0;
  let firstSuccess = null;

  for (let i = 0; i < selected.length && liveCount < MAX_LIVE; i += 1) {
    const target = selected[i];
    const params = target.readiness.params;

    if (i === 0) {
      // Forensic raw probe (counts as 1 live call)
      const forensic = await forensicRawValuationSale(params);
      liveCount += 1;
      const entry = {
        kind: 'forensic_raw',
        tx: target.row.source_transaction_id,
        uprn: target.row.uprn,
        postcode: target.row.postcode,
        params,
        forensic: {
          httpStatus: forensic.httpStatus,
          origin: forensic.origin,
          originLabel: forensic.originLabel,
          providerStatus: forensic.providerStatus,
          providerMessage: forensic.providerMessage,
          adapterUsage: forensic.adapterClassification?.usageCode || null,
          adapterCode: forensic.adapterClassification?.code || null,
          successPayload: forensic.successPayload,
          bodyKeys: forensic.bodyKeys,
          latencyMs: forensic.latencyMs,
          clientErrorMessage: forensic.clientErrorMessage || forensic.errorMessage || null,
        },
      };

      if (forensic.successPayload && forensic.data) {
        const downstream = await runDownstreamFromPayload(target, forensic.data, params, 1);
        entry.downstream = {
          subjectId: downstream.subjectId,
          persisted: downstream.persisted,
          providerCalled: downstream.result.providerCalled,
          assessed: downstream.result.assessed === true,
          assessmentState: downstream.result.assessmentState,
          centralEstimate:
            downstream.result.valuation?.centralEstimate?.value
            ?? downstream.result.valuation?.centralEstimate
            ?? null,
          leakageSafe: downstream.result.leakage?.leakageSafe,
          outcomeComparison: downstream.result.outcomeComparison,
          reasonCode: downstream.result.reasonCode || null,
          message: downstream.result.message || null,
        };
        firstSuccess = entry;
        traces.push(entry);
        break;
      }

      traces.push(entry);
      // Stop further spend on auth/account/contract failures
      if (['B', 'F', 'C_CONTRACT'].includes(forensic.origin)) break;
      continue;
    }

    // Distinct subject via full executor (additional live call)
    const subject = await ensureOfficialValidationSubject({
      uprn: target.row.uprn,
      postcode: target.row.postcode,
      paon: target.row.paon,
      saon: target.row.saon,
      street: target.row.street,
      town: target.row.town_city,
      propertyType: target.propertyType,
    });
    const property = {
      ...target.applied,
      subjectId: subject.id,
      valuationExecutionMode: 'subject_native',
      category: null,
      price: null,
      id: null,
    };
    const result = await executeSubjectNativeSaleValuation({
      subject,
      property,
      historicalOutcome: target.historicalOutcome,
      deps: { epbEvidence: target.epbEvidence, forceRefresh: true },
    });
    liveCount += 1;
    const entry = {
      kind: 'subject_native_execute',
      tx: target.row.source_transaction_id,
      uprn: target.row.uprn,
      postcode: target.row.postcode,
      subjectId: subject.id,
      params: result.providerParams || params,
      providerCalled: result.providerCalled,
      reasonCode: result.reasonCode || null,
      assessed: result.assessed === true,
      assessmentState: result.assessmentState,
      centralEstimate: result.valuation?.centralEstimate?.value ?? result.valuation?.centralEstimate ?? null,
      leakageSafe: result.leakage?.leakageSafe,
      outcomeComparison: result.outcomeComparison,
      creditsUsed: result.creditsUsed || 0,
      message: result.message || null,
    };
    traces.push(entry);
    if (result.assessed || (result.valuation && result.valuation.success && !result.reasonCode)) {
      firstSuccess = entry;
      break;
    }
  }

  const funnel = {
    candidates_prepared: selected.length,
    contract_ok: contractCheck.every((c) => Object.values(c.checks).every(Boolean)),
    live_calls: liveCount,
    provider_payload_received: traces.some(
      (t) => t.forensic?.successPayload || (t.kind === 'subject_native_execute' && t.centralEstimate != null)
        || t.downstream?.centralEstimate != null
        || (t.downstream && !t.downstream.reasonCode && t.downstream.assessmentState)
    ),
    persisted: traces.some((t) => t.downstream?.persisted),
    assessed: traces.some((t) => t.assessed || t.downstream?.assessed),
    not_assessed_after_payload: traces.some(
      (t) => t.downstream && t.downstream.assessmentState && !t.downstream.assessed
    ),
  };

  const output = {
    study: 'V1.2_SUBJECT_NATIVE_VALUATION_LIVE_CLOSURE',
    measuredAt: new Date().toISOString(),
    priorUsage,
    contractCheck,
    forensicFirst: traces.find((t) => t.kind === 'forensic_raw')?.forensic || null,
    traces,
    funnel,
    firstSuccess: Boolean(firstSuccess),
  };

  const outPath = path.join(__dirname, 'subject-native-valuation-live-closure-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify({
    funnel,
    forensic: output.forensicFirst,
    contractOk: funnel.contract_ok,
    traces: traces.map((t) => ({
      kind: t.kind,
      tx: t.tx,
      http: t.forensic?.httpStatus,
      origin: t.forensic?.originLabel || t.reasonCode,
      assessed: t.assessed || t.downstream?.assessed || false,
      estimate: t.centralEstimate || t.downstream?.centralEstimate || null,
    })),
  }, null, 2));

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
