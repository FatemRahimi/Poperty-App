import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "./Login.css"; // Reusing the same CSS
import { useAuth } from "../context/AuthContext"; // Assuming you have AuthContext

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    const signupSuccess = params.get('signup');
    const { login } = useAuth(); // Assuming useAuth hook exists

    useEffect(() => {
        // Clear any previous error when component mounts or URL params change
        setErrorMsg("");
    }, [location]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");
    
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include',
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Login successful
                login(data); // Update auth context with user data
                
                // Redirect to dashboard or the page user was trying to access
                const from = location.state?.from?.pathname || "/dashboard";
                navigate(from);
            } else {
                setErrorMsg(data.error || 'Invalid email or password');
                setIsLoading(false);
            }
        } catch (err) {
            setErrorMsg('An error occurred. Please try again.');
            setIsLoading(false);
        }
    };

    // Google OAuth login
    const handleGoogleLogin = () => {
        window.location.href = 'http://localhost:5050/api/auth/google';
    };
    
    return (
        <div className="login-page-container container-fluid d-flex align-items-center justify-content-center">
            <div className="login-page-box">
                <div className="login-video-container">
                    <video autoPlay loop muted playsInline className="login-background-video">
                        <source src="/assets/background2.mp4" type="video/mp4" />
                        Your browser does not support the video tag.
                    </video>
                </div>
                <div className="col-md-6 d-flex align-items-center login-form-container">
                    <form className="login-form text-center" onSubmit={handleLogin}>
                        <h2>Sign in to your account</h2>

                        {signupSuccess === 'success' && (
                            <div className="alert alert-success">
                                Account created successfully! Please log in.
                            </div>
                        )}

                        {error === 'user_exists' && (
                            <div className="alert alert-info">
                                This email is already registered. Please log in.
                            </div>
                        )}

                        {/* Google OAuth Button - moved here */}
                        <button 
                            type="button" 
                            className="google-login"
                            onClick={handleGoogleLogin}
                        >
                            <img src="/assets/google-logo.svg" alt="Google" className="google-icon" width="24" />
                            Continue with Google
                        </button>

                        <div className="divider my-4">
                            <span>OR</span>
                        </div>

                        {/* Email Input */}
                        <div className="mb-3 text-start">
                            <label className="form-label"><strong>Email</strong></label>
                            <input 
                                type="email" 
                                className="form-control" 
                                placeholder="Enter your email" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)}
                                required 
                            />
                        </div>
                        
                        {/* Password Input */}
                        <div className="mb-3 text-start">
                            <div className="password-header">
                                <label className="form-label"><strong>Password</strong></label>
                                <Link to="/password" className="forgot-link">
                                    Forgot 
                                </Link>
                            </div>
                            <input 
                                type="password" 
                                className="form-control" 
                                placeholder="Enter your password" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)}
                                required 
                            />
                        </div>
                        
                        {/* Submit Button */}
                        {errorMsg && (
                            <div className="error-box text-center mb-3">
                                {errorMsg}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            className="sign-in-btn btn btn-dark w-100 py-2"
                            disabled={isLoading}
                        >
                            {isLoading ? "Signing in..." : "Sign in"}
                        </button>

                        <p className="login-text mt-4">
                            Don't have an account? <Link to="/signup">Sign up</Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login; 