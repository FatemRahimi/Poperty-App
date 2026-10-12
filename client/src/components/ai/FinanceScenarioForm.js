import React, { useEffect, useRef, useState } from 'react';
import {
  EMPTY_FINANCE_SCENARIO,
  FINANCE_FREQUENCIES,
  FIELD_LABELS,
  listingChargeEvidence,
} from '../../Utils/financeScenario';
import { sectionForInputKey } from '../../Utils/underwritingInputDisplay';
import {
  LET_UNDERWRITING_STAGES,
  askingPriceEvidenceCopy,
  defaultLetStage,
  listingRentEvidenceCopy,
  subjectHasListingEvidence,
} from '../../Utils/letWorkspaceDisplay';
import './FinanceScenarioForm.css';

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="pi-fin-error" role="alert">
      {message}
    </p>
  );
}

function MoneyField({
  id,
  label,
  hint,
  value,
  frequency,
  onValueChange,
  onFrequencyChange,
  error,
  unit = '£',
  placeholder = 'Leave blank if unknown',
}) {
  const errorId = `${id}-error`;
  return (
    <div className="pi-fin-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="pi-fin-hint">{hint}</p>}
      <div className="pi-fin-money">
        <span className="pi-fin-unit" aria-hidden>{unit}</span>
        <input
          id={id}
          name={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <label className="pi-fin-freq-label" htmlFor={`${id}-frequency`}>
          <span className="pi-visually-hidden">{label} frequency</span>
          <select
            id={`${id}-frequency`}
            name={`${id}Frequency`}
            value={frequency}
            onChange={(e) => onFrequencyChange(e.target.value)}
          >
            {FINANCE_FREQUENCIES.map((freq) => (
              <option key={freq} value={freq}>
                {freq}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function ScalarField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  unit,
  placeholder = 'Leave blank if unknown',
}) {
  const errorId = `${id}-error`;
  return (
    <div className="pi-fin-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="pi-fin-hint">{hint}</p>}
      <div className="pi-fin-money pi-fin-money--scalar">
        {unit && <span className="pi-fin-unit" aria-hidden>{unit}</span>}
        <input
          id={id}
          name={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function EvidenceLine({ label, value, kind, note = null }) {
  return (
    <div className={`pi-fin-evidence pi-fin-evidence--${kind}`}>
      <p>
        <span>{label}</span>
        <strong>{value}</strong>
      </p>
      {note && <p className="pi-fin-evidence-note">{note}</p>}
    </div>
  );
}

function LetStageTabs({ active, onChange }) {
  const buttonRefs = useRef([]);

  const move = (nextIndex) => {
    const stage = LET_UNDERWRITING_STAGES[nextIndex];
    if (!stage) return;
    onChange(stage.id);
    const node = buttonRefs.current[nextIndex];
    if (node && typeof node.focus === 'function') node.focus();
  };

  const onKeyDown = (event, index) => {
    const last = LET_UNDERWRITING_STAGES.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(index === last ? 0 : index + 1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(index === 0 ? last : index - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      move(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      move(last);
    }
  };

  return (
    <div
      className="pi-fin-stage-tabs"
      role="tablist"
      aria-label="Let invest underwriting stages"
      data-testid="let-section-tabs"
    >
      {LET_UNDERWRITING_STAGES.map((stage, index) => {
        const selected = active === stage.id;
        return (
          <button
            key={stage.id}
            type="button"
            role="tab"
            id={`let-stage-tab-${stage.id}`}
            aria-selected={selected}
            aria-controls={`let-stage-panel-${stage.id}`}
            tabIndex={selected ? 0 : -1}
            className={`pi-fin-stage-tab${selected ? ' is-active' : ''}`}
            data-testid={`let-stage-tab-${stage.id}`}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            onClick={() => onChange(stage.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="pi-fin-stage-tab-check" aria-hidden>
              {selected ? '●' : '○'}
            </span>
            <span className="pi-fin-stage-tab-label">{stage.label}</span>
            {selected ? <span className="pi-fin-stage-tab-current">Current</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default function FinanceScenarioForm({
  form,
  onChange,
  errors = {},
  preview = null,
  report = null,
  stale = false,
  idPrefix = '',
  title = 'Your analysis scenario',
  intro = null,
  blankPlaceholder = 'Leave blank if unknown',
  staleMessage = 'Recalculate to apply these changes. The results below still belong to the previous scenario.',
  testId = 'finance-scenario-form',
  decisionJob = null,
  focusField = null,
  expandedSection = null,
  onExpandSection = null,
  listingSubject,
}) {
  const fieldRefs = useRef({});
  const [internalStage, setInternalStage] = useState('property_rent');
  const charges = listingChargeEvidence(preview || {});
  const facts = report?.propertyFacts?.facts || {};
  const financeRequest = report?.financeRequest || null;
  const sale = report?.marketIntelligence?.sale;
  const rent = report?.marketIntelligence?.rent;
  const listingAsking = preview?.price ?? report?.property?.price ?? null;
  const listingRent = preview?.monthly_rent ?? report?.property?.monthly_rent ?? null;
  const valuation = sale?.success ? (sale.centralEstimate?.value ?? sale.centralEstimate) : null;
  const marketLow = rent?.marketRange?.low;
  const marketHigh = rent?.marketRange?.high;
  const scFact =
    financeRequest?.serviceCharge?.propertyFact?.value != null
      ? financeRequest.serviceCharge.propertyFact
      : facts.serviceCharge?.available
        ? facts.serviceCharge
        : null;
  const grFact =
    financeRequest?.groundRent?.propertyFact?.value != null
      ? financeRequest.groundRent.propertyFact
      : facts.groundRent?.available
        ? facts.groundRent
        : null;

  const setField = (name, value) => onChange({ ...form, [name]: value });
  const showLetInvestInputs = !decisionJob || decisionJob === 'LET_INVEST';
  const showBuyFinance = decisionJob === 'BUY' || decisionJob === 'LET_INVEST' || !decisionJob;
  const showSellOnly = decisionJob === 'SELL';
  const letInvestLayout = decisionJob === 'LET_INVEST';
  const hasListing = listingSubject != null
    ? Boolean(listingSubject)
    : subjectHasListingEvidence(preview);
  const purchaseLegend = letInvestLayout ? 'Deal & rent' : 'Purchase scenario';
  const financeLegend = letInvestLayout ? 'Financing' : 'Finance';
  const resolvedIntro = intro != null
    ? intro
    : letInvestLayout
      ? 'Blank means unknown — not zero. Scenario inputs are assumptions, not observed facts.'
      : 'Optional. Blank means unknown — not zero.';

  const focusStage = focusField ? sectionForInputKey(focusField) : null;
  const requestedStage = expandedSection != null
    ? expandedSection
    : (focusStage || internalStage);
  const activeStage = letInvestLayout ? defaultLetStage(requestedStage) : null;
  const activeStageMeta = LET_UNDERWRITING_STAGES.find((s) => s.id === activeStage);

  const setStage = (id) => {
    if (typeof onExpandSection === 'function') onExpandSection(id);
    else setInternalStage(id);
  };

  useEffect(() => {
    if (!focusField) return;
    const node = fieldRefs.current[focusField];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = node.querySelector('input, select');
      if (input && typeof input.focus === 'function') input.focus();
    }
  }, [focusField]);

  const sectionVisible = (sectionId) => {
    if (!letInvestLayout) return true;
    if (activeStage === 'all') return true;
    return activeStage === sectionId;
  };

  const sectionClass = (sectionId) => {
    if (!sectionVisible(sectionId)) return 'pi-fin-section pi-fin-section--collapsed';
    return 'pi-fin-section';
  };

  const fieldWrap = (fieldKey, children) => (
    <div
      key={fieldKey}
      ref={(el) => {
        fieldRefs.current[fieldKey] = el;
      }}
      className={focusField === fieldKey ? 'pi-fin-field-wrap pi-fin-field-wrap--focus' : 'pi-fin-field-wrap'}
      data-testid={`finance-field-wrap-${fieldKey}`}
    >
      {children}
    </div>
  );

  const scEvidenceLabel =
    (scFact?.value != null &&
      `£${Number(scFact.value).toLocaleString()}${
        scFact.frequency || facts.serviceCharge?.originalFrequency
          ? `/${scFact.frequency || facts.serviceCharge.originalFrequency}`
          : ''
      }`) ||
    charges.serviceCharge?.label ||
    (hasListing ? 'Not on file' : 'No property evidence on file');
  const grEvidenceLabel =
    (grFact?.value != null &&
      `£${Number(grFact.value).toLocaleString()}${
        grFact.frequency || facts.groundRent?.originalFrequency
          ? `/${grFact.frequency || facts.groundRent.originalFrequency}`
          : ''
      }`) ||
    charges.groundRent?.label ||
    (hasListing ? 'Not on file' : 'No property evidence on file');

  const askingCopy = askingPriceEvidenceCopy(
    { price: listingAsking, source: preview?.source },
    hasListing
  );
  const listingRentCopy = listingRentEvidenceCopy(
    { monthly_rent: listingRent, source: preview?.source },
    hasListing
  );

  const purchasePriceField = fieldWrap('purchasePrice', (
    <ScalarField
      id={`${idPrefix}purchasePrice`}
      label="Your purchase price"
      hint="The price being tested in this scenario — not an observed valuation or fair value."
      unit="£"
      value={form.purchasePrice}
      onChange={(v) => setField('purchasePrice', v)}
      error={errors.purchasePrice}
      placeholder={blankPlaceholder}
    />
  ));

  const expectedRentField = showLetInvestInputs && fieldWrap('expectedRent', (
    <ScalarField
      id={`${idPrefix}expectedRent`}
      label="Your expected monthly rent"
      hint="Your scenario assumption — not area MARKET evidence, listing rent, or achieved rent."
      unit="£"
      value={form.expectedRent}
      onChange={(v) => setField('expectedRent', v)}
      error={errors.expectedRent}
      placeholder={blankPlaceholder}
    />
  ));

  const serviceChargeFields = (
    <>
      <EvidenceLine
        label={hasListing ? 'Property evidence · service charge' : 'Service charge evidence'}
        value={scEvidenceLabel}
        kind="property"
      />
      {fieldWrap('serviceCharge', (
        <MoneyField
          id={`${idPrefix}serviceCharge`}
          label="Service charge override"
          hint="Blank keeps property evidence and stays unknown. 0 means explicitly none for this scenario."
          value={form.serviceCharge}
          frequency={form.serviceChargeFrequency}
          onValueChange={(v) => setField('serviceCharge', v)}
          onFrequencyChange={(v) => setField('serviceChargeFrequency', v)}
          error={errors.serviceCharge}
          placeholder={blankPlaceholder}
        />
      ))}
      {form.serviceCharge !== '' && (
        <EvidenceLine
          label="Analysis uses (if you recalculate)"
          value={`£${form.serviceCharge}/${form.serviceChargeFrequency} · entered by you`}
          kind="user"
        />
      )}
    </>
  );

  const groundRentFields = (
    <>
      <EvidenceLine
        label={hasListing ? 'Property evidence · ground rent' : 'Ground rent evidence'}
        value={grEvidenceLabel}
        kind="property"
      />
      {fieldWrap('groundRent', (
        <MoneyField
          id={`${idPrefix}groundRent`}
          label="Ground rent override"
          hint="Blank keeps property evidence and stays unknown. 0 means explicitly none for this scenario."
          value={form.groundRent}
          frequency={form.groundRentFrequency}
          onValueChange={(v) => setField('groundRent', v)}
          onFrequencyChange={(v) => setField('groundRentFrequency', v)}
          error={errors.groundRent}
          placeholder={blankPlaceholder}
        />
      ))}
      {form.groundRent !== '' && (
        <EvidenceLine
          label="Analysis uses (if you recalculate)"
          value={`£${form.groundRent}/${form.groundRentFrequency} · entered by you`}
          kind="user"
        />
      )}
    </>
  );

  const opexAssumptionFields = showLetInvestInputs && (
    <>
      {fieldWrap('maintenance', (
        <MoneyField
          id={`${idPrefix}maintenance`}
          label={FIELD_LABELS.maintenance}
          hint="Blank is unknown, not £0. Needed with the rest of this set for NOI."
          value={form.maintenance}
          frequency={form.maintenanceFrequency}
          onValueChange={(v) => setField('maintenance', v)}
          onFrequencyChange={(v) => setField('maintenanceFrequency', v)}
          error={errors.maintenance}
          placeholder={blankPlaceholder}
        />
      ))}
      {fieldWrap('insurance', (
        <MoneyField
          id={`${idPrefix}insurance`}
          label={FIELD_LABELS.insurance}
          hint="Blank is unknown, not £0."
          value={form.insurance}
          frequency={form.insuranceFrequency}
          onValueChange={(v) => setField('insurance', v)}
          onFrequencyChange={(v) => setField('insuranceFrequency', v)}
          error={errors.insurance}
          placeholder={blankPlaceholder}
        />
      ))}
      {fieldWrap('managementFee', (
        <MoneyField
          id={`${idPrefix}managementFee`}
          label={FIELD_LABELS.managementFee}
          hint="Blank is unknown. 0 means you pay no management fee."
          value={form.managementFee}
          frequency={form.managementFeeFrequency}
          onValueChange={(v) => setField('managementFee', v)}
          onFrequencyChange={(v) => setField('managementFeeFrequency', v)}
          error={errors.managementFee}
          placeholder={blankPlaceholder}
        />
      ))}
      {fieldWrap('taxes', (
        <MoneyField
          id={`${idPrefix}taxes`}
          label={FIELD_LABELS.taxes}
          hint="Your landlord tax/cost assumption — not council tax. Blank is unknown, not £0."
          value={form.taxes}
          frequency={form.taxesFrequency}
          onValueChange={(v) => setField('taxes', v)}
          onFrequencyChange={(v) => setField('taxesFrequency', v)}
          error={errors.taxes}
          placeholder={blankPlaceholder}
        />
      ))}
      {fieldWrap('vacancyAssumption', (
        <ScalarField
          id={`${idPrefix}vacancyAssumption`}
          label="Vacancy assumption"
          hint="Blank is unknown. 0 means an explicit zero-vacancy scenario."
          unit="%"
          value={form.vacancyAssumption}
          onChange={(v) => setField('vacancyAssumption', v)}
          error={errors.vacancyAssumption}
          placeholder={blankPlaceholder}
        />
      ))}
    </>
  );

  const financeFields = showBuyFinance && (
    <>
      {fieldWrap('deposit', (
        <ScalarField
          id={`${idPrefix}deposit`}
          label={FIELD_LABELS.deposit}
          unit="£"
          value={form.deposit}
          onChange={(v) => setField('deposit', v)}
          error={errors.deposit}
          placeholder={blankPlaceholder}
        />
      ))}
      {fieldWrap('mortgageAmount', (
        <ScalarField
          id={`${idPrefix}mortgageAmount`}
          label={FIELD_LABELS.mortgageAmount}
          hint="Optional. Leave blank to let the analysis derive it from price and deposit when both are known. 0 is an explicit cash purchase."
          unit="£"
          value={form.mortgageAmount}
          onChange={(v) => setField('mortgageAmount', v)}
          error={errors.mortgageAmount}
          placeholder={blankPlaceholder}
        />
      ))}
      {fieldWrap('interestRate', (
        <ScalarField
          id={`${idPrefix}interestRate`}
          label="Interest rate"
          hint="Blank is unknown — not a 0% loan."
          unit="%"
          value={form.interestRate}
          onChange={(v) => setField('interestRate', v)}
          error={errors.interestRate}
          placeholder={blankPlaceholder}
        />
      ))}
      {fieldWrap('mortgageTermYears', (
        <ScalarField
          id={`${idPrefix}mortgageTermYears`}
          label="Mortgage term"
          hint="Leave blank if unknown. There is no assumed term."
          unit="years"
          value={form.mortgageTermYears}
          onChange={(v) => setField('mortgageTermYears', v)}
          error={errors.mortgageTermYears}
          placeholder={blankPlaceholder}
        />
      ))}
    </>
  );

  return (
    <div className="pi-fin-form" data-testid={testId}>
      <div className="pi-fin-intro">
        <h3>{title}</h3>
        <p>{resolvedIntro}</p>
      </div>

      {letInvestLayout && (
        <div className="pi-fin-unlock-guide" data-testid="let-underwriting-unlock-guide">
          <p className="pi-fin-unlock-guide-lead">Missing stays not assessed — never zero.</p>
          <LetStageTabs active={activeStage === 'all' ? 'property_rent' : activeStage} onChange={setStage} />
          {activeStageMeta && (
            <p className="pi-fin-stage-guidance" data-testid="let-stage-guidance">
              {activeStageMeta.guidance}
            </p>
          )}
        </div>
      )}

      {stale && (
        <p className="pi-fin-stale" role="status">
          {staleMessage}
        </p>
      )}

      {showSellOnly && (
        <p className="pi-fin-hint" data-testid="sell-finance-not-required">
          Finance and rental inputs are not required for a Sell workspace. Analysis uses existing
          valuation and market evidence. No optimal asking price is calculated.
        </p>
      )}

      {!showSellOnly && (
      <>
      <fieldset
        className={sectionClass('property_rent')}
        data-testid="finance-section-property-rent"
        id="let-stage-panel-property_rent"
        role={letInvestLayout ? 'tabpanel' : undefined}
        aria-labelledby={letInvestLayout ? 'let-stage-tab-property_rent' : undefined}
        hidden={letInvestLayout && !sectionVisible('property_rent')}
      >
        <legend>{purchaseLegend}</legend>
        {askingCopy.show && (
          <EvidenceLine
            label={askingCopy.label}
            value={askingCopy.value || 'Not on file'}
            kind="property"
            note={askingCopy.note}
          />
        )}
        {valuation != null && Number.isFinite(Number(valuation)) && (
          <EvidenceLine
            label="Property Intelligence valuation"
            value={`£${Number(valuation).toLocaleString()}`}
            kind="calculated"
            note="Valuation is not a purchase-price basis and not fair value for this scenario."
          />
        )}
        {purchasePriceField}
        {listingRentCopy.show && (
          <EvidenceLine
            label={listingRentCopy.label}
            value={listingRentCopy.value || 'Not on file'}
            kind="property"
          />
        )}
        {(marketLow != null || marketHigh != null) && (
          <EvidenceLine
            label="Area asking-rent evidence (MARKET · area context)"
            value={`${marketLow != null ? `£${Number(marketLow).toLocaleString()}` : '—'}–${
              marketHigh != null ? `£${Number(marketHigh).toLocaleString()}` : '—'
            } pcm · not this property’s achievable or recommended rent`}
            kind="market"
          />
        )}
        {expectedRentField}
      </fieldset>

      {letInvestLayout ? (
        <fieldset
          className={sectionClass('operating')}
          data-testid="finance-section-operating"
          id="let-stage-panel-operating"
          role="tabpanel"
          aria-labelledby="let-stage-tab-operating"
          hidden={!sectionVisible('operating')}
        >
          <legend>Operating costs</legend>
          {serviceChargeFields}
          {groundRentFields}
          {opexAssumptionFields}
        </fieldset>
      ) : (
        <>
          <fieldset className={sectionClass('operating')}>
            <legend>Property costs</legend>
            {serviceChargeFields}
            {groundRentFields}
          </fieldset>
          {showLetInvestInputs && (
            <fieldset className={sectionClass('operating')} data-testid="finance-section-operating">
              <legend>Other operating costs</legend>
              <p className="pi-fin-hint">
                Needed for NOI and net yield. Missing vacancy keeps those metrics not assessed — do not guess
                0% unless that is your scenario.
              </p>
              {opexAssumptionFields}
            </fieldset>
          )}
        </>
      )}

      {showBuyFinance && (
      <fieldset
        className={sectionClass('financing')}
        data-testid="finance-section-financing"
        id="let-stage-panel-financing"
        role={letInvestLayout ? 'tabpanel' : undefined}
        aria-labelledby={letInvestLayout ? 'let-stage-tab-financing' : undefined}
        hidden={letInvestLayout && !sectionVisible('financing')}
      >
        <legend>{financeLegend}</legend>
        {!letInvestLayout && (
          <p className="pi-fin-hint">
            Leave blank if unknown. Hidden application defaults are not applied as your inputs.
          </p>
        )}
        {financeFields}
      </fieldset>
      )}
      </>
      )}
    </div>
  );
}

export { EMPTY_FINANCE_SCENARIO };
