import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPenFancy, FaMagic } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import CopyBlock from '../../components/ai/CopyBlock';
import { generateListing } from '../../services/aiService';
import '../../components/ai/AiWorkspaceLayout.css';

const initialForm = {
  address: '',
  propertyType: 'House',
  bedrooms: 3,
  bathrooms: 2,
  price: '',
  sizeSqFt: '',
  features: '',
  descriptionNotes: '',
  tenure: 'Freehold',
};

const AiListingWriter = () => {
  const [form, setForm] = useState(initialForm);
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
        price: form.price ? Number(form.price) : undefined,
        sizeSqFt: form.sizeSqFt ? Number(form.sizeSqFt) : undefined,
        features: form.features.split(',').map((s) => s.trim()).filter(Boolean),
        keyFeatures: form.features.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const data = await generateListing(payload);
      setResult(data.output);
      setSavedId(data.id);
    } catch (err) {
      const msg = err.response?.data?.message || 'Generation failed';
      const code = err.response?.data?.code;
      setError(code === 'INSUFFICIENT_CREDITS'
        ? `${msg} Visit Pricing to upgrade.`
        : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AiWorkspaceLayout
      title="Listing Writer"
      subtitle="Generate professional descriptions, SEO titles, social adverts, email copy and key selling points."
    >
        {error && <div className="ai-alert ai-alert-error">{error}</div>}

        <div className="ai-grid-2">
          <form className="ai-panel ai-form-dark" onSubmit={onSubmit}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Property information</h2>
            <div className="ai-form-grid">
              <div className="ai-field full">
                <label htmlFor="address">Address / area</label>
                <input id="address" name="address" value={form.address} onChange={onChange} required placeholder="e.g. Clifton, Bristol" />
              </div>
              <div className="ai-field">
                <label htmlFor="propertyType">Property type</label>
                <select id="propertyType" name="propertyType" value={form.propertyType} onChange={onChange}>
                  {['House', 'Flat', 'Apartment', 'Detached', 'Semi-Detached', 'Terraced', 'Bungalow'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="ai-field">
                <label htmlFor="tenure">Tenure</label>
                <select id="tenure" name="tenure" value={form.tenure} onChange={onChange}>
                  <option>Freehold</option>
                  <option>Leasehold</option>
                  <option>Share of Freehold</option>
                </select>
              </div>
              <div className="ai-field">
                <label htmlFor="bedrooms">Bedrooms</label>
                <input id="bedrooms" name="bedrooms" type="number" min="0" value={form.bedrooms} onChange={onChange} />
              </div>
              <div className="ai-field">
                <label htmlFor="bathrooms">Bathrooms</label>
                <input id="bathrooms" name="bathrooms" type="number" min="0" value={form.bathrooms} onChange={onChange} />
              </div>
              <div className="ai-field">
                <label htmlFor="price">Asking price (£)</label>
                <input id="price" name="price" type="number" min="0" value={form.price} onChange={onChange} placeholder="Optional" />
              </div>
              <div className="ai-field">
                <label htmlFor="sizeSqFt">Size (sq ft)</label>
                <input id="sizeSqFt" name="sizeSqFt" type="number" min="0" value={form.sizeSqFt} onChange={onChange} placeholder="Optional" />
              </div>
              <div className="ai-field full">
                <label htmlFor="features">Features (comma-separated)</label>
                <input id="features" name="features" value={form.features} onChange={onChange} placeholder="Garden, parking, open-plan kitchen…" />
              </div>
              <div className="ai-field full">
                <label htmlFor="descriptionNotes">Notes for the AI</label>
                <textarea id="descriptionNotes" name="descriptionNotes" value={form.descriptionNotes} onChange={onChange} placeholder="Unique selling points, recent renovations, nearby amenities…" />
              </div>
            </div>
            <button type="submit" className="ai-btn ai-btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
              <FaMagic /> {loading ? 'Generating…' : 'Generate listing pack'}
            </button>
            {loading && <div className="ai-loading"><span className="ai-spinner" /> Crafting marketing copy…</div>}
          </form>

          <div>
            {!result && !loading && (
              <div className="ai-panel">
                <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Results</h2>
                <p style={{ color: 'var(--ai-slate)', margin: 0 }}>
                  Your SEO title, description, social advert, email and selling points will appear here.
                  Each generation is saved to your history automatically.
                </p>
              </div>
            )}

            {result && (
              <>
                {savedId && (
                  <div className="ai-alert ai-alert-info">
                    Saved to history. <Link to={`/ai-services/history/${savedId}`}>Open saved result</Link>
                    {' · '}
                    <Link to="/ai-services">Intelligence Hub</Link>
                  </div>
                )}
                <CopyBlock title="SEO title" text={result.seoTitle}>{result.seoTitle}</CopyBlock>
                <CopyBlock title="Professional description" text={result.description}>{result.description}</CopyBlock>
                <CopyBlock title="Key selling points" text={(result.keySellingPoints || []).join('\n')}>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {(result.keySellingPoints || []).map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </CopyBlock>
                <CopyBlock title="Social media advert" text={result.socialMediaAdvert}>{result.socialMediaAdvert}</CopyBlock>
                <CopyBlock title="Email marketing text" text={result.emailMarketing}>{result.emailMarketing}</CopyBlock>
              </>
            )}
          </div>
        </div>
    </AiWorkspaceLayout>
  );
};

export default AiListingWriter;
