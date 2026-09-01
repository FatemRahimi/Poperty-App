import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CopyBlock from '../../components/ai/CopyBlock';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import IntelligenceReport from '../../components/ai/IntelligenceReport';
import InvestmentResultView from '../../components/ai/InvestmentResultView';
import RentResultView from '../../components/ai/RentResultView';
import PortfolioResultView from '../../components/ai/PortfolioResultView';
import { fetchHistoryItem, deleteHistoryItem } from '../../services/aiService';
import { savedIntelligenceReportFromRow } from '../../Utils/savedIntelligenceReport';
import '../../components/ai/AiWorkspaceLayout.css';
import '../../components/ai/IntelligenceReport.css';
import './AiValuation.css';
import './PortfolioOptimiser.css';

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
    window.location.href = '/ai-services/history';
  };

  const output = item?.output_data || {};
  const savedPiReport =
    item?.request_type === 'property_intelligence' ? savedIntelligenceReportFromRow(item) : null;

  return (
    <AiWorkspaceLayout title="Saved AI result" subtitle={item ? `${item.request_type} · ${new Date(item.created_at).toLocaleString()}` : 'Loading…'}>
      <div className="ai-history-detail-actions">
        <Link to="/ai-services/history" className="ai-btn ai-btn-ghost">← History</Link>
        {item && (
          <button type="button" className="ai-btn ai-btn-ghost" onClick={handleDelete}>Delete</button>
        )}
      </div>

      {item?.confidenceLevel && (
        <p className="ai-insight-meta">
          Confidence: {item.confidenceLevel}
          {item.confidenceLevelIsLegacyEstimate
            ? ` · recorded under an earlier model${item.confidenceModelVersion ? ` (${item.confidenceModelVersion})` : ''}`
            : ''}
        </p>
      )}
      {error && <div className="ai-alert ai-alert-error">{error}</div>}
      {loading && <div className="ai-loading"><span className="ai-spinner" /> Loading…</div>}

      {savedPiReport && (
        <div data-testid="saved-pi-history-report">
          <p className="ai-insight-meta" data-testid="saved-pi-snapshot-note">
            This is the Property Analysis stored at analysis time. It is not a live refresh of the listing.
          </p>
          <IntelligenceReport report={savedPiReport} />
        </div>
      )}

      {item?.request_type === 'listing_writer' && (
        <div className="ai-panel">
          <CopyBlock title="SEO title" text={output.seoTitle}>{output.seoTitle}</CopyBlock>
          <CopyBlock title="Description" text={output.description}>{output.description}</CopyBlock>
          <CopyBlock title="Key selling points" text={(output.keySellingPoints || []).join('\n')}>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {(output.keySellingPoints || []).map((p) => <li key={p}>{p}</li>)}
            </ul>
          </CopyBlock>
          <CopyBlock title="Social media advert" text={output.socialMediaAdvert}>{output.socialMediaAdvert}</CopyBlock>
          <CopyBlock title="Email marketing" text={output.emailMarketing}>{output.emailMarketing}</CopyBlock>
        </div>
      )}

      {item?.request_type === 'valuation' && output.estimatedValue && (
        <div className="ai-panel">
          <h2 style={{ marginTop: 0 }}>{output.report?.title || 'Valuation'}</h2>
          {output.engine && <span className="ai-val-engine" style={{ marginBottom: '0.75rem', display: 'inline-block' }}>{output.engine}</span>}
          <div className="ai-val-range" style={{ marginTop: '0.75rem' }}>
            <div><small>Low</small><strong>{output.estimatedValue.formatted?.low || output.estimatedValue.low}</strong></div>
            <div className="mid"><small>Central</small><strong>{output.estimatedValue.formatted?.mid || output.estimatedValue.mid}</strong></div>
            <div><small>High</small><strong>{output.estimatedValue.formatted?.high || output.estimatedValue.high}</strong></div>
          </div>
          <p className="ai-insight-meta" style={{ marginTop: '1rem' }}>{output.marketAnalysis?.summary}</p>
          <p className="ai-insight-meta">{output.report?.disclaimer}</p>
        </div>
      )}

      {item?.request_type === 'valuation' && !output.estimatedValue && (
        <div className="ai-panel">
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.85rem', color: '#cbd5e1' }}>
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}

      {item?.request_type === 'investment_analyst' && output.metrics && (
        <div data-testid="saved-investment-history">
          <p className="ai-insight-meta">
            This is the Investment Analyst result stored at analysis time. It is not recalculated.
          </p>
          <InvestmentResultView result={output} />
        </div>
      )}

      {item?.request_type === 'rent_intelligence' && (
        <div data-testid="saved-rent-history">
          <p className="ai-insight-meta">
            This is the Rent Intelligence result stored at analysis time. It is not recalculated.
          </p>
          <RentResultView result={output} />
        </div>
      )}

      {item?.request_type === 'portfolio_optimiser' && (
        <div data-testid="saved-portfolio-history">
          <p className="ai-insight-meta">
            This is the Portfolio Optimiser result stored at analysis time. It is not recalculated.
          </p>
          <PortfolioResultView report={output} />
        </div>
      )}

      {item?.request_type === 'buyer_match' && (
        <>
          <div className="ai-panel">
            <CopyBlock title="Assistant" text={output.assistantMessage}>{output.assistantMessage}</CopyBlock>
          </div>
          <div className="ai-bm-grid">
            {(output.recommendations || []).map((rec) => (
              <div key={rec.id || rec.title} className="ai-panel ai-bm-card">
                <span className="ai-bm-score">
                  {Number.isFinite(rec.matchScore) ? `${rec.matchScore}% match` : 'Match not assessed'}
                </span>
                <h3 style={{ margin: '0.5rem 0' }}>{rec.title}</h3>
                <p className="ai-insight-meta">{rec.address}</p>
                <p>{rec.summary}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </AiWorkspaceLayout>
  );
};

export default AiHistoryDetail;
