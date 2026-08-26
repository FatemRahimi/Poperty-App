import React from 'react';
import { render, screen } from '@testing-library/react';
import IntelligenceReport from './IntelligenceReport';

function notAssessed(reason) {
  return { available: false, value: null, state: 'notAssessed', reason };
}

function assessed(value) {
  return { available: true, value, state: 'calculated' };
}

const BASE_REPORT = {
  analysisDate: '2026-08-25T12:00:00.000Z',
  modelVersion: 'property-intelligence-v2',
  property: {
    title: '2 bed terrace',
    address: '1 Test Street',
    price: 200000,
    monthly_rent: 1125,
  },
  snapshot: { price: 200000, rent: 1125 },
  propertyFacts: {
    facts: {
      serviceCharge: { value: 200, originalFrequency: 'monthly', available: true },
      groundRent: { value: 250, originalFrequency: 'annual', available: true },
      askingPrice: { value: 200000 },
    },
  },
  marketIntelligence: {
    sale: { success: true, centralEstimate: 190000, evidenceCount: 4 },
    rent: {
      success: true,
      currentRent: 1125,
      recommendedRent: 1100,
      marketRange: { low: 1050, high: 1150 },
    },
  },
  scores: { coverage: { componentsScored: 2, componentsTotal: 6 } },
  confidence: { level: 'Medium' },
  executiveSummary: 'Summary',
  disclaimer: 'Not advice.',
};

describe('IntelligenceReport finance rendering', () => {
  test('financeRequest completeness is displayed as data completeness', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          financeRequest: {
            operatingCostCompleteness: 'PARTIAL_EVIDENCE',
            financeCompleteness: 'NOT_ASSESSED',
            missingRequired: { operatingCosts: ['vacancyAssumption'], finance: ['deposit'] },
            applicationDefaultsAreNotUserInputs: true,
            applicationDefaults: [{ key: 'interestRate', userSupplied: false, sourceKind: 'application_default' }],
            purchasePrice: { listingAskingPrice: 200000, scenarioPurchasePrice: 185000 },
            expectedRent: { listingMonthlyRent: 1125, marketRentEvidence: 1100, scenarioInput: 1100 },
            serviceCharge: {
              propertyFact: { value: 200 },
              scenarioInput: { value: 3000 },
              calculationSelectedValue: 3000,
            },
            groundRent: {
              propertyFact: { value: 250 },
              scenarioInput: null,
              calculationSelectedValue: 250,
            },
          },
          investment: {
            presented: {
              grossYield: assessed(6.6),
              noi: notAssessed('Operating costs were not supplied — NOI is notAssessed.'),
              netYield: notAssessed('incomplete'),
              monthlyCashFlow: notAssessed('incomplete finance'),
              annualCashFlow: notAssessed('incomplete finance'),
              dscr: notAssessed('incomplete finance'),
            },
            financeRequest: {
              operatingCostCompleteness: 'PARTIAL_EVIDENCE',
              financeCompleteness: 'NOT_ASSESSED',
              missingRequired: { operatingCosts: ['vacancyAssumption'], finance: ['deposit'] },
              applicationDefaultsAreNotUserInputs: true,
              applicationDefaults: [{ key: 'interestRate', userSupplied: false, sourceKind: 'application_default' }],
              purchasePrice: { listingAskingPrice: 200000, scenarioPurchasePrice: 185000 },
              expectedRent: { listingMonthlyRent: 1125, marketRentEvidence: 1100, scenarioInput: 1100 },
              serviceCharge: {
                propertyFact: { value: 200 },
                scenarioInput: { value: 3000 },
                calculationSelectedValue: 3000,
              },
              groundRent: {
                propertyFact: { value: 250 },
                scenarioInput: null,
                calculationSelectedValue: 250,
              },
            },
          },
        }}
      />
    );

    expect(screen.getByTestId('completeness-operating')).toHaveTextContent('Partial');
    expect(screen.getByTestId('completeness-finance')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('completeness-operating')).not.toHaveTextContent('%');
    expect(screen.getByTestId('metric-noi')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-noi')).not.toHaveTextContent('£0');
    expect(screen.getByTestId('not-assessed-reasons')).toHaveTextContent('Vacancy assumption');
    expect(screen.getByTestId('application-defaults-note')).toHaveTextContent(/not treated as values you entered/i);
    expect(screen.getByTestId('charge-override-summary')).toHaveTextContent('Service charge');
    expect(screen.getByTestId('charge-override-summary')).toHaveTextContent('£200');
    expect(screen.getByTestId('charge-override-summary')).toHaveTextContent('£3,000');
    expect(screen.getAllByText(/listing asking price/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Your purchase scenario')).toBeInTheDocument();
    expect(screen.getByText('Your expected rent')).toBeInTheDocument();
    expect(screen.getAllByText(/market rent evidence/i).length).toBeGreaterThan(0);
  });

  test('complete operating and finance metrics render backend values only', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          financeRequest: {
            operatingCostCompleteness: 'COMPLETE_EVIDENCE',
            financeCompleteness: 'COMPLETE_EVIDENCE',
            missingRequired: { operatingCosts: [], finance: [] },
            applicationDefaultsAreNotUserInputs: true,
            applicationDefaults: [],
          },
          investment: {
            presented: {
              grossYield: assessed(6.6),
              noi: assessed(9800),
              netYield: assessed(4.9),
              monthlyCashFlow: assessed(210),
              annualCashFlow: assessed(2520),
              dscr: assessed(1.4),
            },
            financeRequest: {
              operatingCostCompleteness: 'COMPLETE_EVIDENCE',
              financeCompleteness: 'COMPLETE_EVIDENCE',
              missingRequired: { operatingCosts: [], finance: [] },
              applicationDefaultsAreNotUserInputs: true,
              applicationDefaults: [],
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('metric-noi')).toHaveTextContent('£9,800');
    expect(screen.getByTestId('metric-dscr')).toHaveTextContent('1.4');
    expect(screen.getByTestId('completeness-operating')).toHaveTextContent('Complete');
    expect(screen.queryByTestId('not-assessed-reasons')).not.toBeInTheDocument();
  });

  test('incomplete finance keeps cash flow and DSCR notAssessed', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          financeRequest: {
            operatingCostCompleteness: 'COMPLETE_EVIDENCE',
            financeCompleteness: 'PARTIAL_EVIDENCE',
            missingRequired: { operatingCosts: [], finance: ['interestRate'] },
            applicationDefaultsAreNotUserInputs: true,
            applicationDefaults: [{ key: 'interestRate', userSupplied: false, sourceKind: 'application_default' }],
          },
          investment: {
            presented: {
              grossYield: assessed(6.6),
              noi: assessed(9800),
              netYield: assessed(4.9),
              monthlyCashFlow: notAssessed('complete finance inputs required'),
              annualCashFlow: notAssessed('complete finance inputs required'),
              dscr: notAssessed('complete finance inputs required'),
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('metric-cashFlow')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-dscr')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('not-assessed-reasons')).toHaveTextContent('Interest rate');
  });

  test('landlord Personal Decision renders fit score and never shows a missing score as 0/100', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          personalDecision: {
            profile: 'landlord',
            available: true,
            state: 'assessed',
            score: 71,
            outcome: 'good_fit',
            decisionStrength: 'moderate',
            scoreLabel: 'Landlord fit score',
            notConfidence: true,
            model: { version: 'personal-decision-1.0.0', profile: 'landlord' },
            confidence: {
              level: 'Medium',
              note: 'Estimate confidence is a separate axis.',
            },
            explanation: {
              overall: 'This property is a good fit for the stated rental requirements (fit score 71/100).',
              strongestFactors: [],
              weakestOrUnavailable: [],
            },
            dimensions: {
              grossYield: { available: true, score: 80, weight: 0.18, state: 'assessed', evidence: [] },
              cashFlow: { available: false, score: null, weight: 0.12, state: 'no_finance_inputs', unavailableReason: 'missing finance inputs' },
              demand: { available: false, score: null, weight: 0.08, state: 'no_demand_data_source', unavailableReason: 'no property-specific demand source' },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('landlord-personal-decision')).toBeInTheDocument();
    expect(screen.getByTestId('landlord-fit-score')).toHaveTextContent('71/100');
    expect(screen.getByTestId('landlord-fit-score')).not.toHaveTextContent('Confidence');
    expect(screen.getByTestId('landlord-decision-strength')).toHaveTextContent(/from estimate confidence/i);
    expect(screen.getByTestId('landlord-dim-demand')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('landlord-dim-cashFlow')).toHaveTextContent('missing finance inputs');
    expect(screen.getByTestId('landlord-explanation')).toHaveTextContent(/good fit/i);
    expect(screen.queryByText(/excellent investment|strong buy|guaranteed/i)).not.toBeInTheDocument();
  });

  test('overall notAssessed landlord decision is shown as Not assessed, not 0', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          personalDecision: {
            profile: 'landlord',
            available: false,
            state: 'notAssessed',
            score: null,
            decisionStrength: 'none',
            scoreLabel: 'Landlord fit score',
            unavailableReason: 'Only 28% of scoring weight could be evidenced (minimum 50%).',
            dimensions: {
              demand: { available: false, score: null, state: 'no_demand_data_source', unavailableReason: 'no demand data source' },
            },
            model: { version: 'personal-decision-1.0.0', profile: 'landlord' },
          },
        }}
      />
    );
    expect(screen.getByTestId('landlord-personal-decision')).toBeInTheDocument();
    expect(screen.getByTestId('landlord-fit-score')).toHaveTextContent('Not assessed');
  });

  test('canonical property facts show FACT vs NOT ASSESSED and do not treat missing garden as no', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              ...BASE_REPORT.propertyFacts.facts,
              tenure: { available: true, value: 'Leasehold', source: 'PropertyData_registeredLeases', trust: 'observed' },
              outdoorSpace: { available: false, value: null, state: 'notAssessed', note: 'Default false is not no garden.' },
              flood: { available: false, value: null, state: 'notAssessed', note: 'No flood source is integrated.' },
              heating: { available: true, value: 'gas', source: 'InternalListing', trust: 'userSupplied' },
            },
            implications: {
              leaseRemaining: {
                available: true,
                value: 53,
                layer: 'implication',
                trust: 'calculated',
                source: 'PropertyData',
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('property-facts-grid')).toBeInTheDocument();
    expect(screen.getByTestId('fact-tenure')).toHaveTextContent('Leasehold');
    expect(screen.getByTestId('fact-tenure')).toHaveTextContent('FACT');
    expect(screen.getByTestId('fact-leaseRemaining')).toHaveTextContent('53 years');
    expect(screen.getByTestId('fact-leaseRemaining')).toHaveTextContent('CALCULATED RESULT');
    expect(screen.getByTestId('fact-outdoorSpace')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('fact-outdoorSpace-value')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('fact-flood')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-flood')).toHaveTextContent('No flood source is integrated.');
    expect(screen.getByTestId('fact-heating')).toHaveTextContent('gas');
    expect(screen.getByTestId('fact-heating')).toHaveTextContent('Listing');
  });

  test('flood FACT vs NOT ASSESSED shows source, scope, type and reason', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              flood: {
                available: true,
                value: 'Flood Zone 3',
                source: 'EnvironmentAgency_FloodMapForPlanning',
                provider: 'EnvironmentAgency',
                floodTypes: ['rivers_and_sea'],
            geographicResolution: 'Coordinates intersecting mapped flood-zone polygons.',
            retrievedAt: '2026-08-25T12:00:00.000Z',
            limitations: ['Surface water is not assessed by this product.'],
          },
        },
      },
    }}
  />
);
expect(screen.getByTestId('fact-flood')).toHaveTextContent('FACT');
expect(screen.getByTestId('fact-flood-value')).toHaveTextContent('Flood Zone 3');
expect(screen.getByTestId('fact-flood-type')).toHaveTextContent('Rivers and sea');
expect(screen.getByTestId('fact-flood-source')).toHaveTextContent('Environment Agency Flood Map for Planning');
expect(screen.getByTestId('fact-flood-scope')).toHaveTextContent('Coordinates intersecting mapped flood-zone polygons.');
expect(screen.getByTestId('fact-flood-retrieved')).toHaveTextContent('Retrieved:');
expect(screen.getByTestId('fact-flood')).not.toHaveTextContent('safe');
    expect(screen.getByTestId('fact-flood')).not.toHaveTextContent('good investment');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              flood: {
                available: false,
                value: null,
                state: 'notAssessed',
                unavailableReason: 'provider_unavailable',
                note: 'The Environment Agency flood service was unavailable. Missing flood is not low risk.',
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-flood-value')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-flood-reason')).toHaveTextContent('Reason: Provider unavailable');
    expect(screen.getByTestId('fact-flood-value')).not.toHaveTextContent('low risk');
  });

  test('planning FACT vs AREA CONTEXT vs NOT ASSESSED stays scoped', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              planning: {
                available: true,
                value: '1 application at this location',
                source: 'MHCLG_PlanningData',
                provider: 'MHCLG_PlanningData',
                scope: 'property',
                searchRadiusMetres: 400,
                summary: { subjectCount: 1, nearbyCount: 0 },
                subjectApplications: [{
                  reference: '2015/3212/P',
                  nativeStatus: 'Final Decision',
                  nativeDecisionType: 'Granted',
                  decisionDate: '2015-10-13',
                  distanceMetres: 0,
                  description: 'Change of use',
                }],
                nearbyApplications: [],
                limitations: ['Nearby applications are not applications for this property.'],
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-planning')).toHaveTextContent('FACT');
    expect(screen.getByTestId('fact-planning-value')).toHaveTextContent('1 application at this location');
    expect(screen.getByTestId('planning-subject-0')).toHaveTextContent('2015/3212/P');
    expect(screen.getByTestId('planning-subject-0')).toHaveTextContent('Final Decision');
    expect(screen.getByText('Planning & development')).toBeInTheDocument();
    expect(screen.getByTestId('fact-planning')).not.toHaveTextContent('good investment');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              planning: {
                available: true,
                value: '1 nearby application within 400m',
                source: 'MHCLG_PlanningData',
                trust: 'areaContext',
                scope: 'area',
                searchRadiusMetres: 400,
                summary: { subjectCount: 0, nearbyCount: 1 },
                subjectApplications: [],
                nearbyApplications: [{
                  reference: '2015/7191/P',
                  nativeStatus: 'Final Decision',
                  distanceMetres: 260,
                }],
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-planning')).toHaveTextContent('AREA CONTEXT');
    expect(screen.getByTestId('planning-nearby-0')).toHaveTextContent('2015/7191/P');
    expect(screen.getByTestId('planning-nearby-0')).toHaveTextContent('260m');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              planning: {
                available: false,
                value: null,
                state: 'notAssessed',
                unavailableReason: 'provider_unavailable',
                note: 'The Planning Data service was unavailable. Missing planning is not “no planning activity”.',
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-planning-value')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-planning-reason')).toHaveTextContent('Reason: Provider unavailable');
    expect(screen.getByTestId('planning-section-missing')).toHaveTextContent('NOT ASSESSED');
  });

  test('report remains usable when Personal Decision is absent', () => {
    render(<IntelligenceReport report={BASE_REPORT} />);
    expect(screen.queryByTestId('landlord-personal-decision')).not.toBeInTheDocument();
    expect(screen.getByText('Executive summary')).toBeInTheDocument();
  });
});
