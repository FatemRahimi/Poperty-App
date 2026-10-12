/**
 * Focused tests — official EPB construction-age wiring (V1.2).
 */
const assert = require('assert');
const {
  parseDomesticFacts,
  parseCertificate,
} = require('../services/providers/mhclgEpb/mhclgEpbParser');
const {
  AUTHORITATIVE_SOURCE,
  decodeRdSapConstructionAgeBandCode,
  mapOfficialPeriodLabelToPropertyData,
  mapRdSapCodeToPropertyData,
} = require('../services/providers/mhclgEpb/rdSapConstructionAgeBand');
const {
  buildOfficialConstructionAgeEvidence,
  PROVENANCE,
  ASSESSMENT,
} = require('../services/providers/mhclgEpb/officialConstructionAgeEvidence');
const {
  mapConstructionDate,
  mapConstructionDateFromAgeBand,
  describeConstructionMapping,
  buildValuationSaleRequest,
} = require('../services/providers/propertyData/propertyTypeMapping');
const { buildSubjectNativeValuationProperty } = require('../services/ai/subjectNativeSaleValuation');
const { CERTIFICATE_TYPE } = require('../architecture/epbEvidenceContract');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('officialConstructionAgeWiring');

test('1. nested SAP age code is retained', () => {
  const facts = parseDomesticFacts({
    schema_type: 'RdSAP-Schema-21.0.1',
    sap_building_parts: [
      { identifier: 'Main Dwelling', construction_age_band: 'C' },
      { identifier: 'Extension 1', construction_age_band: 'G' },
    ],
    total_floor_area: 80,
  });
  assert.strictEqual(facts.constructionAgeBandRawCode, 'C');
  assert.strictEqual(facts.sapBuildingParts.length, 2);
  assert.strictEqual(facts.sapBuildingParts[0].constructionAgeBandCode, 'C');
  assert.strictEqual(facts.sapBuildingParts[1].constructionAgeBandCode, 'G');
  assert.ok(!facts.constructionAgeBand); // raw letter not written as normalized label
});

test('2. provenance remains official EPB', () => {
  const evidence = buildOfficialConstructionAgeEvidence({
    facts: {
      schemaType: 'RdSAP-Schema-21.0.1',
      sapBuildingParts: [{ identifier: 'Main Dwelling', constructionAgeBandCode: 'E' }],
    },
    certificateNumber: '0900-2809-7623-9195-8251',
    subjectId: 42,
  });
  assert.strictEqual(evidence.provenance, PROVENANCE.OFFICIAL_EPB);
  assert.strictEqual(evidence.source, 'MHCLG_EPBD');
  assert.strictEqual(evidence.subjectId, 42);
});

test('3. authoritative code decoding', () => {
  assert.ok(AUTHORITATIVE_SOURCE.repository.includes('epb-view-models'));
  const c = decodeRdSapConstructionAgeBandCode('C', 'RdSAP-Schema-21.0.1');
  assert.strictEqual(c.ok, true);
  assert.strictEqual(c.periodLabel, 'England and Wales: 1930-1949');
  const a = decodeRdSapConstructionAgeBandCode('A', 'RdSAP-Schema-21.0.1');
  assert.strictEqual(a.periodLabel, 'England and Wales: before 1900');
  const b = decodeRdSapConstructionAgeBandCode('B', 'RdSAP-Schema-21.0.1');
  assert.strictEqual(b.periodLabel, 'England and Wales: 1900-1929');
});

test('4. schema/version applicability for K/L', () => {
  const kModern = decodeRdSapConstructionAgeBandCode('K', 'RdSAP-Schema-21.0.1');
  assert.strictEqual(kModern.periodLabel, 'England and Wales: 2007-2011');
  const kPre17 = decodeRdSapConstructionAgeBandCode('K', 'SAP-Schema-15.0');
  assert.strictEqual(kPre17.periodLabel, 'England and Wales: 2007 onwards');
  const lPost20 = decodeRdSapConstructionAgeBandCode('L', 'RdSAP-Schema-21.0.1');
  assert.strictEqual(lPost20.periodLabel, 'England and Wales: 2012-2021');
  const l20 = decodeRdSapConstructionAgeBandCode('L', 'RdSAP-Schema-20.0.0');
  assert.strictEqual(l20.periodLabel, 'England and Wales: 2012 onwards');
});

test('5. multiple building parts preserved', () => {
  const evidence = buildOfficialConstructionAgeEvidence({
    facts: {
      schemaType: 'RdSAP-Schema-21.0.1',
      sapBuildingParts: [
        { identifier: 'Main Dwelling', constructionAgeBandCode: 'A' },
        { identifier: 'Extension 2', constructionAgeBandCode: 'G' },
        { identifier: 'Extension 3', constructionAgeBandCode: 'J' },
      ],
    },
  });
  assert.strictEqual(evidence.buildingParts.length, 3);
  assert.deepStrictEqual(
    evidence.buildingParts.map((p) => p.rawCode),
    ['A', 'G', 'J']
  );
});

test('6. ambiguous multiple periods do not fabricate canonical year', () => {
  const evidence = buildOfficialConstructionAgeEvidence({
    facts: {
      schemaType: 'RdSAP-Schema-21.0.1',
      sapBuildingParts: [
        { identifier: 'Main Dwelling', constructionAgeBandCode: 'A' },
        { identifier: 'Extension 3', constructionAgeBandCode: 'J' },
      ],
    },
  });
  assert.strictEqual(evidence.exactYear, null);
  assert.strictEqual(evidence.yearBuilt, null);
  assert.strictEqual(evidence.rawOfficialAgeCode, 'A'); // Main Dwelling only
  assert.ok(evidence.ambiguity);
  assert.strictEqual(evidence.ambiguity.status, 'extensions_differ_from_main_dwelling');
});

test('7. safe period → PD enum', () => {
  assert.strictEqual(mapRdSapCodeToPropertyData('A').value, 'pre_1914');
  assert.strictEqual(mapRdSapCodeToPropertyData('C').value, '1914_2000');
  assert.strictEqual(mapRdSapCodeToPropertyData('E').value, '1914_2000');
  assert.strictEqual(mapRdSapCodeToPropertyData('J').value, '2000_onwards');
  assert.strictEqual(
    mapOfficialPeriodLabelToPropertyData('England and Wales: 1930-1949').value,
    '1914_2000'
  );
});

test('8. boundary-crossing period → not mappable', () => {
  const b = mapRdSapCodeToPropertyData('B');
  assert.strictEqual(b.mappable, false);
  assert.strictEqual(b.reason, 'period_crosses_propertydata_enum_boundary');
  const i = mapRdSapCodeToPropertyData('I');
  assert.strictEqual(i.mappable, false);
  assert.strictEqual(mapConstructionDateFromAgeBand('England and Wales: 1900-1929'), null);
  assert.strictEqual(mapConstructionDateFromAgeBand('1996-2002'), null);
});

test('9. no midpoint mapping', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../services/providers/propertyData/propertyTypeMapping.js'),
    'utf8'
  );
  assert.ok(!/mid\s*=/.test(src));
  assert.ok(!/Math\.min\(\.\.\.years\)/.test(src));
  assert.strictEqual(mapConstructionDateFromAgeBand('1996-2002'), null);
});

test('10. exact legitimate year path still works', () => {
  assert.strictEqual(mapConstructionDate(1950), '1914_2000');
  assert.strictEqual(mapConstructionDate(1900), 'pre_1914');
  assert.strictEqual(mapConstructionDate(2010), '2000_onwards');
  const described = describeConstructionMapping({ year_built: 1990 });
  assert.strictEqual(described.available, true);
  assert.strictEqual(described.value, '1914_2000');
});

test('11. USER_DECLARED remains USER_DECLARED', () => {
  const described = describeConstructionMapping({
    year_built: 1985,
    yearBuiltProvenance: 'USER_DECLARED',
    constructionAgeBand: 'England and Wales: before 1900',
  });
  assert.strictEqual(described.value, '1914_2000');
  assert.strictEqual(described.provenance.source, 'USER_DECLARED');
  assert.notStrictEqual(described.provenance.source, 'MHCLG_EPBD');
  assert.notStrictEqual(described.provenance.source, 'OFFICIAL_EPB');
});

test('12. missing age remains not eligible', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 1,
    postcode: 'SW1A 1AA',
    propertyType: 'terraced',
    squareFeet: 900,
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, false);
  assert.strictEqual(req.readiness.reasonCode, 'MISSING_CONSTRUCTION_DATE');
});

test('13. malformed age code remains not eligible', () => {
  assert.strictEqual(mapConstructionDateFromAgeBand('ZZ'), null);
  assert.strictEqual(mapConstructionDateFromAgeBand('not recorded'), null);
  const req = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
    construction_age_band: 'QQ',
  });
  assert.strictEqual(req.canRequestAvm, false);
});

test('14. subject binding cannot cross', () => {
  const evidence = buildOfficialConstructionAgeEvidence({
    facts: {
      schemaType: 'RdSAP-Schema-21.0.1',
      sapBuildingParts: [{ identifier: 'Main Dwelling', constructionAgeBandCode: 'C' }],
    },
    subjectId: 7,
    uprn: '100080130560',
  });
  assert.strictEqual(evidence.subjectId, 7);
  assert.strictEqual(evidence.uprn, '100080130560');
  const p = buildSubjectNativeValuationProperty({ subjectId: 7, postcode: 'LU3 1SW', propertyType: 'terraced', squareFeet: 900 });
  assert.strictEqual(p.id, null);
  assert.strictEqual(p.subjectId, 7);
});

test('15. historical sold price cannot enter request', () => {
  const p = buildSubjectNativeValuationProperty({
    subjectId: 1,
    postcode: 'LE5 4LW',
    propertyType: 'terraced',
    squareFeet: 850,
    constructionAgeBand: 'England and Wales: 1967-1975',
    bedrooms: 3,
    bathrooms: 1,
    outdoor: 'garden',
    parkingSpaces: 1,
    parkingConfirmed: true,
    finishQuality: 'average',
  });
  const req = buildValuationSaleRequest(p);
  assert.strictEqual(req.canRequestAvm, true);
  assert.ok(!JSON.stringify(req.params).includes('198000'));
  assert.ok(!Object.prototype.hasOwnProperty.call(req.params, 'price'));
  assert.ok(!Object.prototype.hasOwnProperty.call(req.params, 'asking_price'));
});

test('16. listing valuation path remains compatible', () => {
  const listing = {
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
    year_built: 1990,
    category: 'sale',
    id: 123,
    bedrooms: 3,
    bathrooms: 1,
    has_garden: true,
    parking_spaces: 1,
    finish_quality: 'average',
  };
  const req = buildValuationSaleRequest(listing);
  assert.strictEqual(req.canRequestAvm, true);
  assert.strictEqual(req.params.construction_date, '1914_2000');
});

test('17. rent path unchanged (sale-request builder still requires construction for sale AVM only)', () => {
  const { buildRentsQueryParams, isResidentialRentsEligible } = require('../services/providers/propertyData/propertyTypeMapping');
  const rentParams = buildRentsQueryParams('M1 1AA', { bedrooms: 2, property_type: 'flat' });
  assert.strictEqual(rentParams.postcode, 'M11AA');
  assert.ok(!Object.prototype.hasOwnProperty.call(rentParams, 'construction_date'));
  assert.strictEqual(isResidentialRentsEligible({ category: 'rent', property_type: 'flat' }), true);
});

test('18. provider missing-input classification remains correct', () => {
  const missing = buildValuationSaleRequest({
    zip_code: 'M1 1AA',
    square_feet: 900,
    property_type: 'Terraced',
  });
  assert.strictEqual(missing.readiness.state, 'PROVIDER_NOT_CALLED_MISSING_INPUT');
  assert.strictEqual(missing.readiness.reasonCode, 'MISSING_CONSTRUCTION_DATE');
});

test('parser certificate path retains nested SAP age', () => {
  const parsed = parseCertificate({
    data: {
      certificate_number: '2130-9517-0060-6000-3891',
      schema_type: 'RdSAP-Schema-21.0.1',
      total_floor_area: 90,
      current_energy_rating: 'D',
      sap_building_parts: [
        { identifier: 'Main Dwelling', construction_age_band: 'C' },
        { identifier: 'Extension 1', construction_age_band: 'C' },
      ],
    },
  }, CERTIFICATE_TYPE.DOMESTIC);
  assert.strictEqual(parsed.facts.constructionAgeBandRawCode, 'C');
  assert.strictEqual(parsed.facts.sapBuildingParts[0].constructionAgeBandCode, 'C');
  const evidence = buildOfficialConstructionAgeEvidence({
    facts: parsed.facts,
    certificateNumber: parsed.certificateNumber,
  });
  assert.strictEqual(evidence.assessment, ASSESSMENT.ASSESSED);
  assert.strictEqual(evidence.propertyDataConstructionDate, '1914_2000');
});

console.log('officialConstructionAgeWiring: all passed');
