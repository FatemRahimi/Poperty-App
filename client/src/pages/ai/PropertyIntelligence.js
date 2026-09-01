import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaBrain, FaBookmark, FaBuilding, FaClock, FaGlobeEurope, FaSearch } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import IntelligenceReport, { fmt } from '../../components/ai/IntelligenceReport';
import LegalTitleEvidencePanel from '../../components/ai/LegalTitleEvidencePanel';
import FinanceScenarioForm from '../../components/ai/FinanceScenarioForm';
import WhatIfPanel from '../../components/ai/WhatIfPanel';
import PostcodeIntelligencePanel from '../../components/ai/PostcodeIntelligencePanel';
import {
  searchIntelligenceProperties,
  fetchPropertyPreview,
  analysePropertyIntelligence,
  analyseSubjectIntelligence,
  fetchPropertyAnalysisHistory,
  fetchPropertyAnalysisById,
  lookupIntelligenceProperties,
  resolveIntelligenceSubject,
  fetchRecentSubjectLookups,
  fetchSubjectPreview,
  fetchSubjectAnalysisHistory,
  unlinkIntelligenceSubject,
} from '../../services/aiService';
import { displayAiCredits, isUnlimitedPlan, refreshAiCredits, subscribeAiCredits } from '../../services/aiCreditState';
import { canStartLookup, canStartResolve } from '../../services/providerSearchGuard';
import { useAuth } from '../../context/AuthContext';
import {
  EMPTY_FINANCE_SCENARIO,
  buildFinanceAnalyseRequest,
  serializeFinanceScenario,
  isScenarioStale,
  mapServerFinanceErrors,
  humanFinanceError,
} from '../../Utils/financeScenario';
import { savedIntelligenceReportFromRow } from '../../Utils/savedIntelligenceReport';
import '../../components/ai/AiWorkspaceLayout.css';
import '../../components/ai/IntelligenceReport.css';
import './PropertyIntelligence.css';

const STAGES = [
  { id: 'collect', label: 'Collecting property data' },
  { id: 'enrichment', label: 'Loading external property intelligence' },
  { id: 'quality', label: 'Checking data quality' },
  { id: 'valuation', label: 'Calculating sale valuation' },
  { id: 'comparables', label: 'Finding comparable properties' },
  { id: 'financial', label: 'Calculating financial metrics' },
  { id: 'scoring', label: 'Calculating landlord fit' },
  { id: 'explanation', label: 'Preparing AI explanation' },
];

const TABS = [
  { id: 'mine', label: 'My properties', icon: FaBuilding, hint: 'Properties you own or manage' },
  { id: 'saved', label: 'Saved properties', icon: FaBookmark, hint: 'Listings you saved while browsing' },
  { id: 'browse', label: 'Browse listings', icon: FaSearch, hint: 'Active listings you are considering' },
];

function readSavedPropertyIds() {
  try {
    const saved = JSON.parse(localStorage.getItem('savedProperties') || '[]');
    return saved.map((p) => p.id).filter(Boolean);
  } catch {
    return [];
  }
}

const PropertyIntelligence = () => {
  const { isAuthenticated, validateToken, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPropertyId = searchParams.get('propertyId');
  const initialSubjectId = searchParams.get('subjectId');
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    initialTab === 'mine' ? 'mine' : initialTab === 'saved' ? 'saved' : 'browse'
  );
  const [browseCount, setBrowseCount] = useState(null);
  const [query, setQuery] = useState('');
  const [ukQuery, setUkQuery] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [ukSearching, setUkSearching] = useState(false);
  const [ukLookupError, setUkLookupError] = useState('');
  const [ukSessionExpired, setUkSessionExpired] = useState(false);
  const [resolvingExternal, setResolvingExternal] = useState(false);
  const [recentSubjects, setRecentSubjects] = useState([]);
  const [linkedListing, setLinkedListing] = useState(null);
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [accessContext, setAccessContext] = useState(null);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(-1);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [financeScenario, setFinanceScenario] = useState({ ...EMPTY_FINANCE_SCENARIO });
  const [financeErrors, setFinanceErrors] = useState({});
  const [lastSubmittedScenarioKey, setLastSubmittedScenarioKey] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [baselineFinancePayload, setBaselineFinancePayload] = useState({});
  const [historyView, setHistoryView] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [browseExpanded, setBrowseExpanded] = useState(true);
  const [loadingPreviewId, setLoadingPreviewId] = useState(null);
  const [aiCredits, setAiCredits] = useState(null);
  const [aiPlanUnlimited, setAiPlanUnlimited] = useState(false);
  const stageTimer = useRef(null);
  const lookupInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const ukLookupRef = useRef(null);
  const previewRef = useRef(null);
  const selectionPanelRef = useRef(null);

  const loadProperties = useCallback(async (q = '', tab = activeTab) => {
    if (!isAuthenticated) return;
    setSearching(true);
    try {
      const savedIds = tab === 'saved' ? readSavedPropertyIds() : [];
      const data = await searchIntelligenceProperties(q, tab, savedIds);
      setProperties(data.properties || []);
      if (tab === 'browse' && !q) {
        setBrowseCount((data.properties || []).length);
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Search failed');
      setProperties([]);
    } finally {
      setSearching(false);
    }
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    loadProperties('', activeTab);
  }, [activeTab, loadProperties]);

  useEffect(() => {
    if (!isAuthenticated || initialTab) return;
    (async () => {
      try {
        const [mine, browse] = await Promise.all([
          searchIntelligenceProperties('', 'mine', []),
          searchIntelligenceProperties('', 'browse', []),
        ]);
        setBrowseCount((browse.properties || []).length);
        if (!(mine.properties || []).length && (browse.properties || []).length) {
          setActiveTab('browse');
        }
      } catch {
        /* ignore — tab load will surface errors */
      }
    })();
  }, [isAuthenticated, initialTab]);

  const loadRecentSubjects = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await fetchRecentSubjectLookups();
      setRecentSubjects(data.subjects || []);
    } catch {
      setRecentSubjects([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadRecentSubjects();
  }, [loadRecentSubjects]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const unsub = subscribeAiCredits((snap) => {
      const unlimited = isUnlimitedPlan(snap);
      setAiPlanUnlimited(unlimited);
      const shown = displayAiCredits(snap);
      setAiCredits(unlimited ? -1 : shown);
    });
    Promise.resolve(refreshAiCredits()).catch(() => {
      setAiCredits(null);
      setAiPlanUnlimited(false);
    });
    return unsub;
  }, [isAuthenticated]);

  useEffect(() => {
    const t = setTimeout(() => loadProperties(query, activeTab), 300);
    return () => clearTimeout(t);
  }, [query, activeTab, loadProperties]);

  const resetFinanceScenario = () => {
    setFinanceScenario({ ...EMPTY_FINANCE_SCENARIO });
    setFinanceErrors({});
    setLastSubmittedScenarioKey(null);
    setHistoryView(false);
    setAnalysisId(null);
    setBaselineFinancePayload({});
  };

  const selectProperty = useCallback(async (id) => {
    setSelectedId(id);
    setSelectedSubjectId(null);
    setLinkedListing(null);
    setReport(null);
    setError('');
    resetFinanceScenario();
    setLoadingPreviewId(id);
    try {
      const data = await fetchPropertyPreview(id);
      setPreview(data.property);
      setAccessContext(data.accessContext || null);
      const hist = await fetchPropertyAnalysisHistory(id);
      setHistory(hist.history || []);
      setTimeout(
        () => selectionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        100
      );
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load property');
      setPreview(null);
      setAccessContext(null);
    } finally {
      setLoadingPreviewId(null);
    }
  }, []);

  const runUkLookup = async (e) => {
    e?.preventDefault();
    if (!isAuthenticated) {
      setUkLookupError('Sign in to search UK properties.');
      return;
    }
    const token = localStorage.getItem('token');
    if (token && validateToken) {
      const validUser = await validateToken(token);
      if (!validUser) {
        setUkSessionExpired(true);
        setUkLookupError('Session expired. Please log in again.');
        if (logout) await logout();
        return;
      }
    }
    const q = ukQuery.trim();
    const gate = canStartLookup({ inFlight: lookupInFlightRef.current, query: q });
    if (!gate.ok) {
      if (gate.reason === 'too_short') {
        setUkLookupError('Enter at least 3 characters — full address with postcode works best.');
      }
      return;
    }
    lookupInFlightRef.current = true;
    setUkSearching(true);
    setUkLookupError('');
    setUkSessionExpired(false);
    setError('');
    setLookupResult(null);
    setSelectedId(null);
    setSelectedSubjectId(null);
    setPreview(null);
    setAccessContext(null);
    setLinkedListing(null);
    ukLookupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const data = await lookupIntelligenceProperties(q);
      setLookupResult(data);
      setBrowseExpanded(!(data?.internal?.length > 0));
      if (data?.external?.available === false) {
        setUkLookupError('');
      }
    } catch (err) {
      const is401 = err.response?.status === 401;
      const msg =
        err.message ||
        err.response?.data?.message ||
        (is401 ? 'Session expired. Please log in again.' : 'UK property lookup failed');
      setUkSessionExpired(is401);
      setUkLookupError(msg);
      if (!is401) setError(msg);
    } finally {
      lookupInFlightRef.current = false;
      setUkSearching(false);
    }
  };

  const selectRecentSubject = useCallback(async (subjectId) => {
    setSelectedSubjectId(subjectId);
    setSelectedId(null);
    setLinkedListing(null);
    setReport(null);
    setError('');
    setHistory([]);
    resetFinanceScenario();
    try {
      const data = await fetchSubjectPreview(subjectId);
      setPreview(data.property);
      setLinkedListing(data.linkedListing || null);
      setAccessContext(data.accessContext || null);
      const hist = await fetchSubjectAnalysisHistory(subjectId);
      setHistory(hist.history || []);
      setTimeout(() => selectionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load property');
      setPreview(null);
    }
  }, []);

  const selectExternalMatch = async (match) => {
    const gate = canStartResolve({ inFlight: resolveInFlightRef.current, uprn: match?.uprn });
    if (!gate.ok) return;
    resolveInFlightRef.current = true;
    setResolvingExternal(true);
    setError('');
    setSelectedId(null);
    setSelectedSubjectId(null);
    setLinkedListing(null);
    setReport(null);
    setHistory([]);
    resetFinanceScenario();
    try {
      const data = await resolveIntelligenceSubject({
        uprn: match.uprn,
        address: match.address,
        matchConfidence: match.matchConfidence,
      });
      const subjectId = data.accessContext?.subjectId || data.subject?.id;
      setSelectedSubjectId(subjectId);
      setPreview(data.property);
      setLinkedListing(data.linkedListing || null);
      setAccessContext(data.accessContext || null);
      if (subjectId) {
        const hist = await fetchSubjectAnalysisHistory(subjectId);
        setHistory(hist.history || []);
      }
      loadRecentSubjects();
      setTimeout(() => selectionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resolve UK property');
      setPreview(null);
    } finally {
      resolveInFlightRef.current = false;
      setResolvingExternal(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !initialPropertyId) return;
    const id = Number(initialPropertyId);
    if (!Number.isFinite(id) || id <= 0) return;
    if (initialTab === 'browse' || !initialTab) {
      setActiveTab(initialTab === 'mine' ? 'mine' : 'browse');
    }
    selectProperty(id);
  }, [isAuthenticated, initialPropertyId, initialTab, selectProperty]);

  useEffect(() => {
    if (!isAuthenticated || !initialSubjectId) return;
    const id = Number(initialSubjectId);
    if (!Number.isFinite(id) || id <= 0) return;
    selectRecentSubject(id);
  }, [isAuthenticated, initialSubjectId, selectRecentSubject]);

  const handleUnlinkListing = async () => {
    if (!selectedSubjectId || !linkedListing) return;
    if (!window.confirm('Remove the link to this marketplace listing? Analysis will use external PropertyData only.')) {
      return;
    }
    setUnlinking(true);
    setError('');
    try {
      await unlinkIntelligenceSubject(selectedSubjectId);
      setLinkedListing(null);
      setAccessContext((ctx) =>
        ctx
          ? {
              ...ctx,
              relationship: 'external_lookup',
              linkedPropertyId: null,
              propertyId: null,
            }
          : ctx
      );
      if (preview?.source === 'linked_marketplace_listing') {
        const data = await fetchSubjectPreview(selectedSubjectId);
        setPreview(data.property);
      }
      loadRecentSubjects();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to unlink listing');
    } finally {
      setUnlinking(false);
    }
  };

  const runAnalysis = async () => {
    if (!selectedId && !selectedSubjectId) return;
    const built = buildFinanceAnalyseRequest(financeScenario);
    if (!built.ok) {
      const nextErrors = {};
      built.errors.forEach((item) => {
        nextErrors[item.field] = humanFinanceError(item.reason);
      });
      setFinanceErrors(nextErrors);
      setError('Check the highlighted scenario fields.');
      return;
    }

    setLoading(true);
    setStageIndex(0);
    setError('');
    setFinanceErrors({});

    stageTimer.current = setInterval(() => {
      setStageIndex((i) => (i < STAGES.length - 1 ? i + 1 : i));
    }, 700);

    try {
      const options = built.payload;

      const data = selectedSubjectId
        ? await analyseSubjectIntelligence(selectedSubjectId, options)
        : await analysePropertyIntelligence(selectedId, options);
      setReport(data.output);
      setAccessContext(data.output?.accessContext || accessContext);
      setLastSubmittedScenarioKey(serializeFinanceScenario(financeScenario));
      setHistoryView(false);
      setAnalysisId(data.id || null);
      setBaselineFinancePayload(options);
      if (selectedId) {
        const hist = await fetchPropertyAnalysisHistory(selectedId);
        setHistory(hist.history || []);
      } else {
        loadRecentSubjects();
      }
    } catch (e) {
      const code = e.response?.data?.code;
      if (code === 'INVALID_FINANCE_INPUT') {
        const mapped = mapServerFinanceErrors(e.response?.data?.errors || []);
        const nextErrors = {};
        mapped.forEach((item) => {
          nextErrors[item.field] = item.message;
        });
        setFinanceErrors(nextErrors);
        setError(e.response?.data?.message || 'Finance inputs are invalid.');
      } else if (code === 'INSUFFICIENT_CREDITS') {
        setError('');
      } else {
        setError(e.response?.data?.message || 'Analysis failed');
      }
    } finally {
      clearInterval(stageTimer.current);
      setStageIndex(STAGES.length);
      setLoading(false);
    }
  };

  const loadHistoricalAnalysis = async (id) => {
    try {
      const data = await fetchPropertyAnalysisById(id);
      const row = data.analysis;
      const storedReport = savedIntelligenceReportFromRow(row);
      if (!storedReport) {
        setReport(null);
        return;
      }
      setReport(storedReport);
      setHistoryView(true);
      setLastSubmittedScenarioKey(null);
      setAnalysisId(row.id || id);
      const input = row.input_data || row.inputData || {};
      setBaselineFinancePayload(input.options || input.finance?.options || {});
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load historical analysis');
    }
  };

  const activeTabMeta = TABS.find((t) => t.id === activeTab);
  const isProfessional = accessContext?.accessLevel === 'professional_intelligence';
  const isExternal = accessContext?.relationship === 'external_lookup' || accessContext?.relationship === 'external_linked_listing';
  const isLinkedListing = Boolean(linkedListing || accessContext?.linkedPropertyId);
  const hasLookupMatches =
    (lookupResult?.internal?.length ?? 0) > 0 || (lookupResult?.external?.matches?.length ?? 0) > 0;
  const showBrowseSection = browseExpanded || !hasLookupMatches;
  const canRunAnalysis = aiPlanUnlimited || aiCredits === null || aiCredits > 0;
  const scenarioStale =
    (report && isScenarioStale(financeScenario, lastSubmittedScenarioKey))
    || (historyView && serializeFinanceScenario(financeScenario) !== '{}');

  const renderSelectionPanel = () => {
    if (!preview) return null;
    return (
      <section
        ref={selectionPanelRef}
        className="pi-selection-panel"
        aria-labelledby="pi-selection-heading"
      >
        <h2 id="pi-selection-heading" className="pi-selection-heading">
          Step 3 — Analyse this property
        </h2>
        <div ref={previewRef} className="pi-preview-anchor" />
        {accessContext && (
          <p className={`pi-access-badge pi-access-${accessContext.accessLevel}`}>
            {isProfessional ? 'Professional intelligence' : 'Market intelligence'} ·{' '}
            {isExternal
              ? `UK property lookup${accessContext.uprn ? ` · UPRN ${accessContext.uprn}` : ''}`
              : accessContext.relationship === 'owner'
                ? 'You manage this property'
                : 'Public listing analysis'}
            {isLinkedListing && ' · Matched to marketplace listing'}
          </p>
        )}
        {linkedListing && (
          <div className="pi-linked-listing">
            <div>
              <strong>Also on our platform</strong>
              <p className="ai-insight-meta" style={{ margin: '0.25rem 0 0' }}>
                #{linkedListing.id} · {linkedListing.title}
                {linkedListing.price ? ` · ${fmt(linkedListing.price)}` : ''}
              </p>
            </div>
            <div className="pi-linked-actions">
              <Link
                to={`/property/${linkedListing.slug || linkedListing.id}`}
                className="ai-btn ai-btn-ghost"
              >
                View listing
              </Link>
              <button
                type="button"
                className="ai-btn ai-btn-ghost pi-unlink-btn"
                disabled={unlinking}
                onClick={handleUnlinkListing}
              >
                {unlinking ? 'Unlinking…' : 'Wrong match? Unlink'}
              </button>
            </div>
          </div>
        )}
        <div className="pi-preview">
          {preview.main_image ? (
            <img src={preview.main_image} alt={preview.title} />
          ) : (
            <div className="pi-preview-placeholder" />
          )}
          <div>
            <h3 style={{ margin: '0 0 0.5rem' }}>{preview.title}</h3>
            <p className="ai-insight-meta">{preview.address_display || preview.title}</p>
            <div className="pi-preview-grid">
              <div><span>Type</span>{preview.property_type}</div>
              <div><span>Category</span>{preview.category || 'sale'}</div>
              <div><span>{isExternal ? 'Estimate' : 'Price'}</span>{fmt(preview.price)}</div>
              {!isExternal && (
                <div>
                  <span>Rent</span>
                  {preview.monthly_rent != null && preview.monthly_rent !== ''
                    ? `${fmt(preview.monthly_rent)}/mo`
                    : preview.weekly_rent != null && preview.weekly_rent !== ''
                      ? `${fmt(preview.weekly_rent)}/wk`
                      : 'Not on file'}
                </div>
              )}
              <div><span>Bedrooms</span>{preview.bedrooms ?? '—'}</div>
              <div><span>Bathrooms</span>{preview.bathrooms ?? '—'}</div>
              <div><span>Sq ft</span>{preview.square_feet ?? '—'}</div>
              {isProfessional && <div><span>Status</span>{preview.status}</div>}
            </div>
          </div>
        </div>

        {(isProfessional || isExternal) && (
          <LegalTitleEvidencePanel
            enabled
            propertyId={selectedId}
            subjectId={selectedSubjectId}
          />
        )}

        <FinanceScenarioForm
          form={financeScenario}
          onChange={(next) => {
            setFinanceScenario(next);
            if (Object.keys(financeErrors).length) setFinanceErrors({});
          }}
          errors={financeErrors}
          preview={preview}
          report={report}
          stale={scenarioStale}
        />

        {history.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h4>Your previous analyses</h4>
            <div className="pi-history">
              {history.map((h) => (
                <button key={h.id} type="button" className="pi-history-btn" onClick={() => loadHistoricalAnalysis(h.id)}>
                  {new Date(h.createdAt).toLocaleDateString()}
                  {h.confidenceLevel
                    ? ` · ${h.confidenceLevel} confidence${
                        h.confidenceLevelIsLegacyEstimate ? ' · earlier model' : ''
                      }`
                    : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="ai-btn ai-btn-primary pi-analyse-btn"
          disabled={loading || !canRunAnalysis}
          onClick={runAnalysis}
        >
          {loading ? 'Analysing…' : scenarioStale ? 'Recalculate to apply these changes' : 'Analyse Property'}
        </button>

        {!canRunAnalysis && aiCredits === 0 && (
          <div className="pi-credits-notice" role="status">
            <p>
              <strong>No AI credits remaining.</strong> Search and preview are free — running the full
              intelligence report uses 1 credit on the Free plan (3 per month).
            </p>
            <Link to="/ai-services/pricing" className="ai-btn ai-btn-primary">
              Upgrade plan
            </Link>
          </div>
        )}

        {canRunAnalysis && aiCredits !== null && aiCredits > 0 && !aiPlanUnlimited && (
          <p className="ai-insight-meta pi-credits-hint">
            Uses 1 AI credit · {aiCredits} remaining this cycle
          </p>
        )}
      </section>
    );
  };

  return (
    <AiWorkspaceLayout
      title="Property Intelligence"
      subtitle={
        hasLookupMatches && !preview
          ? `Found properties for ${lookupResult?.query || ukQuery} — select one below, then click Analyse Property.`
          : preview
            ? 'Review the property preview, then run the intelligence report.'
            : 'Search by postcode or address to analyse any UK property — you do not need to own the listing.'
      }
    >
      {!isAuthenticated && (
        <div className="ai-empty-state">
          <FaBrain className="ai-empty-state-icon" />
          <p>Sign in to run Property Intelligence on your listings or properties you are considering.</p>
          <Link to="/login" state={{ from: '/ai-services/property-intelligence' }} className="ai-btn ai-btn-primary">
            Sign in to continue
          </Link>
        </div>
      )}

      {isAuthenticated && !report && (
        <div className="pi-selector ai-panel">
          {!lookupResult && (
          <div className="pi-how-it-works">
            <h2>How Property Intelligence works</h2>
            <ol>
              <li><strong>Enter postcode or address</strong> — we search our marketplace first, then UK property databases</li>
              <li><strong>Select a property</strong> — choose from matching listings or external UK addresses</li>
              <li><strong>Analyse Property</strong> — valuation, comparables, rental intelligence, landlord fit and Decision Intelligence</li>
            </ol>
          </div>
          )}

          {!lookupResult && !preview && !ukSearching && (
            <div className="pi-empty-hero">
              <h2>Analyse a UK property</h2>
              <p>
                Enter a postcode or address to get property valuation, comparable sales, rental intelligence
                and market insights. You do not need to own or list the property.
              </p>
            </div>
          )}

          <section className="pi-uk-lookup" aria-labelledby="pi-uk-lookup-heading" ref={ukLookupRef}>
            <div className="pi-uk-lookup-header">
              <FaGlobeEurope aria-hidden />
              <div>
                <h2 id="pi-uk-lookup-heading">Search any UK property</h2>
                <p className="pi-selector-note" style={{ marginBottom: 0 }}>
                  Enter a postcode or full address. Approved marketplace listings are found immediately;
                  external UK data enriches the analysis when configured.
                </p>
              </div>
            </div>
            <form className="pi-uk-search-form" onSubmit={runUkLookup} noValidate>
              <input
                type="text"
                className="pi-search-input pi-uk-search-input"
                placeholder="Enter postcode or address, e.g. B1 2UJ or Flat 301, Marks Street, B1 2UJ"
                value={ukQuery}
                onChange={(e) => {
                  setUkQuery(e.target.value);
                  if (ukLookupError) setUkLookupError('');
                }}
                autoComplete="street-address"
                aria-label="UK address or postcode"
                disabled={ukSearching || resolvingExternal}
              />
              <button
                type="submit"
                className="ai-btn ai-btn-primary pi-uk-search-btn"
                disabled={ukSearching || resolvingExternal || !ukQuery.trim()}
              >
                {ukSearching ? 'Searching…' : 'Search'}
              </button>
            </form>

            {ukSearching && (
              <div className="pi-uk-status pi-uk-status-loading" role="status" aria-live="polite">
                <span className="ai-spinner pi-uk-spinner" aria-hidden />
                Searching UK property databases…
              </div>
            )}

            {ukLookupError && !ukSearching && (
              <div className="pi-uk-status pi-uk-status-error" role="alert">
                <p style={{ margin: 0 }}>{ukLookupError}</p>
                {ukSessionExpired && (
                  <Link
                    to="/login"
                    state={{ from: '/ai-services/property-intelligence' }}
                    className="ai-btn ai-btn-primary"
                    style={{ marginTop: '0.75rem', display: 'inline-flex' }}
                  >
                    Sign in again
                  </Link>
                )}
              </div>
            )}

            {!ukSearching && lookupResult?.postcodeIntelligence?.success && (
              <PostcodeIntelligencePanel intelligence={lookupResult.postcodeIntelligence} />
            )}

            {!ukSearching && lookupResult && (lookupResult.internal?.length > 0 || lookupResult.external?.matches?.length > 0) && (
              <>
                <h3 className="pi-lookup-select-heading">Step 2 — Select an address/property</h3>
                <p className="pi-tab-hint pi-lookup-action-hint">
                  Tap a property below to load its preview, then click <strong>Analyse Property</strong>.
                </p>
              </>
            )}

            {!ukSearching && lookupResult?.internal?.length > 0 && (
              <div className="pi-lookup-section">
                <h3 className="pi-lookup-section-title">
                  On our platform ({lookupResult.internal.length})
                </h3>
                <div className="pi-property-list pi-lookup-results-list">
                  {lookupResult.internal.map((p) => (
                    <button
                      key={`uk-int-${p.id}`}
                      type="button"
                      className={`pi-property-option ${selectedId === p.id ? 'selected' : ''}`}
                      onClick={() => selectProperty(p.id)}
                      disabled={loadingPreviewId === p.id}
                    >
                      {p.main_image ? (
                        <img src={p.main_image} alt="" />
                      ) : (
                        <div className="pi-property-placeholder" />
                      )}
                      <div>
                        <strong>{p.title || p.address_display}</strong>
                        <p className="ai-insight-meta" style={{ margin: 0 }}>
                          #{p.id} · {p.address_display || p.city}
                          {p.matchMethod ? ` · ${p.matchMethod.replace(/_/g, ' ')}` : ''}
                          {p.source === 'my_listing' ? ' · Your listing' : ' · Marketplace'}
                          {loadingPreviewId === p.id ? ' · Loading…' : selectedId === p.id ? ' · Selected' : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!ukSearching && lookupResult?.external?.available === false && lookupResult?.internal?.length > 0 && (
              <p className="pi-tab-hint">
                {lookupResult.internal.length} listing{lookupResult.internal.length === 1 ? '' : 's'} found on our platform.
                Select one above to analyse — external UK lookup is optional.
              </p>
            )}

            {!ukSearching && lookupResult?.external?.available === false && !lookupResult?.internal?.length && (
              <div className="pi-uk-status pi-uk-status-warn" role="status">
                <strong>External UK lookup is not active yet</strong>
                <p>{lookupResult.external.message}</p>
                {lookupResult.external.reason === 'missing_api_key' ? (
                  <ol className="pi-uk-setup-steps">
                    <li>
                      Create an account at{' '}
                      <a href="https://propertydata.co.uk" target="_blank" rel="noopener noreferrer">
                        propertydata.co.uk
                      </a>{' '}
                      and copy your API key
                    </li>
                    <li>
                      Open <code>server/.env</code> and set:{' '}
                      <code>PROPERTYDATA_API_KEY=your_key_here</code>
                    </li>
                    <li>Restart the backend server (<code>npm start</code> in the server folder)</li>
                    <li>Refresh this page and search again</li>
                  </ol>
                ) : (
                  <p className="ai-insight-meta" style={{ margin: '0.35rem 0 0' }}>
                    Set <code>PROPERTYDATA_ENABLED=true</code> in <code>server/.env</code>, then restart
                    the server.
                  </p>
                )}
              </div>
            )}

            {!ukSearching && lookupResult?.external?.available === false && !lookupResult?.internal?.length && (browseCount ?? 0) > 0 && (
              <p className="pi-uk-browse-hint">
                No postcode matches on our platform yet — you can still browse{' '}
                <strong>{browseCount}+ marketplace listings</strong>{' '}
                <button type="button" className="pi-inline-link" onClick={() => setBrowseExpanded(true)}>
                  below
                </button>
                .
              </p>
            )}

            {!ukSearching && lookupResult?.normalizedSearch?.searchAddress && (
              <p className="pi-normalized-search">
                Searched as: <strong>{lookupResult.normalizedSearch.searchAddress}</strong>
                {lookupResult.normalizedSearch.postcode
                  ? ` · Postcode ${lookupResult.normalizedSearch.postcode}`
                  : ''}
              </p>
            )}

            {!ukSearching && lookupResult?.external?.message && lookupResult?.external?.available !== false && (
              <p className={`pi-tab-hint ${lookupResult.external.matches?.length ? '' : 'pi-tab-hint-empty'}`}>
                {lookupResult.external.message}
              </p>
            )}

            {!ukSearching && lookupResult?.external?.matches?.length > 0 && (
              <div className="pi-lookup-section">
                <h3 className="pi-lookup-section-title">Other UK properties (PropertyData)</h3>
                <div className="pi-property-list">
                  {lookupResult.external.matches.map((m) => (
                    <button
                      key={m.uprn}
                      type="button"
                      className={`pi-property-option pi-external-option ${selectedSubjectId && preview?.uprn === m.uprn ? 'selected' : ''}`}
                      onClick={() => selectExternalMatch(m)}
                      disabled={resolvingExternal}
                    >
                      <div className="pi-property-placeholder pi-external-icon" aria-hidden />
                      <div>
                        <strong>{m.address}</strong>
                        <p className="ai-insight-meta" style={{ margin: 0 }}>
                          UPRN {m.uprn}
                          {m.matchConfidence ? ` · ${m.matchConfidence} confidence` : ''}
                          {m.classificationCodeDesc ? ` · ${m.classificationCodeDesc}` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!ukSearching && lookupResult && !lookupResult.internal?.length && !lookupResult.external?.matches?.length && lookupResult.success && (
              <div className="pi-empty-properties">
                <p>
                  <strong>No properties matched.</strong> Try a full postcode (e.g. B1 2UJ), check spelling,
                  or browse marketplace listings below.
                </p>
              </div>
            )}

            {resolvingExternal && <p className="ai-insight-meta">Loading property profile…</p>}

            {recentSubjects.length > 0 && (
              <div className="pi-lookup-section pi-recent-lookups">
                <h3 className="pi-lookup-section-title">
                  <FaClock aria-hidden /> Recent UK lookups
                </h3>
                <div className="pi-property-list">
                  {recentSubjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`pi-property-option pi-external-option ${selectedSubjectId === s.id ? 'selected' : ''}`}
                      onClick={() => selectRecentSubject(s.id)}
                    >
                      <div className="pi-property-placeholder pi-external-icon" aria-hidden />
                      <div>
                        <strong>{s.address}</strong>
                        <p className="ai-insight-meta" style={{ margin: 0 }}>
                          UPRN {s.uprn}
                          {s.linkedPropertyId ? ` · Linked listing #${s.linkedPropertyId}` : ''}
                          {s.lastAccessedAt
                            ? ` · ${new Date(s.lastAccessedAt).toLocaleDateString()}`
                            : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {!showBrowseSection && hasLookupMatches && (
            <div className="pi-browse-collapsed">
              <button
                type="button"
                className="ai-btn ai-btn-ghost"
                onClick={() => setBrowseExpanded(true)}
              >
                Browse all platform listings{browseCount != null ? ` (${browseCount})` : ''}
              </button>
            </div>
          )}

          {showBrowseSection && (
            <>
          <div className="pi-section-divider">
            <span>or browse platform listings</span>
          </div>

          <h2>Select from our marketplace</h2>
          <p className="pi-selector-note">
            Choose from your portfolio, saved listings, or active properties on the platform.
            Market intelligence uses public listing data and approved comparables — private owner and agency
            details are only shown when you manage the property.
          </p>

          <div className="pi-tab-row" role="tablist" aria-label="Property source">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`pi-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setQuery('');
                    setSelectedId(null);
                    setSelectedSubjectId(null);
                    setPreview(null);
                    setAccessContext(null);
                  }}
                >
                  <Icon aria-hidden /> {tab.label}
                  {tab.id === 'browse' && browseCount != null && browseCount > 0 && (
                    <span className="pi-tab-count">{browseCount}</span>
                  )}
                </button>
              );
            })}
          </div>
          {activeTabMeta && <p className="pi-tab-hint">{activeTabMeta.hint}</p>}

          <div className="pi-search-row">
            <input
              type="search"
              className="pi-search-input"
              placeholder={
                activeTab === 'mine'
                  ? 'Search your properties…'
                  : 'Search by title, city, postcode or property ID…'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search properties"
            />
          </div>

          {searching && <p className="ai-insight-meta">Searching…</p>}

          <div className="pi-property-list">
            {properties.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pi-property-option ${selectedId === p.id ? 'selected' : ''}`}
                onClick={() => selectProperty(p.id)}
              >
                {p.main_image ? (
                  <img src={p.main_image} alt="" />
                ) : (
                  <div className="pi-property-placeholder" />
                )}
                <div>
                  <strong>{p.title}</strong>
                  <p className="ai-insight-meta" style={{ margin: 0 }}>
                    #{p.id} · {p.address_display || p.city} · {p.property_type}
                    {activeTab === 'browse' && p.price ? ` · ${fmt(p.price)}` : ''}
                  </p>
                </div>
              </button>
            ))}
            {!searching && properties.length === 0 && activeTab === 'mine' && (
              <div className="pi-empty-properties">
                <p><strong>No properties in your account.</strong> Add a listing from your dashboard, or switch to Browse listings to analyse a property you are considering.</p>
                <div className="pi-empty-actions">
                  <Link to="/dashboard" className="ai-btn ai-btn-primary">My dashboard</Link>
                  <button type="button" className="ai-btn ai-btn-ghost" onClick={() => setActiveTab('browse')}>
                    Browse listings
                  </button>
                </div>
              </div>
            )}
            {!searching && properties.length === 0 && activeTab === 'saved' && (
              <div className="pi-empty-properties">
                <p><strong>No saved properties yet.</strong> Save listings while browsing, then return here to analyse them.</p>
                <Link to="/find" className="ai-btn ai-btn-primary">Find properties</Link>
              </div>
            )}
            {!searching && properties.length === 0 && activeTab === 'browse' && (
              <div className="pi-empty-properties">
                <p><strong>No matching listings found.</strong> Try a different search or browse the main property search.</p>
                <Link to="/find" className="ai-btn ai-btn-primary">Find properties</Link>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      )}

      {isAuthenticated && preview && renderSelectionPanel()}

      {loading && (
        <div className="pi-loading-stages">
          {STAGES.map((s, i) => (
            <div key={s.id} className={`pi-stage ${i < stageIndex ? 'done' : i === stageIndex ? 'active' : ''}`}>
              <span className="pi-stage-dot" />
              {s.label}
            </div>
          ))}
        </div>
      )}

      {error && <div className="ai-alert ai-alert-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {report?.insufficientData && !loading && (
        <div className="pi-insufficient" style={{ marginTop: '1rem' }}>
          <h3>Not enough information to produce a reliable analysis</h3>
          <p className="ai-insight-meta">Missing:</p>
          <ul className="pi-missing-list">
            {(report.dataQuality?.requiredMissing || report.dataQuality?.missing || []).map((m) => (
              <li key={m}>{m}</li>
            ))}
            {!report.snapshot?.rent && <li>Rental estimate or listed rent</li>}
            {!report.marketIntelligence?.comparableCount && <li>Comparable properties</li>}
          </ul>
          {isProfessional ? (
            <Link to="/dashboard" className="ai-btn ai-btn-primary">Complete property information</Link>
          ) : (
            <Link to="/find" className="ai-btn ai-btn-primary">Browse other listings</Link>
          )}
        </div>
      )}

      {report && !loading && !report.insufficientData && (
        <>
          {scenarioStale && (
            <p className="pi-fin-stale" role="status" data-testid="stale-results-banner">
              Recalculate to apply these changes. The results below still belong to the previous scenario.
            </p>
          )}
          <button type="button" className="ai-btn ai-btn-ghost" style={{ marginBottom: '1rem' }} onClick={() => setReport(null)}>
            ← Analyse another property
          </button>
          <IntelligenceReport report={report} />
          <WhatIfPanel
            preview={preview}
            report={report}
            propertyId={selectedId}
            subjectId={selectedSubjectId}
            analysisId={analysisId}
            baselinePayload={baselineFinancePayload}
          />
        </>
      )}
    </AiWorkspaceLayout>
  );
};

export default PropertyIntelligence;
