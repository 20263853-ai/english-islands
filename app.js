// ============================================================
// English Islands App v4.0 — Munger Models + Dan Koe + SRS + Badges
// ============================================================

(function() {
  'use strict';

  // ---- Storage Keys ----
  var OLD_KEY = 'english_islands_progress';
  var STORAGE_KEY = 'english_islands_v3';
  var STREAK_KEY = 'english_islands_streak_v3';
  var DAILY_KEY = 'english_islands_daily_v3';
  var JOURNAL_KEY = 'english_islands_journal_v3';
  var STAR_KEY = 'english_islands_stars';
  var SRS_KEY = 'english_islands_srs';
  var BADGE_KEY = 'english_islands_badges';
  var TIME_KEY = 'english_islands_time';

  // ---- State ----
  var state = {
    user: null, islandIdx: null, playingIdx: null,
    shadowMode: false, revealedSentences: {}, completedSentences: {},
    streak: { count: 0, lastDate: null, history: [] },
    daily: { date: null, sentences: 0 },
    journal: [],
    stars: 0,
    favoriteSentences: [],
    srs: [],          // [{uk, ii, si, dueDate, interval, reps}]
    badges: [],       // [{id, date}]
    showChinese: true, // toggle Chinese translation display
    sessionStart: null
  };

  var utterance = null, synth = window.speechSynthesis;
  var playAllQueue = [], playAllIndex = 0;

  function isChild() { return state.user === 'mumu'; }
  function getEn(s) { return (typeof s === 'object' && s !== null) ? (s.en || '') : s; }
  function getZh(s) { return (typeof s === 'object' && s !== null) ? (s.zh || '') : ''; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(e) { return null; } }

  // ---- SRS (Spaced Repetition System) ----
  var SRS_INTERVALS = [1, 3, 7, 14, 30]; // days

  function getDueReviews(uk) {
    var today = todayStr();
    return state.srs.filter(function(r) {
      return r.uk === uk && r.dueDate <= today;
    });
  }

  function getAllDueReviews() {
    var today = todayStr();
    return state.srs.filter(function(r) { return r.dueDate <= today; });
  }

  function markReviewed(uk, ii, si) {
    var key = uk + '-' + ii + '-' + si;
    var existing = state.srs.filter(function(r) { return r.uk+'-'+r.ii+'-'+r.si === key; });
    if (existing.length > 0) {
      var item = existing[0];
      var nextInterval = (item.reps + 1 >= SRS_INTERVALS.length) ? SRS_INTERVALS[SRS_INTERVALS.length - 1] : SRS_INTERVALS[item.reps + 1];
      item.dueDate = addDays(new Date(), nextInterval);
      item.interval = nextInterval;
      item.reps = item.reps + 1;
    } else {
      var nextInterval = SRS_INTERVALS[0];
      state.srs.push({
        uk: uk, ii: ii, si: si,
        dueDate: addDays(new Date(), nextInterval),
        interval: nextInterval, reps: 0
      });
    }
    save(SRS_KEY, state.srs);
  }

  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return dateStr(r);
  }

  function getSRSStats(uk) {
    var all = state.srs.filter(function(r) { return r.uk === uk; });
    var due = getDueReviews(uk).length;
    var total = all.length;
    var mastered = all.filter(function(r) { return r.reps >= SRS_INTERVALS.length; }).length;
    return { total: total, due: due, mastered: mastered };
  }

  // ---- Achievement Badges ----
  var BADGE_DEFS = [
    { id: 'first', name: '初次启航', desc: '掌握第一句英语', icon: '\u2693' },
    { id: 'streak3', name: '三日坚持', desc: '连续打卡3天', icon: '\ud83d\udd25' },
    { id: 'streak7', name: '一周达人', desc: '连续打卡7天', icon: '\u2b50' },
    { id: 'streak30', name: '月度冠军', desc: '连续打卡30天', icon: '\ud83c\udfc6' },
    { id: 'ten', name: '十句通关', desc: '掌握10句', icon: '\ud83d\udcaf' },
    { id: 'fifty', name: '五十句里程碑', desc: '掌握50句', icon: '\ud83c\udf1f' },
    { id: 'hundred', name: '百句大师', desc: '掌握100句', icon: '\ud83d\udc51' },
    { id: 'island1', name: '首岛征服', desc: '完成第一个岛', icon: '\ud83c\udf0d' },
    { id: 'review10', name: '复习达人', desc: '完成10次复习', icon: '\ud83d\udd04' },
    { id: 'journal1', name: '反思开始', desc: '写第一篇日记', icon: '\ud83d\udcdd' },
    { id: 'journal7', name: '反思高手', desc: '写7篇日记', icon: '\ud83d\udcdc' }
  ];

  function checkBadges(uk) {
    var p = getUserProgress(uk);
    var earned = state.badges.map(function(b) { return b.id; });
    var newBadges = [];
    function tryEarn(id) {
      if (earned.indexOf(id) === -1) {
        state.badges.push({ id: id, date: todayStr() });
        newBadges.push(id);
        earned.push(id);
      }
    }
    if (p.done >= 1) tryEarn('first');
    if (p.done >= 10) tryEarn('ten');
    if (p.done >= 50) tryEarn('fifty');
    if (p.done >= 100) tryEarn('hundred');
    if (state.streak.count >= 3) tryEarn('streak3');
    if (state.streak.count >= 7) tryEarn('streak7');
    if (state.streak.count >= 30) tryEarn('streak30');
    // Check island completion
    var u = APP_DATA[uk];
    if (u) {
      for (var i = 0; i < u.islands.length; i++) {
        var ip = getIslandProgress(uk, i);
        if (ip.done === ip.total && ip.total > 0) { tryEarn('island1'); break; }
      }
    }
    var reviewCount = state.srs.filter(function(r) { return r.uk === uk && r.reps > 0; }).length;
    if (reviewCount >= 10) tryEarn('review10');
    var journalCount = state.journal.length;
    if (journalCount >= 1) tryEarn('journal1');
    if (journalCount >= 7) tryEarn('journal7');
    if (newBadges.length > 0) save(BADGE_KEY, state.badges);
    return newBadges;
  }

  // ---- Health Warning ----
  function getHealthStatus() {
    if (state.streak.history.length === 0) return { level: 'none', daysSince: 0 };
    var last = state.streak.history[state.streak.history.length - 1];
    var lastD = new Date(last);
    var today = new Date();
    today.setHours(0,0,0,0);
    lastD.setHours(0,0,0,0);
    var diff = Math.floor((today - lastD) / 86400000);
    if (diff <= 1) return { level: 'good', daysSince: diff };
    if (diff <= 3) return { level: 'yellow', daysSince: diff };
    return { level: 'red', daysSince: diff };
  }

  // ---- Time Tracking ----
  function trackTimeStart() {
    state.sessionStart = Date.now();
  }

  function trackTimeEnd() {
    if (!state.sessionStart) return;
    var elapsed = Math.round((Date.now() - state.sessionStart) / 60000);
    if (elapsed < 1) return;
    var timeData = {};
    try { timeData = JSON.parse(localStorage.getItem(TIME_KEY) || '{}'); } catch(e) {}
    var today = todayStr();
    if (!timeData[today]) timeData[today] = 0;
    timeData[today] += elapsed;
    try { localStorage.setItem(TIME_KEY, JSON.stringify(timeData)); } catch(e) {}
    state.sessionStart = null;
  }

  function getTodayMinutes() {
    var timeData = {};
    try { timeData = JSON.parse(localStorage.getItem(TIME_KEY) || '{}'); } catch(e) {}
    return timeData[todayStr()] || 0;
  }

  function getWeekMinutes() {
    var timeData = {};
    try { timeData = JSON.parse(localStorage.getItem(TIME_KEY) || '{}'); } catch(e) {}
    var now = new Date(), dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    var total = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(now);
      d.setDate(now.getDate() - dow + i);
      total += timeData[dateStr(d)] || 0;
    }
    return total;
  }

  // ---- Core Data Functions ----
  function loadAll() {
    var _sc = load('ei_show_cn'); if (_sc !== null) state.showChinese = _sc;
    try {
      var old = localStorage.getItem(OLD_KEY);
      if (old) {
        var od = JSON.parse(old);
        if (od.completed && !localStorage.getItem(STORAGE_KEY)) {
          state.completedSentences = od.completed;
          save(STORAGE_KEY, { completed: state.completedSentences });
          localStorage.removeItem(OLD_KEY);
        }
      }
    } catch(e) {}
    try { var r = localStorage.getItem(STORAGE_KEY); if (r) { var d = JSON.parse(r); state.completedSentences = d.completed || {}; } } catch(e) {}
    try { var r = localStorage.getItem(STREAK_KEY); if (r) { state.streak = JSON.parse(r); checkStreak(); } } catch(e) {}
    try { var r = localStorage.getItem(DAILY_KEY); if (r) { var d = JSON.parse(r); if (d.date === todayStr()) state.daily = d; } } catch(e) {}
    try { var r = localStorage.getItem(JOURNAL_KEY); if (r) state.journal = JSON.parse(r); } catch(e) {}
    try { var r = localStorage.getItem(STAR_KEY); if (r) state.stars = JSON.parse(r); } catch(e) {}
    try { var r = localStorage.getItem(SRS_KEY); if (r) state.srs = JSON.parse(r); } catch(e) {}
    try { var r = localStorage.getItem(BADGE_KEY); if (r) state.badges = JSON.parse(r); } catch(e) {}
  }

  function checkStreak() {
    var today = todayStr();
    if (state.streak.lastDate === today) return;
    var y = new Date(); y.setDate(y.getDate()-1);
    var ys = y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
    if (state.streak.lastDate && state.streak.lastDate !== ys) state.streak.count = 0;
  }

  function recordActivity() {
    var today = todayStr();
    if (state.daily.date !== today) state.daily = { date: today, sentences: 0 };
    state.daily.sentences++;
    if (state.streak.lastDate !== today) {
      var y = new Date(); y.setDate(y.getDate()-1);
      var ys = y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
      state.streak.count = (state.streak.lastDate === ys) ? state.streak.count + 1 : 1;
      state.streak.lastDate = today;
      state.streak.history.push(today);
      if (state.streak.history.length > 90) state.streak.history = state.streak.history.slice(-90);
      save(STREAK_KEY, state.streak);
      if (isChild()) { state.stars += 3; save(STAR_KEY, state.stars); }
    }
    save(DAILY_KEY, state.daily);
    checkBadges(state.user);
  }

  function markCompleted(uk, ii, si) {
    state.completedSentences[uk+'-'+ii+'-'+si] = true;
    save(STORAGE_KEY, { completed: state.completedSentences });
    recordActivity();
  }

  function isCompleted(uk, ii, si) { return !!state.completedSentences[uk+'-'+ii+'-'+si]; }

  function getIslandProgress(uk, idx) {
    var t = APP_DATA[uk].islands[idx].sentences.length, d = 0;
    for (var i = 0; i < t; i++) if (isCompleted(uk,idx,i)) d++;
    return { done: d, total: t, pct: t > 0 ? Math.round(d/t*100) : 0 };
  }

  function getUserProgress(uk) {
    var u = APP_DATA[uk], t = 0, d = 0;
    u.islands.forEach(function(isl, idx) { t += isl.sentences.length; for (var i = 0; i < isl.sentences.length; i++) if (isCompleted(uk,idx,i)) d++; });
    return { done: d, total: t, pct: t > 0 ? Math.round(d/t*100) : 0 };
  }

  // ---- TTS ----
  function stopSpeaking() { synth.cancel(); state.playingIdx = null; updatePlayingUI(); }
  function speak(text, idx, onEnd) {
    stopSpeaking();
    var vc = APP_DATA[state.user].voice;
    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = vc.lang; utterance.pitch = vc.pitch; utterance.rate = vc.rate;
    var voices = synth.getVoices(), pref = null, tgt = vc.name || '';
    if (tgt) { for (var vi = 0; vi < voices.length; vi++) { if (voices[vi].name.indexOf(tgt)===0) { pref=voices[vi]; break; } } }
    if (!pref) {
      var ev = voices.filter(function(v){return v.lang&&v.lang.indexOf('en')===0&&v.localService;});
      var safe = ['Samantha','Karen','Kathy','Daniel','Alex','Victoria','Moira','Junior'];
      for (var si=0;si<safe.length;si++){for(var ei=0;ei<ev.length;ei++){if(ev[ei].name.indexOf(safe[si])===0){pref=ev[ei];break;}}if(pref)break;}
    }
    if (pref) utterance.voice = pref;
    state.playingIdx = idx; updatePlayingUI();
    utterance.onend = function(){ state.playingIdx=null; updatePlayingUI(); if(onEnd) onEnd(); };
    utterance.onerror = function(){ state.playingIdx=null; updatePlayingUI(); };
    synth.speak(utterance);
  }

  // ---- Nav ----
  function reloadDynamicState() {
    try { var r = localStorage.getItem(SRS_KEY); if (r) state.srs = JSON.parse(r); } catch(e) {}
    try { var r = localStorage.getItem(BADGE_KEY); if (r) state.badges = JSON.parse(r); } catch(e) {}
    try { var r = localStorage.getItem(TIME_KEY); } catch(e) {}
    try { var r = localStorage.getItem(STAR_KEY); if (r) state.stars = JSON.parse(r); } catch(e) {}
  }

  function navigate(page, params) {
    trackTimeEnd();
    trackTimeStart();
    reloadDynamicState();
    var ps = document.querySelectorAll('.page'); for(var i=0;i<ps.length;i++) ps[i].classList.remove('active');
    var el = document.getElementById('page-'+page);
    if (el) { el.classList.add('active'); if(params) for(var k in params) state[k]=params[k]; renderPage(page); }
    window.scrollTo(0,0);
  }
  function renderPage(p) {
    if(p==='home') renderHome(); else if(p==='islands') renderIslands(); else if(p==='detail') renderDetail();
    else if(p==='progress') renderProgress(); else if(p==='plan') renderPlan(); else if(p==='daily') renderDaily();
    else if(p==='journal') renderJournal(); else if(p==='review') renderReview();
  }
  function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function handleRoute() {
    var h = window.location.hash.slice(1);
    if (h.indexOf('u/')===0) { var p=h.split('/'); if(p[1]&&APP_DATA[p[1]]) { state.user=p[1]; if(p.length>2&&p[2]!=='') { state.islandIdx=parseInt(p[2]); state.revealedSentences={}; navigate('detail'); return; } navigate('islands'); return; } }
    if(h==='progress'){navigate('progress');return;} if(h==='plan'){navigate('plan');return;}
    if(h==='daily'){navigate('daily');return;} if(h==='journal'){navigate('journal');return;}
    if(h==='review'){navigate('review');return;}
    navigate('home');
  }

  function weekData() {
    var now=new Date(),dow=now.getDay()===0?6:now.getDay()-1,mon=new Date(now);mon.setDate(now.getDate()-dow);
    var labels=['一','二','三','四','五','六','日'];
    var active=[false,false,false,false,false,false,false],ad=0;
    for(var i=0;i<7;i++){var d=new Date(mon);d.setDate(mon.getDate()+i);var ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');if(state.streak.history.indexOf(ds)!==-1){active[i]=true;ad++;}}
    return {labels:labels,active:active,activeDays:ad};
  }

  // ---- HOME ----
  function renderHome() {
    var c = document.getElementById('page-home-content'); if (!c) return;
    var wd = weekData(), sk = state.streak.count, ts = state.daily.sentences;
    var health = getHealthStatus();
    var srsStats; if (state.user) { srsStats = getSRSStats(state.user); } else {
    var allSrs = state.srs; var today2 = todayStr();
    srsStats = { total: allSrs.length, due: allSrs.filter(function(r){return r.dueDate<=today2;}).length, mastered: allSrs.filter(function(r){return r.reps>=SRS_INTERVALS.length;}).length };
  }
    var todayMin = getTodayMinutes();
    var weekMin = getWeekMinutes();

    var h = '<div class="max-w-lg mx-auto px-4 py-12">' +
      '<div class="text-center mb-8">' +
        '<h1 class="text-4xl font-extrabold text-gray-800 mb-2">English Islands</h1>' +
        '<p class="text-gray-500 text-lg">' + (isChild() ? '让学英语像玩游戏一样有趣' : '芒格思维 + Dan Koe 方法 · 英语口语训练') + '</p>' +
      '</div>';

    // Health Warning Banner
    if (health.level === 'yellow') {
      h += '<div class="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 text-center text-sm text-amber-700">\ud83d\udca1 已有 <strong>' + health.daysSince + '</strong> 天没练习了，现在开始还来得及！</div>';
    } else if (health.level === 'red') {
      h += '<div class="bg-red-50 border border-red-300 rounded-xl p-3 mb-4 text-center text-sm text-red-700">\u26a0\ufe0f 已有 <strong>' + health.daysSince + '</strong> 天没练习，<a href="#review" class="underline font-bold">先复习之前的内容</a>再继续吧。</div>';
    }

    // SRS Review Banner
    if (srsStats.due > 0) {
      h += '<div class="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-3 mb-4 text-center text-sm text-emerald-700 cursor-pointer hover:shadow-md transition" onclick="app.nav(\'review\')">\ud83d\udd04 <strong>' + srsStats.due + '</strong> 句待复习（间隔重复）→ 点击开始复习</div>';
    }

    // Badges Display
    var earnedBadges = state.badges;
    if (earnedBadges.length > 0) {
      h += '<div class="bg-white rounded-xl border border-gray-100 p-4 mb-6"><div class="flex items-center gap-2 mb-2"><span class="text-sm font-bold text-gray-700">\ud83c\udf96\ufe0f 成就</span><span class="text-xs text-gray-400">' + earnedBadges.length + '/' + BADGE_DEFS.length + '</span></div><div class="flex flex-wrap gap-2">';
      earnedBadges.forEach(function(b) {
        var def = BADGE_DEFS.filter(function(d) { return d.id === b.id; })[0];
        if (def) h += '<div class="px-2 py-1 bg-gray-50 rounded-lg text-xs text-gray-600" title="' + esc(def.name) + ': ' + esc(def.desc) + '">' + def.icon + ' ' + esc(def.name) + '</div>';
      });
      h += '</div></div>';
    }

    if (isChild()) {
      h += '<div class="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-5 mb-6 text-white">' +
        '<div class="flex items-center justify-between">' +
          '<div class="text-center"><div class="text-3xl mb-1">\u2b50</div><p class="text-3xl font-extrabold">' + state.stars + '</p><p class="text-white/70 text-sm">星星</p></div>' +
          '<div class="text-center"><div class="text-3xl mb-1">\ud83d\udd25</div><p class="text-3xl font-extrabold">' + sk + '</p><p class="text-white/70 text-sm">连续天数</p></div>' +
          '<div class="text-center"><div class="text-3xl mb-1">\ud83c\udfaf</div><p class="text-3xl font-extrabold">' + ts + '</p><p class="text-white/70 text-sm">今日</p></div>' +
        '</div>' +
        '<div class="flex gap-1 mt-3 justify-center">' +
          wd.labels.map(function(l,i){return '<div class="flex flex-col items-center gap-0.5"><div class="w-6 h-6 rounded-full '+(wd.active[i]?'bg-white':'bg-white/30')+' flex items-center justify-center text-xs">'+(wd.active[i]?'\u2b50':'')+'</div><span class="text-[10px] text-white/50">'+l+'</span></div>';}).join('') +
        '</div></div>';
    } else {
      h += '<div class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-5 mb-6 text-white">' +
        '<div class="flex items-center justify-between">' +
          '<div><p class="text-white/70 text-sm">连续打卡</p><p class="text-3xl font-extrabold mt-1">' + sk + ' <span class="text-lg font-normal">天</span></p></div>' +
          '<div class="text-center"><p class="text-white/70 text-sm">今日已练</p><p class="text-3xl font-extrabold">' + ts + ' <span class="text-lg font-normal">句</span></p></div>' +
          '<div class="text-right"><p class="text-white/70 text-sm">本周活跃</p><p class="text-3xl font-extrabold">' + wd.activeDays + ' <span class="text-lg font-normal">天</span></p></div>' +
        '</div>' +
        '<div class="flex gap-1 mt-3 justify-center">' +
          wd.labels.map(function(l,i){return '<div class="flex flex-col items-center gap-0.5"><div class="w-5 h-5 rounded-full '+(wd.active[i]?'bg-white':'bg-white/30')+' flex items-center justify-center text-[10px]">'+(wd.active[i]?'\u2713':'')+'</div><span class="text-[10px] text-white/50">'+l+'</span></div>';}).join('') +
        '</div>' +
        '<div class="flex items-center justify-between mt-3 pt-3 border-t border-white/20">' +
          '<div><p class="text-white/70 text-xs">今日投入</p><p class="text-lg font-bold">' + todayMin + ' <span class="text-xs font-normal">分钟</span></p></div>' +
          '<div><p class="text-white/70 text-xs">本周投入</p><p class="text-lg font-bold">' + weekMin + ' <span class="text-xs font-normal">分钟</span></p></div>' +
          '<div><p class="text-white/70 text-xs">待复习</p><p class="text-lg font-bold">' + srsStats.due + ' <span class="text-xs font-normal">句</span></p></div>' +
        '</div></div>';
    }

    // Quick Actions (4 grid)
    h += '<div class="grid grid-cols-4 gap-3 mb-6">' +
      '<div onclick="app.nav(\'daily\')" class="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center cursor-pointer hover:shadow-md transition"><div class="text-2xl mb-1">' + (isChild()?'\ud83c\udfae':'\u23f0') + '</div><p class="text-[10px] font-medium text-gray-600">' + (isChild()?'今日任务':'每日训练') + '</p></div>' +
      '<div onclick="app.nav(\'review\')" class="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center cursor-pointer hover:shadow-md transition"><div class="text-2xl mb-1">\ud83d\udd04</div><p class="text-[10px] font-medium text-gray-600">间隔复习</p></div>' +
      '<div onclick="app.nav(\'plan\')" class="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center cursor-pointer hover:shadow-md transition"><div class="text-2xl mb-1">' + (isChild()?'\ud83d\uddfc\ufe0f':'\ud83d\udccd') + '</div><p class="text-[10px] font-medium text-gray-600">' + (isChild()?'冒险地图':'学习路线图') + '</p></div>' +
      '<div onclick="app.nav(\'journal\')" class="bg-white rounded-xl p-3 border border-gray-100 shadow-sm text-center cursor-pointer hover:shadow-md transition"><div class="text-2xl mb-1">' + (isChild()?'\ud83c\udf1f':'\ud83d\udcdd') + '</div><p class="text-[10px] font-medium text-gray-600">' + (isChild()?'今天最棒的':'反思日记') + '</p></div>' +
    '</div>';

    // Guide
    h += '<div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">' +
      '<div onclick="app.toggleGuide()" class="flex items-center justify-between cursor-pointer select-none">' +
        '<h2 class="text-base font-bold text-gray-700">' + (isChild()?'玩法说明':'学习方法（芒格思维 + Dan Koe 五步法）') + '</h2>' +
        '<svg id="guide-arrow" class="w-5 h-5 text-gray-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' +
      '</div>';

    if (isChild()) {
      h += '<div id="guide-content" class="hidden mt-4 text-sm text-gray-600 space-y-3 leading-relaxed">' +
        '<div class="flex gap-3"><span class="text-amber-500 font-bold text-base shrink-0">1</span><div><strong class="text-gray-700">选择冒险</strong><br>每个岛是一个地图，选一个开始吧！</div></div>' +
        '<div class="flex gap-3"><span class="text-amber-500 font-bold text-base shrink-0">2</span><div><strong class="text-gray-700">听和跟读</strong><br>点播放按钮听发音，大声跟着说！说错也没关系。</div></div>' +
        '<div class="flex gap-3"><span class="text-amber-500 font-bold text-base shrink-0">3</span><div><strong class="text-gray-700">赢得星星</strong><br>掌握一句就能得星星，每天打卡额外奖励 3 颗⭐！</div></div>' +
        '<div class="flex gap-3"><span class="text-amber-500 font-bold text-base shrink-0">4</span><div><strong class="text-gray-700">挑战赛</strong><br>开启影子模式，先听再猜，看你猜对多少！</div></div>' +
        '<div class="mt-4 p-3 bg-amber-50 rounded-xl text-amber-700 text-xs leading-relaxed"><strong>小贴士：</strong>每天玩 15 分钟就够了！学不会没关系，反复听就行！</div>' +
      '</div>';
    } else {
      h += '<div id="guide-content" class="hidden mt-4 text-sm text-gray-600 space-y-3 leading-relaxed">' +
        '<div class="flex gap-3"><span class="text-indigo-500 font-bold shrink-0">\u2460</span><div><strong>知识地图（能力圈）</strong><br>8 个语言岛是你的学习路线图，先建立整体认知，再逐个攻克。</div></div>' +
        '<div class="flex gap-3"><span class="text-indigo-500 font-bold shrink-0">\u2461</span><div><strong>项目驱动（机会成本）</strong><br>每天投入的时间都是有成本的，确保用在最高回报的活动上。每句练习都记入时间投入。</div></div>' +
        '<div class="flex gap-3"><span class="text-indigo-500 font-bold shrink-0">\u2462</span><div><strong>间隔重复（安全边际）</strong><br>芒格说"始终留有余地"。学过的句子会按 1→3→7→14→30 天间隔自动提醒复习，确保记忆不遗忘。</div></div>' +
        '<div class="flex gap-3"><span class="text-indigo-500 font-bold shrink-0">\u2463</span><div><strong>场景挑战（二阶思维）</strong><br>不只是记住句子，更要学会替换关键词创造新句子。"学句型，不学死句子"。</div></div>' +
        '<div class="flex gap-3"><span class="text-indigo-500 font-bold shrink-0">\u2464</span><div><strong>反思输出（费曼技巧 + 逆向思维）</strong><br>用自己的话教会别人，是检验理解的最佳方式。写日记时思考"哪里可能出错"。</div></div>' +
        '<div class="mt-4 p-3 bg-indigo-50 rounded-xl text-indigo-700 text-xs leading-relaxed"><strong>\ud83d\udca1 芒格提示：</strong>"在生活中学到的最重要教训是： постоянно思考反向—— 不要 只想如何成功，而是想如何避免失败。"</div>' +
      '</div>';
    }

    // Learner Selection Cards
    h += '<div class="grid grid-cols-2 gap-3 mt-6">' +
      '<div onclick="app.selectUser(\'yanghua\')" class="learner-card bg-gradient-to-br from-pink-50 to-rose-100 rounded-2xl p-5 border border-pink-200 text-center cursor-pointer hover:shadow-lg transition">' +
        '<div class="text-3xl mb-2">👩‍🏫</div><div class="font-bold text-gray-800">成人版</div><div class="text-xs text-gray-500 mt-1">Dan Koe 方法 + 芒格思维</div><div class="text-xs text-pink-500 mt-2">8 岛 · 153 句</div>' +
      '</div>' +
      '<div onclick="app.selectUser(\'mumu\')" class="learner-card bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-5 border border-amber-200 text-center cursor-pointer hover:shadow-lg transition">' +
        '<div class="text-3xl mb-2">👦</div><div class="font-bold text-gray-800">儿童版</div><div class="text-xs text-gray-500 mt-1">游戏化学习</div><div class="text-xs text-amber-500 mt-2">8 岛 · 148 句</div>' +
      '</div></div>';

    h += '</div>';
    c.innerHTML = h;
  }

  // ---- ISLANDS ----
  function renderIslands() {
    var c = document.getElementById('page-islands-content'); if (!c) return;
    if (!state.user) { c.innerHTML = '<div class="max-w-lg mx-auto px-4 py-12 text-center"><p class="text-gray-400">请先选择学习者</p><button onclick="app.nav(\'home\')" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg">返回首页</button></div>'; return; }
    var u = APP_DATA[state.user], p = getUserProgress(state.user);

    var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
      '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>';

    if (isChild()) {
      h += '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83c\udf0d 冒险地图</h1>' +
        '<p class="text-gray-500 text-sm mb-6">选择一个岛屿开始冒险！每掌握一句得 1 \u2b50</p>';
    } else {
      h += '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83c\udf0d 语言岛</h1>' +
        '<p class="text-gray-500 text-sm mb-6">总进度：' + p.done + '/' + p.total + '（' + p.pct + '%）</p>';
    }

    h += '<div class="space-y-3">';
    u.islands.forEach(function(isl, idx) {
      var ip = getIslandProgress(state.user, idx);
      var unlocked = idx === 0 || getIslandProgress(state.user, idx - 1).pct >= 50;
      h += '<div onclick="' + (unlocked ? 'app.selectIsland(' + idx + ')' : '') + '" class="' + (unlocked ? 'cursor-pointer hover:shadow-lg' : 'opacity-50 cursor-not-allowed') + ' bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 transition">' +
        '<div class="w-12 h-12 rounded-xl ' + (unlocked ? (isChild() ? 'bg-amber-100' : 'bg-indigo-100') : 'bg-gray-100') + ' flex items-center justify-center text-2xl shrink-0">' + isl.icon + '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="font-bold text-gray-800 text-sm">' + (idx + 1) + '. ' + esc(isl.name) + '</div>' +
          '<div class="text-xs text-gray-400">' + esc(isl.desc) + '</div>' +
          '<div class="mt-2 w-full bg-gray-100 rounded-full h-2"><div class="h-2 rounded-full ' + (ip.pct >= 100 ? 'bg-green-400' : (isChild() ? 'bg-amber-400' : 'bg-indigo-400')) + '" style="width:' + ip.pct + '%"></div></div>' +
        '</div>' +
        '<div class="text-right shrink-0"><span class="text-sm font-bold ' + (isChild() ? 'text-amber-600' : 'text-indigo-600') + '">' + ip.pct + '%</span><br><span class="text-xs text-gray-400">' + ip.done + '/' + ip.total + '</span></div>' +
      '</div>';
    });
    h += '</div>';

    if (!isChild()) {
      h += '<div class="mt-4 text-center"><label class="text-xs text-gray-400 inline-flex items-center gap-1"><input type="checkbox" class="w-3 h-3" ' + (state.shadowMode ? 'checked' : '') + ' onchange="app.toggleShadow()"> 影子跟读模式</label></div>';
    }

    h += '</div>';
    c.innerHTML = h;
  }

  // ---- DETAIL ----
  function renderDetail() {
    var c = document.getElementById('page-detail-content'); if (!c) return;
    if (!state.user) { c.innerHTML = '<div class="max-w-lg mx-auto px-4 py-12 text-center"><p class="text-gray-400">请先选择学习者</p><button onclick="app.nav(\'home\')" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg">返回首页</button></div>'; return; }
    var isl = APP_DATA[state.user].islands[state.islandIdx];
    var ip = getIslandProgress(state.user, state.islandIdx);
    var uk = state.user, ii = state.islandIdx;

    var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
      '<a href="#" onclick="app.nav(\'islands\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>';

    h += '<div class="flex items-center gap-3 mb-4"><div class="w-12 h-12 rounded-xl ' + (isChild() ? 'bg-amber-100' : 'bg-indigo-100') + ' flex items-center justify-center text-2xl">' + isl.icon + '</div><div><h1 class="text-xl font-bold text-gray-800">' + esc(isl.name) + '</h1><p class="text-sm text-gray-400">' + esc(isl.desc) + '</p></div></div>' +
      '<div class="bg-gray-50 rounded-lg p-3 mb-4 text-sm"><span class="text-gray-500">进度：</span><strong>' + ip.done + '/' + ip.total + '（' + ip.pct + '%）</strong></div>';

    if (isChild()) {
      if (state.shadowMode) {
        h += '<div class="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 text-center text-sm text-orange-700">\ud83c\udfae 影子模式已开启 — 先听再猜，看看你能不能猜对！</div>';
      }
    } else {
      // Adult: Munger tips
      h += '<div class="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 text-sm text-purple-700">\ud83d\udca1 <strong>芒格提示：</strong>想想能怎么替换关键词 — 学句型，不学死句子。每个句子都是模板。</div>';
      if (state.shadowMode) {
        h += '<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-center text-sm text-blue-700">\ud83c\udfae 影子模式 — 先听再猜，训练反应速度</div>';
      }
      // SRS info for this island
      var islandReviews = state.srs.filter(function(r) { return r.uk === uk && r.ii === ii && r.dueDate <= todayStr(); });
      if (islandReviews.length > 0) {
        h += '<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-sm text-emerald-700 cursor-pointer hover:shadow-md transition" onclick="app.nav(\'review\')">\ud83d\udd04 本岛有 <strong>' + islandReviews.length + '</strong> 句待复习（间隔重复）</div>';
      }
    }

    // Play All
    h += '<button onclick="app.playAll()" id="play-all-btn" class="w-full mb-4 py-2.5 rounded-lg ' + (isChild() ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-500 hover:bg-indigo-600') + ' text-white font-medium text-sm transition"><span id="play-all-text">\u25b6 播放全部（' + isl.sentences.length + ' 句）</span></button>';

    // Chinese toggle
    h += '<button onclick="app.toggleChinese()" class="w-full mb-2 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 text-sm transition hover:bg-gray-100">' + (state.showChinese ? '\ud83d\udc64 \u9690\u85cf\u4e2d\u6587\u7ffb\u8bd1' : '\ud83c\udf10 \u663e\u793a\u4e2d\u6587\u7ffb\u8bd1') + '</button>';

    // Sentence list
    h += '<div class="space-y-2">';
    isl.sentences.forEach(function(s, idx) {
      var done = isCompleted(uk, ii, idx);
      var revealed = state.revealedSentences[idx] || !state.shadowMode;
      var srsItem = state.srs.filter(function(r) { return r.uk===uk && r.ii===ii && r.si===idx; })[0];

      h += '<div class="sentence-item bg-white rounded-xl border ' + (done ? 'border-green-200 bg-green-50/50' : 'border-gray-100') + ' p-4 flex items-start gap-3 transition" data-idx="' + idx + '">' +
        '<button onclick="app.playSentence(' + idx + ')" class="play-btn w-8 h-8 rounded-full ' + (isChild() ? 'bg-amber-100 hover:bg-amber-200' : 'bg-indigo-100 hover:bg-indigo-200') + ' flex items-center justify-center shrink-0 mt-0.5 transition"><svg class="w-4 h-4 ' + (isChild() ? 'text-amber-500' : 'text-indigo-500') + '" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>' +
        '<div class="flex-1 min-w-0">' +
          (revealed ? '<p class="text-sm text-gray-800">' + esc(getEn(s)) + (state.showChinese && getZh(s) ? '<span class="text-gray-400 ml-2">- ' + esc(getZh(s)) + '</span>' : '') + '</p>' : '<p class="text-sm text-gray-400 italic">\u70b9\u64ad\u653e\u542c\u53d1\u97f3\uff0c\u731c\u731c\u662f\u4ec0\u4e48\uff1f</p>') +
          (srsItem ? '<p class="text-[10px] text-emerald-500 mt-1">\ud83d\udd04 \u590d\u4e60 ' + srsItem.reps + ' \u6b21 · \u4e0b\u6b21: ' + srsItem.dueDate + '</p>' : '') +
        '</div>' +
        '<div class="shrink-0 flex items-center gap-2">';

      if (state.shadowMode && !revealed) {
        h += '<button onclick="app.revealSentence(' + idx + ')" class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition">\u63ed\u6653</button>';
      }
      if (done) {
        h += '<span class="text-green-500 text-sm">' + (isChild() ? '\u2b50' : '\u2713') + '</span>';
      } else {
        h += '<button onclick="app.markDone(' + idx + ')" class="text-xs px-2 py-1 rounded ' + (isChild() ? 'bg-amber-100 hover:bg-amber-200 text-amber-700' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700') + ' transition">' + (isChild() ? '\u638c\u63e1\u5b83\u2b50' : '\u638c\u63e1') + '</button>';
      }

      h += '</div></div>';
    });
    h += '</div></div>';
    c.innerHTML = h;
  }

  // ---- PROGRESS ----
  function renderProgress() {
    var c = document.getElementById('page-progress-content'); if (!c) return;
    if (!state.user) { c.innerHTML = '<div class="max-w-lg mx-auto px-4 py-12 text-center"><p class="text-gray-400">请先选择学习者</p><button onclick="app.nav(\'home\')" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg">返回首页</button></div>'; return; }
    var p = getUserProgress(state.user);
    var srs = getSRSStats(state.user);
    var wd = weekData();
    var health = getHealthStatus();
    var timeData = {};
    try { timeData = JSON.parse(localStorage.getItem(TIME_KEY) || '{}'); } catch(e) {}

    var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
      '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>' +
      '<h1 class="text-2xl font-bold text-gray-800 mb-6">\ud83d\udcca 进度看板</h1>';

    // Summary Cards
    h += '<div class="grid grid-cols-3 gap-3 mb-6">' +
      '<div class="bg-white rounded-xl border border-gray-100 p-4 text-center"><p class="text-3xl font-extrabold ' + (isChild() ? 'text-amber-500' : 'text-indigo-600') + '">' + (isChild() ? '\u2b50' + state.stars : p.done) + '</p><p class="text-xs text-gray-400 mt-1">' + (isChild() ? '总星星' : '已掌握') + '</p></div>' +
      '<div class="bg-white rounded-xl border border-gray-100 p-4 text-center"><p class="text-3xl font-extrabold text-emerald-600">' + srs.mastered + '</p><p class="text-xs text-gray-400 mt-1">已巩固</p></div>' +
      '<div class="bg-white rounded-xl border border-gray-100 p-4 text-center"><p class="text-3xl font-extrabold text-blue-600">' + state.streak.count + '</p><p class="text-xs text-gray-400 mt-1">连续打卡</p></div>' +
    '</div>';

    // Health Status
    h += '<div class="bg-white rounded-xl border border-gray-100 p-4 mb-6"><div class="flex items-center gap-2 mb-2"><span class="font-bold text-gray-700 text-sm">\u2764\ufe0f 健康状态</span></div>';
    if (health.level === 'good') h += '<p class="text-green-600 text-sm">\u2705 状态良好，继续保持！</p>';
    else if (health.level === 'yellow') h += '<p class="text-amber-600 text-sm">\u26a0\ufe0f ' + health.daysSince + ' 天未练习，注意保持节奏</p>';
    else h += '<p class="text-red-600 text-sm">\ud83d\udea8 ' + health.daysSince + ' 天未练习，建议先复习</p>';
    h += '</div>';

    // SRS Stats
    if (srs.total > 0) {
      h += '<div class="bg-white rounded-xl border border-gray-100 p-4 mb-6"><div class="flex items-center gap-2 mb-2"><span class="font-bold text-gray-700 text-sm">\ud83d\udd04 间隔重复</span></div>' +
        '<div class="grid grid-cols-3 gap-2 text-center"><div><p class="text-lg font-bold text-gray-800">' + srs.total + '</p><p class="text-xs text-gray-400">进入SRS</p></div>' +
        '<div><p class="text-lg font-bold text-emerald-600">' + srs.mastered + '</p><p class="text-xs text-gray-400">已巩固</p></div>' +
        '<div><p class="text-lg font-bold text-amber-600">' + srs.due + '</p><p class="text-xs text-gray-400">待复习</p></div></div></div>';
    }

    // Badges
    h += '<div class="bg-white rounded-xl border border-gray-100 p-4 mb-6"><div class="flex items-center justify-between mb-3"><span class="font-bold text-gray-700 text-sm">\ud83c\udf96\ufe0f 成就徽章</span><span class="text-xs text-gray-400">' + state.badges.length + '/' + BADGE_DEFS.length + '</span></div><div class="grid grid-cols-4 gap-2">';
    BADGE_DEFS.forEach(function(def) {
      var earned = state.badges.filter(function(b) { return b.id === def.id; }).length > 0;
      h += '<div class="p-2 rounded-lg text-center ' + (earned ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-100 opacity-40') + '" title="' + esc(def.name) + ': ' + esc(def.desc) + '">' +
        '<div class="text-xl mb-1">' + def.icon + '</div>' +
        '<p class="text-[10px] text-gray-600">' + esc(def.name) + '</p></div>';
    });
    h += '</div></div>';

    // Time Investment (adult only)
    if (!isChild()) {
      var weekMin = getWeekMinutes();
      var todayMin = getTodayMinutes();
      h += '<div class="bg-white rounded-xl border border-gray-100 p-4 mb-6"><div class="flex items-center gap-2 mb-2"><span class="font-bold text-gray-700 text-sm">\u23f1\ufe0f 时间投入（芒格：机会成本）</span></div>' +
        '<div class="grid grid-cols-2 gap-2 text-center"><div><p class="text-lg font-bold text-gray-800">' + todayMin + '</p><p class="text-xs text-gray-400">今日（分钟）</p></div>' +
        '<div><p class="text-lg font-bold text-gray-800">' + weekMin + '</p><p class="text-xs text-gray-400">本周（分钟）</p></div></div>' +
        '<p class="text-xs text-gray-400 mt-2 text-center">\ud83d\udca1 每天投入 30 分钟，一年累计 182 小时 — 你的机会成本是否值得？</p></div>';
    }

    // Calendar
    h += '<div class="bg-white rounded-xl border border-gray-100 p-4 mb-6"><div class="font-bold text-gray-700 text-sm mb-3">\ud83d\udcc5 本周打卡日历</div>' +
      '<div class="flex gap-1 justify-center">' +
        wd.labels.map(function(l,i){return '<div class="flex flex-col items-center gap-0.5"><div class="w-8 h-8 rounded-full '+(wd.active[i]?'bg-indigo-500 text-white':'bg-gray-100 text-gray-400')+' flex items-center justify-center text-sm font-bold">'+(wd.active[i]?'\u2713':'')+'</div><span class="text-xs text-gray-400 mt-1">'+l+'</span></div>';}).join('') +
      '</div></div>';

    // Per-Island
    h += '<div class="bg-white rounded-xl border border-gray-100 p-4 mb-6"><div class="font-bold text-gray-700 text-sm mb-3">\ud83c\udf0d 各岛进度</div><div class="space-y-2">';
    APP_DATA[state.user].islands.forEach(function(isl, idx) {
      var ip = getIslandProgress(state.user, idx);
      h += '<div class="flex items-center gap-3"><span class="text-lg">' + isl.icon + '</span><span class="flex-1 text-sm text-gray-700">' + esc(isl.name) + '</span><div class="flex-1"><div class="w-full bg-gray-100 rounded-full h-2"><div class="h-2 rounded-full ' + (ip.pct>=100?'bg-green-400':(isChild()?'bg-amber-400':'bg-indigo-400')) + '" style="width:'+ip.pct+'%"></div></div></div><span class="text-xs text-gray-500 w-12 text-right">'+ip.pct+'%</span></div>';
    });
    h += '</div></div>';

    // Reset
    h += '<div class="text-center"><button onclick="app.resetProgress()" class="text-xs text-gray-400 hover:text-red-400 transition">\u91cd\u7f6e\u6240\u6709\u8fdb\u5ea6</button></div>';

    h += '</div>';
    c.innerHTML = h;
  }

  // ---- PLAN (Learning Roadmap) ----
  function renderPlan() {
    var c = document.getElementById('page-plan-content'); if (!c) return;
    if (!state.user) { c.innerHTML = '<div class="max-w-lg mx-auto px-4 py-12 text-center"><p class="text-gray-400">请先选择学习者</p><button onclick="app.nav(\'home\')" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg">返回首页</button></div>'; return; }
    var p = getUserProgress(state.user);

    var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
      '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>';

    if (isChild()) {
      h += '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83d\uddfc\ufe0f 冒险地图</h1>' +
        '<p class="text-gray-500 text-sm mb-6">完成一个岛，解锁下一个岛！</p>' +
        '<div class="space-y-4">';
      APP_DATA[state.user].islands.forEach(function(isl, idx) {
        var ip = getIslandProgress(state.user, idx);
        var unlocked = idx === 0 || getIslandProgress(state.user, idx - 1).pct >= 50;
        h += '<div class="flex items-start gap-4">' +
          '<div class="w-10 h-10 rounded-full ' + (ip.pct>=100?'bg-green-400':(unlocked?'bg-amber-400':'bg-gray-200')) + ' flex items-center justify-center text-white font-bold shrink-0">' + (idx+1) + '</div>' +
          '<div class="flex-1"><h3 class="font-bold text-gray-800 text-sm">' + isl.icon + ' ' + esc(isl.name) + '</h3><p class="text-xs text-gray-400">' + esc(isl.desc) + '</p>' +
            '<div class="mt-2 w-full bg-gray-100 rounded-full h-2"><div class="h-2 rounded-full ' + (ip.pct>=100?'bg-green-400':'bg-amber-400') + '" style="width:'+ip.pct+'%"></div></div>' +
            (unlocked ? '<p class="text-xs text-amber-600 mt-1">' + (ip.pct>=100?'已完成！':'解锁中...') + '</p>' : '<p class="text-xs text-gray-400 mt-1">完成上一岛50%解锁</p>') +
          '</div></div>';
      });
      h += '</div>';
    } else {
      h += '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83d\udccd 学习路线图</h1>' +
        '<p class="text-gray-500 text-sm mb-6">当前进度：' + p.done + '/' + p.total + '（' + p.pct + '%）</p>';

      // Munger wisdom banner
      h += '<div class="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 mb-6 text-sm"><strong class="text-purple-800">\ud83e\uddd8 芒格思维：</strong><span class="text-purple-700">"能力圈" — 不要试图一次攻克所有岛屿。先在一个领域做到足够好，再扩展到相邻领域。集中精力 = 安全边际。</span></div>';

      h += '<div class="space-y-4">';
      var weeks = [
        { title: '第1周 · 能力圈建立', desc: '专注 Daily Life 岛，掌握基础句型框架', focus: '深度练习 30分钟/天', munger: '逆向思维：如果一周后完全忘记，你今天会怎么学？' },
        { title: '第2周 · 深度沉浸', desc: 'Daily Life 达 80% + 开始 Work Office', focus: '间隔重复复习第1周内容', munger: '安全边际：每天复习旧句 > 学新句。遗忘曲线是敌人。' },
        { title: '第3周 · 场景扩展', desc: 'Work Office 达 80% + 开始 Travel', focus: '影子跟读训练反应速度', munger: 'Lollapalooza 效应：听+跟读+复习 多种方法叠加效果 > 单一方法' },
        { title: '第4周 · 句型变体', desc: 'Travel 达 80% + 开始表达练习', focus: '替换关键词，创造新句子', munger: '二阶思维：学一个句型 → 能衍生 10 个句子 → 实际能力指数增长' },
        { title: '第5周 · 费曼输出', desc: '开始教别人（日记/口语）', focus: '每天用英语教家人一句', munger: '激励偏差：教别人的成就感是最好的学习动力' },
        { title: '第6周 · 系统巩固', desc: '全部岛屿复习 + 间隔重复冲刺', focus: '所有到期句子复习完毕', munger: '机会成本：这段时间的投入换来的英语能力，是否值得你放弃的其他选择？' }
      ];

      weeks.forEach(function(w, i) {
        var isActive = (p.pct >= i * 15 && p.pct < (i + 1) * 15 + 10);
        h += '<div class="bg-white rounded-xl border ' + (isActive ? 'border-indigo-200 shadow-md' : 'border-gray-100') + ' p-4">' +
          '<div class="flex items-start gap-3"><div class="w-8 h-8 rounded-full ' + (isActive ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500') + ' flex items-center justify-center font-bold text-sm shrink-0">' + (i+1) + '</div>' +
          '<div class="flex-1"><h3 class="font-bold text-gray-800 text-sm">' + esc(w.title) + '</h3><p class="text-xs text-gray-500 mt-1">' + esc(w.desc) + '</p><p class="text-xs text-indigo-600 mt-1">\ud83c\udfae ' + esc(w.focus) + '</p>' +
          '<p class="text-xs text-purple-600 mt-1 italic">\ud83e\uddd8 ' + esc(w.munger) + '</p></div></div></div>';
      });
      h += '</div>';
    }
    h += '</div>';
    c.innerHTML = h;
  }

  // ---- DAILY ----
  function renderDaily() {
    var c = document.getElementById('page-daily-content'); if (!c) return;
    if (!state.user) { c.innerHTML = '<div class="max-w-lg mx-auto px-4 py-12 text-center"><p class="text-gray-400">请先选择学习者</p><button onclick="app.nav(\'home\')" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg">返回首页</button></div>'; return; }
    var child = isChild();
    var srsDue = getAllDueReviews().slice(0, 5);

    if (child) {
      var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
        '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>' +
        '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83c\udfae 今日任务</h1>' +
        '<p class="text-gray-500 text-sm mb-6">每天玩 15 分钟就够了！</p>';

      // Review reminder
      if (srsDue.length > 0) {
        h += '<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-sm text-emerald-700 cursor-pointer hover:shadow-md transition" onclick="app.nav(\'review\')">\ud83d\udd04 有 <strong>' + srsDue.length + '</strong> 句待复习，先复习一下？</div>';
      }

      h += '<div class="space-y-3">' +
        '<div class="bg-white rounded-xl border border-gray-100 p-5"><div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">\ud83d\udc42</div><div><h3 class="font-bold text-gray-800">\u542c\u529b\u8bad\u7ec3</h3><p class="text-xs text-gray-400">10 \u5206\u949f \u00b7 \u542c\u548c\u8ddf\u8bfb</p></div></div><ul class="text-sm text-gray-600 space-y-2 ml-13"><li>\u2705 \u9009\u4e00\u4e2a\u5c9b\uff0c\u70b9\u64ad\u653e\u542c\u53d1\u97f3</li><li>\u2705 \u5927\u58f0\u8ddf\u7740\u8bf4\uff0c\u8bf4\u9519\u4e5f\u6ca1\u5173\u7cfb\uff01</li></ul></div>' +
        '<div class="bg-white rounded-xl border border-gray-100 p-5"><div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl">\ud83c\udfae</div><div><h3 class="font-bold text-gray-800">\u6311\u6218\u6a21\u5f0f</h3><p class="text-xs text-gray-400">15 \u5206\u949f \u00b7 \u5f71\u5b50\u6a21\u5f0f</p></div></div><ul class="text-sm text-gray-600 space-y-2 ml-13"><li>\u2705 \u5f00\u542f\u5f71\u5b50\u6a21\u5f0f\uff0c\u5148\u542c\u518d\u731c</li><li>\u2705 \u63c9\u638c\u63e1 5 \u53e5\u65b0\u53e5\u5b50</li></ul></div>' +
        '<div class="bg-white rounded-xl border border-gray-100 p-5"><div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center text-xl">\ud83c\udf1f</div><div><h3 class="font-bold text-gray-800">\u4eca\u5929\u6700\u68d2\u7684</h3><p class="text-xs text-gray-400">1 \u5206\u949f \u00b7 \u9009\u4e00\u53e5\u6700\u559c\u6b22\u7684</p></div></div><ul class="text-sm text-gray-600 space-y-2 ml-13"><li>\u2705 <a href="#journal" class="text-amber-500 underline">\u53bb\u9009\u4e00\u53e5\u6700\u68d2\u7684\u53e5\u5b50</a></li></ul></div>' +
      '</div>' +
      '<div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mt-6 text-sm"><strong class="text-amber-800">\ud83d\udca1</strong><span class="text-amber-700"> \u6bcf\u5929\u73a9\u4e00\u70b9\u70b9\u5c31\u597d\uff0c\u4e0d\u7528\u8d76\u5de5\u592b\uff01</span></div>' +
      '<div class="bg-white rounded-xl border border-gray-100 p-5 mt-6 text-center"><p class="text-gray-500 text-sm">\u4eca\u65e5\u8bad\u7ec3\u7edf\u8ba1</p><p class="text-4xl font-extrabold text-amber-500 mt-2">' + state.daily.sentences + '</p><p class="text-gray-400 text-sm">\u53e5\u5df2\u638c\u63e1</p></div></div>';
      c.innerHTML = h;
    } else {
      var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
        '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>' +
        '<h1 class="text-2xl font-bold text-gray-800 mb-2">\u23f0 每日训练</h1>' +
        '<p class="text-gray-500 text-sm mb-6">三种时间块 — 创造 · 维护 · 恢复</p>';

      // SRS Review recommendation
      if (srsDue.length > 0) {
        h += '<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-sm text-emerald-700 cursor-pointer hover:shadow-md transition" onclick="app.nav(\'review\')">\ud83d\udd04 <strong>' + getAllDueReviews().length + '</strong> 句间隔复习到期（安全边际：先复习旧内容再学新内容）→ 点击开始</div>';
      }

      // Time today
      h += '<div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 text-sm text-indigo-700">\u23f1\ufe0f 今日投入：<strong>' + getTodayMinutes() + '</strong> 分钟（机会成本：你的时间是否花在最高回报的活动上？）</div>';

      h += '<div class="space-y-3">' +
        '<div class="bg-white rounded-xl border border-gray-100 p-5"><div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">\ud83d\udcaa</div><div><h3 class="font-bold text-gray-800">\u6df1\u5ea6\u7ec3\u4e60</h3><p class="text-xs text-gray-400">15 \u5206\u949f \u00b7 \u521b\u9020\u65f6\u95f4</p></div></div><ul class="text-sm text-gray-600 space-y-2 ml-13"><li>\u2705 \u9009\u4e00\u4e2a\u5c9b\uff0c\u5f00\u542f\u5f71\u5b50\u6a21\u5f0f\u8bad\u7ec3</li><li>\u2705 \u5c1d\u8bd5\u66ff\u6362\u5173\u952e\u8bcd\u521b\u9020\u65b0\u53e5\u5b50\uff08\u4e8c\u9636\u601d\u7ef4\uff09</li></ul></div>' +
        '<div class="bg-white rounded-xl border border-gray-100 p-5"><div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl">\ud83d\udd04</div><div><h3 class="font-bold text-gray-800">\u95f4\u9694\u590d\u4e60</h3><p class="text-xs text-gray-400">10 \u5206\u949f \u00b7 \u7ef4\u62a4\u65f6\u95f4\uff08\u5b89\u5168\u8fb9\u9645\uff09</p></div></div><ul class="text-sm text-gray-600 space-y-2 ml-13"><li>\u2705 \u590d\u4e60\u5230\u671f\u7684\u53e5\u5b50\uff0c\u786e\u4fdd\u4e0d\u9057\u5fd8</li><li>\u2705 <a href="#review" class="text-indigo-500 underline">\u524d\u5f80\u590d\u4e60\u9875\u9762</a></li></ul></div>' +
        '<div class="bg-white rounded-xl border border-gray-100 p-5"><div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">\ud83c\udfb5</div><div><h3 class="font-bold text-gray-800">\u8865\u5145\u5b66\u4e60</h3><p class="text-xs text-gray-400">10 \u5206\u949f \u00b7 \u6062\u590d\u65f6\u95f4</p></div></div><ul class="text-sm text-gray-600 space-y-2 ml-13"><li>\u2705 \u70b9\u51fb\u201c\u64ad\u653e\u5168\u90e8\u201d\uff0c\u5728\u901a\u52e4/\u505a\u5bb6\u52a1\u65f6\u80cc\u666f\u542c</li><li>\u2705 \u4e0d\u9700\u8981\u4e13\u6ce8\uff0c\u8ba9\u8033\u6735\u719f\u6089\u8282\u594f\u548c\u53d1\u97f3</li></ul></div>' +
        '<div class="bg-white rounded-xl border border-gray-100 p-5"><div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl">\ud83d\udcdd</div><div><h3 class="font-bold text-gray-800">\u53cd\u601d\u8f93\u51fa</h3><p class="text-xs text-gray-400">5 \u5206\u949f \u00b7 \u8d39\u66fc\u6280\u5de7 + \u5f1f\u5b50\u6548\u5e94</p></div></div><ul class="text-sm text-gray-600 space-y-2 ml-13"><li>\u2705 \u9009\u4e00\u53e5\u4eca\u5929\u5b66\u5230\u7684\u53e5\u578b\uff0c\u5199\u4e0b\u4f7f\u7528\u573a\u666f</li><li>\u2705 \u8bd5\u7740\u628a\u8fd9\u53e5\u8bdd\u201c\u6559\u201d\u7ed9\u5bb6\u4eba/\u670b\u53cb</li><li>\u2705 <a href="#journal" class="text-indigo-500 underline">\u53bb\u5199\u53cd\u601d\u65e5\u8bb0</a></li></ul></div>' +
      '</div>' +
      '<div class="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm"><strong class="text-amber-800">\ud83d\udca1 \u9f50\u52a0\u5c3c\u514b\u6548\u5e94\uff1a</strong><span class="text-amber-700">\u6ca1\u7cbe\u529b\u65f6\uff0c\u53ea\u505a\u6700\u5c0f\u884c\u52a8\u2014\u2014\u6253\u5f00\u5e94\u7528\u3001\u542c\u4e00\u53e5\u3001\u638c\u63e1\u4e00\u53e5\u3002\u53ea\u8981\u542f\u52a8\u4e86\u5c31\u8d62\u4e86\u3002</span></div>' +
      '<div class="bg-white rounded-xl border border-gray-100 p-5 text-center"><p class="text-gray-500 text-sm">\u4eca\u65e5\u8bad\u7ec3\u7edf\u8ba1</p><p class="text-4xl font-extrabold text-indigo-600 mt-2">' + state.daily.sentences + '</p><p class="text-gray-400 text-sm">\u53e5\u5df2\u638c\u63e1</p></div></div>';
      c.innerHTML = h;
    }
  }

  // ---- JOURNAL ----
  function renderJournal() {
    var c = document.getElementById('page-journal-content'); if (!c) return;
    if (!state.user) { c.innerHTML = '<div class="max-w-lg mx-auto px-4 py-12 text-center"><p class="text-gray-400">请先选择学习者</p><button onclick="app.nav(\'home\')" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg">返回首页</button></div>'; return; }
    var child = isChild();

    if (child) {
      var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
        '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>' +
        '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83c\udf1f 今天最棒的一句</h1>' +
        '<p class="text-gray-500 text-sm mb-6">选一句今天印象最深的英语句子，或者自己写一句！</p>';

      // Auto-fill from learned sentences
      var learned = [];
      APP_DATA[state.user].islands.forEach(function(isl, ii) {
        isl.sentences.forEach(function(s, si) {
          if (isCompleted(state.user, ii, si)) learned.push(s);
        });
      });

      if (learned.length > 0) {
        var sample = learned.slice(-8);
        h += '<div class="bg-white rounded-xl border border-gray-100 p-5 mb-6"><h3 class="font-bold text-gray-700 mb-3">从已学的句子中选一句</h3><div class="grid grid-cols-1 gap-2">';
        sample.forEach(function(s) {
          h += '<div onclick="app.pickFavorite(\'' + esc(s).replace(/'/g, "\\'") + '\')" class="p-3 rounded-lg border border-gray-100 hover:border-amber-300 hover:bg-amber-50 cursor-pointer text-sm text-gray-700 transition">' + esc(s) + '</div>';
        });
        h += '</div></div>';
      }

      h += '<div class="bg-white rounded-xl border border-gray-100 p-5 mb-6"><h3 class="font-bold text-gray-700 mb-3">或者自己写一句</h3>' +
        '<input id="j-sentence" type="text" placeholder="用英语写一句今天学到的话..." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">' +
        '<button onclick="app.saveChildFavorite()" class="w-full mt-3 py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition">选定⭐</button></div>';

      if (state.journal.length > 0) {
        h += '<h3 class="font-bold text-gray-700 mb-3">收藏的星星句</h3><div class="space-y-3">';
        state.journal.slice().reverse().forEach(function(e) {
          h += '<div class="bg-white rounded-xl border border-gray-100 p-4"><div class="flex items-center justify-between mb-2"><span class="text-xs text-gray-400">' + (e.date || '') + '</span><button onclick="app.deleteJournal(\'' + (e.date || '') + '\')" class="text-xs text-gray-300 hover:text-red-400">删除</button></div>' +
            '<p class="text-sm font-medium text-amber-600">\u2b50 ' + esc(e.sentence || '') + '</p></div>';
        });
        h += '</div>';
      }
      h += '</div>';
    } else {
      var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
        '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>' +
        '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83d\udcdd 反思日记</h1>' +
        '<p class="text-gray-500 text-sm mb-6">\u201c分享学习过程，不仅能让你的学得更快，还能让世界上某个地方的人，因为你的分享而改变人生轨迹。\u201d \u2014\u2014 Dan Koe</p>';

      // Auto-fill suggestion from learned sentences
      var learned = [];
      APP_DATA[state.user].islands.forEach(function(isl, ii) {
        isl.sentences.forEach(function(s, si) {
          if (isCompleted(state.user, ii, si)) learned.push(s);
        });
      });
      if (learned.length > 0) {
        h += '<div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 text-xs text-indigo-600 cursor-pointer" onclick="document.getElementById(\'j-sentence\').value=\'' + esc(learned[learned.length - 1].replace(/'/g, "\\'")) + '\'">\ud83d\udca1 点击自动填入最近掌握的句子</div>';
      }

      h += '<div class="bg-white rounded-xl border border-gray-100 p-5 mb-6"><h3 class="font-bold text-gray-700 mb-3">今天学到了什么？</h3><div class="space-y-3">' +
          '<div><label class="text-sm text-gray-500 block mb-1">今天的金句（用英语写一句印象最深的句子）</label><input id="j-sentence" type="text" placeholder="e.g. I usually have coffee and toast for breakfast." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"></div>' +
          '<div><label class="text-sm text-gray-500 block mb-1">使用场景（你会在什么情况下用这句话？）</label><textarea id="j-scene" rows="2" placeholder="比如在早餐店点餐时..." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"></textarea></div>' +
          '<div><label class="text-sm text-gray-500 block mb-1">教给别人（用简单的话解释这句话的用法）</label><textarea id="j-teach" rows="2" placeholder="比如：这句话意思是..." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"></textarea></div>' +
          '<div><label class="text-sm text-gray-500 block mb-1">逆向思考（芒格：哪里可能出错？）</label><textarea id="j-reverse" rows="2" placeholder="比如：在正式场合这样说可能不太合适，因为..." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"></textarea></div>' +
          '<button onclick="app.saveJournal()" class="w-full py-2.5 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 transition">保存今天的反思</button></div></div>';

      if (state.journal.length > 0) {
        h += '<h3 class="font-bold text-gray-700 mb-3">历史记录</h3><div class="space-y-3">';
        state.journal.slice().reverse().forEach(function(e) {
          h += '<div class="bg-white rounded-xl border border-gray-100 p-4"><div class="flex items-center justify-between mb-2"><span class="text-xs text-gray-400">' + (e.date || '') + '</span><button onclick="app.deleteJournal(\'' + (e.date || '') + '\')" class="text-xs text-gray-300 hover:text-red-400">删除</button></div>' +
            '<p class="text-sm font-medium text-indigo-600 mb-1 italic">\u201c' + esc(e.sentence || '') + '\u201d</p>' +
            (e.scene ? '<p class="text-sm text-gray-600">\ud83c\udfac ' + esc(e.scene) + '</p>' : '') +
            (e.teach ? '<p class="text-sm text-gray-500 mt-1">\ud83c\udf93 ' + esc(e.teach) + '</p>' : '') +
            (e.reverse ? '<p class="text-sm text-purple-500 mt-1">\ud83e\uddd8 ' + esc(e.reverse) + '</p>' : '') + '</div>';
        });
        h += '</div>';
      }
      h += '</div>';
    }
    c.innerHTML = h;
  }

  // ---- REVIEW (Spaced Repetition Page) ----
  function renderReview() {
    var c = document.getElementById('page-review-content'); if (!c) return;
    var due = getAllDueReviews();
    var srsStats; if (state.user) { srsStats = getSRSStats(state.user); } else { var _a=state.srs,_t=todayStr(); srsStats={total:_a.length,due:_a.filter(function(r){return r.dueDate<=_t;}).length,mastered:_a.filter(function(r){return r.reps>=SRS_INTERVALS.length;}).length}; }

    var h = '<div class="max-w-2xl mx-auto px-4 py-8">' +
      '<a href="#" onclick="app.nav(\'home\');return false;" class="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-6 transition"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>返回</a>' +
      '<h1 class="text-2xl font-bold text-gray-800 mb-2">\ud83d\udd04 间隔复习</h1>' +
      '<p class="text-gray-500 text-sm mb-6">芒格"安全边际"：复习旧内容是回报最高的时间投入</p>';

    // Stats summary
    h += '<div class="grid grid-cols-3 gap-3 mb-6">' +
      '<div class="bg-white rounded-xl border border-gray-100 p-3 text-center"><p class="text-2xl font-extrabold text-emerald-600">' + srsStats.total + '</p><p class="text-xs text-gray-400">进入SRS</p></div>' +
      '<div class="bg-white rounded-xl border border-gray-100 p-3 text-center"><p class="text-2xl font-extrabold text-amber-600">' + srsStats.due + '</p><p class="text-xs text-gray-400">待复习</p></div>' +
      '<div class="bg-white rounded-xl border border-gray-100 p-3 text-center"><p class="text-2xl font-extrabold text-indigo-600">' + srsStats.mastered + '</p><p class="text-xs text-gray-400">已巩固</p></div></div>';

    if (due.length === 0) {
      h += '<div class="bg-green-50 border border-green-200 rounded-xl p-8 text-center"><p class="text-3xl mb-3">\u2705</p><p class="text-green-700 font-bold">\u6682\u65e0\u5230\u671f\u590d\u4e60</p><p class="text-green-500 text-sm mt-1">\u6240\u6709\u53e5\u5b50\u90fd\u5728\u5b89\u5168\u533a\u57df\uff0c\u7ee7\u7eed\u5b66\u4e60\u65b0\u53e5\u5b50\u5427\uff01</p></div>';
    } else {
      // Munger wisdom
      h += '<div class="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 mb-6 text-sm"><strong class="text-purple-800">\ud83e\uddd8 芒格：</strong><span class="text-purple-700">\u201c安全边际\u201d\u2014\u2014 复习1句旧句 > 学3句新句。记忆的遗忘是不可逆的，而复习是最低成本的维护。</span></div>';

      h += '<div class="space-y-3">';
      due.forEach(function(r, ri) {
        var s = APP_DATA[r.uk] && APP_DATA[r.uk].islands[r.ii] ? APP_DATA[r.uk].islands[r.ii].sentences[r.si] : null;
        if (!s) return;
        var islName = APP_DATA[r.uk].islands[r.ii].name;
        var overdue = r.dueDate < todayStr();

        h += '<div class="review-item bg-white rounded-xl border ' + (overdue ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100') + ' p-4 flex items-start gap-3" data-ri="' + ri + '">' +
          '<button onclick="app.reviewPlay(' + ri + ')" class="play-btn w-8 h-8 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center shrink-0 mt-0.5 transition"><svg class="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-sm text-gray-800">' + esc(s) + '</p>' +
            '<p class="text-[10px] text-gray-400 mt-1">' + esc(islName) + ' · 复习第 ' + (r.reps + 1) + ' 次' + (overdue ? ' · \u23f0 已逾期' : '') + '</p>' +
            '<p class="text-[10px] text-gray-400">间隔：' + r.interval + ' 天</p>' +
          '</div>' +
          '<button onclick="app.markReviewed(\'' + r.uk + '\',' + r.ii + ',' + r.si + ')" class="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition shrink-0">已记住</button>' +
        '</div>';
      });
      h += '</div>';

      // Play all reviews
      h += '<button onclick="app.playAllReviews()" class="w-full mt-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition">\u25b6 连续播放所有待复习句子</button>';
    }

    h += '</div>';
    c.innerHTML = h;
  }

  // ---- UI helpers ----
  function updatePlayingUI() {
    var items = document.querySelectorAll('.sentence-item, .review-item');
    for (var i = 0; i < items.length; i++) {
      var el = items[i], idx = parseInt(el.getAttribute('data-idx') || el.getAttribute('data-ri'));
      if (idx === undefined || idx === null) continue;
      var btn = el.querySelector('.play-btn'), isP = state.playingIdx === idx;
      if (isP) el.classList.add('playing'); else el.classList.remove('playing');
      if (btn) { if (isP) btn.classList.add('playing'); else btn.classList.remove('playing');
        var color = isChild() ? 'text-amber-500' : 'text-indigo-500';
        if (el.classList.contains('review-item')) color = 'text-emerald-600';
        btn.innerHTML = isP ? '<svg class="w-4 h-4 ' + color + '" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg class="w-4 h-4 ' + color + '" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
      }
    }
  }

  function playAllFn() {
    if (synth.speaking) { stopSpeaking(); playAllQueue=[]; var b=document.getElementById('play-all-text'); if(b) b.innerHTML='\u25b6 播放全部（'+APP_DATA[state.user].islands[state.islandIdx].sentences.length+' 句）'; return; }
    playAllQueue=APP_DATA[state.user].islands[state.islandIdx].sentences.slice(); playAllIndex=0; playNext();
  }

  function playNext() {
    if (playAllIndex>=playAllQueue.length) { playAllQueue=[]; var b=document.getElementById('play-all-text'); if(b) b.innerHTML='\u25b6 播放全部（'+APP_DATA[state.user].islands[state.islandIdx].sentences.length+' 句）'; return; }
    var b=document.getElementById('play-all-text'); if(b) b.innerHTML='\u23f8 停止（'+(playAllIndex+1)+'/'+playAllQueue.length+'）';
    speak(getEn(playAllQueue[playAllIndex]),playAllIndex,function(){setTimeout(function(){playAllIndex++;playNext();},1200);});
  }

  // Review play helpers
  var reviewQueue = [], reviewPlayIndex = 0;

  function playAllReviewsFn() {
    var due = getAllDueReviews();
    if (due.length === 0) return;
    if (synth.speaking) { stopSpeaking(); reviewQueue=[]; return; }
    reviewQueue = due.map(function(r) {
      return APP_DATA[r.uk] && APP_DATA[r.uk].islands[r.ii] ? APP_DATA[r.uk].islands[r.ii].sentences[r.si] : null;
    }).filter(function(s) { return s; });
    reviewPlayIndex = 0;
    playReviewNext();
  }

  function playReviewNext() {
    if (reviewPlayIndex >= reviewQueue.length) { reviewQueue=[]; return; }
    speak(getEn(reviewQueue[reviewPlayIndex]), reviewPlayIndex, function() {
      setTimeout(function() { reviewPlayIndex++; playReviewNext(); }, 1500);
    });
  }

  // ---- Init ----
  function init() {
    loadAll();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = function(){};
    trackTimeStart();
    var appEl = document.getElementById('app');
    appEl.innerHTML =
      '<div id="page-home" class="page active"><div id="page-home-content"></div></div>' +
      '<div id="page-islands" class="page"><div id="page-islands-content"></div></div>' +
      '<div id="page-detail" class="page"><div id="page-detail-content"></div></div>' +
      '<div id="page-progress" class="page"><div id="page-progress-content"></div></div>' +
      '<div id="page-plan" class="page"><div id="page-plan-content"></div></div>' +
      '<div id="page-daily" class="page"><div id="page-daily-content"></div></div>' +
      '<div id="page-journal" class="page"><div id="page-journal-content"></div></div>' +
      '<div id="page-review" class="page"><div id="page-review-content"></div></div>';
    handleRoute();
  }

  // ---- Public API ----
  window.app = {
    nav: function(p) { window.location.hash=p; navigate(p); },
    selectUser: function(uk) { state.user=uk; window.location.hash='u/'+uk; navigate('islands'); },
    selectIsland: function(idx) { state.islandIdx=idx; state.revealedSentences={}; window.location.hash='u/'+state.user+'/'+idx; navigate('detail'); },
    playSentence: function(idx) { speak(getEn(APP_DATA[state.user].islands[state.islandIdx].sentences[idx]),idx); },
    markDone: function(idx) { markCompleted(state.user,state.islandIdx,idx); renderDetail(); },
    revealSentence: function(idx) { state.revealedSentences[idx]=true; renderDetail(); },
    toggleShadow: function() { state.shadowMode=!state.shadowMode; if(state.islandIdx!==null&&document.getElementById('page-detail').classList.contains('active')) renderDetail(); else renderIslands(); },
    resetProgress: function() { if(confirm('确定重置所有进度？')) { state.completedSentences={}; state.streak={count:0,lastDate:null,history:[]}; state.daily={date:null,sentences:0}; state.journal=[]; state.stars=0; state.srs=[]; state.badges=[]; save(STORAGE_KEY,{completed:{}}); save(STREAK_KEY,state.streak); save(DAILY_KEY,state.daily); save(JOURNAL_KEY,[]); save(STAR_KEY,0); save(SRS_KEY,[]); save(BADGE_KEY,[]); navigate('progress'); } },
    playAll: playAllFn,
    toggleGuide: function() { var c=document.getElementById('guide-content'),a=document.getElementById('guide-arrow'); if(c.classList.contains('hidden')){c.classList.remove('hidden');a.style.transform='rotate(180deg)';}else{c.classList.add('hidden');a.style.transform='rotate(0deg)';} },
    // Journal
    saveJournal: function() {
      var s=document.getElementById('j-sentence').value.trim(),sc=document.getElementById('j-scene').value.trim(),t=document.getElementById('j-teach').value.trim();
      var rv = document.getElementById('j-reverse') ? document.getElementById('j-reverse').value.trim() : '';
      if(!s){alert('请写下今天的金句');return;}
      state.journal.push({date:todayStr()+' '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),sentence:s,scene:sc,teach:t,reverse:rv});
      save(JOURNAL_KEY,state.journal.slice(-50)); checkBadges(state.user); renderJournal();
    },
    saveChildFavorite: function() {
      var s=document.getElementById('j-sentence').value.trim();
      if(!s){alert('请写下你的英语句子');return;}
      state.journal.push({date:todayStr(),sentence:s,scene:''});
      save(JOURNAL_KEY,state.journal.slice(-50)); checkBadges(state.user); renderJournal();
    },
    pickFavorite: function(s) {
      state.journal.push({date:todayStr(),sentence:s,scene:''});
      save(JOURNAL_KEY,state.journal.slice(-50)); checkBadges(state.user); renderJournal();
    },
    deleteJournal: function(d) { state.journal=state.journal.filter(function(e){return e.date!==d;}); save(JOURNAL_KEY,state.journal); renderJournal(); },
    // Review
    startReview: function() { window.location.hash='review'; navigate('review'); },
    reviewPlay: function(idx) {
      var due = getAllDueReviews();
      var r = due[idx]; if(!r) return;
      var s = APP_DATA[r.uk].islands[r.ii].sentences[r.si];
      speak(getEn(s), idx);
    },
    markReviewed: function(uk, ii, si) {
      markReviewed(uk, ii, si);
      checkBadges(state.user);
      renderReview();
      // Badge notification
      var newBadges = checkBadges(uk);
      if (newBadges.length > 0) {
        var names = newBadges.map(function(id) { var d = BADGE_DEFS.filter(function(b){return b.id===id;})[0]; return d ? d.icon+' '+d.name : id; }).join(', ');
        alert('获得成就：' + names);
      }
    },
    playAllReviews: playAllReviewsFn,
    toggleChinese: function() { state.showChinese = !state.showChinese; save('ei_show_cn', state.showChinese); renderDetail(); }
  };

  window.addEventListener('hashchange', handleRoute);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
