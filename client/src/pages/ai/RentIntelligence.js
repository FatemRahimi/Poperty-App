import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { analyseRent } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';
import '../../components/ai/AiWorkspaceLayout.css';

const RentIntelligence = () => {
  const { isAuthenticated } = useAuth();
  const [form, setForm] = useState({
    city: '',
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: '',
    propertyType: 'Flat',
    currentRent: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const data = await analyseRent({
        ...form,
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        squareFeet: form.squareFeet ? Number(form.squareFeet) : undefined,
        currentRent: form.currentRent ? Number(form.currentRent) : undefined,
      });
      setResult(data.output);
    } catch (err) {
      setError(err.response?.data?.message || 'Rent analysis failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <AiWorkspaceLayout title="AI Rent Intelligence" subtitle="Comparable-based rental estimates from internal application data.">
        <div className="ai-empty-state">
          <p>Sign in to analyse rental positioning.</p>
          <Link to="/login" state={{ from: '/ai-services/rent-intelligence' }} className="ai-btn ai-btn-primary">Sign in</Link>
        </div>
      </AiWorkspaceLayout>
    );
  }

  return (
    <AiWorkspaceLayout
      title="AI Rent Intelligence"
      subtitle="Estimate rental range using weighted comparable analysis from properties in this application — not external market feeds."
    >
      {error && <div className="ai-alert ai-alert-error">{error}</div>}

      <div className="ai-grid-2">
        <form className="ai-panel ai-form-dark" onSubmit={onSubmit}>
          <h2>Property details</h2>
          <div className="ai-form-grid">
            <div className="ai-field full"><label>City / area</label><input name="city" value={form.city} onChange={onChange} required placeholder="e.g. Bristol" /></div>
            <div className="ai-field"><label>Property type</label>
              <select name="propertyType" value={form.propertyType} onChange={onChange}>
                {['Flat', 'House', 'Apartment', 'Terraced', 'Semi-Detached', 'Detached', 'Commercial'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="ai-field"><label>Current rent (£/mo)</label><input name="currentRent" type="number" value={form.currentRent} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label>Bedrooms</label><input name="bedrooms" type="number" value={form.bedrooms} onChange={onChange} /></div>
            <div className="ai-field"><label>Bathrooms</label><input name="bathrooms" type="number" value={form.bathrooms} onChange={onChange} /></div>
            <div className="ai-field full"><label>Size (sq ft)</label><input name="squareFeet" type="number" value={form.squareFeet} onChange={onChange} placeholder="Optional" /></div>
          </div>
          <button type="submit" className="ai-btn ai-btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Analysing…' : 'Analyse rent'}
          </button>
        </form>

        <div>
          {!result && !loading && (
            <div className="ai-empty-state">
              <p>Results show recommended rent, market range, confidence and comparable properties used.</p>
            </div>
          )}

          {result?.insufficientData && (
            <div className="ai-panel">
              <h2>Insufficient data</h2>
              <p className="ai-insight-meta">{result.message}</p>
              <p className="ai-disclaimer">{result.disclaimer}</p>
            </div>
          )}

          {result?.success && (
            <>
              <div className="ai-metrics-grid">
                <div className="ai-metric"><small>Recommended rent</small><strong>£{result.recommendedRent?.toLocaleString()}</strong></div>
                <div className="ai-metric"><small>Market range</small><strong>£{result.marketRange.low}–£{result.marketRange.high}</strong></div>
                <div className="ai-metric"><small>Confidence</small><strong>{result.confidenceLevel || 'Not assessed'}</strong></div>
                <div className="ai-metric"><small>Data quality</small><strong>{result.dataQuality?.level || 'Not assessed'}</strong></div>
              </div>

              <div className="ai-panel">
                <h2>Price sensitivity</h2>
                <table className="ai-data-table">
                  <thead><tr><th>Position</th><th>Rent</th><th>Demand</th></tr></thead>
                  <tbody>
                    {result.priceSensitivity.map((row) => (
                      <tr key={row.label}><td>{row.label}</td><td>£{row.rent?.toLocaleString()}</td><td>{row.demand}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ai-panel">
                <h2>Comparable properties ({result.comparables.length})</h2>
                <table className="ai-data-table">
                  <thead><tr><th>Property</th><th>Rent</th><th>Similarity</th><th>Why selected</th></tr></thead>
                  <tbody>
                    {result.comparables.map((c) => (
                      <tr key={c.id}>
                        <td>{c.title || c.city}</td>
                        <td>£{c.monthly_rent?.toLocaleString()}</td>
                        <td>{c.similarity}%</td>
                        <td>{(c.reasons || []).join(', ') || 'Comparable match'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="ai-disclaimer">{result.disclaimer}</p>
            </>
          )}
        </div>
      </div>
    </AiWorkspaceLayout>
  );
};

export default RentIntelligence;
