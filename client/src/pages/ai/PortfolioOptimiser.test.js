import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import PortfolioResultView from '../../components/ai/PortfolioResultView';

describe('Portfolio presentation', () => {
  test('25. portfolio does not fall back to raw unassessed yield', () => {
    render(
      <MemoryRouter>
        <PortfolioResultView
          report={{
            summary: {
              propertyCount: 2,
              totalValue: 400000,
              totalMonthlyRent: 2000,
              avgGrossYield: null,
              opportunityCount: 0,
              riskCount: 0,
            },
            properties: [
              {
                id: 1,
                title: 'Assessed house',
                city: 'Leeds',
                price: 200000,
                monthlyRent: 1100,
                grossYield: 6.6,
                annualCashFlow: 2400,
                cashFlowState: 'calculated',
              },
              {
                id: 2,
                title: 'Unassessed flat',
                city: 'York',
                price: 200000,
                monthlyRent: null,
                grossYield: null,
                annualCashFlow: 0,
                cashFlowState: 'notAssessed',
                grossYieldState: 'notAssessed',
              },
            ],
            disclaimer: 'Not financial advice.',
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('portfolio-avg-yield')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('portfolio-avg-yield')).not.toHaveTextContent('0%');
    expect(screen.getByTestId('portfolio-yield-1')).toHaveTextContent('6.6%');
    expect(screen.getByTestId('portfolio-yield-2')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('portfolio-yield-2')).not.toHaveTextContent('0%');
    expect(screen.getByTestId('portfolio-cashflow-2')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('portfolio-cashflow-2')).not.toHaveTextContent('£0');
  });
});

describe('Portfolio source freeze', () => {
  test('does not recalculate yield or cash flow', () => {
    const src = [
      fs.readFileSync(path.join(__dirname, 'PortfolioOptimiser.js'), 'utf8'),
      fs.readFileSync(path.join(__dirname, '../../components/ai/PortfolioResultView.js'), 'utf8'),
    ].join('\n');
    expect(src).not.toMatch(/annualRent\s*\*\s*100/);
    expect(src).not.toMatch(/\/\s*price/);
    expect(src).not.toMatch(/grossYield\s*=\s*/);
    expect(src).not.toMatch(/openai|anthropic|llm/i);
  });
});
