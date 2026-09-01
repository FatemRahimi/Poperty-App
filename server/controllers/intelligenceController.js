const AiSubscription = require('../models/AiSubscription');
const AiRequest = require('../models/AiRequest');
const {
  calculateInvestmentMetrics,
  buildScenarios,
  sensitivityAnalysis,
  calculateInvestmentScore,
} = require('../services/ai/financialEngine');
const { analyseRent } = require('../services/ai/rentIntelligenceService');
const {
  getPropertyIntelligence,
  fetchUserProperties,
} = require('../services/ai/propertyIntelligenceService');
const {
  searchUserProperties,
  searchApprovedListings,
  fetchApprovedListingsByIds,
  fetchPropertyForIntelligence,
} = require('../services/ai/propertyDataAggregator');
const { runFullPropertyAnalysis } = require('../services/ai/propertyIntelligenceEngine');
const {
  recordSubjectLookup,
  unlinkSubjectFromListing,
} = require('../services/enrichment/intelligenceSubjectRepository');
const {
  parseAnalyseFinanceRequest,
  invalidFinanceHttpResponse,
} = require('../services/ai/financeInputContract');
const { optimisePortfolio } = require('../services/ai/portfolioOptimiserService');
const {
  lookupPropertyIntelligence,
  resolveExternalSubject,
  getRecentSubjectLookups,
  getSubjectPreview,
  assertSubjectPreviewAccess,
  assertSubjectAccess,
} = require('../services/ai/externalPropertyLookupService');
const {
  parseWhatIfHttpBody,
  executeIntelligenceWhatIf,
  toPublicWhatIfHttp,
  prepareIntelligenceWhatIfRun,
} = require('../services/ai/intelligenceWhatIfService');
const {
  persistCompletedCanonicalAnalysis,
  logIntelligenceFailure,
  publicFailureBody,
  classifyCaughtIntelligenceError,
  toPublicIntelligenceHttpOutput,
  ANALYSIS_FAILED_PUBLIC,
  WHAT_IF_FAILED_PUBLIC,
  LOOKUP_FAILED_PUBLIC,
  RESOLVE_FAILED_PUBLIC,
  INVESTMENT_FAILED_PUBLIC,
  RENT_FAILED_PUBLIC,
  PORTFOLIO_FAILED_PUBLIC,
} = require('../services/ai/propertyIntelligenceProduction');

if (typeof getSubjectPreview !== 'function') {
  throw new Error(
    'intelligenceController must import getSubjectPreview from externalPropertyLookupService'
  );
}

function resolveIntelligenceAnalyseOptions(body) {
  return parseAnalyseFinanceRequest(body);
}

async function saveAnalysis(args) {
  const persisted = await persistCompletedCanonicalAnalysis(args);
  if (!persisted.ok) {
    const error = new Error(persisted.message || 'Unable to save analysis');
    error.code = persisted.code;
    error.credit = persisted.credit;
    throw error;
  }
  return persisted.saved;
}

const getIntelligenceOverview = async (req, res) => {
  try {
    const result = await getPropertyIntelligence(req.user.id);
    const properties = await fetchUserProperties(req.user.id);
    res.json({
      success: true,
      ...result,
      portfolio: {
        propertyCount: properties.length,
        properties: properties.map((p) => ({
          id: p.id,
          title: p.title,
          city: p.city,
          status: p.status,
          monthly_rent: p.monthly_rent,
          price: p.price,
        })),
      },
    });
  } catch (error) {
    console.error('getIntelligenceOverview error:', error);
    res.status(500).json({ success: false, message: 'Failed to load property intelligence' });
  }
};

const searchProperties = async (req, res) => {
  try {
    const q = req.query.q || '';
    const scope = (req.query.scope || 'mine').toLowerCase();

    let properties = [];
    if (scope === 'browse') {
      properties = await searchApprovedListings(q);
    } else if (scope === 'saved') {
      const ids = (req.query.ids || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      properties = await fetchApprovedListingsByIds(ids);
      if (q) {
        const lower = q.toLowerCase();
        properties = properties.filter(
          (p) =>
            String(p.id).includes(lower) ||
            (p.title || '').toLowerCase().includes(lower) ||
            (p.city || '').toLowerCase().includes(lower) ||
            (p.zip_code || '').toLowerCase().includes(lower)
        );
      }
    } else {
      properties = await searchUserProperties(req.user.id, q);
    }

    res.json({ success: true, scope, properties });
  } catch (error) {
    console.error('searchProperties error:', error);
    res.status(500).json({ success: false, message: 'Property search failed' });
  }
};

const getPropertyPreview = async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const { property, access } = await fetchPropertyForIntelligence(propertyId, req.user.id);
    if (!property || !access?.allowed) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or you do not have permission to view it.',
        code: 'ACCESS_DENIED',
      });
    }
    res.json({
      success: true,
      property,
      accessContext: {
        relationship: access.relationship,
        accessLevel: access.accessLevel,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load property' });
  }
};

const analysePropertyIntelligence = async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const parsed = resolveIntelligenceAnalyseOptions(req.body);
    if (!parsed.ok) {
      return res.status(400).json(invalidFinanceHttpResponse(parsed.errors));
    }
    const options = parsed.options;

    const report = await runFullPropertyAnalysis(propertyId, req.user.id, options);
    if (!report.success) {
      const status = report.code === 'ACCESS_DENIED' ? 403 : 404;
      return res.status(status).json(report);
    }

    const output = {
      title: `Property Intelligence – ${report.property.title}`,
      ...report,
    };

    const saved = await saveAnalysis({
      userId: req.user.id,
      requestType: 'property_intelligence',
      input: {
        propertyId,
        options,
        finance: parsed.snapshot,
        accessLevel: report.accessContext?.accessLevel,
      },
      output,
      propertyId,
      modelVersion: report.modelVersion,
      confidence: report.confidence?.score,
      confidenceLevel: report.confidence?.level,
      dataQuality: report.dataQuality?.level,
      tokensUsed: report.explanation?.tokensUsed || 0,
    });

    const subscription = await AiSubscription.findByUserId(req.user.id);
    res.json({
      success: true,
      id: saved.id,
      output: toPublicIntelligenceHttpOutput(output),
      subscription,
    });
  } catch (error) {
    logIntelligenceFailure('analysePropertyIntelligence', error);
    const { status, body } = classifyCaughtIntelligenceError(error, ANALYSIS_FAILED_PUBLIC);
    res.status(status).json(body);
  }
};

const getPropertyAnalysisHistory = async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const history = await AiRequest.findByProperty(req.user.id, propertyId);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load analysis history' });
  }
};

const getPropertyAnalysisById = async (req, res) => {
  try {
    const item = await AiRequest.findById(Number(req.params.id), req.user.id);
    if (!item || item.request_type !== 'property_intelligence') {
      return res.status(404).json({ success: false, message: 'Analysis not found' });
    }
    res.json({ success: true, analysis: item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load analysis' });
  }
};

const analyseInvestment = async (req, res) => {
  try {
    const input = req.body || {};
    if (!input.purchasePrice || !input.expectedRent) {
      return res.status(400).json({
        success: false,
        message: 'Purchase price and expected monthly rent are required',
      });
    }

    const metrics = calculateInvestmentMetrics(input);
    const scenarios = buildScenarios(input);
    const sensitivity = sensitivityAnalysis(input);
    const score = calculateInvestmentScore(metrics, {
      marketScore: input.marketScore,
      liquidityScore: input.liquidityScore,
    });

    const output = {
      title: `Investment Analysis – £${Number(input.purchasePrice).toLocaleString()}`,
      metrics,
      scenarios,
      sensitivity,
      score,
      assumptions: metrics.assumptions,
      dataSources: {
        userInput: Object.keys(input).filter((k) => input[k] !== undefined && input[k] !== ''),
        calculated: ['yield', 'noi', 'cashFlow', 'dscr', 'scenarios', 'sensitivity', 'score'],
        external: [],
      },
    };

    const saved = await saveAnalysis({
      userId: req.user.id,
      requestType: 'investment_analyst',
      input,
      output,
      propertyId: input.propertyId,
      modelVersion: 'financial-engine-v1',
    });

    const subscription = await AiSubscription.findByUserId(req.user.id);
    res.json({ success: true, id: saved.id, output, subscription });
  } catch (error) {
    logIntelligenceFailure('analyseInvestment', error);
    res.status(500).json(publicFailureBody(INVESTMENT_FAILED_PUBLIC));
  }
};

const analyseRentEndpoint = async (req, res) => {
  try {
    const input = req.body || {};
    if (!input.city && !input.location) {
      return res.status(400).json({ success: false, message: 'City or location is required' });
    }
    if (!input.city) input.city = input.location;

    const result = await analyseRent(input, req.user.id);
    const output = {
      title: `Rent Intelligence – ${input.city}`,
      ...result,
    };

    const saved = await saveAnalysis({
      userId: req.user.id,
      requestType: 'rent_intelligence',
      input,
      output,
      propertyId: input.propertyId,
      modelVersion: 'comparable-engine-v1',
    });

    const subscription = await AiSubscription.findByUserId(req.user.id);
    res.json({ success: true, id: saved.id, output, subscription });
  } catch (error) {
    logIntelligenceFailure('analyseRentEndpoint', error);
    res.status(500).json(publicFailureBody(RENT_FAILED_PUBLIC));
  }
};

const getUserPropertiesList = async (req, res) => {
  try {
    const properties = await fetchUserProperties(req.user.id);
    res.json({ success: true, properties });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load properties' });
  }
};

const analysePortfolioEndpoint = async (req, res) => {
  try {
    const result = await optimisePortfolio(req.user.id);

    if (result.empty) {
      return res.json({ success: true, output: result });
    }

    const saved = await saveAnalysis({
      userId: req.user.id,
      requestType: 'portfolio_optimiser',
      input: { userId: req.user.id },
      output: result,
      modelVersion: result.modelVersion,
      // Portfolio optimisation runs no estimate through the confidence engine, so
      // there is no confidence to record. Previously this invented 70 or 50 from
      // the portfolio size alone, which is a count, not evidence quality.
      confidence: null,
      confidenceLevel: null,
      dataQuality: null,
    });

    const subscription = await AiSubscription.findByUserId(req.user.id);
    res.json({ success: true, id: saved.id, output: result, subscription });
  } catch (error) {
    logIntelligenceFailure('analysePortfolioEndpoint', error);
    res.status(500).json(publicFailureBody(PORTFOLIO_FAILED_PUBLIC));
  }
};

const lookupIntelligence = async (req, res) => {
  try {
    const q = req.query.q || req.body?.query || '';
    const result = await lookupPropertyIntelligence(q, req.user.id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    logIntelligenceFailure('lookupIntelligence', error);
    res.status(500).json(publicFailureBody(LOOKUP_FAILED_PUBLIC));
  }
};

const resolveIntelligenceSubject = async (req, res) => {
  try {
    const { uprn, address, matchConfidence } = req.body || {};
    if (!uprn) {
      return res.status(400).json({ success: false, message: 'UPRN is required' });
    }
    const result = await resolveExternalSubject({
      uprn,
      address,
      userId: req.user.id,
      matchConfidence,
    });
    if (!result.success) {
      const status = result.code === 'PROVIDER_LOOKUP_LIMIT' ? 429 : 422;
      return res.status(status).json({
        success: false,
        code: result.code || undefined,
        message: result.message,
      });
    }
    res.json(result);
  } catch (error) {
    logIntelligenceFailure('resolveIntelligenceSubject', error);
    res.status(500).json(publicFailureBody(RESOLVE_FAILED_PUBLIC));
  }
};

const getRecentSubjectLookupsEndpoint = async (req, res) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 12);
    const result = await getRecentSubjectLookups(req.user.id, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load recent lookups' });
  }
};

const getSubjectAnalysisHistory = async (req, res) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const history = await AiRequest.findBySubject(req.user.id, subjectId);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load analysis history' });
  }
};

const getSubjectPreviewEndpoint = async (req, res) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const access = await assertSubjectPreviewAccess(req.user && req.user.id, subjectId);
    if (!access.ok) {
      return res.status(access.status).json(access.body);
    }
    const result = await getSubjectPreview(subjectId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (error) {
    logIntelligenceFailure('getSubjectPreviewEndpoint', error);
    res.status(500).json({ success: false, message: 'Failed to load property preview' });
  }
};

const analyseSubjectIntelligence = async (req, res) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const subjectAccess = await assertSubjectAccess(req.user && req.user.id, subjectId);
    if (!subjectAccess.ok) {
      return res.status(subjectAccess.status).json(subjectAccess.body);
    }
    const parsed = resolveIntelligenceAnalyseOptions(req.body);
    if (!parsed.ok) {
      return res.status(400).json(invalidFinanceHttpResponse(parsed.errors));
    }
    const options = parsed.options;

    const report = await runFullPropertyAnalysis({ subjectId }, req.user.id, options);
    if (!report.success) {
      const status = report.code === 'ACCESS_DENIED' ? 403 : 404;
      return res.status(status).json(report);
    }

    const output = {
      title: `Property Intelligence – ${report.property.title}`,
      ...report,
    };

    const saved = await saveAnalysis({
      userId: req.user.id,
      requestType: 'property_intelligence',
      input: {
        subjectId,
        uprn: report.property.uprn,
        options,
        finance: parsed.snapshot,
        accessLevel: report.accessContext?.accessLevel,
      },
      output,
      propertyId: report.property?.id || report.accessContext?.linkedPropertyId || null,
      subjectId,
      modelVersion: report.modelVersion,
      confidence: report.confidence?.score,
      confidenceLevel: report.confidence?.level,
      dataQuality: report.dataQuality?.level,
      tokensUsed: report.explanation?.tokensUsed || 0,
    });

    await recordSubjectLookup(req.user.id, subjectId);

    const subscription = await AiSubscription.findByUserId(req.user.id);
    res.json({
      success: true,
      id: saved.id,
      output: toPublicIntelligenceHttpOutput(output),
      subscription,
    });
  } catch (error) {
    logIntelligenceFailure('analyseSubjectIntelligence', error);
    const { status, body } = classifyCaughtIntelligenceError(error, ANALYSIS_FAILED_PUBLIC);
    res.status(status).json(body);
  }
};

const unlinkSubjectListing = async (req, res) => {
  try {
    const subjectId = Number(req.params.subjectId);
    const isAdmin = req.user.role === 'admin';
    const result = await unlinkSubjectFromListing(subjectId, req.user.id, { isAdmin });
    if (!result.success) {
      const status = result.code === 'FORBIDDEN' ? 403 : result.code === 'NOT_FOUND' ? 404 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('unlinkSubjectListing error:', error);
    res.status(500).json({ success: false, message: 'Failed to unlink listing' });
  }
};

const compareIntelligenceWhatIf = async (req, res) => {
  try {
    const parsed = parseWhatIfHttpBody(req.body);
    if (!parsed.ok) {
      const injection = parsed.errors.some((e) => e.reason === 'internal_option_not_allowed');
      return res.status(400).json({
        ...invalidFinanceHttpResponse(parsed.errors),
        code: injection ? 'INTERNAL_OPTION_NOT_ALLOWED' : invalidFinanceHttpResponse(parsed.errors).code,
      });
    }

    let property = null;
    let access = null;
    if (parsed.subjectId && !parsed.propertyId) {
      const previewAccess = await assertSubjectPreviewAccess(req.user && req.user.id, parsed.subjectId);
      if (!previewAccess.ok) {
        return res.status(404).json({
          success: false,
          code: 'NOT_FOUND',
          message: 'Property not found.',
        });
      }
      const preview = await getSubjectPreview(parsed.subjectId);
      if (!preview.success || !preview.property) {
        return res.status(404).json({
          success: false,
          code: 'NOT_FOUND',
          message: preview.message || 'Property not found.',
        });
      }
      property = preview.property;
      access = preview.accessContext;
    } else {
      const loaded = await fetchPropertyForIntelligence(parsed.propertyId, req.user.id);
      if (!loaded.property || !loaded.access?.allowed) {
        return res.status(404).json({
          success: false,
          message: 'Property not found or you do not have permission to view it.',
          code: 'ACCESS_DENIED',
        });
      }
      property = loaded.property;
      access = loaded.access;
    }

    let storedItem = null;
    if (parsed.analysisId) {
      storedItem = await AiRequest.findById(parsed.analysisId, req.user.id);
    }

    const prepared = prepareIntelligenceWhatIfRun({
      parsed,
      liveProperty: property,
      storedItem,
    });
    if (!prepared.ok) {
      const { status, ok: _ok, ...body } = prepared;
      return res.status(status).json(body);
    }

    const result = executeIntelligenceWhatIf({
      property: prepared.property,
      profile: parsed.profile,
      baselineOptions: prepared.baselineOptions,
      scenarioOptions: parsed.scenarioOptions,
      intelligence: prepared.intelligence,
      asOf: prepared.asOf,
      baselineContext: prepared.baselineContext,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(toPublicWhatIfHttp(result, access));
  } catch (error) {
    logIntelligenceFailure('compareIntelligenceWhatIf', error);
    res.status(500).json(publicFailureBody(WHAT_IF_FAILED_PUBLIC));
  }
};

module.exports = {
  resolveIntelligenceAnalyseOptions,
  getIntelligenceOverview,
  searchProperties,
  getPropertyPreview,
  analysePropertyIntelligence,
  getPropertyAnalysisHistory,
  getPropertyAnalysisById,
  analyseInvestment,
  analyseRentEndpoint,
  getUserPropertiesList,
  analysePortfolioEndpoint,
  lookupIntelligence,
  resolveIntelligenceSubject,
  getRecentSubjectLookupsEndpoint,
  getSubjectPreviewEndpoint,
  getSubjectAnalysisHistory,
  analyseSubjectIntelligence,
  unlinkSubjectListing,
  compareIntelligenceWhatIf,
};
