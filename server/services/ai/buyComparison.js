/**
 * Compare exactly two stored BUY decisions.
 * Reads evidence, investigation priorities, relationships, and preference fit.
 * Does not rescore, value, or choose a purchase.
 */

const ENGINE = 'buyComparison';
const VERSION = 'buy-comparison-1.0.0';
const CONCLUSION = 'No purchase winner is determined from the current evidence.';

const PREFERENCE_RANK = Object.freeze({
  unsuitable: 0,
  weak_fit: 1,
  mixed_fit: 2,
  good_fit: 3,
  strong_fit: 4,
});

const PREFERENCE_LABEL = Object.freeze({
  unsuitable: 'Unsuitable',
  weak_fit: 'Weak fit',
  mixed_fit: 'Mixed fit',
  good_fit: 'Good fit',
  strong_fit: 'Strong fit',
});

function pounds(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const sign = amount < 0 ? '-' : '';
  return `${sign}£${Math.abs(amount).toLocaleString('en-GB')}`;
}

function fieldOf(decision, key) {
  const field = decision?.evidence?.[key];
  return field && typeof field === 'object' ? field : null;
}

function stateOf(field) {
  if (!field) return null;
  return field.state || null;
}

function moneyCell(field) {
  if (!field) return 'Not stored';
  if (field.state === 'NOT_APPLICABLE') return 'Not applicable';
  if (field.state === 'CONFLICTED') return 'Conflicting evidence';
  if (field.state === 'KNOWN' && field.value != null && Number.isFinite(Number(field.value))) {
    return pounds(field.value);
  }
  if (field.state === 'UNKNOWN') return 'Unknown';
  if (field.state === 'KNOWN') return 'Known';
  return 'Not stored';
}

function identityCell(field) {
  if (!field) return 'Not stored';
  if (field.state === 'CONFLICTED') return 'Conflicting evidence';
  if (field.state === 'UNKNOWN') return 'Unknown';
  if (field.state === 'KNOWN') {
    return field.value?.uprn ? 'UPRN recorded. A UPRN is not a title.' : 'Identity recorded';
  }
  return 'Not stored';
}

function tenureCell(field) {
  if (!field) return 'Not stored';
  if (field.state === 'NOT_APPLICABLE') return 'Not applicable';
  if (field.state === 'CONFLICTED') return 'Conflicting evidence';
  if (field.state === 'UNKNOWN') return 'Unknown';
  if (field.state === 'KNOWN' && field.value != null && field.value !== '') return String(field.value);
  if (field.state === 'KNOWN') return 'Known';
  return 'Not stored';
}

function leaseCell(field) {
  if (!field) return 'Not stored';
  if (field.state === 'NOT_APPLICABLE') return 'Not applicable';
  if (field.state === 'CONFLICTED') return 'Conflicting evidence';
  if (field.state === 'UNKNOWN') return 'Unknown';
  if (field.state === 'KNOWN' && field.value != null && Number.isFinite(Number(field.value))) {
    return `${field.value} years`;
  }
  if (field.state === 'KNOWN') return 'Known';
  return 'Not stored';
}

function ltvCell(decision) {
  const ltv = fieldOf(decision, 'ltv');
  if (!ltv) return 'Not stored';
  if (ltv.state === 'KNOWN' && ltv.value != null && Number.isFinite(Number(ltv.value))) return `${ltv.value}%`;
  if (ltv.state === 'UNKNOWN') return 'Unknown';
  if (ltv.state === 'NOT_APPLICABLE') return 'Not applicable';
  return 'Not stored';
}

function soldKind(decision) {
  const sold = fieldOf(decision, 'soldComparableSupport');
  if (!sold) return { kind: 'missing', label: 'Not stored' };
  if (sold.state === 'NOT_APPLICABLE' || sold.evidenceClass === 'NOT_APPLICABLE') {
    return { kind: 'not_applicable', label: 'Not applicable' };
  }
  if (sold.evidenceClass === 'SOLD_PRICE_CONTEXT' || (sold.state === 'KNOWN' && sold.role === 'sold_price_context')) {
    return { kind: 'sold_price_context', label: 'Sold-price context' };
  }
  if (sold.evidenceClass === 'MARKET_CONTEXT' || sold.state === 'CONTEXT') {
    return { kind: 'market_context', label: 'Market context' };
  }
  if (sold.state === 'UNKNOWN' || sold.state === 'CONFLICTED') {
    return { kind: 'unresolved', label: sold.state === 'CONFLICTED' ? 'Conflicting evidence' : 'Unknown' };
  }
  return { kind: 'other', label: 'Not stored' };
}

function investigationCounts(decision) {
  if (!Object.prototype.hasOwnProperty.call(decision || {}, 'investigationPriorities')) return null;
  const items = decision.investigationPriorities;
  if (!Array.isArray(items)) return null;
  const count = (importance) => items.filter((row) => row && row.importance === importance).length;
  return {
    decision_critical: count('decision_critical'),
    decision_relevant: count('decision_relevant'),
    worth_reviewing: count('worth_reviewing'),
  };
}

function countCell(counts, key) {
  if (!counts) return 'Not stored';
  return String(counts[key]);
}

function preferenceView(decision) {
  if (!decision || !Object.prototype.hasOwnProperty.call(decision, 'preferenceFit')) return null;
  const fit = decision.preferenceFit;
  if (!fit || typeof fit !== 'object') return null;
  const outcome = fit.outcome;
  if (!Object.prototype.hasOwnProperty.call(PREFERENCE_RANK, outcome)) {
    return { comparable: false, label: 'Not assessed' };
  }
  return {
    comparable: true,
    outcome,
    rank: PREFERENCE_RANK[outcome],
    label: PREFERENCE_LABEL[outcome],
  };
}

function preferenceCell(decision) {
  if (!decision || !Object.prototype.hasOwnProperty.call(decision, 'preferenceFit')) return 'Not stored';
  const view = preferenceView(decision);
  return view ? view.label : 'Not assessed';
}

function observation({ id, kind, title, statement, limitation = null, evidenceKeys }) {
  return {
    id,
    kind,
    title,
    statement,
    limitation,
    evidenceKeys,
    notARecommendation: true,
  };
}

function column(id, label, a, b) {
  return { id, label, a, b };
}

function askingObservation(labelA, labelB, left, right) {
  const a = fieldOf(left, 'askingPrice');
  const b = fieldOf(right, 'askingPrice');
  const aKnown = a?.state === 'KNOWN' && Number.isFinite(Number(a.value));
  const bKnown = b?.state === 'KNOWN' && Number.isFinite(Number(b.value));
  if (aKnown !== bKnown) {
    const knownLabel = aKnown ? labelA : labelB;
    const unknownLabel = aKnown ? labelB : labelA;
    return observation({
      id: 'asking_price_evidence',
      kind: 'evidence',
      title: 'Price',
      statement: `${knownLabel} has a recorded asking price. ${unknownLabel} does not. An asking price is not a valuation.`,
      limitation: 'A missing asking price is not zero, and a lower asking price is not better value.',
      evidenceKeys: ['askingPrice'],
    });
  }
  if (!aKnown || !bKnown) return null;
  const av = Number(a.value);
  const bv = Number(b.value);
  if (av === bv) return null;
  const lower = av < bv ? labelA : labelB;
  return observation({
    id: 'asking_price_difference',
    kind: 'factual',
    title: 'Price',
    statement: `${lower}'s asking price is ${pounds(Math.abs(av - bv))} lower.`,
    limitation: 'This does not establish better value, undervaluation, or a purchase recommendation.',
    evidenceKeys: ['askingPrice'],
  });
}

function identityObservation(labelA, labelB, left, right) {
  const a = stateOf(fieldOf(left, 'identity'));
  const b = stateOf(fieldOf(right, 'identity'));
  if (!a || !b || a === b) return null;
  const unresolved = a === 'UNKNOWN' || a === 'CONFLICTED' ? labelA : (b === 'UNKNOWN' || b === 'CONFLICTED' ? labelB : null);
  const recorded = unresolved === labelA ? labelB : labelA;
  if (!unresolved) return null;
  return observation({
    id: 'identity_certainty',
    kind: 'evidence',
    title: 'Evidence',
    statement: `${unresolved} does not have a resolved property identity, so conclusions that depend on the exact dwelling remain limited. ${recorded} has a recorded identity.`,
    limitation: 'Area and postcode context is not discarded and is not treated as invalid. A UPRN is not a title.',
    evidenceKeys: ['identity'],
  });
}

function leaseObservation(labelA, labelB, left, right) {
  const a = fieldOf(left, 'leaseYearsRemaining');
  const b = fieldOf(right, 'leaseYearsRemaining');
  if (!a || !b) return null;
  if (a.state === b.state && a.state === 'NOT_APPLICABLE') return null;
  if (a.state === 'NOT_APPLICABLE' && (b.state === 'UNKNOWN' || b.state === 'CONFLICTED')) {
    return observation({
      id: 'lease_evidence',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelA} remaining lease does not apply. ${labelB} has unresolved lease-length evidence.`,
      limitation: 'Not applicable is not missing evidence. This is not a comparison of lease quality, and no lender rule is applied.',
      evidenceKeys: ['tenure', 'leaseYearsRemaining'],
    });
  }
  if (b.state === 'NOT_APPLICABLE' && (a.state === 'UNKNOWN' || a.state === 'CONFLICTED')) {
    return observation({
      id: 'lease_evidence',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelB} remaining lease does not apply. ${labelA} has unresolved lease-length evidence.`,
      limitation: 'Not applicable is not missing evidence. This is not a comparison of lease quality, and no lender rule is applied.',
      evidenceKeys: ['tenure', 'leaseYearsRemaining'],
    });
  }
  if (a.state === 'KNOWN' && b.state === 'UNKNOWN') {
    return observation({
      id: 'lease_evidence',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelA} currently has evidenced lease length. ${labelB} has unresolved lease-length evidence.`,
      limitation: 'No lender rule is applied. Evidenced length is not a better lease.',
      evidenceKeys: ['leaseYearsRemaining'],
    });
  }
  if (b.state === 'KNOWN' && a.state === 'UNKNOWN') {
    return observation({
      id: 'lease_evidence',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelB} currently has evidenced lease length. ${labelA} has unresolved lease-length evidence.`,
      limitation: 'No lender rule is applied. Evidenced length is not a better lease.',
      evidenceKeys: ['leaseYearsRemaining'],
    });
  }
  if (a.state === 'KNOWN' && b.state === 'KNOWN' && Number(a.value) !== Number(b.value)) {
    return observation({
      id: 'lease_length_fact',
      kind: 'factual',
      title: 'Lease length',
      statement: `${labelA} remaining term is ${a.value} years. ${labelB} remaining term is ${b.value} years.`,
      limitation: 'No lender rule is applied.',
      evidenceKeys: ['leaseYearsRemaining'],
    });
  }
  return null;
}

function chargeObservation(id, label, key, labelA, labelB, left, right) {
  const a = fieldOf(left, key);
  const b = fieldOf(right, key);
  if (!a || !b || a.state === b.state && !(a.state === 'KNOWN' && Number(a.value) !== Number(b.value))) return null;
  if (a.state === 'NOT_APPLICABLE' && b.state === 'NOT_APPLICABLE') return null;
  if (a.state === 'KNOWN' && b.state === 'UNKNOWN') {
    return observation({
      id,
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelA} ${label} is known${a.value != null && Number.isFinite(Number(a.value)) ? ` and is ${pounds(a.value)}` : ''}. ${labelB} ${label} is unknown.`,
      limitation: 'Unknown is not zero. A known zero is not missing evidence.',
      evidenceKeys: [key],
    });
  }
  if (b.state === 'KNOWN' && a.state === 'UNKNOWN') {
    return observation({
      id,
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelB} ${label} is known${b.value != null && Number.isFinite(Number(b.value)) ? ` and is ${pounds(b.value)}` : ''}. ${labelA} ${label} is unknown.`,
      limitation: 'Unknown is not zero. A known zero is not missing evidence.',
      evidenceKeys: [key],
    });
  }
  if (a.state === 'NOT_APPLICABLE' && b.state === 'UNKNOWN') {
    return observation({
      id,
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelA} ${label} does not apply. ${labelB} ${label} is unknown.`,
      limitation: 'Not applicable is not missing evidence. Unknown is not zero.',
      evidenceKeys: [key],
    });
  }
  if (b.state === 'NOT_APPLICABLE' && a.state === 'UNKNOWN') {
    return observation({
      id,
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelB} ${label} does not apply. ${labelA} ${label} is unknown.`,
      limitation: 'Not applicable is not missing evidence. Unknown is not zero.',
      evidenceKeys: [key],
    });
  }
  return null;
}

function ltvObservation(labelA, labelB, left, right) {
  const a = fieldOf(left, 'ltv');
  const b = fieldOf(right, 'ltv');
  if (!a || !b || a.state === b.state) return null;
  if (a.state === 'KNOWN' && a.value != null && b.state === 'UNKNOWN') {
    return observation({
      id: 'ltv_completeness',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelA} loan to value is ${a.value}% from the stored result. ${labelB} loan to value is not assessed.`,
      limitation: 'This is not lender approval and not a lending decision.',
      evidenceKeys: ['deposit', 'ltv'],
    });
  }
  if (b.state === 'KNOWN' && b.value != null && a.state === 'UNKNOWN') {
    return observation({
      id: 'ltv_completeness',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelB} loan to value is ${b.value}% from the stored result. ${labelA} loan to value is not assessed.`,
      limitation: 'This is not lender approval and not a lending decision.',
      evidenceKeys: ['deposit', 'ltv'],
    });
  }
  return null;
}

function soldObservation(labelA, labelB, left, right) {
  const a = soldKind(left);
  const b = soldKind(right);
  if (a.kind === 'missing' || b.kind === 'missing' || a.kind === b.kind) return null;
  const propertyRelevant = (kind) => kind === 'sold_price_context';
  const weaker = (kind) => kind === 'market_context' || kind === 'unresolved';
  if (propertyRelevant(a.kind) && weaker(b.kind)) {
    return observation({
      id: 'sold_evidence_class',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelA} has stronger property-relevant sold-price evidence than ${labelB}. ${labelA} has defensible sold-price context. ${labelB} sold-price support is ${b.label.toLowerCase()}.`,
      limitation: 'Sold-price context is not this home\'s value, not a valuation, and not a recommendation to buy. No typical price is used.',
      evidenceKeys: ['soldComparableSupport'],
    });
  }
  if (propertyRelevant(b.kind) && weaker(a.kind)) {
    return observation({
      id: 'sold_evidence_class',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelB} has stronger property-relevant sold-price evidence than ${labelA}. ${labelB} has defensible sold-price context. ${labelA} sold-price support is ${a.label.toLowerCase()}.`,
      limitation: 'Sold-price context is not this home\'s value, not a valuation, and not a recommendation to buy. No typical price is used.',
      evidenceKeys: ['soldComparableSupport'],
    });
  }
  if (a.kind === 'market_context' && b.kind === 'unresolved') {
    return observation({
      id: 'sold_evidence_class',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelA} has local sold sales as market context only. ${labelB} sold-price support is unresolved.`,
      limitation: 'Market context is not property-relevant sold evidence, not this home\'s value, and not a valuation. No typical price is used.',
      evidenceKeys: ['soldComparableSupport'],
    });
  }
  if (b.kind === 'market_context' && a.kind === 'unresolved') {
    return observation({
      id: 'sold_evidence_class',
      kind: 'evidence',
      title: 'Evidence',
      statement: `${labelB} has local sold sales as market context only. ${labelA} sold-price support is unresolved.`,
      limitation: 'Market context is not property-relevant sold evidence, not this home\'s value, and not a valuation. No typical price is used.',
      evidenceKeys: ['soldComparableSupport'],
    });
  }
  return null;
}

function investigationObservation(labelA, labelB, left, right) {
  const a = investigationCounts(left);
  const b = investigationCounts(right);
  if (!a || !b) {
    if (!a || !b) {
      const missing = !a && !b ? 'both properties' : (!a ? labelA : labelB);
      return observation({
        id: 'investigation_not_stored',
        kind: 'uncertainty',
        title: 'Uncertainty',
        statement: `Investigation priorities were not stored for ${missing}, so an investigation count is not compared.`,
        limitation: 'A missing investigation list is not zero unresolved items.',
        evidenceKeys: ['investigationPriorities'],
      });
    }
  }
  if (a.decision_critical === b.decision_critical) return null;
  const more = a.decision_critical > b.decision_critical ? labelA : labelB;
  const moreCount = Math.max(a.decision_critical, b.decision_critical);
  const lessCount = Math.min(a.decision_critical, b.decision_critical);
  const less = more === labelA ? labelB : labelA;
  return observation({
    id: 'critical_investigation_burden',
    kind: 'uncertainty',
    title: 'Uncertainty',
    statement: `${more} currently has more decision-critical uncertainty to resolve (${moreCount}) than ${less} (${lessCount}).`,
    limitation: 'This does not make either property the better purchase.',
    evidenceKeys: ['investigationPriorities'],
  });
}

function preferenceObservation(labelA, labelB, left, right) {
  const a = preferenceView(left);
  const b = preferenceView(right);
  if (!a || !b || !a.comparable || !b.comparable || a.rank === b.rank) return null;
  const stronger = a.rank > b.rank ? labelA : labelB;
  return observation({
    id: 'preference_fit',
    kind: 'preference',
    title: 'Preference',
    statement: `${stronger} currently better matches the stored preference.`,
    limitation: 'Preference fit is not a purchase recommendation and does not decide the other property.',
    evidenceKeys: ['preferenceFit'],
  });
}

function relationshipObservation(labelA, labelB, left, right) {
  const a = Object.prototype.hasOwnProperty.call(left || {}, 'relationships') && Array.isArray(left.relationships)
    ? left.relationships
    : null;
  const b = Object.prototype.hasOwnProperty.call(right || {}, 'relationships') && Array.isArray(right.relationships)
    ? right.relationships
    : null;
  if (!a || !b) {
    return observation({
      id: 'relationships_not_stored',
      kind: 'uncertainty',
      title: 'Uncertainty',
      statement: 'Relationships were not stored on both decisions, so relationship limitations are not compared.',
      limitation: 'A missing relationship list is not the absence of a limitation.',
      evidenceKeys: ['relationships'],
    });
  }
  const byId = (rows) => new Map(rows.filter((row) => row && row.id).map((row) => [row.id, row]));
  const mapA = byId(a);
  const mapB = byId(b);
  const onlyA = [...mapA.keys()].filter((id) => !mapB.has(id));
  const onlyB = [...mapB.keys()].filter((id) => !mapA.has(id));
  if (!onlyA.length && !onlyB.length) return null;
  const sample = onlyA.length ? mapA.get(onlyA[0]) : mapB.get(onlyB[0]);
  const owner = onlyA.length ? labelA : labelB;
  const other = owner === labelA ? labelB : labelA;
  return observation({
    id: 'relationship_limitation',
    kind: sample.state === 'UNKNOWN' || sample.state === 'CONFLICTED' ? 'uncertainty' : 'evidence',
    title: 'Evidence',
    statement: `${owner} has a stored relationship limitation that ${other} does not: ${sample.implication || sample.title || sample.id}`,
    limitation: sample.limitation || 'This relationship is not a purchase recommendation.',
    evidenceKeys: Array.isArray(sample.evidenceKeys) ? sample.evidenceKeys : ['relationships'],
  });
}

function compareBuyDecisions(decisionA, decisionB, options = {}) {
  const labelA = options.labelA || 'Property A';
  const labelB = options.labelB || 'Property B';
  const base = {
    engine: ENGINE,
    version: VERSION,
    applicable: true,
    notARecommendation: true,
    notAWinner: true,
    purchaseWinner: null,
    conclusion: CONCLUSION,
    subjects: [
      { id: 'a', label: labelA },
      { id: 'b', label: labelB },
    ],
  };
  if (!decisionA || typeof decisionA !== 'object' || !decisionB || typeof decisionB !== 'object') {
    return {
      ...base,
      limited: true,
      columns: [],
      observations: [
        observation({
          id: 'incomplete_pair',
          kind: 'uncertainty',
          title: 'Uncertainty',
          statement: 'Two stored BUY decisions are required. A comparison was not invented for a missing decision.',
          evidenceKeys: [],
        }),
      ],
    };
  }
  const countsA = investigationCounts(decisionA);
  const countsB = investigationCounts(decisionB);
  const columns = [
    column('askingPrice', 'Asking price', moneyCell(fieldOf(decisionA, 'askingPrice')), moneyCell(fieldOf(decisionB, 'askingPrice'))),
    column('identity', 'Property identity', identityCell(fieldOf(decisionA, 'identity')), identityCell(fieldOf(decisionB, 'identity'))),
    column('tenure', 'Tenure', tenureCell(fieldOf(decisionA, 'tenure')), tenureCell(fieldOf(decisionB, 'tenure'))),
    column('leaseYearsRemaining', 'Lease evidence', leaseCell(fieldOf(decisionA, 'leaseYearsRemaining')), leaseCell(fieldOf(decisionB, 'leaseYearsRemaining'))),
    column('serviceCharge', 'Service charge', moneyCell(fieldOf(decisionA, 'serviceCharge')), moneyCell(fieldOf(decisionB, 'serviceCharge'))),
    column('groundRent', 'Ground rent', moneyCell(fieldOf(decisionA, 'groundRent')), moneyCell(fieldOf(decisionB, 'groundRent'))),
    column('ltv', 'Deposit / loan to value', ltvCell(decisionA), ltvCell(decisionB)),
    column('soldComparableSupport', 'Sold-price support', soldKind(decisionA).label, soldKind(decisionB).label),
    column('criticalInvestigations', 'Critical investigations', countCell(countsA, 'decision_critical'), countCell(countsB, 'decision_critical')),
    column('relevantInvestigations', 'Relevant investigations', countCell(countsA, 'decision_relevant'), countCell(countsB, 'decision_relevant')),
    column('preferenceFit', 'Preference fit', preferenceCell(decisionA), preferenceCell(decisionB)),
  ];
  const observations = [
    askingObservation(labelA, labelB, decisionA, decisionB),
    identityObservation(labelA, labelB, decisionA, decisionB),
    leaseObservation(labelA, labelB, decisionA, decisionB),
    chargeObservation('service_charge_evidence', 'service charge', 'serviceCharge', labelA, labelB, decisionA, decisionB),
    chargeObservation('ground_rent_evidence', 'ground rent', 'groundRent', labelA, labelB, decisionA, decisionB),
    ltvObservation(labelA, labelB, decisionA, decisionB),
    soldObservation(labelA, labelB, decisionA, decisionB),
    investigationObservation(labelA, labelB, decisionA, decisionB),
    relationshipObservation(labelA, labelB, decisionA, decisionB),
    preferenceObservation(labelA, labelB, decisionA, decisionB),
  ].filter(Boolean);
  return {
    ...base,
    limited: !decisionA.evidence && !decisionB.evidence,
    columns,
    observations,
  };
}

module.exports = {
  ENGINE,
  VERSION,
  CONCLUSION,
  compareBuyDecisions,
};
