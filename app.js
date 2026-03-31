// ── Data ──────────────────────────────────────────────────────────────────
const EXERCISE_LIST = ["Développé couché","Squat","Soulevé de terre","Développé militaire","Tractions","Rowing barre","Presse à cuisses","Curl barre","Triceps poulie","Hip thrust","Fentes","Développé incliné","Leg curl","Tirage vertical","Rowing haltère","Curl marteau","Écarté poulie","Élévations latérales","Mollets machine"];

const ICONS = ["💪","⬆️","⬇️","🦵","🔥","⚡","🏋️","🎯","💥","🦾","🧠","🏃"];

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  view: "home",        // home | workout | history | progress | editTemplate
  data: loadData(),
  session: null,
  activeExIdx: 0,
  showExPicker: false,
  showPRBanner: false,
  prMessage: "",
  progressEx: "",
  progressMetric: "orm",
  editingTemplate: null,   // null = new, or template id
};
let prTimer = null;

function loadData() {
  try { return JSON.parse(localStorage.getItem("gymData") || "{}"); }
  catch(e) { return {}; }
}
function saveData() {
  localStorage.setItem("gymData", JSON.stringify(state.data));
}
function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ── Template helpers ───────────────────────────────────────────────────────
function getTemplates() {
  return state.data.templates || [];
}
function saveTemplate(tpl) {
  if (!state.data.templates) state.data.templates = [];
  const idx = state.data.templates.findIndex(t => t.id === tpl.id);
  if (idx >= 0) state.data.templates[idx] = tpl;
  else state.data.templates.push(tpl);
  saveData();
}
function deleteTemplate(id) {
  state.data.templates = (state.data.templates || []).filter(t => t.id !== id);
  saveData();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function calcOneRM(w, r) {
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30));
}
function allSessions() {
  return Object.values(state.data.sessions || {}).sort((a,b) => b.date - a.date);
}
function calcStreak(sessions) {
  if (!sessions.length) return 0;
  const days = [...new Set(sessions.map(s => new Date(s.date).toDateString()))]
    .map(d => new Date(d)).sort((a,b) => b-a);
  let streak = 0, cur = new Date(); cur.setHours(0,0,0,0);
  for (const d of days) {
    const diff = Math.round((cur - d) / 86400000);
    if (diff <= 1) { streak++; cur = d; } else break;
  }
  return streak;
}
function sessionsThisWeek(sessions) {
  const now = new Date(), ws = new Date(now);
  ws.setDate(now.getDate() - now.getDay());
  return sessions.filter(s => new Date(s.date) >= ws).length;
}
function getExerciseHistory(name) {
  return allSessions()
    .filter(s => s.exercises && s.exercises.some(e => e.name === name))
    .map(s => {
      const ex = s.exercises.find(e => e.name === name);
      const best = ex.sets.reduce((acc, set) => {
        const orm = calcOneRM(+set.weight, +set.reps);
        return orm > acc.orm ? { orm, weight:+set.weight, reps:+set.reps } : acc;
      }, { orm:0, weight:0, reps:0 });
      const volume = ex.sets.reduce((a,s) => a + s.weight * s.reps, 0);
      return { date: s.date, ...best, volume };
    }).reverse();
}
function getPR(name) {
  const h = getExerciseHistory(name);
  return h.reduce((best, h) => h.orm > (best ? best.orm : 0) ? h : best, null);
}

// ── Actions ────────────────────────────────────────────────────────────────
function startFromTemplate(tpl) {
  setState({
    session: { id: Date.now(), date: Date.now(), templateName: tpl.name, exercises: tpl.exercises.map(name => ({ name, sets:[] })) },
    activeExIdx: 0, view: "workout"
  });
}
function startBlank() {
  setState({ session: { id: Date.now(), date: Date.now(), templateName: null, exercises: [] }, activeExIdx: 0, view: "workout" });
}
function addExercise(name) {
  const s = state.session;
  s.exercises.push({ name, sets:[] });
  setState({ session: s, activeExIdx: s.exercises.length - 1, showExPicker: false });
}
function addSet() {
  const w = +document.getElementById("inp-weight").value;
  const r = +document.getElementById("inp-reps").value;
  if (!w || !r) return;
  const ex = state.session.exercises[state.activeExIdx];
  const prBefore = getPR(ex.name);
  const orm = calcOneRM(w, r);
  ex.sets.push({ weight: w, reps: r, id: Date.now() });
  document.getElementById("inp-reps").value = "";
  if (!prBefore || orm > prBefore.orm) {
    clearTimeout(prTimer);
    setState({ session: state.session, showPRBanner: true, prMessage: `Nouveau PR — ${ex.name} : ${w}kg × ${r} reps (1RM ~${orm}kg)` });
    prTimer = setTimeout(() => setState({ showPRBanner: false }), 4000);
  } else {
    setState({ session: state.session });
  }
}
function removeSet(exIdx, setId) {
  state.session.exercises[exIdx].sets = state.session.exercises[exIdx].sets.filter(s => s.id !== setId);
  setState({ session: state.session });
}
function finishSession() {
  const s = state.session;
  const withSets = { ...s, exercises: s.exercises.filter(e => e.sets.length > 0) };
  if (withSets.exercises.length > 0) {
    if (!state.data.sessions) state.data.sessions = {};
    state.data.sessions[withSets.id] = withSets;
    saveData();
  }
  setState({ session: null, view: "home" });
}

// ── Render helpers ─────────────────────────────────────────────────────────
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "className") e.className = v;
    else if (k === "htmlFor") e.htmlFor = v;
    else e.setAttribute(k, v);
  });
  children.flat(Infinity).forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  });
  return e;
}
function div(attrs, ...c) { return el("div", attrs, ...c); }
function btn(attrs, ...c) { return el("button", attrs, ...c); }
function span(attrs, ...c) { return el("span", attrs, ...c); }

// ── HOME ──────────────────────────────────────────────────────────────────
function renderHome() {
  const sessions = allSessions();
  const streak = calcStreak(sessions);
  const last = sessions[0];
  const templates = getTemplates();

  return div({ style: { display:"flex", flexDirection:"column", minHeight:"100vh", paddingBottom:"24px" } },
    // header
    div({ style: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 16px 12px", borderBottom:"1px solid #1a1a1a", position:"sticky", top:0, background:"#0d0d0d", zIndex:10 } },
      div({},
        div({ style: { fontWeight:900, fontSize:28, letterSpacing:3, lineHeight:1 } }, "IRON", span({ style:{color:"#e63946"} }, "LOG")),
        div({ style: { color:"#666", fontSize:12, letterSpacing:2 } }, "TRAINING TRACKER")
      ),
      div({ style: { display:"flex", gap:"8px" } },
        btn({ className:"icon-btn", onClick:() => setState({ view:"progress", progressEx: [...new Set(allSessions().flatMap(s => (s.exercises||[]).map(e => e.name)))][0] || "" }) }, "📊"),
        btn({ className:"icon-btn", onClick:() => setState({ view:"history" }) }, "📅")
      )
    ),
    // stats
    div({ style: { display:"flex", justifyContent:"space-around", padding:"16px 0", borderBottom:"1px solid #1a1a1a", margin:"0 16px" } },
      statBlock("Séances", sessions.length),
      statBlock("Streak", streak + "🔥"),
      statBlock("Cette semaine", sessionsThisWeek(sessions))
    ),
    // last session
    last ? div({ style: { margin:"16px 16px 0", padding:"16px", background:"#111", borderRadius:"8px", borderLeft:"3px solid #e63946" } },
      div({ style: { color:"#888", fontSize:11, letterSpacing:1, marginBottom:4 } }, "DERNIÈRE SÉANCE"),
      div({ style: { fontWeight:700 } }, last.templateName || "Séance libre"),
      div({ style: { color:"#888", fontSize:12 } },
        new Date(last.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" }) +
        " · " + (last.exercises||[]).length + " exercices"
      )
    ) : null,

    // section templates
    div({ style: { display:"flex", alignItems:"center", justifyContent:"space-between", margin:"24px 16px 12px" } },
      div({ style: { color:"#888", fontSize:11, letterSpacing:2 } }, "MES SÉANCES TYPES"),
      btn({ className:"icon-btn", style:{ fontSize:13, padding:"6px 12px", color:"#e63946", borderColor:"#e63946" },
        onClick:() => setState({ view:"editTemplate", editingTemplate:{ id: Date.now(), name:"", icon:"💪", exercises:[] } })
      }, "+ Créer")
    ),

    templates.length === 0
      ? div({ style:{ margin:"0 16px 16px", padding:24, background:"#111", borderRadius:8, textAlign:"center", color:"#444", fontSize:13 } },
          div({ style:{ fontSize:32, marginBottom:8 } }, "📋"),
          "Pas encore de séances types.",
          el("br", {}),
          "Crée-en une pour démarrer vite !"
        )
      : div({ style: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"0 16px" } },
          ...templates.map(tpl =>
            div({ style:{ position:"relative" } },
              btn({ className:"template-card", onClick:() => startFromTemplate(tpl) },
                div({ style:{ fontSize:28 } }, tpl.icon),
                div({ style:{ fontWeight:800, fontSize:15, letterSpacing:1 } }, tpl.name.toUpperCase()),
                div({ style:{ color:"#666", fontSize:11 } }, tpl.exercises.length + " exercices")
              ),
              btn({ className:"edit-tpl-btn", onClick: e => { e.stopPropagation(); setState({ view:"editTemplate", editingTemplate: JSON.parse(JSON.stringify(tpl)) }); } }, "✏️")
            )
          )
        ),

    btn({ className:"blank-btn", onClick: startBlank }, "+ Séance libre")
  );
}

function statBlock(label, value) {
  return div({ style:{ textAlign:"center" } },
    div({ style:{ fontWeight:900, fontSize:22, color:"#e63946" } }, String(value)),
    div({ style:{ color:"#666", fontSize:11, letterSpacing:1 } }, label.toUpperCase())
  );
}

// ── EDIT TEMPLATE ─────────────────────────────────────────────────────────
function renderEditTemplate() {
  const tpl = state.editingTemplate;
  const isNew = !getTemplates().find(t => t.id === tpl.id);

  function updateField(field, value) {
    state.editingTemplate[field] = value;
    setState({ editingTemplate: state.editingTemplate });
  }
  function addTplExercise(name) {
    if (!tpl.exercises.includes(name)) {
      tpl.exercises.push(name);
    }
    setState({ editingTemplate: tpl, showExPicker: false });
  }
  function removeTplExercise(name) {
    tpl.exercises = tpl.exercises.filter(e => e !== name);
    setState({ editingTemplate: tpl });
  }
  function moveTplExercise(idx, dir) {
    const arr = tpl.exercises;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setState({ editingTemplate: tpl });
  }
  function save() {
    const name = document.getElementById("tpl-name").value.trim();
    if (!name) { document.getElementById("tpl-name").focus(); return; }
    tpl.name = name;
    saveTemplate(tpl);
    setState({ view:"home", editingTemplate: null, data: state.data });
  }

  return div({ style:{ display:"flex", flexDirection:"column", minHeight:"100vh" } },
    // header
    div({ style:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 16px 12px", borderBottom:"1px solid #1a1a1a", position:"sticky", top:0, background:"#0d0d0d", zIndex:10 } },
      btn({ className:"icon-btn", onClick:() => setState({ view:"home", editingTemplate:null }) }, "←"),
      div({ style:{ fontWeight:800, fontSize:16 } }, isNew ? "NOUVELLE SÉANCE TYPE" : "MODIFIER"),
      btn({ className:"finish-btn", onClick: save }, "✓ SAUVER")
    ),

    div({ style:{ flex:1, overflowY:"auto", padding:"16px" } },

      // Name input
      div({ style:{ marginBottom:16 } },
        div({ style:{ color:"#888", fontSize:11, letterSpacing:2, marginBottom:6 } }, "NOM"),
        el("input", { id:"tpl-name", placeholder:"Ex: Push Day, Full Body...", value: tpl.name,
          style:{ width:"100%", background:"#111", border:"1px solid #222", borderRadius:8, color:"#f0f0f0", padding:"12px 14px", fontSize:18, fontWeight:700, fontFamily:"inherit" },
          onInput: e => { tpl.name = e.target.value; }
        })
      ),

      // Icon picker
      div({ style:{ marginBottom:20 } },
        div({ style:{ color:"#888", fontSize:11, letterSpacing:2, marginBottom:8 } }, "ICÔNE"),
        div({ style:{ display:"flex", flexWrap:"wrap", gap:8 } },
          ...ICONS.map(icon =>
            btn({ className:"icon-pick-btn" + (tpl.icon === icon ? " active" : ""),
              onClick:() => updateField("icon", icon)
            }, icon)
          )
        )
      ),

      // Exercises list
      div({ style:{ marginBottom:12 } },
        div({ style:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 } },
          div({ style:{ color:"#888", fontSize:11, letterSpacing:2 } }, "EXERCICES (" + tpl.exercises.length + ")"),
          btn({ className:"icon-btn", style:{ fontSize:13, padding:"6px 12px", color:"#e63946", borderColor:"#333" },
            onClick:() => setState({ showExPicker: true })
          }, "+ Ajouter")
        ),

        tpl.exercises.length === 0
          ? div({ style:{ color:"#444", textAlign:"center", padding:"24px 0", fontSize:13 } }, "Aucun exercice ajouté")
          : tpl.exercises.map((name, idx) =>
              div({ className:"set-row" },
                div({ style:{ display:"flex", flexDirection:"column", gap:2, marginRight:4 } },
                  btn({ className:"order-btn", onClick:() => moveTplExercise(idx, -1) }, "▲"),
                  btn({ className:"order-btn", onClick:() => moveTplExercise(idx, 1) }, "▼")
                ),
                div({ style:{ flex:1, fontWeight:600, fontSize:15 } }, name),
                btn({ className:"del-btn", onClick:() => removeTplExercise(name) }, "×")
              )
            )
      ),

      // Delete button for existing template
      !isNew ? btn({
        style:{ marginTop:24, width:"100%", background:"transparent", border:"1px solid #3a0a0a", color:"#e63946", borderRadius:8, padding:12, fontSize:14, fontFamily:"inherit", cursor:"pointer", letterSpacing:1 },
        onClick:() => { deleteTemplate(tpl.id); setState({ view:"home", editingTemplate:null, data: state.data }); }
      }, "🗑 Supprimer cette séance type") : null
    ),

    // Exercise picker modal
    state.showExPicker ? renderTplExPicker(addTplExercise, tpl.exercises) : null
  );
}

function renderTplExPicker(onAdd, existing) {
  return div({ style:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:100, display:"flex", alignItems:"flex-end" }, onClick:() => setState({ showExPicker:false }) },
    div({ style:{ background:"#111", borderRadius:"16px 16px 0 0", padding:20, width:"100%", maxHeight:"80vh", overflowY:"auto" }, onClick: e => e.stopPropagation() },
      div({ style:{ fontWeight:800, marginBottom:16 } }, "Ajouter un exercice"),
      div({ style:{ display:"flex", gap:8, marginBottom:12 } },
        el("input", { id:"custom-ex-tpl", placeholder:"Exercice personnalisé...", style:{ flex:1, background:"#0d0d0d", border:"1px solid #222", borderRadius:6, color:"#f0f0f0", padding:"10px 12px", fontSize:16, fontFamily:"inherit" } }),
        btn({ className:"add-set-btn", onClick:() => {
          const v = document.getElementById("custom-ex-tpl").value.trim();
          if (v) onAdd(v);
        } }, "＋")
      ),
      ...EXERCISE_LIST.map(name => {
        const already = existing.includes(name);
        return btn({ className:"ex-picker-item", style: already ? { color:"#444" } : {},
          onClick:() => { if (!already) onAdd(name); }
        },
          name,
          already ? span({ style:{ float:"right", color:"#e63946", fontSize:12 } }, "✓") : null
        );
      })
    )
  );
}

// ── WORKOUT ───────────────────────────────────────────────────────────────
function renderWorkout() {
  const s = state.session;
  const totalSets = s.exercises.reduce((a,e) => a + e.sets.length, 0);
  const totalVol = s.exercises.reduce((a,e) => a + e.sets.reduce((b,st) => b + st.weight*st.reps, 0), 0);
  const activeEx = s.exercises[state.activeExIdx];
  const pr = activeEx ? getPR(activeEx.name) : null;

  return div({ style:{ display:"flex", flexDirection:"column", minHeight:"100vh" } },
    div({ style:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 16px 12px", borderBottom:"1px solid #1a1a1a", position:"sticky", top:0, background:"#0d0d0d", zIndex:10 } },
      btn({ className:"icon-btn", onClick:() => setState({ session:null, view:"home" }) }, "←"),
      div({ style:{ textAlign:"center" } },
        div({ style:{ fontWeight:800, fontSize:16 } }, s.templateName || "Séance libre"),
        div({ style:{ color:"#666", fontSize:11 } }, totalSets + " séries · " + totalVol.toLocaleString() + " kg vol.")
      ),
      btn({ className:"finish-btn", onClick: finishSession }, "✓ FIN")
    ),
    div({ style:{ display:"flex", gap:8, padding:"12px 16px", overflowX:"auto", borderBottom:"1px solid #1a1a1a" } },
      ...s.exercises.map((ex, i) => {
        const abbr = ex.name.split(" ").map(w=>w[0]).join("").slice(0,3).toUpperCase();
        return btn({ className:"ex-tab" + (i === state.activeExIdx ? " active" : ""), onClick:() => setState({ activeExIdx:i }) },
          div({ style:{ fontSize:11, fontWeight:700 } }, abbr),
          div({ style:{ fontSize:10, color: i===state.activeExIdx ? "#e63946":"#555" } }, ex.sets.length)
        );
      }),
      btn({ className:"ex-tab add-ex", onClick:() => setState({ showExPicker:true }) }, "＋")
    ),
    activeEx ? div({ style:{ flex:1, overflowY:"auto" } },
      div({ style:{ padding:"14px 16px 10px" } },
        div({ style:{ fontWeight:800, fontSize:18 } }, activeEx.name),
        pr
          ? div({ style:{ color:"#e63946", fontSize:12 } }, "🏆 PR: " + pr.weight + "kg × " + pr.reps + " reps (1RM ~" + pr.orm + "kg)")
          : div({ style:{ color:"#555", fontSize:12 } }, "Pas encore de PR")
      ),
      div({ style:{ display:"flex", gap:10, padding:"12px 16px", alignItems:"flex-end" } },
        div({ style:{ flex:1, display:"flex", flexDirection:"column", gap:4 } },
          el("label", { style:{ fontSize:10, color:"#666", letterSpacing:2, fontWeight:700 } }, "POIDS (kg)"),
          el("input", { id:"inp-weight", type:"number", placeholder:"80", style:{ background:"#111", border:"1px solid #222", borderRadius:6, color:"#f0f0f0", padding:"10px 12px", fontSize:18, fontWeight:700, width:"100%", fontFamily:"inherit" } })
        ),
        div({ style:{ flex:1, display:"flex", flexDirection:"column", gap:4 } },
          el("label", { style:{ fontSize:10, color:"#666", letterSpacing:2, fontWeight:700 } }, "REPS"),
          el("input", { id:"inp-reps", type:"number", placeholder:"8", style:{ background:"#111", border:"1px solid #222", borderRadius:6, color:"#f0f0f0", padding:"10px 12px", fontSize:18, fontWeight:700, width:"100%", fontFamily:"inherit" } })
        ),
        btn({ className:"add-set-btn", onClick: addSet }, "＋")
      ),
      div({ style:{ padding:"0 16px" } },
        activeEx.sets.length === 0
          ? div({ style:{ color:"#444", textAlign:"center", padding:32, fontSize:13 } }, "Aucune série encore")
          : null,
        ...activeEx.sets.map((set, si) => {
          const orm = calcOneRM(set.weight, set.reps);
          return div({ className:"set-row" },
            div({ style:{ color:"#e63946", fontWeight:800, width:24 } }, String(si+1)),
            div({ style:{ flex:1 } },
              span({ style:{ fontWeight:700 } }, set.weight + "kg"),
              span({ style:{ color:"#666" } }, " × "),
              span({ style:{ fontWeight:700 } }, set.reps + " reps"),
              span({ style:{ color:"#555", fontSize:12 } }, " · 1RM ~" + orm + "kg")
            ),
            btn({ className:"del-btn", onClick:() => removeSet(state.activeExIdx, set.id) }, "×")
          );
        })
      )
    ) : div({ style:{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 } },
      div({ style:{ fontSize:48 } }, "🏋️"),
      div({ style:{ color:"#666" } }, "Ajoute un exercice pour commencer"),
      btn({ className:"blank-btn", onClick:() => setState({ showExPicker:true }) }, "+ Exercice")
    ),
    state.showExPicker ? renderExPicker() : null
  );
}

function renderExPicker() {
  return div({ style:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:100, display:"flex", alignItems:"flex-end" }, onClick:() => setState({ showExPicker:false }) },
    div({ style:{ background:"#111", borderRadius:"16px 16px 0 0", padding:20, width:"100%", maxHeight:"80vh", overflowY:"auto" }, onClick: e => e.stopPropagation() },
      div({ style:{ fontWeight:800, marginBottom:16 } }, "Choisir un exercice"),
      div({ style:{ display:"flex", gap:8, marginBottom:12 } },
        el("input", { id:"custom-ex", placeholder:"Exercice personnalisé...", style:{ flex:1, background:"#0d0d0d", border:"1px solid #222", borderRadius:6, color:"#f0f0f0", padding:"10px 12px", fontSize:16, fontFamily:"inherit" } }),
        btn({ className:"add-set-btn", onClick:() => {
          const v = document.getElementById("custom-ex").value.trim();
          if (v) addExercise(v);
        } }, "＋")
      ),
      ...EXERCISE_LIST.map(name => btn({ className:"ex-picker-item", onClick:() => addExercise(name) }, name))
    )
  );
}

// ── HISTORY ───────────────────────────────────────────────────────────────
function renderHistory() {
  const sessions = allSessions();
  return div({ style:{ display:"flex", flexDirection:"column", minHeight:"100vh" } },
    div({ style:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 16px 12px", borderBottom:"1px solid #1a1a1a" } },
      btn({ className:"icon-btn", onClick:() => setState({ view:"home" }) }, "←"),
      div({ style:{ fontWeight:800, fontSize:16 } }, "HISTORIQUE"),
      div({ style:{ width:36 } })
    ),
    div({ style:{ flex:1, overflowY:"auto", padding:"12px 16px" } },
      sessions.length === 0
        ? div({ style:{ color:"#444", textAlign:"center", padding:48 } }, "Aucune séance enregistrée")
        : null,
      ...sessions.map(s => {
        const vol = (s.exercises||[]).reduce((a,e) => a + e.sets.reduce((b,st) => b + st.weight*st.reps, 0), 0);
        const totalSets = (s.exercises||[]).reduce((a,e) => a + e.sets.length, 0);
        return div({ className:"history-card" },
          div({ style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" } },
            div({},
              div({ style:{ fontWeight:700 } }, s.templateName || "Séance libre"),
              div({ style:{ color:"#666", fontSize:12 } }, new Date(s.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" }))
            ),
            div({ style:{ textAlign:"right" } },
              div({ style:{ color:"#e63946", fontWeight:700 } }, vol.toLocaleString() + " kg"),
              div({ style:{ color:"#555", fontSize:12 } }, totalSets + " séries")
            )
          ),
          div({ style:{ marginTop:8, display:"flex", flexWrap:"wrap", gap:4 } },
            ...(s.exercises||[]).map(e => span({ style:{ background:"#1a1a1a", color:"#666", borderRadius:4, padding:"2px 8px", fontSize:11 } }, e.name))
          )
        );
      })
    )
  );
}

// ── PROGRESS ──────────────────────────────────────────────────────────────
function renderProgress() {
  const sessions = allSessions();
  const exercises = [...new Set(sessions.flatMap(s => (s.exercises||[]).map(e => e.name)))];
  if (!state.progressEx && exercises.length) state.progressEx = exercises[0];
  const sel = state.progressEx;
  const history = getExerciseHistory(sel);
  const pr = getPR(sel);
  const metric = state.progressMetric;

  return div({ style:{ display:"flex", flexDirection:"column", minHeight:"100vh" } },
    div({ style:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 16px 12px", borderBottom:"1px solid #1a1a1a" } },
      btn({ className:"icon-btn", onClick:() => setState({ view:"home" }) }, "←"),
      div({ style:{ fontWeight:800, fontSize:16 } }, "PROGRESSION"),
      div({ style:{ width:36 } })
    ),
    div({ style:{ padding:"12px 16px", flex:1, overflowY:"auto" } },
      el("select", { style:{ width:"100%", background:"#111", border:"1px solid #222", color:"#f0f0f0", borderRadius:8, padding:"10px 12px", fontSize:16, fontFamily:"inherit", marginBottom:12 }, onChange: e => setState({ progressEx: e.target.value }) },
        ...exercises.map(ex => {
          const o = el("option", { value: ex }, ex);
          if (ex === sel) o.selected = true;
          return o;
        })
      ),
      pr ? div({ style:{ display:"flex", gap:16, alignItems:"center", background:"#1a0a0a", border:"1px solid #e63946", borderRadius:10, padding:16, marginBottom:12 } },
        div({ style:{ fontSize:24 } }, "🏆"),
        div({},
          div({ style:{ fontSize:11, color:"#e63946", letterSpacing:2, fontWeight:700 } }, "PERSONAL RECORD"),
          div({ style:{ fontWeight:900, fontSize:22 } }, pr.weight + "kg × " + pr.reps + " reps"),
          div({ style:{ color:"#888", fontSize:12 } }, "1RM estimé: " + pr.orm + "kg")
        )
      ) : null,
      div({ style:{ display:"flex", gap:8, marginBottom:8 } },
        ...[["orm","1RM"],["weight","Poids max"],["volume","Volume"]].map(([k,l]) =>
          btn({ className:"metric-btn" + (metric===k?" active":""), onClick:() => setState({ progressMetric:k }) }, l)
        )
      ),
      history.length > 1 ? renderChart(history, metric) :
        div({ style:{ color:"#444", textAlign:"center", padding:32 } }, history.length===0 ? "Aucune donnée" : "Il faut au moins 2 séances"),
      history.length > 0 ? div({ style:{ marginTop:16 } },
        div({ style:{ color:"#888", fontSize:11, letterSpacing:2, marginBottom:8 } }, "DÉTAIL"),
        ...[...history].reverse().slice(0,8).map(h =>
          div({ className:"set-row" },
            div({ style:{ color:"#555", fontSize:11, width:70 } }, new Date(h.date).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})),
            div({ style:{ flex:1 } },
              span({ style:{ fontWeight:700 } }, h.weight + "kg"),
              " × ",
              span({ style:{ fontWeight:700 } }, String(h.reps))
            ),
            div({ style:{ color:"#e63946", fontWeight:700 } }, metric==="volume" ? h.volume.toLocaleString()+" kg" : h.orm+"kg 1RM")
          )
        )
      ) : null
    )
  );
}

function renderChart(data, metric) {
  const getValue = d => metric==="orm" ? d.orm : metric==="weight" ? d.weight : d.volume;
  const values = data.map(getValue);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 340, H = 140, PAD = 28;
  const pts = data.map((d,i) => {
    const x = PAD + (i/(data.length-1))*(W-PAD*2);
    const y = H - PAD - ((getValue(d)-min)/range)*(H-PAD*2);
    return [x, y];
  });
  const path = pts.map((p,i) => (i===0?"M":"L")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area = path + " L"+pts[pts.length-1][0]+","+(H-PAD)+" L"+pts[0][0]+","+(H-PAD)+" Z";

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 "+W+" "+H);
  svg.setAttribute("width","100%");
  svg.style.display = "block";

  const defs = document.createElementNS(ns,"defs");
  const grad = document.createElementNS(ns,"linearGradient");
  grad.setAttribute("id","cg"); grad.setAttribute("x1","0"); grad.setAttribute("y1","0"); grad.setAttribute("x2","0"); grad.setAttribute("y2","1");
  const s1 = document.createElementNS(ns,"stop"); s1.setAttribute("offset","0%"); s1.setAttribute("stop-color","#e63946"); s1.setAttribute("stop-opacity","0.3");
  const s2 = document.createElementNS(ns,"stop"); s2.setAttribute("offset","100%"); s2.setAttribute("stop-color","#e63946"); s2.setAttribute("stop-opacity","0");
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.appendChild(defs);

  [[0,0.5,1]].flat().forEach(t => {
    const line = document.createElementNS(ns,"line");
    line.setAttribute("x1",PAD); line.setAttribute("x2",W-PAD);
    const y = PAD + t*(H-PAD*2);
    line.setAttribute("y1",y); line.setAttribute("y2",y);
    line.setAttribute("stroke","#1a1a1a"); line.setAttribute("stroke-width","1");
    svg.appendChild(line);
  });
  [[Math.round(max), PAD+4],[Math.round(min), H-PAD+4]].forEach(([v,y]) => {
    const t = document.createElementNS(ns,"text");
    t.setAttribute("x",PAD-4); t.setAttribute("y",y);
    t.setAttribute("fill","#555"); t.setAttribute("font-size","10"); t.setAttribute("text-anchor","end");
    t.textContent = v; svg.appendChild(t);
  });
  const areaEl = document.createElementNS(ns,"path");
  areaEl.setAttribute("d",area); areaEl.setAttribute("fill","url(#cg)"); svg.appendChild(areaEl);
  const lineEl = document.createElementNS(ns,"path");
  lineEl.setAttribute("d",path); lineEl.setAttribute("fill","none"); lineEl.setAttribute("stroke","#e63946");
  lineEl.setAttribute("stroke-width","2.5"); lineEl.setAttribute("stroke-linecap","round"); svg.appendChild(lineEl);
  pts.forEach(([x,y]) => {
    const c = document.createElementNS(ns,"circle");
    c.setAttribute("cx",x); c.setAttribute("cy",y); c.setAttribute("r","4");
    c.setAttribute("fill","#e63946"); c.setAttribute("stroke","#0d0d0d"); c.setAttribute("stroke-width","2");
    svg.appendChild(c);
  });
  return svg;
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  try {
    const root = document.getElementById("root");
    root.innerHTML = "";

    if (state.showPRBanner) {
      const banner = div({ className:"pr-banner", onClick:() => setState({ showPRBanner:false }) },
        span({ style:{ fontSize:20 } }, "🏆"),
        span({}, state.prMessage)
      );
      root.appendChild(banner);
    }

    let view;
    if (state.view === "home") view = renderHome();
    else if (state.view === "workout") view = renderWorkout();
    else if (state.view === "history") view = renderHistory();
    else if (state.view === "progress") view = renderProgress();
    else if (state.view === "editTemplate") view = renderEditTemplate();

    if (view) root.appendChild(view);
  } catch(err) {
    console.error("Render error:", err);
    document.getElementById("root").innerHTML = '<div style="color:#e63946;padding:20px;font-family:monospace;font-size:13px;background:#0d0d0d;min-height:100vh"><b>Erreur:</b><br>' + err.message + "<br><br><small>" + err.stack + "</small></div>";
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
