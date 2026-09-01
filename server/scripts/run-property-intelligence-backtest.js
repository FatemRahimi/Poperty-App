#!/usr/bin/env node
/**
 * Developer/admin Property Intelligence backtest.
 * Observational only — does not change production engines or expose PII.
 *
 * Run: node scripts/run-property-intelligence-backtest.js
 */

require('dotenv').config();
const pool = require('../models/db');
const { runBacktest, BACKTEST_ENGINE_VERSION } = require('../services/ai/backtesting/backtestFoundation');
const {
  loadBacktestDataset,
  loadListingsForCollection,
} = require('../services/ai/backtesting/backtestRepository');
const { auditOutcomeCollection } = require('../services/ai/outcomeCollectionService');

function publicSummary(result, audit) {
  return {
    state: result.state,
    generatedAt: result.generatedAt,
    engineVersion: result.engineVersion,
    observational: true,
    productionFormulasChanged: false,
    demandScoreCreated: false,
    confidenceModel: result.confidenceModel,
    realDataAudit: audit,
    sampleUnit: 'eligible_predictions',
    eligibility: result.eligibility,
    valuation: {
      state: result.valuation.state,
      sampleSize: result.valuation.sampleSize,
      sampleSufficiency: result.valuation.sampleSufficiency,
      limitation: result.valuation.limitation,
      mae: result.valuation.mae,
      medianAbsoluteError: result.valuation.medianAbsoluteError,
      mape: result.valuation.mape,
      medianAbsolutePercentageError: result.valuation.medianAbsolutePercentageError,
      signedBias: result.valuation.signedBias,
      medianSignedPercentageError: result.valuation.medianSignedPercentageError,
      boundsCoverage: result.valuation.boundsCoverage,
    },
    rent: {
      state: result.rent.state,
      sampleSize: result.rent.sampleSize,
      mae: result.rent.mae,
      medianAbsolutePercentageError: result.rent.medianAbsolutePercentageError,
      signedBias: result.rent.signedBias,
      boundsCoverage: result.rent.boundsCoverage,
    },
    confidence: {
      state: result.confidence.state,
      sampleSize: result.confidence.sampleSize,
      modelVersion: result.confidence.modelVersion,
      calibrated: result.confidence.calibrated,
      groups: result.confidence.groups.map((g) => ({
        level: g.level,
        sampleSize: g.sampleSize,
        state: g.state,
        mae: g.mae,
      })),
    },
    segments: result.segments.map((s) => ({
      name: s.name,
      key: s.key,
      sampleSize: s.sampleSize,
      state: s.state,
    })),
    personalDecision: result.personalDecision,
    demand: result.demand,
    limitations: result.limitations,
    note:
      'Synthetic test fixtures are not included. Empty sampleSize is insufficientData, not zero error.',
  };
}

async function main() {
  let dataset;
  try {
    dataset = await loadBacktestDataset(pool);
  } catch (error) {
    const unavailable = {
      state: 'insufficientData',
      generatedAt: new Date().toISOString(),
      engineVersion: BACKTEST_ENGINE_VERSION,
      realDataAudit: {
        historicalPredictionSnapshots: 0,
        genuineSaleOutcomes: 0,
        genuineRentalOutcomes: 0,
        eligibleValuationPairs: 0,
        eligibleRentPairs: 0,
        database: 'unavailable',
        error: error.message,
      },
      limitations: ['Development database was not available for the real-data audit.'],
    };
    console.log(JSON.stringify(unavailable, null, 2));
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(0);
    return;
  }

  const result = runBacktest({
    snapshots: dataset.snapshots,
    outcomes: dataset.outcomes,
    productionAudit: true,
  });
  let collection = null;
  try {
    const listings = await loadListingsForCollection(pool);
    collection = auditOutcomeCollection({
      listings,
      snapshots: dataset.snapshots,
      outcomes: dataset.outcomes,
    });
  } catch {
    collection = null;
  }

  const summary = publicSummary(result, {
    ...dataset.audit,
    assessedSalePredictions: collection?.predictions?.assessedSale ?? 0,
    eligibleValuationPairs: result.eligibility.eligibleSale,
    eligibleRentPairs: result.eligibility.eligibleRent,
    exclusionReasons: result.eligibility.exclusionReasons,
    collection: collection
      ? {
          n: collection.evaluation.n,
          sufficiency: collection.evaluation.sufficiency,
          uniqueSaleOutcomes: collection.evaluation.uniqueSaleOutcomes,
          matches: collection.matches,
          collectionGaps: collection.collectionGaps,
          verifiedObservedAccumulation: collection.verifiedObservedAccumulation,
        }
      : null,
    database: 'connected',
  });
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
