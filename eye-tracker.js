// Eye Tracking Module using WebGazer.js

const EyeTracker = (() => {
    const data = {
        gazePositions: [],       // {x, y, timestamp}
        lookAwayEvents: [],      // {start, end, duration}
        gazeOnQuestion: 0,       // time spent looking at question area
        gazeOnOptions: 0,        // time spent looking at options area
        gazeOnImage: 0,          // time spent looking at image area
        gazeOffScreen: 0,        // time spent looking away from screen
        gazeOther: 0,            // time on page but not on question/image/options
        totalGazeTime: 0,
        calibrated: false,
        active: false
    };

    let lookAwayStart = null;
    const LOOK_AWAY_THRESHOLD_MS = 500;
    let lookAwayTimer = null;
    let lastGazeTime = null;
    let statusIndicator = null;
    let nullGazeCount = 0;
    let offScreenCount = 0;
    let stuckCount = 0;
    let faceCheckInterval = null;
    const OFF_SCREEN_MARGIN = 50;
    const recentGaze = [];
    const JITTER_WINDOW = 10;
    const JITTER_THRESHOLD = 200; // lowered from 400
    const STUCK_THRESHOLD = 3;    // px total movement = stuck
    const STUCK_WINDOW = 15;      // frames to check

    // --- UI Elements ---

    function createStatusIndicator() {
        statusIndicator = document.createElement('div');
        statusIndicator.id = 'eye-tracker-status';
        statusIndicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 8px 14px;
            border-radius: 20px;
            font-family: -apple-system, sans-serif;
            font-size: 12px;
            font-weight: 600;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s;
        `;
        updateStatus('initializing', 'Requesting camera...');
        document.body.appendChild(statusIndicator);

        // Webcam toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'webcam-toggle';
        toggleBtn.textContent = '📷 Hide';
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: 255px;
            left: 10px;
            padding: 5px 12px;
            background: rgba(0,0,0,0.6);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            font-family: -apple-system, sans-serif;
            z-index: 10001;
            transition: background 0.2s;
        `;
        toggleBtn.addEventListener('mouseenter', () => { toggleBtn.style.background = 'rgba(0,0,0,0.8)'; });
        toggleBtn.addEventListener('mouseleave', () => { toggleBtn.style.background = 'rgba(0,0,0,0.6)'; });
        toggleBtn.addEventListener('click', () => {
            const container = document.getElementById('webgazerVideoContainer');
            if (!container) return;
            const hidden = container.style.display === 'none';
            container.style.display = hidden ? '' : 'none';
            toggleBtn.textContent = hidden ? '📷 Hide' : '📷 Show';
            toggleBtn.style.bottom = hidden ? '255px' : '10px';
        });
        document.body.appendChild(toggleBtn);
    }

    function updateStatus(state, text) {
        if (!statusIndicator) return;
        const states = {
            initializing: { bg: '#fff3e0', color: '#e65100', dot: '#ff9800' },
            tracking: { bg: '#e8f5e9', color: '#1b5e20', dot: '#4caf50' },
            lookaway: { bg: '#fce4ec', color: '#b71c1c', dot: '#f44336' },
            error: { bg: '#ffebee', color: '#c62828', dot: '#f44336' },
            calibrating: { bg: '#e3f2fd', color: '#0d47a1', dot: '#2196f3' }
        };
        const s = states[state] || states.initializing;
        statusIndicator.style.background = s.bg;
        statusIndicator.style.color = s.color;
        statusIndicator.innerHTML = `
            <span style="width:8px; height:8px; border-radius:50%; background:${s.dot}; display:inline-block;
                ${state === 'tracking' ? 'animation: pulse 1.5s infinite;' : ''}"></span>
            ${text}
        `;
    }

    // --- Calibration ---

    function showCalibration() {
        return new Promise((resolve) => {
            updateStatus('calibrating', 'Calibrating — click each dot 5 times');

            const overlay = document.createElement('div');
            overlay.id = 'calibration-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 10000;
            `;

            const instructions = document.createElement('div');
            instructions.style.cssText = `
                color: white; font-size: 18px; font-family: -apple-system, sans-serif;
                text-align: center; position: absolute; top: 45%; width: 100%;
            `;
            instructions.innerHTML = 'Click each dot while looking at it<br><small style="color:#aaa;">This calibrates eye tracking (9 points)</small>';
            overlay.appendChild(instructions);

            // Skip button
            const skipBtn = document.createElement('button');
            skipBtn.textContent = 'Skip Calibration';
            skipBtn.style.cssText = `
                position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
                padding: 10px 24px; background: transparent; color: #aaa; border: 1px solid #666;
                border-radius: 8px; cursor: pointer; font-size: 14px; font-family: -apple-system, sans-serif;
                transition: background 0.2s, color 0.2s;
            `;
            skipBtn.addEventListener('mouseenter', () => { skipBtn.style.background = '#333'; skipBtn.style.color = '#fff'; });
            skipBtn.addEventListener('mouseleave', () => { skipBtn.style.background = 'transparent'; skipBtn.style.color = '#aaa'; });
            skipBtn.addEventListener('click', () => {
                overlay.remove();
                resolve();
            });
            overlay.appendChild(skipBtn);

            // 9 calibration points for better coverage
            const points = [
                { x: 10, y: 10 }, { x: 50, y: 10 }, { x: 90, y: 10 },
                { x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 },
                { x: 10, y: 90 }, { x: 50, y: 90 }, { x: 90, y: 90 }
            ];

            let completedPoints = 0;

            points.forEach((pt) => {
                const dot = document.createElement('div');
                dot.style.cssText = `
                    position: absolute;
                    left: ${pt.x}%;
                    top: ${pt.y}%;
                    width: 30px; height: 30px;
                    background: #4285f4;
                    border: 3px solid white;
                    border-radius: 50%;
                    cursor: pointer;
                    transform: translate(-50%, -50%);
                    transition: transform 0.2s, background 0.2s;
                `;

                dot.addEventListener('click', (e) => {
                    // Feed click coordinates to WebGazer for calibration
                    if (typeof webgazer !== 'undefined') {
                        webgazer.recordScreenPosition(e.clientX, e.clientY, 'click');
                    }

                    dot.style.background = '#4caf50';
                    dot.style.transform = 'translate(-50%, -50%) scale(0.3)';
                    dot.style.pointerEvents = 'none';
                    completedPoints++;

                    if (completedPoints === points.length) {
                        setTimeout(() => {
                            overlay.remove();
                            data.calibrated = true;
                            resolve();
                        }, 300);
                    }
                });

                overlay.appendChild(dot);
            });

            document.body.appendChild(overlay);
        });
    }

    // --- Gaze Processing ---

    function isOffScreen(x, y) {
        return x < -OFF_SCREEN_MARGIN ||
               y < -OFF_SCREEN_MARGIN ||
               x > window.innerWidth + OFF_SCREEN_MARGIN ||
               y > window.innerHeight + OFF_SCREEN_MARGIN;
    }

    function isJittering() {
        if (recentGaze.length < JITTER_WINDOW) return false;
        let totalDist = 0;
        for (let i = 1; i < recentGaze.length; i++) {
            const dx = recentGaze[i].x - recentGaze[i - 1].x;
            const dy = recentGaze[i].y - recentGaze[i - 1].y;
            totalDist += Math.sqrt(dx * dx + dy * dy);
        }
        const avgJump = totalDist / (recentGaze.length - 1);
        return avgJump > JITTER_THRESHOLD;
    }

    function isStuck() {
        if (recentGaze.length < STUCK_WINDOW) return false;
        const recent = recentGaze.slice(-STUCK_WINDOW);
        let totalDist = 0;
        for (let i = 1; i < recent.length; i++) {
            const dx = recent[i].x - recent[i - 1].x;
            const dy = recent[i].y - recent[i - 1].y;
            totalDist += Math.sqrt(dx * dx + dy * dy);
        }
        return totalDist < STUCK_THRESHOLD;
    }

    function processGaze(gazeData, elapsedTime) {
        const now = Date.now();

        // Signal 1: No gaze data at all
        if (!gazeData) {
            // Track off-screen time when face is lost
            const increment = lastGazeTime ? Math.min(now - lastGazeTime, 500) : 100;
            data.gazeOffScreen += increment;
            data.totalGazeTime += increment;
            lastGazeTime = now;

            nullGazeCount++;
            if (nullGazeCount >= 3) {
                handleLookAway('no_face');
            }
            return;
        }
        nullGazeCount = 0;

        const x = gazeData.x;
        const y = gazeData.y;

        // Track in sliding window (used by stuck + jitter checks)
        recentGaze.push({ x, y, timestamp: now });
        if (recentGaze.length > Math.max(JITTER_WINDOW, STUCK_WINDOW)) recentGaze.shift();

        // Signal 2: Gaze is far outside the viewport
        if (isOffScreen(x, y)) {
            // Track off-screen time in real-time
            const increment = lastGazeTime ? Math.min(now - lastGazeTime, 500) : 100;
            data.gazeOffScreen += increment;
            data.totalGazeTime += increment;
            lastGazeTime = now;

            offScreenCount++;
            if (offScreenCount >= 5) {
                handleLookAway('off_screen');
            }
            return;
        }
        offScreenCount = 0;

        // Signal 3: Gaze is jumping wildly (lost tracking)
        if (isJittering()) {
            handleLookAway('jitter');
            return;
        }

        // Signal 4: Gaze is frozen/stuck (WebGazer lost face but still predicts)
        if (isStuck()) {
            stuckCount++;
            if (stuckCount >= 5) {
                handleLookAway('stuck');
            }
            return;
        }
        stuckCount = 0;

        // Valid gaze — record it
        const pos = { x, y, timestamp: now };
        data.gazePositions.push(pos);

        // End look-away if active
        if (lookAwayStart) {
            const duration = now - lookAwayStart;
            if (duration > LOOK_AWAY_THRESHOLD_MS) {
                data.lookAwayEvents.push({
                    start: lookAwayStart,
                    end: now,
                    duration
                });
            }
            lookAwayStart = null;
            stuckCount = 0;
            updateStatus('tracking', 'Eye tracking active');
        }

        clearTimeout(lookAwayTimer);
        lookAwayTimer = setTimeout(() => handleLookAway('timeout'), LOOK_AWAY_THRESHOLD_MS);

        // Track time on different page regions
        categorizeGaze(x, y);
        lastGazeTime = now;
    }

    function handleLookAway(reason) {
        if (!lookAwayStart) {
            lookAwayStart = Date.now();
            const labels = {
                no_face: 'Face not detected',
                off_screen: 'Looking off screen',
                jitter: 'Gaze lost',
                stuck: 'Gaze frozen — face lost',
                timeout: 'Looking away'
            };
            updateStatus('lookaway', labels[reason] || 'Looking away');
        }
    }

    // Monitor jitter at startup — prompt calibration only if extremely high
    function startJitterMonitor() {
        const EXTREME_JITTER = 300; // px avg jump = needs calibration
        const CHECK_DELAY = 3000;   // wait 3s to collect enough data

        setTimeout(() => {
            if (recentGaze.length < 10) return; // not enough data yet

            let totalDist = 0;
            for (let i = 1; i < recentGaze.length; i++) {
                const dx = recentGaze[i].x - recentGaze[i - 1].x;
                const dy = recentGaze[i].y - recentGaze[i - 1].y;
                totalDist += Math.sqrt(dx * dx + dy * dy);
            }
            const avgJump = totalDist / (recentGaze.length - 1);

            if (avgJump > EXTREME_JITTER) {
                console.warn(`Eye tracker jitter too high (${avgJump.toFixed(0)}px) — triggering calibration`);
                updateStatus('calibrating', 'High jitter detected — calibrating');
                showCalibration().then(() => {
                    updateStatus('tracking', 'Eye tracking active');
                });
            }
        }, CHECK_DELAY);
    }

    // Poll WebGazer's prediction directly as a backup detector
    function startFaceCheck() {
        faceCheckInterval = setInterval(() => {
            if (typeof webgazer === 'undefined' || !data.active) return;
            const prediction = webgazer.getCurrentPrediction();
            if (!prediction || prediction === null) {
                handleLookAway('no_face');
            }
        }, 1000);
    }

    function categorizeGaze(x, y) {
        const questionEl = document.querySelector('.question, .question-blue, .question-red, .question-green');
        const imageEl = document.querySelector('.pattern-box');
        const optionsEl = document.querySelector('.options');

        // Use actual elapsed time since last gaze for accurate tracking
        const now = Date.now();
        const increment = lastGazeTime ? Math.min(now - lastGazeTime, 500) : 100;

        // Larger padding for question since it's small text and WebGazer has ~50-100px accuracy
        if (questionEl && isInElement(x, y, questionEl, 100)) {
            data.gazeOnQuestion += increment;
        } else if (imageEl && isInElement(x, y, imageEl, 30)) {
            data.gazeOnImage += increment;
        } else if (optionsEl && isInElement(x, y, optionsEl, 50)) {
            data.gazeOnOptions += increment;
        } else {
            data.gazeOther += increment;
        }
        data.totalGazeTime += increment;
    }

    function isInElement(x, y, el, padding = 0) {
        const rect = el.getBoundingClientRect();
        return x >= rect.left - padding && x <= rect.right + padding &&
               y >= rect.top - padding && y <= rect.bottom + padding;
    }

    // --- Analysis ---

    function analyze() {
        const flags = [];

        // Finalize any in-progress look-away before scoring
        if (lookAwayStart) {
            const now = Date.now();
            const duration = now - lookAwayStart;
            if (duration > LOOK_AWAY_THRESHOLD_MS) {
                data.lookAwayEvents.push({
                    start: lookAwayStart,
                    end: now,
                    duration
                });
            }
            lookAwayStart = null;
        }

        // gazeOffScreen is tracked in real-time by processGaze

        // Rule: Never looked at the question (adaptive to question length)
        const questionEl = document.querySelector('.question, .question-blue, .question-red, .question-green');
        const wordCount = questionEl ? questionEl.textContent.trim().split(/\s+/).length : 0;
        const msPerWord = 120 * 0.8; // ~500 words/min skimming speed, adjusted for reading speed
        const minQuestionGaze = Math.max(500, wordCount * msPerWord);

        if (data.totalGazeTime > 3000 && data.gazeOnQuestion < minQuestionGaze) {
            flags.push({
                rule: 'NEVER_READ_QUESTION',
                severity: 'high',
                detail: `Only ${(data.gazeOnQuestion / 1000).toFixed(1)}s looking at question (expected ~${(minQuestionGaze / 1000).toFixed(1)}s for ${wordCount} words)`,
                score: 25
            });
        }

        // Rule: Never looked at the image (only if page has an image)
        const hasImage = document.querySelector('.pattern-box img, .pattern-box canvas');
        if (hasImage && data.totalGazeTime > 3000 && data.gazeOnImage < 1000) {
            flags.push({
                rule: 'NEVER_VIEWED_IMAGE',
                severity: 'high',
                detail: `Only ${(data.gazeOnImage / 1000).toFixed(1)}s looking at the image`,
                score: 25
            });
        }

        // Rule: Didn't review options before answering
        if (data.totalGazeTime > 3000 && data.gazeOnOptions < 500) {
            flags.push({
                rule: 'DIDNT_REVIEW_OPTIONS',
                severity: 'medium',
                detail: `Only ${(data.gazeOnOptions / 1000).toFixed(1)}s looking at answer options`,
                score: 15
            });
        }

        // Rule: Look-away detection
        const allLookAways = data.lookAwayEvents;
        const longLookAway = allLookAways.find(e => e.duration > 3000);
        const significantLookAways = allLookAways.filter(e => e.duration > 1000);

        if (longLookAway) {
            // Single long look-away (>3s) — most suspicious
            flags.push({
                rule: 'LONG_LOOK_AWAY',
                severity: 'high',
                detail: `Looked away for ${(longLookAway.duration / 1000).toFixed(1)}s — possible second device usage`,
                score: 30
            });
        }

        if (significantLookAways.length >= 2) {
            // Multiple look-aways >1s — suspicious pattern
            const totalAwayTime = significantLookAways.reduce((sum, e) => sum + e.duration, 0);
            flags.push({
                rule: 'FREQUENT_LOOK_AWAY',
                severity: 'high',
                detail: `Looked away ${significantLookAways.length} times for ${(totalAwayTime / 1000).toFixed(1)}s total — possible second screen`,
                score: 20
            });
        } else if (allLookAways.length > 0 && !longLookAway) {
            // At least one brief look-away — mild flag
            const totalAwayTime = allLookAways.reduce((sum, e) => sum + e.duration, 0);
            flags.push({
                rule: 'BRIEF_LOOK_AWAY',
                severity: 'low',
                detail: `Looked away ${allLookAways.length} time(s) for ${(totalAwayTime / 1000).toFixed(1)}s total`,
                score: 10
            });
        }

        // Rule: Gaze jumped directly to answer (skipped reading)
        if (data.gazePositions.length > 10) {
            const firstTen = data.gazePositions.slice(0, 10);
            const optionsEl = document.querySelector('.options');
            if (optionsEl) {
                const allOnOptions = firstTen.every(p => isInElement(p.x, p.y, optionsEl));
                if (allOnOptions) {
                    flags.push({
                        rule: 'SKIPPED_TO_ANSWER',
                        severity: 'medium',
                        detail: 'First gaze positions were all on answer options — skipped reading question',
                        score: 20
                    });
                }
            }
        }

        return {
            flags,
            stats: {
                gazeOnQuestion: (data.gazeOnQuestion / 1000).toFixed(1) + 's',
                gazeOnImage: (data.gazeOnImage / 1000).toFixed(1) + 's',
                gazeOnOptions: (data.gazeOnOptions / 1000).toFixed(1) + 's',
                gazeOnOtherAreas: (data.gazeOther / 1000).toFixed(1) + 's',
                gazeOffScreen: (data.gazeOffScreen / 1000).toFixed(1) + 's',
                lookAwayEvents: data.lookAwayEvents.length,
                totalGazePoints: data.gazePositions.length,
                calibrated: data.calibrated
            }
        };
    }

    // --- Init ---

    function hideContent() {
        const selectors = '.question, .question-blue, .question-red, .question-green, .pattern-box, .options, .submit-btn, .next-btn';
        document.querySelectorAll(selectors).forEach(el => {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.4s';
        });
    }

    function showContent() {
        const selectors = '.question, .question-blue, .question-red, .question-green, .pattern-box, .options, .submit-btn, .next-btn';
        document.querySelectorAll(selectors).forEach(el => {
            el.style.opacity = '1';
        });
    }

    async function init() {
        if (typeof webgazer === 'undefined') {
            console.warn('WebGazer.js not loaded — eye tracking disabled');
            showContent();
            return;
        }

        hideContent();
        createStatusIndicator();
        hookSubmit();

        // Add pulse animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }
            #webgazerVideoContainer { 
                top: auto !important; 
                bottom: 10px !important;
                left: 10px !important;
                width: 320px !important;
                height: 240px !important;
                border-radius: 8px !important;
                overflow: hidden !important;
                border: 2px solid #4285f4 !important;
                opacity: 0.8;
            }
            #webgazerVideoFeed {
                width: 320px !important;
                height: 240px !important;
                object-fit: cover !important;
            }
            #webgazerFaceOverlay {
                width: 320px !important;
                height: 240px !important;
                object-fit: cover !important;
            }
            #webgazerFaceFeedbackBox {
                display: none !important;
            }
            #webgazerGazeDot {
                width: 15px !important;
                height: 15px !important;
                background: rgba(255, 0, 0, 0.5) !important;
                border: 2px solid red !important;
            }
        `;
        document.head.appendChild(style);

        try {
            // Point MediaPipe model files to CDN
            if (webgazer.params) {
                webgazer.params.faceMeshConfig = {
                    locateFile: (file) => {
                        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`;
                    }
                };
            }

            webgazer
                .setRegression('ridge')
                .setGazeListener(processGaze)
                .saveDataAcrossSessions(true)
                .showVideoPreview(true)
                .showPredictionPoints(true)
                .showFaceOverlay(true)
                .showFaceFeedbackBox(false);

            await webgazer.begin();

            // Explicitly enable mouse click tracking for calibration
            webgazer.addMouseEventListeners();

            data.active = true;

            // Short delay to let the model warm up
            await new Promise(r => setTimeout(r, 1500));
            startFaceCheck();
            showContent();
            updateStatus('tracking', 'Eye tracking active');

        } catch (err) {
            console.warn('WebGazer begin() threw:', err);

            // Still check if video is running despite error
            setTimeout(() => {
                const video = document.getElementById('webgazerVideoFeed');
                if (video && video.srcObject) {
                    data.active = true;

                    webgazer.showPredictionPoints(true);
                    webgazer.addMouseEventListeners();

                    startFaceCheck();
                    showContent();
                    updateStatus('tracking', 'Eye tracking active');
                } else {
                    updateStatus('error', 'Camera access denied');
                    showContent();
                }
            }, 1500);
        }
    }

    // --- Dashboard ---

    function showDashboard(result) {
        const existing = document.getElementById('eye-detection-dashboard');
        if (existing) existing.remove();

        const totalScore = result.flags.reduce((sum, f) => sum + f.score, 0);
        let riskLevel = 'low';
        if (totalScore >= 50) riskLevel = 'high';
        else if (totalScore >= 25) riskLevel = 'medium';

        const riskColors = { low: '#4caf50', medium: '#ff9800', high: '#f44336' };
        const severityIcons = { high: '🔴', medium: '🟡', low: '🟢' };

        const dashboard = document.createElement('div');
        dashboard.id = 'eye-detection-dashboard';
        dashboard.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 380px;
            max-height: 500px;
            overflow-y: auto;
            background: white;
            border: 2px solid ${riskColors[riskLevel]};
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.15);
            font-family: -apple-system, sans-serif;
            font-size: 13px;
            z-index: 9999;
        `;

        dashboard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <strong style="font-size:15px;">👁 Eye Tracking Report</strong>
                <span style="background:${riskColors[riskLevel]}; color:white; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600;">
                    ${riskLevel.toUpperCase()} RISK (${totalScore} pts)
                </span>
            </div>

            <div style="background:#f5f5f5; border-radius:8px; padding:10px; margin-bottom:15px;">
                <div style="font-weight:600; margin-bottom:8px;">Gaze Stats</div>
                ${Object.entries(result.stats).map(([key, val]) =>
                    `<div style="display:flex; justify-content:space-between; padding:2px 0;">
                        <span style="color:#666;">${key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                        <span style="font-weight:500;">${val}</span>
                    </div>`
                ).join('')}
            </div>

            ${result.flags.length > 0 ? `
                <div style="font-weight:600; margin-bottom:8px;">Flags (${result.flags.length})</div>
                ${result.flags.map(f => `
                    <div style="background:#fafafa; border-left:3px solid ${riskColors[f.severity]}; padding:8px 10px; margin-bottom:6px; border-radius:0 6px 6px 0;">
                        <div style="font-weight:600; font-size:12px;">
                            ${severityIcons[f.severity]} ${f.rule} <span style="color:#999; font-weight:400;">(+${f.score})</span>
                        </div>
                        <div style="color:#666; font-size:11px; margin-top:2px;">${f.detail}</div>
                    </div>
                `).join('')}
            ` : '<div style="color:#4caf50; font-weight:500;">No suspicious gaze patterns detected.</div>'}

            <button id="closeEyeDashboard" style="
                width:100%; margin-top:12px; padding:8px;
                background:#eee; border:none; border-radius:6px;
                cursor:pointer; font-size:12px;
            ">Close</button>
        `;

        document.body.appendChild(dashboard);
        document.getElementById('closeEyeDashboard').addEventListener('click', () => dashboard.remove());
    }

    // --- Save Results ---

    function getPageId() {
        const path = window.location.pathname;
        const file = path.split('/').pop() || 'index1.html';
        return file.replace('.html', '');
    }

    function saveResults() {
        const result = analyze();
        const totalScore = result.flags.reduce((sum, f) => sum + f.score, 0);
        let riskLevel = 'low';
        if (totalScore >= 50) riskLevel = 'high';
        else if (totalScore >= 25) riskLevel = 'medium';
        result.totalScore = totalScore;
        result.riskLevel = riskLevel;

        const pageId = getPageId();
        const allResults = JSON.parse(sessionStorage.getItem('eyeResults') || '{}');
        allResults[pageId] = result;
        sessionStorage.setItem('eyeResults', JSON.stringify(allResults));
        return result;
    }

    function hookSubmit() {
        const submitBtn = document.querySelector('.submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                if (!data.active) return;
                const result = saveResults();
                console.log('Eye Tracking Result:', result);
                showDashboard(result);
            });
        }

        // Auto-save when navigating via Next button
        const nextBtn = document.querySelector('.next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (data.active) saveResults();
            });
        }
    }

    // Public API
    return { init, analyze, saveResults, getData: () => data, isActive: () => data.active };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => EyeTracker.init());
