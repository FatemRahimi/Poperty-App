import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import InvestmentAnalyst from './InvestmentAnalyst';
import InvestmentResultView from '../../components/ai/InvestmentResultView';
import { analyseInvestment } from '../../services/aiService';

jest.mock('../../services/aiService', () => ({
  analyseInvestment: jest.fn(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

jest.mock('../../components/ai/AiWorkspaceLayout', () => ({ children, title }) => (
  <div data-testid="layout">
    <h1>{title}</h1>
    {children}
  </div>
));

function assessed(extra = {}) {
  return { state: 'assessed', missingInputs: [], ...extra };
}

function notAssessed(reason) {
  return { state: 'notAssessed', missingInputs: [], reason };
}

function fullMetrics() {
  return {
    metricAssessment: {
      grossYield: assessed(),
      netYield: assessed(),
      annualRent: assessed(),
      vacancyAdjustedIncome: assessed(),
      operatingCosts: assessed(),
      noi: assessed(),
      mortgagePayment: assessed(),
      cashFlow: assessed(),
      dscr: assessed(),
      financing: { kind: 'EXPLICIT_MORTGAGE' },
    },
    inputSemantics: {
      interestRate: { state: 'POSITIVE_VALUE', value: 5.5 },
      mortgageTermYears: { state: 'POSITIVE_VALUE', value: 25 },
      vacancyAssumption: { state: 'EXPLICIT_ZERO', value: 0 },
    },
    financingState: { kind: 'EXPLICIT_MORTGAGE', amount: 160000 },
    rentBasis: { kind: 'SCENARIO' },
    grossYield: 6.6,
    netYield: 4.9,
    assumptions: { annualRent: 13200 },
    effectiveGrossRent: 13200,
    operatingExpenses: 0,
    noi: 13200,
    monthlyDebtService: 850,
    annualDebtService: 10200,
    annualCashFlow: 3000,
    monthlyCashFlow: 250,
    dscr: 1.294,
    disclaimer: 'Not financial advice.',
  };
}

function incompleteMetrics() {
  return {
    metricAssessment: {
      grossYield: assessed(),
      netYield: notAssessed('Net yield requires assessed NOI and a valid purchase price.'),
      annualRent: assessed(),
      vacancyAdjustedIncome: notAssessed('Missing vacancy is not 0% occupancy.'),
      operatingCosts: notAssessed('Missing operating costs are not a £0 cost assumption. Partial evidence is not complete.'),
      noi: notAssessed('NOI requires a valid rent basis and complete operating-cost evidence.'),
      mortgagePayment: notAssessed('Missing mortgage amount is not a cash purchase. Missing rate or term is not a zero-cost loan.'),
      cashFlow: notAssessed('Cash flow requires assessed NOI and an explicit financing state. Omitted mortgage fields are not a cash buyer.'),
      dscr: notAssessed('DSCR requires assessed NOI and valid debt-service inputs.'),
      financing: { kind: 'UNKNOWN' },
    },
    inputSemantics: {
      interestRate: { state: 'MISSING', value: null },
      mortgageTermYears: { state: 'MISSING', value: null },
      vacancyAssumption: { state: 'MISSING', value: null },
    },
    financingState: { kind: 'UNKNOWN', amount: null },
    rentBasis: { kind: 'SCENARIO' },
    grossYield: 6,
    netYield: null,
    assumptions: { annualRent: 12000 },
    effectiveGrossRent: null,
    operatingExpenses: null,
    noi: null,
    monthlyDebtService: null,
    annualDebtService: null,
    annualCashFlow: null,
    monthlyCashFlow: null,
    dscr: null,
    disclaimer: 'Not financial advice.',
  };
}

describe('Investment Analyst presentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('form does not prefill interest, term, vacancy or insurance as facts', () => {
    render(
      <MemoryRouter>
        <InvestmentAnalyst />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/interest rate/i)).toHaveValue(null);
    expect(screen.getByLabelText(/mortgage term/i)).toHaveValue(null);
    expect(screen.getByLabelText(/vacancy assumption/i)).toHaveValue(null);
    expect(screen.getByLabelText(/insurance/i)).toHaveValue(null);
  });

  test('assessed complete result renders numbers including explicit zeros', () => {
    render(
      <InvestmentResultView
        result={{
          metrics: fullMetrics(),
          scenarios: {
            conservative: { annualCashFlow: 2000, netYield: 4.1, cashOnCashReturn: 3 },
            base: { annualCashFlow: 3000, netYield: 4.9, cashOnCashReturn: 4 },
            optimistic: { annualCashFlow: 4000, netYield: 5.5, cashOnCashReturn: 5 },
          },
          score: { available: true, score: 72, label: 'Hold', componentDetail: {}, excluded: [] },
        }}
        userEnteredRent
      />
    );

    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('6.6%');
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Scenario-rent-based gross yield');
    expect(screen.getByTestId('metric-noi')).toHaveTextContent('£13,200');
    expect(screen.getByTestId('metric-operatingCosts')).toHaveTextContent('£0');
    expect(screen.getByTestId('input-vacancyAssumption')).toHaveTextContent('0%');
    expect(screen.getByTestId('financing-state')).toHaveTextContent('Mortgage financing');
    expect(screen.getByTestId('metric-dscr')).toHaveTextContent('1.294');
  });

  test('notAssessed metrics never render 0, null, undefined or NaN', () => {
    render(
      <InvestmentResultView
        result={{
          metrics: incompleteMetrics(),
          scenarios: {
            conservative: { annualCashFlow: null, netYield: null, cashOnCashReturn: null },
            base: { annualCashFlow: null, netYield: null, cashOnCashReturn: null },
            optimistic: { annualCashFlow: null, netYield: null, cashOnCashReturn: null },
          },
          sensitivity: [
            { label: 'Rent +5%', annualCashFlow: null, deltaCashFlow: Number.NaN, netYield: null },
          ],
        }}
      />
    );

    const noi = screen.getByTestId('metric-noi');
    expect(noi).toHaveTextContent('Not assessed');
    expect(noi).not.toHaveTextContent('£0');
    expect(noi.textContent).not.toMatch(/null|undefined|NaN/i);

    expect(screen.getByTestId('metric-netYield')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-netYield')).not.toHaveTextContent('0%');
    expect(screen.getByTestId('metric-annualCashFlow')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-monthlyCashFlow')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-dscr')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-dscr')).not.toHaveTextContent('0');
    expect(screen.getByTestId('financing-state')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('financing-state')).not.toHaveTextContent('Cash purchase');
    expect(screen.getByTestId('input-interestRate')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('input-interestRate')).not.toHaveTextContent('0%');
    expect(screen.getByTestId('input-mortgageTermYears')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('input-mortgageTermYears')).not.toHaveTextContent('25');
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('6%');
    expect(screen.getAllByText('Not assessed').length).toBeGreaterThan(3);
  });

  test('LISTING / MARKET / SCENARIO labels and live user rent is scenario', () => {
    const { rerender } = render(
      <InvestmentResultView
        result={{ metrics: { ...incompleteMetrics(), rentBasis: { kind: 'LISTING' }, presented: { grossYield: { available: true, value: 6, basis: 'LISTING_RENT' } } } }}
      />
    );
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Listing-rent-based gross yield');

    rerender(
      <InvestmentResultView
        result={{ metrics: { ...incompleteMetrics(), rentBasis: { kind: 'MARKET' } } }}
      />
    );
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Market-rent-based gross yield');
    expect(screen.getByTestId('metric-grossYield')).not.toHaveTextContent('Listing-rent');

    rerender(
      <InvestmentResultView result={{ metrics: incompleteMetrics() }} userEnteredRent />
    );
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Scenario-rent-based gross yield');
    expect(screen.getByTestId('metric-grossYield')).not.toHaveTextContent('observed');
  });

  test('legacy snapshot shows stored number without inventing assessment', () => {
    render(
      <InvestmentResultView
        result={{
          metrics: { grossYield: 7.1, netYield: null, noi: null, monthlyCashFlow: null, dscr: null },
        }}
      />
    );
    expect(screen.getByTestId('legacy-assessment-note')).toBeInTheDocument();
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('7.1%');
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Gross yield');
    expect(screen.getByTestId('metric-grossYield')).not.toHaveTextContent('Listing-rent');
    expect(screen.getByTestId('metric-grossYield')).not.toHaveTextContent('Market-rent');
    expect(screen.getByTestId('metric-noi')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('financing-state')).not.toHaveTextContent('Cash purchase');
  });

  test('explicit cash is distinct from missing mortgage', () => {
    render(
      <InvestmentResultView
        result={{
          metrics: {
            ...fullMetrics(),
            financingState: { kind: 'EXPLICIT_CASH', amount: 0 },
            monthlyDebtService: 0,
            annualDebtService: 0,
            metricAssessment: {
              ...fullMetrics().metricAssessment,
              mortgagePayment: assessed({ financingKind: 'EXPLICIT_CASH' }),
              dscr: notAssessed('DSCR is not assessed for an explicit cash purchase — there is no debt service.'),
            },
            dscr: null,
          },
        }}
      />
    );
    expect(screen.getByTestId('financing-state')).toHaveTextContent('Cash purchase');
    expect(screen.getByTestId('metric-mortgagePayment')).toHaveTextContent('£0');
    expect(screen.getByTestId('metric-dscr')).toHaveTextContent('Not assessed');
  });

  test('submit sends optional zeros and does not invent term or rate', async () => {
    analyseInvestment.mockResolvedValue({
      output: { metrics: incompleteMetrics(), scenarios: {}, score: { available: false, excluded: [] } },
    });
    render(
      <MemoryRouter>
        <InvestmentAnalyst />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/purchase price/i), { target: { name: 'purchasePrice', value: '200000' } });
    fireEvent.change(screen.getByLabelText(/expected rent/i), { target: { name: 'expectedRent', value: '1000' } });
    fireEvent.change(screen.getByLabelText(/vacancy assumption/i), { target: { name: 'vacancyAssumption', value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /run investment analysis/i }));

    await waitFor(() => {
      expect(analyseInvestment).toHaveBeenCalled();
    });
    expect(analyseInvestment).toHaveBeenCalledWith(
      expect.objectContaining({
        purchasePrice: 200000,
        expectedRent: 1000,
        vacancyAssumption: 0,
        interestRate: undefined,
        mortgageTermYears: undefined,
      })
    );
  });
});

describe('Investment Analyst source freeze', () => {
  test('canonical client does not recalculate finance metrics', () => {
    const files = [
      path.join(__dirname, 'InvestmentAnalyst.js'),
      path.join(__dirname, '../../components/ai/InvestmentResultView.js'),
      path.join(__dirname, '../../Utils/assessedMetricDisplay.js'),
    ];
    files.forEach((file) => {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/annualRent\s*=\s*.*\*\s*12/);
      expect(src).not.toMatch(/\/\s*purchasePrice/);
      expect(src).not.toMatch(/noi\s*-/);
      expect(src).not.toMatch(/\/\s*annualDebtService/);
      expect(src).not.toMatch(/grossYield\s*=\s*/);
      expect(src).not.toMatch(/openai|anthropic|llm|chat\.completions/i);
    });
  });
});
