const API_BASE = "https://fectoskills.pythonanywhere.com";

// DOM Elements
const loader = document.getElementById('loader');
const errorMessage = document.getElementById('errorMessage');
const transactionsBody = document.getElementById('transactionsBody');
const refreshBtn = document.getElementById('refreshBtn');
const pendingCountEl = document.getElementById('pendingCount');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

const tableContainer = document.getElementById('tableContainer');
const broadcastSection = document.getElementById('broadcastSection');
const directNotifSection = document.getElementById('directNotifSection');
const usersTableContainer = document.getElementById('usersTableContainer');
const usersBody = document.getElementById('usersBody');
const usersLoadMore = document.getElementById('usersLoadMore');
const loadMoreUsersBtn = document.getElementById('loadMoreUsersBtn');
const onlineTableContainer = document.getElementById('onlineTableContainer');
const onlineBody = document.getElementById('onlineBody');
const historyTableContainer = document.getElementById('historyTableContainer');
const historyBody = document.getElementById('historyBody');
const historyLoadMore = document.getElementById('historyLoadMore');
const loadMoreHistoryBtn = document.getElementById('loadMoreHistoryBtn');

// State
// Transactions are managed below

// State
let transactions = [];
let chats = [];
let feedback = [];
let currentTransactionId = null;
let currentTab = 'purchase'; // Default tab
let chatOffset = 0;
let hasMoreChat = true;
let isLoadingMoreChat = false;
let users = [];
let usersOffset = 0;
let totalUsers = 0;
let isLoadingMoreUsers = false;
let historyItems = [];
let historyOffset = 0;
let totalHistory = 0;
let isLoadingMoreHistory = false;




// AUTH HELPER
function checkAuth() {
    // Cookie based now. If 401, apiFetch handles redirect.
}

async function logout() {
    try {
        localStorage.removeItem('admin_auth_token');
        await fetch(`${API_BASE}/admin/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) { console.error(e); }
    window.location.href = 'login.html';
}

async function apiFetch(endpoint, options = {}) {
    // Cookie handled by browser

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    const adminToken = localStorage.getItem('admin_auth_token');
    if (adminToken) {
        headers['x-admin-token'] = adminToken;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers
        });

        if (response.status === 401) {
            window.location.href = 'login.html';
            throw new Error("Unauthorized");
        }

        return response;
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

// Update Page Title and Subtitle
function updatePageTitle(tab) {
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const statLabel = document.getElementById('statLabel');

    const titles = {
        'purchase': {
            title: 'Course Purchases',
            subtitle: 'Review and approve pending course purchase requests',
            stat: 'Pending:'
        },
        'withdrawal': {
            title: 'Withdrawal Requests',
            subtitle: 'Process user wallet withdrawal requests',
            stat: 'Pending:'
        },
        'history': {
            title: 'Transaction History',
            subtitle: 'View complete record of all platform transactions',
            stat: 'Total Records:'
        },
        'users': {
            title: 'All Users',
            subtitle: 'Manage and view all registered platform users',
            stat: 'Total Users:'
        },
        'online': {
            title: 'Online Users',
            subtitle: 'View users currently active on the platform',
            stat: 'Online Now:'
        },
        'chats': {
            title: 'Support Chats',
            subtitle: 'View and respond to user support conversations',
            stat: 'Active Chats:'
        },
        'recovery': {
            title: 'Account Recovery',
            subtitle: 'Manage password recovery and account restoration requests',
            stat: 'Requests:'
        },
        'pwreset': {
            title: 'Password Resets',
            subtitle: 'Review password reset confirmation requests',
            stat: 'Pending:'
        },
        'feedback': {
            title: 'User Feedback',
            subtitle: 'Read user feedback and suggestions',
            stat: 'Messages:'
        },
        'broadcast': {
            title: 'Broadcast Message',
            subtitle: 'Send notifications to all active users',
            stat: 'Recipients:'
        },
        'direct-notif': {
            title: 'Direct Notification',
            subtitle: 'Send targeted notification to a specific user',
            stat: 'Status:'
        }
    };

    const config = titles[tab] || titles['purchase'];
    if (pageTitle) pageTitle.textContent = config.title;
    if (pageSubtitle) pageSubtitle.textContent = config.subtitle;
    if (statLabel) statLabel.textContent = config.stat;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    updatePageTitle(currentTab); // Initialize page title
    loadData();
    refreshBtn.addEventListener('click', loadData);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // Navigation Event Listeners (Updated for sidebar)
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (!navItem) return;

            // Update active state
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            navItem.classList.add('active');

            // Get tab data
            currentTab = navItem.dataset.tab;

            // Update page title
            updatePageTitle(currentTab);

            // Load data
            loadData();
        });
    });

    if (loadMoreUsersBtn) {
        loadMoreUsersBtn.addEventListener('click', () => {
            usersOffset += 20;
            fetchUsers(true);
        });
    }

    if (loadMoreHistoryBtn) {
        loadMoreHistoryBtn.addEventListener('click', () => {
            historyOffset += 20;
            fetchHistory(true);
        });
    }
    // Chat Modal Close Listeners
    const closeChatBtn = document.getElementById('closeChatModal');
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => closeChatModal());
    }

    const chatModalEl = document.getElementById('chatModal');
    if (chatModalEl) {
        chatModalEl.addEventListener('click', closeChatModal);
    }

    // Details Modal Close Listeners
    const closeDetailBtn = document.getElementById('closeModal');
    if (closeDetailBtn) {
        closeDetailBtn.addEventListener('click', () => closeDetailModal());
    }
    const detailsModalEl = document.getElementById('detailsModal');
    if (detailsModalEl) {
        detailsModalEl.addEventListener('click', closeDetailModal);
    }
    const feedbackModalEl = document.getElementById('feedbackModal');
    if (feedbackModalEl) {
        feedbackModalEl.addEventListener('click', closeFeedbackModal);
    }
});

// Pattern compat helper
function processResponse(res) {
    if (res.data) {
        return { ...res, ...res.data };
    }
    return res;
}

// Main Data Loader
async function loadData() {
    showLoader();
    hideError();

    try {
        if (currentTab === 'purchase' || currentTab === 'withdrawal') {
            const response = await apiFetch('/admin/pending');
            const res = await response.json();
            const data = processResponse(res);
            if (data.success) {
                transactions = data.transactions || [];
                renderTransactions();
            } else {
                showError(data.error || 'Failed to load transactions');
            }
        } else if (currentTab === 'ban') {
            // Reset View handled by wrapper
            const banSection = document.getElementById('banSection');
            if (banSection) banSection.classList.remove('hidden');
            fetchBannedUsers();
        } else if (currentTab === 'chats') {
            const response = await apiFetch('/admin/chats');
            const res = await response.json();
            const data = processResponse(res);
            if (data.success) {
                chats = data.chats || [];
                renderChats();
            } else {
                showError(data.error || 'Failed to load chats');
            }
        } else if (currentTab === 'feedback') {
            const response = await apiFetch('/admin/feedback');
            const res = await response.json();
            const data = processResponse(res);
            if (data.success) {
                feedback = data.feedback || [];
                renderFeedback();
            } else {
                showError(data.error || 'Failed to load feedback');
            }
        } else if (currentTab === 'users') {
            usersOffset = 0;
            users = [];
            await fetchUsers();
        } else if (currentTab === 'online') {
            await fetchOnlineUsers();
        } else if (currentTab === 'history') {
            historyOffset = 0;
            historyItems = [];
            await fetchHistory();
        } else if (currentTab === 'broadcast') {
            // No data to load for broadcast, just show form
            renderBroadcast();
        } else if (currentTab === 'direct-notif') {
            renderDirectNotif();
        } else if (currentTab === 'recovery') {
            await fetchRecoveryChats();
        } else if (currentTab === 'pwreset') {
            renderPasswordReset();
        }
    } catch (error) {
        console.error('Load Error:', error);
        showError('Could not connect to server. Make sure the backend is running.');
    } finally {
        hideLoader();
    }
}

// UI Helper to update table headers
function updateTableHeaders(headers) {
    const thead = document.querySelector('#transactionsTable thead tr');
    thead.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
}

// Render Transactions Table
function renderTransactions() {
    updateTableHeaders(['ID', 'User', 'Type', 'Amount', 'Payment Details', 'Date', 'Actions']);

    // Filter transactions based on current tab
    const filtered = transactions.filter(t => t.type === currentTab);
    pendingCountEl.textContent = filtered.length;

    if (filtered.length === 0) {
        transactionsBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="7">No pending ${currentTab}s</td>
            </tr>
        `;
        return;
    }

    transactionsBody.innerHTML = filtered.map(txn => `
        <tr>
            <td><strong>#${txn.id}</strong></td>
            <td>
                <div class="user-info">
                    <span class="username">${txn.username}</span>
                    <span class="user-id">ID: ${txn.user_id}</span>
                </div>
            </td>
            <td>${txn.type === 'purchase' ? 'Course Purchase' : 'Withdrawal Request'}</td>
            <td class="amount">Rs. ${txn.amount.toLocaleString()}</td>
            <td>
                <div class="payment-details">
                    ${txn.type === 'purchase' ? `
                        ${txn.public_id ? `<div><span class="payment-label">Txn ID:</span> <span class="payment-value font-mono">${txn.public_id}</span></div>` : ''}
                        ${txn.account_title ? `<div><span class="payment-label">Sender:</span> <span class="payment-value">${txn.account_title}</span></div>` : ''}
                        ${txn.target_account ? `<div><span class="payment-label">Account:</span> <span class="payment-value">${txn.target_account}</span></div>` : ''}
                        ${txn.description ? `<div><span class="payment-label">Note:</span> <span class="payment-value">${txn.description}</span></div>` : ''}
                        ${txn.screenshot_path ? `<div><span class="payment-label">Screenshot:</span> <span class="payment-value">${txn.screenshot_path.split('/').pop()}</span></div>` : ''}
                    ` : `
                        ${txn.withdrawal_method ? `<div><span class="payment-label">Method:</span> <span class="payment-value">${txn.withdrawal_method.toUpperCase()}</span></div>` : ''}
                        ${txn.account_title ? `<div><span class="payment-label">Title:</span> <span class="payment-value">${txn.account_title}</span></div>` : ''}
                        ${txn.target_account ? `<div><span class="payment-label">Account:</span> <span class="payment-value">${txn.target_account}</span></div>` : ''}
                        ${txn.bank_name ? `<div><span class="payment-label">Bank:</span> <span class="payment-value">${txn.bank_name}</span></div>` : ''}
                    `}
                </div>
            </td>
            <td class="date">${new Date(txn.created_at).toLocaleString()}</td>
            <td>
                <button 
                    class="btn btn-view" 
                    onclick="viewDetails(${txn.id})"
                >
                    View Details
                </button>
                <button 
                    class="btn btn-approve" 
                    onclick="approveTransaction(${txn.id})"
                    id="approve-${txn.id}"
                >
                    Approve
                </button>
                <button 
                    class="btn btn-reject" 
                    onclick="openRejectionModal(${txn.id})"
                    id="reject-${txn.id}"
                    style="background-color: #e53e3e; color: white;"
                >
                    Reject
                </button>
            </td>
        </tr>
    `).join('');
}

// Render Chats Table
function renderChats() {
    resetView();
    tableContainer.classList.remove('hidden');

    // Update table headers for chats
    updateTableHeaders(['User', 'Last Message', 'Sender', 'Time', 'Actions']);

    // Filter out guest users (ID 0) from regular chats
    const regularChats = chats.filter(c => Number(c.user_id) !== 0);
    pendingCountEl.textContent = regularChats.length;

    if (regularChats.length === 0) {
        transactionsBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="5">No active chats</td>
            </tr>
        `;
        return;
    }

    transactionsBody.innerHTML = regularChats.map(chat => `
        <tr>
            <td>
                <div class="user-info">
                    <span class="username">${chat.username || 'User'}</span>
                    <span class="user-id">ID: ${chat.user_id}</span>
                </div>
            </td>
            <td><div class="message-preview">${chat.message}</div></td>
            <td><span class="sender-tag ${chat.sender_type}">${chat.sender_type.toUpperCase()}</span></td>
            <td class="date">${new Date(chat.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-view" onclick="openSupportChat(${chat.user_id}, '${chat.username}')">Reply / View</button>
            </td>
        </tr>
    `).join('');
}

// Render Feedback Table
function renderFeedback() {
    resetView();
    tableContainer.classList.remove('hidden');
    updateTableHeaders(['ID', 'User', 'Suggestion', 'Date', 'Actions']);
    pendingCountEl.textContent = feedback.length;

    if (feedback.length === 0) {
        transactionsBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="4">No feedback received</td>
            </tr>
        `;
        return;
    }

    transactionsBody.innerHTML = feedback.map(f => `
        <tr>
            <td><strong>#${f.id}</strong></td>
            <td>
                <div class="user-info">
                    <span class="username">${f.username || 'Anonymous'}</span>
                    <span class="user-id">ID: ${f.user_id || 'N/A'}</span>
                </div>
            </td>
            <td><div class="feedback-text">${f.message}</div></td>
            <td class="date">${new Date(f.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-view" onclick="viewFeedback(${f.id})">View Full</button>
            </td>
        </tr>
    `).join('');
}

// Approve Transaction
async function approveTransaction(transactionId) {
    const btn = document.getElementById(`approve-${transactionId}`);
    if (!btn) return;

    // Prevent double-clicks
    if (btn.disabled) return;

    btn.disabled = true;
    btn.textContent = 'Processing...';
    btn.style.opacity = '0.5';

    try {
        const response = await apiFetch('/admin/approve', {
            method: 'POST',
            body: JSON.stringify({
                transaction_id: transactionId
            })
        });

        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('✅ Transaction approved successfully!');
            // Remove from list
            transactions = transactions.filter(t => t.id !== transactionId);
            renderTransactions();
        } else {
            showToast('❌ ' + (data.error || 'Approval failed'));
            btn.disabled = false;
            btn.textContent = 'Approve';
            btn.style.opacity = '1';
        }
    } catch (error) {
        console.error('Approve Error:', error);
        showToast('❌ Could not connect to server');
        btn.disabled = false;
        btn.textContent = 'Approve';
        btn.style.opacity = '1';
    }
}

// UI Helper Functions
function showLoader() {
    loader.classList.remove('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Open Rejection Modal
function openRejectionModal(transactionId) {
    const rejectionReason = prompt("Please enter rejection reason:");
    if (rejectionReason && rejectionReason.trim()) {
        rejectTransaction(transactionId, rejectionReason.trim());
    }
}

// Reject Transaction
async function rejectTransaction(transactionId, reason) {
    const btn = document.getElementById(`reject-${transactionId}`);
    if (!btn) return;

    if (btn.disabled) return;

    btn.disabled = true;
    btn.textContent = 'Processing...';
    btn.style.opacity = '0.5';

    try {
        const response = await apiFetch('/admin/reject', {
            method: 'POST',
            body: JSON.stringify({
                transaction_id: transactionId,
                rejection_reason: reason
            })
        });

        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('✅ Transaction rejected successfully!');
            transactions = transactions.filter(t => t.id !== transactionId);
            renderTransactions();
        } else {
            showToast(`❌ Error: ${data.error || 'Failed to reject transaction'}`);
            btn.disabled = false;
            btn.textContent = 'Reject';
            btn.style.opacity = '1';
        }
    } catch (error) {
        console.error('Reject Transaction Error:', error);
        showToast('❌ Network error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Reject';
        btn.style.opacity = '1';
    }
}

// Chat Send Button Event Listener
document.addEventListener('DOMContentLoaded', () => {
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');

    if (sendChatBtn && chatInput) {
        sendChatBtn.onclick = async () => {
            const message = chatInput.value.trim();
            if (!message || (currentChatUserId === null || currentChatUserId === undefined)) return;

            sendChatBtn.disabled = true;
            sendChatBtn.textContent = 'Sending...';

            try {
                const response = await apiFetch('/api/send_message', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: currentChatUserId,
                        username: currentChatUsername,
                        session_id: currentChatSessionId,
                        message: message,
                        sender_type: 'admin'
                    })
                });

                const res = await response.json();
                const data = processResponse(res);

                if (data.success) {
                    chatInput.value = '';
                    // Add message to UI
                    const chatMessages = document.getElementById('chatMessages');
                    if (chatMessages) {
                        const messageHtml = `
                            <div class="chat-bubble admin">
                                ${message}
                                <span class="chat-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        `;
                        chatMessages.innerHTML += messageHtml;
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                } else {
                    showToast(`❌ Error: ${data.error || 'Failed to send message'}`);
                }
            } catch (error) {
                console.error('Send Chat Error:', error);
                showToast('❌ Failed to send message');
            } finally {
                sendChatBtn.disabled = false;
                sendChatBtn.textContent = 'Send';
            }
        };

        // Also allow Enter key to send
        chatInput.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatBtn.click();
            }
        };
    }
});

// View Transaction Details
function viewDetails(transactionId) {
    const txn = transactions.find(t => t.id === transactionId);
    if (!txn) return;

    currentTransactionId = transactionId;

    const modalBody = document.getElementById('modalContent');

    // Update Modal Actions Visibility
    const actionsDiv = document.querySelector('.modal-actions');
    if (actionsDiv) {
        if (txn.status === 'pending') {
            actionsDiv.classList.remove('hidden');
        } else {
            actionsDiv.classList.add('hidden');
        }
    }

    modalBody.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
            <div class="detail-section" style="margin-bottom: 0;">
                <h3 style="border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 12px; color: #10b981;">Transaction Info</h3>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span class="detail-label" style="color: #888;">ID:</span>
                        <span class="detail-value" style="font-weight: bold; color: white;">#${txn.id}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span class="detail-label" style="color: #888;">Type:</span>
                        <span class="detail-value" style="color: white;">${txn.type.toUpperCase()}</span>
                    </div>
                     <div style="display: flex; justify-content: space-between;">
                        <span class="detail-label" style="color: #888;">Status:</span>
                        <span class="detail-value" style="color: ${txn.status === 'pending' ? '#fbbf24' : (txn.status === 'approved' ? '#10b981' : '#ef4444')}; font-weight: bold;">${txn.status.toUpperCase()}</span>
                    </div>
                     <div style="display: flex; justify-content: space-between;">
                        <span class="detail-label" style="color: #888;">Date:</span>
                        <span class="detail-value" style="color: white; font-size: 0.9em;">${new Date(txn.created_at).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section" style="margin-bottom: 0;">
                <h3 style="border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 12px; color: #10b981;">User Info</h3>
                 <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                         <span class="detail-label" style="color: #888;">Username:</span>
                        <span class="detail-value" style="color: white;">${txn.username}</span>
                    </div>
                     <div style="display: flex; justify-content: space-between;">
                         <span class="detail-label" style="color: #888;">User ID:</span>
                        <span class="detail-value" style="color: white;">${txn.user_id}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="detail-section" style="background: #1c1c1f; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #333;">
            <h3 style="color: #10b981; margin-bottom: 16px; font-size: 1.1em;">
                ${txn.type === 'withdrawal' ? 'Withdrawal Account Details' : 'Payment & Course Details'}
            </h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                 <div style="grid-column: span 2; display: flex; justify-content: space-between; align-items: center; background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);">
                    <span style="font-weight: bold; color: #10b981;">Total Amount</span>
                    <span style="font-size: 1.2em; font-weight: bold; color: white;">Rs. ${txn.amount.toLocaleString()}</span>
                </div>

                ${txn.type === 'withdrawal' ? `
                    ${txn.withdrawal_method ? `
                    <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Method</span>
                        <span class="detail-value" style="color: white;">${txn.withdrawal_method.toUpperCase()}</span>
                    </div>` : ''}
                    
                    ${txn.account_title ? `
                    <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Account Title</span>
                        <span class="detail-value" style="color: white;">${txn.account_title}</span>
                    </div>` : ''}

                    ${txn.target_account ? `
                    <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Account / IBAN</span>
                        <span class="detail-value" style="color: white; font-family: monospace;">${txn.target_account}</span>
                    </div>` : ''}

                    ${txn.bank_name ? `
                    <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Bank Name</span>
                        <span class="detail-value" style="color: white;">${txn.bank_name}</span>
                    </div>` : ''}
                ` : `
                    <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Txn ID (Public)</span>
                        <span class="detail-value" style="color: #10b981; font-family: monospace; font-weight: bold;">${txn.public_id || 'N/A'}</span>
                    </div>
                     <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Sender Name</span>
                        <span class="detail-value" style="color: white;">${txn.account_title || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Sender Account</span>
                        <span class="detail-value" style="color: white;">${txn.target_account || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Course</span>
                        <span class="detail-value" style="color: white;">${txn.course_title || 'N/A'}</span>
                    </div>
                    ${txn.description ? `
                    <div style="grid-column: span 2;">
                        <span class="detail-label" style="display: block; color: #888; font-size: 0.8em;">Note</span>
                        <span class="detail-value" style="color: #ccc; font-style: italic;">${txn.description}</span>
                    </div>` : ''}
                `}
            </div>
        </div>

        ${txn.type !== 'withdrawal' ? `
        <div class="detail-section">
            <h3 style="color: #10b981; margin-bottom: 12px;">Payment Proof</h3>
            <div class="screenshot-container" style="background: #000; border-radius: 8px; overflow: hidden; display: flex; justify-content: center; align-items: center; border: 1px solid #333;">
                ${txn.screenshot_path && txn.screenshot_path !== 'screenshot_placeholder.jpg'
                ? `<img src="${API_BASE}/${txn.screenshot_path}" alt="Payment Screenshot" style="max-width: 100%; max-height: 400px; object-fit: contain; display: block;"
                    onclick="window.open(this.src, '_blank')" style="cursor: pointer;" title="Click to open full size"
                   onerror="this.parentElement.innerHTML='<div class=\\'no-screenshot\\' style=\\'padding: 40px; color: #666;\\'>Screenshot not available</div>'">`
                : '<div class="no-screenshot" style="padding: 40px; color: #666;">No screenshot uploaded</div>'}
            </div>
             ${txn.screenshot_path && txn.screenshot_path !== 'screenshot_placeholder.jpg' ?
                '<p style="text-align: center; color: #666; font-size: 0.8em; margin-top: 8px;">Click image to view full size</p>' : ''}
        </div>
        ` : ''}
    `;

    document.getElementById('detailsModal').classList.remove('hidden');
}

function closeDetailModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('detailsModal').classList.add('hidden');
    currentTransactionId = null;
}

function approveFromModal() {
    if (currentTransactionId) {
        approveTransaction(currentTransactionId);
        closeDetailModal();
    }
}

// Support Chat Logic
let currentChatUserId = null;
let currentChatUsername = null;
let currentChatSessionId = null;

async function openSupportChat(userId, username, sessionId = null) {
    // Sanitize string versions of null/undefined from template literals
    if (sessionId === 'null' || sessionId === 'undefined') sessionId = null;

    currentChatUserId = userId;
    currentChatUsername = username;
    currentChatSessionId = sessionId;

    // Use correct element ID from HTML
    const chatUsernameEl = document.getElementById('chatUsername');
    if (chatUsernameEl) {
        chatUsernameEl.textContent = username || 'User';
    }

    document.getElementById('chatModal').classList.remove('hidden');

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '<p class="text-center text-gray-500 py-4">Loading messages...</p>';
    }

    chatOffset = 0;
    hasMoreChat = true;
    isLoadingMoreChat = false;
    await fetchChatHistory(userId);
    initChatScroll();
}

function initChatScroll() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    container.onscroll = () => {
        if (container.scrollTop <= 10) {
            loadMoreChat();
        }
    };
}

async function fetchChatHistory(userId, append = false) {
    try {
        const usernameParam = currentChatUsername ? `&username=${encodeURIComponent(currentChatUsername)}` : '';
        const sessionParam = currentChatSessionId ? `&session_id=${encodeURIComponent(currentChatSessionId)}` : '';
        const response = await apiFetch(`/admin/chat/${userId}?limit=20&offset=${chatOffset}${usernameParam}${sessionParam}`);
        const res = await response.json();
        const data = processResponse(res);
        if (data.success) {
            const history = data.history || [];
            if (history.length < 20) hasMoreChat = false;
            renderChatHistory(history, append);
        } else {
            document.getElementById('chatHistory').innerHTML = `<p class="text-center text-red-500 py-4">Error: ${data.error}</p>`;
        }
    } catch (error) {
        console.error('Fetch Chat Error:', error);
    }
}

async function loadMoreChat() {
    if (!hasMoreChat || isLoadingMoreChat || (currentChatUserId === null || currentChatUserId === undefined)) return;
    isLoadingMoreChat = true;
    chatOffset += 20;

    const container = document.getElementById('chatHistory');
    const oldHeight = container.scrollHeight;

    try {
        const usernameParam = currentChatUsername ? `&username=${encodeURIComponent(currentChatUsername)}` : '';
        const sessionParam = currentChatSessionId ? `&session_id=${encodeURIComponent(currentChatSessionId)}` : '';
        const response = await apiFetch(`/admin/chat/${currentChatUserId}?limit=20&offset=${chatOffset}${usernameParam}${sessionParam}`);
        const res = await response.json();
        const data = processResponse(res);
        if (data.success) {
            const history = data.history || [];
            if (history.length === 0) {
                hasMoreChat = false;
            } else {
                renderChatHistory(history, true);
                if (history.length < 20) hasMoreChat = false;

                // Adjust scroll
                setTimeout(() => {
                    const newHeight = container.scrollHeight;
                    container.scrollTop = newHeight - oldHeight;
                }, 0);
            }
        }
    } catch (e) {
        console.error("Load more chat error:", e);
    } finally {
        isLoadingMoreChat = false;
    }
}

function renderChatHistory(history, append = false) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    if (!append && (!history || history.length === 0)) {
        chatMessages.innerHTML = '<p class="text-center text-gray-500 py-4">No messages yet.</p>';
        return;
    }

    const html = history.map(msg => `
        <div class="chat-bubble ${msg.sender_type}">
            ${msg.message}
            <span class="chat-time">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
    `).join('');

    if (append) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        while (temp.lastChild) {
            chatMessages.insertBefore(temp.lastChild, chatMessages.firstChild);
        }
    } else {
        chatMessages.innerHTML = html;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Feedback Modal Logic
function viewFeedback(feedbackId) {
    const f = feedback.find(item => item.id === feedbackId);
    if (!f) return;

    const modalBody = document.getElementById('feedbackModalBody');
    modalBody.innerHTML = `
        <div class="detail-section">
            <h3>Feedback Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Feedback ID</span>
                    <span class="detail-value">#${f.id}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">User</span>
                    <span class="detail-value">${f.username || 'Anonymous'} (ID: ${f.user_id || 'N/A'})</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Received At</span>
                    <span class="detail-value">${new Date(f.created_at).toLocaleString()}</span>
                </div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Full Message</h3>
            <div style="background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; line-height: 1.6; color: #e0e0e0; font-size: 14px; border: 1px solid rgba(255,255,255,0.05); white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word;">
                ${f.message}
            </div>
        </div>
    `;

    document.getElementById('feedbackModal').classList.remove('hidden');
}

function closeFeedbackModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('feedbackModal').classList.add('hidden');
}

async function sendReply() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message || (currentChatUserId === null || currentChatUserId === undefined)) return;
    const btn = document.getElementById('sendChatBtn');
    btn.disabled = true;
    try {
        const response = await apiFetch('/api/send_message', {
            method: 'POST',
            body: JSON.stringify({
                user_id: currentChatUserId,
                username: currentChatUsername || 'Cashier',
                session_id: currentChatSessionId,
                message: message,
                sender_type: 'admin'
            })
        });
        const res = await response.json();
        const data = processResponse(res);
        if (data.success) {
            input.value = '';
            await fetchChatHistory(currentChatUserId);
        } else {
            showToast('❌ Failed');
        }
    } catch (error) {
        console.error('Send Reply Error:', error);
    } finally {
        btn.disabled = false;
    }
}

// Broadcast Logic
function renderBroadcast() {
    tableContainer.classList.add('hidden');
    broadcastSection.classList.remove('hidden');
    if (usersTableContainer) usersTableContainer.classList.add('hidden');
    if (onlineTableContainer) onlineTableContainer.classList.add('hidden');
    if (historyTableContainer) historyTableContainer.classList.add('hidden');
    pendingCountEl.textContent = '-';
}

function renderDirectNotif() {
    tableContainer.classList.add('hidden');
    directNotifSection.classList.remove('hidden');
    if (usersTableContainer) usersTableContainer.classList.add('hidden');
    if (onlineTableContainer) onlineTableContainer.classList.add('hidden');
    if (historyTableContainer) historyTableContainer.classList.add('hidden');
    pendingCountEl.textContent = '-';
}

// Reset view before each load
function resetView() {
    tableContainer.classList.remove('hidden');
    broadcastSection.classList.add('hidden');
    directNotifSection.classList.add('hidden');
    if (usersTableContainer) usersTableContainer.classList.add('hidden');
    if (onlineTableContainer) onlineTableContainer.classList.add('hidden');
    if (historyTableContainer) historyTableContainer.classList.add('hidden');

    // Explicitly hide Ban section
    const banSection = document.getElementById('banSection');
    if (banSection) banSection.classList.add('hidden');

    // Reset stat label to default
    const label = document.querySelector('.stat-label');
    if (label) label.textContent = 'Pending:';

    if (document.getElementById('pwresetSection')) {
        document.getElementById('pwresetSection').classList.add('hidden');
    }
}

// Wrap loadData to reset view
const originalLoadData = loadData;
loadData = async function () {
    resetView();
    await originalLoadData();
};

async function sendBroadcast() {
    const title = document.getElementById('broadcastTitle').value.trim();
    const type = document.getElementById('broadcastType').value;
    const message = document.getElementById('broadcastMessage').value.trim();

    if (!message) {
        showToast('⚠️ Please enter a message.');
        return;
    }

    const btn = document.getElementById('sendBroadcastBtn');
    btn.disabled = true;
    btn.textContent = 'Pushing to all users...';

    try {
        const response = await apiFetch('/admin/broadcast-notification', {
            method: 'POST',
            body: JSON.stringify({ title, type, message })
        });

        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('🚀 Broadcast sent to all users!');
            document.getElementById('broadcastTitle').value = '';
            document.getElementById('broadcastMessage').value = '';
        } else {
            showToast('❌ Error: ' + data.error);
        }
    } catch (error) {
        console.error('Broadcast Error:', error);
        showToast('❌ Connection error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Push Broadcast to All Users';
    }
}

async function sendDirectNotif() {
    const username = document.getElementById('notifUsername').value.trim();
    const title = document.getElementById('notifTitle').value.trim();
    const type = document.getElementById('notifType').value;
    const message = document.getElementById('notifMessage').value.trim();

    if (!username || !message) {
        showToast('⚠️ Username and Message are required.');
        return;
    }

    const btn = document.querySelector('#directNotifSection .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const response = await apiFetch('/admin/send-direct-notification', {
            method: 'POST',
            body: JSON.stringify({ username, title, type, message })
        });

        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('✅ Notification sent successfully!');
            document.getElementById('notifUsername').value = '';
            document.getElementById('notifTitle').value = '';
            document.getElementById('notifMessage').value = '';
        } else {
            showToast('❌ Error: ' + data.error);
        }
    } catch (error) {
        console.error('Direct Notif Error:', error);
        showToast('❌ Connection error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Recovery Logic
let recoveryUser = null;

// Ban State
let bannedUsers = [];
let userToBan = null;

function renderRecovery() {
    resetView();
    tableContainer.classList.remove('hidden');
    updateTableHeaders(['Guest Name', 'Last Message', 'Sender', 'Date', 'Actions']);
    pendingCountEl.textContent = '-';
}

function renderPasswordReset() {
    tableContainer.classList.add('hidden');
    broadcastSection.classList.add('hidden');
    directNotifSection.classList.add('hidden');
    if (usersTableContainer) usersTableContainer.classList.add('hidden');
    if (onlineTableContainer) onlineTableContainer.classList.add('hidden');
    if (historyTableContainer) historyTableContainer.classList.add('hidden');
    document.getElementById('pwresetSection').classList.remove('hidden');
    pendingCountEl.textContent = '-';
}

async function fetchRecoveryChats() {
    renderRecovery();
    transactionsBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500 italic">Loading recovery requests...</td></tr>';

    try {
        // We reuse the same chats endpoint but filter for ID 0 (Guest)
        const response = await apiFetch('/admin/chats');
        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            // Find all guest chats. Since /admin/chats returns the latest message per user_id,
            // we need a different approach if multiple guests have the same ID 0.
            // However, currently the system uses ID 0 for all guest messages.
            // To differentiate, we'd need the backend to return messages grouped by session or unique guest ID.
            // For now, we'll show all guest messages if they are from ID 0.

            // NOTE: The current backend get_admin_chats uses GROUP BY user_id, username.
            // This allows us to see unique guest sessions.
            const guestChats = data.chats.filter(c => Number(c.user_id) === 0);
            renderRecoveryTable(guestChats);
        }
    } catch (e) {
        transactionsBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-500">Failed to load recovery chats.</td></tr>';
    }
}

function renderRecoveryTable(guestChats) {
    pendingCountEl.textContent = guestChats.length;

    if (guestChats.length === 0) {
        transactionsBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="5">No active recovery requests</td>
            </tr>
        `;
        return;
    }

    transactionsBody.innerHTML = guestChats.map(chat => `
        <tr>
            <td>
                <div class="user-info">
                    <span class="username">${chat.username}</span>
                    <span class="user-id">Recovery Guest</span>
                </div>
            </td>
            <td><div class="message-preview">${chat.message}</div></td>
            <td><span class="sender-tag user">GUEST</span></td>
            <td class="date">${new Date(chat.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-view" onclick="openSupportChat(0, '${chat.username}', '${chat.session_id}')">Open Verification Chat</button>
            </td>
        </tr>
    `).join('');
}

async function searchRecoveryUser() {
    const username = document.getElementById('recoveryUsernameSearch').value.trim();
    if (!username) return showToast('⚠️ Enter a username');

    showLoader();
    try {
        const response = await apiFetch(`/admin/user-info?username=${username}`);
        const res = await response.json();
        const data = processResponse(res);

        if (data.success && data.user) {
            recoveryUser = data.user;
            document.getElementById('recoveryUserInfo').classList.remove('hidden');
            document.getElementById('recoveryNotFound').classList.add('hidden');

            document.getElementById('recoveryUserDisplay').textContent = recoveryUser.username;
            document.getElementById('recoveryUserIdDisplay').textContent = `ID: #${recoveryUser.id} | ${recoveryUser.phone || 'No Phone'}`;

            const statusEl = document.getElementById('recoveryUserStatus');
            statusEl.textContent = recoveryUser.is_active ? 'Active' : 'Inactive';
            statusEl.className = `status-tag ${recoveryUser.is_active ? 'active' : 'inactive'}`;
        } else {
            recoveryUser = null;
            document.getElementById('recoveryUserInfo').classList.add('hidden');
            document.getElementById('recoveryNotFound').classList.remove('hidden');
        }
    } catch (e) {
        showToast('❌ Search failed');
    } finally {
        hideLoader();
    }
}

async function resetUserPassword() {
    if (!recoveryUser) return;
    const newPass = document.getElementById('newRecoveryPassword').value; // Don't trim yet to catch spaces if needed, but trim is fine if we check space
    if (/\s/.test(newPass)) return showToast('⚠️ Spaces not allowed in password');
    if (newPass.length < 6) return showToast('⚠️ Password too short');

    const btn = document.getElementById('resetPasswordBtn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
        const response = await apiFetch('/admin/reset-password', {
            method: 'POST',
            body: JSON.stringify({
                user_id: recoveryUser.id,
                new_password: newPass
            })
        });

        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('✅ Password updated successfully!');
            document.getElementById('newRecoveryPassword').value = '';
            // Optional: notify user via system if they are online? 
        } else {
            showToast('❌ ' + (data.error || 'Failed'));
        }
    } catch (e) {
        showToast('❌ Connection error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update User Password';
    }
}


// =======================
// BAN SYSTEM LOGIC
// =======================

async function fetchBannedUsers() {
    showLoader();
    try {
        const response = await apiFetch('/admin/banned-users');
        const res = await response.json();
        const data = processResponse(res);
        if (data.success) {
            bannedUsers = data.users || [];
            renderBannedUsers();
        }
    } catch (e) {
        showToast('❌ Failed to fetch banned users');
    } finally {
        hideLoader();
    }
}

function renderBannedUsers() {
    const listEl = document.getElementById('bannedUsersList');
    if (!listEl) return;

    if (bannedUsers.length === 0) {
        listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No banned users</div>';
        return;
    }

    listEl.innerHTML = bannedUsers.map(user => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid #333; padding: 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-weight: bold; color: white;">${user.username}</div>
                <div style="font-size: 0.8em; color: #888;">ID: #${user.id} | Reason: ${user.ban_reason}</div>
            </div>
            <button class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.8em; background: #10b981; color: white;" onclick="unbanUser(${user.id})">Unban</button>
        </div>
    `).join('');
}

async function searchUserForBan() {
    const username = document.getElementById('banSearchUsername').value.trim();
    if (!username) return showToast('⚠️ Enter a username');

    try {
        const response = await apiFetch(`/admin/user-info?username=${username}`);
        const res = await response.json();
        const data = processResponse(res);

        if (data.success && data.user) {
            userToBan = data.user;
            document.getElementById('banUserInfo').classList.remove('hidden');
            document.getElementById('banUserDisplay').textContent = userToBan.username;
            document.getElementById('banUserIdDisplay').textContent = `ID: #${userToBan.id}`;
        } else {
            userToBan = null;
            document.getElementById('banUserInfo').classList.add('hidden');
            showToast('❌ User not found');
        }
    } catch (e) {
        showToast('❌ Search failed');
    }
}

async function banUser() {
    if (!userToBan) return;
    const reason = document.getElementById('banReason').value.trim();
    if (!reason) return showToast('⚠️ Reason is required');

    if (!confirm(`Are you sure you want to ban ${userToBan.username}?`)) return;

    try {
        const response = await apiFetch('/admin/ban-user', {
            method: 'POST',
            body: JSON.stringify({ user_id: userToBan.id, reason })
        });
        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('✅ User banned');
            document.getElementById('banUserInfo').classList.add('hidden');
            document.getElementById('banSearchUsername').value = '';
            document.getElementById('banReason').value = '';
            userToBan = null;
            fetchBannedUsers(); // Refresh list
        } else {
            showToast('❌ ' + data.error);
        }
    } catch (e) {
        showToast('❌ Failed to ban user');
    }
}

async function unbanUser(uid) {
    if (!confirm('Unban this user?')) return;

    try {
        const response = await apiFetch('/admin/unban-user', {
            method: 'POST',
            body: JSON.stringify({ user_id: uid })
        });
        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('✅ User unbanned');
            fetchBannedUsers();
        } else {
            showToast('❌ ' + data.error);
        }
    } catch (e) {
        showToast('❌ Failed to unban');
    }
}

function handleChatKey(e) {
    if (e.key === 'Enter') sendReply();
}

function closeChatModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('chatModal').classList.add('hidden');
    currentChatUserId = null;
    loadData();
}

// Rejection Logic
let pendingRejectionId = null;

function openRejectionModal(transactionId) {
    pendingRejectionId = transactionId;
    document.getElementById('customReason').value = '';

    // Reset button state
    const btn = document.getElementById('confirmRejectBtn');
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirm Rejection';
    }

    document.getElementById('rejectionModal').classList.remove('hidden');
}

function closeRejectionModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('rejectionModal').classList.add('hidden');
    pendingRejectionId = null;
}

function setRejectionReason(reason) {
    document.getElementById('customReason').value = reason;
}

async function confirmRejection() {
    if (!pendingRejectionId) return;

    const reason = document.getElementById('customReason').value.trim() || 'Payment not received';
    const btn = document.getElementById('confirmRejectBtn');

    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const response = await apiFetch(`/admin/reject`, {
            method: 'POST',
            body: JSON.stringify({
                transaction_id: pendingRejectionId,
                reason: reason
            })
        });

        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            showToast('❌ Transaction rejected');
            transactions = transactions.filter(t => t.id !== pendingRejectionId);
            renderTransactions();
            closeRejectionModal();
        } else {
            showToast('⚠️ Error: ' + (data.error || 'Rejection failed'));
            btn.disabled = false;
            btn.textContent = 'Confirm Rejection';
        }
    } catch (error) {
        console.error('Rejection Error:', error);
        showToast('❌ Connection error');
        btn.disabled = false;
        btn.textContent = 'Confirm Rejection';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const recoveryPass = document.getElementById('newRecoveryPassword');
    if (recoveryPass) {
        recoveryPass.addEventListener('input', (e) => {
            if (e.target.value.includes(' ')) {
                e.target.value = e.target.value.replace(/\s/g, '');
            }
        });
    }
});

async function fetchUsers(append = false) {
    if (isLoadingMoreUsers) return;
    isLoadingMoreUsers = true;

    // UI feedback if loading more
    if (append && loadMoreUsersBtn) {
        loadMoreUsersBtn.textContent = 'Loading...';
        loadMoreUsersBtn.disabled = true;
    }

    try {
        const response = await apiFetch(`/admin/users?limit=20&offset=${usersOffset}`);
        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            const newUsers = data.users || [];
            totalUsers = data.total_count || 0;

            if (append) {
                users = [...users, ...newUsers];
            } else {
                users = newUsers;
            }

            renderUsers();
        } else {
            showError(data.error || 'Failed to load users');
        }
    } catch (error) {
        console.error('Fetch Users Error:', error);
        showError('Connection error while fetching users');
    } finally {
        isLoadingMoreUsers = false;
        if (loadMoreUsersBtn) {
            loadMoreUsersBtn.textContent = 'View More Users';
            loadMoreUsersBtn.disabled = false;
        }
    }
}

function renderUsers() {
    // Show users table, hide other tables
    tableContainer.classList.add('hidden');
    usersTableContainer.classList.remove('hidden');

    const label = document.querySelector('.stat-label');
    if (label) label.textContent = 'Total Users:';

    pendingCountEl.textContent = totalUsers;

    if (users.length === 0) {
        usersBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="9">No registered users found</td>
            </tr>
        `;
        usersLoadMore.classList.add('hidden');
        return;
    }

    usersBody.innerHTML = users.map(user => {
        const lastSeen = user.last_seen ? new Date(user.last_seen) : new Date(0);
        const isOnline = (new Date() - lastSeen) < 90000; // 90 Seconds threshold

        return `
        <tr>
            <td><strong>#${user.id}</strong></td>
            <td>
                <div class="user-info">
                    <span class="username">${user.first_name} ${user.last_name}</span>
                    <span class="user-id">@${user.username}</span>
                    <div style="font-size: 10px; opacity:0.6; margin-top:4px;">Email: ${user.email || 'None'}</div>
                </div>
            </td>
            <td>
                <div class="user-info">
                    <span class="username">${user.fecto_id || 'No FectoId'}</span>
                    <span class="user-id">${user.phone}</span>
                </div>
            </td>
            <td>
                <div class="user-info" style="gap: 2px;">
                    <div style="font-size: 11px;"><span style="opacity:0.6;">Code:</span> <span class="text-emerald-400 font-mono">${user.referral_code}</span></div>
                    <div style="font-size: 11px;"><span style="opacity:0.6;">By:</span> <span class="text-gray-400">${user.referred_by || 'Direct'}</span></div>
                </div>
            </td>
            <td class="amount">Rs. ${(user.wallet_balance || 0).toLocaleString()}</td>
            <td>
                <div style="max-width: 220px; font-size: 10px; line-height: 1.4;">
                    ${user.purchased_courses ? user.purchased_courses.split(', ').map(c => `<span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 4px; display: inline-block; margin: 1px; color:#e0e0e0;">${c}</span>`).join('') : '<span style="opacity:0.4;">No courses bought</span>'}
                </div>
            </td>
            <td>
                <div class="flex flex-col gap-1">
                    <span class="status-tag ${isOnline ? 'active' : 'inactive'}" style="font-size: 8px; padding: 2px 6px;">
                        ${isOnline ? 'Online' : 'Offline'}
                    </span>
                    <span class="status-tag ${user.is_active ? 'active' : 'inactive'}" style="font-size: 8px; padding: 2px 6px;">
                        ${user.is_active ? 'Active' : 'Banned'}
                    </span>
                    ${user.has_purchased ? '<span class="status-tag active" style="font-size: 8px; padding: 2px 6px; background: rgba(16, 185, 129, 0.2); color: #10b981;">Paid Member</span>' : ''}
                </div>
            </td>
            <td class="date" style="font-size: 11px;">${new Date(user.created_at).toLocaleDateString()}</td>
        </tr>
    `}).join('');

    // Toggle Load More button
    if (users.length < totalUsers) {
        usersLoadMore.classList.remove('hidden');
    } else {
        usersLoadMore.classList.add('hidden');
    }
}

async function fetchOnlineUsers() {
    try {
        const response = await apiFetch('/admin/online_users');
        const res = await response.json();
        const data = processResponse(res);
        if (data.success) {
            renderOnlineUsers(data.users || []);
        } else {
            showError(data.error || 'Failed to fetch online users');
        }
    } catch (error) {
        console.error('Online Users Error:', error);
    }
}

function renderOnlineUsers(onlineUsers) {
    resetView();
    tableContainer.classList.add('hidden');
    onlineTableContainer.classList.remove('hidden');

    const label = document.querySelector('.stat-label');
    if (label) label.textContent = 'Online Now:';

    pendingCountEl.textContent = onlineUsers.length;

    if (onlineUsers.length === 0) {
        onlineBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="6">No users currently online (Active in last 90s)</td>
            </tr>
        `;
        return;
    }

    onlineBody.innerHTML = onlineUsers.map(user => {
        const lastSeen = user.last_seen ? new Date(user.last_seen) : new Date(0);
        const diff = Math.floor((new Date() - lastSeen) / 1000);
        let timeLabel = 'Active Now';
        if (diff > 5) timeLabel = `${diff}s ago`;
        if (diff > 60) timeLabel = `${Math.floor(diff / 60)}m ago`;

        return `
            <tr>
                <td><strong>#${user.id}</strong></td>
                <td>
                    <div class="user-info">
                        <span class="username">${user.first_name} ${user.last_name}</span>
                        <span class="user-id">@${user.username}</span>
                    </div>
                </td>
                <td><span class="font-mono text-emerald-400">${user.fecto_id || 'N/A'}</span></td>
                <td>
                    ${user.has_purchased
                ? '<span class="status-tag active" style="font-size: 10px;">Paid Member</span>'
                : '<span class="status-tag inactive" style="font-size: 10px;">Free User</span>'}
                </td>
                <td>
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span class="text-xs text-gray-400">${timeLabel}</span>
                    </div>
                </td>
                <td>
                    <button class="btn btn-view" onclick="openSupportChat(${user.id}, '${user.username}')">Message</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function fetchHistory(append = false) {
    if (isLoadingMoreHistory) return;
    isLoadingMoreHistory = true;

    if (append && loadMoreHistoryBtn) {
        loadMoreHistoryBtn.textContent = 'Loading...';
        loadMoreHistoryBtn.disabled = true;
    }

    try {
        const response = await apiFetch(`/admin/all-transactions?limit=20&offset=${historyOffset}`);
        const res = await response.json();
        const data = processResponse(res);

        if (data.success) {
            const newHistory = data.transactions || [];
            totalHistory = data.total_count || 0;

            if (append) {
                historyItems = [...historyItems, ...newHistory];
            } else {
                historyItems = newHistory;
            }

            renderHistory();
        } else {
            showError(data.error || 'Failed to load transaction history');
        }
    } catch (error) {
        console.error('Fetch History Error:', error);
        showError('Connection error while fetching history');
    } finally {
        isLoadingMoreHistory = false;
        if (loadMoreHistoryBtn) {
            loadMoreHistoryBtn.textContent = 'View More Records';
            loadMoreHistoryBtn.disabled = false;
        }
    }
}

function renderHistory() {
    resetView();
    tableContainer.classList.add('hidden');
    historyTableContainer.classList.remove('hidden');

    const label = document.querySelector('.stat-label');
    if (label) label.textContent = 'Total Records:';

    pendingCountEl.textContent = totalHistory;

    if (historyItems.length === 0) {
        historyBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="7">No transaction records found</td>
            </tr>
        `;
        historyLoadMore.classList.add('hidden');
        return;
    }

    historyBody.innerHTML = historyItems.map(txn => {
        let statusClass = 'status-tag pending';
        if (txn.status === 'success' || txn.status === 'approved') statusClass = 'status-tag active';
        if (txn.status === 'failed' || txn.status === 'rejected') statusClass = 'status-tag inactive';

        return `
            <tr>
                <td><strong>#${txn.id}</strong></td>
                <td>
                    <div class="user-info">
                        <span class="username">${txn.username}</span>
                        <span class="user-id">ID: ${txn.user_id}</span>
                    </div>
                </td>
                <td>
                    <div class="user-info">
                        <span class="username">${txn.type === 'purchase' ? 'Purchase' : txn.type === 'commission' ? 'Commission' : 'Withdrawal'}</span>
                        <span class="user-id" style="font-size: 10px;">${txn.course_title || ''}</span>
                    </div>
                </td>
                <td class="amount">Rs. ${txn.amount.toLocaleString()}</td>
                <td>
                    <span class="${statusClass}" style="font-size: 10px; padding: 2px 8px;">
                        ${(txn.status || 'pending').toUpperCase()}
                    </span>
                </td>
                <td class="date" style="font-size: 11px;">${new Date(txn.created_at).toLocaleString()}</td>
                <td>
                    <button class="btn btn-view" style="padding: 4px 8px; font-size: 10px;" onclick="viewHistoryDetails(${txn.id})">Details</button>
                </td>
            </tr>
        `;
    }).join('');

    if (historyItems.length < totalHistory) {
        historyLoadMore.classList.remove('hidden');
    } else {
        historyLoadMore.classList.add('hidden');
    }
}

function viewHistoryDetails(id) {
    // Reuse existing viewDetails if possible, or adapt
    // Current viewDetails depends on 'transactions' array which is for pending.
    // Let's make a quick adapted version or update 'transactions' temporarily?
    // Safer to find in historyItems
    const txn = historyItems.find(t => t.id === id);
    if (!txn) return;

    // Temporarily put it in transactions so viewDetails works
    const oldTxns = transactions;
    transactions = historyItems;
    viewDetails(id);
    transactions = oldTxns; // Restore
}

// Bind Modal Buttons
document.addEventListener('DOMContentLoaded', () => {
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');

    if (approveBtn) {
        approveBtn.addEventListener('click', () => {
            if (currentTransactionId) {
                approveTransaction(currentTransactionId);
                // Modal will be closed by approveTransaction if it refreshes, or we close it here
                document.getElementById('detailsModal').classList.add('hidden');
            }
        });
    }

    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            if (currentTransactionId) {
                // Close details modal first or keep it open? 
                // Currently openRejectionModal opens another modal.
                // We should probably keep details open or close it. Let's close it to avoid clutter.
                document.getElementById('detailsModal').classList.add('hidden');
                openRejectionModal(currentTransactionId);
            }
        });
    }
});
