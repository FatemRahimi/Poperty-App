import React from "react";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Navbar from "./components/Navbar.js";
import PropertyDetails from "./pages/PropertyDetails";
import Search from "./pages/Search.js";
import Dashboard from "./pages/Dashboard.js";
import FindProperty from "./pages/FindProperty";
import Seller from "./pages/Seller";
import Residential from "./pages/Residential";
import Commercial from "./pages/Commercial";
import Farms from "./pages/Farms";
import About from "./pages/About.js";
import Login from "./pages/Login.js";
import Contact from "./pages/Contact.js";
import PasswordReset from "./pages/PasswordReset";

function Layout() {
    const location = useLocation();

    // ✅ Hide Navbar only on the login page
    const hideNavbar = ["/login", "/password"].includes(location.pathname);


    return (
        <div>
            {!hideNavbar && <Navbar />} {/* ✅ Only show navbar if not on login page */}
            <Routes>
                <Route path="/password" element={<PasswordReset />} />
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/property/:id" element={<PropertyDetails />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/find" element={<FindProperty />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/login" element={<Login />} />
                <Route path="/seller" element={<Seller />} />
                <Route path="/residential" element={<Residential />} />
                <Route path="/commercial" element={<Commercial />} />
                <Route path="/farms" element={<Farms />} />
            </Routes>
        </div>
    );
}

function App() {
    return (
        <Router>
            <Layout />
        </Router>
    );
}

export default App;
