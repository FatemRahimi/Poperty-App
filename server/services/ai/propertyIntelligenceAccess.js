/**
 * Property Intelligence access control — server-side authorization and field sanitization.
 *
 * public_intelligence: approved listings for buyers/investors (market data only)
 * professional_intelligence: owner or platform admin (listing management insights)
 */

const pool = require('../../models/db');

const PRIVATE_PROPERTY_FIELDS = new Set([
  'contact_name',
  'contact_phone',
  'contact_email',
  'property_consultant',
  'user_id',
  'approved_by',
  'actor_user_id',
]);

const PUBLIC_LISTING_SELECT = `
  p.id, p.title, p.city, p.zip_code, p.address_line1, p.address_line2,
  p.house_number, p.street_name, p.state, p.country,
  p.property_type, p.property_category, p.category,
  p.price, p.monthly_rent, p.weekly_rent, p.bedrooms, p.bathrooms,
  p.square_feet, p.status, p.slug, p.epc_rating, p.description,
  p.latitude, p.longitude, p.furnished, p.has_garden, p.has_garage,
  p.parking_spaces, p.service_charge, p.service_charges, p.ground_rent,
  p.council_tax_band, p.council_tax_status, p.broadband_availability, p.tenure, p.year_built
`;

function sanitizePropertyForPublicIntelligence(property) {
  if (!property) return null;
  const out = { ...property };
  PRIVATE_PROPERTY_FIELDS.forEach((field) => {
    delete out[field];
  });
  return out;
}

/**
 * Resolve whether a user may analyse or preview a property.
 */
async function resolvePropertyAccess(propertyId, userId) {
  const id = Number(propertyId);
  if (!Number.isFinite(id) || id <= 0) {
    return {
      allowed: false,
      reason: 'invalid_property_id',
      relationship: 'none',
      accessLevel: 'none',
    };
  }

  const result = await pool.query(
    `SELECT id, user_id, status FROM properties WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) {
    return {
      allowed: false,
      reason: 'not_found',
      relationship: 'none',
      accessLevel: 'none',
    };
  }

  let userRole = 'user';
  if (userId) {
    const userRes = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    userRole = userRes.rows[0]?.role || 'user';
  }

  const isOwner = userId && row.user_id === userId;
  const isAdmin = userRole === 'admin';
  const isApproved = row.status === 'approved';

  if (isOwner || isAdmin) {
    return {
      allowed: true,
      propertyId: id,
      userId,
      role: isAdmin && !isOwner ? 'admin' : 'owner',
      relationship: isOwner ? 'owner' : 'admin',
      accessLevel: 'professional_intelligence',
      listingStatus: row.status,
    };
  }

  if (isApproved) {
    return {
      allowed: true,
      propertyId: id,
      userId,
      role: 'buyer',
      relationship: 'public_viewer',
      accessLevel: 'public_intelligence',
      listingStatus: row.status,
    };
  }

  return {
    allowed: false,
    reason: 'not_accessible',
    relationship: 'none',
    accessLevel: 'none',
    listingStatus: row.status,
  };
}

function buildAccessContext(access) {
  return {
    userId: access.userId,
    role: access.role,
    relationship: access.relationship,
    propertyId: access.propertyId ?? null,
    subjectId: access.subjectId ?? null,
    uprn: access.uprn ?? null,
    accessLevel: access.accessLevel,
    listingStatus: access.listingStatus,
    linkedPropertyId: access.linkedPropertyId ?? null,
    source: access.source,
  };
}

/**
 * Filter report sections that are owner/agent-only before sending to client.
 */
function applyReportAccessPolicy(report, access) {
  if (!report || access?.accessLevel === 'professional_intelligence') {
    return {
      ...report,
      accessContext: buildAccessContext(access),
    };
  }

  const filtered = { ...report };

  if (Array.isArray(filtered.opportunities)) {
    filtered.opportunities = filtered.opportunities.filter((o) => o.category !== 'MARKETING');
  }

  if (Array.isArray(filtered.risks)) {
    filtered.risks = filtered.risks.filter((r) => {
      const action = (r.recommendedAction || '').toLowerCase();
      return !action.includes('upload') && !action.includes('complete missing');
    });
  }

  if (filtered.recommendation?.action?.includes('Insufficient data')) {
    filtered.recommendation = {
      ...filtered.recommendation,
      action: 'Review available evidence and verify missing details with the listing agent.',
      why: 'Some property fields are incomplete in the public listing record.',
    };
  }

  if (filtered.legalTitleDomain) {
    filtered.legalTitleDomain = {
      ...filtered.legalTitleDomain,
      documents: [],
      evidence: [],
      assessment: {
        ...(filtered.legalTitleDomain.assessment || {}),
        documentsPresent: false,
        titleRegisterAvailable: false,
        titlePlanAvailable: false,
      },
    };
  }
  filtered.professionalInsights = null;
  if (filtered.inputSnapshot?.fieldsUsed) {
    filtered.inputSnapshot = {
      ...filtered.inputSnapshot,
      fieldsUsed: filtered.inputSnapshot.fieldsUsed.filter(
        (f) => !PRIVATE_PROPERTY_FIELDS.has(f)
      ),
    };
  }
  filtered.accessContext = buildAccessContext(access);

  return filtered;
}

module.exports = {
  PRIVATE_PROPERTY_FIELDS,
  PUBLIC_LISTING_SELECT,
  sanitizePropertyForPublicIntelligence,
  resolvePropertyAccess,
  buildAccessContext,
  applyReportAccessPolicy,
};
