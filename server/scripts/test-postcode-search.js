require('dotenv').config();
const { normalisePostcode, extractPostcodeFromAddress } = require('../utils/ukAddress');
const { searchPublicPropertiesForIntelligence, compactPostcode } = require('../services/ai/propertyIntelligenceSearch');
const { lookupPropertyIntelligence } = require('../services/ai/externalPropertyLookupService');

const q = process.argv[2] || 'B192YF';

(async () => {
  console.log('Input:', q);
  console.log('Normalized:', normalisePostcode(q));
  console.log('Extracted:', extractPostcodeFromAddress(q));
  console.log('Compact:', compactPostcode(q));
  console.log('---');

  const rows = await searchPublicPropertiesForIntelligence(q, { limit: 15 });
  console.log('Internal search matches:', rows.length);
  rows.forEach((p) => {
    console.log(`  #${p.id} | ${p.zip_code} | ${p.title || p.address_display} | ${p.matchMethod}`);
  });

  console.log('---');
  const lookup = await lookupPropertyIntelligence(q, null);
  console.log('Lookup success:', lookup.success);
  console.log('Internal:', lookup.internal?.length ?? 0);
  console.log('External available:', lookup.external?.available);
  console.log('External message:', lookup.external?.message);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
