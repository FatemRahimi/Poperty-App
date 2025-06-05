import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./AdminLogin.css";
import { useAuth } from "../context/AuthContext";

const AdminLogin = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [touched, setTouched] = useState({});
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated, user } = useAuth();

    useEffect(() => {
        // If already authenticated and is admin, redirect to admin dashboard
        if (isAuthenticated && user?.role === 'admin') {
            navigate('/admin/dashboard', { replace: true });
        }
        // Note: Don't redirect regular users - let them access admin login if they want
    }, [isAuthenticated, user, navigate]);

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

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        
        if (name === 'email') {
            setEmail(value);
        } else if (name === 'password') {
            setPassword(value);
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setErrors({});

        // Validate all fields
        const isEmailValid = validateField('email', email);
        const isPasswordValid = validateField('password', password);

        if (!isEmailValid || !isPasswordValid) {
            setIsLoading(false);
            setTouched({ email: true, password: true });
            return;
        }

        try {
            const response = await fetch('/api/auth/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include',
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Login successful
                login(data.user, data.token);
                navigate('/admin/dashboard', { replace: true });
            } else {
                // Handle errors
                const newErrors = {};
                if (data.field) {
                    newErrors[data.field] = data.error;
                } else {
                    newErrors.general = data.error || 'Admin login failed. Please try again.';
                }
                setErrors(newErrors);
                setIsLoading(false);
            }
        } catch (err) {
            setErrors({ general: 'Network error. Please check your connection and try again.' });
            setIsLoading(false);
        }
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
        <div className="admin-login-container">
            <div className="admin-login-card">
                <div className="admin-login-header">
                    <h1 className="admin-title">
                        <i className="fas fa-shield-alt me-3"></i>
                        Admin Access
                    </h1>
                    <p className="admin-subtitle">Property Management System</p>
                </div>

                <form className="admin-login-form" onSubmit={handleSubmit}>
                    {/* General Error Message */}
                    {errors.general && (
                        <div className="alert alert-danger">
                            <i className="fas fa-exclamation-triangle me-2"></i>
                            {errors.general}
                        </div>
                    )}

                    {/* Production Notice */}
                    <div className="admin-info-box">
                        <h6><i className="fas fa-shield-alt me-2"></i>Secure Admin Access</h6>
                        <small>
                            This is a secure admin portal.<br />
                            Please enter your authorized credentials.
                        </small>
                    </div>

                    {/* Email Input */}
                    <div className="mb-3">
                        <label className="form-label">
                            <i className="fas fa-envelope me-2"></i>
                            <strong>Admin Email</strong>
                        </label>
                        <input 
                            type="email" 
                            name="email"
                            className={getInputClassName('email')}
                            placeholder="Enter admin email" 
                            value={email} 
                            onChange={handleInputChange}
                            onBlur={handleBlur}
                            disabled={isLoading}
                            required 
                        />
                        {errors.email && (
                            <div className="field-error">
                                <i className="fas fa-times-circle me-1"></i>
                                {errors.email}
                            </div>
                        )}
                    </div>
                    
                    {/* Password Input */}
                    <div className="mb-4">
                        <label className="form-label">
                            <i className="fas fa-lock me-2"></i>
                            <strong>Admin Password</strong>
                        </label>
                        <input 
                            type="password" 
                            name="password"
                            className={getInputClassName('password')}
                            placeholder="Enter admin password" 
                            value={password} 
                            onChange={handleInputChange}
                            onBlur={handleBlur}
                            disabled={isLoading}
                            required 
                        />
                        {errors.password && (
                            <div className="field-error">
                                <i className="fas fa-times-circle me-1"></i>
                                {errors.password}
                            </div>
                        )}
                    </div>
                    
                    {/* Submit Button */}
                    <button 
                        type="submit" 
                        className="admin-login-btn w-100"
                        disabled={isLoading || Object.keys(errors).length > 0}
                    >
                        {isLoading ? (
                            <span>
                                <i className="fas fa-spinner fa-spin me-2"></i>
                                Authenticating...
                            </span>
                        ) : (
                            <span>
                                <i className="fas fa-sign-in-alt me-2"></i>
                                Admin Login
                            </span>
                        )}
                    </button>

                    {/* Back to User Site */}
                    <div className="admin-back-link">
                        <a href="/" className="text-muted">
                            <i className="fas fa-arrow-left me-2"></i>
                            Back to Property Site
                        </a>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin; 