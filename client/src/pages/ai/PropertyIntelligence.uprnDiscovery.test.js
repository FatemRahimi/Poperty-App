import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent } from '@testing-library/react';

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
  fetchRecentSubjectLookups,
  getSubjectPropertyAttributes,
} from '../../services/aiService';
import PropertyIntelligence from './PropertyIntelligence';

const AREA = {
  success: true,
  postcode: 'SW2 3BD',
  title: 'SW2 3BD — Property Market Intelligence',
  dataSources: ['HM_Land_Registry'],
  snapshot: {
    typicalValue: { available: true, value: 450000, label: 'Typical sold price (area)' },
    typicalRent: { available: false },
    indicativeAreaYield: { available: false },
    confidence: { level: 'Medium', summary: 'Area evidence only' },
  },
};

const UNIT = {
  uprn: '100023351679',
  address: 'FLAT 1, 198, BARCOMBE AVENUE, LONDON, SW2 3BD',
  addressParts: { secondary: 'FLAT 1', primary: '198', street: 'BARCOMBE AVENUE', postcode: 'SW2 3BD' },
  kind: 'unit',
  classificationCodeDesc: 'Flat',
};

const SHELL = {
  uprn: '100023351677',
  address: '198, BARCOMBE AVENUE, LONDON, SW2 3BD',
  addressParts: { secondary: null, primary: '198', street: 'BARCOMBE AVENUE', postcode: 'SW2 3BD' },
  kind: 'shell',
  classificationCodeDesc: 'Parent Shell',
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

describe('Property Intelligence — /uprns discovery picker', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    searchIntelligenceProperties.mockResolvedValue({ properties: [] });
    fetchRecentSubjectLookups.mockResolvedValue({ subjects: [] });
    fetchSubjectAnalysisHistory.mockResolvedValue({ history: [] });
    getSubjectPropertyAttributes.mockResolvedValue({ success: true, attributes: {} });
  });

  test('postcode discovery shows real rows without making the postcode a subject', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      postcodeIntelligence: AREA,
      external: {
        available: true,
        matches: [UNIT, SHELL],
        namedUnitUnconfirmed: false,
        potentiallyTruncated: false,
      },
    });
    renderPI();
    await searchUk('SW2 3BD');
    expect(await screen.findByTestId('area-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('exact-property-picker')).toBeInTheDocument();
    expect(screen.getByTestId('epp-uk-100023351679')).toBeInTheDocument();
    expect(screen.getByTestId('epp-building-shell-group')).toHaveTextContent('Building / shell');
    expect(screen.queryByTestId('decision-job-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selected-property-confirmation')).not.toBeInTheDocument();
    expect(resolveIntelligenceSubject).not.toHaveBeenCalled();
    expect(screen.queryByText(/Flat B/i)).not.toBeInTheDocument();
  });

  test('explicit unit selection uses existing confirmation and unlocks job selector', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      postcodeIntelligence: AREA,
      external: { available: true, matches: [UNIT, SHELL] },
    });
    resolveIntelligenceSubject.mockResolvedValue({
      property: {
        address_display: UNIT.address,
        uprn: UNIT.uprn,
        source: 'external_lookup',
      },
      linkedListing: null,
      accessContext: {
        subjectId: 501,
        relationship: 'external_lookup',
        uprn: UNIT.uprn,
      },
      subject: { id: 501 },
    });
    renderPI();
    await searchUk('SW2 3BD');
    await userEvent.click(await screen.findByTestId(`epp-uk-${UNIT.uprn}`));
    expect(resolveIntelligenceSubject).toHaveBeenCalledWith({
      uprn: UNIT.uprn,
      address: UNIT.address,
      matchConfidence: UNIT.matchConfidence,
    });
    expect(await screen.findByTestId('decision-job-selector')).toBeInTheDocument();
    expect(screen.getByTestId('property-header-kicker')).toHaveTextContent('Selected property');
    expect(screen.getByTestId('property-facts-summary')).toBeInTheDocument();
  });

  test('named-unit shell warning is shown and shell is not auto-confirmed', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      postcodeIntelligence: AREA,
      external: {
        available: true,
        matches: [SHELL, UNIT],
        namedUnitUnconfirmed: true,
      },
    });
    renderPI();
    await searchUk('Flat E, 30 Fulham Park Gardens, SW6 4LH');
    expect(await screen.findByTestId('epp-named-unit-warning')).toBeInTheDocument();
    expect(resolveIntelligenceSubject).not.toHaveBeenCalled();
    expect(screen.queryByTestId('decision-job-selector')).not.toBeInTheDocument();
  });
});
