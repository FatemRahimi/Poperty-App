import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
  lookupIntelligenceProperties,
  resolveIntelligenceSubject,
  fetchSubjectAnalysisHistory,
  fetchPropertyPreview,
  fetchPropertyAnalysisHistory,
  fetchRecentSubjectLookups,
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
  source: 'marketplace',
};

const NON_LISTING_MATCH = {
  uprn: '100023336789',
  address: '12 Acacia Avenue, London SW2 3BD',
  classificationCodeDesc: 'Terraced',
  matchConfidence: 'high',
};

const NON_LISTING_PREVIEW = {
  address_display: '12 Acacia Avenue, London SW2 3BD',
  property_type: 'house',
  uprn: '100023336789',
  source: 'external_lookup',
};

function renderPI() {
  return render(
    <MemoryRouter>
      <PropertyIntelligence />
    </MemoryRouter>
  );
}

describe('Property Intelligence — LET progressive workspace (Step 4)', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    searchIntelligenceProperties.mockResolvedValue({ properties: [] });
    fetchRecentSubjectLookups.mockResolvedValue({ subjects: [] });
    fetchSubjectAnalysisHistory.mockResolvedValue({ history: [] });
    fetchPropertyAnalysisHistory.mockResolvedValue({ history: [] });
    getSubjectPropertyAttributes.mockResolvedValue({ success: true, attributes: {} });
  });

  test('What-if remains post-analysis; legal remains before Analyse', () => {
    const reportGate = piSrc.indexOf('report && !loading && !report.insufficientData');
    const whatIf = piSrc.indexOf('<WhatIfPanel', reportGate);
    expect(reportGate).toBeGreaterThan(-1);
    expect(whatIf).toBeGreaterThan(reportGate);
    const analyse = piSrc.indexOf('data-testid="analyse-property-cta"');
    const legal = piSrc.indexOf('<LegalTitleEvidencePanel');
    expect(legal).toBeGreaterThan(-1);
    expect(legal).toBeLessThan(analyse);
  });

  test('platform listing LET workspace starts on Deal & rent and keeps Analyse available', async () => {
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
    expect(await screen.findByTestId('let-stage-tab-property_rent')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/listing asking price/i)).toBeInTheDocument();
    expect(screen.getByText(/not a valuation or fair value/i)).toBeInTheDocument();
    expect(screen.getByTestId('analysis-readiness')).toBeInTheDocument();
    expect(screen.getByTestId('readiness-grossYield')).toHaveTextContent(/Inputs ready/i);
    expect(screen.getByTestId('readiness-noi')).toHaveTextContent(/Needs input/i);
    expect(screen.getByTestId('analyse-property-cta')).not.toBeDisabled();
    expect(screen.getByTestId('let-analyse-consequence')).toHaveTextContent(/gross yield/i);
    expect(screen.getByTestId('finance-section-operating')).toHaveAttribute('hidden');
  });

  test('non-listing LET workspace does not require a listing or invent listing-missing errors', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: { available: true, matches: [NON_LISTING_MATCH] },
      postcodeIntelligence: { success: true, postcode: 'SW2 3BD' },
    });
    resolveIntelligenceSubject.mockResolvedValue({
      property: NON_LISTING_PREVIEW,
      linkedListing: null,
      accessContext: {
        subjectId: 501,
        relationship: 'external_lookup',
        accessLevel: 'market_intelligence',
        uprn: NON_LISTING_MATCH.uprn,
        linkedPropertyId: null,
        propertyId: null,
      },
      subject: { id: 501 },
    });
    renderPI();
    const input = screen.getByRole('textbox', { name: 'UK address or postcode' });
    fireEvent.change(input, { target: { value: '12 Acacia Avenue, London SW2 3BD' } });
    await userEvent.click(screen.getByRole('button', { name: /^Search$/i }));
    await userEvent.click(await screen.findByTestId(`epp-uk-${NON_LISTING_MATCH.uprn}`));
    await userEvent.click(await screen.findByTestId('decision-job-LET_INVEST'));
    expect(screen.getByLabelText(/your purchase price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your expected monthly rent/i)).toBeInTheDocument();
    expect(screen.queryByText(/listing asking price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View listing/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('analyse-property-cta')).not.toBeDisabled();
  });
});
