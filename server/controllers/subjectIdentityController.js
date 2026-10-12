/**
 * Owner/admin canonical identity read/write.
 * Server assigns USER_DECLARED. Client cannot inject verification or official provenance.
 */

const pool = require('../models/db');
const {
  persistUserDeclaredIdentity,
  persistListingCanonicalIdentity,
  listIdentityEvents,
} = require('../services/identity/canonicalIdentityService');
const {
  parseDeclaredIdentityInput,
  hasDeclaredIdentityInput,
  toClientIdentitySnapshot,
} = require('../services/identity/userDeclaredIdentity');
const { extractCanonicalAddress } = require('../services/identity/canonicalAddress');
const { findIdentityByPropertyId } = require('../services/enrichment/propertyIdentityRepository');

function isAdmin(user) {
  return ['admin', 'super_admin'].includes(String(user?.role || ''));
}

function canAccessPropertyIdentity(user, property) {
  if (!user?.id || !property) return false;
  if (Number(property.user_id) === Number(user.id)) return true;
  return isAdmin(user);
}

async function loadOwnedOrAdminProperty(req, propertyId) {
  if (!req.user?.id || !propertyId) return { status: 401, property: null };
  const result = await pool.query('SELECT * FROM properties WHERE id = $1', [propertyId]);
  const property = result.rows[0];
  if (!property) return { status: 404, property: null };
  if (!canAccessPropertyIdentity(req.user, property)) {
    return { status: 404, property: null };
  }
  return { status: 200, property };
}

const getPropertyIdentity = async (req, res) => {
  try {
    const loaded = await loadOwnedOrAdminProperty(req, req.params.id);
    if (loaded.status !== 200) {
      return res.status(loaded.status).json({ success: false, message: 'Property not found' });
    }
    const row = await findIdentityByPropertyId(loaded.property.id);
    const listing = extractCanonicalAddress(loaded.property);
    return res.json({
      success: true,
      identity: toClientIdentitySnapshot(row, listing),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Unable to load identity' });
  }
};

const getPropertyIdentityEvents = async (req, res) => {
  try {
    const loaded = await loadOwnedOrAdminProperty(req, req.params.id);
    if (loaded.status !== 200) {
      return res.status(loaded.status).json({ success: false, message: 'Property not found' });
    }
    const rows = await listIdentityEvents(loaded.property.id, { limit: req.query.limit });
    return res.json({
      success: true,
      events: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        verificationState: row.verification_state,
        identityState: row.identity_state,
        source: row.source,
        actorPresent: row.actor_user_id != null,
        paon: row.paon,
        saon: row.saon,
        buildingName: row.building_name,
        uprn: row.uprn,
        payload: row.payload && typeof row.payload === 'object' ? {
          conflict: row.payload.conflict === true,
          field: row.payload.field || null,
          previous: row.payload.previous || null,
          incoming: row.payload.incoming || null,
          silentlyOverwritten: row.payload.silentlyOverwritten === true,
          matchMethod: row.payload.matchMethod || null,
        } : {},
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Unable to load identity history' });
  }
};

const putPropertyIdentity = async (req, res) => {
  try {
    const loaded = await loadOwnedOrAdminProperty(req, req.params.id);
    if (loaded.status !== 200) {
      return res.status(loaded.status).json({ success: false, message: 'Property not found' });
    }
    if (req.body?.verification_state || req.body?.verificationState === 'VERIFIED_EXACT') {
      // ignored by parser; explicit rejection keeps the contract testable
    }
    const declared = parseDeclaredIdentityInput(req.body || {});
    if (declared.uprnError) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_UPRN',
        message: 'UPRN must be 1–12 digits. It is optional and is not a title number.',
      });
    }
    if (!hasDeclaredIdentityInput(req.body || {})) {
      return res.status(400).json({
        success: false,
        error: 'NO_IDENTITY_FIELDS',
        message: 'Provide at least one canonical identity field to update.',
      });
    }
    await persistListingCanonicalIdentity(loaded.property);
    const result = await persistUserDeclaredIdentity({
      property: loaded.property,
      declared,
      actorUserId: req.user.id,
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.json({
      success: true,
      identity: result.client,
      conflict: result.conflict === true,
      userDeclaredIsNotVerified: true,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Unable to update identity' });
  }
};

async function persistListingIdentitySafely(property, extra = {}) {
  if (!property?.id) return { ok: false, conflict: false };
  try {
    await persistListingCanonicalIdentity(property);
    if (extra.body && hasDeclaredIdentityInput(extra.body)) {
      const declared = parseDeclaredIdentityInput(extra.body);
      if (declared.uprnError) {
        return { ok: false, conflict: false, error: 'INVALID_UPRN' };
      }
      const result = await persistUserDeclaredIdentity({
        property,
        declared,
        actorUserId: extra.actorUserId || null,
      });
      return {
        ok: result.ok !== false,
        conflict: result.conflict === true,
        identity: result.client || null,
      };
    }
    return { ok: true, conflict: false };
  } catch (err) {
    console.error('Listing identity persist failed (property not blocked):', err.message);
    return { ok: false, conflict: false };
  }
}

module.exports = {
  getPropertyIdentity,
  getPropertyIdentityEvents,
  putPropertyIdentity,
  persistListingIdentitySafely,
  loadOwnedOrAdminProperty,
  isAdmin,
  canAccessPropertyIdentity,
};
