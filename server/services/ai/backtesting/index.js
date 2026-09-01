const constants = require('./constants');
const foundation = require('./backtestFoundation');
const repository = require('./backtestRepository');
const { evaluateSaleBacktest } = require('../valuationBacktestService');
const {
  auditOutcomeCollection,
  COLLECTION_GAP,
} = require('../outcomeCollectionService');

module.exports = {
  ...constants,
  ...foundation,
  loadBacktestDataset: repository.loadBacktestDataset,
  auditSchema: repository.auditSchema,
  evaluateSaleBacktest,
  auditOutcomeCollection,
  COLLECTION_GAP,
};
