/**
 * LET / INVEST post-analysis presentation helpers.
 * Display only — does not invent intelligence, scores, or provenance.
 */

import { legalTitleLimitationItems } from './legalEvidenceDisplay';
import { yieldBasisText } from './decisionDossierDisplay';

export const LET_ECONOMIC_IDS = Object.freeze([
  'grossYield',
  'noi',
  'netYield',
  'annualCashFlow',
  'monthlyCashFlow',
  'dscr',
]);

export const LET_SALE_SUPPORT_IDS = Object.freeze([
  'valuation_range',
  'price_position',
  'comparable_sold_evidence',
]);

/**
 * Strict listing provenance for RESULTS / What-if.
 * A number on property.price or listingAskingPrice is not listing evidence.
 */
export function reportHasListingProvenance(report, extras = {}) {
  if (extras.listingSubject === true) return true;
  if (extras.listingSubject === false) return false;
  if (extras.linkedListing) return true;
  const access = extras.accessContext || report?.accessContext || null;
  const relationship = access?.relationship;
  if (relationship === 'owner' || relationship === 'external_linked_listing') return true;
  if (relationship === 'external_lookup') return false;
  const source = report?.property?.source || extras.preview?.source;
  if (source === 'my_listing' || source === 'marketplace') return true;
  if (source === 'external_lookup') return false;
  return false;
}

export function moneyDisplay(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  return `£${Number(n).toLocaleString()}`;
}

export function pctDisplay(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  return `${n}%`;
}

export function purchasePriceBasisRows(report, hasListing) {
  const purchase =
    report?.financeRequest?.purchasePrice ||
    report?.investment?.financeRequest?.purchasePrice ||
    null;
  const scenario = purchase?.scenarioPurchasePrice;
  const listingAsking = purchase?.listingAskingPrice ?? report?.snapshot?.price ?? report?.property?.price;
  const rows = [];
  if (scenario != null && scenario !== '') {
    rows.push({
      id: 'scenario_purchase',
      label: 'Your purchase price',
      value: moneyDisplay(scenario),
      hint: 'USER SCENARIO — the price being tested, not a valuation.',
      kind: 'USER SCENARIO',
    });
  }
  if (hasListing && listingAsking != null && listingAsking !== '') {
    rows.push({
      id: 'listing_asking',
      label: 'Listing asking price',
      value: moneyDisplay(listingAsking),
      hint: 'FACT — an asking price is not a valuation or fair value.',
      kind: 'FACT',
    });
  }
  return rows;
}

export function rentEvidenceRows(report, hasListing) {
  const expected =
    report?.financeRequest?.expectedRent ||
    report?.investment?.financeRequest?.expectedRent ||
    null;
  const rows = [];
  if (expected?.scenarioInput != null && expected.scenarioInput !== '') {
    rows.push({
      id: 'scenario_rent',
      label: 'Your expected rent',
      value: `${moneyDisplay(expected.scenarioInput)} pcm`,
      hint: 'USER SCENARIO — your rent assumption.',
      kind: 'USER SCENARIO',
    });
  }
  if (hasListing && expected?.listingMonthlyRent != null && expected.listingMonthlyRent !== '') {
    rows.push({
      id: 'listing_rent',
      label: 'Listing rent',
      value: `${moneyDisplay(expected.listingMonthlyRent)} pcm`,
      hint: 'FACT',
      kind: 'FACT',
    });
  }
  if (expected?.marketRentEvidence != null && expected.marketRentEvidence !== '') {
    rows.push({
      id: 'market_rent',
      label: 'Area asking-rent context',
      value: `${moneyDisplay(expected.marketRentEvidence)} pcm`,
      hint: 'AREA CONTEXT — not this property’s achievable, recommended, or observed rent.',
      kind: 'AREA CONTEXT',
    });
  }
  return rows;
}

export function rentBasisCalloutText(rentBasis) {
  if (!rentBasis) return null;
  let legacy = null;
  if (rentBasis.kind === 'MARKET') {
    const extra = rentBasis.marketSubstitutedForMissingListing
      ? ' Area asking-rent evidence was used where listing rent is missing — not property-specific achievable or recommended rent.'
      : ' This is not property-specific achievable or recommended rent.';
    legacy = `Rent basis for yield metrics: MARKET — area asking-rent context.${extra}`;
  } else if (rentBasis.kind === 'LISTING') {
    legacy = 'Rent basis for yield metrics: LISTING — listing-supplied rent.';
  } else if (rentBasis.kind === 'SCENARIO') {
    legacy = 'Rent basis for yield metrics: SCENARIO — your rent assumption.';
  } else if (rentBasis.label) {
    legacy = `Rent basis for yield metrics: ${rentBasis.label}.`;
  }
  const canonical = yieldBasisText(rentBasis);
  if (legacy && canonical && !legacy.includes(canonical)) return `${legacy} ${canonical}`;
  return legacy || (canonical ? `Rent basis for yield metrics: ${canonical}` : null);
}

function presentedOrWorkspace(presentedField, workspaceItem, id, label) {
  if (presentedField && Object.prototype.hasOwnProperty.call(presentedField, 'available')) {
    return {
      id,
      label,
      available: Boolean(presentedField.available),
      value: presentedField.value,
      reason: presentedField.reason,
      basis: presentedField.basis,
      state: presentedField.available ? 'ASSESSED' : (workspaceItem?.state || 'NOT_ASSESSED'),
      howToResolve: workspaceItem?.howToResolve || presentedField.reason,
      isUserInput: workspaceItem?.isUserInput,
      isPlatformEvidence: workspaceItem?.isPlatformEvidence,
      isListingAttribute: workspaceItem?.isListingAttribute,
      resolutionInputKeys: workspaceItem?.resolutionInputKeys,
      cause: workspaceItem?.cause,
    };
  }
  if (workspaceItem) {
    return { ...workspaceItem, id: workspaceItem.id || id, label: workspaceItem.label || label };
  }
  return null;
}

export function letKeyEconomics(report, workspace = null) {
  const presented = report?.investment?.presented || {};
  const key = Array.isArray(workspace?.keyIntelligence) ? workspace.keyIntelligence : [];
  const byId = {};
  key.forEach((item) => {
    if (item?.id) byId[item.id] = item;
  });
  const cashItem = byId.annualCashFlow || byId.monthlyCashFlow;
  const cashPresented = presented.annualCashFlow?.available
    ? presented.annualCashFlow
    : presented.monthlyCashFlow;
  const cashId = presented.annualCashFlow?.available || byId.annualCashFlow
    ? 'annualCashFlow'
    : 'monthlyCashFlow';
  const cashLabel = cashId === 'annualCashFlow' ? 'Annual cash flow' : 'Monthly cash flow';
  return [
    presentedOrWorkspace(presented.grossYield, byId.grossYield, 'grossYield', 'Gross yield'),
    presentedOrWorkspace(presented.noi, byId.noi, 'noi', 'NOI'),
    presentedOrWorkspace(presented.netYield, byId.netYield, 'netYield', 'Net yield'),
    presentedOrWorkspace(cashPresented, cashItem, cashId, cashLabel),
    presentedOrWorkspace(presented.dscr, byId.dscr, 'dscr', 'DSCR'),
  ].filter(Boolean);
}

export function letSaleSupportItems(workspace = null) {
  const key = Array.isArray(workspace?.keyIntelligence) ? workspace.keyIntelligence : [];
  return key.filter((item) => LET_SALE_SUPPORT_IDS.includes(item.id));
}

export function deeperLetEconomicsIncomplete(items = []) {
  return ['noi', 'netYield', 'annualCashFlow', 'monthlyCashFlow', 'dscr'].some((id) => {
    const row = items.find((item) => item.id === id);
    return row && !row.available;
  });
}

export function fitCoverage(report) {
  const pd = report?.personalDecision;
  const coverage = report?.scores?.coverage;
  const scored = coverage?.componentsScored;
  const total = coverage?.componentsTotal;
  const fitAssessed = Boolean(pd?.available && pd?.score != null);
  return {
    fitAssessed,
    score: fitAssessed ? pd.score : null,
    scored: Number.isFinite(Number(scored)) ? Number(scored) : null,
    total: Number.isFinite(Number(total)) ? Number(total) : null,
    partial: Number.isFinite(Number(scored)) && Number.isFinite(Number(total)) && Number(scored) < Number(total),
    coverageLabel:
      Number.isFinite(Number(scored)) && Number.isFinite(Number(total))
        ? `${scored} of ${total} dimensions assessed`
        : null,
  };
}

function limitationKey(row) {
  return String(row.inputKey || row.id || row.title || row.label || '').toLowerCase();
}

export function letLimitationItems({
  workspace = null,
  intelligence = null,
  economics = [],
  legalTitleDomain = null,
} = {}) {
  const items = [];
  const seen = new Set();
  const push = (row) => {
    if (!row) return;
    const key = limitationKey(row);
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(row);
  };

  const missing = workspace?.missingUnderwritingInputs?.items || [];
  missing.forEach((row) => {
    push({
      ...row,
      title: row.label,
      source: row.cause === 'MISSING_USER_INPUT' ? 'user_input' : 'platform',
    });
  });

  (economics || []).forEach((row) => {
    if (row && !row.available) {
      push({
        id: `metric_${row.id}`,
        title: row.label || row.id,
        detail: row.howToResolve || row.reason || 'Not assessed.',
        cause: row.cause || (row.isUserInput ? 'MISSING_USER_INPUT' : null),
        inputKey: row.resolutionInputKeys?.[0],
        state: 'NOT_ASSESSED',
        source: 'metric',
      });
    }
  });

  const priorities = intelligence?.investigationPriorities || workspace?.nextActions || [];
  priorities.forEach((row) => {
    push({
      id: row.id,
      title: row.title || row.label,
      detail: row.explanation || row.howToResolve || row.whyItMatters,
      state: row.state,
      importance: row.importance,
      source: 'verify',
    });
  });

  const unresolved = workspace?.unresolved || [];
  unresolved.forEach((row) => {
    if (row.importance === 'informational' || row.importance === 'context_only') return;
    push({
      id: row.id,
      title: row.label || row.whatIsMissing || row.title,
      detail: row.howToResolve || row.whyItMatters || row.detail,
      cause: row.cause,
      inputKey: row.inputKey,
      state: row.state,
      isListingAttribute: row.isListingAttribute,
      listingAttributeKey: row.listingAttributeKey,
      resolutionAction: row.resolutionAction,
      isSubjectAttribute: row.isSubjectAttribute,
      source: 'unresolved',
    });
  });

  legalTitleLimitationItems(legalTitleDomain).forEach(push);

  return items;
}

export function listingAskingWhatIfCopy(hasListing, amountLabel) {
  if (!hasListing) return null;
  return {
    label: 'FACT / BASELINE · Listing asking price',
    value: amountLabel || 'Not on file',
  };
}

export function listingRentWhatIfCopy(hasListing, amountLabel) {
  if (!hasListing) return null;
  if (amountLabel) {
    return { label: 'FACT / BASELINE · Listing rent', value: amountLabel };
  }
  return { label: 'FACT / BASELINE · Listing rent', value: 'Not on file' };
}

export function letResultsHeadline(report) {
  return report?.decisionWorkspace?.copy?.headline || 'You are assessing this property to LET / INVEST';
}
