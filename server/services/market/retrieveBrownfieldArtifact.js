/**
 * HTTPS retrieval of the official brownfield-land bulk CSV.
 * The hash is updated from each chunk. The national file is not buffered
 * in memory in order to hash it. A partial file is removed after failure.
 * The final name is the SHA-256. An existing file with that name is not rewritten.
 */

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { BROWNFIELD_BULK_CSV_URL } = require('../../architecture/officialBrownfieldLandDataset');
const { headerFromSample } = require('./brownfieldArtifactCsv');

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_REDIRECTS = 5;
const ALLOWED_HOSTS = new Set([
  'files.planning.data.gov.uk',
  'www.planning.data.gov.uk',
  'planning.data.gov.uk',
]);

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  if (host.endsWith('.cloudfront.net')) return true;
  if (host.endsWith('.amazonaws.com')) return true;
  return false;
}

function assertHttpsUrl(value) {
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol !== 'https:') {
    const error = new Error('brownfield_artifact_https_required');
    error.code = 'brownfield_artifact_https_required';
    throw error;
  }
  if (!hostAllowed(url.hostname)) {
    const error = new Error('brownfield_artifact_host_not_allowed');
    error.code = 'brownfield_artifact_host_not_allowed';
    throw error;
  }
  return url;
}

function headerValue(headers, name) {
  if (!headers) return null;
  const direct = headers[name] || headers[name.toLowerCase()] || headers[String(name).toLowerCase()];
  if (Array.isArray(direct)) return direct[0] == null ? null : String(direct[0]);
  return direct == null || direct === '' ? null : String(direct);
}

function looksLikeHtml(sample) {
  const text = Buffer.isBuffer(sample) ? sample.toString('utf8') : String(sample || '');
  return /^\s*</.test(text);
}

function removeFile(filePath) {
  if (!filePath) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    /* already gone */
  }
}

function defaultRequest(url, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        stream: res,
        resolvedUrl: url.toString(),
      });
    });
    req.on('timeout', () => {
      req.destroy(Object.assign(new Error('brownfield_artifact_timeout'), { code: 'brownfield_artifact_timeout' }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function writeHashedStream(source, tempPath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const sample = [];
  let sampleBytes = 0;
  const hasher = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      bytes += buffer.length;
      if (sampleBytes < 4096) {
        sample.push(buffer);
        sampleBytes += buffer.length;
      }
      callback(null, buffer);
    },
  });
  await pipeline(source, hasher, fs.createWriteStream(tempPath));
  return {
    sha256: hash.digest('hex'),
    byteLength: bytes,
    sample: Buffer.concat(sample).subarray(0, 4096),
  };
}

async function retrieveBrownfieldArtifact({
  url = BROWNFIELD_BULK_CSV_URL,
  directory,
  request = defaultRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!directory) {
    throw Object.assign(new Error('brownfield_artifact_directory_required'), {
      code: 'brownfield_artifact_directory_required',
    });
  }
  fs.mkdirSync(directory, { recursive: true });
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 180000) {
    throw Object.assign(new Error('brownfield_artifact_timeout_unbounded'), {
      code: 'brownfield_artifact_timeout_unbounded',
    });
  }
  let current = assertHttpsUrl(url);
  let response = await request(current, { timeoutMs });
  let redirects = 0;
  while (response.statusCode >= 300 && response.statusCode < 400) {
    if (response.stream && typeof response.stream.resume === 'function') response.stream.resume();
    redirects += 1;
    if (redirects > MAX_REDIRECTS) {
      throw Object.assign(new Error('brownfield_artifact_too_many_redirects'), {
        code: 'brownfield_artifact_too_many_redirects',
      });
    }
    const location = headerValue(response.headers, 'location');
    if (!location) {
      throw Object.assign(new Error('brownfield_artifact_redirect_missing_location'), {
        code: 'brownfield_artifact_redirect_missing_location',
      });
    }
    current = assertHttpsUrl(new URL(location, current));
    response = await request(current, { timeoutMs });
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.stream && typeof response.stream.resume === 'function') response.stream.resume();
    throw Object.assign(new Error('brownfield_artifact_http_status'), {
      code: 'brownfield_artifact_http_status',
      statusCode: response.statusCode,
    });
  }
  const contentType = headerValue(response.headers, 'content-type');
  if (contentType && /text\/html|application\/xhtml\+xml/i.test(contentType)) {
    if (response.stream && typeof response.stream.resume === 'function') response.stream.resume();
    throw Object.assign(new Error('brownfield_artifact_html_response'), {
      code: 'brownfield_artifact_html_response',
    });
  }
  if (contentType && !/text\/csv|application\/csv|text\/plain/i.test(contentType)) {
    if (response.stream && typeof response.stream.resume === 'function') response.stream.resume();
    throw Object.assign(new Error('brownfield_artifact_unexpected_content_type'), {
      code: 'brownfield_artifact_unexpected_content_type',
      contentType,
    });
  }
  const tempPath = path.join(directory, `.partial-${crypto.randomBytes(8).toString('hex')}.csv`);
  let hashed;
  try {
    hashed = await writeHashedStream(response.stream, tempPath);
    const declared = headerValue(response.headers, 'content-length');
    if (declared != null && Number(declared) !== hashed.byteLength) {
      throw Object.assign(new Error('brownfield_artifact_content_length_mismatch'), {
        code: 'brownfield_artifact_content_length_mismatch',
        contentLength: Number(declared),
        byteLength: hashed.byteLength,
      });
    }
    if (hashed.byteLength === 0 || looksLikeHtml(hashed.sample)) {
      throw Object.assign(new Error('brownfield_artifact_html_or_empty'), {
        code: hashed.byteLength === 0
          ? 'brownfield_artifact_empty'
          : 'brownfield_artifact_html_response',
      });
    }
    headerFromSample(hashed.sample.toString('utf8'));
  } catch (error) {
    removeFile(tempPath);
    throw error;
  }
  const finalPath = path.join(directory, `${hashed.sha256}.csv`);
  if (fs.existsSync(finalPath)) {
    removeFile(tempPath);
    return {
      reused: true,
      filePath: finalPath,
      sha256: hashed.sha256,
      byteLength: hashed.byteLength,
      sourceUrl: url instanceof URL ? url.toString() : String(url),
      resolvedUrl: response.resolvedUrl || current.toString(),
      contentType,
      contentLength: headerValue(response.headers, 'content-length'),
      etag: headerValue(response.headers, 'etag'),
      lastModified: headerValue(response.headers, 'last-modified'),
      retrievedAt: new Date().toISOString(),
    };
  }
  fs.renameSync(tempPath, finalPath);
  return {
    reused: false,
    filePath: finalPath,
    sha256: hashed.sha256,
    byteLength: hashed.byteLength,
    sourceUrl: url instanceof URL ? url.toString() : String(url),
    resolvedUrl: response.resolvedUrl || current.toString(),
    contentType,
    contentLength: headerValue(response.headers, 'content-length'),
    etag: headerValue(response.headers, 'etag'),
    lastModified: headerValue(response.headers, 'last-modified'),
    retrievedAt: new Date().toISOString(),
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  ALLOWED_HOSTS,
  hostAllowed,
  assertHttpsUrl,
  looksLikeHtml,
  retrieveBrownfieldArtifact,
};
