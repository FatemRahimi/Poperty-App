import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PropertyCard from '../components/PropertyCard';
import SearchDropdown from '../components/SearchDropdown';
import './UserDashboard.css';
import "../styles/CrossBrowserReset.css"; // Cross-browser consistency

const UserDashboard = () => {
  const [properties, setProperties] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddListingDropdown, setShowAddListingDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Search dropdown states
  const [searchFilters, setSearchFilters] = useState({
    radius: '0.5',
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
  
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const profileFormRef = useRef(null);
  const navRef = useRef(null);

  // Redirect if not authenticated
  useEffect(() => {
    console.log('🏠 UserDashboard: Component loaded');
    console.log('🏠 UserDashboard: User data:', user);
    console.log('🏠 UserDashboard: User authenticated:', !!user);
    
    if (!user) {
      console.log('🏠 UserDashboard: No user found, redirecting to login');
      navigate('/login');
      return;
    }
    loadDashboardData();
    setProfileData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      created_at: user?.created_at || ''
    });
  }, [user, navigate]);

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

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const propertiesResponse = await fetch('/api/properties/my-properties', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (propertiesResponse.ok) {
        const propertiesData = await propertiesResponse.json();
        
        // Debug logging
        console.log('🔍 Frontend UserDashboard - API Response Debug:');
        console.log('📊 Total properties received:', propertiesData.properties?.length || 0);
        console.log('🗂️ Full API response structure:', propertiesData);
        
        if (propertiesData.properties && propertiesData.properties.length > 0) {
          const firstProperty = propertiesData.properties[0];
          console.log('🏠 First property detailed debug:', {
            id: firstProperty.id,
            title: firstProperty.title,
            hasDescription: !!firstProperty.description,
            descriptionLength: firstProperty.description?.length || 0,
            descriptionValue: firstProperty.description || 'NO DESCRIPTION',
            descriptionPreview: firstProperty.description?.substring(0, 100) || 'NO DESCRIPTION',
            allPropertyFields: Object.keys(firstProperty),
            fullPropertyObject: firstProperty
          });
          
          // Check latest property for description
          console.log('📋 Latest property (should have description):', {
            id: propertiesData.properties[0].id,
            title: propertiesData.properties[0].title,
            description: propertiesData.properties[0].description,
            hasDescription: !!propertiesData.properties[0].description
          });
        } else {
          console.log('❌ No properties found in API response');
        }
        
        setProperties(propertiesData.properties || []);
        
        const userStats = calculateStats(propertiesData.properties || []);
        setStats(userStats);
      } else {
        console.error('Failed to load dashboard data:', propertiesResponse.status);
        if (propertiesResponse.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
        }
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
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

  const handleCancelEdit = () => {
    // Check if there are unsaved changes
    const hasChanges = 
      profileData.first_name !== (user?.first_name || '') ||
      profileData.last_name !== (user?.last_name || '') ||
      profileData.phone !== (user?.phone || '');

    if (hasChanges) {
      const confirmCancel = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel? Your changes will be lost.'
      );
      if (!confirmCancel) {
        return; // User chose to continue editing
      }
    }

    // Reset form data to original user data
    setProfileData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      created_at: user?.created_at || ''
    });
    
    // Exit editing mode
    setIsEditing(false);
    
    // Clear any save messages
    setSaveMessage({ type: '', text: '' });
  };

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

  const filteredProperties = properties.filter(property => {
    // Status filter
    const statusMatch = searchFilters.status === 'all' || property.status === searchFilters.status;
    
    // Property category (rent/sale/lease) filter
    const categoryMatch = searchFilters.propertyType === 'all' || property.category === searchFilters.propertyType;
    
    // Property type (flat/house/detached) filter
    const propertyTypeMatch = searchFilters.propertyBuildingType === 'all' || property.property_type === searchFilters.propertyBuildingType;
    
    // Price filters
    const minPriceMatch = searchFilters.minPrice === 'any' || property.price >= parseInt(searchFilters.minPrice);
    const maxPriceMatch = searchFilters.maxPrice === 'any' || property.price <= parseInt(searchFilters.maxPrice);
    
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
    
    // Search functionality
    const searchMatch = searchQuery === '' || 
      property.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.address_line1?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      property.zip_code?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return statusMatch && categoryMatch && propertyTypeMatch && minPriceMatch && maxPriceMatch && 
           minBedsMatch && maxBedsMatch && minBathMatch && maxBathMatch && 
           gardenMatch && parkingMatch && studentMatch && searchMatch;
  });

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

  const priceOptions = {
    min: [
      { value: 'any', label: 'Min Price' },
      { value: '100', label: '£100' },
      { value: '200', label: '£200' },
      { value: '300', label: '£300' },
      { value: '400', label: '£400' },
      { value: '500', label: '£500' },
      { value: '600', label: '£600' },
      { value: '700', label: '£700' },
      { value: '800', label: '£800' },
      { value: '900', label: '£900' },
      { value: '1000', label: '£1,000' },
      { value: '1250', label: '£1,250' },
      { value: '1500', label: '£1,500' },
      { value: '1750', label: '£1,750' },
      { value: '2000', label: '£2,000' },
      { value: '2500', label: '£2,500' },
      { value: '3000', label: '£3,000' },
      { value: '3500', label: '£3,500' },
      { value: '4000', label: '£4,000' },
      { value: '4500', label: '£4,500' },
      { value: '5000', label: '£5,000' },
      { value: '6000', label: '£6,000' },
      { value: '7000', label: '£7,000' },
      { value: '8000', label: '£8,000' },
      { value: '9000', label: '£9,000' },
      { value: '10000', label: '£10,000' },
      { value: '12500', label: '£12,500' },
      { value: '15000', label: '£15,000' },
      { value: '17500', label: '£17,500' },
      { value: '20000', label: '£20,000' },
      { value: '25000', label: '£25,000' },
      { value: '30000', label: '£30,000' },
      { value: '35000', label: '£35,000' }
    ],
    max: [
      { value: 'any', label: 'Max Price' },
      { value: '100', label: '£100' },
      { value: '200', label: '£200' },
      { value: '300', label: '£300' },
      { value: '400', label: '£400' },
      { value: '500', label: '£500' },
      { value: '600', label: '£600' },
      { value: '700', label: '£700' },
      { value: '800', label: '£800' },
      { value: '900', label: '£900' },
      { value: '1000', label: '£1,000' },
      { value: '1250', label: '£1,250' },
      { value: '1500', label: '£1,500' },
      { value: '1750', label: '£1,750' },
      { value: '2000', label: '£2,000' },
      { value: '2500', label: '£2,500' },
      { value: '3000', label: '£3,000' },
      { value: '3500', label: '£3,500' },
      { value: '4000', label: '£4,000' },
      { value: '4500', label: '£4,500' },
      { value: '5000', label: '£5,000' },
      { value: '6000', label: '£6,000' },
      { value: '7000', label: '£7,000' },
      { value: '8000', label: '£8,000' },
      { value: '9000', label: '£9,000' },
      { value: '10000', label: '£10,000' },
      { value: '12500', label: '£12,500' },
      { value: '15000', label: '£15,000' },
      { value: '17500', label: '£17,500' },
      { value: '20000', label: '£20,000' },
      { value: '25000', label: '£25,000' },
      { value: '30000', label: '£30,000' },
      { value: '35000', label: '£35,000' }
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
    { value: 'bungalow', label: 'Bungalow' },
    { value: 'land', label: 'Land' },
    { value: 'park-home', label: 'Park Home' },
    { value: 'student-halls', label: 'Student Halls' }
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
                      onClick={() => {navigate('/addlist'); setShowAddListingDropdown(false);}}
                    >
                      <i className="fas fa-home" style={{marginRight: '0.5rem'}}></i>
                      For Sale
                    </button>
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => {navigate('/addrent'); setShowAddListingDropdown(false);}}
                    >
                      <i className="fas fa-key" style={{marginRight: '0.5rem'}}></i>
                      For Rent
                    </button>
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => {navigate('/addlease'); setShowAddListingDropdown(false);}}
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
        <div className="nav-container">
          <div className="nav-tabs-modern">
            <button 
              className={`nav-tab-modern ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('overview');
                setShowPropertiesDropdown(false);
              }}
            >
              <i className="fas fa-chart-line"></i>
              Overview
            </button>
            <div className="properties-tab-container">
              <button 
                className={`nav-tab-modern properties-tab ${activeTab === 'properties' ? 'active' : ''}`}
                onClick={() => {
                  if (activeTab === 'properties') {
                    // If already on properties tab, just toggle dropdown
                    // Clear any existing timeout
                    if (autoCloseTimeout) {
                      clearTimeout(autoCloseTimeout);
                      setAutoCloseTimeout(null);
                    }
                    if (!showPropertiesDropdown) {
                      // Initialize temp filters when opening dropdown
                      setTempFilters({
                        propertyType: searchFilters.propertyType,
                        status: searchFilters.status
                      });
                    }
                    setShowPropertiesDropdown(!showPropertiesDropdown);
                  } else {
                    // If switching to properties tab, set active and show dropdown for 2 seconds
                    setActiveTab('properties');
                    // Initialize temp filters when opening dropdown
                    setTempFilters({
                      propertyType: searchFilters.propertyType,
                      status: searchFilters.status
                    });
                    setShowPropertiesDropdown(true);
                    
                    // Auto-close dropdown after 2 seconds and reset to current applied filters
                    const timeoutId = setTimeout(() => {
                      // Reset temporary filters to current applied filters when auto-closing
                      setTempFilters({
                        propertyType: searchFilters.propertyType,
                        status: searchFilters.status
                      });
                      setShowPropertiesDropdown(false);
                      setAutoCloseTimeout(null);
                    }, 2000);
                    setAutoCloseTimeout(timeoutId);
                  }
                }}
              >
                <i className="fas fa-building"></i>
                My Properties
                <svg 
                  className={`dropdown-arrow ${showPropertiesDropdown ? 'open' : ''}`}
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                >
                  <path 
                    d="M3 4.5L6 7.5L9 4.5" 
                    stroke="currentColor" 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
                            </button>
              
              {activeTab === 'properties' && showPropertiesDropdown && createPortal(
                <div className="properties-dropdown">
                  <div className="dropdown-content">
                    <div className="dropdown-section">
                      <h4>
                        <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 7h-9"/>
                          <path d="M14 17H5"/>
                          <circle cx="17" cy="17" r="3"/>
                          <circle cx="7" cy="7" r="3"/>
                        </svg>
                        Categories
                      </h4>
                      <div className="filter-options-simple">
                        {propertyTypeOptions.map(option => (
                          <label key={option.value} className="simple-option">
                            <input
                              type="radio"
                              name="propertyType"
                              value={option.value}
                              checked={tempFilters.propertyType === option.value}
                              onChange={(e) => {
                                const newTempFilters = {...tempFilters, propertyType: e.target.value};
                                setTempFilters(newTempFilters);
                                // Apply filters immediately and close dropdown
                                setSearchFilters({...searchFilters, propertyType: e.target.value});
                                setTimeout(() => {
                                  setShowPropertiesDropdown(false);
                                  if (autoCloseTimeout) {
                                    clearTimeout(autoCloseTimeout);
                                    setAutoCloseTimeout(null);
                                  }
                                }, 300);
                              }}
                            />
                            <span className="option-text">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div className="dropdown-section">
                      <h4>
                        <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 8v4"/>
                          <path d="M12 16h.01"/>
                        </svg>
                        Status
                      </h4>
                      <div className="filter-options-simple">
                        {statusOptions.map(option => (
                          <label key={option.value} className="simple-option">
                            <input
                              type="radio"
                              name="status"
                              value={option.value}
                              checked={tempFilters.status === option.value}
                              onChange={(e) => {
                                const newTempFilters = {...tempFilters, status: e.target.value};
                                setTempFilters(newTempFilters);
                                // Apply filters immediately and close dropdown
                                setSearchFilters({...searchFilters, status: e.target.value});
                                setTimeout(() => {
                                  setShowPropertiesDropdown(false);
                                  if (autoCloseTimeout) {
                                    clearTimeout(autoCloseTimeout);
                                    setAutoCloseTimeout(null);
                                  }
                                }, 300);
                              }}
                            />
                            <span className="option-text">{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )}
              </div>
            <button 
              className={`nav-tab-modern ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={async () => {
                setActiveTab('profile');
                setShowPropertiesDropdown(false);
                // Auto-refresh profile data when switching to profile tab
                if (activeTab !== 'profile') {
                  await refreshUserProfile();
                }
              }}
            >
              <i className="fas fa-user"></i>
              Profile
            </button>
          </div>
        </div>
      </div>

      {/* Professional Search/Filter Bar - Show only when properties tab is active */}
      {activeTab === 'properties' && (
        <div className="professional-search-header">
          <div className="search-filter-container">
            {/* Location Search */}
            <div className="filter-group location-group">
              <input
                type="text"
                placeholder="Search location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="location-input"
              />
              <SearchDropdown
                value={searchFilters.radius}
                onChange={(value) => setSearchFilters({...searchFilters, radius: value})}
                options={radiusOptions}
                placeholder="Select radius"
                className="search-dropdown-radius"
                style={{minWidth: '150px'}}
                theme="dark"
              />
            </div>

            {/* Price Filters */}
            <div className="filter-group price-group">
              <SearchDropdown
                value={searchFilters.minPrice}
                onChange={(value) => setSearchFilters({...searchFilters, minPrice: value})}
                options={priceOptions.min}
                placeholder="Min Price"
                className="search-dropdown-price-min"
                style={{minWidth: '100px'}}
                theme="dark"
              />
              <span className="separator">to</span>
            
              <SearchDropdown
                value={searchFilters.maxPrice}
                onChange={(value) => setSearchFilters({...searchFilters, maxPrice: value})}
                options={priceOptions.max}
                placeholder="Max Price"
                className="search-dropdown-price-max"
                style={{minWidth: '100px'}}
                theme="dark"
              />
            </div>

            {/* Bedroom Filters */}
            <div className="filter-group bedroom-group">
              <SearchDropdown
                value={searchFilters.minBeds}
                onChange={(value) => setSearchFilters({...searchFilters, minBeds: value})}
                options={bedroomOptions.min}
                placeholder="Min Beds"
                className="search-dropdown-beds-min"
                style={{minWidth: '95px'}}
                theme="dark"
              />
              <span className="separator">to</span>
              <SearchDropdown
                value={searchFilters.maxBeds}
                onChange={(value) => setSearchFilters({...searchFilters, maxBeds: value})}
                options={bedroomOptions.max}
                placeholder="Max Beds"
                className="search-dropdown-beds-max"
                style={{minWidth: '95px'}}
                theme="dark"
              />
            </div>

            {/* Property Type */}
            <div className="filter-group property-type-group">
              <SearchDropdown
                value={searchFilters.propertyBuildingType}
                onChange={(value) => setSearchFilters({...searchFilters, propertyBuildingType: value})}
                options={propertyBuildingTypeOptions}
                placeholder="Property Type"
                className="search-dropdown-property-building-type"
                style={{minWidth: '140px'}}
                theme="dark"
              />
            </div>

            {/* More Filters */}
            <div className="filter-group dashboard-more-filters-container">
              <div 
                className={`dashboard-more-filters-button ${showMoreFilters ? 'open' : ''}`}
                onClick={() => setShowMoreFilters(!showMoreFilters)}
              >
                <span className="dashboard-more-filters-text">More Filters</span>
                <i className={`fas fa-chevron-down dashboard-more-filters-arrow ${showMoreFilters ? 'open' : ''}`}></i>
              </div>

              {showMoreFilters && (
                <div className="dashboard-more-filters-dropdown">
                  <div className="dashboard-more-filters-content">
                    
                    {/* Bathroom Section */}
                    <div className="dashboard-filter-section">
                      <h4 className="dashboard-filter-section-title">
                        <i className="fas fa-bath"></i>
                        Bathroom
                      </h4>
                      <div className="dashboard-filter-row">
                        <div className="filter-field">
                          <SearchDropdown
                            value={moreFilters.minBathrooms}
                            onChange={(value) => setMoreFilters({...moreFilters, minBathrooms: value})}
                            options={bathroomOptions.min}
                            placeholder="Min Bath"
                            className="dashboard-more-filter-dropdown"
                            style={{minWidth: '140px'}}
                            theme="light"
                          />
                        </div>
                        <div className="filter-field">
                          <SearchDropdown
                            value={moreFilters.maxBathrooms}
                            onChange={(value) => setMoreFilters({...moreFilters, maxBathrooms: value})}
                            options={bathroomOptions.max}
                            placeholder="Max Bath"
                            className="dashboard-more-filter-dropdown"
                            style={{minWidth: '140px'}}
                            theme="light"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="dashboard-filter-divider"></div>

                    {/* Property Details Section */}
                    <div className="dashboard-filter-section">
                      <h4 className="dashboard-filter-section-title">
                        <i className="fas fa-home"></i>
                        Property Details
                      </h4>
                      <div className="dashboard-filter-row">
                        <div className="filter-field">
                          <label className="filter-field-label">Date Added</label>
                          <SearchDropdown
                            value={moreFilters.dateAdded}
                            onChange={(value) => setMoreFilters({...moreFilters, dateAdded: value})}
                            options={[
                              { value: 'anytime', label: 'Anytime' },
                              { value: '3days', label: 'Last 3 days' },
                              { value: '7days', label: 'Last 7 days' },
                              { value: '14days', label: 'Last 14 days' }
                            ]}
                            placeholder="Anytime"
                            className="dashboard-more-filter-dropdown"
                            style={{minWidth: '280px'}}
                            theme="light"
                          />
                        </div>
                        <div className="filter-field">
                          <label className="filter-field-label">Move in by Date</label>
                          <div className="date-input-container">
                            <input
                              type="date"
                              className="date-input"
                              value={moreFilters.moveInDate}
                              onChange={(e) => setMoreFilters({...moreFilters, moveInDate: e.target.value})}
                              placeholder="dd/mm/yyyy"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="dashboard-filter-row">
                        <label className="dashboard-filter-checkbox-option">
                          <input
                            type="checkbox"
                            checked={moreFilters.letAgreed}
                            onChange={(e) => setMoreFilters({...moreFilters, letAgreed: e.target.checked})}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Include Let Agreed</span>
                        </label>
                      </div>
                    </div>

                    <div className="dashboard-filter-divider"></div>

                    {/* Type of Let Section */}
                    <div className="dashboard-filter-section">
                      <h4 className="dashboard-filter-section-title">
                        <i className="fas fa-key"></i>
                        Type of Let
                      </h4>
                      <div className="dashboard-filter-list">
                        <label className="dashboard-filter-radio-option">
                          <input
                            type="radio"
                            name="typeOfLet"
                            value="any"
                            checked={moreFilters.typeOfLet === 'any'}
                            onChange={(e) => setMoreFilters({...moreFilters, typeOfLet: e.target.value})}
                          />
                          <span className="radio-custom"></span>
                          <span className="radio-label">Any</span>
                        </label>
                        <label className="dashboard-filter-radio-option">
                          <input
                            type="radio"
                            name="typeOfLet"
                            value="long-term"
                            checked={moreFilters.typeOfLet === 'long-term'}
                            onChange={(e) => setMoreFilters({...moreFilters, typeOfLet: e.target.value})}
                          />
                          <span className="radio-custom"></span>
                          <span className="radio-label">Long Term</span>
                        </label>
                        <label className="dashboard-filter-radio-option">
                          <input
                            type="radio"
                            name="typeOfLet"
                            value="short-term"
                            checked={moreFilters.typeOfLet === 'short-term'}
                            onChange={(e) => setMoreFilters({...moreFilters, typeOfLet: e.target.value})}
                          />
                          <span className="radio-custom"></span>
                          <span className="radio-label">Short Term</span>
                        </label>
                      </div>
                    </div>

                    {/* Property Features Section */}
                    <div className="dashboard-filter-section">
                      <div className="dashboard-filter-checkboxes-row">
                        <label className="dashboard-filter-checkbox-option">
                          <input
                            type="checkbox"
                            checked={moreFilters.hasGarden}
                            onChange={(e) => setMoreFilters({...moreFilters, hasGarden: e.target.checked})}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Garden</span>
                        </label>
                        <label className="dashboard-filter-checkbox-option">
                          <input
                            type="checkbox"
                            checked={moreFilters.hasParking}
                            onChange={(e) => setMoreFilters({...moreFilters, hasParking: e.target.checked})}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Parking</span>
                        </label>
                        <label className="dashboard-filter-checkbox-option">
                          <input
                            type="checkbox"
                            checked={moreFilters.houseShare}
                            onChange={(e) => setMoreFilters({...moreFilters, houseShare: e.target.checked})}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">House Share</span>
                        </label>
                        <label className="dashboard-filter-checkbox-option">
                          <input
                            type="checkbox"
                            checked={moreFilters.retirementHome}
                            onChange={(e) => setMoreFilters({...moreFilters, retirementHome: e.target.checked})}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Retirement Home</span>
                        </label>
                        <label className="dashboard-filter-checkbox-option">
                          <input
                            type="checkbox"
                            checked={moreFilters.studentAccommodation}
                            onChange={(e) => setMoreFilters({...moreFilters, studentAccommodation: e.target.checked})}
                          />
                          <span className="checkbox-custom"></span>
                          <span className="checkbox-label">Student Accommodation</span>
                        </label>
                      </div>
                    </div>

                    {/* Filter Actions */}
                    <div className="dashboard-filter-actions">
                      <button 
                        className="dashboard-filter-clear-btn"
                        onClick={() => setMoreFilters({
                          minBathrooms: '',
                          maxBathrooms: '',
                          typeOfLet: 'any',
                          dateAdded: 'anytime',
                          moveInDate: '',
                          letAgreed: false,
                          hasGarden: false,
                          hasParking: false,
                          houseShare: false,
                          retirementHome: false,
                          studentAccommodation: false
                        })}
                      >
                        Clear
                      </button>
                      <button 
                        className="dashboard-filter-done-btn"
                        onClick={() => {
                          // Apply filters logic here
                          setShowMoreFilters(false);
                        }}
                      >
                        Done
                      </button>
                    </div>

                  </div>
                </div>
              )}
            </div>


          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="dashboard-main">
        {activeTab === 'overview' && (
          <>
            <div className="stats-section">
              <div className="stats-header">
                <h2>Property Statistics</h2>
              </div>
              <div className="stats-grid-modern">
                <StatCard 
                  title="Total Properties" 
                  value={stats.total || 0} 
                  icon="fa-home" 
                  color="primary"
                />
                <StatCard 
                  title="Approved Listings" 
                  value={stats.approved || 0} 
                  icon="fa-check-circle" 
                  color="success"
                />
                <StatCard 
                  title="Pending Review" 
                  value={stats.pending || 0} 
                  icon="fa-clock" 
                  color="warning"
                />
                <StatCard 
                  title="Need Updates" 
                  value={stats.rejected || 0} 
                  icon="fa-edit" 
                  color="danger"
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'properties' && (
          <div className="properties-section">
            <div className="properties-header-modern">
              <div className="properties-title">
                <h2>My Properties</h2>
                <span className="property-count">{filteredProperties.length}</span>
              </div>
            </div>

            {filteredProperties.length === 0 ? (
              <div className="no-properties-modern">
                <i className="fas fa-home"></i>
                <h3>No Properties Found</h3>
                <p>You haven't submitted any properties yet, or no properties match your current filters.</p>
                <button 
                  className="btn-add-first"
                  onClick={() => navigate('/addlist')}
                >
                  <i className="fas fa-plus"></i>
                  Add Your First Property
                </button>
              </div>
            ) : (
              <div className="properties-grid-modern">
                {filteredProperties.map(property => (
                  <PropertyCard 
                    key={property.id} 
                    property={property} 
                    onPropertyDeleted={handlePropertyDeleted}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className={`profile-section ${isEditing ? 'editing' : ''}`}>
            <div className="profile-header">
              <h2>
                <i className="fas fa-user"></i>
                Profile Information
              </h2>
              {isEditing && (
                <small style={{color: '#64748b', fontStyle: 'italic'}}>
                  Make your changes and click Save or Cancel
                </small>
              )}
            </div>
            
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                console.log('🚫 Form submission prevented');
                if (isEditing) {
                  handleProfileSave();
                }
              }}
            >
              <div className="profile-form" ref={profileFormRef}>
                <div className="form-group-modern">
                  <label className="form-label-modern">First Name</label>
                  <input
                    type="text"
                    className="form-input-modern"
                    value={profileData.first_name}
                    onChange={(e) => setProfileData({...profileData, first_name: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                
                <div className="form-group-modern">
                  <label className="form-label-modern">Last Name</label>
                  <input
                    type="text"
                    className="form-input-modern"
                    value={profileData.last_name}
                    onChange={(e) => setProfileData({...profileData, last_name: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                
                <div className="form-group-modern">
                  <label className="form-label-modern">Email Address</label>
                  <input
                    type="email"
                    className="form-input-modern"
                    value={profileData.email}
                    disabled
                    title="Email cannot be changed for security reasons"
                  />
                </div>
                
                <div className="form-group-modern">
                  <label className="form-label-modern">Phone Number</label>
                  <input
                    type="tel"
                    className="form-input-modern"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                    disabled={!isEditing}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
            </form>
            
            <div className="profile-actions">
              {saveMessage.text && (
                <div className={`save-message ${saveMessage.type}`}>
                  <i className={`fas ${saveMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                  {saveMessage.text}
                </div>
              )}
              
              {!isEditing ? (
                <button 
                  className="btn-save"
                  onClick={async () => {
                    // Refresh profile data before editing to ensure latest values
                    await refreshUserProfile();
                    setIsEditing(true);
                  }}
                >
                  <i className="fas fa-edit"></i>
                  Edit Profile
                </button>
              ) : (
                <div className="edit-buttons-container">
                  <button 
                    type="button"
                    className="btn-cancel"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <i className="fas fa-times"></i>
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className="btn-save"
                    onClick={handleProfileSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save"></i>
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>


    </div>
  );
};

export default UserDashboard; 