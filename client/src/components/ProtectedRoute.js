import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, validateToken } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        await validateToken(token);
      }
    };
    checkAuth();
  }, [validateToken]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    // Save the attempted URL for redirecting after login
    const from = `${location.pathname}${location.search || ''}`;
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return children;
};

export default ProtectedRoute; 