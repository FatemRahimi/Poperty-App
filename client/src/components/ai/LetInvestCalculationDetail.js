import React from 'react';
import {
  deeperLetEconomicsIncomplete,
  letKeyEconomics,
  letSaleSupportItems,
  moneyDisplay,
  purchasePriceBasisRows,
  rentBasisCalloutText,
  rentEvidenceRows,
} from '../../Utils/letResultsDisplay';

function metricText(item) {
  if (!item?.available) return 'Not assessed';
  if (item.value == null || item.value === '') return 'Not assessed';
  if (item.id === 'grossYield' || item.id === 'netYield' || item.basis === 'MARKET_RENT') {
    return item.value != null ? `${item.value}%` : 'Not assessed';
  }
  if (item.id === 'dscr') return String(item.value);
  if (item.id === 'noi' || item.id === 'annualCashFlow' || item.id === 'monthlyCashFlow') {
    return moneyDisplay(item.value) || 'Not assessed';
  }
  return String(item.value);
}

export function LetInvestCalculationDetail({ report, workspace, listingSubject }) {
  const economics = letKeyEconomics(report, workspace);
  const earlyGrossYield = deeperLetEconomicsIncomplete(economics);
  const priceRows = purchasePriceBasisRows(report, listingSubject);
  const rentRows = rentEvidenceRows(report, listingSubject);
  const rentCallout = rentBasisCalloutText(report?.investment?.presented?.rentBasis);

  return (
    <div data-testid="let-calculation-detail">
      {(priceRows.length > 0 || rentRows.length > 0) && (
        <div className="pi-metric-grid" data-testid="let-price-rent-basis">
          {priceRows.map((row) => (
            <div key={row.id} className="pi-metric-tile" data-testid={`let-basis-${row.id}`}>
              <small>{row.label}</small>
              <strong>{row.value}</strong>
              <em>{row.hint}</em>
            </div>
          ))}
          {rentRows.map((row) => (
            <div key={row.id} className="pi-metric-tile" data-testid={`let-basis-${row.id}`}>
              <small>{row.label}</small>
              <strong>{row.value}</strong>
              <em>{row.hint}</em>
            </div>
          ))}
        </div>
      )}
      <div className="pi-metric-grid" data-testid="key-intelligence">
        {economics.map((item) => (
          <div
            key={item.id}
            className={`pi-metric-tile ${item.available ? 'pi-metric-tile--assessed' : 'pi-metric-tile--missing'}${
              item.id === 'grossYield' && earlyGrossYield && item.available ? ' pi-metric-tile--orientation' : ''
            }`}
            data-testid={`workspace-metric-${item.id}`}
          >
            <small>
              {item.id === 'grossYield' && earlyGrossYield && item.available
                ? 'Gross yield (early orientation)'
                : item.label}
            </small>
            <strong>{metricText(item)}</strong>
            {!item.available && item.howToResolve ? <em>{item.howToResolve}</em> : null}
            {item.id === 'grossYield' && earlyGrossYield && item.available ? (
              <em data-testid="gross-yield-orientation-note">
                Early orientation only — not a complete investment assessment while NOI, cash flow,
                DSCR or net yield remain not assessed.
              </em>
            ) : null}
          </div>
        ))}
      </div>
      {rentCallout ? (
        <p className="pi-muted" data-testid="rent-basis-disclosure">{rentCallout}</p>
      ) : null}
    </div>
  );
}

export function LetInvestSaleContext({ workspace }) {
  const items = letSaleSupportItems(workspace);
  if (!items.length) return null;
  return (
    <div data-testid="workspace-context-evidence">
      <p className="pi-muted">
        Sale valuation and asking-price position are supporting context for this let, not the
        primary investment figures. Area sold-price context is not this property’s value.
      </p>
      <div className="pi-metric-grid">
        {items.map((item) => (
          <div
            key={item.id}
            className="pi-metric-tile"
            data-testid={`workspace-metric-${item.id}`}
          >
            <small>{item.label}</small>
            <strong>
              {item.available && item.value != null && item.value !== ''
                ? (moneyDisplay(item.value) || String(item.value))
                : 'Not assessed'}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
