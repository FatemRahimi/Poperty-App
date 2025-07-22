// Script to geocode all properties missing latitude/longitude
const { Pool } = require('pg');
const { geocodeLocationEnhanced } = require('../utils/smartSearch');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
});

async function main() {
  const client = await pool.connect();
  try {
    // 1. Find all properties missing lat/lng
    const { rows } = await client.query(
      `SELECT id, address_line1, city, zip_code, country FROM properties WHERE latitude IS NULL OR longitude IS NULL`
    );
    console.log(`Found ${rows.length} properties missing coordinates.`);
    for (const prop of rows) {
      const locationString = `${prop.address_line1 || ''} ${prop.city || ''} ${prop.zip_code || ''} ${prop.country || ''}`;
      try {
        const geo = await geocodeLocationEnhanced(locationString);
        if (geo && geo.lat && geo.lng) {
          await client.query(
            'UPDATE properties SET latitude = $1, longitude = $2 WHERE id = $3',
            [geo.lat, geo.lng, prop.id]
          );
          console.log(`✅ Updated property ${prop.id} (${locationString}) → [${geo.lat}, ${geo.lng}]`);
        } else {
          console.warn(`⚠️ Could not geocode property ${prop.id} (${locationString})`);
        }
      } catch (e) {
        console.error(`❌ Error geocoding property ${prop.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('Script error:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

main(); 