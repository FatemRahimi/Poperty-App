import { buyComparisonView } from './buyComparisonDisplay';

describe('buy comparison display', () => {
  test('renders stored statements and does not calculate a price gap', () => {
    const view = buyComparisonView({
      conclusion: 'No purchase winner is determined from the current evidence.',
      subjects: [{ id: 'a', label: 'Property A' }, { id: 'b', label: 'Property B' }],
      columns: [
        { id: 'askingPrice', label: 'Asking price', a: '£280,000', b: '£300,000' },
      ],
      observations: [
        {
          id: 'asking_price_difference',
          title: 'Price',
          statement: 'Property A\'s asking price is £20,000 lower.',
          limitation: 'This does not establish better value.',
        },
      ],
    });
    expect(view.observations[0].statement).toBe('Property A\'s asking price is £20,000 lower.');
    expect(view.observations[0].statement).not.toMatch(/better value/);
    expect(view.conclusion).toMatch(/No purchase winner/);
  });

  test('a missing comparison does not invent rows', () => {
    const view = buyComparisonView(null);
    expect(view.columns).toEqual([]);
    expect(view.observations).toEqual([]);
    expect(view.limited).toBe(true);
    expect(view.conclusion).toMatch(/No purchase winner/);
  });
});
