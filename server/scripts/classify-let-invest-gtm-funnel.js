/**
 * Read-only LET_INVEST GTM funnel classifier.
 *
 * Derives privacy-minimised funnel stages from persisted ai_requests.
 * Does NOT print financial amounts by default.
 * Does NOT claim What-if usage (not persisted) — facilitator must set WHAT_IF_USED.
 *
 * Usage:
 *   node server/scripts/classify-let-invest-gtm-funnel.js --analysis-id <id>
 *   node server/scripts/classify-let-invest-gtm-funnel.js --property-id <id> --latest
 *   node server/scripts/classify-let-invest-gtm-funnel.js --dry-fixture path/to/output.json
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');

const OPERATING_KEYS = [
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
  'vacancyAssumption',
];
const FINANCE_KEYS = ['deposit', 'interestRate', 'mortgageTermYears'];

function presentedAvailable(investment, key) {
  const field = investment?.presented?.[key] || investment?.[key] || null;
  if (!field || typeof field !== 'object') return false;
  if (field.available === true) return true;
  if (field.state === 'ASSESSED' || field.state === 'assessed' || field.state === 'calculated') return true;
  return false;
}

function hasNumericInput(inputData, key) {
  const finance = inputData?.finance || inputData || {};
  const opex = finance.operatingCosts || inputData?.operatingCosts || {};
  const raw = finance[key] != null ? finance[key] : opex[key];
  if (raw == null || raw === '') return false;
  if (typeof raw === 'object' && raw.state === 'MISSING') return false;
  const n = Number(raw);
  return Number.isFinite(n);
}

function classifyFromPersisted({ id, property_id: propertyId, input_data: inputData, output_data: output }) {
  const job = output?.residentialDecisionContext?.decisionJob
    || output?.decisionJob
    || inputData?.decisionJob
    || null;

  const rentBasis = output?.investment?.presented?.rentBasis
    || output?.investment?.rentBasis
    || null;
  const rentKind = rentBasis?.kind || 'NONE';
  const rentOk = rentKind && rentKind !== 'NONE';

  const purchaseFromListing = Number(inputData?.purchasePrice ?? inputData?.finance?.purchasePrice);
  const purchaseOk = Number.isFinite(purchaseFromListing) && purchaseFromListing > 0
    || Boolean(output?.propertyFacts?.facts?.askingPrice?.available)
    || Boolean(output?.propertyFacts?.facts?.price?.available)
    || hasNumericInput(inputData, 'purchasePrice');

  const grossOk = presentedAvailable(output?.investment, 'grossYield');
  const noiOk = presentedAvailable(output?.investment, 'noi');
  const cfOk = presentedAvailable(output?.investment, 'annualCashFlow');
  const dscrOk = presentedAvailable(output?.investment, 'dscr');

  const pd = output?.personalDecision?.profile === 'landlord' ? output.personalDecision : null;
  const pdOk = Boolean(pd?.available);

  const opexComplete = OPERATING_KEYS.every((k) => hasNumericInput(inputData, k));
  const financeComplete = FINANCE_KEYS.every((k) => hasNumericInput(inputData, k));
  const underwritingStarted = OPERATING_KEYS.some((k) => hasNumericInput(inputData, k))
    || FINANCE_KEYS.some((k) => hasNumericInput(inputData, k));

  const funnel = {
    STARTED_ANALYSIS: true,
    RENT_BASIS_AVAILABLE: Boolean(rentOk),
    PURCHASE_PRICE_AVAILABLE: Boolean(purchaseOk),
    GROSS_YIELD_REACHED: Boolean(grossOk),
    UNDERWRITING_STARTED: Boolean(underwritingStarted),
    OPERATING_INPUTS_COMPLETE: Boolean(opexComplete),
    FINANCE_INPUTS_COMPLETE: Boolean(financeComplete),
    NOI_ASSESSED: Boolean(noiOk),
    CASHFLOW_ASSESSED: Boolean(cfOk),
    DSCR_ASSESSED: Boolean(dscrOk),
    LANDLORD_PD_ASSESSED: Boolean(pdOk),
    WHAT_IF_USED: null,
    ANALYSIS_COMPLETED: null,
  };

  const order = [
    'STARTED_ANALYSIS',
    'RENT_BASIS_AVAILABLE',
    'PURCHASE_PRICE_AVAILABLE',
    'GROSS_YIELD_REACHED',
    'UNDERWRITING_STARTED',
    'OPERATING_INPUTS_COMPLETE',
    'FINANCE_INPUTS_COMPLETE',
    'NOI_ASSESSED',
    'CASHFLOW_ASSESSED',
    'DSCR_ASSESSED',
    'LANDLORD_PD_ASSESSED',
  ];
  let farthest = 'STARTED_ANALYSIS';
  for (const stage of order) {
    if (funnel[stage] === true) farthest = stage;
  }

  return {
    analysisId: id || null,
    propertyId: propertyId || null,
    decisionJob: job,
    rentBasisKind: rentKind,
    marketSubstitutedForMissingListing: Boolean(rentBasis?.marketSubstitutedForMissingListing),
    findingCount: Array.isArray(output?.decisionIntelligence?.materialFindings)
      ? output.decisionIntelligence.materialFindings.length
      : null,
    missingUserInputCount: Array.isArray(output?.decisionWorkspace?.missingUnderwritingInputs?.items)
      ? output.decisionWorkspace.missingUnderwritingInputs.items.filter((i) => i.cause === 'MISSING_USER_INPUT').length
      : null,
    funnel,
    farthestStage: farthest,
    notes: {
      whatIfNotPersisted: true,
      amountsOmitted: true,
    },
  };
}

function parseArgs(argv) {
  const out = { analysisId: null, propertyId: null, latest: false, dryFixture: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--analysis-id') out.analysisId = argv[++i];
    else if (a === '--property-id') out.propertyId = argv[++i];
    else if (a === '--latest') out.latest = true;
    else if (a === '--dry-fixture') out.dryFixture = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryFixture) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.dryFixture), 'utf8'));
    const cases = raw.cases || raw.subjects || (Array.isArray(raw) ? raw : [raw]);
    const classified = cases.map((c, idx) => classifyFromPersisted({
      id: c.analysisId || c.id || `fixture-${idx}`,
      property_id: c.propertyId || c.property_id || null,
      input_data: c.input_data || c.inputData || c.financeBody || {},
      output_data: c.output || c.output_data || c.report || c,
    }));
    console.log(JSON.stringify({ source: 'dry-fixture', classified }, null, 2));
    return;
  }

  if (!args.analysisId && !args.propertyId) {
    console.error(JSON.stringify({
      error: 'Provide --analysis-id <id> or --property-id <id> [--latest], or --dry-fixture <path>',
      productionInstrumentation: 'none',
      measurementModel: 'ai_requests + facilitator script',
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const pool = require('../models/db');
  try {
    let row;
    if (args.analysisId) {
      const r = await pool.query(
        `SELECT id, property_id, input_data, output_data
         FROM ai_requests
         WHERE id = $1 AND request_type = 'property_intelligence'`,
        [args.analysisId]
      );
      row = r.rows[0];
    } else {
      const r = await pool.query(
        `SELECT id, property_id, input_data, output_data
         FROM ai_requests
         WHERE property_id = $1 AND request_type = 'property_intelligence'
         ORDER BY id DESC
         LIMIT 1`,
        [args.propertyId]
      );
      row = r.rows[0];
    }

    if (!row) {
      console.error(JSON.stringify({ error: 'analysis_not_found' }, null, 2));
      process.exitCode = 1;
      return;
    }

    const classified = classifyFromPersisted(row);
    console.log(JSON.stringify(classified, null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: String(err && err.message ? err.message : err) }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = { classifyFromPersisted };
