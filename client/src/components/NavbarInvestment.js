import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./Navbar.css";

const Navbar = () => {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <nav className="navbar">
            <div className="navbar-logo">Sh.R PROPERTY</div>

            {/* Hamburger Icon for Mobile */}
            <div className="navbar-menu-icon" onClick={() => setMenuOpen(!menuOpen)}>
                ☰
            </div>

            {/* Small Dropdown Menu (Not Overlapping Entire Page) */}
            <ul className={`navbar-links ${menuOpen ? "active" : ""}`}>
                <li><Link to="/" onClick={() => setMenuOpen(false)}>Home</Link></li>
                <li><Link to="/search" onClick={() => setMenuOpen(false)}>Search</Link></li>
                <li><Link to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link></li>
                <li><Link to="/login" onClick={() => setMenuOpen(false)}>Login</Link></li>
            </ul>
        </nav>
    );
};

export default Navbar;
