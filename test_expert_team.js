const { Pool } = require('pg');

// Database configuration - adjust these values based on your setup
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'property_db',
  password: 'your_password_here', // Replace with your actual password
  port: 5432,
});

async function testExpertTeamData() {
  try {
    console.log('🔍 Testing Expert Team Data for fa.rahimi5475@user');
    console.log('================================================');

    // Step 1: Find the user by email
    console.log('\n1️⃣ Finding user by email: fa.rahimi5475@user');
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE email = $1',
      ['fa.rahimi5475@user']
    );

    if (userResult.rows.length === 0) {
      console.log('❌ User not found in database');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ User found:', {
      id: user.id,
      email: user.email,
      name: `${user.first_name || 'N/A'} ${user.last_name || 'N/A'}`
    });

    // Step 2: Check if user has an advisor profile
    console.log('\n2️⃣ Checking for advisor profile...');
    const profileResult = await pool.query(
      `SELECT id, user_id, advisor_type, company_name, director_name, 
              full_name, job_title, expert_team, created_at, updated_at
       FROM advisor_profiles 
       WHERE user_id = $1`,
      [user.id]
    );

    if (profileResult.rows.length === 0) {
      console.log('❌ No advisor profile found for this user');
      return;
    }

    const profile = profileResult.rows[0];
    console.log('✅ Advisor profile found:', {
      profileId: profile.id,
      advisorType: profile.advisor_type,
      companyName: profile.company_name,
      directorName: profile.director_name,
      fullName: profile.full_name,
      jobTitle: profile.job_title,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    });

    // Step 3: Analyze expert_team data
    console.log('\n3️⃣ Analyzing expert_team data...');
    console.log('Raw expert_team field type:', typeof profile.expert_team);
    console.log('Raw expert_team value:', profile.expert_team);

    if (!profile.expert_team) {
      console.log('❌ No expert_team data found');
      return;
    }

    // Parse expert team data
    let experts = [];
    try {
      if (typeof profile.expert_team === 'string') {
        experts = JSON.parse(profile.expert_team);
        console.log('✅ Successfully parsed expert_team from JSON string');
      } else if (Array.isArray(profile.expert_team)) {
        experts = profile.expert_team;
        console.log('✅ Expert_team is already an array');
      } else if (typeof profile.expert_team === 'object') {
        experts = [profile.expert_team];
        console.log('✅ Expert_team is an object, converted to array');
      }
    } catch (error) {
      console.log('❌ Error parsing expert_team:', error.message);
      return;
    }

    // Validate and display expert team members
    console.log('\n4️⃣ Expert Team Members:');
    console.log('Total experts found:', experts.length);

    if (experts.length === 0) {
      console.log('❌ No expert team members found');
      return;
    }

    experts.forEach((expert, index) => {
      console.log(`\n👤 Expert ${index + 1}:`);
      console.log('  - ID:', expert.id || 'N/A');
      console.log('  - Full Name:', expert.fullName || expert.full_name || 'N/A');
      console.log('  - Job Title:', expert.jobTitle || expert.job_title || 'N/A');
      console.log('  - Email:', expert.email || 'N/A');
      console.log('  - Phone:', expert.phone || 'N/A');
      console.log('  - Profile Photo:', expert.profilePhotoUrl || expert.profile_photo_url || 'N/A');
      console.log('  - Created At:', expert.createdAt || expert.created_at || 'N/A');
      console.log('  - Updated At:', expert.updatedAt || expert.updated_at || 'N/A');
    });

    // Step 4: Test the User model method
    console.log('\n5️⃣ Testing User.getAdvisorProfileForEdit method...');
    
    // Simulate the method logic
    let processedExperts = [];
    if (Array.isArray(experts)) {
      processedExperts = experts
        .filter(expert => expert && typeof expert === 'object')
        .map(expert => ({
          id: expert.id || `expert_${Date.now()}_${Math.random()}`,
          fullName: expert.fullName || expert.full_name || '',
          jobTitle: expert.jobTitle || expert.job_title || '',
          profilePhotoUrl: expert.profilePhotoUrl || expert.profile_photo_url || null,
          phone: expert.phone || null,
          email: expert.email || null,
          createdAt: expert.createdAt || expert.created_at || new Date().toISOString(),
          updatedAt: expert.updatedAt || expert.updated_at || new Date().toISOString()
        }))
        .filter(expert => expert.fullName && expert.jobTitle);
    }

    console.log('✅ Processed experts count:', processedExperts.length);
    processedExperts.forEach((expert, index) => {
      console.log(`\n📋 Processed Expert ${index + 1}:`);
      console.log('  - ID:', expert.id);
      console.log('  - Full Name:', expert.fullName);
      console.log('  - Job Title:', expert.jobTitle);
      console.log('  - Email:', expert.email);
      console.log('  - Phone:', expert.phone);
    });

    console.log('\n✅ Expert team data analysis complete!');

  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    await pool.end();
  }
}

// Run the test
testExpertTeamData(); 