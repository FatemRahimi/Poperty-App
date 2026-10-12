jest.mock('../../services/aiService', () => ({
  fetchLegalEvidence: jest.fn(),
  uploadLegalEvidence: jest.fn(),
  archiveLegalEvidence: jest.fn(),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LegalTitleEvidencePanel from './LegalTitleEvidencePanel';
import {
  archiveLegalEvidence,
  fetchLegalEvidence,
  uploadLegalEvidence,
} from '../../services/aiService';
import {
  LEGAL_EVIDENCE_EMPTY_COPY,
  LEGAL_EVIDENCE_LOADING_COPY,
  LEGAL_EVIDENCE_UNAVAILABLE_COPY,
} from '../../Utils/legalEvidenceDisplay';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const DOC_A = {
  documentId: 'doc-a',
  documentType: 'TITLE_REGISTER',
  verificationState: 'UNVERIFIED',
  uploadedAt: '2026-08-30T00:00:00.000Z',
};

const DOC_B = {
  documentId: 'doc-b',
  documentType: 'LEASE',
  verificationState: 'USER_DECLARED',
};

describe('LegalTitleEvidencePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('is compact, optional, and closed by default', async () => {
    fetchLegalEvidence.mockResolvedValue({ documents: [] });
    render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    const control = screen.getByTestId('optional-legal-evidence');
    expect(control).toHaveTextContent('Optional legal / title evidence');
    expect(control.open).toBe(false);
    expect(await screen.findByTestId('legal-title-evidence-panel')).toBeInTheDocument();
    expect(control.querySelector('summary')).toBeTruthy();
  });

  test('LOADING does not display the empty copy', async () => {
    const pending = deferred();
    fetchLegalEvidence.mockReturnValue(pending.promise);
    render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    expect(screen.getByTestId('legal-evidence-status')).toHaveTextContent(LEGAL_EVIDENCE_LOADING_COPY);
    expect(screen.queryByText(LEGAL_EVIDENCE_EMPTY_COPY)).not.toBeInTheDocument();
    pending.resolve({ documents: [] });
    expect(await screen.findByText(LEGAL_EVIDENCE_EMPTY_COPY)).toBeInTheDocument();
  });

  test('successful zero documents is EMPTY', async () => {
    fetchLegalEvidence.mockResolvedValue({ documents: [] });
    render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    expect(await screen.findByText(LEGAL_EVIDENCE_EMPTY_COPY)).toBeInTheDocument();
    expect(screen.queryByText(LEGAL_EVIDENCE_UNAVAILABLE_COPY)).not.toBeInTheDocument();
    expect(screen.queryByTestId('legal-evidence-list')).not.toBeInTheDocument();
  });

  test('failed fetch is UNAVAILABLE and does not show empty copy', async () => {
    fetchLegalEvidence.mockRejectedValue(new Error('network'));
    render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    expect(await screen.findByText(LEGAL_EVIDENCE_UNAVAILABLE_COPY)).toBeInTheDocument();
    expect(screen.queryByText(LEGAL_EVIDENCE_EMPTY_COPY)).not.toBeInTheDocument();
    expect(screen.getByTestId('legal-evidence-compact-status')).toHaveTextContent('Could not be loaded');
  });

  test('retry calls the existing fetch again', async () => {
    fetchLegalEvidence
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ documents: [] });
    render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    expect(await screen.findByTestId('legal-evidence-retry')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('legal-evidence-retry'));
    expect(await screen.findByText(LEGAL_EVIDENCE_EMPTY_COPY)).toBeInTheDocument();
    expect(fetchLegalEvidence).toHaveBeenCalledTimes(2);
  });

  test('successful documents are AVAILABLE, user supplied, unverified, and not assessed', async () => {
    fetchLegalEvidence.mockResolvedValue({ documents: [DOC_A] });
    render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    const list = await screen.findByTestId('legal-evidence-list');
    expect(list).toHaveTextContent('TITLE_REGISTER');
    expect(list).toHaveTextContent('User supplied');
    expect(list).toHaveTextContent('Unverified');
    expect(list).toHaveTextContent('Not assessed');
    expect(list).not.toHaveTextContent(/verified authenticity|clean title|solicitor/i);
    expect(screen.getByTestId('legal-evidence-compact-status')).toHaveTextContent(
      '1 document supplied · Unverified · Not assessed'
    );
    expect(screen.queryByText(LEGAL_EVIDENCE_EMPTY_COPY)).not.toBeInTheDocument();
  });

  test('subject change clears prior documents immediately', async () => {
    fetchLegalEvidence.mockImplementation(async ({ subjectId }) => {
      if (subjectId === 501) return { documents: [DOC_A] };
      return { documents: [] };
    });
    const { rerender } = render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    expect(await screen.findByText('TITLE_REGISTER')).toBeInTheDocument();
    rerender(<LegalTitleEvidencePanel enabled subjectId={777} />);
    await waitFor(() => {
      expect(screen.queryByText('TITLE_REGISTER')).not.toBeInTheDocument();
    });
    expect(await screen.findByText(LEGAL_EVIDENCE_EMPTY_COPY)).toBeInTheDocument();
  });

  test('stale subject A response cannot leak into subject B', async () => {
    const first = deferred();
    const second = deferred();
    fetchLegalEvidence.mockImplementation(({ subjectId }) => (
      subjectId === 501 ? first.promise : second.promise
    ));
    const { rerender } = render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    rerender(<LegalTitleEvidencePanel enabled subjectId={777} />);
    first.resolve({ documents: [DOC_A] });
    second.resolve({ documents: [DOC_B] });
    expect(await screen.findByText('LEASE')).toBeInTheDocument();
    expect(screen.queryByText('TITLE_REGISTER')).not.toBeInTheDocument();
    expect(screen.getByTestId('legal-evidence-list')).toHaveTextContent('User supplied');
    expect(screen.getByTestId('legal-evidence-list')).toHaveTextContent('Unverified');
    expect(screen.getByTestId('legal-evidence-list')).toHaveTextContent('Not assessed');
  });

  test('preserves existing form controls behind disclosure', async () => {
    fetchLegalEvidence.mockResolvedValue({ documents: [] });
    render(<LegalTitleEvidencePanel enabled subjectId={501} />);
    fireEvent.click(screen.getByText(/Optional legal \/ title evidence/i));
    expect(await screen.findByText('Document type')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Title number (optional)')).toBeInTheDocument();
    expect(screen.getByText('Document date (optional)')).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add document' })).toBeInTheDocument();
    expect(uploadLegalEvidence).not.toHaveBeenCalled();
    expect(archiveLegalEvidence).not.toHaveBeenCalled();
  });

  test('does not render when disabled', () => {
    render(<LegalTitleEvidencePanel enabled={false} subjectId={501} />);
    expect(screen.queryByTestId('optional-legal-evidence')).not.toBeInTheDocument();
    expect(fetchLegalEvidence).not.toHaveBeenCalled();
  });
});
