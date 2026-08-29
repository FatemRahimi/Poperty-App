const AiSubscription = require('../models/AiSubscription');
const AiRequest = require('../models/AiRequest');
const { getRecentSubjectLookups } = require('../services/ai/externalPropertyLookupService');
const pool = require('../models/db');
const {
  generateListingContent,
  polishBuyerMatchMessage,
} = require('../services/openaiService');
const { generateDeterministicValuation } = require('../services/ai/standaloneValuationService');
const { rankBuyerMatches } = require('../services/ai/buyerMatchEngine');
const {
  logIntelligenceFailure,
  publicFailureBody,
  LISTING_FAILED_PUBLIC,
  VALUATION_FAILED_PUBLIC,
  BUYER_MATCH_FAILED_PUBLIC,
  UPGRADE_FAILED_PUBLIC,
  PLANS_FAILED_PUBLIC,
} = require('../services/ai/propertyIntelligenceProduction');

function titleFromInput(type, input = {}) {
  if (type === 'listing_writer') {
    return input.address || input.seoTitle || 'Property Listing';
  }
  if (type === 'valuation') {
    return `Valuation – ${input.address || 'Property'}`;
  }
  if (type === 'buyer_match') {
    return `Buyer Match – ${input.location || 'Search'}`;
  }
  return 'AI Generation';
}

async function fetchCandidateProperties(prefs = {}) {
  const params = [];
  const filters = ["p.status = 'approved'"];

  if (prefs.location) {
    params.push(`%${prefs.location}%`);
    const i = params.length;
    filters.push(`(
      COALESCE(p.address_line1,'') ILIKE $${i}
      OR COALESCE(p.city,'') ILIKE $${i}
      OR COALESCE(p.zip_code,'') ILIKE $${i}
    )`);
  }

  if (prefs.budgetMax || prefs.budget) {
    params.push(Number(prefs.budgetMax || prefs.budget));
    filters.push(`(COALESCE(NULLIF(p.price,0), NULLIF(p.monthly_rent,0), 0) <= $${params.length} OR (p.price IS NULL AND p.monthly_rent IS NULL))`);
  }

  if (prefs.bedrooms) {
    params.push(Number(prefs.bedrooms));
    filters.push(`(p.bedrooms IS NULL OR p.bedrooms >= $${params.length})`);
  }

    const sql = `
    SELECT
      p.id, p.slug, p.title, p.address_line1, p.city, p.zip_code,
      p.price, p.monthly_rent, p.weekly_rent, p.bedrooms, p.bathrooms, p.property_type,
      p.created_at,
      (
        SELECT pi.image_url FROM property_images pi
        WHERE pi.property_id = p.id
        ORDER BY pi.id ASC LIMIT 1
      ) AS main_image
    FROM properties p
    WHERE ${filters.join(' AND ')}
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 40
  `;

  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.warn('Buyer match property query fallback:', err.message);
    try {
      const fallback = await pool.query(
        `SELECT id, slug, title, address, city, town, postcode, price, bedrooms, bathrooms, property_type
         FROM properties WHERE status = 'approved' ORDER BY id DESC LIMIT 40`
      );
      return fallback.rows;
    } catch (e2) {
      console.warn('No properties available for matching:', e2.message);
      return [];
    }
  }
}

// GET /api/ai/plans
const getPlans = async (req, res) => {
  try {
    const plans = AiSubscription.getPlans();
    res.json({ success: true, plans: Object.values(plans) });
  } catch (error) {
    logIntelligenceFailure('getPlans', error);
    res.status(500).json(publicFailureBody(PLANS_FAILED_PUBLIC));
  }
};

// GET /api/ai/subscription
const getSubscription = async (req, res) => {
  try {
    const summary = await AiSubscription.getUsageSummary(req.user.id);
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('getSubscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to load subscription' });
  }
};

// POST /api/ai/subscription/upgrade
const upgradeSubscription = async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !AiSubscription.getPlans()[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    // Stripe/payment integration point — currently upgrades instantly for demo/production readiness scaffold
    const result = await AiSubscription.upgrade(req.user.id, plan);

    res.json({
      success: true,
      message: `Upgraded to ${result.plan.name}`,
      subscription: result.subscription,
      plan: result.plan,
      billingNote: 'Connect Stripe webhook to finalise paid upgrades in production.',
    });
  } catch (error) {
    logIntelligenceFailure('upgradeSubscription', error);
    res.status(500).json(publicFailureBody(UPGRADE_FAILED_PUBLIC));
  }
};

// GET /api/ai/history
const getHistory = async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;
    const items = await AiRequest.findByUser(req.user.id, {
      type: type || null,
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0,
    });
    const total = await AiRequest.countByUser(req.user.id, type || null);
    res.json({ success: true, items, total });
  } catch (error) {
    console.error('getHistory error:', error);
    res.status(500).json({ success: false, message: 'Failed to load history' });
  }
};

// GET /api/ai/history/:id
const getHistoryItem = async (req, res) => {
  try {
    const item = await AiRequest.findById(req.params.id, req.user.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load request' });
  }
};

// DELETE /api/ai/history/:id
const deleteHistoryItem = async (req, res) => {
  try {
    const deleted = await AiRequest.delete(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete' });
  }
};

// POST /api/ai/listing-writer
const createListing = async (req, res) => {
  try {
    const input = req.body || {};
    if (!input.address && !input.propertyType) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least an address or property type',
      });
    }

    const result = await generateListingContent(input);
    const credit = await AiSubscription.consumeCredit(req.user.id, 1);

    const saved = await AiRequest.create({
      userId: req.user.id,
      requestType: 'listing_writer',
      inputData: input,
      outputData: result.data,
      creditsUsed: credit.consumed || 1,
      modelUsed: result.model,
      tokensUsed: result.tokensUsed,
      title: titleFromInput('listing_writer', { ...input, ...result.data }),
    });

    const subscription = await AiSubscription.findByUserId(req.user.id);

    res.json({
      success: true,
      id: saved.id,
      output: result.data,
      meta: {
        model: result.model,
        source: result.source,
        tokensUsed: result.tokensUsed,
      },
      subscription,
      saved,
    });
  } catch (error) {
    logIntelligenceFailure('createListing', error);
    res.status(500).json(publicFailureBody(LISTING_FAILED_PUBLIC));
  }
};

// POST /api/ai/valuation
const createValuation = async (req, res) => {
  try {
    const input = req.body || {};
    if (!input.address) {
      return res.status(400).json({ success: false, message: 'Property address is required' });
    }

    const deterministic = await generateDeterministicValuation(
      {
        ...input,
        sizeSqFt: Number(input.sizeSqFt || input.size || 0) || undefined,
        bedrooms: Number(input.bedrooms) || undefined,
        bathrooms: Number(input.bathrooms) || undefined,
      },
      { userId: req.user.id }
    );

    if (!deterministic.success) {
      return res.status(422).json({
        success: false,
        message:
          deterministic.message ||
          'A numeric valuation could not be produced from evidenced sources. An LLM is not used to invent values, rents, yields or comparables.',
        unavailableReason: 'insufficient_valuation_evidence',
      });
    }

    const result = deterministic;
    const credit = await AiSubscription.consumeCredit(req.user.id, 1);

    const saved = await AiRequest.create({
      userId: req.user.id,
      requestType: 'valuation',
      inputData: input,
      outputData: result.data,
      creditsUsed: credit.consumed || 1,
      modelUsed: result.model,
      tokensUsed: result.tokensUsed,
      title: titleFromInput('valuation', input),
    });

    const subscription = await AiSubscription.findByUserId(req.user.id);

    res.json({
      success: true,
      id: saved.id,
      output: result.data,
      meta: {
        model: result.model,
        source: result.source,
        tokensUsed: result.tokensUsed,
        engine: result.data?.engine,
        evidenceCount: result.data?.evidenceCount,
      },
      subscription,
      saved,
    });
  } catch (error) {
    logIntelligenceFailure('createValuation', error);
    res.status(500).json(publicFailureBody(VALUATION_FAILED_PUBLIC));
  }
};

// POST /api/ai/buyer-match
const createBuyerMatch = async (req, res) => {
  try {
    const prefs = req.body || {};
    if (!prefs.location && !prefs.budget && !prefs.budgetMax) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least a location or budget',
      });
    }

    const properties = await fetchCandidateProperties(prefs);
    const ranked = rankBuyerMatches(prefs, properties);
    const polished = await polishBuyerMatchMessage(prefs, ranked);
    const result = {
      data: polished,
      model: polished.engine || 'buyer-match-v2',
      tokensUsed: polished.tokensUsed || 0,
      source: 'deterministic+optional-llm',
    };
    const credit = await AiSubscription.consumeCredit(req.user.id, 1);

    const saved = await AiRequest.create({
      userId: req.user.id,
      requestType: 'buyer_match',
      inputData: prefs,
      outputData: result.data,
      creditsUsed: credit.consumed || 1,
      modelUsed: result.model,
      tokensUsed: result.tokensUsed,
      title: titleFromInput('buyer_match', prefs),
    });

    const subscription = await AiSubscription.findByUserId(req.user.id);

    res.json({
      success: true,
      id: saved.id,
      output: result.data,
      meta: {
        model: result.model,
        source: result.source,
        tokensUsed: result.tokensUsed,
        candidatesScanned: properties.length,
      },
      subscription,
      saved,
    });
  } catch (error) {
    logIntelligenceFailure('createBuyerMatch', error);
    res.status(500).json(publicFailureBody(BUYER_MATCH_FAILED_PUBLIC));
  }
};

// GET /api/ai/dashboard
const getDashboard = async (req, res) => {
  try {
    const summary = await AiSubscription.getUsageSummary(req.user.id);
    const recent = await AiRequest.findByUser(req.user.id, { limit: 12 });
    const listings = await AiRequest.findByUser(req.user.id, { type: 'listing_writer', limit: 8 });
    const reports = await AiRequest.findByUser(req.user.id, { type: 'valuation', limit: 8 });
    const ukLookups = await getRecentSubjectLookups(req.user.id, 8);

    res.json({
      success: true,
      ...summary,
      recent,
      listings,
      reports,
      recentUkLookups: ukLookups.subjects || [],
      tools: [
        { id: 'listing_writer', name: 'Listing Writer', path: '/ai-services/listing-writer' },
        { id: 'valuation', name: 'Valuation Report', path: '/ai-services/valuation' },
        { id: 'buyer_match', name: 'Buyer Match', path: '/ai-services/buyer-match' },
      ],
    });
  } catch (error) {
    console.error('getDashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load AI dashboard' });
  }
};

module.exports = {
  getPlans,
  getSubscription,
  upgradeSubscription,
  getHistory,
  getHistoryItem,
  deleteHistoryItem,
  createListing,
  createValuation,
  createBuyerMatch,
  getDashboard,
};
