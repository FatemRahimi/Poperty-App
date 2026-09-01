/**
 * Production private-object adapter registry.
 * Empty until a real provider exists in repository + deployment configuration.
 * Test adapters cannot enable production ingest.
 */

const PRODUCTION_ADAPTERS = Object.freeze({});
const IMPLEMENTED_PRODUCTION_BACKENDS = Object.freeze(Object.keys(PRODUCTION_ADAPTERS));

const testAdapters = new Map();

function registerProductionAdapterForTests(name, adapter) {
  if (process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('TEST_ADAPTER_FORBIDDEN_IN_PRODUCTION'), {
      code: 'TEST_ADAPTER_FORBIDDEN_IN_PRODUCTION',
    });
  }
  const key = String(name || '').trim().toLowerCase();
  if (!key || !adapter) return;
  testAdapters.set(key, adapter);
}

function resetProductionAdaptersForTests() {
  testAdapters.clear();
}

function getProductionAdapter(backendName) {
  const key = String(backendName || '').trim().toLowerCase();
  if (!key) return null;
  if (PRODUCTION_ADAPTERS[key]) return PRODUCTION_ADAPTERS[key];
  if (process.env.NODE_ENV !== 'production' && testAdapters.has(key)) {
    return testAdapters.get(key);
  }
  return null;
}

function createMemoryAdapterForTests() {
  const objects = new Map();
  return {
    name: 'memory-test',
    supportsListing: true,
    privateObjects: true,
    async put(buffer, { storageKey } = {}) {
      const key = storageKey || require('crypto').randomUUID();
      objects.set(key, Buffer.from(buffer));
      return { storageKey: key };
    },
    async read(storageKey) {
      if (!objects.has(storageKey)) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return Buffer.from(objects.get(storageKey));
    },
    async exists(storageKey) {
      return objects.has(storageKey);
    },
    async delete(storageKey) {
      if (!objects.has(storageKey)) return false;
      objects.delete(storageKey);
      return true;
    },
    async stat(storageKey) {
      const buffer = await this.read(storageKey);
      const crypto = require('crypto');
      return {
        byteSize: buffer.length,
        contentHash: crypto.createHash('sha256').update(buffer).digest('hex'),
      };
    },
    async listKeys() {
      return [...objects.keys()];
    },
  };
}

module.exports = {
  PRODUCTION_ADAPTERS,
  IMPLEMENTED_PRODUCTION_BACKENDS,
  registerProductionAdapterForTests,
  resetProductionAdaptersForTests,
  getProductionAdapter,
  createMemoryAdapterForTests,
};
