import React from "react";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Navbar from "./components/Navbar.js";
import PropertyDetails from "./pages/PropertyDetails";
import Search from "./pages/Search.js";
import Dashboard from "./pages/Dashboard.js";
import FindProperty from "./pages/FindProperty";
import Login from "./pages/Login.js";
import PasswordReset from "./pages/PasswordReset";
import Signup from "./pages/Signup.js";
import SellerForm from "./pages/SellerForm"; 
import AddList from "./pages/AddList.js";
import AddListNext from "./pages/AddListNext.js";
import AddLease from "./pages/AddLease.js";
import AddLeaseNext from "./pages/AddLeaseNext.js";
import AdditionalListing from "./pages/AdditionalListing.js";
import OAuthCallback from "./pages/OAuthCallback";
import Logout from "./pages/Logout";
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ResetPassword from "./pages/ResetPassword";
import AddRent from "./pages/AddRent";

function Layout() {
    const location = useLocation();

    // Hide Navbar only on the login, password, signup pages
    const hideNavbar = ["/login", "/password", "/signup", "/addlist", "/addlistnext", "/addlease", "/additional-listing/sale", "/additional-listing/lease", "/addleasenext", "/addrent"].includes(location.pathname);

    return (
        <div>
            {!hideNavbar && <Navbar />}
            <Routes>
                {/* Public Routes */}
                <Route path="/password" element={<PasswordReset />} />
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/property/:id" element={<PropertyDetails />} />
                <Route path="/find" element={<FindProperty />} />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<OAuthCallback />} />
                <Route path="/signup" element={<Signup/>}/>
                <Route path="/logout" element={<Logout />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                
                {/* Protected Routes - Require Authentication */}
                <Route path="/dashboard" element={
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                } />
                
                <Route path="/seller" element={
                    <ProtectedRoute>
                        <SellerForm />
                    </ProtectedRoute>
                } />
                
                <Route path="/addlist" element={
                    <ProtectedRoute>
                        <AddList />
                    </ProtectedRoute>
                } />
                
                <Route path="/addlistnext" element={
                    <ProtectedRoute>
                        <AddListNext />
                    </ProtectedRoute>
                } />
                
                <Route path="/addlease" element={
                    <ProtectedRoute>
                        <AddLease />
                    </ProtectedRoute>
                } />
                
                <Route path="/addleasenext" element={
                    <ProtectedRoute>
                        <AddLeaseNext />
                    </ProtectedRoute>
                } />
                
                <Route path="/additional-listing/:type" element={
                    <ProtectedRoute>
                        <AdditionalListing />
                    </ProtectedRoute>
                } />
                
                <Route path="/addrent" element={
                    <ProtectedRoute>
                        <AddRent />
                    </ProtectedRoute>
                } />
            </Routes>
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <Router>
                <Layout />
            </Router>
        </AuthProvider>
    );
}

export default App;