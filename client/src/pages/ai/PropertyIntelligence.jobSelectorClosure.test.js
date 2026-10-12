const fs = require('fs');
const path = require('path');

describe('Property Intelligence — job selector subject-native closure', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');
  const selectorSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/DecisionJobSelector.js'),
    'utf8'
  );
  const gateSrc = fs.readFileSync(
    path.join(__dirname, '../../Utils/decisionJobSelectorGate.js'),
    'utf8'
  );

  test('job selector requires exact subject — not postcode / area alone', () => {
    expect(piSrc).toMatch(/hasExactPropertySubject/);
    expect(piSrc).toMatch(/computeHasExactPropertySubject\(\{/);
    expect(piSrc).toMatch(/hasExactPropertySubject && !report && renderPreAnalyseWorkspace/);
    expect(piSrc).toMatch(/postcodeAreaMode/);
    expect(piSrc).not.toMatch(/DecisionJobSelector[\s\S]{0,80}listingId/);
    expect(gateSrc).toMatch(/selectedSubjectId/);
    expect(gateSrc).toMatch(/selectedId/);
    expect(gateSrc).toMatch(/return hasIdentity\(selectedSubjectId\) \|\| hasIdentity\(selectedId\);/);
  });

  test('selector gate is subject/preview based — not approved listing / ownership', () => {
    expect(piSrc).toMatch(/computeHasExactPropertySubject\(\{\s*preview,\s*selectedSubjectId,\s*selectedId,/);
    expect(piSrc).not.toMatch(/hasExactPropertySubject = Boolean\(preview && \(selectedSubjectId \|\| selectedId \|\| preview\?\.id/);
    expect(gateSrc).toMatch(/Does NOT inspect listingId/);
  });

  test('Property Facts precede job selector; Analyse waits for job', () => {
    const facts = piSrc.indexOf('<PropertyFactsSummary');
    const job = piSrc.indexOf('<DecisionJobSelector');
    const analyse = piSrc.indexOf('data-testid="analyse-property-cta"');
    expect(facts).toBeGreaterThan(-1);
    expect(job).toBeGreaterThan(facts);
    expect(analyse).toBeGreaterThan(job);
    expect(piSrc).toMatch(/\{decisionJob \? \(/);
    expect(piSrc).toMatch(/Choose what you are assessing\./);
    expect(piSrc).not.toMatch(/pi-analyse-btn--waiting/);
  });

  test('Change property clears selected job so new subject does not inherit it', () => {
    const changeFn = piSrc.slice(
      piSrc.indexOf('const changeProperty = useCallback'),
      piSrc.indexOf('const changeProperty = useCallback') + 900
    );
    expect(changeFn).toMatch(/setDecisionJob\(null\)/);
    expect(changeFn).toMatch(/setPreview\(null\)/);
    expect(changeFn).toMatch(/resetFinanceScenario/);
    expect(piSrc).toMatch(/setSelectedId\(null\)/);
    expect(piSrc).toMatch(/setSelectedSubjectId\(null\)/);
  });

  test('analyse uses subject path when selectedSubjectId is set (non-listing)', () => {
    expect(piSrc).toMatch(/analyseSubjectIntelligence\(selectedSubjectId/);
    expect(piSrc).toMatch(/analysePropertyIntelligence\(selectedId/);
    expect(piSrc).toMatch(/selectedSubjectId\s*\?\s*await analyseSubjectIntelligence/);
  });

  test('Buy / Let-Invest / Sell are distinct controls with accessible selected state', () => {
    expect(selectorSrc).toMatch(/role="radio"/);
    expect(selectorSrc).toMatch(/aria-checked=\{selected\}/);
    expect(selectorSrc).toMatch(/decision-job-\$\{job\.id\}/);
    expect(selectorSrc).toMatch(/id: 'BUY'/);
    expect(selectorSrc).toMatch(/id: 'LET_INVEST'/);
    expect(selectorSrc).toMatch(/id: 'SELL'/);
    expect(selectorSrc).toMatch(/Selected/);
    expect(selectorSrc).toMatch(/Purchase decision/);
    expect(selectorSrc).toMatch(/Rental investment \/ landlord assessment/);
    expect(selectorSrc).toMatch(/ArrowRight/);
  });

  test('LET selection opens existing LET finance path only', () => {
    expect(piSrc).toMatch(/decisionJob === 'LET_INVEST'/);
    expect(piSrc).toMatch(/FinanceScenarioForm/);
    expect(piSrc).toMatch(/setFinanceExpandedSection\('property_rent'\)/);
  });

  test('does not fabricate listings or property facts to unlock the selector', () => {
    expect(piSrc).not.toMatch(/createFakeListing|fabricateListing|syntheticListing/);
    expect(piSrc).not.toMatch(/createFakeFacts|fabricateFacts|inventBedroomsFromPostcode/);
    expect(piSrc).toMatch(/resolveIntelligenceSubject/);
  });
});
