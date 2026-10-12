const fs = require('fs');
const path = require('path');

describe('Property Intelligence LET results IA wiring (Step 5)', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');
  const reportSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/IntelligenceReport.js'),
    'utf8'
  );
  const whatIfSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/WhatIfPanel.js'),
    'utf8'
  );
  const letPanelSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/LetInvestResultsPanel.js'),
    'utf8'
  );
  const step4Src = fs.readFileSync(
    path.join(__dirname, '../../Utils/letWorkspaceDisplay.js'),
    'utf8'
  );
  const jobSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/DecisionJobSelector.js'),
    'utf8'
  );

  test('results chrome is LET / INVEST assessment, not a sale-listing page', () => {
    expect(piSrc).toMatch(/results-job-kicker/);
    expect(piSrc).toMatch(/LET \/ INVEST assessment/);
    expect(piSrc).toMatch(/Saved snapshot — historical analysis/);
    expect(piSrc).not.toMatch(/Property for Sale/);
  });

  test('What-if stays after canonical results and uses strict listing provenance', () => {
    const gate = piSrc.indexOf('report && !loading && !report.insufficientData');
    expect(piSrc.indexOf('<IntelligenceReport', gate)).toBeLessThan(piSrc.indexOf('<WhatIfPanel', gate));
    expect(whatIfSrc).toMatch(/reportHasListingProvenance/);
    expect(whatIfSrc).toMatch(/listingAskingWhatIfCopy/);
    expect(whatIfSrc).toMatch(/pi-whatif--exploration/);
  });

  test('LET results panel is decision-first and does not duplicate DI findings', () => {
    expect(reportSrc).toMatch(/LetInvestResultsPanel/);
    expect(reportSrc).toMatch(/letDecisionFirst/);
    expect(reportSrc).toMatch(/showDecisionIntelligence && !letDecisionFirst/);
    expect(letPanelSrc).toMatch(/Key economics/);
    expect(letPanelSrc).toMatch(/Why this assessment/);
    expect(letPanelSrc).toMatch(/decision-intelligence-findings/);
  });

  test('Step 4 workspace helper remains the listing-evidence helper for pre-analysis', () => {
    expect(step4Src).toMatch(/export function subjectHasListingEvidence/);
    expect(step4Src).toMatch(/askingPriceEvidenceCopy/);
    expect(piSrc).toMatch(/buildLetAnalysisReadiness/);
    expect(piSrc).toMatch(/hasExactPropertySubject && !report && renderPreAnalyseWorkspace/);
  });

  test('Step 3 job selector flow remains the pre-analysis decision gate', () => {
    expect(jobSrc).toMatch(/LET_INVEST/);
    expect(piSrc).toMatch(/DecisionJobSelector/);
    expect(piSrc).toMatch(/setDecisionJob/);
  });

  test('results-start restoration does not reorder the frozen LET hierarchy', () => {
    expect(piSrc).toMatch(/data-testid="results-start"/);
    expect(piSrc.indexOf('data-testid="results-start"')).toBeLessThan(
      piSrc.indexOf('data-testid="decision-first-results"')
    );
    expect(letPanelSrc.indexOf('Key economics')).toBeLessThan(
      letPanelSrc.indexOf('Risks, limitations and missing evidence')
    );
    expect(letPanelSrc.indexOf('Risks, limitations and missing evidence')).toBeLessThan(
      letPanelSrc.indexOf('Why this assessment')
    );
  });
});
