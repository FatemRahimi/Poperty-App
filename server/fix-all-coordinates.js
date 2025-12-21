const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

// Comprehensive UK postcode coordinates
const postcodeCoordinates = {
  // Birmingham
  'B1': { lat: 52.4814, lng: -1.8998 },
  'B2': { lat: 52.4797, lng: -1.9026 },
  'B3': { lat: 52.4886, lng: -1.9118 },
  'B4': { lat: 52.4776, lng: -1.8894 },
  'B5': { lat: 52.4689, lng: -1.8876 },
  'B6': { lat: 52.4920, lng: -1.8750 },
  'B7': { lat: 52.4950, lng: -1.8850 },
  'B8': { lat: 52.4800, lng: -1.8650 },
  'B11': { lat: 52.4550, lng: -1.8650 },
  'B15': { lat: 52.4570, lng: -1.9390 },
  'B19': { lat: 52.5014, lng: -1.9246 },
  'B23': { lat: 52.5280, lng: -1.8450 },
  'B33': { lat: 52.4726, lng: -1.8089 },
  'B44': { lat: 52.5478, lng: -1.8784 },
  'B46': { lat: 52.4862, lng: -1.8904 },
  'B69': { lat: 52.5015, lng: -2.0131 },
  'B74': { lat: 52.5689, lng: -1.8206 },
  'B76': { lat: 52.5580, lng: -1.8100 },
  'B83': { lat: 52.5100, lng: -1.8300 },
  // London
  'E15': { lat: 51.5387, lng: -0.0044 },
  'IG11': { lat: 51.5312, lng: 0.0751 },
  'N3': { lat: 51.5974, lng: -0.1773 },
  'N12': { lat: 51.6166, lng: -0.1883 },
  'NW1': { lat: 51.5338, lng: -0.1434 },
  'NW4': { lat: 51.5838, lng: -0.2286 },
  'NW11': { lat: 51.5768, lng: -0.1943 },
  'SW1': { lat: 51.5034, lng: -0.1276 },
  'TW3': { lat: 51.4679, lng: -0.3616 },
  'W3': { lat: 51.5151, lng: -0.2624 },
  'W5': { lat: 51.5143, lng: -0.3090 },
  'WC2': { lat: 51.5074, lng: -0.1278 },
  'WC2E': { lat: 51.5128, lng: -0.1239 },
  'WC2H': { lat: 51.5074, lng: -0.1278 },
  // Manchester
  'M1': { lat: 53.4808, lng: -2.2426 },
  'M2': { lat: 53.4808, lng: -2.2426 },
  'M60': { lat: 53.4808, lng: -2.2426 }
};

async function fixAllProperties() {
  try {
    console.log('\n========================================');
    console.log('🔧 FIXING ALL PROPERTY COORDINATES');
    console.log('========================================\n');

    // Get all properties with potentially incorrect coordinates
    const result = await pool.query(`
      SELECT id, title, zip_code as postcode, latitude, longitude, category
      FROM properties
      WHERE user_id = 30
      ORDER BY category, id
    `);

    console.log(`📦 Found ${result.rows.length} total properties\n`);

    const stats = { rent: 0, sale: 0, lease: 0, skipped: 0 };

    for (const property of result.rows) {
      if (!property.postcode) {
        stats.skipped++;
        continue;
      }

      // Extract postcode area
      const cleanPostcode = property.postcode.trim().toUpperCase().replace(/\s+/g, '');
      const postcodeArea = cleanPostcode.match(/^([A-Z]+\d+)/);
      
      if (!postcodeArea) {
        stats.skipped++;
        continue;
      }

      const area = postcodeArea[1];
      const coords = postcodeCoordinates[area];

      if (!coords) {
        stats.skipped++;
        continue;
      }

      // Check if already has correct-ish coordinates (not the generic B46 center)
      const isGenericCoord = Math.abs(property.latitude - 52.4862) < 0.0001 && 
                            Math.abs(property.longitude - (-1.8904)) < 0.0001;
      
      const isSimilarToCorrect = coords && 
                                Math.abs(property.latitude - coords.lat) < 0.02 &&
                                Math.abs(property.longitude - coords.lng) < 0.02;

      if (!isGenericCoord && isSimilarToCorrect) {
        // Already has reasonable coordinates for this area
        stats.skipped++;
        continue;
      }

      // Add random offset for uniqueness
      const randomOffset = () => (Math.random() - 0.5) * 0.01;
      const newLat = coords.lat + randomOffset();
      const newLng = coords.lng + randomOffset();

      console.log(`✅ ${property.category.toUpperCase()}: "${property.title}"`);
      console.log(`   ${property.postcode} → ${area}`);
      console.log(`   ${property.latitude}, ${property.longitude} → ${newLat.toFixed(6)}, ${newLng.toFixed(6)}`);

      await pool.query(`
        UPDATE properties
        SET latitude = $1, longitude = $2
        WHERE id = $3
      `, [newLat, newLng, property.id]);

      stats[property.category]++;
    }

    console.log('\n========================================');
    console.log('📊 SUMMARY');
    console.log('========================================');
    console.log(`✅ RENT fixed: ${stats.rent} properties`);
    console.log(`✅ SALE fixed: ${stats.sale} properties`);
    console.log(`✅ LEASE fixed: ${stats.lease} properties`);
    console.log(`⏭️  Skipped: ${stats.skipped} properties`);
    console.log(`📦 Total: ${result.rows.length} properties`);
    console.log('\n✅ All coordinates updated successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

fixAllProperties();

