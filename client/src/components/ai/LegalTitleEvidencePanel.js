import React, { useEffect, useRef, useState } from 'react';
import {
  archiveLegalEvidence,
  fetchLegalEvidence,
  uploadLegalEvidence,
} from '../../services/aiService';
import {
  LEGAL_EVIDENCE_EMPTY_COPY,
  LEGAL_EVIDENCE_LOAD_STATE,
  LEGAL_EVIDENCE_LOADING_COPY,
  LEGAL_EVIDENCE_UNAVAILABLE_COPY,
  legalEvidenceCompactStatus,
} from '../../Utils/legalEvidenceDisplay';

const DOCUMENT_TYPES = [
  'TITLE_REGISTER',
  'TITLE_PLAN',
  'LEASE',
  'TRANSFER',
  'DEED',
  'OFFICIAL_COPY',
  'OTHER_LEGAL_DOCUMENT',
  'UNKNOWN',
];

const SOURCE_TYPES = [
  { value: 'USER_UPLOADED_PRIVATE_DOCUMENT', label: 'Private document I uploaded' },
  { value: 'USER_UPLOADED_OFFICIAL_COPY', label: 'Official copy I uploaded' },
  { value: 'PROFESSIONAL_DOCUMENT', label: 'Professional document I uploaded' },
];

export default function LegalTitleEvidencePanel({
  propertyId,
  subjectId,
  enabled,
}) {
  const [documents, setDocuments] = useState([]);
  const [loadState, setLoadState] = useState(LEGAL_EVIDENCE_LOAD_STATE.IDLE);
  const [documentType, setDocumentType] = useState('UNKNOWN');
  const [sourceType, setSourceType] = useState('USER_UPLOADED_PRIVATE_DOCUMENT');
  const [titleNumber, setTitleNumber] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestSeqRef = useRef(0);

  const canLoad = enabled && (propertyId || subjectId);

  async function reload() {
    if (!canLoad) return;
    const requestId = ++requestSeqRef.current;
    setLoadState(LEGAL_EVIDENCE_LOAD_STATE.LOADING);
    setError('');
    try {
      const data = await fetchLegalEvidence({ propertyId, subjectId });
      if (requestSeqRef.current !== requestId) return;
      const docs = Array.isArray(data?.documents) ? data.documents : [];
      setDocuments(docs);
      setLoadState(
        docs.length > 0
          ? LEGAL_EVIDENCE_LOAD_STATE.AVAILABLE
          : LEGAL_EVIDENCE_LOAD_STATE.EMPTY
      );
    } catch {
      if (requestSeqRef.current !== requestId) return;
      setDocuments([]);
      setLoadState(LEGAL_EVIDENCE_LOAD_STATE.UNAVAILABLE);
    }
  }

  useEffect(() => {
    requestSeqRef.current += 1;
    const requestId = requestSeqRef.current;
    setDocuments([]);
    setError('');
    if (!canLoad) {
      setLoadState(LEGAL_EVIDENCE_LOAD_STATE.IDLE);
      return undefined;
    }
    let cancelled = false;
    setLoadState(LEGAL_EVIDENCE_LOAD_STATE.LOADING);
    fetchLegalEvidence({ propertyId, subjectId })
      .then((data) => {
        if (cancelled || requestSeqRef.current !== requestId) return;
        const docs = Array.isArray(data?.documents) ? data.documents : [];
        setDocuments(docs);
        setLoadState(
          docs.length > 0
            ? LEGAL_EVIDENCE_LOAD_STATE.AVAILABLE
            : LEGAL_EVIDENCE_LOAD_STATE.EMPTY
        );
      })
      .catch(() => {
        if (cancelled || requestSeqRef.current !== requestId) return;
        setDocuments([]);
        setLoadState(LEGAL_EVIDENCE_LOAD_STATE.UNAVAILABLE);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoad, propertyId, subjectId]);

  if (!enabled) return null;

  const compactStatus = legalEvidenceCompactStatus({
    loadState,
    documentCount: documents.length,
  });

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) {
      setError('Choose a PDF, JPEG, or PNG file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('document', file);
      form.append('documentType', documentType);
      form.append('sourceType', sourceType);
      if (propertyId) form.append('propertyId', propertyId);
      if (subjectId) form.append('subjectId', subjectId);
      if (titleNumber.trim()) form.append('titleNumber', titleNumber.trim());
      if (documentDate) form.append('documentDate', documentDate);
      await uploadLegalEvidence(form);
      setFile(null);
      setTitleNumber('');
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'The document could not be stored.');
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(documentId) {
    setBusy(true);
    setError('');
    try {
      await archiveLegalEvidence(documentId);
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'The document could not be archived.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="pi-optional-legal"
      data-testid="optional-legal-evidence"
    >
      <summary>
        Optional legal / title evidence
        {compactStatus ? (
          <span className="pi-optional-legal-status" data-testid="legal-evidence-compact-status">
            {` · ${compactStatus}`}
          </span>
        ) : null}
      </summary>
      <div
        className="pi-legal-evidence-panel"
        data-testid="legal-title-evidence-panel"
        data-load-state={loadState}
        aria-busy={loadState === LEGAL_EVIDENCE_LOAD_STATE.LOADING}
      >
        <p className="pi-muted pi-legal-evidence-intro">
          Add a private title register, title plan, lease, or other legal document. The file stays
          private. Uploading it does not verify authenticity or prove a clean title.
        </p>
        <form onSubmit={handleUpload} className="pi-legal-evidence-form">
          <label>
            Document type
            <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label>
            Source
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              {SOURCE_TYPES.map((row) => (
                <option key={row.value} value={row.value}>{row.label}</option>
              ))}
            </select>
          </label>
          <label>
            Title number (optional)
            <input
              type="text"
              value={titleNumber}
              onChange={(e) => setTitleNumber(e.target.value)}
              placeholder="Do not use a UPRN"
            />
          </label>
          <label>
            Document date (optional)
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>
          <label>
            File
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <button type="submit" className="ai-btn ai-btn-ghost" disabled={busy}>
            {busy ? 'Saving…' : 'Add document'}
          </button>
        </form>
        {error && <p className="pi-muted" data-testid="legal-evidence-error">{error}</p>}
        {loadState === LEGAL_EVIDENCE_LOAD_STATE.LOADING && (
          <p className="pi-muted pi-legal-evidence-status" data-testid="legal-evidence-status">
            {LEGAL_EVIDENCE_LOADING_COPY}
          </p>
        )}
        {loadState === LEGAL_EVIDENCE_LOAD_STATE.UNAVAILABLE && (
          <div className="pi-legal-evidence-status" data-testid="legal-evidence-status">
            <p className="pi-muted">{LEGAL_EVIDENCE_UNAVAILABLE_COPY}</p>
            <button
              type="button"
              className="ai-btn ai-btn-ghost"
              data-testid="legal-evidence-retry"
              onClick={reload}
            >
              Try again
            </button>
          </div>
        )}
        {loadState === LEGAL_EVIDENCE_LOAD_STATE.EMPTY && (
          <p className="pi-muted pi-legal-evidence-status" data-testid="legal-evidence-status">
            {LEGAL_EVIDENCE_EMPTY_COPY}
          </p>
        )}
        {loadState === LEGAL_EVIDENCE_LOAD_STATE.AVAILABLE && (
          <ul data-testid="legal-evidence-list">
            {documents.map((doc) => (
              <li key={doc.documentId}>
                <strong>{doc.documentType}</strong>
                {' · User supplied · Unverified · Not assessed'}
                {doc.documentDate ? ` · Document date ${doc.documentDate}` : ''}
                {doc.uploadedAt ? ` · Uploaded ${new Date(doc.uploadedAt).toLocaleDateString('en-GB')}` : ''}
                <button
                  type="button"
                  className="ai-btn ai-btn-ghost"
                  disabled={busy}
                  onClick={() => handleArchive(doc.documentId)}
                >
                  Archive
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
