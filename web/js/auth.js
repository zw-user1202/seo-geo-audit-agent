/**
 * Authentication Utilities
 * Frontend authentication logic for login, logout, and session management
 */

// Use existing API_BASE if already defined (from api.js), otherwise define it
if (typeof window.API_BASE === 'undefined') {
    window.API_BASE = '/api';
}
// Use window.API_BASE directly to avoid const redeclaration

/**
 * Login user
 * @param {string} username 
 * @param {string} password 
 * @param {boolean} rememberMe 
 */
async function login(username, password, rememberMe = false) {
    const response = await fetch(`${window.API_BASE}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password, rememberMe })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();

    // Store user info in sessionStorage
    sessionStorage.setItem('user', JSON.stringify(data.user));

    // Redirect to home page
    window.location.href = '/app.html';
}

/**
 * Logout user
 */
async function logout() {
    try {
        await fetch(`${window.API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    // Clear session storage
    sessionStorage.removeItem('user');

    // Redirect to login
    window.location.href = '/login.html';
}

/**
 * Check if user is authenticated
 * Redirects to login if not authenticated
 * @returns {Promise<Object>} User object
 */
async function checkAuth() {
    try {
        const response = await fetch(`${window.API_BASE}/check-session`, {
            credentials: 'include'
        });

        if (!response.ok) {
            // Not authenticated, redirect to login
            window.location.href = '/login.html';
            return null;
        }

        const data = await response.json();

        // Store user info
        sessionStorage.setItem('user', JSON.stringify(data.user));

        return data.user;
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
        return null;
    }
}

/**
 * Get current user from session storage
 * @returns {Object|null} User object or null
 */
function getCurrentUser() {
    const userStr = sessionStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

/**
 * Check if current user is admin
 * @returns {boolean}
 */
function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}
