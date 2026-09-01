import React, { useState } from 'react';
import { FaBriefcase } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import PortfolioResultView from '../../components/ai/PortfolioResultView';
import { analysePortfolio } from '../../services/aiService';
import '../../components/ai/AiWorkspaceLayout.css';
import './PortfolioOptimiser.css';

const PortfolioOptimiser = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysePortfolio();
      setReport(data.output || data);
    } catch (e) {
      setError(e.response?.data?.message || 'Portfolio analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AiWorkspaceLayout
      title="Portfolio Optimiser"
      subtitle="Aggregate view of your listings — value, yield, diversification, risks and recommended actions."
    >
      {!report && (
        <div className="po-intro ai-panel">
          <FaBriefcase className="po-icon" />
          <p>Analyse your entire portfolio in one pass. Uses your listing data and deterministic financial metrics — no guesswork on yields or cash flow.</p>
          <button type="button" className="ai-btn ai-btn-primary" onClick={runAnalysis} disabled={loading}>
            {loading ? 'Analysing portfolio…' : 'Analyse my portfolio'}
          </button>
        </div>
      )}

      {error && <div className="ai-alert ai-alert-error">{error}</div>}

      <PortfolioResultView report={report} onReset={() => setReport(null)} />
    </AiWorkspaceLayout>
  );
};

export default PortfolioOptimiser;
