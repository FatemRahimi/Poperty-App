'use strict';

/**
 * Load server/.env from a path relative to this file, not process.cwd().
 * Secrets stay in the env file / host environment. This module never logs values.
 */
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath });

module.exports = {
  envPath,
  loaded: !result.error,
  errorCode: result.error ? result.error.code || 'DOTENV_ERROR' : null,
};
