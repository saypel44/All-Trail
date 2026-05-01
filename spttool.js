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
      _currentData = { logs:[], alarms:{}, habitEnabled:{}, selectedSounds:{}, customSounds:{}, checkInHistory:[], quickAlarms:[] };
    }
    if (!_currentData.quickAlarms) _currentData.quickAlarms = [];
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
  renderTrackerSchedules();
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
    if((t==='check-in'&&b.textContent.includes('Check'))||
       (t==='tracker'&&b.textContent.includes('Tracker'))||
       (t==='history'&&b.textContent.includes('History'))||
       (t==='trends'&&b.textContent.includes('Trends'))) {
      b.classList.add('active');
    }
  });
  if(t==='trends') renderTrends();
  if(t==='history'){ renderCalendar(); renderHistory(); }
  // tracker rendering is handled by the appended showTab override below
}

/* ═══════════════════════════════════════
   CHECK-IN LOGIC
═══════════════════════════════════════ */
const likertQs=[
  {id:'l1',text:'I can fall asleep easily.'},
  {id:'l2',text:'I sleep well most nights.'},
  {id:'l3',text:'I wake up feeling rested.'},
  {id:'l4',text:'I stay alert during the day.'},
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
    (lAnswers.l4==='Yes, always'||lAnswers.l4==='Most of the time')&&
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

  // ── Helper: context-aware Habit Tracker nudge ──────────────────────────
  const ud_recs = getUserData();
  const hasLogs = ud_recs && ud_recs.logs && ud_recs.logs.length > 0;
  const trackerNudge = (habitId, habitLabel) => {
    if (hasLogs) {
      const habitLogs = ud_recs.logs.filter(l => l.habitId === habitId);
      if (habitLogs.length >= 3) {
        return `<strong>📊 Your tracker data:</strong> You've already logged ${habitLabel} ${habitLogs.length} time${habitLogs.length > 1 ? 's' : ''}! Keep that streak going — consistent logging helps you spot patterns and celebrate real progress.`;
      }
      return `<strong>📊 Track it:</strong> You've started logging in the Habit Tracker — amazing first step! Adding your ${habitLabel} daily will reveal patterns you can't see from memory alone.`;
    }
    return `<strong>📊 Start tracking:</strong> Head to the <em>Habit Tracker</em> tab and log your ${habitLabel} each day. Even one week of data will show you patterns that are impossible to see in your head.`;
  };

  // ── Recommendations ────────────────────────────────────────────────────
  // Format: { l: level, t: title, s: short summary + action sentence, b: [tracker nudge] }
  const recs=[];

  const phoneHigh  = answers.phonetime==='1–2 hours'||answers.phonetime==='2–3 hours'||answers.phonetime==='more than 3 hours';
  const phoneMed   = answers.phonetime==='30 min–1 hour';
  const phoneHours = {'no phone before bed':'none','30 min–1 hour':'30 min–1 hr','1–2 hours':'1–2 hrs','2–3 hours':'2–3 hrs','more than 3 hours':'3+ hrs'}[answers.phonetime]||'some';

  // ── Outcome-good cards ──
  if(outcomeGood&&late) recs.push({l:'',t:'✅ You feel great — your late routine is actually working',
    s:`You've adapted well to a ${answers.bedtime} bedtime and your energy shows it — that consistency is genuinely impressive. Based on your inputs, keeping the same bedtime every day (including weekends) will protect those gains long-term.`,
    b:[trackerNudge('sleep','sleep')]});
  else if(outcomeGood) recs.push({l:'',t:'✅ Your habits are paying off — you feel rested and energised',
    s:`You're sleeping well, waking up refreshed, and staying alert through the day — that's the result of real healthy choices. Based on your inputs, staying consistent with your current routine is all you need to maintain this.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Sleep quality poor but hours are fine ──
  if(outcomePoor&&goodHours) recs.push({l:'warn',t:"⚠️ You're putting in the hours — the quality just needs a tune-up",
    s:`You're already committing ${answers.sleep} to sleep, which is a real strength. Based on your inputs, putting your phone away 30–60 min before bed and keeping a consistent wake time will likely unlock the restful sleep those hours deserve.`,
    b:[trackerNudge('sleep','sleep hours')]});

  // ── Short sleep + poor outcome ──
  if(outcomePoor&&shortSleep&&!overwork&&!phoneHigh) recs.push({l:'bad',t:"🔴 Your body is asking for a little more recovery time",
    s:`Getting through days on ${answers.sleep} takes real resilience. Based on your inputs, adding just 1–1.5 hrs of sleep — even by going to bed 20 min earlier each week — will likely bring a noticeable lift in your energy and mood.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Hard to fall asleep ──
  if(hardToSleep) recs.push({l:'warn',t:"⚠️ Your active mind is a strength — it just needs a gentle wind-down cue",
    s:`The fact that your brain stays switched on at bedtime means you're a thinker and a doer — that energy is an asset during the day. Based on your inputs, a 20–30 min screen-free wind-down (dim lights, light reading) before bed will likely help you fall asleep faster and sleep deeper.`,
    b:[trackerNudge('sleep','sleep')]});

  // ── Daytime sleepiness ──
  if(daySleepy) recs.push({
    l:(daySleepy&&poorRested)?'bad':'warn',
    t:(daySleepy&&poorRested)?"🔴 You're pushing through — you deserve to feel genuinely alert":"⚠️ You're still showing up — your sleep just needs a small adjustment",
    s:(daySleepy&&poorRested)
      ?`The determination it takes to keep going while feeling drained is real — but you shouldn't have to white-knuckle your afternoons. Based on your inputs, a consistent wake time and cutting phone use 30 min before bed will likely reduce afternoon fog significantly within days.`
      :`You're functioning and showing up, which counts for a lot. Based on your inputs, anchoring your wake time to the same hour every day — even weekends — is the single fastest way to stop daytime sleepiness.`,
    b:[trackerNudge('sleep','sleep quality')]});

  // ── Phone only (no short sleep) ──
  if(pr>=2&&outcomePoor&&!shortSleep) recs.push({l:'warn',t:"⚠️ You're honest about your screen habit — that awareness is the first step",
    s:`Recognising you use your phone ${answers.phonetime} before bed puts you ahead of most people. Based on your inputs, cutting screen time to under 30 min before bed for just 5 nights will likely improve your sleep depth noticeably — even without changing your bedtime.`,
    b:[trackerNudge('screen','screen time')]});

  // ── Overwork only (no short sleep, no late) ──
  if(overwork&&outcomePoor&&!shortSleep&&!late) recs.push({l:'bad',t:"🔴 Your work ethic is real — now let's protect your recovery",
    s:`Working ${answers.workhours} a day shows serious discipline and commitment. Based on your inputs, stopping all work at least 1 hour before bed and taking a short walk to decompress will likely bring your evening cortisol down and improve both your sleep and your next-day focus.`,
    b:[trackerNudge('work','work hours')]});

  // ── COMBINED-FACTORS ──

  // Scenario A: overwork + short sleep + high phone
  if(overwork&&shortSleep&&phoneHigh) recs.push({l:'bad',t:'🔴 Three things are quietly stacking against your recovery',
    s:`You're working ${answers.workhours}, sleeping ${answers.sleep}, and spending ${phoneHours} on your phone before bed — each one is manageable alone, but together they're draining your energy every day. Based on your inputs, sleeping 1–2 hrs more <em>and</em> cutting screen time to under 30 min before bed will likely make you feel significantly better within a week — set a reminder in the Habit Tracker to log your sleep nightly and we'll track your progress.`,
    b:[`<strong>📊 Set a reminder:</strong> Open the <em>Habit Tracker</em> tab, enable Sleep and Screen Time, and set a nightly log reminder. One week of data will show you the change.`]});

  // Scenario B: overwork + short sleep, phone is fine
  else if(overwork&&shortSleep&&!phoneHigh&&!phoneMed) recs.push({l:'bad',t:'🔴 Long workdays are shrinking your recovery window',
    s:`Working ${answers.workhours} and sleeping only ${answers.sleep} leaves your body too little time to repair itself overnight. Based on your inputs, moving your bedtime 45–60 min earlier on work nights will likely recover most of that deficit and noticeably improve your energy within days.`,
    b:[trackerNudge('sleep','sleep')]});

  // Scenario C: short sleep + high phone, no overwork
  else if(!overwork&&shortSleep&&phoneHigh) recs.push({l:'warn',t:'⚠️ Late-night screens are quietly borrowing time from your sleep',
    s:`You sleep ${answers.sleep} and spend ${phoneHours} on your phone before bed — those two are directly connected, since screen light delays when your brain is actually ready for sleep. Based on your inputs, swapping the last 30 min of phone time for something screen-free will likely add 20–40 min of real sleep without changing your bedtime at all.`,
    b:[trackerNudge('screen','screen time')]});

  // Scenario D: good hours + high phone + feeling poor
  if(!shortSleep&&goodHours&&phoneHigh&&outcomePoor) recs.push({l:'warn',t:'⚠️ You have the hours — screens are reducing the quality',
    s:`You sleep ${answers.sleep}, which should be enough — yet you're still not feeling your best. Based on your inputs, ${phoneHours} of screen time before bed is likely fragmenting your deep sleep cycles. Cutting screens to under 30 min before bed for one week will likely show you a clear difference in how rested you wake up.`,
    b:[trackerNudge('screen','screen time')]});

  // Scenario E: overwork + late bedtime + poor outcome
  if(overwork&&late&&outcomePoor) recs.push({l:'bad',t:'🔴 Long workdays + a late bedtime = very little recovery time',
    s:`Working ${answers.workhours} and going to bed ${answers.bedtime} means your body barely starts recovering before morning arrives. Based on your inputs, finishing all work tasks 1 hr before your target bedtime — even with a short walk to decompress — will likely improve both sleep depth and next-day energy noticeably.`,
    b:[trackerNudge('work','work hours')]});

  // Scenario F: sedentary + low energy
  if(sedentary&&lowEnergy) recs.push({l:'',t:"🪑 You're focused and mentally sharp — let's add some physical fuel",
    s:`Deep focus work takes real cognitive energy, and you clearly have that. Based on your inputs, a 2-minute movement break every hour and a short walk after lunch will likely improve your afternoon energy without interrupting your concentration — it actually sharpens it.`,
    b:[trackerNudge('exercise','movement')]});

  // Scenario G: night owl + poor outcome
  if(late&&outcomePoor) recs.push({l:'bad',t:"🔴 You're a natural night owl — let's just nudge the window slightly",
    s:`Late-night thinkers are often the most creative — and you clearly function in that mode. Based on your inputs, moving your bedtime just 15 min earlier each week (aiming for 11 pm as a first milestone) will likely improve your sleep quality without forcing you to become a morning person.`,
    b:[trackerNudge('sleep','sleep')]});

  // Contradictions
  const contras=detectContradictions();
  const contraHTML=contras.map(c=>`<div class="rec contra"><h4>${c.t}</h4><ul>${c.b.map(b=>`<li>${b}</li>`).join('')}</ul></div>`).join('');

  if(recs.length===0&&contras.length===0) recs.push({l:'',t:'✅ Everything looks good — keep doing what you\'re doing',
    s:`Your habits and how you feel are both in a healthy place — that's genuinely great to see. Based on your inputs, staying consistent with your current routine and checking in again in a few weeks is all you need.`,
    b:[trackerNudge('sleep','sleep')]});

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
    <p class="sec-lbl">Tips just for you</p>
    <div class="rec-box">
      ${[...contras.map(c=>({l:'contra',t:c.t,s:c.b[0].replace(/<strong>[^<]*<\/strong>[\s:]*/g,'').replace(/<[^>]+>/g,'')})),...recs].map((r,i,arr)=>`
        <div class="rec-row${i<arr.length-1?' rec-row-border':''}">
          <span class="rec-icon">${r.l==='bad'?'🔴':r.l==='warn'?'⚠️':r.l==='contra'?'🔮':'✅'}</span>
          <div class="rec-row-body">
            <div class="rec-row-title">${r.t.replace(/^[\u{1F534}\u{26A0}\u{2705}\u{1F52E}\u{1FA91}\uFE0F\s]+/u,'')}</div>
            <div class="rec-row-text">${(r.s||'').replace(/<[^>]+>/g,'')}</div>
          </div>
        </div>`).join('')}
    </div>
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

function fmt12(val24){
  if(!val24)return{h:'',m:'',ampm:'AM'};
  const [hh,mm]=val24.split(':').map(Number);
  const ampm=hh<12?'AM':'PM';
  const h12=hh%12||12;
  return{h:String(h12),m:String(mm).padStart(2,'0'),ampm};
}
function to24(h,m,ampm){
  let hh=parseInt(h)||0;
  const mm=parseInt(m)||0;
  if(ampm==='AM'&&hh===12)hh=0;
  if(ampm==='PM'&&hh!==12)hh+=12;
  return hh.toString().padStart(2,'0')+':'+mm.toString().padStart(2,'0');
}
function calcDiff(t1,t2){
  if(!t1||!t2)return null;
  const [h1,m1]=t1.split(':').map(Number);
  const [h2,m2]=t2.split(':').map(Number);
  let diff=(h2*60+m2)-(h1*60+m1);
  if(diff<0)diff+=1440;
  const hrs=Math.floor(diff/60);
  const mins=diff%60;
  return hrs>0?(mins>0?`${hrs}h ${mins}m`:`${hrs}h`):(mins>0?`${mins}m`:null);
}

function ampmPicker(prefix,label,defaultVal){
  const f=fmt12(defaultVal);
  return `<div class="ampm-field">
    <label>${label}</label>
    <div class="ampm-wrap">
      <input class="ampm-hour" id="${prefix}-h" type="number" min="1" max="12" value="${f.h}" placeholder="12">
      <span class="ampm-sep">:</span>
      <input class="ampm-min" id="${prefix}-m" type="number" min="0" max="59" value="${f.m}" placeholder="00">
      <div class="ampm-toggle">
        <button type="button" class="ampm-btn${f.ampm==='AM'?' sel':''}" id="${prefix}-am" onclick="setAmPm('${prefix}','AM')" tabindex="-1">AM</button>
        <button type="button" class="ampm-btn${f.ampm==='PM'?' sel':''}" id="${prefix}-pm" onclick="setAmPm('${prefix}','PM')" tabindex="-1">PM</button>
      </div>
    </div>
  </div>`;
}

function setAmPm(prefix,val){
  document.getElementById(prefix+'-am').classList.toggle('sel',val==='AM');
  document.getElementById(prefix+'-pm').classList.toggle('sel',val==='PM');
  updateDiff(prefix.split('-log-')[0].replace(/^log-/,''));
}
function getAmPmVal(prefix){
  const h=document.getElementById(prefix+'-h')?.value||'12';
  const m=document.getElementById(prefix+'-m')?.value||'00';
  const ampm=document.getElementById(prefix+'-am')?.classList.contains('sel')?'AM':'PM';
  return to24(h,m,ampm);
}
function updateDiff(hId){
  const start=getAmPmVal(`log-${hId}-start`);
  const end=getAmPmVal(`log-${hId}-end`);
  const diff=calcDiff(start,end);
  const el=document.getElementById(`diff-${hId}`);
  if(el)el.textContent=diff?`⏱ Duration: ${diff}`:'';
  // auto-fill duration field
  if(diff){
    const [h1,m1]=start.split(':').map(Number);
    const [h2,m2]=end.split(':').map(Number);
    let mins=(h2*60+m2)-(h1*60+m1);
    if(mins<0)mins+=1440;
    const habit=HABITS.find(h=>h.id===hId);
    const durEl=document.getElementById('dur-'+hId);
    if(durEl&&habit){
      durEl.value=habit.unit==='hrs'?(mins/60).toFixed(1):mins;
    }
  }
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
          <div class="habit-icon-btn" style="background:${h.color}18;border-color:${h.color}40" onclick="toggleHabit('${h.id}')">${h.icon}</div>
          <div>
            <div class="habit-name">${h.name}</div>
            ${alarm.active?`<div class="alarm-mini-badge">⏰ ${fmt12(alarm.from).h}:${fmt12(alarm.from).m} ${fmt12(alarm.from).ampm} – ${fmt12(alarm.to).h}:${fmt12(alarm.to).m} ${fmt12(alarm.to).ampm}</div>`:'<div class="alarm-mini-badge muted">No alarm set</div>'}
          </div>
        </div>
        <div class="habit-card-actions">
          <button class="icon-action-btn ${alarm.active?'alarm-on':''}" title="Set alarm" onclick="toggleAlarmPanel('${h.id}')">⏰</button>
          <button class="icon-action-btn log-action-btn" title="Log now" onclick="toggleLogPanel('${h.id}')">✏️</button>
          <div class="habit-toggle" onclick="toggleHabit('${h.id}')">
            <span class="toggle-lbl" style="font-size:11px;color:var(--muted)">${enabled?'On':'Off'}</span>
            <div class="toggle-track ${enabled?'on':''}" id="toggle-${h.id}"><div class="toggle-knob"></div></div>
          </div>
        </div>
      </div>

      <div class="alarm-panel" id="alarm-panel-${h.id}" style="display:none">
        <div class="panel-section-lbl">⏰ Set alarm window</div>
        <div class="alarm-ampm-row">
          ${ampmPicker(`alarm-${h.id}-from`,'From',alarm.from||'08:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`alarm-${h.id}-to`,'Until',alarm.to||'22:00')}
        </div>
        <div class="sound-row" style="margin-top:10px">
          <div class="sound-label">Alarm sound</div>
          <div class="sound-opts">
            ${SOUNDS.map(s=>`<button class="sound-btn ${selSound===s.id?'sel':''}" onclick="selectSound('${h.id}','${s.id}',this)">${s.name}</button>`).join('')}
            <button class="upload-sound-btn" onclick="document.getElementById('sound-upload-${h.id}').click()">📎 My sound</button>
            <input type="file" id="sound-upload-${h.id}" accept="audio/*" style="display:none" onchange="uploadSound('${h.id}',this)">
          </div>
        </div>
        <button class="set-alarm-btn" style="margin-top:10px" onclick="setAlarmAmPm('${h.id}')">${alarm.active?'Update alarm ⏰':'Set alarm ⏰'}</button>
        ${alarm.active?`<button class="set-alarm-btn" style="margin-top:6px;background:var(--red-lt);color:var(--red);border-color:var(--red)" onclick="clearAlarm('${h.id}')">Remove alarm</button>`:''}
      </div>

      <div class="log-panel" id="log-panel-${h.id}" style="display:none">
        <div class="panel-section-lbl">✏️ Log today's ${h.name.toLowerCase()}</div>
        <div class="log-ampm-row">
          ${ampmPicker(`log-${h.id}-start`,'Start time','09:00')}
          <div class="ampm-arrow">→</div>
          ${ampmPicker(`log-${h.id}-end`,'End time','10:00')}
        </div>
        <div class="diff-display" id="diff-${h.id}"></div>
        <div class="dur-manual-row">
          <div class="ampm-field" style="flex:1">
            <label>Or enter duration (${h.unit})</label>
            <input type="number" id="dur-${h.id}" min="0" max="24" step="0.5" placeholder="e.g. 7.5" class="dur-input">
          </div>
        </div>
        <textarea class="log-note" id="note-${h.id}" rows="2" placeholder="Optional note…"></textarea>
        <button class="log-btn" style="margin-top:8px" onclick="logHabit('${h.id}')">Save log ✓</button>
      </div>`;
    wrap.appendChild(card);

    // wire up live diff updates
    ['h','m','am','pm'].forEach(s=>{
      const elS=document.getElementById(`log-${h.id}-start-${s==='am'?'am':s==='pm'?'pm':s}`);
      const elE=document.getElementById(`log-${h.id}-end-${s==='am'?'am':s==='pm'?'pm':s}`);
      if(elS)elS.addEventListener('input',()=>updateDiff(h.id));
      if(elE)elE.addEventListener('input',()=>updateDiff(h.id));
    });
  });
}

function toggleAlarmPanel(id){
  const p=document.getElementById('alarm-panel-'+id);
  const l=document.getElementById('log-panel-'+id);
  if(l)l.style.display='none';
  if(p)p.style.display=p.style.display==='none'?'block':'none';
}
function toggleLogPanel(id){
  const p=document.getElementById('log-panel-'+id);
  const a=document.getElementById('alarm-panel-'+id);
  if(a)a.style.display='none';
  if(p){
    p.style.display=p.style.display==='none'?'block':'none';
    if(p.style.display==='block') updateDiff(id);
  }
}
function setAlarmAmPm(id){
  const ud=getUserData();if(!ud)return;
  const from=getAmPmVal(`alarm-${id}-from`);
  const to=getAmPmVal(`alarm-${id}-to`);
  ud.alarms[id]={from,to,active:true};
  saveUserData();
  buildHabitCards();
  // re-open alarm panel
  setTimeout(()=>{ const p=document.getElementById('alarm-panel-'+id); if(p)p.style.display='block'; },50);
}
function clearAlarm(id){
  const ud=getUserData();if(!ud)return;
  ud.alarms[id]={active:false};
  saveUserData();
  buildHabitCards();
}

function toggleHabit(id){
  const ud=getUserData();if(!ud)return;
  ud.habitEnabled[id]=!ud.habitEnabled[id];
  saveUserData();
  buildHabitCards();
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
    ud.selectedSounds[habitId]='custom';
    saveUserData();
    const card=document.getElementById('habit-card-'+habitId);
    if(card){
      card.querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
      const upBtn=input.previousElementSibling;
      if(upBtn){upBtn.textContent='✅ '+file.name.substring(0,16);}
    }
    playSound('custom',e.target.result);
  };
  reader.readAsDataURL(file);
}

/* setAlarm replaced by setAlarmAmPm above */

function logHabit(id){
  const ud=getUserData();if(!ud)return;
  const dur=parseFloat(document.getElementById('dur-'+id).value)||0;
  const startT=getAmPmVal(`log-${id}-start`);
  const endT=getAmPmVal(`log-${id}-end`);
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
  document.getElementById('dur-'+id).value='';
  document.getElementById('note-'+id).value='';
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
  const todayStr=today.toISOString().split('T')[0];
  const ud=getUserData();
  const logDates=new Set(ud?ud.logs.map(l=>l.date):[]);
  const futureDates=new Set([...logDates].filter(d=>d>todayStr));

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
    if(futureDates.has(dateStr)) el.classList.add('has-plan');
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
  const d=new Date(dateStr+'T12:00:00');
  const todayStr=new Date().toISOString().split('T')[0];
  const isFuture=dateStr>todayStr;
  const opts={weekday:'long',month:'long',day:'numeric'};
  title.textContent=d.toLocaleDateString('en-US',opts)+(isFuture?' 🔮 — Planned':'');
  entries.innerHTML='';
  const dayLogs=(ud?ud.logs:[]).filter(l=>l.date===dateStr);
  const calEvts=importedCalEvents.filter(e=>e.date===dateStr);

  if(!dayLogs.length&&!calEvts.length){
    if(isFuture){
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0 4px">No plans yet. Go to <strong>Tracker</strong> and pick this date to schedule something.</div>
      <button class="log-btn" style="margin-top:6px" onclick="lfGoToDate('${dateStr}')">＋ Plan this day →</button>`;
    } else {
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">No logs recorded for this day.</div>`;
    }
    return;
  }

  dayLogs.forEach(l=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}${l.isQuickAlarm?'<span class="qa-history-badge">⏰ Alarm</span>':''}</div>
        <div class="log-entry-dur">${l.startTime?`${l.startTime}–${l.endTime||'?'} · `:''}${l.duration} ${l.unit}</div>
        ${l.note?`<div class="log-entry-note">💬 ${l.note}</div>`:''}
      </div>
      <button onclick="deleteLog(${l.id})" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
    entries.appendChild(item);
  });
  calEvts.forEach(e=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">📅</div><div class="log-entry-meta"><div class="log-entry-habit">${e.title}</div><div class="log-entry-dur">Calendar event</div></div>`;
    entries.appendChild(item);
  });
  if(isFuture){
    const addBtn=document.createElement('button');
    addBtn.className='log-btn';
    addBtn.style.marginTop='8px';
    addBtn.textContent='＋ Add more to this day →';
    addBtn.onclick=()=>lfGoToDate(dateStr);
    entries.appendChild(addBtn);
  }
}

/* ═══════════════════════════════════════
   CALENDAR 2  (mini, inside Tracker tab)
═══════════════════════════════════════ */
let cal2Year=new Date().getFullYear();
let cal2Month=new Date().getMonth();
let selectedDay2=null;

function changeMonth2(delta){
  cal2Month+=delta;
  if(cal2Month>11){cal2Month=0;cal2Year++;}
  if(cal2Month<0){cal2Month=11;cal2Year--;}
  renderCalendar2();
}

function renderCalendar2(){
  const label=document.getElementById('cal2-month-label');
  const grid=document.getElementById('cal2-grid');
  if(!label||!grid)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  label.textContent=months[cal2Month]+' '+cal2Year;
  grid.innerHTML='';
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  days.forEach(d=>{const el=document.createElement('div');el.className='cal-day-name';el.textContent=d;grid.appendChild(el);});
  const first=new Date(cal2Year,cal2Month,1).getDay();
  const daysInMonth=new Date(cal2Year,cal2Month+1,0).getDate();
  const today=new Date();
  const ud=getUserData();
  const logDates=new Set(ud?ud.logs.map(l=>l.date):[]);
  for(let i=0;i<first;i++){const el=document.createElement('div');el.className='cal-day other-month';el.textContent=new Date(cal2Year,cal2Month,-(first-i-1)).getDate();grid.appendChild(el);}
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${cal2Year}-${String(cal2Month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el=document.createElement('div');
    el.className='cal-day';
    el.textContent=d;
    if(today.getFullYear()===cal2Year&&today.getMonth()===cal2Month&&today.getDate()===d) el.classList.add('today');
    if(logDates.has(dateStr)) el.classList.add('has-log');
    if(selectedDay2===dateStr) el.classList.add('selected');
    el.onclick=()=>{selectedDay2=dateStr;renderCalendar2();showDayLogs2(dateStr);};
    grid.appendChild(el);
  }
  if(selectedDay2)showDayLogs2(selectedDay2);
}

function showDayLogs2(dateStr){
  const panel=document.getElementById('day2-log-panel');
  const title=document.getElementById('day2-log-title');
  const entries=document.getElementById('day2-log-entries');
  if(!panel||!title||!entries)return;
  panel.style.display='block';
  const d=new Date(dateStr+'T12:00:00');
  const isToday=dateStr===new Date().toISOString().split('T')[0];
  const isFuture=dateStr>new Date().toISOString().split('T')[0];
  title.textContent=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})+(isFuture?' 🔮':'');
  entries.innerHTML='';
  const ud=getUserData();
  const dayLogs=(ud?ud.logs:[]).filter(l=>l.date===dateStr);
  if(!dayLogs.length){
    if(isFuture){
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">No plans yet for this day. Use the log form above to schedule an activity.</div>`;
    } else {
      entries.innerHTML=`<div style="font-size:13px;color:var(--hint);padding:8px 0">Nothing logged for this day.</div>`;
    }
    return;
  }
  dayLogs.forEach(l=>{
    const item=document.createElement('div');
    item.className='log-entry-item';
    item.innerHTML=`<div class="log-entry-icon">${l.habitIcon}</div>
      <div class="log-entry-meta">
        <div class="log-entry-habit">${l.habitName}</div>
        <div class="log-entry-dur">${l.startTime?`${l.startTime}–${l.endTime||'?'} · `:''}${l.duration} ${l.unit}</div>
        ${l.note?`<div class="log-entry-note">💬 ${l.note}</div>`:''}
      </div>
      <button onclick="deleteLog(${l.id})" style="background:none;border:none;cursor:pointer;color:var(--hint);font-size:16px;padding:2px 4px;flex-shrink:0" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--hint)'">🗑</button>`;
    entries.appendChild(item);
  });
}

/* ═══════════════════════════════════════
   NEW LOG FORM  (Tracker tab)
═══════════════════════════════════════ */
let _lfCat='';
let _lfIcon='📋';
let _lfSound='bell';
let _lfCustomSound=null;

// Habit id map for trends compatibility
const LF_CAT_HABIT_MAP={
  'Sleep':'sleep','Work':'work','Exercise':'exercise','Screen Use':'screen',
  'Reading':'reading','Meditation':'meditation','Meals':'meals','Studies':'studies'
};
const LF_CAT_UNIT_MAP={
  'Sleep':'hrs','Work':'hrs','Screen Use':'hrs','Meals':'hrs',
  'Exercise':'mins','Reading':'mins','Meditation':'mins','Studies':'mins'
};

function lfInit(){
  // Set today's date
  const dateEl=document.getElementById('lf-date');
  if(dateEl) dateEl.value=new Date().toISOString().split('T')[0];
  // Wire live diff
  ['lf-start-h','lf-start-m','lf-end-h','lf-end-m'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener('input',lfUpdateDiff);
  });
  lfUpdateDiff();
}

document.addEventListener('DOMContentLoaded', lfInit);

function lfSetAmPm(side,val){
  document.getElementById(`lf-${side}-am`).classList.toggle('sel',val==='AM');
  document.getElementById(`lf-${side}-pm`).classList.toggle('sel',val==='PM');
  lfUpdateDiff();
}
function _lfGetTime(side){
  const h=document.getElementById(`lf-${side}-h`).value||'8';
  const m=document.getElementById(`lf-${side}-m`).value||'00';
  const isAM=document.getElementById(`lf-${side}-am`).classList.contains('sel');
  return to24(h,m,isAM?'AM':'PM');
}
function lfUpdateDiff(){
  const from=_lfGetTime('start');
  const to=_lfGetTime('end');
  const diff=calcDiff(from,to);
  const el=document.getElementById('lf-diff');
  if(el) el.textContent=diff?`⏱ Duration: ${diff}`:'';
}
function lfSelectCat(btn){
  document.getElementById('lf-cats').querySelectorAll('.lf-cat-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _lfCat=btn.dataset.cat;
  _lfIcon=btn.dataset.icon||'📋';
  const customInput=document.getElementById('lf-custom');
  if(!_lfCat){customInput.style.display='block';customInput.focus();}
  else{customInput.style.display='none';customInput.value='';}
}
function lfCustomTyped(){
  _lfCat='';
  document.getElementById('lf-cats').querySelectorAll('.lf-cat-btn').forEach(b=>b.classList.remove('sel'));
}
function lfToggleReminder(){
  const checked=document.getElementById('lf-reminder-check').checked;
  document.getElementById('lf-reminder-sound').style.display=checked?'block':'none';
}
function lfSelectSound(btn){
  btn.closest('.sound-opts').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _lfSound=btn.dataset.sound;
  _lfCustomSound=null;
  playSound(_lfSound,null);
}
function lfUploadSound(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{_lfCustomSound=e.target.result;_lfSound='custom';playSound('custom',_lfCustomSound);};
  reader.readAsDataURL(file);
}
function lfSaveLog(){
  const customText=document.getElementById('lf-custom').value.trim();
  const cat=customText||_lfCat;
  const icon=customText?'✍':_lfIcon;
  const msg=document.getElementById('lf-msg');
  const dateVal=document.getElementById('lf-date').value;

  if(!cat){msg.textContent='Please pick a category.';msg.className='auth-msg err';return;}
  if(!dateVal){msg.textContent='Please pick a date.';msg.className='auth-msg err';return;}

  const from=_lfGetTime('start');
  const to=_lfGetTime('end');
  const diff=calcDiff(from,to);
  const [h1,m1]=from.split(':').map(Number);
  const [h2,m2]=to.split(':').map(Number);
  let durationMins=(h2*60+m2)-(h1*60+m1);
  if(durationMins<0)durationMins+=1440;
  const unit=LF_CAT_UNIT_MAP[cat]||'hrs';
  const duration=unit==='hrs'?+(durationMins/60).toFixed(2):durationMins;
  const habitId=LF_CAT_HABIT_MAP[cat]||cat.toLowerCase().replace(/\s+/g,'-');

  const ud=getUserData();if(!ud)return;

  const entry={
    id:Date.now(),
    habitId,
    habitName:cat,
    habitIcon:icon,
    date:dateVal,
    duration,
    unit,
    startTime:_aaFmtDisplay?_aaFmtDisplay(from):from,
    endTime:_aaFmtDisplay?_aaFmtDisplay(to):to,
    note:document.getElementById('lf-note').value.trim()
  };
  ud.logs.push(entry);

  // If reminder checked, save alarm
  const hasReminder=document.getElementById('lf-reminder-check').checked;
  if(hasReminder){
    if(!ud.quickAlarms)ud.quickAlarms=[];
    ud.quickAlarms.push({
      id:entry.id,date:dateVal,fromTime:from,toTime:to,
      fromDisplay:entry.startTime,toDisplay:entry.endTime,
      duration:diff||'—',durationMins,durationHrs:+(durationMins/60).toFixed(2),
      category:cat,sound:_lfSound,createdAt:new Date().toISOString()
    });
    _scheduleQuickAlarm({id:entry.id,date:dateVal,fromTime:from,toTime:to,
      fromDisplay:entry.startTime,toDisplay:entry.endTime,
      duration:diff||'—',category:cat,sound:_lfSound});
  }

  saveUserData();

  msg.textContent=`✅ Logged! ${cat} · ${diff||duration+' '+unit}`;
  msg.className='auth-msg ok';

  // Reset form partially
  document.getElementById('lf-note').value='';
  document.getElementById('lf-reminder-check').checked=false;
  document.getElementById('lf-reminder-sound').style.display='none';

  renderCalendar2();
  renderCalendar();
  renderTrends();
  renderHistory();

  // Show it on mini cal
  selectedDay2=dateVal;
  cal2Year=parseInt(dateVal.split('-')[0]);
  cal2Month=parseInt(dateVal.split('-')[1])-1;
  renderCalendar2();

  setTimeout(()=>{msg.textContent='';msg.className='auth-msg';},3000);
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
  Object.values(chartInstances).forEach(c=>{try{c.destroy();}catch(e){}});
  chartInstances={};
  content.innerHTML='';

  const byHabit={};
  ud.logs.forEach(l=>{
    if(!byHabit[l.habitId])byHabit[l.habitId]={name:l.habitName,icon:l.habitIcon,unit:l.unit,data:[]};
    byHabit[l.habitId].data.push({date:l.date,duration:l.duration});
  });

  if(ud.checkInHistory.length>0){
    const scoreCard=buildScoreChart(ud.checkInHistory);
    content.appendChild(scoreCard);
  }

  HABITS.forEach(h=>{
    const hData=byHabit[h.id];
    if(!hData)return;
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
  const labels=dates.map(d=>new Date(d+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}));
  const canvasId='chart-'+habit.id;
  const avgVal=trend.avg.toFixed(1);
  const rec=getHabitRec(habit.id,trend,unit);

  // build linear trendline points
  const n=vals.length;
  let trendData=[];
  if(n>=2){
    const sumX=vals.reduce((_,__,i)=>_+i,0);
    const sumY=vals.reduce((a,b)=>a+b,0);
    const sumXY=vals.reduce((a,b,i)=>a+i*b,0);
    const sumXX=vals.reduce((a,_,i)=>a+i*i,0);
    const slope=(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX);
    const intercept=(sumY-slope*sumX)/n;
    trendData=vals.map((_,i)=>parseFloat((intercept+slope*i).toFixed(2)));
  }

  // duration-diff analysis: find start/end log entries for this habit
  const ud=getUserData();
  const diffLogs=(ud?.logs||[]).filter(l=>l.habitId===habit.id&&l.startTime&&l.endTime);
  let diffHTML='';
  if(diffLogs.length>=1){
    const diffs=diffLogs.map(l=>{
      const diff=calcDiff(l.startTime,l.endTime);
      return{date:l.date,diff,start:l.startTime,end:l.endTime};
    }).filter(d=>d.diff);
    if(diffs.length){
      const last=diffs[diffs.length-1];
      const fmt=(t)=>{const f=fmt12(t);return `${f.h}:${f.m} ${f.ampm}`;};
      diffHTML=`<div class="diff-analysis">
        <span class="diff-chip">Last session: ${fmt(last.start)} → ${fmt(last.end)} <strong>${last.diff}</strong></span>
        ${diffs.length>1?`<span class="diff-chip muted">Sessions logged: ${diffs.length}</span>`:''}
      </div>`;
    }
  }

  card.innerHTML=`
    <div class="chart-title">${habit.icon} ${habit.name}</div>
    <div class="chart-sub">Daily ${unit} logged · avg <strong>${avgVal} ${unit}</strong></div>
    <div style="position:relative;width:100%;height:170px"><canvas id="${canvasId}"></canvas></div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px">
      <div class="trend-badge ${trend.dir}">
        ${trend.dir==='up'?'↑ Trending up':trend.dir==='down'?'↓ Trending down':'→ Stable'}
      </div>
      <span class="trendline-legend"><span class="trendline-dot"></span> Trendline</span>
    </div>
    ${diffHTML}
    ${rec?`<div class="chart-rec">${rec}</div>`:''}`;

  setTimeout(()=>{
    const ctx=document.getElementById(canvasId);
    if(!ctx)return;
    const color=habit.color||'#1D9E75';
    const datasets=[{
      label:habit.name,
      data:vals,
      borderColor:color,
      backgroundColor:color+'18',
      pointBackgroundColor:color,
      pointRadius:4,
      tension:.35,
      fill:true,
      order:2
    }];
    if(trendData.length){
      datasets.push({
        label:'Trend',
        data:trendData,
        borderColor:color,
        borderWidth:2,
        borderDash:[6,4],
        pointRadius:0,
        tension:0,
        fill:false,
        backgroundColor:'transparent',
        order:1
      });
    }
    chartInstances[habit.id]=new Chart(ctx,{
      type:'line',
      data:{labels,datasets},
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label==='Trend'?'Trend: ':''}${ctx.parsed.y} ${unit}`}}
        },
        scales:{y:{min:0,ticks:{maxTicksLimit:5}}}
      }
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

  if (newUsername !== currentUser.username && users[newUsername]) return err('That username is already taken.');

  if (newPass || newPass2) {
    if (newPass.length < 6) return err('New password must be at least 6 characters.');
    if (newPass !== newPass2) return err('New passwords do not match.');
  }

  const finalPass = newPass || u.pass;

  if (newUsername !== currentUser.username) {
    const existingData = localStorage.getItem('qt_data_' + currentUser.username);
    if (existingData) {
      localStorage.setItem('qt_data_' + newUsername, existingData);
      localStorage.removeItem('qt_data_' + currentUser.username);
    }
    delete users[currentUser.username];
  }

  users[newUsername] = {
    name: newName,
    pass: finalPass,
    joinedAt: u.joinedAt || new Date().toISOString(),
    lastChanged: new Date().toISOString()
  };
  _saveUsers(users);

  currentUser = { username: newUsername, name: newName };
  localStorage.setItem('qt_session', JSON.stringify({ username: newUsername }));

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
  localStorage.removeItem('qt_data_' + currentUser.username);
  localStorage.removeItem('qt_session');
  delete users[currentUser.username];
  _saveUsers(users);
  currentUser = null;
  _currentData = null;
  location.reload();
}

function lfGoToDate(dateStr){
  showTab('tracker');
  setTimeout(()=>{
    const dateEl=document.getElementById('lf-date');
    if(dateEl){dateEl.value=dateStr;}
    cal2Year=parseInt(dateStr.split('-')[0]);
    cal2Month=parseInt(dateStr.split('-')[1])-1;
    selectedDay2=dateStr;
    renderCalendar2();
    document.getElementById('log-form-card').scrollIntoView({behavior:'smooth'});
  },100);
}
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

  const habitIds = [...new Set(ud.logs.map(l => l.habitId))];
  filterWrap.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'sound-btn' + (historyFilter === 'all' ? ' sel' : '');
  allBtn.textContent = '🗂 All';
  allBtn.onclick = () => { historyFilter = 'all'; renderHistory(); };
  filterWrap.appendChild(allBtn);

  // Build unique categories from logs (not from old HABITS array)
  const seen = new Set();
  ud.logs.forEach(l => {
    if(seen.has(l.habitId)) return;
    seen.add(l.habitId);
    const btn = document.createElement('button');
    btn.className = 'sound-btn' + (historyFilter === l.habitId ? ' sel' : '');
    btn.textContent = l.habitIcon + ' ' + l.habitName;
    btn.onclick = () => { historyFilter = l.habitId; renderHistory(); };
    filterWrap.appendChild(btn);
  });

  const logs = ud.logs
    .filter(l => historyFilter === 'all' || l.habitId === historyFilter)
    .slice()
    .sort((a, b) => b.id - a.id);

  const byDate = {};
  logs.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });

  content.innerHTML = '';
  Object.keys(byDate).sort((a,b) => b.localeCompare(a)).forEach(dateStr => {
    const heading = document.createElement('div');
    const d = new Date(dateStr + 'T12:00:00');
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    const isYesterday = dateStr === new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const label = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'});
    heading.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);letter-spacing:.07em;text-transform:uppercase;padding:16px 0 8px;border-top:.5px solid var(--border);margin-top:4px">${label}</div>`;
    content.appendChild(heading);

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
  renderCalendar2();
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
/* ═══════════════════════════════════════
   ADD ALARM MODAL  (floating + button)
═══════════════════════════════════════ */

// Category icons map for display
const AA_CAT_ICONS = {
  'Studies':'📚','Sleep':'😴','Screen Use':'📱','Exercise':'🏃','Meals':'🍽','Other':'✍'
};

// State for the add-alarm modal
let _aaSound = 'bell';
let _aaCustomSoundData = null;
let _aaSelectedCat = '';

function openAddAlarmModal() {
  _aaSound = 'bell';
  _aaCustomSoundData = null;
  _aaSelectedCat = '';

  // Reset fields
  document.getElementById('aa-from-h').value = '8';
  document.getElementById('aa-from-m').value = '00';
  document.getElementById('aa-to-h').value = '9';
  document.getElementById('aa-to-m').value = '00';
  aaSetAmPm('from','AM');
  aaSetAmPm('to','AM');
  document.getElementById('aa-custom-activity').value = '';
  document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  const bellBtn = document.querySelector('#aa-sounds [data-sound="bell"]');
  if(bellBtn) bellBtn.classList.add('sel');
  const msg = document.getElementById('aa-msg');
  msg.textContent=''; msg.className='auth-msg';
  _aaDurationUpdate();
  document.getElementById('add-alarm-modal').style.display = 'flex';
}

function closeAddAlarmModal() {
  document.getElementById('add-alarm-modal').style.display = 'none';
}

function aaSetAmPm(side, val) {
  document.getElementById(`aa-${side}-am`).classList.toggle('sel', val==='AM');
  document.getElementById(`aa-${side}-pm`).classList.toggle('sel', val==='PM');
  _aaDurationUpdate();
}

function _aaGetTime(side) {
  const h = document.getElementById(`aa-${side}-h`).value;
  const m = document.getElementById(`aa-${side}-m`).value;
  const isAM = document.getElementById(`aa-${side}-am`).classList.contains('sel');
  return to24(h, m, isAM ? 'AM' : 'PM');
}

function _aaDurationUpdate() {
  const from = _aaGetTime('from');
  const to   = _aaGetTime('to');
  const disp = document.getElementById('aa-duration-display');
  if(!disp) return;
  const diff = calcDiff(from, to);
  disp.textContent = diff ? `Total Duration: ${diff}` : 'Total Duration: —';
}

// Wire live updates once DOM ready
document.addEventListener('DOMContentLoaded', function() {
  ['aa-from-h','aa-from-m','aa-to-h','aa-to-m'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', _aaDurationUpdate);
  });
});

function aaSelectCat(btn) {
  document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _aaSelectedCat = btn.dataset.cat;
  // Clear custom text if a preset is chosen
  document.getElementById('aa-custom-activity').value = '';
}

function aaClearCatIfTyping() {
  // If user types in custom field, deselect any preset category
  if(document.getElementById('aa-custom-activity').value.trim()) {
    document.getElementById('aa-categories').querySelectorAll('.aa-cat-btn').forEach(b=>b.classList.remove('sel'));
    _aaSelectedCat = '';
  }
}

function aaSelectSound(btn) {
  document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  _aaSound = btn.dataset.sound;
  _aaCustomSoundData = null;
  playSound(_aaSound, null);
}

function aaUploadSound(input) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _aaCustomSoundData = e.target.result;
    _aaSound = 'custom';
    document.getElementById('aa-sounds').querySelectorAll('.sound-btn').forEach(b=>b.classList.remove('sel'));
    input.previousElementSibling.textContent = '✅ ' + file.name.substring(0,16);
    playSound('custom', _aaCustomSoundData);
  };
  reader.readAsDataURL(file);
}

function saveAddAlarm() {
  const from = _aaGetTime('from');
  const to   = _aaGetTime('to');
  const customText = document.getElementById('aa-custom-activity').value.trim();
  const category = customText || _aaSelectedCat;
  const msg = document.getElementById('aa-msg');

  if(!category) {
    msg.textContent = 'Please select a category or enter a custom activity.';
    msg.className = 'auth-msg err';
    return;
  }

  const diff = calcDiff(from, to);
  const fromDisplay = _aaFmtDisplay(from);
  const toDisplay   = _aaFmtDisplay(to);

  // Calculate duration in minutes for data
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let durationMins = (h2*60+m2) - (h1*60+m1);
  if(durationMins < 0) durationMins += 1440;
  const durationHrs = +(durationMins/60).toFixed(2);

  const ud = getUserData();
  if(!ud) { msg.textContent='Please sign in first.'; msg.className='auth-msg err'; return; }

  // Ensure quickAlarms array exists
  if(!ud.quickAlarms) ud.quickAlarms = [];

  const entry = {
    id: Date.now(),
    date: new Date().toISOString().split('T')[0],
    fromTime: from,
    toTime: to,
    fromDisplay,
    toDisplay,
    duration: diff || '—',
    durationMins,
    durationHrs,
    category,
    isCustomCategory: !!customText,
    sound: _aaSound,
    createdAt: new Date().toISOString()
  };

  ud.quickAlarms.push(entry);

  // Also push into logs array so it shows in History and Trends
  const catIcon = AA_CAT_ICONS[category] || '⏰';
  ud.logs.push({
    id: entry.id,
    habitId: 'quickalarm',
    habitName: category,
    habitIcon: catIcon,
    date: entry.date,
    duration: durationHrs,
    unit: 'hrs',
    startTime: fromDisplay,
    endTime: toDisplay,
    note: `Quick Alarm · ${diff||'—'} · Sound: ${_aaSound}`,
    isQuickAlarm: true
  });

  saveUserData();

  // Schedule the alarm notification
  _scheduleQuickAlarm(entry);

  msg.textContent = `✅ Alarm saved! ${fromDisplay} → ${toDisplay} · ${diff||'—'}`;
  msg.className = 'auth-msg ok';

  renderHistory();
  renderTrends();
  renderCalendar();

  setTimeout(()=>{ closeAddAlarmModal(); }, 1400);
}

function _aaFmtDisplay(time24) {
  const f = fmt12(time24);
  return `${f.h}:${f.m} ${f.ampm}`;
}

/* ── Quick Alarm scheduler ── */
let _qaTimers = [];

function _scheduleQuickAlarm(entry) {
  const now = new Date();
  const [fh, fm] = entry.fromTime.split(':').map(Number);
  const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), fh, fm, 0);
  let delay = alarmTime - now;
  if(delay < 0) delay += 86400000; // tomorrow
  if(delay > 86400000) return; // more than a day away, skip for now

  const t = setTimeout(() => {
    const ud = getUserData();
    const sound  = entry.sound;
    const custom = (ud && ud.customSounds) ? ud.customSounds['quickalarm'] : null;
    playSound(sound === 'custom' ? 'custom' : sound, sound === 'custom' ? custom || _aaCustomSoundData : null);

    const catIcon = AA_CAT_ICONS[entry.category] || '⏰';
    document.getElementById('alarm-modal-icon').textContent = catIcon;
    document.getElementById('alarm-modal-title').textContent = `Time for ${entry.category}!`;
    document.getElementById('alarm-modal-sub').textContent = `${entry.fromDisplay} → ${entry.toDisplay} · ${entry.duration}`;
    document.getElementById('alarm-modal').style.display = 'flex';
    currentAlarmHabit = { id: 'quickalarm', name: entry.category };
  }, delay);
  _qaTimers.push(t);
}

/* Extend renderTrends to include Quick Alarm data by category */
const _origRenderTrends = renderTrends;
renderTrends = function() {
  _origRenderTrends();
  _renderQuickAlarmTrends();
};

function _renderQuickAlarmTrends() {
  const ud = getUserData();
  if(!ud || !ud.quickAlarms || !ud.quickAlarms.length) return;
  const content = document.getElementById('trends-content');
  if(!content) return;

  // Group by category
  const byCat = {};
  ud.quickAlarms.forEach(a => {
    if(!byCat[a.category]) byCat[a.category] = [];
    byCat[a.category].push(a);
  });

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--hint);text-transform:uppercase;letter-spacing:.08em;padding:12px 0 8px;border-top:.5px solid var(--border);margin-top:8px">⏰ Quick Alarm Activity</div>`;

  Object.entries(byCat).forEach(([cat, alarms]) => {
    const totalMins = alarms.reduce((s,a)=>s+(a.durationMins||0), 0);
    const totalHrs = (totalMins/60).toFixed(1);
    const avgMins = Math.round(totalMins / alarms.length);
    const catIcon = AA_CAT_ICONS[cat] || '⏰';

    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="chart-title">${catIcon} ${cat}</div>
      <div class="chart-sub">${alarms.length} session${alarms.length>1?'s':''} logged via Quick Alarm</div>
      <div class="diff-analysis">
        <div class="diff-chip"><strong>${totalHrs}h</strong> total</div>
        <div class="diff-chip"><strong>${avgMins}m</strong> avg/session</div>
        <div class="diff-chip muted">${alarms.length} alarm${alarms.length>1?'s':''}</div>
      </div>
      <div class="chart-rec" style="margin-top:10px">
        ${_qaInsight(cat, avgMins, alarms.length)}
      </div>`;
    wrapper.appendChild(card);
  });

  content.appendChild(wrapper);
}

function _qaInsight(cat, avgMins, count) {
  const insights = {
    'Studies': avgMins >= 60
      ? `<strong>Great focus sessions!</strong> Averaging ${avgMins} minutes of study. Consistent sessions like this build deep learning habits.`
      : `<strong>Short bursts of study</strong> (avg ${avgMins} min). Try extending to 45–60 min sessions for deeper focus.`,
    'Sleep': avgMins >= 420
      ? `<strong>Good sleep duration</strong> — averaging ${(avgMins/60).toFixed(1)} hours. Consistency is key; try keeping the same bedtime.`
      : `<strong>Sleep may be short</strong> (avg ${(avgMins/60).toFixed(1)} hrs). Most adults need 7–9 hours for full recovery.`,
    'Screen Use': avgMins <= 60
      ? `<strong>Healthy screen time!</strong> Keeping it to ${avgMins} min average is great for eye health and sleep.`
      : `<strong>Screen time is high</strong> (avg ${(avgMins/60).toFixed(1)} hrs). Consider screen-free windows, especially before bed.`,
    'Exercise': avgMins >= 30
      ? `<strong>Active lifestyle!</strong> ${avgMins} min sessions meet the WHO recommended 150 min/week goal.`
      : `<strong>Keep building!</strong> Aim for 30+ min sessions. Even short workouts add up over ${count} sessions.`,
    'Meals': avgMins <= 30
      ? `<strong>Mindful meal timing.</strong> Logging meals helps you stay aware of eating patterns.`
      : `<strong>Long meal windows</strong> (avg ${avgMins} min). Consider whether relaxed meals are intentional or distracted eating.`,
  };
  return insights[cat] || `<strong>${count} logged sessions</strong> for "${cat}". Keep tracking to reveal patterns over time.`;
}

/* Also extend History so Quick Alarm entries show their badge */
const _origRenderHistory = renderHistory;
renderHistory = function() {
  _origRenderHistory();
  // After rendering, add filter button for Quick Alarms if any exist
  const ud = getUserData();
  if(!ud || !ud.quickAlarms || !ud.quickAlarms.length) return;
  const filterWrap = document.getElementById('history-filter');
  if(!filterWrap) return;
  // Check if a QA filter button already exists
  if(filterWrap.querySelector('[data-qa-filter]')) return;
  const btn = document.createElement('button');
  btn.className = 'sound-btn' + (historyFilter === 'quickalarm' ? ' sel' : '');
  btn.textContent = '⏰ Quick Alarm';
  btn.setAttribute('data-qa-filter','1');
  btn.onclick = () => { historyFilter = 'quickalarm'; renderHistory(); };
  filterWrap.appendChild(btn);
};
/* ═══════════════════════════════════════
   SCHEDULE TRACKER  –  new tracker tab
═══════════════════════════════════════ */

const SC_CAT_ICONS = {
  'Sleep':'🌙','Work':'💻','Exercise':'🏃','Studies':'📚',
  'Meals':'🍽','Screen Use':'📱','Reading':'📖','Meditation':'🧘','Other':'✍'
};

let _scSelectedCat = '';
let _scEditId = null;   // null = new, else ID of schedule being edited

/* ── Helpers ── */
function _scFmt12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function _scGet24(prefix) {
  const hEl = document.getElementById(`sc-${prefix}-h`);
  const mEl = document.getElementById(`sc-${prefix}-m`);
  const amBtn = document.getElementById(`sc-${prefix}-am`);
  let h = parseInt(hEl.value) || 12;
  const m = parseInt(mEl.value) || 0;
  const isAM = amBtn.classList.contains('sel');
  if (isAM && h === 12) h = 0;
  if (!isAM && h !== 12) h += 12;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function _scSet12(prefix, time24) {
  const [h, m] = time24.split(':').map(Number);
  const isAM = h < 12;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  document.getElementById(`sc-${prefix}-h`).value = h12;
  document.getElementById(`sc-${prefix}-m`).value = String(m).padStart(2,'0');
  document.getElementById(`sc-${prefix}-am`).classList.toggle('sel', isAM);
  document.getElementById(`sc-${prefix}-pm`).classList.toggle('sel', !isAM);
}
function scSetAmPm(prefix, val) {
  document.getElementById(`sc-${prefix}-am`).classList.toggle('sel', val==='AM');
  document.getElementById(`sc-${prefix}-pm`).classList.toggle('sel', val==='PM');
  _scUpdateDuration();
}
function _scUpdateDuration() {
  const from = _scGet24('from');
  const to   = _scGet24('to');
  const disp = document.getElementById('sc-duration-display');
  if (!disp) return;
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let diff = (h2*60+m2) - (h1*60+m1);
  if (diff < 0) diff += 1440;
  const hrs = Math.floor(diff/60);
  const mins = diff % 60;
  disp.textContent = diff === 0 ? 'Total Duration: —'
    : `Total Duration: ${hrs > 0 ? hrs+'h ' : ''}${mins > 0 ? mins+'m' : ''}`;
}

// Wire duration watchers after DOM
document.addEventListener('DOMContentLoaded', function() {
  ['sc-from-h','sc-from-m','sc-to-h','sc-to-m'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _scUpdateDuration);
  });
});

function scSelectCat(btn) {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  _scSelectedCat = btn.dataset.cat;
  document.getElementById('sc-custom-activity').value = '';
}
function scClearCatIfTyping() {
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  _scSelectedCat = '';
}

function scSetDate(rel) {
  const d = new Date();
  if (rel === 'tomorrow') d.setDate(d.getDate() + 1);
  if (rel === 'next-week') d.setDate(d.getDate() + 7);
  document.getElementById('sc-date').value = d.toISOString().split('T')[0];
}

/* ── Open / Close modal ── */
function openScheduleModal(editId) {
  _scEditId = editId || null;
  const modal = document.getElementById('schedule-modal');
  const titleEl = document.getElementById('schedule-modal-title');
  const saveBtnEl = document.getElementById('sc-save-btn');

  // Reset
  document.querySelectorAll('#sc-categories .aa-cat-btn').forEach(b => b.classList.remove('sel'));
  _scSelectedCat = '';
  document.getElementById('sc-custom-activity').value = '';
  _scTasks = [];
  _scRenderChecklist();
  document.getElementById('sc-task-input').value = '';
  document.getElementById('sc-msg').textContent = '';
  document.getElementById('sc-msg').className = 'auth-msg';

  if (editId) {
    // Load existing
    titleEl.textContent = '✏️ Edit Schedule';
    saveBtnEl.textContent = '💾 Update Schedule';
    const ud = getUserData();
    const sc = (ud.schedules || []).find(s => s.id === editId);
    if (sc) {
      document.getElementById('sc-date').value = sc.date;
      _scSet12('from', sc.fromTime);
      _scSet12('to', sc.toTime);
      _scTasks = sc.tasks ? JSON.parse(JSON.stringify(sc.tasks)) : [];
      _scRenderChecklist();
      const customText = SC_CAT_ICONS[sc.category] ? '' : sc.category;
      if (customText) {
        document.getElementById('sc-custom-activity').value = sc.category;
      } else {
        const catBtn = document.querySelector(`#sc-categories .aa-cat-btn[data-cat="${sc.category}"]`);
        if (catBtn) { catBtn.classList.add('sel'); _scSelectedCat = sc.category; }
      }
    }
  } else {
    titleEl.textContent = '📅 Add Schedule';
    saveBtnEl.textContent = '💾 Save Schedule';
    // default to today
    document.getElementById('sc-date').value = new Date().toISOString().split('T')[0];
    _scSet12('from', '08:00');
    _scSet12('to', '09:00');
  }
  _scUpdateDuration();
  modal.style.display = 'flex';
}

function closeScheduleModal() {
  document.getElementById('schedule-modal').style.display = 'none';
}

/* ── Save / Update ── */
function saveSchedule() {
  const customText = document.getElementById('sc-custom-activity').value.trim();
  const category = customText || _scSelectedCat;
  const date = document.getElementById('sc-date').value;
  const tasks = _scTasks.map(t => ({...t}));  // snapshot
  const msgEl = document.getElementById('sc-msg');

  if (!category) {
    msgEl.textContent = 'Please select an activity or enter a custom one.';
    msgEl.className = 'auth-msg err';
    return;
  }
  if (!date) {
    msgEl.textContent = 'Please choose a date.';
    msgEl.className = 'auth-msg err';
    return;
  }

  const from = _scGet24('from');
  const to   = _scGet24('to');
  const [h1,m1] = from.split(':').map(Number);
  const [h2,m2] = to.split(':').map(Number);
  let durationMins = (h2*60+m2) - (h1*60+m1);
  if (durationMins < 0) durationMins += 1440;

  const ud = getUserData();
  if (!ud.schedules) ud.schedules = [];

  if (_scEditId) {
    // Update existing
    const idx = ud.schedules.findIndex(s => s.id === _scEditId);
    if (idx !== -1) {
      ud.schedules[idx] = { ...ud.schedules[idx], category, date, fromTime: from, toTime: to, durationMins, tasks, updatedAt: new Date().toISOString() };
    }
    msgEl.textContent = '✅ Schedule updated!';
  } else {
    // New
    const entry = {
      id: Date.now(),
      category,
      date,
      fromTime: from,
      toTime: to,
      durationMins,
      tasks,
      createdAt: new Date().toISOString()
    };
    ud.schedules.push(entry);
    msgEl.textContent = '✅ Schedule saved!';
  }

  msgEl.className = 'auth-msg ok';
  saveUserData();
  renderTrackerSchedules();
  setTimeout(() => closeScheduleModal(), 900);
}

/* ── Delete ── */
function deleteSchedule(id) {
  if (!confirm('Remove this schedule?')) return;
  const ud = getUserData();
  ud.schedules = (ud.schedules || []).filter(s => s.id !== id);
  saveUserData();
  renderTrackerSchedules();
}

/* ── Render ── */
function renderTrackerSchedules() {
  const ud = getUserData();
  const schedules = (ud && ud.schedules) ? [...ud.schedules] : [];
  const emptyState = document.getElementById('tracker-empty-state');
  const listWrap = document.getElementById('tracker-schedules-wrap');
  const listEl = document.getElementById('tracker-schedule-list');

  if (!schedules.length) {
    emptyState.style.display = 'flex';
    listWrap.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  listWrap.style.display = 'block';
  listEl.innerHTML = '';

  // Sort by date then time
  schedules.sort((a, b) => (a.date + a.fromTime).localeCompare(b.date + b.fromTime));

  // Group by date
  const groups = {};
  schedules.forEach(sc => {
    if (!groups[sc.date]) groups[sc.date] = [];
    groups[sc.date].push(sc);
  });

  const today = new Date().toISOString().split('T')[0];

  Object.keys(groups).sort().forEach(date => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'schedule-date-group';

    const d = new Date(date + 'T00:00:00');
    const label = date === today ? 'Today'
      : date > today ? _formatDateLabel(d)
      : _formatDateLabel(d) + ' (past)';

    groupDiv.innerHTML = `<div class="schedule-date-group-label">${label}</div>`;

    groups[date].forEach(sc => {
      const icon = SC_CAT_ICONS[sc.category] || '📌';
      const fromDisp = _scFmt12(sc.fromTime);
      const toDisp   = _scFmt12(sc.toTime);
      const hrs = Math.floor(sc.durationMins/60);
      const mins = sc.durationMins % 60;
      const durStr = (hrs > 0 ? hrs+'h ' : '') + (mins > 0 ? mins+'m' : '');

      const badgeClass = date > today ? 'future' : date === today ? 'today' : 'past';
      const badgeText  = date > today ? '📆 Upcoming' : date === today ? '📍 Today' : '✔ Past';

      const card = document.createElement('div');
      card.className = 'schedule-card';
      card.dataset.id = sc.id;

      // Build tasks HTML
      let tasksHtml = '';
      const tasks = sc.tasks || [];
      if (tasks.length) {
        const done = tasks.filter(t => t.done).length;
        tasksHtml = `<div class="sc-card-checklist" id="card-tasks-${sc.id}">
          ${tasks.map((t,i) => `
            <div class="sc-card-task">
              <input type="checkbox" class="sc-card-task-cb" ${t.done?'checked':''} onchange="scToggleCardTask(${sc.id},${i},this)" title="Mark done">
              <span class="sc-card-task-label${t.done?' done':''}" id="task-lbl-${sc.id}-${i}">${_escHtml(t.text)}</span>
            </div>`).join('')}
          <span class="sc-checklist-count">✓ ${done}/${tasks.length} done</span>
        </div>`;
      }

      card.innerHTML = `
        <div class="schedule-card-top">
          <div class="schedule-card-icon">${icon}</div>
          <div class="schedule-card-info">
            <div class="schedule-card-cat">${sc.category}</div>
            <div class="schedule-card-date">
              <span class="schedule-date-badge ${badgeClass}">${badgeText}</span>
              <span>${_niceDate(date)}</span>
            </div>
            <div class="schedule-card-time">⏰ ${fromDisp} → ${toDisp} · ${durStr || '—'}</div>
            ${tasksHtml}
          </div>
        </div>
        <div class="schedule-card-actions">
          <button class="sc-edit-btn" onclick="openScheduleModal(${sc.id})">✏️ Edit</button>
          <button class="sc-delete-btn" onclick="deleteSchedule(${sc.id})" title="Remove">🗑</button>
        </div>`;
      groupDiv.appendChild(card);
    });

    listEl.appendChild(groupDiv);
  });
}

function _niceDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
}
function _formatDateLabel(d) {
  return d.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
}

/* Patch showTab to render schedules when tracker is opened */
const _origShowTab = showTab;
showTab = function(t) {
  _origShowTab(t);
  if (t === 'tracker') renderTrackerSchedules();
};

/* Also hide/show FAB based on active tab */
const __origShowTab = showTab;
showTab = function(t) {
  __origShowTab(t);
  const fab = document.getElementById('fab-add');
  if (fab) fab.style.display = (t === 'tracker') ? 'none' : '';
};

/* On login, render schedules and hide FAB if on tracker */
const _origLaunchApp = launchApp;
// Patch launchApp to also init schedules
document.addEventListener('DOMContentLoaded', function() {
  // After app launches, renderTrackerSchedules is called via showTab override
  // Ensure fab is visible by default (not tracker tab)
  const fab = document.getElementById('fab-add');
  if (fab) fab.style.display = '';
});

// Close schedule modal on overlay click
document.addEventListener('DOMContentLoaded', function() {
  const overlay = document.getElementById('schedule-modal');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closeScheduleModal();
    });
  }
});

/* ═══════════════════════════════════════
   PLAN-YOUR-DAY CHECKLIST (Schedule modal)
═══════════════════════════════════════ */
let _scTasks = [];   // [{text, done}]

function _scRenderChecklist() {
  const container = document.getElementById('sc-checklist');
  if (!container) return;
  container.innerHTML = '';
  if (!_scTasks.length) return;

  _scTasks.forEach((task, i) => {
    const row = document.createElement('div');
    row.className = 'sc-task-row';
    row.draggable = true;
    row.dataset.idx = i;
    row.innerHTML = `
      <input type="checkbox" class="sc-task-cb" ${task.done ? 'checked' : ''}
        onchange="_scToggleTask(${i}, this)" title="Mark done">
      <span class="sc-task-text${task.done ? ' done' : ''}" id="sc-task-text-${i}">${_escHtml(task.text)}</span>
      <button type="button" class="sc-task-del" onclick="_scDeleteTask(${i})" title="Remove">✕</button>`;
    container.appendChild(row);
  });
}

function _scToggleTask(i, cb) {
  _scTasks[i].done = cb.checked;
  const lbl = document.getElementById(`sc-task-text-${i}`);
  if (lbl) lbl.classList.toggle('done', cb.checked);
}

function _scDeleteTask(i) {
  _scTasks.splice(i, 1);
  _scRenderChecklist();
}

function scAddTask() {
  const inp = document.getElementById('sc-task-input');
  const text = inp.value.trim();
  if (!text) return;
  _scTasks.push({ text, done: false });
  inp.value = '';
  _scRenderChecklist();
  inp.focus();
}

function scHandleTaskKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); scAddTask(); }
}

function scQuickAdd(btn) {
  const text = btn.textContent.trim();
  if (_scTasks.find(t => t.text === text)) return; // no dupes
  _scTasks.push({ text, done: false });
  _scRenderChecklist();
}

/* Toggle task done state directly on the schedule card (without opening modal) */
function scToggleCardTask(scheduleId, taskIdx, cb) {
  const ud = getUserData();
  if (!ud || !ud.schedules) return;
  const sc = ud.schedules.find(s => s.id === scheduleId);
  if (!sc || !sc.tasks || !sc.tasks[taskIdx]) return;
  sc.tasks[taskIdx].done = cb.checked;
  saveUserData();

  // Update label style + count inline without full re-render
  const lbl = document.getElementById(`task-lbl-${scheduleId}-${taskIdx}`);
  if (lbl) lbl.classList.toggle('done', cb.checked);

  // Update the "X/Y done" count badge
  const wrap = document.getElementById(`card-tasks-${scheduleId}`);
  if (wrap) {
    const countEl = wrap.querySelector('.sc-checklist-count');
    if (countEl) {
      const done = sc.tasks.filter(t => t.done).length;
      countEl.textContent = `✓ ${done}/${sc.tasks.length} done`;
    }
  }
}

function _escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}