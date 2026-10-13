const fs = require('fs');
const path = require('path');

describe('Exact property picker — Property Intelligence wiring', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');
  const pickerSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/ExactPropertyPicker.js'),
    'utf8'
  );
  const headerSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/PropertyHeader.js'),
    'utf8'
  );

  test('uses ExactPropertyPicker between area context and selection confirmation', () => {
    expect(piSrc).toMatch(/import ExactPropertyPicker/);
    expect(piSrc).toMatch(/<ExactPropertyPicker/);
    expect(piSrc).toMatch(/hasLookupMatches && !preview/);
    expect(piSrc).toMatch(/selected-property-confirmation/);
    expect(piSrc).toMatch(/property-confirm-boundary/);
    expect(piSrc).toMatch(/This is the property we'll investigate/);
  });

  test('postcode alone never auto-selects a subject', () => {
    expect(piSrc).toMatch(/setLookupResult\(data\)/);
    expect(piSrc).not.toMatch(/setLookupResult\(data\);[\s\S]{0,120}selectExternalMatch/);
    expect(piSrc).not.toMatch(/setLookupResult\(data\);[\s\S]{0,120}selectProperty\(/);
    expect(piSrc).not.toMatch(/autoSelect|auto_select|firstMatch/);
  });

  test('job selector appears only inside selected-property confirmation', () => {
    const panelStart = piSrc.indexOf('data-testid="selected-property-confirmation"');
    const panelFn = piSrc.indexOf('const renderPreAnalyseWorkspace');
    expect(panelStart).toBeGreaterThan(panelFn);
    expect(piSrc.indexOf('<DecisionJobSelector')).toBeGreaterThan(panelStart);
    expect(piSrc).toMatch(/hasExactPropertySubject && !report && renderPreAnalyseWorkspace/);
  });

  test('Change property clears analysis state and returns to selection', () => {
    expect(piSrc).toMatch(/const changeProperty = useCallback/);
    expect(piSrc).toMatch(/onChangeProperty=\{changeProperty\}/);
    expect(piSrc).toMatch(/setDecisionJob\(null\)/);
    expect(piSrc).toMatch(/setReport\(null\)/);
    expect(piSrc).toMatch(/setPreview\(null\)/);
  });

  test('no-match state does not enter property workflow', () => {
    expect(piSrc).toMatch(/no-exact-property-matches/);
    expect(piSrc).toMatch(/No exact property matches found/);
    expect(piSrc).toMatch(/Area market context is not a selected property/);
  });

  test('picker copy avoids provider jargon and UPRN-first identity', () => {
    expect(pickerSrc).toMatch(/Select the exact property/);
    expect(pickerSrc).toMatch(/Property matches/);
    expect(pickerSrc).toMatch(/UK address \/ unit matches/);
    expect(pickerSrc).not.toMatch(/PropertyData/);
    expect(pickerSrc).not.toMatch(/Your listing/);
    expect(pickerSrc).toMatch(/epp-uprn-secondary/);
    expect(pickerSrc).not.toMatch(/UPRN \{/);
  });

  test('confirmed subject uses Selected property — listing is secondary evidence', () => {
    expect(headerSrc).toMatch(/Selected property/);
    expect(headerSrc).toMatch(/property-header-kicker/);
    expect(headerSrc).toMatch(/relationshipHint/);
    expect(headerSrc).not.toMatch(/Your listing/);
    expect(piSrc).toMatch(/selectedPropertyRelationshipHint/);
    expect(piSrc).not.toMatch(/Your listing/);
  });

  test('does not invent autocomplete or fabricate flats', () => {
    expect(piSrc).not.toMatch(/Ideal Postcodes|getAddress|loqate/i);
    expect(piSrc).not.toMatch(/address-autocomplete|typeaheadProvider|onKeyUp.*lookup/i);
    expect(pickerSrc).toMatch(/Can&apos;t see the exact property\? Search using the full address/);
    expect(pickerSrc).not.toMatch(/fabricat|inventedFlat|syntheticUnit/i);
  });

  test('Phase 1 area mode wiring remains intact', () => {
    expect(piSrc).toMatch(/mode=\{preview \? 'secondary' : 'primary'\}/);
    expect(piSrc).toMatch(/hasExactMatches=\{hasLookupMatches\}/);
    expect(piSrc).toMatch(/onSelectProperty=\{scrollToPropertyMatches\}/);
    expect(piSrc).toMatch(/postcodeAreaMode/);
  });
});
