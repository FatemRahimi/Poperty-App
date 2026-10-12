import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PostcodeIntelligencePanel, {
  uniqueAreaSources,
  areaSoldPriceLabel,
} from '../../components/ai/PostcodeIntelligencePanel';

const baseIntelligence = {
  success: true,
  postcode: 'SW2 3BD',
  title: 'SW2 3BD — Property Market Intelligence',
  retrievedAt: '2026-09-09T12:00:00.000Z',
  dataSources: ['PropertyData', 'HM_Land_Registry', 'PropertyData', 'PropertyData'],
  confidence: { level: 'Medium', summary: 'Enough area records for orientation' },
  layerNote: 'Area market context.',
  marketSummary:
    'A long repeated market summary that previously competed with the tiles and looked like a property valuation narrative.',
  methodology: { summary: 'Area aggregates only.' },
  disclaimers: ['Not a property valuation.'],
  snapshot: {
    typicalValue: {
      available: true,
      value: 450000,
      label: 'Typical sold price (area)',
      source: 'HM_Land_Registry',
    },
    typicalRent: {
      available: true,
      value: 1800,
      label: 'Median asking rent (marketplace)',
    },
    indicativeAreaYield: {
      available: true,
      grossYieldPercent: 4.8,
      label: 'Indicative area yield',
    },
    marketEvidenceCount: 35,
    listingSupply: { total: 12, sale: 7, rent: 5 },
    confidence: { level: 'Medium', summary: 'Area evidence only' },
  },
  sales: { available: false },
  rental: { available: false },
  investment: { available: false },
};

describe('Area vs Property mode lock — PostcodeIntelligencePanel', () => {
  test('uniqueAreaSources removes duplicate provider names', () => {
    expect(uniqueAreaSources(baseIntelligence.dataSources)).toEqual([
      'HM Land Registry',
      'PropertyData',
    ]);
  });

  test('postcode-only primary mode renders Area Context hierarchy', () => {
    render(
      <PostcodeIntelligencePanel
        intelligence={baseIntelligence}
        mode="primary"
        hasExactMatches
        onSelectProperty={() => {}}
      />
    );

    expect(screen.getByTestId('area-context-panel')).toHaveAttribute('data-mode', 'area-context');
    expect(screen.getByTestId('area-context-kicker')).toHaveTextContent('Area context — SW2 3BD');
    expect(screen.getByTestId('area-context-lead')).toHaveTextContent(
      'Local market snapshot — not a specific property.'
    );
    expect(screen.getByTestId('area-select-property-cta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select a property in SW2 3BD/i })).toBeInTheDocument();
  });

  test('£ metric is labelled as typical local sold price, not property valuation', () => {
    render(<PostcodeIntelligencePanel intelligence={baseIntelligence} mode="primary" />);
    expect(areaSoldPriceLabel()).toBe('Typical local sold price');
    expect(screen.getByTestId('area-typical-sold-price')).toHaveTextContent('Typical local sold price');
    expect(screen.getByTestId('area-typical-sold-price')).toHaveTextContent('£450,000');
    const panel = screen.getByTestId('area-context-panel');
    expect(panel.textContent).not.toMatch(/Typical value/);
    expect(screen.queryByText(/^Property value$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Estimated value$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Valuation$/i)).not.toBeInTheDocument();
  });

  test('confidence is scoped to area evidence strength', () => {
    render(<PostcodeIntelligencePanel intelligence={baseIntelligence} mode="primary" />);
    expect(screen.getByTestId('area-evidence-strength-badge')).toHaveTextContent('Area evidence strength');
    expect(screen.getByTestId('area-evidence-strength-badge')).toHaveTextContent('Medium');
    expect(screen.getByTestId('area-evidence-strength-tile')).toHaveTextContent('Area evidence strength');
  });

  test('area tabs are labelled as area views, not Buy/Let/Sell jobs', () => {
    render(<PostcodeIntelligencePanel intelligence={baseIntelligence} mode="primary" />);
    expect(screen.getByRole('tab', { name: 'Area overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Area sales' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Area rental' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Area yield' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Investment' })).not.toBeInTheDocument();
    expect(screen.queryByText('What are you assessing?')).not.toBeInTheDocument();
    expect(screen.queryByText('Let / Invest')).not.toBeInTheDocument();
  });

  test('sources compact presentation removes duplicates', () => {
    render(<PostcodeIntelligencePanel intelligence={baseIntelligence} mode="primary" />);
    const sources = screen.getByTestId('area-sources-compact');
    expect(sources).toHaveTextContent('Sources (2)');
    expect(sources).toHaveTextContent('HM Land Registry · PropertyData');
    expect(sources.textContent.match(/PropertyData/g) || []).toHaveLength(1);
  });

  test('Select a property CTA fires when matches exist', () => {
    const onSelect = jest.fn();
    render(
      <PostcodeIntelligencePanel
        intelligence={baseIntelligence}
        mode="primary"
        hasExactMatches
        onSelectProperty={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Select a property in SW2 3BD/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test('secondary mode demotes area panel after exact property selection', () => {
    render(
      <PostcodeIntelligencePanel intelligence={baseIntelligence} mode="secondary" hasExactMatches />
    );
    expect(screen.getByTestId('area-context-panel')).toHaveAttribute('data-mode', 'area-secondary');
    expect(screen.queryByTestId('area-select-property-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-context-lead')).toHaveTextContent(
      'Local market snapshot — not a specific property.'
    );
  });

  test('market summary defaults to short lead with expandable detail', () => {
    render(<PostcodeIntelligencePanel intelligence={baseIntelligence} mode="primary" />);
    expect(screen.getByTestId('area-market-summary-lead').textContent.length).toBeLessThan(180);
    expect(screen.getByTestId('area-market-summary-detail')).toBeInTheDocument();
  });
});
