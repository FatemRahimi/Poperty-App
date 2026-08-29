import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import AiHistoryDetail from './AiHistoryDetail';
import {
  fetchHistoryItem,
  analysePropertyIntelligence,
  fetchPropertyPreview,
} from '../../services/aiService';

jest.mock('../../services/aiService', () => ({
  fetchHistoryItem: jest.fn(),
  deleteHistoryItem: jest.fn(),
  analysePropertyIntelligence: jest.fn(),
  fetchPropertyPreview: jest.fn(),
  fetchSubscription: jest.fn(),
}));

jest.mock('../../components/ai/AiWorkspaceLayout', () => ({ children, title }) => (
  <div data-testid="layout">
    <h1>{title}</h1>
    {children}
  </div>
));

function renderDetail(id = '9') {
  return render(
    <MemoryRouter initialEntries={[`/ai-services/history/${id}`]}>
      <Routes>
        <Route path="/ai-services/history/:id" element={<AiHistoryDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AiHistoryDetail Property Intelligence snapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the saved canonical PI report without re-analysing or fetching the listing', async () => {
    fetchHistoryItem.mockResolvedValue({
      success: true,
      item: {
        id: 9,
        request_type: 'property_intelligence',
        created_at: '2026-08-25T12:00:00.000Z',
        confidenceLevel: 'Medium',
        output_data: {
          title: 'Property Intelligence – 2 bed terrace',
          analysisDate: '2026-08-25T12:00:00.000Z',
          property: { title: '2 bed terrace', price: 200000, monthly_rent: 1125 },
          personalDecision: {
            available: true,
            score: 61,
            scoreLabel: 'Landlord fit score',
            explanation: { overall: 'Saved snapshot why text.' },
            dimensions: {},
          },
          executiveSummary: 'Historical executive summary.',
          disclaimer: 'Not advice.',
        },
      },
    });

    renderDetail();

    expect(await screen.findByTestId('saved-pi-history-report')).toBeInTheDocument();
    expect(screen.getByTestId('saved-pi-snapshot-note')).toHaveTextContent(/analysis time/i);
    expect(screen.getByTestId('landlord-explanation')).toHaveTextContent('Saved snapshot why text.');
    expect(screen.queryByTestId('intelligence-report-empty')).not.toBeInTheDocument();
    expect(analysePropertyIntelligence).not.toHaveBeenCalled();
    expect(fetchPropertyPreview).not.toHaveBeenCalled();
    expect(fetchHistoryItem).toHaveBeenCalledWith('9');
  });

  test('listing writer history is unchanged and does not use IntelligenceReport', async () => {
    fetchHistoryItem.mockResolvedValue({
      success: true,
      item: {
        id: 4,
        request_type: 'listing_writer',
        created_at: '2026-08-25T12:00:00.000Z',
        output_data: {
          seoTitle: 'Charming terrace in Leeds',
          description: 'A bright two-bed home.',
          keySellingPoints: ['Garden'],
          socialMediaAdvert: 'For sale',
          emailMarketing: 'Hello',
        },
      },
    });

    renderDetail('4');

    expect(await screen.findByText('Charming terrace in Leeds')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-pi-history-report')).not.toBeInTheDocument();
    expect(analysePropertyIntelligence).not.toHaveBeenCalled();
  });

  test('source freeze: snapshot render only, no live analyse or listing fetch', () => {
    const src = fs.readFileSync(path.join(__dirname, 'AiHistoryDetail.js'), 'utf8');
    expect(src).toMatch(/savedIntelligenceReportFromRow/);
    expect(src).toMatch(/fetchHistoryItem/);
    expect(src).toMatch(/IntelligenceReport/);
    expect(src).not.toMatch(/analysePropertyIntelligence/);
    expect(src).not.toMatch(/fetchPropertyPreview/);
    expect(src).not.toMatch(/WhatIfPanel/);
  });
});
