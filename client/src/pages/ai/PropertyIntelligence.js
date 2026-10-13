import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { FaBrain, FaBookmark, FaBuilding, FaSearch } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import IntelligenceReport, { fmt } from '../../components/ai/IntelligenceReport';
import LegalTitleEvidencePanel from '../../components/ai/LegalTitleEvidencePanel';
import FinanceScenarioForm from '../../components/ai/FinanceScenarioForm';
import WhatIfPanel from '../../components/ai/WhatIfPanel';
import DecisionJobSelector from '../../components/ai/DecisionJobSelector';
import PostcodeIntelligencePanel from '../../components/ai/PostcodeIntelligencePanel';
import ExactPropertyPicker from '../../components/ai/ExactPropertyPicker';
import PropertyHeader from '../../components/ai/PropertyHeader';
import PropertyFactsSummary from '../../components/ai/PropertyFactsSummary';
import AnalysisReadinessPanel from '../../components/ai/AnalysisReadinessPanel';
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
import { sectionForInputKey } from '../../Utils/underwritingInputDisplay';
import { listingEditRoute, canEditListingFromReport } from '../../Utils/listingEditNavigation';
import {
  sanitizeIntelligenceError,
  selectedPropertyOriginLabel,
  selectedPropertyRelationshipHint,
  displaySelectedAddress,
} from '../../Utils/exactPropertyPickerDisplay';
import {
  sanitizePropertyTypeDisplay,
  buildPropertyFactsFromPreview,
} from '../../Utils/propertyFactsDisplay';
import { buildLetAnalysisReadiness, letAnalyseConsequenceCopy } from '../../Utils/analysisReadiness';
import { subjectHasListingEvidence } from '../../Utils/letWorkspaceDisplay';
import { hasExactPropertySubject as computeHasExactPropertySubject } from '../../Utils/decisionJobSelectorGate';
import {
  letResultsRestoreKey,
  restoreResultsViewport,
  shouldRestoreResultsViewport,
} from '../../Utils/resultsViewport';
import '../../components/ai/AiWorkspaceLayout.css';
import '../../components/ai/IntelligenceReport.css';
import './PropertyIntelligence.css';

const DEFAULT_INVESTIGATION_STAGES = [
  { id: 'collect', label: 'Collecting property data' },
  { id: 'enrichment', label: 'Loading external property intelligence' },
  { id: 'quality', label: 'Checking data quality' },
  { id: 'valuation', label: 'Calculating sale valuation' },
  { id: 'comparables', label: 'Finding comparable properties' },
  { id: 'financial', label: 'Calculating financial metrics' },
  { id: 'scoring', label: 'Assembling decision workspace' },
  { id: 'explanation', label: 'Preparing AI explanation' },
];

const LET_INVESTIGATION_STAGES = [
  { id: 'collect', label: 'Confirming the property' },
  { id: 'enrichment', label: 'Checking property evidence' },
  { id: 'quality', label: 'Checking what is already known' },
  { id: 'valuation', label: 'Checking price evidence' },
  { id: 'comparables', label: 'Checking rent evidence' },
  { id: 'financial', label: 'Running the letting numbers' },
  { id: 'scoring', label: 'Identifying what still needs checking' },
  { id: 'explanation', label: 'Preparing the property case' },
];

function investigationStages(decisionJob) {
  return decisionJob === 'LET_INVEST' ? LET_INVESTIGATION_STAGES : DEFAULT_INVESTIGATION_STAGES;
}

const RESIDENTIAL_GOAL_JOBS = new Set(['BUY', 'LET_INVEST', 'SELL']);

function decisionJobFromSearch(params) {
  const value = params.get('decisionJob');
  return RESIDENTIAL_GOAL_JOBS.has(value) ? value : null;
}

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPropertyId = searchParams.get('propertyId');
  const initialSubjectId = searchParams.get('subjectId');
  const initialTab = searchParams.get('tab');
  const initialDecisionJob = decisionJobFromSearch(searchParams);
  const [activeTab, setActiveTab] = useState(
    initialTab === 'mine' ? 'mine' : initialTab === 'saved' ? 'saved' : 'browse'
  );
  const [browseCount, setBrowseCount] = useState(null);
  const [query, setQuery] = useState('');
  const [ukQuery, setUkQuery] = useState(() => searchParams.get('uk') || '');
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
  const [decisionJob, setDecisionJob] = useState(initialDecisionJob);
  const [lastSubmittedScenarioKey, setLastSubmittedScenarioKey] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [baselineFinancePayload, setBaselineFinancePayload] = useState({});
  const [historyView, setHistoryView] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [browseExpanded, setBrowseExpanded] = useState(false);
  const [loadingPreviewId, setLoadingPreviewId] = useState(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [propertyFactsAttributes, setPropertyFactsAttributes] = useState(null);
  const [aiCredits, setAiCredits] = useState(null);
  const [aiPlanUnlimited, setAiPlanUnlimited] = useState(false);
  const stageTimer = useRef(null);
  const lookupInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const ukLookupRef = useRef(null);
  const previewRef = useRef(null);
  const selectionPanelRef = useRef(null);
  const financeFormRef = useRef(null);
  const propertyMatchRef = useRef(null);
  const resultsStartRef = useRef(null);
  const restoredResultsKeyRef = useRef(null);
  const [financeFocusField, setFinanceFocusField] = useState(null);
  const [financeExpandedSection, setFinanceExpandedSection] = useState(
    initialDecisionJob === 'LET_INVEST' ? 'property_rent' : null
  );

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
    setFinanceFocusField(null);
    setFinanceExpandedSection(null);
  };

  const handleFocusUnderwritingInput = useCallback((inputKey) => {
    if (!inputKey) return;
    setFinanceExpandedSection(sectionForInputKey(inputKey));
    setFinanceFocusField(inputKey);
    if (financeFormRef.current?.scrollIntoView) {
      financeFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleEditListing = useCallback(() => {
    if (!report || !canEditListingFromReport(report)) return;
    const returnPath = `/ai-services/property-intelligence?propertyId=${report.property?.id || selectedId || ''}`;
    const route = listingEditRoute(report.property, returnPath);
    if (route) navigate(route.path, { state: route.state });
  }, [navigate, report, selectedId]);

  const selectProperty = useCallback(async (id) => {
    setSelectedId(id);
    setSelectedSubjectId(null);
    setLinkedListing(null);
    setReport(null);
    setError('');
    setPropertyFactsAttributes(null);
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
      setError(sanitizeIntelligenceError(e.response?.data?.message || e.message, { kind: 'resolve' }));
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
    setReport(null);
    setHistory([]);
    resetFinanceScenario();
    ukLookupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const data = await lookupIntelligenceProperties(q);
      setLookupResult(data);
      if (data?.external?.available === false) {
        setUkLookupError('');
      }
    } catch (err) {
      const is401 = err.response?.status === 401;
      const raw =
        err.response?.data?.message ||
        err.message ||
        (is401 ? 'Session expired. Please log in again.' : 'UK property lookup failed');
      const msg = sanitizeIntelligenceError(raw, { kind: 'lookup' });
      setUkSessionExpired(is401);
      setUkLookupError(msg);
      if (!is401) setError(msg);
    } finally {
      lookupInFlightRef.current = false;
      setUkSearching(false);
    }
  };

  const changeProperty = useCallback(() => {
    setPreview(null);
    setSelectedId(null);
    setSelectedSubjectId(null);
    setLinkedListing(null);
    setAccessContext(null);
    setReport(null);
    setDecisionJob(null);
    setHistory([]);
    setError('');
    setHistoryView(false);
    setAnalysisId(null);
    setScenarioOpen(false);
    setPropertyFactsAttributes(null);
    resetFinanceScenario();
    setTimeout(() => {
      propertyMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  const selectRecentSubject = useCallback(async (subjectId) => {
    setSelectedSubjectId(subjectId);
    setSelectedId(null);
    setLinkedListing(null);
    setReport(null);
    setError('');
    setHistory([]);
    setPropertyFactsAttributes(null);
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
      setError(sanitizeIntelligenceError(err.response?.data?.message || err.message, { kind: 'resolve' }));
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
    setPropertyFactsAttributes(null);
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
      const code = err.response?.data?.code;
      if (code === 'INSUFFICIENT_CREDITS') {
        setError(err.response?.data?.message || 'Not enough AI credits to confirm this UK address.');
      } else {
        setError(
          sanitizeIntelligenceError(err.response?.data?.message || err.message, { kind: 'resolve' })
        );
      }
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
    if (!decisionJob) {
      setError('Select whether you are assessing this property to Buy, Let / Invest, or Sell.');
      return;
    }
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

    const stageCount = investigationStages(decisionJob).length;
    stageTimer.current = setInterval(() => {
      setStageIndex((i) => (i < stageCount - 1 ? i + 1 : i));
    }, 700);

    try {
      const options = { ...built.payload, decisionJob };

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
      } else if (code === 'DECISION_JOB_REQUIRED' || code === 'DECISION_JOB_INVALID' || code === 'DECISION_JOB_UNSUPPORTED') {
        setError(e.response?.data?.message || 'Select Buy, Let / Invest or Sell.');
      } else if (code === 'INSUFFICIENT_CREDITS') {
        setError('');
      } else {
        setError(e.response?.data?.message || 'Analysis failed');
      }
    } finally {
      clearInterval(stageTimer.current);
    setStageIndex(investigationStages(decisionJob).length);
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
      const storedJob = storedReport.residentialDecisionContext?.decisionJob
        || storedReport.decisionJob
        || input.decisionJob
        || null;
      if (storedJob) setDecisionJob(storedJob);
      setBaselineFinancePayload(input.options || input.finance?.options || {});
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load historical analysis');
    }
  };

  const isProfessional = accessContext?.accessLevel === 'professional_intelligence';
  const isExternal = accessContext?.relationship === 'external_lookup' || accessContext?.relationship === 'external_linked_listing';
  /** Exact subject selected/resolved — listing is optional evidence, not the gate. */
  const hasExactPropertySubject = computeHasExactPropertySubject({
    preview,
    selectedSubjectId,
    selectedId,
  });
  const hasLookupMatches =
    (lookupResult?.internal?.length ?? 0) > 0 || (lookupResult?.external?.matches?.length ?? 0) > 0;
  const showBrowseSection = browseExpanded;
  const postcodeAreaMode = Boolean(lookupResult?.postcodeIntelligence?.success && !preview);
  const scrollToPropertyMatches = useCallback(() => {
    propertyMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const canRunAnalysis = aiPlanUnlimited || aiCredits === null || aiCredits > 0;
  const scenarioStale =
    (report && isScenarioStale(financeScenario, lastSubmittedScenarioKey))
    || (historyView && serializeFinanceScenario(financeScenario) !== '{}');

  const originLabel = selectedPropertyOriginLabel({
    isExternal,
    relationship: accessContext?.relationship,
    source: preview?.source,
  });
  const relationshipHint = selectedPropertyRelationshipHint({
    relationship: accessContext?.relationship,
    source: preview?.source,
  });
  const selectedAddress = displaySelectedAddress(preview);
  const sanitizedType = sanitizePropertyTypeDisplay(preview?.property_type || preview?.propertyType);
  const propertyFacts = preview
    ? buildPropertyFactsFromPreview(preview, {
        isExternal,
        attributes: propertyFactsAttributes,
      })
    : [];
  const letReadiness =
    decisionJob === 'LET_INVEST'
      ? buildLetAnalysisReadiness({ form: financeScenario, preview, report })
      : [];
  const listingSubject = subjectHasListingEvidence(preview, { accessContext, linkedListing });
  const resultsRestoreKey = letResultsRestoreKey({
    report,
    loading,
    analysisId,
    historyView,
    subjectKey: selectedSubjectId || selectedId || '',
  });

  useLayoutEffect(() => {
    if (!shouldRestoreResultsViewport(restoredResultsKeyRef.current, resultsRestoreKey)) {
      if (!resultsRestoreKey) restoredResultsKeyRef.current = null;
      return undefined;
    }
    const node = resultsStartRef.current;
    if (!node) return undefined;
    restoredResultsKeyRef.current = resultsRestoreKey;
    restoreResultsViewport(node);
    return undefined;
  }, [resultsRestoreKey]);

  const handleDecisionJobChange = (job) => {
    setDecisionJob(job);
    if (job === 'LET_INVEST') {
      setFinanceExpandedSection('property_rent');
    } else {
      setFinanceExpandedSection(null);
    }
  };

  const renderPreAnalyseWorkspace = () => {
    if (!hasExactPropertySubject) return null;
    return (
      <section
        ref={selectionPanelRef}
        className="pi-selection-panel pi-workspace-pre"
        aria-labelledby="pi-selection-heading"
        data-testid="selected-property-confirmation"
      >
        <div ref={previewRef} className="pi-preview-anchor" />
        <p id="pi-selection-heading" className="pi-visually-hidden">
          Selected property workspace
        </p>

        <PropertyHeader
          address={selectedAddress}
          propertyType={sanitizedType}
          originLabel={originLabel}
          relationshipHint={relationshipHint}
          onChangeProperty={changeProperty}
        />

        <p className="pi-confirm-boundary" data-testid="property-confirm-boundary">
          This is the property we'll investigate.
        </p>

        {(accessContext?.uprn || preview?.uprn) ? (
          <details className="pi-identity-details" data-testid="exact-identity-details">
            <summary>Identity details</summary>
            <p>Reference {accessContext?.uprn || preview?.uprn}</p>
          </details>
        ) : null}

        <PropertyFactsSummary
          facts={propertyFacts}
          subjectId={selectedSubjectId}
          preview={preview}
          onAttributesChange={setPropertyFactsAttributes}
        />

        {linkedListing && (
          <div className="pi-linked-listing">
            <div>
              <strong>Also on our platform</strong>
              <p className="ai-insight-meta" style={{ margin: '0.25rem 0 0' }}>
                {linkedListing.title || `Listing #${linkedListing.id}`}
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

        <DecisionJobSelector
          value={decisionJob}
          onChange={handleDecisionJobChange}
          disabled={loading}
        />

        {decisionJob && (
          <div ref={financeFormRef} data-testid="finance-form-anchor">
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
              decisionJob={decisionJob}
              focusField={financeFocusField}
              expandedSection={financeExpandedSection}
              onExpandSection={setFinanceExpandedSection}
              listingSubject={listingSubject}
            />
          </div>
        )}

        {decisionJob === 'LET_INVEST' && (
          <AnalysisReadinessPanel items={letReadiness} />
        )}

        {!decisionJob && (
          <p className="pi-choose-job-hint" data-testid="decision-job-required-hint">
            Choose one for this property.
          </p>
        )}

        {(isProfessional || isExternal) && (
          <LegalTitleEvidencePanel
            key={`legal-${selectedId || ''}-${selectedSubjectId || ''}`}
            enabled
            propertyId={selectedId}
            subjectId={selectedSubjectId}
          />
        )}

        {decisionJob ? (
          <div className="pi-analyse-block">
            {decisionJob === 'LET_INVEST' && (
              <p className="pi-analyse-consequence" data-testid="let-analyse-consequence">
                {letAnalyseConsequenceCopy(letReadiness)}
              </p>
            )}
            <button
              type="button"
              className="ai-btn ai-btn-primary pi-analyse-btn"
              disabled={loading || !canRunAnalysis}
              onClick={runAnalysis}
              data-testid="analyse-property-cta"
            >
              {loading
                ? 'Analysing…'
                : scenarioStale
                  ? 'Recalculate to apply these changes'
                  : decisionJob === 'LET_INVEST'
                    ? 'Investigate property'
                    : 'Analyse Property'}
            </button>
          </div>
        ) : null}

        {!canRunAnalysis && aiCredits === 0 && decisionJob && (
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

        {canRunAnalysis && aiCredits !== null && aiCredits > 0 && !aiPlanUnlimited && decisionJob && (
          <p className="ai-insight-meta pi-credits-hint">
            Uses 1 AI credit · {aiCredits} remaining this cycle
          </p>
        )}

        {history.length > 0 && (
          <div className="pi-history-block">
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
      </section>
    );
  };

  const renderResultsChrome = () => {
    if (!preview || !report) return null;
    return (
      <div className="pi-results-chrome" data-testid="results-chrome">
        {decisionJob === 'LET_INVEST' && (
          <p className="pi-results-job-kicker" data-testid="results-job-kicker">
            LET / INVEST assessment
          </p>
        )}
        {historyView && (
          <p className="pi-snapshot-banner" data-testid="results-snapshot-banner" role="status">
            Saved snapshot — historical analysis, not a newly generated result.
          </p>
        )}
        <PropertyHeader
          address={selectedAddress}
          propertyType={sanitizedType}
          originLabel={originLabel}
          relationshipHint={relationshipHint}
          uprn={decisionJob === 'LET_INVEST' ? null : (accessContext?.uprn || preview?.uprn)}
          onChangeProperty={changeProperty}
          compact
          sticky
        />
        <div className="pi-results-actions">
          <button
            type="button"
            className="ai-btn ai-btn-ghost"
            onClick={() => {
              setReport(null);
              setScenarioOpen(false);
              setHistoryView(false);
            }}
            data-testid="analyse-another"
          >
            ← Back to inputs
          </button>
          <button
            type="button"
            className="ai-btn ai-btn-ghost"
            onClick={() => setScenarioOpen((v) => !v)}
            data-testid="toggle-revise-scenario"
          >
            {scenarioOpen ? 'Hide scenario' : 'Revise scenario'}
          </button>
        </div>
        {scenarioOpen && (
          <div className="pi-revise-scenario" data-testid="revise-scenario-panel">
            {scenarioStale && (
              <p className="pi-fin-stale" role="status" data-testid="stale-results-banner">
                Recalculate to apply these changes. The results below still belong to the previous scenario.
              </p>
            )}
            <DecisionJobSelector
              value={decisionJob}
              onChange={handleDecisionJobChange}
              disabled={loading}
            />
            <div ref={financeFormRef} data-testid="finance-form-anchor">
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
                decisionJob={decisionJob}
                focusField={financeFocusField}
                expandedSection={financeExpandedSection}
                onExpandSection={setFinanceExpandedSection}
                listingSubject={listingSubject}
              />
            </div>
            <button
              type="button"
              className="ai-btn ai-btn-primary pi-analyse-btn"
              disabled={loading || !canRunAnalysis || !decisionJob}
              onClick={runAnalysis}
            >
              {loading ? 'Analysing…' : 'Recalculate'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const findingProperty = !report && !preview;
  const pageTitle = findingProperty ? 'Find a property' : '';
  const pageSubtitle = findingProperty
    ? (hasLookupMatches
      ? 'Select the exact property.'
      : 'What property would you like to investigate?')
    : '';

  return (
    <AiWorkspaceLayout
      title={pageTitle}
      subtitle={pageSubtitle}
    >
      {!isAuthenticated && (
        <div className="ai-empty-state">
          <FaBrain className="ai-empty-state-icon" />
          <p>Sign in to analyse a UK property.</p>
          <Link to="/login" state={{ from: '/ai-services/property-intelligence' }} className="ai-btn ai-btn-primary">
            Sign in to continue
          </Link>
        </div>
      )}

      {isAuthenticated && !report && !preview && (
        <div className="pi-selector pi-selector--workspace">
          <section className="pi-uk-lookup pi-uk-lookup--primary" aria-label="Find a property" ref={ukLookupRef}>
            <form className="pi-uk-search-form" onSubmit={runUkLookup} noValidate>
              <input
                type="text"
                className="pi-search-input pi-uk-search-input"
                placeholder="e.g. B1 2UJ or Flat 301, Marks Street, B1 2UJ"
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
                Searching for matching properties…
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

            <div
              ref={propertyMatchRef}
              className="pi-property-match-anchor"
              data-testid="property-match-section"
            >
            {!ukSearching && lookupResult && hasLookupMatches && !preview && (
              <ExactPropertyPicker
                postcodeLabel={
                  postcodeAreaMode
                    ? lookupResult.postcodeIntelligence?.postcode || null
                    : null
                }
                internal={lookupResult.internal || []}
                externalMatches={lookupResult.external?.matches || []}
                selectedId={selectedId}
                selectedUprn={preview?.uprn}
                loadingPreviewId={loadingPreviewId}
                resolvingExternal={resolvingExternal}
                namedUnitUnconfirmed={Boolean(lookupResult.external?.namedUnitUnconfirmed)}
                potentiallyTruncated={Boolean(lookupResult.external?.potentiallyTruncated)}
                onSelectInternal={selectProperty}
                onSelectExternal={selectExternalMatch}
              />
            )}

            {!ukSearching && lookupResult?.external?.available === false && lookupResult?.internal?.length > 0 && !preview && (
              <p className="pi-tab-hint">
                {lookupResult.internal.length} property match{lookupResult.internal.length === 1 ? '' : 'es'} on our platform.
                Select one above to analyse — UK address lookup is optional right now.
              </p>
            )}

            {!ukSearching && lookupResult?.external?.available === false && !lookupResult?.internal?.length && (
              <div className="pi-uk-status pi-uk-status-warn" role="status" data-testid="external-lookup-unavailable">
                <strong>UK address lookup is temporarily unavailable</strong>
                <p>
                  We could not look up UK addresses right now. You can still analyse marketplace
                  listings on this platform, or try the search again later.
                </p>
              </div>
            )}

            {!ukSearching && lookupResult?.external?.available === false && !lookupResult?.internal?.length && (browseCount ?? 0) > 0 && (
              <p className="pi-uk-browse-hint">
                No exact property matches yet — you can still browse{' '}
                <strong>{browseCount}+ marketplace listings</strong>{' '}
                <button type="button" className="pi-inline-link" onClick={() => setBrowseExpanded(true)}>
                  below
                </button>
                .
              </p>
            )}

            {!ukSearching && lookupResult?.normalizedSearch?.searchAddress && !preview && (
              <p className="pi-normalized-search">
                Searched as: <strong>{lookupResult.normalizedSearch.searchAddress}</strong>
                {lookupResult.normalizedSearch.postcode
                  ? ` · Postcode ${lookupResult.normalizedSearch.postcode}`
                  : ''}
              </p>
            )}

            {!ukSearching
              && lookupResult?.external?.message
              && lookupResult?.external?.available !== false
              && !lookupResult.external?.matches?.length
              && !lookupResult.internal?.length
              && (
              <p className="pi-tab-hint pi-tab-hint-empty" data-testid="lookup-external-empty-hint">
                {sanitizeIntelligenceError(lookupResult.external.message, { kind: 'lookup' })}
              </p>
            )}

            {!ukSearching && lookupResult && !lookupResult.internal?.length && !lookupResult.external?.matches?.length && lookupResult.success && (
              <div className="pi-empty-properties" data-testid="no-exact-property-matches">
                <p>
                  <strong>No exact property matches found.</strong>
                </p>
                <p>
                  Refine the address search (include building name, flat number, and postcode), or browse
                  approved listings below. Area market context is not a selected property.
                </p>
              </div>
            )}

            {resolvingExternal && (
              <p className="ai-insight-meta" role="status" data-testid="resolving-external">
                Confirming the selected UK address…
              </p>
            )}

            {recentSubjects.length > 0 && !preview && (
              <div className="pi-lookup-section pi-recent-lookups">
                <h3 className="pi-lookup-section-title">Recent properties</h3>
                <div className="pi-recent-rows">
                  {recentSubjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`pi-recent-row ${selectedSubjectId === s.id ? 'selected' : ''}`}
                      onClick={() => selectRecentSubject(s.id)}
                    >
                      <strong>{s.address}</strong>
                      <span>Continue</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            </div>

            {!ukSearching && lookupResult?.postcodeIntelligence?.success && (
              <details className="pi-area-context-fold" data-testid="area-context-fold">
                <summary>Area market context</summary>
                <p className="pi-muted">
                  Local market snapshot for this postcode. This is not the analysis of a specific property.
                </p>
                <PostcodeIntelligencePanel
                  intelligence={lookupResult.postcodeIntelligence}
                  mode={preview ? 'secondary' : 'primary'}
                  hasExactMatches={hasLookupMatches}
                  onSelectProperty={scrollToPropertyMatches}
                />
              </details>
            )}
          </section>

          {!showBrowseSection && (
            <div className="pi-browse-collapsed">
              <button
                type="button"
                className="ai-btn ai-btn-ghost"
                onClick={() => setBrowseExpanded(true)}
              >
                Browse listings{browseCount != null ? ` (${browseCount})` : ''}
              </button>
            </div>
          )}

          {showBrowseSection && (
            <>
          <div className="pi-section-divider">
            <span>or choose from your account</span>
          </div>

          <h2 className="pi-browse-heading">Browse listings</h2>

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
                    setReport(null);
                    setHistory([]);
                    resetFinanceScenario();
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

      {isAuthenticated && hasExactPropertySubject && !report && renderPreAnalyseWorkspace()}

      {loading && (
        <div className="pi-loading-stages">
          {investigationStages(decisionJob).map((s, i) => (
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
        <div
          ref={resultsStartRef}
          className="pi-results-start"
          data-testid="results-start"
        >
          {renderResultsChrome()}
          <div className="pi-results-surface" data-testid="decision-first-results">
            <IntelligenceReport
              report={report}
              listingSubject={listingSubject}
              snapshotView={historyView}
              analysisHistory={history}
              onOpenAnalysis={loadHistoricalAnalysis}
              legalDocuments={decisionJob === 'LET_INVEST' ? (
                <LegalTitleEvidencePanel
                  key={`legal-case-${selectedId || ''}-${selectedSubjectId || ''}`}
                  enabled
                  propertyId={selectedId}
                  subjectId={selectedSubjectId}
                />
              ) : null}
              onFocusUnderwritingInput={(key) => {
                setScenarioOpen(true);
                handleFocusUnderwritingInput(key);
              }}
              onEditListing={handleEditListing}
              afterPropertyCase={decisionJob === 'LET_INVEST' ? (
                <WhatIfPanel
                  preview={preview}
                  report={report}
                  propertyId={selectedId}
                  subjectId={selectedSubjectId}
                  analysisId={analysisId}
                  baselinePayload={baselineFinancePayload}
                  listingSubject={listingSubject}
                />
              ) : null}
            />
            {decisionJob !== 'LET_INVEST' && (
            <WhatIfPanel
              preview={preview}
              report={report}
              propertyId={selectedId}
              subjectId={selectedSubjectId}
              analysisId={analysisId}
              baselinePayload={baselineFinancePayload}
              listingSubject={listingSubject}
            />
            )}
          </div>
        </div>
      )}
    </AiWorkspaceLayout>
  );
};

export default PropertyIntelligence;
