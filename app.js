/* ═══════════════════════════════════════
   STATE  –  persisted via localStorage
═══════════════════════════════════════ */
let currentUser = null;
let currentAlarmHabit = null;

/* ── Storage helpers ── */
function _loadUsers() {
  try { return JSON.parse(localStorage.getItem('qt_users') || '{}'); } catch(e) { return {}; }
}
function _saveUsers(u) {
  localStorage.setItem('qt_users', JSON.stringify(u));
}

/* getUserData: always returns the live in-memory object for the current user.
   On first call per session it hydrates from localStorage.
   saveUserData() writes it back — call it after every mutation. */
let _currentData = null;

function getUserData() {
  if (!currentUser) return null;
  if (!_currentData) {
    try {
      _currentData = JSON.parse(localStorage.getItem('qt_data_' + currentUser.username) || 'null');
    } catch(e) { _currentData = null; }
    if (!_currentData) {
      _currentData = { logs:[], alarms:{}, habitEnabled:{}, selectedSounds:{}, customSounds:{}, checkInHistory:[] };
    }
  }
  return _currentData;
}

function saveUserData() {
  if (!currentUser || !_currentData) return;
  localStorage.setItem('qt_data_' + currentUser.username, JSON.stringify(_currentData));
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
function switchTab(t) {
  document.getElementById('tab-login').style.display  = t === 'login' ? '' : 'none';
  document.getElementById('tab-signup').style.display = t === 'signup' ? '' : 'none';
  document.querySelectorAll('.auth-tab').forEach((el,i) => {
    el.classList.toggle('active', (i===0 && t==='login') || (i===1 && t==='signup'));
  });
  clearAuthMsgs();
}
function clearAuthMsgs() {
  ['li-msg','su-msg'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'auth-msg';
    el.textContent = '';
  });
}
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'auth-msg ' + type;
}
function togglePw(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}
function doSignup() {
  const name = document.getElementById('su-name').value.trim();
  const user = document.getElementById('su-user').value.trim().toLowerCase();
  const pass = document.getElementById('su-pass').value;
  if (!name || !user || !pass) return showMsg('su-msg', 'Please fill in all fields.', 'err');
  if (user.length < 3) return showMsg('su-msg', 'Username must be at least 3 characters.', 'err');
  if (pass.length < 6) return showMsg('su-msg', 'Password must be at least 6 characters.', 'err');
  const users = _loadUsers();
  if (users[user]) return showMsg('su-msg', 'That username is already taken.', 'err');
  users[user] = { name, pass, joinedAt: new Date().toISOString(), lastChanged: null };
  _saveUsers(users);
  showMsg('su-msg', 'Account created! Signing you in…', 'ok');
  setTimeout(() => launchApp({ username: user, name }), 900);
}
function doLogin() {
  const user = document.getElementById('li-user').value.trim().toLowerCase();
  const pass = document.getElementById('li-pass').value;
  if (!user || !pass) return showMsg('li-msg', 'Please enter your username and password.', 'err');
  const users = _loadUsers();
  if (!users[user] || users[user].pass !== pass) return showMsg('li-msg', 'Incorrect username or password.', 'err');
  launchApp({ username: user, name: users[user].name });
}
function launchApp(user) {
  currentUser = user;
  _currentData = null; // clear cache so getUserData() re-loads from storage fresh
  localStorage.setItem('qt_session', JSON.stringify({ username: user.username }));
  const firstName = user.name.split(' ')[0];
  document.getElementById('greeting-name').textContent = firstName;
  document.getElementById('hdr-avatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('hdr-name').textContent = user.name;
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  buildHabitCards();
  renderCalendar();
  renderTrends();
  renderHistory();
  startAlarmWatcher();
  window.scrollTo(0, 0);
}
function doLogout() {
  stopAlarmWatcher();
  saveUserData();
  localStorage.removeItem('qt_session');
  currentUser = null;
  _currentData = null;
  restartForm();
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
  clearAuthMsgs();
  document.getElementById('li-user').value = '';
  document.getElementById('li-pass').value = '';
  switchTab('login');
  window.scrollTo(0, 0);
}

// Wire up keyboard shortcuts and auto-login after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('li-user').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('li-pass').focus(); });
  document.getElementById('li-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  document.getElementById('su-pass').addEventListener('keydown', e => { if(e.key==='Enter') doSignup(); });

  // Auto-login: if a session was saved, skip the login screen
  try {
    const saved = localStorage.getItem('qt_session');
    if (saved) {
      const session = JSON.parse(saved);
      const users = _loadUsers();
      if (session.username && users[session.username]) {
        launchApp({ username: session.username, name: users[session.username].name });
      }
    }
  } catch(e) {}
});

/* ═══════════════════════════════════════
   NAV TABS
═══════════════════════════════════════ */
function showTab(t) {
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+t).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(b=>{
    if(b.textContent.toLowerCase().includes(t.replace('-',' '))||
       (t==='check-in'&&b.textContent.includes('Check'))||
       (t==='tracker'&&b.textContent.includes('Habit'))||
       (t==='history'&&b.textContent.includes('History'))||
       (t==='calendar'&&b.textContent.includes('Calendar'))||
       (t==='trends'&&b.textContent.includes('Trends'))) {
      b.classList.add('active');
    }
  });
  if(t==='trends') renderTrends();
  if(t==='calendar') renderCalendar();
  if(t==='history') renderHistory();
  if(t==='settings') renderSettings();
}

/* ═══════════════════════════════════════
   CHECK-IN LOGIC
═══════════════════════════════════════ */
const likertQs=[
  {id:'l1',text:'I can fall asleep easily.'},
  {id:'l2',text:'I sleep well most nights.'},
  {id:'l3',text:'I wake up feeling rested.'},
  {id:'l4',text:'I feel sleepy during the day.'},
  {id:'l5',text:'I have good energy during the day.'}
];
const likertOpts=['Yes, always','Most of the time','Sometimes','Not really','No, never'];
const answers={};
const lAnswers={};

// Build likert questions and wire up option clicks – run after DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const lc=document.getElementById('lik-container');
  likertQs.forEach((q,i)=>{
    const row=document.createElement('div');
    row.className='lik-item';
    row.innerHTML=`<span class="lik-label">Q${i+8}. ${q.text}</span><div class="lik-btns">${likertOpts.map(o=>`<button type="button" class="lbtn" data-lq="${q.id}" data-v="${o}">${o}</button>`).join('')}</div>`;
    lc.appendChild(row);
  });

  document.querySelectorAll('.opts').forEach(grp=>{
    grp.querySelectorAll('.opt').forEach(btn=>{
      btn.addEventListener('click',()=>{
        grp.querySelectorAll('.opt').forEach(b=>b.classList.remove('sel'));
        btn.classList.add('sel');
        answers[grp.dataset.q]=btn.dataset.v;
        updateProg();
      });
    });
  });
  document.querySelectorAll('.lbtn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll(`.lbtn[data-lq="${btn.dataset.lq}"]`).forEach(b=>b.classList.remove('sel'));
      btn.classList.add('sel');
      lAnswers[btn.dataset.lq]=btn.dataset.v;
      updateProg();
    });
  });
});

function updateProg() {
  const done=Object.keys(answers).length+Object.keys(lAnswers).length;
  const pct=Math.round((done/12)*100);
  document.getElementById('prog-bar').style.width=pct+'%';
  document.getElementById('prog-txt').textContent=`${done} of 12`;
  document.getElementById('submit-btn').disabled=(done<12);
}

function lScore(v) {
  return{'Yes, always':5,'Most of the time':4,'Sometimes':3,'Not really':2,'No, never':1}[v]||3;
}
function sleepScore() {
  const s={};
  likertQs.forEach(q=>{s[q.id]=lScore(lAnswers[q.id]);});
  return Math.round((((s.l1+s.l2+s.l3+s.l5)/4)+(6-s.l4))/2*10);
}
function phoneRisk() {
  return{'no phone before bed':0,'less than 30 minutes':1,'30 min–1 hour':2,'1–2 hours':3,'2–3 hours':4,'more than 3 hours':5}[answers.phonetime]||0;
}
function isLateNight(){return answers.bedtime==='after 12 AM'||answers.bedtime==='11 PM–12 AM';}

/* ── CONTRADICTION DETECTOR ── */
function detectContradictions() {
  const contra=[];
  const feelGoodAll=
    (lAnswers.l3==='Yes, always'||lAnswers.l3==='Most of the time')&&
    (lAnswers.l5==='Yes, always'||lAnswers.l5==='Most of the time')&&
    (lAnswers.l4==='Not really'||lAnswers.l4==='No, never')&&
    (lAnswers.l1==='Yes, always'||lAnswers.l1==='Most of the time');

  const overwork=answers.workhours==='9 or more hours';
  const longsleep=answers.sleep==='9 or more hours';
  const highPhone=answers.phonetime==='2–3 hours'||answers.phonetime==='more than 3 hours';
  const lateBed=answers.bedtime==='after 12 AM'||answers.bedtime==='11 PM–12 AM';

  if(feelGoodAll&&overwork) {
    contra.push({
      t:'🔮 You feel great — but your workload tells another story',
      b:[
        `<strong>What we see:</strong> You report feeling well-rested and energised — but you're also working ${answers.workhours} a day. That's a mismatch worth watching.`,
        `<strong>Why it matters:</strong> Sustained overwork builds cumulative stress that doesn't always show up immediately. Many people feel fine until they suddenly crash.`,
        `<strong>Watch for:</strong> Increased irritability, trouble unwinding, relying on coffee to get started. These are early signals. Even if you feel okay now, scheduling real rest days is protective.`
      ]
    });
  }
  if(feelGoodAll&&longsleep) {
    contra.push({
      t:'🔮 You feel energised — yet you sleep 9+ hours',
      b:[
        `<strong>What we see:</strong> You report high energy and good rest, but you sleep ${answers.sleep} every night.`,
        `<strong>Why it matters:</strong> Consistently sleeping 9+ hours when you feel fine can sometimes indicate hidden fatigue, blood sugar fluctuations, or low physical activity masking tiredness.`,
        `<strong>Try:</strong> Experiment with a 7–8 hour window for 2 weeks. If you feel equally good, your body was just over-sleeping. If you feel worse, your sleep need is genuinely higher — that's useful to know.`
      ]
    });
  }
  if(feelGoodAll&&highPhone) {
    contra.push({
      t:`🔮 You feel rested — but ${answers.phonetime} of screens before bed is risky`,
      b:[
        `<strong>What we see:</strong> You say you sleep well and feel rested, but you use your phone ${answers.phonetime} before sleeping.`,
        `<strong>Why it matters:</strong> Screen light suppresses melatonin even when you don't consciously notice it. You might be getting away with it now — but this habit gradually erodes sleep depth.`,
        `<strong>Try:</strong> One week with phone away 30 min before bed. Many people are surprised how much deeper they sleep once they stop. Your current "feeling good" could become "feeling great".`
      ]
    });
  }
  if(feelGoodAll&&lateBed) {
    contra.push({
      t:`🔮 Late bedtime + feeling fine — a fragile balance`,
      b:[
        `<strong>What we see:</strong> You go to bed ${answers.bedtime} and report feeling rested and energised.`,
        `<strong>Why it matters:</strong> Staying up late works for some people's natural chronotype. But combined with work pressures or phone use, the margin disappears quickly.`,
        `<strong>Keep monitoring:</strong> If your energy dips during seasons of higher stress, moving your bedtime 30–45 min earlier is the fastest fix.`
      ]
    });
  }
  return contra;
}

function showResults() {
  document.getElementById('tracker-form').style.display='none';
  const rd=document.getElementById('results');
  rd.style.display='block';
  window.scrollTo(0,0);

  const ud=getUserData();
  if(ud) {
    ud.checkInHistory.push({
      date:new Date().toISOString(),
      answers:{...answers},
      lAnswers:{...lAnswers},
      score:sleepScore()
    });
    saveUserData();
  }

  const sc=sleepScore();
  const pr=phoneRisk();
  const late=isLateNight();
  const overwork=answers.workhours==='9 or more hours';
  const sedentary=answers.worktype==='Sitting';
  const feelRested=lAnswers.l3==='Yes, always'||lAnswers.l3==='Most of the time';
  const poorRested=lAnswers.l3==='Not really'||lAnswers.l3==='No, never';
  const feelEnergetic=lAnswers.l5==='Yes, always'||lAnswers.l5==='Most of the time';
  const lowEnergy=lAnswers.l5==='Not really'||lAnswers.l5==='No, never';
  const daySleepy=lAnswers.l4==='Yes, always'||lAnswers.l4==='Most of the time';
  const hardToSleep=lAnswers.l1==='Not really'||lAnswers.l1==='No, never';
  const shortSleep=answers.sleep==='0–4 hours'||answers.sleep==='5–6 hours';
  const goodHours=answers.sleep==='7–8 hours'||answers.sleep==='9 or more hours';
  const outcomeGood=feelRested&&feelEnergetic&&!daySleepy;
  const outcomePoor=poorRested||lowEnergy||daySleepy;

  let intro='',emoji='✨';
  if(outcomeGood){intro="Your body is doing well — you feel rested and have good energy. Keep up what you're doing!";emoji='🌟';}
  else if(outcomePoor&&goodHours){intro=`You sleep ${answers.sleep} but still don't feel your best. Duration isn't everything — a consistent bedtime and less phone time before bed can help a lot.`;emoji='⚠️';}
  else if(outcomePoor&&shortSleep){intro=`You sleep ${answers.sleep} and your energy shows it. Small changes to your bedtime routine can make a big difference very quickly.`;emoji='💤';}
  else{intro='Some things are going well and some could improve. The tips below are based on how you actually feel.';emoji='🔍';}

  const recs=[];
  if(outcomeGood&&late) recs.push({l:'',t:'✅ You feel good — your routine is working',b:[`<strong>What's happening:</strong> You go to bed ${answers.bedtime} and your body has adapted — you feel rested and energised.`,`<strong>Why it works:</strong> A consistent bedtime, even a late one, beats an irregular schedule.`,`<strong>Keep doing:</strong> Same bedtime every day including weekends.`]});
  else if(outcomeGood) recs.push({l:'',t:'✅ Your habits are working — keep it up',b:[`<strong>What's happening:</strong> You wake up rested and have good energy.`,`<strong>Keep doing:</strong> Consistent bedtime every night, even weekends. Check in again in a few weeks.`]});
  if(outcomePoor&&goodHours) recs.push({l:'warn',t:'⚠️ Enough hours but still tired',b:[`<strong>What's happening:</strong> You sleep ${answers.sleep} but still wake up drained.`,`<strong>Why:</strong> Phone use, irregular timing, or stress reduce sleep quality even with enough hours.`,`<strong>Try:</strong> Phone away 30–60 min before bed. Same wake time every day. Darker, quieter room.`]});
  if(outcomePoor&&shortSleep) recs.push({l:'bad',t:'🔴 Not enough sleep — your body feels it',b:[`<strong>What's happening:</strong> You sleep ${answers.sleep} and feel tired and low on energy — directly linked.`,`<strong>Why:</strong> Your body needs 7–8 hours to rest and repair.`,`<strong>Try:</strong> Go to bed 15–20 min earlier this week. No caffeine after 2 pm. No phone in bed.`]});
  if(hardToSleep) recs.push({l:'warn',t:'⚠️ Hard to fall asleep',b:[`<strong>What's happening:</strong> Your mind stays active when you try to sleep.`,`<strong>Try:</strong> 30 minutes of calm before bed — no phone, dim lights, light reading. Same wake time every morning.`]});
  if(daySleepy) recs.push({l:(daySleepy&&poorRested)?'bad':'warn',t:(daySleepy&&poorRested)?'🔴 Very tired during the day':'⚠️ Sleepy during the day',b:[`<strong>What's happening:</strong> You feel sleepy through the day — your night sleep isn't fully refreshing you.`,`<strong>Try:</strong> Same wake time every day. A 10–20 min nap before 3 pm can help. No phone for the last 30 min before bed.`]});
  if(pr>=2&&outcomePoor) recs.push({l:'warn',t:'⚠️ Phone use before bed is hurting your sleep',b:[`<strong>What's happening:</strong> You use your phone ${answers.phonetime} before sleeping — these are connected.`,`<strong>Why:</strong> Screens signal your brain it's still daytime, reducing deep sleep.`,`<strong>Try:</strong> Phone away 30 min before bed. Replace with reading or gentle stretching.`]});
  if(overwork&&outcomePoor) recs.push({l:'bad',t:'🔴 Too many work hours is draining you',b:[`<strong>What's happening:</strong> You work ${answers.workhours} a day and feel drained.`,`<strong>Try:</strong> A short walk after work to decompress. Stop all work at least 1 hour before bed.`]});
  if(sedentary&&lowEnergy) recs.push({l:'',t:'🪑 Sitting all day could be making you sluggish',b:[`<strong>Why:</strong> Long sitting slows circulation, making you feel heavy and unfocused.`,`<strong>Try:</strong> 2-minute movement break every hour. A short walk after lunch.`]});
  if(late&&outcomePoor) recs.push({l:'bad',t:'🔴 Very late bedtime is reducing sleep quality',b:[`<strong>Why:</strong> Your deepest sleep happens earlier in the night.`,`<strong>Try:</strong> Move your bedtime 15 min earlier each week. Aim for 11 pm as a first goal.`]});

  // Contradictions
  const contras=detectContradictions();
  const contraHTML=contras.map(c=>`<div class="rec contra"><h4>${c.t}</h4><ul>${c.b.map(b=>`<li>${b}</li>`).join('')}</ul></div>`).join('');

  if(recs.length===0&&contras.length===0) recs.push({l:'',t:'✅ Everything looks good',b:[`<strong>What's happening:</strong> Your habits and how you feel are both in good shape.`,`<strong>Keep doing:</strong> Same bedtime every day. Check in again in a few weeks.`]});

  rd.innerHTML=`
    <div class="res-hero">
      <div class="res-emoji">${emoji}</div>
      <h3>Here is what we found…</h3>
      <p>${intro}</p>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${answers.workhours.replace(' hours','')}</div><div class="stat-sub">Work / day</div></div>
      <div class="stat"><div class="stat-val">${answers.sleep.replace(' hours','')}</div><div class="stat-sub">Sleep / night</div></div>
      <div class="stat"><div class="stat-val">${sc}<span style="font-size:12px;font-weight:400">/50</span></div><div class="stat-sub">Sleep score</div></div>
      <div class="stat"><div class="stat-val" style="font-size:13px">${answers.bedtime}</div><div class="stat-sub">Bedtime</div></div>
    </div>
    ${contras.length>0?`<p class="sec-lbl">⚠️ Contradictions spotted</p>${contraHTML}`:''}
    <p class="sec-lbl">Tips just for you</p>
    ${recs.map(r=>`<div class="rec ${r.l}"><h4>${r.t}</h4><ul>${r.b.map(b=>`<li>${b}</li>`).join('')}</ul></div>`).join('')}
    <button type="button" id="restart-btn" onclick="restartForm()">↩ Take the quiz again</button>
  `;
}

function restartForm() {
  document.getElementById('results').innerHTML='';
  document.getElementById('results').style.display='none';
  document.getElementById('tracker-form').style.display='block';
  document.querySelectorAll('.opt,.lbtn').forEach(b=>b.classList.remove('sel'));
  Object.keys(answers).forEach(k=>delete answers[k]);
  Object.keys(lAnswers).forEach(k=>delete lAnswers[k]);
  document.getElementById('prog-bar').style.width='0%';
  document.getElementById('prog-txt').textContent='0 of 12';
  document.getElementById('submit-btn').disabled=true;
  window.scrollTo(0,0);
}

/* ═══════════════════════════════════════
   HABIT TRACKER CARDS
═══════════════════════════════════════ */
const HABITS=[
  {id:'sleep',name:'Sleep',icon:'🌙',unit:'hrs',color:'#534AB7'},
  {id:'work',name:'Work',icon:'💻',unit:'hrs',color:'#1D9E75'},
  {id:'exercise',name:'Exercise',icon:'🏃',unit:'mins',color:'#BA7517'},
  {id:'screen',name:'Screen time',icon:'📱',unit:'hrs',color:'#C0392B'},
  {id:'reading',name:'Reading',icon:'📚',unit:'mins',color:'#0F6E56'},
  {id:'meditation',name:'Meditation',icon:'🧘',unit:'mins',color:'#2EBF8E'},
];

const SOUNDS=[
  {id:'bell',name:'🔔 Bell'},
  {id:'chime',name:'🎵 Chime'},
  {id:'nature',name:'🌿 Nature'},
  {id:'soft',name:'🎶 Soft tone'},
];

let audioCtx=null;

function getAudioCtx(){
  if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  return audioCtx;
}

function playSound(soundId,customDataUrl) {
  if(customDataUrl){
    const a=new Audio(customDataUrl);a.play();return;
  }
  const ctx=getAudioCtx();
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  osc.connect(gain);gain.connect(ctx.destination);
  const freqs={bell:[523,659,784],chime:[880,1047,1319],nature:[440,554,659],soft:[349,440,523]};
  const f=freqs[soundId]||freqs.bell;
  osc.frequency.setValueAtTime(f[0],ctx.currentTime);
  osc.frequency.setValueAtTime(f[1],ctx.currentTime+0.15);
  osc.frequency.setValueAtTime(f[2],ctx.currentTime+0.3);
  gain.gain.setValueAtTime(0.3,ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.8);
  osc.start();osc.stop(ctx.currentTime+0.8);
}

function buildHabitCards(){
  const wrap=document.getElementById('habit-cards-wrap');
  wrap.innerHTML='';
  const ud=getUserData();
  if(!ud) return;
  HABITS.forEach(h=>{
    const enabled=!!ud.habitEnabled[h.id];
    const alarm=ud.alarms[h.id]||{};
    const selSound=ud.selectedSounds[h.id]||'bell';
    const card=document.createElement('div');
    card.className='habit-card';
    card.id='habit-card-'+h.id;
    card.innerHTML=`
      <div class="habit-card-head">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:10px;background:${h.color}18;border:1px solid ${h.color}30;display:flex;align-items:center;justify-content:center;font-size:18px">${h.icon}</div>
          <span class="habit-name">${h.name}</span>
        </div>
        <div class="habit-toggle" onclick="toggleHabit('${h.id}')">
          <span style="font-size:11px;color:var(--muted)">${enabled?'On':'Off'}</span>
          <div class="toggle-track ${enabled?'on':''}" id="toggle-${h.id}"><div class="toggle-knob"></div></div>
        </div>
      </div>
      <div class="alarm-section ${enabled?'visible':''}" id="alarm-${h.id}">
        <div class="alarm-row">
          <div class="time-field"><label>Remind from</label><input type="time" id="from-${h.id}" value="${alarm.from||'08:00'}"></div>
          <div class="time-field"><label>Until</label><input type="time" id="to-${h.id}" value="${alarm.to||'22:00'}"></div>
        </div>
        <div class="sound-row">
          <div class="sound-label">Alarm sound</div>
          <div class="sound-opts">
            ${SOUNDS.map(s=>`<button class="sound-btn ${selSound===s.id?'sel':''}" onclick="selectSound('${h.id}','${s.id}',this)">${s.name}</button>`).join('')}
            <button class="upload-sound-btn" onclick="document.getElementById('sound-upload-${h.id}').click()">📎 My sound</button>
            <input type="file" id="sound-upload-${h.id}" accept="audio/*" style="display:none" onchange="uploadSound('${h.id}',this)">
          </div>
        </div>
        ${alarm.active?`<div class="alarm-active-badge"><div class="dot"></div>Alarm set: ${alarm.from} – ${alarm.to}</div>`:''}
        <button class="set-alarm-btn" onclick="setAlarm('${h.id}')">${alarm.active?'Update alarm':'Set alarm ⏰'}</button>
        <div class="log-entry-section">
          <div class="log-entry-title">📝 Log today's ${h.name.toLowerCase()}</div>
          <div class="log-duration-row">
            <div class="time-field" style="max-width:120px"><label>Duration (${h.unit})</label><input type="number" id="dur-${h.id}" min="0" max="24" step="0.5" placeholder="e.g. 7.5" style="padding:9px 12px;border:1px solid var(--border);border-radius:var(--rsm);font-family:'Sora',sans-serif;font-size:13px;width:100%;outline:none;background:var(--surf2);color:var(--text)"></div>
            <div class="time-field" style="max-width:120px"><label>Start time</label><input type="time" id="start-${h.id}" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:var(--rsm);font-family:'Sora',sans-serif;font-size:13px;outline:none;background:var(--surf2);color:var(--text)"></div>
            <div class="time-field" style="max-width:120px"><label>End time</label><input type="time" id="end-${h.id}" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:var(--rsm);font-family:'Sora',sans-serif;font-size:13px;outline:none;background:var(--surf2);color:var(--text)"></div>
          </div>
          <textarea class="log-note" id="note-${h.id}" rows="2" placeholder="Optional note…"></textarea>
          <button class="log-btn" style="margin-top:8px" onclick="logHabit('${h.id}')">Save log</button>
        </div>
      </div>`;
    wrap.appendChild(card);
  });
}

function toggleHabit(id){
  const ud=getUserData();if(!ud)return;
  ud.habitEnabled[id]=!ud.habitEnabled[id];
  const enabled=ud.habitEnabled[id];
  const track=document.getElementById('toggle-'+id);
  const section=document.getElementById('alarm-'+id);
  const labelEl=track.previousElementSibling;
  if(track){track.classList.toggle('on',enabled);}
  if(labelEl){labelEl.textContent=enabled?'On':'Off';}
  if(section){section.classList.toggle('visible',enabled);}
  saveUserData();
}

function selectSound(habitId,soundId,btn){
  const ud=getUserData();if(!ud)return;
  ud.selectedSounds[habitId]=soundId;
  const container=btn.closest('.sound-opts');
  container.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  playSound(soundId,ud.customSounds[habitId]);
  saveUserData();
}

function uploadSound(habitId,input){
  const ud=getUserData();if(!ud)return;
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    ud.customSounds[habitId]=e.target.result;
    // Mark "my sound" as selected
    ud.selectedSounds[habitId]='custom';
    saveUserData();
    const container=input.previousElementSibling;
    const card=document.getElementById('habit-card-'+habitId);
    if(card){
      card.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
      // show file name on upload btn
      const upBtn=input.previousElementSibling;
      if(upBtn){upBtn.textContent='✅ '+file.name.substring(0,16);}
    }
    playSound('custom',e.target.result);
  };
  reader.readAsDataURL(file);
}

function setAlarm(id){
  const ud=getUserData();if(!ud)return;
  const from=document.getElementById('from-'+id).value;
  const to=document.getElementById('to-'+id).value;
  ud.alarms[id]={from,to,active:true};
  saveUserData();
  // Rebuild just that card
  buildHabitCards();
}

function logHabit(id){
  const ud=getUserData();if(!ud)return;
  const dur=parseFloat(document.getElementById('dur-'+id).value)||0;
  const startT=document.getElementById('start-'+id).value;
  const endT=document.getElementById('end-'+id).value;
  const note=document.getElementById('note-'+id).value;
  const habit=HABITS.find(h=>h.id===id);
  if(!dur&&!startT){alert('Please enter a duration or start time.');return;}
  const entry={
    id:Date.now(),
    habitId:id,
    habitName:habit.name,
    habitIcon:habit.icon,
    date:new Date().toISOString().split('T')[0],
    duration:dur,
    unit:habit.unit,
    startTime:startT,
    endTime:endT,
    note
  };
  ud.logs.push(entry);
  saveUserData();
  // Clear fields
  document.getElementById('dur-'+id).value='';
  document.getElementById('start-'+id).value='';
  document.getElementById('end-'+id).value='';
  document.getElementById('note-'+id).value='';
  // Flash confirmation
  const btn=document.querySelector(`#habit-card-${id} .log-btn`);
  if(btn){const orig=btn.textContent;btn.textContent='✅ Saved!';btn.style.background='var(--green-dk)';setTimeout(()=>{btn.textContent=orig;btn.style.background='';},1500);}
  renderCalendar();
  renderTrends();
  renderHistory();
}

/* ═══════════════════════════════════════
   ALARM WATCHER
═══════════════════════════════════════ */
let alarmInterval=null;
let firedToday={};

function startAlarmWatcher(){
  alarmInterval=setInterval(checkAlarms,30000);
  checkAlarms();
}
function stopAlarmWatcher(){
  if(alarmInterval)clearInterval(alarmInterval);
  alarmInterval=null;
  firedToday={};
}
function checkAlarms(){
  const ud=getUserData();if(!ud)return;
  const now=new Date();
  const hm=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  const todayKey=new Date().toDateString();
  HABITS.forEach(h=>{
    const alarm=ud.alarms[h.id];
    if(!alarm||!alarm.active)return;
    const key=h.id+'_'+todayKey;
    if(firedToday[key])return;
    if(hm>=alarm.from&&hm<=alarm.to){
      // Only fire once per day per habit
      firedToday[key]=true;
      triggerAlarm(h,ud.selectedSounds[h.id]||'bell',ud.customSounds[h.id]);
    }
  });
}
function triggerAlarm(habit,soundId,customData){
  playSound(soundId,customData);
  currentAlarmHabit=habit;
  document.getElementById('alarm-modal-icon').textContent=habit.icon;
  document.getElementById('alarm-modal-title').textContent=`Time to log ${habit.name}!`;
  document.getElementById('alarm-modal-sub').textContent=`Your ${habit.name.toLowerCase()} reminder is here. Ready to record?`;
  document.getElementById('alarm-modal').style.display='flex';
}
function dismissAlarm(){document.getElementById('alarm-modal').style.display='none';currentAlarmHabit=null;}
function goLogFromAlarm(){
  document.getElementById('alarm-modal').style.display='none';
  if(currentAlarmHabit){
    showTab('tracker');
    setTimeout(()=>{
      const el=document.getElementById('dur-'+currentAlarmHabit.id);
      if(el)el.focus();
    },300);
  }
  currentAlarmHabit=null;
}

/* ═══════════════════════════════════════
   CALENDAR
═══════════════════════════════════════ */
let calYear=new Date().getFullYear();
let calMonth=new Date().getMonth();
let selectedDay=null;
let importedCalEvents=[];

function uploadCalendar(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;
    const events=parseICS(text);
    importedCalEvents=importedCalEvents.concat(events);
    renderCalendar();
    alert(`✅ Imported ${events.length} events from calendar.`);
  };
  reader.readAsText(file);
}

function parseICS(text){
  const events=[];
  const blocks=text.split('BEGIN:VEVENT');
  blocks.slice(1).forEach(block=>{
    const summaryM=block.match(/SUMMARY:(.+)/);
    const dateM=block.match(/DTSTART[^:]*:(\d{8})/);
    if(summaryM&&dateM){
      const d=dateM[1];
      events.push({
        title:summaryM[1].trim(),
        date:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`
      });
    }
  });
  return events;
}

function changeMonth(delta){
  calMonth+=delta;
  if(calMonth>11){calMonth=0;calYear++;}
  if(calMonth<0){calMonth=11;calYear--;}
  renderCalendar();
}

function renderCalendar(){
  const label=document.getElementById('cal-month-label');
  const grid=document.getElementById('cal-grid');
  if(!label||!grid)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[calMonth]+' '+calYear;
  grid.innerHTML='';
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  days.forEach(d=>{
    const el=document.createElement('div');
    el.className='cal-day-name';el.textContent=d;grid.appendChild(el);
  });
  const first=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  const ud=getUserData();
  const logDates=new Set(ud?ud.logs.map(l=>l.date):[]);

  for(let i=0;i<first;i++){
    const prev=new Date(calYear,calMonth,-(first-i-1));
    const el=document.createElement('div');
    el.className='cal-day other-month';
    el.textContent=prev.getDate();
    grid.appendChild(el);
  }
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el=document.createElement('div');
    el.className='cal-day';
    el.textContent=d;
    if(today.getFullYear()===calYear&&today.getMonth()===calMonth&&today.getDate()===d) el.classList.add('today');
    if(logDates.has(dateStr)) el.classList.add('has-log');
    if(selectedDay===dateStr) el.classList.add('selected');
    el.onclick=()=>{selectedDay=dateStr;renderCalendar();showDayLogs(dateStr);};
    grid.appendChild(el);
  }
  if(selectedDay)showDayLogs(selectedDay);
}

function showDayLogs(dateStr){
  const panel=document.getElementById('day-log-panel');
  const title=document.getElementById('day-log-title');
  const entries=document.getElementById('day-log-entries');
  const ud=getUserData();
  const d=new Date(dateStr);
  const opts={weekday:'long',month:'long',day:'numeric'};
  title.textContent=d.toLocaleDateString('en-US',opts);
  entries.innerHTML='';
  const dayLogs=(ud?ud.logs:[]).filter(l=>l.date===dateStr);
  const calEvts=importedCalEvents.filter(e=>e.date===dateStr);
  if(!dayLogs.length&&!calEvts.length){
    entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:10px 0">No logs recorded for this day.</div>`;
    return;
  }
  dayLogs.forEach(l=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}</div>
        <div class="log-entry-dur">${l.duration} ${l.unit}${l.startTime?` · ${l.startTime}–${l.endTime||'?'}`:''}</div>
        ${l.note?`<div class="log-entry-note">${l.note}</div>`:''}
      </div>`;
    entries.appendChild(item);
  });
  calEvts.forEach(e=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">📅</div><div class="log-entry-meta"><div class="log-entry-habit">${e.title}</div><div class="log-entry-dur">Calendar event</div></div>`;
    entries.appendChild(item);
  });
}

/* ═══════════════════════════════════════
   TRENDS & CHARTS
═══════════════════════════════════════ */
let chartInstances={};

function renderTrends(){
  const content=document.getElementById('trends-content');
  if(!content)return;
  const ud=getUserData();
  if(!ud||!ud.logs.length){
    content.innerHTML=`<div class="no-data-msg"><div class="no-data-icon">📊</div><div>No habit logs yet.</div><div style="margin-top:6px;font-size:12px">Log your habits in the Tracker tab to see trends here.</div></div>`;
    return;
  }
  // Destroy old charts
  Object.values(chartInstances).forEach(c=>{try{c.destroy();}catch(e){}});
  chartInstances={};
  content.innerHTML='';

  // Group by habit
  const byHabit={};
  ud.logs.forEach(l=>{
    if(!byHabit[l.habitId])byHabit[l.habitId]={name:l.habitName,icon:l.habitIcon,unit:l.unit,data:[]};
    byHabit[l.habitId].data.push({date:l.date,duration:l.duration});
  });

  // Check-in score trend
  if(ud.checkInHistory.length>0){
    const scoreCard=buildScoreChart(ud.checkInHistory);
    content.appendChild(scoreCard);
  }

  HABITS.forEach(h=>{
    const hData=byHabit[h.id];
    if(!hData)return;
    // Aggregate by date
    const aggr={};
    hData.data.forEach(d=>{
      if(!aggr[d.date])aggr[d.date]=0;
      aggr[d.date]+=d.duration;
    });
    const sorted=Object.keys(aggr).sort();
    const vals=sorted.map(d=>aggr[d]);
    const card=buildHabitChart(h,sorted,vals,hData.unit);
    content.appendChild(card);
  });

  // Correlation insight
  const ins=buildInsight(ud.logs,ud.checkInHistory);
  if(ins)content.appendChild(ins);
}

function buildScoreChart(history){
  const card=document.createElement('div');
  card.className='chart-card';
  const labels=history.map(h=>h.date?new Date(h.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'?');
  const scores=history.map(h=>h.score);
  const trend=calcTrend(scores);
  card.innerHTML=`
    <div class="chart-title">Sleep score over time</div>
    <div class="chart-sub">From your check-ins</div>
    <div style="position:relative;width:100%;height:180px"><canvas id="chart-score" role="img" aria-label="Sleep score trend chart">Your sleep scores over time.</canvas></div>
    <div class="trend-badge ${trend.dir}" style="margin-top:10px">
      ${trend.dir==='up'?'↑ Improving':trend.dir==='down'?'↓ Declining':'→ Stable'}
      (avg ${Math.round(trend.avg)}/50)
    </div>
    <div class="chart-rec">${getScoreRec(trend)}</div>`;
  setTimeout(()=>{
    const ctx=document.getElementById('chart-score');
    if(!ctx)return;
    chartInstances['score']=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{label:'Sleep score',data:scores,borderColor:'#1D9E75',backgroundColor:'rgba(29,158,117,0.08)',pointBackgroundColor:'#1D9E75',tension:.35,fill:true}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:50,ticks:{stepSize:10}}}}
    });
  },50);
  return card;
}

function buildHabitChart(habit,dates,vals,unit){
  const card=document.createElement('div');
  card.className='chart-card';
  const trend=calcTrend(vals);
  const labels=dates.map(d=>new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}));
  const canvasId='chart-'+habit.id;
  const avgVal=trend.avg.toFixed(1);
  // Recommendation based on trend
  const rec=getHabitRec(habit.id,trend,unit);
  card.innerHTML=`
    <div class="chart-title">${habit.icon} ${habit.name}</div>
    <div class="chart-sub">Daily ${unit} logged</div>
    <div style="position:relative;width:100%;height:160px"><canvas id="${canvasId}" role="img" aria-label="${habit.name} trend">Your ${habit.name.toLowerCase()} over time.</canvas></div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px">
      <div class="trend-badge ${trend.dir}">
        ${trend.dir==='up'?'↑ Trending up':trend.dir==='down'?'↓ Trending down':'→ Stable'}
      </div>
      <span style="font-size:11px;color:var(--hint)">avg ${avgVal} ${unit}/day</span>
    </div>
    ${rec?`<div class="chart-rec">${rec}</div>`:''}`;
  setTimeout(()=>{
    const ctx=document.getElementById(canvasId);
    if(!ctx)return;
    const color=habit.color||'#1D9E75';
    chartInstances[habit.id]=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{label:habit.name,data:vals,borderColor:color,backgroundColor:color+'18',pointBackgroundColor:color,tension:.35,fill:true,borderDash:[]}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0}}}
    });
  },50);
  return card;
}

function calcTrend(vals){
  if(!vals.length)return{dir:'neutral',avg:0,slope:0};
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  if(vals.length<2)return{dir:'neutral',avg,slope:0};
  const n=vals.length;
  const sumX=vals.reduce((_,__,i)=>_+i,0);
  const sumY=vals.reduce((a,b)=>a+b,0);
  const sumXY=vals.reduce((a,b,i)=>a+i*b,0);
  const sumXX=vals.reduce((a,_,i)=>a+i*i,0);
  const slope=(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX);
  const dir=Math.abs(slope)<0.05?'neutral':slope>0?'up':'down';
  return{dir,avg,slope};
}

function getScoreRec(trend){
  if(trend.dir==='up') return `<strong>Great trajectory!</strong> Your sleep quality is improving. Keep your current bedtime routine consistent.`;
  if(trend.dir==='down') return `<strong>Your sleep score is declining.</strong> Check if work hours or screen time have increased recently — those are the first places to look.`;
  return `<strong>Stable score.</strong> To move the needle, focus on one habit at a time — start with your phone use before bed.`;
}

function getHabitRec(id,trend,unit){
  const recs={
    sleep:{up:'Sleep duration improving — great! Aim to keep it above 7 hours consistently.',down:'Sleep hours are declining. Try a consistent bedtime, even 15 min earlier helps.',neutral:'Sleep is stable. Try logging what time you go to bed to spot patterns.'},
    work:{up:'Work hours trending up. Watch out for fatigue — schedule clear start and stop times.',down:'Work hours decreasing — good if intentional. Make sure rest time is actually restful.',neutral:'Work hours are stable. Consistent boundaries support long-term energy.'},
    exercise:{up:'Exercise is trending up — excellent! Your energy levels should reflect this soon.',down:'Exercise declining. Even a 10-min walk daily counts. Start small.',neutral:'Exercise is steady. Try adding one new activity per week to build gradually.'},
    screen:{up:'Screen time increasing. This may be affecting your sleep depth.',down:'Screen time going down — especially before bed, this has a direct positive effect on sleep.',neutral:'Screen time stable. Try tracking when you use it most — evening use is highest risk.'},
    reading:{up:'Reading more is a great wind-down habit, especially before bed.',down:'Reading less recently. Even 10 pages before bed can help with sleep onset.',neutral:'Consistent reading habit. Great for mental wind-down.'},
    meditation:{up:'Meditation practice growing — this directly supports stress recovery and sleep.',down:'Meditation dipping. Even 5 minutes of deep breathing counts.',neutral:'Steady meditation practice — keep it going.'},
  };
  const r=recs[id];
  if(!r)return '';
  return r[trend.dir]||r.neutral;
}

function buildInsight(logs,checkIns){
  if(checkIns.length<2||!logs.length)return null;
  const card=document.createElement('div');
  card.className='chart-card';
  const sleepLogs=logs.filter(l=>l.habitId==='sleep');
  if(sleepLogs.length<2){card.innerHTML=`<div class="chart-title">💡 Insight</div><div class="chart-sub" style="margin-top:6px">Log more sleep data to unlock correlation insights.</div>`;return card;}
  const lastScore=checkIns[checkIns.length-1].score;
  const sleepAvg=sleepLogs.reduce((a,b)=>a+b.duration,0)/sleepLogs.length;
  const insight=lastScore>35
    ?`Your recent check-in score is strong (${lastScore}/50). Your average logged sleep of ${sleepAvg.toFixed(1)} hrs supports this — continue prioritising consistent sleep times.`
    :`Your check-in score is ${lastScore}/50 with an average logged sleep of ${sleepAvg.toFixed(1)} hrs. Increasing sleep consistency (not just duration) is likely to move this score higher.`;
  card.innerHTML=`<div class="chart-title">💡 Key insight</div><div style="font-size:13px;color:var(--muted);margin-top:8px;line-height:1.7">${insight}</div>`;
  return card;
}

/* ═══════════════════════════════════════
   SETTINGS
═══════════════════════════════════════ */
function renderSettings() {
  if (!currentUser) return;
  const users = _loadUsers();
  const u = users[currentUser.username];
  if (!u) return;

  // Fill profile card
  document.getElementById('settings-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('settings-name-display').textContent = currentUser.name;
  document.getElementById('settings-user-display').textContent = '@' + currentUser.username;
  document.getElementById('set-name').value = u.name;
  document.getElementById('set-username').value = currentUser.username;
  document.getElementById('set-pass').value = '';
  document.getElementById('set-pass2').value = '';
  document.getElementById('set-current-pass').value = '';
  document.getElementById('settings-msg').className = 'auth-msg';
  document.getElementById('settings-msg').textContent = '';

  // Account record
  const ud = getUserData();
  const logCount = ud ? ud.logs.length : 0;
  const checkCount = ud ? ud.checkInHistory.length : 0;
  const joined = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'Unknown';
  const lastChanged = u.lastChanged ? new Date(u.lastChanged).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'Never';

  document.getElementById('settings-record').innerHTML = `
    <div style="display:grid;gap:8px">
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Full name</span><span style="color:var(--text);font-weight:500">${u.name}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Username</span><span style="color:var(--text);font-weight:500">@${currentUser.username}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Password</span><span style="color:var(--text);font-weight:500">••••••</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Account created</span><span style="color:var(--text);font-weight:500">${joined}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Last profile update</span><span style="color:var(--text);font-weight:500">${lastChanged}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
        <span style="color:var(--hint)">Total logs</span><span style="color:var(--green-dk);font-weight:600">${logCount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0">
        <span style="color:var(--hint)">Check-ins completed</span><span style="color:var(--green-dk);font-weight:600">${checkCount}</span>
      </div>
    </div>`;
}

function saveSettings() {
  const newName     = document.getElementById('set-name').value.trim();
  const newUsername = document.getElementById('set-username').value.trim().toLowerCase();
  const newPass     = document.getElementById('set-pass').value;
  const newPass2    = document.getElementById('set-pass2').value;
  const currentPass = document.getElementById('set-current-pass').value;

  const msgEl = document.getElementById('settings-msg');
  const err = (t) => { msgEl.textContent = t; msgEl.className = 'auth-msg err'; };
  const ok  = (t) => { msgEl.textContent = t; msgEl.className = 'auth-msg ok'; };

  if (!newName || !newUsername) return err('Name and username cannot be empty.');
  if (newUsername.length < 3) return err('Username must be at least 3 characters.');
  if (!currentPass) return err('Please enter your current password to save changes.');

  const users = _loadUsers();
  const u = users[currentUser.username];
  if (!u || u.pass !== currentPass) return err('Current password is incorrect.');

  // Check new username isn't taken by someone else
  if (newUsername !== currentUser.username && users[newUsername]) return err('That username is already taken.');

  // Validate new password if provided
  if (newPass || newPass2) {
    if (newPass.length < 6) return err('New password must be at least 6 characters.');
    if (newPass !== newPass2) return err('New passwords do not match.');
  }

  const finalPass = newPass || u.pass;

  // If username changed: migrate the data key
  if (newUsername !== currentUser.username) {
    const existingData = localStorage.getItem('qt_data_' + currentUser.username);
    if (existingData) {
      localStorage.setItem('qt_data_' + newUsername, existingData);
      localStorage.removeItem('qt_data_' + currentUser.username);
    }
    delete users[currentUser.username];
  }

  // Save updated user record
  users[newUsername] = {
    name: newName,
    pass: finalPass,
    joinedAt: u.joinedAt || new Date().toISOString(),
    lastChanged: new Date().toISOString()
  };
  _saveUsers(users);

  // Update session
  currentUser = { username: newUsername, name: newName };
  localStorage.setItem('qt_session', JSON.stringify({ username: newUsername }));

  // Update header UI
  document.getElementById('hdr-avatar').textContent = newName.charAt(0).toUpperCase();
  document.getElementById('hdr-name').textContent = newName;
  document.getElementById('greeting-name').textContent = newName.split(' ')[0];

  ok('✅ Changes saved successfully!');
  renderSettings();
}

function deleteAccount() {
  if (!currentUser) return;
  const confirmed = confirm(`Are you sure you want to permanently delete your account "@${currentUser.username}" and all your data? This cannot be undone.`);
  if (!confirmed) return;
  const pass = prompt('Enter your password to confirm:');
  if (pass === null) return;
  const users = _loadUsers();
  if (!users[currentUser.username] || users[currentUser.username].pass !== pass) {
    alert('Incorrect password. Account not deleted.');
    return;
  }
  // Remove all data
  localStorage.removeItem('qt_data_' + currentUser.username);
  localStorage.removeItem('qt_session');
  delete users[currentUser.username];
  _saveUsers(users);
  currentUser = null;
  _currentData = null;
  location.reload();
}

/* ═══════════════════════════════════════
   HISTORY
═══════════════════════════════════════ */
let historyFilter = 'all';

function renderHistory() {
  const content = document.getElementById('history-content');
  const filterWrap = document.getElementById('history-filter');
  if (!content || !filterWrap) return;

  const ud = getUserData();
  if (!ud || !ud.logs.length) {
    filterWrap.innerHTML = '';
    content.innerHTML = `<div class="no-data-msg"><div class="no-data-icon">📖</div><div>No logs yet.</div><div style="margin-top:6px;font-size:12px">Log habits in the Tracker tab and they'll appear here.</div></div>`;
    return;
  }

  // Build filter buttons
  const habitIds = [...new Set(ud.logs.map(l => l.habitId))];
  filterWrap.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'sound-btn' + (historyFilter === 'all' ? ' sel' : '');
  allBtn.textContent = '🗂 All';
  allBtn.onclick = () => { historyFilter = 'all'; renderHistory(); };
  filterWrap.appendChild(allBtn);
  HABITS.filter(h => habitIds.includes(h.id)).forEach(h => {
    const btn = document.createElement('button');
    btn.className = 'sound-btn' + (historyFilter === h.id ? ' sel' : '');
    btn.textContent = h.icon + ' ' + h.name;
    btn.onclick = () => { historyFilter = h.id; renderHistory(); };
    filterWrap.appendChild(btn);
  });

  // Filter + sort logs newest first
  const logs = ud.logs
    .filter(l => historyFilter === 'all' || l.habitId === historyFilter)
    .slice()
    .sort((a, b) => b.id - a.id);

  // Group by date
  const byDate = {};
  logs.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });

  content.innerHTML = '';
  Object.keys(byDate).sort((a,b) => b.localeCompare(a)).forEach(dateStr => {
    // Date heading
    const heading = document.createElement('div');
    const d = new Date(dateStr + 'T12:00:00');
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    const isYesterday = dateStr === new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'});
    heading.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);letter-spacing:.07em;text-transform:uppercase;padding:16px 0 8px;border-top:.5px solid var(--border);margin-top:4px">${label}</div>`;
    content.appendChild(heading);

    // Entries for this date
    byDate[dateStr].forEach(l => {
      const item = document.createElement('div');
      item.className = 'log-entry-item';
      item.style.cssText = 'background:var(--surf);border:.5px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px';
      item.innerHTML = `
        <div class="log-entry-icon" style="flex-shrink:0">${l.habitIcon}</div>
        <div class="log-entry-meta" style="flex:1;min-width:0">
          <div class="log-entry-habit">${l.habitName}</div>
          <div class="log-entry-dur">
            <strong>${l.duration} ${l.unit}</strong>
            ${l.startTime ? `<span style="color:var(--hint)"> · ${l.startTime}${l.endTime ? '–'+l.endTime : ''}</span>` : ''}
          </div>
          ${l.note ? `<div class="log-entry-note" style="margin-top:4px">💬 ${l.note}</div>` : ''}
        </div>
        <button onclick="deleteLog(${l.id})" title="Delete this entry" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0;line-height:1" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
      content.appendChild(item);
    });
  });
}

function deleteLog(logId) {
  const ud = getUserData();
  if (!ud) return;
  const idx = ud.logs.findIndex(l => l.id === logId);
  if (idx === -1) return;
  ud.logs.splice(idx, 1);
  saveUserData();
  renderHistory();
  renderCalendar();
  renderTrends();
}

/* ═══════════════════════════════════════
   EXPORT
═══════════════════════════════════════ */
function exportCSV(){
  const ud=getUserData();
  if(!ud||!ud.logs.length){alert('No logs to export yet.');return;}
  const rows=[['Date','Habit','Duration','Unit','Start','End','Note']];
  ud.logs.forEach(l=>rows.push([l.date,l.habitName,l.duration,l.unit,l.startTime||'',l.endTime||'',l.note||'']));
  const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='quick-tracker-logs.csv';
  a.click();
}

function exportExcel(){
  const ud=getUserData();
  if(!ud||!ud.logs.length){alert('No logs to export yet.');return;}
  // Build simple HTML table that Excel can open
  const rows=[['Date','Habit','Duration','Unit','Start Time','End Time','Note']];
  ud.logs.forEach(l=>rows.push([l.date,l.habitName,l.duration,l.unit,l.startTime||'',l.endTime||'',l.note||'']));
  const header=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>td{font-family:Calibri,sans-serif;font-size:11pt;padding:4px 8px;border:1px solid #ccc}th{background:#1D9E75;color:#fff;font-weight:600}</style></head><body><table>`;
  const htmlRows=rows.map((r,i)=>`<tr>${r.map(c=>`<${i===0?'th':'td'}>${c}</${i===0?'th':'td'}>`).join('')}</tr>`).join('');
  const html=header+htmlRows+'</table></body></html>';
  const blob=new Blob([html],{type:'application/vnd.ms-excel'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='quick-tracker-logs.xls';
  a.click();
}