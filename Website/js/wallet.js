/**
 * js/wallet.js - The Financial Core
 * Manages balance, transactions, purchases, and stats.
 */

const Wallet = {
    API_URL: "https://fectoskills.pythonanywhere.com",

    getToken() {
        return Auth.getToken();
    },

    getHeaders() {
        return Auth.getHeaders();
    },

    async fetchFreshStats() {
        try {
            const response = await fetch(`${this.API_URL}/api/refresh_stats`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders()
            });
            const data = await response.json();
            return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            console.error("Stats Fetch Error:", e);
            return { success: false };
        }
    },

    processResponse(res) {
        if (res.data) {
            return { ...res, ...res.data };
        }
        return res;
    },

    async fetchTransactions(limit = 20, offset = 0) {
        try {
            const response = await fetch(`${this.API_URL}/user/transactions`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ limit, offset })
            });
            const resObj = await response.json(); return this.processResponse(resObj);
        } catch (e) {
            return { success: false, transactions: [] };
        }
    },

    async requestWithdrawal(data) {
        try {
            const response = await fetch(`${this.API_URL}/request_withdrawal`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            const resObj = await response.json(); return this.processResponse(resObj);
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async uploadScreenshot(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const headers = {};
            const token = Auth.getToken();
            if (token) {
                headers['x-auth-token'] = token;
            }

            const response = await fetch(`${this.API_URL}/upload_screenshot`, {
                method: 'POST',
                credentials: 'include',
                headers: headers,
                body: formData
            });
            const data = await response.json();
            return { ...this.processResponse(data), status: response.status };
        } catch (e) {
            console.error("Upload Error:", e);
            return { success: false, error: 'Upload failed' };
        }
    },

    async submitPurchase(data) {
        try {
            const response = await fetch(`${this.API_URL}/submit_purchase`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify(data)
            });
            const resObj = await response.json(); return this.processResponse(resObj);
        } catch (e) {
            return { success: false, error: 'Network error' };
        }
    },

    async fetchNotifications(limit = 20, offset = 0) {
        try {
            const response = await fetch(`${this.API_URL}/api/notifications?limit=${limit}&offset=${offset}`, {
                method: 'GET',
                credentials: 'include',
                headers: this.getHeaders()
            });
            const resObj = await response.json(); return this.processResponse(resObj);
        } catch (e) {
            return { success: false, notifications: [] };
        }
    },

    async markNotificationsRead(notificationId = null) {
        try {
            await fetch(`${this.API_URL}/api/notifications/mark_read`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ notification_id: notificationId })
            });
            return { success: true };
        } catch (e) {
            console.error("Failed to mark notification read:", e);
            return { success: false };
        }
    },


    async submitReferralCode() {
        const input = document.getElementById('referrerInput');
        if (!input) return;

        const code = input.value.trim().toUpperCase();
        if (!code) {
            UI.showToast('Input Error', 'Please enter a referral code', 'error');
            return;
        }

        // Backend enforcement: Referral codes are exactly 8 characters
        if (code.length !== 8) {
            UI.showToast('Invalid Length', 'Referral code must be exactly 8 characters.', 'error');
            return;
        }

        // Find button (it's the next element in my HTML structure)
        const btn = input.parentElement.nextElementSibling;

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Using...';
        }

        try {
            const response = await fetch(`${this.API_URL}/api/add_referrer`, {
                method: 'POST',
                credentials: 'include',
                headers: this.getHeaders(),
                body: JSON.stringify({ referral_code: code })
            });
            const res = await response.json();
            const data = this.processResponse(res);

            if (data.success) {
                UI.showToast('Success', 'Referrer added successfully!', 'success');
                window.AppInstance.refreshData();
            } else {
                UI.showToast('Error', data.error || 'Failed to add referrer', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Submit';
                }
            }
        } catch (e) {
            console.error(e);
            UI.showToast('Network Error', 'Network error', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Submit';
            }
        }
    },

    // Chart Data Generator
    getChartData(transactions, period) {
        const data = [];
        const labels = [];
        const now = new Date();
        const commissions = transactions.filter(txn => txn.type === 'commission' && txn.status === 'approved');

        let daysToLookBack = 7;
        if (period === '30D') daysToLookBack = 30;
        if (period === '90D') daysToLookBack = 90;

        for (let i = daysToLookBack - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);

            // Filter txns for this day
            const dayTotal = commissions.reduce((sum, txn) => {
                const txnDate = new Date(txn.created_at);
                if (txnDate.getDate() === d.getDate() && txnDate.getMonth() === d.getMonth() && txnDate.getFullYear() === d.getFullYear()) {
                    return sum + txn.amount;
                }
                return sum;
            }, 0);

            data.push(dayTotal);

            // Labels
            if (period === '7D') labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
            else if (i % 5 === 0) labels.push(d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }));
            else labels.push("");
        }

        return { data, labels };
    }
};

window.Wallet = Wallet;
