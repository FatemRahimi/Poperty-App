/**
 * Decision Intelligence V2 contribution contract.
 * Not implemented. Domains may later emit this shape; DI must not invent facts.
 */

const CONTRIBUTION_KIND = Object.freeze({
  MATERIAL_FINDING: 'MATERIAL_FINDING',
  UNRESOLVED_DEPENDENCY: 'UNRESOLVED_DEPENDENCY',
  INVESTIGATION_PRIORITY: 'INVESTIGATION_PRIORITY',
  SENSITIVITY_DRIVER: 'SENSITIVITY_DRIVER',
  LIMITATION: 'LIMITATION',
});

function createDecisionContribution({
  domain,
  domainVersion,
  materialFindings = [],
  unresolvedDependencies = [],
  investigationPriorities = [],
  sensitivityDrivers = [],
  limitations = [],
} = {}) {
  if (!domain) throw new Error('Decision contribution requires domain');
  if (!domainVersion) throw new Error('Decision contribution requires domainVersion');
  return {
    domain,
    domainVersion,
    materialFindings,
    unresolvedDependencies,
    investigationPriorities,
    sensitivityDrivers,
    limitations,
    createsDomainFacts: false,
  };
}

module.exports = {
  CONTRIBUTION_KIND,
  createDecisionContribution,
};
