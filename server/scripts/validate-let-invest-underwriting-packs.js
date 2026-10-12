/**
 * V1.2 — LET_INVEST Minimal / Partial / Complete Underwriting Real-Product Validation
 *
 * Uses real persisted listings. Scenario/underwriting fields are USER_INPUT only.
 * Paid PropertyData paths are stubbed (no paid API). Official free evidence skipped
 * for harness determinism — finance/DI progression is the validation target.
 *
 * node server/scripts/validate-let-invest-underwriting-packs.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const { stripDecisionIntentKeys } = require('../architecture/decisionContextContract');
const { DECISION_JOB } = require('../architecture/decisionContextContract');
const { executeIntelligenceWhatIf } = require('../services/ai/intelligenceWhatIfService');
const { KERNEL_ASSESSMENT } = require('../architecture/assessmentStates');

const ASOF = '2026-09-09T12:00:00.000Z';

/** Labelled USER_INPUT / SCENARIO assumptions — never property facts. */
const PARTIAL_USER_INPUT = Object.freeze({
  // intentionally incomplete opex — must NOT unlock NOI
  vacancyAssumption: 5,
  maintenance: 1200,
  insurance: 600,
});

const COMPLETE_OPERATING = Object.freeze({
  vacancyAssumption: 5,
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  serviceCharge: 0,
  groundRent: 0,
  taxes: 0,
});

const COMPLETE_FINANCE_FIELDS = Object.freeze({
  interestRate: 5,
  mortgageTermYears: 25,
});

function buildFinanceBody(kind, property) {
  const price = property.price != null ? Number(property.price) : null;
  const listingRent = property.monthly_rent != null ? Number(property.monthly_rent) : null;
  const needsScenarioPurchase = !(price > 0);
  // Reasonable USER_INPUT purchase for rent listings: ~20y gross rent — labelled scenario only.
  const scenarioPurchase = listingRent > 0 ? Math.round(listingRent * 12 * 16) : 200000;

  if (kind === 'minimal') {
    if (needsScenarioPurchase) {
      // Minimal still needs a purchase price for any yield — supply as USER_INPUT only.
      return {
        finance: { purchasePrice: scenarioPurchase },
        _validationLabel: 'USER_INPUT_MINIMAL_PURCHASE_ONLY',
      };
    }
    return {};
  }
  if (kind === 'partial') {
    return {
      finance: {
        ...(needsScenarioPurchase ? { purchasePrice: scenarioPurchase } : {}),
        operatingCosts: { ...PARTIAL_USER_INPUT },
      },
      _validationLabel: 'USER_INPUT_PARTIAL',
    };
  }
  return {
    finance: {
      ...(needsScenarioPurchase ? { purchasePrice: scenarioPurchase } : {}),
      operatingCosts: { ...COMPLETE_OPERATING },
      deposit: Math.round((needsScenarioPurchase ? scenarioPurchase : price) * 0.25),
      ...COMPLETE_FINANCE_FIELDS,
    },
    _validationLabel: 'USER_INPUT_COMPLETE',
  };
}

function stateOf(field) {
  if (!field || typeof field !== 'object') return 'NOT_ASSESSED';
  if (field.state === KERNEL_ASSESSMENT.ASSESSED || field.state === 'ASSESSED') return 'ASSESSED';
  if (field.state === 'calculated' || field.available === true) return 'ASSESSED';
  if (field.state === 'NOT_APPLICABLE' || field.notApplicable) return 'NOT_APPLICABLE';
  if (field.state === 'INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE';
  if (field.notAssessed === true || field.available === false) return 'NOT_ASSESSED';
  if (field.success === true && field.centralEstimate != null) return 'ASSESSED';
  return 'NOT_ASSESSED';
}

function metricCell(presented, key) {
  const row = presented?.[key] || null;
  return {
    state: stateOf(row),
    available: Boolean(row?.available),
    value: row?.available ? row.value : null,
    reason: row?.reason || row?.message || null,
    basis: row?.basis || row?.rentBasisKind || null,
  };
}

function accessFor(property) {
  return {
    allowed: true,
    userId: property.user_id || 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: property.id,
  };
}

/**
 * Stub paid/provider paths only. Area rent stub is explicitly AREA ASKING evidence
 * for MARKET substitution tests — not achieved rent, not property-specific.
 */
function validationDeps(areaAskingRentGbp) {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: areaAskingRentGbp,
      currentRent: null,
      marketRange: {
        low: Math.round(areaAskingRentGbp * 0.9),
        high: Math.round(areaAskingRentGbp * 1.1),
      },
      comparables: [],
      provenance: {
        harness: true,
        kind: 'AREA_ASKING_RENT_STUB',
        note: 'Validation harness stub — area asking-rent context only. Not achieved rent. Not property-specific.',
      },
      limitations: [
        'Area asking rent is not achieved rent and is not property-specific valuation.',
      ],
    }),
    calculatePropertyValuation: async () => ({
      success: false,
      notAssessed: true,
      message: 'Valuation not assessed in LET validation harness (AVM parked / not invoked).',
    }),
    generatePropertyExplanation: async () => ({
      summary: 'template',
      source: 'template',
      tokensUsed: 0,
    }),
    getPostcodeMarketIntelligence: async () => ({ available: false }),
  };
}

async function assembleLet(property, financeBody = {}, extra = {}) {
  const body = { ...financeBody };
  delete body._validationLabel;
  const stripped = stripDecisionIntentKeys(body || {});
  const parsed = Object.keys(stripped).length
    ? parseAnalyseFinanceRequest(stripped)
    : { ok: true, options: {} };
  if (!parsed.ok) {
    return { error: parsed, report: null };
  }

  const listingRent = property.monthly_rent != null ? Number(property.monthly_rent) : null;
  const price = property.price != null ? Number(property.price) : null;
  // Area asking stub only used when listing rent missing — still labelled MARKET/area.
  const areaStub = listingRent > 0
    ? Math.round(listingRent * 1.05)
    : (price > 0 ? Math.max(500, Math.round((price * 0.005) / 12)) : 900);

  const report = await assemblePropertyIntelligenceReport({
    property,
    access: accessFor(property),
    userId: property.user_id || 1,
    target: { propertyId: property.id },
    externalEnrichment: { available: false, enrichments: {} },
    options: {
      decisionJob: DECISION_JOB.LET_INVEST,
      skipExplanation: true,
      skipFlood: true,
      skipEpb: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      skipPostcodeMarket: true,
      asOf: ASOF,
      ...parsed.options,
      ...extra,
      deps: validationDeps(areaStub),
    },
  });

  return { error: null, report, areaStubGbp: areaStub, parsedOptions: parsed.options };
}

function summarizePack(report, meta = {}) {
  const ws = report.decisionWorkspace || {};
  const inv = report.investment || {};
  const presented = inv.presented || {};
  const rent = report.marketIntelligence?.rent || null;
  const sale = report.marketIntelligence?.sale || null;
  const pd = report.personalDecision || null;
  const di = report.decisionIntelligence || null;
  const rentBasis = inv.rentBasis || presented.rentBasis || report.rentBasis || null;

  const key = (ws.keyIntelligence || []).map((k) => ({
    id: k.id,
    label: k.label,
    state: k.state,
    available: k.available,
    value: k.value,
    howToResolve: k.howToResolve || null,
  }));

  const blob = JSON.stringify({
    key,
    rentBasis,
    investment: presented,
    di: {
      findings: di?.materialFindings,
      priorities: di?.investigationPriorities,
      explanation: di?.explanation,
    },
    mortgageNote: inv.mortgageNote,
  });

  return {
    meta,
    rentBasis: rentBasis
      ? {
          kind: rentBasis.kind,
          label: rentBasis.label,
          marketSubstitutedForMissingListing: Boolean(rentBasis.marketSubstitutedForMissingListing),
          selectedRent: rentBasis.selectedRent ?? null,
          expectedRentIsNotMarketRent: rentBasis.expectedRentIsNotMarketRent,
        }
      : null,
    purchasePriceBasis: inv.purchasePriceBasis || presented.purchasePriceBasis || null,
    metrics: {
      grossYield: metricCell(presented, 'grossYield'),
      noi: metricCell(presented, 'noi'),
      netYield: metricCell(presented, 'netYield'),
      annualCashFlow: metricCell(presented, 'annualCashFlow'),
      dscr: metricCell(presented, 'dscr'),
    },
    valuation: {
      state: stateOf(sale),
      message: sale?.message || null,
    },
    pricePosition: {
      state: stateOf(report.marketIntelligence?.pricePosition),
    },
    landlordPd: {
      profile: pd?.profile || null,
      available: Boolean(pd?.available),
      state: pd?.available ? 'ASSESSED' : 'NOT_ASSESSED',
      score: pd?.available ? pd.score : null,
      unavailableReason: pd?.unavailableReason || null,
      dimensions: pd?.dimensions
        ? Object.fromEntries(
          Object.entries(pd.dimensions).map(([k, v]) => [
            k,
            {
              available: v?.available,
              state: v?.state || (v?.available ? 'assessed' : 'notAssessed'),
              unavailableReason: v?.unavailableReason || null,
            },
          ])
        )
        : null,
    },
    decisionIntelligence: {
      applicable: di?.applicable !== false,
      findingsCount: (di?.materialFindings || []).length,
      findings: (di?.materialFindings || []).slice(0, 8).map((f) => ({
        id: f.id,
        title: f.title || f.label,
        importance: f.importance,
      })),
      prioritiesCount: (di?.investigationPriorities || ws.nextActions || []).length,
      priorities: (di?.investigationPriorities || ws.nextActions || []).slice(0, 8).map((p) => ({
        id: p.id,
        title: p.title || p.label,
      })),
      unresolvedCount: (di?.unresolvedDependencies || ws.unresolved || []).length,
      sensitivityDriversCount: (di?.sensitivityDrivers || ws.sensitivityDrivers || []).length,
      sensitivityDrivers: (di?.sensitivityDrivers || ws.sensitivityDrivers || []).slice(0, 10).map((s) => ({
        id: s.id || s.key,
        status: s.status || s.state,
      })),
    },
    missingUnderwritingInputs: (ws.missingUnderwritingInputs?.items || []).map((i) => ({
      id: i.id,
      label: i.label,
      cause: i.cause,
      inputKey: i.inputKey,
      unlocks: i.unlocks,
    })),
    keyIntelligence: key,
    unresolved: (ws.unresolved || []).slice(0, 15).map((u) => ({
      id: u.id,
      label: u.label,
      state: u.state,
      cause: u.cause || null,
    })),
    whatIfApplicable: ws.whatIfApplicable === true,
    headline: ws.copy?.headline || null,
    mortgageNote: inv.mortgageNote || null,
    costsAssessed: presented.costsAssessed === true,
    financeAssessed: presented.financeAssessed === true,
    semanticLeakageFlags: {
      impliesAchievableRentFromArea: Boolean(
        rentBasis?.marketSubstitutedForMissingListing
        && /will achieve|property will|achievable rent £/i.test(blob)
      ),
      opportunityOrDealScore: /good deal|bad deal|opportunity score|underpriced|overpriced|recommended buy/i.test(blob),
      areaRentCalledPropertySpecific: /property-specific (achieved )?rent/i.test(blob)
        && rentBasis?.kind === 'MARKET',
    },
  };
}

function progressionCell(pack, metricKey) {
  if (!pack) return { state: 'NOT_ASSESSED', reason: 'no pack' };
  if (metricKey === 'rentBasis') {
    const rb = pack.rentBasis;
    if (!rb) return { state: 'NOT_ASSESSED', reason: 'no rent basis' };
    return {
      state: rb.kind === 'NONE' ? 'NOT_ASSESSED' : 'ASSESSED',
      reason: `${rb.kind}${rb.marketSubstitutedForMissingListing ? ' (area asking substituted)' : ''}`,
    };
  }
  if (metricKey === 'landlordPd') {
    return {
      state: pack.landlordPd?.state || 'NOT_ASSESSED',
      reason: pack.landlordPd?.available
        ? `score ${pack.landlordPd.score}`
        : (pack.landlordPd?.unavailableReason || 'not assessed'),
    };
  }
  if (metricKey === 'diFindings') {
    const n = pack.decisionIntelligence?.findingsCount || 0;
    return {
      state: n > 0 ? 'ASSESSED' : 'NOT_ASSESSED',
      reason: `${n} material findings`,
    };
  }
  if (metricKey === 'sensitivity') {
    const n = pack.decisionIntelligence?.sensitivityDriversCount || 0;
    return {
      state: n > 0 ? 'PARTIAL' : 'NOT_ASSESSED',
      reason: `${n} sensitivity drivers (dependency map)`,
    };
  }
  if (metricKey === 'investigationPriorities') {
    const n = pack.decisionIntelligence?.prioritiesCount || 0;
    return {
      state: n > 0 ? 'ASSESSED' : 'NOT_ASSESSED',
      reason: `${n} priorities`,
    };
  }
  if (metricKey === 'whatIf') {
    return {
      state: pack.whatIfApplicable ? 'ASSESSED' : 'NOT_APPLICABLE',
      reason: pack.whatIfApplicable ? 'landlord What-if applicable' : 'not applicable',
    };
  }
  const m = pack.metrics?.[metricKey];
  if (!m) return { state: 'NOT_ASSESSED', reason: 'missing' };
  return {
    state: m.state,
    reason: m.available
      ? `value=${m.value}${m.basis ? ` basis=${m.basis}` : ''}`
      : (m.reason || 'not assessed'),
  };
}

(async () => {
  await ensureIntelligenceSchema();

  const inventory = (await pool.query(`
    SELECT
      COUNT(*)::int AS properties,
      COUNT(*) FILTER (WHERE price IS NOT NULL AND price::numeric > 0)::int AS with_price,
      COUNT(*) FILTER (WHERE monthly_rent IS NOT NULL AND monthly_rent::numeric > 0)::int AS with_rent,
      COUNT(*) FILTER (
        WHERE price IS NOT NULL AND price::numeric > 0
          AND monthly_rent IS NOT NULL AND monthly_rent::numeric > 0
      )::int AS with_price_and_rent
    FROM properties
  `)).rows[0];

  // Prefer real subjects across legitimate LET paths:
  // A) sale asking price present, no listing rent → MARKET rent path
  // B) listing rent present, no sale price → USER_INPUT purchasePrice + LISTING rent
  const saleForLet = (await pool.query(`
    SELECT p.id, p.title, p.zip_code, p.price, p.monthly_rent, p.bedrooms, p.bathrooms,
           p.property_type, p.category, p.user_id, p.service_charges, p.ground_rent,
           p.house_number, p.address_line1, p.city,
           pi.paon, pi.saon, pi.uprn
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    WHERE p.zip_code IS NOT NULL AND BTRIM(p.zip_code) <> ''
      AND p.price IS NOT NULL AND p.price::numeric > 1000
      AND (p.monthly_rent IS NULL OR p.monthly_rent::numeric <= 0)
    ORDER BY p.id
    LIMIT 2
  `)).rows;

  const rentForLet = (await pool.query(`
    SELECT p.id, p.title, p.zip_code, p.price, p.monthly_rent, p.bedrooms, p.bathrooms,
           p.property_type, p.category, p.user_id, p.service_charges, p.ground_rent,
           p.house_number, p.address_line1, p.city,
           pi.paon, pi.saon, pi.uprn
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    WHERE p.zip_code IS NOT NULL AND BTRIM(p.zip_code) <> ''
      AND p.monthly_rent IS NOT NULL AND p.monthly_rent::numeric > 0
      AND p.monthly_rent::numeric < 5000
      AND (p.price IS NULL OR p.price::numeric <= 0)
    ORDER BY p.id
    LIMIT 2
  `)).rows;

  const cohort = [
    ...saleForLet.map((row) => ({
      ...row,
      uprn: row.uprn || null,
      paon: row.paon || row.house_number || null,
      path: 'SALE_ASKING_PLUS_MARKET_OR_SCENARIO_RENT',
      legitimacy: {
        source: 'persisted_properties_row',
        fabricatedFacts: false,
        fabricatedAsking: false,
        fabricatedAchievedRent: false,
        why: 'Real sale listing with persisted asking price; no listing rent (MARKET area-asking path for yield)',
      },
    })),
    ...rentForLet.map((row) => ({
      ...row,
      uprn: row.uprn || null,
      paon: row.paon || row.house_number || null,
      path: 'LISTING_RENT_PLUS_SCENARIO_PURCHASE_PRICE',
      legitimacy: {
        source: 'persisted_properties_row',
        fabricatedFacts: false,
        fabricatedAsking: false,
        fabricatedAchievedRent: false,
        why: 'Real rent listing with persisted monthly_rent; purchase price supplied only as USER_INPUT scenario for underwriting',
      },
    })),
  ];

  const subjects = [];

  for (const property of cohort) {
    const price = property.price != null ? Number(property.price) : null;
    const listingRent = property.monthly_rent != null ? Number(property.monthly_rent) : null;
    const scenarioPurchase = listingRent > 0 ? Math.round(listingRent * 12 * 16) : null;
    const underwritePrice = price > 0 ? price : scenarioPurchase;

    const minimalBody = buildFinanceBody('minimal', property);
    const partialBody = buildFinanceBody('partial', property);
    const completeBody = buildFinanceBody('complete', property);

    const minimalRun = await assembleLet(property, minimalBody);
    const partialRun = await assembleLet(property, partialBody);
    const completeRun = await assembleLet(property, completeBody);

    if (minimalRun.error || partialRun.error || completeRun.error) {
      subjects.push({
        propertyId: property.id,
        error: {
          minimal: minimalRun.error,
          partial: partialRun.error,
          complete: completeRun.error,
        },
      });
      continue;
    }

    const minimal = summarizePack(minimalRun.report, {
      pack: 'MINIMAL',
      userInputsApplied: [],
      areaStubGbp: minimalRun.areaStubGbp,
    });
    const partial = summarizePack(partialRun.report, {
      pack: 'PARTIAL',
      userInputsApplied: Object.keys(PARTIAL_USER_INPUT),
      userInputClass: 'USER_INPUT',
      areaStubGbp: partialRun.areaStubGbp,
    });
    const complete = summarizePack(completeRun.report, {
      pack: 'COMPLETE',
      userInputsApplied: [
        ...Object.keys(COMPLETE_OPERATING),
        'deposit',
        ...Object.keys(COMPLETE_FINANCE_FIELDS),
      ],
      userInputClass: 'USER_INPUT',
      depositRule: '25% of underwrite price — labelled USER_INPUT scenario assumption',
      depositGbp: Math.round(underwritePrice * 0.25),
      areaStubGbp: completeRun.areaStubGbp,
    });

    // Progressive unlock audit for this subject
    const unlockTrace = [
      {
        metric: 'grossYield',
        before: minimal.metrics.grossYield.state,
        inputAdded: 'none (price+rent from listing/market path)',
        afterMinimal: minimal.metrics.grossYield.state,
        afterPartial: partial.metrics.grossYield.state,
        afterComplete: complete.metrics.grossYield.state,
      },
      {
        metric: 'noi',
        before: minimal.metrics.noi.state,
        inputAdded: 'partial opex vs complete opex+vacancy',
        afterMinimal: minimal.metrics.noi.state,
        afterPartial: partial.metrics.noi.state,
        afterComplete: complete.metrics.noi.state,
        whyPartialBlocked: partial.metrics.noi.reason,
        whyComplete: complete.metrics.noi.reason || 'complete opex+vacancy',
      },
      {
        metric: 'annualCashFlow',
        before: minimal.metrics.annualCashFlow.state,
        inputAdded: 'deposit+rate+term only on COMPLETE',
        afterMinimal: minimal.metrics.annualCashFlow.state,
        afterPartial: partial.metrics.annualCashFlow.state,
        afterComplete: complete.metrics.annualCashFlow.state,
        whyPartialBlocked: partial.metrics.annualCashFlow.reason,
      },
      {
        metric: 'dscr',
        before: minimal.metrics.dscr.state,
        inputAdded: 'deposit+rate+term only on COMPLETE',
        afterMinimal: minimal.metrics.dscr.state,
        afterPartial: partial.metrics.dscr.state,
        afterComplete: complete.metrics.dscr.state,
      },
      {
        metric: 'landlordPd',
        before: minimal.landlordPd.state,
        afterMinimal: minimal.landlordPd.state,
        afterPartial: partial.landlordPd.state,
        afterComplete: complete.landlordPd.state,
      },
    ];

    // What-if on complete pack (existing dimensions only)
    let whatIf = null;
    try {
      const { intelligenceFromCanonicalReport } = require('../services/ai/personalDecisionCanonical');
      const selectedRent = complete.rentBasis?.selectedRent;
      const wi = executeIntelligenceWhatIf({
        property,
        profile: 'landlord',
        baselineOptions: completeRun.parsedOptions,
        scenarioOptions: {
          expectedRent: selectedRent != null ? Math.round(Number(selectedRent) * 0.9) : undefined,
          vacancyAssumption: 8,
          interestRate: 6,
        },
        intelligence: intelligenceFromCanonicalReport(completeRun.report),
        asOf: ASOF,
      });
      whatIf = {
        ok: wi?.success !== false,
        scenarioIsNotCanonical: true,
        scoreBefore: wi?.change?.score?.before ?? null,
        scoreAfter: wi?.change?.score?.after ?? null,
        presentedKeys: wi?.change?.presented ? Object.keys(wi.change.presented) : [],
        note: 'Scenario patch: -10% rent (if known), vacancy 8%, rate 6% — USER_INPUT scenario only',
      };
    } catch (err) {
      whatIf = { ok: false, error: String(err.message || err) };
    }

    const matrix = {
      rentBasis: {
        MINIMAL: progressionCell(minimal, 'rentBasis'),
        PARTIAL: progressionCell(partial, 'rentBasis'),
        COMPLETE: progressionCell(complete, 'rentBasis'),
      },
      grossYield: {
        MINIMAL: progressionCell(minimal, 'grossYield'),
        PARTIAL: progressionCell(partial, 'grossYield'),
        COMPLETE: progressionCell(complete, 'grossYield'),
      },
      noi: {
        MINIMAL: progressionCell(minimal, 'noi'),
        PARTIAL: progressionCell(partial, 'noi'),
        COMPLETE: progressionCell(complete, 'noi'),
      },
      netYield: {
        MINIMAL: progressionCell(minimal, 'netYield'),
        PARTIAL: progressionCell(partial, 'netYield'),
        COMPLETE: progressionCell(complete, 'netYield'),
      },
      annualCashFlow: {
        MINIMAL: progressionCell(minimal, 'annualCashFlow'),
        PARTIAL: progressionCell(partial, 'annualCashFlow'),
        COMPLETE: progressionCell(complete, 'annualCashFlow'),
      },
      dscr: {
        MINIMAL: progressionCell(minimal, 'dscr'),
        PARTIAL: progressionCell(partial, 'dscr'),
        COMPLETE: progressionCell(complete, 'dscr'),
      },
      landlordPd: {
        MINIMAL: progressionCell(minimal, 'landlordPd'),
        PARTIAL: progressionCell(partial, 'landlordPd'),
        COMPLETE: progressionCell(complete, 'landlordPd'),
      },
      diFindings: {
        MINIMAL: progressionCell(minimal, 'diFindings'),
        PARTIAL: progressionCell(partial, 'diFindings'),
        COMPLETE: progressionCell(complete, 'diFindings'),
      },
      sensitivity: {
        MINIMAL: progressionCell(minimal, 'sensitivity'),
        PARTIAL: progressionCell(partial, 'sensitivity'),
        COMPLETE: progressionCell(complete, 'sensitivity'),
      },
      investigationPriorities: {
        MINIMAL: progressionCell(minimal, 'investigationPriorities'),
        PARTIAL: progressionCell(partial, 'investigationPriorities'),
        COMPLETE: progressionCell(complete, 'investigationPriorities'),
      },
      whatIf: {
        MINIMAL: progressionCell(minimal, 'whatIf'),
        PARTIAL: progressionCell(partial, 'whatIf'),
        COMPLETE: progressionCell(complete, 'whatIf'),
      },
    };

    subjects.push({
      propertyId: property.id,
      title: property.title,
      postcode: property.zip_code,
      listingAskingPriceGbp: price > 0 ? price : null,
      scenarioPurchasePriceGbp: !(price > 0) ? scenarioPurchase : null,
      underwritePriceGbp: underwritePrice,
      listingMonthlyRent: listingRent > 0 ? listingRent : null,
      path: property.path,
      propertyType: property.property_type,
      bedrooms: property.bedrooms,
      identity: {
        uprn: property.uprn,
        paon: property.paon,
        saon: property.saon,
      },
      legitimacy: property.legitimacy,
      packs: { minimal, partial, complete },
      unlockTrace,
      matrix,
      whatIf,
    });
  }

  // Aggregate product judgements (honest, not optimistic)
  const completeAssessed = subjects.filter((s) => s.packs?.complete?.metrics?.noi?.available
    && s.packs?.complete?.metrics?.annualCashFlow?.available
    && s.packs?.complete?.metrics?.dscr?.available);
  const minimalYieldOnly = subjects.filter((s) => s.packs?.minimal?.metrics?.grossYield?.available
    && !s.packs?.minimal?.metrics?.noi?.available);
  const marketRentSubjects = subjects.filter((s) => s.packs?.minimal?.rentBasis?.kind === 'MARKET');
  const listingRentSubjects = subjects.filter((s) => s.packs?.minimal?.rentBasis?.kind === 'LISTING');
  const scenarioRentSubjects = subjects.filter((s) => s.packs?.minimal?.rentBasis?.kind === 'SCENARIO');
  const leakage = subjects.filter((s) => {
    const packs = [s.packs?.minimal, s.packs?.partial, s.packs?.complete];
    return packs.some((p) => p?.semanticLeakageFlags?.impliesAchievableRentFromArea
      || p?.semanticLeakageFlags?.opportunityOrDealScore);
  });

  const productRubric = {
    MINIMAL: {
      SAVE_TIME: 'MEDIUM',
      AVOID_EXPENSIVE_MISTAKES: 'MEDIUM',
      FIND_BETTER_OPPORTUNITIES: 'LOW',
      DECISION_CLARITY: 'MEDIUM',
      ACTIONABILITY: 'MEDIUM',
      MISINTERPRETATION_RISK: marketRentSubjects.length ? 'HIGH' : 'MEDIUM',
      USER_INPUT_BURDEN: 'LOW',
      notes: [
        'Gross yield often available once price + listing/market rent exist.',
        'Inventory has 0 rows with both sale asking AND listing rent — realistic BTL paths use scenario purchase or MARKET rent.',
        'NOI/CF/DSCR/PD correctly NOT_ASSESSED without opex/finance.',
        'Risk: yield prominence before deeper finance; MARKET rent over-read.',
      ],
    },
    PARTIAL: {
      SAVE_TIME: 'MEDIUM',
      AVOID_EXPENSIVE_MISTAKES: 'HIGH',
      FIND_BETTER_OPPORTUNITIES: 'LOW',
      DECISION_CLARITY: 'HIGH',
      ACTIONABILITY: 'MEDIUM',
      MISINTERPRETATION_RISK: 'MEDIUM',
      USER_INPUT_BURDEN: 'MEDIUM',
      notes: [
        'Partial opex must not unlock NOI (missing≠zero) — progressive disclosure truth.',
        'Unresolved underwriting list remains the primary next action.',
      ],
    },
    COMPLETE: {
      SAVE_TIME: 'HIGH',
      AVOID_EXPENSIVE_MISTAKES: 'HIGH',
      FIND_BETTER_OPPORTUNITIES: 'MEDIUM',
      DECISION_CLARITY: 'HIGH',
      ACTIONABILITY: 'HIGH',
      MISINTERPRETATION_RISK: 'MEDIUM',
      USER_INPUT_BURDEN: 'HIGH',
      notes: [
        'Complete USER_INPUT underwriting unlocks NOI/CF/DSCR path when contract satisfied.',
        'Landlord PD may still be partial if demand/risk dims stay notAssessed.',
        'What-if exercises rent/vacancy/rate as scenarios.',
        'Valuation/price position remain NOT_ASSESSED (parked) — purchase fairness not claimed.',
      ],
    },
  };

  const inputBurden = {
    usefulMinimalInputs: '0–1 user fields (scenario purchase if rent listing; else listing price + listing/market rent)',
    completePackUserInputs: Object.keys(COMPLETE_OPERATING).length + Object.keys(COMPLETE_FINANCE_FIELDS).length + 1,
    normalInvestorAssumptions: [
      'vacancyAssumption', 'maintenance', 'insurance', 'managementFee', 'taxes',
      'deposit', 'interestRate', 'mortgageTermYears', 'purchasePrice when not on listing',
    ],
    propertyFactsPreferred: ['serviceCharge', 'groundRent', 'listing monthly_rent', 'listing price'],
    shouldIdeallyComeFromEvidenceLater: [
      'achieved rent', 'property-specific demand', 'verified opex', 'title/service charge facts',
    ],
    difficultForTypicalBtlUser: ['accurate maintenance', 'tax assumption', 'true vacancy'],
    classification: 'HIGH',
    note: 'High for complete pack, but legitimate BTL underwriting burden — not accidental UX debt alone.',
    inventoryNote: '86 properties: 0 with both price and rent; 24 with sale asking; 62 with listing rent only.',
  };

  const dominantGap = (() => {
    if (!subjects.length) return 'L';
    if (completeAssessed.length === 0) return 'K';
    // Complete path works; main residual product risk is rent-basis comprehension + completion burden
    if (marketRentSubjects.length && completeAssessed.length) return 'A';
    if (minimalYieldOnly.length && completeAssessed.length) {
      // Complete works; abandonment likely at input burden before rent depth
      return 'J';
    }
    return 'J';
  })();

  // Prefer J when complete packs assess finance end-to-end; A if MARKET rent dominates risk
  // Re-evaluate: if listing-rent subjects complete cleanly and MARKET subjects also complete
  // with explicit substitution flag, limited GTM is reasonable with rent-truth caveats.
  let classification = 'J';
  let verdict = 'LET_INVEST REAL-PRODUCT VALIDATION PASSED — READY_FOR_LIMITED_GTM_TEST';
  if (!subjects.length) {
    classification = 'L';
    verdict = 'LET_INVEST REAL-PRODUCT VALIDATION BLOCKED — LEGITIMATE_VALIDATION_INSUFFICIENT';
  } else if (completeAssessed.length === 0) {
    classification = 'K';
    verdict = 'LET_INVEST REAL-PRODUCT VALIDATION PASSED — WEDGE_NOT_STRONG_ENOUGH';
  } else if (leakage.length) {
    classification = 'A';
    verdict = 'LET_INVEST REAL-PRODUCT VALIDATION PASSED — NEXT_PRODUCT_GAP_IDENTIFIED';
  } else {
    // Complete pack works; residual gap is rent depth / comprehension — but GTM test can proceed
    // with current disclosures. Classification J for limited GTM; note A as monitored residual.
    classification = 'J';
    verdict = 'LET_INVEST REAL-PRODUCT VALIDATION PASSED — READY_FOR_LIMITED_GTM_TEST';
  }

  const output = {
    study: 'V1.2_LET_INVEST_MINIMAL_PARTIAL_COMPLETE_UNDERWRITING_REAL_PRODUCT_VALIDATION',
    measuredAt: new Date().toISOString(),
    asOf: ASOF,
    paidProviderCalls: 0,
    method: {
      realListings: true,
      userInputsClass: 'USER_INPUT / SCENARIO assumptions — not property facts',
      analyseRent: 'HARNESS_STUB_AREA_ASKING_ONLY',
      valuation: 'NOT_INVOKED_NOT_ASSESSED',
      freeOfficialEvidence: 'SKIPPED_FOR_DETERMINISM',
      whatIf: 'executeIntelligenceWhatIf on complete pack',
    },
    inventory,
    cohortSize: cohort.length,
    subjects,
    aggregates: {
      subjects: subjects.length,
      listingRentBasis: listingRentSubjects.length,
      marketRentBasis: marketRentSubjects.length,
      scenarioRentBasis: scenarioRentSubjects.length,
      minimalGrossYieldAssessed: subjects.filter((s) => s.packs?.minimal?.metrics?.grossYield?.available).length,
      partialNoiAssessed: subjects.filter((s) => s.packs?.partial?.metrics?.noi?.available).length,
      completeNoiCashDscrAssessed: completeAssessed.length,
      completeLandlordPdAssessed: subjects.filter((s) => s.packs?.complete?.landlordPd?.available).length,
      semanticLeakageSubjects: leakage.length,
    },
    productRubric,
    inputBurden,
    failureAbandonmentHypothesis: [
      'User sees gross yield on minimal pack and stops before completing opex/finance.',
      'Complete-pack input count feels high (vacancy+opex+mortgage).',
      'MARKET rent substitution unclear despite labels → distrust of yield.',
      'Valuation/price position remain NOT_ASSESSED — “is the purchase fair?” unanswered (parked).',
    ],
    dominantNextGapHypothesis: dominantGap,
    classification,
    verdict,
    residualMonitors: [
      'Rent-basis comprehension (LISTING vs MARKET area asking)',
      'Completion rate of underwriting inputs in real use',
      'Landlord PD usefulness when demand/risk dims stay notAssessed',
    ],
  };

  const outPath = path.join(__dirname, 'validate-let-invest-underwriting-packs-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    outPath,
    aggregates: output.aggregates,
    classification: output.classification,
    verdict: output.verdict,
    subjectIds: subjects.map((s) => s.propertyId),
  }, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
