import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import "./FindProperty.css";
import { FaSearch, FaHome, FaBuilding, FaTree, FaMapMarkerAlt, FaRegBuilding } from "react-icons/fa";

const FindProperty = () => {
    const [searchType, setSearchType] = useState("buy");
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoaded, setIsLoaded] = useState(false);
    const [activeFilter, setActiveFilter] = useState("all");
    const videoRef = useRef(null);

    // Property filters
    const filters = [
        { id: "all", label: "All Properties" },
        { id: "residential", label: "Residential" },
        { id: "commercial", label: "Commercial" },
        { id: "land", label: "Land & Farms" }
    ];

    // Set page as loaded and force video to play
    useEffect(() => {
        setIsLoaded(true);
        
        // Handle video loading and force play
        const video = videoRef.current;
        if (video) {
            // Add multiple event listeners to try to ensure play works
            const playVideo = () => {
                // Try to play the video
                const playPromise = video.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        // Video is playing
                        console.log("Video is playing");
                        document.querySelector('.hero-content').classList.add('loaded');
                    }).catch(error => {
                        // Auto-play was prevented
                        console.error("Autoplay prevented:", error);
                        
                        // Add a play button overlay that users can click
                        const heroSection = document.querySelector('.hero-section');
                        if (heroSection && !document.querySelector('.video-play-button')) {
                            const playButton = document.createElement('button');
                            playButton.className = 'video-play-button';
                            playButton.innerHTML = '▶';
                            playButton.onclick = () => {
                                video.play();
                                playButton.style.display = 'none';
                            };
                            heroSection.appendChild(playButton);
                        }
                    });
                }
            };
            
            // Try playing when data is loaded
            video.addEventListener('loadeddata', playVideo);
            // Also try playing when metadata is loaded
            video.addEventListener('loadedmetadata', playVideo);
            // Also try playing when can play
            video.addEventListener('canplay', playVideo);
            // Force play on window focus
            window.addEventListener('focus', playVideo);
            
            // Try playing immediately
            playVideo();

            return () => {
                video.removeEventListener('loadeddata', playVideo);
                video.removeEventListener('loadedmetadata', playVideo);
                video.removeEventListener('canplay', playVideo);
                window.removeEventListener('focus', playVideo);
            };
        }
    }, []);

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
        categoryCard: "category-card animate-on-scroll",
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

    return (
        <div className="find-property-page">
            {/* Hero Section with Video Background */}
            <section className="hero-section" onClick={handlePlayVideo}>
                <div className="hero-content container">
                    <video 
                        ref={videoRef}
                        autoPlay 
                        loop 
                        muted 
                        playsInline 
                        className="background-video"
                    >
                        <source src="/assets/background.mp4" type="video/mp4" />
                        <source src="/assets/background.webm" type="video/webm" />
                        <source src="/assets/background2.mp4" type="video/mp4" />
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
                    <div 
                        className={animationClasses.categoriesContainer}
                    >
                        {categories.map((category, index) => (
                            <div 
                                key={category.id} 
                                className={animationClasses.categoryCard}
                                style={{ animationDelay: `${index * 0.2}s` }}
                            >
                                <Link to={category.path} className="category-link">
                                    <div className="category-icon-container">
                                        {category.icon}
                                    </div>
                                    <h3 className="category-title">{category.title}</h3>
                                </Link>
                            </div>
                        ))}
                    </div>

                    {/* Advanced Search Bar */}
                    <div 
                        className={animationClasses.searchContainer}
                        style={{ animationDelay: "0.8s" }}
                    >
                        <div className="search-box">
                            <div className="search-options">
                                <button 
                                    className={`option-btn ${searchType === "buy" ? "active" : ""}`}
                                    onClick={() => setSearchType("buy")}
                                >
                                    Buy
                                </button>
                                <button 
                                    className={`option-btn ${searchType === "rent" ? "active" : ""}`}
                                    onClick={() => setSearchType("rent")}
                                >
                                    Rent
                                </button>
                                <button 
                                    className={`option-btn ${searchType === "invest" ? "active" : ""}`}
                                    onClick={() => setSearchType("invest")}
                                >
                                    Invest
                                </button>
                            </div>
                            
                            <div className="search-input-container">
                                <div className="search-input-wrapper">
                                    <FaMapMarkerAlt className="search-icon" />
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder="Search by location, postcode, or property name..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <button className="search-button">
                                    <FaSearch className="btn-icon" /> Search
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Seller Call to Action */}
            <section className="seller-section">
                <div className="container">
                    <p className="seller-text">
                        Are you looking to sell your property? <Link to="/login" className="seller-link">Click here</Link> to get started.
                    </p>
                </div>
            </section>

            {/* Featured Properties Section */}
            <section className="featured-section">
                <div className="container">
                    <div className="section-header">
                        <h2 className="section-title">Featured Properties</h2>
                        <p className="section-subtitle">
                            Discover our selection of premium properties across various categories
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
