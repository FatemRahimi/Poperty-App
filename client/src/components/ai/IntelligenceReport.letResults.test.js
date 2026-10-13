import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

jest.mock('../../services/aiService', () => ({
  getSubjectPropertyAttributes: jest.fn(async () => ({ success: true, attributes: {} })),
  putSubjectPropertyAttributes: jest.fn(async () => ({ success: true, attributes: {} })),
}));

import IntelligenceReport from './IntelligenceReport';

function letReport({ workspace = {}, ...report } = {}) {
  return {
    analysisDate: '2026-08-25T12:00:00.000Z',
    property: {
      title: '2 bed terrace',
      address: '1 Test Street',
      price: 200000,
      monthly_rent: 1125,
      source: 'marketplace',
    },
    snapshot: { price: 200000, rent: 1125 },
    scores: { coverage: { componentsScored: 4, componentsTotal: 6 } },
    confidence: { level: 'Low' },
    decisionJob: 'LET_INVEST',
    residentialDecisionContext: { decisionJob: 'LET_INVEST', provenance: { source: 'USER_SELECTED' } },
    personalDecision: {
      profile: 'landlord',
      available: true,
      score: 58,
      scoreLabel: 'Landlord fit score',
      explanation: {
        overall: 'Fit is mixed because cash flow is negative while gross yield is assessed.',
        strongestFactors: [{ text: 'Gross yield is assessed.' }],
        weakestOrUnavailable: [{ text: 'Cash flow is negative.' }],
      },
      dimensions: {},
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
      contextEvidence: [],
      missingUnderwritingInputs: { items: [] },
      nextActions: [],
      decisionIntelligenceApplicable: true,
      whatIfApplicable: true,
      ...workspace,
    },
    ...report,
  };
}

describe('LET / INVEST decision-first results IA (Step 5)', () => {
  test('LET result opens a property case instead of a landlord-fit hero', () => {
    render(<IntelligenceReport report={letReport()} />);
    const propertyCase = screen.getByTestId('property-case');
    expect(propertyCase).toHaveTextContent('1 Test Street');
    expect(screen.getByTestId('case-goal')).toHaveTextContent('Buy to let');
    expect(screen.getByTestId('decision-summary-text')).toHaveTextContent(
      'Fit is mixed because cash flow is negative while gross yield is assessed.'
    );
    expect(propertyCase).not.toHaveTextContent('58/100');
    expect(propertyCase).not.toHaveTextContent('Evidence strength');
    expect(propertyCase).not.toHaveTextContent(/good investment|don't buy|bad investment|\bavoid\b|\bproceed\b/i);
    expect(screen.queryByTestId('decision-matters')).not.toBeInTheDocument();
  });

  test('landlord fit stays visible and is not presented as confidence or full coverage', () => {
    render(<IntelligenceReport report={letReport()} />);
    expect(screen.getByTestId('hero-landlord-fit')).toHaveTextContent('Landlord fit');
    expect(screen.getByTestId('hero-landlord-fit')).toHaveTextContent('58/100');
    expect(screen.getByTestId('hero-evidence-strength')).toHaveTextContent('Evidence strength');
    expect(screen.getByTestId('hero-evidence-strength')).toHaveTextContent('Low');
    expect(screen.getByTestId('hero-evidence-strength')).toHaveTextContent('Not the fit score');
    expect(screen.getByTestId('hero-fit-coverage')).toHaveTextContent('4 of 6 dimensions assessed');
    expect(screen.getByTestId('hero-fit-coverage')).toHaveTextContent('not all dimensions were assessed');
    expect(screen.queryByText(/^High$/)).not.toBeInTheDocument();
  });

  test('key economics prioritise LET metrics and show net yield when the report already has it', () => {
    render(
      <IntelligenceReport
        report={letReport({
          workspace: {
            keyIntelligence: [
              { id: 'valuation_range', label: 'Residential valuation range', available: true, value: 190000, state: 'ASSESSED' },
              { id: 'price_position', label: 'Asking-price position', available: false, state: 'NOT_ASSESSED' },
              { id: 'grossYield', label: 'Gross yield', available: true, value: 4.8, state: 'ASSESSED' },
            ],
          },
          investment: {
            presented: {
              grossYield: { available: true, value: 4.8 },
              noi: { available: true, value: 13610 },
              netYield: { available: true, value: 4.5 },
              annualCashFlow: { available: true, value: -2398 },
              dscr: { available: true, value: 0.85 },
            },
          },
          financeRequest: {
            purchasePrice: { scenarioPurchasePrice: 185000, listingAskingPrice: 200000 },
            expectedRent: { scenarioInput: 1100, listingMonthlyRent: 1125, marketRentEvidence: 1050 },
          },
        })}
      />
    );
    const economics = screen.getByTestId('key-intelligence');
    const ids = [...economics.querySelectorAll('[data-testid^="workspace-metric-"]')].map(
      (node) => node.getAttribute('data-testid')
    );
    expect(ids).toEqual([
      'workspace-metric-grossYield',
      'workspace-metric-noi',
      'workspace-metric-netYield',
      'workspace-metric-annualCashFlow',
      'workspace-metric-dscr',
    ]);
    expect(economics).toHaveTextContent('Net yield');
    expect(economics).toHaveTextContent('4.5%');
    expect(economics).not.toHaveTextContent('Residential valuation range');
    expect(economics).not.toHaveTextContent('Asking-price position');
    expect(screen.getByTestId('workspace-metric-valuation_range')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-context-evidence')).toContainElement(
      screen.getByTestId('workspace-metric-valuation_range')
    );
  });

  test('NOT_ASSESSED metrics stay Not assessed and gross yield is labelled orientation when deeper metrics are missing', () => {
    render(
      <IntelligenceReport
        report={letReport({
          workspace: {
            keyIntelligence: [
              { id: 'grossYield', label: 'Gross yield', available: true, value: 5, state: 'ASSESSED' },
              {
                id: 'noi',
                label: 'NOI',
                available: false,
                state: 'NOT_ASSESSED',
                isUserInput: true,
                howToResolve: 'Requires complete operating-cost inputs.',
                resolutionInputKeys: ['vacancyAssumption'],
              },
            ],
            missingUnderwritingInputs: {
              items: [{
                id: 'underwriting_input_vacancyAssumption',
                inputKey: 'vacancyAssumption',
                label: 'Vacancy assumption',
                cause: 'MISSING_USER_INPUT',
                detail: 'Vacancy was not supplied.',
              }],
            },
          },
          investment: {
            presented: {
              grossYield: { available: true, value: 5 },
              noi: { available: false, reason: 'Operating-cost evidence is incomplete.' },
              netYield: { available: false, reason: 'NOI not assessed.' },
              dscr: { available: false, reason: 'Finance evidence is incomplete.' },
            },
          },
        })}
      />
    );
    expect(screen.getByTestId('workspace-metric-noi')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('workspace-metric-noi')).not.toHaveTextContent('£0');
    expect(screen.getByTestId('workspace-metric-netYield')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('gross-yield-orientation-note')).toHaveTextContent(/early orientation/i);
    expect(screen.getByTestId('let-limitations')).toBeInTheDocument();
    expect(screen.getByTestId('underwriting-input-vacancyAssumption')).toHaveTextContent('Vacancy assumption');
  });

  test('scenario purchase price stays distinct from listing asking, and listing labels require provenance', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={letReport({
          financeRequest: {
            purchasePrice: { scenarioPurchasePrice: 185000, listingAskingPrice: 200000 },
            expectedRent: { scenarioInput: 1100, listingMonthlyRent: 1125, marketRentEvidence: 1050 },
          },
        })}
        listingSubject
      />
    );
    expect(screen.getByTestId('let-basis-scenario_purchase')).toHaveTextContent('Your purchase price');
    expect(screen.getByTestId('let-basis-scenario_purchase')).toHaveTextContent('£185,000');
    expect(screen.getByTestId('let-basis-listing_asking')).toHaveTextContent('Listing asking price');
    expect(screen.getByTestId('let-basis-listing_asking')).toHaveTextContent('£200,000');

    rerender(
      <IntelligenceReport
        listingSubject={false}
        report={letReport({
          property: { title: 'Non-listing house', address: 'Byron Road', price: 110000, source: 'external_lookup' },
          accessContext: { relationship: 'external_lookup' },
          financeRequest: {
            purchasePrice: { scenarioPurchasePrice: 185000, listingAskingPrice: 110000 },
            expectedRent: { scenarioInput: 1100, marketRentEvidence: 900 },
          },
        })}
      />
    );
    expect(screen.getByTestId('let-basis-scenario_purchase')).toHaveTextContent('£185,000');
    expect(screen.queryByTestId('let-basis-listing_asking')).not.toBeInTheDocument();
    expect(screen.queryByText(/listing asking price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/listing rent — not on file/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('let-basis-market_rent')).toHaveTextContent('Area asking-rent context');
    expect(screen.getByTestId('let-basis-market_rent')).toHaveTextContent('AREA CONTEXT');
  });

  test('FinanceTransparency labels MARKET as area asking-rent context, not Market rent', () => {
    render(
      <IntelligenceReport
        report={letReport({
          financeRequest: {
            expectedRent: { marketRentEvidence: 1050, scenarioInput: 1100 },
          },
          investment: {
            presented: {
              rentBasis: { kind: 'MARKET', label: 'MARKET_RENT' },
              noi: { available: false },
            },
          },
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /supporting evidence — financial and market/i }));
    const transparency = screen.getByTestId('finance-transparency');
    expect(transparency).toHaveTextContent(/area asking-rent context/i);
    expect(transparency).not.toHaveTextContent(/^Market rent /);
    expect(transparency.textContent).not.toMatch(/Market rent £/);
  });

  test('risks and why appear before supporting evidence, and DI findings are not rendered twice', () => {
    const findingTitle = 'Gross yield is an assessed landlord-fit driver';
    const { container } = render(
      <IntelligenceReport
        report={letReport({
          workspace: {
            findings: [{ id: 'finding_gross_yield', title: findingTitle, effect: 'supporting' }],
            missingUnderwritingInputs: {
              items: [{
                id: 'underwriting_input_vacancyAssumption',
                inputKey: 'vacancyAssumption',
                label: 'Vacancy assumption',
                cause: 'MISSING_USER_INPUT',
              }],
            },
          },
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            materialFindings: [{ id: 'finding_gross_yield', title: findingTitle, effect: 'supporting' }],
            investigationPriorities: [{ id: 'vacancy_assumption_missing', title: 'Vacancy assumption not supplied' }],
            sensitivityDrivers: [{
              id: 'driver_purchasePrice',
              inputKey: 'purchasePrice',
              title: 'Purchase price',
              explanation: 'Purchase price can change gross yield.',
              scope: 'scenario',
            }],
          },
        })}
      />
    );
    const checking = screen.getByTestId('what-needs-checking');
    const actions = screen.getByTestId('next-actions');
    const evidenceBtn = screen.getByRole('button', { name: /supporting evidence — financial and market/i });
    expect(screen.getByTestId('what-matters').compareDocumentPosition(checking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checking.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.compareDocumentPosition(evidenceBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('what-matters')).toHaveTextContent(findingTitle);
    expect(screen.queryByTestId('decision-matters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-verify')).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-summary')).toHaveTextContent('Fit is mixed because cash flow is negative');
    expect(container.textContent).not.toMatch(/Why it matters[\s\S]*What currently matters/);
  });

  test('historical snapshot banner remains visible for saved analyses', () => {
    render(
      <IntelligenceReport report={letReport()} snapshotView />
    );
    expect(screen.getByTestId('historical-snapshot-banner')).toHaveTextContent(/saved snapshot/i);
    expect(screen.getByTestId('historical-snapshot-banner')).toHaveTextContent(/historical analysis/i);
  });

  test('mobile results CSS has no intentional fixed-width overflow source', () => {
    const css = fs.readFileSync(path.join(__dirname, 'IntelligenceReport.css'), 'utf8');
    expect(css).toMatch(/minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.pi-report-flagship[\s\S]*min-width:\s*0/);
    expect(css).not.toMatch(/\.pi-report-hero-fit[\s\S]{0,80}min-width:\s*110px/);
    expect(css).toMatch(/minmax\(min\(220px,\s*100%\),\s*1fr\)/);
  });

  test('existing legalTitleDomain limitation appears in Step 5 Limitations, not as a legal score', () => {
    render(
      <IntelligenceReport
        report={letReport({
          legalTitleDomain: {
            status: 'PARTIAL',
            assessment: {
              state: 'INSUFFICIENT_EVIDENCE',
              documentsPresent: false,
              titleRegisterAvailable: false,
              titlePlanAvailable: false,
              liveLegalAssessmentAvailable: false,
            },
            findings: [
              { id: 'title_register_not_available', text: 'Title register is not available.' },
              { id: 'title_plan_not_available', text: 'Title plan is not available.' },
              { id: 'legal_assessment_not_available', text: 'Legal/title evidence cannot be assessed as title quality, restriction, or ownership.' },
            ],
            limitations: [
              'TITLE REGISTER = NOT AVAILABLE.',
              'A property is not a title. One property may involve multiple titles.',
              'This is not legal advice.',
            ],
            provenance: { source: 'legal-title-foundation' },
          },
        })}
      />
    );
    const checking = screen.getByTestId('what-needs-checking');
    expect(checking).toHaveTextContent('Legal / title evidence is not assessed');
    expect(checking).toHaveTextContent('title register and title plan not supplied');
    expect(checking).toHaveTextContent('limitation, not a clean-title conclusion');
    expect(checking).not.toHaveTextContent('A property is not a title');
    expect(checking).not.toHaveTextContent('legal-title-foundation');
    expect(screen.queryByText(/legal score|clean title|solicitor/i)).not.toBeInTheDocument();
    const legalFold = screen.getByRole('button', { name: /Legal \/ title evidence/i });
    expect(legalFold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('property-case').compareDocumentPosition(legalFold)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('deep-documents')).toContainElement(legalFold);
  });
});
