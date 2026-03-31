/**
 * js/app.js - The Brain
 * Initializes application, binds events, and connects UI-Auth-Wallet.
 */

// Course Data (Static for fallback, updated dynamically)
let COURSES = [];

const App = {
    state: {
        isLoggedIn: false,
        user: null, // includes balance, id, etc.
        notifications: [],
        transactions: [],
        purchasedCourses: [],
        currentPurchaseId: null,
        activeChatId: null,
        referralOffset: 0,
        seenTransactionStatuses: {}, // ID -> Status mapping
        supportChatInterval: null,
        lastChatTime: 0,
        notificationOffset: 0,
        hasMoreNotifications: true,
        chatOffset: 0,
        hasMoreChat: true,
        isLoadingMoreChat: false,
        recoveryChatHistory: [],
        transactionLimit: 20,
        transactionOffset: 0,
        hasMoreTransactions: true,
        isLoadingMoreTransactions: false,
        activeTxnFilter: 'all'
    },

    init() {
        window.AppInstance = this; // Global access for UI hooks
        window.initiateDeleteAccount = () => this.initiateDeleteAccount();
        this.loadState();
        this.setupEventListeners();

        if (this.state.isLoggedIn) {
            UI.showPage('appContainer');
            UI.showAppPage('allCoursesPage'); // Default page
            this.refreshData();
            this.fetchCourses(); // Fetch courses only if logged in

            // Start Lightweight Global Sync (60s)
            this.syncInterval = setInterval(() => this.refreshData(), 60000);
        } else {
            UI.showPage('authPage');
            UI.showAuthPanel('login');
        }

        // Initialize UI components
        UI.initPendingDropdown();
        UI.initNotificationDropdown();
        UI.initNotificationScroll();
        UI.initPasswordToggles();
        UI.initGlobalSearch();

        // Initial Ban Check
        if (this.state.isLoggedIn && this.state.user) {
            this.checkBanStatus(this.state.user);
        }

        // Handle Referral Links (?ref=CODE)
        UI.handleReferralURL();
    },

    loadState() {
        const saved = localStorage.getItem('earnerState');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = { ...this.state, ...parsed };
            UI.updateProfileDisplay(this.state.user, Auth.API_URL, this.state.transactions);
            UI.updateDashboard(this.state.user?.wallet_balance || 0);
            this.state.seenTransactionStatuses = parsed.seenTransactionStatuses || {};
            UI.renderNewPendingItems(this.state.transactions);
            UI.renderNotifications(this.state.notifications || []);
        }
    },

    saveState() {
        localStorage.setItem('earnerState', JSON.stringify({
            isLoggedIn: this.state.isLoggedIn,
            token: this.state.token, // Preserve Session Token
            user: this.state.user,
            purchasedCourses: this.state.purchasedCourses,
            transactions: this.state.transactions,
            notifications: this.state.notifications,
            seenTransactionStatuses: this.state.seenTransactionStatuses,
            recoveryIntroSent: this.state.recoveryIntroSent,
            guestId: this.state.guestId,
            recoveryChatHistory: this.state.recoveryChatHistory,
            lastRecoveryUsername: this.state.lastRecoveryUsername
        }));
    },

    logout() {
        Auth.logout(); // Clears fallback token and notifies backend
        this.state.isLoggedIn = false;
        this.state.user = null;
        localStorage.removeItem('earnerState');
        window.location.reload();
    },

    checkBanStatus(user) {
        if (user && user.is_banned) {
            const overlay = document.getElementById('bannedOverlay');
            const reasonEl = document.getElementById('bannedReasonDisplay');
            if (overlay) {
                overlay.classList.remove('hidden');
                if (reasonEl) reasonEl.textContent = user.ban_reason || 'Violation of Terms';
            }
        } else {
            const overlay = document.getElementById('bannedOverlay');
            if (overlay) overlay.classList.add('hidden');
        }
    },

    async refreshData() {
        if (!this.state.isLoggedIn) return;

        // 1. Fetch Stats
        const statsData = await Wallet.fetchFreshStats();

        // Critical: Check if account exists
        if (!statsData.success) {
            // Distinguish between Server Error and Network Error
            if (statsData.error) {
                const fatalErrors = ["Invalid or expired token", "User not found", "User account inactive", "Missing auth token", "Invalid or expired admin token", "Missing admin token"];
                if (fatalErrors.includes(statsData.error) || statsData.status === 401 || statsData.status === 403) {
                    console.warn("Session invalid:", statsData.error);
                    this.logout();
                } else {
                    UI.showToast("Sync Error", statsData.error, "error");
                }
            } else {
                // No error field usually means catch block (Network Error)
                UI.showToast("Connection Error", "Server not responding, please try again later", "error");
            }
            return;
        }

        if (statsData.success) {
            this.state.user = { ...this.state.user, ...statsData.stats }; // Merge fresh stats
            this.state.referralOffset = 0;
            UI.updateDashboard(this.state.user.wallet_balance);
            UI.updateProfileDisplay(this.state.user, Auth.API_URL, this.state.transactions); // Update profile/referral fields
            this.checkBanStatus(this.state.user); // Check if user got banned
            this.saveState();
        }

        // 2. Fetch Transactions (Initial Load)
        this.state.transactionOffset = 0;
        this.state.activeTxnFilter = 'all'; // Reset filter on full refresh
        const txnData = await Wallet.fetchTransactions(this.state.transactionLimit, 0);
        if (txnData.success) {
            this.state.transactions = txnData.transactions;

            // Pagination Logic
            this.state.hasMoreTransactions = txnData.transactions.length >= this.state.transactionLimit;
            UI.toggleTransactionLoadMoreBtn(this.state.hasMoreTransactions);

            UI.renderTransactions(this.state.transactions, this.state.activeTxnFilter);
            UI.updateTransactionFilterButtons(this.state.activeTxnFilter);

            UI.updateChart('7D', this.state.transactions);
            // Derive purchased courses
            this.state.purchasedCourses = this.state.transactions
                .filter(t => t.type === 'purchase' && t.status === 'approved')
                .map(t => t.course_id)
                .filter(id => id !== undefined && id !== null);
            this.saveState();
        }

        // 3. Fetch Notifications (Initial Load)
        this.state.notificationOffset = 0;
        const notifData = await Wallet.fetchNotifications(20, 0);
        if (notifData.success) {
            this.state.notifications = notifData.notifications || [];
            this.state.hasMoreNotifications = this.state.notifications.length >= 10;
            UI.renderNotifications(this.state.notifications);
        }

        // 4. Fetch Progress (Cloud Sync)
        try {
            const progressResp = await fetch(`${Auth.API_URL}/api/progress/get`, {
                headers: Auth.getHeaders(),
                credentials: 'include'
            });
            const pData = await progressResp.json();
            if (pData.success && pData.progress) {
                Object.keys(pData.progress).forEach(courseId => {
                    localStorage.setItem(`completed_classes_${courseId}`, JSON.stringify(pData.progress[courseId]));
                });
            }
        } catch (e) {
            console.error("Progress fetch error:", e);
        }

        this.saveState();
    },

    async loadMoreNotifications() {
        if (!this.state.hasMoreNotifications || this.state.isLoadingMoreNotifs) return;

        this.state.isLoadingMoreNotifs = true;
        this.state.notificationOffset += 20;

        const res = await Wallet.fetchNotifications(20, this.state.notificationOffset);
        if (res.success) {
            if (res.notifications.length === 0) {
                this.state.hasMoreNotifications = false;
            } else {
                this.state.notifications = [...this.state.notifications, ...res.notifications];
                UI.renderNotifications(this.state.notifications, true); // true for append
                if (res.notifications.length < 20) this.state.hasMoreNotifications = false;
            }
            this.saveState();
        }
        this.state.isLoadingMoreNotifs = false;
    },

    async loadMoreTransactions() {
        if (!this.state.hasMoreTransactions || this.state.isLoadingMoreTransactions) return;

        this.state.isLoadingMoreTransactions = true;
        const btn = document.getElementById('btnShowMoreTransactions');
        if (btn) btn.innerHTML = '<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>';

        this.state.transactionOffset += this.state.transactionLimit;

        const res = await Wallet.fetchTransactions(this.state.transactionLimit, this.state.transactionOffset);
        if (res.success) {
            if (res.transactions.length === 0) {
                this.state.hasMoreTransactions = false;
            } else {
                // Append new transactions
                this.state.transactions = [...this.state.transactions, ...res.transactions];

                // Re-render with current filter (append logic is implicit in client-side filtering of full list)
                UI.renderTransactions(this.state.transactions, this.state.activeTxnFilter);

                if (res.transactions.length < this.state.transactionLimit) {
                    this.state.hasMoreTransactions = false;
                }
            }
            this.saveState();
        }

        this.state.isLoadingMoreTransactions = false;
        if (btn) btn.innerHTML = '<span>Show More</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>';
        UI.toggleTransactionLoadMoreBtn(this.state.hasMoreTransactions);
    },



    // --- Event Handling ---

    async initializeCoursePlayer(courseId) {
        // Only allow if user is logged in
        if (!this.state.user) return;

        // Find course title
        const course = COURSES.find(c => c.id === courseId);
        const title = course ? course.title : 'Course Player';

        // Hide UI overlays if any
        UI.hideModal();

        // Initialize Player
        CoursePlayer.init(courseId, title);
    },

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Zero Reloads
                const page = btn.getAttribute('data-page');
                UI.showAppPage(page);

                // Lazy Loads
                if (page === 'networkPage' || page === 'analyticsPage') {
                    this.refreshData();
                    if (page === 'analyticsPage') UI.updateChart('7D', this.state.transactions);
                }
                else if (page === 'allCoursesPage') UI.renderCourses(COURSES, this.state.purchasedCourses);
                else if (page === 'purchasedCoursesPage') UI.renderPurchasedCourses(COURSES, this.state.purchasedCourses);
                else if (page === 'progressPage') UI.renderProgress(COURSES, this.state.purchasedCourses);
            });
        });

        // Transaction Filters
        document.querySelectorAll('.txn-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filter = btn.getAttribute('data-filter');
                this.state.activeTxnFilter = filter;
                UI.updateTransactionFilterButtons(filter);
                UI.renderTransactions(this.state.transactions, filter);
            });
        });

        // Load More Transactions
        document.getElementById('btnShowMoreTransactions')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadMoreTransactions();
        });

        // Auth Forms
        document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            UI.showForgotPanel();
        });

        document.getElementById('backToLoginBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            UI.showLoginPanel();
        });

        document.getElementById('forgotSubmitBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('forgotUsername');
            const username = usernameInput.value.trim();
            const statusArea = document.getElementById('recoveryStatus');
            const submitBtn = document.getElementById('forgotSubmitBtn');

            if (!username) return UI.showToast("Error", "Please enter your username", "error");
            if (username.length < 4 || username.length > 20) {
                return UI.showToast("Error", "Username must be between 4 and 20 characters", "error");
            }

            UI.showLoader('Verifying Account...');
            const res = await Auth.checkAccountStatus(username);
            UI.hideLoader();

            if (!res.success) {
                return UI.showToast("Account Not Found", "The username you entered does not exist.", "error");
            }

            statusArea.classList.remove('hidden');

            if (res.status === 'inactive') {
                statusArea.innerHTML = `
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 14c-.77 1.333.192 3 1.732 3z"></path></svg>
                        </div>
                        <div>
                            <p class="font-bold text-white text-base mb-1">Account Inactive</p>
                            <p class="text-gray-400 leading-relaxed text-sm">This account has been disabled. For security reasons, you must contact our support team to reactivate and recover it.</p>
                            <button id="forgotToSupportBtn-Inactive" class="mt-3 text-[#10b981] font-bold hover:underline text-sm flex items-center gap-1">
                                Talk to Support
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </button>
                        </div>
                    </div>
                `;
                document.getElementById('forgotToSupportBtn-Inactive')?.addEventListener('click', () => {
                    this.openSupportChat(true, username);
                });
            } else if (res.hasEmail) {
                const maskEmail = (email) => {
                    if (!email) return "your email";
                    const [user, domain] = email.split('@');
                    if (user.length <= 2) return user + "***@" + domain;
                    return user.substring(0, 2) + "***@" + domain;
                };
                const maskedEmail = maskEmail(res.email);

                statusArea.innerHTML = `
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-xl bg-[#10b981]/20 flex items-center justify-center text-[#10b981] shrink-0">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <p class="font-bold text-white text-base mb-1">Account Found!</p>
                            <p class="text-gray-400 leading-relaxed text-sm">You will receive an email at <strong>${maskedEmail}</strong> within 24 hours regarding your recovery.</p>
                        </div>
                    </div>
                `;
                submitBtn.classList.add('hidden');
            } else {
                statusArea.innerHTML = `
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <p class="font-bold text-white text-base mb-1">No Email Found</p>
                            <p class="text-gray-400 leading-relaxed text-sm">There is no email address attached to this account. You must verify your identity through live support to recover your password.</p>
                            <button id="forgotToSupportBtn" class="mt-4 w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3.5 rounded-xl border border-white/10 transition duration-300">
                                Talk to Support
                            </button>
                        </div>
                    </div>
                `;
                document.getElementById('forgotToSupportBtn')?.addEventListener('click', () => {
                    this.openSupportChat(true, username);
                });
                submitBtn.classList.add('hidden');
            }
        });

        document.getElementById('loginSubmitBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            UI.showLoader('Authenticating...');
            const u = document.getElementById('loginUsername').value;
            const p = document.getElementById('loginPassword').value;

            const res = await Auth.login(u, p);
            UI.hideLoader();

            if (res.success) {
                this.state.isLoggedIn = true;
                this.state.user = res.user;
                this.state.token = res.user.token;
                this.state.purchasedCourses = res.user.purchased_courses || [];
                this.saveState();

                UI.showToast('Welcome', `Logged in as ${res.user.first_name}`);
                UI.showPage('appContainer');
                UI.showAppPage('allCoursesPage');
                UI.updateDashboard(this.state.user.wallet_balance || 0);
                UI.updateProfileDisplay(this.state.user, Auth.API_URL, this.state.transactions);
                this.refreshData();
                this.fetchCourses();
            } else {
                UI.showToast('Login Failed', res.error, 'error');
            }
        });

        // Enter Key Support for Login
        document.getElementById('loginForm')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('loginSubmitBtn')?.click();
            }
        });

        document.getElementById('registerSubmitBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();

            const firstName = document.getElementById('regFirstName').value.trim();
            const lastName = document.getElementById('regLastName').value.trim();
            const username = document.getElementById('regUsername').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;
            const referralCode = document.getElementById('registrationReferralCode')?.value.trim().toUpperCase() || "";
            const terms = document.getElementById('termsCheck')?.checked;

            // 1. Basic Validations
            if (!terms) return UI.showToast("Error", "Please accept the Terms & Conditions", "error");
            if (!firstName || !lastName || !username || !phone || !password) {
                return UI.showToast("Error", "Please fill in all required fields", "error");
            }

            // 1b. Length Validations
            if (firstName.length > 20) return UI.showToast("First Name Too Long", "First name must be 20 characters or less.", "error");
            if (lastName.length > 20) return UI.showToast("Last Name Too Long", "Last name must be 20 characters or less.", "error");
            if (email && email.length > 50) return UI.showToast("Email Too Long", "Email must be 50 characters or less.", "error");

            // 2. Username Validation
            if (username.length < 4) return UI.showToast("Username Too Short", "Username must be at least 4 characters long.", "error");
            if (username.length > 20) return UI.showToast("Username Too Long", "Username must be less than 20 characters.", "error");
            if (/^\d+$/.test(username)) return UI.showToast("Invalid Username", "Username cannot be only numbers.", "error");

            // 3. Phone Validation (03xx-xxxxxxx)
            const phoneRegex = /^03\d{2}-\d{7}$/;
            if (!phoneRegex.test(phone)) return UI.showToast("Invalid Phone", "Please use format: 03xx-xxxxxxx", "error");

            // 4. Password Validation
            if (password !== confirmPassword) return UI.showToast("Error", "Passwords do not match!", "error");
            if (password.length < 8) return UI.showToast("Weak Password", "Password must be at least 8 characters long.", "error");
            if (password.length > 128) return UI.showToast("Password Too Long", "Password must be 128 characters or less.", "error");

            // 5. Referral Code Validation (Exactly 8 Characters)
            if (referralCode.length > 0 && referralCode.length !== 8) {
                return UI.showToast("Invalid Referral", "Referral code must be 8 digits long.", "error");
            }

            const data = {
                first_name: firstName,
                last_name: lastName,
                username: username,
                phone: phone,
                email: email,
                password: password,
                referral_code: referralCode
            };

            UI.showLoader('Creating Account...');
            const res = await Auth.register(data);
            UI.hideLoader();

            if (res.success) {
                UI.showToast('Success', 'Account Created! Welcome to Fectoskills.');

                // Auto-login: Set state and show app
                this.state.isLoggedIn = true;
                this.state.token = res.user.token;
                this.state.user = res.user;
                this.saveState();

                // Store referral code in localStorage to prevent re-application
                if (referralCode) {
                    localStorage.setItem('used_referral_code', referralCode);
                }

                UI.showPage('appContainer');
                UI.showAppPage('allCoursesPage');
                UI.updateDashboard(this.state.user.wallet_balance || 0);
                UI.updateProfileDisplay(this.state.user, Auth.API_URL, this.state.transactions);
                this.refreshData(); // Fetch full stats/transactions
                this.fetchCourses();

                // Clear inputs
                document.querySelectorAll('#registerForm input').forEach(input => input.value = '');
            } else {
                const errMsg = res.error || "Registration failed";
                if (errMsg === "Username already exists") {
                    UI.showToast("Username Taken", "This username is already taken. Please try another.", "error");
                } else if (errMsg === "Phone number already registered") {
                    UI.showToast("Phone Registered", "This phone number is already registered. Please login.", "error");
                } else if (errMsg === "Email already exists") {
                    UI.showToast("Email Taken", "This email is already in use. Please use a different one.", "error");
                } else if (errMsg.includes("Invalid referral code")) {
                    UI.showToast("Invalid Referral Code", "The referral code doesn't exist. Please check or leave blank.", "error");
                } else {
                    UI.showToast('Error', errMsg, 'error');
                }
            }
        });

        // Enter Key Support for Register
        document.getElementById('registerForm')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('registerSubmitBtn')?.click();
            }
        });

        document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });

        document.getElementById('mobileLogoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });

        // Toggles
        document.getElementById('showRegisterBtn')?.addEventListener('click', () => UI.showAuthPanel('register'));
        document.getElementById('showLoginBtn')?.addEventListener('click', () => UI.showAuthPanel('login'));
        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => UI.toggleMobileSidebar());

        // Phone Formatting (03xx-xxxxxxx)
        const formatPhone = (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 0) {
                if (value.length <= 4) {
                    value = value;
                } else if (value.length <= 11) {
                    value = value.slice(0, 4) + '-' + value.slice(4);
                } else {
                    value = value.slice(0, 11);
                    value = value.slice(0, 4) + '-' + value.slice(4);
                }
            }
            e.target.value = value;
        };
        document.getElementById('regPhone')?.addEventListener('input', formatPhone);
        document.getElementById('withdrawPhone')?.addEventListener('input', formatPhone);

        // Referrals
        document.getElementById('copyReferralBtn')?.addEventListener('click', () => {
            const link = document.getElementById('referralLinkDisplay')?.textContent;
            if (link) {
                navigator.clipboard.writeText(link);
                UI.showToast('Copied', 'Referral link copied to clipboard!');
            }
        });

        // Close Modals (Fix for broken cross buttons)
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                UI.hideModal();
            });
        });

        // Pending Dropdown
        document.getElementById('pendingDropdownTrigger')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            UI.toggleNewPendingDropdown(e, this.state.transactions);
        });

        // Notification Slider
        document.querySelector('.app-header-notification[onclick*="toggleNotificationSlider"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            UI.toggleNotificationSlider();
        });

        // Purchase Handler
        document.getElementById('securePurchaseBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();

            try {
                const senderName = document.getElementById('courseSenderName').value;
                const senderPhone = document.getElementById('courseSenderPhone').value;
                const trxId = document.getElementById('courseTrxId').value;

                if (!senderName || !senderPhone || !trxId) {
                    UI.showToast('Missing Fields', 'Please fill in required fields.', 'error');
                    return;
                }

                if (!this.state.user || !this.state.user.id) {
                    throw new Error("User state not loaded. Please re-login.");
                }

                // Length Validations
                if (senderName.length > 50) return UI.showToast('Validation Error', 'Name is too long (max 50).', 'error');
                if (senderPhone.length > 15) return UI.showToast('Validation Error', 'Phone is too long (max 15).', 'error');
                if (trxId.length > 30) return UI.showToast('Validation Error', 'Transaction ID is too long (max 30).', 'error');

                // Screenshot Size Validation (20MB = 20 * 1024 * 1024 bytes)
                const screenshotFile = document.getElementById('proofFile')?.files[0];
                if (screenshotFile && screenshotFile.size > 20971520) {
                    return UI.showToast('File Too Large', 'Screenshot must be under 20MB.', 'error');
                }

                UI.showLoader('Verifying Payment...');

                let screenshotPath = "";
                if (screenshotFile) {
                    const uploadRes = await Wallet.uploadScreenshot(screenshotFile);
                    if (uploadRes.success) {
                        screenshotPath = uploadRes.data?.path || uploadRes.path || "";
                    } else {
                        UI.hideLoader();
                        return UI.showToast('Upload Error', 'Failed to upload screenshot. Please try again.', 'error');
                    }
                }

                const course = COURSES.find(c => c.id === (this.state.currentPurchaseId || (COURSES[0] ? COURSES[0].id : 6)));
                const data = {
                    course_id: course.id,
                    amount: course.price,
                    description: `Course Purchase: ${course.title}. TrxID: ${trxId}`,
                    account_title: senderName,
                    target_account: senderPhone,
                    public_id: trxId,
                    screenshot_path: screenshotPath
                };

                const res = await Wallet.submitPurchase(data);

                UI.hideLoader();

                if (res.success) {
                    UI.hideModal();
                    UI.showModal('purchaseSuccessModal');
                    // Clear form
                    document.getElementById('courseTrxId').value = '';
                    document.getElementById('courseSenderName').value = '';
                    document.getElementById('courseSenderPhone').value = '';
                    document.getElementById('proofFile').value = '';
                    document.getElementById('fileNameDisplay').textContent = 'Upload Screenshot';

                    // Immediately fetch transactions
                    const txnData = await Wallet.fetchTransactions();
                    if (txnData.success) {
                        this.state.transactions = txnData.transactions;
                        UI.renderNewPendingItems(this.state.transactions);
                        this.saveState();
                    }

                    // Full refresh stats to show the pending item everywhere
                    this.refreshData();
                } else {
                    UI.showToast('Verification Failed', res.error || 'Could not verify transaction.', 'error');
                }
            } catch (error) {
                UI.hideLoader();
                UI.showToast("Error", error.message, "error");
            }
        });

        // Purchase & Withdrawals (Mocked Connectors)
        window.loadMoreReferrals = async () => {
            const btn = document.getElementById('btnLoadMoreReferrals');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Loading...';
            }

            // Increase offset
            UI.showLoader('Loading referrals...');
            this.state.referralOffset += 10;
            const res = await Auth.getReferrals(this.state.user.referral_code, 10, this.state.referralOffset);

            if (res.success) {
                UI.updateReferralList(res.data.referral_list, true, res.data.has_more);
            } else {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Show More';
                }
                UI.showToast('Error', 'Failed to load more referrals', 'error');
            }
        };

        window.showCourseDetailRequested = (id) => {
            const course = COURSES.find(c => c.id === id);
            const isOwned = this.state.purchasedCourses.includes(id);
            UI.showCourseDetail(course, isOwned, this.state.transactions);
        };

        window.initiatePurchaseRequested = (id) => {
            this.state.currentPurchaseId = id;
            UI.showModal('paymentMethodModal');
        };

        window.openSupportChat = () => this.openSupportChat();

        window.openSupportChatRequested = () => {
            this.openSupportChat();
        };

        window.markNotificationReadRequested = async (id) => {
            const res = await Wallet.markNotificationsRead(id);
            if (res.success) {
                // Instead of removing, mark as read in local state so they remain visible
                if (id) {
                    this.state.notifications = this.state.notifications.map(n => {
                        if (n.id === id) return { ...n, is_read: 1 };
                        return n;
                    });
                } else {
                    // If no ID (rare/all), mark everything read
                    this.state.notifications = this.state.notifications.map(n => ({ ...n, is_read: 1 }));
                }

                this.saveState();
                UI.renderNotifications(this.state.notifications);
            }
        };

        window.handleAvatarChange = async (input) => {
            if (input.files && input.files[0]) {
                const file = input.files[0];

                // Basic validation
                if (file.size > 5 * 1024 * 1024) {
                    UI.showToast('File Too Large', 'Please upload an image smaller than 5MB.', 'error');
                    return;
                }

                UI.showLoader('Updating avatar...');
                const res = await Auth.uploadAvatar(file);
                UI.hideLoader();

                if (res.success) {
                    // Update State
                    this.state.user.avatar_path = res.data.avatar_url; // "uploads/avatars/..."
                    this.saveState();

                    // Update UI immediately
                    UI.updateProfileDisplay(this.state.user, Auth.API_URL, this.state.transactions);
                    UI.showToast('Success', 'Profile picture updated!');
                } else {
                    UI.showToast('Upload Failed', res.error, 'error');
                }
            }
        };

        window.selectPurchaseMethod = (method) => {
            this.state.selectedPaymentMethod = method;
            const course = COURSES.find(c => c.id === this.state.currentPurchaseId);
            UI.updatePaymentModal(method, course);
        };

        window.sendSupportMessageRequested = async () => {
            const input = document.getElementById('supportChatInput');
            const message = input?.value.trim();
            if (!message) return;

            if (message.length > 500) {
                return UI.showToast('Message Too Long', 'Please keep your message under 500 characters.', 'error');
            }

            // Rate Limit: 1 message per minute (60,000ms)
            const now = Date.now();
            const timeSinceLastChat = now - (this.state.lastChatTime || 0);
            if (timeSinceLastChat < 60000) {
                const secondsLeft = Math.ceil((60000 - timeSinceLastChat) / 1000);
                return UI.showToast('Rate Limit', `Please wait ${secondsLeft}s before sending another message.`, 'warning');
            }

            const btn = document.querySelector('button[onclick="window.sendSupportMessageRequested()"]');
            if (btn) btn.disabled = true;

            let res;
            if (this.state.guestMode) {
                res = await Auth.sendMessage(message, this.state.guestUsername || 'Guest', this.state.guestId);
            } else {
                res = await Auth.sendMessage(message, this.state.user.username, localStorage.getItem('chat_session_id'));
            }

            if (res.success) {
                this.state.lastChatTime = Date.now();
                this.saveState();

                input.value = '';
                input.style.height = 'auto'; // Reset height
                if (document.getElementById('chatCharCount')) {
                    document.getElementById('chatCharCount').textContent = '0/500';
                }

                if (this.state.guestMode) {
                    const guestMsg = {
                        message: message,
                        sender_type: 'user',
                        created_at: new Date().toISOString()
                    };
                    this.state.recoveryChatHistory.push(guestMsg);
                    this.saveState();
                    UI.renderSupportChatMessages(this.state.recoveryChatHistory);
                } else {
                    await this.fetchChatHistory();
                }
            } else {
                UI.showToast('Error', 'Failed to send message', 'error');
            }
            if (btn) btn.disabled = false;
        };

        window.submitHelpFeedback = async () => {
            const feedbackText = document.getElementById('feedbackText')?.value.trim();
            const charCount = document.getElementById('feedbackCharCount');

            if (!feedbackText) {
                return UI.showToast('Empty Message', 'Please write something before sending.', 'error');
            }

            if (feedbackText.length > 1500) {
                return UI.showToast('Message Too Long', 'Please keep your feedback under 1500 characters.', 'error');
            }

            if (!this.state.user?.id) {
                return UI.showToast('Login Required', 'Please login to submit feedback.', 'error');
            }

            UI.showLoader('Sending feedback...');
            const res = await Auth.submitFeedback(feedbackText);
            UI.hideLoader();

            if (res.success) {
                document.getElementById('feedbackText').value = '';
                if (charCount) charCount.textContent = '0';
                UI.showToast('Feedback Sent', 'Thank you for your valuable feedback!', 'success');
            } else {
                UI.showToast('Error', res.error || 'Failed to send feedback.', 'error');
            }
        };

        // Character counter for feedback textarea
        document.getElementById('feedbackText')?.addEventListener('input', (e) => {
            const charCount = document.getElementById('feedbackCharCount');
            if (charCount) {
                charCount.textContent = e.target.value.length;
            }
        });

        // Security Tab
        document.getElementById('btnAddEmail')?.addEventListener('click', async () => {
            const email = document.getElementById('secEmailInput')?.value;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!email) return UI.showToast('Error', 'Please enter an email.', 'error');
            if (email.length > 50) return UI.showToast('Error', 'Email is too long (max 50 characters).', 'error');
            if (!emailRegex.test(email)) return UI.showToast('Error', 'Please enter a valid email address.', 'error');

            UI.showLoader('Updating email...');
            const res = await Auth.updateEmail(email);
            UI.hideLoader();

            if (res.success) {
                UI.showToast('Success', 'Email added successfully!');
                this.refreshData(); // This will hide the card automatically
            } else {
                UI.showToast('Error', res.error, 'error');
            }
        });

        document.getElementById('btnChangePassword')?.addEventListener('click', async () => {
            const oldPass = document.getElementById('secOldPass').value;
            const newPass = document.getElementById('secNewPass').value;
            const confirmPass = document.getElementById('secConfirmPass').value;

            if (!oldPass || !newPass || !confirmPass) {
                return UI.showToast('Error', 'Please fill in all fields', 'error');
            }

            // Client-side validation for existing password format
            if (oldPass.length < 6 || oldPass.length > 64) {
                return UI.showToast('Error', 'Current password format is invalid (6-64 chars)', 'error');
            }

            if (newPass !== confirmPass) {
                return UI.showToast('Error', 'New passwords do not match', 'error');
            }

            if (newPass.length < 8) {
                return UI.showToast('Error', 'New password must be at least 8 characters', 'error');
            }
            if (newPass.length > 128) {
                return UI.showToast('Error', 'New password must be 128 characters or less', 'error');
            }

            UI.showLoader('Changing password...');
            const res = await Auth.changePassword(oldPass, newPass);
            UI.hideLoader();

            if (res.success) {
                UI.showToast('Success', 'Password updated successfully!', 'success');
                // Clear inputs
                document.getElementById('secOldPass').value = '';
                document.getElementById('secNewPass').value = '';
                document.getElementById('secConfirmPass').value = '';
            } else {
                UI.showToast('Error', res.error || 'Failed to update password', 'error');
            }
        });

        // Delete Account - Final Confirmation
        document.getElementById('btnConfirmDeleteAccount')?.addEventListener('click', () => {
            const typedUsername = document.getElementById('deleteConfirmUsername').value;
            const password = document.getElementById('deleteConfirmPassword').value;

            if (typedUsername !== this.state.user.username) {
                return UI.showToast('Error', 'Username does not match.', 'error');
            }

            if (!password) {
                return UI.showToast('Error', 'Please enter your password to confirm.', 'error');
            }

            if (password.length < 6 || password.length > 64) {
                return UI.showToast('Error', 'Incorrect password format (6-64 chars).', 'error');
            }

            this.performAccountDeletion(password);
        });

        // Withdrawal Handler
        UI.initWithdrawMethodToggles();
        document.getElementById('secureWithdrawBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('withdrawalAmountInput').value;
            const method = document.querySelector('input[name="withdrawalMethod"]:checked')?.value;
            const title = document.getElementById('withdrawAccountTitle').value;
            const number = document.getElementById('withdrawAccountNumber').value;
            const bankName = document.getElementById('withdrawBankName').value;

            if (!amount || !title || !number || !method) {
                return UI.showToast("Missing Details", "Please fill in all account details", "error");
            }

            if (parseFloat(amount) < 40) {
                return UI.showToast("Amount Too Low", "Minimum withdrawal is Rs. 40 (to cover 2.5% fee).", "error");
            }

            if (title.length > 50) return UI.showToast("Validation Error", "Account Title is too long (max 50).", "error");
            if (number.length > 50) return UI.showToast("Validation Error", "Account Number is too long (max 50).", "error");
            if (method === 'bank' && bankName.length > 100) return UI.showToast("Validation Error", "Bank Name is too long (max 100).", "error");

            if (method === 'bank' && !bankName) {
                return UI.showToast("Missing Bank Name", "Please enter your bank name", "error");
            }
            if (parseFloat(amount) > (this.state.user.wallet_balance || 0)) {
                return UI.showToast("Insufficient Balance", "You do not have enough balance.", "error");
            }

            UI.showLoader('Requesting withdrawal...');
            const data = {
                amount: amount,
                method: method,
                account_title: title,
                account_number: number,
                bank_name: method === 'bank' ? bankName : ""
            };

            const res = await Wallet.requestWithdrawal(data);
            UI.hideLoader();

            if (res.success) {
                UI.showToast("Success", "Withdrawal request submitted successfully");
                UI.showModal('withdrawSuccessModal');
                this.refreshData();
            } else {
                UI.showToast("Failed", res.error || "Withdrawal failed", "error");
            }
        });

        // Space Prevention for Restricted Fields
        const noSpaceFields = [
            'loginUsername', 'loginPassword',
            'regFirstName', 'regLastName', 'regUsername', 'regPassword', 'regConfirmPassword',
            'secOldPass', 'secNewPass', 'secConfirmPass'
        ];

        noSpaceFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const preventSpace = (e) => {
                    if (e.key === ' ') {
                        e.preventDefault();
                    }
                };
                const cleanSpace = (e) => {
                    if (e.target.value.includes(' ')) {
                        e.target.value = e.target.value.replace(/\s/g, '');
                    }
                };
                el.addEventListener('keydown', preventSpace);
                el.addEventListener('input', cleanSpace);
            }
        });
    },

    initiateDeleteAccount() {
        const usernameDisplay = document.getElementById('deleteModalUsername');
        if (usernameDisplay) usernameDisplay.textContent = this.state.user.username;

        // Reset fields
        document.getElementById('deleteConfirmUsername').value = '';
        document.getElementById('deleteConfirmPassword').value = '';

        UI.showModal('deleteAccountModal');
    },

    async performAccountDeletion(password) {
        UI.showLoader('Deactivating account...');
        const res = await Auth.deleteAccount(password);
        UI.hideLoader();

        if (res.success) {
            alert("Account deleted successfully. Goodbye.");
            Auth.logout();
        } else {
            UI.showToast("Error", res.error || "Failed to delete account", "error");
        }
    },

    async openSupportChat(isGuest = false, guestUsername = 'Guest') {
        if (!isGuest && !this.state.user?.id) {
            return UI.showToast('Login Required', 'Please login to chat with support.', 'error');
        }

        if (isGuest) {
            this.state.guestMode = true;

            // Check if username has changed within the same session
            if (this.state.lastRecoveryUsername && this.state.lastRecoveryUsername !== guestUsername) {
                this.state.recoveryIntroSent = false;
                this.state.recoveryChatHistory = [];
            }

            this.state.guestUsername = guestUsername;
            this.state.lastRecoveryUsername = guestUsername;

            // Persistent Guest ID from localStorage
            let storedGid = localStorage.getItem('recovery_guest_id');
            if (!storedGid) {
                storedGid = 'G-' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('recovery_guest_id', storedGid);
            }
            this.state.guestId = storedGid;
            this.saveState();
        } else {
            this.state.guestMode = false;
        }

        UI.createSupportChatModal();
        UI.showModal('modalSupportChat');

        this.state.chatOffset = 0;
        this.state.hasMoreChat = true;
        this.state.isLoadingMoreChat = false;

        // Clear existing polling if any
        if (this.chatPollInterval) clearInterval(this.chatPollInterval);

        if (this.state.guestMode && !this.state.recoveryIntroSent) {
            const intro = `Hello! I'm trying to recover my account: ${guestUsername}. I don't have an email attached.`;
            const introMsg = {
                message: intro,
                sender_type: 'user',
                created_at: new Date().toISOString()
            };
            Auth.sendMessage(intro, guestUsername, this.state.guestId).then(res => {
                if (res.success) {
                    this.state.recoveryIntroSent = true;
                    this.saveState();
                }
            });

            UI.renderSupportChatMessages(this.state.recoveryChatHistory);
        } else if (this.state.guestMode) {
            // Initial render from local if we have it
            if (this.state.recoveryChatHistory.length > 0) {
                UI.renderSupportChatMessages(this.state.recoveryChatHistory);
            }
            await this.fetchChatHistory(false);
        } else {
            await this.fetchChatHistory(false);
        }

        UI.initChatScroll();

        // Start polling for new messages while chat is open
        this.chatPollInterval = setInterval(() => {
            const modal = document.getElementById('modalSupportChat');
            if (modal && !modal.classList.contains('hidden')) {
                this.fetchChatHistory(false);
            } else {
                clearInterval(this.chatPollInterval);
            }
        }, 5000);
    },

    async fetchChatHistory(append = false) {
        const username = this.state.guestMode ? this.state.guestUsername : this.state.user.username;
        const sessionId = this.state.guestMode ? this.state.guestId : localStorage.getItem('chat_session_id');
        const res = await Auth.getChatHistory(20, this.state.chatOffset, username, sessionId);
        if (res.success) {
            const history = res.data.history || [];
            if (history.length < 20) this.state.hasMoreChat = false;

            if (this.state.guestMode && !append) {
                this.state.recoveryChatHistory = history;
                this.saveState();
            }

            UI.renderSupportChatMessages(history, append);
        }
    },

    async loadMoreChat() {
        if (!this.state.hasMoreChat || this.state.isLoadingMoreChat) return;

        const container = document.getElementById('supportChatMessages');
        if (!container) return;

        this.state.isLoadingMoreChat = true;
        this.state.chatOffset += 20;

        const oldHeight = container.scrollHeight;

        const username = this.state.guestMode ? this.state.guestUsername : this.state.user.username;
        const sessionId = this.state.guestMode ? this.state.guestId : localStorage.getItem('chat_session_id');

        const res = await Auth.getChatHistory(20, this.state.chatOffset, username, sessionId);
        if (res.success) {
            const history = res.data.history || [];
            if (history.length === 0) {
                this.state.hasMoreChat = false;
            } else {
                UI.renderSupportChatMessages(history, true); // true for prepend
                if (history.length < 20) this.state.hasMoreChat = false;

                // Maintain scroll position after prepending
                setTimeout(() => {
                    const newHeight = container.scrollHeight;
                    container.scrollTop = newHeight - oldHeight;
                }, 0);
            }
        }
        this.state.isLoadingMoreChat = false;
    },

    async fetchCourses() {
        try {
            const res = await fetch(`${Auth.API_URL}/api/courses`, {
                headers: Auth.getHeaders(),
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                COURSES = data.data.courses;

                // Re-render course lists if we are on those pages
                const activePage = document.querySelector('.app-page:not(.hidden)')?.id;
                if (activePage === 'allCoursesPage') {
                    UI.renderCourses(COURSES, this.state.purchasedCourses);
                } else if (activePage === 'purchasedCoursesPage') {
                    UI.renderPurchasedCourses(COURSES, this.state.purchasedCourses);
                }
            }
        } catch (error) {
            console.error("Error fetching courses:", error);
        }
    }
};

window.App = App;

// Start the Brain
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Safety: Ensure loader is hidden initially if JS loads
        UI.hideLoader();
        App.init();

        // Terms & Conditions Modal Event Listeners
        const showTermsBtn = document.getElementById('showTermsBtn');
        const termsModal = document.getElementById('termsModal');
        const closeTermsBtn = document.getElementById('closeTermsBtn');
        const acceptTermsBtn = document.getElementById('acceptTermsBtn');
        const termsCheck = document.getElementById('termsCheck');

        if (showTermsBtn && termsModal) {
            showTermsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                termsModal.classList.remove('hidden');
            });
        }

        if (closeTermsBtn && termsModal) {
            closeTermsBtn.addEventListener('click', () => {
                termsModal.classList.add('hidden');
            });
        }

        if (acceptTermsBtn && termsModal && termsCheck) {
            acceptTermsBtn.addEventListener('click', () => {
                termsCheck.checked = true;
                termsModal.classList.add('hidden');
            });
        }

        // Close modal when clicking outside
        if (termsModal) {
            termsModal.addEventListener('click', (e) => {
                if (e.target === termsModal) {
                    termsModal.classList.add('hidden');
                }
            });
        }
    } catch (error) {
        console.error("CRITICAL APP ERROR:", error);
        alert("App Logic Error: " + error.message);
    }
});
