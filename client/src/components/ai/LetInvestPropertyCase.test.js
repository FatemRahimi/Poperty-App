import React from 'react';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import IntelligenceReport from './IntelligenceReport';

jest.mock('../../services/aiService', () => ({
  getSubjectPropertyAttributes: jest.fn(async () => ({ success: true, attributes: {} })),
  putSubjectPropertyAttributes: jest.fn(async () => ({ success: true, attributes: {} })),
}));

function letReport(extra = {}) {
  return {
    analysisDate: '2026-08-25T12:00:00.000Z',
    property: { title: '2 bed terrace', address: '14 Example Street', property_type: 'Flat' },
    confidence: { level: 'Low' },
    decisionJob: 'LET_INVEST',
    residentialDecisionContext: { decisionJob: 'LET_INVEST' },
    personalDecision: {
      profile: 'landlord',
      available: true,
      score: 58,
      explanation: {
        overall: 'The letting case depends on rent evidence and a missing service charge.',
      },
    },
    decisionWorkspace: {
      decisionJob: 'LET_INVEST',
      copy: {
        headline: 'You are assessing this property to LET / INVEST',
        notAdvice: 'This is not financial, investment, or legal advice.',
      },
      keyIntelligence: [],
      unresolved: [],
      findings: [],
      nextActions: [],
      missingUnderwritingInputs: { items: [] },
      ...(extra.workspace || {}),
    },
    decisionIntelligence: extra.decisionIntelligence,
    investment: extra.investment,
    financeRequest: extra.financeRequest,
    marketIntelligence: extra.marketIntelligence,
    legalTitleDomain: extra.legalTitleDomain,
  };
}

describe('LET / INVEST property case', () => {
  test('shows the property, goal, existing explanation, and at most five findings', () => {
    const findings = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `finding-${n}`,
      title: `Material finding ${n}`,
      explanation: `Explanation ${n}`,
      effect: n % 2 ? 'limiting' : 'supporting',
    }));
    render(
      <IntelligenceReport
        report={letReport({
          decisionIntelligence: { materialFindings: findings },
        })}
      />
    );
    const propertyCase = screen.getByTestId('property-case');
    expect(screen.getByTestId('case-property-address')).toHaveTextContent('14 Example Street');
    expect(screen.getByTestId('case-property-type')).toHaveTextContent('Flat');
    expect(screen.getByTestId('case-goal')).toHaveTextContent('Buy to let');
    expect(screen.getByTestId('decision-summary-text')).toHaveTextContent(
      'The letting case depends on rent evidence and a missing service charge.'
    );
    expect(propertyCase).not.toHaveTextContent('58/100');
    expect(propertyCase).not.toHaveTextContent(/good investment|don't buy|\bavoid\b|\bproceed\b/i);
    expect(screen.getByTestId('what-matters').querySelectorAll('article')).toHaveLength(5);
    expect(screen.getByTestId('what-matters')).not.toHaveTextContent('Material finding 6');
    expect(screen.getByTestId('risks-opportunities')).toHaveTextContent('Material finding 6');
  });

  test('key numbers show assessed NOI, cash flow and DSCR, and omit an unassessed metric', () => {
    render(
      <IntelligenceReport
        report={letReport({
          financeRequest: {
            purchasePrice: { scenarioPurchasePrice: 280000 },
            expectedRent: { scenarioInput: 1650 },
          },
          investment: {
            presented: {
              grossYield: { available: true, value: 7.1 },
              noi: { available: true, value: 13610 },
              netYield: { available: false, reason: 'NOI inputs are incomplete.' },
              annualCashFlow: { available: true, value: 2400 },
              dscr: { available: true, value: 1.15 },
            },
          },
          workspace: {
            missingUnderwritingInputs: {
              items: [{
                id: 'underwriting_input_serviceCharge',
                inputKey: 'serviceCharge',
                label: 'Service charge',
                cause: 'MISSING_USER_INPUT',
                detail: 'Service charge was not supplied.',
              }],
            },
          },
        })}
        onFocusUnderwritingInput={jest.fn()}
      />
    );
    const numbers = screen.getByTestId('key-numbers');
    expect(screen.getByTestId('case-metric-purchasePrice')).toHaveTextContent('£280,000');
    expect(screen.getByTestId('case-metric-rentAssumption')).toHaveTextContent('£1,650');
    expect(screen.getByTestId('case-metric-noi')).toHaveTextContent('£13,610');
    expect(screen.getByTestId('case-metric-annualCashFlow')).toHaveTextContent('£2,400');
    expect(screen.getByTestId('case-metric-dscr')).toHaveTextContent('1.15');
    expect(screen.queryByTestId('case-metric-netYield')).not.toBeInTheDocument();
    expect(numbers).not.toHaveTextContent('£0');
    expect(numbers).not.toHaveTextContent('0%');
    expect(screen.getByTestId('workspace-metric-netYield')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('what-needs-checking')).toHaveTextContent('Verify the annual service charge');
    expect(screen.getByTestId('what-needs-checking')).toHaveTextContent('materially change net income');
    expect(screen.getByTestId('underwriting-focus-serviceCharge')).toBeInTheDocument();
  });

  test('an unassessed metric stored as zero is not shown as a number', () => {
    render(
      <IntelligenceReport
        report={letReport({
          investment: {
            presented: {
              noi: { available: false, value: 0, reason: 'NOI inputs are incomplete.' },
              annualCashFlow: { available: false, value: 0 },
              dscr: { available: false, value: 0 },
              grossYield: { available: false, value: 0 },
            },
          },
        })}
      />
    );
    const numbers = screen.getByTestId('key-numbers');
    expect(numbers).not.toHaveTextContent('£0');
    expect(numbers).not.toHaveTextContent('0%');
    expect(screen.queryByTestId('case-metric-noi')).not.toBeInTheDocument();
    expect(screen.queryByTestId('case-metric-dscr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('case-metric-grossYield')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-metric-noi')).toHaveTextContent('Not assessed');
  });

  test('area context and what-if stay outside the property case', () => {
    render(
      <IntelligenceReport
        report={letReport({
          marketIntelligence: {
            marketContext: {
              postcode: 'B1',
              typicalPostcodeValue: { available: true, value: 250000, label: 'Area sold prices' },
            },
            postcodeIntelligence: { success: true, postcode: 'B1', title: 'B1 local market snapshot' },
          },
        })}
        snapshotView
      />
    );
    const propertyCase = screen.getByTestId('property-case');
    expect(propertyCase).not.toHaveTextContent('local market snapshot');
    expect(propertyCase).not.toHaveTextContent('Area sold prices');
    expect(screen.getByTestId('deep-market')).toHaveTextContent('Area market context');
    expect(propertyCase).not.toHaveTextContent('local market snapshot');
    expect(propertyCase).not.toContainElement(screen.queryByTestId('whatif-panel'));
    expect(screen.getByTestId('deep-investigation-heading')).toHaveTextContent('Deep investigation');
    expect(screen.getByRole('link', { name: /what-if scenario/i })).toHaveAttribute('href', '#pi-what-if');
    expect(propertyCase).toHaveTextContent('does not replace the saved analysis');
    expect(screen.getByTestId('historical-snapshot-banner')).toHaveTextContent(/historical analysis/i);
  });

  test('what-if stays after the case and before deep investigation', () => {
    render(
      <IntelligenceReport
        report={letReport({
          decisionIntelligence: {
            materialFindings: [{ id: 'yield', title: 'Gross yield is assessed', effect: 'supporting' }],
            sensitivityDrivers: [{
              id: 'driver_interestRate',
              inputKey: 'interestRate',
              group: 'finance',
              title: 'Interest rate',
              explanation: 'Interest rate can change cash flow.',
            }],
          },
        })}
        afterPropertyCase={<section data-testid="whatif-panel">What-if scenario</section>}
      />
    );
    const propertyCase = screen.getByTestId('property-case');
    const whatIf = screen.getByTestId('whatif-panel');
    const deep = screen.getByTestId('deep-investigation');
    expect(propertyCase).not.toContainElement(whatIf);
    expect(propertyCase.compareDocumentPosition(whatIf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(whatIf.compareDocumentPosition(deep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(propertyCase).not.toHaveTextContent('What can change this result');
    expect(propertyCase).not.toHaveTextContent('Interest rate can change cash flow');
    expect(screen.getByTestId('deep-methodology')).toHaveTextContent('What can change this result');
    expect(screen.getByTestId('deep-methodology')).toHaveTextContent('Interest rate can change cash flow');
    expect(screen.queryByTestId('decision-matters')).not.toBeInTheDocument();
  });

  test('BUY and SELL do not use the let property case', () => {
    const workspace = {
      decisionJob: 'BUY',
      copy: { headline: 'You are assessing this property to BUY' },
      keyIntelligence: [],
      unresolved: [],
      findings: [],
      nextActions: [],
      missingUnderwritingInputs: { items: [] },
    };
    const { rerender } = render(
      <IntelligenceReport
        report={{
          property: { address: 'Buyer Street' },
          residentialDecisionContext: { decisionJob: 'BUY' },
          decisionWorkspace: workspace,
          decisionIntelligence: { applicable: false },
        }}
      />
    );
    expect(screen.queryByTestId('property-case')).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('hero-decision-job')).toHaveTextContent('Buy');

    rerender(
      <IntelligenceReport
        report={{
          property: { address: 'Seller Street' },
          residentialDecisionContext: { decisionJob: 'SELL' },
          decisionWorkspace: {
            ...workspace,
            decisionJob: 'SELL',
            copy: { headline: 'You are assessing this property to SELL' },
          },
          personalDecision: { available: false, notASellScore: true },
          decisionIntelligence: { applicable: false },
        }}
      />
    );
    expect(screen.queryByTestId('property-case')).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-decision-job')).toHaveTextContent('Sell');
    expect(screen.getByTestId('sell-no-invented-methodology')).toBeInTheDocument();
  });

  test('credit enforcement and exact-property change remain on the investigation page', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../pages/ai/PropertyIntelligence.js'),
      'utf8'
    );
    expect(src).toMatch(/No AI credits remaining/);
    expect(src).toMatch(/aiCredits === 0/);
    expect(src).toMatch(/disabled=\{loading \|\| !canRunAnalysis\}/);
    expect(src).toMatch(/onChangeProperty=\{changeProperty\}/);
    expect(src).toMatch(/<PropertyHeader/);
    expect(src).toMatch(/Confirming the property/);
    expect(src).toMatch(/Assembling decision workspace/);
  });
});
