import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./FindProperty.css";
import { FaSearch, FaHome, FaBuilding, FaTree, FaMapMarkerAlt, FaRegBuilding, FaChevronLeft, FaChevronRight, FaBath } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import LocationSearch from "../components/LocationSearch";
import Navbar from "../components/Navbar";

const BACKGROUND_VIDEOS = [
    "/videos/background.mp4",
    "/videos/background-1.mp4",
    "/videos/background-2.mp4",
    "/videos/background-3.mp4",
    "/videos/background-4.mp4",
    "/videos/background-5.mp4",
    "/videos/background-6.mp4",
];

const getNextVideoIndex = (index) => (index + 1) % BACKGROUND_VIDEOS.length;

const HERO_POSTER = "/assets/bg-1.jpg";

// Skip black frames at the start of MP4 files
const INTRO_SKIP_SEC = 0.15;
const CLIP_DURATION_MS = 5000;
const SLIDE_MS = 900;

const waitForVideoFrame = (videoEl) =>
    new Promise((resolve) => {
        if (!videoEl) {
            resolve();
            return;
        }

        if (typeof videoEl.requestVideoFrameCallback === "function") {
            videoEl.requestVideoFrameCallback(() => resolve());
            return;
        }

        const onTimeUpdate = () => {
            if (videoEl.currentTime > INTRO_SKIP_SEC) {
                videoEl.removeEventListener("timeupdate", onTimeUpdate);
                resolve();
            }
        };

        videoEl.addEventListener("timeupdate", onTimeUpdate);
        window.setTimeout(resolve, 120);
    });

const FindProperty = () => {
    const [searchType, setSearchType] = useState("buy");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedRadius, setSelectedRadius] = useState("3");
    const [isLoaded, setIsLoaded] = useState(false);
    const [activeFilter, setActiveFilter] = useState("all");
    const [selectedCategory, setSelectedCategory] = useState("residential");
    const videoRefA = useRef(null);
    const videoRefB = useRef(null);
    const heroBackgroundRef = useRef(null);
    const activeLayerRef = useRef("a");
    const videoIndexRef = useRef(0);
    const transitioningRef = useRef(false);
    const inputRef = useRef(null);
    const propertiesGridRef = useRef(null);
    const [favorites, setFavorites] = useState([]);
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    

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


    const getVideoEl = (layer) => (layer === "a" ? videoRefA.current : videoRefB.current);

    const setVideoState = useCallback((layer, state) => {
        const el = getVideoEl(layer);
        if (!el) return;
        el.classList.remove(
            "is-active",
            "is-offscreen-right",
            "is-exiting",
            "is-entering",
            "is-hidden"
        );
        if (state) {
            el.classList.add(`is-${state}`);
        }
    }, []);

    const triggerHorizontalSlide = useCallback((outgoing, incoming) => {
        outgoing.classList.remove("is-active");
        incoming.classList.remove("is-offscreen-right");

        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    outgoing.classList.add("is-exiting");
                    incoming.classList.add("is-entering");
                    window.setTimeout(resolve, SLIDE_MS);
                });
            });
        });
    }, []);

    const ensureVideoReady = useCallback((videoEl, index) => {
        if (!videoEl) return Promise.resolve();

        const src = BACKGROUND_VIDEOS[index];

        if (videoEl.dataset.index === String(index) && videoEl.readyState >= 3) {
            return Promise.resolve(videoEl);
        }

        return new Promise((resolve, reject) => {
            const onReady = () => {
                cleanup();
                videoEl.dataset.index = String(index);
                resolve(videoEl);
            };

            const onError = () => {
                cleanup();
                reject(new Error(`Failed to load video ${index}`));
            };

            const cleanup = () => {
                videoEl.removeEventListener("canplaythrough", onReady);
                videoEl.removeEventListener("canplay", onReady);
                videoEl.removeEventListener("error", onError);
            };

            videoEl.addEventListener("canplaythrough", onReady);
            videoEl.addEventListener("canplay", onReady);
            videoEl.addEventListener("error", onError);

            if (videoEl.dataset.index !== String(index)) {
                videoEl.src = src;
                videoEl.load();
            }
        });
    }, []);

    const advanceVideo = useCallback(async () => {
        if (transitioningRef.current) return;

        const currentLayer = activeLayerRef.current;
        const incomingLayer = currentLayer === "a" ? "b" : "a";
        const nextIndex = getNextVideoIndex(videoIndexRef.current);
        const outgoing = getVideoEl(currentLayer);
        const incoming = getVideoEl(incomingLayer);

        if (!outgoing || !incoming) return;

        transitioningRef.current = true;

        try {
            await ensureVideoReady(incoming, nextIndex);
            incoming.currentTime = INTRO_SKIP_SEC;
            setVideoState(incomingLayer, "offscreen-right");

            await incoming.play();
            await waitForVideoFrame(incoming);

            await triggerHorizontalSlide(outgoing, incoming);

            outgoing.classList.remove("is-exiting");
            incoming.classList.remove("is-entering");
            setVideoState(currentLayer, "hidden");
            setVideoState(incomingLayer, "active");
            outgoing.pause();
            outgoing.currentTime = 0;

            activeLayerRef.current = incomingLayer;
            videoIndexRef.current = nextIndex;

            ensureVideoReady(outgoing, getNextVideoIndex(nextIndex)).catch(() => {});
        } catch (_) {
            setVideoState(currentLayer, "active");
            setVideoState(incomingLayer, "hidden");
            incoming.pause();
        } finally {
            transitioningRef.current = false;
        }
    }, [ensureVideoReady, setVideoState, triggerHorizontalSlide]);

    // Set page as loaded immediately
    useEffect(() => {
        setIsLoaded(true);
        document.querySelector('.hero-content')?.classList.add('loaded');
    }, []);

    // Start hero playback; warm remaining clips after the first is playing
    useEffect(() => {
        let cancelled = false;
        let clipIntervalId = null;

        const warmRemainingVideos = () => {
            BACKGROUND_VIDEOS.slice(1).forEach((src) => {
                const cacheVideo = document.createElement("video");
                cacheVideo.preload = "auto";
                cacheVideo.muted = true;
                cacheVideo.src = src;
                cacheVideo.load();
            });
        };

        const startHeroVideo = async () => {
            const firstVideo = videoRefA.current;
            if (!firstVideo || cancelled) return;

            setVideoState("a", "active");
            setVideoState("b", "hidden");

            try {
                await ensureVideoReady(firstVideo, 0);
                firstVideo.currentTime = INTRO_SKIP_SEC;
                await firstVideo.play();
                await waitForVideoFrame(firstVideo);
                heroBackgroundRef.current?.classList.add("is-ready");
                ensureVideoReady(videoRefB.current, getNextVideoIndex(0)).catch(() => {});
                warmRemainingVideos();

                if (!cancelled) {
                    clipIntervalId = window.setInterval(advanceVideo, CLIP_DURATION_MS);
                }
            } catch (_) {
                // Ignore autoplay restrictions
            }
        };

        startHeroVideo();

        return () => {
            cancelled = true;
            if (clipIntervalId) {
                window.clearInterval(clipIntervalId);
            }
        };
    }, [advanceVideo, ensureVideoReady, setVideoState]);

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

    const filteredFeaturedProperties = activeFilter === 'all' 
        ? featuredProperties 
        : featuredProperties.filter(property => property.type === activeFilter);

    const handleSearchTypeChange = (type) => {
        setSearchType(type);
    };

    // Map search type (buy/rent/lease) to database category (sale/rent/lease)
    const mapSearchTypeToCategory = (type) => {
        const mapping = {
            'buy': 'sale',
            'purchase': 'sale',
            'rent': 'rent',
            'lease': 'lease'
        };
        return mapping[type] || 'sale';
    };

    // Map selected category to property_category (residential/commercial/land)
    const mapCategoryToPropertyCategory = (category) => {
        const mapping = {
            'residential': 'residential',
            'commercial': 'commercial',
            'farms': 'land'
        };
        return mapping[category] || 'residential';
    };

    // Search handler - navigate to SearchResults page
    const handleSearch = () => {
        if (!searchQuery || searchQuery.trim().length < 3) {
            alert('Please enter at least 3 characters for location search');
            return;
        }

        // Map search type and category
        const category = mapSearchTypeToCategory(searchType);
        const propertyCategory = mapCategoryToPropertyCategory(selectedCategory);

        // Navigate to SearchResults with query parameters
        const searchParams = new URLSearchParams({
            q: searchQuery.trim(),
            category: category,
            propertyCategory: propertyCategory,
            radius: selectedRadius,
            searchType: searchType
        });

        navigate(`/search-results?${searchParams.toString()}`);
    };

    // Category-specific search options
    const getSearchOptions = (category) => {
        switch(category) {
            case "commercial":
                return [
                    { value: "buy", label: "Buy" },
                    { value: "lease", label: "Lease" }
                ];
            case "farms":
                return [
                    { value: "buy", label: "Buy" },
                    { value: "lease", label: "Lease" }
                ];
            default: // residential - Only Buy and Rent (no Lease)
                return [
                    { value: "buy", label: "Buy" },
                    { value: "rent", label: "Rent" }
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
                setSearchType("buy");
                break;
            case "farms":
                setSearchType("buy");
                break;
            default:
                setSearchType("buy");
        }
    };

    const scrollLeft = () => {
        if (propertiesGridRef.current) {
            propertiesGridRef.current.scrollBy({
                left: -400,
                behavior: 'smooth'
            });
        }
    };

    const scrollRight = () => {
        if (propertiesGridRef.current) {
            propertiesGridRef.current.scrollBy({
                left: 400,
                behavior: 'smooth'
            });
        }
    };

    const handleFavoriteClick = (propertyId) => {
        setFavorites(prev => 
            prev.includes(propertyId) 
                ? prev.filter(id => id !== propertyId)
                : [...prev, propertyId]
        );
    };

    const handleStartListing = () => {
        if (isAuthenticated) {
            // If authenticated, go directly to seller page
            navigate('/seller');
        } else {
            // If not authenticated, redirect to login with return path
            navigate('/login', { state: { from: '/seller' } });
        }
    };

    return (
        <div className="find-property-page">
            {/* Hero Section with Video Background */}
            <section
                className="hero-section"
                style={{ backgroundImage: `url(${HERO_POSTER})` }}
            >
                <Navbar variant="hero" />
                <div
                    className="hero-background"
                    ref={heroBackgroundRef}
                    aria-hidden="true"
                    style={{ backgroundImage: `url(${HERO_POSTER})` }}
                >
                    <video
                        ref={videoRefA}
                        className="background-video is-active"
                        src={BACKGROUND_VIDEOS[0]}
                        poster={HERO_POSTER}
                        data-index="0"
                        autoPlay
                        muted
                        playsInline
                        preload="auto"
                    />
                    <video
                        ref={videoRefB}
                        className="background-video is-hidden"
                        muted
                        playsInline
                        preload="auto"
                    />
                    <div className="video-overlay"></div>
                </div>

                <div className="hero-content container">
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
                                    <LocationSearch
                                        searchQuery={searchQuery}
                                        onSearchQueryChange={setSearchQuery}
                                        radius={selectedRadius}
                                        onRadiusChange={setSelectedRadius}
                                        placeholder={`Search ${selectedCategory} properties by location or postcode...`}
                                        disabled={false}
                                        isSearching={false}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && searchQuery.trim().length >= 3) {
                                                handleSearch();
                                            }
                                        }}
                                        inputRef={inputRef}
                                        className="find-property-location-search"
                                    />
                                </div>
                                <button 
                                    type="button"
                                    className="search-button"
                                    onClick={handleSearch}
                                    disabled={!searchQuery || searchQuery.trim().length < 3}
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
                    <h2 className="owner-title animate-on-scroll">Ready to List Your Property?</h2>
                    <p className="owner-text animate-on-scroll">
                        Join thousands of successful property owners who trust us with their listings. 
                        Get started in minutes and reach potential buyers and tenants today.
                    </p>
                    <button 
                        className="start-listing-btn"
                        onClick={handleStartListing}
                    >
                        Start Listing Now
                    </button>
                </div>
            </section>
           {/*put your home in expert hands*/}
            <section className="expert-section animate-on-scroll">
                <div className="expert-content">
                    <h2 className="expert-title">Put your home in expert hands</h2>
                    <p className="expert-desc">
                        Moving with us means local insight, honest advice and exceptional service – every step of the way.<br />
                        Let our clients tell you why they recommend a move with Savills.
                    </p>
                    <a href="#" className="expert-cta">FIND OUT MORE <span>&#9654;</span></a>
                </div>
                <div className="expert-image">
                    <img src="/assets/pexels-a-darmel-7641857.jpg" alt="Happy clients" />
                </div>
            </section>

            {/* Services Grid */}
            <section className="services-section">
                <div className="container">
                    <div className="section-header">
                        <h2 className="section-title animate-on-scroll">Looking for the right place or space?</h2>
                        <p className="section-subtitle animate-on-scroll">
                            Find the property that brings your vision to life. Tell us your wants, needs and aspirations and we won't stop until we've found you the right fit. From first homes to rural land and commercial opportunities, we have a specialist expert that knows the market inside out. 
                        </p>
                    </div>

                    <div className={animationClasses.servicesGrid}>
                        {[
                            { title: "Buy a residential property", desc: "From flats to houses, downsizing to upsizing, our local agents can guide you through the process." },
                            { title: "Buy a commercial property", desc: "Unlock commercial value with our expert team covering retail, industrial, and office spaces." },
                            { title: "Buy a farm or rural land", desc: "Specialists in rural land and farm investment, helping you uncover the best opportunities." },
                            { title: "Rent a residential property", desc: "From viewings to applications, we'll support you at every step of renting a home." },
                            { title: "Lease a commercial property", desc: "Expert advice on all market sectors for leasing commercial spaces." },
                            { title: "Buy a new-build home", desc: "Guidance on upcoming developments and new home purchases." },
                            { title: "Buy an international property", desc: "With international reach, we help you find and buy property abroad with confidence." },
                            { title: "Rent an international property", desc: "Access a world of rental opportunities with our global property network." },
                            { title: "Buy a property at auction", desc: "After securing your finance, we'll show you what's available through the process of buying at auction." }
                        ].map((service, index) => (
                            <div 
                                key={index} 
                                className={`${animationClasses.serviceCard} service-card-bg`}
                                style={{
                                    animationDelay: `${index * 0.2}s`,
                                    backgroundImage: `url(/assets/bg-${index + 1}.jpg)`
                                }}
                            >
                                <div className="service-card-overlay"></div>
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

            <footer className="footer-section">
                <div className="footer-container">
                    <div className="footer-brand animate-on-scroll">
                        <h3>Sh.R Property</h3>
                        <p>Your trusted partner in real estate. Discover, buy, rent, or sell with confidence.</p>
                    </div>
                    <div className="footer-links animate-on-scroll">
                        <h4>Quick Links</h4>
                        <ul>
                            <li><Link to="/">Home</Link></li>
                            <li><Link to="/buy">Buy</Link></li>
                            <li><Link to="/rent">Rent</Link></li>
                            <li><Link to="/services">Services</Link></li>
                            <li><Link to="/contact">Contact</Link></li>
                        </ul>
                    </div>
                    <div className="footer-contact animate-on-scroll">
                        <h4>Contact Us</h4>
                        <p>Email: info@ShProperty.com</p>
                        <p>Phone: +44 7398593360</p>
                        <div className="footer-social">
                            <a href="#" aria-label="Facebook"><i className="fab fa-facebook-f"></i></a>
                            <a href="#" aria-label="Twitter"><i className="fab fa-twitter"></i></a>
                            <a href="#" aria-label="Instagram"><i className="fab fa-instagram"></i></a>
                            <a href="#" aria-label="LinkedIn"><i className="fab fa-linkedin-in"></i></a>
                        </div>
                    </div>
                </div>
                <div className="footer-bottom animate-on-scroll">
                    <p>&copy; {new Date().getFullYear()} SH.RProperty. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

export default FindProperty;
