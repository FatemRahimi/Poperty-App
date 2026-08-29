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
    expect(screen.getByText(/market rent evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/£1,050–£1,150 pcm/)).toBeInTheDocument();
    expect(screen.getByLabelText(/your expected monthly rent/i)).toHaveValue('');
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
});
