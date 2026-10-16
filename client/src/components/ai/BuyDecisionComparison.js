import React from 'react';
import { buyComparisonView } from '../../Utils/buyComparisonDisplay';

export default function BuyDecisionComparison({ comparison }) {
  const view = buyComparisonView(comparison);
  const labelA = view.subjects[0]?.label || 'Property A';
  const labelB = view.subjects[1]?.label || 'Property B';
  return (
    <section className="pi-workspace-block" data-testid="buy-comparison" aria-labelledby="buy-comparison-heading">
      <p className="pi-report-kicker">Property comparison</p>
      <h3 id="buy-comparison-heading">How the stored decisions differ</h3>
      <p data-testid="buy-comparison-conclusion">{view.conclusion}</p>
      {view.columns.length > 0 && (
        <table data-testid="buy-comparison-table">
          <thead>
            <tr>
              <th scope="col">Evidence</th>
              <th scope="col">{labelA}</th>
              <th scope="col">{labelB}</th>
            </tr>
          </thead>
          <tbody>
            {view.columns.map((row) => (
              <tr key={row.id} data-testid={`buy-comparison-row-${row.id}`}>
                <th scope="row">{row.label}</th>
                <td>{row.a}</td>
                <td>{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view.observations.length > 0 && (
        <div data-testid="buy-comparison-differences">
          <h4 className="pi-subheading">Key differences</h4>
          <ul>
            {view.observations.map((row) => (
              <li key={row.id} data-testid={`buy-comparison-observation-${row.id}`}>
                <strong>{row.title}</strong>
                {row.statement ? <p>{row.statement}</p> : null}
                {row.limitation ? <p>{row.limitation}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
