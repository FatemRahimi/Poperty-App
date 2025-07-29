const { Pool } = require('pg');
const axios = require('axios');

/**
 * Enhanced Database Coordinate Fix Script
 * This script permanently fixes incorrect coordinates in the database
 * using multiple methods: postcode API, enhanced area matching, and geocoding
 */
async function fixDatabaseCoordinates() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
  });

  try {
    console.log('🔧 Starting enhanced database coordinate fix...');

    // Get all properties
    const result = await pool.query('SELECT id, address_line1, city, zip_code, latitude, longitude FROM properties');
    const properties = result.rows;

    console.log(`📊 Found ${properties.length} properties to check`);

    let fixedCount = 0;
    const updates = [];

    // Enhanced area coordinates with more granular data
    const enhancedAreaCoordinates = {
      // London Boroughs and Major Areas
      'finchley central': { lat: 51.6000, lng: -0.2000 },
      'finchley': { lat: 51.6000, lng: -0.2000 },
      'north finchley': { lat: 51.6100, lng: -0.1900 },
      'east finchley': { lat: 51.5900, lng: -0.2100 },
      'ealing': { lat: 51.5000, lng: -0.2833 },
      'acton': { lat: 51.5100, lng: -0.2700 },
      'harrow': { lat: 51.5800, lng: -0.3300 },
      'wembley': { lat: 51.5500, lng: -0.2800 },
      'barnet': { lat: 51.6500, lng: -0.2000 },
      'enfield': { lat: 51.6500, lng: -0.0800 },
      'edmonton': { lat: 51.6200, lng: -0.0600 },
      'brixton': { lat: 51.4600, lng: -0.1100 },
      'streatham': { lat: 51.4300, lng: -0.1300 },
      'croydon': { lat: 51.3800, lng: -0.1100 },
      'bexley': { lat: 51.4500, lng: 0.1500 },
      'greenwich': { lat: 51.4800, lng: 0.0000 },
      'lewisham': { lat: 51.4600, lng: -0.0100 },
      'southwark': { lat: 51.5000, lng: -0.0900 },
      'lambeth': { lat: 51.4900, lng: -0.1100 },
      'wandsworth': { lat: 51.4600, lng: -0.1900 },
      'hammersmith': { lat: 51.4900, lng: -0.2200 },
      'fulham': { lat: 51.4800, lng: -0.2000 },
      'richmond': { lat: 51.4600, lng: -0.3000 },
      'kingston': { lat: 51.4100, lng: -0.3000 },
      'bromley': { lat: 51.4000, lng: 0.0200 },
      'havering': { lat: 51.5800, lng: 0.1800 },
      'barking': { lat: 51.5400, lng: 0.0800 },
      'redbridge': { lat: 51.5600, lng: 0.0700 },
      'waltham forest': { lat: 51.5800, lng: -0.0200 },
      'haringey': { lat: 51.5800, lng: -0.1000 },
      'hillingdon': { lat: 51.5400, lng: -0.4700 },
      'hounslow': { lat: 51.4700, lng: -0.3600 },
      'chiswick': { lat: 51.4900, lng: -0.2600 },
      'putney': { lat: 51.4600, lng: -0.2200 },
      'wimbledon': { lat: 51.4200, lng: -0.2100 },
      'clapham': { lat: 51.4600, lng: -0.1600 },
      'dulwich': { lat: 51.4500, lng: -0.0900 },
      'peckham': { lat: 51.4700, lng: -0.0700 },
      'bermondsey': { lat: 51.4900, lng: -0.0800 },
      'canary wharf': { lat: 51.5000, lng: -0.0200 },
      'westminster': { lat: 51.5000, lng: -0.1300 },
      'kensington': { lat: 51.5000, lng: -0.1900 },
      'chelsea': { lat: 51.4800, lng: -0.1700 },
      'islington': { lat: 51.5400, lng: -0.1000 },
      'hackney': { lat: 51.5500, lng: -0.0500 },
      'tower hamlets': { lat: 51.5200, lng: -0.0300 },
      
      // Additional specific areas
      'finchley road': { lat: 51.5500, lng: -0.1800 },
      'swiss cottage': { lat: 51.5400, lng: -0.1700 },
      'hampstead': { lat: 51.5600, lng: -0.1700 },
      'highgate': { lat: 51.5700, lng: -0.1500 },
      'muswell hill': { lat: 51.5900, lng: -0.1400 },
      'alexandra palace': { lat: 51.6000, lng: -0.1200 },
      'finsbury park': { lat: 51.5600, lng: -0.1000 },
      'highbury': { lat: 51.5500, lng: -0.1000 },
      'holloway': { lat: 51.5500, lng: -0.1200 },
      'stroud green': { lat: 51.5800, lng: -0.1000 },
      'stoke newington': { lat: 51.5700, lng: -0.0800 },
      'tottenham': { lat: 51.6000, lng: -0.0700 },
      'whetstone': { lat: 51.6300, lng: -0.1500 },
      'winchmore hill': { lat: 51.6300, lng: -0.1000 },
      'wood green': { lat: 51.6000, lng: -0.1100 },
      
      // Postcode areas (N London)
      'n2': { lat: 51.5700, lng: -0.1500 }, // Finchley
      'n3': { lat: 51.6000, lng: -0.2000 }, // Finchley Central
      'n4': { lat: 51.5600, lng: -0.1000 }, // Finsbury Park
      'n5': { lat: 51.5500, lng: -0.1000 }, // Highbury
      'n6': { lat: 51.5700, lng: -0.1500 }, // Highgate
      'n7': { lat: 51.5500, lng: -0.1200 }, // Holloway
      'n8': { lat: 51.5900, lng: -0.1400 }, // Muswell Hill
      'n9': { lat: 51.6200, lng: -0.0800 }, // Edmonton
      'n10': { lat: 51.5900, lng: -0.1400 }, // Muswell Hill
      'n11': { lat: 51.6100, lng: -0.1300 }, // New Southgate
      'n12': { lat: 51.6000, lng: -0.1500 }, // North Finchley
      'n13': { lat: 51.6200, lng: -0.1000 }, // Palmers Green
      'n14': { lat: 51.6300, lng: -0.1300 }, // Southgate
      'n15': { lat: 51.5800, lng: -0.1000 }, // Stroud Green
      'n16': { lat: 51.5700, lng: -0.0800 }, // Stoke Newington
      'n17': { lat: 51.6000, lng: -0.0700 }, // Tottenham
      'n18': { lat: 51.6200, lng: -0.0600 }, // Upper Edmonton
      'n19': { lat: 51.5700, lng: -0.1200 }, // Upper Holloway
      'n20': { lat: 51.6300, lng: -0.1500 }, // Whetstone
      'n21': { lat: 51.6300, lng: -0.1000 }, // Winchmore Hill
      'n22': { lat: 51.6000, lng: -0.1100 }, // Wood Green
      
      // Other London postcode areas
      'sw1': { lat: 51.5000, lng: -0.1300 }, // Westminster
      'sw2': { lat: 51.4600, lng: -0.1100 }, // Brixton
      'sw3': { lat: 51.4800, lng: -0.1700 }, // Chelsea
      'sw4': { lat: 51.4600, lng: -0.1600 }, // Clapham
      'sw5': { lat: 51.4900, lng: -0.1900 }, // Earls Court
      'sw6': { lat: 51.4800, lng: -0.2000 }, // Fulham
      'sw7': { lat: 51.5000, lng: -0.1900 }, // South Kensington
      'sw8': { lat: 51.4800, lng: -0.1200 }, // South Lambeth
      'sw9': { lat: 51.4600, lng: -0.1100 }, // Stockwell
      'sw10': { lat: 51.4800, lng: -0.1800 }, // West Brompton
      'sw11': { lat: 51.4600, lng: -0.1900 }, // Battersea
      'sw12': { lat: 51.4400, lng: -0.1400 }, // Balham
      'sw13': { lat: 51.4700, lng: -0.2500 }, // Barnes
      'sw14': { lat: 51.4600, lng: -0.2500 }, // Mortlake
      'sw15': { lat: 51.4600, lng: -0.2200 }, // Putney
      'sw16': { lat: 51.4300, lng: -0.1300 }, // Streatham
      'sw17': { lat: 51.4200, lng: -0.2100 }, // Tooting
      'sw18': { lat: 51.4500, lng: -0.2000 }, // Wandsworth
      'sw19': { lat: 51.4200, lng: -0.2100 }, // Wimbledon
      'sw20': { lat: 51.4100, lng: -0.2000 }, // Raynes Park
      
      'w1': { lat: 51.5200, lng: -0.1400 }, // West End
      'w2': { lat: 51.5200, lng: -0.1800 }, // Paddington
      'w3': { lat: 51.5100, lng: -0.2700 }, // Acton
      'w4': { lat: 51.4900, lng: -0.2600 }, // Chiswick
      'w5': { lat: 51.5000, lng: -0.2800 }, // Ealing
      'w6': { lat: 51.4900, lng: -0.2200 }, // Hammersmith
      'w7': { lat: 51.5200, lng: -0.3300 }, // Hanwell
      'w8': { lat: 51.5000, lng: -0.1900 }, // Kensington
      'w9': { lat: 51.5200, lng: -0.1900 }, // Maida Vale
      'w10': { lat: 51.5200, lng: -0.2100 }, // North Kensington
      'w11': { lat: 51.5100, lng: -0.2000 }, // Notting Hill
      'w12': { lat: 51.5100, lng: -0.2300 }, // Shepherd's Bush
      'w13': { lat: 51.5200, lng: -0.3200 }, // West Ealing
      'w14': { lat: 51.5000, lng: -0.2100 }, // West Kensington
      
      'e1': { lat: 51.5200, lng: -0.0300 }, // Whitechapel
      'e2': { lat: 51.5300, lng: -0.0600 }, // Bethnal Green
      'e3': { lat: 51.5300, lng: -0.0200 }, // Bow
      'e4': { lat: 51.6300, lng: -0.0000 }, // Chingford
      'e5': { lat: 51.5600, lng: -0.0500 }, // Clapton
      'e6': { lat: 51.5300, lng: 0.0700 }, // East Ham
      'e7': { lat: 51.5500, lng: -0.0200 }, // Forest Gate
      'e8': { lat: 51.5400, lng: -0.0600 }, // Hackney
      'e9': { lat: 51.5400, lng: -0.0400 }, // Homerton
      'e10': { lat: 51.5600, lng: -0.0100 }, // Leyton
      'e11': { lat: 51.5600, lng: 0.0100 }, // Leytonstone
      'e12': { lat: 51.5500, lng: 0.0500 }, // Manor Park
      'e13': { lat: 51.5300, lng: 0.0200 }, // Plaistow
      'e14': { lat: 51.5000, lng: -0.0200 }, // Poplar
      'e15': { lat: 51.5500, lng: 0.0000 }, // Stratford
      'e16': { lat: 51.5200, lng: 0.0000 }, // Victoria Docks
      'e17': { lat: 51.5800, lng: -0.0200 }, // Walthamstow
      'e18': { lat: 51.6000, lng: 0.0000 }, // Woodford
      'e20': { lat: 51.5500, lng: 0.0000 }, // Olympic Park
    };

    // Get coordinates from postcode API
    async function getCoordinatesFromPostcode(postcode) {
      if (!postcode) return null;
      
      try {
        const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase();
        const response = await axios.get(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
        
        if (response.data.result) {
          return {
            latitude: response.data.result.latitude,
            longitude: response.data.result.longitude
          };
        }
      } catch (error) {
        console.log(`Could not find coordinates for postcode: ${postcode}`);
      }
      return null;
    }

    // Get coordinates from area matching
    function getAreaCoordinates(address, city) {
      const searchText = `${address} ${city}`.toLowerCase();
      
      for (const [area, coords] of Object.entries(enhancedAreaCoordinates)) {
        if (searchText.includes(area)) {
          return coords;
        }
      }
      return null;
    }

    // Calculate distance between two points
    const calculateDistance = (lat1, lng1, lat2, lng2) => {
      const R = 3959; // Earth's radius in miles
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLng = (lng2 - lng1) * (Math.PI / 180);
      
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Get best coordinates using hybrid approach
    async function getBestCoordinates(property) {
      // 1. Try postcode first (most accurate)
      if (property.zip_code) {
        const postcodeCoords = await getCoordinatesFromPostcode(property.zip_code);
        if (postcodeCoords) {
          console.log(`📍 Found coordinates via postcode for property ${property.id}: ${property.zip_code}`);
          return postcodeCoords;
        }
      }
      
      // 2. Try enhanced area matching
      const areaCoords = getAreaCoordinates(property.address_line1, property.city);
      if (areaCoords) {
        console.log(`🏘️ Found coordinates via area matching for property ${property.id}: ${property.address_line1}`);
        return areaCoords;
      }
      
      return null;
    }

    for (const property of properties) {
      const currentLat = parseFloat(property.latitude);
      const currentLng = parseFloat(property.longitude);
      
      if (currentLat && currentLng) {
        const newCoords = await getBestCoordinates(property);
        
        if (newCoords) {
          const distance = calculateDistance(currentLat, currentLng, newCoords.latitude, newCoords.longitude);
          
          // If coordinates are more than 1 mile off, fix them
          if (distance > 1) {
            console.log(`🔧 Fixing property ${property.id}: ${property.address_line1}`);
            console.log(`   Old: (${currentLat}, ${currentLng}) → New: (${newCoords.latitude}, ${newCoords.longitude})`);
            console.log(`   Distance: ${distance.toFixed(2)} miles`);
            
            updates.push({
              id: property.id,
              latitude: newCoords.latitude,
              longitude: newCoords.longitude
            });
            
            fixedCount++;
          }
        }
      }
    }

    // Apply all updates
    if (updates.length > 0) {
      console.log(`\n💾 Applying ${updates.length} coordinate fixes to database...`);
      
      for (const update of updates) {
        await pool.query(
          'UPDATE properties SET latitude = $1, longitude = $2 WHERE id = $3',
          [update.latitude, update.longitude, update.id]
        );
      }
      
      console.log(`✅ Successfully fixed ${fixedCount} properties`);
    } else {
      console.log('✅ No coordinate fixes needed');
    }

    console.log('\n🎉 Enhanced database coordinate fix completed!');

  } catch (error) {
    console.error('❌ Error fixing coordinates:', error);
  } finally {
    await pool.end();
  }
}

// Run the script if called directly
if (require.main === module) {
  fixDatabaseCoordinates();
}

module.exports = { fixDatabaseCoordinates }; 