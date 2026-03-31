document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.premium-bg-system');
    const coursePage = document.getElementById('coursePlayerPage');

    if (!container) return;

    // Mouse movement tracker
    document.addEventListener('mousemove', (e) => {
        const x = e.clientX;
        const y = e.clientY;
        container.style.setProperty('--mouse-x', `${x}px`);
        container.style.setProperty('--mouse-y', `${y}px`);
    });

    // If course page exists, observe it for visibility changes
    if (coursePage) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const isHidden = coursePage.classList.contains('hidden');
                    if (!isHidden) {
                        document.body.classList.add('show-infinite-grid');
                    } else {
                        document.body.classList.remove('show-infinite-grid');
                    }
                }
            });
        });

        observer.observe(coursePage, { attributes: true });

        // Initial check
        if (!coursePage.classList.contains('hidden')) {
            document.body.classList.add('show-infinite-grid');
        } else {
            // Ensure it's off if page is hidden (handles reload case)
            document.body.classList.remove('show-infinite-grid');
        }
    }
});
