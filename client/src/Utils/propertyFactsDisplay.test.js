import {
  sanitizePropertyTypeDisplay,
  buildPropertyFactsFromPreview,
  provenanceClassLabel,
  sanitizeParkingDisplay,
  MAX_SAFE_PARKING_SPACES_DISPLAY,
} from './propertyFactsDisplay';

describe('propertyFactsDisplay', () => {
  test('sanitises Postgres array-style property types', () => {
    expect(sanitizePropertyTypeDisplay('{"flat","flat"}')).toBe('Flat');
    expect(sanitizePropertyTypeDisplay('{semi-detached,semi-detached}')).toBe(
      'Semi-detached house'
    );
    expect(sanitizePropertyTypeDisplay('unknown')).toBeNull();
    expect(sanitizePropertyTypeDisplay('office')).toBe('Office');
  });

  test('missing parking/outdoor stay Unknown — never No', () => {
    const facts = buildPropertyFactsFromPreview({
      property_type: 'flat',
      has_parking: false,
      has_garden: false,
      bedrooms: 2,
    });
    const parking = facts.find((f) => f.id === 'parking');
    const outdoor = facts.find((f) => f.id === 'outdoor');
    expect(parking.known).toBe(false);
    expect(parking.value).toBeNull();
    expect(outdoor.known).toBe(false);
    expect(String(parking.value || 'Unknown')).not.toMatch(/^no$/i);
    expect(String(outdoor.value || 'Unknown')).not.toMatch(/^no$/i);
  });

  test('true parking/garden are known listing-supplied', () => {
    const facts = buildPropertyFactsFromPreview({
      has_parking: true,
      has_garden: true,
      bedrooms: 1,
      parking_spaces: 2,
    });
    expect(facts.find((f) => f.id === 'parking')).toMatchObject({
      known: true,
      value: '2 spaces',
      provenanceLabel: 'Listing supplied',
    });
    expect(facts.find((f) => f.id === 'outdoor').value).toMatch(/Garden/);
  });

  test('unsafe parking_spaces 230 is not shown as a parking fact', () => {
    const parking = sanitizeParkingDisplay({ parking_spaces: 230 });
    expect(parking.value).toBeNull();
    expect(parking.safe).toBe(false);
    expect(parking.raw).toBe(230);
    const facts = buildPropertyFactsFromPreview({
      property_type: 'office',
      parking_spaces: 230,
      square_feet: 5000,
    });
    expect(facts.find((f) => f.id === 'parking')).toMatchObject({
      known: false,
      value: null,
    });
    expect(MAX_SAFE_PARKING_SPACES_DISPLAY).toBe(20);
  });

  test('does not invent finish/condition Average', () => {
    const facts = buildPropertyFactsFromPreview({
      property_type: 'house',
      finish_quality: 'average',
    });
    expect(facts.find((f) => f.id === 'finish').known).toBe(false);
    expect(provenanceClassLabel('listing')).toBe('Listing supplied');
  });

  test('bedrooms/bathrooms are not invented and never become 0 from absence', () => {
    const facts = buildPropertyFactsFromPreview({ property_type: 'flat' });
    expect(facts.find((f) => f.id === 'bedrooms')).toMatchObject({ known: false, value: null });
    expect(facts.find((f) => f.id === 'bathrooms')).toMatchObject({ known: false, value: null });
    expect(facts.find((f) => f.id === 'bedrooms').value).not.toBe(0);
    expect(facts.find((f) => f.id === 'bathrooms').value).not.toBe(0);
  });

  test('does not include UPRN/reference or area market metrics as facts', () => {
    const facts = buildPropertyFactsFromPreview(
      {
        property_type: 'flat',
        uprn: '1001',
        typical_sold_price: 190200,
        area_yield: 5.68,
      },
      { uprn: '1001' }
    );
    expect(facts.find((f) => f.id === 'uprn')).toBeUndefined();
    expect(facts.some((f) => /typical|yield/i.test(f.label))).toBe(false);
    expect(facts.find((f) => f.id === 'floorArea').known).toBe(false);
    expect(JSON.stringify(facts)).not.toMatch(/190200|5\.68/);
  });

  test('user-provided attributes take display precedence with User provided label', () => {
    const facts = buildPropertyFactsFromPreview(
      { property_type: 'flat', bedrooms: 1 },
      {
        attributes: {
          bedrooms: {
            available: true,
            value: 3,
            provenance: 'USER_REPORTED',
          },
        },
      }
    );
    expect(facts.find((f) => f.id === 'bedrooms')).toMatchObject({
      known: true,
      value: '3',
      provenanceLabel: 'User provided',
    });
  });

  test('floor area keeps unit from listing fields without inventing', () => {
    const sqft = buildPropertyFactsFromPreview({ square_feet: 5000, property_type: 'office' });
    expect(sqft.find((f) => f.id === 'floorArea').value).toBe('5000 sq ft');
    const sqm = buildPropertyFactsFromPreview({
      floor_area: 64,
      floor_area_unit: 'sq_m',
      property_type: 'flat',
    });
    expect(sqm.find((f) => f.id === 'floorArea').value).toBe('64 m²');
  });

  test('explicit outdoor none only when confirmed', () => {
    const unknown = buildPropertyFactsFromPreview({ has_garden: false });
    expect(unknown.find((f) => f.id === 'outdoor').known).toBe(false);
    const none = buildPropertyFactsFromPreview({ outdoor_none_confirmed: true });
    expect(none.find((f) => f.id === 'outdoor')).toMatchObject({
      known: true,
      value: 'No outdoor space',
    });
  });

  test('office-like subject keeps bedrooms Unknown without inventing N/A', () => {
    const facts = buildPropertyFactsFromPreview({
      property_type: 'office',
      square_feet: 5000,
      parking_spaces: 230,
    });
    expect(facts.find((f) => f.id === 'propertyType').value).toBe('Office');
    expect(facts.find((f) => f.id === 'bedrooms').known).toBe(false);
    expect(facts.find((f) => f.id === 'bathrooms').known).toBe(false);
    expect(facts.find((f) => f.id === 'parking').known).toBe(false);
    expect(facts.find((f) => f.id === 'floorArea').value).toBe('5000 sq ft');
  });
});
