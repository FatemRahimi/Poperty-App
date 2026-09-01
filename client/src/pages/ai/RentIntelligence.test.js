import React from 'react';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import RentResultView from '../../components/ai/RentResultView';

describe('Rent Analyst presentation', () => {
  test('26. missing evidence renders Not assessed, never null or empty £', () => {
    render(
      <RentResultView
        result={{
          insufficientData: true,
          message: 'Insufficient comparable rental data.',
          expectedDemand: {
            available: false,
            value: null,
            note: 'Demand remains notAssessed until a demand source exists.',
          },
          disclaimer: 'Not financial advice.',
        }}
      />
    );
    expect(screen.getByTestId('rent-recommended')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('rent-recommended')).not.toHaveTextContent('£null');
    expect(screen.getByTestId('rent-recommended').textContent).not.toMatch(/^£$/);
    expect(screen.getByTestId('rent-demand')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('rent-demand').textContent).not.toMatch(/null|undefined|NaN/);
  });

  test('successful result formats numbers and leaves demand not assessed', () => {
    render(
      <RentResultView
        result={{
          success: true,
          recommendedRent: 1250,
          marketRange: { low: 1100, high: 1400 },
          confidenceLevel: 'Medium',
          dataQuality: { level: 'Fair' },
          expectedDemand: { available: false, value: null, note: 'Estimate confidence is not market demand.' },
          priceSensitivity: [
            { label: 'Recommended', rent: 1250, demand: null },
          ],
          comparables: [
            { id: 1, title: 'Test flat', monthly_rent: 1200, similarity: 82, reasons: ['Same city'] },
            { id: 2, title: 'Missing rent', monthly_rent: null, similarity: null, reasons: [] },
          ],
          disclaimer: 'Not financial advice.',
        }}
      />
    );
    expect(screen.getByTestId('rent-recommended')).toHaveTextContent('£1,250');
    expect(screen.getByTestId('rent-market-range')).toHaveTextContent('£1,100–£1,400');
    expect(screen.getByTestId('rent-demand')).toHaveTextContent('Not assessed');
    expect(screen.getByText('£1,200')).toBeInTheDocument();
    expect(screen.getAllByText('Not assessed').length).toBeGreaterThan(1);
    expect(document.body.textContent).not.toMatch(/null%|£null|undefined|NaN/);
  });
});

describe('Rent Analyst source freeze', () => {
  test('does not recalculate finance or change rental methodology', () => {
    const src = [
      fs.readFileSync(path.join(__dirname, 'RentIntelligence.js'), 'utf8'),
      fs.readFileSync(path.join(__dirname, '../../components/ai/RentResultView.js'), 'utf8'),
    ].join('\n');
    expect(src).not.toMatch(/grossYield\s*=/);
    expect(src).not.toMatch(/recommendedRent\s*\*/);
    expect(src).not.toMatch(/openai|anthropic|llm/i);
  });
});
