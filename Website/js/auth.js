/**
 * js/auth.js - The Security Gate
 * Handles authentication logic, API calls for login/register, and user identity.
 */

const Auth = {
    // API Endpoint config
    // Dynamic URL to match the current hostname (localhost vs 127.0.0.1) for Cookie SameSite policy
    API_URL: "https://fectoskills.pythonanywhere.com",

    getToken() {
        return localStorage.getItem('auth_token');
    },

    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = this.getToken();
        if (token) {
            headers['x-auth-token'] = token;
        }
        return headers;
    },

    async getReferrals(code, limit = 10, offset = 0) {
        try {
            const response = await fetch(`${this.API_URL}/api/get_referrals`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ referral_code: code, limit, offset })
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async login(username, password) {
        if (/\s/.test(username) || /\s/.test(password)) {
            return { success: false, error: 'Spaces are not allowed in credentials' };
        }
        try {
            const response = await fetch(`${this.API_URL}/login`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();

            // Hybrid Auth: Save token for fallback if cookies are blocked
            if (data.success && data.data && data.data.user && data.data.user.token) {
                localStorage.setItem('auth_token', data.data.user.token);
            }

            return { ...this.processResponse(data), status: response.status };
        } catch (error) {
            console.error("Login Error:", error);
            return { success: false, error: 'Network error' };
        }
    },

    processResponse(res) {
        if (res.data) {
            // Spread data into root for legacy frontend compatibility
            return { ...res, ...res.data };
        }
        return res;
    },

    async register(userData) {
        const { first_name, last_name, username, password } = userData;
        if ([first_name, last_name, username, password].some(f => f && /\s/.test(f))) {
            return { success: false, error: 'Spaces are not allowed in name, username or password' };
        }

        try {
            const response = await fetch(`${this.API_URL}/register`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            const data = await response.json();

            // Hybrid Auth: Save token for fallback if cookies are blocked
            if (data.success && data.data && data.data.user && data.data.user.token) {
                localStorage.setItem('auth_token', data.data.user.token);
            }

            return { ...this.processResponse(data), status: response.status };
        } catch (error) {
            console.error("Registration Error:", error);
            return { success: false, error: 'Network error' };
        }
    },

    async logout() {
        try {
            localStorage.removeItem('auth_token'); // Clear fallback token
            await fetch(`${this.API_URL}/logout`, { method: 'POST', credentials: 'include' });
        } catch (e) { console.error(e); }

        // Clear local storage
        localStorage.removeItem('earnerState');

        // Reset App State (via App controller if needed, or reload)
        window.location.reload();
    },

    async changePassword(oldPass, newPass) {
        if (/\s/.test(newPass)) {
            return { success: false, error: 'Spaces are not allowed in new password' };
        }
        try {
            const response = await fetch(`${this.API_URL}/api/security/change-password`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ old_password: oldPass, new_password: newPass })
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async deleteAccount(password) {
        try {
            const response = await fetch(`${this.API_URL}/api/security/delete-account`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ password: password })
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async uploadAvatar(file) {
        try {
            const formData = new FormData();
            formData.append('avatar', file);

            const headers = {};
            const token = this.getToken();
            if (token) {
                headers['x-auth-token'] = token;
            }

            const response = await fetch(`${this.API_URL}/api/upload-avatar`, {
                method: 'POST',
                credentials: 'include',
                headers: headers,
                body: formData // No Content-Type header (browser sets it with boundary)
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async updateEmail(email) {
        try {
            const response = await fetch(`${this.API_URL}/api/security/add-email`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ email })
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async sendMessage(message, username = '', sessionId = null) {
        try {
            const response = await fetch(`${this.API_URL}/api/send_message`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ message, username, sender_type: 'user', session_id: sessionId })
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async getChatHistory(limit = 20, offset = 0, username = '', sessionId = '') {
        try {
            const usernameParam = username ? `&username=${encodeURIComponent(username)}` : '';
            const sessionParam = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : '';
            const response = await fetch(`${this.API_URL}/api/chat/history?limit=${limit}&offset=${offset}${usernameParam}${sessionParam}`, {
                method: 'GET',
                credentials: 'include',
                headers: this.getHeaders()
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async submitFeedback(message) {
        try {
            const response = await fetch(`${this.API_URL}/api/submit_feedback`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ message })
            });
            const data = await response.json(); return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async checkAccountStatus(username) {
        try {
            const response = await fetch(`${this.API_URL}/api/check-account-status`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });

            const data = await response.json();
            return this.processResponse(data);
        } catch (e) {
            console.error("Account Check Error:", e);
            return { success: false, error: 'Network error or user not found' };
        }
    }
};

window.Auth = Auth;
