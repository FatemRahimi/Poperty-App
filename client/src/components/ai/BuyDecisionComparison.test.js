import { render, screen } from '@testing-library/react';
import BuyDecisionComparison from './BuyDecisionComparison';

describe('buy decision comparison', () => {
  test('shows stored evidence differences without choosing a winner', () => {
    render(
      <BuyDecisionComparison
        comparison={{
          conclusion: 'No purchase winner is determined from the current evidence.',
          subjects: [{ id: 'a', label: 'Property A' }, { id: 'b', label: 'Property B' }],
          columns: [
            { id: 'askingPrice', label: 'Asking price', a: '£280,000', b: '£300,000' },
            { id: 'serviceCharge', label: 'Service charge', a: '£0', b: 'Unknown' },
            { id: 'criticalInvestigations', label: 'Critical investigations', a: '1', b: '3' },
          ],
          observations: [
            {
              id: 'asking_price_difference',
              title: 'Price',
              statement: 'Property A\'s asking price is £20,000 lower.',
              limitation: 'This does not establish better value.',
            },
            {
              id: 'critical_investigation_burden',
              title: 'Uncertainty',
              statement: 'Property B currently has more decision-critical uncertainty to resolve (3) than Property A (1).',
              limitation: 'This does not make either property the better purchase.',
            },
            {
              id: 'preference_fit',
              title: 'Preference',
              statement: 'Property A currently better matches the stored preference.',
              limitation: 'Preference fit is not a purchase recommendation.',
            },
          ],
        }}
      />
    );
    expect(screen.getByTestId('buy-comparison-conclusion')).toHaveTextContent('No purchase winner is determined from the current evidence.');
    expect(screen.getByTestId('buy-comparison-row-serviceCharge')).toHaveTextContent('£0');
    expect(screen.getByTestId('buy-comparison-row-serviceCharge')).toHaveTextContent('Unknown');
    expect(screen.getByTestId('buy-comparison-observation-asking_price_difference')).toHaveTextContent('£20,000 lower');
    expect(screen.getByTestId('buy-comparison-observation-asking_price_difference')).toHaveTextContent('does not establish better value');
    expect(screen.getByTestId('buy-comparison')).not.toHaveTextContent(/undervalued|better lease|unmortgageable/i);
  });

  test('an older comparison without rows does not crash', () => {
    render(<BuyDecisionComparison comparison={null} />);
    expect(screen.getByTestId('buy-comparison-conclusion')).toHaveTextContent('No purchase winner');
    expect(screen.queryByTestId('buy-comparison-table')).not.toBeInTheDocument();
  });
});
