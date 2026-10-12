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

  test('landing leads with search and compact step rail, not instruction essay', () => {
    expect(piSrc).toMatch(/pi-landing-intro/);
    expect(piSrc).toMatch(/Understand a property before you make a decision/);
    expect(piSrc).toMatch(/Search by UK address or postcode/);
    expect(piSrc).not.toMatch(/How Property Intelligence works/);
    expect(piSrc).toMatch(/Property<\/li>/);
    expect(piSrc).toMatch(/Decision<\/li>/);
    expect(piSrc).toMatch(/Intelligence<\/li>/);
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

  test('AI hub distinguishes Property Intelligence from Investment Analyst', () => {
    expect(hubSrc).toMatch(/Property-specific/);
    expect(hubSrc).toMatch(/Numbers-only calculator/);
    expect(navSrc).toMatch(/hint: 'Property-specific'/);
    expect(navSrc).toMatch(/hint: 'Numbers only'/);
  });
});
