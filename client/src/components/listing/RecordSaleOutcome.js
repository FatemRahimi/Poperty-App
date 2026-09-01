import React, { useState } from 'react';
import './RecordSaleOutcome.css';

function hasGenuineAchievedPrice(property) {
  return Number(property?.achieved_price) > 0;
}

function canRecordSaleOutcome(property) {
  if (!property || property.category !== 'sale') return false;
  return property.status === 'approved' || property.status === 'under_offer';
}

function saleOutcomeRecorded(property) {
  return Boolean(property?.sold_at && hasGenuineAchievedPrice(property));
}

function canCompleteSaleOutcome(property) {
  if (!property || property.category !== 'sale') return false;
  if (saleOutcomeRecorded(property)) return false;
  return property.status === 'sold' || Boolean(property.sold_at);
}

function isoDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatGbp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-GB');
}

/**
 * Smallest authorized first-party sale completion form.
 * Posts to the existing POST /api/properties/:id/outcome contract.
 * Never copies asking price or valuation into achieved_price.
 */
const RecordSaleOutcome = ({ property, onRecorded }) => {
  const [open, setOpen] = useState(false);
  const [achievedPrice, setAchievedPrice] = useState('');
  const [soldDate, setSoldDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!property) return null;

  if (saleOutcomeRecorded(property)) {
    return (
      <div className="record-sale-outcome-recorded" data-testid="sale-outcome-recorded">
        <p>Sale recorded</p>
        <p data-testid="sale-outcome-recorded-date">Completed on {isoDateInput(property.sold_at)}</p>
        <p data-testid="sale-outcome-recorded-price">Achieved price £{formatGbp(property.achieved_price)}</p>
      </div>
    );
  }

  const completing = canCompleteSaleOutcome(property);
  if (!completing && !canRecordSaleOutcome(property)) return null;

  const lockedDate = completing && property.sold_at ? isoDateInput(property.sold_at) : '';

  const reset = () => {
    setAchievedPrice('');
    setSoldDate('');
    setError('');
    setOpen(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    const price = Number(String(achievedPrice).replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter the genuine completed sale price. Asking price is not used.');
      return;
    }
    const dateValue = lockedDate || soldDate;
    if (!dateValue) {
      setError('Enter the completion / sold date.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const occurredAt = property.sold_at
        ? new Date(property.sold_at).toISOString()
        : new Date(`${dateValue}T12:00:00.000Z`).toISOString();
      const response = await fetch(`/api/properties/${property.id}/outcome`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          outcome: 'sold',
          achievedPrice: price,
          occurredAt,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.message || 'Could not record the sale outcome.');
        return;
      }
      if (onRecorded) onRecorded(data.property);
      reset();
    } catch (err) {
      setError('Could not record the sale outcome.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="record-sale-outcome" data-testid={completing ? 'complete-sale-outcome' : 'record-sale-outcome'}>
      {!open ? (
        <button
          type="button"
          className="record-sale-outcome-open"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
        >
          {completing ? 'Complete sale outcome' : 'Record sold'}
        </button>
      ) : (
        <form className="record-sale-outcome-form" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
          <p className="record-sale-outcome-help">
            {completing
              ? 'Complete the genuine achieved sale price. Asking price and valuations are not used.'
              : 'Record the genuine completed sale. Asking price and valuations are not used.'}
          </p>
          <label>
            Achieved sale price (£)
            <input
              type="number"
              min="1"
              step="1"
              value={achievedPrice}
              onChange={(event) => setAchievedPrice(event.target.value)}
              autoComplete="off"
              required
              data-testid="achieved-price-input"
            />
          </label>
          <label>
            Completion / sold date
            <input
              type="date"
              value={lockedDate || soldDate}
              onChange={(event) => {
                if (!lockedDate) setSoldDate(event.target.value);
              }}
              readOnly={Boolean(lockedDate)}
              required
              data-testid="sold-date-input"
            />
          </label>
          {error ? <p className="record-sale-outcome-error">{error}</p> : null}
          <div className="record-sale-outcome-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : completing ? 'Save achieved price' : 'Save sale outcome'}
            </button>
            <button type="button" onClick={reset} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export { canRecordSaleOutcome, canCompleteSaleOutcome, saleOutcomeRecorded };
export default RecordSaleOutcome;
