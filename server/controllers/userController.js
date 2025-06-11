const User = require('../models/User');

// Update user profile
const updateProfile = async (req, res) => {
  try {
    console.log('🔍 Profile update request received');
    console.log('User ID:', req.user.id);
    console.log('Request body:', req.body);
    
    const userId = req.user.id;
    const { first_name, last_name, phone } = req.body;

    // Validation
    if (!first_name || !last_name) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
    }

    console.log('✅ Validation passed, updating profile...');

    // Update user profile
    console.log('🔍 About to call User.updateProfile with:', {
      userId,
      profileData: {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        phone: phone ? phone.trim() : null
      }
    });
    
    const updatedUser = await User.updateProfile(userId, {
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      phone: phone ? phone.trim() : null
    });

    console.log('✅ User.updateProfile returned:', updatedUser);
    console.log('✅ Type of result:', typeof updatedUser);
    console.log('✅ Result is truthy:', !!updatedUser);

    if (!updatedUser) {
      console.log('❌ User not found after update');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Return updated user data (without sensitive info)
    const response = {
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        phone: updatedUser.phone,
        updated_at: updatedUser.updated_at
      }
    };
    
    console.log('📤 Sending response:', response);
    res.json(response);

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

module.exports = {
  updateProfile
}; 