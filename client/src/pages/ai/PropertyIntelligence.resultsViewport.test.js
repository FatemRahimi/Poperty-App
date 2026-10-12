import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

jest.mock('../../services/aiCreditState', () => ({
  displayAiCredits: () => 'Unlimited',
  isUnlimitedPlan: () => true,
  refreshAiCredits: jest.fn(() => Promise.resolve()),
  subscribeAiCredits: (listener) => {
    listener({ plan: { unlimited: true }, subscription: { credits_remaining: -1 } });
    return () => {};
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    validateToken: jest.fn(async () => ({ id: 1 })),
    logout: jest.fn(),
  }),
}));

jest.mock('../../components/ai/AiWorkspaceLayout', () => ({ children, title }) => (
  <div data-testid="layout">
    <h1>{title}</h1>
    {children}
  </div>
));

jest.mock('../../components/ai/LegalTitleEvidencePanel', () => () => null);
jest.mock('../../components/ai/WhatIfPanel', () => () => <div data-testid="whatif-panel" />);
jest.mock('../../components/ai/IntelligenceReport', () => {
  const Report = () => <div data-testid="intelligence-report">Investment assessment</div>;
  return {
    __esModule: true,
    default: Report,
    fmt: (n) => (n != null && !Number.isNaN(Number(n)) ? `£${Number(n).toLocaleString()}` : '—'),
  };
});

jest.mock('../../services/aiService', () => ({
  searchIntelligenceProperties: jest.fn(),
  lookupIntelligenceProperties: jest.fn(),
  resolveIntelligenceSubject: jest.fn(),
  fetchSubjectPreview: jest.fn(),
  fetchSubjectAnalysisHistory: jest.fn(),
  fetchPropertyPreview: jest.fn(),
  fetchPropertyAnalysisHistory: jest.fn(),
  fetchRecentSubjectLookups: jest.fn(),
  analyseSubjectIntelligence: jest.fn(),
  analysePropertyIntelligence: jest.fn(),
  getSubjectPropertyAttributes: jest.fn(),
  putSubjectPropertyAttributes: jest.fn(),
  unlinkIntelligenceSubject: jest.fn(),
  fetchPropertyAnalysisById: jest.fn(),
  fetchLegalEvidence: jest.fn(),
}));

import {
  searchIntelligenceProperties,
  fetchPropertyPreview,
  fetchPropertyAnalysisHistory,
  fetchRecentSubjectLookups,
  fetchSubjectAnalysisHistory,
  analysePropertyIntelligence,
  fetchPropertyAnalysisById,
  getSubjectPropertyAttributes,
} from '../../services/aiService';
import PropertyIntelligence from './PropertyIntelligence';

const PLATFORM_LISTING = {
  id: 42,
  title: 'City loft',
  address_display: 'Flat 2, 10 Marks Street, Birmingham B1 2UJ',
  city: 'Birmingham',
  property_type: 'Flat',
  price: 275000,
  monthly_rent: 1200,
  source: 'marketplace',
};

const LET_OUTPUT = {
  decisionJob: 'LET_INVEST',
  analysisDate: '2026-09-21T12:00:00.000Z',
  property: {
    id: 42,
    title: 'City loft',
    address: PLATFORM_LISTING.address_display,
    price: 275000,
    monthly_rent: 1200,
    source: 'marketplace',
  },
  personalDecision: { profile: 'landlord', available: true, score: 58 },
  scores: { coverage: { componentsScored: 4, componentsTotal: 6 } },
  confidence: { level: 'Low' },
  decisionWorkspace: {
    decisionJob: 'LET_INVEST',
    copy: { headline: 'You are assessing this property to LET / INVEST' },
  },
};

function renderPI() {
  return render(
    <MemoryRouter>
      <PropertyIntelligence />
    </MemoryRouter>
  );
}

async function openListing() {
  searchIntelligenceProperties.mockImplementation(async (_q, tab) => {
    if (tab === 'browse') return { properties: [PLATFORM_LISTING] };
    return { properties: [] };
  });
  fetchPropertyPreview.mockResolvedValue({
    property: {
      id: 42,
      address_display: PLATFORM_LISTING.address_display,
      property_type: 'Flat',
      bedrooms: 2,
      price: 275000,
      monthly_rent: 1200,
      source: 'marketplace',
    },
    accessContext: {
      relationship: 'public',
      accessLevel: 'market_intelligence',
      propertyId: 42,
    },
  });
  renderPI();
  await userEvent.click(await screen.findByRole('button', { name: /City loft/i }));
  await userEvent.click(await screen.findByTestId('decision-job-LET_INVEST'));
}

describe('Property Intelligence results-first viewport (Step 7 P1)', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');
  let scrolledTestIds;

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoViewMock() {
      scrolledTestIds.push(this.getAttribute && this.getAttribute('data-testid'));
    };
    window.Element.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    scrolledTestIds = [];
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoViewMock() {
      scrolledTestIds.push(this.getAttribute && this.getAttribute('data-testid'));
    };
    window.Element.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    fetchRecentSubjectLookups.mockResolvedValue({ subjects: [] });
    fetchSubjectAnalysisHistory.mockResolvedValue({ history: [] });
    fetchPropertyAnalysisHistory.mockResolvedValue({ history: [] });
    getSubjectPropertyAttributes.mockResolvedValue({ success: true, attributes: {} });
  });

  test('results-start is the decision-first section, before Key economics wiring', () => {
    const start = piSrc.indexOf('data-testid="results-start"');
    const results = piSrc.lastIndexOf('data-testid="decision-first-results"');
    const report = piSrc.lastIndexOf('<IntelligenceReport');
    const whatIf = piSrc.lastIndexOf('<WhatIfPanel');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(results);
    expect(results).toBeLessThan(report);
    expect(report).toBeLessThan(whatIf);
    expect(piSrc).toMatch(/restoreResultsViewport/);
    expect(piSrc).toMatch(/shouldRestoreResultsViewport/);
    expect(piSrc).toMatch(/useLayoutEffect/);
  });

  test('newly completed LET result restores to results-start once', async () => {
    analysePropertyIntelligence.mockResolvedValue({ id: 9001, output: LET_OUTPUT });
    await openListing();
    expect(screen.queryByTestId('results-start')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('analyse-property-cta'));
    expect(await screen.findByTestId('results-start')).toBeInTheDocument();
    expect(screen.getByTestId('decision-first-results')).toBeInTheDocument();
    await waitFor(() => {
      expect(scrolledTestIds.filter((id) => id === 'results-start')).toHaveLength(1);
    });
    await userEvent.click(screen.getByTestId('toggle-revise-scenario'));
    expect(screen.getByTestId('revise-scenario-panel')).toBeInTheDocument();
    expect(scrolledTestIds.filter((id) => id === 'results-start')).toHaveLength(1);
  });

  test('saved LET result restores to results-start and changing property clears it', async () => {
    fetchPropertyAnalysisHistory.mockResolvedValue({
      history: [{ id: 77, createdAt: '2026-09-21T12:00:00.000Z', confidenceLevel: 'Low' }],
    });
    fetchPropertyAnalysisById.mockResolvedValue({
      analysis: {
        id: 77,
        output_data: LET_OUTPUT,
      },
    });
    await openListing();
    await userEvent.click(screen.getByRole('button', { name: /21\/09\/2026/ }));
    expect(await screen.findByTestId('results-start')).toBeInTheDocument();
    expect(screen.getByTestId('results-snapshot-banner')).toHaveTextContent(/saved snapshot/i);
    await waitFor(() => {
      expect(scrolledTestIds.filter((id) => id === 'results-start')).toHaveLength(1);
    });
    await userEvent.click(screen.getByTestId('change-property'));
    expect(screen.queryByTestId('results-start')).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-first-results')).not.toBeInTheDocument();
    expect(scrolledTestIds.filter((id) => id === 'results-start')).toHaveLength(1);
  });
});
