import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Logout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const performLogout = async () => {
      try {
        // Call the logout function from AuthContext
        logout();
        
        // Redirect to home page after a short delay
        setTimeout(() => {
          navigate('/');
        }, 1000);
      } catch (error) {
        console.error('Logout failed:', error);
        navigate('/');
      }
    };

    performLogout();
  }, [logout, navigate]);

  return (
    <div className="container d-flex justify-content-center align-items-center vh-100">
      <div className="text-center">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <h2>Logging out...</h2>
      </div>
    </div>
  );
};

export default Logout; 