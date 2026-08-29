import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhatIfPanel from './WhatIfPanel';
import { compareIntelligenceWhatIf } from '../../services/aiService';
import { buildFinanceAnalyseRequest, EMPTY_FINANCE_SCENARIO } from '../../Utils/financeScenario';

jest.mock('../../services/aiService', () => ({
  compareIntelligenceWhatIf: jest.fn(),
}));

const PREVIEW = { price: 200000, monthly_rent: 1000, service_charges: 100, ground_rent: 250 };
const REPORT = {
  property: { price: 200000, monthly_rent: 1000 },
  propertyFacts: { facts: {} },
  presented: {
    grossYield: { available: true, value: 6 },
    noi: { available: false, state: 'notAssessed', reason: 'incomplete' },
  },
};

function apiResult(overrides = {}) {
  return {
    success: true,
    scoreSource: 'personal-decision-whatif-1.0.0',
    listing: { askingPrice: 200000, monthlyRent: 1000 },
    factsUnchanged: { listingAskingPrice: 200000, listingRent: 1000 },
    baseline: {
      purchasePrice: 200000,
      expectedRent: 1000,
      operatingCostCompleteness: 'NOT_ASSESSED',
      financeCompleteness: 'NOT_ASSESSED',
      presented: {
        grossYield: { available: true, value: 6 },
        noi: { available: false, reason: 'incomplete' },
      },
      decision: {
        score: 62,
        dimensions: { demand: { available: false, score: null, state: 'no_demand_data_source' } },
      },
    },
    scenario: {
      purchasePrice: 185000,
      expectedRent: 1000,
      operatingCostCompleteness: 'NOT_ASSESSED',
      financeCompleteness: 'NOT_ASSESSED',
      presented: {
        grossYield: { available: true, value: 6.49 },
        noi: { available: false, reason: 'incomplete' },
      },
      decision: {
        score: 68,
        dimensions: { demand: { available: false, score: null, state: 'no_demand_data_source' } },
      },
    },
    change: {
      purchasePrice: { before: 200000, after: 185000, delta: -15000 },
      expectedRent: { before: 1000, after: 1000, delta: 0 },
      grossYield: {
        before: 6,
        after: 6.49,
        delta: 0.49,
        stateBefore: 'assessed',
        stateAfter: 'assessed',
      },
      noi: {
        before: null,
        after: null,
        delta: null,
        stateBefore: 'notAssessed',
        stateAfter: 'notAssessed',
      },
      monthlyCashFlow: {
        before: null,
        after: null,
        delta: null,
        stateBefore: 'notAssessed',
        stateAfter: 'notAssessed',
      },
      dscr: {
        before: null,
        after: null,
        delta: null,
        stateBefore: 'notAssessed',
        stateAfter: 'notAssessed',
      },
      score: { before: 62, after: 68, delta: 6 },
      dimensions: {},
    },
    explanation: {
      overall: 'Lowering the purchase price improves gross yield and cash flow in this scenario.',
      improved: [],
      worsened: [],
      financeChanges: [],
    },
    ...overrides,
  };
}

describe('WhatIfPanel', () => {
  beforeEach(() => {
    compareIntelligenceWhatIf.mockReset();
    compareIntelligenceWhatIf.mockResolvedValue(apiResult());
  });

  test('what-if UI renders after a report without running automatically', () => {
    render(
      <WhatIfPanel preview={PREVIEW} report={REPORT} propertyId={1} baselinePayload={{}} />
    );
    expect(screen.getByTestId('whatif-panel')).toBeInTheDocument();
    expect(screen.getByTestId('whatif-finance-form')).toBeInTheDocument();
    expect(screen.queryByTestId('whatif-result')).not.toBeInTheDocument();
    expect(compareIntelligenceWhatIf).not.toHaveBeenCalled();
  });

  test('baseline listing values stay visible and separate from scenario inputs', async () => {
    render(
      <WhatIfPanel preview={PREVIEW} report={REPORT} propertyId={1} baselinePayload={{}} />
    );
    expect(screen.getByText('FACT / BASELINE · Listing asking price')).toBeInTheDocument();
    expect(screen.getAllByText('£200,000').length).toBeGreaterThan(0);
    const purchase = screen.getByLabelText(/your purchase price/i);
    expect(purchase).toHaveValue('');
    await userEvent.type(purchase, '185000');
    expect(purchase).toHaveValue('185000');
    expect(screen.getByText('FACT / BASELINE · Listing asking price')).toBeInTheDocument();
    expect(screen.getAllByText('£200,000').length).toBeGreaterThan(0);
  });

  test('blank vacancy is omitted while zero is submitted through the canonical builder', async () => {
    render(
      <WhatIfPanel preview={PREVIEW} report={REPORT} propertyId={1} baselinePayload={{}} />
    );
    const vacancy = screen.getByRole('textbox', { name: 'Vacancy assumption' });
    expect(buildFinanceAnalyseRequest({ ...EMPTY_FINANCE_SCENARIO }).payload).toEqual({});
    await userEvent.type(vacancy, '0');
    await userEvent.click(screen.getByRole('button', { name: /compare scenario/i }));
    await screen.findByTestId('whatif-result');
    expect(compareIntelligenceWhatIf).toHaveBeenCalled();
    const body = compareIntelligenceWhatIf.mock.calls[0][0];
    expect(body.scenario.finance.operatingCosts.vacancyAssumption).toBe(0);
    expect(body.propertyId).toBe(1);
  });

  test('frequency is submitted unchanged and results stay stale until recalculated', async () => {
    render(
      <WhatIfPanel preview={PREVIEW} report={REPORT} propertyId={1} baselinePayload={{}} />
    );
    await userEvent.type(screen.getByLabelText(/your purchase price/i), '185000');
    await userEvent.type(screen.getByRole('textbox', { name: 'Maintenance' }), '100');
    await userEvent.selectOptions(screen.getByLabelText(/maintenance frequency/i), 'monthly');
    await userEvent.click(screen.getByRole('button', { name: /compare scenario/i }));
    expect(await screen.findByTestId('whatif-result')).toBeInTheDocument();
    const body = compareIntelligenceWhatIf.mock.calls[0][0];
    expect(body.scenario.finance.operatingCosts.maintenance).toEqual({
      value: 100,
      frequency: 'monthly',
    });
    expect(screen.getByTestId('whatif-row-score')).toHaveTextContent('62');
    expect(screen.getByTestId('whatif-row-score')).toHaveTextContent('68');
    expect(screen.getByTestId('whatif-row-score')).toHaveTextContent('+6');
    await userEvent.type(screen.getByLabelText(/your purchase price/i), '0');
    expect(screen.getByTestId('whatif-stale-banner')).toHaveTextContent(/recalculate scenario/i);
    expect(screen.getByTestId('whatif-row-score')).toHaveTextContent('68');
  });

  test('comparison uses API deltas and shows notAssessed rather than zero', async () => {
    render(
      <WhatIfPanel preview={PREVIEW} report={REPORT} propertyId={1} baselinePayload={{}} />
    );
    await userEvent.click(screen.getByRole('button', { name: /compare scenario/i }));
    expect(await screen.findByTestId('whatif-result')).toBeInTheDocument();
    expect(screen.getByTestId('whatif-row-noi')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('whatif-row-cash')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('whatif-row-dscr')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('whatif-demand')).toHaveTextContent(/not assessed/i);
    expect(screen.getByTestId('whatif-explanation')).toHaveTextContent(/lowering the purchase price/i);
    expect(screen.queryByText(/definitely be a better investment/i)).not.toBeInTheDocument();
  });

  test('saved analysis pins FACT listing values to the report, not the live preview', () => {
    render(
      <WhatIfPanel
        preview={{ price: 185000, monthly_rent: 900 }}
        report={{
          property: { price: 200000, monthly_rent: 1000 },
          evidenceAsOf: '2026-08-14T10:00:00.000Z',
          analysisDate: '2026-08-14T10:00:00.000Z',
        }}
        propertyId={1}
        analysisId={40}
      />
    );
    expect(screen.getByTestId('whatif-saved-baseline-notice')).toHaveTextContent(
      /comparing against this saved analysis from/i
    );
    expect(screen.getByTestId('whatif-saved-baseline-notice')).toHaveTextContent(/2026/);
    expect(screen.getAllByText('£200,000').length).toBeGreaterThan(0);
    expect(screen.queryByText('£185,000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('whatif-listing-changed-notice')).not.toBeInTheDocument();
  });

  test('frontend uses server baseline metadata and does not reconstruct or invent scores', async () => {
    compareIntelligenceWhatIf.mockResolvedValue(
      apiResult({
        baselineMode: 'saved_snapshot',
        baselineSource: 'saved_analysis',
        currentListingChangedSinceAnalysis: true,
        baselineCreatedAt: '2026-08-14T10:00:00.000Z',
        listing: { askingPrice: 200000, monthlyRent: 1000 },
        change: {
          ...apiResult().change,
          score: { before: 71, after: 68, delta: -3 },
        },
      })
    );
    render(
      <WhatIfPanel
        preview={{ price: 185000, monthly_rent: 900 }}
        report={{
          property: { price: 200000, monthly_rent: 1000 },
          evidenceAsOf: '2026-08-14T10:00:00.000Z',
        }}
        propertyId={1}
        analysisId={40}
        baselinePayload={{ purchasePrice: 999999 }}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /compare scenario/i }));
    expect(await screen.findByTestId('whatif-result')).toBeInTheDocument();
    const body = compareIntelligenceWhatIf.mock.calls[0][0];
    expect(body.analysisId).toBe(40);
    expect(body.baseline).toBeUndefined();
    expect(body.score).toBeUndefined();
    expect(body.property).toBeUndefined();
    expect(screen.getByTestId('whatif-listing-changed-notice')).toHaveTextContent(
      /current listing has changed since this analysis/i
    );
    expect(screen.getByTestId('whatif-row-score')).toHaveTextContent('71');
    expect(screen.getByTestId('whatif-row-score')).toHaveTextContent('68');
    expect(screen.getByTestId('whatif-row-score')).toHaveTextContent('-3');
    expect(screen.getByTestId('whatif-listing-asking')).toHaveTextContent('£200,000');
    expect(screen.getByTestId('whatif-listing-asking')).not.toHaveTextContent('£185,000');
  });

  test('live analysis does not show a saved-baseline notice', () => {
    render(
      <WhatIfPanel preview={PREVIEW} report={REPORT} propertyId={1} baselinePayload={{}} />
    );
    expect(screen.queryByTestId('whatif-saved-baseline-notice')).not.toBeInTheDocument();
  });
});
