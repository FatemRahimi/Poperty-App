/**
 * OpenAI integration layer for AI Property Services.
 * Uses OPENAI_API_KEY when available; otherwise returns high-quality mock outputs
 * so the product works in development without a key.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(
  systemPrompt,
  userPrompt,
  { temperature = 0.7, maxTokens = 2000, jsonSchema = null, schemaName = 'response' } = {}
) {
  if (!OPENAI_API_KEY) {
    return null;
  }

  const responseFormat = jsonSchema
    ? {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          strict: true,
          schema: jsonSchema,
        },
      }
    : { type: 'json_object' };

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
      response_format: responseFormat,
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

  const priceText = price
    ? ` priced at ${new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(Number(price))}`
    : '';

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

/**
 * Isolated: the LLM must never invent valuation, rent, yield, comparable
 * statistics or financial metrics. /api/ai/valuation uses standaloneValuationService.
 */
function generateValuationReport() {
  return {
    success: false,
    source: 'blocked',
    model: null,
    tokensUsed: 0,
    data: null,
    estimatedValue: null,
    message:
      'Numeric valuations cannot be generated by an LLM. Use the deterministic valuation engine. LLMs may only explain evidenced figures.',
  };
}

/**
 * Buyer match scoring is owned solely by buyerMatchEngine. No LLM and no mock path
 * may produce a match score — the previous mock scorer here was a second, divergent
 * implementation and has been removed. The LLM may only rewrite the wording of the
 * assistant message (see polishBuyerMatchMessage).
 */
async function generateBuyerMatches(prefs, properties) {
  const { rankBuyerMatches } = require('./ai/buyerMatchEngine');
  const base = rankBuyerMatches(prefs, properties);
  return { data: base, model: 'buyer-match-v2', tokensUsed: 0, source: 'deterministic' };
}

async function polishBuyerMatchMessage(prefs, ranked) {
  const base = { ...ranked };
  delete base.tokensUsed;

  if (!OPENAI_API_KEY || !base.recommendations?.length) {
    return base;
  }

  try {
    const system = `You refine a property-matching assistant message. Return JSON with key assistantMessage only. Keep it concise, helpful, British English. Do not change match scores.`;
    const user = `User prefs: ${JSON.stringify(prefs)}\nTop matches: ${JSON.stringify(base.recommendations.slice(0, 3).map((r) => ({ title: r.title, score: r.matchScore, reasons: r.matchReasons })))}`;
    const result = await callOpenAI(system, user, { temperature: 0.6, maxTokens: 400 });
    if (result?.parsed?.assistantMessage) {
      base.assistantMessage = result.parsed.assistantMessage;
      return { ...base, tokensUsed: result.tokensUsed, llmPolish: true };
    }
  } catch (err) {
    console.warn('OpenAI buyer match polish fallback:', err.message);
  }

  return base;
}

module.exports = {
  callOpenAI,
  generateListingContent,
  generateValuationReport,
  generateBuyerMatches,
  polishBuyerMatchMessage,
  PLANS_NOTE: 'Set OPENAI_API_KEY to enable live generation',
};
