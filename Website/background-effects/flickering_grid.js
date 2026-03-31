class FlickeringGrid {
    constructor(selector, options = {}) {
        this.container = document.querySelector(selector);
        if (!this.container) {
            console.error(`FlickeringGrid: Container ${selector} not found`);
            return;
        }

        this.squareSize = options.squareSize || 4;
        this.gridGap = options.gridGap || 6;
        this.flickerChance = options.flickerChance || 0.3;
        this.color = options.color || "rgb(0, 0, 0)";
        this.maxOpacity = options.maxOpacity || 0.3;

        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.inset = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none'; // Allow clicks to pass through
        this.container.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.squares = null;
        this.cols = 0;
        this.rows = 0;
        this.isInView = true; // Optimization: only animate when visible
        this.memoizedColor = this.parseColor(this.color);

        this.setupCanvas();

        // Start Loop
        this.lastTime = 0;
        this.animate = this.animate.bind(this);
        this.animationFrameId = requestAnimationFrame(this.animate);

        // Resize Observer
        this.resizeObserver = new ResizeObserver(() => this.setupCanvas());
        this.resizeObserver.observe(this.container);

        // Intersection Observer (Performance)
        this.intersectionObserver = new IntersectionObserver(([entry]) => {
            this.isInView = entry.isIntersecting;
            if (this.isInView && !this.animationFrameId) {
                this.lastTime = performance.now();
                this.animate(this.lastTime);
            }
        });
        this.intersectionObserver.observe(this.canvas);
    }

    parseColor(color) {
        // Simple helper to ensure color is in rgb format
        // In a real browser env, we can use a temp canvas to normalize colors if needed
        // but for performance, we'll assume the user passes a valid RGB/Hex
        // Stick to the React implementation's robust method:
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgba(${r}, ${g}, ${b},`;
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        // Styles are already set to 100% via CSS/Init

        this.cols = Math.floor(width / (this.squareSize + this.gridGap));
        this.rows = Math.floor(height / (this.squareSize + this.gridGap));

        // Re-init squares
        this.squares = new Float32Array(this.cols * this.rows);
        for (let i = 0; i < this.squares.length; i++) {
            this.squares[i] = Math.random() * this.maxOpacity;
        }

        this.dpr = dpr;
        this.canvasWidth = width;
        this.canvasHeight = height;
    }

    updateSquares(deltaTime) {
        // Adjust flickerChance by deltaTime to keep consistent speed across frame rates
        // React code: Math.random() < flickerChance * deltaTime
        // standard 60fps frame is ~0.016s. 
        for (let i = 0; i < this.squares.length; i++) {
            if (Math.random() < this.flickerChance * deltaTime) { // Assuming deltaTime is in seconds?
                this.squares[i] = Math.random() * this.maxOpacity;
            }
        }
    }

    drawGrid() {
        const { ctx, canvasWidth, canvasHeight, cols, rows, squares, dpr, squareSize, gridGap, memoizedColor } = this;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Ensure transparent bg

        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const opacity = squares[i * rows + j];
                ctx.fillStyle = `${memoizedColor}${opacity})`;
                ctx.fillRect(
                    i * (squareSize + gridGap) * dpr,
                    j * (squareSize + gridGap) * dpr,
                    squareSize * dpr,
                    squareSize * dpr,
                );
            }
        }
    }

    animate(time) {
        if (!this.isInView) {
            this.animationFrameId = null;
            return;
        }

        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        if (this.squares) {
            this.updateSquares(deltaTime);
            this.drawGrid();
        }

        this.animationFrameId = requestAnimationFrame(this.animate);
    }

    destroy() {
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.intersectionObserver) this.intersectionObserver.disconnect();
        this.canvas.remove();
    }
}
