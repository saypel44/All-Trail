'use strict';

/* ═══════════════════════════════════════
   API & STATE CONFIGURATION
   ═══════════════════════════════════════ */
const API_BASE = ''; 
let currentUser = null;
let _authToken = null;
let _currentData = { logs: [], alarms: {}, habitEnabled: {} };

const HABITS = [
    { id: 'sleep', name: 'Sleep', icon: '🌙', unit: 'hrs', color: '#534AB7' },
    { id: 'work', name: 'Work', icon: '💻', unit: 'hrs', color: '#1D9E75' },
    { id: 'exercise', name: 'Exercise', icon: '🏃', unit: 'mins', color: '#BA7517' },
    { id: 'screen', name: 'Screen time', icon: '📱', unit: 'hrs', color: '#C0392B' },
    { id: 'reading', name: 'Reading', icon: '📚', unit: 'mins', color: '#0F6E56' },
    { id: 'meditation', name: 'Meditation', icon: '🧘', unit: 'mins', color: '#2EBF8E' }
];



/* ═══════════════════════════════════════
   CORE API ENGINE
   ═══════════════════════════════════════ */
async function _apiRequest(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (_authToken) headers['Authorization'] = `Bearer ${_authToken}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

async function syncData() {
    try {
        const [logs, alarms] = await Promise.all([
            _apiRequest('/api/logs'),
            _apiRequest('/api/alarms')
        ]);
        _currentData.logs = logs || [];
        _currentData.alarms = {};
        alarms.forEach(a => {
            _currentData.alarms[a.category] = { active: true, from: a.from_time, to: a.to_time, sound: a.sound };
        });
        renderAllUI();
    } catch (e) { console.error("Sync error", e); }
}

/* ═══════════════════════════════════════
   AUTH FLOW
   ═══════════════════════════════════════ */
async function doLogin() {
    const user = document.getElementById('li-user').value.trim();
    const pass = document.getElementById('li-pass').value;
    try {
        const res = await _apiRequest('/api/login', 'POST', { username: user, password: pass });
        setupSession(res);
    } catch (err) { showMsg('li-msg', err.message, 'err'); }
}

async function doSignup() {
    const name = document.getElementById('su-name').value.trim();
    const user = document.getElementById('su-user').value.trim();
    const pass = document.getElementById('su-pass').value;
    try {
        const res = await _apiRequest('/api/signup', 'POST', { name, username: user, password: pass });
        setupSession(res);
    } catch (err) { showMsg('su-msg', err.message, 'err'); }
}

function setupSession(res) {
    _authToken = res.token;
    currentUser = { username: res.username, name: res.name };
    sessionStorage.setItem('qt_token', _authToken);
    sessionStorage.setItem('qt_user', JSON.stringify(currentUser));
    launchApp();
}

function doLogout() {
    sessionStorage.clear();
    location.reload();
}

/* ═══════════════════════════════════════
   HABIT TRACKING & LOGS
   ═══════════════════════════════════════ */
async function saveLog(hId) {
    const habit = HABITS.find(h => h.id === hId);
    const start = getAmPmVal(`log-${hId}-start`);
    const end = getAmPmVal(`log-${hId}-end`);
    const note = document.getElementById(`note-${hId}`).value;

    const payload = {
        habitName: habit.name,
        habitIcon: habit.icon,
        date: new Date().toISOString().split('T')[0],
        duration: calculateDuration(start, end, habit.unit),
        unit: 'hrs',
        displayUnit: habit.unit,
        startTime: format12(start),
        endTime: format12(end),
        note: note
    };

    try {
        await _apiRequest('/api/logs', 'POST', payload);
        showMsg(`log-msg-${hId}`, '✓ Saved to DB', 'ok');
        syncData();
    } catch (e) { showMsg(`log-msg-${hId}`, 'Save failed', 'err'); }
}

/* ═══════════════════════════════════════
   STOPWATCH FEATURE
   ═══════════════════════════════════════ */
let swInterval, swStart;
function toggleStopwatch() {
    const btn = document.getElementById('sw-btn');
    if (btn.textContent.includes('Start')) {
        swStart = Date.now();
        swInterval = setInterval(updateSWDisplay, 100);
        btn.textContent = 'Stop Timer';
        btn.style.background = '#e74c3c';
    } else {
        clearInterval(swInterval);
        saveStopwatchToDB();
        btn.textContent = 'Start Timer';
        btn.style.background = 'var(--accent)';
    }
}

async function saveStopwatchToDB() {
    const elapsedMs = Date.now() - swStart;
    const hrs = (elapsedMs / 3600000).toFixed(2);
    const cat = document.getElementById('sw-cat').value;
    
    await _apiRequest('/api/logs', 'POST', {
        habitName: cat,
        habitIcon: '⏱',
        date: new Date().toISOString().split('T')[0],
        duration: hrs,
        unit: 'hrs',
        displayUnit: 'hrs',
        note: 'Stopwatch Session'
    });
    syncData();
}



/* ═══════════════════════════════════════
   SURVEY FEEDBACK LOGIC (The "Tips")
   ═══════════════════════════════════════ */
function buildFeedback() {
    const sleep = answers.sleep || '7–8 hours';
    const score = sleepScore();
    let area = "General Wellness";
    let actions = ["Keep tracking your habits daily."];

    if (score < 30) {
        area = "Sleep Consistency";
        actions = [
            "Try to go to bed at the same time every night.",
            "Avoid heavy meals 2 hours before sleep.",
            "Limit blue light exposure (phones) before bed."
        ];
    } else if (answers.phonetime === 'more than 3 hours' || answers.phonetime === '2–3 hours') {
        area = "Digital Detox";
        actions = [
            "Set a 'Phone Bedtime' 30 minutes before sleep.",
            "Read a physical book instead of scrolling.",
            "Use 'Do Not Disturb' mode at night."
        ];
    }

    return {
        whatsGoingWell: score > 35 ? "You have a solid foundation for rest." : "You are becoming more aware of your habits.",
        areaOfImprovement: area,
        actions: actions
    };
}

async function submitCheckIn() {
    const score = sleepScore();
    const fb = buildFeedback();
    
    const payload = {
        score: score,
        feedback: fb.areaOfImprovement,
        recommendations: fb.actions,
        date: new Date().toISOString().split('T')[0]
    };

    try {
        await _apiRequest('/api/checkins', 'POST', payload);
        
        // Show the results UI
        document.getElementById('tracker-form').style.display = 'none';
        const resDiv = document.getElementById('results');
        resDiv.style.display = 'block';
        
        renderAIFeedback(resDiv, fb);
        syncData(); // Refresh history
    } catch (err) {
        alert("Error saving check-in: " + err.message);
    }
}

function renderAIFeedback(container, fb) {
    container.innerHTML = `
        <div class="ai-card">
            <h3>✨ Your Recommendations</h3>
            <p><strong>Focus:</strong> ${fb.areaOfImprovement}</p>
            <ul>${fb.actions.map(a => `<li>${a}</li>`).join('')}</ul>
            <button onclick="location.reload()" class="restart-btn">New Check-in</button>
        </div>
    `;
}

/* ═══════════════════════════════════════
   UI NAVIGATION (Fixes Tracker/History clicks)
   ═══════════════════════════════════════ */
function showTab(t) {
    // Hide all panes
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    // Deactivate all nav buttons
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    
    // Show selected pane
    const targetTab = document.getElementById('tab-' + t);
    if (targetTab) targetTab.classList.add('active');
    
    // Update button styling
    const activeBtn = Array.from(document.querySelectorAll('.nav-tab')).find(b => 
        b.getAttribute('onclick')?.includes(`'${t}'`)
    );
    if (activeBtn) activeBtn.classList.add('active');

    // Trigger specific re-renders
    if (t === 'trends') renderTrends();
    if (t === 'history') renderHistory();
}

/* ═══════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════ */
function calculateDuration(start, end, unit) {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diffMins < 0) diffMins += 1440; // Over midnight
    return unit === 'hrs' ? (diffMins / 60).toFixed(2) : diffMins;
}

function formatTime12(t24) {
    if (!t24) return '';
    const [h, m] = t24.split(':');
    let hh = parseInt(h);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return `${hh}:${m} ${ampm}`;
}

/* ═══════════════════════════════════════
   UI RENDERING (Calendar, History, Trends)
   ═══════════════════════════════════════ */
function renderAllUI() {
    renderHistory();
    renderTrends();
    buildHabitCards();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = _currentData.logs.map(log => `
        <div class="history-item">
            <div class="h-icon">${log.habitIcon}</div>
            <div class="h-info">
                <strong>${log.habitName}</strong>
                <span>${log.startTime || ''} - ${log.endTime || ''}</span>
            </div>
            <div class="h-dur">${log.duration} ${log.displayUnit}</div>
        </div>
    `).join('');
}

/* ═══════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════ */
function launchApp() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    document.getElementById('greeting-name').textContent = currentUser.name.split(' ')[0];
    syncData();
}

document.addEventListener('DOMContentLoaded', () => {
    const token = sessionStorage.getItem('qt_token');
    if (token) {
        _authToken = token;
        currentUser = JSON.parse(sessionStorage.getItem('qt_user'));
        launchApp();
    }
});

// Helper functions (calculateDuration, format12, getAmPmVal) would follow here...

/* ═══════════════════════════════════════
   FIX: LOGGING DATA TO MYSQL
   ═══════════════════════════════════════ */
async function saveLog(hId) {
    const habit = HABITS.find(h => h.id === hId);
    const start = getAmPmVal(`log-${hId}-start`);
    const end = getAmPmVal(`log-${hId}-end`);
    const note = document.getElementById(`note-${hId}`).value;

    // Calculate duration in hours
    const duration = calculateDuration(start, end, habit.unit);

    const payload = {
        habitName: habit.name,
        habitIcon: habit.icon,
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        duration: parseFloat(duration),
        unit: 'hrs',
        displayUnit: habit.unit,
        startTime: formatTime12(start),
        endTime: formatTime12(end),
        note: note
    };

    try {
        await _apiRequest('/api/logs', 'POST', payload);
        showMsg(`log-msg-${hId}`, '✓ Saved to History', 'ok');
        syncData(); // Refresh history list immediately
    } catch (err) {
        showMsg(`log-msg-${hId}`, 'Error: ' + err.message, 'err');
    }
}

/* ═══════════════════════════════════════
   FIX: SURVEY SUBMISSION & AI TIPS
   ═══════════════════════════════════════ */
async function submitCheckIn() {
    // 1. Generate the AI Recommendations based on answers
    const fb = buildFeedback(); 
    const score = sleepScore();
    
    // 2. Prepare the result for the database
    // We save this as a "Log" so it appears in your MySQL history
    const payload = {
        habitName: 'Daily Check-in',
        habitIcon: '📝',
        date: new Date().toISOString().split('T')[0],
        duration: 0, 
        unit: 'score',
        displayUnit: `Score: ${score}/50`,
        startTime: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        endTime: '',
        note: `AI Tip: ${fb.areaOfImprovement}`
    };

    try {
        // Save to MySQL
        await _apiRequest('/api/logs', 'POST', payload);
        
        // 3. Update UI to show the "Results" screen
        const resultsDiv = document.getElementById('results');
        resultsDiv.style.display = 'block';
        document.getElementById('tracker-form').style.display = 'none';
        
        // Render the "Tips Just For You" cards
        renderAIFeedback(resultsDiv, fb);
        
        // Refresh background data
        syncData();
        window.scrollTo(0, 0);
    } catch (err) {
        alert("Failed to save check-in: " + err.message);
    }
}

/* ═══════════════════════════════════════
   UI RENDERING: THE "TIPS" COMPONENT
   ═══════════════════════════════════════ */
function renderAIFeedback(container, fb) {
    const actionsHtml = fb.actions.map(a => `<div class="ai-action">🎯 ${a}</div>`).join('');
    
    container.innerHTML = `
        <div class="ai-feedback-card">
            <h3 class="ai-header">✨ Your Personal Recommendations</h3>
            
            <div class="ai-section good">
                <strong>✅ What's going well:</strong>
                <p>${fb.whatsGoingWell}</p>
            </div>
            
            <div class="ai-section improvement">
                <strong>⚠️ Focus Area:</strong>
                <p>${fb.areaOfImprovement}</p>
            </div>

            <div class="ai-section steps">
                <strong>🚀 Recommended Steps:</strong>
                ${actionsHtml}
            </div>

            <button class="restart-btn" onclick="restartForm()">Start New Check-in</button>
        </div>
    `;
}

// #Kenchosum333#