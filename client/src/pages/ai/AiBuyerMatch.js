import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaComments, FaPaperPlane } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { generateBuyerMatch } from '../../services/aiService';
import '../../components/ai/AiWorkspaceLayout.css';
import './AiBuyerMatch.css';

const initialForm = {
  budgetMax: '',
  budgetMin: '',
  location: '',
  bedrooms: '',
  lifestyle: '',
  transport: '',
  schools: '',
};

const AiBuyerMatch = () => {
  const [form, setForm] = useState(initialForm);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Tell me your budget, preferred location, lifestyle, transport needs and school preferences — I’ll match properties from our database.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState([]);
  const [savedId, setSavedId] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const userSummary = [
      form.budgetMax && `Budget up to £${Number(form.budgetMax).toLocaleString()}`,
      form.location && `Location: ${form.location}`,
      form.lifestyle && `Lifestyle: ${form.lifestyle}`,
      form.transport && `Transport: ${form.transport}`,
      form.schools && `Schools: ${form.schools}`,
      form.bedrooms && `Bedrooms: ${form.bedrooms}+`,
    ].filter(Boolean).join(' · ');

    setMessages((prev) => [...prev, { role: 'user', text: userSummary || 'Find properties for me' }]);

    try {
      const payload = {
        ...form,
        budget: form.budgetMax ? Number(form.budgetMax) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
      };
      const data = await generateBuyerMatch(payload);
      setMatches(data.output?.recommendations || []);
      setSavedId(data.id);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.output?.assistantMessage || 'Here are your matches.' },
      ]);
    } catch (err) {
      const msg = err.response?.data?.message || 'Matching failed';
      setError(err.response?.data?.code === 'INSUFFICIENT_CREDITS'
        ? `${msg} Visit Pricing to upgrade.`
        : msg);
      setMessages((prev) => [...prev, { role: 'assistant', text: msg }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AiWorkspaceLayout
      title="Buyer Match Assistant"
      subtitle="Conversational search ranked against live listings — budget, location, lifestyle and schools."
    >
      {error && <div className="ai-alert ai-alert-error">{error}</div>}
      {savedId && (
        <div className="ai-alert ai-alert-info">
          Match session saved. <Link to={`/ai-services/history/${savedId}`}>View history</Link>
        </div>
      )}

      <div className="ai-bm-grid">
        <div className="ai-panel ai-bm-chat">
          <div className="ai-bm-log">
            {messages.map((m, idx) => (
              <div key={`${m.role}-${idx}`} className={`ai-bm-bubble ${m.role}`}>{m.text}</div>
            ))}
            {loading && <div className="ai-bm-bubble assistant">Matching properties…</div>}
          </div>

          <form onSubmit={onSubmit}>
            <div className="ai-form-grid">
              <div className="ai-field">
                <label htmlFor="budgetMax">Max budget (£)</label>
                <input id="budgetMax" name="budgetMax" type="number" value={form.budgetMax} onChange={onChange} placeholder="450000" />
              </div>
              <div className="ai-field">
                <label htmlFor="location">Location</label>
                <input id="location" name="location" value={form.location} onChange={onChange} placeholder="City or postcode area" required />
              </div>
              <div className="ai-field full">
                <label htmlFor="lifestyle">Lifestyle</label>
                <input id="lifestyle" name="lifestyle" value={form.lifestyle} onChange={onChange} placeholder="Family home, garden, quiet area…" />
              </div>
            </div>
            <button type="submit" className="ai-btn ai-btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
              <FaPaperPlane /> {loading ? 'Searching…' : 'Find matches'}
            </button>
          </form>
        </div>

        <div>
          <h2 className="ai-bm-results-title">Recommended properties</h2>
          {matches.length === 0 && (
            <div className="ai-panel">
              <p className="ai-insight-meta" style={{ margin: 0 }}>Matched listings appear here with score and reasons.</p>
            </div>
          )}
          {matches.map((rec) => (
            <article key={rec.id || rec.title} className="ai-panel ai-bm-card">
              <div className="ai-bm-card-top">
                <span className="ai-bm-score">
                  {Number.isFinite(rec.matchScore) ? `${rec.matchScore}% match` : 'Match not assessed'}
                </span>
                {rec.price != null && <strong>£{Number(rec.price).toLocaleString()}</strong>}
              </div>
              <h3>{rec.title}</h3>
              <p className="ai-insight-meta">{rec.address}</p>
              <p>{rec.summary}</p>
              {(rec.matchReasons || []).length > 0 && (
                <ul className="ai-insight-meta" style={{ margin: '0.35rem 0', paddingLeft: '1.1rem' }}>
                  {rec.matchReasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              {rec.slug && (
                <Link to={`/property/${rec.slug}`} className="ai-btn ai-btn-ghost" style={{ marginTop: '0.5rem' }}>
                  View property
                </Link>
              )}
            </article>
          ))}
        </div>
      </div>
    </AiWorkspaceLayout>
  );
};

export default AiBuyerMatch;
