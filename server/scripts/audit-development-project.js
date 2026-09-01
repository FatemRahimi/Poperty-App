/**
 * Read-only aggregate of project / development-adjacent fields.
 * Does not invent projects or print private scope.
 * Run: node scripts/audit-development-project.js
 */
require('dotenv').config();
const pool = require('../models/db');

function bump(map, key) {
  const label = key == null || key === '' ? '(empty)' : String(key);
  map[label] = (map[label] || 0) + 1;
}

async function tableExists(name) {
  const result = await pool.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [name]
  );
  return result.rows.length > 0;
}

async function run() {
  const tables = {
    development_projects: await tableExists('development_projects'),
    development_scenarios: await tableExists('development_scenarios'),
    development_project_subjects: await tableExists('development_project_subjects'),
    development_work_scopes: await tableExists('development_work_scopes'),
    development_dependencies: await tableExists('development_dependencies'),
  };

  const analyses = await pool.query(
    `SELECT output_data, input_data
       FROM ai_requests
      WHERE request_type = 'property_intelligence'
        AND output_data IS NOT NULL`
  );

  const counts = {
    projectTablesPresent: tables,
    analyses: analyses.rows.length,
    analysesWithDevelopmentDomain: 0,
    analysesWithRenovationCostInput: 0,
    analysesWithPlanningDomain: 0,
    analysesWithEnvironmentDomain: 0,
    analysesWithLegalTitleDomain: 0,
    analysesWithBuildingConditionDomain: 0,
    storedDevelopmentProjects: 0,
    storedDevelopmentScenarios: 0,
    assetClassBreakdown: {},
  };

  analyses.rows.forEach((row) => {
    const output = row.output_data || {};
    const input = row.input_data || {};
    if (output.developmentDomain) counts.analysesWithDevelopmentDomain += 1;
    if (output.planningDomain) counts.analysesWithPlanningDomain += 1;
    if (output.environmentDomain) counts.analysesWithEnvironmentDomain += 1;
    if (output.legalTitleDomain) counts.analysesWithLegalTitleDomain += 1;
    if (output.buildingConditionDomain) counts.analysesWithBuildingConditionDomain += 1;
    if (input.finance?.renovationCost != null || input.finance?.options?.renovationCost != null) {
      counts.analysesWithRenovationCostInput += 1;
    }
    bump(counts.assetClassBreakdown, output.assetClassification?.assetClass || '(none)');
  });

  console.log(JSON.stringify(counts, null, 2));
}

run()
  .catch((err) => {
    console.error('Audit failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
