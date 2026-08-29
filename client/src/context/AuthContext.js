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
      
      // 🔍 DEBUG: Log the validated user data
      console.log('🔍 Token validation response:', response.data);
      
      return response.data.user;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Migration: Move data from sessionStorage to localStorage if it exists
        const sessionToken = sessionStorage.getItem('token');
        const sessionUser = sessionStorage.getItem('user');
        if (sessionToken && sessionUser && !localStorage.getItem('token')) {
          localStorage.setItem('token', sessionToken);
          localStorage.setItem('user', sessionUser);
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
          console.log('Migrated authentication data from sessionStorage to localStorage');
        }

        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        
        console.log('Checking auth:', { token, userData }); // Debug log
    
        if (token && userData) {
          try {
            // Validate token with server
            const validatedUser = await validateToken(token);
            console.log('Validated user:', validatedUser); // Debug log
            
            if (validatedUser) {
              const parsedUser = JSON.parse(userData);
              
              // 🔍 CRITICAL FIX: Ensure role is included from validated user
              const userWithRole = {
                ...parsedUser,
                role: validatedUser.role || parsedUser.role || 'user'
              };
              
              console.log('🔍 Setting user with role:', userWithRole);
              setUser(userWithRole);
              setIsAuthenticated(true);
            } else {
              // Token is invalid, clear storage
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              setUser(null);
              setIsAuthenticated(false);
            }
          } catch (error) {
            console.error("Error validating token:", error);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
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

  useEffect(() => {
    const onSessionExpired = () => {
      setUser(null);
      setIsAuthenticated(false);
    };
    window.addEventListener('auth:session-expired', onSessionExpired);
    return () => window.removeEventListener('auth:session-expired', onSessionExpired);
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
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('loginTime', Date.now().toString()); // Add login timestamp
        console.log('Stored in localStorage:', {
          token: localStorage.getItem('token'),
          user: localStorage.getItem('user')
        });
      } catch (storageError) {
        console.error('Error storing in localStorage:', storageError);
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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('loginTime'); // Clean up login timestamp
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const updateUser = (updatedUserData) => {
    try {
      console.log('🔄 AuthContext: Updating user data:', updatedUserData);
      
      // Update the user state
      const newUserData = { ...user, ...updatedUserData };
      setUser(newUserData);
      
      // Update localStorage
      localStorage.setItem('user', JSON.stringify(newUserData));
      
      console.log('✅ AuthContext: User data updated successfully');
      return true;
    } catch (error) {
      console.error('❌ AuthContext: Error updating user data:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      loading, 
      isAuthenticated,
      validateToken,
      updateUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
}; 