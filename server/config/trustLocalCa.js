'use strict';

/**
 * Avast Web/Mail Shield intercepts HTTPS on this machine and re-signs it.
 * Node does not trust that local root, so Google token exchange fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. If a gitignored PEM is present, trust it
 * in addition to the public roots. Never log the certificate.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const tls = require('tls');

const caPath = path.join(__dirname, '..', '.local-ca.pem');

function trustLocalCa() {
  if (!fs.existsSync(caPath)) return false;
  const extra = fs.readFileSync(caPath, 'utf8');
  if (!extra.includes('BEGIN CERTIFICATE')) return false;
  https.globalAgent.options.ca = [...tls.rootCertificates, extra];
  return true;
}

module.exports = { trustLocalCa, caPath };
