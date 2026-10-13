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
  <div>
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
  postcode: 'B1 2AB',
  title: 'B1 2AB — Property Market Intelligence',
  dataSources: ['HM_Land_Registry'],
  snapshot: {
    typicalValue: { available: true, value: 250000, label: 'Typical sold price (area)' },
    typicalRent: { available: false },
    indicativeAreaYield: { available: false },
    confidence: { level: 'Medium', summary: 'Area evidence only' },
  },
};

const FLAT_1 = {
  uprn: '100000000001',
  address: 'FLAT 1, 51, EXAMPLE ROAD, BIRMINGHAM, B1 2AB',
  addressParts: { secondary: 'FLAT 1', primary: '51', street: 'EXAMPLE ROAD', postcode: 'B1 2AB' },
  kind: 'unit',
  matchConfidence: 'high',
};

const FLAT_2 = {
  uprn: '100000000002',
  address: 'FLAT 2, 51, EXAMPLE ROAD, BIRMINGHAM, B1 2AB',
  addressParts: { secondary: 'FLAT 2', primary: '51', street: 'EXAMPLE ROAD', postcode: 'B1 2AB' },
  kind: 'unit',
  matchConfidence: 'high',
};

const SHELL = {
  uprn: '100000000099',
  address: '51, EXAMPLE ROAD, BIRMINGHAM, B1 2AB',
  addressParts: { secondary: null, primary: '51', street: 'EXAMPLE ROAD', postcode: 'B1 2AB' },
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

describe('Exact property and unit discovery', () => {
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

  test('a postcode with several returned addresses stays a choice, not a property', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      postcodeIntelligence: AREA,
      external: { available: true, matches: [FLAT_1, FLAT_2, SHELL] },
    });
    renderPI();
    await searchUk('B1 2AB');
    expect(await screen.findByRole('heading', { name: /Select the exact property/i })).toBeInTheDocument();
    expect(screen.getByTestId('epp-uk-100000000001')).toHaveTextContent('FLAT 1');
    expect(screen.getByTestId('epp-uk-100000000002')).toHaveTextContent('FLAT 2');
    expect(screen.getByTestId('epp-uk-100000000001')).not.toHaveTextContent('FLAT 2');
    expect(screen.getByTestId('epp-building-shell-group')).toHaveTextContent('51, EXAMPLE ROAD');
    expect(resolveIntelligenceSubject).not.toHaveBeenCalled();
    expect(screen.queryByTestId('decision-job-selector')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Browse listings' })).not.toBeInTheDocument();
    const fold = screen.getByTestId('area-context-fold');
    expect(fold.open).toBe(false);
    expect(screen.getByTestId('exact-property-picker').compareDocumentPosition(fold)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('selecting one flat confirms that subject and does not bind the other flat', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      postcodeIntelligence: AREA,
      external: { available: true, matches: [FLAT_1, FLAT_2] },
    });
    resolveIntelligenceSubject.mockResolvedValue({
      property: {
        address_display: FLAT_2.address,
        uprn: FLAT_2.uprn,
        source: 'external_lookup',
      },
      linkedListing: null,
      accessContext: {
        subjectId: 22,
        relationship: 'external_lookup',
        uprn: FLAT_2.uprn,
      },
      subject: { id: 22 },
    });
    renderPI();
    await searchUk('51 Example Road');
    await userEvent.click(await screen.findByTestId('epp-uk-100000000002'));
    expect(resolveIntelligenceSubject).toHaveBeenCalledTimes(1);
    expect(resolveIntelligenceSubject).toHaveBeenCalledWith({
      uprn: FLAT_2.uprn,
      address: FLAT_2.address,
      matchConfidence: 'high',
    });
    expect(await screen.findByTestId('property-header-address')).toHaveTextContent(FLAT_2.address);
    expect(screen.getByTestId('property-confirm-boundary')).toHaveTextContent(
      "This is the property we'll investigate."
    );
    expect(screen.getByTestId('property-header-meta')).not.toHaveTextContent(FLAT_2.uprn);
    const identity = screen.getByTestId('exact-identity-details');
    expect(identity.open).toBe(false);
    expect(identity).toHaveTextContent(`Reference ${FLAT_2.uprn}`);
    expect(identity).not.toHaveTextContent(FLAT_1.uprn);
    expect(screen.getByTestId('decision-job-BUY')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-LET_INVEST')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-SELL')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What are you considering?' })).toBeInTheDocument();
  });

  test('a named flat that was not confirmed does not become the building', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [],
      postcodeIntelligence: AREA,
      external: {
        available: true,
        matches: [SHELL, FLAT_1],
        namedUnitUnconfirmed: true,
      },
    });
    renderPI();
    await searchUk('Flat 7, 51 Example Road, B1 2AB');
    expect(await screen.findByTestId('epp-named-unit-warning')).toHaveTextContent(
      /couldn't confirm that exact flat/i
    );
    expect(resolveIntelligenceSubject).not.toHaveBeenCalled();
    expect(screen.queryByTestId('selected-property-confirmation')).not.toBeInTheDocument();
    expect(screen.queryByText('Flat 7')).not.toBeInTheDocument();
  });

  test('a missing UPRN is not invented on the confirmation screen', async () => {
    lookupIntelligenceProperties.mockResolvedValue({
      success: true,
      internal: [{
        id: 88,
        address_display: '88 Other Street, Birmingham B1 2AB',
        matchMethod: 'postcode',
        source: 'marketplace',
      }],
      postcodeIntelligence: AREA,
      external: { available: true, matches: [FLAT_1] },
    });
    resolveIntelligenceSubject.mockResolvedValue({
      property: {
        address_display: FLAT_1.address,
        source: 'external_lookup',
      },
      linkedListing: null,
      accessContext: { subjectId: 31, relationship: 'external_lookup' },
      subject: { id: 31 },
    });
    renderPI();
    await searchUk('B1 2AB');
    expect(await screen.findByTestId('epp-platform-88')).toHaveTextContent(
      /Same postcode listing · not an exact address match/
    );
    await userEvent.click(screen.getByTestId('epp-uk-100000000001'));
    expect(await screen.findByTestId('property-confirm-boundary')).toBeInTheDocument();
    expect(screen.queryByTestId('exact-identity-details')).not.toBeInTheDocument();
    expect(screen.getByTestId('property-header-meta')).not.toHaveTextContent(/Reference|UPRN|100000000001/);
  });
});
