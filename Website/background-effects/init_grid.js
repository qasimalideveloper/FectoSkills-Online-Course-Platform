// Initialize Flickering Grid Background
document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('flickeringGrid');
    if (gridContainer) {
        new FlickeringGrid('#flickeringGrid', {
            color: 'rgb(16, 185, 129)', // Brand Emerald Color
            squareSize: 4,
            gridGap: 6,
            flickerChance: 0.3,
            maxOpacity: 0.8 // Increased for better visibility
        });
    }
});
