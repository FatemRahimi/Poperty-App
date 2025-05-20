import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "./FindProperty.css";
import { FaSearch, FaHome, FaBuilding, FaTree, FaMapMarkerAlt, FaRegBuilding } from "react-icons/fa";

const FindProperty = () => {
    const [searchType, setSearchType] = useState("buy");
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoaded, setIsLoaded] = useState(false);
    const [activeFilter, setActiveFilter] = useState("all");
    const [selectedCategory, setSelectedCategory] = useState("residential");
    const videoRef = useRef(null);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const inputRef = useRef(null);

    // Debug mount and state changes
    useEffect(() => {
        console.log('Component mounted');
        console.log('Initial search type:', searchType);
        console.log('Initial search query:', searchQuery);
        
        // Check if input is accessible
        if (inputRef.current) {
            console.log('Input element exists:', inputRef.current);
            console.log('Input is disabled:', inputRef.current.disabled);
            console.log('Input is readOnly:', inputRef.current.readOnly);
        }
    }, []);

    // Property filters
    const filters = [
        { id: "all", label: "All Properties" },
        { id: "residential", label: "Residential" },
        { id: "commercial", label: "Commercial" },
        { id: "land", label: "Land & Farms" }
    ];

    const backgroundVideos = [
        "/videos/background.mp4",
        "/videos/background-1.mp4",
        "/videos/background-2.mp4",
        "/videos/background-3.mp4",
          "/videos/background-4.mp4",
           "/videos/background-5.mp4",
            "/videos/background-6.mp4",

    ];

    // Set page as loaded immediately
    useEffect(() => {
        setIsLoaded(true);
        document.querySelector('.hero-content')?.classList.add('loaded');
    }, []);

    // Video slideshow effect with continuous sliding animation
    useEffect(() => {
        const interval = setInterval(() => {
            if (!isTransitioning) {
                setIsTransitioning(true);
                const video = videoRef.current;
                if (video) {
                    // Start sliding out
                    video.classList.add('slide-out');
                    
                    // Immediately start sliding in the next video
                    setCurrentVideoIndex((prevIndex) => 
                        (prevIndex + 1) % backgroundVideos.length
                    );
                    video.classList.remove('slide-out');
                    video.classList.add('slide-in');
                    
                    // Remove transition classes after animation completes
                    setTimeout(() => {
                        video.classList.remove('slide-in');
                        setIsTransitioning(false);
                    }, 800);
                }
            }
        }, 3000); // Reduced interval for more frequent transitions

        return () => clearInterval(interval);
    }, [isTransitioning, currentVideoIndex]);

    // Scroll animation handler - moved from CSS
    useEffect(() => {
        function checkScrollAnimation() {
            const elements = document.querySelectorAll('.animate-on-scroll');
            
            elements.forEach(element => {
                const elementTop = element.getBoundingClientRect().top;
                const windowHeight = window.innerHeight;
                
                if (elementTop < windowHeight * 0.85) {
                    element.classList.add('is-visible');
                }
            });
        }
        
        window.addEventListener('scroll', checkScrollAnimation);
        
        // Initial check
        setTimeout(checkScrollAnimation, 100);

        return () => {
            window.removeEventListener('scroll', checkScrollAnimation);
        };
    }, []);

    // Animation classes for elements that previously used framer-motion
    const animationClasses = {
        textContent: "text-content animate-on-scroll",
        categoriesContainer: "categories-container",
        categoryCard: "category-card",
        searchContainer: "search-container animate-on-scroll",
        propertiesGrid: "properties-grid",
        propertyCard: "property-card animate-on-scroll",
        servicesGrid: "services-grid",
        serviceCard: "service-card animate-on-scroll"
    };

    const categories = [
        {
            id: "residential",
            title: "Residential & New Developments",
            icon: <FaHome className="category-icon" />,
            path: "/residential"
        },
        {
            id: "commercial",
            title: "Commercial & Development Land",
            icon: <FaBuilding className="category-icon" />,
            path: "/commercial"
        },
        {
            id: "farms",
            title: "Farms & Agricultural Land",
            icon: <FaTree className="category-icon" />,
            path: "/farms"
        }
    ];

    const featuredProperties = [
        {
            id: 1,
            type: "residential",
            title: "Modern Apartment Complex",
            location: "Downtown Area",
            price: "$850,000",
            bedrooms: 3,
            bathrooms: 2,
            sqft: 1850,
            image: "/assets/property1.jpg"
        },
        {
            id: 2, 
            type: "commercial",
            title: "Office Building with Parking",
            location: "Financial District",
            price: "$2,500,000",
            sqft: 5200,
            image: "/assets/property2.jpg"
        },
        {
            id: 3,
            type: "land",
            title: "Agricultural Land",
            location: "Rural Area",
            price: "$950,000",
            acres: 25,
            image: "/assets/property3.jpg"
        },
        {
            id: 4,
            type: "residential",
            title: "Luxury Family Home",
            location: "Suburban Area",
            price: "$1,250,000",
            bedrooms: 5,
            bathrooms: 3,
            sqft: 3200,
            image: "/assets/property4.jpg"
        }
    ];

    const filteredProperties = activeFilter === 'all' 
        ? featuredProperties 
        : featuredProperties.filter(property => property.type === activeFilter);

    // Handle manual play of video
    const handlePlayVideo = () => {
        const video = videoRef.current;
        if (video) {
            video.play();
        }
    };

    const handleSearchTypeChange = (type) => {
        setSearchType(type);
    };

    const handleSearchInput = (e) => {
        setSearchQuery(e.target.value);
    };

    const handleSearch = () => {
        console.log('Search:', searchQuery, searchType);
    };

    // Category-specific search options
    const getSearchOptions = (category) => {
        switch(category) {
            case "commercial":
                return [
                    { value: "lease", label: "Lease" },
                    { value: "purchase", label: "Purchase" },
                    { value: "invest", label: "Invest" }
                ];
            case "farms":
                return [
                    { value: "buy", label: "Buy" },
                    { value: "lease", label: "Lease" },
                    { value: "invest", label: "Invest" }
                ];
            default: // residential
                return [
                    { value: "buy", label: "Buy" },
                    { value: "rent", label: "Rent" },
                    { value: "invest", label: "Invest" }
                ];
        }
    };

    const handleCategoryClick = (categoryId) => {
        setSelectedCategory(categoryId);
        
        // Set default search type based on category
        switch(categoryId) {
            case "residential":
                setSearchType("buy");
                break;
            case "commercial":
                setSearchType("purchase");
                break;
            case "farms":
                setSearchType("invest");
                break;
            default:
                setSearchType("buy");
        }
    };

    return (
        <div className="find-property-page">
            {/* Hero Section with Video Background */}
            <section className="hero-section">
                <div className="hero-content container">
                    <video 
                        ref={videoRef}
                        autoPlay 
                        muted 
                        playsInline 
                        className="background-video"
                        key={currentVideoIndex}
                    >
                        <source src={backgroundVideos[currentVideoIndex]} type="video/mp4" />
                        Your browser does not support the video tag.
                    </video>
                    <div className="video-overlay"></div>

                    <div className="text-content">
                        <h1 className="hero-title">
                            Find Your <span className="accent-text">Perfect</span> Property
                        </h1>
                        <p className="hero-subtitle">
                            Discover exceptional properties tailored to your unique requirements
                        </p>
                    </div>

                    {/* Property Categories */}
                    <div className={animationClasses.categoriesContainer}>
                        {categories.map((category, index) => (
                            <div 
                                key={category.id} 
                                className={`${animationClasses.categoryCard} ${selectedCategory === category.id ? 'active' : ''}`}
                                onClick={() => handleCategoryClick(category.id)}
                            >
                                <div className="category-link">
                                    <div className="category-icon-container">
                                        {category.icon}
                                    </div>
                                    <h3 className="category-title">{category.title}</h3>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Advanced Search Bar */}
                    <div className={animationClasses.searchContainer} style={{ animationDelay: "0.8s" }}>
                        <div className="search-box">
                            <div className="search-options">
                                {getSearchOptions(selectedCategory).map((option) => (
                                    <button 
                                        key={option.value}
                                        type="button"
                                        className={`option-btn ${searchType === option.value ? "active" : ""}`}
                                        onClick={() => handleSearchTypeChange(option.value)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            
                            <div className="search-input-container">
                                <div className="search-input-wrapper">
                                    <FaMapMarkerAlt className="search-icon" />
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder={`Search ${selectedCategory} properties by location or postcode...`}
                                        value={searchQuery}
                                        onChange={handleSearchInput}
                                        ref={inputRef}
                                    />
                                </div>
                                <button 
                                    type="button"
                                    className="search-button"
                                    onClick={handleSearch}
                                >
                                    <FaSearch className="btn-icon" /> Search
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Property Owner Section */}
            <section className="owner-options-section">
                <div className="owner-content">
                    <h2 className="owner-title">Ready to List Your Property?</h2>
                    <p className="owner-text">
                        Join thousands of successful property owners who trust us with their listings. 
                        Get started in minutes and reach potential buyers and tenants today.
                    </p>
                    <Link to="/seller" className="owner-link">
                        Start Listing Now <span className="arrow">→</span>
                    </Link>
                </div>
            </section>

            {/* Featured Properties Section */}
            <section className="featured-properties-section">
                <div className="section-header">
                    <h2 className="section-title">Featured Properties</h2>
                    <p className="section-subtitle">
                        Explore our handpicked selection of exceptional properties, 
                        each offering unique features and prime locations
                    </p>
                </div>
                <div className="filter-tabs">
                    {filters.map(filter => (
                        <button 
                            key={filter.id}
                            className={`filter-btn ${activeFilter === filter.id ? 'active' : ''}`}
                            onClick={() => setActiveFilter(filter.id)}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
                <div 
                    className={animationClasses.propertiesGrid}
                >
                    {filteredProperties.map((property, index) => (
                        <div 
                            key={property.id} 
                            className={animationClasses.propertyCard}
                            style={{ animationDelay: `${index * 0.2}s` }}
                        >
                            <div className="property-image">
                                <img src={property.image} alt={property.title} />
                                <div className="property-badge">{property.type}</div>
                                <button className="favorite-btn">♡</button>
                            </div>
                            <div className="property-content">
                                <h3 className="property-title">{property.title}</h3>
                                <p className="property-location">
                                    <FaMapMarkerAlt /> {property.location}
                                </p>
                                <p className="property-price">{property.price}</p>
                                <div className="property-details">
                                    {property.bedrooms && (
                                        <span><FaHome /> {property.bedrooms} bd</span>
                                    )}
                                    {property.bathrooms && (
                                        <span><i className="fa fa-bath"></i> {property.bathrooms} ba</span>
                                    )}
                                    {property.sqft && (
                                        <span><FaRegBuilding /> {property.sqft} sqft</span>
                                    )}
                                    {property.acres && (
                                        <span><FaTree /> {property.acres} acres</span>
                                    )}
                                </div>
                                <Link to={`/property/${property.id}`} className="view-details-btn">
                                    View Details
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* All Properties Section */}
            <section className="all-properties-section">
                <div className="section-header">
                    <h2 className="section-title">Browse All Properties</h2>
                    <p className="section-subtitle">
                        Find your perfect property from our extensive collection
                    </p>
                </div>
                <div className="property-categories">
                    <div className="category-item">
                        <div className="category-icon">
                            <i className="fas fa-home"></i>
                        </div>
                        <h3>Residential</h3>
                        <p>Homes, Apartments, Condos</p>
                        <span className="property-count">2,500+ Properties</span>
                    </div>
                    <div className="category-item">
                        <div className="category-icon">
                            <i className="fas fa-building"></i>
                        </div>
                        <h3>Commercial</h3>
                        <p>Offices, Retail, Industrial</p>
                        <span className="property-count">1,200+ Properties</span>
                    </div>
                    <div className="category-item">
                        <div className="category-icon">
                            <i className="fas fa-tree"></i>
                        </div>
                        <h3>Land & Farms</h3>
                        <p>Agricultural, Development</p>
                        <span className="property-count">800+ Properties</span>
                    </div>
                </div>
            </section>

            {/* Services Grid */}
            <section className="services-section">
                <div className="container">
                    <div className="section-header">
                        <h2 className="section-title">Our Property Services</h2>
                        <p className="section-subtitle">
                            From finding your dream home to securing commercial investments, we have expertise across all property sectors
                        </p>
                    </div>

                    <div 
                        className={animationClasses.servicesGrid}
                    >
                        {[
                            { title: "Buy a residential property", desc: "From flats to houses, downsizing to upsizing, our local agents can guide you through the process." },
                            { title: "Buy a commercial property", desc: "Unlock commercial value with our expert team covering retail, industrial, and office spaces." },
                            { title: "Buy a farm or rural land", desc: "Specialists in rural land and farm investment, helping you uncover the best opportunities." },
                            { title: "Rent a residential property", desc: "From viewings to applications, we'll support you at every step of renting a home." },
                            { title: "Lease a commercial property", desc: "Expert advice on all market sectors for leasing commercial spaces." },
                            { title: "Buy a new-build home", desc: "Guidance on upcoming developments and new home purchases." }
                        ].map((service, index) => (
                            <div 
                                key={index} 
                                className={animationClasses.serviceCard}
                                style={{ animationDelay: `${index * 0.2}s` }}
                            >
                                <div className="service-content">
                                    <p className="service-badge">SERVICE</p>
                                    <h3 className="service-title">{service.title}</h3>
                                    <p className="service-description">{service.desc}</p>
                                    <Link to="#" className="service-link">
                                        Find out more
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="cta-container">
                        <Link to="/services" className="main-cta-button">
                            Explore All Services
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default FindProperty;
