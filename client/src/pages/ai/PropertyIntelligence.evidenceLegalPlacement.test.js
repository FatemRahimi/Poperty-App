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
  uploadLegalEvidence: jest.fn(),
  archiveLegalEvidence: jest.fn(),
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
  fetchLegalEvidence,
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

async function searchUk(query) {
  const input = screen.getByRole('textbox', { name: 'UK address or postcode' });
  fireEvent.change(input, { target: { value: query } });
  await userEvent.click(screen.getByRole('button', { name: /^Search$/i }));
}

describe('Property Intelligence evidence / legal placement (Step 6)', () => {
  const piSrc = fs.readFileSync(path.join(__dirname, 'PropertyIntelligence.js'), 'utf8');
  const letPanelSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/LetInvestResultsPanel.js'),
    'utf8'
  );
  const reportSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/IntelligenceReport.js'),
    'utf8'
  );
  const step4Src = fs.readFileSync(
    path.join(__dirname, '../../Utils/letWorkspaceDisplay.js'),
    'utf8'
  );
  const jobSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/DecisionJobSelector.js'),
    'utf8'
  );
  const legalPanelSrc = fs.readFileSync(
    path.join(__dirname, '../../components/ai/LegalTitleEvidencePanel.js'),
    'utf8'
  );

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
    fetchLegalEvidence.mockResolvedValue({ documents: [] });
  });

  test('compact legal control is wired before Analyse and remains eligibility-gated', () => {
    const facts = piSrc.indexOf('<PropertyFactsSummary');
    const job = piSrc.indexOf('<DecisionJobSelector');
    const legal = piSrc.indexOf('<LegalTitleEvidencePanel');
    const analyse = piSrc.indexOf('data-testid="analyse-property-cta"');
    expect(facts).toBeGreaterThan(-1);
    expect(job).toBeGreaterThan(facts);
    expect(legal).toBeGreaterThan(job);
    expect(analyse).toBeGreaterThan(legal);
    expect(piSrc).toMatch(/isProfessional \|\| isExternal/);
    expect(legalPanelSrc).toMatch(/Optional legal \/ title evidence/);
    expect(legalPanelSrc).toMatch(/LEGAL_EVIDENCE_UNAVAILABLE_COPY/);
  });

  test('eligible external subject gets compact optional legal control before Analyse', async () => {
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
    await userEvent.click(await screen.findByTestId('decision-job-LET_INVEST'));
    const legal = await screen.findByTestId('optional-legal-evidence');
    const analyse = screen.getByTestId('analyse-property-cta');
    expect(legal).toHaveTextContent('Optional legal / title evidence');
    expect(legal.open).toBe(false);
    expect(legal.compareDocumentPosition(analyse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(analyse).toBeEnabled();
  });

  test('eligible professional subject gets the compact legal control', async () => {
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
        source: 'marketplace',
      },
      accessContext: {
        relationship: 'owner',
        accessLevel: 'professional_intelligence',
        propertyId: 42,
      },
    });
    renderPI();
    await userEvent.click(await screen.findByRole('button', { name: /City loft/i }));
    expect(await screen.findByTestId('optional-legal-evidence')).toBeInTheDocument();
  });

  test('ineligible marketplace subject does not gain the private legal control', async () => {
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
    expect(await screen.findByTestId('decision-job-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('optional-legal-evidence')).not.toBeInTheDocument();
    expect(fetchLegalEvidence).not.toHaveBeenCalled();
  });

  test('Step 5 hierarchy, Step 4 LET workspace, and Step 3 selector remain unchanged', () => {
    expect(reportSrc).toMatch(/LetInvestPropertyCase/);
    expect(reportSrc).toMatch(/title="Legal \/ title evidence"/);
    expect(reportSrc).toMatch(/legalTitleProvenanceLabel/);
    expect(letPanelSrc).toMatch(/legalTitleDomain: report\?\.legalTitleDomain/);
    expect(step4Src).toMatch(/export function subjectHasListingEvidence/);
    expect(jobSrc).toMatch(/LET_INVEST/);
    expect(piSrc).toMatch(/DecisionJobSelector/);
    expect(piSrc).toMatch(/buildLetAnalysisReadiness/);
  });
});
