import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaChartLine, FaPrint, FaMagic } from 'react-icons/fa';
import AiToolNav from '../../components/ai/AiToolNav';
import { generateValuation } from '../../services/aiService';
import '../../styles/ai-services.css';
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

  return (
    <div className="ai-page">
      <div className="ai-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <AiToolNav />
        <p className="ai-eyebrow"><FaChartLine /> Valuation Report</p>
        <h1 className="ai-section-title">AI Property Valuation Report</h1>
        <p className="ai-section-sub">
          Enter property details and optional photos to generate an estimated value range,
          market analysis, improvement ideas and a print-ready report layout.
        </p>

        {error && <div className="ai-alert ai-alert-error">{error}</div>}

        <div className="ai-grid-2">
          <form className="ai-card" onSubmit={onSubmit}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Property details</h2>
            <div className="ai-form-grid">
              <div className="ai-field full">
                <label htmlFor="address">Property address</label>
                <input id="address" name="address" value={form.address} onChange={onChange} required placeholder="Full address" />
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
              <div className="ai-field full">
                <label htmlFor="photos">Upload photos</label>
                <input
                  id="photos"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 8))}
                />
                {photos.length > 0 && (
                  <small style={{ color: 'var(--ai-slate)' }}>{photos.length} photo(s) selected</small>
                )}
              </div>
            </div>
            <button type="submit" className="ai-btn ai-btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
              <FaMagic /> {loading ? 'Analysing…' : 'Generate valuation'}
            </button>
            {loading && <div className="ai-loading"><span className="ai-spinner" /> Building market report…</div>}
          </form>

          <div>
            {!result && !loading && (
              <div className="ai-card">
                <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Report preview</h2>
                <p style={{ color: 'var(--ai-slate)', margin: 0 }}>
                  Your estimated range, analysis and improvement suggestions will render in a printable PDF-style layout.
                </p>
              </div>
            )}

            {result && (
              <div className="ai-report" id="ai-valuation-report">
                <div className="ai-report-toolbar">
                  {savedId && <Link to={`/ai-services/history/${savedId}`}>Saved result</Link>}
                  <button type="button" className="ai-btn ai-btn-ghost" onClick={() => window.print()}>
                    <FaPrint /> Print / PDF
                  </button>
                </div>

                <header className="ai-report-header">
                  <div>
                    <p className="ai-eyebrow" style={{ marginBottom: '0.35rem' }}>AI Valuation Report</p>
                    <h2>{result.report?.title || 'Property Valuation'}</h2>
                    <p>{form.address}</p>
                  </div>
                  <div className="ai-report-confidence">
                    Confidence<br /><strong>{result.confidence || 'Medium'}</strong>
                  </div>
                </header>

                <section className="ai-report-value">
                  <div>
                    <span>Low</span>
                    <strong>{value?.formatted?.low || value?.low}</strong>
                  </div>
                  <div className="mid">
                    <span>Estimated mid</span>
                    <strong>{value?.formatted?.mid || value?.mid}</strong>
                  </div>
                  <div>
                    <span>High</span>
                    <strong>{value?.formatted?.high || value?.high}</strong>
                  </div>
                </section>

                <section className="ai-report-section">
                  <h3>Market analysis</h3>
                  <p>{result.marketAnalysis?.summary}</p>
                  <ul>
                    <li>Local trend: {result.marketAnalysis?.localTrend}</li>
                    <li>Avg. days on market: {result.marketAnalysis?.daysOnMarketAvg}</li>
                    <li>Demand: {result.marketAnalysis?.demandLevel}</li>
                    <li>{result.marketAnalysis?.comparablesNote}</li>
                  </ul>
                </section>

                <section className="ai-report-section">
                  <h3>Improvement suggestions</h3>
                  <div className="ai-improve-grid">
                    {(result.improvementSuggestions || []).map((item) => (
                      <article key={item.title}>
                        <header>
                          <h4>{item.title}</h4>
                          <span className="ai-pill">{item.impact} impact</span>
                        </header>
                        <p>{item.detail}</p>
                        <p className="meta">Cost {item.estimatedCost} · Uplift {item.valueUplift}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <footer className="ai-report-footer">
                  {result.report?.disclaimer}
                </footer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiValuation;
