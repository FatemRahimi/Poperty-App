const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function checkLeaseProperties() {
  try {
    console.log('\n========================================');
    console.log('🔍 CHECKING LEASE PROPERTIES');
    console.log('========================================\n');

    const result = await pool.query(`
      SELECT 
        id, 
        title, 
        category,
        zip_code as postcode, 
        latitude, 
        longitude
      FROM properties 
      WHERE user_id = 30 AND category = 'lease'
      ORDER BY id
    `);

    console.log(`📦 Found ${result.rows.length} LEASE properties\n`);

    if (result.rows.length === 0) {
      console.log('✅ No lease properties - nothing to fix!\n');
      return;
    }

    // Check if coordinates are identical (the problem)
    const b46Center = { lat: 52.4862, lng: -1.8904 };
    let identicalCount = 0;
    let uniqueCoords = new Set();

    result.rows.forEach(p => {
      if (p.latitude && p.longitude) {
        const coordKey = `${p.latitude},${p.longitude}`;
        uniqueCoords.add(coordKey);
        
        if (Math.abs(p.latitude - b46Center.lat) < 0.0001 && 
            Math.abs(p.longitude - b46Center.lng) < 0.0001) {
          identicalCount++;
        }
        
        console.log(`${p.title} (${p.postcode})`);
        console.log(`  Coords: ${p.latitude}, ${p.longitude}`);
      }
    });

    console.log(`\n========================================`);
    console.log('📊 ANALYSIS');
    console.log('========================================');
    console.log(`Total properties: ${result.rows.length}`);
    console.log(`Unique coordinates: ${uniqueCoords.size}`);
    console.log(`With identical B46 coords: ${identicalCount}`);

    if (identicalCount > 5) {
      console.log(`\n⚠️  PROBLEM FOUND!`);
      console.log(`${identicalCount} properties have identical coordinates`);
      console.log(`Lease properties need to be fixed too!`);
    } else if (uniqueCoords.size === result.rows.length) {
      console.log(`\n✅ ALL GOOD!`);
      console.log(`All properties have unique coordinates`);
    } else {
      console.log(`\n⚠️  SOME DUPLICATES`);
      console.log(`Some properties share coordinates`);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkLeaseProperties();

