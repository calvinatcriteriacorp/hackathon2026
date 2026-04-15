// Cursor Tracking & AI Detection Module

const CursorTracker = (() => {
    // Data collection
    const data = {
        mousePositions: [],      // {x, y, timestamp}
        clicks: [],              // {x, y, timestamp, target}
        scrollEvents: [],        // {scrollY, timestamp}
        answerChanges: [],       // {value, timestamp}
        tabSwitches: [],         // {hidden, timestamp}
        questionStartTime: Date.now(),
        totalMouseDistance: 0,
        lastMousePos: null,
        idlePeriods: [],         // {start, end, duration}
        lastActivityTime: Date.now(),
        flags: []
    };

    const IDLE_THRESHOLD_MS = 3000; // 3 seconds of no movement = idle
    let idleTimer = null;
    let idleStart = null;

    // --- Data Collection ---

    function trackMouse(e) {
        const now = Date.now();
        const pos = { x: e.clientX, y: e.clientY, timestamp: now };
        data.mousePositions.push(pos);

        // Calculate distance from last position
        if (data.lastMousePos) {
            const dx = e.clientX - data.lastMousePos.x;
            const dy = e.clientY - data.lastMousePos.y;
            data.totalMouseDistance += Math.sqrt(dx * dx + dy * dy);
        }
        data.lastMousePos = { x: e.clientX, y: e.clientY };

        // Reset idle tracking
        data.lastActivityTime = now;
        if (idleStart) {
            data.idlePeriods.push({
                start: idleStart,
                end: now,
                duration: now - idleStart
            });
            idleStart = null;
        }
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            idleStart = Date.now();
        }, IDLE_THRESHOLD_MS);
    }

    function trackClick(e) {
        data.clicks.push({
            x: e.clientX,
            y: e.clientY,
            timestamp: Date.now(),
            target: e.target.tagName + (e.target.className ? '.' + e.target.className : '')
        });
    }

    function trackScroll() {
        data.scrollEvents.push({
            scrollY: window.scrollY,
            timestamp: Date.now()
        });
    }

    function trackAnswerChange(e) {
        if (e.target.name === 'answer') {
            data.answerChanges.push({
                value: e.target.value,
                label: e.target.closest('.option')?.querySelector('label')?.textContent || '',
                timestamp: Date.now()
            });
        }
    }

    function trackTabSwitch() {
        data.tabSwitches.push({
            hidden: document.hidden,
            timestamp: Date.now()
        });
    }

    // --- Analysis Rules ---

    function analyze() {
        const flags = [];
        const timeSpent = (Date.now() - data.questionStartTime) / 1000;

        // Rule 1: Too fast (< 3 seconds)
        if (timeSpent < 3 && data.answerChanges.length > 0) {
            flags.push({
                rule: 'SPEED_TOO_FAST',
                severity: 'high',
                detail: `Answered in ${timeSpent.toFixed(1)}s — suspiciously fast`,
                score: 30
            });
        }

        // Rule 2: No mouse movement before answering
        const firstAnswer = data.answerChanges[0];
        if (firstAnswer) {
            const movesBeforeAnswer = data.mousePositions.filter(
                p => p.timestamp < firstAnswer.timestamp
            );
            if (movesBeforeAnswer.length < 5) {
                flags.push({
                    rule: 'NO_MOUSE_MOVEMENT',
                    severity: 'high',
                    detail: `Only ${movesBeforeAnswer.length} mouse movements before selecting answer`,
                    score: 25
                });
            }
        }

        // Rule 3: Perfectly straight mouse paths (bot-like)
        const straightLineScore = detectStraightLines();
        if (straightLineScore > 0.7) {
            flags.push({
                rule: 'STRAIGHT_LINE_MOVEMENT',
                severity: 'medium',
                detail: `${(straightLineScore * 100).toFixed(0)}% of movements are perfectly straight — bot-like`,
                score: 20
            });
        }

        // Rule 4: No hesitation (humans pause, reconsider, hover)
        if (data.answerChanges.length === 1 && timeSpent < 10) {
            const hoverOverOptions = countHoversOverOptions();
            if (hoverOverOptions < 2) {
                flags.push({
                    rule: 'NO_HESITATION',
                    severity: 'medium',
                    detail: `Selected answer without hovering over other options (${hoverOverOptions} options considered)`,
                    score: 15
                });
            }
        }

        // Rule 5: Tab switching (possible copy-paste to AI)
        const tabAways = data.tabSwitches.filter(t => t.hidden);
        if (tabAways.length > 0) {
            const tabScore = Math.min(15 * tabAways.length, 45); // Cap at 45
            flags.push({
                rule: 'TAB_SWITCH',
                severity: tabAways.length >= 3 ? 'high' : 'medium',
                detail: `Left the tab ${tabAways.length} time(s) — possible AI consultation`,
                score: tabScore
            });
        }

        // Rule 6: Long idle then instant answer (reading AI response?)
        const longIdles = data.idlePeriods.filter(p => p.duration > 5000);
        if (longIdles.length > 0 && firstAnswer) {
            const idleBeforeAnswer = longIdles.find(
                p => firstAnswer.timestamp - p.end < 2000
            );
            if (idleBeforeAnswer) {
                flags.push({
                    rule: 'IDLE_THEN_ANSWER',
                    severity: 'high',
                    detail: `${(idleBeforeAnswer.duration / 1000).toFixed(1)}s idle period followed by immediate answer`,
                    score: 25
                });
            }
        }

        // Rule 7: Uniform click speed (robotic)
        if (data.clicks.length >= 3) {
            const clickIntervals = [];
            for (let i = 1; i < data.clicks.length; i++) {
                clickIntervals.push(data.clicks[i].timestamp - data.clicks[i - 1].timestamp);
            }
            const avgInterval = clickIntervals.reduce((a, b) => a + b, 0) / clickIntervals.length;
            const variance = clickIntervals.reduce((sum, v) => sum + Math.pow(v - avgInterval, 2), 0) / clickIntervals.length;
            const stdDev = Math.sqrt(variance);

            if (stdDev < 50 && avgInterval < 500) {
                flags.push({
                    rule: 'UNIFORM_CLICK_SPEED',
                    severity: 'medium',
                    detail: `Click intervals are suspiciously uniform (stddev: ${stdDev.toFixed(0)}ms)`,
                    score: 20
                });
            }
        }

        // Rule 8: No scrolling on long content
        if (document.body.scrollHeight > window.innerHeight && data.scrollEvents.length === 0) {
            flags.push({
                rule: 'NO_SCROLLING',
                severity: 'low',
                detail: 'Page has scrollable content but user never scrolled',
                score: 5
            });
        }

        // Rule 9: Answer changed multiple times rapidly
        if (data.answerChanges.length >= 3) {
            const lastThree = data.answerChanges.slice(-3);
            const span = lastThree[2].timestamp - lastThree[0].timestamp;
            if (span < 1000) {
                flags.push({
                    rule: 'RAPID_ANSWER_CHANGES',
                    severity: 'low',
                    detail: `Changed answer 3 times in ${(span / 1000).toFixed(1)}s (${data.answerChanges.length} total changes)`,
                    score: 10
                });
            }
        }

        // Rule 10: Very low mouse distance relative to time
        if (timeSpent > 5 && data.totalMouseDistance < 100) {
            flags.push({
                rule: 'LOW_MOUSE_DISTANCE',
                severity: 'medium',
                detail: `Only ${data.totalMouseDistance.toFixed(0)}px of mouse movement in ${timeSpent.toFixed(0)}s`,
                score: 15
            });
        }

        // Calculate total suspicion score
        const totalScore = flags.reduce((sum, f) => sum + f.score, 0);
        let riskLevel = 'low';
        if (totalScore >= 50) riskLevel = 'high';
        else if (totalScore >= 25) riskLevel = 'medium';

        data.flags = flags;

        return {
            flags,
            totalScore,
            riskLevel,
            stats: {
                timeSpent: timeSpent.toFixed(1) + 's',
                mousePositions: data.mousePositions.length,
                totalMouseDistance: data.totalMouseDistance.toFixed(0) + 'px',
                clicks: data.clicks.length,
                answerChanges: data.answerChanges.length,
                tabSwitches: tabAways.length,
                idlePeriods: data.idlePeriods.length
            }
        };
    }

    // --- Helper Functions ---

    function detectStraightLines() {
        if (data.mousePositions.length < 10) return 0;

        let straightSegments = 0;
        let totalSegments = 0;

        for (let i = 2; i < data.mousePositions.length; i++) {
            const p1 = data.mousePositions[i - 2];
            const p2 = data.mousePositions[i - 1];
            const p3 = data.mousePositions[i];

            const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
            const angleDiff = Math.abs(angle1 - angle2);

            totalSegments++;
            if (angleDiff < 0.05) { // Nearly straight
                straightSegments++;
            }
        }

        return totalSegments > 0 ? straightSegments / totalSegments : 0;
    }

    function countHoversOverOptions() {
        const optionElements = document.querySelectorAll('.option');
        const optionRects = Array.from(optionElements).map(el => el.getBoundingClientRect());

        const hoveredOptions = new Set();
        data.mousePositions.forEach(pos => {
            optionRects.forEach((rect, i) => {
                if (pos.x >= rect.left && pos.x <= rect.right &&
                    pos.y >= rect.top && pos.y <= rect.bottom) {
                    hoveredOptions.add(i);
                }
            });
        });

        return hoveredOptions.size;
    }

    // --- Dashboard ---

    function showDashboard(result) {
        const existing = document.getElementById('ai-detection-dashboard');
        if (existing) existing.remove();

        const dashboard = document.createElement('div');
        dashboard.id = 'ai-detection-dashboard';

        const riskColors = {
            low: '#4caf50',
            medium: '#ff9800',
            high: '#f44336'
        };

        dashboard.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 380px;
            max-height: 45vh;
            overflow-y: auto;
            background: white;
            border: 2px solid ${riskColors[result.riskLevel]};
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.15);
            font-family: -apple-system, sans-serif;
            font-size: 13px;
            z-index: 9999;
        `;

        const severityIcons = { high: '🔴', medium: '🟡', low: '🟢' };

        dashboard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <strong style="font-size:15px;">AI Detection Report</strong>
                <span style="background:${riskColors[result.riskLevel]}; color:white; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600;">
                    ${result.riskLevel.toUpperCase()} RISK (${result.totalScore} pts)
                </span>
            </div>

            <div style="background:#f5f5f5; border-radius:8px; padding:10px; margin-bottom:15px;">
                <div style="font-weight:600; margin-bottom:8px;">Session Stats</div>
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
            ` : '<div style="color:#4caf50; font-weight:500;">No suspicious patterns detected.</div>'}

            <button id="closeDashboard" style="
                width:100%; margin-top:12px; padding:8px;
                background:#eee; border:none; border-radius:6px;
                cursor:pointer; font-size:12px;
            ">Close</button>
        `;

        document.body.appendChild(dashboard);
        document.getElementById('closeDashboard').addEventListener('click', () => dashboard.remove());
    }

    // --- Save Results ---

    function getPageId() {
        const path = window.location.pathname;
        const file = path.split('/').pop() || 'index1.html';
        return file.replace('.html', '');
    }

    function saveResults() {
        const result = analyze();
        const pageId = getPageId();
        const allResults = JSON.parse(sessionStorage.getItem('cursorResults') || '{}');
        allResults[pageId] = result;
        sessionStorage.setItem('cursorResults', JSON.stringify(allResults));
        return result;
    }

    // --- Init ---

    function init() {
        document.addEventListener('mousemove', trackMouse);
        document.addEventListener('click', trackClick);
        document.addEventListener('scroll', trackScroll);
        document.addEventListener('change', trackAnswerChange);
        document.addEventListener('visibilitychange', trackTabSwitch);

        // Hook into submit button
        const submitBtn = document.querySelector('.submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const result = saveResults();
                console.log('AI Detection Result:', result);
                showDashboard(result);
            });
        }

        // Auto-save when navigating via Next button
        const nextBtn = document.querySelector('.next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                saveResults();
            });
        }

        console.log('Cursor Tracker initialized');
    }

    // Public API
    return { init, analyze, saveResults, getData: () => data };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => CursorTracker.init());
