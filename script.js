// Add noise overlay to the image
function addNoiseOverlay() {
    const patternBox = document.querySelector('.pattern-box');
    const img = patternBox.querySelector('img');
    
    // Set crossOrigin to prevent CORS issues
    // img.crossOrigin = 'anonymous';
    
    // Wait for image to load
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to match image
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.className = 'pattern-image';
        
        // Draw the original image
        ctx.drawImage(img, 0, 0);
        
        // Add noise
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        const noiseIntensity = 50; // Adjust this value (0-200)
        
        for (let i = 0; i < data.length; i += 4) {
            // Separate noise for each channel creates more chaotic effect
            data[i] += (Math.random() - 0.5) * noiseIntensity;     // Red
            data[i + 1] += (Math.random() - 0.5) * noiseIntensity; // Green
            data[i + 2] += (Math.random() - 0.5) * noiseIntensity; // Blue
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Replace image with canvas
        img.replaceWith(canvas);
    };
    
    // Trigger load if image is already cached
    if (img.complete) {
        img.onload();
    }
}

// Add random subtle distortions
function addDistortion() {
    const patternBox = document.querySelector('.pattern-box');
    const randomRotation = (Math.random() - 0.5) * 2; // -1 to 1 degree
    const randomSkew = (Math.random() - 0.5) * 1; // Subtle skew
    
    patternBox.style.transform = `rotate(${randomRotation}deg) skew(${randomSkew}deg)`;
}

// Add scanline effect
function addScanlines() {
    const patternBox = document.querySelector('.pattern-box');
    const overlay = document.createElement('div');
    overlay.className = 'scanlines';
    patternBox.appendChild(overlay);
}

// Add decoy overlay patterns to confuse AI
function addDecoyPatterns() {
    const patternBox = document.querySelector('.pattern-box');
    
    // Add random semi-transparent shapes
    for (let i = 0; i < 5; i++) {
        const decoy = document.createElement('div');
        decoy.className = 'decoy-pattern';
        decoy.style.cssText = `
            position: absolute;
            width: ${20 + Math.random() * 30}%;
            height: ${20 + Math.random() * 30}%;
            top: ${Math.random() * 80}%;
            left: ${Math.random() * 80}%;
            background: rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.1);
            transform: rotate(${Math.random() * 360}deg);
            pointer-events: none;
        `;
        patternBox.appendChild(decoy);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    addNoiseOverlay();
    addDistortion();
    addScanlines();
    addDecoyPatterns();
    
    // Prevent screenshots
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keyup', (e) => {
        if (e.key === 'PrintScreen') {
            navigator.clipboard.writeText('');
        }
    });
});

// Submit handler
document.querySelector('.submit-btn').addEventListener('click', function(e) {
    e.preventDefault();
    const selected = document.querySelector('input[name="answer"]:checked');
    if (selected) {
        alert('Answer submitted: ' + selected.value);
    } else {
        alert('Please select an answer');
    }
});
