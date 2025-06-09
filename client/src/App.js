import React from "react";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Navbar from "./components/Navbar.js";
import Search from "./pages/Search.js";
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
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard from "./pages/UserDashboard";

function Layout() {
    const location = useLocation();

    // Hide Navbar on login, password, signup pages, admin login, and admin dashboard
    const hideNavbar = ["/login", "/password", "/signup", "/addlist", "/addlistnext", "/addlease", "/additional-listing/sale", "/additional-listing/lease", "/addleasenext", "/addrent", "/admin-x9k7m2p5q8", "/admin/dashboard", "/dashboard"].includes(location.pathname);

    return (
        <div>
            {!hideNavbar && <Navbar />}
            <Routes>
                {/* Public Routes */}
                <Route path="/password" element={<PasswordReset />} />
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/find" element={<FindProperty />} />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<OAuthCallback />} />
                <Route path="/signup" element={<Signup/>}/>
                <Route path="/logout" element={<Logout />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                
                {/* Secure Admin Route */}
                <Route path="/admin-x9k7m2p5q8" element={<AdminLogin />} />
                
                {/* Admin Dashboard - Protected Route */}
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                
                {/* Protected Routes - Require Authentication */}
         
                <Route path="/seller" element={
                    <ProtectedRoute>
                        <SellerForm />
                    </ProtectedRoute>
                } />
                
                <Route path="/dashboard" element={
                    <ProtectedRoute>
                        <UserDashboard />
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