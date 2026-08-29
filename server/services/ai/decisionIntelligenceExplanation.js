/**
 * Decision Intelligence Phase 4 — constrained explanation of structured truth.
 * The deterministic arrays remain source of truth. This layer only paraphrases.
 * It does not score, rank, call providers, or consume heuristic strengths/risks.
 */

const { callOpenAI } = require('../openaiService');

const EXPLANATION_VERSION = 'decision-intelligence-explanation-1.0.0';
const MODE = 'structured_summary';

const EXPLANATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overview',
    'currentDriversSummary',
    'unresolvedSummary',
    'verificationSummary',
    'sensitivitySummary',
    'usedFindingIds',
    'usedPriorityIds',
    'usedDriverIds',
  ],
  properties: {
    overview: { type: 'string' },
    currentDriversSummary: { type: 'string' },
    unresolvedSummary: { type: 'string' },
    verificationSummary: { type: 'string' },
    sensitivitySummary: { type: 'string' },
    usedFindingIds: { type: 'array', items: { type: 'string' } },
    usedPriorityIds: { type: 'array', items: { type: 'string' } },
    usedDriverIds: { type: 'array', items: { type: 'string' } },
  },
};

const FORBIDDEN_OUTPUT_KEYS = Object.freeze([
  'recommendation',
  'proceed',
  'scoreDelta',
  'sensitivityScore',
  'rankScore',
  'importanceScore',
  'materialityScore',
  'riskProbability',
  'riskExposure',
]);

const FORBIDDEN_LANGUAGE = [
  /\b(you should (?:buy|purchase|proceed|avoid)|proceed to (?:buy|purchase)|proceed with (?:the )?(?:purchase|buy|deal)|do not (?:buy|proceed)|avoid this|avoid buying|make an offer|buy this|buy it|strong buy|recommended to buy)\b/i,
  /\b(good investment|bad investment|strong opportunity|top opportunity|attractive (?:investment|opportunity))\b/i,
  /\b(you must|you should definitely)\b/i,
  /\b(will let quickly|easy to let|guaranteed rent|high tenant demand|tenant demand is strong|demand is high)\b/i,
  /\b(flood risk score|creates flood risk|creates investment risk|planning risk|heritage risk|Article 4 risk)\b/i,
  /\b(extensions are restricted|development prohibited|planning permission required)\b/i,
  /\b(reduces value|value penalty|lowers the (?:price|value)|raises the (?:price|value)|valuation (?:impact|penalty|adjustment))\b/i,
  /\b(family suitability|good for families|catchment school)\b/i,
  /\b(top sensitivit|biggest (?:risk|driver|sensitivity)|most important driver|rank(?:ed|ing) driver)\b/i,
  /\b(increases score by|reduces (?:the )?landlord score|score by \d|high score means high confidence)\b/i,
];

const GROUNDED_CLAIM_PHRASES = Object.freeze([
  'flood zone',
  'listed building',
  'conservation area',
  'article 4',
  'planning application',
  'catchment',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function shortFindingLabel(item) {
  const labels = {
    finding_rent_position: 'rent-position',
    finding_gross_yield: 'gross-yield',
    finding_net_operating: 'net operating',
    finding_cash_flow: 'cash flow',
    finding_vacancy: 'vacancy',
    finding_dscr: 'DSCR',
    finding_price_position: 'purchase-price position',
  };
  return labels[item.id] || (item.title || '').replace(/\.$/, '');
}

function joinLabels(items, labelFn) {
  const labels = items.map(labelFn).filter(Boolean);
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function slimItem(item, extra = []) {
  if (!item || typeof item !== 'object') return null;
  const out = {
    id: item.id || null,
    title: item.title || null,
    explanation: item.explanation || null,
    state: item.state || null,
    scope: item.scope || null,
    importance: item.importance || null,
  };
  extra.forEach((key) => {
    if (item[key] != null) out[key] = item[key];
  });
  return out;
}

function buildExplanationFacts(decisionIntelligence = {}, personalDecision = null, confidence = null) {
  const findings = asArray(decisionIntelligence.materialFindings).map((row) => (
    slimItem(row, ['effect', 'type'])
  )).filter(Boolean);
  const unresolved = asArray(decisionIntelligence.unresolvedDependencies).map((row) => (
    slimItem(row, ['type'])
  )).filter(Boolean);
  const priorities = asArray(decisionIntelligence.investigationPriorities).map((row) => (
    slimItem(row, ['type'])
  )).filter(Boolean);
  const drivers = asArray(decisionIntelligence.sensitivityDrivers).map((row) => ({
    id: row.id || null,
    inputKey: row.inputKey || null,
    title: row.title || null,
    explanation: row.explanation || null,
    state: row.state || null,
    scope: row.scope || 'scenario',
    group: row.group || null,
    directionality: row.directionality || null,
  }));
  const demandDim = personalDecision?.dimensions?.demand || null;
  return {
    profile: decisionIntelligence.profile || personalDecision?.profile || 'landlord',
    evidenceAsOf: decisionIntelligence.evidenceAsOf || null,
    notAScore: true,
    notPurchaseAdvice: true,
    fitAvailable: Boolean(personalDecision?.available),
    fitOutcome: personalDecision?.outcome || null,
    demandAssessed: Boolean(demandDim?.available),
    demandState: demandDim?.state || 'notAssessed',
    confidence: {
      level: confidence?.level || personalDecision?.confidence?.level || null,
      assessed: confidence?.assessed ?? personalDecision?.confidence?.assessed ?? null,
      separateFromFit: true,
      note:
        'Estimate confidence is a separate axis from landlord fit. It does not change the numeric fit score.',
    },
    materialFindings: findings,
    unresolvedDependencies: unresolved,
    investigationPriorities: priorities,
    sensitivityDrivers: drivers,
    findingIds: findings.map((row) => row.id).filter(Boolean),
    priorityIds: priorities.map((row) => row.id).filter(Boolean),
    driverIds: drivers.map((row) => row.id).filter(Boolean),
  };
}

function deterministicLimitations(facts) {
  return [
    'This explanation paraphrases structured Decision Intelligence. It is not a purchase recommendation.',
    'Property-specific tenant demand is not assessed.',
    'Heuristic risk-register probabilities are not used.',
    'Personal Decision risk is not explained because it cannot be traced to sanctioned canonical evidence without heuristic risk-register fields.',
    'Estimate confidence is separate from landlord fit and does not change the fit result.',
    'Context evidence is not a legal restriction, valuation adjustment, or landlord-fit score.',
    ...(facts.demandAssessed
      ? []
      : ['The landlord demand dimension remains notAssessed and is not inferred from area market labels.']),
  ];
}

function buildDeterministicExplanation(facts) {
  const findings = facts.materialFindings || [];
  const unresolved = facts.unresolvedDependencies || [];
  const priorities = facts.investigationPriorities || [];
  const drivers = facts.sensitivityDrivers || [];
  const supporting = findings.filter((row) => row.effect === 'supporting');
  const limiting = findings.filter((row) => row.effect === 'limiting');
  const relevant = unresolved.filter((row) => row.importance === 'decision_relevant');
  const reviewing = unresolved.filter((row) => row.importance === 'worth_reviewing');
  const context = unresolved.filter((row) => row.importance === 'context_only');
  const informational = unresolved.filter((row) => row.importance === 'informational');

  const overviewParts = [];
  if (facts.fitAvailable && facts.fitOutcome) {
    overviewParts.push(
      `Landlord fit is currently assessed as ${String(facts.fitOutcome).replace(/_/g, ' ')}. Estimate confidence is reported separately and does not change that fit result.`
    );
  } else {
    overviewParts.push(
      'Overall landlord fit is not assessed from the current evidence coverage. Estimate confidence is a separate axis and does not replace missing fit evidence.'
    );
  }
  if (supporting.length) {
    overviewParts.push(`Current landlord fit is supported by the assessed ${joinLabels(supporting, shortFindingLabel)} evidence.`);
  }
  if (limiting.length) {
    overviewParts.push(`It is currently limited by ${joinLabels(limiting, shortFindingLabel)}.`);
  }
  const financeUnknown = relevant.filter((row) => (
    /vacancy|operating_costs|mortgage|purchase_price/i.test(row.id || '')
  ));
  if (financeUnknown.length) {
    overviewParts.push(
      `${joinLabels(financeUnknown, (row) => row.title)} remain not assessed because required scenario evidence is incomplete. Missing finance is notAssessed, not a risk rating.`
    );
  }
  overviewParts.push('Property-specific tenant demand is not assessed.');

  let currentDriversSummary;
  if (!findings.length) {
    currentDriversSummary =
      'No assessed evidence currently produces a material finding for this landlord scenario.';
  } else {
    currentDriversSummary = findings.map((row) => {
      const effect =
        row.effect === 'supporting'
          ? 'currently supporting this landlord scenario'
          : row.effect === 'limiting'
            ? 'currently limiting this landlord scenario'
            : row.importance === 'context_only'
              ? 'context evidence only, not a supporting or limiting landlord-fit result'
              : 'assessed without a supporting or limiting classification';
      const scope = row.scope === 'scenario'
        ? ' This is a calculated or user-scenario result, not a listing fact.'
        : '';
      return `${row.title}: ${effect}.${scope} ${row.explanation || ''}`.trim();
    }).join(' ');
  }

  const unresolvedParts = [];
  if (relevant.length) {
    unresolvedParts.push(
      `Decision-relevant unknowns: ${joinLabels(relevant, (row) => row.title)}. These remain not assessed rather than assumed as zero, clear, or low risk.`
    );
  }
  if (reviewing.length) {
    unresolvedParts.push(`Worth reviewing, but not currently blocking landlord fit: ${joinLabels(reviewing, (row) => row.title)}.`);
  }
  if (informational.length) {
    unresolvedParts.push(
      `Informational unknowns, not urgent for this landlord decision: ${joinLabels(informational, (row) => row.title)}.`
    );
  }
  if (context.length) {
    unresolvedParts.push(
      'Flood, planning, schools, listed-building, conservation-area and Article 4 evidence stay context only where recorded. They are not landlord-fit blockers, legal-restriction results, or valuation adjustments.'
    );
  }
  if (!unresolvedParts.length) {
    unresolvedParts.push('No unresolved decision-relevant dependencies were identified from canonical evidence.');
  }
  unresolvedParts.push('Property-specific tenant demand is not assessed. Area demand labels are not tenant demand.');

  let verificationSummary;
  if (!priorities.length) {
    verificationSummary = 'No decision-relevant unknowns or canonical conflicts currently require investigation.';
  } else {
    verificationSummary =
      `To strengthen this analysis, the next useful information would be: ${priorities.map((row) => row.title).join('; ')}.`;
  }

  const byKey = Object.fromEntries(drivers.map((row) => [row.inputKey, row]));
  const sensitivityParts = ['What can change this result is a scenario-input dependency map, not a ranking and not an optimisation.'];
  if (byKey.purchasePrice) {
    sensitivityParts.push('Purchase price can affect gross yield. It does not change the valuation estimate.');
  }
  if (byKey.expectedRent) {
    sensitivityParts.push('Your expected-rent assumption can affect yield and operating results. It remains a user scenario assumption, not market rent.');
  }
  if (byKey.interestRate) {
    sensitivityParts.push('Interest rate can affect cash flow and DSCR. That is not lender advice.');
  }
  if (drivers.some((row) => row.group === 'operating_costs')) {
    sensitivityParts.push('Operating-cost and vacancy assumptions can affect NOI, net yield, cash flow and DSCR once those results are assessable.');
  }
  const sensitivitySummary = sensitivityParts.join(' ');

  return {
    version: EXPLANATION_VERSION,
    mode: MODE,
    generatedFromStructuredTruth: true,
    overview: overviewParts.join(' '),
    currentDriversSummary,
    unresolvedSummary: unresolvedParts.join(' '),
    verificationSummary,
    sensitivitySummary,
    limitations: deterministicLimitations(facts),
    source: 'template',
    model: null,
    tokensUsed: 0,
    validation: { ok: true, errors: [] },
  };
}

function extractNumbers(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const found = new Set();
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  let match;
  while ((match = re.exec(text))) {
    const n = Number(String(match[0]).replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    found.add(n);
    found.add(Math.round(n));
    found.add(Math.round(n * 100) / 100);
  }
  return found;
}

function isSubsequence(candidate, allowed) {
  let index = 0;
  for (const id of candidate) {
    const found = allowed.indexOf(id, index);
    if (found === -1) return false;
    index = found + 1;
  }
  return true;
}

function titlesInOrder(text, titles) {
  let cursor = 0;
  const seen = [];
  titles.forEach((title) => {
    if (!title) return;
    const at = text.indexOf(title, cursor);
    if (at === -1) return;
    seen.push(title);
    cursor = at + title.length;
  });
  return seen;
}

function validateExplanation(parsed, facts) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['AI output was not a JSON object'] };
  }
  FORBIDDEN_OUTPUT_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      errors.push(`AI output included forbidden key "${key}"`);
    }
  });
  ['overview', 'currentDriversSummary', 'unresolvedSummary', 'verificationSummary', 'sensitivitySummary'].forEach((key) => {
    if (parsed[key] != null && typeof parsed[key] !== 'string') {
      errors.push(`${key} must be a string`);
    }
  });

  const blob = [
    parsed.overview,
    parsed.currentDriversSummary,
    parsed.unresolvedSummary,
    parsed.verificationSummary,
    parsed.sensitivitySummary,
  ].filter(Boolean).join(' ');

  FORBIDDEN_LANGUAGE.forEach((pattern) => {
    if (pattern.test(blob)) {
      errors.push(`AI output included forbidden language (${pattern})`);
    }
  });

  const findingIds = facts.findingIds || [];
  const priorityIds = facts.priorityIds || [];
  const driverIds = facts.driverIds || [];
  const usedFindings = Array.isArray(parsed.usedFindingIds) ? parsed.usedFindingIds : [];
  const usedPriorities = Array.isArray(parsed.usedPriorityIds) ? parsed.usedPriorityIds : [];
  const usedDrivers = Array.isArray(parsed.usedDriverIds) ? parsed.usedDriverIds : [];

  usedFindings.forEach((id) => {
    if (!findingIds.includes(id)) errors.push(`Unknown finding id ${id}`);
  });
  usedPriorities.forEach((id) => {
    if (!priorityIds.includes(id)) errors.push(`Unknown priority id ${id}`);
  });
  usedDrivers.forEach((id) => {
    if (!driverIds.includes(id)) errors.push(`Unknown driver id ${id}`);
  });
  if (JSON.stringify(usedFindings) !== JSON.stringify(findingIds)) {
    errors.push('Material findings were added, removed, or reordered');
  }
  if (JSON.stringify(usedPriorities) !== JSON.stringify(priorityIds)) {
    errors.push('Investigation priorities were added, removed, or reordered');
  }
  if (!isSubsequence(usedDrivers, driverIds)) {
    errors.push('Sensitivity drivers were ranked or reordered');
  }

  const findingTitles = (facts.materialFindings || []).map((row) => row.title).filter(Boolean);
  const seenFindingTitles = titlesInOrder(parsed.currentDriversSummary || '', findingTitles);
  if (findingTitles.length && seenFindingTitles.length !== findingTitles.length) {
    errors.push('Current drivers summary omitted or added material findings');
  }
  if (seenFindingTitles.length && !isSubsequence(seenFindingTitles, findingTitles)) {
    errors.push('Current drivers summary reordered material findings');
  }

  const verification = parsed.verificationSummary || '';
  const priorityTitles = (facts.investigationPriorities || []).map((row) => row.title).filter(Boolean);
  const seenTitles = titlesInOrder(verification, priorityTitles);
  if (priorityTitles.length && seenTitles.length !== priorityTitles.length) {
    errors.push('Verification summary omitted or added investigation priorities');
  }
  if (seenTitles.length && !isSubsequence(seenTitles, priorityTitles)) {
    errors.push('Verification summary reordered investigation priorities');
  }

  if (!facts.demandAssessed && /\b(demand is high|will let quickly|tenant demand is strong)\b/i.test(blob)) {
    errors.push('AI output claimed tenant demand while demand is notAssessed');
  }

  const factsText = JSON.stringify(facts).toLowerCase();
  GROUNDED_CLAIM_PHRASES.forEach((phrase) => {
    if (new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob) && !factsText.includes(phrase)) {
      errors.push(`AI output introduced an ungrounded factual assertion (${phrase})`);
    }
  });

  const allowed = extractNumbers(facts);
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100].forEach((n) => allowed.add(n));
  extractNumbers(parsed).forEach((n) => {
    if (!allowed.has(n) && !allowed.has(Math.round(n)) && !allowed.has(Math.round(n * 100) / 100)) {
      errors.push(`AI output included a number not present in the facts (${n})`);
    }
  });

  return { ok: errors.length === 0, errors };
}

const SYSTEM = `You explain canonical UK landlord Decision Intelligence. You receive ONLY the structured decisionIntelligence facts JSON.
You may paraphrase those facts into the required string fields. You must NOT create findings, priorities, drivers, ranks, scores, evidence, calculations, legal conclusions, or property facts.
Preserve supporting / limiting / neutral / context exactly. Do not add, remove, or reorder material findings. Do not reinterpret a below-market rent position as tenant demand.
Decision-relevant unknowns stay notAssessed, not risk. Worth-reviewing items are not blockers. Informational unknowns are not urgent. Context-only flood, planning, schools, listed building, conservation area and Article 4 stay context. Do not invent restrictions, value impact, family suitability, or flood/planning risk scores.
Property-specific tenant demand is not assessed. Area /demand and /demand-rent are not tenant demand.
Do not narrate heuristic risk probabilities or Personal Decision risk. Do not combine landlord fit with estimate confidence. Do not say high score means high confidence.
Do not recommend buying, selling, proceeding, avoiding, leverage, rent, or purchase price. Do not rank sensitivity drivers.
Preserve FACT / MODEL ESTIMATE / CALCULATED RESULT / USER SCENARIO / AREA CONTEXT / UNKNOWN language from the input. Do not blur those categories.
Any number you write must already appear in the input JSON.
usedFindingIds must equal findingIds in the same order. usedPriorityIds must equal priorityIds in the same order. usedDriverIds must be a subset of driverIds in the provided order.
currentDriversSummary must include every material finding title in the given order.
verificationSummary must include every investigation priority title in the given order and use wording such as "To strengthen this analysis, the next useful information would be".
Return JSON matching the schema.`;

async function defaultGenerateJson(system, facts, schema) {
  const result = await callOpenAI(system, JSON.stringify(facts), {
    temperature: 0.2,
    maxTokens: 700,
    jsonSchema: schema,
    schemaName: 'decision_intelligence_explanation',
  });
  if (!result?.parsed) {
    throw new Error('LLM unavailable');
  }
  return { parsed: result.parsed, model: result.model, tokensUsed: result.tokensUsed };
}

function emptyExplanation(reason = null) {
  return {
    version: EXPLANATION_VERSION,
    mode: MODE,
    generatedFromStructuredTruth: true,
    overview: reason || 'No structured Decision Intelligence was available to explain.',
    currentDriversSummary: null,
    unresolvedSummary: null,
    verificationSummary: null,
    sensitivitySummary: null,
    limitations: [
      'This explanation paraphrases structured Decision Intelligence. It is not a purchase recommendation.',
    ],
    source: 'template',
    model: null,
    tokensUsed: 0,
    validation: { ok: true, errors: [] },
  };
}

async function explainDecisionIntelligence({
  decisionIntelligence = null,
  personalDecision = null,
  confidence = null,
  skipLlm = false,
  generateJson = null,
} = {}) {
  if (!decisionIntelligence) return emptyExplanation();
  const facts = buildExplanationFacts(decisionIntelligence, personalDecision, confidence);
  const fallback = buildDeterministicExplanation(facts);
  if (skipLlm) return fallback;

  try {
    const generate = generateJson || defaultGenerateJson;
    const result = await generate(SYSTEM, facts, EXPLANATION_SCHEMA);
    const parsed = result?.parsed || result;
    const validation = validateExplanation(parsed, facts);
    if (!validation.ok) {
      return { ...fallback, source: 'template', validation };
    }
    return {
      version: EXPLANATION_VERSION,
      mode: MODE,
      generatedFromStructuredTruth: true,
      overview: parsed.overview || fallback.overview,
      currentDriversSummary: parsed.currentDriversSummary || fallback.currentDriversSummary,
      unresolvedSummary: parsed.unresolvedSummary || fallback.unresolvedSummary,
      verificationSummary: parsed.verificationSummary || fallback.verificationSummary,
      sensitivitySummary: parsed.sensitivitySummary || fallback.sensitivitySummary,
      limitations: fallback.limitations,
      source: 'openai',
      model: result?.model || null,
      tokensUsed: result?.tokensUsed || 0,
      validation,
    };
  } catch (err) {
    return {
      ...fallback,
      source: 'template',
      validation: { ok: false, errors: [err.message || 'LLM unavailable'] },
    };
  }
}

module.exports = {
  EXPLANATION_VERSION,
  EXPLANATION_SCHEMA,
  explainDecisionIntelligence,
  buildExplanationFacts,
  buildDeterministicExplanation,
  validateExplanation,
  emptyExplanation,
};
