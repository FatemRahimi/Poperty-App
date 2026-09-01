import React, { useEffect, useState } from 'react';
import {
  archiveLegalEvidence,
  fetchLegalEvidence,
  uploadLegalEvidence,
} from '../../services/aiService';

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
  const [documentType, setDocumentType] = useState('UNKNOWN');
  const [sourceType, setSourceType] = useState('USER_UPLOADED_PRIVATE_DOCUMENT');
  const [titleNumber, setTitleNumber] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canLoad = enabled && (propertyId || subjectId);

  async function reload() {
    if (!canLoad) return;
    const data = await fetchLegalEvidence({ propertyId, subjectId });
    setDocuments(data.documents || []);
  }

  useEffect(() => {
    let cancelled = false;
    if (!canLoad) {
      setDocuments([]);
      return undefined;
    }
    fetchLegalEvidence({ propertyId, subjectId })
      .then((data) => {
        if (!cancelled) setDocuments(data.documents || []);
      })
      .catch(() => {
        if (!cancelled) setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoad, propertyId, subjectId]);

  if (!enabled) return null;

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
    <div className="pi-legal-evidence-panel" data-testid="legal-title-evidence-panel">
      <h3 className="pi-subheading">Legal / title evidence</h3>
      <p className="pi-muted">
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
      {documents.length === 0 ? (
        <p className="pi-muted">No private legal evidence supplied yet.</p>
      ) : (
        <ul data-testid="legal-evidence-list">
          {documents.map((doc) => (
            <li key={doc.documentId}>
              <strong>{doc.documentType}</strong>
              {' · Evidence supplied · '}
              {doc.verificationState === 'USER_DECLARED' ? 'User declared' : 'Unverified'}
              {' · Not assessed'}
              {doc.documentDate ? ` · Document date ${doc.documentDate}` : ''}
              {doc.uploadedAt ? ` · Uploaded ${new Date(doc.uploadedAt).toLocaleDateString('en-GB')}` : ''}
              {' · '}
              {doc.sourceType?.replace(/_/g, ' ')}
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
  );
}
