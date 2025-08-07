import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdvisorProfileCheck = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAdvisorProfile = async () => {
      // Check localStorage first for skip status (fallback)
      const localSkipStatus = localStorage.getItem('advisorProfileSkipped');
      if (localSkipStatus === 'true') {
        console.log('User has skipped advisor profile (localStorage), allowing access to seller page');
        setIsChecking(false);
        return;
      }

      // If no user, allow access (let login handle it)
      if (!user || !user.id) {
        console.log('No user found, allowing access to seller page');
        setIsChecking(false);
        return;
      }

      try {
        // Check if user has completed advisor profile
        const token = sessionStorage.getItem('token');
        const headers = {
          'Content-Type': 'application/json'
        };

        // Add authorization header if token exists
        if (token && token !== 'null') {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`/api/users/${user.id}/advisor-profile`, {
          method: 'GET',
          headers: headers
        });

        if (response.ok) {
          const data = await response.json();
          
          // If user has completed OR skipped advisor profile, allow access to seller page
          if (data.hasCompletedAdvisorProfile || data.hasSkippedAdvisorProfile) {
            console.log('User has completed or skipped advisor profile, allowing access to seller page');
            setIsChecking(false);
            return;
          } else {
            // If user hasn't completed or skipped advisor profile, redirect to advisor profile page
            console.log('User has not completed or skipped advisor profile, redirecting to advisor profile');
            navigate('/advisor-profile');
            return;
          }
        } else {
          // If API call fails, redirect to advisor profile page
          console.log('API call failed, redirecting to advisor profile');
          navigate('/advisor-profile');
          return;
        }
      } catch (error) {
        console.error('Error checking advisor profile:', error);
        // On error, redirect to advisor profile page
        console.log('Error occurred, redirecting to advisor profile');
        navigate('/advisor-profile');
        return;
      }
    };

    checkAdvisorProfile();
  }, [user, navigate]);

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