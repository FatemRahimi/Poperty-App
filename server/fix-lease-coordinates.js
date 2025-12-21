const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

// Birmingham postcode area coordinates
const birminghamPostcodes = {
  'B1': { lat: 52.4814, lng: -1.8998 },
  'B2': { lat: 52.4797, lng: -1.9026 },
  'B3': { lat: 52.4886, lng: -1.9118 },
  'B4': { lat: 52.4776, lng: -1.8894 },
  'B5': { lat: 52.4689, lng: -1.8876 },
  'B6': { lat: 52.4920, lng: -1.8750 },  // Aston
  'B7': { lat: 52.4950, lng: -1.8850 },  // Nechells
  'B8': { lat: 52.4800, lng: -1.8650 },
  'B11': { lat: 52.4550, lng: -1.8650 }, // Sparkhill
  'B15': { lat: 52.4570, lng: -1.9390 }, // Edgbaston
  'B19': { lat: 52.5014, lng: -1.9246 },
  'B23': { lat: 52.5280, lng: -1.8450 }, // Erdington
  'B33': { lat: 52.4726, lng: -1.8089 },
  'B74': { lat: 52.5689, lng: -1.8206 },
  'B83': { lat: 52.5100, lng: -1.8300 }
};

async function fixLeaseCoordinates() {
  try {
    console.log('\n========================================');
    console.log('🔧 FIXING LEASE PROPERTY COORDINATES');
    console.log('========================================\n');

    const result = await pool.query(`
      SELECT id, title, zip_code as postcode, latitude, longitude, category
      FROM properties
      WHERE user_id = 30 AND category = 'lease'
      ORDER BY id
    `);

    console.log(`📦 Found ${result.rows.length} LEASE properties to fix\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const property of result.rows) {
      if (!property.postcode) {
        console.log(`⏭️  Skipping "${property.title}" - no postcode`);
        skippedCount++;
        continue;
      }

      // Extract postcode area
      const postcodeArea = property.postcode.toUpperCase().match(/^([A-Z]+\d+)/);
      
      if (!postcodeArea) {
        console.log(`⏭️  Skipping "${property.title}" - invalid postcode: ${property.postcode}`);
        skippedCount++;
        continue;
      }

      const area = postcodeArea[1];
      const coords = birminghamPostcodes[area];

      if (!coords) {
        console.log(`⏭️  Skipping "${property.title}" - no coordinates for area: ${area}`);
        skippedCount++;
        continue;
      }

      // Add random offset
      const randomOffset = () => (Math.random() - 0.5) * 0.01;
      const newLat = coords.lat + randomOffset();
      const newLng = coords.lng + randomOffset();

      console.log(`✅ Fixing "${property.title}"`);
      console.log(`   Postcode: ${property.postcode} (area: ${area})`);
      console.log(`   Old: ${property.latitude}, ${property.longitude}`);
      console.log(`   New: ${newLat.toFixed(8)}, ${newLng.toFixed(8)}`);

      await pool.query(`
        UPDATE properties
        SET latitude = $1, longitude = $2
        WHERE id = $3
      `, [newLat, newLng, property.id]);

      fixedCount++;
      console.log('');
    }

    console.log('\n========================================');
    console.log('📊 SUMMARY');
    console.log('========================================');
    console.log(`✅ Fixed: ${fixedCount} properties`);
    console.log(`⏭️  Skipped: ${skippedCount} properties`);
    console.log(`📦 Total: ${result.rows.length} properties`);
    console.log('\n✅ Lease coordinates updated successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

fixLeaseCoordinates();

