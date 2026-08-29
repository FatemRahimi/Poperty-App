import {
  applyServerCreditState,
  displayAiCredits,
  ingestAiHttpError,
  ingestAiHttpSuccess,
  isCreditConsumingPostRequest,
  isSubscriptionGetRequest,
  isUnlimitedPlan,
  refreshAiCredits,
  resetAiCreditStateForTests,
  subscribeAiCredits,
  configureAiCreditFetcher,
  getAiCreditSnapshot,
} from './aiCreditState';

describe('AI credit state', () => {
  beforeEach(() => {
    resetAiCreditStateForTests();
  });

  test('successful listing and subject analyse update the shared snapshot', () => {
    const seen = [];
    subscribeAiCredits((snap) => seen.push(displayAiCredits(snap)));

    ingestAiHttpSuccess({
      config: { method: 'post', url: '/api/ai/intelligence/analyse/71' },
      data: { success: true, output: { personalDecision: { score: 61 } }, subscription: { credits_remaining: 2 } },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(2);

    ingestAiHttpSuccess({
      config: { method: 'post', url: '/api/ai/intelligence/subjects/42/analyse' },
      data: { success: true, output: { personalDecision: { score: 61 } }, subscription: { credits_remaining: 1 } },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(1);
    expect(seen).toEqual([2, 1]);
  });

  test('header-facing display uses the refreshed server value', () => {
    applyServerCreditState({
      subscription: { credits_remaining: 4 },
      plan: { id: 'free', unlimited: false },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(4);
    expect(isUnlimitedPlan(getAiCreditSnapshot())).toBe(false);
  });

  test('402 applies server remaining credits without inventing a balance', () => {
    applyServerCreditState({
      subscription: { credits_remaining: 1 },
      plan: { id: 'free', unlimited: false },
    });
    ingestAiHttpError({
      response: {
        status: 402,
        data: {
          code: 'INSUFFICIENT_CREDITS',
          message: 'No credits remaining. Upgrade your plan to continue.',
          subscription: { credits_remaining: 0 },
          plan: { id: 'free', unlimited: false },
        },
      },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(0);
    expect(getAiCreditSnapshot().plan.id).toBe('free');
  });

  test('validation, access denial, 429 and unexpected failures do not decrement credits', () => {
    applyServerCreditState({
      subscription: { credits_remaining: 5 },
      plan: { id: 'free', unlimited: false },
    });
    const before = getAiCreditSnapshot();
    [
      { status: 400, data: { code: 'INVALID_FINANCE_INPUT' } },
      { status: 404, data: { message: 'Analysis subject not found.' } },
      { status: 429, data: { code: 'ANALYSIS_IN_PROGRESS' } },
      { status: 500, data: { code: 'INTERNAL_ERROR', message: 'Property analysis failed' } },
    ].forEach((response) => {
      ingestAiHttpError({ response });
    });
    expect(getAiCreditSnapshot()).toBe(before);
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(5);
  });

  test('What-if, history, preview and resolve do not consume or mutate credits', () => {
    applyServerCreditState({
      subscription: { credits_remaining: 5 },
      plan: { id: 'free', unlimited: false },
    });
    const before = displayAiCredits(getAiCreditSnapshot());
    [
      { method: 'post', url: '/api/ai/intelligence/what-if' },
      { method: 'get', url: '/api/ai/history/9' },
      { method: 'get', url: '/api/ai/intelligence/subjects/42/preview' },
      { method: 'post', url: '/api/ai/intelligence/subjects/resolve' },
    ].forEach((config) => {
      ingestAiHttpSuccess({
        config,
        data: { success: true, subscription: { credits_remaining: 0 } },
      });
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(before);
    expect(isCreditConsumingPostRequest({ method: 'post', url: '/api/ai/intelligence/what-if' })).toBe(false);
    expect(isCreditConsumingPostRequest({ method: 'get', url: '/api/ai/intelligence/subjects/42/preview' })).toBe(false);
  });

  test('unlimited plans stay Unlimited and keep plan identity', () => {
    applyServerCreditState({
      subscription: { credits_remaining: -1, plan: 'professional' },
      plan: { id: 'professional', unlimited: true },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe('Unlimited');
    expect(isUnlimitedPlan(getAiCreditSnapshot())).toBe(true);
    ingestAiHttpSuccess({
      config: { method: 'post', url: '/api/ai/intelligence/analyse/71' },
      data: { success: true, subscription: { credits_remaining: -1, plan: 'professional' }, plan: { id: 'professional', unlimited: true } },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe('Unlimited');
    expect(getAiCreditSnapshot().plan.id).toBe('professional');
  });

  test('credit refresh failure does not discard an already applied successful analyse snapshot', async () => {
    ingestAiHttpSuccess({
      config: { method: 'post', url: '/api/ai/intelligence/analyse/8' },
      data: { success: true, output: { ok: true }, subscription: { credits_remaining: 6 } },
    });
    configureAiCreditFetcher(() => Promise.reject(new Error('network')));
    await expect(refreshAiCredits()).rejects.toThrow('network');
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(6);
  });

  test('subscription GETs share one in-flight request and do not loop', async () => {
    let calls = 0;
    configureAiCreditFetcher(() => {
      calls += 1;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ subscription: { credits_remaining: 9 }, plan: { id: 'free' } }), 0);
      });
    });
    const [a, b] = await Promise.all([refreshAiCredits(), refreshAiCredits()]);
    expect(calls).toBe(1);
    expect(a.subscription.credits_remaining).toBe(9);
    expect(b.subscription.credits_remaining).toBe(9);
    expect(isSubscriptionGetRequest({ method: 'get', url: '/api/ai/subscription' })).toBe(true);
    expect(isCreditConsumingPostRequest({ method: 'get', url: '/api/ai/subscription' })).toBe(false);
    ingestAiHttpSuccess({
      config: { method: 'get', url: '/api/ai/subscription' },
      data: { subscription: { credits_remaining: 0 } },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(9);
  });

  test('a slow subscription GET cannot overwrite a newer analyse snapshot', async () => {
    let resolveFetch;
    const delayed = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    configureAiCreditFetcher(() => delayed);
    const pending = refreshAiCredits();
    ingestAiHttpSuccess({
      config: { method: 'post', url: '/api/ai/intelligence/analyse/71' },
      data: { success: true, subscription: { credits_remaining: 3 } },
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(3);
    resolveFetch({ subscription: { credits_remaining: 4 }, plan: { id: 'free' } });
    await pending;
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(3);
  });

  test('other credit-consuming AI posts update the shared snapshot', () => {
    applyServerCreditState({ subscription: { credits_remaining: 8 } });
    [
      '/api/ai/listing-writer',
      '/api/ai/valuation',
      '/api/ai/buyer-match',
      '/api/ai/investment/analyse',
      '/api/ai/rent/analyse',
      '/api/ai/portfolio/analyse',
    ].forEach((url) => {
      ingestAiHttpSuccess({
        config: { method: 'post', url },
        data: { success: true, subscription: { credits_remaining: 7 } },
      });
    });
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(7);
  });

  test('402 without a subscription payload does not refetch or decrement', async () => {
    applyServerCreditState({
      subscription: { credits_remaining: 1 },
      plan: { id: 'free' },
    });
    let calls = 0;
    configureAiCreditFetcher(async () => {
      calls += 1;
      return { subscription: { credits_remaining: 0 }, plan: { id: 'free' } };
    });
    ingestAiHttpError({
      response: { status: 402, data: { code: 'INSUFFICIENT_CREDITS', message: 'No credits remaining.' } },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(1);
  });

  test('there is a single snapshot store and no client credit arithmetic', () => {
    const first = applyServerCreditState({ subscription: { credits_remaining: 3 } });
    const second = applyServerCreditState({ subscription: { credits_remaining: 2 } });
    expect(getAiCreditSnapshot()).toBe(second);
    expect(first).not.toBe(second);
    expect(displayAiCredits(getAiCreditSnapshot())).toBe(2);
  });
});
