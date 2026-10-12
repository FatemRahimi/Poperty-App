const fs = require('fs');
const path = require('path');

/**
 * V1.3 Step 1 — Search → Exact Property Acquisition guards.
 * Frontend contract only; no bedroom/valuation inference from postcode.
 */
describe('Property Intelligence — exact property acquisition', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');
  const pickerSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/ExactPropertyPicker.js'),
    'utf8'
  );
  const displaySrc = fs.readFileSync(
    path.join(__dirname, '../../Utils/exactPropertyPickerDisplay.js'),
    'utf8'
  );
  const factsSrc = fs.readFileSync(
    path.join(__dirname, '../../Utils/propertyFactsDisplay.js'),
    'utf8'
  );

  test('postcode area mode does not unlock property workflow without preview', () => {
    expect(piSrc).toMatch(/postcodeAreaMode = Boolean\(lookupResult\?\.postcodeIntelligence\?\.success && !preview\)/);
    expect(piSrc).toMatch(/hasLookupMatches && !preview/);
    expect(piSrc).toMatch(/hasExactPropertySubject && !report && renderPreAnalyseWorkspace/);
    expect(piSrc).not.toMatch(/autoSelect|auto_select/);
  });

  test('explicit ExactPropertyPicker selection is required before confirmation', () => {
    expect(piSrc).toMatch(/onSelectInternal=\{selectProperty\}/);
    expect(piSrc).toMatch(/onSelectExternal=\{selectExternalMatch\}/);
    expect(piSrc).toMatch(/selected-property-confirmation/);
    expect(pickerSrc).toMatch(/Select the property/);
  });

  test('platform rows are property matches with listing evidence — not Your listing', () => {
    expect(pickerSrc).toMatch(/platformMatchEvidenceLabel/);
    expect(pickerSrc).toMatch(/Property matches/);
    expect(displaySrc).toMatch(/Listing evidence available/);
    expect(displaySrc).not.toMatch(/Your listing/);
    expect(pickerSrc).not.toMatch(/Your listing/);
  });

  test('does not fabricate flat/unit rows or bedroom counts from postcode', () => {
    expect(pickerSrc).not.toMatch(/Flat 1[\s\S]*Flat 2[\s\S]*Flat 3/);
    expect(pickerSrc).not.toMatch(/fabricat|syntheticUnit|inventedFlat/);
    expect(piSrc).not.toMatch(/bedrooms?\s*[:=]\s*.*postcode|averageBedroom|typicalBedroom/i);
    expect(factsSrc).not.toMatch(/fromPostcode|postcodeAverage.*bedroom|inferBedroom/i);
  });

  test('does not create property valuation from postcode context alone', () => {
    expect(piSrc).not.toMatch(/valuation.*=.*postcodeIntelligence|typicalPrice.*as.*valuation/i);
    expect(piSrc).toMatch(/PostcodeIntelligencePanel/);
  });
});
