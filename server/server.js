require('dotenv').config();
const app = require('./app');
const User = require('./models/User');
const passport = require('./config/passport');
const db = require('./config/database');

// Initialize database
async function initializeDatabase() {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('Database connection successful');
    
    // Initialize User table
    await User.createTable();
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
}

// Force port to 5050
const PORT = 5050;

// Start server
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
