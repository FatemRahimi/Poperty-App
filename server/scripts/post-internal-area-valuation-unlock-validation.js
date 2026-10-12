/**
 * V1.2 — Post-internal-area valuation unlock validation (measurement only).
 * Uses existing resolver + enrichment cost protections. Bounded live AVM traces.
 *
 * Run: node server/scripts/post-internal-area-valuation-unlock-validation.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const { mapToPropertyDataType } = require('../services/providers/propertyData/propertyTypeMapping');
const { enrichPropertyForIntelligence } = require('../services/enrichment/propertyEnrichmentService');
const { calculatePropertyValuation } = require('../services/ai/valuationEngine');
const { runFullPropertyAnalysis } = require('../services/ai/propertyIntelligenceEngine');
const { DECISION_JOB } = require('../architecture/decisionContextContract');
const { AREA_SOURCE } = require('../architecture/canonicalInternalArea');

const ASOF = '2026-09-03T12:00:00.000Z';
const MAX_AVM_TRACES = 5;
const MAX_JOB_SAMPLES = 3;

function blockerFromReadiness(reasonCode) {
  if (!reasonCode) return null;
  const map = {
    MISSING_INTERNAL_AREA: 'MISSING_INTERNAL_AREA',
    INVALID_INTERNAL_AREA: 'PROPERTY_SPECIFIC_EVIDENCE_INVALID',
    UNMAPPED_PROPERTY_TYPE: 'UNMAPPED_PROPERTY_TYPE',
    MISSING_POSTCODE: 'INVENTORY_QUALITY',
    UNIT_UNKNOWN: 'MISSING_INTERNAL_AREA',
  };
  return map[reasonCode] || 'OTHER';
}

async function loadAllProperties() {
  const r = await pool.query(`
    SELECT p.*,
      pi.uprn, pi.paon, pi.saon, pi.building_name,
      e.attachment_status AS epb_status,
      e.facts->>'totalFloorAreaSqm' AS epb_sqm,
      e.source AS epb_source
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    LEFT JOIN official_epb_certificates e
      ON e.property_id = p.id AND e.is_current = TRUE
    ORDER BY p.id
  `);
  return r.rows;
}

async function analyseRow(row) {
  const rawReq = buildValuationSaleRequest(row);
  const resolution = await resolveCanonicalInternalArea({
    property: row,
    identity: { uprn: row.uprn, saon: row.saon },
    loadPersistedEpb: true,
  });
  const applied = applyCanonicalInternalAreaToProperty(row, resolution);
  const afterReq = buildValuationSaleRequest(applied);

  const source = resolution.selectedSource || null;
  let sourceBucket = 'none';
  if (source === AREA_SOURCE.INTERNAL_LISTING) sourceBucket = 'existing_listing';
  else if (source === AREA_SOURCE.MHCLG_EPBD) sourceBucket = 'existing_epb';
  else if (source === AREA_SOURCE.PROPERTYDATA_UPRN) sourceBucket = 'existing_provider';
  else if (source === AREA_SOURCE.USER_DECLARED) sourceBucket = 'user_declared';
  else if (source) sourceBucket = 'other';

  const mappedType = mapToPropertyDataType(row.property_type);
  const saleCompatible =
    String(row.category || '').toLowerCase() === 'sale' && Number(row.price) > 0;

  return {
    id: row.id,
    category: row.category,
    price: row.price,
    property_type: row.property_type,
    mappedType,
    zip_code: row.zip_code,
    uprn: row.uprn || null,
    saon: row.saon || null,
    paon: row.paon || null,
    epb_status: row.epb_status || null,
    epb_sqm: row.epb_sqm || null,
    saleCompatible,
    listing_square_feet: row.square_feet,
    listing_floor_area: row.floor_area,
    listing_floor_area_unit: row.floor_area_unit,
    resolution: {
      available: resolution.available,
      selectedSource: source,
      sourceBucket,
      normalisedValueSqft: resolution.normalisedValueSqft,
      readiness: resolution.readiness,
      observationSources: (resolution.observations || []).map((o) => o.source),
    },
    readinessBeforeCanonical: rawReq.readiness,
    readinessAfterCanonical: afterReq.readiness,
    providerEligibleBefore: rawReq.readiness?.state === 'PROVIDER_ELIGIBLE',
    providerEligibleAfter: afterReq.readiness?.state === 'PROVIDER_ELIGIBLE',
    unlockedByCanonicalArea:
      rawReq.readiness?.reasonCode === 'MISSING_INTERNAL_AREA'
      && afterReq.readiness?.state === 'PROVIDER_ELIGIBLE',
    appliedProperty: applied,
    userId: row.user_id,
  };
}

function summariseInventory(rows) {
  const total = rows.length;
  const saleCompatible = rows.filter((r) => r.saleCompatible);
  const withArea = rows.filter((r) => r.resolution.available);
  const bySource = {};
  withArea.forEach((r) => {
    const b = r.resolution.sourceBucket;
    bySource[b] = (bySource[b] || 0) + 1;
  });
  const mappedType = rows.filter((r) => r.mappedType);
  const saleMapped = saleCompatible.filter((r) => r.mappedType);
  const avmReady = rows.filter((r) => r.providerEligibleAfter);
  const saleAvmReady = saleCompatible.filter((r) => r.providerEligibleAfter);

  const readinessCounts = {};
  saleCompatible.forEach((r) => {
    const code = r.readinessAfterCanonical?.reasonCode || r.readinessAfterCanonical?.state || 'UNKNOWN';
    readinessCounts[code] = (readinessCounts[code] || 0) + 1;
  });

  const unlocked = rows.filter((r) => r.unlockedByCanonicalArea);
  const stillMissingArea = saleCompatible.filter(
    (r) => r.readinessAfterCanonical?.reasonCode === 'MISSING_INTERNAL_AREA'
  );
  const unmapped = saleCompatible.filter(
    (r) => r.readinessAfterCanonical?.reasonCode === 'UNMAPPED_PROPERTY_TYPE'
  );

  return {
    total,
    residentialSaleCompatible: saleCompatible.length,
    withCanonicalInternalArea: withArea.length,
    internalAreaBySource: bySource,
    mappedResidentialPropertyType: mappedType.length,
    saleWithMappedType: saleMapped.length,
    providerEligibleAll: avmReady.length,
    providerEligibleSale: saleAvmReady.length,
    saleReadinessCounts: readinessCounts,
    unlockedByCanonicalAreaCount: unlocked.length,
    unlockedIds: unlocked.map((r) => r.id),
    saleStillMissingInternalArea: stillMissingArea.length,
    saleUnmappedType: unmapped.length,
    saleWithUprn: saleCompatible.filter((r) => r.uprn).length,
    saleWithSaon: saleCompatible.filter((r) => r.saon).length,
    saleWithEpbArea: saleCompatible.filter((r) => r.epb_sqm && Number(r.epb_sqm) > 0).length,
  };
}

async function traceAvm(rowAnalysis) {
  const property = rowAnalysis.appliedProperty;
  const readiness = rowAnalysis.readinessAfterCanonical;
  const base = {
    propertyId: rowAnalysis.id,
    subject: {
      type: rowAnalysis.property_type,
      mappedType: rowAnalysis.mappedType,
      postcode: (rowAnalysis.zip_code || '').replace(/\s+/g, ''),
      internal_area_sqft: rowAnalysis.resolution.normalisedValueSqft,
      areaSource: rowAnalysis.resolution.selectedSource,
      uprn: rowAnalysis.uprn,
      saon: rowAnalysis.saon,
    },
    readiness,
    requested: false,
    valuationSale: null,
    valuation: null,
    pricePosition: null,
    enrichmentErrors: [],
  };

  if (readiness?.state !== 'PROVIDER_ELIGIBLE') {
    base.skipReason = readiness;
    return base;
  }

  const ext = await enrichPropertyForIntelligence(property, {
    userId: rowAnalysis.userId || 1,
  });
  const val = await calculatePropertyValuation(property, ext);
  const vs = ext.enrichments?.valuation_sale;

  let vsState = 'ABSENT';
  if (vs) {
    if (vs.success) vsState = vs.cacheHit || vs.fromPersistence ? 'RETURNED_CACHE' : 'RETURNED';
    else vsState = 'FAILED';
  }

  const methods = val.evidenceEligibility?.methods || [];
  const assessment = val.evidenceEligibility?.assessment || null;
  const safety = val.assessmentSafety || val.evidenceEligibility?.assessmentSafety || null;

  base.requested = true;
  base.valuationSale = {
    state: vsState,
    success: vs?.success ?? false,
    message: vs?.message || null,
    reasonCode: vs?.reasonCode || null,
    cacheHit: Boolean(vs?.cacheHit || vs?.fromPersistence),
    hasData: Boolean(vs?.data),
    creditsUsed: vs?.creditsUsed ?? null,
  };
  base.enrichmentErrors = ext.errors || [];
  base.valuation = {
    success: val.success,
    notAssessed: val.notAssessed,
    message: val.message,
    centralEstimate: val.centralEstimate ?? null,
    components: (val.components || []).map((c) => {
      const elig = methods.find((m) => m.method === c.method) || null;
      return {
        method: c.method,
        centralEstimate: c.centralEstimate,
        provenance: c.provenance?.source || c.source || null,
        propertySpecific: elig?.propertySpecificity === 'property' || elig?.canAssessAlone === true,
        propertySpecificity: elig?.propertySpecificity || null,
        methodFamily: elig?.methodFamily || null,
        canAssessAlone: elig?.canAssessAlone ?? null,
        eligible: elig?.eligibleForAssessment ?? null,
        rejections: elig?.rejectionReasons || [],
        validation: c.componentValidation || null,
      };
    }),
    assessment,
    safety,
    eligibility: methods.map((m) => ({
      method: m.method,
      family: m.methodFamily,
      propertySpecificity: m.propertySpecificity,
      eligible: m.eligibleForAssessment,
      canAssessAlone: m.canAssessAlone,
      rejections: m.rejectionReasons,
    })),
  };

  // Price position only when valuation assessed
  if (val.success && val.centralEstimate != null) {
    base.pricePosition = {
      wouldAssess: true,
      note: 'Valuation assessed — price position may compute from asking vs range',
    };
  } else {
    base.pricePosition = {
      wouldAssess: false,
      state: 'NOT_ASSESSED',
      reason: 'Depends on assessed valuation range',
    };
  }

  // Classification for this subject
  if (vsState === 'FAILED' || (vs && vs.success === false)) {
    base.primaryBlocker = 'PROVIDER_FAILURE';
  } else if (vsState === 'ABSENT' && readiness.state === 'PROVIDER_ELIGIBLE') {
    base.primaryBlocker = 'PROVIDER_NO_RESULT';
  } else if (val.success) {
    base.primaryBlocker = null;
  } else if (assessment?.reason === 'insufficient_eligible_evidence') {
    base.primaryBlocker = 'INSUFFICIENT_INDEPENDENT_EVIDENCE';
  } else if (safety?.reason) {
    base.primaryBlocker = 'CORRECT_SAFETY_REJECTION';
  } else {
    base.primaryBlocker = 'OTHER';
  }

  return base;
}

async function decisionImpact(propertyId, userId) {
  const out = {};
  for (const job of [DECISION_JOB.BUY, DECISION_JOB.LET_INVEST, DECISION_JOB.SELL]) {
    const report = await runFullPropertyAnalysis(
      { propertyId },
      userId || 1,
      { decisionJob: job, skipExplanation: true, asOf: ASOF }
    );
    const sale = report.marketIntelligence?.sale || {};
    const pp = report.marketIntelligence?.pricePosition || {};
    const inv = report.investment?.presented || report.investment || {};
    out[job] = {
      valuation: {
        success: sale.success,
        notAssessed: sale.notAssessed,
        message: sale.message || null,
        assessmentState: sale.assessmentState || null,
      },
      pricePosition: {
        success: pp.success,
        notAssessed: pp.notAssessed,
        message: pp.message || null,
      },
      finance: job === DECISION_JOB.LET_INVEST
        ? {
            grossYield: inv.grossYield?.available ?? inv.grossYield?.success ?? null,
            noi: inv.noi?.available ?? null,
            note: 'Finance uses listing/purchase + rent/costs — not gated solely on assessed valuation',
          }
        : null,
      personalDecision: report.personalDecision
        ? {
            profile: report.personalDecision.profile,
            available: report.personalDecision.available,
          }
        : null,
      internalAreaAvailable: report.property?.internalArea?.available ?? null,
      workspaceValuationListingGap: Boolean(
        (report.decisionWorkspace?.unresolved || []).find((r) => r.id === 'internal_floor_area')
      ),
    };
  }
  return out;
}

function classifyBlockers(rows, traces) {
  const counts = {
    MISSING_INTERNAL_AREA: 0,
    SUBJECT_IDENTITY_GAP: 0,
    MISSING_UPRN: 0,
    MISSING_SAON: 0,
    UNMAPPED_PROPERTY_TYPE: 0,
    PROVIDER_NO_COVERAGE: 0,
    PROVIDER_NO_RESULT: 0,
    PROVIDER_FAILURE: 0,
    PROPERTY_SPECIFIC_EVIDENCE_INVALID: 0,
    INSUFFICIENT_INDEPENDENT_EVIDENCE: 0,
    CORRECT_SAFETY_REJECTION: 0,
    INVENTORY_QUALITY: 0,
    CODE_DEFECT: 0,
    OTHER: 0,
  };

  const sale = rows.filter((r) => r.saleCompatible);
  sale.forEach((r) => {
    const code = r.readinessAfterCanonical?.reasonCode;
    const mapped = blockerFromReadiness(code);
    if (mapped) counts[mapped] += 1;
    if (!r.uprn) counts.MISSING_UPRN += 1;
    // SAON only meaningful for unit-like — count missing SAON when type looks unit-like
    const tok = String(r.mappedType || r.property_type || '').toLowerCase();
    if (/flat|apartment|maisonette|studio/.test(tok) && !r.saon) counts.MISSING_SAON += 1;
  });

  traces.forEach((t) => {
    if (t.primaryBlocker && counts[t.primaryBlocker] != null) {
      // Don't double-count readiness; these are post-eligible outcomes
      counts[t.primaryBlocker] += 1;
    }
  });

  return counts;
}

(async () => {
  await ensureIntelligenceSchema();
  const properties = await loadAllProperties();
  const analysed = [];
  for (const row of properties) {
    analysed.push(await analyseRow(row));
  }

  const inventory = summariseInventory(analysed);

  // Bounded AVM traces: prefer sale PROVIDER_ELIGIBLE; fill with any eligible if needed
  const eligibleSale = analysed.filter((r) => r.saleCompatible && r.providerEligibleAfter);
  const eligibleAny = analysed.filter((r) => r.providerEligibleAfter);
  const tracePool = eligibleSale.length > 0 ? eligibleSale : eligibleAny;
  const toTrace = tracePool.slice(0, MAX_AVM_TRACES);

  const traces = [];
  for (const row of toTrace) {
    traces.push(await traceAvm(row));
  }

  // If zero eligible, still document a control NOT_ELIGIBLE sale subject briefly
  let controlMissing = null;
  if (toTrace.length === 0) {
    const control = analysed.find(
      (r) => r.saleCompatible && r.readinessAfterCanonical?.reasonCode === 'MISSING_INTERNAL_AREA'
    );
    if (control) {
      controlMissing = {
        propertyId: control.id,
        readiness: control.readinessAfterCanonical,
        note: 'No PROVIDER_ELIGIBLE subjects to trace; control remains missing area',
      };
    }
  }

  // Decision impact on traced subjects (or controls)
  const jobSamples = [];
  const jobPool = toTrace.length > 0
    ? toTrace.slice(0, MAX_JOB_SAMPLES)
    : analysed.filter((r) => r.saleCompatible).slice(0, MAX_JOB_SAMPLES);
  for (const row of jobPool) {
    jobSamples.push({
      propertyId: row.id,
      providerEligible: row.providerEligibleAfter,
      areaSource: row.resolution.selectedSource,
      jobs: await decisionImpact(row.id, row.userId),
    });
  }

  const funnel = {
    saleCompatible: inventory.residentialSaleCompatible,
    withAreaAfterCanonical: analysed.filter((r) => r.saleCompatible && r.resolution.available).length,
    providerEligible: inventory.providerEligibleSale,
    traced: traces.length,
    providerReturnedPropertySpecific: traces.filter(
      (t) => t.valuationSale?.success && t.valuationSale?.hasData
    ).length,
    valuationAssessed: traces.filter((t) => t.valuation?.success === true).length,
    missingToEligible: inventory.unlockedByCanonicalAreaCount,
    eligibleToReturned: traces.filter(
      (t) => t.requested && t.valuationSale?.success && t.valuationSale?.hasData
    ).length,
    returnedToAssessed: traces.filter((t) => t.valuation?.success === true).length,
  };

  // Existing persisted valuation_sale enrichments across inventory
  const enrichStats = await pool.query(`
    SELECT enrichment_type, COUNT(*)::int AS n
    FROM property_enrichments
    GROUP BY enrichment_type
    ORDER BY enrichment_type
  `);
  const vsPersisted = await pool.query(`
    SELECT property_id, retrieved_at,
      (payload IS NOT NULL) AS has_payload
    FROM property_enrichments
    WHERE enrichment_type = 'valuation_sale'
    ORDER BY property_id
  `);

  const blockers = classifyBlockers(analysed, traces);

  // Source decision helper
  let sourceDecision = 'D';
  let sourceDecisionLabel =
    'INSUFFICIENT SAMPLE — current inventory cannot establish provider usefulness';
  if (inventory.providerEligibleSale === 0 && inventory.unlockedByCanonicalAreaCount === 0) {
    sourceDecision = 'D';
    sourceDecisionLabel =
      'INSUFFICIENT SAMPLE — almost no sale subjects are PROVIDER_ELIGIBLE after internal-area phase; cannot prove /valuation-sale usefulness on real inventory';
  } else if (traces.some((t) => t.valuationSale?.success && t.valuationSale?.hasData)) {
    const assessed = traces.some((t) => t.valuation?.success);
    if (assessed) {
      sourceDecision = 'A';
      sourceDecisionLabel =
        'YES — existing provider returns usable property-specific evidence; remaining blocker is coverage/identity/attributes';
    } else {
      sourceDecision = 'B';
      sourceDecisionLabel =
        'PARTIAL — provider returns or is callable for some eligible subjects but ASSESSED remains blocked (coverage, failure, or independent-evidence rules)';
    }
  } else if (traces.some((t) => t.requested)) {
    sourceDecision = 'C';
    sourceDecisionLabel =
      'NO / WEAK — eligible subjects requested /valuation-sale but did not yield sufficient property-specific evidence for ASSESSED';
  }

  // Identity impact separation
  const identityImpact = {
    uprnOnSale: inventory.saleWithUprn,
    saonOnSale: inventory.saleWithSaon,
    note:
      'UPRN alone does not make valuation ASSESSED. /valuation-sale uses postcode+type+internal_area; /uprn may add property-specific estimate if profile returns one; HMLR exact match needs PAON/SAON/UPRN identity quality separately.',
    valuationSaleDependsOnUprn: false,
    uprnEndpointMayAddPropertySpecificEstimate: true,
    hmlrExactNeedsIdentity: true,
  };

  const report = {
    study: 'V1.2_POST_INTERNAL_AREA_VALUATION_UNLOCK_VALIDATION',
    measuredAt: new Date().toISOString(),
    asOf: ASOF,
    inventory,
    funnel,
    enrichmentInventory: enrichStats.rows,
    valuationSalePersistedRows: vsPersisted.rows,
    traces,
    controlMissing,
    jobSamples,
    blockers,
    identityImpact,
    sourceDecision: {
      code: sourceDecision,
      label: sourceDecisionLabel,
    },
    testInfraDebt: {
      mhclgEpbWindowsExit: 'UV_HANDLE_CLOSING post-assertion process crash — test-infra debt; assertions pass in isolation',
    },
  };

  // Recommended next capability (measurement-driven)
  let nextCapability = null;
  if (inventory.saleStillMissingInternalArea >= inventory.residentialSaleCompatible * 0.5) {
    nextCapability = {
      id: 'property_attribute_acquisition_completion',
      label: 'property attribute acquisition/completion',
      measuredBlocker: 'MISSING_INTERNAL_AREA still dominates sale inventory',
      affectedCount: inventory.saleStillMissingInternalArea,
      reason:
        'Canonical resolver works but inventory still lacks first-party/EPB/provider area on most sale listings; without area, /valuation-sale never runs.',
    };
  }
  if (
    inventory.providerEligibleSale > 0
    && funnel.valuationAssessed === 0
    && traces.every((t) => t.primaryBlocker === 'PROVIDER_FAILURE' || t.primaryBlocker === 'PROVIDER_NO_RESULT')
  ) {
    nextCapability = {
      id: 'provider_source_coverage_research',
      label: 'provider/source coverage research',
      measuredBlocker: 'PROVIDER_FAILURE / PROVIDER_NO_RESULT on eligible subjects',
      affectedCount: traces.length,
      reason:
        'Inputs meet PROVIDER_ELIGIBLE but /valuation-sale does not return usable property-specific evidence.',
    };
  } else if (
    inventory.providerEligibleSale > 0
    && funnel.valuationAssessed === 0
    && traces.some((t) => t.primaryBlocker === 'INSUFFICIENT_INDEPENDENT_EVIDENCE' || t.primaryBlocker === 'CORRECT_SAFETY_REJECTION')
  ) {
    nextCapability = {
      id: 'existing_propertydata_evidence_utilisation',
      label: 'existing PropertyData evidence utilisation',
      measuredBlocker: 'INSUFFICIENT_INDEPENDENT_EVIDENCE after area unlock',
      affectedCount: inventory.providerEligibleSale,
      reason:
        'Area unlock enables provider path and area-family components, but ASSESSED still needs an independent property-specific family (AVM/UPRN estimate) under frozen safety — utilise or obtain that evidence without changing safety rules.',
    };
  }

  // Prefer evidence-based override from actual funnel
  if (inventory.providerEligibleSale === 0 && inventory.saleStillMissingInternalArea > 0) {
    nextCapability = {
      id: 'property_attribute_acquisition_completion',
      label: 'property attribute acquisition/completion (inventory first-party area coverage)',
      measuredBlocker: 'MISSING_INTERNAL_AREA',
      affectedCount: inventory.saleStillMissingInternalArea,
      decisionOutputsBlocked: ['valuation range', 'price position'],
      whyNotDuplicate:
        'Internal-area *capability* exists (capture + resolver + workspace). Inventory still lacks persisted area on most sale listings, so PROVIDER_ELIGIBLE count stays near zero.',
      whyBeatsAlternatives:
        'Identity/UPRN does not satisfy /valuation-sale internal_area precondition. Provider research is moot until eligible subjects exist. Methodology must stay frozen.',
    };
  } else if (
    funnel.providerEligible > 0
    && funnel.valuationAssessed === 0
  ) {
    const failHeavy = traces.filter((t) =>
      ['PROVIDER_FAILURE', 'PROVIDER_NO_RESULT', 'PROVIDER_NO_COVERAGE'].includes(t.primaryBlocker)
    ).length;
    const insuffHeavy = traces.filter((t) =>
      ['INSUFFICIENT_INDEPENDENT_EVIDENCE', 'CORRECT_SAFETY_REJECTION'].includes(t.primaryBlocker)
    ).length;
    if (failHeavy >= insuffHeavy) {
      nextCapability = {
        id: 'provider_source_coverage_research',
        label: 'provider/source coverage research',
        measuredBlocker: traces[0]?.primaryBlocker || 'PROVIDER_FAILURE',
        affectedCount: inventory.providerEligibleSale,
        decisionOutputsBlocked: ['valuation range', 'price position'],
        whyNotDuplicate:
          'Pipeline correctness and internal-area readiness are done; eligible requests still do not yield ASSESSED property-specific evidence.',
        whyBeatsAlternatives:
          'Further attribute/identity work will not help subjects that are already PROVIDER_ELIGIBLE if /valuation-sale fails or returns nothing usable.',
      };
    } else {
      nextCapability = {
        id: 'existing_propertydata_evidence_utilisation',
        label: 'existing PropertyData evidence utilisation',
        measuredBlocker: 'INSUFFICIENT_INDEPENDENT_EVIDENCE',
        affectedCount: inventory.providerEligibleSale,
        decisionOutputsBlocked: ['valuation range', 'price position'],
        whyNotDuplicate:
          'Internal area unlocked AVM eligibility and sqft_implied; safety still correctly rejects single-family TRANSACTION_STATISTICS. Need property-specific independent component utilisation (AVM/UPRN estimate) without changing freeze rules.',
        whyBeatsAlternatives:
          'Identity alone does not assess. Attribute acquisition helps non-eligible inventory but traced eligible subjects are already past that gate.',
      };
    }
  }

  report.nextCapability = nextCapability;

  let verdict = 'POST-INTERNAL-AREA VALUATION VALIDATION PARTIAL — MORE_REAL_EVIDENCE_REQUIRED';
  if (funnel.valuationAssessed > 0 && funnel.valuationAssessed >= Math.min(1, funnel.traced)) {
    verdict =
      'POST-INTERNAL-AREA VALUATION VALIDATION PASSED — VALUATION_UNLOCKED_ENOUGH_TO_RETURN_TO_PRODUCT_ROADMAP';
  } else if (nextCapability && (funnel.traced > 0 || inventory.residentialSaleCompatible > 0)) {
    verdict = 'POST-INTERNAL-AREA VALUATION VALIDATION PASSED — NEXT_CAPABILITY_IDENTIFIED';
  } else if (inventory.residentialSaleCompatible === 0) {
    verdict = 'POST-INTERNAL-AREA VALUATION VALIDATION BLOCKED — DO_NOT_ADVANCE';
  }
  report.verdict = verdict;

  // Strip heavy appliedProperty from serialised analysed summary
  report.eligibleSubjects = analysed
    .filter((r) => r.providerEligibleAfter)
    .map((r) => ({
      id: r.id,
      category: r.category,
      mappedType: r.mappedType,
      areaSource: r.resolution.selectedSource,
      sqft: r.resolution.normalisedValueSqft,
      uprn: r.uprn,
    }));

  const outPath = path.join(__dirname, 'post-internal-area-valuation-unlock-output.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        inventory: report.inventory,
        funnel: report.funnel,
        sourceDecision: report.sourceDecision,
        nextCapability: report.nextCapability,
        tracesSummary: traces.map((t) => ({
          id: t.propertyId,
          vs: t.valuationSale?.state,
          assessed: t.valuation?.success,
          blocker: t.primaryBlocker,
          components: t.valuation?.components?.map((c) => c.method),
        })),
        blockers: report.blockers,
      },
      null,
      2
    )
  );
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
