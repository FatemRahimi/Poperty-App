import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const token = sessionStorage.getItem('token');
    const userData = sessionStorage.getItem('user');
    
    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        // Add a name property for convenience in UI components
        if (parsedUser && !parsedUser.name) {
          parsedUser.name = getDisplayName(parsedUser);
        }
        setUser(parsedUser);
      } catch (error) {
        console.error("Error parsing user data:", error);
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  // Helper function to get display name
  const getDisplayName = (userData) => {
    if (!userData) return 'User';
    
    // If user already has a name property, use it
    if (userData.name) return userData.name;
    
    // Try to construct from first_name and last_name
    if (userData.first_name || userData.last_name) {
      return `${userData.first_name || ''} ${userData.last_name || ''}`.trim();
    }
    
    // Fall back to email
    if (userData.email) {
      return userData.email.split('@')[0];
    }
    
    // Last resort
    return 'User';
  };

  const login = (userData, token) => {
    // Add a name property for convenience in UI components
    if (userData && !userData.name) {
      userData.name = getDisplayName(userData);
    }
    
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
}; 