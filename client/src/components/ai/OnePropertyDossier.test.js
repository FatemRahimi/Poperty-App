import { render, screen } from '@testing-library/react';

jest.mock('../../services/aiService', () => ({
  getSubjectPropertyAttributes: jest.fn(async () => ({ success: true, attributes: {} })),
  putSubjectPropertyAttributes: jest.fn(async () => ({ success: true, attributes: {} })),
}));

import IntelligenceReport from './IntelligenceReport';

function leaseholdBuyDecision() {
  return {
    applicable: true,
    buyRecommendation: null,
    preferenceFit: { role: 'preference_fit', outcome: 'strong_fit', score: 88 },
    evidence: {
      identity: { state: 'UNKNOWN', value: null },
      askingPrice: { state: 'KNOWN', value: 250000 },
      affordability: { state: 'UNKNOWN', value: null },
      cashToComplete: { state: 'UNKNOWN', value: null },
      ongoingHousingCost: { state: 'UNKNOWN', value: null },
      deposit: { state: 'UNKNOWN', value: null },
      leaseYearsRemaining: { state: 'UNKNOWN', value: null },
      serviceCharge: { state: 'UNKNOWN', value: null },
      groundRent: { state: 'UNKNOWN', value: null },
      schools: {
        role: 'context',
        state: 'KNOWN',
        nearbyCount: 2,
        catchment: 'NOT_ASSESSED',
        admission: 'NOT_ASSESSED',
        quality: 'NOT_ASSESSED',
      },
    },
    areaMarketContext: {
      role: 'context_only',
      salesDemand: { available: true, band: 'High', notTenantDemand: true },
      rentalDemand: { available: false, band: null },
    },
    investigationPriorities: [
      {
        id: 'affordability_evidence_incomplete',
        importance: 'decision_relevant',
        title: 'Affordability evidence incomplete',
        explanation: 'Income was not assessed.',
      },
      {
        id: 'lease_years_unknown',
        importance: 'decision_relevant',
        title: 'Lease years remaining unknown',
        explanation: 'No lender rule is applied.',
      },
    ],
  };
}

describe('one-property decision dossier', () => {
  test('purchase conclusion leads, and strong fit is only the preference fit', () => {
    render(
      <IntelligenceReport
        report={{
          property: { address: '1 Example Court' },
          residentialDecisionContext: { decisionJob: 'BUY' },
          decisionJob: 'BUY',
          buyDecision: leaseholdBuyDecision(),
          personalDecision: {
            profile: 'buyer_general',
            available: true,
            score: 88,
            outcome: 'strong_fit',
            scoreLabel: 'Owner-occupier preference fit',
          },
          decisionWorkspace: {
            decisionJob: 'BUY',
            copy: { headline: 'You are assessing this property to BUY', notAdvice: 'Not advice.' },
            keyIntelligence: [
              {
                id: 'buyer_general_fit',
                label: 'Owner-occupier preference fit',
                state: 'ASSESSED',
                available: true,
                value: 88,
              },
            ],
            unresolved: [],
            findings: [],
            nextActions: [],
          },
          decisionIntelligence: { applicable: false },
        }}
      />
    );

    const conclusion = screen.getByTestId('purchase-conclusion');
    const fit = screen.getByTestId('preference-fit');
    const outcome = screen.getByTestId('preference-fit-outcome');
    expect(conclusion).toHaveTextContent('Purchase conclusion not available yet');
    expect(conclusion.compareDocumentPosition(fit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(conclusion.compareDocumentPosition(outcome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('hero-decision-job')).toHaveTextContent('Purchase conclusion not available yet');
    expect(screen.getByTestId('hero-decision-job')).not.toHaveTextContent(/\bBuy\b|Strong fit|Recommended|Affordable/);
    expect(outcome).toHaveTextContent('Strong fit');
    expect(screen.getByTestId('dossier-evidence-affordability')).toHaveTextContent('Unknown');
    expect(screen.getByTestId('dossier-evidence-leaseYearsRemaining')).toHaveTextContent('Unknown');
    expect(screen.getByTestId('dossier-evidence-leaseYearsRemaining')).not.toHaveTextContent('0 years');
    expect(screen.getByTestId('dossier-evidence-serviceCharge')).toHaveTextContent('Unknown');
    expect(screen.getByTestId('dossier-evidence-serviceCharge')).not.toHaveTextContent('£0');
    expect(screen.getByTestId('dossier-evidence-groundRent')).not.toHaveTextContent('£0');
    expect(screen.getByTestId('dossier-priority-affordability_evidence_incomplete')).toBeInTheDocument();
    expect(screen.getByTestId('dossier-context-schools')).toHaveTextContent(/not assessed/i);
    expect(screen.getByTestId('dossier-context-schools')).not.toHaveTextContent(/guaranteed|Ofsted|price uplift|outstanding school/i);
    expect(screen.getByTestId('dossier-context-area-market')).not.toHaveTextContent(/tenant demand|letting probability|sale probability/i);
    expect(screen.getByTestId('purchase-dossier')).not.toHaveTextContent(/mortgageable|unmortgageable/i);
  });

  test('listing asking rent and area estimate stay distinct from achieved rent, and withheld NOI stays withheld', () => {
    function letReport(rentBasis, presented) {
      return {
        property: { address: '2 Let Street' },
        residentialDecisionContext: { decisionJob: 'LET_INVEST' },
        decisionJob: 'LET_INVEST',
        decisionWorkspace: {
          decisionJob: 'LET_INVEST',
          copy: { headline: 'You are assessing this property to LET / INVEST', notAdvice: 'Not advice.' },
          keyIntelligence: [],
          unresolved: [],
          findings: [],
          nextActions: [],
          decisionIntelligenceApplicable: true,
        },
        decisionIntelligence: {
          applicable: true,
          investigationPriorities: [
            {
              id: 'achieved_rent_unknown',
              importance: 'decision_relevant',
              title: 'Achieved rent unknown',
              explanation: 'Asking rent and area asking estimates are not achieved rent.',
            },
          ],
        },
        investment: { presented: { rentBasis, ...presented } },
      };
    }

    const { rerender } = render(
      <IntelligenceReport
        report={letReport(
          { canonicalBasis: 'LISTING_ASKING_RENT', kind: 'LISTING', limitation: 'Yield uses asking rent, not achieved rent.' },
          { grossYield: { available: true, value: 5 }, noi: { available: false, value: null, reason: 'Operating costs are incomplete.' } }
        )}
      />
    );
    screen.getAllByTestId('yield-rent-basis-grossYield').forEach((node) => {
      expect(node).toHaveTextContent('LISTING_ASKING_RENT');
      expect(node).toHaveTextContent(/not achieved rent/i);
    });
    expect(screen.getByTestId('withheld-noi')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('withheld-noi')).not.toHaveTextContent('£0');
    expect(screen.getByTestId('let-priority-achieved_rent_unknown')).toBeInTheDocument();

    rerender(
      <IntelligenceReport
        report={letReport(
          {
            canonicalBasis: 'AREA_ASKING_RENT_ESTIMATE',
            kind: 'MARKET',
            limitation: 'Yield uses an area asking-rent estimate, not achieved rent.',
          },
          { grossYield: { available: true, value: 4 } }
        )}
      />
    );
    screen.getAllByTestId('yield-rent-basis-grossYield').forEach((node) => {
      expect(node).toHaveTextContent('AREA_ASKING_RENT_ESTIMATE');
      expect(node).toHaveTextContent(/not achieved rent/i);
      expect(node.textContent).not.toMatch(/\bACHIEVED_RENT\b/);
    });
  });
});
