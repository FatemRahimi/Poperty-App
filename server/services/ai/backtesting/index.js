const constants = require('./constants');
const foundation = require('./backtestFoundation');
const repository = require('./backtestRepository');

module.exports = {
  ...constants,
  ...foundation,
  loadBacktestDataset: repository.loadBacktestDataset,
  auditSchema: repository.auditSchema,
};
