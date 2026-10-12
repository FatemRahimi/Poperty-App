const fs = require('fs');
const path = require('path');

describe('Property Intelligence architecture shell wiring', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');

  test('property facts bridge precedes decision job selector', () => {
    expect(piSrc).toMatch(/PropertyFactsSummary/);
    expect(piSrc).toMatch(/DecisionJobSelector/);
    const facts = piSrc.indexOf('<PropertyFactsSummary');
    const job = piSrc.indexOf('<DecisionJobSelector');
    expect(facts).toBeGreaterThan(-1);
    expect(job).toBeGreaterThan(facts);
  });

  test('legal evidence is optional and before Analyse CTA in pre-analyse workspace', () => {
    const analyse = piSrc.indexOf('data-testid="analyse-property-cta"');
    const legal = piSrc.indexOf('<LegalTitleEvidencePanel');
    expect(analyse).toBeGreaterThan(-1);
    expect(legal).toBeGreaterThan(-1);
    expect(legal).toBeLessThan(analyse);
    expect(piSrc).toMatch(/isProfessional \|\| isExternal/);
  });

  test('results hide find/select chrome and keep compact property header', () => {
    expect(piSrc).toMatch(/!report && !preview/);
    expect(piSrc).toMatch(/results-chrome/);
    expect(piSrc).toMatch(/decision-first-results/);
    expect(piSrc).toMatch(/PropertyHeader/);
    expect(piSrc).toMatch(/hasExactPropertySubject && !report && renderPreAnalyseWorkspace/);
  });

  test('analysis readiness is presentation-only for LET', () => {
    expect(piSrc).toMatch(/buildLetAnalysisReadiness/);
    expect(piSrc).toMatch(/AnalysisReadinessPanel/);
  });
});
