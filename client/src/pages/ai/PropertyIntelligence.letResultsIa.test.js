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
  const caseSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/LetInvestPropertyCase.js'),
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

  test('LET results panel is a property case and does not duplicate the decision-intelligence block', () => {
    expect(reportSrc).toMatch(/LetInvestPropertyCase/);
    expect(reportSrc).toMatch(/letDecisionFirst/);
    expect(reportSrc).toMatch(/showDecisionIntelligence && !letDecisionFirst/);
    expect(reportSrc).not.toMatch(/LetInvestResultsPanel/);
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
    expect(caseSrc.indexOf('What matters')).toBeLessThan(caseSrc.indexOf('Key numbers'));
    expect(caseSrc.indexOf('Key numbers')).toBeLessThan(caseSrc.indexOf('What needs checking'));
    expect(caseSrc.indexOf('What needs checking')).toBeLessThan(caseSrc.indexOf('Next actions'));
  });
});
