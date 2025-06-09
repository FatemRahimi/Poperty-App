import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import "./Login.css"; // Reusing the same CSS
import { useAuth } from "../context/AuthContext"; // Assuming you have AuthContext

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [touched, setTouched] = useState({});
    const [urlMessages, setUrlMessages] = useState({ error: null, success: null });
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated } = useAuth(); // Fixed typo in comment
    

    // Get the redirect path from location state or default to /find
    const from = location.state?.from?.pathname || "/find";

    useEffect(() => {
        // Read URL parameters for errors and success messages
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    const signupSuccess = params.get('signup');
        
        // Set URL-based messages in state
        setUrlMessages({
            error: error === 'user_exists' ? "This email is already registered. Please log in." : null,
            success: signupSuccess === 'success' ? "Account created successfully! Please log in." : null
        });

        // Clear form errors when URL changes
        setErrors({});

        // Auto-dismiss URL messages after 8 seconds
        if (error || signupSuccess) {
            const timer = setTimeout(() => {
                setUrlMessages({ error: null, success: null });
                clearUrlFromAddress();
            }, 8000);
            
            return () => clearTimeout(timer);
        }
    }, [location.search]);

    useEffect(() => {
        // Redirect if already authenticated
        if (isAuthenticated || (localStorage.getItem('token') && localStorage.getItem('user'))) {
            const redirectPath = location.state?.from || '/dashboard';
            navigate(redirectPath, { replace: true });
        }
    }, [isAuthenticated, navigate, location]);

    // Real-time validation
    const validateField = (name, value) => {
        const newErrors = { ...errors };

        switch (name) {
            case 'email':
                if (!value) {
                    newErrors.email = "Email is required";
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    newErrors.email = "Please enter a valid email address";
                } else {
                    delete newErrors.email;
                }
                break;
            case 'password':
                if (!value) {
                    newErrors.password = "Password is required";
                } else if (value.length < 6) {
                    newErrors.password = "Password must be at least 6 characters";
                } else {
                    delete newErrors.password;
                }
                break;
            default:
                break;
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const clearUrlFromAddress = () => {
        // Clear URL parameters from address bar
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    };

    const dismissUrlMessages = () => {
        setUrlMessages({ error: null, success: null });
        clearUrlFromAddress();
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        
        if (name === 'email') {
            setEmail(value);
        } else if (name === 'password') {
            setPassword(value);
        }

        // Clear URL messages when user starts typing
        if (urlMessages.error || urlMessages.success) {
            dismissUrlMessages();
        }

        // Clear server errors when user starts typing
        if (errors[name] || errors.general) {
            const newErrors = { ...errors };
            delete newErrors[name];
            delete newErrors.general;
            setErrors(newErrors);
        }

        // Validate if field has been touched
        if (touched[name]) {
            validateField(name, value);
        }
    };

    const handleBlur = (e) => {
        const { name, value } = e.target;
        setTouched({ ...touched, [name]: true });
        validateField(name, value);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setErrors({});
        dismissUrlMessages();

        // Validate all fields
        const isEmailValid = validateField('email', email);
        const isPasswordValid = validateField('password', password);

        if (!isEmailValid || !isPasswordValid) {
            setIsLoading(false);
            setTouched({ email: true, password: true });
            return;
        }
    
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
                login(data.user, data.token); // Update auth context with user data and token
                
                // Redirect to the page user was trying to access
                navigate(from, { replace: true });
            } else {
                // Handle different types of errors
                const newErrors = {};
                
                if (data.field) {
                    newErrors[data.field] = data.error;
                    
                    // Handle special actions
                    if (data.action === 'suggest_signup') {
                        newErrors.signupSuggestion = true;
                    } else if (data.action === 'use_google') {
                        newErrors.googleSuggestion = true;
                    }
                } else {
                    newErrors.general = data.error || 'Login failed. Please try again.';
                }
                
                setErrors(newErrors);
                setIsLoading(false);
            }
        } catch (err) {
            setErrors({ general: 'Network error. Please check your connection and try again.' });
            setIsLoading(false);
        }
    };

    // Google OAuth login
    const handleGoogleLogin = () => {
        dismissUrlMessages();
        const from = location.state?.from || '/find';
        // Use the backend URL from environment variable or default
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050';
        window.location.href = `${backendUrl}/api/auth/google?redirectTo=${encodeURIComponent(from)}`;
    };

    const getInputClassName = (fieldName) => {
        let className = "form-control";
        if (errors[fieldName]) {
            className += " is-invalid";
        } else if (touched[fieldName] && !errors[fieldName]) {
            className += " is-valid";
        }
        return className;
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

                        {urlMessages.success && (
                            <div className="alert alert-success">
                                {urlMessages.success}
                                <button 
                                    type="button" 
                                    className="alert-close" 
                                    onClick={dismissUrlMessages}
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {urlMessages.error && (
                            <div className="alert alert-info">
                                {urlMessages.error}
                                <button 
                                    type="button" 
                                    className="alert-close" 
                                    onClick={dismissUrlMessages}
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {/* General Error Message */}
                        {errors.general && (
                            <div className="alert alert-danger">
                                {errors.general}
                            </div>
                        )}

                        {/* Google OAuth Button */}
                        <button 
                            type="button" 
                            className="google-login"
                            onClick={handleGoogleLogin}
                            disabled={isLoading}
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
                                name="email"
                                className={getInputClassName('email')}
                                placeholder="Enter your email" 
                                value={email} 
                                onChange={handleInputChange}
                                onBlur={handleBlur}
                                disabled={isLoading}
                                required 
                            />
                            {errors.email && (
                                <div className="field-error">
                                    {errors.email}
                                    {errors.signupSuggestion && (
                                        <div className="error-action mt-2">
                                            <Link 
                                                to="/signup" 
                                                state={{ from: location.state?.from || { pathname: from } }}
                                                className="signup-suggestion-btn"
                                            >
                                                Create an account instead
                                            </Link>
                                        </div>
                                    )}
                                    {errors.googleSuggestion && (
                                        <div className="error-action mt-2">
                                            <button 
                                                type="button" 
                                                className="google-suggestion-btn"
                                                onClick={handleGoogleLogin}
                                            >
                                                Use Google Sign-In
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
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
                                name="password"
                                className={getInputClassName('password')}
                                placeholder="Enter your password" 
                                value={password} 
                                onChange={handleInputChange}
                                onBlur={handleBlur}
                                disabled={isLoading}
                                required 
                            />
                            {errors.password && (
                                <div className="field-error">
                                    {errors.password}
                            </div>
                            )}
                        </div>
                        
                        {/* Submit Button */}
                        <button 
                            type="submit" 
                            className="sign-in-btn btn btn-dark w-100 py-2"
                            disabled={isLoading || Object.keys(errors).length > 0}
                        >
                            {isLoading ? (
                                <span>
                                    <span className="spinner"></span>
                                    Signing in...
                                </span>
                            ) : "Sign in"}
                        </button>
                        
                        <p className="login-text mt-4">
                            Don't have an account? <Link 
                                to="/signup" 
                                state={{ from: location.state?.from || { pathname: from } }}
                            >
                                Sign up
                            </Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login; 