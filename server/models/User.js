const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password is required only if not using Google auth
    }
  },
  first_name: {
    type: String,
    trim: true
  },
  last_name: {
    type: String,
    trim: true
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  picture: {
    type: String
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Static method to create or update user from Google profile
userSchema.statics.createOrUpdateFromGoogle = async function(profile) {
  try {
    const { id, displayName, emails, photos } = profile;
    const email = emails[0].value;
    const picture = photos[0].value;
    
    // Split display name into first and last name
    const nameParts = displayName.split(' ');
    const first_name = nameParts[0];
    const last_name = nameParts.slice(1).join(' ');

    // Find or create user
    let user = await this.findOne({ googleId: id });
    
    if (!user) {
      // Check if user exists with same email
      user = await this.findOne({ email });
      
      if (user) {
        // Update existing user with Google info
        user.googleId = id;
        user.picture = picture;
        user.first_name = first_name;
        user.last_name = last_name;
        user.isVerified = true;
      } else {
        // Create new user
        user = new this({
          email,
          googleId: id,
          first_name,
          last_name,
          picture,
          isVerified: true
        });
      }
    }

    await user.save();
    return user;
  } catch (error) {
    console.error('Error in createOrUpdateFromGoogle:', error);
    throw error;
  }
};

// Method to verify user
userSchema.statics.verifyById = async function(userId) {
  const user = await this.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  user.isVerified = true;
  await user.save();
  return user;
};

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  this.updatedAt = Date.now();
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User; 