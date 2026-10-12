import {
  hasExactPropertySubject,
  shouldRenderDecisionJobSelector,
} from './decisionJobSelectorGate';

describe('decisionJobSelectorGate', () => {
  test('postcode / area context alone does not unlock the property job selector', () => {
    expect(hasExactPropertySubject({ preview: null })).toBe(false);
    expect(
      hasExactPropertySubject({
        preview: null,
        selectedSubjectId: null,
        selectedId: null,
      })
    ).toBe(false);
    expect(
      shouldRenderDecisionJobSelector({
        preview: null,
        report: null,
        isAuthenticated: true,
      })
    ).toBe(false);
  });

  test('exact platform subject renders selector without listingId / approved / ownership', () => {
    const preview = {
      address_display: 'Flat 2, 10 Marks Street, Birmingham B1 2UJ',
      property_type: 'Flat',
    };
    expect(
      hasExactPropertySubject({
        preview,
        selectedId: 42,
        selectedSubjectId: null,
      })
    ).toBe(true);
    expect(preview.listingId).toBeUndefined();
    expect(preview.approved).toBeUndefined();
    expect(preview.ownership).toBeUndefined();
    expect(
      shouldRenderDecisionJobSelector({
        preview,
        selectedId: 42,
        report: null,
      })
    ).toBe(true);
  });

  test('exact non-listing resolved subject renders selector without a platform listing', () => {
    const preview = {
      address_display: '12 Acacia Avenue, London SW2 3BD',
      property_type: 'house',
      uprn: '100023336789',
      source: 'external_lookup',
    };
    expect(
      hasExactPropertySubject({
        preview,
        selectedSubjectId: 501,
        selectedId: null,
      })
    ).toBe(true);
    expect(preview.id).toBeUndefined();
    expect(preview.listingId).toBeUndefined();
    expect(preview.price).toBeUndefined();
    expect(preview.monthly_rent).toBeUndefined();
    expect(
      shouldRenderDecisionJobSelector({
        preview,
        selectedSubjectId: 501,
        selectedId: null,
        report: null,
      })
    ).toBe(true);
  });

  test('listing-shaped preview alone does not unlock the selector', () => {
    expect(
      hasExactPropertySubject({
        preview: {
          id: 42,
          listingId: 42,
          approved: true,
          ownership: 'owner',
          price: 250000,
          monthly_rent: 1200,
        },
        selectedSubjectId: null,
        selectedId: null,
      })
    ).toBe(false);
  });

  test('does not treat listing fields as the gate when an exact subject already exists', () => {
    const preview = {
      address_display: '12 Acacia Avenue',
      listingId: undefined,
      approved: false,
      price: null,
      monthly_rent: null,
    };
    expect(
      hasExactPropertySubject({
        preview,
        selectedSubjectId: '501',
        selectedId: null,
      })
    ).toBe(true);
  });

  test('hides selector once a report exists', () => {
    expect(
      shouldRenderDecisionJobSelector({
        preview: { address_display: '12 Acacia Avenue' },
        selectedSubjectId: 501,
        report: { decisionJob: 'LET_INVEST' },
      })
    ).toBe(false);
  });
});
