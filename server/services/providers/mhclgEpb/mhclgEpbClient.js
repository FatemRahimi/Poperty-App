/**
 * MHCLG Energy Certificate Data API client.
 * Bearer token from configuration only. Never logs the token or raw addresses.
 */

const {
  EPB_CAPABILITY,
  EPB_ERROR,
  EPB_SOURCE,
  CERTIFICATE_TYPE,
} = require('../../../architecture/epbEvidenceContract');
const { extractSearchRows, extractPagination, parseSearchCandidate } = require('./mhclgEpbParser');

function redactHeaders(headers = {}) {
  const out = { ...headers };
  if (out.Authorization || out.authorization) {
    out.Authorization = 'Bearer [redacted]';
    delete out.authorization;
  }
  return out;
}

function classifyHttp(status, error) {
  if (status === 429) return EPB_ERROR.RATE_LIMITED;
  if (status >= 500) return EPB_ERROR.HTTP_5XX;
  if (status >= 400) return EPB_ERROR.HTTP_4XX;
  const message = String(error?.message || error || '');
  const name = String(error?.name || '');
  if (name === 'AbortError' || /aborted|timeout|timed out/i.test(message)) return EPB_ERROR.TIMEOUT;
  if (/network|fetch failed|econn|enotfound|eai_again/i.test(message)) return EPB_ERROR.NETWORK;
  if (/malformed|json/i.test(message)) return EPB_ERROR.MALFORMED;
  return EPB_ERROR.UNEXPECTED;
}

function logEpb(event, extras = {}) {
  const parts = [`[mhclg-epb] event=${event}`];
  Object.entries(extras).forEach(([key, value]) => {
    if (value === undefined) return;
    if (/token|authorization|bearer|address/i.test(key)) return;
    parts.push(`${key}=${value}`);
  });
  console.info(parts.join(' '));
}

function sleep(ms, sleeper) {
  const wait = sleeper || ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
  return wait(ms);
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    search.set(key, String(value));
  });
  return search.toString();
}

async function epbFetch(config, path, params, deps = {}) {
  if (!config?.bearerToken) {
    return {
      ok: false,
      capability: EPB_CAPABILITY.UNAVAILABLE_MISSING_CREDENTIAL,
      errorCode: EPB_ERROR.MISSING_CREDENTIAL,
      status: 0,
      data: null,
    };
  }
  const fetchFn = deps.fetch || fetch;
  const timeoutMs = config.timeoutMs || 15000;
  const query = buildQuery(params);
  const url = `${String(config.baseUrl).replace(/\/$/, '')}${path}${query ? `?${query}` : ''}`;
  const headers = {
    Authorization: `Bearer ${config.bearerToken}`,
    Accept: 'application/json',
  };

  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          if (response.status !== 404) {
            throw Object.assign(new Error('malformed_provider_response'), { status: response.status });
          }
        }
      }
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  };

  let lastError = null;
  for (let i = 0; i <= (config.maxRetries || 1); i += 1) {
    try {
      const { response, data } = await attempt();
      if (response.status === 429) {
        logEpb('rate_limited', { path, attempt: i + 1 });
        if (i < (config.maxRetries || 1)) {
          const retryAfter = Number(response.headers?.get?.('retry-after')) || 2;
          await sleep(Math.min(retryAfter, 5) * 1000, deps.sleep);
          continue;
        }
        return {
          ok: false,
          capability: EPB_CAPABILITY.SOURCE_ERROR,
          errorCode: EPB_ERROR.RATE_LIMITED,
          status: 429,
          data: null,
        };
      }
      if (response.status === 404) {
        return {
          ok: true,
          empty: true,
          capability: EPB_CAPABILITY.AVAILABLE,
          errorCode: null,
          status: 404,
          data: data || { data: [] },
        };
      }
      if (!response.ok) {
        const errorCode = classifyHttp(response.status);
        logEpb('source_error', { path, status: response.status, errorCode });
        if (errorCode === EPB_ERROR.HTTP_5XX && i < (config.maxRetries || 1)) {
          await sleep(250, deps.sleep);
          continue;
        }
        return {
          ok: false,
          capability: EPB_CAPABILITY.SOURCE_ERROR,
          errorCode,
          status: response.status,
          data: null,
        };
      }
      return {
        ok: true,
        empty: false,
        capability: EPB_CAPABILITY.AVAILABLE,
        errorCode: null,
        status: response.status,
        data,
      };
    } catch (error) {
      lastError = error;
      const errorCode = classifyHttp(error.status || 0, error);
      if (errorCode === EPB_ERROR.TIMEOUT || errorCode === EPB_ERROR.NETWORK || errorCode === EPB_ERROR.HTTP_5XX) {
        if (i < (config.maxRetries || 1)) {
          await sleep(250, deps.sleep);
          continue;
        }
      }
      logEpb('source_error', { path, errorCode });
      return {
        ok: false,
        capability: EPB_CAPABILITY.SOURCE_ERROR,
        errorCode,
        status: error.status || 0,
        data: null,
      };
    }
  }
  return {
    ok: false,
    capability: EPB_CAPABILITY.SOURCE_ERROR,
    errorCode: classifyHttp(0, lastError),
    status: 0,
    data: null,
  };
}

function createMhclgEpbClient(config, deps = {}) {
  async function search(certificateType, params) {
    const path = certificateType === CERTIFICATE_TYPE.NON_DOMESTIC
      ? '/api/non-domestic/search'
      : '/api/domestic/search';
    const result = await epbFetch(config, path, {
      postcode: params.postcode || undefined,
      address: params.address || undefined,
      uprn: params.uprn || undefined,
      page_size: params.pageSize || config.pageSize || 100,
      current_page: params.page || 1,
    }, deps);
    if (!result.ok) return { ...result, rows: [], pagination: extractPagination(null) };
    const rows = extractSearchRows(result.data)
      .map((row) => parseSearchCandidate(row, certificateType))
      .filter(Boolean);
    return {
      ...result,
      rows,
      pagination: extractPagination(result.data),
    };
  }

  async function fetchCertificate(certificateNumber) {
    const result = await epbFetch(config, '/api/certificate', {
      certificate_number: certificateNumber,
    }, deps);
    return {
      ...result,
      requestedCertificateNumber: certificateNumber,
    };
  }

  return {
    source: EPB_SOURCE,
    search,
    fetchCertificate,
    redactHeaders,
  };

  return {
    source: EPB_SOURCE,
    search,
    fetchCertificate,
    redactHeaders,
  };
}

module.exports = {
  createMhclgEpbClient,
  epbFetch,
  classifyHttp,
  redactHeaders,
  logEpb,
  buildQuery,
};
