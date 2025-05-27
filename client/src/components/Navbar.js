import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";
import { FaBars, FaTimes, FaSearchLocation, FaChartLine, FaInfoCircle, FaUser, FaGlobe, FaSignOutAlt, FaCheckCircle } from "react-icons/fa";
import { IoMdArrowDropdown } from "react-icons/io";
import Logo from "./Logo";
import "./Logo.css";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const [currentLang, setCurrentLang] = useState("EN");
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout, isAuthenticated } = useAuth();

    // Available languages
    const languages = [
        { code: "EN", name: "English" },
        { code: "FR", name: "Français" },
        { code: "DE", name: "Deutsch" },
        { code: "ES", name: "Español" }
    ];

    // Show success message when user logs in
    useEffect(() => {
        if (isAuthenticated && location.pathname === '/') {
            setShowSuccessMessage(true);
            const timer = setTimeout(() => {
                setShowSuccessMessage(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isAuthenticated, location]);

    // Close menus when route changes
    useEffect(() => {
        setMenuOpen(false);
        setLangMenuOpen(false);
    }, [location]);

    // Add scroll effect
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 50) {
                setScrolled(true);
            } else {
                setScrolled(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, []);

    // Close language dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (langMenuOpen && !event.target.closest('.language-selector')) {
                setLangMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [langMenuOpen]);

    const handleLanguageChange = (langCode) => {
        setCurrentLang(langCode);
        setLangMenuOpen(false);
        // Here you would add logic to actually change the application language
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/find');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    return (
        <nav className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}>
            {showSuccessMessage && (
                <div className="login-success-message">
                    <FaCheckCircle className="success-icon" />
                    <span>Successfully logged out!</span>
                </div>
            )}
            <div className="navbar-container">
                <div className="navbar-logo">
                    <Logo />
                </div>

                <div className="navbar-menu-icon" onClick={() => setMenuOpen(!menuOpen)}>
                    {menuOpen ? <FaTimes /> : <FaBars />}
                </div>

                <ul className={`navbar-links ${menuOpen ? "active" : ""}`}>
                    <li>
                        <Link to="/find" className={location.pathname === "/find" ? "active" : ""}>
                            <FaSearchLocation className="nav-icon" />
                            <span>Find Property</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="/investment" className={location.pathname === "/investment" ? "active" : ""}>
                            <FaChartLine className="nav-icon" />
                            <span>Investment</span>
                        </Link>
                    </li>
                    <li>
                        <Link to="/about" className={location.pathname === "/about" ? "active" : ""}>
                            <FaInfoCircle className="nav-icon" />
                            <span>About Us</span>
                        </Link>
                    </li>
                    
                    {/* Language Selector */}
                    <li className="language-selector">
                        <button 
                            className="language-button" 
                            onClick={(e) => {
                                e.stopPropagation();
                                setLangMenuOpen(!langMenuOpen);
                            }}
                        >
                            <FaGlobe className="nav-icon" />
                            <span>{currentLang}</span>
                            <IoMdArrowDropdown className="dropdown-icon" />
                        </button>
                        
                        {langMenuOpen && (
                            <div className="language-dropdown">
                                {languages.map((lang) => (
                                    <button
                                        key={lang.code}
                                        className={`language-option ${currentLang === lang.code ? 'active' : ''}`}
                                        onClick={() => handleLanguageChange(lang.code)}
                                    >
                                        <span className="lang-code">{lang.code}</span>
                                        <span className="lang-name">{lang.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </li>
                    
                    {/* Auth Button */}
                    <li className="auth-button">
                        {isAuthenticated ? (
                            <button onClick={handleLogout} className="nav-link">
                                <FaSignOutAlt className="nav-icon" />
                                <span>Logout</span>
                            </button>
                        ) : (
                            <Link to="/login" className={location.pathname === "/login" ? "active" : ""}>
                                <FaUser className="nav-icon" />
                                <span>Login</span>
                            </Link>
                        )}
                    </li>
                </ul>
            </div>
        </nav>
    );
};

export default Navbar;