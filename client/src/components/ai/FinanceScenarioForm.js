import React from 'react';
import {
  EMPTY_FINANCE_SCENARIO,
  FINANCE_FREQUENCIES,
  FIELD_LABELS,
  listingChargeEvidence,
} from '../../Utils/financeScenario';
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

function EvidenceLine({ label, value, kind }) {
  return (
    <p className={`pi-fin-evidence pi-fin-evidence--${kind}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
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
  intro = 'Optional. Blank means unknown. Typing 0 means a genuine zero for this analysis only. Nothing here is saved as a finance profile or listing fact.',
  blankPlaceholder = 'Leave blank if unknown',
  staleMessage = 'Recalculate to apply these changes. The results below still belong to the previous scenario.',
  testId = 'finance-scenario-form',
}) {
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

  const scEvidenceLabel =
    (scFact?.value != null &&
      `£${Number(scFact.value).toLocaleString()}${
        scFact.frequency || facts.serviceCharge?.originalFrequency
          ? `/${scFact.frequency || facts.serviceCharge.originalFrequency}`
          : ''
      }`) ||
    charges.serviceCharge?.label ||
    'Not on file';
  const grEvidenceLabel =
    (grFact?.value != null &&
      `£${Number(grFact.value).toLocaleString()}${
        grFact.frequency || facts.groundRent?.originalFrequency
          ? `/${grFact.frequency || facts.groundRent.originalFrequency}`
          : ''
      }`) ||
    charges.groundRent?.label ||
    'Not on file';

  return (
    <div className="pi-fin-form" data-testid={testId}>
      <div className="pi-fin-intro">
        <h3>{title}</h3>
        <p>{intro}</p>
      </div>

      {stale && (
        <p className="pi-fin-stale" role="status">
          {staleMessage}
        </p>
      )}

      <fieldset className="pi-fin-section">
        <legend>Purchase scenario</legend>
        <EvidenceLine
          label="Listing asking price"
          value={listingAsking != null && listingAsking !== '' ? `£${Number(listingAsking).toLocaleString()}` : 'Not on file'}
          kind="property"
        />
        {valuation != null && Number.isFinite(Number(valuation)) && (
          <EvidenceLine
            label="Property Intelligence valuation"
            value={`£${Number(valuation).toLocaleString()}`}
            kind="calculated"
          />
        )}
        <ScalarField
          id={`${idPrefix}purchasePrice`}
          label="Your purchase price"
          hint="Scenario only — does not replace the listing asking price."
          unit="£"
          value={form.purchasePrice}
          onChange={(v) => setField('purchasePrice', v)}
          error={errors.purchasePrice}
          placeholder={blankPlaceholder}
        />
        <EvidenceLine
          label="Listing rent"
          value={listingRent != null && listingRent !== '' ? `£${Number(listingRent).toLocaleString()} pcm` : 'Not on file'}
          kind="property"
        />
        {(marketLow != null || marketHigh != null) && (
          <EvidenceLine
            label="Market rent evidence"
            value={`${marketLow != null ? `£${Number(marketLow).toLocaleString()}` : '—'}–${
              marketHigh != null ? `£${Number(marketHigh).toLocaleString()}` : '—'
            } pcm`}
            kind="market"
          />
        )}
        <ScalarField
          id={`${idPrefix}expectedRent`}
          label="Your expected monthly rent"
          hint="Your scenario — not market, recommended or achieved rent."
          unit="£"
          value={form.expectedRent}
          onChange={(v) => setField('expectedRent', v)}
          error={errors.expectedRent}
          placeholder={blankPlaceholder}
        />
      </fieldset>

      <fieldset className="pi-fin-section">
        <legend>Property costs</legend>
        <EvidenceLine label="Property evidence · service charge" value={scEvidenceLabel} kind="property" />
        <MoneyField
          id={`${idPrefix}serviceCharge`}
          label="Service charge override"
          hint="Leave blank to keep property evidence. An entry is a scenario override for this analysis only."
          value={form.serviceCharge}
          frequency={form.serviceChargeFrequency}
          onValueChange={(v) => setField('serviceCharge', v)}
          onFrequencyChange={(v) => setField('serviceChargeFrequency', v)}
          error={errors.serviceCharge}
          placeholder={blankPlaceholder}
        />
        {form.serviceCharge !== '' && (
          <EvidenceLine
            label="Analysis uses (if you recalculate)"
            value={`£${form.serviceCharge}/${form.serviceChargeFrequency} · entered by you`}
            kind="user"
          />
        )}
        <EvidenceLine label="Property evidence · ground rent" value={grEvidenceLabel} kind="property" />
        <MoneyField
          id={`${idPrefix}groundRent`}
          label="Ground rent override"
          hint="Leave blank to keep property evidence. An entry is a scenario override for this analysis only."
          value={form.groundRent}
          frequency={form.groundRentFrequency}
          onValueChange={(v) => setField('groundRent', v)}
          onFrequencyChange={(v) => setField('groundRentFrequency', v)}
          error={errors.groundRent}
          placeholder={blankPlaceholder}
        />
        {form.groundRent !== '' && (
          <EvidenceLine
            label="Analysis uses (if you recalculate)"
            value={`£${form.groundRent}/${form.groundRentFrequency} · entered by you`}
            kind="user"
          />
        )}
      </fieldset>

      <fieldset className="pi-fin-section">
        <legend>Other operating costs</legend>
        <p className="pi-fin-hint">
          Missing vacancy may prevent a complete NOI and net yield assessment. Do not guess 0% unless
          that is your scenario.
        </p>
        <MoneyField
          id={`${idPrefix}maintenance`}
          label={FIELD_LABELS.maintenance}
          value={form.maintenance}
          frequency={form.maintenanceFrequency}
          onValueChange={(v) => setField('maintenance', v)}
          onFrequencyChange={(v) => setField('maintenanceFrequency', v)}
          error={errors.maintenance}
          placeholder={blankPlaceholder}
        />
        <MoneyField
          id={`${idPrefix}insurance`}
          label={FIELD_LABELS.insurance}
          value={form.insurance}
          frequency={form.insuranceFrequency}
          onValueChange={(v) => setField('insurance', v)}
          onFrequencyChange={(v) => setField('insuranceFrequency', v)}
          error={errors.insurance}
          placeholder={blankPlaceholder}
        />
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
        <MoneyField
          id={`${idPrefix}taxes`}
          label={FIELD_LABELS.taxes}
          hint="Your landlord tax/cost assumption — not council tax."
          value={form.taxes}
          frequency={form.taxesFrequency}
          onValueChange={(v) => setField('taxes', v)}
          onFrequencyChange={(v) => setField('taxesFrequency', v)}
          error={errors.taxes}
          placeholder={blankPlaceholder}
        />
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
      </fieldset>

      <fieldset className="pi-fin-section">
        <legend>Finance</legend>
        <p className="pi-fin-hint">
          Leave blank if unknown. Hidden application defaults are not applied as your inputs.
        </p>
        <ScalarField
          id={`${idPrefix}deposit`}
          label={FIELD_LABELS.deposit}
          unit="£"
          value={form.deposit}
          onChange={(v) => setField('deposit', v)}
          error={errors.deposit}
          placeholder={blankPlaceholder}
        />
        <ScalarField
          id={`${idPrefix}mortgageAmount`}
          label={FIELD_LABELS.mortgageAmount}
          hint="Optional. Leave blank to let the analysis derive it from price and deposit when both are known."
          unit="£"
          value={form.mortgageAmount}
          onChange={(v) => setField('mortgageAmount', v)}
          error={errors.mortgageAmount}
          placeholder={blankPlaceholder}
        />
        <ScalarField
          id={`${idPrefix}interestRate`}
          label="Interest rate"
          unit="%"
          value={form.interestRate}
          onChange={(v) => setField('interestRate', v)}
          error={errors.interestRate}
          placeholder={blankPlaceholder}
        />
        <ScalarField
          id={`${idPrefix}mortgageTermYears`}
          label="Mortgage term"
          unit="years"
          value={form.mortgageTermYears}
          onChange={(v) => setField('mortgageTermYears', v)}
          error={errors.mortgageTermYears}
          placeholder={blankPlaceholder}
        />
      </fieldset>
    </div>
  );
}

export { EMPTY_FINANCE_SCENARIO };
