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

// Check if user has completed advisor profile
const checkAdvisorProfile = async (req, res) => {
  try {
    console.log('🔍 Check advisor profile request received');
    console.log('User ID from params:', req.params.userId);
    console.log('User ID from JWT:', req.user?.id);
    
    // Use user ID from URL params if JWT user is not available
    const userId = req.user?.id || req.params.userId;
    
    if (!userId) {
      console.log('❌ No user ID found, returning false');
      return res.json({
        success: true,
        hasCompletedAdvisorProfile: false,
        hasSkippedAdvisorProfile: false
      });
    }
    
    const result = await User.checkAdvisorProfile(userId);
    
    console.log('✅ Advisor profile check result:', result);
    
    res.json({
      success: true,
      hasCompletedAdvisorProfile: result.hasCompleted,
      hasSkippedAdvisorProfile: result.hasSkipped
    });

  } catch (error) {
    console.error('❌ Check advisor profile error:', error);
    // On error, assume user hasn't completed advisor profile
    res.json({
      success: true,
      hasCompletedAdvisorProfile: false,
      hasSkippedAdvisorProfile: false
    });
  }
};

// Save advisor profile
const saveAdvisorProfile = async (req, res) => {
  try {
    console.log('🔍 Save advisor profile request received');
    console.log('User ID:', req.user.id);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    const userId = req.user.id;
    const advisorData = req.body;
    
    // Handle file uploads if present
    if (req.files) {
      if (req.files.companyLogo) {
        advisorData.companyLogoUrl = `/uploads/${req.files.companyLogo.name}`;
      }
      if (req.files.profilePhoto) {
        advisorData.profilePhotoUrl = `/uploads/${req.files.profilePhoto.name}`;
      }
    }
    
    // Save advisor profile
    const result = await User.saveAdvisorProfile(userId, advisorData);
    
    // Mark advisor profile as completed
    await User.markAdvisorProfileCompleted(userId);
    
    console.log('✅ Advisor profile saved and marked as completed');
    
    res.json({
      success: true,
      message: 'Advisor profile saved successfully',
      advisorProfile: result
    });

  } catch (error) {
    console.error('❌ Save advisor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save advisor profile',
      error: error.message
    });
  }
};

// Mark advisor profile as skipped
const skipAdvisorProfile = async (req, res) => {
  try {
    console.log('🔍 Skip advisor profile request received');
    console.log('User ID:', req.user?.id);
    
    const userId = req.user?.id;
    
    if (!userId) {
      console.log('❌ No user ID found, but returning success');
      return res.json({
        success: true,
        message: 'Advisor profile skipped successfully'
      });
    }
    
    // Mark user as skipped advisor profile
    await User.skipAdvisorProfile(userId);
    
    console.log('✅ Advisor profile marked as skipped');
    
    res.json({
      success: true,
      message: 'Advisor profile skipped successfully'
    });

  } catch (error) {
    console.error('❌ Skip advisor profile error:', error);
    // Even on error, return success to allow navigation
    res.json({
      success: true,
      message: 'Advisor profile skipped successfully'
    });
  }
};

module.exports = {
  updateProfile,
  checkAdvisorProfile,
  saveAdvisorProfile,
  skipAdvisorProfile
}; 