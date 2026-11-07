/**
 * Decision 017 — national Brownfield import destination safety.
 *
 * Authorization flags alone are not enough. PostgreSQL destinations are
 * identified from the actual pool/client connection configuration attached to
 * the store. Memory fixture stores do not require national authorization.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function safetyError(code, message) {
  return Object.assign(new Error(message || code), { code });
}

function normalizeHost(host) {
  if (host == null) return null;
  let value = String(host).trim();
  if (!value) return null;
  // URL / pg may expose IPv6 as [::1]; treat that as ::1.
  if (value.startsWith('[') && value.endsWith(']') && value.length > 2) {
    value = value.slice(1, -1).trim();
  }
  return value || null;
}

function isLocalHost(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  return LOCAL_HOSTS.has(normalized.toLowerCase());
}

function isPropertyDbName(name) {
  return String(name || '').trim().toLowerCase() === 'propertydb';
}

function sameIdentityValue(left, right) {
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

/**
 * Resolve host + database name from a node-pg Pool/Client options object.
 * Fail closed when the destination cannot be read from real connection config.
 *
 * When connectionString is present, it is authoritative (matching node-pg
 * ConnectionParameters). Discrete host/database that disagree with the parsed
 * string fail closed as ambiguous rather than trusting the non-connecting labels.
 */
function resolvePostgresDestinationFromDb(db) {
  if (!db || typeof db.query !== 'function') {
    return {
      verified: false,
      reason: 'missing_queryable_database',
      host: null,
      databaseName: null,
    };
  }

  const options = db.options;
  if (!options || typeof options !== 'object') {
    return {
      verified: false,
      reason: 'missing_connection_options',
      host: null,
      databaseName: null,
    };
  }

  const fieldHost = normalizeHost(options.host);
  const fieldDatabase = options.database != null && String(options.database).trim() !== ''
    ? String(options.database).trim()
    : null;

  const connectionString = options.connectionString
    || options.connectionUri
    || null;

  let host = null;
  let databaseName = null;

  if (connectionString) {
    let parsedHost = null;
    let parsedDatabase = null;
    try {
      const parsed = new URL(connectionString);
      parsedHost = normalizeHost(parsed.hostname);
      const pathName = decodeURIComponent(String(parsed.pathname || '').replace(/^\//, ''));
      parsedDatabase = pathName || null;
    } catch {
      return {
        verified: false,
        reason: 'unparseable_connection_string',
        host: null,
        databaseName: null,
      };
    }

    if (!parsedHost || !parsedDatabase) {
      return {
        verified: false,
        reason: 'incomplete_connection_identity',
        host: parsedHost || null,
        databaseName: parsedDatabase || null,
      };
    }

    if (fieldHost && !sameIdentityValue(fieldHost, parsedHost)) {
      return {
        verified: false,
        reason: 'ambiguous_connection_identity',
        host: null,
        databaseName: null,
      };
    }
    if (fieldDatabase && !sameIdentityValue(fieldDatabase, parsedDatabase)) {
      return {
        verified: false,
        reason: 'ambiguous_connection_identity',
        host: null,
        databaseName: null,
      };
    }

    host = parsedHost;
    databaseName = parsedDatabase;
  } else {
    host = fieldHost;
    databaseName = fieldDatabase;
  }

  if (!host || !databaseName) {
    return {
      verified: false,
      reason: 'incomplete_connection_identity',
      host: host || null,
      databaseName: databaseName || null,
    };
  }

  return {
    verified: true,
    reason: null,
    host,
    databaseName,
    backend: 'postgres',
  };
}

function attachPostgresConnectionDestination(db) {
  return resolvePostgresDestinationFromDb(db);
}

/**
 * Factory-only seal. Public kind / connectionDestination labels are never
 * authoritative for national-import authorization.
 */
const BROWNFIELD_STORE_SEAL = Symbol('brownfield.storeSeal');

function sealMemoryBrownfieldStore(store) {
  if (!store || typeof store !== 'object') {
    throw safetyError('brownfield_store_seal_invalid', 'brownfield_store_seal_invalid');
  }
  Object.defineProperty(store, BROWNFIELD_STORE_SEAL, {
    value: Object.freeze({ kind: 'memory' }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return store;
}

function sealPostgresBrownfieldStore(store, db) {
  if (!store || typeof store !== 'object' || !db || typeof db.query !== 'function') {
    throw safetyError('brownfield_store_seal_invalid', 'brownfield_store_seal_invalid');
  }
  const destination = Object.freeze(attachPostgresConnectionDestination(db));
  Object.defineProperty(store, BROWNFIELD_STORE_SEAL, {
    value: Object.freeze({ kind: 'postgres', db }),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  Object.defineProperty(store, 'connectionDestination', {
    value: destination,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  return store;
}

function assertAuthorizationFlags(authorization) {
  if (!authorization || authorization.confirmed !== true || authorization.disposable !== true) {
    throw safetyError(
      'national_brownfield_import_not_authorized',
      'national_brownfield_import_not_authorized'
    );
  }
  const claimedName = String(authorization.databaseName || '').trim();
  if (!claimedName || isPropertyDbName(claimedName)) {
    throw safetyError(
      'national_brownfield_import_refuses_unsafe_database',
      'national_brownfield_import_refuses_unsafe_database'
    );
  }
  return claimedName;
}

/**
 * Legacy/auth-object-only check retained for callers that only have labels.
 * Prefer assertSafeNationalBrownfieldImport with real store destinations.
 */
function assertSafeNationalDatabase(authorization) {
  assertAuthorizationFlags(authorization);
}

function storeDestinationOrNull(store) {
  if (!store || typeof store !== 'object') return null;

  const seal = store[BROWNFIELD_STORE_SEAL];
  if (!seal || typeof seal !== 'object') {
    return {
      kind: store.kind || 'unknown',
      verified: false,
      reason: 'unsealed_store_identity',
      host: null,
      databaseName: null,
    };
  }

  if (seal.kind === 'memory') {
    return { kind: 'memory', verified: true };
  }

  if (seal.kind === 'postgres') {
    // Re-resolve from the factory-bound db handle. Never trust public labels.
    const destination = resolvePostgresDestinationFromDb(seal.db);
    if (!destination || destination.verified !== true) {
      return {
        kind: 'postgres',
        verified: false,
        reason: (destination && destination.reason) || 'connection_destination_unverified',
        host: destination ? destination.host : null,
        databaseName: destination ? destination.databaseName : null,
      };
    }
    return {
      kind: 'postgres',
      verified: true,
      host: destination.host,
      databaseName: destination.databaseName,
    };
  }

  return {
    kind: seal.kind || store.kind || 'unknown',
    verified: false,
    reason: 'unsupported_store_kind',
  };
}

/**
 * Guard used by both the official national wrapper and direct file import.
 * Memory-only stores pass without authorization. Any PostgreSQL destination
 * must be an explicitly authorized local disposable database whose name matches
 * the real connection identity.
 */
function assertSafeNationalBrownfieldImport({
  authorization = null,
  landStore = null,
  artifactStore = null,
} = {}) {
  if (!landStore || !artifactStore) {
    throw safetyError(
      'national_brownfield_import_destination_unverified',
      'national_brownfield_import_requires_stores'
    );
  }

  const destinations = [storeDestinationOrNull(landStore), storeDestinationOrNull(artifactStore)];
  if (
    destinations.some((destination) => !destination)
    || destinations.some((destination) => destination.verified !== true)
  ) {
    const reason = destinations
      .map((destination) => destination && destination.reason)
      .find((value) => value)
      || 'national_brownfield_import_destination_unverified';
    throw safetyError(
      'national_brownfield_import_destination_unverified',
      reason
    );
  }

  const postgresDestinations = destinations.filter((destination) => destination.kind === 'postgres');
  const memoryDestinations = destinations.filter((destination) => destination.kind === 'memory');

  if (postgresDestinations.length === 0) {
    if (memoryDestinations.length !== destinations.length) {
      throw safetyError(
        'national_brownfield_import_destination_unverified',
        'national_brownfield_import_destination_unverified'
      );
    }
    return { mode: 'memory', allowed: true };
  }

  const claimedName = assertAuthorizationFlags(authorization);

  postgresDestinations.forEach((destination) => {
    if (destination.verified !== true || !destination.databaseName || !destination.host) {
      throw safetyError(
        'national_brownfield_import_destination_unverified',
        destination.reason || 'national_brownfield_import_destination_unverified'
      );
    }
    if (isPropertyDbName(destination.databaseName)) {
      throw safetyError(
        'national_brownfield_import_refuses_unsafe_database',
        'national_brownfield_import_refuses_unsafe_database'
      );
    }
    if (!isLocalHost(destination.host)) {
      throw safetyError(
        'national_brownfield_import_refuses_remote_database',
        'national_brownfield_import_refuses_remote_database'
      );
    }
    if (String(destination.databaseName).toLowerCase() !== claimedName.toLowerCase()) {
      throw safetyError(
        'national_brownfield_import_refuses_forged_authorization',
        'national_brownfield_import_refuses_forged_authorization'
      );
    }
  });

  const names = new Set(
    postgresDestinations.map((destination) => String(destination.databaseName).toLowerCase())
  );
  const hosts = new Set(
    postgresDestinations.map((destination) => String(destination.host).toLowerCase())
  );
  if (names.size !== 1 || hosts.size !== 1) {
    throw safetyError(
      'national_brownfield_import_destination_unverified',
      'national_brownfield_import_store_destination_mismatch'
    );
  }

  return {
    mode: 'postgres',
    allowed: true,
    databaseName: postgresDestinations[0].databaseName,
    host: postgresDestinations[0].host,
  };
}

module.exports = {
  LOCAL_HOSTS,
  BROWNFIELD_STORE_SEAL,
  isLocalHost,
  isPropertyDbName,
  resolvePostgresDestinationFromDb,
  attachPostgresConnectionDestination,
  sealMemoryBrownfieldStore,
  sealPostgresBrownfieldStore,
  assertSafeNationalDatabase,
  assertSafeNationalBrownfieldImport,
};
