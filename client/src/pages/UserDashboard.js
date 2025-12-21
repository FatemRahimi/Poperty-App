import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { socket } from '../services/socket';
import SearchFilterHeader from '../components/dashboard/SearchFilterHeader';
import SearchFilterHeaderSale from '../components/dashboard/SearchFilterHeaderSale';
import SearchFilterHeaderLease from '../components/dashboard/SearchFilterHeaderLease';
import DashboardTabs from '../components/dashboard/DashboardTabs';
import OverviewStats from '../components/dashboard/OverviewStats';
import PropertiesSection from '../components/dashboard/PropertiesSection';
import { filterDashboardProperties } from '../Utils/DashboardSearch';
import './UserDashboard.css';
import "../styles/CrossBrowserReset.css"; // Cross-browser consistency
import LocationSearch from '../components/LocationSearch';
import PropertyCard from '../components/PropertyCard';

// 🏆 Professional search API endpoint
const PROFESSIONAL_SEARCH_API = process.env.NODE_ENV === 'production' 
  ? '/api/properties/search'
  : 'http://localhost:5050/api/properties/search';

const UserDashboard = () => {
  const [properties, setProperties] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddListingDropdown, setShowAddListingDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 🏆 Professional Search State
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchAnalytics, setSearchAnalytics] = useState(null);
  const [hasPerformedSearch, setHasPerformedSearch] = useState(false);
  
  // Search dropdown states
  const [searchFilters, setSearchFilters] = useState({
    radius: '10', // default to 10 miles
    minPrice: 'any',
    maxPrice: 'any',
    minBeds: 'any',
    maxBeds: 'any',
    propertyType: 'all',
    propertyBuildingType: 'all',
    status: 'all'
  });

  // More Filters dropdown state
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [moreFilters, setMoreFilters] = useState({
    minBathrooms: 'any',
    maxBathrooms: 'any',
    typeOfLet: 'any',
    dateAdded: 'anytime',
    moveInDate: '',
    letAgreed: false,
    hasGarden: false,
    hasParking: false,
    houseShare: false,
    retirementHome: false,
    studentAccommodation: false
  });
  
  // Properties tab dropdown state
  const [showPropertiesDropdown, setShowPropertiesDropdown] = useState(false);
  const [autoCloseTimeout, setAutoCloseTimeout] = useState(null);
  const [tempFilters, setTempFilters] = useState({
    propertyType: 'all',
    status: 'all'
  });
  
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    created_at: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState('');
  
  // Profile tab management state
  // Profile tab state removed - tab is hidden for all users
  
  // Advisor Profile state
  const [advisorProfile, setAdvisorProfile] = useState(null);
  const [isLoadingAdvisorProfile, setIsLoadingAdvisorProfile] = useState(false);
  const [isEditingAdvisor, setIsEditingAdvisor] = useState(false);
  const [isSavingAdvisor, setIsSavingAdvisor] = useState(false);
  const [hasCompletedAdvisorProfile, setHasCompletedAdvisorProfile] = useState(false);
  const [advisorFormData, setAdvisorFormData] = useState({
    advisorType: '',
    companyName: '',
    directorName: '',
    companyLogoUrl: '',
    companyWebsite: '',
    companyEmail: '',
    companyDescription: '',
    fullName: '',
    profilePhotoUrl: '',
    jobTitle: '',
    professionalBio: '',
    contactPhone: '',
    contactEmail: '',
    officeHours: '',
    officeAddress: '',
    officeCity: '',
    officePostcode: '',
    isAdvisor: false
  });
  
  // Expert team editing states
  const [isEditingExpertTeam, setIsEditingExpertTeam] = useState(false);
  const [expertTeamMembers, setExpertTeamMembers] = useState([]);
  const [editingExpert, setEditingExpert] = useState(null);
  const [showAddExpertForm, setShowAddExpertForm] = useState(false);
  const [newExpertData, setNewExpertData] = useState({
    fullName: '',
    jobTitle: '',
    email: '',
    phone: ''
  });
  
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const profileFormRef = useRef(null);
  const navRef = useRef(null);
  const [lastStableCount, setLastStableCount] = useState(0);
  const prevIsSearching = useRef(false);

  // Check if user has completed advisor profile
  const checkAdvisorProfileStatus = useCallback(async () => {
    if (!user || !user.id) return;
    
    try {
      // Fix: Handle string "null" token
      const token = localStorage.getItem('token');
      const validToken = token && token !== 'null' ? token : null;
      
      if (!validToken) return;
      
      const response = await fetch(`/api/users/${user.id}/advisor-profile`, {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHasCompletedAdvisorProfile(data.hasCompletedAdvisorProfile || false);
      } else {
        setHasCompletedAdvisorProfile(false);
      }
    } catch (error) {
      console.error('Error checking advisor profile:', error);
      setHasCompletedAdvisorProfile(false);
    }
  }, [user]);

  // Handle navigation to add listing forms (with advisor profile check)
  const handleAddListingNavigation = useCallback((path, label) => {
    if (!hasCompletedAdvisorProfile) {
      navigate('/advisor-profile');
      setShowAddListingDropdown(false);
      return;
    }
    
    const currentPath = `/dashboard?tab=${activeTab}`;
    navigate(path, { state: { returnPath: currentPath } });
    setShowAddListingDropdown(false);
  }, [hasCompletedAdvisorProfile, activeTab, navigate]);

  // 🔍 CRITICAL FIX: Immediate admin redirect check
  useEffect(() => {
    if (user && user.role && ['admin', 'super_admin'].includes(user.role)) {
      console.log('🚨 ADMIN DETECTED ON USER DASHBOARD - IMMEDIATE REDIRECT');
      console.log('🚨 Admin role:', user.role);
      console.log('🚨 Redirecting to /admin/dashboard');
      navigate('/admin/dashboard', { replace: true });
      return;
    }
  }, [user, navigate]);

  // Check for property update success message
  useEffect(() => {
    const updateSuccess = sessionStorage.getItem('propertyUpdateSuccess');
    const updatedPropertyId = sessionStorage.getItem('updatedPropertyId');
    
    if (updateSuccess === 'true') {
      setUpdateSuccessMessage('🎉 Property updated successfully! Your changes are now live.');
      
      // Clear the flags
      sessionStorage.removeItem('propertyUpdateSuccess');
      sessionStorage.removeItem('updatedPropertyId');
      
      // Clear message after 5 seconds
      setTimeout(() => {
        setUpdateSuccessMessage('');
      }, 5000);
      
      // Refresh dashboard data to show updated status
      loadDashboardData();
    }
  }, []);

  // Add periodic refresh for admin approval status changes
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      // Only refresh if user is on the dashboard and not actively searching
      // AND has a valid token
      const token = localStorage.getItem('token');
      const validToken = token && token !== 'null';
      
      if (!isSearching && activeTab === 'properties' && validToken) {
        loadDashboardData();
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [isSearching, activeTab]);

  // ✅ NEW: Socket.IO real-time updates for user
  useEffect(() => {
    if (user && user.id) {
      // Register user with socket
      socket.emit('register', 'user', user.id);

      // Socket listeners are handled in the main useEffect below
      return () => {
        // Cleanup handled in main useEffect
      };
    }
  }, [user]);

  // Check for tab parameter in URL and set active tab
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    
    if (tabParam === 'properties') {
      setActiveTab('properties');
      // Don't clear the URL parameter - keep it for returnPath functionality
      // window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      const token = localStorage.getItem('token');
      if (token === 'null' || !token) {
        navigate('/login');
        return;
      }
      return;
    }
    
    // 🔍 CRITICAL FIX: Check if user is trying to access admin dashboard
    if (user.role && ['admin', 'super_admin'].includes(user.role)) {
      navigate('/admin/dashboard', { replace: true });
      return;
    }
    
    loadDashboardData();
    checkAdvisorProfileStatus(); // Check if user has completed advisor profile
    setProfileData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      created_at: user?.created_at || ''
    });
  }, [user, navigate, checkAdvisorProfileStatus]);

  // 🔧 SOCKET.IO: Real-time updates for property approval
  useEffect(() => {
    if (!user) return;

    // Listen for property approval notifications
    socket.on('propertyApproved', (property) => {
      // Only update if this property belongs to the current user
      if (property.ownerId === user.id || property.user_id === user.id) {
        // Update the property status in the local state
        setProperties(prevProperties => 
          prevProperties.map(prop => 
            prop.id === property.id 
              ? { ...prop, status: 'approved', approved_at: new Date().toISOString() }
              : prop
          )
        );
        
        // Show success notification
        setUpdateSuccessMessage('🎉 Your property has been approved!');
        setTimeout(() => setUpdateSuccessMessage(''), 5000);
        
        // Refresh dashboard data to get latest stats
        loadDashboardData();
      }
    });

    // Listen for property rejection notifications
    socket.on('propertyRejected', (property) => {
      if (property.ownerId === user.id || property.user_id === user.id) {
        setProperties(prevProperties => 
          prevProperties.map(prop => 
            prop.id === property.id 
              ? { ...prop, status: 'rejected' }
              : prop
          )
        );
        
        setUpdateSuccessMessage('❌ Your property has been rejected. Please check the details and resubmit.');
        setTimeout(() => setUpdateSuccessMessage(''), 5000);
        
        loadDashboardData();
      }
    });

    // Cleanup socket listeners on unmount
    return () => {
      socket.off('propertyApproved');
      socket.off('propertyRejected');
    };
  }, [user]);

  // Refresh data when component gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        loadDashboardData();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  // Handle click outside profile form to cancel editing
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Removed click-outside-to-cancel functionality for better UX
      // Users should explicitly choose to cancel or save
    };

    // Removed the problematic click-outside behavior
    // if (isEditing) {
    //   document.addEventListener('mousedown', handleClickOutside);
    //   return () => document.removeEventListener('mousedown', handleClickOutside);
    // }
  }, [isEditing, user]);

  // Handle click outside add listing dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showAddListingDropdown && !event.target.closest('.add-listing-dropdown-container')) {
        setShowAddListingDropdown(false);
      }
    };

    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showAddListingDropdown) {
        setShowAddListingDropdown(false);
      }
    };

    if (showAddListingDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [showAddListingDropdown]);

  // Handle click outside properties dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!showPropertiesDropdown) return;
      
      // Check if click is outside both the tab container and the dropdown itself
      const isClickInsideTab = event.target.closest('.properties-tab-container');
      const isClickInsideDropdown = event.target.closest('.properties-dropdown');
      
      if (!isClickInsideTab && !isClickInsideDropdown) {
        event.preventDefault();
        event.stopPropagation();
        
        // Reset temporary filters to current applied filters when clicking outside
        setTempFilters({
          propertyType: searchFilters.propertyType,
          status: searchFilters.status
        });
        setShowPropertiesDropdown(false);
        
        // Clear any existing timeout
        if (autoCloseTimeout) {
          clearTimeout(autoCloseTimeout);
          setAutoCloseTimeout(null);
        }
      }
    };

    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showPropertiesDropdown) {
        // Reset temporary filters to current applied filters when pressing Escape
        setTempFilters({
          propertyType: searchFilters.propertyType,
          status: searchFilters.status
        });
        setShowPropertiesDropdown(false);
        // Clear any existing timeout
        if (autoCloseTimeout) {
          clearTimeout(autoCloseTimeout);
          setAutoCloseTimeout(null);
        }
      }
    };

    if (showPropertiesDropdown) {
      document.addEventListener('mousedown', handleClickOutside, true);
      document.addEventListener('click', handleClickOutside, true);
      document.addEventListener('keydown', handleEscKey);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
        document.removeEventListener('click', handleClickOutside, true);
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [showPropertiesDropdown, autoCloseTimeout, searchFilters]);

  // Handle click outside More Filters dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMoreFilters && !event.target.closest('.dashboard-more-filters-container')) {
        setShowMoreFilters(false);
      }
    };

    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showMoreFilters) {
        setShowMoreFilters(false);
      }
    };

    if (showMoreFilters) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [showMoreFilters]);

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimeout) {
        clearTimeout(autoCloseTimeout);
      }
    };
  }, [autoCloseTimeout]);

  // Load dashboard data when component mounts or activeTab changes
  useEffect(() => {
    if (activeTab === 'properties') {
      loadDashboardData();
    }
    // Close dropdown when switching away from properties tab
    if (activeTab !== 'properties') {
      // Clear any existing timeout
      if (autoCloseTimeout) {
        clearTimeout(autoCloseTimeout);
        setAutoCloseTimeout(null);
      }
      setShowPropertiesDropdown(false);
    }
  }, [activeTab, autoCloseTimeout]);

  // Profile tab management removed - tab is hidden for all users

  // Fetch advisor profile when advisor-profile tab is active
  useEffect(() => {
    if (activeTab === 'advisor-profile' && user && user.id) {
      fetchAdvisorProfile();
    }
  }, [activeTab, user]);

  // Profile tab management removed - tab is hidden for all users

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fix: Handle string "null" token
      const token = localStorage.getItem('token');
      const validToken = token && token !== 'null' ? token : null;
      
      if (!validToken) {
        // Clear invalid data and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('loginTime');
        navigate('/login');
        return;
      }
      
      const propertiesResponse = await fetch('/api/properties/my-properties', {
        headers: {
          'Authorization': `Bearer ${validToken}`
        }
      });
      
      if (propertiesResponse.ok) {
        const propertiesData = await propertiesResponse.json();
        
        if (propertiesData.properties && propertiesData.properties.length > 0) {
          // ✅ CRITICAL FIX: Only update properties if we have valid data
          setProperties(propertiesData.properties);
        } else if (properties.length === 0) {
          // Only set empty array if we don't have any properties loaded yet
          setProperties([]);
        }
        // ✅ CRITICAL FIX: If we have existing properties and get 0 from API, don't update (prevents flickering)
        // This prevents the freezing issue where properties disappear after admin approval
        
        const userStats = calculateStats(propertiesData.properties || []);
        setStats(userStats);
      } else {
        if (propertiesResponse.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('loginTime');
          navigate('/login');
        }
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // ✅ CRITICAL FIX: Don't clear properties on error to prevent flickering
      // Set a timeout to retry loading after 5 seconds
      setTimeout(() => {
        if (activeTab === 'properties') {
          loadDashboardData();
        }
      }, 5000);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (properties) => {
    return {
      total: properties.length,
      pending: properties.filter(p => p.status === 'pending').length,
      approved: properties.filter(p => p.status === 'approved').length,
      rejected: properties.filter(p => p.status === 'rejected').length,
    };
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Profile tab functions removed - tab is hidden for all users

  const handleProfileSave = async () => {
    console.log('🔥 SAVE BUTTON CLICKED - Function started!');
    
    try {
      console.log('🔍 Starting profile save...');
      console.log('Profile data to save:', {
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        phone: profileData.phone
      });
      
      // Check if user is authenticated
      const token = localStorage.getItem('token');
      console.log('🔑 JWT Token exists:', !!token);
      
      if (!token) {
        console.log('❌ No authentication token found!');
        setSaveMessage({ 
          type: 'error', 
          text: 'Authentication error. Please log in again.' 
        });
        return;
      }
      
      setIsSaving(true);
      setSaveMessage({ type: '', text: '' });
      
      const requestBody = {
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        phone: profileData.phone
      };
      
      console.log('📤 Sending request with data:', requestBody);
      
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📥 Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Success response:', result);
        
        // Update local profile data with the server response
        const updatedProfileData = {
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          email: result.user.email,
          phone: result.user.phone || '',
          created_at: profileData.created_at
        };
        
        console.log('🔄 Updating local profile data:', updatedProfileData);
        setProfileData(updatedProfileData);
        
        // Update the user context with the new data
        console.log('🔄 Updating user context...');
        const userUpdateSuccess = updateUser({
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          phone: result.user.phone
        });
        
        if (userUpdateSuccess) {
          console.log('✅ User context updated successfully');
        } else {
          console.log('❌ Failed to update user context');
        }
        
        // Exit editing mode
        setIsEditing(false);
        
        // Show success message
        setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });
        
        // Clear success message after 4 seconds
        setTimeout(() => {
          setSaveMessage({ type: '', text: '' });
        }, 4000);
        
      } else {
        const errorData = await response.json().catch(() => null);
        console.log('❌ Error response status:', response.status);
        console.log('❌ Error response data:', errorData);
        
        let errorMessage = 'Failed to update profile. Please try again.';
        
        if (response.status === 401) {
          errorMessage = 'Session expired. Please log in again.';
          setTimeout(() => {
            localStorage.removeItem('token');
            navigate('/login');
          }, 2000);
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please log in again.';
        } else if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
        
        setSaveMessage({ type: 'error', text: errorMessage });
      }
    } catch (error) {
      console.error('❌ Network/JavaScript error:', error);
      console.error('❌ Error stack:', error.stack);
      setSaveMessage({ 
        type: 'error', 
        text: 'Network error. Please check your connection and try again.' 
      });
    } finally {
      console.log('🏁 Finally block - setting isSaving to false');
      setIsSaving(false);
    }
  };

  const formatPrice = (property) => {
    if (property.category === 'sale' && property.price) {
      return `$${Number(property.price).toLocaleString()}`;
    } else if (property.monthly_rent) {
      return `$${Number(property.monthly_rent).toLocaleString()}/month`;
    }
    return 'Price not set';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // State for radius filtering
  const [radiusFilteredProperties, setRadiusFilteredProperties] = useState([]);
  const [isRadiusFiltering, setIsRadiusFiltering] = useState(false);

  // Apply location filtering when search query or radius changes
  useEffect(() => {
    const applyLocationFilter = () => {
      // First apply ONLY category filter for location filtering (status will be applied later)
      let categoryFilteredProperties = properties.filter(property => {
        // Only apply category filter here - status filter will be applied later
        const categoryMatch = searchFilters.propertyType === 'all' || property.category === searchFilters.propertyType;
        return categoryMatch;
      });

      // If no search query, use category filtered properties (status will be applied later)
      if (!searchQuery || !searchQuery.trim()) {
        setRadiusFilteredProperties(categoryFilteredProperties);
        setIsRadiusFiltering(false);
        return;
      }

      // Show loading for search UX
      setIsRadiusFiltering(true);
      
      // Use fast dashboard search (no external API calls!)
      const radius = searchFilters.radius || '10';
      const locationFiltered = filterDashboardProperties(categoryFilteredProperties, searchQuery, radius);
      setRadiusFilteredProperties(locationFiltered);
      
      // Hide loading after search completes
      setTimeout(() => setIsRadiusFiltering(false), 100);
    };

    // For category/status changes: Apply immediately (no debounce)
    // For search text changes: Apply with proper debounce to wait for user to finish typing
    const isTextSearch = searchQuery && searchQuery.trim();
    const debounceTime = isTextSearch ? 500 : 0; // Wait 500ms for user to finish typing

    const timeoutId = setTimeout(() => {
      applyLocationFilter();
    }, debounceTime);

    return () => clearTimeout(timeoutId);
  }, [properties, searchQuery, searchFilters.radius, searchFilters.propertyType, searchFilters.status]);

  // UNIFIED FILTERING LOGIC: Apply all sidebar and search filters consistently
  // This ensures status filtering works for BOTH search results and regular properties
  let propertiesForFiltering;
  if (hasPerformedSearch) {
    // Using professional search results when user has performed a search
    propertiesForFiltering = searchResults;
    console.log('🔍 Using professional search results for status filtering:', searchResults.length, 'properties');
  } else {
    // Using normal filtered properties when no search has been performed
    propertiesForFiltering = radiusFilteredProperties;
    console.log('🏠 Using normal filtered properties for status filtering:', radiusFilteredProperties.length, 'properties');
  }
  
  const filteredProperties = propertiesForFiltering.filter(property => {
    // CRITICAL: Apply status filter here for BOTH search results and regular properties
    const statusMatch = searchFilters.status === 'all' || property.status === searchFilters.status;
    
    // Category filter (already applied for regular properties, but needed for search results)
    const categoryMatch = searchFilters.propertyType === 'all' || property.category === searchFilters.propertyType;
    
    // Property building type (flat/house/detached) filter
    const propertyTypeMatch = searchFilters.propertyBuildingType === 'all' || property.property_type === searchFilters.propertyBuildingType;
    
    // Monthly rent price filters (for rental properties)
    let minPriceMatch = true;
    let maxPriceMatch = true;
    
    if (property.category === 'rent') {
      const monthlyRent = property.monthly_rent || property.monthlyRent || 0;
      minPriceMatch = searchFilters.minPrice === 'any' || monthlyRent >= parseInt(searchFilters.minPrice);
      maxPriceMatch = searchFilters.maxPrice === 'any' || monthlyRent <= parseInt(searchFilters.maxPrice);
    } else {
      // For sale/lease properties, use the original price field
      minPriceMatch = searchFilters.minPrice === 'any' || property.price >= parseInt(searchFilters.minPrice);
      maxPriceMatch = searchFilters.maxPrice === 'any' || property.price <= parseInt(searchFilters.maxPrice);
    }
    
    // Bedroom filters
    const minBedsMatch = searchFilters.minBeds === 'any' || property.bedrooms >= parseInt(searchFilters.minBeds);
    const maxBedsMatch = searchFilters.maxBeds === 'any' || property.bedrooms <= parseInt(searchFilters.maxBeds);
    
    // More Filters - Bathroom filters
    const minBathMatch = moreFilters.minBathrooms === 'any' || property.bathrooms >= parseInt(moreFilters.minBathrooms);
    const maxBathMatch = moreFilters.maxBathrooms === 'any' || property.bathrooms <= parseInt(moreFilters.maxBathrooms);
    
    // More Filters - Property features
    const gardenMatch = !moreFilters.hasGarden || property.has_garden;
    const parkingMatch = !moreFilters.hasParking || property.has_garage || property.parking_spaces > 0;
    const studentMatch = !moreFilters.studentAccommodation || property.student_housing;
    const houseShareMatch = !moreFilters.houseShare || property.property_type === 'house-share';
    const retirementMatch = !moreFilters.retirementHome || property.property_type === 'retirement-home';
    
    // More Filters - Type of Let
    const typeOfLetMatch = moreFilters.typeOfLet === 'any' || 
      (moreFilters.typeOfLet === 'long-term' && property.lease_term >= 12) ||
      (moreFilters.typeOfLet === 'short-term' && property.lease_term < 12);
    
    // More Filters - Date Added
    let dateAddedMatch = true;
    if (moreFilters.dateAdded !== 'anytime' && property.created_at) {
      const propertyDate = new Date(property.created_at);
      const now = new Date();
      const daysDiff = Math.floor((now - propertyDate) / (1000 * 60 * 60 * 24));
      
      switch (moreFilters.dateAdded) {
        case '3days':
          dateAddedMatch = daysDiff <= 3;
          break;
        case '7days':
          dateAddedMatch = daysDiff <= 7;
          break;
        case '14days':
          dateAddedMatch = daysDiff <= 14;
          break;
        default:
          dateAddedMatch = true;
      }
    }
    
    // More Filters - Move in Date
    let moveInDateMatch = true;
    if (moreFilters.moveInDate && property.availability_date) {
      const moveInDate = new Date(moreFilters.moveInDate);
      const availableDate = new Date(property.availability_date);
      moveInDateMatch = availableDate <= moveInDate;
    }
    
    return categoryMatch && statusMatch && propertyTypeMatch && minPriceMatch && maxPriceMatch && 
           minBedsMatch && maxBedsMatch && minBathMatch && maxBathMatch && 
           gardenMatch && parkingMatch && studentMatch && houseShareMatch && retirementMatch &&
           typeOfLetMatch && dateAddedMatch && moveInDateMatch;
  });

  // 🔍 DEBUG: Track status filtering results
  console.log(`🔍 Status Filter Debug:`, {
    currentStatusFilter: searchFilters.status,
    propertiesBeforeStatusFilter: propertiesForFiltering.length,
    propertiesAfterStatusFilter: filteredProperties.length,
    hasPerformedSearch: hasPerformedSearch,
    statusFilterActive: searchFilters.status !== 'all'
  });

  // 🔍 ADDITIONAL DEBUG: Track individual property filtering
  if (propertiesForFiltering.length > 0 && filteredProperties.length === 0) {
    console.log('🔍 PROPERTY FILTERING DEBUG - Properties being filtered out:');
    propertiesForFiltering.slice(0, 3).forEach((property, index) => {
      const statusMatch = searchFilters.status === 'all' || property.status === searchFilters.status;
      const categoryMatch = searchFilters.propertyType === 'all' || property.category === searchFilters.propertyType;
      const propertyTypeMatch = searchFilters.propertyBuildingType === 'all' || property.property_type === searchFilters.propertyBuildingType;
      
      console.log(`Property ${index + 1}:`, {
        id: property.id,
        title: property.title,
        status: property.status,
        category: property.category,
        property_type: property.property_type,
        statusMatch,
        categoryMatch,
        propertyTypeMatch,
        searchFilters: {
          status: searchFilters.status,
          propertyType: searchFilters.propertyType,
          propertyBuildingType: searchFilters.propertyBuildingType
        }
      });
    });
  }

  // Dropdown options for search filters
  const radiusOptions = [
    { value: '0.25', label: 'Within 1/4 mile' },
    { value: '0.5', label: 'Within 1/2 mile' },
    { value: '1', label: 'Within 1 mile' },
    { value: '2', label: 'Within 2 miles' },
    { value: '3', label: 'Within 3 miles' },
    { value: '5', label: 'Within 5 miles' },
    { value: '10', label: 'Within 10 miles' },
    { value: '15', label: 'Within 15 miles' },
    { value: '20', label: 'Within 20 miles' },
    { value: '25', label: 'Within 25 miles' },
    { value: '30', label: 'Within 30 miles' }
  ];

  // Price options for monthly rent (rental properties)
  const priceOptions = {
    min: [
      { value: 'any', label: 'Min Rent' },
      { value: '500', label: '£500 pcm' },
      { value: '600', label: '£600 pcm' },
      { value: '700', label: '£700 pcm' },
      { value: '800', label: '£800 pcm' },
      { value: '900', label: '£900 pcm' },
      { value: '1000', label: '£1,000 pcm' },
      { value: '1100', label: '£1,100 pcm' },
      { value: '1200', label: '£1,200 pcm' },
      { value: '1300', label: '£1,300 pcm' },
      { value: '1400', label: '£1,400 pcm' },
      { value: '1500', label: '£1,500 pcm' },
      { value: '1750', label: '£1,750 pcm' },
      { value: '2000', label: '£2,000 pcm' },
      { value: '2250', label: '£2,250 pcm' },
      { value: '2500', label: '£2,500 pcm' },
      { value: '2750', label: '£2,750 pcm' },
      { value: '3000', label: '£3,000 pcm' },
      { value: '3500', label: '£3,500 pcm' },
      { value: '4000', label: '£4,000 pcm' },
      { value: '4500', label: '£4,500 pcm' },
      { value: '5000', label: '£5,000 pcm' },
      { value: '6000', label: '£6,000 pcm' },
      { value: '7000', label: '£7,000 pcm' },
      { value: '8000', label: '£8,000 pcm' },
      { value: '10000', label: '£10,000 pcm' },
      { value: '15000', label: '£15,000 pcm' }
    ],
    max: [
      { value: 'any', label: 'Max Rent' },
      { value: '500', label: '£500 pcm' },
      { value: '600', label: '£600 pcm' },
      { value: '700', label: '£700 pcm' },
      { value: '800', label: '£800 pcm' },
      { value: '900', label: '£900 pcm' },
      { value: '1000', label: '£1,000 pcm' },
      { value: '1100', label: '£1,100 pcm' },
      { value: '1200', label: '£1,200 pcm' },
      { value: '1300', label: '£1,300 pcm' },
      { value: '1400', label: '£1,400 pcm' },
      { value: '1500', label: '£1,500 pcm' },
      { value: '1750', label: '£1,750 pcm' },
      { value: '2000', label: '£2,000 pcm' },
      { value: '2250', label: '£2,250 pcm' },
      { value: '2500', label: '£2,500 pcm' },
      { value: '2750', label: '£2,750 pcm' },
      { value: '3000', label: '£3,000 pcm' },
      { value: '3500', label: '£3,500 pcm' },
      { value: '4000', label: '£4,000 pcm' },
      { value: '4500', label: '£4,500 pcm' },
      { value: '5000', label: '£5,000 pcm' },
      { value: '6000', label: '£6,000 pcm' },
      { value: '7000', label: '£7,000 pcm' },
      { value: '8000', label: '£8,000 pcm' },
      { value: '10000', label: '£10,000 pcm' },
      { value: '15000', label: '£15,000 pcm' }
    ]
  };

  const bedroomOptions = {
    min: [
      { value: 'any', label: 'Min Beds' },
      { value: '0', label: 'Studio' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: '6', label: '6' },
      { value: '7', label: '7' },
      { value: '8', label: '8' },
      { value: '9', label: '9' },
      { value: '10', label: '10' },
      { value: '11', label: '11' },
      { value: '12', label: '12' },
      { value: '13', label: '13' },
      { value: '14', label: '14' },
      { value: '15', label: '15' },
      { value: '16', label: '16' },
      { value: '17', label: '17' },
      { value: '18', label: '18' },
      { value: '19', label: '19' },
      { value: '20', label: '20' }
    ],
    max: [
      { value: 'any', label: 'Max Beds' },
      { value: '0', label: 'Studio' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: '6', label: '6' },
      { value: '7', label: '7' },
      { value: '8', label: '8' },
      { value: '9', label: '9' },
      { value: '10', label: '10' },
      { value: '11', label: '11' },
      { value: '12', label: '12' },
      { value: '13', label: '13' },
      { value: '14', label: '14' },
      { value: '15', label: '15' },
      { value: '16', label: '16' },
      { value: '17', label: '17' },
      { value: '18', label: '18' },
      { value: '19', label: '19' },
      { value: '20', label: '20' }
    ]
  };

  const propertyBuildingTypeOptions = [
    { value: 'all', label: 'Property Types' },
    { value: 'detached', label: 'Detached' },
    { value: 'semi-detached', label: 'Semi-Detached' },
    { value: 'terraced', label: 'Terraced' },
    { value: 'flat', label: 'Flat' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'studio', label: 'Studio' },
    { value: 'duplex', label: 'Duplex' },
    { value: 'maisonette', label: 'Maisonette' },
    { value: 'bungalow', label: 'Bungalow' },
    { value: 'cottage', label: 'Cottage' },
    { value: 'townhouse', label: 'Townhouse' },
    { value: 'penthouse', label: 'Penthouse' },
    { value: 'land', label: 'Land' },
    { value: 'park-home', label: 'Park Home' },
    { value: 'mobile-home', label: 'Mobile Home' },
    { value: 'student-halls', label: 'Student Halls' },
    { value: 'house-share', label: 'House Share' },
    { value: 'retirement-home', label: 'Retirement Home' },
    { value: 'commercial', label: 'Commercial Property' },
    { value: 'office', label: 'Office Space' },
    { value: 'retail', label: 'Retail Space' },
    { value: 'warehouse', label: 'Warehouse' }
  ];

  const propertyTypeOptions = [
    { value: 'all', label: 'All Categories' },
    { value: 'rent', label: 'For Rent' },
    { value: 'sale', label: 'For Sale' },
    { value: 'lease', label: 'For Lease' }
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Needs Updates' }
  ];

  // More Filters Options
  const bathroomOptions = {
    min: [
      { value: 'any', label: 'Min Bath' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: '6', label: '6' },
      { value: '7', label: '7' },
      { value: '8', label: '8' },
      { value: '9', label: '+9' }
    ],
    max: [
      { value: 'any', label: 'Max Bath' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: '6', label: '6' },
      { value: '7', label: '7' },
      { value: '8', label: '8' },
      { value: '9', label: '+9' }
    ]
  };

  const typeOfLetOptions = [
    { value: 'any', label: 'Any' },
    { value: 'long-term', label: 'Long Term' },
    { value: 'short-term', label: 'Short Term' },
    { value: 'holiday', label: 'Holiday Let' },
    { value: 'commercial', label: 'Commercial' }
  ];

  const furnishedOptions = [
    { value: 'any', label: 'Any' },
    { value: 'furnished', label: 'Furnished' },
    { value: 'unfurnished', label: 'Unfurnished' },
    { value: 'part-furnished', label: 'Part Furnished' }
  ];

  const booleanOptions = [
    { value: 'any', label: 'Any' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' }
  ];

  const squareFeetOptions = {
    min: [
      { value: '', label: 'Min Sq Ft' },
      { value: '500', label: '500+ sq ft' },
      { value: '750', label: '750+ sq ft' },
      { value: '1000', label: '1,000+ sq ft' },
      { value: '1250', label: '1,250+ sq ft' },
      { value: '1500', label: '1,500+ sq ft' },
      { value: '2000', label: '2,000+ sq ft' },
      { value: '2500', label: '2,500+ sq ft' },
      { value: '3000', label: '3,000+ sq ft' }
    ],
    max: [
      { value: '', label: 'Max Sq Ft' },
      { value: '750', label: 'Up to 750 sq ft' },
      { value: '1000', label: 'Up to 1,000 sq ft' },
      { value: '1250', label: 'Up to 1,250 sq ft' },
      { value: '1500', label: 'Up to 1,500 sq ft' },
      { value: '2000', label: 'Up to 2,000 sq ft' },
      { value: '2500', label: 'Up to 2,500 sq ft' },
      { value: '3000', label: 'Up to 3,000 sq ft' },
      { value: '5000', label: 'Up to 5,000 sq ft' }
    ]
  };

  const yearBuiltOptions = {
    from: [
      { value: '', label: 'Built From' },
      { value: '2020', label: '2020+' },
      { value: '2010', label: '2010+' },
      { value: '2000', label: '2000+' },
      { value: '1990', label: '1990+' },
      { value: '1980', label: '1980+' },
      { value: '1970', label: '1970+' },
      { value: '1960', label: '1960+' },
      { value: '1950', label: '1950+' }
    ],
    to: [
      { value: '', label: 'Built To' },
      { value: '2024', label: 'Up to 2024' },
      { value: '2020', label: 'Up to 2020' },
      { value: '2010', label: 'Up to 2010' },
      { value: '2000', label: 'Up to 2000' },
      { value: '1990', label: 'Up to 1990' },
      { value: '1980', label: 'Up to 1980' },
      { value: '1970', label: 'Up to 1970' },
      { value: '1960', label: 'Up to 1960' }
    ]
  };

  // Image Carousel Component
  const ImageCarousel = ({ images, title }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    if (!images || images.length === 0) {
      return (
        <div className="property-images">
          <div className="no-image-modern">
            <i className="fas fa-home"></i>
            <span>No Images Available</span>
          </div>
        </div>
      );
    }

    const nextImage = () => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = () => {
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    return (
      <div className="property-images">
        <div className="image-carousel">
          {images.map((image, index) => (
            <img
              key={index}
              src={image.url}
              alt={`${title} - Image ${index + 1}`}
              className={`carousel-image ${index === currentImageIndex ? 'active' : ''}`}
            />
          ))}
          
          {images.length > 1 && (
            <>
              <button className="carousel-controls carousel-prev" onClick={prevImage}>
                <i className="fas fa-chevron-left"></i>
              </button>
              <button className="carousel-controls carousel-next" onClick={nextImage}>
                <i className="fas fa-chevron-right"></i>
              </button>
              
              <div className="carousel-indicators">
                {images.map((_, index) => (
                  <div
                    key={index}
                    className={`carousel-dot ${index === currentImageIndex ? 'active' : ''}`}
                    onClick={() => goToImage(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Professional Stats Card
  const StatCard = ({ title, value, icon, color, trend }) => (
    <div className={`stat-card-modern ${color} fade-in`}>
      <div className="stat-header">
        <div className="stat-content-modern">
          <h3>{value}</h3>
          <p>{title}</p>
          {trend && (
            <div className="stat-trend">
              <i className="fas fa-arrow-up"></i>
              <span>{trend}</span>
            </div>
          )}
        </div>
        <div className="stat-icon-modern">
          <i className={`fas ${icon}`}></i>
        </div>
      </div>
    </div>
  );

  // Function to refresh user profile data from server
  const refreshUserProfile = async () => {
    try {
      const response = await fetch('/api/auth/verify-token', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Fresh user data received:', result.user);
        
        // Update the user context with fresh data
        updateUser(result.user);
        
        // Update local profile state with fresh data
        setProfileData({
          first_name: result.user.first_name || '',
          last_name: result.user.last_name || '',
          email: result.user.email || '',
          phone: result.user.phone || '',
          created_at: result.user.created_at || ''
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error refreshing user profile:', error);
      return false;
    }
  };

  // Profile tab management function removed - tab is hidden for all users

  // Profile tab data population function removed - tab is hidden for all users

  // Fetch advisor profile for editing
  const fetchAdvisorProfile = async () => {
    try {
      setIsLoadingAdvisorProfile(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`/api/users/${user.id}/advisor-profile/edit`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.advisorProfile) {
          console.log('✅ Existing advisor profile found:', result.advisorProfile);
          console.log('👥 Expert team data received:', {
            has_experts: !!result.advisorProfile.experts,
            experts_count: result.advisorProfile.experts?.length || 0,
            experts_data: result.advisorProfile.experts
          });
          setAdvisorProfile(result.advisorProfile);
          setExpertTeamMembers(result.advisorProfile.experts || []);
          
          // Load existing data into form
          const profile = result.advisorProfile;
          setAdvisorFormData({
            advisorType: profile.advisor_type || '',
            companyName: profile.company_name || '',
            directorName: profile.director_name || '',
            companyLogoUrl: profile.company_logo_url || '',
            companyWebsite: profile.company_website || '',
            companyEmail: profile.company_email || '',
            companyDescription: profile.company_description || '',
            fullName: profile.full_name || '',
            profilePhotoUrl: profile.profile_photo_url || '',
            jobTitle: profile.job_title || '',
            professionalBio: profile.professional_bio || '',
            contactPhone: profile.contact_phone || '',
            officeHours: profile.office_hours || '',
            officeAddress: profile.office_address || '',
            officeCity: profile.office_city || '',
            officePostcode: profile.office_postcode || '',
            isAdvisor: profile.is_advisor || false
          });
        } else {
          console.log('❌ No existing advisor profile found');
          setAdvisorProfile(null);
          setExpertTeamMembers([]);
        }
      } else {
        console.error('❌ Error fetching advisor profile:', response.status);
        setAdvisorProfile(null);
        setExpertTeamMembers([]);
      }
    } catch (error) {
      console.error('❌ Error checking existing profile:', error);
      setAdvisorProfile(null);
      setExpertTeamMembers([]);
    } finally {
      setIsLoadingAdvisorProfile(false);
    }
  };

  // Handle advisor profile save
  const handleAdvisorProfileSave = async () => {
    console.log('🔥 SAVE BUTTON CLICKED - Function started!');
    console.log('👥 Current expertTeamMembers state:', expertTeamMembers);
    console.log('👥 expertTeamMembers length:', expertTeamMembers?.length);
    console.log('👥 expertTeamMembers type:', typeof expertTeamMembers);
    
    try {
      console.log('🔍 Starting advisor profile save...');
      console.log('Advisor profile data to save:', advisorFormData);
      
      // Check if user is authenticated
      const token = localStorage.getItem('token');
      console.log('🔑 JWT Token exists:', !!token);
      
      if (!token) {
        console.log('❌ No authentication token found!');
        setSaveMessage({ 
          type: 'error', 
          text: 'Authentication error. Please log in again.' 
        });
        return;
      }
      
      setIsSavingAdvisor(true);
      setSaveMessage({ type: '', text: '' });
      
      // Create FormData for file uploads
      const submitData = new FormData();
      
      // Add form data
      Object.keys(advisorFormData).forEach(key => {
        if (key === 'isAdvisor') {
          submitData.append(key, advisorFormData[key]);
        } else {
          submitData.append(key, advisorFormData[key]);
        }
      });

      // Add expert team members data
      if (expertTeamMembers && expertTeamMembers.length > 0) {
        console.log('👥 Adding expert team members to submission:', expertTeamMembers);
        submitData.append('expertTeam', JSON.stringify(expertTeamMembers));
      } else {
        console.log('👥 No expert team members to add');
        submitData.append('expertTeam', JSON.stringify([]));
      }

      console.log('📤 Sending request with data:', advisorFormData);
      console.log('👥 Expert team members being sent:', expertTeamMembers);
      
      const response = await fetch(`/api/users/${user.id}/advisor-profile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: submitData
      });

      console.log('📥 Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Success response:', result);
        
        // Refresh advisor profile data
        await fetchAdvisorProfile();
        
        // Exit editing mode
        setIsEditingAdvisor(false);
        
        // Show success message
        setSaveMessage({ type: 'success', text: 'Advisor profile updated successfully!' });
        
        // Trigger advisor profile change event to update tab visibility
        window.dispatchEvent(new Event('advisorProfileUpdated'));
        
        // Clear success message after 4 seconds
        setTimeout(() => {
          setSaveMessage({ type: '', text: '' });
        }, 4000);
        
      } else {
        const errorData = await response.json().catch(() => null);
        console.log('❌ Error response status:', response.status);
        console.log('❌ Error response data:', errorData);
        
        let errorMessage = 'Failed to update advisor profile. Please try again.';
        
        if (response.status === 401) {
          errorMessage = 'Session expired. Please log in again.';
          setTimeout(() => {
            localStorage.removeItem('token');
            navigate('/login');
          }, 2000);
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please log in again.';
        } else if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
        
        setSaveMessage({ type: 'error', text: errorMessage });
      }
    } catch (error) {
      console.error('❌ Network/JavaScript error:', error);
      console.error('❌ Error stack:', error.stack);
      setSaveMessage({ 
        type: 'error', 
        text: 'Network error. Please check your connection and try again.' 
      });
    } finally {
      console.log('🏁 Finally block - setting isSaving to false');
      setIsSavingAdvisor(false);
    }
  };

  // Handle property deletion callback
  const handlePropertyDeleted = (deletedPropertyId, propertyTitle) => {
    setProperties(prevProperties => 
      prevProperties.filter(property => property.id !== deletedPropertyId)
    );
    
    // Show a subtle success message
    console.log(`✅ Property "${propertyTitle}" deleted successfully`);
    
    // Refresh data to update stats
    loadDashboardData();
  };

  // Custom handler for sidebar filter changes
  const handleSidebarFilterChange = (filterType, value) => {
    console.log(`🔄 Filter change: ${filterType} = ${value}`);
    
    // Update the filter immediately
    const newFilters = { ...searchFilters, [filterType]: value };
    setSearchFilters(newFilters);
    
    // If switching away from "rent" category, clear professional search results IMMEDIATELY
    if (filterType === 'propertyType' && value !== 'rent' && hasPerformedSearch) {
      console.log('🔄 Switching away from "For Rent" - clearing professional search results');
      setHasPerformedSearch(false);
      setSearchResults([]);
      setSearchAnalytics(null);
      setSearchQuery(''); // Clear search input when changing categories
      setIsSearching(false);
    }
    
    // If switching to "All" categories, reset professional search filters
    // NOTE: Status changes should NOT clear search input - user wants to filter search results by status
    if (filterType === 'propertyType' && value === 'all') {
      
      console.log('🔄 Resetting to "All Categories" - clearing search and filters');
      
      // Clear all search states
      setHasPerformedSearch(false);
      setSearchResults([]);
      setSearchAnalytics(null);
      setSearchQuery(''); // Clear search input when changing to "All Categories"
      setIsSearching(false);
      
      // Reset professional search filters
      setSearchFilters({
        ...newFilters,
        radius: '10',
        minPrice: 'any',
        maxPrice: 'any',
        minBeds: 'any',
        maxBeds: 'any',
        propertyBuildingType: 'all'
      });
      
      // Also reset more filters
      setMoreFilters({
        minBathrooms: 'any',
        maxBathrooms: 'any',
        typeOfLet: 'any',
        dateAdded: 'anytime',
        moveInDate: '',
        letAgreed: false,
        hasGarden: false,
        hasParking: false,
        houseShare: false,
        retirementHome: false,
        studentAccommodation: false
      });
    }
  };

  // 🏆 Professional Search Handler (like top property websites)
  const handleProfessionalSearch = useCallback(async (query, filters) => {
    if (!query || !query.trim()) {
      console.log('🏆 Professional Search: Empty query, skipping search');
      return;
    }

    setIsSearching(true);
    setHasPerformedSearch(true);
    
    console.log(`🏆 Professional Search: Starting search for "${query}"`);
    console.log('🏆 Search filters:', filters);

    try {
      // Build professional search parameters for user dashboard
      // NOTE: Only send search query + user context, apply sidebar filters on frontend
      const searchParams = new URLSearchParams({
        q: query.trim(),
        limit: '50', // Get more results for dashboard
        page: '1',
        show_all_statuses: 'true', // Get ALL user properties regardless of status
        user_id: user.id, // Include user ID to search only user's properties
        status: 'all' // Always get all statuses, filter on frontend
      });

      // 🏷️ CRITICAL: Add category filter to backend search
      // This ensures radius filtering is applied only to properties of the selected category
      if (filters.propertyType && filters.propertyType !== 'all') {
        searchParams.append('category', filters.propertyType);
        console.log(`🏷️ Including category filter: ${filters.propertyType}`);
      }

      // Add CRITICAL search-related filters that affect results
      if (filters.radius && filters.radius !== 'any') {
        searchParams.append('radius', filters.radius);
        console.log(`📏 Including radius for mixed search: ${filters.radius} miles`);
      }
      
      // Add price and bedroom filters as they affect search relevance
      if (filters.minPrice && filters.minPrice !== 'any') {
        searchParams.append('min_price', filters.minPrice);
      }
      if (filters.maxPrice && filters.maxPrice !== 'any') {
        searchParams.append('max_price', filters.maxPrice);
      }
      if (filters.minBeds && filters.minBeds !== 'any') {
        searchParams.append('bedrooms_min', filters.minBeds);
      }
      if (filters.maxBeds && filters.maxBeds !== 'any') {
        searchParams.append('bedrooms_max', filters.maxBeds);
      }
      if (filters.propertyBuildingType && filters.propertyBuildingType !== 'all') {
        searchParams.append('property_type', filters.propertyBuildingType);
      }
      
      // Note: Sidebar filters (status, category, price, beds, property type) will be applied on frontend
      console.log(`🔍 Professional Search: Getting all results for "${query}", will apply sidebar filters on frontend`);
      console.log(`📊 Current sidebar filters to apply locally:`, {
        status: filters.status,
        propertyType: filters.propertyType,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minBeds: filters.minBeds,
        maxBeds: filters.maxBeds,
        propertyBuildingType: filters.propertyBuildingType
      });

      const searchUrl = `${PROFESSIONAL_SEARCH_API}?${searchParams}`;
      console.log('🏆 Professional Search URL:', searchUrl);

      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🏆 Professional Search Results:', data);

      if (data.success) {
        // Update search results
        setSearchResults(data.properties || []);
        setSearchAnalytics(data.searchInfo || null);
        
        console.log(`🏆 Professional Search: Found ${data.properties?.length || 0} properties`);
        
        if (data.searchInfo) {
          console.log('🏆 Search Analytics:', data.searchInfo);
          
          // Log search strategy information
          if (data.searchInfo.inputAnalysis) {
            console.log(`🔍 Search Strategy: ${data.searchInfo.searchStrategy}`);
            console.log(`📍 Input Analysis:`, data.searchInfo.inputAnalysis);
          }
        }
      } else {
        console.error('🏆 Professional Search: Server returned error:', data.error);
        setSearchResults([]);
        setSearchAnalytics(null);
      }

    } catch (error) {
      console.error('🏆 Professional Search Error:', error);
      setSearchResults([]);
      setSearchAnalytics(null);
      
      // Show user-friendly error
      alert(`Search failed: ${error.message}. Please try again.`);
    } finally {
      setIsSearching(false);
    }
  }, []); // Empty dependency array since function doesn't depend on any state

  // 🔄 Auto-trigger search when filters change (radius, price, etc.) - but only if we have a search query
  useEffect(() => {
    if (searchQuery.trim() && hasPerformedSearch && !isSearching) {
      console.log('🔄 Filter changed, re-running search for:', searchQuery);
      console.log('🔄 With filters:', {
        radius: searchFilters.radius,
        propertyType: searchFilters.propertyType,
        minPrice: searchFilters.minPrice,
        maxPrice: searchFilters.maxPrice
      });
      handleProfessionalSearch(searchQuery, searchFilters);
    } else {
      console.log('🔄 Filter change ignored:', {
        hasQuery: searchQuery.trim() !== '',
        hasPerformedSearch,
        isSearching,
        willTrigger: searchQuery.trim() && hasPerformedSearch && !isSearching
      });
    }
  }, [searchFilters.radius, searchFilters.minPrice, searchFilters.maxPrice, searchFilters.minBeds, searchFilters.maxBeds, searchFilters.propertyBuildingType]);

  // Track last stable result count (only update after search completes)
  useEffect(() => {
    // When search completes (isSearching goes from true to false) and a search was performed, update lastStableCount
    if (prevIsSearching.current && !isSearching && hasPerformedSearch) {
      setLastStableCount(filteredProperties.length);
    }
    prevIsSearching.current = isSearching;
  }, [isSearching, filteredProperties.length, hasPerformedSearch]);

  // On first load, set lastStableCount to initial property count
  useEffect(() => {
    if (!hasPerformedSearch && !isSearching) {
      setLastStableCount(filteredProperties.length);
    }
  }, [filteredProperties.length, hasPerformedSearch, isSearching]);

  // Expert team management functions
  const handleAddExpert = async () => {
    try {
      if (!newExpertData.fullName || !newExpertData.jobTitle) {
        alert('Full name and job title are required');
        return;
      }

      const response = await fetch(`/api/users/${advisorProfile.id}/expert-team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newExpertData)
      });

      if (response.ok) {
        const result = await response.json();
        setExpertTeamMembers([...expertTeamMembers, result.expert]);
        setNewExpertData({ fullName: '', jobTitle: '', email: '', phone: '' });
        setShowAddExpertForm(false);
        // Refresh advisor profile to get updated expert team
        fetchAdvisorProfile();
      } else {
        const error = await response.json();
        alert(`Error adding expert: ${error.message}`);
      }
    } catch (error) {
      console.error('Error adding expert:', error);
      alert('Error adding expert team member');
    }
  };

  const handleUpdateExpert = async (expertId, updatedData) => {
    try {
      const response = await fetch(`/api/users/expert-team/${expertId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedData)
      });

      if (response.ok) {
        const result = await response.json();
        setExpertTeamMembers(expertTeamMembers.map(expert => 
          expert.id === expertId ? result.expert : expert
        ));
        setEditingExpert(null);
        // Refresh advisor profile to get updated expert team
        fetchAdvisorProfile();
      } else {
        const error = await response.json();
        alert(`Error updating expert: ${error.message}`);
      }
    } catch (error) {
      console.error('Error updating expert:', error);
      alert('Error updating expert team member');
    }
  };

  const handleDeleteExpert = async (expertId) => {
    if (!window.confirm('Are you sure you want to delete this expert team member?')) {
      return;
    }

    try {
      const response = await fetch(`/api/users/expert-team/${expertId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setExpertTeamMembers(expertTeamMembers.filter(expert => expert.id !== expertId));
        // Refresh advisor profile to get updated expert team
        fetchAdvisorProfile();
      } else {
        const error = await response.json();
        alert(`Error deleting expert: ${error.message}`);
      }
    } catch (error) {
      console.error('Error deleting expert:', error);
      alert('Error deleting expert team member');
    }
  };

  const startEditingExpert = (expert) => {
    setEditingExpert({
      id: expert.id,
      fullName: expert.fullName,
      jobTitle: expert.jobTitle,
      email: expert.email || '',
      phone: expert.phone || ''
    });
  };

  const cancelEditingExpert = () => {
    setEditingExpert(null);
  };

  const saveEditingExpert = () => {
    if (!editingExpert.fullName || !editingExpert.jobTitle) {
      alert('Full name and job title are required');
      return;
    }
    handleUpdateExpert(editingExpert.id, editingExpert);
  };

  if (loading) {
    return (
      <div className="dashboard-loading-modern">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="user-dashboard">
      {/* Professional Header */}
      <div className="dashboard-header">
        <div className="header-container">
          <div className="header-top">
            <div className="user-greeting">
              <div className="user-avatar-large">
                <i className="fas fa-user"></i>
              </div>
              <div className="greeting-text">
                <h1>Welcome back, {user?.first_name}!</h1>
                <p>Manage your property listings and track your success</p>
              </div>
            </div>
            
            <div className="header-actions">
              <div className="add-listing-dropdown-container">
                <button 
                  className="add-listing-btn-modern"
                  onClick={() => setShowAddListingDropdown(!showAddListingDropdown)}
                >
                  <span>Add New Listing</span>
                  <i className={`fas fa-chevron-down ${showAddListingDropdown ? 'rotated' : ''}`}></i>
                </button>
                
                {showAddListingDropdown && (
                  <div className="add-listing-dropdown-menu">
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => handleAddListingNavigation('/addlist', 'For Sale')}
                    >
                      <i className="fas fa-home" style={{marginRight: '0.5rem'}}></i>
                      For Sale
                    </button>
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => handleAddListingNavigation('/addrent', 'For Rent')}
                    >
                      <i className="fas fa-key" style={{marginRight: '0.5rem'}}></i>
                      For Rent
                    </button>
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => handleAddListingNavigation('/addlease', 'For Lease')}
                    >
                      <i className="fas fa-file-contract" style={{marginRight: '0.5rem'}}></i>
                      For Lease
                    </button>
                  </div>
                )}
              </div>
              
              <button 
                className="profile-menu-btn"
                onClick={handleLogout}
                title="Sign Out"
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {updateSuccessMessage && (
        <div className="success-message-banner" style={{
          backgroundColor: '#d4edda',
          color: '#155724',
          padding: '1rem',
          margin: '1rem 0',
          borderRadius: '8px',
          border: '1px solid #c3e6cb',
          textAlign: 'center',
          fontSize: '1.1rem',
          fontWeight: '500'
        }}>
          {updateSuccessMessage}
        </div>
      )}

      {/* Modern Navigation */}
      <div className="dashboard-nav-modern" ref={navRef}>
        <span 
          className="home-link-simple"
          onClick={() => navigate('/find')}
          title="Go to Property Search"
        >
          Home <i className="fas fa-chevron-right"></i>
        </span>
        <span className="dashboard-text">Dashboard</span>
        <DashboardTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setShowPropertiesDropdown={setShowPropertiesDropdown}
          refreshUserProfile={refreshUserProfile}
        />
      </div>

      {/* Search/Filter Bars per category */}
      {activeTab === 'properties' && searchFilters.propertyType === 'rent' && (
        <SearchFilterHeader
          searchFilters={searchFilters}
          setSearchFilters={setSearchFilters}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          moreFilters={moreFilters}
          setMoreFilters={setMoreFilters}
          showMoreFilters={showMoreFilters}
          setShowMoreFilters={setShowMoreFilters}
          priceOptions={priceOptions}
          bedroomOptions={bedroomOptions}
          propertyBuildingTypeOptions={propertyBuildingTypeOptions}
          bathroomOptions={bathroomOptions}
          // 🏆 Professional Search Props
          onProfessionalSearch={handleProfessionalSearch}
          isSearching={isSearching}
          searchResults={searchResults}
          searchAnalytics={searchAnalytics}
        />
      )}

      {activeTab === 'properties' && searchFilters.propertyType === 'sale' && (
        <SearchFilterHeaderSale
          searchFilters={searchFilters}
          setSearchFilters={setSearchFilters}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          moreFilters={moreFilters}
          setMoreFilters={setMoreFilters}
          showMoreFilters={showMoreFilters}
          setShowMoreFilters={setShowMoreFilters}
          priceOptions={priceOptions}
          bedroomOptions={bedroomOptions}
          propertyBuildingTypeOptions={propertyBuildingTypeOptions}
          bathroomOptions={bathroomOptions}
          onProfessionalSearch={handleProfessionalSearch}
          isSearching={isSearching}
        />
      )}

      {activeTab === 'properties' && searchFilters.propertyType === 'lease' && (
        <SearchFilterHeaderLease
          searchFilters={searchFilters}
          setSearchFilters={setSearchFilters}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          moreFilters={moreFilters}
          setMoreFilters={setMoreFilters}
          showMoreFilters={showMoreFilters}
          setShowMoreFilters={setShowMoreFilters}
          priceOptions={priceOptions}
          squareFeetOptions={squareFeetOptions}
          propertyBuildingTypeOptions={propertyBuildingTypeOptions}
          onProfessionalSearch={handleProfessionalSearch}
          isSearching={isSearching}
        />
      )}

      {/* Main Content - hidden when More Filters is open */}
      {!showMoreFilters && (
        <div className="dashboard-main">
          {activeTab === 'overview' && (
            <OverviewStats stats={stats} />
          )}

          {activeTab === 'properties' && (
            <PropertiesSection
              filteredProperties={filteredProperties}
              searchFilters={searchFilters}
              setSearchFilters={handleSidebarFilterChange}
              propertyTypeOptions={propertyTypeOptions}
              statusOptions={statusOptions}
              handlePropertyDeleted={handlePropertyDeleted}
              isRadiusFiltering={isRadiusFiltering}
              isSearching={isSearching}
              totalCount={lastStableCount}
            />
          )}

          {activeTab === 'advisor-profile' && (
            <div className="profile-section">
              {isLoadingAdvisorProfile ? (
                <div className="loading-container">
                  <i className="fas fa-spinner fa-spin"></i>
                  <p>Loading advisor profile...</p>
                </div>
              ) : advisorProfile ? (
                <>
                  <div className="profile-header">
                    <h2>
                      <i className="fas fa-user-tie"></i>
                      Advisor Profile
                    </h2>
                  </div>
                  
                  <div className="profile-form">
                    <div className="form-group-modern">
                      <label className="form-label-modern">Profile Type</label>
                      <input
                        type="text"
                        className="form-input-modern"
                        value={advisorProfile.advisor_type === 'company' ? 'Company' : 'Person'}
                        disabled
                      />
                    </div>
                    
                    {advisorProfile.advisor_type === 'company' && (
                      <>
                        <div className="form-group-modern">
                          <label className="form-label-modern">Company Name</label>
                          <input
                            type="text"
                            className="form-input-modern"
                            value={advisorProfile.company_name || ''}
                            disabled
                          />
                        </div>
                        
                        <div className="form-group-modern">
                          <label className="form-label-modern">Director Name</label>
                          <input
                            type="text"
                            className="form-input-modern"
                            value={advisorProfile.director_name || ''}
                            disabled
                          />
                        </div>
                        
                        <div className="form-group-modern">
                          <label className="form-label-modern">Office Address</label>
                          <input
                            type="text"
                            className="form-input-modern"
                            value={advisorProfile.office_address || ''}
                            disabled
                          />
                        </div>
                        
                        <div className="form-group-modern">
                          <label className="form-label-modern">Office Hours</label>
                          <input
                            type="text"
                            className="form-input-modern"
                            value={advisorProfile.office_hours || ''}
                            disabled
                          />
                        </div>

                        <div className="form-group-modern">
                          <label className="form-label-modern">Company Email</label>
                          <input
                            type="email"
                            className="form-input-modern"
                            value={advisorProfile.company_email || ''}
                            disabled
                          />
                        </div>
                      </>
                    )}

                    {advisorProfile.advisor_type === 'person' && (
                      <>
                        <div className="form-group-modern">
                          <label className="form-label-modern">Full Name</label>
                          <input
                            type="text"
                            className="form-input-modern"
                            value={advisorProfile.full_name || ''}
                            disabled
                          />
                        </div>
                        
                        <div className="form-group-modern">
                          <label className="form-label-modern">Job Title</label>
                          <input
                            type="text"
                            className="form-input-modern"
                            value={advisorProfile.job_title || ''}
                            disabled
                          />
                        </div>
                        
                        <div className="form-group-modern">
                          <label className="form-label-modern">Contact Number</label>
                          <input
                            type="tel"
                            className="form-input-modern"
                            value={advisorProfile.contact_phone || ''}
                            disabled
                          />
                        </div>

                        <div className="form-group-modern">
                          <label className="form-label-modern">Email Address</label>
                          <input
                            type="email"
                            className="form-input-modern"
                            value={advisorProfile.email || advisorProfile.contact_email || advisorProfile.company_email || ''}
                            disabled
                          />
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="profile-actions">
                    <button 
                      className="btn-save"
                      onClick={() => navigate('/advisor-profile', { 
                        state: { isEdit: true } 
                      })}
                    >
                      <i className="fas fa-edit"></i>
                      Edit Advisor Profile
                    </button>
                  </div>
                </>
              ) : (
                <div className="no-advisor-profile">
                  <div className="no-profile-content">
                    <h3>Create Your Advisor Profile</h3>
                    <p>Enhance your property listings with a professional advisor profile to build trust with potential clients.</p>
                    
                    <div className="benefits-list">
                      <div className="benefit-item">
                        <i className="fas fa-check-circle"></i>
                        <span>Display on all your property listings</span>
                      </div>
                      <div className="benefit-item">
                        <i className="fas fa-check-circle"></i>
                        <span>Build professional credibility</span>
                      </div>
                      <div className="benefit-item">
                        <i className="fas fa-check-circle"></i>
                        <span>Increase client inquiries</span>
                      </div>
                      <div className="benefit-item">
                        <i className="fas fa-check-circle"></i>
                        <span>Showcase your expertise</span>
                      </div>
                    </div>
                    
                    <button
                      className="btn-create-advisor"
                      onClick={() => navigate('/advisor-profile')}
                    >
                      <i className="fas fa-plus"></i>
                      Create Advisor Profile
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}


    </div>
  );
};

export default UserDashboard; 