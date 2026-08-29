/**
 * Property Intelligence access control tests
 * Run: node server/tests/propertyIntelligenceAccess.test.js
 */

const assert = require('assert');
const {
  sanitizePropertyForPublicIntelligence,
  applyReportAccessPolicy,
  buildAccessContext,
} = require('../services/ai/propertyIntelligenceAccess');

function testSanitizeRemovesPrivateFields() {
  const raw = {
    id: 1,
    title: 'Test House',
    price: 500000,
    contact_name: 'Secret Seller',
    contact_phone: '07000000000',
    contact_email: 'secret@example.com',
    user_id: 99,
    actor_user_id: 42,
    property_consultant: 'Internal Agent',
  };
  const pub = sanitizePropertyForPublicIntelligence(raw);
  assert.strictEqual(pub.title, 'Test House');
  assert.strictEqual(pub.contact_name, undefined);
  assert.strictEqual(pub.contact_phone, undefined);
  assert.strictEqual(pub.contact_email, undefined);
  assert.strictEqual(pub.user_id, undefined);
  assert.strictEqual(pub.actor_user_id, undefined);
  assert.strictEqual(pub.property_consultant, undefined);
  console.log('✓ sanitize removes private owner fields');
}

function testPublicReportFiltersMarketing() {
  const access = {
    allowed: true,
    userId: 2,
    role: 'buyer',
    relationship: 'public_viewer',
    accessLevel: 'public_intelligence',
    propertyId: 1,
  };
  const report = {
    success: true,
    opportunities: [
      { id: '1', category: 'RENT', title: 'Rent opportunity' },
      { id: '2', category: 'MARKETING', title: 'Fix description' },
    ],
    risks: [
      { id: 'a', recommendedAction: 'Verify EPC with the seller' },
      { id: 'b', recommendedAction: 'Upload EPC certificate' },
    ],
    professionalInsights: { marketingGaps: [{ field: 'description' }] },
  };
  const filtered = applyReportAccessPolicy(report, access);
  assert.strictEqual(filtered.opportunities.length, 1);
  assert.strictEqual(filtered.opportunities[0].category, 'RENT');
  assert.strictEqual(filtered.risks.length, 1);
  assert.strictEqual(filtered.professionalInsights, null);
  assert.strictEqual(filtered.accessContext.accessLevel, 'public_intelligence');
  console.log('✓ public report hides marketing and owner-only sections');
}

function testProfessionalReportKeepsAll() {
  const access = {
    allowed: true,
    userId: 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: 1,
  };
  const report = {
    opportunities: [{ category: 'MARKETING' }],
    professionalInsights: { marketingGaps: [] },
  };
  const out = applyReportAccessPolicy(report, access);
  assert.strictEqual(out.opportunities.length, 1);
  assert.ok(out.professionalInsights);
  console.log('✓ professional report retains owner insights');
}

function testBuildAccessContext() {
  const ctx = buildAccessContext({
    userId: 5,
    role: 'buyer',
    relationship: 'public_viewer',
    accessLevel: 'public_intelligence',
    propertyId: 10,
    listingStatus: 'approved',
  });
  assert.strictEqual(ctx.propertyId, 10);
  assert.strictEqual(ctx.relationship, 'public_viewer');
  console.log('✓ buildAccessContext');
}

testSanitizeRemovesPrivateFields();
testPublicReportFiltersMarketing();
testProfessionalReportKeepsAll();
testBuildAccessContext();

console.log('\nAll propertyIntelligenceAccess tests passed.');
