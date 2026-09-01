/**
 * Shared property evidence is never implied by private user analysis.
 */

const { VISIBILITY } = require('./evidenceContract');

const PRIVATE_FACT_TYPES = Object.freeze([
  'mortgage',
  'deposit',
  'interestRate',
  'userBudget',
  'projectQuote',
  'legalDocumentUpload',
  'titleRegisterDocument',
  'titlePlanDocument',
  'leaseDocument',
  'registeredProprietor',
  'portfolioOwnership',
  'scenarioInput',
  'privateNote',
  'surveyDocument',
  'inspectionReport',
  'buildingSurvey',
  'repairQuote',
  'proposedDevelopment',
  'projectScope',
  'developmentScenario',
  'projectBudget',
  'contractorQuote',
  'supplierQuote',
  'actualProjectCost',
  'invoice',
  'costAssumption',
  'costScenario',
]);

function assertEvidenceVisibility(evidence) {
  if (!evidence) return evidence;
  const privateFact = PRIVATE_FACT_TYPES.includes(evidence.factType)
    || evidence.visibility === VISIBILITY.PRIVATE;
  if (privateFact && evidence.sharedPropertyEvidence === true) {
    throw new Error('PRIVATE_DATA_CANNOT_BE_SHARED_PROPERTY_EVIDENCE');
  }
  return evidence;
}

function markPrivate(evidence) {
  return assertEvidenceVisibility({
    ...evidence,
    visibility: VISIBILITY.PRIVATE,
    sharedPropertyEvidence: false,
  });
}

module.exports = {
  PRIVATE_FACT_TYPES,
  assertEvidenceVisibility,
  markPrivate,
};
