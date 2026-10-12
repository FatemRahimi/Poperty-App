const fs = require('fs');
const path = require('path');

describe('Property Intelligence — Property Facts truth wiring', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');
  const displaySrc = fs.readFileSync(
    path.join(__dirname, '../../Utils/propertyFactsDisplay.js'),
    'utf8'
  );
  const summarySrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/PropertyFactsSummary.js'),
    'utf8'
  );

  test('Property Facts sits after Selected Property and before What are you assessing', () => {
    const header = piSrc.indexOf('<PropertyHeader');
    const facts = piSrc.indexOf('<PropertyFactsSummary');
    const job = piSrc.indexOf('<DecisionJobSelector');
    expect(header).toBeGreaterThan(-1);
    expect(facts).toBeGreaterThan(header);
    expect(job).toBeGreaterThan(facts);
  });

  test('Change property clears property-fact attribute context', () => {
    expect(piSrc).toMatch(/setPropertyFactsAttributes\(null\)/);
    expect(piSrc).toMatch(/const changeProperty = useCallback/);
  });

  test('parking sanitisation rejects out-of-range listing values', () => {
    expect(displaySrc).toMatch(/MAX_SAFE_PARKING_SPACES_DISPLAY = 20/);
    expect(displaySrc).toMatch(/sanitizeParkingDisplay/);
    expect(displaySrc).toMatch(/parking_spaces_outside_accepted_display_range/);
  });

  test('facts builder does not invent bedrooms from postcode or Average condition', () => {
    expect(displaySrc).not.toMatch(/postcodeIntelligence|typicalBedroom|averageBedroom/);
    expect(displaySrc).toMatch(/key === 'average' && !allowAverage/);
    expect(displaySrc).not.toMatch(/'Reference'/);
  });

  test('summary keeps Unknown neutral and listing provenance explicit', () => {
    expect(summarySrc).toMatch(/Unknown/);
    expect(summarySrc).toMatch(/What we know about this property/);
    expect(summarySrc).toMatch(/subjectId/);
  });
});
