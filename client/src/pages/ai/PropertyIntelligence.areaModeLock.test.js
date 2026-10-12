const fs = require('fs');
const path = require('path');

describe('Area vs Property mode lock — Property Intelligence wiring', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');

  test('postcode panel receives primary/secondary mode and select CTA wiring', () => {
    expect(piSrc).toMatch(/mode=\{preview \? 'secondary' : 'primary'\}/);
    expect(piSrc).toMatch(/hasExactMatches=\{hasLookupMatches\}/);
    expect(piSrc).toMatch(/onSelectProperty=\{scrollToPropertyMatches\}/);
    expect(piSrc).toMatch(/property-match-section/);
    expect(piSrc).toMatch(/postcodeAreaMode/);
  });

  test('does not invent address autocomplete provider in this phase', () => {
    expect(piSrc).not.toMatch(/Ideal Postcodes|getAddress|loqate/i);
    expect(piSrc).not.toMatch(/address-autocomplete|typeaheadProvider/i);
  });
});
