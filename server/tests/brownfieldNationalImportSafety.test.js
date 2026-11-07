/**
 * Phase 3K.1 — national Brownfield import destination safety.
 * No live database, no national download, no propertydb writes.
 * Run: node tests/brownfieldNationalImportSafety.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertSafeNationalDatabase,
  assertSafeNationalBrownfieldImport,
  attachPostgresConnectionDestination,
  resolvePostgresDestinationFromDb,
} = require('../services/market/brownfieldNationalImportSafety');
const { createMemoryBrownfieldLandStore, createPostgresBrownfieldLandStore } = require('../services/market/brownfieldLandStore');
const { createMemoryBrownfieldArtifactStore, createPostgresBrownfieldArtifactStore } = require('../services/market/brownfieldArtifactStore');
const {
  importBrownfieldArtifactFile,
  importOfficialNationalBrownfieldArtifact,
} = require('../services/market/importBrownfieldArtifact');

const MIN_CSV = path.join(__dirname, 'fixtures/planningdata-brownfield-land-min.csv');

let passed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function fakeQueryable(options) {
  return {
    options,
    async query() {
      throw new Error('query_must_not_run');
    },
  };
}

function postgresStores(options) {
  const db = fakeQueryable(options);
  return {
    landStore: createPostgresBrownfieldLandStore(db),
    artifactStore: createPostgresBrownfieldArtifactStore(db),
  };
}

function disposableAuth(databaseName = 'property_phase3k_test') {
  return { confirmed: true, disposable: true, databaseName };
}

(async () => {
  await test('missing authorization is rejected', async () => {
    assert.throws(
      () => assertSafeNationalDatabase(null),
      (error) => error.code === 'national_brownfield_import_not_authorized'
    );
    assert.throws(
      () => assertSafeNationalDatabase({ confirmed: true, disposable: false, databaseName: 'property_phase3k_test' }),
      (error) => error.code === 'national_brownfield_import_not_authorized'
    );
  });

  await test('forged disposable authorization is rejected when connection name differs', async () => {
    const { landStore, artifactStore } = postgresStores({
      host: '127.0.0.1',
      database: 'actual_disposable_db',
    });
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth('forged_other_db'),
        landStore,
        artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_refuses_forged_authorization'
    );
  });

  await test('actual propertydb destination is rejected', async () => {
    const { landStore, artifactStore } = postgresStores({
      host: 'localhost',
      database: 'propertydb',
    });
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth('propertydb'),
        landStore,
        artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_refuses_unsafe_database'
    );
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth('property_phase3k_test'),
        landStore,
        artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_refuses_unsafe_database'
    );
  });

  await test('non-disposable and remote destinations are rejected', async () => {
    assert.throws(
      () => assertSafeNationalDatabase({
        confirmed: true,
        disposable: false,
        databaseName: 'property_phase3k_test',
      }),
      (error) => error.code === 'national_brownfield_import_not_authorized'
    );

    const remote = postgresStores({
      host: 'db.example.com',
      database: 'property_phase3k_test',
    });
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth(),
        landStore: remote.landStore,
        artifactStore: remote.artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_refuses_remote_database'
    );

    const unverified = {
      landStore: { kind: 'postgres', connectionDestination: { verified: false, reason: 'missing_connection_options' } },
      artifactStore: { kind: 'postgres', connectionDestination: { verified: false, reason: 'missing_connection_options' } },
    };
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth(),
        ...unverified,
      }),
      (error) => error.code === 'national_brownfield_import_destination_unverified'
    );
  });

  await test('conflicting connectionString and discrete fields fail closed', async () => {
    const conflicted = resolvePostgresDestinationFromDb(fakeQueryable({
      host: '127.0.0.1',
      database: 'safe_local',
      connectionString: 'postgres://u:p@remote.example:5432/propertydb',
    }));
    assert.strictEqual(conflicted.verified, false);
    assert.strictEqual(conflicted.reason, 'ambiguous_connection_identity');

    const { landStore, artifactStore } = postgresStores({
      host: '127.0.0.1',
      database: 'property_phase3k_test',
      connectionString: 'postgres://u:p@db.example.com:5432/property_phase3k_test',
    });
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth(),
        landStore,
        artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_destination_unverified'
    );

    const agreeing = resolvePostgresDestinationFromDb(fakeQueryable({
      host: 'localhost',
      database: 'property_phase3k_test',
      connectionString: 'postgres://u:p@localhost:5432/property_phase3k_test',
    }));
    assert.strictEqual(agreeing.verified, true);
    assert.strictEqual(agreeing.host, 'localhost');
    assert.strictEqual(agreeing.databaseName, 'property_phase3k_test');
  });

  await test('mixed memory and postgres stores still enforce postgres authorization', async () => {
    const { artifactStore } = postgresStores({
      host: '127.0.0.1',
      database: 'propertydb',
    });
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth('property_phase3k_test'),
        landStore: createMemoryBrownfieldLandStore(),
        artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_refuses_unsafe_database'
    );

    const safe = postgresStores({
      host: '127.0.0.1',
      database: 'property_phase3k_test',
    });
    const allowed = assertSafeNationalBrownfieldImport({
      authorization: disposableAuth(),
      landStore: createMemoryBrownfieldLandStore(),
      artifactStore: safe.artifactStore,
    });
    assert.strictEqual(allowed.mode, 'postgres');
    assert.strictEqual(allowed.databaseName, 'property_phase3k_test');
  });

  await test('valid explicitly authorized local disposable destination passes the guard', async () => {
    const fromFields = postgresStores({
      host: '127.0.0.1',
      database: 'property_phase3k_test',
    });
    const allowed = assertSafeNationalBrownfieldImport({
      authorization: disposableAuth(),
      landStore: fromFields.landStore,
      artifactStore: fromFields.artifactStore,
    });
    assert.strictEqual(allowed.mode, 'postgres');
    assert.strictEqual(allowed.databaseName, 'property_phase3k_test');
    assert.strictEqual(allowed.host, '127.0.0.1');

    const fromUrlDb = fakeQueryable({
      connectionString: 'postgres://user:pass@localhost:5432/property_phase3k_test',
    });
    const fromConnectionString = attachPostgresConnectionDestination(fromUrlDb);
    assert.strictEqual(fromConnectionString.verified, true);
    assert.strictEqual(fromConnectionString.host, 'localhost');
    assert.strictEqual(fromConnectionString.databaseName, 'property_phase3k_test');
    assert.deepStrictEqual(
      resolvePostgresDestinationFromDb(fromUrlDb),
      fromConnectionString
    );

    const fromUrl = postgresStores({
      connectionString: 'postgres://user:pass@localhost:5432/property_phase3k_test',
    });
    const allowedUrl = assertSafeNationalBrownfieldImport({
      authorization: disposableAuth(),
      landStore: fromUrl.landStore,
      artifactStore: fromUrl.artifactStore,
    });
    assert.strictEqual(allowedUrl.host, 'localhost');
    assert.strictEqual(allowedUrl.databaseName, 'property_phase3k_test');
  });

  await test('direct file import cannot bypass authorization for postgres stores', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-safety-'));
    const { landStore, artifactStore } = postgresStores({
      host: '127.0.0.1',
      database: 'propertydb',
    });
    let insertCalls = 0;
    const originalInsert = artifactStore.insertRetrieved.bind(artifactStore);
    artifactStore.insertRetrieved = async (...args) => {
      insertCalls += 1;
      return originalInsert(...args);
    };

    await assert.rejects(
      () => importBrownfieldArtifactFile({
        filePath: MIN_CSV,
        directory,
        landStore,
        artifactStore,
        authorization: disposableAuth('property_phase3k_test'),
      }),
      (error) => error.code === 'national_brownfield_import_refuses_unsafe_database'
    );
    await assert.rejects(
      () => importBrownfieldArtifactFile({
        filePath: MIN_CSV,
        directory,
        landStore: postgresStores({ host: '127.0.0.1', database: 'other_db' }).landStore,
        artifactStore: postgresStores({ host: '127.0.0.1', database: 'other_db' }).artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_not_authorized'
    );
    assert.strictEqual(insertCalls, 0);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await test('official national wrapper refuses before retrieval when destination is unsafe', async () => {
    let calls = 0;
    const request = () => {
      calls += 1;
      throw new Error('should_not_retrieve');
    };
    const { landStore, artifactStore } = postgresStores({
      host: '127.0.0.1',
      database: 'propertydb',
    });
    await assert.rejects(
      () => importOfficialNationalBrownfieldArtifact({
        request,
        landStore,
        artifactStore,
        authorization: disposableAuth('property_phase3k_test'),
      }),
      (error) => error.code === 'national_brownfield_import_refuses_unsafe_database'
    );
    await assert.rejects(
      () => importOfficialNationalBrownfieldArtifact({ request }),
      (error) => error.code === 'national_brownfield_import_not_authorized'
    );
    assert.strictEqual(calls, 0);
  });

  await test('memory fixture stores remain allowed without national authorization', async () => {
    const allowed = assertSafeNationalBrownfieldImport({
      landStore: createMemoryBrownfieldLandStore(),
      artifactStore: createMemoryBrownfieldArtifactStore(),
    });
    assert.strictEqual(allowed.mode, 'memory');

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-safety-mem-'));
    const result = await importBrownfieldArtifactFile({
      filePath: MIN_CSV,
      directory,
      landStore: createMemoryBrownfieldLandStore(),
      artifactStore: createMemoryBrownfieldArtifactStore(),
    });
    assert.strictEqual(result.status, 'SUCCEEDED');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await test('forged or mutable connectionDestination cannot authorize a postgres import', async () => {
    const forgedLabels = {
      landStore: {
        kind: 'postgres',
        connectionDestination: {
          verified: true,
          host: '127.0.0.1',
          databaseName: 'property_phase3k_test',
        },
        async query() { throw new Error('query_must_not_run'); },
      },
      artifactStore: {
        kind: 'postgres',
        connectionDestination: {
          verified: true,
          host: '127.0.0.1',
          databaseName: 'property_phase3k_test',
        },
        async insertRetrieved() {
          throw new Error('insert_must_not_run');
        },
      },
    };
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth(),
        ...forgedLabels,
      }),
      (error) => error.code === 'national_brownfield_import_destination_unverified'
    );

    const forgedMemory = {
      kind: 'memory',
      async insertRetrieved() { throw new Error('insert_must_not_run'); },
    };
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        landStore: forgedMemory,
        artifactStore: forgedMemory,
      }),
      (error) => error.code === 'national_brownfield_import_destination_unverified'
    );

    const propertyDb = postgresStores({
      host: '127.0.0.1',
      database: 'propertydb',
    });
    const destinationDescriptor = Object.getOwnPropertyDescriptor(
      propertyDb.landStore,
      'connectionDestination'
    );
    assert.strictEqual(destinationDescriptor.writable, false);
    assert.strictEqual(destinationDescriptor.configurable, false);
    try {
      propertyDb.landStore.connectionDestination = {
        verified: true,
        host: '127.0.0.1',
        databaseName: 'property_phase3k_test',
      };
    } catch (_error) {
      // Strict-mode assignment to a frozen factory label throws; non-strict ignores it.
    }
    assert.strictEqual(propertyDb.landStore.connectionDestination.databaseName, 'propertydb');
    assert.throws(
      () => assertSafeNationalBrownfieldImport({
        authorization: disposableAuth(),
        landStore: propertyDb.landStore,
        artifactStore: propertyDb.artifactStore,
      }),
      (error) => error.code === 'national_brownfield_import_refuses_unsafe_database'
    );

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-safety-f3-'));
    await assert.rejects(
      () => importBrownfieldArtifactFile({
        filePath: MIN_CSV,
        directory,
        landStore: forgedLabels.landStore,
        artifactStore: forgedLabels.artifactStore,
        authorization: disposableAuth(),
      }),
      (error) => error.code === 'national_brownfield_import_destination_unverified'
    );
    fs.rmSync(directory, { recursive: true, force: true });
  });

  if (process.exitCode) {
    console.error(`brownfieldNationalImportSafety: ${passed} passed, with failures`);
    process.exit(process.exitCode);
  }
  console.log(`brownfieldNationalImportSafety: ${passed} passed`);
})();
