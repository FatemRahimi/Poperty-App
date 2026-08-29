import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaChartLine, FaPrint, FaMagic } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { generateValuation } from '../../services/aiService';
import '../../components/ai/AiWorkspaceLayout.css';
import './AiValuation.css';

const initialForm = {
  address: '',
  propertyType: 'House',
  bedrooms: 3,
  bathrooms: 2,
  sizeSqFt: 1200,
  condition: 'Good',
};

const AiValuation = () => {
  const [form, setForm] = useState(initialForm);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const payload = {
        ...form,
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        sizeSqFt: Number(form.sizeSqFt),
        size: Number(form.sizeSqFt),
      };
      const data = await generateValuation(payload, photos);
      setResult(data.output);
      setSavedId(data.id);
    } catch (err) {
      const msg = err.response?.data?.message || 'Valuation failed';
      setError(err.response?.data?.code === 'INSUFFICIENT_CREDITS'
        ? `${msg} Visit Pricing to upgrade.`
        : msg);
    } finally {
      setLoading(false);
    }
  };

  const value = result?.estimatedValue;
  const isDeterministic = result?.engine === 'deterministic-v2';

  return (
    <AiWorkspaceLayout
      title="Evidence-Based Valuation"
      subtitle="Deterministic market estimate from comparables and postcode statistics — not LLM guesswork."
    >
      {error && <div className="ai-alert ai-alert-error">{error}</div>}

      <div className="ai-val-grid">
        <form className="ai-panel" onSubmit={onSubmit}>
          <h2>Property details</h2>
          <div className="ai-form-grid">
            <div className="ai-field full">
              <label htmlFor="address">Property address (include postcode)</label>
              <input id="address" name="address" value={form.address} onChange={onChange} required placeholder="12 High Street, Manchester, M1 1AA" />
            </div>
            <div className="ai-field">
              <label htmlFor="propertyType">Property type</label>
              <select id="propertyType" name="propertyType" value={form.propertyType} onChange={onChange}>
                {['House', 'Flat', 'Apartment', 'Detached', 'Semi-Detached', 'Terraced', 'Bungalow'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="ai-field">
              <label htmlFor="condition">Condition</label>
              <select id="condition" name="condition" value={form.condition} onChange={onChange}>
                {['Excellent', 'Good', 'Fair', 'Needs Renovation', 'Poor'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="ai-field">
              <label htmlFor="bedrooms">Bedrooms</label>
              <input id="bedrooms" type="number" name="bedrooms" min="0" value={form.bedrooms} onChange={onChange} />
            </div>
            <div className="ai-field">
              <label htmlFor="bathrooms">Bathrooms</label>
              <input id="bathrooms" type="number" name="bathrooms" min="0" value={form.bathrooms} onChange={onChange} />
            </div>
            <div className="ai-field full">
              <label htmlFor="sizeSqFt">Size (sq ft)</label>
              <input id="sizeSqFt" type="number" name="sizeSqFt" min="1" value={form.sizeSqFt} onChange={onChange} required />
            </div>
          </div>
          <button type="submit" className="ai-btn ai-btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
            <FaMagic /> {loading ? 'Analysing…' : 'Generate valuation'}
          </button>
        </form>

        <div>
          {!result && !loading && (
            <div className="ai-panel">
              <h2>Report preview</h2>
              <p className="ai-insight-meta" style={{ margin: 0 }}>
                Value range, market context and improvement suggestions appear here after analysis.
              </p>
            </div>
          )}

          {result && (
            <div className="ai-val-report" id="ai-valuation-report">
              <div className="ai-val-toolbar">
                {isDeterministic && <span className="ai-val-engine">Evidence-based v2</span>}
                {savedId && <Link to={`/ai-services/history/${savedId}`}>Saved result</Link>}
                <button type="button" className="ai-btn ai-btn-ghost" onClick={() => window.print()}>
                  <FaPrint /> Print
                </button>
              </div>

              <header className="ai-val-hero">
                <p className="ai-val-kicker"><FaChartLine /> Valuation Report</p>
                <h2>{result.report?.title || 'Property Valuation'}</h2>
                <p>{form.address}</p>
                <span className="ai-val-confidence">
                  Confidence: {result.confidenceLevel || result.confidence || 'Not assessed'}
                </span>
                {result.evidenceCount != null && (
                  <span className="ai-val-evidence">{result.evidenceCount} evidence sources</span>
                )}
              </header>

              <section className="ai-val-range">
                <div><small>Low</small><strong>{value?.formatted?.low || value?.low}</strong></div>
                <div className="mid"><small>Central</small><strong>{value?.formatted?.mid || value?.mid}</strong></div>
                <div><small>High</small><strong>{value?.formatted?.high || value?.high}</strong></div>
              </section>

              {result.pricePosition?.success && (
                <section className="ai-val-position">
                  <strong>{result.pricePosition.label}</strong>
                  <p>{result.pricePosition.summary}</p>
                </section>
              )}

              <section className="ai-panel ai-val-section">
                <h3>Market analysis</h3>
                <p>{result.marketAnalysis?.summary}</p>
                <ul className="ai-val-list">
                  <li>Local trend: {result.marketAnalysis?.localTrend}</li>
                  <li>Demand: {result.marketAnalysis?.demandLevel}</li>
                  <li>{result.marketAnalysis?.comparablesNote}</li>
                </ul>
              </section>

              {(result.improvementSuggestions || []).length > 0 && (
                <section className="ai-panel ai-val-section">
                  <h3>Improvement suggestions</h3>
                  <div className="ai-val-improve-grid">
                    {result.improvementSuggestions.map((item) => (
                      <article key={item.title}>
                        <header><h4>{item.title}</h4><span>{item.impact} impact</span></header>
                        <p>{item.detail}</p>
                        <p className="ai-insight-meta">Cost {item.estimatedCost} · Uplift {item.valueUplift}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <footer className="ai-val-disclaimer">{result.report?.disclaimer}</footer>
            </div>
          )}
        </div>
      </div>
    </AiWorkspaceLayout>
  );
};

export default AiValuation;
