import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the user data from the URL parameters
        const params = new URLSearchParams(location.search);
        const userData = params.get('user');
        const token = params.get('token');
        const redirectTo = params.get('redirectTo') || '/find';
        
        if (userData && token) {
          try {
            // Parse the user data
            const parsedUser = JSON.parse(decodeURIComponent(userData));
            
            // Store the token and user data in sessionStorage
            sessionStorage.setItem('token', token);
            sessionStorage.setItem('user', JSON.stringify(parsedUser));
            
            // Call the login function from AuthContext
            const loginSuccess = await login(parsedUser, token);
            
            if (loginSuccess) {
              // Clear any existing error and navigate
              setError(null);
              
              // Small delay to ensure state updates before navigation
              setTimeout(() => {
                // Redirect to the intended page
                navigate(redirectTo, { replace: true });
              }, 100);
            } else {
              throw new Error('Login failed');
            }
          } catch (parseError) {
            console.error('Error parsing user data:', parseError);
            setError('Failed to parse user data');
            navigate('/login', { state: { error: 'Authentication failed - invalid user data' } });
          }
        } else {
          console.error('Missing user data or token');
          setError('Missing authentication data');
          navigate('/login', { state: { error: 'Authentication failed - missing data' } });
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        setError('Authentication process failed');
        navigate('/login', { state: { error: 'Authentication failed - unexpected error' } });
      }
    };

    handleCallback();
  }, [location, login, navigate]);

  if (error) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="alert alert-danger">
            {error}
          </div>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/login')}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex justify-content-center align-items-center vh-100">
      <div className="text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">Completing authentication...</p>
      </div>
    </div>
  );
};

export default OAuthCallback; 