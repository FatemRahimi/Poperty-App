const fs = require('fs');
const path = require('path');

describe('Property Intelligence UI/UX visual clarity presentation', () => {
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
  const hubSrc = fs.readFileSync(path.join(__dirname, 'AiHub.js'), 'utf8');
  const navSrc = fs.readFileSync(
    path.join(__dirname, '../../config/aiNavigation.js'),
    'utf8'
  );

  test('discovery is one job: find a property, without a step rail', () => {
    expect(piSrc).toMatch(/Find a property/);
    expect(piSrc).toMatch(/What property would you like to investigate\?/);
    expect(piSrc).toMatch(/aria-label="UK address or postcode"/);
    expect(piSrc).not.toMatch(/How Property Intelligence works/);
    expect(piSrc).not.toMatch(/pi-step-rail/);
    expect(piSrc).not.toMatch(/Understand a property before you make a decision/);
    expect(piSrc).not.toMatch(/Search by UK address or postcode/);
  });

  test('selected property and Analyse CTA remain dominant labels', () => {
    expect(piSrc).toMatch(/Selected property/);
    expect(piSrc).toMatch(/Analyse Property/);
  });

  test('results hierarchy is decision-first with actionable missing inputs', () => {
    expect(reportSrc).toMatch(/Property decision/);
    expect(reportSrc).toMatch(/Key signals/);
    expect(reportSrc).toMatch(/Improve this assessment/);
    expect(reportSrc).toMatch(/Add \{row\.label\}/);
    expect(reportSrc).not.toMatch(/>Missing underwriting input</);
    const letPanel = fs.readFileSync(
      path.join(__dirname, '../../components/ai/LetInvestResultsPanel.js'),
      'utf8'
    );
    expect(letPanel).toMatch(/Key economics/);
    expect(letPanel.indexOf('Key economics')).toBeLessThan(letPanel.indexOf('Risks, limitations'));
    expect(letPanel.indexOf('Risks, limitations')).toBeLessThan(letPanel.indexOf('Why this assessment'));
  });

  test('What-if is visually separated as scenario exploration', () => {
    expect(whatIfSrc).toMatch(/whatif-current-vs-scenario/);
    expect(whatIfSrc).toMatch(/Current assessment/);
    expect(whatIfSrc).toMatch(/What-if scenario/);
    expect(whatIfSrc).toMatch(/Scenario rent input/);
  });

  test('LET finance sections keep progressive blank semantics', () => {
    expect(formSrc).toMatch(/Deal & rent/);
    expect(formSrc).toMatch(/Operating costs/);
    expect(formSrc).toMatch(/Financing/);
    expect(formSrc).toMatch(/Blank means unknown — not zero/);
    expect(formSrc).toMatch(/let-underwriting-unlock-guide/);
  });

  test('AI hub starts by finding a property and keeps helper tools secondary', () => {
    expect(hubSrc).toMatch(/Find a property/);
    expect(hubSrc).toMatch(/What property would you like to investigate\?/);
    expect(hubSrc).toMatch(/Enter address or postcode/);
    expect(hubSrc).not.toMatch(/Intelligence suite/);
    expect(hubSrc).not.toMatch(/Quick tools/);
    expect(hubSrc).not.toMatch(/Investment Analyst/);
    expect(navSrc).toMatch(/label: 'Home'/);
    expect(navSrc).toMatch(/disclosure: true/);
    expect(navSrc).toMatch(/group: 'More tools'/);
    expect(navSrc).not.toMatch(/group: 'Advanced tools'/);
    expect(navSrc).not.toMatch(/hint: 'Property-specific'/);
    expect(navSrc).not.toMatch(/hint: 'Numbers only'/);
  });
});
