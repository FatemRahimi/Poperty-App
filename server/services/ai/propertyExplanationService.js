/**
 * LLM explanation layer — receives structured facts only; never calculates numbers.
 */

const { callOpenAI } = require('../openaiService');

function templateSummary(facts) {
  const parts = [];
  const title = facts.property?.title || 'This property';

  // No aggregate score narrative: the blended overall was deprecated because it
  // mixed unrelated concepts. Describe the dimensions that were actually evidenced.
  const detail = facts.scores?.componentDetail;
  if (detail) {
    const evidenced = Object.entries(detail)
      .filter(([, c]) => c?.available)
      .map(([key, c]) => `${key} ${c.score}/100`);
    const missing = Object.entries(detail)
      .filter(([, c]) => c && !c.available)
      .map(([key]) => key);

    if (evidenced.length) {
      parts.push(`${title} was assessed on ${evidenced.join(', ')}.`);
    }
    if (missing.length) {
      parts.push(
        `The following could not be assessed from available data: ${missing.join(', ')}.`
      );
    }
  }

  if (facts.rentIntel) {
    const r = facts.rentIntel;
    if (r.underRented && r.potentialAnnualUplift) {
      parts.push(
        `Current rent of £${Number(r.currentRent).toLocaleString()} appears below the estimated market range of £${r.marketRange.low.toLocaleString()}–£${r.marketRange.high.toLocaleString()}, representing a potential annual difference of approximately £${Math.round(r.potentialAnnualUplift.low).toLocaleString()}–£${Math.round(r.potentialAnnualUplift.high).toLocaleString()}.`
      );
    } else if (r.marketRange) {
      parts.push(
        `Rental positioning was assessed against ${facts.rentIntel.comparableCount || 0} internal comparables with an estimated market range of £${r.marketRange.low.toLocaleString()}–£${r.marketRange.high.toLocaleString()}.`
      );
    }
  } else {
    parts.push('Insufficient comparable rental data was available for a reliable rent estimate.');
  }

  if (facts.investment) {
    if (facts.investment.grossYield != null) {
      parts.push(`Gross yield is ${facts.investment.grossYield}%.`);
    }
    if (facts.investment.costCompleteness === 'PARTIAL_EVIDENCE') {
      parts.push(
        'Some operating costs are known, but NOI and net yield remain not assessed because the operating-cost set is incomplete.'
      );
    }
    if (facts.investment.financeCompleteness && facts.investment.financeCompleteness !== 'COMPLETE_EVIDENCE') {
      parts.push('Finance inputs are incomplete, so cash flow and DSCR remain not assessed.');
    }
    if (facts.investment.noi != null) {
      parts.push(
        `Net operating income is £${Number(facts.investment.noi).toLocaleString()}.`
      );
    }
    if (facts.investment.annualCashFlow != null) {
      parts.push(
        `Estimated annual cash flow is £${Number(facts.investment.annualCashFlow).toLocaleString()}.`
      );
    }
  }

  if (facts.topRisk) {
    parts.push(`Primary risk flagged: ${facts.topRisk.title}.`);
  }

  if (facts.areaMarketDemand?.available && facts.areaMarketDemand.band) {
    parts.push(
      `Buyer demand in the surrounding market is currently labelled "${facts.areaMarketDemand.band}" by PropertyData. This is area-level sales-market evidence, not property-specific demand and not rental demand.`
    );
  }

  if (facts.areaRentalDemand?.available && facts.areaRentalDemand.band) {
    parts.push(
      `Rental demand in the surrounding market is currently labelled "${facts.areaRentalDemand.band}" by PropertyData. This is area-level rental-market evidence, not property-specific tenant demand and not a letting-time prediction.`
    );
  }

  if (facts.propertyFacts) {
    const pf = facts.propertyFacts;
    if (pf.epcRating) parts.push(`Recorded EPC rating is ${pf.epcRating}.`);
    if (pf.tenure) parts.push(`Recorded tenure is ${pf.tenure}.`);
    if (pf.leaseRemaining != null) {
      parts.push(`Derived remaining lease is ${pf.leaseRemaining} years from registered lease evidence.`);
    }
    if (Array.isArray(pf.missing) && pf.missing.length) {
      parts.push(`The following property facts were not assessed: ${pf.missing.slice(0, 8).join(', ')}.`);
    }
    if (Array.isArray(pf.conflicts) && pf.conflicts.length) {
      parts.push('Some listing and provider facts conflict; listing values were retained and were not averaged.');
    }
  }

  if (facts.dataQuality?.score !== undefined) {
    parts.push(`Data quality score: ${facts.dataQuality.score}/100.`);
  }

  return parts.join(' ');
}

async function generatePropertyExplanation(structuredFacts) {
  const fallback = {
    summary: templateSummary(structuredFacts),
    source: 'template',
    model: null,
    tokensUsed: 0,
  };

  const system = `You are a UK property intelligence analyst. You receive ONLY pre-calculated structured facts in JSON.
You must NOT invent numbers, rents, yields, comparables, demand scores, tenure, EPC, council tax, service charge, ground rent, lease term, floor area, build year, heating, garden, parking, broadband, flood, planning, schools, operating costs, NOI, net yield, cash flow, DSCR, missing frequencies, or cost responsibility.
If propertyFacts is present, describe known facts, calculated implications, missing facts, and conflicting evidence exactly as provided. Do not turn EPC, council tax, tenure, flood, planning, or schools into a quality, risk, or affordability score. Missing facts stay not assessed.
Do not predict whether a planning application will be approved, claim that development will raise or fall property value, label an application positive or negative, invent dates, statuses or categories, or create a planning risk score. Nearby applications are not applications for this property.
If investment.costCompleteness is PARTIAL_EVIDENCE, say that known costs are incomplete and do not present NOI or net yield as complete.
If investment.financeCompleteness is not COMPLETE_EVIDENCE, do not present cash flow or DSCR as complete. Do not treat application defaults as user-entered finance.
You must NOT invent maintenance, insurance, management fee, taxes, vacancy, deposit, interest rate, mortgage term, or loan amount.
Do not describe user expected rent as market rent, or scenario results as observed historical results.
If areaMarketDemand is present, describe it as surrounding-market buyer demand only. Do not claim the individual property has high or low demand, predict sale probability or time-to-sell, or recommend purchase or sale based solely on demand.
If areaRentalDemand is present, describe it as surrounding-market rental demand only. Do not claim the individual property has high tenant demand, predict likelihood of letting or days to let, convert turnover into a probability, or change any score or financial metric.
Return JSON with keys: summary (2-4 professional sentences referencing ONLY the provided numbers), narrativeTone (formal|neutral).
If data is insufficient, say so clearly.`;

  const user = JSON.stringify(structuredFacts, null, 2);

  try {
    const result = await callOpenAI(system, user, { temperature: 0.3, maxTokens: 600 });
    if (!result?.parsed?.summary) return fallback;

    return {
      summary: result.parsed.summary,
      narrativeTone: result.parsed.narrativeTone || 'formal',
      source: 'openai',
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  } catch (err) {
    console.warn('Property explanation LLM failed, using template:', err.message);
    return fallback;
  }
}

module.exports = { generatePropertyExplanation, templateSummary };
