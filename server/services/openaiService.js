/**
 * OpenAI integration layer for AI Property Services.
 * Uses OPENAI_API_KEY when available; otherwise returns high-quality mock outputs
 * so the product works in development without a key.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(systemPrompt, userPrompt, { temperature = 0.7, maxTokens = 2000 } = {}) {
  if (!OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return {
    parsed: JSON.parse(content),
    model: data.model || OPENAI_MODEL,
    tokensUsed: data.usage?.total_tokens || 0,
  };
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

function mockListingWriter(input) {
  const {
    address = 'the property',
    propertyType = 'property',
    bedrooms = 3,
    bathrooms = 2,
    price,
    features = [],
    keyFeatures = [],
    descriptionNotes = '',
  } = input;

  const featureList = [...features, ...keyFeatures].filter(Boolean);
  const featureText = featureList.length
    ? featureList.slice(0, 6).join(', ')
    : 'modern finishes, spacious living areas and excellent natural light';

  const priceText = price ? ` priced at ${formatCurrency(Number(price))}` : '';

  return {
    seoTitle: `${bedrooms} Bed ${propertyType} for Sale in ${address} | Premium Family Home`,
    description: `Discover this outstanding ${bedrooms}-bedroom ${propertyType.toLowerCase()} in ${address}${priceText}. ${descriptionNotes || 'Thoughtfully presented throughout, this home combines stylish interiors with practical living space.'} Highlight features include ${featureText}. Ideal for families and professionals seeking a high-quality home in a desirable location. Early viewing is strongly recommended.`,
    keySellingPoints: [
      `${bedrooms} bedrooms and ${bathrooms} bathrooms`,
      featureList[0] || 'High-spec interior finishes',
      featureList[1] || 'Bright, well-proportioned living spaces',
      `Prime location: ${address}`,
      'Ready to move in with strong buyer appeal',
    ],
    socialMediaAdvert: `🏡 Just Listed!\n\n${bedrooms}-bed ${propertyType} in ${address}${priceText}.\n✨ ${featureList[0] || 'Stunning interiors'} · ${featureList[1] || 'Prime location'}\n\nBook a viewing today 👉`,
    emailMarketing: `Subject: New to market – ${bedrooms}-bed ${propertyType} in ${address}\n\nDear Client,\n\nWe're excited to introduce a superb ${propertyType.toLowerCase()} in ${address}${priceText}. With ${bedrooms} bedrooms, ${bathrooms} bathrooms and standout features including ${featureText}, this home is perfectly positioned for today's market.\n\nArrange a private viewing at your earliest convenience.\n\nKind regards,\nYour Property Team`,
  };
}

function mockValuation(input) {
  const {
    address = 'Unknown address',
    propertyType = 'House',
    bedrooms = 3,
    bathrooms = 2,
    sizeSqFt = 1000,
    condition = 'Good',
  } = input;

  const basePerSqFt = {
    Flat: 420,
    Apartment: 420,
    House: 380,
    'Semi-Detached': 360,
    Detached: 450,
    Terraced: 340,
    Bungalow: 400,
  };

  const conditionMultiplier = {
    Excellent: 1.12,
    Good: 1.0,
    Fair: 0.88,
    'Needs Renovation': 0.72,
    Poor: 0.65,
  };

  const perSqFt = basePerSqFt[propertyType] || 380;
  const multiplier = conditionMultiplier[condition] || 1;
  const bedroomAdj = 1 + Math.max(0, bedrooms - 2) * 0.04;
  const mid = Math.round(sizeSqFt * perSqFt * multiplier * bedroomAdj);
  const low = Math.round(mid * 0.92);
  const high = Math.round(mid * 1.08);

  return {
    estimatedValue: {
      low,
      mid,
      high,
      currency: 'GBP',
      formatted: {
        low: formatCurrency(low),
        mid: formatCurrency(mid),
        high: formatCurrency(high),
      },
    },
    confidence: condition === 'Excellent' || condition === 'Good' ? 'High' : 'Medium',
    marketAnalysis: {
      summary: `Based on comparable ${propertyType.toLowerCase()} sales near ${address}, demand remains steady for ${bedrooms}-bedroom homes. Properties in ${condition.toLowerCase()} condition are typically achieving mid-market pricing with healthy viewing-to-offer conversion.`,
      localTrend: 'Stable with slight upward pressure on well-presented homes',
      daysOnMarketAvg: 28,
      demandLevel: 'Moderate–Strong',
      comparablesNote: `Recent ${bedrooms}-bed ${propertyType.toLowerCase()} sales in the wider area support a mid valuation around ${formatCurrency(mid)}.`,
    },
    improvementSuggestions: [
      {
        title: 'Light refresh of décor',
        impact: 'Medium',
        estimatedCost: '£1,500–£4,000',
        valueUplift: '£3,000–£8,000',
        detail: 'Neutral paint, updated flooring and decluttering improve buyer perception quickly.',
      },
      {
        title: 'Kitchen & bathroom updates',
        impact: 'High',
        estimatedCost: '£8,000–£20,000',
        valueUplift: '£12,000–£30,000',
        detail: 'Modern fittings and worktops can push the property toward the top of the estimated range.',
      },
      {
        title: 'Energy efficiency improvements',
        impact: 'Medium',
        estimatedCost: '£2,000–£6,000',
        valueUplift: '£2,500–£7,000',
        detail: 'Improved EPC rating strengthens marketing appeal and long-term value.',
      },
      {
        title: 'Professional photography & staging',
        impact: 'High',
        estimatedCost: '£200–£600',
        valueUplift: 'Faster sale / stronger offers',
        detail: 'High-quality visuals typically increase enquiry volume and reduce time on market.',
      },
    ],
    report: {
      title: `AI Property Valuation Report – ${address}`,
      propertySummary: {
        address,
        propertyType,
        bedrooms,
        bathrooms,
        sizeSqFt,
        condition,
      },
      generatedAt: new Date().toISOString(),
      disclaimer:
        'This AI-assisted valuation is indicative only and does not constitute a formal RICS survey or mortgage valuation. Always consult a qualified surveyor for transactional decisions.',
    },
  };
}

function scoreProperty(property, prefs) {
  let score = 50;
  const reasons = [];

  const price = Number(property.price || property.rent_pcm || 0);
  const maxBudget = Number(prefs.budgetMax || prefs.budget || 0);
  const minBudget = Number(prefs.budgetMin || 0);

  if (maxBudget && price > 0) {
    if (price <= maxBudget) {
      score += 20;
      reasons.push('Within budget');
    } else if (price <= maxBudget * 1.1) {
      score += 8;
      reasons.push('Slightly above budget');
    } else {
      score -= 25;
      reasons.push('Above budget');
    }
  }

  if (minBudget && price >= minBudget) {
    score += 5;
  }

  const location = (prefs.location || '').toLowerCase();
  const propLoc = `${property.city || ''} ${property.town || ''} ${property.address || ''} ${property.postcode || ''}`.toLowerCase();
  if (location && propLoc.includes(location.split(',')[0].trim())) {
    score += 18;
    reasons.push('Matches preferred location');
  }

  const beds = Number(property.bedrooms || 0);
  const wantBeds = Number(prefs.bedrooms || 0);
  if (wantBeds && beds >= wantBeds) {
    score += 10;
    reasons.push(`${beds}+ bedrooms`);
  }

  const lifestyle = (prefs.lifestyle || '').toLowerCase();
  if (lifestyle.includes('family') && beds >= 3) {
    score += 8;
    reasons.push('Suitable for family living');
  }
  if (lifestyle.includes('commuter') || (prefs.transport || '').toLowerCase().includes('train')) {
    score += 6;
    reasons.push('Good for commuting lifestyle');
  }
  if ((prefs.schools || '').toLowerCase().includes('school')) {
    score += 5;
    reasons.push('Area suited to school preferences');
  }

  return {
    score: Math.max(0, Math.min(99, score)),
    matchReasons: reasons.slice(0, 4),
  };
}

function mockBuyerMatch(prefs, properties = []) {
  const ranked = (properties || [])
    .map((p) => {
      const { score, matchReasons } = scoreProperty(p, prefs);
      return {
        id: p.id,
        slug: p.slug,
        title: p.title || p.property_title || `${p.bedrooms || ''} Bed Property`,
        address: p.address || [p.town, p.city, p.postcode].filter(Boolean).join(', '),
        price: p.price || p.rent_pcm,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        propertyType: p.property_type || p.type,
        image: p.main_image || p.image_url || (Array.isArray(p.images) ? p.images[0] : null),
        matchScore: score,
        matchReasons,
        summary: `Strong candidate based on your ${prefs.location || 'preferred'} search criteria${prefs.lifestyle ? ` and ${prefs.lifestyle} lifestyle` : ''}.`,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 8);

  return {
    assistantMessage: ranked.length
      ? `I found ${ranked.length} properties that align with your budget${prefs.budgetMax || prefs.budget ? ` of up to ${formatCurrency(Number(prefs.budgetMax || prefs.budget))}` : ''}${prefs.location ? ` in ${prefs.location}` : ''}. Here are my top recommendations, ranked by lifestyle and practical fit.`
      : `I couldn't find live listings matching those filters yet. Try widening your budget or location — or check back as new properties are added.`,
    preferencesSummary: {
      budget: prefs.budgetMax || prefs.budget || null,
      location: prefs.location || null,
      lifestyle: prefs.lifestyle || null,
      transport: prefs.transport || null,
      schools: prefs.schools || null,
    },
    recommendations: ranked,
  };
}

async function generateListingContent(input) {
  const system = `You are an expert UK estate agent copywriter. Return JSON with keys: seoTitle, description, keySellingPoints (array of 5 strings), socialMediaAdvert, emailMarketing. Write in British English. Be persuasive but accurate.`;
  const user = `Create marketing content for this property:\n${JSON.stringify(input, null, 2)}`;

  try {
    const result = await callOpenAI(system, user);
    if (result) {
      return { data: result.parsed, model: result.model, tokensUsed: result.tokensUsed, source: 'openai' };
    }
  } catch (err) {
    console.warn('OpenAI listing writer fallback:', err.message);
  }

  return { data: mockListingWriter(input), model: 'mock-listing-v1', tokensUsed: 0, source: 'mock' };
}

async function generateValuationReport(input) {
  const system = `You are a UK residential property valuation analyst. Return JSON with keys: estimatedValue {low,mid,high,currency,formatted}, confidence, marketAnalysis {summary,localTrend,daysOnMarketAvg,demandLevel,comparablesNote}, improvementSuggestions (array of {title,impact,estimatedCost,valueUplift,detail}), report {title,propertySummary,generatedAt,disclaimer}. Use GBP. Be realistic.`;
  const user = `Produce a valuation report for:\n${JSON.stringify(input, null, 2)}`;

  try {
    const result = await callOpenAI(system, user, { temperature: 0.4, maxTokens: 2500 });
    if (result) {
      return { data: result.parsed, model: result.model, tokensUsed: result.tokensUsed, source: 'openai' };
    }
  } catch (err) {
    console.warn('OpenAI valuation fallback:', err.message);
  }

  return { data: mockValuation(input), model: 'mock-valuation-v1', tokensUsed: 0, source: 'mock' };
}

async function generateBuyerMatches(prefs, properties) {
  // Ranking uses deterministic scoring against DB properties; optional LLM polish for message
  const base = mockBuyerMatch(prefs, properties);

  if (!OPENAI_API_KEY || !base.recommendations.length) {
    return { data: base, model: 'mock-match-v1', tokensUsed: 0, source: 'mock' };
  }

  try {
    const system = `You refine a property-matching assistant message. Return JSON with key assistantMessage only. Keep it concise, helpful, British English.`;
    const user = `User prefs: ${JSON.stringify(prefs)}\nTop matches: ${JSON.stringify(base.recommendations.slice(0, 3).map((r) => ({ title: r.title, score: r.matchScore, reasons: r.matchReasons })))}`;
    const result = await callOpenAI(system, user, { temperature: 0.6, maxTokens: 400 });
    if (result?.parsed?.assistantMessage) {
      base.assistantMessage = result.parsed.assistantMessage;
      return { data: base, model: result.model, tokensUsed: result.tokensUsed, source: 'openai+ranker' };
    }
  } catch (err) {
    console.warn('OpenAI buyer match polish fallback:', err.message);
  }

  return { data: base, model: 'mock-match-v1', tokensUsed: 0, source: 'mock' };
}

module.exports = {
  generateListingContent,
  generateValuationReport,
  generateBuyerMatches,
  PLANS_NOTE: 'Set OPENAI_API_KEY to enable live generation',
};
