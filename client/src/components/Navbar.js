import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";
import { FaBars, FaTimes, FaSearchLocation, FaChartLine, FaInfoCircle, FaUser, FaGlobe } from "react-icons/fa";
import { IoMdArrowDropdown } from "react-icons/io";
import Logo from "./Logo";
import "./Logo.css";

const Navbar = () => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const [currentLang, setCurrentLang] = useState("EN");
    const location = useLocation();

    // Available languages
    const languages = [
        { code: "EN", name: "English" },
        { code: "FR", name: "Français" },
        { code: "DE", name: "Deutsch" },
        { code: "ES", name: "Español" }
    ];

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

    return (
        <nav className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}>
            <div className="navbar-container">
                <Link to="/" className="navbar-logo">
                    <Logo />
                </Link>

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
                    
                    <li className="login-button">
                        <Link to="/login" className={location.pathname === "/login" ? "active" : ""}>
                            <FaUser className="nav-icon" />
                            <span>Login</span>
                        </Link>
                    </li>
            </ul>
            </div>
        </nav>
    );
};

export default Navbar;