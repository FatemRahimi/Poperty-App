/**
 * Read-only aggregate of cost-adjacent fields.
 * Does not invent quotes or print private amounts.
 * Run: node scripts/audit-project-cost.js
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
    project_costs: await tableExists('project_costs'),
    project_cost_items: await tableExists('project_cost_items'),
    contractor_quotes: await tableExists('contractor_quotes'),
    invoices: await tableExists('invoices'),
  };

  const analyses = await pool.query(
    `SELECT output_data, input_data
       FROM ai_requests
      WHERE request_type = 'property_intelligence'
        AND output_data IS NOT NULL`
  );

  const counts = {
    costTablesPresent: tables,
    analyses: analyses.rows.length,
    analysesWithProjectCostDomain: 0,
    analysesWithRenovationCostInput: 0,
    analysesWithMaintenanceInput: 0,
    storedQuotes: 0,
    storedInvoices: 0,
    storedProjectCostItems: 0,
    assetClassBreakdown: {},
  };

  analyses.rows.forEach((row) => {
    const output = row.output_data || {};
    const input = row.input_data || {};
    if (output.projectCostDomain) counts.analysesWithProjectCostDomain += 1;
    const finance = input.finance || input.finance?.options || {};
    if (finance.renovationCost != null || input.finance?.options?.renovationCost != null) {
      counts.analysesWithRenovationCostInput += 1;
    }
    if (finance.maintenance != null || input.finance?.options?.maintenance != null) {
      counts.analysesWithMaintenanceInput += 1;
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
