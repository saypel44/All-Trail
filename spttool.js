/* ═══════════════════════════════════════════════════════════
   spttool.js  –  Quick Tracker frontend
   All data is stored on the server (no localStorage).
   Token is kept only in memory (sessionToken variable).
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── API base URL ─────────────────────────────────────────
const API = 'http://localhost:3000';

// ── In-memory session (replaces localStorage) ────────────
let sessionToken    = null;   // Bearer token from /api/login or /api/signup
let sessionUsername = null;
let sessionName     = null;

// ── In-memory data cache ──────────────────────────────────
let logs   = [];   // fetched from GET /api/logs
let alarms = [];   // fetched from GET /api/alarms

// ── Schedules are UI-only (not yet a separate API table) ──
// We store them in a plain JS array that persists while the
// page is open.  When the server grows a /api/schedules
// endpoint you can swap this out for fetch() calls.
let schedules = [];

// ── Stopwatch state ───────────────────────────────────────
let swInterval  = null;
let swStartedAt = null;   // Date when last started
let swElapsed   = 0;      // ms accumulated before last pause
let swRunning   = false;
let swStoppedMs = 0;      // ms when stopped (for logging)

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sessionToken}`
  };
}

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(API + path, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    return data;
  } catch (err) {
    throw err;
  }
}

function showMsg(id, text, isError = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--danger, #e05252)' : 'var(--success, #1D9E75)';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════
//  AUTH SCREEN
// ═══════════════════════════════════════════════════════════

function switchTab(tab) {
  document.getElementById('tab-login').style.display  = tab === 'login'  ? '' : 'none';
  document.getElementById('tab-signup').style.display = tab === 'signup' ? '' : 'none';
  document.querySelectorAll('.auth-tab').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0) === (tab === 'login'));
  });
}

async function doLogin() {
  const username = document.getElementById('li-user').value.trim();
  const password = document.getElementById('li-pass').value;
  if (!username || !password) return showMsg('li-msg', 'Please fill in all fields.');
  try {
    const data = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    startSession(data);
  } catch (err) {
    showMsg('li-msg', err.message);
  }
}

async function doSignup() {
  const name     = document.getElementById('su-name').value.trim();
  const username = document.getElementById('su-user').value.trim();
  const password = document.getElementById('su-pass').value;
  if (!name || !username || !password) return showMsg('su-msg', 'Please fill in all fields.');
  try {
    const data = await apiFetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password })
    });
    startSession(data);
  } catch (err) {
    showMsg('su-msg', err.message);
  }
}

async function doLogout() {
  try {
    await apiFetch('/api/logout', {
      method: 'POST',
      headers: authHeaders()
    });
  } catch (_) {}
  sessionToken    = null;
  sessionUsername = null;
  sessionName     = null;
  logs   = [];
  alarms = [];
  schedules = [];
  closeSettings();
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

async function doResetPassword() {
  const username    = document.getElementById('fp-user').value.trim();
  const newPass     = document.getElementById('fp-new-pass').value;
  const confirmPass = document.getElementById('fp-confirm-pass').value;
  if (!username || !newPass || !confirmPass)
    return showMsg('fp-msg', 'Please fill in all fields.');
  if (newPass !== confirmPass)
    return showMsg('fp-msg', 'Passwords do not match.');
  if (newPass.length < 6)
    return showMsg('fp-msg', 'Password must be at least 6 characters.');
  try {
    await apiFetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, newPassword: newPass })
    });
    showMsg('fp-msg', '✅ Password reset! You can now sign in.', false);
  } catch (err) {
    showMsg('fp-msg', err.message);
  }
}

function toggleForgotPanel() {
  const panel = document.getElementById('forgot-panel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈'; }
  else                           { input.type = 'password'; btn.textContent = '👁';  }
}

// ── Start an authenticated session ───────────────────────
async function startSession(data) {
  sessionToken    = data.token;
  sessionUsername = data.username;
  sessionName     = data.name;

  // Populate header
  document.getElementById('hdr-name').textContent    = data.name;
  document.getElementById('greeting-name').textContent = data.name.split(' ')[0];
  const initials = data.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('hdr-avatar').textContent  = initials;

  // Fetch server data
  await refreshLogs();
  await refreshAlarms();

  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  showTab('check-in');
}

// ═══════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════

function openSettings() {
  document.getElementById('st-display-name').textContent = sessionName     || '';
  document.getElementById('st-display-user').textContent = '@' + (sessionUsername || '');
  const initials = (sessionName || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('st-avatar').textContent = initials;
  document.getElementById('st-name').value   = sessionName     || '';
  document.getElementById('st-userid').value = sessionUsername || '';
  document.getElementById('st-cur-pass').value = '';
  document.getElementById('settings-modal').style.display = '';
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function settingsOverlayClick(e) {
  if (e.target === document.getElementById('settings-modal')) closeSettings();
}

function stCopyPassword() {
  const el = document.getElementById('st-cur-pass');
  if (el && el.value) navigator.clipboard.writeText(el.value).catch(() => {});
}

async function saveSettings() {
  const name     = document.getElementById('st-name').value.trim();
  const username = document.getElementById('st-userid').value.trim();
  if (!name || !username) return showMsg('st-msg', 'Name and User ID cannot be empty.');
  try {
    await apiFetch('/api/update-profile', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, username })
    });
    sessionName     = name;
    sessionUsername = username;
    document.getElementById('hdr-name').textContent = name;
    document.getElementById('greeting-name').textContent = name.split(' ')[0];
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('hdr-avatar').textContent  = initials;
    showMsg('st-msg', '✅ Settings saved!', false);
  } catch (err) {
    // Endpoint may not be implemented yet — update in-memory only
    sessionName     = name;
    sessionUsername = username;
    document.getElementById('hdr-name').textContent = name;
    document.getElementById('greeting-name').textContent = name.split(' ')[0];
    showMsg('st-msg', '✅ Updated (local only — add /api/update-profile to server for persistence).', false);
  }
}

// ═══════════════════════════════════════════════════════════
//  NAV TABS
// ═══════════════════════════════════════════════════════════

function showTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const pane = document.getElementById('tab-' + tabId);
  if (pane) pane.classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b => {
    if (b.textContent.toLowerCase().includes(tabId.replace('-', ' '))) b.classList.add('active');
  });
  if (tabId === 'history') renderHistory();
  if (tabId === 'trends')  renderTrends();
  if (tabId === 'tracker') renderSchedules();
}

// ═══════════════════════════════════════════════════════════
//  CHECK-IN / QUESTIONNAIRE
// ═══════════════════════════════════════════════════════════

const TOTAL_Q = 12;
let answers = {};

document.addEventListener('DOMContentLoaded', () => {
  // Option buttons
  document.querySelectorAll('.opts').forEach(group => {
    group.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.opt').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        answers[group.dataset.q] = btn.dataset.v;
        updateProgress();
      });
    });
  });

  // Likert rows (questions 8-12)
  buildLikert();

  // Date inputs default to today
  const scDate = document.getElementById('sc-date');
  if (scDate) scDate.value = today();
});

function buildLikert() {
  const stmts = [
    { id: 'energy',  text: 'I feel energetic during the day.' },
    { id: 'focus',   text: 'I can concentrate on tasks easily.' },
    { id: 'mood',    text: 'I feel emotionally balanced.' },
    { id: 'stress',  text: 'I manage stress well.' },
    { id: 'overall', text: 'Overall, I am satisfied with my wellbeing.' },
  ];
  const container = document.getElementById('lik-container');
  if (!container) return;
  container.innerHTML = '';
  stmts.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'lik-row-item';
    row.innerHTML = `
      <div class="lik-stmt">${idx + 8}. ${s.text}</div>
      <div class="lik-scale" data-q="${s.id}">
        ${[1,2,3,4,5].map(v => `<button type="button" class="lik-btn" data-v="${v}">${v}</button>`).join('')}
        <span class="lik-labels"><span>Disagree</span><span>Agree</span></span>
      </div>`;
    container.appendChild(row);
    row.querySelectorAll('.lik-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        row.querySelectorAll('.lik-btn').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        answers[s.id] = parseInt(btn.dataset.v);
        updateProgress();
      });
    });
  });
}

function updateProgress() {
  const required = ['age','location','worktype','workhours','sleep','phonetime','bedtime','energy','focus','mood','stress','overall'];
  const done = required.filter(k => answers[k] !== undefined).length;
  const pct  = Math.round((done / TOTAL_Q) * 100);
  const bar  = document.getElementById('prog-bar');
  const txt  = document.getElementById('prog-txt');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = `${done} of ${TOTAL_Q}`;
  const btn = document.getElementById('submit-btn');
  if (btn) btn.disabled = done < TOTAL_Q;
}

function showResults() {
  const out = document.getElementById('results');
  if (!out) return;
  // Simple scoring
  const sleepScore   = { '7–8 hours': 5, '9 or more hours': 4, '5–6 hours': 3, '0–4 hours': 1 }[answers.sleep]   || 3;
  const phoneScore   = { 'no phone before bed': 5, '30 min–1 hour': 4, '1–2 hours': 3, '2–3 hours': 2, 'more than 3 hours': 1 }[answers.phonetime] || 3;
  const likAvg = ((answers.energy||3)+(answers.focus||3)+(answers.mood||3)+(answers.stress||3)+(answers.overall||3)) / 5;
  const total  = ((sleepScore + phoneScore) / 2 + likAvg) / 2;

  const label = total >= 4.5 ? '🟢 Excellent' : total >= 3.5 ? '🟡 Good' : total >= 2.5 ? '🟠 Fair' : '🔴 Needs attention';
  const tips  = [];
  if (sleepScore < 4)  tips.push('💤 Aim for 7–8 hours of sleep each night.');
  if (phoneScore < 4)  tips.push('📵 Reduce screen time before bed to improve sleep quality.');
  if ((answers.energy||3) < 3) tips.push('⚡ Consider short movement breaks throughout your day.');
  if ((answers.stress||3) < 3) tips.push('🧘 Try a short meditation or breathing exercise daily.');
  if (!tips.length) tips.push('✅ Keep up the great habits!');

  out.innerHTML = `
    <div class="result-card">
      <div class="result-score">${label}</div>
      <div class="result-score-sub">Wellness score: ${total.toFixed(1)} / 5</div>
      <div class="result-tips">
        <div class="result-tips-title">Personalised suggestions</div>
        ${tips.map(t => `<div class="result-tip">${t}</div>`).join('')}
      </div>
    </div>`;
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════════
//  LOGS  (server ↔ cache)
// ═══════════════════════════════════════════════════════════

async function refreshLogs() {
  try {
    logs = await apiFetch('/api/logs', { headers: authHeaders() });
  } catch (err) {
    console.error('Could not load logs:', err.message);
    logs = [];
  }
}

async function saveLog(logObj) {
  const saved = await apiFetch('/api/logs', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(logObj)
  });
  await refreshLogs();
  return saved;
}

async function deleteLog(id) {
  await apiFetch(`/api/logs/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  await refreshLogs();
}

// ═══════════════════════════════════════════════════════════
//  ALARMS  (server ↔ cache)
// ═══════════════════════════════════════════════════════════

async function refreshAlarms() {
  try {
    alarms = await apiFetch('/api/alarms', { headers: authHeaders() });
    startAlarmChecker();
  } catch (err) {
    console.error('Could not load alarms:', err.message);
    alarms = [];
  }
}

async function saveAddAlarm() {
  const fromTime = buildTime('aa-from-h', 'aa-from-m', 'aa-from-am', 'aa-from-pm');
  const toTime   = buildTime('aa-to-h',   'aa-to-m',   'aa-to-am',   'aa-to-pm');
  const catBtn   = document.querySelector('#aa-categories .aa-cat-btn.sel');
  const custom   = document.getElementById('aa-custom-activity')?.value.trim();
  const category = custom || (catBtn ? catBtn.dataset.cat : null);
  const soundBtn = document.querySelector('#aa-sounds .sound-btn.sel');
  const sound    = soundBtn ? soundBtn.dataset.sound : 'bell';

  if (!fromTime || !toTime) return showMsg('aa-msg', 'Please set the alarm time.');
  try {
    await apiFetch('/api/alarms', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ from_time: fromTime, to_time: toTime, category, sound, date: today() })
    });
    await refreshAlarms();
    showMsg('aa-msg', '✅ Alarm saved!', false);
    setTimeout(closeAddAlarmModal, 800);
  } catch (err) {
    showMsg('aa-msg', err.message);
  }
}

async function deleteAlarm(id) {
  await apiFetch(`/api/alarms/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  await refreshAlarms();
  renderSchedules();
}

// ── Alarm checker ─────────────────────────────────────────
let alarmCheckerInterval = null;
const firedAlarms = new Set();

function startAlarmChecker() {
  if (alarmCheckerInterval) clearInterval(alarmCheckerInterval);
  alarmCheckerInterval = setInterval(checkAlarms, 30000);
  checkAlarms();
}

function checkAlarms() {
  const now = new Date();
  const hm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  alarms.forEach(alarm => {
    if (firedAlarms.has(alarm.id)) return;
    const t = (alarm.from_time || '').slice(0, 5);
    if (t === hm) {
      firedAlarms.add(alarm.id);
      triggerAlarmModal(alarm);
    }
  });
}

function triggerAlarmModal(alarm) {
  document.getElementById('alarm-modal-title').textContent = alarm.category ? `Time for: ${alarm.category}` : 'Time to log!';
  document.getElementById('alarm-modal-sub').textContent   = `${alarm.from_time} → ${alarm.to_time}`;
  document.getElementById('alarm-modal').style.display     = '';
  playAlarmSound(alarm.sound);
}

function dismissAlarm() { document.getElementById('alarm-modal').style.display = 'none'; }
function goLogFromAlarm() { dismissAlarm(); showTab('tracker'); openScheduleModal(); }

// Simple web-audio alarm tones
function playAlarmSound(sound) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = sound === 'chime' ? 880 : sound === 'nature' ? 440 : sound === 'soft' ? 528 : 660;
    osc.type = sound === 'soft' ? 'sine' : 'triangle';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.start(); osc.stop(ctx.currentTime + 1.5);
  } catch (_) {}
}

// ── Upload custom sound (stored in memory) ────────────────
let customSoundUrl = null;
function aaUploadSound(input) {
  const file = input.files[0];
  if (!file) return;
  customSoundUrl = URL.createObjectURL(file);
  const btn = document.querySelector('.upload-sound-btn');
  if (btn) btn.textContent = '✅ ' + file.name.slice(0, 14);
}

// ═══════════════════════════════════════════════════════════
//  ALARM MODAL UI
// ═══════════════════════════════════════════════════════════

function openAddAlarmModal() {
  document.getElementById('add-alarm-modal').style.display = '';
}
function closeAddAlarmModal() {
  document.getElementById('add-alarm-modal').style.display = 'none';
  showMsg('aa-msg', '');
}

function aaSetAmPm(which, val) {
  const amId = `aa-${which}-am`, pmId = `aa-${which}-pm`;
  document.getElementById(amId)?.classList.toggle('sel', val === 'AM');
  document.getElementById(pmId)?.classList.toggle('sel', val === 'PM');
  updateDuration('aa');
}

function aaSelectCat(btn) {
  document.querySelectorAll('#aa-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  const inp = document.getElementById('aa-custom-activity');
  if (inp) inp.value = '';
}
function aaClearCatIfTyping() {
  document.querySelectorAll('#aa-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
}
function aaSelectSound(btn) {
  document.querySelectorAll('#aa-sounds .sound-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
}

// ═══════════════════════════════════════════════════════════
//  SCHEDULE MODAL UI
// ═══════════════════════════════════════════════════════════

let editingScheduleIdx = null;

function openScheduleModal(idx = null) {
  editingScheduleIdx = idx;
  const title = document.getElementById('schedule-modal-title');
  if (title) title.textContent = idx !== null ? '✏️ Edit Schedule' : '📅 Add Schedule';
  // Reset fields
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  const custInp = document.getElementById('sc-custom-activity');
  if (custInp) custInp.value = '';
  document.getElementById('sc-date').value = today();
  const checklist = document.getElementById('sc-checklist');
  if (checklist) checklist.innerHTML = '';
  // Pre-fill if editing
  if (idx !== null && schedules[idx]) {
    const s = schedules[idx];
    if (custInp) custInp.value = s.activity || '';
    if (document.getElementById('sc-date')) document.getElementById('sc-date').value = s.date || today();
    // Re-render tasks
    (s.tasks || []).forEach(t => addTaskToChecklist(t.text, t.done));
  }
  document.getElementById('schedule-modal').style.display = '';
}

function closeScheduleModal() {
  document.getElementById('schedule-modal').style.display = 'none';
  showMsg('sc-msg', '');
}

function scSelectCat(btn) {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  const inp = document.getElementById('sc-custom-activity');
  if (inp) inp.value = '';
  updateDuration('sc');
}
function scClearCatIfTyping() {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
}
function scSetAmPm(which, val) {
  const amId = `sc-${which}-am`, pmId = `sc-${which}-pm`;
  document.getElementById(amId)?.classList.toggle('sel', val === 'AM');
  document.getElementById(pmId)?.classList.toggle('sel', val === 'PM');
  updateDuration('sc');
}

// ── Tasks checklist ───────────────────────────────────────
function scAddTask() {
  const inp = document.getElementById('sc-task-input');
  const text = inp?.value.trim();
  if (!text) return;
  addTaskToChecklist(text, false);
  inp.value = '';
}
function scHandleTaskKey(e) { if (e.key === 'Enter') scAddTask(); }
function scQuickAdd(btn) { addTaskToChecklist(btn.textContent, false); }

function addTaskToChecklist(text, done = false) {
  const list = document.getElementById('sc-checklist');
  if (!list) return;
  const item = document.createElement('div');
  item.className = 'sc-task-item';
  item.innerHTML = `
    <input type="checkbox" class="sc-task-check" ${done ? 'checked' : ''}>
    <span class="sc-task-text">${text}</span>
    <button type="button" class="sc-task-del" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(item);
}

function getChecklistTasks() {
  return [...document.querySelectorAll('#sc-checklist .sc-task-item')].map(item => ({
    text: item.querySelector('.sc-task-text')?.textContent || '',
    done: item.querySelector('.sc-task-check')?.checked || false
  }));
}

// ── Save schedule ─────────────────────────────────────────
async function saveSchedule() {
  const catBtn   = document.querySelector('#sc-categories .aa-cat-btn.sel');
  const custInp  = document.getElementById('sc-custom-activity');
  const activity = (custInp?.value.trim()) || (catBtn ? catBtn.dataset.cat : '');
  const date     = document.getElementById('sc-date')?.value || today();
  const fromTime = buildTime('sc-from-h', 'sc-from-m', 'sc-from-am', 'sc-from-pm');
  const toTime   = buildTime('sc-to-h',   'sc-to-m',   'sc-to-am',   'sc-to-pm');
  const soundBtn = document.querySelector('#aa-sounds .sound-btn.sel');
  const sound    = soundBtn ? soundBtn.dataset.sound : 'bell';
  const tasks    = getChecklistTasks();

  if (!activity) return showMsg('sc-msg', 'Please choose or type an activity.');

  const schedule = { activity, date, fromTime, toTime, sound, tasks, id: Date.now() };

  // Also save as an alarm on the server so it shows up in alarm checker
  try {
    await apiFetch('/api/alarms', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ from_time: fromTime || '', to_time: toTime || '', category: activity, sound, date })
    });
    await refreshAlarms();
  } catch (err) {
    console.warn('Could not save alarm for schedule:', err.message);
  }

  if (editingScheduleIdx !== null) {
    schedules[editingScheduleIdx] = schedule;
  } else {
    schedules.push(schedule);
  }

  showMsg('sc-msg', '✅ Schedule saved!', false);
  setTimeout(() => { closeScheduleModal(); renderSchedules(); }, 700);
}

// ── Render schedules list ─────────────────────────────────
function renderSchedules() {
  const list    = document.getElementById('tracker-schedule-list');
  const wrap    = document.getElementById('tracker-schedules-wrap');
  const empty   = document.getElementById('tracker-empty-state');
  if (!list) return;

  if (!schedules.length) {
    if (wrap)  wrap.style.display  = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  if (wrap)  wrap.style.display  = '';
  if (empty) empty.style.display = 'none';

  list.innerHTML = schedules.map((s, i) => `
    <div class="tracker-schedule-card">
      <div class="tsc-top">
        <div class="tsc-activity">${s.activity || '—'}</div>
        <div class="tsc-actions">
          <button class="tsc-btn" onclick="openScheduleModal(${i})">✏️ Edit</button>
          <button class="tsc-btn del" onclick="removeSchedule(${i})">🗑</button>
        </div>
      </div>
      <div class="tsc-meta">
        📅 ${fmtDate(s.date)}
        ${s.fromTime ? `&nbsp;·&nbsp; ⏰ ${s.fromTime}` : ''}
        ${s.toTime   ? ` → ${s.toTime}` : ''}
      </div>
      ${s.tasks && s.tasks.length ? `
        <div class="tsc-tasks">
          ${s.tasks.map(t => `<div class="tsc-task ${t.done ? 'done' : ''}">
            ${t.done ? '✅' : '☐'} ${t.text}
          </div>`).join('')}
        </div>` : ''}
    </div>`).join('');
}

function removeSchedule(idx) {
  schedules.splice(idx, 1);
  renderSchedules();
}

// ═══════════════════════════════════════════════════════════
//  STOPWATCH
// ═══════════════════════════════════════════════════════════

function swStartStop() {
  if (swRunning) {
    // Pause
    swElapsed += Date.now() - swStartedAt;
    clearInterval(swInterval);
    swRunning = false;
    document.getElementById('sw-start-btn').textContent = '▶ Resume';
    document.getElementById('sw-stop-btn').disabled  = false;
    document.getElementById('sw-reset-btn').disabled = false;
  } else {
    // Start / Resume
    swStartedAt = Date.now();
    swRunning   = true;
    document.getElementById('sw-start-btn').textContent = '⏸ Pause';
    document.getElementById('sw-stop-btn').disabled  = false;
    document.getElementById('sw-reset-btn').disabled = true;
    swInterval = setInterval(swTick, 500);
  }
}

function swTick() {
  const ms    = swElapsed + (Date.now() - swStartedAt);
  const secs  = Math.floor(ms / 1000);
  const h     = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m     = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s     = String(secs % 60).padStart(2, '0');
  document.getElementById('sw-display').textContent = `${h}:${m}:${s}`;
}

function swStop() {
  if (!swRunning && swElapsed === 0) return;
  if (swRunning) {
    swElapsed += Date.now() - swStartedAt;
    clearInterval(swInterval);
    swRunning = false;
  }
  swStoppedMs = swElapsed;
  document.getElementById('sw-start-btn').textContent = '▶ Start';
  document.getElementById('sw-stop-btn').disabled  = true;
  document.getElementById('sw-reset-btn').disabled = false;
  // Show log section
  const logSec = document.getElementById('sw-log-section');
  if (logSec) logSec.style.display = '';
}

function swReset() {
  clearInterval(swInterval);
  swRunning   = false;
  swElapsed   = 0;
  swStoppedMs = 0;
  swStartedAt = null;
  document.getElementById('sw-display').textContent = '00:00:00';
  document.getElementById('sw-start-btn').textContent = '▶ Start';
  document.getElementById('sw-stop-btn').disabled  = true;
  document.getElementById('sw-reset-btn').disabled = true;
  const logSec = document.getElementById('sw-log-section');
  if (logSec) logSec.style.display = 'none';
}

function swSelectCat(btn) {
  document.querySelectorAll('#sw-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
}

async function swLogTime() {
  const catBtn   = document.querySelector('#sw-categories .aa-cat-btn.sel');
  const custInp  = document.getElementById('sc-custom-activity');
  const activity = (custInp?.value.trim()) || (catBtn ? catBtn.dataset.cat : '');
  if (!activity) return showMsg('sw-log-msg', 'Please choose an activity first.');

  const totalSecs = Math.floor(swStoppedMs / 1000);
  const hrs       = +(totalSecs / 3600).toFixed(2);
  const mins      = Math.floor(totalSecs / 60);

  try {
    await saveLog({
      habitId:     activity.toLowerCase().replace(/\s+/g, '_'),
      habitName:   activity,
      habitIcon:   '⏱',
      date:        today(),
      duration:    hrs,
      unit:        'hrs',
      displayUnit: `${mins} min`,
      note:        `Stopwatch session`
    });
    showMsg('sw-log-msg', `✅ Logged ${mins} min of ${activity}!`, false);
    setTimeout(swReset, 1200);
  } catch (err) {
    showMsg('sw-log-msg', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  HISTORY TAB
// ═══════════════════════════════════════════════════════════

function renderHistory() {
  const content = document.getElementById('history-content');
  const filter  = document.getElementById('history-filter');
  if (!content) return;

  if (!logs.length) {
    content.innerHTML = '<p class="tracker-page-sub" style="text-align:center;padding:32px 0">No history yet. Use the Stopwatch or Schedules to log activities.</p>';
    if (filter) filter.innerHTML = '';
    return;
  }

  // Build filter chips from unique habit names
  const habits = [...new Set(logs.map(l => l.habitName).filter(Boolean))];
  let activeFilter = filter?.querySelector('.hf-chip.sel')?.dataset.h || null;

  if (filter) {
    filter.innerHTML = `
      <button class="hf-chip ${!activeFilter ? 'sel' : ''}" data-h="" onclick="setHistoryFilter(this,'')">All</button>
      ${habits.map(h => `<button class="hf-chip ${activeFilter===h?'sel':''}" data-h="${h}" onclick="setHistoryFilter(this,'${h}')">${h}</button>`).join('')}`;
  }

  const shown = activeFilter ? logs.filter(l => l.habitName === activeFilter) : logs;

  // Group by date
  const byDate = {};
  shown.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });

  content.innerHTML = Object.entries(byDate).map(([date, entries]) => `
    <div class="hist-day">
      <div class="hist-day-label">${fmtDate(date)}</div>
      ${entries.map(e => `
        <div class="hist-entry">
          <span class="hist-icon">${e.habitIcon || '📋'}</span>
          <div class="hist-info">
            <div class="hist-name">${e.habitName}</div>
            ${e.duration ? `<div class="hist-dur">${e.displayUnit || e.duration + ' ' + (e.unit||'hrs')}</div>` : ''}
            ${e.note ? `<div class="hist-note">${e.note}</div>` : ''}
          </div>
          <button class="hist-del" onclick="confirmDeleteLog(${e.id})">🗑</button>
        </div>`).join('')}
    </div>`).join('');
}

function setHistoryFilter(btn, habit) {
  document.querySelectorAll('#history-filter .hf-chip').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  renderHistory();
}

async function confirmDeleteLog(id) {
  if (!confirm('Delete this log entry?')) return;
  try {
    await deleteLog(id);
    renderHistory();
    renderTrends();
  } catch (err) {
    alert(err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  TRENDS TAB
// ═══════════════════════════════════════════════════════════

function renderTrends() {
  const content = document.getElementById('trends-content');
  if (!content) return;

  if (!logs.length) {
    content.innerHTML = '<p class="tracker-page-sub" style="text-align:center;padding:32px 0">No data yet. Start logging habits to see trends.</p>';
    return;
  }

  // Build per-habit trend charts
  const byHabit = {};
  logs.forEach(l => {
    if (!byHabit[l.habitName]) byHabit[l.habitName] = [];
    byHabit[l.habitName].push(l);
  });

  content.innerHTML = Object.entries(byHabit).map(([name, entries]) => {
    const sorted = [...entries].sort((a,b) => a.date.localeCompare(b.date));
    const labels = sorted.map(e => e.date.slice(5));      // MM-DD
    const data   = sorted.map(e => +(e.duration || 0));
    const total  = data.reduce((s,v) => s+v, 0);
    const avg    = total / data.length;
    const canvasId = 'chart-' + name.replace(/\s+/g,'_');
    return `
      <div class="trend-card">
        <div class="trend-card-header">
          <span>${entries[0]?.habitIcon || '📋'} ${name}</span>
          <span class="trend-meta">${entries.length} sessions · avg ${avg.toFixed(1)} hrs</span>
        </div>
        <div class="trend-chart-wrap" style="height:160px">
          <canvas id="${canvasId}"></canvas>
        </div>
      </div>`;
  }).join('');

  // Render charts (relies on inline Chart.js-compatible renderer in spttool.html)
  Object.entries(byHabit).forEach(([name, entries]) => {
    const sorted = [...entries].sort((a,b) => a.date.localeCompare(b.date));
    const canvasId = 'chart-' + name.replace(/\s+/g,'_');
    const canvas   = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    new Chart(canvas, {
      type: 'line',
      data: {
        labels:   sorted.map(e => e.date.slice(5)),
        datasets: [{
          label:           name,
          data:            sorted.map(e => +(e.duration || 0)),
          borderColor:     '#1D9E75',
          backgroundColor: '#1D9E7522',
          fill:            true,
          pointRadius:     4,
        }]
      },
      options: {
        scales: { y: { min: 0, ticks: { maxTicksLimit: 5, callback: v => v + 'h' } } },
        plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(1)} hrs` } } }
      }
    });
  });
}

// ── Export ────────────────────────────────────────────────
function exportCSV() {
  if (!logs.length) return alert('No data to export yet.');
  const header = 'Date,Activity,Duration (hrs),Unit,Start,End,Note';
  const rows   = logs.map(l =>
    [l.date, l.habitName, l.duration||'', l.unit||'', l.startTime||'', l.endTime||'', (l.note||'').replace(/,/g,' ')].join(',')
  );
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `quick-tracker-${today()}.csv`;
  a.click();
}

function exportExcel() {
  // Simple TSV download that Excel opens natively
  if (!logs.length) return alert('No data to export yet.');
  const header = 'Date\tActivity\tDuration (hrs)\tUnit\tStart\tEnd\tNote';
  const rows   = logs.map(l =>
    [l.date, l.habitName, l.duration||'', l.unit||'', l.startTime||'', l.endTime||'', l.note||''].join('\t')
  );
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `quick-tracker-${today()}.xls`;
  a.click();
}

// ═══════════════════════════════════════════════════════════
//  UTILITY – time helpers
// ═══════════════════════════════════════════════════════════

function buildTime(hId, mId, amId, pmId) {
  const hEl = document.getElementById(hId);
  const mEl = document.getElementById(mId);
  if (!hEl || !mEl) return null;
  let h = parseInt(hEl.value);
  const m  = String(mEl.value).padStart(2, '0');
  const pm = document.getElementById(pmId)?.classList.contains('sel');
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${m}`;
}

function updateDuration(prefix) {
  const from = buildTime(`${prefix}-from-h`, `${prefix}-from-m`, `${prefix}-from-am`, `${prefix}-from-pm`);
  const to   = buildTime(`${prefix}-to-h`,   `${prefix}-to-m`,   `${prefix}-to-am`,   `${prefix}-to-pm`);
  const disp = document.getElementById(`${prefix}-duration-display`);
  if (!disp || !from || !to) return;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let diff = (th * 60 + tm) - (fh * 60 + fm);
  if (diff < 0) diff += 1440;
  const hours = Math.floor(diff / 60), mins = diff % 60;
  disp.textContent = `Total Duration: ${hours ? hours + 'h ' : ''}${mins}min`;
}

// Hook duration updates to time selectors
document.addEventListener('DOMContentLoaded', () => {
  ['sc-from-h','sc-from-m','sc-to-h','sc-to-m'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => updateDuration('sc'));
  });
  ['aa-from-h','aa-from-m','aa-to-h','aa-to-m'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => updateDuration('aa'));
  });
});