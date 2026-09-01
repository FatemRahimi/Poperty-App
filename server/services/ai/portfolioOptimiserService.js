/**
 * Portfolio-level intelligence — aggregates metrics, risks and opportunities across user listings.
 */

const {
  fetchUserProperties,
  projectPropertyOverview,
  loadCanonicalReportsByPropertyId,
} = require('./propertyIntelligenceService');
const { getMonthlyRent } = require('./propertyDataAggregator');
const { calculateInvestmentMetrics } = require('./financialEngine');
const { createProvenance } = require('../../utils/provenance');
const {
  prepareEvidencedInvestment,
  presentEvidencedInvestment,
  evidencedValue,
} = require('./evidencedInvestment');

function analysePortfolioProperty(property) {
  const price = Number(property.price) || 0;
  const rent = getMonthlyRent(property);
  let metrics = null;

  if (price > 0 && rent > 0) {
    const prepared = prepareEvidencedInvestment({
      purchasePrice: price,
      expectedRent: rent,
      property,
    });
    metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
    metrics.presented = presentEvidencedInvestment(metrics, prepared.operatingCostEvidence);
  } else if (price > 0) {
    metrics = { grossYield: null, netYield: null, annualCashFlow: null, presented: null };
  }

  return {
    id: property.id,
    title: property.title,
    city: property.city,
    category: property.category,
    status: property.status,
    price,
    monthlyRent: rent,
    bedrooms: property.bedrooms,
    propertyType: property.property_type,
    mainImage: property.main_image,
    grossYield: evidencedValue(metrics?.presented?.grossYield),
    netYield: evidencedValue(metrics?.presented?.netYield),
    annualCashFlow: evidencedValue(metrics?.presented?.annualCashFlow),
    netYieldState: metrics?.presented?.netYield?.state || null,
    cashFlowState: metrics?.presented?.annualCashFlow?.state || null,
  };
}

function buildDiversification(properties) {
  const byCity = {};
  const byCategory = {};
  const byType = {};

  properties.forEach((p) => {
    const city = p.city || 'Unknown';
    byCity[city] = (byCity[city] || 0) + 1;
    const cat = p.category || 'other';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const type = p.property_type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });

  const cityCount = Object.keys(byCity).length;
  const concentration = Object.values(byCity).length
    ? Math.max(...Object.values(byCity)) / properties.length
    : 0;

  let diversificationLabel = 'Well diversified';
  if (concentration > 0.7) diversificationLabel = 'Highly concentrated in one area';
  else if (concentration > 0.5) diversificationLabel = 'Moderate geographic concentration';

  return {
    byCity,
    byCategory,
    byType,
    cityCount,
    concentrationPercent: Math.round(concentration * 100),
    label: diversificationLabel,
  };
}

function buildPortfolioRecommendations(summary, opportunities, risks, diversification) {
  const recs = [];

  if (summary.negativeCashFlowCount > 0) {
    recs.push({
      id: 'review-cashflow',
      priority: 'High',
      title: 'Review negative cash-flow properties',
      detail: `${summary.negativeCashFlowCount} propert${summary.negativeCashFlowCount === 1 ? 'y shows' : 'ies show'} negative annual cash flow under default mortgage assumptions.`,
      action: 'Open Investment Analyst or Property Intelligence for affected listings.',
    });
  }

  if (summary.pendingCount > 0) {
    recs.push({
      id: 'approve-pending',
      priority: 'Medium',
      title: 'Complete pending approvals',
      detail: `${summary.pendingCount} listing(s) not yet approved for marketing.`,
      action: 'Finish approval workflow from your dashboard.',
    });
  }

  if (diversification.concentrationPercent > 60) {
    recs.push({
      id: 'diversify',
      priority: 'Medium',
      title: 'Geographic concentration risk',
      detail: `${diversification.concentrationPercent}% of listings are in one city/area.`,
      action: 'Consider diversifying acquisition or marketing focus.',
    });
  }

  const rentOpps = opportunities.filter((o) => o.id === 'rent-below-market');
  if (rentOpps.length) {
    recs.push({
      id: 'rent-review',
      priority: 'Medium',
      title: 'Rent optimisation opportunities',
      detail: `${rentOpps.length} propert${rentOpps.length === 1 ? 'y may be' : 'ies may be'} under-rented vs internal comparables.`,
      action: 'Run Rent Intelligence on flagged properties.',
    });
  }

  if (risks.filter((r) => r.id === 'missing-epc').length) {
    recs.push({
      id: 'epc-gap',
      priority: 'Low',
      title: 'Missing EPC documentation',
      detail: 'Some listings lack EPC data — required for compliant marketing.',
      action: 'Upload EPC certificates from the dashboard.',
    });
  }

  if (!recs.length) {
    recs.push({
      id: 'maintain',
      priority: 'Low',
      title: 'Portfolio in reasonable shape',
      detail: 'No critical portfolio-level actions identified from available data.',
      action: 'Run Property Intelligence on individual assets for deeper analysis.',
    });
  }

  return recs.slice(0, 6);
}

async function optimisePortfolio(userId) {
  const properties = await fetchUserProperties(userId);

  if (!properties.length) {
    return {
      success: true,
      empty: true,
      analysisMode: 'lightweight',
      canonicalEngine: 'propertyIntelligenceEngine',
      message: 'Add properties to your account to receive portfolio intelligence.',
      summary: null,
      properties: [],
      diversification: null,
      opportunities: [],
      risks: [],
      recommendations: [],
    };
  }

  const propertyRows = properties.map(analysePortfolioProperty);
  const canonicalMap = await loadCanonicalReportsByPropertyId(userId);
  const analyses = properties.map((p) =>
    projectPropertyOverview(p, { canonicalReport: canonicalMap.get(Number(p.id)) })
  );

  const opportunities = analyses.flatMap((a) =>
    a.opportunities.map((o) => ({ ...o, propertyTitle: a.title, propertyId: a.propertyId }))
  );
  const risks = analyses.flatMap((a) =>
    a.risks.map((r) => ({ ...r, propertyTitle: a.title, propertyId: a.propertyId }))
  );

  const totalValue = propertyRows.reduce((s, p) => s + (p.price || 0), 0);
  const totalMonthlyRent = propertyRows.reduce((s, p) => s + (p.monthlyRent || 0), 0);
  const yields = propertyRows.filter((p) => p.grossYield != null).map((p) => p.grossYield);
  const avgGrossYield = yields.length
    ? Math.round((yields.reduce((a, b) => a + b, 0) / yields.length) * 10) / 10
    : null;

  const summary = {
    propertyCount: properties.length,
    totalValue,
    totalMonthlyRent,
    totalAnnualRent: Math.round(totalMonthlyRent * 12),
    avgGrossYield,
    saleCount: properties.filter((p) => p.category === 'sale').length,
    rentCount: properties.filter((p) => p.category === 'rent').length,
    leaseCount: properties.filter((p) => p.category === 'lease').length,
    pendingCount: properties.filter((p) => p.status === 'pending').length,
    negativeCashFlowCount: propertyRows.filter((p) => p.annualCashFlow != null && p.annualCashFlow < 0).length,
    opportunityCount: opportunities.length,
    riskCount: risks.length,
  };

  const diversification = buildDiversification(properties);
  const recommendations = buildPortfolioRecommendations(summary, opportunities, risks, diversification);

  opportunities.sort((a, b) => {
    const pri = { High: 3, Medium: 2, Low: 1 };
    return (pri[b.priority] || 0) - (pri[a.priority] || 0);
  });

  return {
    success: true,
    empty: false,
    analysisMode: 'lightweight',
    canonicalEngine: 'propertyIntelligenceEngine',
    generatedAt: new Date().toISOString(),
    modelVersion: 'portfolio-optimiser-v1',
    summary,
    properties: propertyRows.sort((a, b) => (b.grossYield || 0) - (a.grossYield || 0)),
    diversification,
    opportunities: opportunities.slice(0, 8),
    risks: risks.slice(0, 8),
    recommendations,
    provenance: createProvenance({
      source: 'ApplicationDatabase',
      method: 'portfolio_aggregate_analysis',
      confidence: properties.length >= 3 ? 'medium' : 'low',
    }),
    disclaimer:
      'Portfolio metrics use listing data and default investment assumptions. Not financial advice.',
  };
}

module.exports = { optimisePortfolio, analysePortfolioProperty, buildDiversification };
