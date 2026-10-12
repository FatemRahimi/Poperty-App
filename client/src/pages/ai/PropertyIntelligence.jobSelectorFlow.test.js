import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

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

jest.mock('../../components/ai/AiWorkspaceLayout', () => ({ children, title, subtitle }) => (
  <div data-testid="layout">
    <h1>{title}</h1>
    {subtitle ? <p>{subtitle}</p> : null}
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
  analysePropertyIntelligence,
  getSubjectPropertyAttributes,
} from '../../services/aiService';
import PropertyIntelligence from './PropertyIntelligence';

const AREA_INTELLIGENCE = {
  success: true,
  postcode: 'SW2 3BD',
  title: 'SW2 3BD — Property Market Intelligence',
  dataSources: ['HM_Land_Registry'],
  confidence: { level: 'Medium', summary: 'Area evidence only' },
  snapshot: {
    typicalValue: {
      available: true,
      value: 450000,
      label: 'Typical sold price (area)',
      source: 'HM_Land_Registry',
    },
    typicalRent: { available: true, value: 1800, label: 'Median asking rent (marketplace)' },
    indicativeAreaYield: { available: true, grossYieldPercent: 4.8, label: 'Indicative area yield' },
    confidence: { level: 'Medium', summary: 'Area evidence only' },
  },
  sales: { available: false },
  rental: { available: false },
  investment: { available: false },
};

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

const OTHER_NON_LISTING_MATCH = {
  uprn: '200045556789',
  address: '8 Maple Close, London SW2 3BD',
  classificationCodeDesc: 'Terraced',
  matchConfidence: 'high',
};

function renderPI() {
  return render(
    <MemoryRouter>
      <PropertyIntelligence />
    </MemoryRouter>
  );
}

async function searchUk(query) {
  const input = screen.getByRole('textbox', { name: 'UK address or postcode' });
  fireEvent.change(input, { target: { value: query } });
  await userEvent.click(screen.getByRole('button', { name: /^Search$/i }));
}

describe('Property Intelligence — job selector flow (subject-native)', () => {
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

  test('postcode alone does not render property job selector or unlock Analyse', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: { available: true, matches: [] },
      postcodeIntelligence: AREA_INTELLIGENCE,
    });
    renderPI();
    await searchUk('SW2 3BD');
    expect(await screen.findByTestId('area-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('area-typical-sold-price')).toHaveTextContent('Typical local sold price');
    expect(screen.getByTestId('area-typical-sold-price')).toHaveTextContent('£450,000');
    expect(screen.queryByTestId('decision-job-selector')).not.toBeInTheDocument();
    expect(screen.queryByText('What are you assessing?')).not.toBeInTheDocument();
    expect(screen.queryByTestId('analyse-property-cta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selected-property-confirmation')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-context-lead')).toHaveTextContent(
      'Local market snapshot — not a specific property.'
    );
  });

  test('postcode matches still require explicit exact-property selection before jobs', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: { available: true, matches: [NON_LISTING_MATCH] },
      postcodeIntelligence: AREA_INTELLIGENCE,
    });
    renderPI();
    await searchUk('SW2 3BD');
    expect(await screen.findByTestId('exact-property-picker')).toBeInTheDocument();
    expect(screen.getByTestId('area-context-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-job-selector')).not.toBeInTheDocument();
    expect(resolveIntelligenceSubject).not.toHaveBeenCalled();
  });

  test('exact platform subject renders selector without requiring listingId, approved listing, or ownership', async () => {
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
      },
      accessContext: {
        relationship: 'public',
        accessLevel: 'market_intelligence',
        propertyId: 42,
      },
    });
    renderPI();
    const listingBtn = await screen.findByRole('button', { name: /City loft/i });
    await userEvent.click(listingBtn);
    expect(await screen.findByTestId('decision-job-selector')).toBeInTheDocument();
    expect(screen.getByTestId('property-header-kicker')).toHaveTextContent('Selected property');
    expect(screen.getByTestId('property-facts-summary')).toHaveTextContent(/What we know about this property/i);
    expect(screen.getByTestId('decision-job-BUY')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-LET_INVEST')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-SELL')).toBeInTheDocument();
    expect(screen.queryByTestId('analyse-property-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-job-required-hint')).toHaveTextContent(
      'Choose what you are assessing.'
    );
    expect(fetchPropertyPreview).toHaveBeenCalledWith(42);
    expect(screen.queryByText(/approved listing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Owner$/i)).not.toBeInTheDocument();
  });

  test('exact non-listing resolved subject renders selector and does not require a platform listing', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: { available: true, matches: [NON_LISTING_MATCH] },
      postcodeIntelligence: AREA_INTELLIGENCE,
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
    await searchUk('12 Acacia Avenue, London SW2 3BD');
    await userEvent.click(await screen.findByTestId(`epp-uk-${NON_LISTING_MATCH.uprn}`));
    expect(await screen.findByTestId('decision-job-selector')).toBeInTheDocument();
    expect(screen.getByTestId('property-header-kicker')).toHaveTextContent('Selected property');
    expect(screen.getByTestId('property-header-address')).toHaveTextContent('12 Acacia Avenue');
    expect(screen.getByTestId('property-facts-summary')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-BUY')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-LET_INVEST')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-SELL')).toBeInTheDocument();
    expect(screen.queryByText(/View listing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Also on our platform/i)).not.toBeInTheDocument();
    expect(resolveIntelligenceSubject).toHaveBeenCalledWith({
      uprn: NON_LISTING_MATCH.uprn,
      address: NON_LISTING_MATCH.address,
      matchConfidence: NON_LISTING_MATCH.matchConfidence,
    });
    expect(analysePropertyIntelligence).not.toHaveBeenCalled();
    expect(searchIntelligenceProperties.mock.calls.every((call) => call[0] !== 'create')).toBe(true);
  });

  test('LET / Invest selection activates the existing LET path on a non-listing subject', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: { available: true, matches: [NON_LISTING_MATCH] },
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
    await searchUk('12 Acacia Avenue, London SW2 3BD');
    await userEvent.click(await screen.findByTestId(`epp-uk-${NON_LISTING_MATCH.uprn}`));
    const letInvest = await screen.findByTestId('decision-job-LET_INVEST');
    await userEvent.click(letInvest);
    expect(letInvest).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('decision-job-BUY')).toHaveAttribute('aria-checked', 'false');
    expect(await screen.findByTestId('finance-scenario-form')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-readiness')).toBeInTheDocument();
    expect(screen.getByTestId('analyse-property-cta')).toBeEnabled();
    expect(screen.queryByTestId('decision-job-required-hint')).not.toBeInTheDocument();
  });

  test('Change property clears job so the next subject does not inherit LET / Invest', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: { available: true, matches: [NON_LISTING_MATCH, OTHER_NON_LISTING_MATCH] },
    });
    resolveIntelligenceSubject
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        property: {
          address_display: OTHER_NON_LISTING_MATCH.address,
          property_type: 'house',
          uprn: OTHER_NON_LISTING_MATCH.uprn,
          source: 'external_lookup',
        },
        linkedListing: null,
        accessContext: {
          subjectId: 777,
          relationship: 'external_lookup',
          accessLevel: 'market_intelligence',
          uprn: OTHER_NON_LISTING_MATCH.uprn,
          linkedPropertyId: null,
          propertyId: null,
        },
        subject: { id: 777 },
      });
    renderPI();
    await searchUk('SW2 3BD');
    await userEvent.click(await screen.findByTestId(`epp-uk-${NON_LISTING_MATCH.uprn}`));
    await userEvent.click(await screen.findByTestId('decision-job-LET_INVEST'));
    expect(screen.getByTestId('decision-job-LET_INVEST')).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByTestId('change-property'));
    expect(screen.queryByTestId('decision-job-selector')).not.toBeInTheDocument();
    await searchUk('SW2 3BD');
    await userEvent.click(await screen.findByTestId(`epp-uk-${OTHER_NON_LISTING_MATCH.uprn}`));
    const selector = await screen.findByTestId('decision-job-selector');
    expect(within(selector).getByTestId('decision-job-LET_INVEST')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(within(selector).getByTestId('decision-job-BUY')).toHaveAttribute('aria-checked', 'false');
    expect(within(selector).getByTestId('decision-job-SELL')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('finance-scenario-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-job-required-hint')).toBeInTheDocument();
  });

  test('does not create a fake listing or fake property facts for a non-listing subject', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: { available: true, matches: [NON_LISTING_MATCH] },
    });
    resolveIntelligenceSubject.mockResolvedValue({
      property: {
        ...NON_LISTING_PREVIEW,
        bedrooms: null,
        bathrooms: null,
        price: null,
        monthly_rent: null,
      },
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
    await searchUk('12 Acacia Avenue, London SW2 3BD');
    await userEvent.click(await screen.findByTestId(`epp-uk-${NON_LISTING_MATCH.uprn}`));
    await screen.findByTestId('decision-job-selector');
    expect(resolveIntelligenceSubject).toHaveBeenCalledTimes(1);
    expect(analysePropertyIntelligence).not.toHaveBeenCalled();
    expect(screen.queryByTestId('property-fact-value-bedrooms')).toHaveTextContent('Unknown');
    expect(screen.queryByText(/Also on our platform/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getSubjectPropertyAttributes).toHaveBeenCalledWith(501);
    });
  });
});
