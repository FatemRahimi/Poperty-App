import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

jest.mock('../../services/aiCreditState', () => ({
  displayAiCredits: () => '3',
  subscribeAiCredits: (listener) => {
    listener({ plan: { name: 'Free' }, subscription: { plan: 'free' } });
    return () => {};
  },
  refreshAiCredits: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

jest.mock('../../components/ai/AiWorkspaceLayout', () => ({ children, title, subtitle }) => (
  <div>
    <h1>{title}</h1>
    {subtitle ? <p>{subtitle}</p> : null}
    {children}
  </div>
));

jest.mock('../../services/aiService', () => ({
  fetchDashboard: jest.fn(),
  fetchIntelligenceOverview: jest.fn(),
}));

import { fetchDashboard } from '../../services/aiService';
import AiHub from './AiHub';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderHub() {
  return render(
    <MemoryRouter initialEntries={['/ai-services']}>
      <Routes>
        <Route path="/ai-services" element={<AiHub />} />
        <Route path="/ai-services/property-intelligence" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('goal-based AI services entry', () => {
  const appSrc = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
  const navSrc = fs.readFileSync(path.join(__dirname, '../../config/aiNavigation.js'), 'utf8');

  beforeEach(() => {
    jest.clearAllMocks();
    fetchDashboard.mockResolvedValue({
      plan: { name: 'Free' },
      recentUkLookups: [
        { id: 9, address: '14 Example Street, London SW2 3BD', lastAccessedAt: '2026-10-01T12:00:00.000Z' },
      ],
      recent: [
        {
          id: 41,
          request_type: 'property_intelligence',
          title: '12 Acacia Avenue',
          created_at: '2026-10-02T12:00:00.000Z',
          input_data: { decisionJob: 'LET_INVEST' },
        },
        {
          id: 42,
          request_type: 'listing_writer',
          title: 'Marketing draft',
          created_at: '2026-10-03T12:00:00.000Z',
        },
        {
          id: 43,
          request_type: 'property_intelligence',
          title: 'Saved case without a goal',
          created_at: '2026-10-04T12:00:00.000Z',
          input_data: {},
        },
      ],
    });
  });

  test('the first screen asks for a property, not an AI tool', async () => {
    renderHub();
    expect(screen.getByRole('heading', { name: 'Find a property' })).toBeInTheDocument();
    expect(screen.getByText('What property would you like to investigate?')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Enter address or postcode' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /intelligence suite/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /quick tools/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Investment Analyst/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rent Intelligence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Valuation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/commercial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/development/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Credits:/)).not.toBeInTheDocument();
    expect(await screen.findByTestId('recent-properties')).toBeInTheDocument();
  });

  test('search and recent properties stay in plain language', async () => {
    renderHub();
    const recent = await screen.findByTestId('recent-properties');
    expect(recent).toHaveTextContent('14 Example Street, London SW2 3BD');
    expect(recent).toHaveTextContent('12 Acacia Avenue');
    expect(recent).toHaveTextContent('Buy an investment property');
    expect(recent).toHaveTextContent('Saved case without a goal');
    expect(recent).not.toHaveTextContent('request_type');
    expect(recent).not.toHaveTextContent('listing_writer');
    expect(recent).not.toHaveTextContent('Marketing draft');
    expect(screen.getAllByRole('link', { name: /Continue/i }).length).toBeGreaterThan(0);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Enter address or postcode' }),
      'SW2 3BD'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/ai-services/property-intelligence?uk=SW2+3BD'
      );
    });
  });

  test('helper routes stay reachable and primary navigation is goal-based', () => {
    expect(appSrc).toMatch(/path="\/ai-services\/property-intelligence"/);
    expect(appSrc).toMatch(/path="\/ai-services\/investment-analyst"/);
    expect(appSrc).toMatch(/path="\/ai-services\/rent-intelligence"/);
    expect(appSrc).toMatch(/path="\/ai-services\/valuation"/);
    expect(appSrc).toMatch(/path="\/ai-services\/listing-writer"/);
    expect(appSrc).toMatch(/path="\/ai-services\/buyer-match"/);
    expect(navSrc.indexOf("group: 'Start'")).toBeLessThan(navSrc.indexOf("group: 'More tools'"));
    expect(navSrc).toMatch(/label: 'Home'/);
    expect(navSrc).toMatch(/label: 'Property cases'/);
    expect(navSrc).toMatch(/label: 'Account'/);
    expect(navSrc).toMatch(/disclosure: true/);
    expect(navSrc).toMatch(/label: 'Portfolio'/);
    expect(navSrc).toMatch(/label: 'Investment Analyst'/);
    expect(navSrc).not.toMatch(/group: 'Advanced tools'/);
    expect(navSrc).not.toMatch(/group: 'Analyse'/);
    expect(navSrc).not.toMatch(/group: 'Marketing tools'/);
  });
});
