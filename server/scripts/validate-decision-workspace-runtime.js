/**
 * V1.2 — Residential Decision Workspace real product validation.
 * Read-only measurement against persisted inventory. Does not mutate properties.
 *
 * Usage: node scripts/validate-decision-workspace-runtime.js
 */
require('../config/loadEnv');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { extractCanonicalAddress } = require('../services/identity/canonicalAddress');
const { queryOfficialSaleTransactions } = require('../services/market/officialSaleTransactionQuery');
const { DECISION_JOB } = require('../architecture/decisionContextContract');
const { KERNEL_ASSESSMENT } = require('../architecture/assessmentStates');

const ASOF = '2026-09-01T20:00:00.000Z';
const JOBS = [DECISION_JOB.BUY, DECISION_JOB.LET_INVEST, DECISION_JOB.SELL];

function stateOf(item) {
  if (!item) return 'NOT_ASSESSED';
  if (typeof item === 'string') return item;
  if (item.state) return item.state;
  if (item.available === true) return KERNEL_ASSESSMENT.ASSESSED;
  if (item.notAssessed === true || item.notAssessed === 'true') return KERNEL_ASSESSMENT.NOT_ASSESSED;
  if (item.success === true && item.centralEstimate != null) return KERNEL_ASSESSMENT.ASSESSED;
  if (item.applicable === false || item.notApplicable) return KERNEL_ASSESSMENT.NOT_APPLICABLE;
  return KERNEL_ASSESSMENT.NOT_ASSESSED;
}

function summarizeWorkspace(report) {
  const ws = report.decisionWorkspace || {};
  const ki = (ws.keyIntelligence || []).map((row) => ({
    id: row.id,
    label: row.label,
    state: row.state || stateOf(row),
    available: row.available,
  }));
  const ctx = (ws.contextEvidence || []).map((row) => ({
    id: row.id,
    state: row.state || stateOf(row),
    available: row.available,
  }));
  return {
    job: ws.decisionJob,
    applicable: ws.applicable,
    headline: ws.copy?.headline,
    keyIntelligence: ki,
    contextEvidence: ctx,
    unresolvedCount: (ws.unresolved || []).length,
    nextActionsCount: (ws.nextActions || []).length,
    findingsCount: (ws.findings || []).length,
    whatIfApplicable: ws.whatIfApplicable,
    personalDecision: report.personalDecision
      ? {
          profile: report.personalDecision.profile,
          available: report.personalDecision.available,
          state: report.personalDecision.state,
          score: report.personalDecision.score,
        }
      : null,
    decisionIntelligence: report.decisionIntelligence
      ? {
          applicable: report.decisionIntelligence.applicable,
          available: report.decisionIntelligence.available,
          findings: (report.decisionIntelligence.materialFindings || []).length,
          priorities: (report.decisionIntelligence.investigationPriorities || []).length,
        }
      : null,
    valuation: stateOf(report.marketIntelligence?.sale),
    pricePosition: stateOf(report.marketIntelligence?.pricePosition),
    rent: stateOf(report.marketIntelligence?.rent),
    investment: {
      grossYield: stateOf(report.investment?.presented?.grossYield || report.investment?.grossYield),
      noi: stateOf(report.investment?.presented?.noi || report.investment?.noi),
      annualCashFlow: stateOf(report.investment?.presented?.annualCashFlow || report.investment?.annualCashFlow),
      dscr: stateOf(report.investment?.presented?.dscr || report.investment?.dscr),
    },
    assetClass: report.assetClassification?.assetClass,
    residentialMethodology: report.residentialMethodology?.mode,
  };
}

async function inventorySnapshot() {
  const total = (await pool.query('SELECT COUNT(*)::int AS n FROM properties')).rows[0].n;
  let epbProps = 0;
  let epbCerts = 0;
  try {
    const epb = await pool.query(`
      SELECT COUNT(DISTINCT property_id)::int AS props, COUNT(*)::int AS certs
      FROM official_epb_certificates WHERE is_current = TRUE
    `);
    epbProps = epb.rows[0].props;
    epbCerts = epb.rows[0].certs;
  } catch {
    epbProps = 0;
    epbCerts = 0;
  }
  const uprn = (await pool.query(`
    SELECT COUNT(*)::int AS n FROM property_identities
    WHERE uprn IS NOT NULL AND BTRIM(uprn) <> ''
  `)).rows[0].n;
  const saon = (await pool.query(`
    SELECT COUNT(*)::int AS n FROM property_identities
    WHERE saon IS NOT NULL AND BTRIM(saon) <> ''
  `)).rows[0].n;
  return { total, epbProps, epbCerts, uprn, saon };
}

async function loadPropertyCandidates() {
  const rows = await pool.query(`
    SELECT
      p.id,
      p.title,
      p.city,
      p.zip_code,
      p.category,
      p.price,
      p.monthly_rent,
      p.bedrooms,
      p.property_type,
      p.user_id,
      pi.uprn,
      pi.paon,
      pi.saon,
      pi.building_name,
      (SELECT COUNT(*)::int FROM official_epb_certificates e
         WHERE e.property_id = p.id AND e.is_current = TRUE) AS epb_count
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    ORDER BY p.id
  `);
  return rows.rows;
}

async function hmlrMethod(property) {
  try {
    const identity = extractCanonicalAddress(property);
    const result = await queryOfficialSaleTransactions({
      identity: { ...identity, uprn: property.uprn || identity.uprn },
      property,
    });
    return {
      matchMethod: result.matchMethod || result.method || 'unknown',
      transactionCount: (result.transactions || []).length,
      assessed: result.notAssessed !== true && (result.transactions || []).length > 0,
    };
  } catch (err) {
    return { matchMethod: 'error', transactionCount: 0, assessed: false, error: err.message };
  }
}

function scoreCandidate(property, hmlr) {
  let score = 0;
  if (property.price > 0) score += 2;
  if (property.monthly_rent > 0) score += 1;
  if (property.uprn) score += 3;
  if (property.epb_count > 0) score += 4;
  if (hmlr.assessed) score += 2;
  if (/flat|apartment|maisonette/i.test(property.property_type || '')) score += 1;
  if (/terraced|detached|semi|house/i.test(property.property_type || '')) score += 1;
  return score;
}

async function pickSample(candidates) {
  const enriched = [];
  for (const property of candidates) {
    const hmlr = await hmlrMethod(property);
    enriched.push({ property, hmlr, evidenceScore: scoreCandidate(property, hmlr) });
  }
  enriched.sort((a, b) => b.evidenceScore - a.evidenceScore);

  const strongest = enriched[0];
  const weakest = [...enriched].sort((a, b) => a.evidenceScore - b.evidenceScore)[0];
  const withEpb = enriched.find((row) => row.property.epb_count > 0) || null;
  const withHmlr = enriched.find((row) => row.hmlr.assessed) || null;
  const house = enriched.find((row) => /house|terraced|detached|semi/i.test(row.property.property_type || '')) || strongest;
  const unit = enriched.find((row) => /flat|apartment|maisonette|unit/i.test(row.property.property_type || '')) || null;

  const picked = new Map();
  [
    ['strongest_evidence', strongest],
    ['weaker_evidence', weakest],
    withEpb ? ['epb_attached', withEpb] : null,
    withHmlr ? ['hmlr_context', withHmlr] : null,
    house ? ['house', house] : null,
    unit ? ['unit_like', unit] : null,
  ].filter(Boolean).forEach(([key, row]) => {
    if (row) picked.set(row.property.id, { key, ...row });
  });

  return {
    selectionCriteria: {
      boundedSample: true,
      noFabrication: true,
      rankedByEvidenceScore: true,
      roles: Array.from(picked.values()).map((row) => ({
        role: row.key,
        propertyId: row.property.id,
        title: row.property.title,
        type: row.property.property_type,
        price: row.property.price,
        rent: row.property.monthly_rent,
        uprn: row.property.uprn,
        epbCount: row.property.epb_count,
        hmlr: row.hmlr,
        evidenceScore: row.evidenceScore,
      })),
    },
    sample: Array.from(picked.values()),
  };
}

async function analyseProperty(property, job) {
  const report = await assemblePropertyIntelligenceReport({
    property,
    access: {
      allowed: true,
      userId: property.user_id || 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: property.id,
    },
    userId: property.user_id || 1,
    target: { propertyId: property.id },
    options: {
      decisionJob: job,
      skipExplanation: true,
      asOf: ASOF,
    },
  });
  return summarizeWorkspace(report);
}

async function main() {
  await ensureIntelligenceSchema();
  const inventory = await inventorySnapshot();
  const candidates = await loadPropertyCandidates();
  const { selectionCriteria, sample } = await pickSample(candidates);

  const results = [];
  for (const row of sample) {
    const property = row.property;
    const perJob = {};
    for (const job of JOBS) {
      perJob[job] = await analyseProperty(property, job);
    }
    results.push({
      role: row.key,
      propertyId: property.id,
      title: property.title,
      city: property.city,
      zip_code: property.zip_code,
      property_type: property.property_type,
      price: property.price,
      monthly_rent: property.monthly_rent,
      uprn: property.uprn,
      epb_count: property.epb_count,
      hmlr: row.hmlr,
      jobs: perJob,
    });
  }

  const output = {
    measuredAt: ASOF,
    inventory,
    selectionCriteria,
    results,
  };
  console.log(JSON.stringify(output, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
