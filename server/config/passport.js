const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple').Strategy;
const authConfig = require('./auth');
const User = require('../models/User');

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: authConfig.google.clientID,
    clientSecret: authConfig.google.clientSecret,
    callbackURL: authConfig.google.callbackURL
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

// Apple Strategy
passport.use(new AppleStrategy({
    clientID: authConfig.apple.clientID,
    teamID: authConfig.apple.teamID,
    keyID: authConfig.apple.keyID,
    privateKeyPath: authConfig.apple.privateKeyPath,
    callbackURL: authConfig.apple.callbackURL,
    scope: ['name', 'email']
  },
  function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

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