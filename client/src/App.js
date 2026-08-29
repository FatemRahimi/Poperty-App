import React from "react";
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.js";
import Search from "./pages/Search.js";
import FindProperty from "./pages/FindProperty";
import SearchResults from "./pages/SearchResults";
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
import AdvisorProfileCheck from './components/AdvisorProfileCheck';
import ResetPassword from "./pages/ResetPassword";
import AddRent from "./pages/AddRent";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import UserDashboard from "./pages/UserDashboard";
import PropertyView from "./pages/PropertyView";
import AdvisorProfile from "./pages/AdvisorProfile";
import AiServicesRedirect from "./pages/ai/AiServicesRedirect";
import AiHub from "./pages/ai/AiHub";
import AiPricing from "./pages/ai/AiPricing";
import AiDashboard from "./pages/ai/AiDashboard";
import AiListingWriter from "./pages/ai/AiListingWriter";
import AiValuation from "./pages/ai/AiValuation";
import AiBuyerMatch from "./pages/ai/AiBuyerMatch";
import AiHistoryDetail from "./pages/ai/AiHistoryDetail";
import PropertyIntelligence from "./pages/ai/PropertyIntelligence";
import InvestmentAnalyst from "./pages/ai/InvestmentAnalyst";
import RentIntelligence from "./pages/ai/RentIntelligence";
import PortfolioOptimiser from "./pages/ai/PortfolioOptimiser";
import AiHistory from "./pages/ai/AiHistory";

function Layout() {
    const location = useLocation();

    const isFindPropertyPage = location.pathname === "/" || location.pathname === "/find";

    // Hide Navbar on login, password, signup pages, admin login, and admin dashboard
    // FindProperty renders its own hero navbar inside the background image
    const isAiServicesPage = location.pathname.startsWith("/ai-services");
    const hideNavbar = isFindPropertyPage || isAiServicesPage || ["/login", "/password", "/signup", "/addlist", "/addlistnext", "/addlease", "/additional-listing/sale", "/additional-listing/lease", "/addleasenext", "/addrent", "/advisor-profile", "/admin-x9k7m2p5q8", "/admin/dashboard", "/dashboard", "/property"].includes(location.pathname) || location.pathname.startsWith("/property/");

    return (
        <div>
            {!hideNavbar && <Navbar />}
            <Routes>
                {/* Public Routes */}
                <Route path="/password" element={<PasswordReset />} />
                <Route path="/" element={<FindProperty />} />
                <Route path="/search" element={<Search />} />
                <Route path="/find" element={<FindProperty />} />
                <Route path="/search-results" element={<SearchResults />} />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<OAuthCallback />} />
                <Route path="/signup" element={<Signup/>}/>
                <Route path="/logout" element={<Logout />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                <Route path="/property/:slug" element={<PropertyView />} />

                {/* AI Property Intelligence Platform */}
                <Route path="/ai-services" element={<AiHub />} />
                <Route path="/ai-services/home" element={<AiServicesRedirect />} />
                <Route path="/ai-services/property-intelligence" element={
                    <ProtectedRoute>
                        <PropertyIntelligence />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/investment-analyst" element={
                    <ProtectedRoute>
                        <InvestmentAnalyst />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/rent-intelligence" element={
                    <ProtectedRoute>
                        <RentIntelligence />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/portfolio-optimiser" element={
                    <ProtectedRoute>
                        <PortfolioOptimiser />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/pricing" element={<AiPricing />} />
                <Route path="/ai-services/history" element={
                    <ProtectedRoute>
                        <AiHistory />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/dashboard" element={
                    <ProtectedRoute>
                        <AiDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/listing-writer" element={
                    <ProtectedRoute>
                        <AiListingWriter />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/valuation" element={
                    <ProtectedRoute>
                        <AiValuation />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/buyer-match" element={
                    <ProtectedRoute>
                        <AiBuyerMatch />
                    </ProtectedRoute>
                } />
                <Route path="/ai-services/history/:id" element={
                    <ProtectedRoute>
                        <AiHistoryDetail />
                    </ProtectedRoute>
                } />
                
                {/* Secure Admin Route */}
                <Route path="/admin-x9k7m2p5q8" element={<AdminLogin />} />
                
                {/* Admin Dashboard - Protected Route */}
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                
                {/* Protected Routes - Require Authentication */}
         
                <Route path="/seller" element={
                    <ProtectedRoute>
                        <AdvisorProfileCheck>
                            <SellerForm />
                        </AdvisorProfileCheck>
                    </ProtectedRoute>
                } />
                
                <Route path="/dashboard" element={
                    <ProtectedRoute>
                        <UserDashboard />
                    </ProtectedRoute>
                } />
                
                <Route path="/addlist" element={
                    <ProtectedRoute>
                        <AdvisorProfileCheck>
                            <AddList />
                        </AdvisorProfileCheck>
                    </ProtectedRoute>
                } />
                
                <Route path="/addlistnext" element={
                    <ProtectedRoute>
                        <AdvisorProfileCheck>
                            <AddListNext />
                        </AdvisorProfileCheck>
                    </ProtectedRoute>
                } />
                
                <Route path="/addlease" element={
                    <ProtectedRoute>
                        <AdvisorProfileCheck>
                            <AddLease />
                        </AdvisorProfileCheck>
                    </ProtectedRoute>
                } />
                
                <Route path="/addleasenext" element={
                    <ProtectedRoute>
                        <AdvisorProfileCheck>
                            <AddLeaseNext />
                        </AdvisorProfileCheck>
                    </ProtectedRoute>
                } />
                
                <Route path="/additional-listing/:type" element={
                    <ProtectedRoute>
                        <AdvisorProfileCheck>
                            <AdditionalListing />
                        </AdvisorProfileCheck>
                    </ProtectedRoute>
                } />
                
                <Route path="/addrent" element={
                    <ProtectedRoute>
                        <AdvisorProfileCheck>
                            <AddRent />
                        </AdvisorProfileCheck>
                    </ProtectedRoute>
                } />
                
                <Route path="/advisor-profile" element={
                    <ProtectedRoute>
                        <AdvisorProfile />
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