/**
 * LET / INVEST Property Case presentation.
 * Reads existing report fields only. Does not score, rank, or invent evidence.
 */

import {
  letKeyEconomics,
  letLimitationItems,
  moneyDisplay,
  pctDisplay,
  purchasePriceBasisRows,
  rentEvidenceRows,
} from './letResultsDisplay';

export function letDecisionSummary(report) {
  const personal = report?.personalDecision?.profile === 'landlord'
    ? report.personalDecision
    : null;
  const overall = typeof personal?.explanation?.overall === 'string'
    ? personal.explanation.overall.trim()
    : '';
  const headline = typeof report?.decisionWorkspace?.copy?.headline === 'string'
    ? report.decisionWorkspace.copy.headline.trim()
    : '';
  const notAdvice = report?.decisionWorkspace?.copy?.notAdvice
    || 'This is not financial, investment, or legal advice.';
  return {
    text: overall || headline || 'You are assessing this property to let.',
    notAdvice,
  };
}

export function letCaseFindings(report, workspace) {
  const intelligence = report?.decisionIntelligence;
  const material = Array.isArray(intelligence?.materialFindings)
    ? intelligence.materialFindings
    : (Array.isArray(workspace?.findings) ? workspace.findings : []);
  return material.filter((item) => item && (item.title || item.explanation));
}

export function letWhatMatters(findings) {
  return (findings || [])
    .filter((item) => item?.importance !== 'context_only' && item?.importance !== 'informational')
    .slice(0, 5);
}

export function findingEffectGroup(item) {
  if (item?.effect === 'supporting') return 'opportunity';
  if (item?.effect === 'limiting') return 'risk';
  return 'neutral';
}

export function orderFindingsForCase(findings) {
  return (findings || [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rank = (item) => (
        item?.importance === 'context_only' || item?.importance === 'informational' ? 1 : 0
      );
      return rank(a.item) - rank(b.item) || a.index - b.index;
    })
    .map((row) => row.item);
}

function assessedEconomicValue(item) {
  if (!item?.available) return null;
  if (item.value == null || item.value === '') return null;
  if (item.id === 'grossYield' || item.id === 'netYield' || item.basis === 'MARKET_RENT') {
    return pctDisplay(item.value);
  }
  if (item.id === 'dscr') return String(item.value);
  if (item.id === 'noi' || item.id === 'annualCashFlow' || item.id === 'monthlyCashFlow') {
    return moneyDisplay(item.value);
  }
  return String(item.value);
}

export function letCaseKeyNumbers(report, workspace, hasListing) {
  const numbers = [];
  const purchase = purchasePriceBasisRows(report, hasListing)
    .find((row) => row.id === 'scenario_purchase');
  if (purchase?.value) {
    numbers.push({ id: 'purchasePrice', label: 'Purchase price', value: purchase.value });
  }
  const rent = rentEvidenceRows(report, hasListing)
    .find((row) => row.id === 'scenario_rent');
  if (rent?.value) {
    numbers.push({ id: 'rentAssumption', label: 'Rent assumption', value: rent.value });
  }
  letKeyEconomics(report, workspace).forEach((item) => {
    const value = assessedEconomicValue(item);
    if (!value) return;
    numbers.push({ id: item.id, label: item.label, value });
  });
  return numbers;
}

export function letCheckingItems(report, workspace) {
  return letLimitationItems({
    workspace,
    intelligence: report?.decisionIntelligence,
    economics: letKeyEconomics(report, workspace),
    legalTitleDomain: report?.legalTitleDomain,
  }).filter((row) => row?.source !== 'verify');
}

export function letCheckingCopy(row) {
  const title = row?.title || row?.label || 'This still needs checking';
  const detail = row?.detail || row?.howToResolve || row?.explanation || row?.whyItMatters || '';
  const key = String(row?.inputKey || '');
  const blob = `${key} ${title} ${detail}`;
  if (key === 'serviceCharge' || /service charge/i.test(blob)) {
    return {
      title: 'Verify the annual service charge',
      detail: 'It can materially change net income.',
    };
  }
  if (key === 'expectedRent' || /rental evidence strength|rent assumption|achievable rent/i.test(blob)) {
    return {
      title: 'Verify achievable rent for this property',
      detail: detail || 'The rent assumption is not yet strongly supported by property-specific evidence.',
    };
  }
  return { title, detail: detail || null };
}

export function letNextActions({ workspace, intelligence, limitations }) {
  const actions = [];
  const seen = new Set();
  const push = (action) => {
    if (!action?.title) return;
    const key = String(action.inputKey || action.id || action.title).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    actions.push(action);
  };

  (workspace?.nextActions || []).forEach((row) => {
    push({
      id: row.id,
      title: row.title || row.label,
      detail: row.explanation || row.howToResolve || row.whyItMatters || null,
      inputKey: row.inputKey || null,
    });
  });
  (intelligence?.investigationPriorities || []).forEach((row) => {
    push({
      id: row.id,
      title: row.title || row.label,
      detail: row.explanation || null,
      inputKey: row.inputKey || null,
    });
  });
  (limitations || []).forEach((row) => {
    if (!(row?.cause === 'MISSING_USER_INPUT' && row.inputKey)) return;
    const copy = letCheckingCopy(row);
    push({
      id: row.id || row.inputKey,
      title: copy.title,
      detail: copy.detail,
      inputKey: row.inputKey,
    });
  });
  return actions;
}
