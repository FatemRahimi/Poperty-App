/**
 * V1.2 — Post-Comparable BUY/SELL Decision Pack Real-Product Validation
 * Read-only. Local HMLR + listing facts + workspace adapter only.
 * NO PropertyData / paid providers. NO fabricated asking prices or attributes.
 *
 * node server/scripts/validate-post-comparable-buy-sell-packs.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { buildOfficialTransactionComparableAssessment } = require('../services/market/officialTransactionComparableAssessment');
const { createPostgresOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');
const { buildResidentialDecisionWorkspace } = require('../services/ai/residentialDecisionWorkspace');
const { DECISION_JOB } = require('../architecture/decisionContextContract');
const { canonicalPropertyTypeToken } = require('../utils/canonicalPropertyType');

const ASOF = new Date().toISOString().slice(0, 10);

const HMLR_COHORT = [
  '{5834E4E8-9B5E-29C7-E063-4804A8C015BC}', // DL17 — ASSESSED
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}', // TN4 — ASSESSED
  '{5834E4E8-66CF-29C7-E063-4804A8C015BC}', // LU3 — MARKET_CONTEXT
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}', // LE5 — MARKET_CONTEXT
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}', // PE1 — MARKET_CONTEXT
  '{5834E4E9-880F-29C7-E063-4804A8C015BC}', // BD15 — MARKET_CONTEXT
];

const TYPE = { D: 'detached', S: 'semi-detached', T: 'terraced', F: 'flat' };

function summarizeComparable(ev) {
  if (!ev) return null;
  return {
    assessment: ev.assessment,
    evidenceStrength: ev.evidenceStrength,
    high: ev.similarityQuality?.high ?? null,
    medium: ev.similarityQuality?.medium ?? null,
    low: ev.similarityQuality?.low ?? null,
    defensibleComparableCount: ev.defensibleComparableCount ?? null,
    relevantMarketTransactionCount: ev.relevantMarketTransactionCount ?? null,
    observedComparableRange: ev.observedComparableRange || null,
    observedLocalTransactionRange: ev.observedLocalTransactionRange || null,
    observedComparableMedian: ev.observedComparableMedian || null,
    observedLocalMedian: ev.observedLocalMedian || null,
    message: ev.message || null,
    unresolved: (ev.unresolvedDependencies || []).slice(0, 3),
    investigationPriorities: (ev.investigationPriorities || []).slice(0, 3),
    limitations: (ev.limitations || []).slice(0, 5),
    notValuation: Boolean(ev.provenance?.notValuation),
  };
}

function summarizeKeyTile(row) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    state: row.state,
    available: row.available,
    value: row.value,
    whyItMatters: row.whyItMatters,
    howToResolve: row.howToResolve,
    whatNext: row.whatNext || null,
    notValuation: row.notValuation || null,
    notDefensibleComparable: row.notDefensibleComparable || null,
  };
}

function summarizePack(ws, job, extras = {}) {
  const key = (ws.keyIntelligence || []).map(summarizeKeyTile);
  return {
    job: ws.decisionJob || job,
    headline: ws.copy?.headline || null,
    notAdvice: ws.copy?.notAdvice || null,
    keyIntelligence: key,
    comparableTile: key.find((k) => k && k.id === 'comparable_sold_evidence') || null,
    valuationTile: key.find((k) => k && k.id === 'valuation_range') || null,
    pricePositionTile: key.find((k) => k && k.id === 'price_position') || null,
    buyerFitTile: key.find((k) => k && k.id === 'buyer_general_fit') || null,
    landlordFitTile: key.find((k) => k && k.id === 'landlord_fit') || null,
    grossYieldTile: key.find((k) => k && (k.id === 'grossYield' || /yield/i.test(k.label || ''))) || null,
    unresolved: (ws.unresolved || []).slice(0, 12).map((r) => ({
      id: r.id,
      label: r.label,
      state: r.state,
      whyItMatters: r.whyItMatters,
      howToResolve: r.howToResolve,
    })),
    nextActions: (ws.nextActions || []).slice(0, 12).map((r) => ({
      id: r.id,
      title: r.title,
      state: r.state,
      whyItMatters: r.whyItMatters,
      howToResolve: r.howToResolve,
    })),
    contextEvidence: (ws.contextEvidence || []).map((r) => ({
      id: r.id,
      label: r.label,
      state: r.state,
      available: r.available,
    })),
    hierarchy: {
      keyCount: key.length,
      unresolvedCount: (ws.unresolved || []).length,
      nextActionsCount: (ws.nextActions || []).length,
      contextEvidenceCount: (ws.contextEvidence || []).length,
      findingsCount: (ws.findings || []).length,
    },
    ...extras,
  };
}

function buildBuySellReport({ evidence, askingPriceGbp = null, includeLetMetrics = false }) {
  // Truthful when AVM/paid valuation is not invoked: valuation and price position stay NOT_ASSESSED.
  // Asking price may exist as a listing fact without becoming valuation intelligence.
  const sale = {
    success: false,
    notAssessed: true,
    message: 'No property-specific valuation assessed (AVM parked / not invoked in this validation path).',
  };
  const pricePosition = {
    available: false,
    notAssessed: true,
    message: askingPriceGbp != null
      ? 'Asking price is present on the listing, but price position is not assessed without a defensible valuation methodology.'
      : 'Price position requires assessed valuation and asking price.',
  };
  const report = {
    marketIntelligence: {
      sale,
      pricePosition,
      comparableSoldEvidence: evidence,
    },
    personalDecision: null,
    decisionIntelligence: { applicable: false, materialFindings: [], investigationPriorities: [] },
    propertyFacts: askingPriceGbp != null ? { askingPrice: askingPriceGbp, price: askingPriceGbp } : {},
    investment: includeLetMetrics
      ? {
          // Control placeholder only — LET metrics not invented; left empty so tiles stay NOT_ASSESSED
          // unless real assemble previously assessed (we do not fabricate).
        }
      : {},
    subjectAttributeGaps: [],
  };
  return report;
}

function packContainsForbiddenConclusions(pack) {
  const blob = JSON.stringify(pack);
  return /underpriced|overpriced|fair value|recommended (offer|asking)|good deal|bad deal|discount to market|premium to market/i.test(blob);
}

function qualitativeRubric(kind, notes) {
  return { kind, ...notes };
}

(async () => {
  await ensureIntelligenceSchema();
  const store = createPostgresOfficialSaleStore();

  const inventory = (await pool.query(`
    SELECT
      COUNT(*)::int AS properties,
      COUNT(*) FILTER (WHERE price IS NOT NULL AND price::numeric > 0)::int AS with_sale_asking,
      COUNT(*) FILTER (WHERE monthly_rent IS NOT NULL AND monthly_rent::numeric > 0)::int AS with_rent,
      COUNT(*) FILTER (WHERE zip_code IS NOT NULL AND BTRIM(zip_code) <> '')::int AS with_postcode
    FROM properties
  `)).rows[0];

  const hmlrRows = (await pool.query(
    `SELECT source_transaction_id, postcode, paon, saon, street, uprn, property_type_code, price_gbp, transfer_date
     FROM official_sale_transactions
     WHERE live AND source_transaction_id = ANY($1)
     ORDER BY source_transaction_id`,
    [HMLR_COHORT]
  )).rows;

  // Listings with real persisted asking prices (no fabrication). Cap for pack validation.
  const listings = (await pool.query(`
    SELECT
      p.id, p.title, p.zip_code, p.price, p.monthly_rent, p.bedrooms, p.bathrooms,
      p.property_type, p.house_number, p.address_line1, p.city,
      pi.paon, pi.saon, pi.uprn
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    WHERE p.zip_code IS NOT NULL AND BTRIM(p.zip_code) <> ''
      AND p.price IS NOT NULL AND p.price::numeric > 0
    ORDER BY p.id
    LIMIT 6
  `)).rows;

  const soldContextOnly = [];
  const soldContextPacks = [];

  for (const row of hmlrRows) {
    const evidence = await buildOfficialTransactionComparableAssessment({
      property: {
        postcode: row.postcode,
        property_type: TYPE[row.property_type_code] || 'terraced',
        property_type_code: row.property_type_code,
        paon: row.paon,
        saon: row.saon,
        uprn: row.uprn,
        excludeTransactionIds: [row.source_transaction_id],
      },
      identity: {
        postcode: row.postcode,
        paon: row.paon,
        saon: row.saon,
        uprn: row.uprn,
      },
      asOf: ASOF,
      store,
    });

    soldContextOnly.push({
      suitability: 'A_SOLD_CONTEXT_ONLY',
      reason: 'Official HMLR completed-sale subject. No legitimate live asking price in product path — do not fabricate.',
      tx: row.source_transaction_id,
      postcode: row.postcode,
      propertyTypeCode: row.property_type_code,
      subjectSoldPriceGbp: row.price_gbp != null ? Number(row.price_gbp) : null,
      comparable: summarizeComparable(evidence),
    });

    for (const job of [DECISION_JOB.BUY, DECISION_JOB.SELL]) {
      const report = buildBuySellReport({ evidence, askingPriceGbp: null });
      const ws = buildResidentialDecisionWorkspace({
        decisionContext: { decisionJob: job },
        report,
      });
      soldContextPacks.push({
        suitability: 'A_SOLD_CONTEXT_ONLY',
        tx: row.source_transaction_id,
        postcode: row.postcode,
        comparableState: evidence.assessment,
        pack: summarizePack(ws, job, { comparableEvidence: summarizeComparable(evidence) }),
      });
    }
  }

  const listingPacks = [];
  for (const listing of listings) {
    const asking = Number(listing.price);
    const token = canonicalPropertyTypeToken(listing.property_type || '') || null;
    const evidence = await buildOfficialTransactionComparableAssessment({
      property: {
        postcode: listing.zip_code,
        property_type: listing.property_type,
        paon: listing.paon || listing.house_number || null,
        saon: listing.saon || null,
        uprn: listing.uprn || null,
      },
      identity: {
        postcode: listing.zip_code,
        paon: listing.paon || listing.house_number || null,
        saon: listing.saon || null,
        uprn: listing.uprn || null,
      },
      asOf: ASOF,
      store,
    });

    for (const job of [DECISION_JOB.BUY, DECISION_JOB.SELL]) {
      const report = buildBuySellReport({ evidence, askingPriceGbp: asking });
      const ws = buildResidentialDecisionWorkspace({
        decisionContext: { decisionJob: job },
        report,
      });
      const pack = summarizePack(ws, job, {
        comparableEvidence: summarizeComparable(evidence),
        askingPriceGbp: asking,
        listingIdentity: {
          propertyId: listing.id,
          postcode: listing.zip_code,
          title: listing.title,
          propertyType: listing.property_type,
          propertyTypeToken: token,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          paon: listing.paon || listing.house_number || null,
          uprn: listing.uprn || null,
        },
      });
      listingPacks.push({
        suitability: 'B_ACTUAL_BUY_SELL_PACK',
        propertyId: listing.id,
        postcode: listing.zip_code,
        askingPriceGbp: asking,
        comparableState: evidence.assessment,
        job,
        pack,
        forbiddenConclusionsPresent: packContainsForbiddenConclusions(pack),
        askingVsSoldContext: {
          askingPriceGbp: asking,
          comparableMedianGbp: evidence.observedComparableMedian?.valueGbp ?? null,
          localMedianGbp: evidence.observedLocalMedian?.valueGbp ?? null,
          // Explicit: difference is recorded for boundary audit only — NOT a product conclusion.
          arithmeticDeltaToLocalMedianGbp:
            evidence.observedLocalMedian?.valueGbp != null
              ? asking - Number(evidence.observedLocalMedian.valueGbp)
              : null,
          productEmitsJudgement: false,
          note: 'Arithmetic delta must not appear as under/overpriced intelligence in the pack.',
        },
      });
    }
  }

  // LET_INVEST control: same listings, workspace without inventing finance — shows stronger job shape elsewhere.
  const letControl = [];
  for (const listing of listings.slice(0, 3)) {
    const report = {
      marketIntelligence: {
        sale: { success: false, notAssessed: true, message: 'Valuation not assessed in control path.' },
        pricePosition: { available: false },
        // Comps intentionally not on LET key spine
      },
      personalDecision: { profile: 'landlord', available: false, unavailableReason: 'Control path did not invent landlord PD dimensions.' },
      decisionIntelligence: {
        applicable: true,
        available: false,
        materialFindings: [],
        investigationPriorities: [
          { id: 'control_note', title: 'LET_INVEST normally surfaces DI priorities from assessed BTL metrics', howToResolve: 'Requires rent/finance evidence on full assemble path.' },
        ],
      },
      investment: {},
      propertyFacts: { askingPrice: Number(listing.price) },
    };
    const ws = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.LET_INVEST },
      report,
    });
    letControl.push({
      propertyId: listing.id,
      note: 'Control/reference only — sparse inputs; full LET actionability comes from rent+finance engines on live analyse.',
      pack: summarizePack(ws, DECISION_JOB.LET_INVEST),
      hasComparableOnKeySpine: (ws.keyIntelligence || []).some((k) => k.id === 'comparable_sold_evidence'),
    });
  }

  const assessedSold = soldContextOnly.filter((s) => s.comparable?.assessment === 'ASSESSED');
  const marketSold = soldContextOnly.filter((s) => s.comparable?.assessment === 'MARKET_CONTEXT');
  const listingAssessed = listingPacks.filter((p) => p.comparableState === 'ASSESSED');
  const listingMarket = listingPacks.filter((p) => p.comparableState === 'MARKET_CONTEXT');

  // Inspect ASSESSED vs MARKET_CONTEXT tile wording
  const assessedBuyTiles = soldContextPacks.filter((p) => p.comparableState === 'ASSESSED' && p.pack.job === 'BUY')
    .map((p) => ({
      postcode: p.postcode,
      label: p.pack.comparableTile?.label,
      state: p.pack.comparableTile?.state,
      available: p.pack.comparableTile?.available,
      value: p.pack.comparableTile?.value,
      why: p.pack.comparableTile?.whyItMatters,
      valuationState: p.pack.valuationTile?.state,
      pricePositionState: p.pack.pricePositionTile?.state,
      unresolvedTop: p.pack.unresolved.slice(0, 4),
      nextActionsTop: p.pack.nextActions.slice(0, 4),
    }));
  const marketBuyTiles = soldContextPacks.filter((p) => p.comparableState === 'MARKET_CONTEXT' && p.pack.job === 'BUY')
    .map((p) => ({
      postcode: p.postcode,
      label: p.pack.comparableTile?.label,
      state: p.pack.comparableTile?.state,
      available: p.pack.comparableTile?.available,
      value: p.pack.comparableTile?.value,
      why: p.pack.comparableTile?.whyItMatters,
      howToResolve: p.pack.comparableTile?.howToResolve,
      whatNext: p.pack.comparableTile?.whatNext,
      notDefensibleComparable: p.pack.comparableTile?.notDefensibleComparable,
      valuationState: p.pack.valuationTile?.state,
      pricePositionState: p.pack.pricePositionTile?.state,
      unresolvedTop: p.pack.unresolved.slice(0, 4),
      localRange: p.pack.comparableEvidence?.observedLocalTransactionRange || null,
      comparableRange: p.pack.comparableEvidence?.observedComparableRange || null,
    }));

  const productRubric = {
    BUY: qualitativeRubric('BUY', {
      SAVE_TIME: listingPacks.some((p) => p.job === 'BUY' && p.pack.comparableTile?.available) ? 'MEDIUM' : 'LOW',
      AVOID_EXPENSIVE_MISTAKES: 'MEDIUM',
      FIND_BETTER_OPPORTUNITIES: 'LOW',
      DECISION_CLARITY: 'MEDIUM',
      RISK_OF_USER_MISINTERPRETATION: marketBuyTiles.length ? 'HIGH' : 'MEDIUM',
      ACTIONABILITY: 'LOW',
      evidence: [
        'Key tiles populate with sold context without waiting for AVM.',
        'Valuation and price position remain NOT_ASSESSED even when asking exists.',
        'MARKET_CONTEXT shows wide district ranges with available=true — useful orientation, high misread risk as “comps/value”.',
        'No BUY decision synthesis (DI applicable=false); next actions are mostly unresolved valuation/fit gaps.',
      ],
    }),
    SELL: qualitativeRubric('SELL', {
      SAVE_TIME: 'MEDIUM',
      AVOID_EXPENSIVE_MISTAKES: 'MEDIUM',
      FIND_BETTER_OPPORTUNITIES: 'LOW',
      DECISION_CLARITY: 'MEDIUM',
      RISK_OF_USER_MISINTERPRETATION: 'HIGH',
      ACTIONABILITY: 'LOW',
      evidence: [
        'SELL key spine: valuation + price position + sold tile — first two usually empty.',
        'Sold context helps orientation before marketing; does not support asking strategy.',
        'No seller PD/DI; hierarchy still forces user to interpret sold stats vs listing ask mentally.',
      ],
    }),
    LET_INVEST_CONTROL: qualitativeRubric('LET_INVEST', {
      SAVE_TIME: 'HIGH',
      AVOID_EXPENSIVE_MISTAKES: 'HIGH',
      FIND_BETTER_OPPORTUNITIES: 'MEDIUM',
      DECISION_CLARITY: 'HIGH',
      RISK_OF_USER_MISINTERPRETATION: 'LOW',
      ACTIONABILITY: 'HIGH',
      evidence: [
        'Control reference from prior workspace validation + workspace contract: rent, yield, finance unlock, PD, DI V1.',
        'Comparable sold tile is intentionally absent from LET key spine.',
        'BUY/SELL lack equivalent assessed economic conclusions and investigation synthesis.',
      ],
    }),
  };

  const output = {
    study: 'V1.2_POST_COMPARABLE_BUY_SELL_DECISION_PACK_REAL_PRODUCT_VALIDATION',
    measuredAt: new Date().toISOString(),
    asOf: ASOF,
    paidProviderCalls: 0,
    method: {
      hmlrComparable: 'local official_sale_transactions store only',
      workspace: 'buildResidentialDecisionWorkspace',
      valuation: 'NOT invoked (parked AVM / truthful NOT_ASSESSED)',
      askingPrices: 'persisted listing price only when present',
      fabricatedAttributes: false,
      scrapedPortals: false,
    },
    inventoryAskingCoverage: inventory,
    cohortDefinition: {
      A_SOLD_CONTEXT_ONLY: {
        n: hmlrRows.length,
        source: 'Same 6 genuine HMLR PPD subjects (comparable v1.1 cohort)',
        suitableFor: 'Comparable state + BUY/SELL tile wording/hierarchy without asking price',
      },
      B_ACTUAL_BUY_SELL_PACK: {
        nListings: listings.length,
        source: 'Persisted properties with price > 0 and postcode',
        suitableFor: 'BUY/SELL packs with legitimate asking + local HMLR sold context; asking-vs-context boundary',
        listingIds: listings.map((l) => l.id),
      },
    },
    funnel: {
      hmlrAssessed: assessedSold.length,
      hmlrMarketContext: marketSold.length,
      listingPackRows: listingPacks.length,
      listingAssessedPackRows: listingAssessed.length,
      listingMarketContextPackRows: listingMarket.length,
      forbiddenConclusionsOnListingPacks: listingPacks.filter((p) => p.forbiddenConclusionsPresent).length,
    },
    soldContextOnly,
    assessedBuyTiles,
    marketBuyTiles,
    soldContextPacks,
    listingPacks,
    letControl,
    askingPriceBoundary: {
      inventoryWithSaleAsking: inventory.with_sale_asking,
      listingPacksWithAsking: listingPacks.length,
      productEmitsUnderOverpriced: listingPacks.some((p) => p.forbiddenConclusionsPresent),
      rule: 'Asking vs sold median arithmetic must not become valuation intelligence.',
      sampleDeltas: listingPacks.filter((p) => p.job === 'BUY').map((p) => p.askingVsSoldContext),
    },
    productRubric,
    marketContextValueClassificationCandidate: 'POTENTIALLY_MISLEADING',
    marketContextValueNotes: [
      'Label correctly says Local sold transaction context; state=INSUFFICIENT_EVIDENCE for comparable.',
      'available=true + large £ range still occupy key intelligence prime space.',
      'Users may treat district range as subject comps or fair value despite wording.',
    ],
    assessedIncrementalValueNotes: [
      'ASSESSED uses narrower HIGH-only range and label Comparable sold evidence.',
      'Still no asking reasonableness / subject value — incremental value is better sold-comp context, not a closed BUY/SELL decision.',
    ],
    dominantGapHypothesis: 'I_BUY_SELL_NOT_STRONG_ENOUGH_CURRENT_WEDGE',
  };

  const outPath = path.join(__dirname, 'validate-post-comparable-buy-sell-packs-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    outPath,
    funnel: output.funnel,
    inventoryAskingCoverage: inventory,
    assessedLabels: assessedBuyTiles.map((t) => `${t.postcode}:${t.label}/${t.state}`),
    marketLabels: marketBuyTiles.map((t) => `${t.postcode}:${t.label}/${t.state}`),
    askingBoundaryForbidden: output.askingPriceBoundary.productEmitsUnderOverpriced,
  }, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
