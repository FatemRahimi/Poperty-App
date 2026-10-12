const fs = require('fs');
const path = require('path');

/**
 * Pre-GTM usability closure — source/presentation guards (no methodology).
 */
describe('LET_INVEST pre-GTM usability presentation guards', () => {
  const piSrc = fs.readFileSync(
    path.join(__dirname, 'PropertyIntelligence.js'),
    'utf8'
  );
  const reportSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/IntelligenceReport.js'),
    'utf8'
  );
  const whatIfSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/WhatIfPanel.js'),
    'utf8'
  );
  const formSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/FinanceScenarioForm.js'),
    'utf8'
  );

  test('Property Intelligence does not instruct users to edit .env or API keys', () => {
    expect(piSrc).not.toMatch(/server\/\.env/);
    expect(piSrc).not.toMatch(/PROPERTYDATA_API_KEY/);
    expect(piSrc).not.toMatch(/PROPERTYDATA_ENABLED/);
    expect(piSrc).toMatch(/external-lookup-unavailable/);
    expect(piSrc).toMatch(/UK address lookup is temporarily unavailable/);
  });

  test('IntelligenceReport does not present Recommended rent as a LET label', () => {
    expect(reportSrc).not.toMatch(/label=\"Recommended rent\"/);
    expect(reportSrc).toMatch(/Area asking-rent model estimate/);
    expect(reportSrc).toMatch(/not a property-specific achievable or recommended rent/);
  });

  test('What-if rent row is scenario-only wording', () => {
    expect(whatIfSrc).not.toMatch(/Expected \/ market rent/);
    expect(whatIfSrc).toMatch(/Scenario rent input/);
  });

  test('LET finance form includes unlock guidance and field wraps for underwriting keys', () => {
    expect(formSrc).toMatch(/let-underwriting-unlock-guide/);
    [
      'purchasePrice',
      'expectedRent',
      'vacancyAssumption',
      'maintenance',
      'insurance',
      'managementFee',
      'taxes',
      'serviceCharge',
      'groundRent',
      'deposit',
      'mortgageAmount',
      'interestRate',
      'mortgageTermYears',
    ].forEach((key) => {
      expect(formSrc).toMatch(new RegExp(`fieldWrap\\('${key}'`));
    });
  });

  test('gross yield early-orientation presentation exists without suppressing yield', () => {
    expect(reportSrc).toMatch(/gross-yield-orientation-note/);
    expect(reportSrc).toMatch(/early orientation only/i);
    expect(reportSrc).toMatch(/pi-metric-tile--orientation/);
  });
});
