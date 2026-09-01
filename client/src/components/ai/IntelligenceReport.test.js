import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import IntelligenceReport from './IntelligenceReport';

function openFold(title) {
  const btn = screen.getAllByRole('button').find((el) => (el.textContent || '').includes(title));
  if (!btn) throw new Error(`Missing fold ${title}`);
  if (btn.getAttribute('aria-expanded') === 'false') fireEvent.click(btn);
  return btn;
}

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
    expect(screen.getByTestId('metric-noi')).toHaveTextContent('£9,800');
    expect(screen.getByTestId('metric-dscr')).not.toHaveTextContent('0');
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
    openFold('Planning & development');
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
    openFold('Planning & development');
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
    openFold('Planning & development');
    expect(screen.getByTestId('planning-section-missing')).toHaveTextContent('NOT ASSESSED');
  });

  test('planning domain envelope is shown without a planning score', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          planningDomain: {
            domain: 'PLANNING',
            version: 'planning-domain-1.0.0',
            status: 'AVAILABLE',
            assessment: { state: 'ASSESSED' },
            evidenceAsOf: '2026-08-01T10:00:00.000Z',
            provenance: { source: 'MHCLG_PlanningData' },
            findings: [{ id: 'subject_application_evidence', text: 'Subject planning-application evidence exists in the source response.' }],
          },
          propertyFacts: {
            facts: {
              planning: {
                available: true,
                value: '1 application at this location',
                source: 'MHCLG_PlanningData',
                searchRadiusMetres: 400,
                summary: { subjectCount: 1, nearbyCount: 0 },
                subjectApplications: [{ reference: '24/001', nativeStatus: 'decided' }],
                nearbyApplications: [],
                limitations: ['This is not planning or legal advice.'],
              },
            },
          },
        }}
      />
    );
    openFold('Planning & development');
    expect(screen.getByTestId('planning-domain-state')).toHaveTextContent('Assessed');
    expect(screen.getByTestId('planning-domain-findings')).toHaveTextContent('Subject planning-application evidence exists');
    expect(screen.queryByText(/planning score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/likely approval/i)).not.toBeInTheDocument();
  });

  test('environment domain envelope is shown without a risk score or insurance claim', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          environmentDomain: {
            domain: 'ENVIRONMENT',
            version: 'environment-domain-1.0.0',
            status: 'AVAILABLE',
            assessment: { state: 'ASSESSED', sourcedZone: 'Flood Zone 3' },
            evidenceAsOf: '2026-08-01T10:00:00.000Z',
            provenance: { source: 'EnvironmentAgency_FloodMapForPlanning' },
            findings: [{
              id: 'subject_intersects_sourced_flood_zone',
              text: 'Subject coordinates intersect sourced Flood Zone 3 geometry.',
            }],
            limitations: [
              'This is Flood Map for Planning (rivers and sea) only.',
              'No insurance availability or premium is assessed.',
            ],
          },
          propertyFacts: {
            facts: {
              flood: {
                available: true,
                value: 'Flood Zone 3',
                source: 'EnvironmentAgency_FloodMapForPlanning',
                floodTypes: ['rivers_and_sea'],
                geographicResolution: 'Coordinates intersecting mapped flood-zone polygons.',
                retrievedAt: '2026-08-01T10:00:00.000Z',
              },
            },
          },
        }}
      />
    );
    openFold('Environmental evidence');
    expect(screen.getByTestId('environment-domain-state')).toHaveTextContent('Assessed');
    expect(screen.getByTestId('environment-domain-zone')).toHaveTextContent('Flood Zone 3');
    expect(screen.getByTestId('environment-domain-findings')).toHaveTextContent('Subject coordinates intersect sourced Flood Zone 3');
    expect(screen.queryByText(/environment score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/insurance premium/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/good investment/i)).not.toBeInTheDocument();
  });

  test('no-intersection environment envelope does not say no flood risk', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          environmentDomain: {
            domain: 'ENVIRONMENT',
            version: 'environment-domain-1.0.0',
            status: 'PARTIAL',
            assessment: {
              state: 'ASSESSED',
              sourcedZone: null,
              noIntersectionIsNotNoFloodRisk: true,
            },
            evidenceAsOf: '2026-08-01T10:00:00.000Z',
            provenance: { source: 'EnvironmentAgency_FloodMapForPlanning' },
            findings: [{
              id: 'no_intersection_in_configured_dataset',
              text: 'No Zone 2 or Zone 3 intersection was identified in the configured dataset. That is not “no flood risk”.',
            }],
            limitations: ['Absence of Zone 2 or 3 is not “no flood risk”.'],
          },
        }}
      />
    );
    openFold('Environmental evidence');
    expect(screen.getByTestId('environment-domain-zone')).toHaveTextContent('not “no flood risk”');
    expect(screen.getByTestId('environment-domain-findings')).toHaveTextContent('That is not “no flood risk”');
    expect(screen.queryByText(/^No flood risk\.?$/i)).not.toBeInTheDocument();
  });

  test('schools nearby is AREA CONTEXT and catchment stays NOT ASSESSED', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              schools: {
                available: true,
                value: '1 nearby establishment within 800m',
                source: 'MHCLG_PlanningData_EducationalEstablishment',
                trust: 'areaContext',
                scope: 'area',
                searchRadiusMetres: 800,
                summary: { nearbyCount: 1 },
                nearbySchools: [{
                  urn: '100000',
                  name: "St Alban's Church of England Primary School",
                  nativeType: 'Voluntary Aided School',
                  nativeStatus: 'Open',
                  distanceMetres: 80,
                }],
                catchment: {
                  available: false,
                  state: 'notAssessed',
                  reason: 'no_authoritative_catchment_source_integrated',
                },
                limitations: ['Nearby establishments are proximity only. They are not catchment, admissions, walking-route, or commute evidence.'],
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-schools')).toHaveTextContent('AREA CONTEXT');
    expect(screen.getByTestId('fact-schools-value')).toHaveTextContent('1 nearby establishment within 800m');
    openFold('Schools & education');
    expect(screen.getByTestId('schools-nearby-0')).toHaveTextContent("St Alban's Church of England Primary School");
    expect(screen.getByTestId('schools-nearby-0')).toHaveTextContent('Voluntary Aided School');
    expect(screen.getByTestId('schools-nearby-0')).toHaveTextContent('80m');
    expect(screen.getByText('Schools & education')).toBeInTheDocument();
    expect(screen.getByTestId('schools-catchment-value')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('schools-catchment-reason')).toHaveTextContent('No authoritative catchment source');
    expect(screen.getByTestId('fact-schools')).not.toHaveTextContent('Great schools');
    expect(screen.getByTestId('fact-schools')).not.toHaveTextContent('Family-friendly');
    expect(screen.getByTestId('fact-schools')).not.toHaveTextContent('Likely admission');
    expect(screen.getByTestId('fact-schools')).not.toHaveTextContent('Adds value');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              schools: {
                available: false,
                value: null,
                state: 'notAssessed',
                unavailableReason: 'provider_unavailable',
                catchment: { reason: 'no_authoritative_catchment_source_integrated' },
                note: 'The educational-establishment service was unavailable. Missing schools is not “no schools”.',
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-schools-value')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-schools-reason')).toHaveTextContent('Reason: Provider unavailable');
    openFold('Schools & education');
    expect(screen.getByTestId('schools-section-missing')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('schools-catchment-value')).toHaveTextContent('NOT ASSESSED');
  });

  test('listed building FACT vs NOT ASSESSED preserves native grade and does not score heritage', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              listedBuilding: {
                available: true,
                value: 'Grade I',
                nativeGrade: 'I',
                source: 'MHCLG_PlanningData_ListedBuilding',
                provider: 'MHCLG_PlanningData',
                geographicResolution: 'Historic England listed-building point intersecting a same-site coordinate buffer.',
                retrievedAt: '2026-08-26T15:00:00.000Z',
                listings: [
                  { listEntryNumber: '1066099', name: 'THE ADMIRALTY AND THE ADMIRALTY SCREEN', nativeGrade: 'I' },
                ],
                summary: { subjectCount: 1 },
                limitations: ['Grade is the native Historic England wording (I, II*, II).'],
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-listedBuilding')).toHaveTextContent('FACT');
    expect(screen.getByTestId('fact-listedBuilding-value')).toHaveTextContent('Grade I');
    expect(screen.getByTestId('fact-listedBuilding-grade')).toHaveTextContent('Grade: I');
    expect(screen.getByTestId('fact-listedBuilding-source')).toHaveTextContent('Historic England NHLE via MHCLG Planning Data');
    openFold('Listed building');
    expect(screen.getByTestId('listed-building-0')).toHaveTextContent('1066099');
    expect(screen.getByTestId('listed-building-0')).toHaveTextContent('Grade I');
    expect(screen.getByTestId('fact-listedBuilding')).not.toHaveTextContent('heritage score');
    expect(screen.getByTestId('fact-listedBuilding')).not.toHaveTextContent('adds value');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              listedBuilding: {
                available: false,
                value: null,
                state: 'notAssessed',
                unavailableReason: 'no_applicable_evidence_returned',
                note: 'This source returned no current listed building at these coordinates. That is not evidence that the property is not listed.',
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-listedBuilding-value')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-listedBuilding-reason')).toHaveTextContent('Reason: No listed building returned at these coordinates');
    openFold('Listed building');
    expect(screen.getByTestId('listed-building-section-missing')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-listedBuilding-value')).not.toHaveTextContent('not listed');
  });

  test('listed building II* is preserved and is not converted to a numeric grade', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              listedBuilding: {
                available: true,
                value: 'Grade II*',
                nativeGrade: 'II*',
                source: 'MHCLG_PlanningData_ListedBuilding',
                listings: [
                  { listEntryNumber: '1066081', name: 'ADMIRALTY HOUSE', nativeGrade: 'II*' },
                ],
                summary: { subjectCount: 1 },
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-listedBuilding-value')).toHaveTextContent('Grade II*');
    openFold('Listed building');
    expect(screen.getByTestId('listed-building-0')).toHaveTextContent('Grade II*');
    expect(screen.getByTestId('fact-listedBuilding')).not.toHaveTextContent('Grade 2');
    expect(screen.getByTestId('fact-listedBuilding-value')).not.toHaveTextContent('2.5');
  });

  test('conservation area FACT vs NOT ASSESSED is membership not a heritage score', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              conservationArea: {
                available: true,
                value: 'Trafalgar Square',
                source: 'MHCLG_PlanningData_ConservationArea',
                provider: 'MHCLG_PlanningData',
                geographicResolution: 'Property coordinates intersecting a conservation-area polygon.',
                retrievedAt: '2026-08-26T18:00:00.000Z',
                areas: [
                  { name: 'Trafalgar Square', reference: 'CONARA/1300', entityId: 44002870, designationDate: '1993-01-01' },
                ],
                summary: { subjectCount: 1 },
                limitations: ['Coverage is incomplete and may include duplicates.'],
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-conservationArea')).toHaveTextContent('FACT');
    expect(screen.getByTestId('fact-conservationArea-value')).toHaveTextContent('Trafalgar Square');
    expect(screen.getByTestId('fact-conservationArea-source')).toHaveTextContent('Conservation areas via MHCLG Planning Data');
    openFold('Conservation area');
    expect(screen.getByTestId('conservation-area-0')).toHaveTextContent('CONARA/1300');
    expect(screen.getByTestId('fact-conservationArea')).not.toHaveTextContent('adds value');
    expect(screen.getByTestId('fact-conservationArea')).not.toHaveTextContent('permission will');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              conservationArea: {
                available: false,
                value: null,
                state: 'notAssessed',
                unavailableReason: 'no_applicable_evidence_returned',
                note: 'This source returned no current conservation area intersecting these coordinates. That is not evidence that the property is outside a conservation area.',
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-conservationArea-value')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-conservationArea-reason')).toHaveTextContent('Reason: No conservation area returned at these coordinates');
    openFold('Conservation area');
    expect(screen.getByTestId('conservation-area-section-missing')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-conservationArea-value')).not.toHaveTextContent('not in a conservation area');
  });

  test('article 4 FACT is membership only and restrictions stay NOT ASSESSED', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              article4: {
                available: true,
                value: 'Article 4 Basement Development Permitted Rights Removed',
                source: 'MHCLG_PlanningData_Article4DirectionArea',
                provider: 'MHCLG_PlanningData',
                geographicResolution: 'Property coordinates intersecting a published Article 4 Direction Area polygon.',
                retrievedAt: '2026-08-26T20:00:00.000Z',
                geographicMembershipOnly: true,
                restrictionsAssessed: false,
                restrictions: {
                  available: false,
                  state: 'notAssessed',
                  reason: 'authoritative_restriction_schedule_not_integrated',
                },
                areas: [
                  {
                    name: 'Article 4 Basement Development Permitted Rights Removed',
                    reference: 'A4/BASEMENT',
                    entityId: 61000001,
                    startDate: '2016-07-31',
                  },
                ],
                summary: { subjectCount: 1 },
                limitations: ['Coverage is incomplete and does not cover all of England.'],
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-article4')).toHaveTextContent('FACT');
    expect(screen.getByTestId('fact-article4-value')).toHaveTextContent('Article 4 Basement Development Permitted Rights Removed');
    expect(screen.getByTestId('fact-article4-source')).toHaveTextContent('Article 4 direction areas via MHCLG Planning Data');
    openFold('Article 4 Direction Area');
    expect(screen.getByTestId('article4-0')).toHaveTextContent('A4/BASEMENT');
    expect(screen.getByTestId('fact-article4-restrictions')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('article4-restrictions-section')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-article4-membership')).toHaveTextContent(
      'The property coordinates intersect a published Article 4 Direction Area. The specific permitted-development rights affected have not been assessed.'
    );
    expect(screen.getByTestId('fact-article4')).not.toHaveTextContent('development prohibited');
    expect(screen.getByTestId('fact-article4')).not.toHaveTextContent('planning permission required');
    expect(screen.getByTestId('fact-article4')).not.toHaveTextContent('Article 4 risk');
    expect(screen.getByTestId('fact-article4')).not.toHaveTextContent('reduces value');
    expect(screen.getByTestId('fact-article4')).not.toHaveTextContent('bad for investment');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          propertyFacts: {
            facts: {
              article4: {
                available: false,
                value: null,
                state: 'notAssessed',
                unavailableReason: 'no_applicable_evidence_returned',
                note: 'This source returned no current Article 4 direction area intersecting these coordinates. That is not evidence that the property is outside an Article 4 area.',
              },
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('fact-article4-value')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-article4-reason')).toHaveTextContent('Reason: No Article 4 direction area returned at these coordinates');
    openFold('Article 4 Direction Area');
    expect(screen.getByTestId('article4-section-missing')).toHaveTextContent('NOT ASSESSED');
    expect(screen.getByTestId('fact-article4-value')).not.toHaveTextContent('not in an Article 4');
    expect(screen.getByTestId('fact-article4-value')).not.toHaveTextContent('No Article 4');
    expect(screen.queryByTestId('fact-article4-restrictions')).not.toBeInTheDocument();
  });

  test('decision intelligence shows material findings then investigation priorities', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            version: 'decision-intelligence-1.0.0',
            scoringActivated: false,
            materialFindings: [
              {
                id: 'finding_gross_yield',
                title: 'Gross yield is an assessed landlord-fit driver',
                explanation: 'Gross yield is currently one of the assessed drivers of the landlord fit.',
                importance: 'decision_relevant',
                effect: 'supporting',
                scope: 'scenario',
              },
            ],
            investigationPriorities: [
              {
                id: 'vacancy_assumption_missing',
                title: 'Vacancy assumption not supplied',
                explanation: 'Vacancy was not supplied, so NOI remains not assessed. Missing vacancy is not 0%.',
                importance: 'decision_relevant',
                state: 'notAssessed',
                affects: ['investment.presented.noi'],
              },
            ],
          },
        }}
      />
    );
    expect(screen.getByText('What currently matters')).toBeInTheDocument();
    expect(screen.getByText('What to verify next')).toBeInTheDocument();
    expect(screen.getByTestId('decision-finding-finding_gross_yield-title')).toHaveTextContent(
      'Gross yield is an assessed landlord-fit driver'
    );
    expect(screen.getByTestId('decision-finding-finding_gross_yield-effect')).toHaveTextContent(
      'Currently supporting this landlord scenario'
    );
    expect(screen.getByTestId('decision-priority-vacancy_assumption_missing-title')).toHaveTextContent('Vacancy assumption not supplied');
    expect(screen.getByTestId('decision-priority-vacancy_assumption_missing')).not.toHaveTextContent('low demand');
    expect(screen.getByTestId('decision-priority-vacancy_assumption_missing')).not.toHaveTextContent('buy this');
    expect(screen.getByTestId('decision-finding-finding_gross_yield')).not.toHaveTextContent('AI recommends');
    expect(screen.getByTestId('decision-finding-finding_gross_yield')).not.toHaveTextContent('Strong buy');
    expect(screen.getByTestId('decision-finding-finding_gross_yield')).not.toHaveTextContent('Top opportunity');

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            investigationPriorities: [],
            unresolvedDependencies: [],
            materialFindings: [],
          },
        }}
      />
    );
    expect(screen.getByTestId('decision-intelligence-empty')).toHaveTextContent('No decision-relevant unknowns');
    expect(screen.getByTestId('decision-intelligence-findings-empty')).toHaveTextContent('No assessed evidence currently produces a material finding');
  });

  test('decision intelligence maps scenario drivers without ranking them', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            investigationPriorities: [],
            materialFindings: [],
            sensitivityDrivers: [
              {
                id: 'driver_purchasePrice',
                inputKey: 'purchasePrice',
                group: 'price_rent',
                title: 'Purchase price',
                explanation: 'Purchase price can change gross yield. It does not change the valuation estimate.',
                state: 'active',
                scope: 'scenario',
                affects: ['investment.presented.grossYield'],
                directionality: {
                  whenInputIncreases: [
                    { output: 'investment.presented.grossYield', whenInputIncreases: 'decreases' },
                  ],
                },
              },
              {
                id: 'driver_interestRate',
                inputKey: 'interestRate',
                group: 'finance',
                title: 'Interest rate',
                explanation: 'Interest rate can change cash flow and DSCR.',
                state: 'conditional',
                scope: 'scenario',
                affects: ['investment.presented.annualCashFlow', 'investment.presented.dscr'],
              },
            ],
          },
        }}
      />
    );
    expect(screen.getByText('What can change this result')).toBeInTheDocument();
    expect(screen.getByTestId('decision-driver-group-price_rent')).toHaveTextContent('Price and rent');
    expect(screen.getByTestId('decision-driver-purchasePrice-title')).toHaveTextContent('Purchase price');
    expect(screen.getByTestId('decision-driver-purchasePrice')).toHaveTextContent('gross yield');
    expect(screen.getByTestId('decision-driver-purchasePrice')).not.toHaveTextContent('investment.presented.grossYield');
    expect(screen.getByTestId('decision-driver-purchasePrice')).not.toHaveTextContent('Top sensitivities');
    expect(screen.getByTestId('decision-driver-purchasePrice')).not.toHaveTextContent('best assumption');
    expect(screen.getByTestId('decision-driver-interestRate')).toHaveTextContent('Not fully assessed');
  });

  test('decision intelligence overview paraphrases structured truth and old reports remain usable', () => {
    const { rerender } = render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            investigationPriorities: [],
            materialFindings: [],
            sensitivityDrivers: [],
            explanation: {
              version: 'decision-intelligence-explanation-1.0.0',
              source: 'template',
              overview: 'Property-specific tenant demand is not assessed. Missing finance is notAssessed, not a risk rating.',
              currentDriversSummary: 'Gross yield is currently supporting this landlord scenario.',
              verificationSummary: 'To strengthen this analysis, the next useful information would be: Vacancy assumption not supplied.',
              sensitivitySummary: 'Purchase price can affect gross yield. This is not a ranking.',
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('decision-intelligence-overview-text')).toHaveTextContent('Property-specific tenant demand is not assessed');
    expect(screen.getByTestId('decision-intelligence-overview')).not.toHaveTextContent('good investment');
    expect(screen.getByTestId('decision-intelligence-overview')).not.toHaveTextContent('you should buy');
    expect(screen.getByTestId('decision-intelligence-overview-source')).toHaveTextContent('Structured synthesis');
    expect(screen.getByText('What currently matters')).toBeInTheDocument();

    rerender(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            investigationPriorities: [],
            materialFindings: [],
            sensitivityDrivers: [],
          },
        }}
      />
    );
    expect(screen.queryByTestId('decision-intelligence-overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-intelligence-findings-empty')).toBeInTheDocument();
  });

  test('report remains usable when Personal Decision is absent', () => {
    render(<IntelligenceReport report={BASE_REPORT} />);
    expect(screen.queryByTestId('landlord-personal-decision')).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-overview')).toBeInTheDocument();
    expect(screen.getByText('Property overview')).toBeInTheDocument();
    expect(screen.getByTestId('hero-evidence-strength')).toHaveTextContent('Not the fit score');
    expect(screen.getByTestId('area-property-demand')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('area-rental-demand')).toHaveTextContent('AREA CONTEXT');
  });

  test('unified hierarchy starts with current analysis then findings before property facts', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          personalDecision: {
            profile: 'landlord',
            available: true,
            score: 71,
            outcome: 'good_fit',
            decisionStrength: 'moderate',
            dimensions: {
              demand: { available: false, score: null, state: 'no_demand_data_source', unavailableReason: 'no property-specific demand source' },
            },
          },
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            materialFindings: [
              { id: 'finding_gross_yield', title: 'Gross yield is an assessed landlord-fit driver', effect: 'supporting' },
            ],
            investigationPriorities: [
              { id: 'vacancy_assumption_missing', title: 'Vacancy assumption not supplied', importance: 'decision_relevant', state: 'notAssessed' },
            ],
            unresolvedDependencies: [
              { id: 'vacancy_assumption_missing', title: 'Vacancy assumption not supplied', importance: 'decision_relevant' },
              { id: 'amenity_garden', title: 'Garden is not assessed', importance: 'informational' },
            ],
            sensitivityDrivers: [
              { id: 'driver_purchasePrice', inputKey: 'purchasePrice', group: 'price_rent', title: 'Purchase price', state: 'active', scope: 'scenario' },
            ],
            explanation: {
              source: 'template',
              overview: 'Property-specific tenant demand is not assessed.',
            },
          },
          marketIntelligence: {
            ...BASE_REPORT.marketIntelligence,
            areaRentalDemand: { available: true, band: "Landlord's market", rentalDemand: true },
          },
          investment: {
            presented: {
              grossYield: assessed(6.6),
              noi: notAssessed('Operating costs were not supplied — NOI is notAssessed.'),
              dscr: notAssessed('complete finance inputs required'),
            },
          },
        }}
      />
    );
    const overview = screen.getByTestId('decision-overview');
    const synthesis = screen.getByTestId('decision-intelligence-overview');
    const matters = screen.getByTestId('decision-matters');
    const verify = screen.getByTestId('decision-verify');
    const facts = screen.getByTestId('property-facts-grid');
    const fit = screen.getByTestId('landlord-personal-decision');
    expect(overview.compareDocumentPosition(synthesis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fit.compareDocumentPosition(synthesis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(synthesis.compareDocumentPosition(matters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(matters.compareDocumentPosition(verify) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(verify.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('decision-intelligence-overview')).not.toHaveTextContent('Gross yield is an assessed landlord-fit driver');
    expect(screen.getByTestId('landlord-fit-score')).toHaveTextContent('71/100');
    expect(screen.getByTestId('hero-evidence-strength')).toHaveTextContent('Not the fit score');
    expect(screen.getByTestId('hero-landlord-fit')).not.toHaveTextContent('Strong buy');
    expect(screen.getByTestId('decision-intelligence-priorities')).toHaveTextContent('Vacancy assumption not supplied');
    expect(screen.getByTestId('decision-intelligence-priorities')).not.toHaveTextContent('Garden is not assessed');
    expect(screen.getByTestId('decision-analysis-gaps')).toHaveTextContent('Garden is not assessed');
    expect(screen.getByTestId('decision-analysis-gaps')).toHaveTextContent('not an urgent task');
    expect(screen.getByTestId('decision-sensitivity')).not.toHaveTextContent('Top sensitivities');
    expect(screen.getByTestId('decision-sensitivity')).toHaveTextContent('not a ranking');
    expect(screen.getByRole('link', { name: /Test purchase price/i })).toHaveAttribute('href', '#pi-what-if');
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('6.6%');
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Gross yield');
    expect(screen.getByTestId('metric-noi')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-noi')).not.toHaveTextContent('£0');
    expect(screen.getByTestId('area-rental-demand-value')).toHaveTextContent("Landlord's market");
    expect(screen.getByTestId('area-property-demand')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('decision-intelligence-overview-source')).toHaveTextContent('Structured synthesis');
    expect(screen.getByTestId('decision-matters')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current analysis' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What currently matters' })).toBeInTheDocument();
    expect(screen.queryByText('Recommended action')).not.toBeInTheDocument();
  });

  test('old reports without Decision Intelligence remain usable', () => {
    render(<IntelligenceReport report={BASE_REPORT} />);
    expect(screen.queryByTestId('decision-intelligence')).not.toBeInTheDocument();
    expect(screen.getByTestId('property-facts-grid')).toBeInTheDocument();
    expect(screen.getByTestId('decision-overview')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-intelligence-overview')).not.toBeInTheDocument();
  });

  test('sparse notAssessed report stays useful and does not invent zeros', () => {
    render(
      <IntelligenceReport
        report={{
          analysisDate: '2026-08-25T12:00:00.000Z',
          property: { title: 'Sparse listing', address: '2 Test Street' },
          confidence: { level: 'Low' },
          executiveSummary: 'Limited evidence.',
          disclaimer: 'Not advice.',
          personalDecision: {
            available: false,
            score: null,
            decisionStrength: 'none',
            unavailableReason: 'Coverage below the minimum.',
            dimensions: {
              demand: { available: false, score: null, unavailableReason: 'no demand data source' },
            },
          },
          decisionIntelligence: {
            materialFindings: [],
            investigationPriorities: [],
            sensitivityDrivers: [
              { id: 'driver_interestRate', inputKey: 'interestRate', group: 'finance', title: 'Interest rate', state: 'conditional' },
            ],
            explanation: { source: 'openai', overview: 'Overall landlord fit is not assessed from the current evidence coverage.' },
          },
          investment: {
            presented: {
              grossYield: notAssessed('purchase price missing'),
              noi: notAssessed('costs missing'),
              dscr: notAssessed('finance missing'),
            },
          },
        }}
      />
    );
    expect(screen.getByTestId('landlord-fit-score')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('landlord-fit-score')).not.toHaveTextContent('0/100');
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('metric-grossYield')).not.toHaveTextContent('0%');
    expect(screen.getByTestId('decision-intelligence-findings-empty')).toBeInTheDocument();
    expect(screen.getByTestId('decision-intelligence-overview-source')).toHaveTextContent('AI paraphrase');
    expect(screen.getByTestId('decision-driver-interestRate')).toHaveTextContent('Not fully assessed');
  });

  test('market-rent-based gross yield is labelled and not shown as listing rent', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          investment: {
            presented: {
              grossYield: { available: true, value: 7.5, state: 'calculated', basis: 'MARKET_RENT' },
              noi: notAssessed('costs missing'),
              netYield: notAssessed('costs missing'),
              monthlyCashFlow: notAssessed('finance missing'),
              annualCashFlow: notAssessed('finance missing'),
              dscr: notAssessed('finance missing'),
            },
            rentBasis: { kind: 'MARKET', marketSubstitutedForMissingListing: true },
            expectedRentIsNotMarketRent: false,
          },
        }}
      />
    );
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('Market-rent-based gross yield');
    expect(screen.getByTestId('metric-grossYield')).toHaveTextContent('7.5%');
    expect(screen.getByTestId('metric-grossYield')).not.toHaveTextContent('Listing rent');
  });
});

describe('legacy heuristic retirement UI', () => {
  const legacyFields = {
    opportunities: [
      {
        id: 'rent-opportunity',
        title: 'Legacy rent opportunity',
        evidence: 'Heuristic note',
        confidenceLabel: 'High',
      },
    ],
    risks: [
      {
        id: 'missing-epc',
        title: 'Legacy invented risk',
        category: 'DOCUMENT',
        probability: 0.95,
        impact: 'Medium',
        evidence: 'Invented probability',
        recommendedAction: 'Upload EPC',
      },
    ],
    recommendation: {
      action: 'Proceed with purchase',
      why: 'Heuristic recommendation',
      expectedImpact: 'Not canonical',
    },
    strengths: [{ title: 'Garden', evidence: 'Flagged' }],
    weaknesses: [{ title: 'Missing EPC', evidence: 'No rating' }],
  };

  test('new report with Decision Intelligence hides legacy heuristic sections', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          ...legacyFields,
          personalDecision: {
            available: true,
            score: 64,
            outcome: 'mixed_fit',
            decisionStrength: 'moderate',
            dimensions: { demand: { available: false, score: null } },
          },
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            materialFindings: [{ id: 'finding_rent_position', title: 'Rent is at the estimated market range', effect: 'supporting' }],
            investigationPriorities: [],
            sensitivityDrivers: [],
            explanation: { source: 'template', overview: 'Canonical overview' },
          },
        }}
      />
    );

    expect(screen.queryByTestId('earlier-model-analysis')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy rent opportunity')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy invented risk')).not.toBeInTheDocument();
    expect(screen.queryByText('Proceed with purchase')).not.toBeInTheDocument();
    expect(screen.queryByText('Garden')).not.toBeInTheDocument();
    expect(screen.queryByText(/Historical earlier-model analysis/i)).not.toBeInTheDocument();
    expect(screen.getByText('What currently matters')).toBeInTheDocument();
    expect(screen.getByText('Rent is at the estimated market range')).toBeInTheDocument();
  });

  test('historical legacy fields cannot override Decision Intelligence', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          ...legacyFields,
          decisionIntelligence: {
            engine: 'decisionIntelligence',
            materialFindings: [{ id: 'finding_gross_yield', title: 'Gross yield is evidenced', effect: 'supporting' }],
            investigationPriorities: [{ id: 'priority_epc', title: 'Verify EPC from an authoritative source' }],
            sensitivityDrivers: [],
            explanation: { source: 'template', overview: 'Canonical landlord explanation' },
          },
        }}
      />
    );
    expect(screen.getByText('Gross yield is evidenced')).toBeInTheDocument();
    expect(screen.getByText('Verify EPC from an authoritative source')).toBeInTheDocument();
    expect(screen.getByText('Canonical landlord explanation')).toBeInTheDocument();
    expect(screen.queryByTestId('earlier-model-analysis')).not.toBeInTheDocument();
    expect(screen.queryByText('Proceed with purchase')).not.toBeInTheDocument();
  });

  test('old report without Decision Intelligence shows labelled Historical earlier-model content', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          ...legacyFields,
          personalDecision: null,
        }}
      />
    );

    expect(screen.getByTestId('earlier-model-analysis')).toBeInTheDocument();
    expect(screen.getByText(/Historical earlier-model analysis/i)).toBeInTheDocument();
    const fold = screen.getAllByRole('button').find((el) => (el.textContent || '').includes('Historical earlier-model analysis'));
    if (fold && fold.getAttribute('aria-expanded') === 'false') fireEvent.click(fold);
    expect(screen.getByTestId('earlier-model-disclaimer')).toHaveTextContent(
      'Legacy heuristic content — not part of current Decision Intelligence.'
    );
    expect(screen.getByText('Legacy rent opportunity')).toBeInTheDocument();
    expect(screen.getByText('Legacy invented risk')).toBeInTheDocument();
    expect(screen.getByText('Proceed with purchase')).toBeInTheDocument();
    expect(screen.getByText('Garden')).toBeInTheDocument();
    expect(screen.getByText('Missing EPC')).toBeInTheDocument();
  });

  test('sparse pre-DI historical report remains readable', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          personalDecision: null,
          recommendation: { action: 'Review rental pricing.', why: 'Sparse saved field' },
        }}
      />
    );
    expect(screen.getByTestId('earlier-model-analysis')).toBeInTheDocument();
    const fold = screen.getAllByRole('button').find((el) => (el.textContent || '').includes('Historical earlier-model analysis'));
    if (fold && fold.getAttribute('aria-expanded') === 'false') fireEvent.click(fold);
    expect(screen.getByText('Review rental pricing.')).toBeInTheDocument();
    expect(screen.getByText('Sparse saved field')).toBeInTheDocument();
    expect(screen.queryByText('What currently matters')).not.toBeInTheDocument();
  });

  test('asset class is Not recorded on old snapshots and never defaults to Residential', () => {
    render(<IntelligenceReport report={BASE_REPORT} />);
    openFold('Property facts');
    expect(screen.getByTestId('asset-classification-value')).toHaveTextContent('Not recorded');
    expect(screen.queryByText('Residential')).not.toBeInTheDocument();
  });

  test('declared commercial class is shown and not treated as residential valuation copy', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          assetClassification: { assetClass: 'COMMERCIAL', state: 'DECLARED' },
          residentialMethodology: {
            mode: 'NOT_SUPPORTED_FOR_ASSET_CLASS',
            note: 'Residential valuation and rental methodology is not valid for COMMERCIAL.',
          },
        }}
      />
    );
    openFold('Property facts');
    expect(screen.getByTestId('asset-classification-value')).toHaveTextContent('Commercial');
    expect(screen.getByText(/not valid for COMMERCIAL/i)).toBeInTheDocument();
  });

  test('malformed or missing report renders safely', () => {
    const { rerender } = render(<IntelligenceReport report={null} />);
    expect(screen.getByTestId('intelligence-report-empty')).toHaveTextContent('could not be displayed');
    rerender(<IntelligenceReport report={{}} />);
    expect(screen.getByText(/Date not recorded/)).toBeInTheDocument();
    expect(screen.getByTestId('decision-overview')).toBeInTheDocument();
  });

  test('missing listing rent is Not on file, never £0/mo', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          property: { ...BASE_REPORT.property, monthly_rent: null },
          snapshot: { price: 200000, rent: null },
          marketIntelligence: {
            ...BASE_REPORT.marketIntelligence,
            rent: {
              ...BASE_REPORT.marketIntelligence.rent,
              currentRent: null,
            },
          },
          financeRequest: {
            expectedRent: { listingMonthlyRent: null, marketRentEvidence: 1100, scenarioInput: null },
          },
        }}
      />
    );
    expect(screen.getAllByText('Not on file').length).toBeGreaterThan(0);
    expect(screen.queryByText('£0/mo')).not.toBeInTheDocument();
  });

  test('legal title evidence shows supplied/unverified/not assessed, never clean title', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          legalTitleDomain: {
            status: 'PARTIAL',
            assessment: {
              state: 'INSUFFICIENT_EVIDENCE',
              documentsPresent: true,
              titleRegisterAvailable: true,
              titlePlanAvailable: false,
              liveLegalAssessmentAvailable: false,
            },
            documents: [{
              documentId: 'd1',
              documentType: 'TITLE_REGISTER',
              verificationState: 'UNVERIFIED',
              documentDate: '2020-01-01',
              uploadedAt: '2026-08-30T00:00:00.000Z',
            }],
            findings: [{ id: 'title_register_supplied', text: 'Title register document supplied.' }],
            limitations: ['This is not legal advice.'],
            provenance: { source: 'legal-title-foundation' },
          },
        }}
      />
    );
    openFold('Legal / title evidence');
    expect(screen.getByTestId('legal-title-domain-state')).toHaveTextContent('Evidence supplied');
    expect(screen.getByTestId('legal-title-documents')).toHaveTextContent('Unverified');
    expect(screen.getByTestId('legal-title-documents')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('legal-title-domain-findings')).toHaveTextContent('Title register document supplied.');
    expect(screen.queryByText(/title clean|legal passed|no restrictions|development allowed/i)).not.toBeInTheDocument();
  });

  test('market evidence shows coverage and gaps, never £0 for missing prices', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          assetClassification: { assetClass: 'COMMERCIAL', state: 'DECLARED' },
          marketDomain: {
            status: 'PARTIAL',
            assessment: {
              state: 'ASSESSED',
              coverage: {
                transactionObservationCount: 2,
                comparableCandidateCount: null,
                sourceCoverage: ['ApplicationDatabase', 'PropertyData'],
                missingEvidenceTypes: ['CLASS_SPECIFIC_TRANSACTIONS'],
              },
            },
            evidence: [
              {
                factType: 'declaredUseAndClassification',
                value: { assetClass: 'COMMERCIAL', declaredUse: 'office' },
              },
              { factType: 'listingAskingPrice', present: true, value: 500000 },
              { factType: 'areaSalesMarketActivity', value: { band: 'balanced' } },
            ],
            findings: [{ id: 'asking_not_transaction', text: 'A listing asking price is present. It is not treated as an achieved sale.' }],
            limitations: ['Asking price is not an achieved sale price.'],
          },
        }}
      />
    );
    openFold('Market evidence');
    expect(screen.getByTestId('market-domain-state')).toHaveTextContent('Assessed');
    expect(screen.getByTestId('market-domain-envelope')).toHaveTextContent('£500,000');
    expect(screen.getByTestId('market-domain-envelope')).toHaveTextContent('balanced');
    expect(screen.getByTestId('market-domain-envelope')).toHaveTextContent('Not assessed');
    expect(screen.getByTestId('market-domain-gaps')).toHaveTextContent('CLASS_SPECIFIC_TRANSACTIONS');
    expect(screen.queryByText('£0')).not.toBeInTheDocument();
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  test('official completed sale is distinct from asking price and area context', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          assetClassification: { assetClass: 'RESIDENTIAL', state: 'DECLARED' },
          marketDomain: {
            status: 'PARTIAL',
            assessment: {
              state: 'ASSESSED',
              coverage: {
                listingAskingPricePresent: true,
                userReportedSubjectTransactionPresent: true,
                subjectOfficialTransactionCount: 1,
                areaOfficialTransactionCount: 2,
                officialTransactionStatus: 'TRANSACTION_FOUND',
                sourceGeography: 'England and Wales',
                officialMatchMethod: 'EXACT_UPRN',
                comparableCandidateCount: 0,
                sourceCoverage: ['ApplicationDatabase', 'HMLR_PRICE_PAID_DATA'],
                missingEvidenceTypes: [],
              },
            },
            evidence: [
              { factType: 'listingAskingPrice', present: true, value: 500000 },
              { factType: 'userReportedSubjectTransaction', present: true, value: 180000 },
              {
                factType: 'officialSaleTransaction',
                present: true,
                value: {
                  priceGbp: 325000,
                  pricePresent: true,
                  transferDate: '2021-06-15',
                  matchMethod: 'EXACT_UPRN',
                  sourceTransactionId: 'tx-1',
                },
              },
              {
                factType: 'officialAreaSaleTransactions',
                value: { observationCount: 2, latestTransferDate: '2022-01-01', matchMethod: 'AREA_POSTCODE' },
              },
            ],
            findings: [],
            limitations: ['Asking price is not an achieved sale price.'],
          },
        }}
      />
    );
    openFold('Market evidence');
    expect(screen.getByTestId('official-sale-history')).toHaveTextContent('HM Land Registry');
    expect(screen.getByTestId('official-sale-history')).toHaveTextContent('£325,000');
    expect(screen.getByTestId('official-sale-history')).toHaveTextContent('15 Jun 2021');
    expect(screen.getByTestId('official-sale-history')).toHaveTextContent('UPRN / exact subject');
    expect(screen.getByTestId('official-area-sales')).toHaveTextContent('not the subject');
    expect(screen.getByTestId('market-domain-envelope')).toHaveTextContent('£500,000');
    expect(screen.getByTestId('market-domain-envelope')).toHaveTextContent('£180,000');
    expect(screen.queryByText('£0')).not.toBeInTheDocument();
  });

  test('subject identity shows unresolved without claiming verified', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          identity: {
            verificationState: 'UNRESOLVED',
            identityState: 'UNRESOLVED',
            paon: null,
            uprn: null,
          },
          marketDomain: {
            assessment: { coverage: {} },
            evidence: [],
            findings: [],
            limitations: [],
          },
        }}
      />
    );
    openFold('Market evidence');
    expect(screen.getByTestId('subject-identity-status')).toHaveTextContent('Identity unresolved');
    expect(screen.queryByText('Identity verified')).not.toBeInTheDocument();
  });

  test('subject identity shows recorded canonical address and UPRN without verified label', () => {
    render(
      <IntelligenceReport
        report={{
          ...BASE_REPORT,
          identity: {
            verificationState: 'SOURCE_ASSERTED',
            identityState: 'SOURCE_ASSERTED',
            paon: '12',
            postcode: 'B1 2UJ',
            uprn: '1000123',
            canonicalAddress: '12 High Street, B1 2UJ',
          },
          marketDomain: {
            assessment: { coverage: {} },
            evidence: [],
            findings: [],
            limitations: [],
          },
        }}
      />
    );
    openFold('Market evidence');
    expect(screen.getByTestId('subject-identity-status')).toHaveTextContent('Identity recorded');
    expect(screen.getByTestId('subject-identity-uprn')).toHaveTextContent('1000123');
    expect(screen.getByTestId('subject-identity-address')).toHaveTextContent('12 High Street, B1 2UJ');
    expect(screen.queryByText('Identity verified')).not.toBeInTheDocument();
  });
});
