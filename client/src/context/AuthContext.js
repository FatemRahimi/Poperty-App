import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

// Configure axios defaults
axios.defaults.baseURL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050';
axios.defaults.withCredentials = true;

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Function to validate token
  const validateToken = async (token) => {
    try {
      const response = await axios.get('/api/auth/verify-token', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data.user;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = sessionStorage.getItem('token');
        const userData = sessionStorage.getItem('user');
        
        console.log('Checking auth:', { token, userData }); // Debug log
        
        if (token && userData) {
          try {
            // Validate token with server
            const validatedUser = await validateToken(token);
            console.log('Validated user:', validatedUser); // Debug log
            
            if (validatedUser) {
              const parsedUser = JSON.parse(userData);
              setUser(parsedUser);
              setIsAuthenticated(true);
            } else {
              // Token is invalid, clear storage
              sessionStorage.removeItem('token');
              sessionStorage.removeItem('user');
              setUser(null);
              setIsAuthenticated(false);
            }
          } catch (error) {
            console.error("Error validating token:", error);
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
            setUser(null);
            setIsAuthenticated(false);
          }
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error in checkAuth:', error);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (userData, token) => {
    try {
      console.log('Login called with:', { userData, token }); // Debug log
      
      if (!userData || !token) {
        console.error('Missing userData or token in login function');
        return false;
      }

      // Store token and user data
      try {
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('user', JSON.stringify(userData));
        console.log('Stored in sessionStorage:', {
          token: sessionStorage.getItem('token'),
          user: sessionStorage.getItem('user')
        });
      } catch (storageError) {
        console.error('Error storing in sessionStorage:', storageError);
        return false;
      }
      
      // Update state and wait for it to complete
      await new Promise(resolve => {
        setUser(userData);
        setIsAuthenticated(true);
        resolve();
      });
      
      // Verify the state was updated
      console.log('Auth state updated:', {
        user: userData,
        isAuthenticated: true
      });
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint
      await axios.get('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear storage and state
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      loading, 
      isAuthenticated,
      validateToken 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
}; 