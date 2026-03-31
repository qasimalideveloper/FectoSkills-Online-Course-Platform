/**
 * js/coursePlayer.js - The Learning Engine
 * Handles interactive steps, progress, and rendering for the course player.
 */

const CoursePlayer = {
    state: {
        courseId: null,
        courseTitle: '', // Added courseTitle
        classes: [],
        currentClass: null,
        steps: [],
        currentStepIdx: 0,
        xp: 0,
        // Session tracking
        sessionCompletedSteps: [],
        sessionXpGain: 0,
        // Local completion cache
        completedClassIds: []
    },

    async init(courseId, courseTitle = 'Course Player') {
        this.state.courseId = courseId;
        this.state.courseTitle = courseTitle;
        document.body.classList.add('show-infinite-grid'); // Enable Infinite Grid
        UI.showLoader("Opening Course...");

        try {
            this.state.completedClassIds = this.getCompletedClasses();
            await this.loadFullCourse();
            await this.loadProgress();

            if (!this.state.classes || this.state.classes.length === 0) {
                UI.showToast("No Content", "This course doesn't have any classes yet.", "info");
                return;
            }

            // Show the Course Selection / Table of Contents
            this.renderTableOfContents();
            UI.showAppPage('coursePlayerPage');
        } catch (e) {
            console.error("Course Init Error:", e);
            UI.showToast("Error", "Failed to load course content. Check console for details.", "error");
        } finally {
            UI.hideLoader();
        }
    },

    async loadFullCourse() {
        const response = await fetch(`${Auth.API_URL}/api/course/${this.state.courseId}/full`, {
            headers: Auth.getHeaders(),
            credentials: 'include'
        });
        const data = await response.json();
        if (data.success) {
            this.state.classes = data.data.course.classes;
            // Also store course metadata if needed
            this.state.courseTitle = data.data.course.title;
        } else {
            throw new Error(data.data.error || "Failed to fetch full course data");
        }
    },

    getCompletedClasses() {
        const key = `completed_classes_${this.state.courseId}`;
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    },

    async markClassCompleted(classId) {
        const key = `completed_classes_${this.state.courseId}`;
        const completed = this.getCompletedClasses();
        if (!completed.includes(classId)) {
            completed.push(classId);
            localStorage.setItem(key, JSON.stringify(completed));
            this.state.completedClassIds = completed;

            // Cloud Sync
            try {
                await fetch(`${Auth.API_URL}/api/progress/sync`, {
                    method: 'POST',
                    headers: Auth.getHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({
                        course_id: this.state.courseId,
                        class_id: classId
                    })
                });
            } catch (e) {
                console.error("Progress sync failed:", e);
            }
        }
    },

    async loadProgress() {
        // Fetch Cloud Progress
        try {
            const response = await fetch(`${Auth.API_URL}/api/progress/get`, {
                headers: Auth.getHeaders(),
                credentials: 'include'
            });
            const data = await response.json();

            if (data.success && data.data.progress) {
                const cloudCompleted = data.data.progress[this.state.courseId.toString()] || [];
                const localCompleted = this.getCompletedClasses();

                // Merge cloud and local
                const merged = [...new Set([...localCompleted, ...cloudCompleted])];
                localStorage.setItem(`completed_classes_${this.state.courseId}`, JSON.stringify(merged));
                this.state.completedClassIds = merged;
            }
        } catch (e) {
            console.error("Failed to load cloud progress:", e);
        }
    },

    renderTableOfContents() {
        const container = document.getElementById('coursePlayerContent');
        if (!container) return;

        const titleWords = this.state.courseTitle.split(' ');
        const titleStart = titleWords[0];
        const titleEnd = titleWords.slice(1).join(' ');

        container.innerHTML = `
            <div class="flex-1 flex flex-col bg-transparent min-h-full">
                <!-- Standard Website Header -->
                <div class="app-page-header">
                    <div class="app-header-actions">
                        <div class="flex items-center gap-6">
                            <button onclick="CoursePlayer.close()" class="lg:hidden p-2 text-gray-400 hover:text-white transition-colors">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                                </svg>
                            </button>
                            <h1 class="page-title">
                                ${titleStart} <span class="page-title-span">${titleEnd}</span>
                            </h1>
                            <div class="hidden lg:flex items-center gap-2 px-4 py-2 bg-gray-800/50 rounded-xl border border-gray-700/50">
                                <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">${this.state.classes.length} Modules</span>
                                <span class="w-1 h-1 rounded-full bg-emerald-500"></span>
                                <span class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">${this.state.xp} XP Earned</span>
                            </div>
                        </div>

                        <div class="app-header-right">
                            <button onclick="CoursePlayer.close()" class="flex items-center gap-2 px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl border border-gray-700 transition-all font-bold text-xs uppercase tracking-wider">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                                Exit Player
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Compact Module Grid -->
                <div class="flex-1 p-4 lg:p-8 overflow-y-auto custom-scrollbar">
                    <div class="max-w-6xl mx-auto">
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                            ${this.state.classes.map((c, idx) => {
            const isDone = this.state.completedClassIds.includes(c.id);
            return `
                                <div class="app-card group cursor-pointer hover:border-emerald-500/50 transition-all duration-300 active:scale-[0.98] ${isDone ? 'border-emerald-500/30' : ''}"
                                     onclick="CoursePlayer.startClass(${c.id})">
                                    <div class="p-6">
                                        <div class="flex items-center justify-between mb-4">
                                            <div class="w-10 h-10 ${isDone ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-gray-900 border-gray-700 text-white'} rounded-xl flex items-center justify-center font-black group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                                                ${isDone ? `
                                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"></path>
                                                    </svg>
                                                ` : (idx + 1)}
                                            </div>
                                            <span class="text-[10px] font-black ${isDone ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/50' : 'text-gray-500 bg-gray-900/50 border-gray-700/50'} uppercase tracking-widest px-3 py-1 rounded-lg border">
                                                ${isDone ? 'Completed' : 'Module'}
                                            </span>
                                        </div>
                                        <h3 class="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors uppercase truncate">${c.title}</h3>
                                        <p class="text-gray-400 text-xs font-medium leading-relaxed line-clamp-2 mb-6">${c.description || 'Interactive learning module.'}</p>
                                        
                                        <div class="flex items-center justify-between pt-4 border-t border-gray-700/50">
                                            <div class="flex items-center gap-2">
                                                <div class="w-1.5 h-1.5 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}"></div>
                                                <span class="text-[9px] font-black ${isDone ? 'text-emerald-500' : 'text-gray-500'} uppercase tracking-widest">
                                                    ${isDone ? 'Mastered' : 'Ready'}
                                                </span>
                                            </div>
                                            <div class="${isDone ? 'text-emerald-500' : 'text-gray-500'} group-hover:translate-x-1 transition-transform">
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `}).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    close() {
        // Go back to all courses or purchased courses
        document.body.classList.remove('show-infinite-grid'); // Disable Infinite Grid
        UI.showAppPage('allCoursesPage');

        // Fix: Re-render courses so the page isn't blank (especially on mobile)
        if (window.COURSES && window.AppInstance) {
            UI.renderCourses(window.COURSES, window.AppInstance.state.purchasedCourses);
        }
    },

    async startClass(classId) {
        const selectedClass = this.state.classes.find(c => c.id === classId);
        if (selectedClass) {
            this.state.currentClass = selectedClass;
            this.state.steps = selectedClass.steps;
            this.state.currentStepIdx = 0;
            // Reset session tracking for this new class
            this.state.sessionCompletedSteps = [];
            this.state.sessionXpGain = 0;
            this.renderStep();
        } else {
            UI.showToast("Error", "Class not found in local data", "error");
        }
    },

    renderStep() {
        const step = this.state.steps[this.state.currentStepIdx];
        const container = document.getElementById('coursePlayerContent');
        if (!container || !step) return;

        const progress = ((this.state.currentStepIdx) / this.state.steps.length) * 100;

        let contentHtml = '';
        if (step.type === 'info') {
            contentHtml = `
                <div class="animate-slide-up-fade">
                    <div class="prose prose-invert max-w-none mb-8">
                        <h2 class="text-2xl font-bold text-white mb-4 uppercase tracking-tight">${step.title || 'Information'}</h2>
                        <div class="text-gray-400 text-sm leading-relaxed font-medium">${marked.parse(step.content.text)}</div>
                    </div>
                    ${step.content.image ? `
                        <div class="mb-8 rounded-2xl overflow-hidden border border-gray-700 shadow-xl bg-gray-900/50 flex justify-center p-8">
                             <img 
                                src="${step.content.image}" 
                                alt="Step Image" 
                                style="max-width: 100%; height: auto; display: block;"
                                onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'text-red-500 font-bold\'>Image Load Error: ' + this.src.substring(0,50) + '...</div>'"
                             >
                        </div>
                    ` : ''}
                    <button onclick="CoursePlayer.nextStep()" class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm uppercase tracking-widest rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3">
                        <span>${step.content.button_text || 'Continue'}</span>
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
                        </svg>
                    </button>
                </div>
            `;
        } else if (step.type === 'quiz') {
            contentHtml = `
                <div class="animate-slide-up-fade">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-8 h-8 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center border border-emerald-500/20">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest">Knowledge Check</h3>
                    </div>
                    <p class="text-lg text-white mb-8 font-bold leading-tight">${step.content.question}</p>
                    <div class="grid gap-3">
                        ${step.content.options.map((opt, oIdx) => `
                            <button onclick="CoursePlayer.validateStep('${opt.replace(/'/g, "\\'")}')" 
                                class="w-full py-4 px-6 text-left bg-gray-900 border border-gray-700 hover:border-emerald-500 hover:bg-emerald-500/10 rounded-xl text-white font-bold text-sm transition-colors duration-200 flex items-center justify-between group">
                                <span>${opt}</span>
                                <div class="w-6 h-6 flex items-center justify-center text-gray-500 group-hover:text-emerald-500 transition-colors duration-200">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"></path>
                                    </svg>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (step.type === 'input') {
            contentHtml = `
                <div class="animate-slide-up-fade">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-8 h-8 bg-blue-500/10 text-blue-500 rounded-lg flex items-center justify-center border border-blue-500/20">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                        </div>
                        <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest">Practical Task</h3>
                    </div>
                    <p class="text-sm text-gray-400 mb-6 font-medium leading-relaxed">${step.content.text}</p>
                    <div class="mb-6">
                        <input type="text" id="stepInput" placeholder="${step.content.placeholder || 'Type your answer...'}" 
                               class="w-full p-4 bg-gray-950 border border-gray-700 rounded-xl text-white text-lg focus:outline-none focus:border-emerald-500 transition-all font-mono">
                    </div>
                    <button onclick="CoursePlayer.validateStep(document.getElementById('stepInput').value)" 
                            class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm uppercase tracking-widest rounded-xl transition-all active:scale-[0.98]">
                        Verify Completion
                    </button>
                </div>
            `;
        } else if (step.type === 'code') {
            contentHtml = `
                <div class="animate-slide-up-fade">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-8 h-8 bg-amber-500/10 text-amber-500 rounded-lg flex items-center justify-center border border-amber-500/20">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                            </svg>
                        </div>
                        <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest">Coding Challenge</h3>
                    </div>
                    <p class="text-sm text-gray-400 mb-6 font-medium leading-relaxed">${step.content.text}</p>
                    
                    <div class="bg-gray-950 rounded-2xl border border-gray-700 overflow-hidden mb-6">
                        <div class="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-700">
                            <div class="flex items-center gap-3">
                                <div class="flex gap-1.5">
                                    <div class="w-2.5 h-2.5 rounded-full bg-red-500/30"></div>
                                    <div class="w-2.5 h-2.5 rounded-full bg-amber-500/30"></div>
                                    <div class="w-2.5 h-2.5 rounded-full bg-emerald-500/30"></div>
                                </div>
                                <span class="text-[10px] font-bold text-gray-500 tracking-wider">Solution.py</span>
                            </div>
                        </div>
                        <textarea id="stepCode" class="w-full h-64 p-6 bg-transparent text-emerald-400 font-mono text-sm focus:outline-none resize-none leading-relaxed custom-scrollbar" spellcheck="false" placeholder="# Start coding...">${step.content.initial_code || ''}</textarea>
                    </div>

                    <button onclick="CoursePlayer.validateStep(document.getElementById('stepCode').value)" 
                            class="w-full py-4 bg-white text-black hover:bg-emerald-500 transition-all font-bold text-sm uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 active:scale-[0.98]">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        <span>Run & Validate</span>
                    </button>
                    ${step.content.hint ? `
                        <div class="mt-6 p-4 bg-gray-800/20 border border-gray-700 rounded-xl flex items-start gap-4">
                            <span class="text-amber-500 text-sm italic font-bold">Hint:</span>
                            <p class="text-gray-500 text-xs font-medium leading-relaxed">${step.content.hint}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        container.innerHTML = `
            <div class="flex flex-col flex-1 bg-transparent min-h-full">
                <!-- Standard Extended Header -->
                <div class="app-page-header">
                    <div class="app-header-actions relative">
                        <!-- Left: Navigation & Title -->
                        <div class="flex items-center gap-4 lg:gap-6">
                            <button onclick="CoursePlayer.renderTableOfContents()" class="p-2 text-gray-400 hover:text-white transition-colors group">
                                <svg class="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                                </svg>
                            </button>
                            
                            <!-- Steps Counter -->
                            <div class="flex flex-col">
                                <h1 class="page-title !mb-0 text-sm lg:text-lg">
                                    Step <span class="page-title-span">${this.state.currentStepIdx + 1} / ${this.state.steps.length}</span>
                                </h1>
                            </div>
                        </div>

                        <!-- Center: Focus Hub (Hero Progress) -->
                        <div class="hidden lg:flex flex-col items-center justify-center absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-1/3 max-w-xl">
                            <div class="flex items-center gap-4 w-full justify-center">
                                <!-- Time Estimate Badge -->
                                <div class="flex items-center gap-1.5 min-w-fit">
                                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    <span class="text-[10px] font-bold text-gray-400">~15m</span>
                                </div>
                                
                                <!-- Hero Bar -->
                                <div class="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700 shadow-inner">
                                    <div class="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-700 relative" style="width: ${progress}%">
                                        <div class="absolute right-0 top-0 bottom-0 w-1 bg-white/50 blur-[1px]"></div>
                                    </div>
                                </div>

                                <!-- Percentage -->
                                <span class="text-xs font-black text-white min-w-fit">${Math.round(progress)}%</span>
                            </div>
                        </div>

                        <!-- Right: Tools & Stats -->
                        <div class="app-header-right flex items-center gap-3">
                             <!-- Ask AI (Native Style) -->
                            <button onclick="UI.showAppPage('askAIPage')" class="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl border border-gray-700 transition-all font-bold text-xs uppercase tracking-wider">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                                <span>Ask AI</span>
                            </button>

                            <!-- Type Badge -->
                            <div class="px-3 py-2 bg-transparent rounded-xl border border-gray-700/50 text-gray-400">
                                <span class="text-[10px] font-bold uppercase tracking-widest">${step.type}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Compact Interaction Canvas -->
                <div class="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8">
                    <div class="max-w-3xl mx-auto py-4 lg:py-8">
                        <!-- Module Progress Title -->
                        <div class="mb-8 pl-2">
                            <span class="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] block mb-2">Module Journey</span>
                            <h2 class="text-3xl font-[900] text-white tracking-tighter uppercase leading-none">${step.title || 'Interactive Lesson'}</h2>
                        </div>

                        <div class="app-card relative">
                            <div class="p-8 lg:p-12 relative z-10">
                                ${contentHtml}
                            </div>
                        </div>


                    </div>
                </div>
            </div>
        `;
    },

    async validateStep(userAnswer) {
        try {
            const step = this.state.steps[this.state.currentStepIdx];
            if (!step) {
                return;
            }

            // Frontend-only validation
            let isCorrect = true;

            if (['quiz', 'input', 'code'].includes(step.type)) {
                const answers = Array.isArray(step.content.answer) ? step.content.answer : [step.content.answer];
                let cleanedUserAnswer = String(userAnswer || '').trim().toLowerCase();

                if (step.type === 'code' || step.type === 'input') {
                    cleanedUserAnswer = cleanedUserAnswer.replace(/\s+/g, '');
                }

                isCorrect = answers.some(ans => {
                    let cleanedAnswer = String(ans || '').trim().toLowerCase();
                    if (step.type === 'code' || step.type === 'input') {
                        cleanedAnswer = cleanedAnswer.replace(/\s+/g, '');
                    }
                    return cleanedUserAnswer === cleanedAnswer;
                });
            }

            if (isCorrect) {
                // Success feedback
                UI.showToast("Correct!", `+${step.xp_reward} XP Earned`, "success");

                // Track for session
                if (!this.state.sessionCompletedSteps.includes(step.id)) {
                    this.state.sessionCompletedSteps.push(step.id);
                    this.state.sessionXpGain += step.xp_reward;
                    this.state.xp += step.xp_reward;
                }

                this.nextStep();
            } else {
                UI.showToast("Keep Trying!", "That's not quite right. Try again.", "error");

                const input = document.getElementById('stepInput') || document.getElementById('stepCode');
                if (input) {
                    input.classList.add('animate-shake');
                    setTimeout(() => input.classList.remove('animate-shake'), 500);
                }
            }
        } catch (err) {
            console.error("CRITICAL ERROR in validateStep:", err);
            UI.showToast("System Error", "Something went wrong during validation.", "error");
        }
    },

    async recordProgress() {
        // This is called at the end of the class
        if (this.state.sessionCompletedSteps.length === 0) return;

        try {
            const response = await fetch(`${Auth.API_URL}/api/course/batch_progress`, {
                method: 'POST',
                headers: Auth.getHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    course_id: this.state.courseId,
                    class_id: this.state.currentClass.id,
                    step_ids: this.state.sessionCompletedSteps,
                    xp_gain: this.state.sessionXpGain
                })
            });
            const data = await response.json();
        } catch (e) {
            console.warn("Could not sync progress to server:", e);
        }
    },

    nextStep() {
        this.state.currentStepIdx++;
        if (this.state.currentStepIdx < this.state.steps.length) {
            this.renderStep();
        } else {
            // Mark as completed locally
            if (this.state.currentClass) {
                this.markClassCompleted(this.state.currentClass.id);
            }

            this.recordProgress(); // Final sync
            this.renderCollectionComplete();
        }
    },

    renderCollectionComplete() {
        const container = document.getElementById('coursePlayerContent');
        if (!container) return;

        // Ensure we show the total XP gained this session
        const sessionXP = this.state.sessionXpGain;

        container.innerHTML = `
            <div class="flex-1 flex flex-col bg-transparent min-h-full">
                <!-- Standard Website Header -->
                <div class="app-page-header">
                    <div class="app-header-actions">
                        <div class="flex items-center gap-6">
                            <h1 class="page-title">
                                Module <span class="page-title-span">Completed</span>
                            </h1>
                        </div>

                        <div class="app-header-right">
                            <button onclick="CoursePlayer.close()" class="flex items-center gap-2 px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl border border-gray-700 transition-all font-bold text-xs uppercase tracking-wider">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                                Exit Player
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Completion Canvas -->
                <div class="flex-1 flex items-center justify-center p-4 lg:p-8">
                    <div class="max-w-xl w-full">
                        <div class="app-card text-center relative overflow-hidden">
                            <div class="p-10 lg:p-16 relative z-10">
                                <div class="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 mx-auto mb-8 animate-bounce">
                                    <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                </div>

                                <h2 class="text-4xl font-[900] text-white tracking-tighter uppercase mb-4 leading-none">Excellent Progress</h2>
                                <p class="text-gray-400 font-medium mb-12 text-sm leading-relaxed">You've successfully mastered this module and earned your Knowledge Points.</p>

                                <div class="grid grid-cols-2 gap-4 mb-12">
                                    <div class="bg-gray-900/50 p-6 rounded-2xl border border-gray-700">
                                        <p class="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">XP Earned</p>
                                        <p class="text-2xl font-black text-emerald-500 italic">+${sessionXP}</p>
                                    </div>
                                    <div class="bg-gray-900/50 p-6 rounded-2xl border border-gray-700">
                                        <p class="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Status</p>
                                        <p class="text-2xl font-black text-white italic">Pro</p>
                                    </div>
                                </div>

                                <div class="flex flex-col gap-3">
                                    <button onclick="CoursePlayer.renderTableOfContents()" class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm uppercase tracking-widest rounded-xl transition-all active:scale-[0.98]">
                                        Continue Journey
                                    </button>
                                    <button onclick="UI.showAppPage('purchasedCoursesPage'); if(window.COURSES && window.AppInstance) UI.renderPurchasedCourses(window.COURSES, window.AppInstance.state.purchasedCourses || []);" class="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm uppercase tracking-widest rounded-xl border border-gray-700 transition-all active:scale-[0.98]">
                                        Back to Dashboard
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
};

window.CoursePlayer = CoursePlayer;
