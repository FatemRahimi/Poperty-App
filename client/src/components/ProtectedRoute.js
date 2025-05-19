import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, redirectPath = '/login' }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // Store the current path for redirect after login
    sessionStorage.setItem('redirectAfterLogin', location.pathname);
    
    // Redirect to login page with the attempted url in state
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute; 