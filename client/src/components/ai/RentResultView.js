import React from 'react';
import { AssessedMetricTile, AssessedText } from './AssessedMetric';
import {
  formatCurrency,
  isFiniteNumber,
  resolveAssessedDisplay,
} from '../../Utils/assessedMetricDisplay';

function moneyDisplay(value) {
  return resolveAssessedDisplay({ value, format: 'currency' });
}

function percentDisplay(value) {
  return resolveAssessedDisplay({ value, format: 'percent' });
}

function demandDisplay(expectedDemand) {
  if (expectedDemand?.available === true && isFiniteNumber(expectedDemand.value)) {
    return resolveAssessedDisplay({
      assessment: { state: 'assessed' },
      value: expectedDemand.value,
      format: 'number',
    });
  }
  return {
    kind: 'notAssessed',
    text: 'Not assessed',
    reason: expectedDemand?.note && !/^[a-z0-9_]+$/i.test(String(expectedDemand.note))
      ? expectedDemand.note
      : null,
    numeric: false,
  };
}

function rangeDisplay(marketRange) {
  const lowOk = isFiniteNumber(marketRange?.low);
  const highOk = isFiniteNumber(marketRange?.high);
  if (lowOk && highOk) {
    return {
      kind: 'assessed',
      text: `${formatCurrency(marketRange.low)}–${formatCurrency(marketRange.high)}`,
      reason: null,
      numeric: true,
    };
  }
  return resolveAssessedDisplay({ value: null, format: 'currency' });
}

export default function RentResultView({ result }) {
  if (!result) return null;

  if (result.insufficientData) {
    return (
      <div className="ai-panel" data-testid="rent-result-view">
        <h2>Insufficient data</h2>
        <p className="ai-insight-meta">{result.message}</p>
        <div className="ai-metrics-grid">
          <AssessedMetricTile
            label="Recommended rent"
            display={moneyDisplay(null)}
            testId="rent-recommended"
          />
          <AssessedMetricTile
            label="Market range"
            display={moneyDisplay(null)}
            testId="rent-market-range"
          />
          <AssessedMetricTile
            label="Rental demand"
            display={demandDisplay(result.expectedDemand)}
            testId="rent-demand"
          />
        </div>
        <p className="ai-disclaimer">{result.disclaimer}</p>
      </div>
    );
  }

  if (!result.success) return null;

  return (
    <div data-testid="rent-result-view">
      <div className="ai-metrics-grid">
        <AssessedMetricTile
          label="Recommended rent"
          display={moneyDisplay(result.recommendedRent)}
          testId="rent-recommended"
        />
        <AssessedMetricTile
          label="Market range"
          display={rangeDisplay(result.marketRange)}
          testId="rent-market-range"
        />
        <AssessedMetricTile
          label="Confidence"
          display={{
            kind: result.confidenceLevel ? 'assessed' : 'notAssessed',
            text: result.confidenceLevel || 'Not assessed',
            reason: null,
            numeric: Boolean(result.confidenceLevel),
          }}
          testId="rent-confidence"
        />
        <AssessedMetricTile
          label="Data quality"
          display={{
            kind: result.dataQuality?.level ? 'assessed' : 'notAssessed',
            text: result.dataQuality?.level || 'Not assessed',
            reason: null,
            numeric: Boolean(result.dataQuality?.level),
          }}
          testId="rent-data-quality"
        />
        <AssessedMetricTile
          label="Rental demand"
          display={demandDisplay(result.expectedDemand)}
          testId="rent-demand"
        />
      </div>

      {Array.isArray(result.priceSensitivity) && result.priceSensitivity.length > 0 && (
        <div className="ai-panel">
          <h2>Price sensitivity</h2>
          <table className="ai-data-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Rent</th>
                <th>Demand</th>
              </tr>
            </thead>
            <tbody>
              {result.priceSensitivity.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td><AssessedText display={moneyDisplay(row.rent)} /></td>
                  <td>{row.demand == null || row.demand === '' ? 'Not assessed' : String(row.demand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {Array.isArray(result.comparables) && result.comparables.length > 0 && (
        <div className="ai-panel">
          <h2>Comparable properties ({result.comparables.length})</h2>
          <table className="ai-data-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Rent</th>
                <th>Similarity</th>
                <th>Why selected</th>
              </tr>
            </thead>
            <tbody>
              {result.comparables.map((c) => (
                <tr key={c.id}>
                  <td>{c.title || c.city}</td>
                  <td><AssessedText display={moneyDisplay(c.monthly_rent)} /></td>
                  <td>
                    <AssessedText
                      display={
                        isFiniteNumber(c.similarity)
                          ? percentDisplay(c.similarity)
                          : resolveAssessedDisplay({ value: null, format: 'percent' })
                      }
                    />
                  </td>
                  <td>{(c.reasons || []).join(', ') || 'Comparable match'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="ai-disclaimer">{result.disclaimer}</p>
    </div>
  );
}
