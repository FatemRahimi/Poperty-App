import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import AiWorkspaceLayout from './AiWorkspaceLayout';
import {
  applyServerCreditState,
  configureAiCreditFetcher,
  resetAiCreditStateForTests,
} from '../../services/aiCreditState';

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

describe('AI chrome credit display', () => {
  beforeEach(() => {
    resetAiCreditStateForTests();
    configureAiCreditFetcher(async () => ({
      subscription: { credits_remaining: 4 },
      plan: { id: 'free', unlimited: false },
    }));
  });

  test('header reflects refreshed server credits without navigation', async () => {
    render(
      <MemoryRouter initialEntries={['/ai-services/property-intelligence']}>
        <AiWorkspaceLayout title="Property Intelligence">
          <div>report</div>
        </AiWorkspaceLayout>
      </MemoryRouter>
    );

    expect(await screen.findByText('Credits: 4')).toBeInTheDocument();

    act(() => {
      applyServerCreditState({
        subscription: { credits_remaining: 3 },
        plan: { id: 'free', unlimited: false },
      });
    });
    expect(screen.getByText('Credits: 3')).toBeInTheDocument();
    expect(screen.queryByText('Credits: 4')).not.toBeInTheDocument();
    expect(screen.getByText('report')).toBeInTheDocument();
  });

  test('unlimited plan label is preserved', async () => {
    configureAiCreditFetcher(async () => ({
      subscription: { credits_remaining: -1, plan: 'professional' },
      plan: { id: 'professional', unlimited: true },
    }));
    render(
      <MemoryRouter>
        <AiWorkspaceLayout>
          <div />
        </AiWorkspaceLayout>
      </MemoryRouter>
    );
    expect(await screen.findByText('Credits: Unlimited')).toBeInTheDocument();
  });
});
