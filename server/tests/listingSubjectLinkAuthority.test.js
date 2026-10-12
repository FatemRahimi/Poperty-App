/**
 * External UPRN subject ↔ marketplace listing authority.
 * postcode_address is discovery only. Overlay requires matching real UPRN.
 * Run: node server/tests/listingSubjectLinkAuthority.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  AUTHORITATIVE_LISTING_LINK_METHODS,
  isAuthoritativeListingLinkMethod,
  canOverlayMarketplaceListingOnExternalSubject,
  overlayListingOntoExternalSubjectProperty,
  authorizeMarketplaceListingLink,
  selectAuthoritativeLinkForSubject,
} = require('../services/ai/listingUprnLinkService');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

const UNIT_SUBJECT = {
  id: 7,
  uprn: '10090319012',
  normalized_address: 'FIRST FLOOR, 10, COLMORE ROW, BIRMINGHAM, B3 2QD',
  postcode: 'B3 2QD',
  property_id: 147,
};

const PARENT_LISTING = {
  id: 147,
  title: 'Property for Sale',
  price: 2000000,
  bedrooms: 3,
  monthly_rent: 2500,
  zip_code: 'B3 2QD',
  house_number: '10',
  street_name: 'Colmore Row',
};

const SUBJECT_PROPERTY = {
  id: null,
  subjectId: 7,
  uprn: '10090319012',
  price: 410000,
  bedrooms: null,
  monthly_rent: null,
  source: 'external_intelligence_subject',
};

test('A. same postcode alone cannot link external subject to listing', () => {
  const match = { matchMethod: 'postcode_address', confidence: 'medium', listing: PARENT_LISTING };
  const authorized = authorizeMarketplaceListingLink(match);
  assert.strictEqual(authorized.linked, false);
  assert.strictEqual(authorized.listing, null);
  assert.strictEqual(authorized.matchMethod, 'postcode_address');
  assert.strictEqual(authorized.discoveryListing.id, PARENT_LISTING.id);
  assert.strictEqual(authorized.discoveryListing.price, PARENT_LISTING.price);
  assert.strictEqual(
    canOverlayMarketplaceListingOnExternalSubject({
      matchMethod: 'postcode_address',
      subjectUprn: UNIT_SUBJECT.uprn,
      listingUprn: null,
    }),
    false
  );
});

test('B. postcode + loose street match cannot establish authoritative link', () => {
  const match = {
    matchMethod: 'postcode_address',
    listing: { ...PARENT_LISTING, street_name: 'Colmore Row' },
  };
  const authorized = selectAuthoritativeLinkForSubject(UNIT_SUBJECT, match);
  assert.strictEqual(authorized.linked, false);
  assert.ok(!isAuthoritativeListingLinkMethod('postcode_address'));
  assert.deepStrictEqual([...AUTHORITATIVE_LISTING_LINK_METHODS].sort(), ['subject_link', 'uprn_identity']);
});

test('C. PAON match without unit identity cannot overlay parent listing onto flat/unit', () => {
  const overlay = canOverlayMarketplaceListingOnExternalSubject({
    matchMethod: 'postcode_address',
    subjectUprn: UNIT_SUBJECT.uprn,
    listingUprn: null,
  });
  assert.strictEqual(overlay, false);
  const applied = overlayListingOntoExternalSubjectProperty(SUBJECT_PROPERTY, PARENT_LISTING, {
    overlay,
  });
  assert.strictEqual(applied.price, 410000);
  assert.strictEqual(applied.bedrooms, null);
  assert.strictEqual(applied.monthly_rent, null);
  assert.notStrictEqual(applied.source, 'linked_marketplace_listing');
});

test('D. external UPRN subject does not receive listing facts from postcode_address', () => {
  const authorized = authorizeMarketplaceListingLink({
    matchMethod: 'postcode_address',
    listing: PARENT_LISTING,
  });
  const applied = overlayListingOntoExternalSubjectProperty(SUBJECT_PROPERTY, PARENT_LISTING, {
    overlay: authorized.linked,
  });
  assert.strictEqual(applied.price, SUBJECT_PROPERTY.price);
  assert.strictEqual(applied.bedrooms, SUBJECT_PROPERTY.bedrooms);
  assert.strictEqual(applied.monthly_rent, SUBJECT_PROPERTY.monthly_rent);
  assert.notStrictEqual(applied.price, PARENT_LISTING.price);
  assert.notStrictEqual(applied.bedrooms, PARENT_LISTING.bedrooms);
});

test('E. matching legitimate UPRN linkage still works', () => {
  const listingUprn = '100110469802';
  const match = {
    matchMethod: 'uprn_identity',
    confidence: 'high',
    listingUprn,
    listing: { id: 153, title: '88 Colmore Row', price: 300000, bedrooms: 2 },
  };
  const authorized = selectAuthoritativeLinkForSubject({ uprn: listingUprn }, match);
  assert.strictEqual(authorized.linked, true);
  assert.strictEqual(authorized.listing.id, 153);
  assert.strictEqual(authorized.listingUprn, listingUprn);
  assert.strictEqual(
    canOverlayMarketplaceListingOnExternalSubject({
      matchMethod: 'uprn_identity',
      subjectUprn: listingUprn,
      listingUprn,
    }),
    true
  );
  const subjectProperty = {
    subjectId: 6,
    uprn: listingUprn,
    price: 110000,
    bedrooms: null,
    monthly_rent: null,
  };
  const applied = overlayListingOntoExternalSubjectProperty(subjectProperty, match.listing, {
    overlay: true,
    subjectId: 6,
    subjectUprn: listingUprn,
  });
  assert.strictEqual(applied.price, 300000);
  assert.strictEqual(applied.bedrooms, 2);
  assert.strictEqual(applied.uprn, listingUprn);
  assert.strictEqual(applied.source, 'linked_marketplace_listing');
});

test('F. platform/listing subject overlay helper is not used without subject UPRN link', () => {
  assert.strictEqual(
    canOverlayMarketplaceListingOnExternalSubject({
      matchMethod: 'uprn_identity',
      subjectUprn: null,
      listingUprn: '100110469802',
    }),
    false
  );
  const listingProperty = {
    id: 153,
    price: 300000,
    bedrooms: 2,
    monthly_rent: null,
    source: 'marketplace',
  };
  const applied = overlayListingOntoExternalSubjectProperty(listingProperty, PARENT_LISTING, {
    overlay: false,
  });
  assert.strictEqual(applied.id, 153);
  assert.strictEqual(applied.price, 300000);
});

test('G. unsafe pre-existing property_id cannot overlay unless linkage is identity-safe', () => {
  const stale = selectAuthoritativeLinkForSubject(UNIT_SUBJECT, {
    matchMethod: 'postcode_address',
    listing: PARENT_LISTING,
  });
  assert.strictEqual(stale.linked, false);
  const historicalFk = selectAuthoritativeLinkForSubject(UNIT_SUBJECT, {
    matchMethod: 'subject_link',
    listing: PARENT_LISTING,
  });
  assert.strictEqual(historicalFk.linked, false, 'subject_link without listing UPRN is not identity-safe');
  const mismatchedListingUprn = selectAuthoritativeLinkForSubject(UNIT_SUBJECT, {
    matchMethod: 'subject_link',
    listingUprn: '999',
    listing: PARENT_LISTING,
  });
  assert.strictEqual(mismatchedListingUprn.linked, false);
  assert.strictEqual(
    canOverlayMarketplaceListingOnExternalSubject({
      matchMethod: 'postcode_address',
      subjectUprn: UNIT_SUBJECT.uprn,
      listingUprn: '999',
    }),
    false
  );
  assert.strictEqual(
    canOverlayMarketplaceListingOnExternalSubject({
      matchMethod: 'uprn_identity',
      subjectUprn: UNIT_SUBJECT.uprn,
      listingUprn: '999',
    }),
    false
  );
  assert.strictEqual(
    canOverlayMarketplaceListingOnExternalSubject({
      matchMethod: 'subject_link',
      subjectUprn: UNIT_SUBJECT.uprn,
      listingUprn: UNIT_SUBJECT.uprn,
    }),
    true
  );
});

test('H. same-postcode picker/context remains labelled non-authoritative', () => {
  const display = fs.readFileSync(
    path.join(__dirname, '../../client/src/Utils/exactPropertyPickerDisplay.js'),
    'utf8'
  );
  assert.ok(display.includes("matchMethod === 'postcode_address'"));
  assert.ok(display.includes('Same postcode listing · not an exact address match'));
  const linker = fs.readFileSync(
    path.join(__dirname, '../services/ai/listingUprnLinkService.js'),
    'utf8'
  );
  assert.ok(linker.includes("matchMethod === 'postcode_address'"));
  assert.ok(/linked:\s*false/.test(linker));
  assert.ok(linker.includes('selectAuthoritativeLinkForSubject({ uprn }, match)'));
  const persist = fs.readFileSync(
    path.join(__dirname, '../services/ai/externalPropertyLookupService.js'),
    'utf8'
  );
  assert.ok(persist.includes('linkResult.linked ? linkResult.listing.id : null'));
  assert.ok(!persist.includes('linkResult.listing?.id || subject?.property_id'));
  const engine = fs.readFileSync(
    path.join(__dirname, '../services/ai/propertyIntelligenceEngine.js'),
    'utf8'
  );
  assert.ok(engine.includes('resolveAuthoritativeLinkedListing'));
  assert.ok(engine.includes('canOverlayMarketplaceListingOnExternalSubject'));
  assert.ok(engine.includes('listingUprn: authoritative.listingUprn'));
  assert.ok(!engine.includes('listingUprn: preview.property?.uprn'));
  assert.ok(!engine.includes('preview.accessContext?.linkedPropertyId || preview.linkedListing?.id'));
});

console.log('listingSubjectLinkAuthority.test.js — all passed');
