import React from 'react';
import { render, screen } from '@testing-library/react';
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

jest.mock('../../components/ai/AiWorkspaceLayout', () => ({ children }) => <div>{children}</div>);
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
  fetchPropertyPreview,
  fetchPropertyAnalysisHistory,
  fetchRecentSubjectLookups,
  fetchSubjectAnalysisHistory,
  getSubjectPropertyAttributes,
} from '../../services/aiService';
import PropertyIntelligence from './PropertyIntelligence';

const LISTING = {
  id: 42,
  title: 'City loft',
  address_display: 'Flat 2, 10 Marks Street, Birmingham B1 2UJ',
  city: 'Birmingham',
  property_type: 'Flat',
  price: 275000,
  source: 'marketplace',
};

const AREA = {
  success: true,
  postcode: 'SW2 3BD',
  title: 'SW2 3BD local market snapshot',
  dataSources: ['HM_Land_Registry'],
  confidence: { level: 'Medium' },
  snapshot: {
    typicalValue: { available: true, value: 450000, label: 'Typical sold price (area)' },
  },
  sales: { available: false },
  rental: { available: false },
  investment: { available: false },
};

function renderAt(search) {
  return render(
    <MemoryRouter initialEntries={[`/ai-services/property-intelligence${search}`]}>
      <PropertyIntelligence />
    </MemoryRouter>
  );
}

describe('Property Intelligence goal entry', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    searchIntelligenceProperties.mockResolvedValue({ properties: [LISTING] });
    fetchRecentSubjectLookups.mockResolvedValue({ subjects: [] });
    fetchSubjectAnalysisHistory.mockResolvedValue({ history: [] });
    fetchPropertyAnalysisHistory.mockResolvedValue({ history: [] });
    getSubjectPropertyAttributes.mockResolvedValue({ success: true, attributes: {} });
    fetchPropertyPreview.mockResolvedValue({
      property: {
        id: 42,
        address_display: LISTING.address_display,
        property_type: 'Flat',
        price: 275000,
        source: 'marketplace',
      },
      accessContext: { relationship: 'public', accessLevel: 'market_intelligence', propertyId: 42 },
    });
  });

  test.each([
    ['BUY', 'Buy'],
    ['LET_INVEST', 'Let / Invest'],
    ['SELL', 'Sell'],
  ])('carries %s into the existing property workflow', async (job) => {
    renderAt(`?decisionJob=${job}`);
    await userEvent.click(await screen.findByRole('button', { name: /^Browse listings/ }));
    await userEvent.click(await screen.findByRole('button', { name: /City loft/i }));
    expect(await screen.findByTestId(`decision-job-${job}`)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('analyse-property-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-job-required-hint')).not.toBeInTheDocument();
  });

  test('an unsupported goal is ignored', async () => {
    renderAt('?decisionJob=DEVELOPMENT');
    await userEvent.click(await screen.findByRole('button', { name: /^Browse listings/ }));
    await userEvent.click(await screen.findByRole('button', { name: /City loft/i }));
    expect(await screen.findByTestId('decision-job-selector')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-BUY')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('decision-job-LET_INVEST')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('decision-job-SELL')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/commercial/i)).not.toBeInTheDocument();
  });

  test('exact property matches stay ahead of collapsed area context', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      external: {
        available: true,
        matches: [{
          uprn: '100023336789',
          address: '12 Acacia Avenue, London SW2 3BD',
          matchConfidence: 'high',
        }],
      },
      postcodeIntelligence: AREA,
    });
    resolveIntelligenceSubject.mockResolvedValue({
      property: {
        address_display: '12 Acacia Avenue, London SW2 3BD',
        uprn: '100023336789',
        source: 'external_lookup',
      },
      accessContext: { subjectId: 501, relationship: 'external_lookup', uprn: '100023336789' },
      subject: { id: 501 },
    });
    renderAt('?decisionJob=LET_INVEST&uk=SW2%203BD');
    expect(screen.getByRole('textbox', { name: 'UK address or postcode' })).toHaveValue('SW2 3BD');
    await userEvent.click(screen.getByRole('button', { name: /^Search$/i }));
    const picker = await screen.findByTestId('exact-property-picker');
    const fold = screen.getByTestId('area-context-fold');
    expect(fold.open).toBe(false);
    expect(picker.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('area-context-panel')).toHaveTextContent('not a specific property');
    await userEvent.click(screen.getByTestId('epp-uk-100023336789'));
    expect(await screen.findByTestId('decision-job-LET_INVEST')).toHaveAttribute('aria-checked', 'true');
  });
});
