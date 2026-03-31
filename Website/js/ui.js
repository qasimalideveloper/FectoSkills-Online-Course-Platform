/**
 * js/ui.js - The Interaction Expert
 * Handles all visual logic, DOM manipulations, transitions, and rendering.
 */

const UI = {
    // --- Global UI Helpers ---

    showLoader(text = "Processing...") {
        const loader = document.getElementById('loaderOverlay');
        if (loader) {
            const textEl = loader.querySelector('p');
            if (textEl) textEl.textContent = text;

            // Antigravity Entry
            loader.classList.remove('hidden'); // Ensure it's display:flex first if needed (css handles this via .active usually)
            loader.classList.add('active');

            // Pause heavy background
            const bg = document.querySelector('.gradient-dots-bg');
            if (bg) bg.classList.add('paused');
        }
    },

    hideLoader() {
        const loader = document.getElementById('loaderOverlay');
        if (loader) {
            loader.classList.remove('active');
            // Resume heavy background
            const bg = document.querySelector('.gradient-dots-bg');
            if (bg) bg.classList.remove('paused');
        }
    },

    showToast(title, msg, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `app-toast app-toast-${type}`;

        let icon = '';
        if (type === 'success') icon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        else if (type === 'error') icon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        else icon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';

        toast.innerHTML = `
            <div class="app-toast-icon">${icon}</div>
            <div class="app-toast-content">
                <div class="app-toast-title">${title}</div>
                <div class="app-toast-msg">${msg}</div>
            </div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('hide'); // CSS transition
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    },

    // --- Modal Logic (Antigravity Pattern) ---

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        const overlay = document.getElementById('modalOverlay');

        if (!modal) {
            console.error(`Modal '${modalId}' not found.`);
            return;
        }

        // 1. Hide other modals immediately
        document.querySelectorAll('.modal-content').forEach(m => {
            if (m.id !== modalId) m.classList.add('hidden');
        });

        // 2. Prepare Overlay
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        }

        // 3. Prepare Modal for Entry
        modal.classList.remove('hidden');

        // Critical: Force Browser Reflow
        void modal.offsetWidth;

        // 4. Trigger Animation via Timeout
        setTimeout(() => {
            // Assuming CSS handles opacity/transform on these classes if they exist, 
            // or we rely on the CSS keyframes defined in styles.css (.modal-content animation)
            // If using utility classes for transition:
            modal.classList.remove('opacity-0', 'scale-95', 'translate-y-4');
            modal.classList.add('opacity-100', 'scale-100', 'translate-y-0');
        }, 10);
    },

    hideModal() {
        // Hide all modal contents
        document.querySelectorAll('.modal-content').forEach(m => {
            m.classList.add('hidden');
            // Reset transition classes for next open
            m.classList.add('opacity-0', 'scale-95');
            m.classList.remove('opacity-100', 'scale-100');
        });

        const overlay = document.getElementById('modalOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
    },

    // --- Navigation Logic ---

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
        const target = document.getElementById(pageId);
        if (target) {
            target.classList.remove('hidden');
            // Update Tab Title
            if (pageId === 'appContainer') {
                document.title = "Fectoskills - Welcome";
            } else if (pageId === 'authPage') {
                document.title = "Fectoskills - Login";
            }
        }
    },

    showAppPage(pageId) {
        // Hide all app pages
        document.querySelectorAll('.app-page').forEach(page => page.classList.add('hidden'));

        // Show target
        const target = document.getElementById(pageId);
        if (target) target.classList.remove('hidden');

        // Update Nav State
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active', 'bg-green-500/10', 'border', 'border-green-500/20', 'text-white');
            item.classList.add('text-gray-400');
        });

        document.querySelectorAll(`[data-page="${pageId}"]`).forEach(activeNav => {
            activeNav.classList.add('active', 'bg-green-500/10', 'border', 'border-green-500/20', 'text-white');
            activeNav.classList.remove('text-gray-400');
        });

        // Close mobile sidebar if open
        const mobileSidebar = document.getElementById('mobileSidebar');
        if (mobileSidebar && !mobileSidebar.classList.contains('hidden')) {
            this.toggleMobileSidebar();
        }
    },
    showAuthPanel(panelType) {
        const isMobile = window.innerWidth < 1024;
        const welcome = document.getElementById('mobileWelcomePanel');
        const login = document.getElementById('loginRightPanel');
        const register = document.getElementById('registerRightPanel');

        // Initial landing behavior for mobile
        if (isMobile && panelType === 'login' && welcome && !welcome.getAttribute('data-visited')) {
            welcome.classList.remove('hidden');
            welcome.classList.add('flex');
            welcome.setAttribute('data-visited', 'true');
            login?.classList.add('hidden'); login?.classList.remove('flex', 'lg:flex');
            register?.classList.add('hidden'); register?.classList.remove('flex');
            return;
        }

        // Standard navigation
        if (panelType === 'login') {
            welcome?.classList.add('hidden'); welcome?.classList.remove('flex');
            login?.classList.remove('hidden');
            login?.classList.add('lg:flex'); // Ensure lg:flex is present for desktop
            if (isMobile) login?.classList.add('flex');
            register?.classList.add('hidden');
            register?.classList.remove('flex');
            this.showLoginPanel();
        } else {
            welcome?.classList.add('hidden'); welcome?.classList.remove('flex');
            login?.classList.add('hidden');
            login?.classList.remove('flex', 'lg:flex'); // Remove both flex classes to truly hide on desktop
            register?.classList.remove('hidden');
            register?.classList.add('flex'); // Add flex for both mobile and desktop
        }
    },

    showForgotPanel() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('forgotPasswordForm').classList.remove('hidden');
        document.getElementById('loginHeader')?.classList.add('hidden');
        // Reset recovery status when opening
        const statusArea = document.getElementById('recoveryStatus');
        if (statusArea) {
            statusArea.classList.add('hidden');
            statusArea.innerHTML = '';
        }
        // Show the verify button if it was hidden by recovery flow
        document.getElementById('forgotSubmitBtn').classList.remove('hidden');
    },

    showLoginPanel() {
        document.getElementById('forgotPasswordForm').classList.add('hidden');
        document.getElementById('loginHeader')?.classList.remove('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    },

    toggleMobileSidebar() {
        const sidebar = document.getElementById('mobileSidebar');
        const content = document.getElementById('mobileSidebarContent');

        if (sidebar.classList.contains('hidden')) {
            // Open
            sidebar.classList.remove('hidden');
            setTimeout(() => {
                content.classList.remove('-translate-x-full');
            }, 10);
        } else {
            // Close
            content.classList.add('-translate-x-full');
            setTimeout(() => {
                sidebar.classList.add('hidden');
            }, 300);
        }
    },

    // --- Dropdowns & Sliders ---

    // --- Global Search ---
    initGlobalSearch() {
        const inputs = document.querySelectorAll('.app-search-input');

        // Build Index
        const searchIndex = [
            { title: 'Dashboard', type: 'Page', action: () => UI.showAppPage('commissionsPage') },
            { title: 'Transaction History', type: 'Page', action: () => UI.showAppPage('networkPage') },
            { title: 'Analytics', type: 'Page', action: () => UI.showAppPage('analyticsPage') },
            { title: 'Referrals', type: 'Page', action: () => UI.showAppPage('referralsPage') },
            { title: 'Profile', type: 'Page', action: () => UI.showAppPage('profilePage') },
            { title: 'Security', type: 'Page', action: () => UI.showAppPage('securityPage') },
            { title: 'Help Center', type: 'Page', action: () => UI.showAppPage('helpPage') },
            { title: 'All Courses', type: 'Page', action: () => UI.showAppPage('allCoursesPage') },
            { title: 'Purchased Courses', type: 'Page', action: () => UI.showAppPage('purchasedCoursesPage') },
            { title: 'Ask AI', type: 'Page', action: () => UI.showAppPage('askAIPage') },
            { title: 'Progress', type: 'Page', action: () => UI.showAppPage('progressPage') },
        ];

        // Add Courses dynamically
        if (typeof COURSES !== 'undefined') {
            COURSES.forEach(c => {
                searchIndex.push({
                    title: c.title,
                    type: 'Course',
                    action: () => {
                        UI.showAppPage('allCoursesPage');
                        UI.showToast('Course Selected', `Navigated to ${c.title}`, 'success');
                    }
                });
            });
        }

        inputs.forEach(input => {
            const wrapper = input.parentElement;
            if (!wrapper.classList.contains('relative')) wrapper.classList.add('relative');

            // Prevent duplicate dropdowns
            if (wrapper.querySelector('.search-dropdown')) return;

            const dropdown = document.createElement('div');
            dropdown.className = 'search-dropdown absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 hidden overflow-hidden';
            wrapper.appendChild(dropdown);

            const performSearch = (val) => {
                const query = val.toLowerCase().trim();
                if (query.length < 1) {
                    dropdown.classList.add('hidden');
                    return;
                }

                const results = searchIndex.filter(item => item.title.toLowerCase().includes(query)).slice(0, 5);

                if (results.length > 0) {
                    dropdown.innerHTML = results.map((item, idx) => `
                        <div class="px-4 py-3 hover:bg-gray-800 cursor-pointer flex items-center justify-between group transition-colors border-b border-gray-800 last:border-0 search-result-item" data-idx="${idx}">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-lg bg-gray-800 group-hover:bg-gray-700 flex items-center justify-center text-gray-400 group-hover:text-white transition">
                                    ${item.type === 'Course' ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>' :
                            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>'}
                                </div>
                                <div>
                                    <p class="text-sm font-medium text-white">${item.title}</p>
                                    <p class="text-xs text-gray-500">${item.type}</p>
                                </div>
                            </div>
                            <svg class="w-4 h-4 text-gray-600 group-hover:text-green-500 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    `).join('');

                    dropdown.querySelectorAll('.search-result-item').forEach(el => {
                        el.addEventListener('click', function () {
                            const idx = this.getAttribute('data-idx');
                            results[idx].action();
                            dropdown.classList.add('hidden');
                            input.value = '';
                        });
                    });

                    dropdown.classList.remove('hidden');
                } else {
                    dropdown.innerHTML = `
                        <div class="px-4 py-3 text-gray-500 text-sm text-center">
                            No results found
                        </div>
                    `;
                    dropdown.classList.remove('hidden');
                }
            };

            input.addEventListener('input', (e) => performSearch(e.target.value));
            input.addEventListener('focus', (e) => {
                if (e.target.value.length > 0) performSearch(e.target.value);
            });

            // Delayed hide to allow click
            input.addEventListener('blur', () => {
                setTimeout(() => dropdown.classList.add('hidden'), 200);
            });
        });
    },

    initPendingDropdown() {
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('newPendingDropdown');
            const triggers = document.querySelectorAll('.pending-trigger');
            let clickedTrigger = false;

            triggers.forEach(trigger => {
                if (trigger && trigger.contains(e.target)) {
                    clickedTrigger = true;
                }
            });

            if (dropdown && !dropdown.classList.contains('hidden')) {
                if (!dropdown.contains(e.target) && !clickedTrigger) {
                    this.hideNewPendingDropdown();
                }
            }
        });

        window.addEventListener('scroll', () => {
            const dropdown = document.getElementById('newPendingDropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                this.hideNewPendingDropdown();
            }
        }, { passive: true });
    },

    initNotificationDropdown() {
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('newNotificationDropdown');
            const triggers = document.querySelectorAll('.notif-trigger');
            let clickedTrigger = false;

            triggers.forEach(trigger => {
                if (trigger && trigger.contains(e.target)) {
                    clickedTrigger = true;
                }
            });

            if (dropdown && !dropdown.classList.contains('hidden')) {
                if (!dropdown.contains(e.target) && !clickedTrigger) {
                    this.hideNotificationDropdown();
                }
            }
        });

        window.addEventListener('scroll', () => {
            const dropdown = document.getElementById('newNotificationDropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                this.hideNotificationDropdown();
            }
        }, { passive: true });
    },

    toggleNewPendingDropdown(event, transactions) {
        if (event) event.stopPropagation();

        const dropdown = document.getElementById('newPendingDropdown');
        const trigger = event ? event.currentTarget : null;

        if (!dropdown) return;

        if (dropdown.classList.contains('hidden')) {
            // Close others
            this.hideNotificationDropdown();

            // Position
            if (trigger) {
                const rect = trigger.getBoundingClientRect();
                let left = rect.right - 360;
                if (window.innerWidth < 400) left = 10;
                else if (left < 10) left = 10;
                dropdown.style.left = `${left}px`;
                dropdown.style.top = `${rect.bottom + 10}px`;
            }

            dropdown.classList.remove('hidden');
            void dropdown.offsetWidth;

            dropdown.classList.remove('opacity-0', 'scale-95');
            dropdown.classList.add('opacity-100', 'scale-100');

            const list = transactions || window.AppInstance?.state?.transactions || [];
            this.renderNewPendingItems(list);

            // Mark all items in the list as "seen"
            if (window.AppInstance && window.AppInstance.state) {
                const pendingList = (list || []).filter(t => t.status === 'pending' || t.status === 'rejected');
                pendingList.forEach(t => {
                    window.AppInstance.state.seenTransactionStatuses[t.id] = t.status;
                });
                window.AppInstance.saveState();

                // Refresh badges immediately to reflect "seen" state
                this.updateBadgesOnly(list);
            }
        } else {
            this.hideNewPendingDropdown();
        }
    },

    toggleNotificationSlider(event) {
        if (event) event.stopPropagation();

        const dropdown = document.getElementById('newNotificationDropdown');
        const trigger = event ? event.currentTarget : null;

        if (!dropdown) return;

        if (dropdown.classList.contains('hidden')) {
            // Close others
            this.hideNewPendingDropdown();

            // Position
            if (trigger) {
                const rect = trigger.getBoundingClientRect();
                let left = rect.right - 360;
                if (window.innerWidth < 400) left = 10;
                else if (left < 10) left = 10;
                dropdown.style.left = `${left}px`;
                dropdown.style.top = `${rect.bottom + 10}px`;
            }

            dropdown.classList.remove('hidden');
            void dropdown.offsetWidth;

            dropdown.classList.remove('opacity-0', 'scale-95');
            dropdown.classList.add('opacity-100', 'scale-100');

            // Render existing notifications if any
            if (window.AppInstance && window.AppInstance.state.notifications) {
                // Optimistic Update: Mark all as read locally
                window.AppInstance.state.notifications.forEach(n => n.is_read = 1);

                // Render (will update badges to 0)
                this.renderNotifications(window.AppInstance.state.notifications);

                // Sync with backend
                if (window.AppInstance.state.user) {
                    Wallet.markNotificationsRead();
                }
            }
        } else {
            this.hideNotificationDropdown();
        }
    },

    toggleNewNotificationDropdown(event) {
        if (event) event.stopPropagation();
        this.toggleNotificationSlider(event);
    },

    hideNewPendingDropdown() {
        const dropdown = document.getElementById('newPendingDropdown');
        if (!dropdown) return;

        dropdown.classList.add('opacity-0', 'scale-95');
        dropdown.classList.remove('opacity-100', 'scale-100');

        setTimeout(() => {
            dropdown.classList.add('hidden');
        }, 200);
    },

    hideNotificationDropdown() {
        const dropdown = document.getElementById('newNotificationDropdown');
        if (!dropdown) return;

        dropdown.classList.add('opacity-0', 'scale-95');
        dropdown.classList.remove('opacity-100', 'scale-100');

        setTimeout(() => {
            dropdown.classList.add('hidden');
        }, 200);
    },

    // --- Renders ---

    renderNewPendingItems(transactions) {
        const listContainer = document.getElementById('newPendingItemsList');
        if (!listContainer) return;

        // Ensure transactions is an array
        const txns = Array.isArray(transactions) ? transactions : [];
        const pending = txns.filter(t => t.status === 'pending');

        // Calculate Unseen
        const seenMap = window.AppInstance?.state?.seenTransactionStatuses || {};
        const unseenCount = pending.filter(t => t.status !== seenMap[t.id]).length;

        // Update Badges
        document.querySelectorAll('.pending-dot').forEach(b => {
            b.textContent = unseenCount;
            if (unseenCount > 0) b.classList.remove('hidden');
            else b.classList.add('hidden');
        });

        document.querySelectorAll('.pending-label').forEach(b => {
            b.textContent = `${unseenCount} Items`;
            if (unseenCount > 0) b.classList.remove('hidden');
            else b.classList.add('hidden');
        });

        // Toggle dropdown header badge
        const headerBadge = document.querySelector('#newPendingDropdown .pending-label');
        if (headerBadge) headerBadge.classList.remove('hidden');

        if (pending.length === 0) {
            listContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 opacity-40">
                    <p class="font-bold uppercase tracking-widest text-[10px] text-white">No Pending Tasks</p>
                </div>`;
            return;
        }

        listContainer.innerHTML = pending.map(txn => {
            const dateStr = new Date(txn.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isRejected = txn.status === 'rejected';
            const statusColor = isRejected ? 'text-red-400' : 'text-orange-400';
            const statusLabel = isRejected ? 'Failed' : 'In Queue';

            return `
                <div class="group relative bg-black/40 hover:bg-black/60 p-3 rounded-xl border ${isRejected ? 'border-red-500/30' : 'border-white/5'} transition-all cursor-pointer">
                    <div class="flex items-center justify-between mb-0.5">
                        <p class="text-white font-bold text-xs uppercase">${txn.type} <span class="text-gray-500 font-normal">#${txn.public_id || txn.id}</span></p>
                        <span class="${isRejected ? 'text-red-400' : 'text-emerald-400'} font-bold text-xs">Rs. ${txn.amount.toLocaleString()}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <p class="text-[10px] text-gray-400">${dateStr} • <span class="${statusColor}">${statusLabel}</span></p>
                        <p class="text-[10px] text-gray-400 font-semibold">${txn.fecto_id || txn.user_id}</p>
                    </div>
                    ${isRejected ? `<p class="text-[9px] text-red-400/80 mt-1 font-medium italic">Reason: ${txn.rejection_reason || 'Payment not received'}</p>` : ''}
                </div>
            `;
        }).join('');
    },

    updateBadgesOnly(transactions) {
        const txns = Array.isArray(transactions) ? transactions : [];
        const pending = txns.filter(t => t.status === 'pending' || t.status === 'rejected');
        const seenMap = window.AppInstance?.state?.seenTransactionStatuses || {};
        const unseenCount = pending.filter(t => t.status !== seenMap[t.id]).length;

        document.querySelectorAll('.pending-dot').forEach(b => {
            b.textContent = unseenCount;
            if (unseenCount > 0) b.classList.remove('hidden');
            else b.classList.add('hidden');
        });
        document.querySelectorAll('.pending-label').forEach(b => {
            b.textContent = `${unseenCount} Items`;
            if (unseenCount > 0) b.classList.remove('hidden');
            else b.classList.add('hidden');
        });
    },

    initNotificationScroll() {
        const container = document.getElementById('notificationList');
        if (!container) return;

        container.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            if (scrollTop + clientHeight >= scrollHeight - 20) {
                window.AppInstance.loadMoreNotifications();
            }
        });
    },

    initChatScroll() {
        const container = document.getElementById('supportChatMessages');
        if (!container || container.dataset.scrollInitialized) return;

        container.addEventListener('scroll', () => {
            if (container.scrollTop <= 10) {
                window.AppInstance.loadMoreChat();
            }
        });
        container.dataset.scrollInitialized = "true";
    },

    renderNotifications(notifications, append = false) {
        const container = document.getElementById('notificationList');
        const badges = document.querySelectorAll('.chat-notification-badge');

        // Ensure notifications is an array
        const notifs = Array.isArray(notifications) ? notifications : [];
        const unreadCount = notifs.filter(n => n.is_read === 0).length;

        // Update Badges
        badges.forEach(badge => {
            badge.textContent = unreadCount;
            if (unreadCount > 0) badge.classList.remove('hidden');
            else badge.classList.add('hidden');
        });

        if (!container) return;

        if (notifs.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 opacity-40">
                    <p class="font-bold uppercase tracking-widest text-[10px] text-white">No Pulse Yet</p>
                </div>`;
            return;
        }

        const html = notifs.map(n => {
            const isUnread = n.is_read === 0;
            const dateStr = new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            // Type-based styling
            let typeColor = 'text-emerald-400';
            let bgAccent = 'bg-emerald-500/5';
            let ringColor = 'ring-emerald-500/30';
            let icon = '✓';

            if (n.type === 'warning' || n.type === 'error') {
                typeColor = 'text-red-400';
                bgAccent = 'bg-red-500/5';
                ringColor = 'ring-red-500/30';
                icon = '✕';
            } else if (n.type === 'chat') {
                typeColor = 'text-blue-400';
                bgAccent = 'bg-blue-500/5';
                ringColor = 'ring-blue-500/30';
                icon = '💬';
            } else if (n.type === 'success') {
                icon = '✓';
            }

            const clickHandler = n.type === 'chat'
                ? `window.AppInstance.openSupportChat(); window.markNotificationReadRequested('${n.id}');`
                : `window.markNotificationReadRequested('${n.id}');`;

            return `
                <div onclick="${clickHandler}" class="group relative bg-black/40 hover:bg-black/60 p-3 rounded-xl border border-white/5 transition-all cursor-pointer break-all overflow-hidden ${isUnread ? `ring-1 ${ringColor} ${bgAccent}` : ''}">
                    <div class="flex items-center justify-between mb-0.5">
                        <p class="text-white font-bold text-xs uppercase ${typeColor}">
                            <span class="mr-1">${icon}</span>${n.title || 'System Update'}
                        </p>
                        ${isUnread ? '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>' : ''}
                    </div>
                    <p class="text-[10px] text-gray-300 leading-relaxed whitespace-pre-wrap">${n.message}</p>
                    <p class="text-[9px] text-gray-500 mt-1 uppercase tracking-tighter">${dateStr}</p>
                </div>
            `;
        }).join('');

        if (append) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            while (temp.firstChild) container.appendChild(temp.firstChild);
        } else {
            container.innerHTML = html;
        }
    },

    renderCourses(courses, purchasedIds) {
        const grid = document.getElementById('coursesGrid');
        if (!grid) return;

        grid.innerHTML = courses.map(course => {
            const isOwned = purchasedIds.includes(course.id);
            return `
            <div class="app-card h-[400px] md:h-[580px] group relative force-round cursor-pointer overflow-hidden transform active:scale-[0.98] transition-all" onclick="window.showCourseDetailRequested(${course.id})">
                <div class="absolute inset-0 z-0">
                    <img src="${course.image}" class="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all duration-700">
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                
                <div class="absolute bottom-0 p-6 md:p-10 z-20 w-full bg-gradient-to-t from-black/90 to-transparent">
                    <h3 class="text-white text-3xl md:text-5xl font-black tracking-tighter mb-4 leading-none">${course.title}</h3>
                    <div class="flex justify-between items-end border-t border-white/10 pt-4 md:pt-6">
                        <div>
                            <p class="text-gray-400 text-[10px] md:text-xs uppercase tracking-wider">Price</p>
                            <p class="text-emerald-500 text-xl md:text-3xl font-black">Rs. ${course.price.toLocaleString()}</p>
                        </div>
                        ${isOwned
                    ? `<span class="bg-emerald-500 text-black px-4 py-2 rounded-full font-bold text-[10px] md:text-xs uppercase shadow-lg shadow-emerald-500/20">Owned</span>`
                    : `<span class="w-10 h-10 md:w-12 md:h-12 bg-white text-black rounded-full flex items-center justify-center hover:bg-emerald-500 transition-colors shadow-lg"><svg class="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg></span>`
                }
                    </div>
                </div>
            </div>
            `;
        }).join('');
    },

    renderPurchasedCourses(courses, purchasedIds) {
        const grid = document.getElementById('purchasedCoursesGrid');
        if (!grid) return;

        const myCourses = courses.filter(c => purchasedIds.includes(c.id));
        if (myCourses.length === 0) {
            grid.innerHTML = `<div class="text-center p-10 text-gray-500 col-span-full">No courses purchased yet.</div>`;
            return;
        }

        grid.innerHTML = myCourses.map(c => `
            <div class="app-card group p-5 md:p-6 flex flex-col h-full cursor-pointer hover:border-emerald-500/30 transition-all transform active:scale-[0.98]" onclick="App.initializeCoursePlayer(${c.id})">
                <div class="relative h-40 md:h-48 rounded-2xl overflow-hidden mb-5 md:mb-6">
                    <img src="${c.image}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                    <div class="absolute top-4 right-4">
                        <span class="bg-emerald-500/20 backdrop-blur-md text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase border border-emerald-500/30">Active</span>
                    </div>
                </div>
                <div class="flex-1">
                    <h3 class="text-white text-lg md:text-xl font-black mb-2 leading-tight">${c.title}</h3>
                    <p class="text-gray-400 text-xs md:text-sm line-clamp-2 mb-6 leading-relaxed">${c.description || 'Master this course with step-by-step guidance and practical projects.'}</p>
                </div>
                <div class="mt-auto">
                    <button class="w-full py-3.5 bg-zinc-900 group-hover:bg-white text-white group-hover:text-black rounded-xl text-[10px] md:text-xs font-black uppercase tracking-[0.2em] transition-all border border-white/5 shadow-lg group-hover:shadow-white/5">
                        Continue Learning
                    </button>
                </div>
            </div>
        `).join('');
    },

    renderProgress(courses, purchasedIds = []) {
        const grid = document.getElementById('courseProgressGrid');
        if (!grid) return;

        const myCourses = (courses || []).filter(c => purchasedIds.includes(c.id));

        let totalClasses = 0;
        let completedClasses = 0;

        // Reset Grid
        grid.innerHTML = '';

        if (myCourses.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center p-20 text-gray-500 italic">No active courses yet. Start learning today!</div>`;
        } else {
            const cards = myCourses.map(course => {
                const key = `completed_classes_${course.id}`;
                const completedIds = JSON.parse(localStorage.getItem(key) || '[]');
                const total = course.class_count || 10;
                const count = completedIds.length;
                const percentage = Math.round((count / total) * 100);

                totalClasses += total;
                completedClasses += count;

                return `
                    <div class="app-card p-6 group transition-all duration-300">
                        <div class="flex items-center gap-5 mb-6">
                            <div class="w-16 h-16 rounded-xl border border-white/5 overflow-hidden shrink-0">
                                <img src="${course.image || 'assets/placeholder.png'}" class="w-full h-full object-cover">
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="text-white font-bold text-lg truncate mb-1">${course.title}</h4>
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-emerald-500 px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">${percentage}% Complete</span>
                                    <span class="text-[10px] text-gray-500 font-bold">${count}/${total} Modules</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="space-y-3 mb-6">
                            <div class="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter text-gray-500">
                                <span>Learning Velocity</span>
                                <span class="text-gray-400 font-bold">${percentage === 100 ? 'Course Finished' : 'In Progress'}</span>
                            </div>
                            <div class="h-1.5 w-full bg-black rounded-full overflow-hidden border border-white/5">
                                <div class="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-1000" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                        
                        <button onclick="App.initializeCoursePlayer(${course.id})" 
                            class="w-full py-3 bg-gray-900 hover:bg-emerald-500 hover:text-black text-gray-300 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] border border-white/5">
                            Continue Learning
                        </button>
                    </div>
                `;
            }).join('');
            grid.innerHTML = cards;
        }

        // Update overall stats using new IDs
        const overallPct = totalClasses > 0 ? (completedClasses / totalClasses) * 100 : 0;
        let rank = 'Novice';
        if (overallPct >= 90) rank = 'Legend';
        else if (overallPct >= 70) rank = 'Master';
        else if (overallPct >= 40) rank = 'Expert';
        else if (overallPct >= 15) rank = 'Scholar';

        const elCourses = document.getElementById('progressActiveCourses');
        const elPct = document.getElementById('progressCompletionRate');
        const elRank = document.getElementById('progressLearningRank');

        if (elCourses) elCourses.textContent = myCourses.length.toString().padStart(2, '0');
        if (elPct) elPct.textContent = `${Math.round(overallPct)}%`;
        if (elRank) elRank.textContent = rank;
    },

    showCourseDetail(course, isOwned, transactions = []) {
        if (!course) return;
        document.getElementById('detailCourseImage').src = course.image;
        document.getElementById('detailCourseTitle').textContent = course.title;
        document.getElementById('detailCourseDescription').textContent = course.description;
        document.getElementById('detailCoursePrice').textContent = `Rs.${course.price.toLocaleString()} `;

        // Add rating if not already set
        const ratingVal = document.querySelector('.detail-rating-val');
        if (ratingVal) ratingVal.textContent = "4.9 (High Quality)";

        const buyBtn = document.getElementById('detailBuyBtn');
        const startBtn = document.getElementById('detailStartLearningBtn');
        const pendingBadge = document.getElementById('detailPendingBadge');

        // Reset all buttons/badges
        [buyBtn, startBtn, pendingBadge].forEach(el => el?.classList.add('hidden'));

        if (isOwned) {
            // Already bought and approved
            startBtn?.classList.remove('hidden');
            startBtn.onclick = () => App.initializeCoursePlayer(course.id);
        } else {
            // Check if there's a PENDING purchase request for this course
            const hasPending = (transactions || []).some(t =>
                t.course_id === course.id &&
                t.type === 'purchase' &&
                t.status === 'pending'
            );

            if (hasPending) {
                // Show "Request Already Present" badge
                pendingBadge?.classList.remove('hidden');
            } else {
                // Allow buy
                buyBtn?.classList.remove('hidden');
                buyBtn.onclick = () => window.initiatePurchaseRequested(course.id);
            }
        }

        this.showModal('courseDetailModal');
    },

    updateTransactionFilterButtons(activeFilter) {
        document.querySelectorAll('.txn-filter-btn').forEach(btn => {
            const filter = btn.getAttribute('data-filter');
            if (filter === activeFilter) {
                btn.classList.add('bg-green-500', 'text-black', 'border-transparent');
                btn.classList.remove('bg-transparent', 'text-gray-400', 'border-gray-700');
            } else {
                btn.classList.add('bg-transparent', 'text-gray-400', 'border-gray-700');
                btn.classList.remove('bg-green-500', 'text-black', 'border-transparent');
            }
        });
    },

    toggleTransactionLoadMoreBtn(visible) {
        const btn = document.getElementById('btnShowMoreTransactions');
        if (btn) {
            if (visible) btn.classList.remove('hidden');
            else btn.classList.add('hidden');
        }
    },
    renderTransactions(transactions, filter = 'all') {
        const tbody = document.getElementById('transactionsTableBody');
        const mContainer = document.getElementById('transactionsMobileContainer');
        if (!tbody) return;

        const filtered = transactions.filter(t => {
            if (filter === 'all') return true;
            if (filter === 'earnings') return t.type === 'commission' || t.type === 'earning';
            if (filter === 'withdrawals') return t.type === 'withdrawal';
            return true;
        });

        if (filtered.length === 0) {
            const noData = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No transactions found.</td></tr>`;
            tbody.innerHTML = noData;
            if (mContainer) mContainer.innerHTML = `<div class="w-full text-center py-12 text-gray-500">No transactions found.</div>`;
            return;
        }

        // Render Desktop Table
        tbody.innerHTML = filtered.map(t => `
            <tr class="hover:bg-gray-800/50 transition-colors">
                <td class="px-6 py-4 text-sm text-gray-400">#${t.public_id || t.id}</td>
                <td class="px-6 py-4 text-sm text-white uppercase font-bold tracking-wider text-[10px]">${t.type}</td>
                <td class="px-6 py-4 text-sm text-gray-400">${t.description || '-'}</td>
                <td class="px-6 py-4 text-sm text-gray-500 font-mono">${new Date(t.created_at).toLocaleDateString()}</td>
                <td class="px-6 py-4">
                    <div class="flex flex-col">
                        <span class="px-3 py-1 rounded-full text-[10px] uppercase font-bold w-fit tracking-wider ${t.status === 'approved' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : (t.status === 'rejected' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20')}">${t.status}</span>
                        ${t.status === 'rejected' ? `<span class="text-[10px] text-red-400 mt-1 italic max-w-[200px] truncate" title="${t.rejection_reason}">${t.rejection_reason || 'Payment not received'}</span>` : ''}
                    </div>
                </td>
                <td class="px-6 py-4 text-sm font-bold ${t.type === 'withdrawal' || t.type === 'purchase' ? 'text-red-400' : 'text-green-400'}">Rs. ${t.amount.toLocaleString()}</td>
            </tr>
        `).join('');

        // Render Mobile Cards
        if (mContainer) {
            mContainer.innerHTML = filtered.map(t => `
                <div class="w-full bg-gray-800 border border-gray-700 p-5 rounded-2xl relative overflow-hidden group">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex flex-col">
                            <span class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">TXID: #${t.public_id || t.id}</span>
                            <span class="text-white font-black uppercase text-xs tracking-wider">${t.type}</span>
                        </div>
                        <span class="px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider ${t.status === 'approved' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : (t.status === 'rejected' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20')}">${t.status}</span>
                    </div>
                    
                    <p class="text-gray-400 text-sm mb-4 line-clamp-1">${t.description || 'Transaction'}</p>
                    
                    <div class="flex justify-between items-end">
                        <div class="flex flex-col">
                            <span class="text-[10px] text-gray-500 uppercase font-bold mb-0.5">Date</span>
                            <span class="text-gray-300 text-xs font-medium">${new Date(t.created_at).toLocaleDateString()}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] text-gray-500 uppercase font-bold block mb-0.5">Amount</span>
                            <span class="text-lg font-black ${t.type === 'withdrawal' || t.type === 'purchase' ? 'text-red-400' : 'text-green-400'}">Rs. ${t.amount.toLocaleString()}</span>
                        </div>
                    </div>

                    ${t.status === 'rejected' ? `
                        <div class="mt-4 pt-3 border-t border-red-500/10">
                            <p class="text-[10px] text-red-400 italic">Reason: ${t.rejection_reason || 'Payment mismatch'}</p>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
    },

    updateProfileDisplay(user, apiUrl, transactions = []) {
        if (!user) return;

        // Backend uses snake_case: first_name, last_name
        const fName = user.first_name || user.firstName || 'User';
        const lName = user.last_name || user.lastName || '';
        const fullName = `${fName} ${lName} `.trim();
        const initials = ((fName[0] || 'U') + (lName[0] || '')).toUpperCase();

        // 1. Full Names
        document.querySelectorAll('.user-full-name').forEach(el => el.textContent = fullName);

        // 2. Initials
        document.querySelectorAll('.user-initials').forEach(el => el.textContent = initials);
        const profileInitials = document.getElementById('profileAvatarInitials');
        if (profileInitials) profileInitials.textContent = initials;

        // 3. User Avatars
        const avatarPath = user.avatar_path || user.avatarPath;
        const avatarUrl = avatarPath ? `${apiUrl}/${avatarPath.startsWith('/') ? avatarPath.slice(1) : avatarPath}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=10b981&color=fff`;

        document.querySelectorAll('.user-avatar').forEach(img => img.src = avatarUrl);

        // Specific Profile Page Avatar
        const bigProfileImg = document.getElementById('profileAvatarImage');
        if (bigProfileImg) {
            if (avatarPath) {
                bigProfileImg.src = avatarUrl;
                bigProfileImg.classList.remove('hidden');
            } else {
                bigProfileImg.classList.add('hidden');
            }
        }

        // 4. Detailed Profile Page Fields
        const profileUsername = document.getElementById('profileUsername');
        if (profileUsername) profileUsername.textContent = fullName; // Page header name

        const profileFectoId = document.getElementById('profileFectoId');
        if (profileFectoId) profileFectoId.textContent = user.fecto_id || user.fectoId || '#FS-000000';

        const profileFullNameDisplay = document.getElementById('profileFullNameDisplay');
        if (profileFullNameDisplay) profileFullNameDisplay.textContent = fullName;

        const profileEmailDisplay = document.getElementById('profileEmailDisplay');
        if (profileEmailDisplay) profileEmailDisplay.textContent = user.email || 'No email provided';

        const profilePhoneDisplay = document.getElementById('profilePhoneDisplay');
        if (profilePhoneDisplay) profilePhoneDisplay.textContent = user.phone || 'No phone provided';

        const profileUsernameDisplay = document.getElementById('profileUsernameDisplay');
        if (profileUsernameDisplay) profileUsernameDisplay.textContent = user.username || '';

        const profileMemberSince = document.getElementById('profileMemberSince');
        if (profileMemberSince && user.created_at) {
            const date = new Date(user.created_at);
            const options = { month: 'long', year: 'numeric' };
            profileMemberSince.textContent = date.toLocaleDateString('en-US', options);
        }

        // 5. Referral Data
        const referralCode = user.referral_code || '';
        const referralCodeDisplay = document.getElementById('referralCodeDisplay');
        if (referralCodeDisplay) referralCodeDisplay.textContent = referralCode || 'N/A';

        const referralLinkDisplay = document.getElementById('referralLinkDisplay');
        if (referralLinkDisplay) {
            const baseUrl = window.location.origin;
            referralLinkDisplay.textContent = referralCode ? `${baseUrl}/?ref=${referralCode}` : '';
        }

        const totalReferralsCount = document.getElementById('totalReferralsCount');
        if (totalReferralsCount) totalReferralsCount.textContent = user.total_referrals || '0';

        const totalReferralsEarned = (user.total_referrals_earned || 0).toLocaleString();
        ['totalReferralsEarned', 'analyticsTotalRevenue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = `Rs. ${totalReferralsEarned}`;
        });

        // 6. Commissions & Analytics Cards
        const rate = (user.commission_rate || 10) + '%';

        // Handle Standard Commission Rate Elements
        ['dashboardCommissionRate', 'analyticsCommissionRate', 'commissionRateDisplay', 'dashboardCommissionRateCard'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = rate;
        });

        // Handle Referrer Info on Referral Page
        const refCard = document.getElementById('referrerInfoCard');
        const refLabel = document.getElementById('referrerInfoLabel');

        if (refCard) {
            // User has a referrer?
            if (user.referrer_username || user.referred_by_code) {
                const upline = user.referrer_username ? `@${user.referrer_username}` : user.referred_by_code;
                refCard.textContent = upline;
                refCard.classList.remove('text-3xl', 'text-2xl');
                refCard.classList.add('text-xl'); // adjust size for username
                if (refLabel) refLabel.textContent = "Referred By";
            } else {
                // No referrer -> Show Input
                if (refLabel) refLabel.textContent = "Add Referrer";
                refCard.innerHTML = `
                    <div class="flex flex-col gap-2 mt-1">
                        <div class="flex gap-2">
                             <input id="referrerInput" type="text" placeholder="Enter Code" 
                                oninput="this.value = this.value.toUpperCase()"
                                class="w-full bg-black/30 text-white rounded-lg px-3 py-2 text-sm outline-none border border-white/10 focus:border-emerald-500 transition-colors uppercase placeholder:normal-case">
                        </div>
                        <button onclick="Wallet.submitReferralCode()" 
                                class="w-full bg-emerald-500 text-white rounded-lg px-3 py-2 text-sm font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95">
                                Submit
                        </button>
                    </div>
                `;
                refCard.classList.remove('text-xl', 'font-bold');
            }
        }

        const totalRefs = user.total_referrals || '0';
        const refEls = ['totalReferralsCard', 'analyticsTotalReferrals'];
        refEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = totalRefs;
        });

        const monthlyIncome = `Rs. ${(user.monthly_commission || 0).toLocaleString()}`;
        const monthlyEls = ['monthlyCommissionCard'];
        monthlyEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = monthlyIncome;
        });

        const isPurchased = !!user.has_purchased;
        const statusTextStr = isPurchased ? 'Certified Member' : 'Starting Member';

        document.querySelectorAll('.membership-status-label').forEach(el => {
            el.textContent = statusTextStr;
            // Optionally update color for better UX
            if (isPurchased) {
                el.classList.add('text-green-500');
                el.classList.remove('text-gray-400');
            } else {
                el.classList.add('text-gray-400');
                el.classList.remove('text-green-500');
            }
        });

        const statusText = document.getElementById('analyticsStatusText');
        if (statusText) statusText.textContent = isPurchased ? 'Pro Member' : 'Standard Member';

        // 7. Security Tab Conditional Cards
        const addEmailSection = document.getElementById('secAddEmailSection');
        if (addEmailSection) {
            if (user.email) {
                addEmailSection.classList.add('hidden');
            } else {
                addEmailSection.classList.remove('hidden');
            }
        }

        // 8. Referral List & Pending Items
        this.updateReferralList(user.referral_list || [], false, user.has_more_referrals);
        this.renderNewPendingItems(transactions || []);
    },

    updateReferralList(referrals = [], append = false, hasMore = false) {
        const container = document.getElementById('referralListContainer');
        if (!container) return;

        // Clean slate if not appending
        if (!append) {
            container.innerHTML = '';
            if (referrals.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-8">
                        <p class="text-gray-400 text-sm">No referrals yet. Share your link to start earning!</p>
                    </div>
                `;
                return;
            }
        }

        // Remove old button if exists
        const oldBtn = document.getElementById('btnLoadMoreReferrals');
        if (oldBtn) oldBtn.remove();

        // Render Items
        const itemsHtml = referrals.map(ref => {
            const initials = ref.full_name ? ref.full_name.split(' ').filter(n => n.length > 0).map(n => n[0]).join('').toUpperCase().slice(0, 2) : "??";
            const joinDate = ref.joined_at ? new Date(ref.joined_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric', day: 'numeric' }) : 'Unknown Date';

            return `
                <div class="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors">
                    <div class="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700">
                        <span class="text-gray-400 text-sm font-bold">${initials}</span>
                    </div>
                    <div class="flex-1">
                        <p class="text-white font-semibold">${ref.full_name || ref.username}</p>
                        <p class="text-gray-400 text-[10px]">Joined ${joinDate}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-green-500 font-bold">Rs. ${(ref.earned || 0).toLocaleString()}</p>
                        <p class="text-[10px] text-gray-500 uppercase tracking-wider">Commission</p>
                    </div>
                </div>
            `;
        }).join('');

        container.insertAdjacentHTML('beforeend', itemsHtml);

        // Append "Show More" button if needed
        if (hasMore) {
            const btnHtml = `
                <button id="btnLoadMoreReferrals" onclick="window.loadMoreReferrals()" 
                    class="w-full mt-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm font-bold rounded-xl transition-all border border-gray-700 hover:border-gray-500">
                    Show More
                </button>
            `;
            container.insertAdjacentHTML('beforeend', btnHtml);
        }
    },

    updateDashboard(balance) {
        const els = ['currentBalance', 'availableBalance', 'availableBalanceDisplay', 'withdrawalModalBalance'];
        els.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = (typeof balance === 'number') ? balance.toLocaleString() : '0';
        });
    },

    // --- Support Chat ---
    createSupportChatModal() {
        if (document.getElementById('modalSupportChat')) return;

        const modalHtml = `
            <div id="modalSupportChat" class="modal-content fixed inset-0 z-[300] hidden flex items-center justify-center p-4">
                <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="UI.hideModal()"></div>
                <div class="relative w-full max-w-md bg-[#18181b] rounded-3xl overflow-hidden flex flex-col max-h-[85vh] border border-gray-800 shadow-2xl">
                    <div class="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1f2937]">
                        <h3 class="text-white font-bold">Support Chat</h3>
                        <button onclick="UI.hideModal()" class="text-gray-400 hover:text-white"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                    </div>
                    <div class="px-3 py-2 bg-green-500/5 border-b border-white/5 text-center text-[10px] uppercase tracking-widest text-green-500/60 font-medium">
                        An admin will reach out to you shortly
                    </div>
                    <div id="supportChatMessages" class="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 bg-[#09090b]"></div>
                    <div class="p-4 bg-[#1f2937]">
                        <div class="flex flex-col gap-2">
                            <div class="flex gap-2 items-end">
                                <textarea id="supportChatInput" rows="1" maxlength="500" 
                                    class="flex-1 bg-black border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-500 resize-none overflow-hidden break-words whitespace-pre-wrap max-h-32 scrollbar-hide" 
                                    placeholder="Describe your issue..."
                                    oninput="this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; document.getElementById('chatCharCount').textContent = this.value.length + '/500'"></textarea>
                                <button onclick="window.sendSupportMessageRequested()" class="bg-green-500 text-black p-3 rounded-xl font-bold flex items-center justify-center hover:bg-green-400 active:scale-95 transition-all">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                                </button>
                            </div>
                            <div class="flex justify-end">
                                <span id="chatCharCount" class="text-[10px] text-gray-500 font-bold uppercase tracking-widest">0/500</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Add Enter key support
        document.getElementById('supportChatInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.sendSupportMessageRequested();
            }
        });
    },

    renderSupportChatMessages(history, append = false) {
        const container = document.getElementById('supportChatMessages');
        if (!container) return;

        if (!append && history.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-500 py-10">
                    <svg class="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    <p class="text-sm">No messages yet. Send a message to get help!</p>
                </div>
            `;
            return;
        }

        const html = history.map(msg => {
            const isAdmin = msg.sender_type === 'admin';
            return `
                <div class="flex ${isAdmin ? 'justify-start' : 'justify-end'} mb-1">
                    <div class="max-w-[85%] px-4 py-2 rounded-2xl break-all overflow-hidden ${isAdmin ? 'bg-gray-800 text-white rounded-tl-none border border-gray-700' : 'bg-green-500 text-black rounded-tr-none font-medium'}">
                        <p class="text-sm whitespace-pre-wrap">${msg.message}</p>
                        <span class="text-[10px] opacity-50 block mt-1 text-right">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (append) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            while (temp.lastChild) {
                container.insertBefore(temp.lastChild, container.firstChild);
            }
        } else {
            container.innerHTML = html;
            container.scrollTop = container.scrollHeight;
        }
    },

    updatePaymentModal(method, course) {
        const commonDetails = {
            title: 'Official NayaPay Account',
            number: 'PK23NAYA1234503217252122',
            name: 'Muhammad Ibrahim'
        };

        const instructions = {
            'easypaisa': commonDetails,
            'jazzcash': commonDetails,
            'bank': commonDetails
        };

        const details = instructions[method] || instructions['easypaisa'];

        const titleEl = document.getElementById('paymentAccountTitle');
        const numEl = document.getElementById('paymentAccountNumber');
        const nameEl = document.getElementById('paymentAccountName');

        if (titleEl) titleEl.textContent = details.title;
        if (numEl) numEl.textContent = details.number;
        if (nameEl) nameEl.textContent = `Title: ${details.name}`;

        if (course) {
            const amtEl = document.getElementById('paymentAmountDisplay');
            if (amtEl) amtEl.textContent = `Rs.${course.price.toLocaleString()} `;
        }

        this.showModal('manualPaymentModal');
    },

    getChartData(period, transactions = []) {
        const data = [];
        const labels = [];
        const now = new Date();
        const commissions = transactions.filter(txn => txn.type === 'commission' && txn.status === 'approved');

        let daysToLookBack = 7;
        if (period === '30D') daysToLookBack = 30;
        if (period === '90D') daysToLookBack = 90;
        if (period === '1Y') daysToLookBack = 365;

        // Generate daily points
        for (let i = daysToLookBack - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            d.setHours(0, 0, 0, 0);

            const dayTotal = commissions
                .filter(txn => {
                    const txnDate = new Date(txn.created_at);
                    if (isNaN(txnDate)) return false; // Safety check
                    txnDate.setHours(0, 0, 0, 0);
                    return txnDate.getTime() === d.getTime();
                })
                .reduce((sum, txn) => sum + txn.amount, 0);

            data.push(dayTotal);

            // Label logic
            if (period === '7D') {
                labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
            } else if (period === '30D' || period === '90D') {
                if (i % 5 === 0) labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                else labels.push("");
            } else {
                if (d.getDate() === 1) labels.push(d.toLocaleDateString('en-US', { month: 'short' }));
                else labels.push("");
            }
        }

        if (data.every(v => v === 0)) {
            return { data: new Array(daysToLookBack).fill(0), labels };
        }
        return { data, labels };
    },

    updateChart(period, transactions = []) {
        const chartInfo = this.getChartData(period, transactions);
        const data = chartInfo.data;
        const labels = chartInfo.labels;

        // Render for both pages if they exist
        const configs = [
            {
                svgId: 'earningsChart',
                lineId: 'chartLine',
                areaId: 'chartArea',
                yId: 'yAxisLabels',
                xId: 'xAxisLabels',
                gridId: 'gridLines',
                btnPrefix: 'btn-'
            },
            {
                svgId: 'analyticsChart',
                lineId: 'analyticsChartLine',
                areaId: 'analyticsChartArea',
                yId: 'analyticsYAxisLabels',
                xId: 'analyticsXAxisLabels',
                gridId: 'analyticsGridLines',
                btnPrefix: 'analytics-btn-'
            }
        ];

        configs.forEach(config => {
            const svg = document.getElementById(config.svgId);
            if (!svg) return;

            const linePath = document.getElementById(config.lineId);
            const areaPath = document.getElementById(config.areaId);
            const yAxisLabels = document.getElementById(config.yId);
            const xAxisLabels = document.getElementById(config.xId);
            const gridLines = document.getElementById(config.gridId);

            if (!linePath || !areaPath || !yAxisLabels || !xAxisLabels || !gridLines) return;

            yAxisLabels.innerHTML = '';
            xAxisLabels.innerHTML = '';
            gridLines.innerHTML = '';

            const width = 700;
            const height = 250;
            const leftPadding = 60;
            const rightPadding = 20;
            const topPadding = 20;
            const bottomPadding = 40;
            const chartWidth = width - leftPadding - rightPadding;
            const chartHeight = height - topPadding - bottomPadding;

            const min = 0;
            const max = Math.max(...data, 100);
            const range = max - min;

            // Y-Axis
            for (let i = 0; i <= 4; i++) {
                const val = min + (range * (i / 4));
                const y = topPadding + chartHeight - (i / 4) * chartHeight;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', leftPadding); line.setAttribute('y1', y);
                line.setAttribute('x2', width - rightPadding); line.setAttribute('y2', y);
                line.setAttribute('stroke', '#1f2937'); line.setAttribute('stroke-width', '1');
                gridLines.appendChild(line);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', leftPadding - 10); text.setAttribute('y', y + 4);
                text.setAttribute('text-anchor', 'end'); text.setAttribute('fill', '#9ca3af');
                text.setAttribute('font-size', '10'); text.textContent = `Rs. ${Math.round(val)}`;
                yAxisLabels.appendChild(text);
            }

            // X-Axis & Paths
            let lineData = "";
            let areaData = `M ${leftPadding} ${height - bottomPadding}`;

            data.forEach((val, i) => {
                const x = leftPadding + (i / (data.length - 1)) * chartWidth;
                const y = topPadding + chartHeight - ((val - min) / range) * chartHeight;

                if (i === 0) lineData = `M ${x} ${y}`;
                else lineData += ` L ${x} ${y}`;
                areaData += ` L ${x} ${y}`;
                if (labels[i]) {
                    const isMobile = window.innerWidth < 768;
                    const shouldSkip = isMobile && data.length > 7 && i % Math.ceil(data.length / 7) !== 0;

                    if (!shouldSkip) {
                        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        text.setAttribute('x', x); text.setAttribute('y', height - bottomPadding + 20);
                        text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', '#9ca3af');
                        text.setAttribute('font-size', isMobile ? '8' : '10'); text.textContent = labels[i];
                        xAxisLabels.appendChild(text);
                    }
                }
            });

            areaData += ` L ${width - rightPadding} ${height - bottomPadding} Z`;
            linePath.setAttribute('d', lineData);
            areaPath.setAttribute('d', areaData);

            // Update Buttons
            document.querySelectorAll(`[id^="${config.btnPrefix}"]`).forEach(btn => {
                btn.classList.remove('bg-green-500', 'text-white');
                btn.classList.add('bg-gray-800', 'text-gray-400');
            });
            const activeBtn = document.getElementById(`${config.btnPrefix}${period}`);
            if (activeBtn) {
                activeBtn.classList.remove('bg-gray-800', 'text-gray-400');
                activeBtn.classList.add('bg-green-500', 'text-white');
            }
        });
    },

    togglePasswordVisibility(targetId, btn) {
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.getAttribute('type') === 'password';
        input.setAttribute('type', isPassword ? 'text' : 'password');

        // Update SVG icon
        if (isPassword) {
            btn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.048 10.048 0 012.42-3.825M21.405 12A9.957 9.957 0 0112 5c-1.82 0-3.493.487-4.93 1.343M12 15a3 3 0 100-6M3 3l18 18" />
                </svg>
            `;
        } else {
            btn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            `;
        }
    },

    initPasswordToggles() {
        document.querySelectorAll('.password-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const container = btn.closest('.relative');
                const input = container.querySelector('input');
                const eyeIcon = btn.querySelector('.eye-icon');
                const eyeOffIcon = btn.querySelector('.eye-off-icon');

                if (input.type === 'password') {
                    input.type = 'text';
                    eyeIcon?.classList.add('hidden');
                    eyeOffIcon?.classList.remove('hidden');
                } else {
                    input.type = 'password';
                    eyeIcon?.classList.remove('hidden');
                    eyeOffIcon?.classList.add('hidden');
                }
            });
        });
    },

    updateWithdrawSummary() {
        const amountInput = document.getElementById('withdrawalAmountInput');
        const receiveAmountEl = document.getElementById('receiveAmountDisplay');
        const feeAmountEl = document.getElementById('feeAmountDisplay');

        if (!amountInput || !receiveAmountEl || !feeAmountEl) return;

        const amount = parseFloat(amountInput.value) || 0;
        const fee = amount * 0.025; // 2.5% cut
        const total = Math.max(0, amount - fee);

        feeAmountEl.textContent = `Rs. ${fee.toFixed(2)}`;
        receiveAmountEl.textContent = Math.round(total).toLocaleString();
    },

    initWithdrawMethodToggles() {
        const radios = document.querySelectorAll('input[name="withdrawalMethod"]');
        const bankNameField = document.getElementById('bankNameField');

        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'bank') {
                    bankNameField?.classList.remove('hidden');
                } else {
                    bankNameField?.classList.add('hidden');
                }
            });
        });

        // Initial state
        const checked = document.querySelector('input[name="withdrawalMethod"]:checked');
        if (checked?.value === 'bank') {
            bankNameField?.classList.remove('hidden');
        } else {
            bankNameField?.classList.add('hidden');
        }
    },

    handleReferralURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');

        if (refCode && refCode.length === 8) {
            // Check if user is already logged in - if so, don't show referral UI
            if (window.AppInstance && window.AppInstance.state.isLoggedIn) {
                // Just clear the URL and stop
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                return;
            }

            // Check if this referral was already used (stored in localStorage)
            const usedReferral = localStorage.getItem('used_referral_code');
            if (usedReferral && usedReferral === refCode.toUpperCase()) {
                // User already registered with this code - just clear URL and ignore
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                return;
            }

            const formattedCode = refCode.toUpperCase();
            const referralInput = document.getElementById('registrationReferralCode');
            const referralMsg = document.getElementById('referralAppliedMsg');
            const mobileLoginBtn = document.getElementById('mobileLoginBtn');

            if (referralInput) {
                referralInput.value = formattedCode;
                referralInput.readOnly = true;
                // Style to show it's locked and premium
                referralInput.classList.add('opacity-80', 'cursor-not-allowed', 'border-[#10b981]/50');
                referralInput.style.backgroundColor = "rgba(16, 185, 129, 0.05)";
            }

            if (referralMsg) {
                referralMsg.classList.remove('hidden');
                referralMsg.classList.add('flex');
            }

            // Don't hide login button on mobile - just show register by default
            // This allows existing users to still access login
            if (window.innerWidth < 1024) {
                // Mobile: Just pre-fill code, keep welcome screen visible
                // User will see the beam animation and can choose login or register
                // When they click register, code is already filled
            } else {
                // Desktop: Go straight to register form
                this.showAuthPanel('register');
            }

            // Mark as referral visit
            window.isReferralVisit = true;

            // Clean the URL so refresh/back doesn't trigger this again
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }
};

window.updateChart = (period) => {
    // This will be called via onclick, we need to find App instance or use Global State
    // Since App is not global, we can try to find window.App 
    if (window.AppInstance) {
        UI.updateChart(period, window.AppInstance.state.transactions);
    }
};

// Export for global usage
window.UI = UI;

// --- Global Aliases for HTML 'onclick' compatibility ---
window.showLoader = UI.showLoader;
window.hideLoader = UI.hideLoader;
window.showToast = UI.showToast;
window.showModal = UI.showModal;
window.hideModal = UI.hideModal;
window.showPage = UI.showPage;
window.showAppPage = UI.showAppPage;
window.showAuthPanel = UI.showAuthPanel;
window.toggleMobileSidebar = UI.toggleMobileSidebar;
window.updateWithdrawSummary = () => UI.updateWithdrawSummary();
window.toggleNewPendingDropdown = (e) => UI.toggleNewPendingDropdown(e);
window.toggleNewNotificationDropdown = (e) => UI.toggleNewNotificationDropdown(e);

window.handleNotificationToggle = (btn, key) => {
    // Basic toggle visual logic for now, syncing state requires App access or event dispatch
    const isChecked = btn.getAttribute('data-state') === 'checked';
    btn.setAttribute('data-state', isChecked ? 'unchecked' : 'checked');
};

window.copyPaymentNumber = () => {
    const el = document.getElementById('paymentAccountNumber');
    if (!el) return;

    const text = el.textContent.trim();

    // Modern approach
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            UI.showToast('Copied', 'Account number copied to clipboard! ✨');
        }).catch(err => {
            console.error('Clipboard error:', err);
            fallbackCopyTextToClipboard(text);
        });
    } else {
        fallbackCopyTextToClipboard(text);
    }
};

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Ensure the textarea is off-screen
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            UI.showToast('Copied', 'Account number copied to clipboard! ✨');
        } else {
            UI.showToast('Error', 'Unable to copy. Please copy manually.');
        }
    } catch (err) {
        UI.showToast('Error', 'Unable to copy.');
    }

    document.body.removeChild(textArea);
}





