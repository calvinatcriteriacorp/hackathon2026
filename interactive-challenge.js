// Interactive challenge that requires human action to reveal the image

function createInteractiveReveal() {
    const patternBox = document.querySelector('.pattern-box');
    const img = patternBox.querySelector('img');
    
    if (!img) return;
    
    // Hide image initially
    img.style.opacity = '0';
    
    // Create grid overlay with tiles
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(4, 1fr);
        gap: 2px;
        z-index: 10;
    `;
    
    const tiles = [];
    for (let i = 0; i < 16; i++) {
        const tile = document.createElement('div');
        tile.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            cursor: pointer;
            transition: opacity 0.3s;
        `;
        
        tile.addEventListener('click', function() {
            this.style.opacity = '0';
            tiles.push(i);
            
            // Show image when most tiles clicked
            if (tiles.length >= 12) {
                img.style.opacity = '1';
                setTimeout(() => {
                    overlay.remove();
                }, 300);
            }
        });
        
        overlay.appendChild(tile);
    }
    
    patternBox.appendChild(overlay);
    
    // Add instruction
    const instruction = document.createElement('div');
    instruction.textContent = 'Click tiles to reveal image';
    instruction.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 11;
        font-size: 14px;
    `;
    patternBox.appendChild(instruction);
    
    setTimeout(() => instruction.remove(), 3000);
}

// Time-limited viewing
function addTimeLimit() {
    const patternBox = document.querySelector('.pattern-box');
    let viewTime = 30; // seconds
    
    const timer = document.createElement('div');
    timer.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(255, 0, 0, 0.8);
        color: white;
        padding: 5px 10px;
        border-radius: 5px;
        font-weight: bold;
        z-index: 20;
    `;
    timer.textContent = `${viewTime}s`;
    patternBox.appendChild(timer);
    
    const interval = setInterval(() => {
        viewTime--;
        timer.textContent = `${viewTime}s`;
        
        if (viewTime <= 0) {
            clearInterval(interval);
            const img = patternBox.querySelector('img, canvas');
            if (img) {
                img.style.filter = 'blur(20px) brightness(0.3)';
                timer.textContent = 'Time up!';
            }
        }
    }, 1000);
}

// Track mouse movement (humans move mouse, AI doesn't)
function trackMouseBehavior() {
    const patternBox = document.querySelector('.pattern-box');
    let mouseMovements = 0;
    let lastX = 0, lastY = 0;
    
    patternBox.addEventListener('mousemove', (e) => {
        const dx = Math.abs(e.clientX - lastX);
        const dy = Math.abs(e.clientY - lastY);
        
        if (dx > 5 || dy > 5) {
            mouseMovements++;
        }
        
        lastX = e.clientX;
        lastY = e.clientY;
    });
    
    // Check on submit
    const submitBtn = document.querySelector('.submit-btn');
    const originalClick = submitBtn.onclick;
    
    submitBtn.addEventListener('click', function(e) {
        if (mouseMovements < 10) {
            e.preventDefault();
            alert('Suspicious activity detected. Please interact with the page normally.');
            return false;
        }
    });
}

// Require drawing verification
function addDrawingVerification() {
    const container = document.querySelector('.container');
    
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    canvas.style.cssText = `
        border: 2px solid #ddd;
        border-radius: 4px;
        margin: 20px 0;
        cursor: crosshair;
        display: block;
    `;
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    let drawing = false;
    let strokes = 0;
    
    canvas.addEventListener('mousedown', () => { drawing = true; });
    canvas.addEventListener('mouseup', () => { 
        drawing = false; 
        strokes++;
        ctx.beginPath();
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!drawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#333';
        
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    });
    
    const label = document.createElement('div');
    label.textContent = 'Draw any pattern to verify you are human:';
    label.style.cssText = 'margin-top: 20px; font-size: 14px; color: #666;';
    
    container.insertBefore(label, document.querySelector('.submit-btn'));
    container.insertBefore(canvas, document.querySelector('.submit-btn'));
    
    // Require drawing before submit
    const submitBtn = document.querySelector('.submit-btn');
    submitBtn.addEventListener('click', function(e) {
        if (strokes < 3) {
            e.preventDefault();
            alert('Please complete the drawing verification');
            return false;
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        createInteractiveReveal(); // Require clicking tiles to reveal
        addTimeLimit(); // 30-second time limit
        trackMouseBehavior(); // Track suspicious bot behavior
        addDrawingVerification(); // Require drawing verification
    }, 500);
});
