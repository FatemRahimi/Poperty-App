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
      const fs = require('fs');
      const path = require('path');
      
      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      if (req.files.companyLogo && req.files.companyLogo[0]) {
        const file = req.files.companyLogo[0];
        const fileName = `company_logo_${userId}_${Date.now()}${path.extname(file.originalname)}`;
        const filePath = path.join(uploadsDir, fileName);
        
        fs.writeFileSync(filePath, file.buffer);
        advisorData.companyLogoUrl = `/uploads/${fileName}`;
        console.log('✅ Company logo saved:', fileName);
      }
      
      if (req.files.profilePhoto && req.files.profilePhoto[0]) {
        const file = req.files.profilePhoto[0];
        const fileName = `profile_photo_${userId}_${Date.now()}${path.extname(file.originalname)}`;
        const filePath = path.join(uploadsDir, fileName);
        
        fs.writeFileSync(filePath, file.buffer);
        advisorData.profilePhotoUrl = `/uploads/${fileName}`;
        console.log('✅ Profile photo saved:', fileName);
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

// Get advisor profile for editing
const getAdvisorProfileForEdit = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const profile = await User.getAdvisorProfileForEdit(userId);
    return res.json({ success: true, advisorProfile: profile });
  } catch (error) {
    console.error('❌ Get advisor profile for edit error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch advisor profile for editing' });
  }
};

// Add expert team member
const addExpertTeamMember = async (req, res) => {
  try {
    const { advisorProfileId } = req.params;
    const expertData = req.body;
    
    if (!advisorProfileId || !expertData.fullName || !expertData.jobTitle) {
      return res.status(400).json({ success: false, message: 'Advisor profile ID, full name, and job title are required' });
    }

    const expert = await User.addExpertTeamMember(advisorProfileId, expertData);
    return res.json({ success: true, expert });
  } catch (error) {
    console.error('❌ Add expert team member error:', error);
    res.status(500).json({ success: false, message: 'Failed to add expert team member' });
  }
};

// Update expert team member
const updateExpertTeamMember = async (req, res) => {
  try {
    const { expertId } = req.params;
    const expertData = req.body;
    
    if (!expertId || !expertData.fullName || !expertData.jobTitle) {
      return res.status(400).json({ success: false, message: 'Expert ID, full name, and job title are required' });
    }

    const expert = await User.updateExpertTeamMember(expertId, expertData);
    return res.json({ success: true, expert });
  } catch (error) {
    console.error('❌ Update expert team member error:', error);
    res.status(500).json({ success: false, message: 'Failed to update expert team member' });
  }
};

// Delete expert team member
const deleteExpertTeamMember = async (req, res) => {
  try {
    const { expertId } = req.params;
    
    if (!expertId) {
      return res.status(400).json({ success: false, message: 'Expert ID is required' });
    }

    const expert = await User.deleteExpertTeamMember(expertId);
    return res.json({ success: true, expert });
  } catch (error) {
    console.error('❌ Delete expert team member error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete expert team member' });
  }
};

module.exports = {
  updateProfile,
  checkAdvisorProfile,
  saveAdvisorProfile,
  skipAdvisorProfile,
  getAdvisorProfileForEdit,
  addExpertTeamMember,
  updateExpertTeamMember,
  deleteExpertTeamMember
}; 