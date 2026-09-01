import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecordSaleOutcome, {
  canCompleteSaleOutcome,
  canRecordSaleOutcome,
  saleOutcomeRecorded,
} from './RecordSaleOutcome';

describe('RecordSaleOutcome', () => {
  const approved = {
    id: 10,
    category: 'sale',
    status: 'approved',
    price: 400000,
    valuation: 410000,
    sold_at: null,
    achieved_price: null,
  };
  const incompleteSold = {
    id: 11,
    category: 'sale',
    status: 'sold',
    price: 400000,
    valuation: 410000,
    sold_at: '2026-07-01T10:00:00.000Z',
    achieved_price: null,
  };
  const completeSold = {
    id: 12,
    category: 'sale',
    status: 'sold',
    price: 400000,
    sold_at: '2026-07-01T10:00:00.000Z',
    achieved_price: 385000,
  };

  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    global.fetch = jest.fn();
  });

  afterEach(() => {
    localStorage.clear();
    jest.resetAllMocks();
  });

  test('approved listing shows Record sold and never prefills asking or valuation', async () => {
    render(<RecordSaleOutcome property={approved} />);
    expect(screen.getByRole('button', { name: 'Record sold' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record sold' }));
    const price = screen.getByTestId('achieved-price-input');
    expect(price).toHaveValue(null);
    expect(price.value).not.toBe('400000');
    expect(price.value).not.toBe('410000');
  });

  test('incomplete sold listing shows Complete sale outcome with locked date', async () => {
    expect(canCompleteSaleOutcome(incompleteSold)).toBe(true);
    expect(canRecordSaleOutcome(incompleteSold)).toBe(false);
    expect(saleOutcomeRecorded(incompleteSold)).toBe(false);
    render(<RecordSaleOutcome property={incompleteSold} />);
    expect(screen.getByRole('button', { name: 'Complete sale outcome' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Complete sale outcome' }));
    const price = screen.getByTestId('achieved-price-input');
    expect(price).toHaveValue(null);
    expect(price.value).not.toBe(String(incompleteSold.price));
    expect(price.value).not.toBe(String(incompleteSold.valuation));
    const date = screen.getByTestId('sold-date-input');
    expect(date).toHaveAttribute('readonly');
    expect(date).toHaveValue('2026-07-01');
  });

  test('complete sold listing shows stored state and no edit form', () => {
    expect(saleOutcomeRecorded(completeSold)).toBe(true);
    render(<RecordSaleOutcome property={completeSold} />);
    expect(screen.getByTestId('sale-outcome-recorded')).toHaveTextContent('Sale recorded');
    expect(screen.getByTestId('sale-outcome-recorded-price')).toHaveTextContent('385,000');
    expect(screen.queryByRole('button', { name: 'Record sold' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete sale outcome' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('achieved-price-input')).not.toBeInTheDocument();
  });

  test('completion submit posts the typed price and existing sold_at', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        property: { ...incompleteSold, achieved_price: 385000 },
      }),
    });
    const onRecorded = jest.fn();
    render(<RecordSaleOutcome property={incompleteSold} onRecorded={onRecorded} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete sale outcome' }));
    await userEvent.type(screen.getByTestId('achieved-price-input'), '385000');
    await userEvent.click(screen.getByRole('button', { name: 'Save achieved price' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/properties/11/outcome',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          outcome: 'sold',
          achievedPrice: 385000,
          occurredAt: new Date(incompleteSold.sold_at).toISOString(),
        }),
      })
    );
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.achievedPrice).not.toBe(incompleteSold.price);
    expect(sent.achievedPrice).not.toBe(incompleteSold.valuation);
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
  });
});
