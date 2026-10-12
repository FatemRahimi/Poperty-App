import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FinanceScenarioForm from './FinanceScenarioForm';
import { EMPTY_FINANCE_SCENARIO, buildFinanceAnalyseRequest } from '../../Utils/financeScenario';

function Harness({ preview, report, stale = false }) {
  const [form, setForm] = useState({ ...EMPTY_FINANCE_SCENARIO });
  return (
    <div>
      <FinanceScenarioForm
        form={form}
        onChange={setForm}
        preview={preview}
        report={report}
        stale={stale}
      />
      <pre data-testid="payload">{JSON.stringify(buildFinanceAnalyseRequest(form).payload)}</pre>
    </div>
  );
}

describe('FinanceScenarioForm', () => {
  test('finance form renders canonical fields', () => {
    render(<Harness />);
    expect(screen.getByTestId('finance-scenario-form')).toBeInTheDocument();
    expect(screen.getByLabelText(/your purchase price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your expected monthly rent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^maintenance$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vacancy assumption/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^deposit$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/interest rate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mortgage term/i)).toBeInTheDocument();
  });

  test('blank vacancy is omitted while vacancy 0 is submitted', async () => {
    render(<Harness />);
    expect(screen.getByTestId('payload')).toHaveTextContent('{}');
    await userEvent.type(screen.getByRole('textbox', { name: 'Vacancy assumption' }), '0');
    expect(screen.getByTestId('payload')).toHaveTextContent('"vacancyAssumption":0');
  });

  test('explicit management fee 0 survives', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Management fee' }), '0');
    expect(screen.getByTestId('payload')).toHaveTextContent('"managementFee":{"value":0,"frequency":"annual"}');
  });

  test('property service charge and ground rent stay visible when overridden', async () => {
    render(
      <Harness
        preview={{ price: 200000, monthly_rent: 1125, service_charges: 200, ground_rent: 250 }}
      />
    );
    expect(screen.getByText(/£200\/month/)).toBeInTheDocument();
    expect(screen.getByText(/£250\/year/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Service charge override' }), '3000');
    expect(screen.getByText(/£200\/month/)).toBeInTheDocument();
    expect(screen.getByText(/entered by you/i)).toBeInTheDocument();
  });

  test('listing asking and listing rent stay distinct from scenario fields', () => {
    render(
      <Harness preview={{ price: 200000, monthly_rent: 1125 }} />
    );
    expect(screen.getByText('£200,000')).toBeInTheDocument();
    expect(screen.getByText('£1,125 pcm')).toBeInTheDocument();
    expect(screen.getByLabelText(/your purchase price/i)).toHaveValue('');
    expect(screen.getByLabelText(/your expected monthly rent/i)).toHaveValue('');
  });

  test('market rent remains labelled separately from expected rent', () => {
    render(
      <Harness
        preview={{ price: 200000, monthly_rent: 1125 }}
        report={{
          marketIntelligence: {
            rent: { success: true, marketRange: { low: 1050, high: 1150 }, recommendedRent: 1100 },
            sale: { success: true, centralEstimate: 190000 },
          },
        }}
      />
    );
    expect(screen.getByText(/area asking-rent evidence \(market/i)).toBeInTheDocument();
    expect(screen.getByText(/not this property’s achievable/i)).toBeInTheDocument();
    expect(screen.getByText(/£1,050–£1,150 pcm/)).toBeInTheDocument();
    expect(screen.getByLabelText(/your expected monthly rent/i)).toHaveValue('');
    expect(screen.queryByText(/^Recommended rent$/i)).not.toBeInTheDocument();
  });

  test('LET_INVEST defaults to Deal & rent and progressively discloses later stages', async () => {
    function LetHarness() {
      const [form, setForm] = useState({ ...EMPTY_FINANCE_SCENARIO });
      const [section, setSection] = useState('property_rent');
      return (
        <FinanceScenarioForm
          form={form}
          onChange={setForm}
          decisionJob="LET_INVEST"
          expandedSection={section}
          onExpandSection={setSection}
          listingSubject
          preview={{ price: 200000, monthly_rent: 1125 }}
        />
      );
    }
    render(<LetHarness />);
    expect(screen.getByTestId('let-underwriting-unlock-guide')).toHaveTextContent(/not assessed/i);
    expect(screen.getByTestId('let-stage-tab-property_rent')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('let-stage-tab-property_rent')).toHaveTextContent(/Current/i);
    expect(screen.getByLabelText(/your purchase price/i)).toBeVisible();
    expect(screen.getByText(/listing asking price/i)).toBeInTheDocument();
    expect(screen.getByText(/not a valuation or fair value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your expected monthly rent/i)).toHaveValue('');
    expect(screen.getByLabelText(/your purchase price/i)).toHaveValue('');
    expect(screen.getByTestId('finance-section-property-rent')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('finance-section-operating')).toHaveAttribute('hidden');
    expect(screen.getByTestId('finance-section-financing')).toHaveAttribute('hidden');

    await userEvent.click(screen.getByTestId('let-stage-tab-operating'));
    expect(screen.getByTestId('let-stage-tab-operating')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('finance-section-operating')).not.toHaveAttribute('hidden');
    expect(screen.getByLabelText(/^maintenance$/i)).toBeVisible();
    expect(screen.getByTestId('finance-field-wrap-serviceCharge')).toBeInTheDocument();
    expect(screen.getByTestId('finance-field-wrap-groundRent')).toBeInTheDocument();
    expect(screen.getByTestId('finance-section-property-rent')).toHaveAttribute('hidden');

    await userEvent.click(screen.getByTestId('let-stage-tab-financing'));
    expect(screen.getByLabelText(/^deposit$/i)).toBeVisible();
    expect(screen.getByLabelText(/mortgage amount/i)).toBeVisible();
    expect(screen.getByLabelText(/mortgage term/i)).toHaveValue('');
    expect(screen.getByTestId('finance-section-operating')).toHaveAttribute('hidden');
    expect(screen.getByTestId('finance-section-financing')).not.toHaveAttribute('hidden');
  });

  test('LET operating-cost wraps exist when that stage is focused', () => {
    render(
      <FinanceScenarioForm
        form={{ ...EMPTY_FINANCE_SCENARIO }}
        onChange={() => {}}
        decisionJob="LET_INVEST"
        focusField="maintenance"
      />
    );
    expect(screen.getByTestId('finance-field-wrap-maintenance')).toBeInTheDocument();
    expect(screen.getByTestId('finance-field-wrap-insurance')).toBeInTheDocument();
    expect(screen.getByTestId('finance-field-wrap-managementFee')).toBeInTheDocument();
    expect(screen.getByTestId('finance-field-wrap-taxes')).toBeInTheDocument();
    expect(screen.getByTestId('finance-field-wrap-serviceCharge')).toBeInTheDocument();
    expect(screen.getByTestId('finance-field-wrap-groundRent')).toBeInTheDocument();
  });

  test('non-listing subject does not show listing-missing asking price', () => {
    render(
      <FinanceScenarioForm
        form={{ ...EMPTY_FINANCE_SCENARIO }}
        onChange={() => {}}
        decisionJob="LET_INVEST"
        listingSubject={false}
        preview={{ address_display: '12 Acacia Avenue', source: 'external_lookup', uprn: '1' }}
      />
    );
    expect(screen.queryByText(/listing asking price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/listing asking price — not on file/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/your purchase price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your expected monthly rent/i)).toBeInTheDocument();
  });

  test('MARKET rent is area context, never achievable or recommended property rent', () => {
    render(
      <FinanceScenarioForm
        form={{ ...EMPTY_FINANCE_SCENARIO }}
        onChange={() => {}}
        decisionJob="LET_INVEST"
        listingSubject
        preview={{ price: 200000, monthly_rent: 1125 }}
        report={{
          marketIntelligence: {
            rent: { success: true, marketRange: { low: 1050, high: 1150 }, recommendedRent: 1100 },
          },
        }}
      />
    );
    expect(screen.getByText(/area asking-rent evidence \(market/i)).toBeInTheDocument();
    expect(screen.getByText(/area context/i)).toBeInTheDocument();
    expect(screen.getByText(/not this property’s achievable or recommended rent/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Recommended rent$/i)).not.toBeInTheDocument();
  });

  test('stage tabs are keyboard accessible and do not rely on colour alone', async () => {
    render(
      <FinanceScenarioForm
        form={{ ...EMPTY_FINANCE_SCENARIO }}
        onChange={() => {}}
        decisionJob="LET_INVEST"
        listingSubject
      />
    );
    const deal = screen.getByTestId('let-stage-tab-property_rent');
    deal.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('let-stage-tab-operating')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('let-stage-tab-operating')).toHaveTextContent(/Current/i);
  });


  test('BUY does not show LET unlock guidance', () => {
    render(
      <FinanceScenarioForm
        form={{ ...EMPTY_FINANCE_SCENARIO }}
        onChange={() => {}}
        decisionJob="BUY"
      />
    );
    expect(screen.queryByTestId('let-underwriting-unlock-guide')).not.toBeInTheDocument();
  });

  test('stale results are identified after editing inputs', () => {
    render(<Harness stale />);
    expect(screen.getByText(/recalculate to apply these changes/i)).toBeInTheDocument();
  });

  test('does not ask for personal underwriting data', () => {
    render(<Harness />);
    expect(screen.queryByLabelText(/salary/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/credit score/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/bank balance/i)).not.toBeInTheDocument();
  });

  test('missing listing rent is Not on file, not £0', () => {
    render(<Harness preview={{ price: 200000, monthly_rent: null }} />);
    expect(screen.getByText('£200,000')).toBeInTheDocument();
    expect(screen.queryByText('£0 pcm')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not on file').length).toBeGreaterThan(0);
  });

  test('BUY hides landlord operating costs while keeping optional finance', () => {
    render(
      <div>
        <FinanceScenarioForm
          form={{ ...EMPTY_FINANCE_SCENARIO }}
          onChange={() => {}}
          decisionJob="BUY"
        />
      </div>
    );
    expect(screen.getByLabelText(/your purchase price/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/your expected monthly rent/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/vacancy assumption/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^deposit$/i)).toBeInTheDocument();
  });

  test('SELL does not require finance or invented listing strategy inputs', () => {
    render(
      <FinanceScenarioForm
        form={{ ...EMPTY_FINANCE_SCENARIO }}
        onChange={() => {}}
        decisionJob="SELL"
      />
    );
    expect(screen.getByTestId('sell-finance-not-required')).toBeInTheDocument();
    expect(screen.queryByLabelText(/vacancy assumption/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/your purchase price/i)).not.toBeInTheDocument();
  });
});
