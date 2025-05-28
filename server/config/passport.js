const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
// const AppleStrategy = require('passport-apple').Strategy; /* APPLE LOGIN - COMMENTED FOR FUTURE USE */
const config = require('./config');
const User = require('../models/User');

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: config.auth.google.clientID,
    clientSecret: config.auth.google.clientSecret,
    callbackURL: config.auth.google.callbackURL
  },
  async function(accessToken, refreshToken, profile, done) {
    try {
      const user = await User.createOrUpdateFromGoogle(profile);
      return done(null, user);
    } catch (error) {
      console.error('Google Strategy Error:', error);
      return done(error, null);
    }
  }
));

/* APPLE STRATEGY - COMMENTED FOR FUTURE USE
passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH,
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5050'}/api/auth/apple/callback`,
    scope: ['name', 'email']
  },
  function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));
*/

// Serialize user into the session
passport.serializeUser((user, done) => {
  // Store the entire user object in the session
  done(null, user);
});

// Deserialize user from the session
passport.deserializeUser(async (user, done) => {
  try {
    // If we already have the user object, use it
    if (user && user.id) {
      return done(null, user);
    }
    
    // If we only have an ID, try to find the user
    if (user && typeof user === 'string') {
      const foundUser = await User.findById(user);
      if (foundUser) {
        return done(null, foundUser);
      }
    }
    
    return done(new Error('User not found'), null);
  } catch (error) {
    console.error('Deserialize Error:', error);
    done(error, null);
  }
}); 