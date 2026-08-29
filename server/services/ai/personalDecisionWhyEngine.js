/**
 * Why Engine for personal-decision-1.0.0.
 *
 * The deterministic score, outcome, constraints and why[] remain the source of
 * truth. This layer only explains those facts. It never scores, never invents
 * evidence, and never issues a purchase recommendation.
 */

const { callOpenAI } = require('../openaiService');
const {
  WHY_ENGINE_VERSION,
  OUTCOME_THRESHOLDS,
  FIT_OUTCOMES,
  DIMENSION_LABELS,
  getProfile,
} = require('../../config/personalDecision.config');

const OUTCOME_LABELS = {
  strong_fit: 'strong fit',
  good_fit: 'good fit',
  mixed_fit: 'mixed fit',
  weak_fit: 'weak fit',
  unsuitable: 'unsuitable',
};

const FORBIDDEN_KEYS = [
  'score',
  'fitScore',
  'overallScore',
  'matchScore',
  'recommendation',
  'proceed',
  'decision',
  'outcome',
];

const PURCHASE_TALK =
  /\b(you should (?:buy|purchase)|proceed to (?:buy|purchase)|make an offer|put in an offer|buy this|buy it|recommended to buy|go ahead and buy|place an offer|you should proceed)\b/i;

const WHY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overallFit',
    'strongestFactors',
    'weakestOrUnavailable',
    'constraintFailures',
    'confidenceLimitations',
    'whatWouldHelp',
  ],
  properties: {
    overallFit: { type: 'string' },
    strongestFactors: { type: 'array', items: { type: 'string' } },
    weakestOrUnavailable: { type: 'array', items: { type: 'string' } },
    constraintFailures: { type: 'array', items: { type: 'string' } },
    confidenceLimitations: { type: 'string' },
    whatWouldHelp: { type: 'array', items: { type: 'string' } },
  },
};

const WHY_SYSTEM = `You are explaining a UK personal-fit assessment. The profile is in the facts.
You receive ONLY pre-calculated JSON facts. You may paraphrase those facts. You may not add new ones.

You MAY:
- explain the overall fit using the given outcome and score
- explain the strongest positive factors from the provided evidence
- explain the weakest or unavailable dimensions from the provided evidence
- explain hard-constraint failures from the provided list
- explain confidence limitations from the provided confidence object
- tell the user what additional information would improve the assessment, using the provided whatWouldHelp facts

You must NOT:
- change or restate a different numeric score than the one given
- create a new score or ranking
- invent property facts, prices, rents, yields, comparables, commute times, or valuations
- change constraint results
- generate a purchase recommendation (do not say proceed, buy, make an offer, or that they should purchase)

Return JSON matching the schema only. British English. No markdown.`;

function dimensionLabel(key) {
  return DIMENSION_LABELS[key] || key;
}

function strongestDimensions(decision, limit = 3) {
  return (decision.why || [])
    .filter((row) => row.available && Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || b.weight - a.weight)
    .slice(0, limit);
}

function weakestOrUnavailable(decision, limit = 4) {
  const missing = (decision.why || []).filter((row) => !row.available);
  const weak = (decision.why || [])
    .filter((row) => row.available && Number.isFinite(row.score) && row.score < 70)
    .sort((a, b) => a.score - b.score);
  return [...missing, ...weak].slice(0, limit);
}

function whatWouldHelp(decision) {
  const items = [];
  (decision.notAssessed || []).forEach((row) => {
    if (row.reason) items.push(row.reason);
  });
  (decision.why || []).forEach((row) => {
    if (row.available && row.state === 'incomplete_preference' && row.evidence?.length) {
      items.push(row.evidence[row.evidence.length - 1]);
    }
  });
  if (!decision.confidence?.assessed || ['Low', 'Not assessed', 'Insufficient', null].includes(decision.confidence?.level)) {
    items.push(
      'A more evidenced valuation (more similar comparables, or an additional estimate method) would strengthen estimate confidence — it would not change the fit score itself.'
    );
  }
  return [...new Set(items.filter(Boolean))];
}

function buildDeterministicExplanation(decision = {}) {
  const outcome = decision.outcome;
  const label = OUTCOME_LABELS[outcome] || null;
  const overall = [];

  const requirementPhrase =
    getProfile(decision.profile)?.requirementPhrase || 'stated requirements';

  if (!decision.available) {
    overall.push(
      decision.unavailableReason ||
        'Personal fit could not be scored because too little of the required evidence was available.'
    );
  } else if (outcome === 'unsuitable') {
    overall.push(
      `This property is unsuitable against the ${requirementPhrase} (fit score ${decision.score}/100). The score is still shown so the failed constraint can be read alongside the rest of the fit.`
    );
  } else {
    overall.push(
      `This property is a ${label} for the ${requirementPhrase} (fit score ${decision.score}/100). That describes personal suitability, not a transaction instruction.`
    );
  }

  const positives = strongestDimensions(decision).map((row) => ({
    dimension: row.dimension,
    score: row.score,
    evidence: row.evidence || [],
    text: `${dimensionLabel(row.dimension)} scored ${row.score}/100${
      row.evidence?.length ? ` — ${row.evidence.join('; ')}` : ''
    }.`,
  }));

  const weakest = weakestOrUnavailable(decision).map((row) => ({
    dimension: row.dimension,
    available: row.available,
    score: row.score,
    evidence: row.evidence || [],
    unavailableReason: row.unavailableReason || null,
    text: row.available
      ? `${dimensionLabel(row.dimension)} is a weaker factor at ${row.score}/100${
          row.evidence?.length ? ` — ${row.evidence.join('; ')}` : ''
        }.`
      : `${dimensionLabel(row.dimension)} was not assessed: ${row.unavailableReason}`,
  }));

  const constraints = (decision.constraintFailures || []).map((f) => ({
    constraint: f.constraint,
    state: f.state,
    detail: f.detail,
    text: f.detail,
  }));

  const confidenceLevel = decision.confidence?.level || 'Not assessed';
  const confidence = {
    level: confidenceLevel,
    assessed: decision.confidence?.assessed ?? null,
    text: decision.available
      ? `Estimate confidence is ${confidenceLevel}. It sets decision strength (${decision.decisionStrength}) only. It does not change the fit score${
          decision.score == null ? '' : ` of ${decision.score}`
        } or the fit outcome${label ? ` (${label})` : ''}.`
      : `Estimate confidence is ${confidenceLevel}. There is no fit score to qualify.`,
  };

  const help = whatWouldHelp(decision).map((text) => ({ text }));

  return {
    engine: WHY_ENGINE_VERSION,
    source: 'deterministic',
    overall: overall.join(' '),
    strongestFactors: positives,
    weakestOrUnavailable: weakest,
    constraintFailures: constraints,
    confidenceLimitations: confidence,
    whatWouldHelp: help,
  };
}

function buildWhyFacts(decision) {
  return {
    profile: decision.profile,
    model: decision.model,
    available: decision.available,
    score: decision.score,
    outcome: decision.outcome,
    decision: decision.decision,
    decisionStrength: decision.decisionStrength,
    constraintFailures: decision.constraintFailures || [],
    coverage: decision.coverage,
    confidence: {
      level: decision.confidence?.level || null,
      assessed: decision.confidence?.assessed ?? null,
      model: decision.confidence?.model || null,
    },
    why: decision.why || [],
    notAssessed: decision.notAssessed || [],
    deterministicExplanation: decision.deterministicExplanation || buildDeterministicExplanation(decision),
    outcomeThresholds: decision.model?.outcomeThresholds || OUTCOME_THRESHOLDS,
    allowedOutcomes: FIT_OUTCOMES,
    instructions: {
      scoreIsReadOnly: true,
      outcomeIsReadOnly: true,
      doNotRecommendPurchase: true,
    },
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

function validateAiNarrative(parsed, facts, schema = WHY_SCHEMA) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['AI output was not a JSON object'] };
  }

  FORBIDDEN_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      errors.push(`AI output included forbidden key "${key}"`);
    }
  });

  const required = Object.keys(schema.properties || {});
  required.forEach((key) => {
    if (parsed[key] == null) errors.push(`Missing "${key}"`);
  });

  Object.entries(schema.properties || {}).forEach(([key, spec]) => {
    if (parsed[key] == null) return;
    if (spec.type === 'string' && typeof parsed[key] !== 'string') {
      errors.push(`${key} must be a string`);
    }
    if (spec.type === 'array') {
      if (!Array.isArray(parsed[key])) errors.push(`${key} must be an array of strings`);
      else if (parsed[key].some((item) => typeof item !== 'string')) {
        errors.push(`${key} must contain only strings`);
      }
    }
  });

  const overallKey = schema.properties.overallFit
    ? 'overallFit'
    : schema.properties.overallDelta
      ? 'overallDelta'
      : null;
  if (overallKey && (typeof parsed[overallKey] !== 'string' || !parsed[overallKey].trim())) {
    errors.push(`${overallKey} must be a non-empty string`);
  }

  const blob = JSON.stringify(parsed);
  if (PURCHASE_TALK.test(blob)) {
    errors.push('AI output included a purchase recommendation');
  }

  const allowed = extractNumbers(facts);
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 50, 65, 80, 100].forEach((n) => allowed.add(n));
  const used = extractNumbers(parsed);
  used.forEach((n) => {
    if (!allowed.has(n) && !allowed.has(Math.round(n)) && !allowed.has(Math.round(n * 100) / 100)) {
      errors.push(`AI output included a number not present in the facts (${n})`);
    }
  });

  return { ok: errors.length === 0, errors };
}

async function defaultGenerateJson(system, facts, schema) {
  const result = await callOpenAI(system, JSON.stringify(facts), {
    temperature: 0.2,
    maxTokens: 800,
    jsonSchema: schema,
    schemaName: 'personal_decision_why',
  });
  if (!result?.parsed) {
    throw new Error('LLM unavailable');
  }
  return { parsed: result.parsed, model: result.model, tokensUsed: result.tokensUsed };
}

async function explainPersonalDecision(decision, options = {}) {
  const deterministicExplanation =
    decision.deterministicExplanation || buildDeterministicExplanation(decision);
  const facts = buildWhyFacts({ ...decision, deterministicExplanation });

  const ai = {
    available: false,
    source: null,
    model: null,
    tokensUsed: 0,
    validation: { ok: false, errors: [] },
  };
  let aiNarrative = null;

  const generate = options.generateJson || defaultGenerateJson;

  try {
    const result = await generate(WHY_SYSTEM, facts, WHY_SCHEMA);
    const parsed = result?.parsed || result;
    const validation = validateAiNarrative(parsed, facts);
    ai.validation = validation;
    ai.model = result?.model || options.model || null;
    ai.tokensUsed = result?.tokensUsed || 0;
    if (validation.ok) {
      ai.available = true;
      ai.source = options.source || 'openai';
      aiNarrative = {
        overallFit: parsed.overallFit,
        strongestFactors: parsed.strongestFactors,
        weakestOrUnavailable: parsed.weakestOrUnavailable,
        constraintFailures: parsed.constraintFailures,
        confidenceLimitations: parsed.confidenceLimitations,
        whatWouldHelp: parsed.whatWouldHelp,
        source: ai.source,
        model: ai.model,
      };
    } else {
      ai.source = 'rejected';
    }
  } catch (err) {
    ai.source = 'unavailable';
    ai.validation = { ok: false, errors: [err.message || 'LLM unavailable'] };
  }

  return {
    ...decision,
    score: decision.score,
    outcome: decision.outcome,
    decision: decision.decision,
    constraintFailures: decision.constraintFailures,
    dimensions: decision.dimensions,
    why: decision.why,
    deterministicExplanation,
    aiNarrative,
    whyEngine: {
      version: WHY_ENGINE_VERSION,
      profile: 'buyer_general',
      ai,
    },
  };
}

const DELTA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overallDelta',
    'improved',
    'worsened',
    'unchanged',
    'constraintChanges',
    'financeChanges',
    'confidenceNote',
  ],
  properties: {
    overallDelta: { type: 'string' },
    improved: { type: 'array', items: { type: 'string' } },
    worsened: { type: 'array', items: { type: 'string' } },
    unchanged: { type: 'array', items: { type: 'string' } },
    constraintChanges: { type: 'array', items: { type: 'string' } },
    financeChanges: { type: 'array', items: { type: 'string' } },
    confidenceNote: { type: 'string' },
  },
};

const DELTA_SYSTEM = `You are explaining a UK personal-fit what-if comparison. The profile is in the facts.
You receive ONLY a pre-calculated delta JSON. You may paraphrase those facts. You may not add new ones.

You MAY:
- explain how the overall fit score and outcome changed, using the given numbers
- explain which dimensions improved, worsened, or stayed the same
- explain constraint changes from the provided list
- explain financing changes from the provided list
- note whether estimate confidence and valuation were held constant

You must NOT:
- change either score or invent a third score
- invent property facts, prices, rents, yields, comparables, or valuations
- change constraint results
- rerun or contradict the valuation
- generate a purchase recommendation (do not say proceed, buy, make an offer, or that they should purchase)

Return JSON matching the schema only. British English. No markdown.`;

function signed(n) {
  if (!Number.isFinite(n)) return 'unchanged';
  if (n > 0) return `+${n}`;
  return String(n);
}

function buildDeterministicDeltaExplanation(comparison = {}) {
  const before = comparison.baseScore;
  const after = comparison.scenarioScore;
  const scoreBit =
    before == null && after == null
      ? 'Neither the base nor the scenario fit could be scored.'
      : before == null
        ? `The scenario produced a fit score of ${after}/100; the base analysis could not be scored.`
        : after == null
          ? `The base fit score was ${before}/100; the scenario could not be scored.`
          : before === after
            ? `The fit score is unchanged at ${before}/100.`
            : `The fit score moved from ${before}/100 to ${after}/100 (${signed(comparison.scoreDelta)}).`;

  const outcomeBit =
    comparison.outcomeBefore === comparison.outcomeAfter
      ? `The fit outcome remains ${comparison.outcomeAfter || 'unscored'}.`
      : `The fit outcome moved from ${comparison.outcomeBefore || 'unscored'} to ${comparison.outcomeAfter || 'unscored'}.`;

  const improved = [];
  const worsened = [];
  const unchanged = [];
  Object.entries(comparison.dimensionDeltas || {}).forEach(([key, row]) => {
    const label = dimensionLabel(key);
    if (row.delta == null) {
      if (row.availableBefore !== row.availableAfter) {
        unchanged.push(
          `${label} availability changed (${row.availableBefore ? 'assessed' : 'not assessed'} → ${
            row.availableAfter ? 'assessed' : 'not assessed'
          }).`
        );
      } else {
        unchanged.push(`${label} was not assessed in either scenario.`);
      }
      return;
    }
    if (row.delta > 0) {
      improved.push(`${label} improved from ${row.before} to ${row.after} (${signed(row.delta)}).`);
    } else if (row.delta < 0) {
      worsened.push(`${label} worsened from ${row.before} to ${row.after} (${signed(row.delta)}).`);
    } else {
      unchanged.push(`${label} is unchanged at ${row.after}.`);
    }
  });

  const constraintChanges = [];
  (comparison.constraints?.cleared || []).forEach((c) => {
    constraintChanges.push(`Cleared ${c.constraint} constraint: ${c.detail || c.state}`);
  });
  (comparison.constraints?.added || []).forEach((c) => {
    constraintChanges.push(`Added ${c.constraint} constraint: ${c.detail || c.state}`);
  });
  if (!constraintChanges.length) {
    constraintChanges.push('No hard-constraint changes.');
  }

  const financeChanges = [];
  const finance = comparison.financialDeltas;
  if (!finance?.available) {
    financeChanges.push(
      finance?.unavailableReason ||
        'Mortgage figures were not assessed — deposit, rate and term were not all supplied.'
    );
  } else {
    if (finance.monthlyPayment && finance.monthlyPayment.delta) {
      financeChanges.push(
        `Monthly mortgage payment moved from £${finance.monthlyPayment.before} to £${finance.monthlyPayment.after} (${signed(finance.monthlyPayment.delta)}). Financing affordability is ${finance.affordability}.`
      );
    } else {
      financeChanges.push('Monthly mortgage payment is unchanged.');
    }
  }

  const confidenceNote = comparison.confidence?.unchanged
    ? `Estimate confidence is unchanged at ${comparison.confidence.after?.level || comparison.confidence.before?.level || 'Not assessed'}. Valuation evidence was not rerun.`
    : `Estimate confidence moved from ${comparison.confidence?.before?.level || 'Not assessed'} to ${comparison.confidence?.after?.level || 'Not assessed'} because the scenario changed the evidence set.`;

  const valuationNote = comparison.valuation?.unchanged
    ? 'The property valuation is unchanged.'
    : 'The scenario changed valuation evidence.';

  return {
    engine: WHY_ENGINE_VERSION,
    source: 'deterministic',
    overall: `${scoreBit} ${outcomeBit} ${valuationNote}`,
    improved,
    worsened,
    unchanged,
    constraintChanges,
    financeChanges,
    confidenceNote,
  };
}

async function explainPersonalDecisionDelta(comparison, options = {}) {
  const deterministicDeltaExplanation =
    comparison.deterministicDeltaExplanation || buildDeterministicDeltaExplanation(comparison);

  const facts = {
    profile: comparison.profile,
    model: comparison.model,
    baseScore: comparison.baseScore,
    scenarioScore: comparison.scenarioScore,
    scoreDelta: comparison.scoreDelta,
    outcomeBefore: comparison.outcomeBefore,
    outcomeAfter: comparison.outcomeAfter,
    dimensionDeltas: comparison.dimensionDeltas,
    constraints: comparison.constraints,
    financialDeltas: comparison.financialDeltas,
    valuation: comparison.valuation,
    confidence: comparison.confidence,
    deterministicDeltaExplanation,
    instructions: {
      scoresAreReadOnly: true,
      doNotRecommendPurchase: true,
      doNotChangeValuation: true,
    },
  };

  const ai = {
    available: false,
    source: null,
    model: null,
    tokensUsed: 0,
    validation: { ok: false, errors: [] },
  };
  let aiNarrative = null;
  const generate = options.generateJson || defaultGenerateJson;

  try {
    const result = await generate(DELTA_SYSTEM, facts, DELTA_SCHEMA);
    const parsed = result?.parsed || result;
    const validation = validateAiNarrative(parsed, facts, DELTA_SCHEMA);
    ai.validation = validation;
    ai.model = result?.model || options.model || null;
    ai.tokensUsed = result?.tokensUsed || 0;
    if (validation.ok) {
      ai.available = true;
      ai.source = options.source || 'openai';
      aiNarrative = {
        overallDelta: parsed.overallDelta,
        improved: parsed.improved,
        worsened: parsed.worsened,
        unchanged: parsed.unchanged,
        constraintChanges: parsed.constraintChanges,
        financeChanges: parsed.financeChanges,
        confidenceNote: parsed.confidenceNote,
        source: ai.source,
        model: ai.model,
      };
    } else {
      ai.source = 'rejected';
    }
  } catch (err) {
    ai.source = 'unavailable';
    ai.validation = { ok: false, errors: [err.message || 'LLM unavailable'] };
  }

  return {
    ...comparison,
    baseScore: comparison.baseScore,
    scenarioScore: comparison.scenarioScore,
    outcomeBefore: comparison.outcomeBefore,
    outcomeAfter: comparison.outcomeAfter,
    constraints: comparison.constraints,
    valuation: comparison.valuation,
    deterministicDeltaExplanation,
    aiNarrative,
    whyEngine: {
      version: WHY_ENGINE_VERSION,
      profile: 'buyer_general',
      mode: 'whatif_delta',
      ai,
    },
  };
}

module.exports = {
  explainPersonalDecision,
  explainPersonalDecisionDelta,
  buildDeterministicExplanation,
  buildDeterministicDeltaExplanation,
  buildWhyFacts,
  validateAiNarrative,
  WHY_SCHEMA,
  WHY_SYSTEM,
  DELTA_SCHEMA,
  DELTA_SYSTEM,
  WHY_ENGINE_VERSION,
};
