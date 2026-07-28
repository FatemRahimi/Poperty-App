import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AiToolNav from '../../components/ai/AiToolNav';
import CopyBlock from '../../components/ai/CopyBlock';
import { fetchHistoryItem, deleteHistoryItem } from '../../services/aiService';
import '../../styles/ai-services.css';

const AiHistoryDetail = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistoryItem(id)
      .then((res) => setItem(res.item))
      .catch((err) => setError(err.response?.data?.message || 'Not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    await deleteHistoryItem(id);
    window.location.href = '/ai-services/dashboard';
  };

  const output = item?.output_data || {};

  return (
    <div className="ai-page">
      <div className="ai-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <AiToolNav />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p className="ai-eyebrow">Saved generation</p>
            <h1 className="ai-section-title" style={{ marginBottom: '0.35rem' }}>
              {item?.title || 'AI result'}
            </h1>
            {item && (
              <p className="ai-section-sub" style={{ marginBottom: '1.5rem' }}>
                {item.request_type} · {new Date(item.created_at).toLocaleString()}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link to="/ai-services/dashboard" className="ai-btn ai-btn-ghost">Back</Link>
            {item && (
              <button type="button" className="ai-btn ai-btn-ghost" onClick={handleDelete}>Delete</button>
            )}
          </div>
        </div>

        {loading && <div className="ai-loading"><span className="ai-spinner" /> Loading…</div>}
        {error && <div className="ai-alert ai-alert-error">{error}</div>}

        {item?.request_type === 'listing_writer' && (
          <>
            <CopyBlock title="SEO title" text={output.seoTitle}>{output.seoTitle}</CopyBlock>
            <CopyBlock title="Description" text={output.description}>{output.description}</CopyBlock>
            <CopyBlock title="Key selling points" text={(output.keySellingPoints || []).join('\n')}>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {(output.keySellingPoints || []).map((p) => <li key={p}>{p}</li>)}
              </ul>
            </CopyBlock>
            <CopyBlock title="Social media advert" text={output.socialMediaAdvert}>{output.socialMediaAdvert}</CopyBlock>
            <CopyBlock title="Email marketing" text={output.emailMarketing}>{output.emailMarketing}</CopyBlock>
          </>
        )}

        {item?.request_type === 'valuation' && (
          <div className="ai-card">
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
              {JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}

        {item?.request_type === 'buyer_match' && (
          <>
            <CopyBlock title="Assistant" text={output.assistantMessage}>{output.assistantMessage}</CopyBlock>
            <div className="ai-grid-2">
              {(output.recommendations || []).map((rec) => (
                <div key={rec.id || rec.title} className="ai-card">
                  <div className="ai-pill">{rec.matchScore}% match</div>
                  <h3 style={{ margin: '0.6rem 0' }}>{rec.title}</h3>
                  <p style={{ color: 'var(--ai-slate)', margin: 0 }}>{rec.address}</p>
                  <p style={{ margin: '0.5rem 0 0' }}>{rec.summary}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AiHistoryDetail;
