import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdvisorProfileCheck = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple checks using useRef
    if (hasCheckedRef.current) {
      console.log('🔄 Already checked, skipping...');
      return;
    }

    // Wait until user is loaded before checking
    if (!isAuthenticated || !user) {
      console.log('⏳ Waiting for user authentication...');
      return;
    }

    const checkAdvisorProfile = async () => {
      console.log('🔍 AdvisorProfileCheck: Starting check for user:', user.id);
      hasCheckedRef.current = true; // Mark as checked to prevent multiple runs
      
      // Check for one-time skip token first
      const oneTimeSkip = sessionStorage.getItem('oneTimeAdvisorSkip');
      console.log('🔍 AdvisorProfileCheck: Checking for one-time skip token:', oneTimeSkip);
      
      if (oneTimeSkip) {
        console.log('✅ One-time skip token found, allowing access to seller page');
        sessionStorage.removeItem('oneTimeAdvisorSkip'); // Consume the token
        console.log('✅ One-time skip token consumed');
        setIsChecking(false);
        return;
      }

      console.log('❌ No one-time skip token found, checking backend...');

      try {
        // Check if user has completed advisor profile (only completion matters)
        const token = sessionStorage.getItem('token');
        const headers = {
          'Content-Type': 'application/json'
        };

        // Add authorization header if token exists
        if (token && token !== 'null') {
          headers['Authorization'] = `Bearer ${token}`;
        }

        console.log('📡 Making API call to check advisor profile...');
        const response = await fetch(`/api/users/${user.id}/advisor-profile`, {
          method: 'GET',
          headers: headers
        });

        if (response.ok) {
          const data = await response.json();
          console.log('📡 API response:', data);
          
          // Only allow access if user has COMPLETED advisor profile
          if (data.hasCompletedAdvisorProfile) {
            console.log('✅ User has completed advisor profile, allowing access to seller page');
            setIsChecking(false);
            return;
          } else {
            // If user hasn't completed advisor profile, redirect to advisor profile page
            console.log('❌ User has not completed advisor profile, redirecting to advisor profile');
            navigate('/advisor-profile', { replace: true }); // Use replace to preserve browser history
            return;
          }
        } else {
          // If API call fails, redirect to advisor profile page
          console.log('❌ API call failed, redirecting to advisor profile');
          navigate('/advisor-profile', { replace: true }); // Use replace to preserve browser history
          return;
        }
      } catch (error) {
        console.error('❌ Error checking advisor profile:', error);
        // On error, redirect to advisor profile page
        console.log('❌ Error occurred, redirecting to advisor profile');
        navigate('/advisor-profile', { replace: true }); // Use replace to preserve browser history
        return;
      }
    };

    checkAdvisorProfile();
  }, [user, isAuthenticated, navigate]);

  if (isChecking) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return children;
};

export default AdvisorProfileCheck; 