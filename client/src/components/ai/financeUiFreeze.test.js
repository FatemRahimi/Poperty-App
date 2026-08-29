const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

describe('finance UI freeze', () => {
  test('frontend performs no finance arithmetic', () => {
    const files = [
      '../../Utils/financeScenario.js',
      './FinanceScenarioForm.js',
      './WhatIfPanel.js',
      './IntelligenceReport.js',
      '../../pages/ai/PropertyIntelligence.js',
    ];
    files.forEach((rel) => {
      const src = read(rel);
      expect(src).not.toMatch(/\* 12\b/);
      expect(src).not.toMatch(/\/ 12\b/);
      expect(src).not.toMatch(/\* 52\b/);
      expect(src).not.toMatch(/grossYield\s*=/);
      expect(src).not.toMatch(/monthlyCashFlow\s*=/);
    });
  });

  test('PI page no longer prefills a 25-year term', () => {
    const src = read('../../pages/ai/PropertyIntelligence.js');
    expect(src).not.toMatch(/mortgageTermYears:\s*'25'/);
    expect(src).toMatch(/EMPTY_FINANCE_SCENARIO/);
    expect(src).toMatch(/INVALID_FINANCE_INPUT/);
  });

  test('buyer_general and landlord weights are not imported into PI finance UI', () => {
    const src = [
      read('../../Utils/financeScenario.js'),
      read('./FinanceScenarioForm.js'),
      read('./IntelligenceReport.js'),
      read('./WhatIfPanel.js'),
      read('../../pages/ai/PropertyIntelligence.js'),
    ].join('\n');
    expect(src).not.toMatch(/BUYER_GENERAL_WEIGHTS/);
    expect(src).not.toMatch(/LANDLORD_WEIGHTS/);
    expect(src).not.toMatch(/buyer_family/);
  });

  test('PI remains usable without running What-if', () => {
    const src = read('../../pages/ai/PropertyIntelligence.js');
    expect(src).toMatch(/savedIntelligenceReportFromRow/);
    expect(src).toMatch(/fetchPropertyAnalysisById/);
    expect(src).toMatch(/IntelligenceReport report=\{report\}/);
    expect(src).toMatch(/WhatIfPanel/);
    expect(src.indexOf('<IntelligenceReport')).toBeLessThan(src.indexOf('<WhatIfPanel'));
    expect(src).toMatch(/report && !loading && !report\.insufficientData/);
    expect(read('./WhatIfPanel.js')).toMatch(/id="pi-what-if"/);
  });

  test('frontend does not invent a score delta', () => {
    const src = [
      read('./WhatIfPanel.js'),
      read('../../pages/ai/PropertyIntelligence.js'),
    ].join('\n');
    expect(src).not.toMatch(/score\.after\s*-/);
    expect(src).not.toMatch(/baseScore\s*-/);
    expect(src).not.toMatch(/potential score/i);
    expect(src).toMatch(/change\?\.score/);
  });

  test('IntelligenceReport does not implement landlord scoring arithmetic', () => {
    const src = read('./IntelligenceReport.js');
    expect(src).not.toMatch(/weightRetained/);
    expect(src).not.toMatch(/minCoverage/);
    expect(src).not.toMatch(/LANDLORD_WEIGHTS/);
    expect(src).not.toMatch(/score \* dim\.weight/);
    expect(src).toMatch(/personalDecision/);
  });

  test('canonical decision surfaces appear before heuristic notes in the report source', () => {
    const src = read('./IntelligenceReport.js');
    expect(src.indexOf('decision-overview')).toBeLessThan(src.indexOf('data-testid="earlier-model-analysis"'));
    expect(src.indexOf('What currently matters')).toBeLessThan(src.indexOf('property-context-evidence'));
    expect(src.indexOf('What can change this result')).toBeLessThan(src.indexOf('data-testid="earlier-model-analysis"'));
    expect(src).toMatch(/href="#pi-what-if"/);
    expect(src).not.toMatch(/grossYield\s*=\s*/);
    expect(src).not.toMatch(/fitScore\s*=\s*decision\.score\s*\+/);
  });

  test('PI loading stages no longer advertise heuristic opportunity generation', () => {
    const src = read('../../pages/ai/PropertyIntelligence.js');
    expect(src).not.toMatch(/Identifying opportunities/);
    expect(src).not.toMatch(/Analysing risks/);
    expect(src).toMatch(/Calculating landlord fit/);
  });

  test('frontend does not consume externalIntelligence', () => {
    const files = [
      './IntelligenceReport.js',
      './WhatIfPanel.js',
      './FinanceScenarioForm.js',
      '../../pages/ai/PropertyIntelligence.js',
      '../../pages/ai/AiHistory.js',
      '../../pages/ai/AiHistoryDetail.js',
      '../../pages/ai/AiHub.js',
      '../../Utils/savedIntelligenceReport.js',
      '../../services/aiService.js',
    ];
    files.forEach((rel) => {
      expect(read(rel)).not.toMatch(/externalIntelligence/);
    });
  });

  test('AI chrome uses one server-mirrored credit snapshot and no local credit arithmetic', () => {
    const files = [
      '../../services/aiCreditState.js',
      '../../services/aiService.js',
      './AiWorkspaceLayout.js',
      '../../pages/ai/PropertyIntelligence.js',
      '../../pages/ai/AiHub.js',
      '../../pages/ai/AiDashboard.js',
    ];
    files.forEach((rel) => {
      const src = read(rel);
      expect(src).not.toMatch(/credits_remaining\s*-\s*1/);
      expect(src).not.toMatch(/aiCredits\s*-\s*1/);
      expect(src).not.toMatch(/creditsRemaining\s*-\s*1/);
    });
    expect(read('../../services/aiCreditState.js')).toMatch(/applyServerCreditState/);
    expect(read('./AiWorkspaceLayout.js')).toMatch(/subscribeAiCredits/);
    expect(read('../../pages/ai/PropertyIntelligence.js')).toMatch(/subscribeAiCredits/);
    expect(read('../../pages/ai/PropertyIntelligence.js')).toMatch(/analyseSubjectIntelligence/);
    expect(read('../../pages/ai/AiHub.js')).toMatch(/subscribeAiCredits/);
    expect(read('../../pages/ai/AiDashboard.js')).toMatch(/subscribeAiCredits/);
    expect(read('../../pages/ai/AiHub.js')).not.toMatch(/credits_remaining\s*-\s*1/);
    expect(read('../../pages/ai/AiDashboard.js')).not.toMatch(/credits_remaining\s*-\s*1/);
  });
});
