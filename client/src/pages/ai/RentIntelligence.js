import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import RentResultView from '../../components/ai/RentResultView';
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

          <RentResultView result={result} />
        </div>
      </div>
    </AiWorkspaceLayout>
  );
};

export default RentIntelligence;
