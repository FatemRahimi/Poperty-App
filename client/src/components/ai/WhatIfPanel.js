import React, { useMemo, useState } from 'react';
import FinanceScenarioForm from './FinanceScenarioForm';
import { compareIntelligenceWhatIf } from '../../services/aiService';
import {
  EMPTY_FINANCE_SCENARIO,
  buildFinanceAnalyseRequest,
  serializeFinanceScenario,
  mapServerFinanceErrors,
  humanFinanceError,
  completenessLabel,
} from '../../Utils/financeScenario';
import './WhatIfPanel.css';

const DIMENSION_LABELS = {
  affordability: 'Affordability',
  location: 'Location',
  space: 'Space',
  priceFairness: 'Price fairness',
  lifestyle: 'Lifestyle',
  transport: 'Transport',
  rentPosition: 'Rent position',
  grossYield: 'Gross yield',
  netOperating: 'Net operating position',
  cashFlow: 'Cash flow',
  vacancy: 'Vacancy',
  dscr: 'DSCR',
  risk: 'Risk',
  demand: 'Demand',
};

function money(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `£${Number(value).toLocaleString()}`;
}

function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value)}%`;
}

function signed(value, suffix = '') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const formatted = `${n > 0 ? '+' : ''}${n}${suffix}`;
  return formatted;
}

function ComparisonRow({ label, before, after, change, testId }) {
  return (
    <div className="pi-whatif-row" data-testid={testId}>
      <div className="pi-whatif-metric-name">{label}</div>
      <div className="pi-whatif-cols">
        <div>
          <span>Baseline</span>
          <strong>{before}</strong>
        </div>
        <div>
          <span>Scenario</span>
          <strong>{after}</strong>
        </div>
        <div>
          <span>Change</span>
          <strong>{change}</strong>
        </div>
      </div>
    </div>
  );
}

function formatSavedAnalysisDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function listingPreviewFromSavedReport(report) {
  const p = report?.property || {};
  const observed = p.observedFields || {};
  const preview = {
    price: p.price,
    monthly_rent: p.monthly_rent,
    bedrooms: p.bedrooms,
    property_type: p.property_type,
    epc_rating: p.epc_rating,
    tenure: p.tenure,
  };
  if (observed.serviceCharge?.available && observed.serviceCharge.value != null) {
    if (observed.serviceCharge.field === 'service_charge') {
      preview.service_charge = observed.serviceCharge.value;
    } else {
      preview.service_charges = observed.serviceCharge.value;
    }
  }
  if (observed.groundRent?.available && observed.groundRent.value != null) {
    preview.ground_rent = observed.groundRent.value;
  }
  return preview;
}

function metricCells(pair, format, deltaSuffix = '') {
  if (!pair) {
    return { before: 'Not assessed', after: 'Not assessed', change: '—' };
  }
  const beforeAssessed = pair.stateBefore !== 'notAssessed' && pair.before != null;
  const afterAssessed = pair.stateAfter !== 'notAssessed' && pair.after != null;
  return {
    before: beforeAssessed ? format(pair.before) : 'Not assessed',
    after: afterAssessed ? format(pair.after) : 'Not assessed',
    change: pair.delta == null ? '—' : signed(pair.delta, deltaSuffix),
  };
}

export default function WhatIfPanel({
  preview,
  report,
  propertyId,
  subjectId,
  analysisId,
  baselinePayload = {},
}) {
  const [form, setForm] = useState({ ...EMPTY_FINANCE_SCENARIO });
  const [profile, setProfile] = useState('landlord');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [lastSubmittedKey, setLastSubmittedKey] = useState(null);

  const submittedKey = useMemo(
    () => `${profile}::${serializeFinanceScenario(form)}`,
    [profile, form]
  );
  const stale = Boolean(result) && lastSubmittedKey !== submittedKey;
  const savedMode = Boolean(analysisId);
  const listingPreview = savedMode ? listingPreviewFromSavedReport(report) : preview;
  const listingAsking =
    result?.listing?.askingPrice ??
    (savedMode
      ? report?.property?.price
      : report?.property?.price ?? preview?.price);
  const listingRent =
    result?.listing?.monthlyRent ??
    (savedMode
      ? report?.property?.monthly_rent
      : report?.property?.monthly_rent ?? preview?.monthly_rent);
  const savedDate = formatSavedAnalysisDate(
    result?.baselineCreatedAt || result?.baselineEvidenceAsOf || report?.analysisDate || report?.evidenceAsOf
  );

  const runWhatIf = async () => {
    const built = buildFinanceAnalyseRequest(form);
    if (!built.ok) {
      const nextErrors = {};
      built.errors.forEach((item) => {
        nextErrors[item.field] = humanFinanceError(item.reason);
      });
      setErrors(nextErrors);
      setError('Check the highlighted scenario fields.');
      return;
    }

    setLoading(true);
    setError('');
    setErrors({});
    try {
      const body = {
        profile,
        analysisId: analysisId || undefined,
        scenario: built.payload,
      };
      if (!analysisId && baselinePayload && Object.keys(baselinePayload).length) {
        body.baseline = baselinePayload;
      }
      if (propertyId) body.propertyId = propertyId;
      if (subjectId) body.subjectId = subjectId;
      const data = await compareIntelligenceWhatIf(body);
      setResult(data);
      setLastSubmittedKey(submittedKey);
    } catch (e) {
      const code = e.response?.data?.code;
      if (code === 'INVALID_FINANCE_INPUT' || code === 'INTERNAL_OPTION_NOT_ALLOWED') {
        const mapped = mapServerFinanceErrors(e.response?.data?.errors || []);
        const nextErrors = {};
        mapped.forEach((item) => {
          nextErrors[item.field] = item.message;
        });
        setErrors(nextErrors);
        setError(e.response?.data?.message || 'Scenario inputs are invalid.');
      } else {
        setError(e.response?.data?.message || 'What-if comparison failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const yieldCells = metricCells(result?.change?.grossYield, pct, 'pp');
  const noiCells = metricCells(result?.change?.noi, money);
  const cashCells = metricCells(result?.change?.monthlyCashFlow, money);
  const dscrCells = metricCells(result?.change?.dscr, (n) => String(n));
  const priceCells = metricCells(
    result?.change?.purchasePrice
      ? { ...result.change.purchasePrice, stateBefore: 'assessed', stateAfter: 'assessed' }
      : null,
    money
  );
  const rentCells = metricCells(
    result?.change?.expectedRent
      ? { ...result.change.expectedRent, stateBefore: 'assessed', stateAfter: 'assessed' }
      : null,
    money
  );

  const score = result?.change?.score;
  const demand = result?.scenario?.decision?.dimensions?.demand;
  const explanation = result?.explanation;

  return (
    <section className="pi-whatif" id="pi-what-if" data-testid="whatif-panel" aria-labelledby="pi-whatif-heading">
      <h2 id="pi-whatif-heading">What-if comparison</h2>
      <p className="pi-whatif-lead">
        Compare this analysis against explicit scenario changes. The listing, property facts and saved
        report stay as they are. Recalculation uses the same Property Intelligence engines — this page
        does not invent yields, cash flow or scores.
      </p>

      {savedMode && (
        <p className="pi-whatif-notice" data-testid="whatif-saved-baseline-notice">
          {savedDate
            ? `Comparing against this saved analysis from ${savedDate}.`
            : 'Comparing against this saved analysis.'}{' '}
          What-if uses the saved baseline, not the current listing.
        </p>
      )}
      {result?.currentListingChangedSinceAnalysis === true && (
        <p className="pi-whatif-notice pi-whatif-notice--changed" data-testid="whatif-listing-changed-notice">
          The current listing has changed since this analysis. What-if uses the saved baseline.
        </p>
      )}
      {result?.baselineMode === 'saved_snapshot' && result?.crossVersionComparison && (
        <p className="pi-whatif-notice" data-testid="whatif-cross-version-notice">
          Scenario scoring uses the current comparison engine
          {result.scenarioEngineVersion ? ` (${result.scenarioEngineVersion})` : ''}; the saved baseline
          was produced by
          {result.baselineDecisionModel ? ` ${result.baselineDecisionModel}` : ' an earlier model'}.
        </p>
      )}
      {result?.baselineDecision === 'notAvailableForHistoricalSnapshot' && (
        <p className="pi-whatif-notice" data-testid="whatif-legacy-decision-notice">
          Personal Decision was not stored on this older analysis, so a historical score comparison is
          not available.
        </p>
      )}

      <div className="pi-whatif-facts" data-testid="whatif-facts">
        <p className="pi-fin-evidence pi-fin-evidence--property" data-testid="whatif-listing-asking">
          <span>FACT / BASELINE · Listing asking price</span>
          <strong>{listingAsking != null && listingAsking !== '' ? money(listingAsking) : 'Not on file'}</strong>
        </p>
        <p className="pi-fin-evidence pi-fin-evidence--property" data-testid="whatif-listing-rent">
          <span>FACT / BASELINE · Listing rent</span>
          <strong>{listingRent != null && listingRent !== '' ? `${money(listingRent)} pcm` : 'Not on file'}</strong>
        </p>
        {result && (
          <p className="pi-fin-evidence pi-fin-evidence--user">
            <span>SCENARIO INPUT · Your What-if purchase price</span>
            <strong>{money(result.scenario?.purchasePrice)}</strong>
          </p>
        )}
      </div>

      <fieldset className="pi-whatif-profile">
        <legend>Personal Decision profile</legend>
        <label>
          <input
            type="radio"
            name="whatif-profile"
            value="landlord"
            checked={profile === 'landlord'}
            onChange={() => setProfile('landlord')}
          />
          Landlord
        </label>
        <label>
          <input
            type="radio"
            name="whatif-profile"
            value="buyer_general"
            checked={profile === 'buyer_general'}
            onChange={() => setProfile('buyer_general')}
          />
          Buyer (general)
        </label>
        {profile === 'buyer_general' && (
          <p className="pi-fin-hint">
            Buyer dimensions only change where this scenario legitimately affects them (for example
            purchase price vs valuation). Commute, school and budget preference collection is not
            part of this comparison.
          </p>
        )}
      </fieldset>

      <FinanceScenarioForm
        form={form}
        onChange={(next) => {
          setForm(next);
          if (Object.keys(errors).length) setErrors({});
        }}
        errors={errors}
        preview={listingPreview}
        report={report}
        stale={stale}
        idPrefix="whatif-"
        testId="whatif-finance-form"
        title="Your What-if scenario"
        intro="Temporary comparison only. Blank keeps the baseline analysis value. Typing 0 is an explicit zero for this scenario. This does not change the listing, property facts, or saved analysis."
        blankPlaceholder="Leave blank to keep the baseline"
        staleMessage="Recalculate scenario to apply these changes."
      />

      <button
        type="button"
        className="ai-btn ai-btn-primary pi-whatif-run"
        disabled={loading}
        onClick={runWhatIf}
      >
        {loading ? 'Recalculating…' : stale ? 'Recalculate scenario' : 'Compare scenario'}
      </button>

      {error && (
        <div className="ai-alert ai-alert-error" role="alert">
          {error}
        </div>
      )}

      {stale && result && (
        <p className="pi-fin-stale" role="status" data-testid="whatif-stale-banner">
          Recalculate scenario to apply these changes.
        </p>
      )}

      {result && (
        <div className="pi-whatif-result" data-testid="whatif-result" aria-live="polite">
          <div className="pi-whatif-completeness">
            <p>
              Operating costs · baseline {completenessLabel(result.baseline?.operatingCostCompleteness)} ·
              scenario {completenessLabel(result.scenario?.operatingCostCompleteness)}
            </p>
            <p>
              Finance · baseline {completenessLabel(result.baseline?.financeCompleteness)} ·
              scenario {completenessLabel(result.scenario?.financeCompleteness)}
            </p>
          </div>

          <div className="pi-whatif-compare" data-testid="whatif-comparison">
            <ComparisonRow
              label="Purchase price"
              before={priceCells.before}
              after={priceCells.after}
              change={priceCells.change}
              testId="whatif-row-price"
            />
            <ComparisonRow
              label="Expected / market rent"
              before={rentCells.before}
              after={rentCells.after}
              change={rentCells.change}
              testId="whatif-row-rent"
            />
            <ComparisonRow
              label="Gross yield"
              before={yieldCells.before}
              after={yieldCells.after}
              change={yieldCells.change}
              testId="whatif-row-yield"
            />
            <ComparisonRow
              label="NOI"
              before={noiCells.before}
              after={noiCells.after}
              change={noiCells.change}
              testId="whatif-row-noi"
            />
            <ComparisonRow
              label="Monthly cash flow"
              before={cashCells.before}
              after={cashCells.after}
              change={cashCells.change}
              testId="whatif-row-cash"
            />
            <ComparisonRow
              label="DSCR"
              before={dscrCells.before}
              after={dscrCells.after}
              change={dscrCells.change}
              testId="whatif-row-dscr"
            />
            <ComparisonRow
              label="Personal Decision score"
              before={score?.before == null ? 'Not assessed' : String(score.before)}
              after={score?.after == null ? 'Not assessed' : String(score.after)}
              change={score?.delta == null ? '—' : signed(score.delta)}
              testId="whatif-row-score"
            />
          </div>

          {demand && (
            <p className="pi-whatif-demand" data-testid="whatif-demand">
              Landlord demand remains {demand.available ? demand.score : 'not assessed'}
              {demand.state ? ` (${demand.state})` : ''}.
            </p>
          )}

          {result.change?.dimensions && Object.keys(result.change.dimensions).length > 0 && (
            <div className="pi-whatif-dimensions" data-testid="whatif-dimensions">
              <h3>Dimensions that changed</h3>
              <ul>
                {Object.entries(result.change.dimensions).map(([key, row]) => (
                  <li key={key}>
                    {DIMENSION_LABELS[key] || key}:{' '}
                    {row.delta == null
                      ? `${row.stateBefore || 'not assessed'} → ${row.stateAfter || 'not assessed'}`
                      : signed(row.delta)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {explanation && (
            <div className="pi-whatif-why" data-testid="whatif-explanation">
              <h3>Why this scenario differs</h3>
              <p>{explanation.overall}</p>
              {(explanation.improved || []).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {(explanation.worsened || []).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {(explanation.financeChanges || []).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          <p className="pi-whatif-footnote">
            Calculated scenario result · not updated property truth. Market evidence and listing facts
            are unchanged. Score and metric changes come from the Personal Decision What-if engine.
          </p>
        </div>
      )}
    </section>
  );
}
