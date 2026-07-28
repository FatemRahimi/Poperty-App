import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaComments, FaPaperPlane } from 'react-icons/fa';
import AiToolNav from '../../components/ai/AiToolNav';
import { generateBuyerMatch } from '../../services/aiService';
import '../../styles/ai-services.css';
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
    <div className="ai-page">
      <div className="ai-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <AiToolNav />
        <p className="ai-eyebrow"><FaComments /> Buyer Match Assistant</p>
        <h1 className="ai-section-title">Conversational property search</h1>
        <p className="ai-section-sub">
          Share how you want to live. AI ranks listings from the database against budget,
          location, lifestyle, transport and schools.
        </p>

        {error && <div className="ai-alert ai-alert-error">{error}</div>}
        {savedId && (
          <div className="ai-alert ai-alert-info">
            Match session saved. <Link to={`/ai-services/history/${savedId}`}>View history</Link>
          </div>
        )}

        <div className="ai-grid-2">
          <div className="ai-chat-panel ai-card">
            <div className="ai-chat-log">
              {messages.map((m, idx) => (
                <div key={`${m.role}-${idx}`} className={`ai-chat-bubble ${m.role}`}>
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="ai-chat-bubble assistant">
                  <span className="ai-spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />
                  Matching properties…
                </div>
              )}
            </div>

            <form className="ai-chat-form" onSubmit={onSubmit}>
              <div className="ai-form-grid">
                <div className="ai-field">
                  <label htmlFor="budgetMax">Max budget (£)</label>
                  <input id="budgetMax" name="budgetMax" type="number" value={form.budgetMax} onChange={onChange} placeholder="450000" />
                </div>
                <div className="ai-field">
                  <label htmlFor="budgetMin">Min budget (£)</label>
                  <input id="budgetMin" name="budgetMin" type="number" value={form.budgetMin} onChange={onChange} placeholder="Optional" />
                </div>
                <div className="ai-field full">
                  <label htmlFor="location">Location</label>
                  <input id="location" name="location" value={form.location} onChange={onChange} placeholder="City, town or postcode area" required />
                </div>
                <div className="ai-field">
                  <label htmlFor="bedrooms">Min bedrooms</label>
                  <input id="bedrooms" name="bedrooms" type="number" min="0" value={form.bedrooms} onChange={onChange} />
                </div>
                <div className="ai-field">
                  <label htmlFor="transport">Transport needs</label>
                  <input id="transport" name="transport" value={form.transport} onChange={onChange} placeholder="Near train / parking" />
                </div>
                <div className="ai-field full">
                  <label htmlFor="lifestyle">Lifestyle requirements</label>
                  <input id="lifestyle" name="lifestyle" value={form.lifestyle} onChange={onChange} placeholder="Family home, quiet area, garden…" />
                </div>
                <div className="ai-field full">
                  <label htmlFor="schools">School preferences</label>
                  <input id="schools" name="schools" value={form.schools} onChange={onChange} placeholder="Catchment / Ofsted preference" />
                </div>
              </div>
              <button type="submit" className="ai-btn ai-btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
                <FaPaperPlane /> {loading ? 'Searching…' : 'Find matches'}
              </button>
            </form>
          </div>

          <div className="ai-match-results">
            <h2 style={{ marginTop: 0 }}>Recommended properties</h2>
            {matches.length === 0 && (
              <div className="ai-card">
                <p style={{ margin: 0, color: 'var(--ai-slate)' }}>
                  Matched listings from the database will appear here with a score and reasons.
                </p>
              </div>
            )}
            {matches.map((rec) => (
              <article key={rec.id || rec.title} className="ai-card ai-match-card">
                <div className="ai-match-top">
                  <span className="ai-pill">{rec.matchScore}% match</span>
                  {rec.price != null && (
                    <strong>£{Number(rec.price).toLocaleString()}</strong>
                  )}
                </div>
                <h3>{rec.title}</h3>
                <p className="addr">{rec.address}</p>
                <p>{rec.summary}</p>
                {(rec.matchReasons || []).length > 0 && (
                  <ul>
                    {rec.matchReasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
                {rec.slug && (
                  <Link to={`/property/${rec.slug}`} className="ai-btn ai-btn-ghost" style={{ marginTop: '0.75rem' }}>
                    View property
                  </Link>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiBuyerMatch;
