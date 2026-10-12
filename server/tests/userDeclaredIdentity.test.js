/**
 * User-declared canonical subject identity capture.
 * Run: node server/tests/userDeclaredIdentity.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  CANONICAL_IDENTITY_VERSION,
} = require('../architecture');
const { extractCanonicalAddress, exactAddressKeysEqual } = require('../services/identity/canonicalAddress');
const {
  parseDeclaredIdentityInput,
  hasDeclaredIdentityInput,
  listingFieldsRespectingDeclaration,
  identityForOfficialAcquisition,
  toClientIdentitySnapshot,
} = require('../services/identity/userDeclaredIdentity');
const {
  persistUserDeclaredIdentity,
  persistListingCanonicalIdentity,
  persistOfficialEpbUprn,
} = require('../services/identity/canonicalIdentityService');
const { evaluateEpbCandidates } = require('../services/providers/mhclgEpb/mhclgEpbMatcher');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const { canAccessPropertyIdentity } = require('../controllers/subjectIdentityController');

function test(name, fn) {
  fn();
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function memoryStore() {
  const identities = new Map();
  const events = [];
  return {
    events,
    async findIdentityByPropertyId(id) {
      const row = identities.get(Number(id));
      return row ? { ...row } : null;
    },
    async upsertIdentity(row) {
      const prev = identities.get(Number(row.propertyId)) || {};
      const uprn = row.uprnMode === 'clear'
        ? null
        : (row.uprnMode === 'set' ? row.uprn : (row.uprn || prev.uprn || null));
      const next = {
        ...prev,
        ...row,
        property_id: row.propertyId,
        uprn,
        building_name: row.buildingName || prev.building_name || null,
        component_states: row.componentStates || prev.component_states || {},
        identity_state: row.identityState || prev.identity_state,
        verification_state: row.verificationState || prev.verification_state,
        identity_source: row.identitySource || prev.identity_source,
        evidence_source_type: row.evidenceSourceType || prev.evidence_source_type,
        match_method: row.matchMethod || prev.match_method,
      };
      identities.set(Number(row.propertyId), next);
      return { ...next };
    },
    async recordIdentityEvent(row) {
      events.push(row);
      return row;
    },
  };
}

function depsFrom(store) {
  return {
    findIdentityByPropertyId: store.findIdentityByPropertyId,
    upsertIdentity: store.upsertIdentity,
    recordIdentityEvent: store.recordIdentityEvent,
    createListingFallbackIdentity: async (property) => {
      const listing = extractCanonicalAddress(property);
      const existing = await store.findIdentityByPropertyId(property.id);
      const merged = listingFieldsRespectingDeclaration(listing, existing || {});
      return store.upsertIdentity({
        propertyId: property.id,
        paon: merged.paon,
        saon: merged.saon,
        buildingName: merged.buildingName,
        postcode: merged.postcode || listing.postcode,
        identityState: existing?.identity_state || listing.identityState,
        verificationState: existing?.verification_state || listing.verificationState,
        componentStates: merged.componentStates,
        uprnMode: 'preserve',
        matchMethod: 'listing_fields',
      });
    },
  };
}

console.log('user-declared canonical subject identity\n');

test('contract version unchanged', () => {
  assert.strictEqual(CANONICAL_IDENTITY_VERSION, 'canonical-subject-identity-1.0.0');
});

test('create with simple house identity', () => {
  const got = extractCanonicalAddress({ house_number: '12', zip_code: 'B1 2UJ' });
  assert.strictEqual(got.paon, '12');
  assert.strictEqual(got.saon, null);
  assert.strictEqual(got.verificationState, IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED);
});

test('create with 12A', () => {
  const a = extractCanonicalAddress({ house_number: '12', zip_code: 'B1 2UJ' });
  const b = extractCanonicalAddress({ house_number: '12A', zip_code: 'B1 2UJ' });
  assert.strictEqual(b.paon, '12A');
  assert.strictEqual(exactAddressKeysEqual(a, b), false);
});

test('create Flat 5', () => {
  const parsed = parseDeclaredIdentityInput({ identity_saon: 'Flat 5', identity_paon: '12' });
  assert.strictEqual(parsed.paon, '12');
  assert.strictEqual(parsed.saon, 'Flat 5');
});

test('Flat 5 vs Flat 6', () => {
  const five = parseDeclaredIdentityInput({ identity_saon: 'Flat 5' });
  const six = parseDeclaredIdentityInput({ identity_saon: 'Flat 6' });
  assert.notStrictEqual(five.saon, six.saon);
  const listingFive = { postcode: 'B1 2UJ', paon: '12', saon: 'Flat 5' };
  const listingSix = { postcode: 'B1 2UJ', paon: '12', saon: 'Flat 6' };
  assert.strictEqual(exactAddressKeysEqual(listingFive, listingSix), false);
});

test('building vs unit stay distinct', () => {
  const building = parseDeclaredIdentityInput({ identity_paon: '12', identity_building_name: 'The Towers' });
  const unit = parseDeclaredIdentityInput({ identity_paon: '12', identity_saon: 'Flat 5' });
  assert.strictEqual(building.saon, null);
  assert.strictEqual(unit.saon, 'Flat 5');
  assert.notStrictEqual(building.buildingName, unit.saon);
});

test('commercial suite', () => {
  const parsed = parseDeclaredIdentityInput({ identity_saon: 'Suite 3', identity_paon: '100' });
  assert.strictEqual(parsed.saon, 'Suite 3');
});

test('industrial unit', () => {
  const parsed = parseDeclaredIdentityInput({ identity_saon: 'Unit A', identity_paon: 'Warehouse 4' });
  assert.strictEqual(parsed.saon, 'Unit A');
});

test('mixed-use subject', () => {
  const parsed = parseDeclaredIdentityInput({
    identity_paon: '12',
    identity_saon: 'Flat 1',
    identity_building_name: 'Corner Block',
  });
  assert.strictEqual(parsed.paon, '12');
  assert.strictEqual(parsed.saon, 'Flat 1');
  assert.strictEqual(parsed.buildingName, 'Corner Block');
});

test('agricultural farmhouse identity is optional and not inferred from unit fields', () => {
  const parsed = parseDeclaredIdentityInput({ identity_paon: 'Farmhouse' });
  assert.strictEqual(parsed.paon, 'Farmhouse');
  assert.strictEqual(parsed.saon, null);
  assert.strictEqual(parsed.uprn, null);
});

test('UNKNOWN asset class still accepts declared identity', () => {
  const parsed = parseDeclaredIdentityInput({ identity_saon: 'Unit A', identity_paon: '4' });
  assert.strictEqual(parsed.saon, 'Unit A');
  assert.strictEqual(parsed.paon, '4');
});

test('land without PAON/SAON is valid unresolved', () => {
  const got = extractCanonicalAddress({ zip_code: 'B1 2UJ', property_type: 'land' });
  assert.strictEqual(got.paon, null);
  assert.strictEqual(got.saon, null);
  assert.strictEqual(got.verificationState, IDENTITY_VERIFICATION_STATE.UNRESOLVED);
  assert.strictEqual(hasDeclaredIdentityInput({}), false);
});

test('development site without UPRN', () => {
  const parsed = parseDeclaredIdentityInput({ identity_building_name: 'South Plot' });
  assert.strictEqual(parsed.uprn, null);
  assert.strictEqual(parsed.buildingName, 'South Plot');
});

test('optional UPRN', () => {
  const parsed = parseDeclaredIdentityInput({ identity_paon: '12' });
  assert.strictEqual(parsed.uprn, null);
  assert.strictEqual(parsed.uprnError, null);
});

test('invalid UPRN input', () => {
  assert.strictEqual(parseDeclaredIdentityInput({ identity_uprn: 'abc' }).uprnError, 'INVALID_UPRN');
  assert.strictEqual(parseDeclaredIdentityInput({ identity_uprn: '0000' }).uprnError, 'INVALID_UPRN');
  assert.ok(!parseDeclaredIdentityInput({ identity_uprn: '10002345678' }).uprnError);
});

test('user-declared provenance and injection ignored', () => {
  const parsed = parseDeclaredIdentityInput({
    identity_paon: '12',
    verification_state: 'VERIFIED_EXACT',
    evidence_source_type: 'OFFICIAL_OPEN',
    provider: 'MHCLG_EPBD',
  });
  assert.strictEqual(parsed.paon, '12');
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed, 'verification_state'));
  assert.notStrictEqual(parsed.declaredFields.paon && IDENTITY_VERIFICATION_STATE.USER_DECLARED, IDENTITY_VERIFICATION_STATE.VERIFIED_EXACT);
});

test('client cannot inject VERIFIED_EXACT', () => {
  const parsed = parseDeclaredIdentityInput({
    identity_uprn: '123456',
    verificationState: 'VERIFIED_EXACT',
    identity_state: 'VERIFIED_EXACT',
  });
  assert.strictEqual(parsed.uprn, '123456');
  assert.ok(!parsed.verificationState);
});

asyncTest('identity conflict with existing EPB UPRN', async () => {
  const store = memoryStore();
  const property = { id: 63, house_number: '15', zip_code: 'WV14 6BA' };
  await persistOfficialEpbUprn(
    property,
    { uprn: '1000999', certificateNumber: '1111-2222-3333-4444-5555' },
    null,
    depsFrom(store)
  );
  const result = await persistUserDeclaredIdentity({
    property,
    declared: parseDeclaredIdentityInput({ identity_uprn: '2000002' }),
    actorUserId: 9,
    deps: depsFrom(store),
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.conflict, true);
  const saved = await store.findIdentityByPropertyId(63);
  assert.strictEqual(String(saved.uprn), '1000999');
  assert.ok(store.events.some((row) => row.payload && row.payload.silentlyOverwritten === false));
});

asyncTest('edit existing identity records previous and new', async () => {
  const store = memoryStore();
  const property = { id: 10, house_number: '12', zip_code: 'B1 2UJ' };
  await persistUserDeclaredIdentity({
    property,
    declared: parseDeclaredIdentityInput({ identity_saon: 'Flat 5', identity_paon: '12' }),
    actorUserId: 4,
    deps: depsFrom(store),
  });
  const second = await persistUserDeclaredIdentity({
    property,
    declared: parseDeclaredIdentityInput({ identity_saon: 'Flat 6' }),
    actorUserId: 4,
    deps: depsFrom(store),
  });
  assert.strictEqual(second.previous.saon, 'Flat 5');
  assert.strictEqual(second.identity.saon, 'Flat 6');
  assert.strictEqual(second.identity.verification_state, IDENTITY_VERIFICATION_STATE.USER_DECLARED);
});

asyncTest('listing persist does not overwrite USER_DECLARED PAON', async () => {
  const store = memoryStore();
  const property = { id: 11, house_number: '12', zip_code: 'B1 2UJ' };
  await persistUserDeclaredIdentity({
    property,
    declared: parseDeclaredIdentityInput({ identity_paon: '12A' }),
    deps: depsFrom(store),
  });
  await persistListingCanonicalIdentity(property, depsFrom(store));
  const saved = await store.findIdentityByPropertyId(11);
  assert.strictEqual(saved.paon, '12A');
});

asyncTest('identity event history records previous and new claims', async () => {
  const store = memoryStore();
  const property = { id: 22, house_number: '12', zip_code: 'B1 2UJ' };
  await persistUserDeclaredIdentity({
    property,
    declared: parseDeclaredIdentityInput({ identity_saon: 'Flat 5', identity_paon: '12' }),
    actorUserId: 4,
    deps: depsFrom(store),
  });
  await persistUserDeclaredIdentity({
    property,
    declared: parseDeclaredIdentityInput({ identity_saon: 'Flat 6' }),
    actorUserId: 4,
    deps: depsFrom(store),
  });
  const history = store.events.filter((row) => row.source === 'USER_DECLARED' && row.payload && row.payload.previous);
  assert.ok(history.length >= 2);
  const latest = history[history.length - 1];
  assert.strictEqual(latest.payload.previous.saon, 'Flat 5');
  assert.strictEqual(latest.payload.incoming.saon, 'Flat 6');
  assert.strictEqual(latest.actorUserId, 4);
  assert.strictEqual(latest.payload.silentlyOverwritten, false);
});

test('owner authorization', () => {
  const property = { id: 1, user_id: 4 };
  assert.strictEqual(canAccessPropertyIdentity({ id: 4, role: 'user' }, property), true);
  assert.strictEqual(canAccessPropertyIdentity({ id: 9, role: 'admin' }, property), true);
  assert.strictEqual(canAccessPropertyIdentity({ id: 9, role: 'super_admin' }, property), true);
  assert.strictEqual(canAccessPropertyIdentity({ id: 8, role: 'user' }, property), false);
  assert.strictEqual(canAccessPropertyIdentity(null, property), false);
});

test('unauthorized access is denied without revealing identity', () => {
  const property = { id: 1, user_id: 4 };
  assert.strictEqual(canAccessPropertyIdentity({ id: 99, role: 'user' }, property), false);
});

test('EPB unit gate remains safe without SAON and opens with declared SAON', () => {
  const buildingCert = {
    certificateNumber: '1111-2222-3333-4444-5555',
    certificateType: 'DOMESTIC',
    address: { addressLine1: 'High Street', addressLine3: '12', postcode: 'B1 2UJ' },
  };
  const unresolved = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', propertyType: 'flat' },
    [buildingCert]
  );
  assert.strictEqual(unresolved.status, EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY);
  const declared = evaluateEpbCandidates(
    { postcode: 'B1 2UJ', paon: '12', saon: 'Flat 5', propertyType: 'flat' },
    [{
      ...buildingCert,
      address: { addressLine1: 'Flat 5', addressLine3: '12', postcode: 'B1 2UJ' },
    }]
  );
  assert.strictEqual(declared.status, EPB_ATTACHMENT.UNIQUE_ATTACH);
});

test('future EPB acquisition uses persisted SAON', () => {
  const identity = identityForOfficialAcquisition(
    { id: 12, house_number: '12', zip_code: 'B1 2UJ', property_type: 'flat' },
    { paon: '12', saon: 'Flat 5', postcode: 'B1 2UJ', component_states: { saon: 'USER_DECLARED' } }
  );
  assert.strictEqual(identity.saon, 'Flat 5');
});

test('HMLR matcher unchanged', () => {
  const hmlr = fs.readFileSync(path.join(__dirname, '../services/market/officialSaleTransactionQuery.js'), 'utf8');
  assert.ok(!/levenshtein|fuzzy|similarity/i.test(hmlr));
});

test('historical snapshot immutability not rewritten by identity module', () => {
  const src = fs.readFileSync(path.join(__dirname, '../services/identity/canonicalIdentityService.js'), 'utf8');
  assert.ok(!/UPDATE ai_requests/.test(src));
  assert.ok(!/rewrite.*snapshot/i.test(src));
});

test('toClientIdentitySnapshot strips provider payload', () => {
  const snap = toClientIdentitySnapshot({
    property_id: 1,
    paon: '12',
    saon: 'Flat 5',
    uprn: '123',
    verification_state: 'USER_DECLARED',
    provider_payload: { secret: 'nope' },
    source_address: { address_line1: '12 High Street' },
  });
  assert.ok(!snap.provider_payload);
  assert.strictEqual(snap.userDeclaredIsNotVerified, true);
  assert.strictEqual(snap.uprnIsNotTitleNumber, true);
});

test('source address is preserved separately from canonical components', () => {
  const listing = extractCanonicalAddress({
    house_number: '12',
    address_line1: '12 High Street',
    zip_code: 'b1 2uj',
  });
  assert.strictEqual(listing.sourceAddress.house_number, '12');
  assert.notStrictEqual(listing.sourceAddress, listing.paon);
});

async function run() {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nuser-declared canonical subject identity passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
