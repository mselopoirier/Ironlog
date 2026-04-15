// ── Data ──────────────────────────────────────────────────────────────────
const DEFAULT_EXERCISES = ["Développé couché","Squat","Soulevé de terre","Développé militaire","Tractions","Rowing barre","Presse à cuisses","Curl barre","Triceps poulie","Hip thrust","Fentes","Développé incliné","Leg curl","Tirage vertical","Rowing haltère","Curl marteau","Écarté poulie","Élévations latérales","Mollets machine"];
const ICONS = ["💪","⬆️","⬇️","🦵","🔥","⚡","🏋️","🎯","💥","🦾","🧠","🏃"];
const MUSCLE_GROUPS = ["Pectoraux","Dos","Épaules","Biceps","Triceps","Jambes","Abdos","Fessiers","Mollets"];
const EXERCISE_MUSCLES = {
  "Développé couché":"Pectoraux","Développé incliné":"Pectoraux","Écarté poulie":"Pectoraux",
  "Tractions":"Dos","Rowing barre":"Dos","Tirage vertical":"Dos","Rowing haltère":"Dos",
  "Développé militaire":"Épaules","Élévations latérales":"Épaules",
  "Curl barre":"Biceps","Curl marteau":"Biceps","Curl haltère":"Biceps",
  "Triceps poulie":"Triceps","Dips":"Triceps","Extension triceps":"Triceps",
  "Squat":"Jambes","Presse à cuisses":"Jambes","Leg curl":"Jambes","Fentes":"Jambes",
  "Hip thrust":"Fessiers",
  "Mollets machine":"Mollets",
  "Soulevé de terre":"Dos",
  "Crunch":"Abdos","Planche":"Abdos",
};

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  view: "home",
  data: loadData(),
  session: null,
  activeExIdx: 0,
  showExPicker: false,
  showPRBanner: false,
  prMessage: "",
  progressEx: "",
  progressMetric: "orm",
  editingTemplate: null,
  viewingSession: null,
  editingSession: null,
  editSessionExIdx: 0,
  // Rest timer
  restTimer: null,
  restRemaining: 0,
  restTotal: 90,
  restInterval: null,
};
let prTimer = null;

function loadData() {
  try { return JSON.parse(localStorage.getItem("gymData") || "{}"); }
  catch(e) { return {}; }
}
function saveData() { localStorage.setItem("gymData", JSON.stringify(state.data)); }
function setState(patch) { Object.assign(state, patch); render(); }

// ── Exercise helpers ───────────────────────────────────────────────────────
function getExerciseList() {
  return state.data.customExercises ? [...DEFAULT_EXERCISES, ...state.data.customExercises] : [...DEFAULT_EXERCISES];
}
function addCustomExercise(name) {
  if (!state.data.customExercises) state.data.customExercises = [];
  if (!getExerciseList().includes(name)) { state.data.customExercises.push(name); saveData(); }
}
function deleteCustomExercise(name) {
  state.data.customExercises = (state.data.customExercises || []).filter(e => e !== name);
  saveData();
}
function getMuscle(name) {
  return EXERCISE_MUSCLES[name] || (state.data.exerciseMuscles || {})[name] || null;
}

// ── Template helpers ───────────────────────────────────────────────────────
function getTemplates() { return state.data.templates || []; }
function saveTemplate(tpl) {
  if (!state.data.templates) state.data.templates = [];
  const idx = state.data.templates.findIndex(t => t.id === tpl.id);
  if (idx >= 0) state.data.templates[idx] = tpl; else state.data.templates.push(tpl);
  saveData();
}
function deleteTemplate(id) { state.data.templates = (state.data.templates||[]).filter(t=>t.id!==id); saveData(); }

// ── Stats helpers ──────────────────────────────────────────────────────────
function calcOneRM(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)); }
function allSessions() { return Object.values(state.data.sessions || {}).sort((a,b) => b.date - a.date); }
function calcStreak(sessions) {
  if (!sessions.length) return 0;
  const days = [...new Set(sessions.map(s => new Date(s.date).toDateString()))].map(d => new Date(d)).sort((a,b) => b-a);
  let streak = 0, cur = new Date(); cur.setHours(0,0,0,0);
  for (const d of days) { const diff = Math.round((cur - d) / 86400000); if (diff <= 1) { streak++; cur = d; } else break; }
  return streak;
}
function sessionsThisWeek(sessions) {
  const now = new Date(), ws = new Date(now); ws.setDate(now.getDate() - now.getDay());
  return sessions.filter(s => new Date(s.date) >= ws).length;
}
function getExerciseHistory(name) {
  return allSessions().filter(s => s.exercises && s.exercises.some(e => e.name === name)).map(s => {
    const ex = s.exercises.find(e => e.name === name);
    const best = ex.sets.reduce((acc,set) => { const orm=calcOneRM(+set.weight,+set.reps); return orm>acc.orm?{orm,weight:+set.weight,reps:+set.reps}:acc; }, {orm:0,weight:0,reps:0});
    return { date:s.date, ...best, volume:ex.sets.reduce((a,s)=>a+s.weight*s.reps,0), sets:ex.sets };
  }).reverse();
}
function getPR(name) { return getExerciseHistory(name).reduce((best,h) => h.orm>(best?best.orm:0)?h:best, null); }
function getLastUsed(name) {
  const hist = getExerciseHistory(name);
  return hist.length > 0 ? hist[hist.length-1] : null;
}
function getAllPRs() {
  const exercises = [...new Set(allSessions().flatMap(s => (s.exercises||[]).map(e => e.name)))];
  return exercises.map(name => ({ name, pr: getPR(name) })).filter(x => x.pr).sort((a,b) => b.pr.orm - a.pr.orm);
}
function getVolumeByWeek() {
  const weeks = {};
  allSessions().forEach(s => {
    const d = new Date(s.date);
    const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay()); weekStart.setHours(0,0,0,0);
    const key = weekStart.getTime();
    if (!weeks[key]) weeks[key] = { date: weekStart, volume: 0, sessions: 0 };
    weeks[key].volume += (s.exercises||[]).reduce((a,e) => a+e.sets.reduce((b,st)=>b+st.weight*st.reps,0),0);
    weeks[key].sessions++;
  });
  return Object.values(weeks).sort((a,b) => a.date - b.date).slice(-8);
}
function getMuscleDistribution() {
  const muscles = {};
  allSessions().slice(0,10).forEach(s => {
    (s.exercises||[]).forEach(ex => {
      const m = getMuscle(ex.name);
      if (m) muscles[m] = (muscles[m]||0) + ex.sets.length;
    });
  });
  return muscles;
}

// ── Rest Timer ─────────────────────────────────────────────────────────────
function startRestTimer(seconds) {
  clearInterval(state.restInterval);
  const interval = setInterval(() => {
    if (state.restRemaining <= 1) {
      clearInterval(interval);
      if ('vibrate' in navigator) navigator.vibrate([300,100,300]);
      setState({ restTimer: false, restRemaining: 0, restInterval: null });
    } else {
      state.restRemaining--;
      render();
    }
  }, 1000);
  setState({ restTimer: true, restRemaining: seconds, restTotal: seconds, restInterval: interval });
}
function stopRestTimer() {
  clearInterval(state.restInterval);
  setState({ restTimer: false, restRemaining: 0, restInterval: null });
}

// ── Workout actions ────────────────────────────────────────────────────────
function startFromTemplate(tpl) {
  setState({ session: { id:Date.now(), date:Date.now(), templateName:tpl.name, exercises:tpl.exercises.map(name=>({name,sets:[]})), notes:"" }, activeExIdx:0, view:"workout" });
}
function startBlank() {
  setState({ session: { id:Date.now(), date:Date.now(), templateName:null, exercises:[], notes:"" }, activeExIdx:0, view:"workout" });
}
function resumeSession() { setState({ view:"workout" }); }
function addExerciseToSession(name) {
  state.session.exercises.push({ name, sets:[] });
  setState({ session:state.session, activeExIdx:state.session.exercises.length-1, showExPicker:false });
}
function addSet() {
  const w = +document.getElementById("inp-weight").value;
  const r = +document.getElementById("inp-reps").value;
  if (!w || !r) return;
  const ex = state.session.exercises[state.activeExIdx];
  const prBefore = getPR(ex.name);
  const orm = calcOneRM(w, r);
  ex.sets.push({ weight:w, reps:r, id:Date.now() });
  document.getElementById("inp-reps").value = "";
  startRestTimer(state.restTotal);
  if (!prBefore || orm > prBefore.orm) {
    clearTimeout(prTimer);
    setState({ session:state.session, showPRBanner:true, prMessage:`Nouveau PR — ${ex.name} : ${w}kg × ${r} (1RM ~${orm}kg)` });
    prTimer = setTimeout(() => setState({ showPRBanner:false }), 4000);
  } else setState({ session:state.session });
}
function duplicateLastSet() {
  const ex = state.session.exercises[state.activeExIdx];
  if (!ex || ex.sets.length === 0) return;
  const last = ex.sets[ex.sets.length-1];
  ex.sets.push({ weight:last.weight, reps:last.reps, id:Date.now() });
  startRestTimer(state.restTotal);
  setState({ session:state.session });
}
function removeSet(exIdx, setId) {
  state.session.exercises[exIdx].sets = state.session.exercises[exIdx].sets.filter(s => s.id !== setId);
  setState({ session:state.session });
}
function finishSession() {
  clearInterval(state.restInterval);
  const s = state.session;
  const withSets = { ...s, exercises:s.exercises.filter(e=>e.sets.length>0) };
  if (withSets.exercises.length > 0) {
    if (!state.data.sessions) state.data.sessions = {};
    state.data.sessions[withSets.id] = withSets;
    saveData();
  }
  setState({ session:null, view:"home", restTimer:false, restRemaining:0, restInterval:null });
}

// ── Edit session ───────────────────────────────────────────────────────────
function startEditSession(s) { setState({ editingSession:JSON.parse(JSON.stringify(s)), editSessionExIdx:0, view:"editSession" }); }
function addExerciseToEdit(name) {
  state.editingSession.exercises.push({ name, sets:[] });
  setState({ editingSession:state.editingSession, editSessionExIdx:state.editingSession.exercises.length-1, showExPicker:false });
}
function addSetToEdit() {
  const w = +document.getElementById("edit-weight").value;
  const r = +document.getElementById("edit-reps").value;
  if (!w || !r) return;
  state.editingSession.exercises[state.editSessionExIdx].sets.push({ weight:w, reps:r, id:Date.now() });
  document.getElementById("edit-reps").value = "";
  setState({ editingSession:state.editingSession });
}
function removeSetFromEdit(exIdx, setId) {
  state.editingSession.exercises[exIdx].sets = state.editingSession.exercises[exIdx].sets.filter(s => s.id !== setId);
  setState({ editingSession:state.editingSession });
}
function saveEditedSession() {
  const s = state.editingSession;
  const withSets = { ...s, exercises:s.exercises.filter(e=>e.sets.length>0) };
  state.data.sessions[withSets.id] = withSets; saveData();
  setState({ view:"sessionDetail", viewingSession:withSets, editingSession:null, data:state.data });
}

// ── CSV Export ─────────────────────────────────────────────────────────────
function exportCSV() {
  const rows = ["Date,Séance,Exercice,Série,Poids(kg),Reps,1RM estimé"];
  allSessions().forEach(s => {
    const date = new Date(s.date).toLocaleDateString("fr-FR");
    const name = s.templateName || "Libre";
    (s.exercises||[]).forEach(ex => {
      ex.sets.forEach((set,i) => {
        rows.push(`${date},"${name}","${ex.name}",${i+1},${set.weight},${set.reps},${calcOneRM(set.weight,set.reps)}`);
      });
    });
  });
  const blob = new Blob([rows.join("\n")], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "ironlog_export.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Render helpers ─────────────────────────────────────────────────────────
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k,v]) => {
    if (k==="style"&&typeof v==="object") Object.assign(e.style,v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(),v);
    else if (k==="className") e.className=v;
    else e.setAttribute(k,v);
  });
  children.flat(Infinity).forEach(c => {
    if (c==null||c===false) return;
    e.appendChild(typeof c==="string"||typeof c==="number" ? document.createTextNode(String(c)) : c);
  });
  return e;
}
function div(a,...c) { return el("div",a,...c); }
function btn(a,...c) { return el("button",a,...c); }
function span(a,...c) { return el("span",a,...c); }
function pageHeader(left,center,right) { return div({className:"page-header"},left,center,right||div({style:{width:44}})); }
function sectionLabel(text) { return div({className:"section-label"},text); }
function statBlock(label,value) { return div({className:"stat-block"},div({className:"stat-value"},String(value)),div({className:"stat-label"},label.toUpperCase())); }
function card(attrs,...c) { return div({className:"card",...attrs},...c); }
function tag(text) { return span({className:"tag"},text); }

// ── REST TIMER WIDGET ──────────────────────────────────────────────────────
function renderRestTimerBar() {
  if (!state.restTimer && state.restRemaining === 0) return null;
  const pct = state.restTimer ? (state.restRemaining / state.restTotal) * 100 : 0;
  const mins = Math.floor(state.restRemaining / 60);
  const secs = state.restRemaining % 60;
  const timeStr = mins > 0 ? `${mins}:${String(secs).padStart(2,"0")}` : `${state.restRemaining}s`;
  return div({ className:"rest-bar" },
    div({ className:"rest-bar-inner", style:{ width: pct + "%" } }),
    div({ className:"rest-bar-content" },
      span({ style:{ fontSize:13, fontWeight:700 } }, "⏱ Repos : " + timeStr),
      div({ style:{ display:"flex", gap:8 } },
        btn({ className:"rest-quick-btn", onClick:() => startRestTimer(60) }, "1:00"),
        btn({ className:"rest-quick-btn", onClick:() => startRestTimer(90) }, "1:30"),
        btn({ className:"rest-quick-btn", onClick:() => startRestTimer(120) }, "2:00"),
        btn({ className:"rest-quick-btn", style:{color:"#e63946"}, onClick: stopRestTimer }, "✕")
      )
    )
  );
}

// ── EXERCISE PICKER ────────────────────────────────────────────────────────
function renderExPicker(onAdd, existingCheck) {
  const all = getExerciseList();
  return div({ className:"modal-overlay", onClick:() => setState({ showExPicker:false }) },
    div({ className:"modal-sheet", onClick:e=>e.stopPropagation() },
      div({ className:"modal-handle" }),
      div({ style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 } },
        div({ className:"modal-title" }, "Choisir un exercice"),
        btn({ className:"link-btn", onClick:() => setState({ view:"manageExercises" }) }, "Gérer ma liste")
      ),
      div({ style:{ display:"flex", gap:8, marginBottom:12 } },
        el("input", { id:"custom-ex", placeholder:"Exercice personnalisé...", className:"text-input" }),
        btn({ className:"red-btn", onClick:() => {
          const v = document.getElementById("custom-ex").value.trim();
          if (v) { addCustomExercise(v); onAdd(v); }
        } }, "＋")
      ),
      div({ style:{ overflowY:"auto", maxHeight:"55vh" } },
        ...all.map(name => {
          const already = existingCheck && existingCheck(name);
          const last = getLastUsed(name);
          return btn({ className:"picker-item"+(already?" picked":""), onClick:() => { if(!already) onAdd(name); } },
            div({ style:{ display:"flex", flexDirection:"column", alignItems:"flex-start" } },
              span({ style:{ fontSize:15 } }, name),
              last ? span({ style:{ fontSize:11, color:"#666", marginTop:1 } }, "Dernière fois: "+last.weight+"kg × "+last.reps) : null
            ),
            already ? span({ style:{ marginLeft:"auto", color:"#e63946", fontSize:12 } }, "✓") : null
          );
        })
      )
    )
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────
function renderHome() {
  const sessions = allSessions();
  const streak = calcStreak(sessions);
  const last = sessions[0];
  const templates = getTemplates();
  const weekVols = getVolumeByWeek();
  const thisWeekVol = weekVols.length > 0 ? weekVols[weekVols.length-1].volume : 0;
  const lastWeekVol = weekVols.length > 1 ? weekVols[weekVols.length-2].volume : 0;
  const volDiff = lastWeekVol > 0 ? Math.round((thisWeekVol - lastWeekVol) / lastWeekVol * 100) : null;

  return div({ className:"page" },
    pageHeader(
      div({ className:"logo-wrap" },
        div({ className:"logo" }, "IRON", span({ className:"logo-red" }, "LOG")),
        div({ className:"logo-sub" }, "TRAINING TRACKER")
      ),
      div({}),
      div({ style:{ display:"flex", gap:8 } },
        btn({ className:"icon-btn", onClick:() => setState({ view:"dashboard" }) }, "📊"),
        btn({ className:"icon-btn", onClick:() => setState({ view:"progress", progressEx: [...new Set(allSessions().flatMap(s => (s.exercises||[]).map(e => e.name)))][0] || "" }) }, "📈"),
        btn({ className:"icon-btn", onClick:() => setState({ view:"history" }) }, "📅")
      )
    ),

    // Resume banner if session in progress
    state.session ? div({ className:"resume-banner", onClick: resumeSession },
      div({},
        div({ style:{ fontWeight:800, fontSize:14 } }, "⚡ Séance en cours"),
        div({ style:{ color:"#ffaaaa", fontSize:12 } }, state.session.templateName || "Séance libre")
      ),
      btn({ className:"finish-btn", style:{ fontSize:13 } }, "Reprendre →")
    ) : null,

    div({ className:"stats-strip" },
      statBlock("Séances", sessions.length),
      statBlock("Streak", streak+"🔥"),
      statBlock("Cette sem.", sessionsThisWeek(sessions))
    ),

    // Volume trend
    thisWeekVol > 0 ? div({ className:"vol-trend-card" },
      div({ style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
        div({},
          div({ className:"section-label" }, "VOLUME CETTE SEMAINE"),
          div({ style:{ fontWeight:900, fontSize:22, color:"#f0f0f0", marginTop:2 } }, Math.round(thisWeekVol/1000)+"t " + (thisWeekVol%1000) + "kg")
        ),
        volDiff !== null ? div({ style:{ textAlign:"right" } },
          div({ style:{ fontSize:22, fontWeight:900, color: volDiff>=0?"#4caf50":"#e63946" } }, (volDiff>=0?"+":"")+volDiff+"%"),
          div({ style:{ color:"#666", fontSize:11 } }, "vs semaine passée")
        ) : null
      ),
      weekVols.length > 1 ? renderMiniBarChart(weekVols) : null
    ) : null,

    last ? div({ className:"last-session-card" },
      div({ className:"section-label", style:{ marginBottom:4 } }, "DERNIÈRE SÉANCE"),
      div({ style:{ fontWeight:700, fontSize:16 } }, last.templateName || "Séance libre"),
      div({ style:{ color:"#888", fontSize:13, marginTop:2 } },
        new Date(last.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" }) +
        " · " + (last.exercises||[]).length + " exercices"
      )
    ) : null,

    div({ style:{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"22px 16px 10px" } },
      sectionLabel("MES SÉANCES TYPES"),
      btn({ className:"red-outline-btn", onClick:() => setState({ view:"editTemplate", editingTemplate:{ id:Date.now(), name:"", icon:"💪", exercises:[] } }) }, "+ Créer")
    ),

    templates.length === 0
      ? div({ className:"empty-state", style:{ margin:"0 16px" } }, div({ style:{ fontSize:36, marginBottom:8 } }, "📋"), "Aucune séance type.", el("br",{}), "Crée-en une !")
      : div({ className:"template-grid" },
          ...templates.map(tpl =>
            div({ style:{ position:"relative" } },
              btn({ className:"template-card", onClick:() => startFromTemplate(tpl) },
                div({ className:"template-icon" }, tpl.icon),
                div({ className:"template-name" }, tpl.name.toUpperCase()),
                div({ className:"template-sub" }, tpl.exercises.length+" exercices")
              ),
              btn({ className:"edit-tpl-btn", onClick:e=>{ e.stopPropagation(); setState({ view:"editTemplate", editingTemplate:JSON.parse(JSON.stringify(tpl)) }); } }, "✏️")
            )
          )
        ),

    btn({ className:"ghost-btn", onClick: startBlank }, "+ Séance libre")
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
function renderDashboard() {
  const sessions = allSessions();
  const weekVols = getVolumeByWeek();
  const muscles = getMuscleDistribution();
  const allPRs = getAllPRs().slice(0,5);
  const totalVol = sessions.reduce((a,s) => a+(s.exercises||[]).reduce((b,e)=>b+e.sets.reduce((c,st)=>c+st.weight*st.reps,0),0), 0);

  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:() => setState({ view:"home" }) }, "←"),
      div({ className:"page-title" }, "DASHBOARD"),
      btn({ className:"icon-btn", style:{fontSize:13}, onClick: exportCSV }, "⬇ CSV"),
      btn({ className:"red-outline-btn", style:{fontSize:12}, onClick:() => setState({ view:"progress", progressEx: [...new Set(allSessions().flatMap(s=>(s.exercises||[]).map(e=>e.name)))][0]||"" }) }, "📈 Courbes")
    ),
    div({ style:{ flex:1, overflowY:"auto", padding:"12px 16px" } },

      // Global stats
      div({ style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 } },
        div({ className:"dash-stat-card" }, div({ className:"stat-value", style:{fontSize:28} }, sessions.length), div({ className:"stat-label" }, "SÉANCES TOTALES")),
        div({ className:"dash-stat-card" }, div({ className:"stat-value", style:{fontSize:28} }, calcStreak(sessions)+"🔥"), div({ className:"stat-label" }, "STREAK ACTUEL")),
        div({ className:"dash-stat-card" }, div({ className:"stat-value", style:{fontSize:20} }, Math.round(totalVol/1000)+"t"), div({ className:"stat-label" }, "VOLUME TOTAL")),
        div({ className:"dash-stat-card" }, div({ className:"stat-value", style:{fontSize:28} }, getAllPRs().length), div({ className:"stat-label" }, "PERSONAL RECORDS"))
      ),

      // Volume par semaine
      sectionLabel("VOLUME PAR SEMAINE (8 DERNIÈRES)"),
      weekVols.length > 0 ? div({ style:{ marginTop:8, marginBottom:20 } }, renderBarChart(weekVols)) : div({ className:"empty-state" }, "Pas encore de données"),

      // Muscle distribution
      Object.keys(muscles).length > 0 ? div({ marginBottom:16 },
        sectionLabel("MUSCLES LES PLUS TRAVAILLÉS (10 DERNIÈRES SÉANCES)"),
        div({ style:{ marginTop:10, marginBottom:16 } },
          ...Object.entries(muscles).sort((a,b)=>b[1]-a[1]).map(([muscle, sets]) => {
            const max = Math.max(...Object.values(muscles));
            const pct = Math.round(sets/max*100);
            return div({ style:{ marginBottom:10 } },
              div({ style:{ display:"flex", justifyContent:"space-between", marginBottom:4 } },
                span({ style:{ fontSize:13, fontWeight:700 } }, muscle),
                span({ style:{ fontSize:12, color:"#888" } }, sets+" séries")
              ),
              div({ style:{ background:"#252525", borderRadius:4, height:6, overflow:"hidden" } },
                div({ style:{ background:"#e63946", height:"100%", width:pct+"%", borderRadius:4 } })
              )
            );
          })
        )
      ) : null,

      // Top PRs
      allPRs.length > 0 ? div({},
        div({ style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 } },
          sectionLabel("TOP PERSONAL RECORDS"),
          btn({ className:"link-btn", onClick:() => setState({ view:"allPRs" }) }, "Voir tous →")
        ),
        ...allPRs.map(({name, pr}) =>
          div({ className:"set-row" },
            div({ style:{ flex:1, fontWeight:700 } }, name),
            div({ style:{ textAlign:"right" } },
              div({ style:{ color:"#e63946", fontWeight:800 } }, pr.weight+"kg × "+pr.reps),
              div({ style:{ color:"#666", fontSize:11 } }, "1RM ~"+pr.orm+"kg")
            ),
            span({ style:{ marginLeft:8, fontSize:16 } }, "🏆")
          )
        )
      ) : null
    )
  );
}

// ── ALL PRs ───────────────────────────────────────────────────────────────
function renderAllPRs() {
  const prs = getAllPRs();
  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:() => setState({ view:"dashboard" }) }, "←"),
      div({ className:"page-title" }, "PERSONAL RECORDS"),
      div({ style:{ width:44 } })
    ),
    div({ style:{ flex:1, overflowY:"auto", padding:"12px 16px" } },
      prs.length === 0 ? div({ className:"empty-state", style:{ marginTop:48 } }, "Aucun PR enregistré") : null,
      ...prs.map(({name, pr}, i) =>
        div({ className:"set-row" },
          div({ style:{ color:"#e63946", fontWeight:900, width:28, fontSize:16 } }, i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1)),
          div({ style:{ flex:1 } },
            div({ style:{ fontWeight:700, fontSize:15 } }, name),
            div({ style:{ color:"#666", fontSize:11 } }, new Date(pr.date).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) )
          ),
          div({ style:{ textAlign:"right" } },
            div({ style:{ color:"#e63946", fontWeight:800, fontSize:16 } }, pr.weight+"kg × "+pr.reps),
            div({ style:{ color:"#888", fontSize:12 } }, "1RM ~"+pr.orm+"kg")
          )
        )
      )
    )
  );
}

// ── WORKOUT ───────────────────────────────────────────────────────────────
function renderWorkout() {
  const s = state.session;
  const totalSets = s.exercises.reduce((a,e)=>a+e.sets.length,0);
  const totalVol = s.exercises.reduce((a,e)=>a+e.sets.reduce((b,st)=>b+st.weight*st.reps,0),0);
  const activeEx = s.exercises[state.activeExIdx];
  const pr = activeEx ? getPR(activeEx.name) : null;
  const lastUsed = activeEx ? getLastUsed(activeEx.name) : null;

  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:() => setState({ view:"home" }) }, "←"),
      div({ style:{ textAlign:"center" } },
        div({ style:{ fontWeight:800, fontSize:16 } }, s.templateName || "Séance libre"),
        div({ style:{ color:"#888", fontSize:11 } }, totalSets+" séries · "+totalVol.toLocaleString()+" kg")
      ),
      btn({ className:"finish-btn", onClick: finishSession }, "✓ FIN")
    ),

    renderRestTimerBar(),

    div({ className:"ex-tabs" },
      ...s.exercises.map((ex,i) => {
        const abbr = ex.name.split(" ").map(w=>w[0]).join("").slice(0,3).toUpperCase();
        return btn({ className:"ex-tab"+(i===state.activeExIdx?" active":""), onClick:()=>setState({activeExIdx:i}) },
          div({ style:{ fontSize:11, fontWeight:700 } }, abbr),
          div({ style:{ fontSize:10, color:i===state.activeExIdx?"#e63946":"#555" } }, ex.sets.length)
        );
      }),
      btn({ className:"ex-tab add-ex", onClick:()=>setState({showExPicker:true}) }, "＋")
    ),

    activeEx ? div({ style:{ flex:1, overflowY:"auto" } },
      div({ className:"ex-header" },
        div({ style:{ fontWeight:800, fontSize:19 } }, activeEx.name),
        pr ? div({ className:"pr-line" }, "🏆 PR: "+pr.weight+"kg × "+pr.reps+" — 1RM ~"+pr.orm+"kg") : null,
        lastUsed ? div({ style:{ color:"#888", fontSize:12, marginTop:2 } }, "Dernière fois : "+lastUsed.weight+"kg × "+lastUsed.reps+" reps") : null
      ),

      div({ className:"input-block" },
        div({ className:"input-group" },
          el("label", { className:"input-label" }, "POIDS (kg)"),
          el("input", { id:"inp-weight", type:"number", placeholder: lastUsed?String(lastUsed.weight):"80", className:"num-input" })
        ),
        div({ className:"input-group" },
          el("label", { className:"input-label" }, "REPS"),
          el("input", { id:"inp-reps", type:"number", placeholder: lastUsed?String(lastUsed.reps):"8", className:"num-input" })
        ),
        btn({ className:"red-btn large", onClick: addSet }, "＋")
      ),

      // Quick actions
      div({ style:{ display:"flex", gap:8, padding:"8px 16px", borderBottom:"1px solid #252525", background:"#161616" } },
        btn({ className:"quick-btn", onClick: duplicateLastSet }, "⧉ Dupliquer série"),
        btn({ className:"quick-btn", onClick:() => { state.restTotal=60; startRestTimer(60); } }, "⏱ 1:00"),
        btn({ className:"quick-btn", onClick:() => { state.restTotal=90; startRestTimer(90); } }, "⏱ 1:30"),
        btn({ className:"quick-btn", onClick:() => { state.restTotal=120; startRestTimer(120); } }, "⏱ 2:00")
      ),

      div({ style:{ padding:"0 16px" } },
        activeEx.sets.length === 0 ? div({ className:"empty-state", style:{ padding:"24px 0" } }, "Aucune série encore") : null,
        ...activeEx.sets.map((set,si) => {
          const orm = calcOneRM(set.weight, set.reps);
          return div({ className:"set-row" },
            div({ className:"set-num" }, String(si+1)),
            div({ style:{ flex:1 } },
              span({ style:{ fontWeight:700 } }, set.weight+"kg"),
              span({ style:{ color:"#666" } }, " × "),
              span({ style:{ fontWeight:700 } }, set.reps+" reps"),
              span({ style:{ color:"#555", fontSize:12 } }, "  ~"+orm+"kg")
            ),
            btn({ className:"del-btn", onClick:()=>removeSet(state.activeExIdx,set.id) }, "×")
          );
        })
      ),

      // Notes
      div({ style:{ padding:"12px 16px" } },
        div({ className:"section-label", style:{ marginBottom:6 } }, "NOTES DE SÉANCE"),
        el("textarea", {
          placeholder:"Fatigue, douleurs, observations...",
          className:"notes-input",
          onInput: e => { s.notes = e.target.value; },
        }, s.notes || "")
      )

    ) : div({ className:"empty-center" },
        div({ style:{ fontSize:44 } }, "🏋️"),
        div({ style:{ color:"#555" } }, "Ajoute un exercice"),
        btn({ className:"ghost-btn", style:{ margin:"8px 0 0" }, onClick:()=>setState({showExPicker:true}) }, "+ Exercice")
      ),

    state.showExPicker ? renderExPicker(addExerciseToSession, null) : null
  );
}

// ── HISTORY ───────────────────────────────────────────────────────────────
function renderHistory() {
  const sessions = allSessions();
  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:()=>setState({view:"home"}) }, "←"),
      div({ className:"page-title" }, "HISTORIQUE"),
      div({ style:{ width:44 } })
    ),
    div({ style:{ flex:1, overflowY:"auto", padding:"12px 16px" } },
      sessions.length === 0 ? div({ className:"empty-state", style:{ marginTop:48 } }, "Aucune séance enregistrée") : null,
      ...sessions.map(s => {
        const vol = (s.exercises||[]).reduce((a,e)=>a+e.sets.reduce((b,st)=>b+st.weight*st.reps,0),0);
        const totalSets = (s.exercises||[]).reduce((a,e)=>a+e.sets.length,0);
        return card({ style:{ cursor:"pointer" }, onClick:()=>setState({view:"sessionDetail",viewingSession:s}) },
          div({ style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" } },
            div({},
              div({ style:{ fontWeight:700, fontSize:15 } }, s.templateName || "Séance libre"),
              div({ style:{ color:"#777", fontSize:12, marginTop:2 } }, new Date(s.date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}))
            ),
            div({ style:{ display:"flex", alignItems:"center", gap:8 } },
              div({ style:{ textAlign:"right" } },
                div({ style:{ color:"#e63946", fontWeight:700 } }, vol.toLocaleString()+" kg"),
                div({ style:{ color:"#666", fontSize:12 } }, totalSets+" séries")
              ),
              div({ style:{ display:"flex", flexDirection:"column", gap:4 } },
                btn({ className:"icon-btn", style:{ padding:"5px 8px", fontSize:13, background:"#2c1215", borderColor:"#e63946" },
                  onClick:e=>{ e.stopPropagation(); startEditSession(s); } }, "✏️"),
                span({ style:{ color:"#444", fontSize:20, textAlign:"center" } }, "›")
              )
            )
          ),
          div({ style:{ marginTop:10, display:"flex", flexWrap:"wrap", gap:4 } },
            ...(s.exercises||[]).map(e=>tag(e.name))
          ),
          s.notes ? div({ style:{ marginTop:8, color:"#666", fontSize:12, fontStyle:"italic" } }, "📝 "+s.notes) : null
        );
      })
    )
  );
}

// ── SESSION DETAIL ────────────────────────────────────────────────────────
function renderSessionDetail() {
  const s = state.viewingSession;
  const totalVol = (s.exercises||[]).reduce((a,e)=>a+e.sets.reduce((b,st)=>b+st.weight*st.reps,0),0);
  const totalSets = (s.exercises||[]).reduce((a,e)=>a+e.sets.length,0);

  // Find previous same-template session for comparison
  const sameSessions = allSessions().filter(x => x.templateName === s.templateName && x.id !== s.id);
  const prevSession = sameSessions.find(x => x.date < s.date);
  const prevVol = prevSession ? (prevSession.exercises||[]).reduce((a,e)=>a+e.sets.reduce((b,st)=>b+st.weight*st.reps,0),0) : null;
  const volDiff = prevVol ? Math.round((totalVol - prevVol) / prevVol * 100) : null;

  function deleteSession() { delete state.data.sessions[s.id]; saveData(); setState({ view:"history", viewingSession:null, data:state.data }); }
  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:()=>setState({view:"history",viewingSession:null}) }, "←"),
      div({ style:{ textAlign:"center" } },
        div({ className:"page-title" }, s.templateName || "Séance libre"),
        div({ style:{ color:"#777", fontSize:11 } }, new Date(s.date).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}))
      ),
      div({ style:{ display:"flex", gap:6 } },
        btn({ className:"edit-btn", onClick:()=>startEditSession(s) }, "✏️"),
        btn({ className:"del-session-btn", onClick:deleteSession }, "🗑")
      )
    ),
    div({ className:"stats-strip" },
      statBlock("Exercices", (s.exercises||[]).length),
      statBlock("Séries", totalSets),
      statBlock("Volume", totalVol.toLocaleString()+" kg")
    ),

    div({ style:{ flex:1, overflowY:"auto", padding:"12px 16px" } },

      // Comparison with previous
      volDiff !== null ? div({ className:"comparison-card" },
        div({ style:{ fontWeight:700, fontSize:13 } }, "📈 Comparaison vs séance précédente"),
        div({ style:{ display:"flex", justifyContent:"space-between", marginTop:8 } },
          div({ style:{ textAlign:"center" } },
            div({ style:{ color:"#888", fontSize:11 } }, "CETTE SÉANCE"),
            div({ style:{ fontWeight:900, fontSize:18, color:"#f0f0f0" } }, totalVol.toLocaleString()+" kg")
          ),
          div({ style:{ textAlign:"center" } },
            div({ style:{ color:"#888", fontSize:11 } }, "ÉVOLUTION"),
            div({ style:{ fontWeight:900, fontSize:22, color:volDiff>=0?"#4caf50":"#e63946" } }, (volDiff>=0?"+":"")+volDiff+"%")
          ),
          div({ style:{ textAlign:"center" } },
            div({ style:{ color:"#888", fontSize:11 } }, "PRÉCÉDENTE"),
            div({ style:{ fontWeight:900, fontSize:18, color:"#777" } }, prevVol.toLocaleString()+" kg")
          )
        )
      ) : null,

      s.notes ? div({ className:"notes-display" }, "📝 ", s.notes) : null,

      ...(s.exercises||[]).map(ex => {
        const exVol = ex.sets.reduce((a,st)=>a+st.weight*st.reps,0);
        const bestOrm = ex.sets.reduce((best,st)=>{ const orm=calcOneRM(+st.weight,+st.reps); return orm>best?orm:best; },0);
        return div({ className:"ex-detail-card" },
          div({ className:"ex-detail-header" },
            div({},
              div({ style:{ fontWeight:800, fontSize:15 } }, ex.name),
              getMuscle(ex.name) ? span({ className:"muscle-tag" }, getMuscle(ex.name)) : null
            ),
            div({ style:{ textAlign:"right" } },
              div({ style:{ color:"#e63946", fontSize:12, fontWeight:700 } }, exVol.toLocaleString()+" kg vol."),
              div({ style:{ color:"#666", fontSize:11 } }, "1RM ~"+bestOrm+"kg")
            )
          ),
          div({ className:"sets-col-header" },
            div({ style:{ width:24 } }, "#"),
            div({ style:{ flex:1 } }, "POIDS"),
            div({ style:{ flex:1 } }, "REPS"),
            div({ style:{ width:64, textAlign:"right" } }, "1RM")
          ),
          ...ex.sets.map((set,si) => {
            const orm = calcOneRM(+set.weight, +set.reps);
            const isBest = orm === bestOrm;
            return div({ className:"sets-row"+(isBest?" best":"") },
              div({ style:{ color:isBest?"#e63946":"#555", width:24, fontWeight:700 } }, String(si+1)),
              div({ style:{ flex:1, fontWeight:700 } }, set.weight+" kg"),
              div({ style:{ flex:1, fontWeight:700 } }, String(set.reps)),
              div({ style:{ width:64, textAlign:"right", color:isBest?"#e63946":"#666", fontWeight:isBest?800:400 } }, orm+"kg", isBest?" 🏆":null)
            );
          })
        );
      })
    )
  );
}

// ── EDIT SESSION ──────────────────────────────────────────────────────────
function renderEditSession() {
  const s = state.editingSession;
  const totalSets = s.exercises.reduce((a,e)=>a+e.sets.length,0);
  const totalVol = s.exercises.reduce((a,e)=>a+e.sets.reduce((b,st)=>b+st.weight*st.reps,0),0);
  const activeEx = s.exercises[state.editSessionExIdx];
  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:()=>setState({view:"sessionDetail",editingSession:null}) }, "←"),
      div({ style:{ textAlign:"center" } },
        div({ style:{ fontWeight:800, fontSize:15 } }, "MODIFIER LA SÉANCE"),
        div({ style:{ color:"#888", fontSize:11 } }, totalSets+" séries · "+totalVol.toLocaleString()+" kg")
      ),
      btn({ className:"finish-btn", onClick: saveEditedSession }, "✓ OK")
    ),
    div({ className:"ex-tabs" },
      ...s.exercises.map((ex,i) => {
        const abbr = ex.name.split(" ").map(w=>w[0]).join("").slice(0,3).toUpperCase();
        return btn({ className:"ex-tab"+(i===state.editSessionExIdx?" active":""), onClick:()=>setState({editSessionExIdx:i}) },
          div({ style:{ fontSize:11, fontWeight:700 } }, abbr),
          div({ style:{ fontSize:10, color:i===state.editSessionExIdx?"#e63946":"#555" } }, ex.sets.length)
        );
      }),
      btn({ className:"ex-tab add-ex", onClick:()=>setState({showExPicker:true}) }, "＋")
    ),
    activeEx ? div({ style:{ flex:1, overflowY:"auto" } },
      div({ className:"ex-header" },
        div({ style:{ fontWeight:800, fontSize:18 } }, activeEx.name),
        div({ style:{ color:"#555", fontSize:12 } }, activeEx.sets.length+" séries")
      ),
      div({ className:"input-block" },
        div({ className:"input-group" },
          el("label", { className:"input-label" }, "POIDS (kg)"),
          el("input", { id:"edit-weight", type:"number", placeholder:"80", className:"num-input" })
        ),
        div({ className:"input-group" },
          el("label", { className:"input-label" }, "REPS"),
          el("input", { id:"edit-reps", type:"number", placeholder:"8", className:"num-input" })
        ),
        btn({ className:"red-btn large", onClick: addSetToEdit }, "＋")
      ),
      div({ style:{ padding:"0 16px" } },
        activeEx.sets.length === 0 ? div({ className:"empty-state", style:{ padding:"24px 0" } }, "Aucune série") : null,
        ...activeEx.sets.map((set,si) => {
          const orm = calcOneRM(set.weight, set.reps);
          return div({ className:"set-row" },
            div({ className:"set-num" }, String(si+1)),
            div({ style:{ flex:1 } },
              span({ style:{ fontWeight:700 } }, set.weight+"kg"),
              span({ style:{ color:"#666" } }, " × "),
              span({ style:{ fontWeight:700 } }, set.reps+" reps"),
              span({ style:{ color:"#555", fontSize:12 } }, "  ~"+orm+"kg")
            ),
            btn({ className:"del-btn", onClick:()=>removeSetFromEdit(state.editSessionExIdx,set.id) }, "×")
          );
        })
      )
    ) : div({ className:"empty-center" },
        div({ style:{ fontSize:44 } }, "🏋️"),
        btn({ className:"ghost-btn", style:{ margin:"8px 0 0" }, onClick:()=>setState({showExPicker:true}) }, "+ Exercice")
      ),
    state.showExPicker ? renderExPicker(addExerciseToEdit, null) : null
  );
}

// ── MANAGE EXERCISES ──────────────────────────────────────────────────────
function renderManageExercises() {
  const custom = state.data.customExercises || [];
  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:()=>setState({view:"home",showExPicker:false}) }, "←"),
      div({ className:"page-title" }, "MES EXERCICES"),
      div({ style:{ width:44 } })
    ),
    div({ style:{ flex:1, overflowY:"auto", padding:"16px" } },
      sectionLabel("AJOUTER UN EXERCICE"),
      div({ style:{ display:"flex", gap:8, margin:"8px 0 24px" } },
        el("input", { id:"new-ex-input", placeholder:"Nom de l'exercice...", className:"text-input", style:{ flex:1 } }),
        btn({ className:"red-btn", onClick:() => {
          const v = document.getElementById("new-ex-input").value.trim();
          if (v) { addCustomExercise(v); setState({ data:state.data }); document.getElementById("new-ex-input").value=""; }
        } }, "＋")
      ),
      custom.length > 0 ? div({},
        sectionLabel("MES EXERCICES PERSO ("+custom.length+")"),
        div({ style:{ marginTop:8 } },
          ...custom.map(name =>
            div({ className:"set-row" },
              div({ style:{ flex:1, fontWeight:600, fontSize:15 } }, name),
              btn({ className:"del-btn", onClick:()=>{ deleteCustomExercise(name); setState({ data:state.data }); } }, "×")
            )
          )
        )
      ) : null,
      div({ style:{ marginTop:24 } },
        sectionLabel("EXERCICES PAR DÉFAUT ("+DEFAULT_EXERCISES.length+")"),
        div({ style:{ marginTop:8 } },
          ...DEFAULT_EXERCISES.map(name => div({ className:"set-row" }, div({ style:{ flex:1, color:"#666", fontSize:14 } }, name)))
        )
      )
    )
  );
}

// ── EDIT TEMPLATE ─────────────────────────────────────────────────────────
function renderEditTemplate() {
  const tpl = state.editingTemplate;
  const isNew = !getTemplates().find(t => t.id === tpl.id);
  function addTplEx(name) { if (!tpl.exercises.includes(name)) tpl.exercises.push(name); setState({ editingTemplate:tpl, showExPicker:false }); }
  function removeTplEx(name) { tpl.exercises = tpl.exercises.filter(e=>e!==name); setState({ editingTemplate:tpl }); }
  function moveTplEx(idx, dir) {
    const newIdx = idx+dir;
    if (newIdx<0||newIdx>=tpl.exercises.length) return;
    [tpl.exercises[idx],tpl.exercises[newIdx]]=[tpl.exercises[newIdx],tpl.exercises[idx]];
    setState({ editingTemplate:tpl });
  }
  function save() {
    const name = document.getElementById("tpl-name").value.trim();
    if (!name) return;
    tpl.name = name; saveTemplate(tpl);
    setState({ view:"home", editingTemplate:null, data:state.data });
  }
  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:()=>setState({view:"home",editingTemplate:null}) }, "←"),
      div({ className:"page-title" }, isNew?"NOUVELLE SÉANCE TYPE":"MODIFIER"),
      btn({ className:"finish-btn", onClick:save }, "✓ OK")
    ),
    div({ style:{ flex:1, overflowY:"auto", padding:"16px" } },
      div({ style:{ marginBottom:16 } },
        sectionLabel("NOM"),
        el("input", { id:"tpl-name", placeholder:"Ex: Push Day...", value:tpl.name, className:"text-input", style:{ marginTop:6, width:"100%", fontSize:18, fontWeight:700 }, onInput:e=>{tpl.name=e.target.value;} })
      ),
      div({ style:{ marginBottom:20 } },
        sectionLabel("ICÔNE"),
        div({ style:{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 } },
          ...ICONS.map(icon => btn({ className:"icon-pick-btn"+(tpl.icon===icon?" active":""), onClick:()=>{tpl.icon=icon;setState({editingTemplate:tpl});} }, icon))
        )
      ),
      div({ style:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 } },
        sectionLabel("EXERCICES ("+tpl.exercises.length+")"),
        btn({ className:"red-outline-btn", onClick:()=>setState({showExPicker:true}) }, "+ Ajouter")
      ),
      tpl.exercises.length === 0
        ? div({ className:"empty-state", style:{ padding:"20px 0" } }, "Aucun exercice ajouté")
        : tpl.exercises.map((name,idx) =>
            div({ className:"set-row" },
              div({ style:{ display:"flex", flexDirection:"column", gap:1, marginRight:6 } },
                btn({ className:"order-btn", onClick:()=>moveTplEx(idx,-1) }, "▲"),
                btn({ className:"order-btn", onClick:()=>moveTplEx(idx,1) }, "▼")
              ),
              div({ style:{ flex:1, fontWeight:600, fontSize:15 } }, name),
              btn({ className:"del-btn", onClick:()=>removeTplEx(name) }, "×")
            )
          ),
      !isNew ? btn({ className:"danger-btn", style:{ marginTop:28 },
        onClick:()=>{ deleteTemplate(tpl.id); setState({ view:"home", editingTemplate:null, data:state.data }); }
      }, "🗑  Supprimer cette séance type") : null
    ),
    state.showExPicker ? renderExPicker(addTplEx, n=>tpl.exercises.includes(n)) : null
  );
}

// ── PROGRESS ──────────────────────────────────────────────────────────────
function renderProgress() {
  const sessions = allSessions();
  const exercises = [...new Set(sessions.flatMap(s=>(s.exercises||[]).map(e=>e.name)))];
  if (!state.progressEx && exercises.length) state.progressEx = exercises[0];
  const sel = state.progressEx;
  const history = getExerciseHistory(sel);
  const pr = getPR(sel);
  const metric = state.progressMetric;
  return div({ className:"page" },
    pageHeader(
      btn({ className:"icon-btn", onClick:()=>setState({view:"home"}) }, "←"),
      div({ className:"page-title" }, "PROGRESSION"),
      div({ style:{ width:44 } })
    ),
    div({ style:{ padding:"12px 16px", flex:1, overflowY:"auto" } },
      el("select", { className:"select-input", onChange:e=>setState({progressEx:e.target.value}) },
        ...exercises.map(ex => { const o=el("option",{value:ex},ex); if(ex===sel) o.selected=true; return o; })
      ),
      pr ? div({ className:"pr-card" },
        div({ style:{ fontSize:26 } }, "🏆"),
        div({},
          div({ style:{ fontSize:11, color:"#e63946", letterSpacing:2, fontWeight:700 } }, "PERSONAL RECORD"),
          div({ style:{ fontWeight:900, fontSize:22 } }, pr.weight+"kg × "+pr.reps+" reps"),
          div({ style:{ color:"#888", fontSize:12 } }, "1RM estimé: "+pr.orm+"kg")
        )
      ) : null,
      div({ style:{ display:"flex", gap:8, marginBottom:10 } },
        ...[["orm","1RM"],["weight","Poids max"],["volume","Volume"]].map(([k,l]) =>
          btn({ className:"metric-btn"+(metric===k?" active":""), onClick:()=>setState({progressMetric:k}) }, l)
        )
      ),
      history.length > 1 ? renderLineChart(history, metric) :
        div({ className:"empty-state" }, history.length===0?"Aucune donnée":"Il faut au moins 2 séances"),
      history.length > 0 ? div({ style:{ marginTop:16 } },
        sectionLabel("DÉTAIL"),
        div({ style:{ marginTop:8 } },
          ...[...history].reverse().slice(0,10).map(h =>
            div({ className:"set-row" },
              div({ style:{ color:"#666", fontSize:11, width:70 } }, new Date(h.date).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})),
              div({ style:{ flex:1 } }, span({ style:{ fontWeight:700 } }, h.weight+"kg"), " × ", span({ style:{ fontWeight:700 } }, String(h.reps))),
              div({ style:{ color:"#e63946", fontWeight:700 } }, metric==="volume"?h.volume.toLocaleString()+" kg":h.orm+"kg 1RM")
            )
          )
        )
      ) : null
    )
  );
}

// ── Charts ─────────────────────────────────────────────────────────────────
function renderLineChart(data, metric) {
  const getValue = d => metric==="orm"?d.orm:metric==="weight"?d.weight:d.volume;
  const values = data.map(getValue);
  const min=Math.min(...values), max=Math.max(...values), range=max-min||1;
  const W=340,H=150,PAD=30;
  const pts = data.map((d,i)=>[PAD+(i/(data.length-1))*(W-PAD*2), H-PAD-((getValue(d)-min)/range)*(H-PAD*2)]);
  const path = pts.map((p,i)=>(i===0?"M":"L")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area = path+" L"+pts[pts.length-1][0]+","+(H-PAD)+" L"+pts[0][0]+","+(H-PAD)+" Z";
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg"); svg.setAttribute("viewBox","0 0 "+W+" "+H); svg.setAttribute("width","100%"); svg.style.display="block";
  const defs=document.createElementNS(ns,"defs"); const grad=document.createElementNS(ns,"linearGradient");
  grad.setAttribute("id","cg"); grad.setAttribute("x1","0"); grad.setAttribute("y1","0"); grad.setAttribute("x2","0"); grad.setAttribute("y2","1");
  const s1=document.createElementNS(ns,"stop"); s1.setAttribute("offset","0%"); s1.setAttribute("stop-color","#e63946"); s1.setAttribute("stop-opacity","0.35");
  const s2=document.createElementNS(ns,"stop"); s2.setAttribute("offset","100%"); s2.setAttribute("stop-color","#e63946"); s2.setAttribute("stop-opacity","0");
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.appendChild(defs);
  [0,0.5,1].forEach(t=>{ const l=document.createElementNS(ns,"line"); const y=PAD+t*(H-PAD*2); l.setAttribute("x1",PAD); l.setAttribute("x2",W-PAD); l.setAttribute("y1",y); l.setAttribute("y2",y); l.setAttribute("stroke","#252525"); l.setAttribute("stroke-width","1"); svg.appendChild(l); });
  [[Math.round(max),PAD+4],[Math.round(min),H-PAD+4]].forEach(([v,y])=>{ const t=document.createElementNS(ns,"text"); t.setAttribute("x",PAD-4); t.setAttribute("y",y); t.setAttribute("fill","#666"); t.setAttribute("font-size","10"); t.setAttribute("text-anchor","end"); t.textContent=v; svg.appendChild(t); });
  const aEl=document.createElementNS(ns,"path"); aEl.setAttribute("d",area); aEl.setAttribute("fill","url(#cg)"); svg.appendChild(aEl);
  const lEl=document.createElementNS(ns,"path"); lEl.setAttribute("d",path); lEl.setAttribute("fill","none"); lEl.setAttribute("stroke","#e63946"); lEl.setAttribute("stroke-width","2.5"); lEl.setAttribute("stroke-linecap","round"); svg.appendChild(lEl);
  pts.forEach(([x,y])=>{ const c=document.createElementNS(ns,"circle"); c.setAttribute("cx",x); c.setAttribute("cy",y); c.setAttribute("r","4"); c.setAttribute("fill","#e63946"); c.setAttribute("stroke","#111"); c.setAttribute("stroke-width","2"); svg.appendChild(c); });
  return svg;
}

function renderBarChart(weekVols) {
  const W=340,H=120,PAD=10,BPAD=30;
  const maxVol = Math.max(...weekVols.map(w=>w.volume)) || 1;
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg"); svg.setAttribute("viewBox","0 0 "+W+" "+H); svg.setAttribute("width","100%"); svg.style.display="block";
  const barW=(W-PAD*2)/weekVols.length*0.6;
  const gap=(W-PAD*2)/weekVols.length;
  weekVols.forEach((w,i) => {
    const x=PAD+i*gap+gap/2-barW/2;
    const barH=((w.volume/maxVol)*(H-BPAD-PAD));
    const y=H-BPAD-barH;
    const isLast = i===weekVols.length-1;
    const rect=document.createElementNS(ns,"rect"); rect.setAttribute("x",x); rect.setAttribute("y",y); rect.setAttribute("width",barW); rect.setAttribute("height",barH); rect.setAttribute("rx","3"); rect.setAttribute("fill",isLast?"#e63946":"#333"); svg.appendChild(rect);
    const label=document.createElementNS(ns,"text"); label.setAttribute("x",x+barW/2); label.setAttribute("y",H-BPAD+12); label.setAttribute("fill","#666"); label.setAttribute("font-size","9"); label.setAttribute("text-anchor","middle");
    label.textContent=new Date(w.date).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}); svg.appendChild(label);
    if (isLast||i===weekVols.length-2) {
      const val=document.createElementNS(ns,"text"); val.setAttribute("x",x+barW/2); val.setAttribute("y",y-3); val.setAttribute("fill",isLast?"#e63946":"#555"); val.setAttribute("font-size","9"); val.setAttribute("text-anchor","middle");
      val.textContent=Math.round(w.volume/1000)+"t"; svg.appendChild(val);
    }
  });
  return svg;
}

function renderMiniBarChart(weekVols) {
  const W=300,H=40;
  const maxVol=Math.max(...weekVols.map(w=>w.volume))||1;
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg"); svg.setAttribute("viewBox","0 0 "+W+" "+H); svg.setAttribute("width","100%"); svg.style.display="block"; svg.style.marginTop="10px";
  const barW=W/weekVols.length*0.5;
  const gap=W/weekVols.length;
  weekVols.forEach((w,i) => {
    const x=i*gap+gap/2-barW/2;
    const barH=(w.volume/maxVol)*(H-4);
    const isLast=i===weekVols.length-1;
    const rect=document.createElementNS(ns,"rect"); rect.setAttribute("x",x); rect.setAttribute("y",H-barH); rect.setAttribute("width",barW); rect.setAttribute("height",barH); rect.setAttribute("rx","2"); rect.setAttribute("fill",isLast?"#e63946":"#333"); svg.appendChild(rect);
  });
  return svg;
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function render() {
  try {
    const root=document.getElementById("root"); root.innerHTML="";
    if (state.showPRBanner) root.appendChild(div({className:"pr-banner",onClick:()=>setState({showPRBanner:false})}, span({style:{fontSize:20}},"🏆"), span({},state.prMessage)));
    const views={home:renderHome,workout:renderWorkout,history:renderHistory,progress:renderProgress,editTemplate:renderEditTemplate,sessionDetail:renderSessionDetail,editSession:renderEditSession,manageExercises:renderManageExercises,dashboard:renderDashboard,allPRs:renderAllPRs};
    const viewFn=views[state.view];
    if (viewFn) root.appendChild(viewFn());
  } catch(err) {
    console.error("Render error:",err);
    document.getElementById("root").innerHTML='<div style="color:#e63946;padding:20px;font-family:monospace;font-size:13px;background:#111;min-height:100vh"><b>Erreur:</b><br>'+err.message+"<br><br><small>"+err.stack+"</small></div>";
  }
}

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
