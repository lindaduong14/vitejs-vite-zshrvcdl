import { useState, useEffect, useRef } from "react";

const TABS = ["Overview", "Spending", "Macros", "Work", "Personal"];
const BUDGET_LIMIT = 2000;
const MACRO_GOALS  = { calories: 1700, protein: 120, fibre: 25 };
const MACRO_COLORS = { calories: "#4a7fa5", protein: "#7fafc8", fibre: "#6abfa0" };

const CATEGORY_COLORS = {
  Food:          { bg: "#eef6f0", text: "#4a8c60",  bar: "#4a8c60"  },
  Transport:     { bg: "#eef2f8", text: "#4a6fa5",  bar: "#4a6fa5"  },
  Shopping:      { bg: "#f5eef8", text: "#8a5fa5",  bar: "#8a5fa5"  },
  Bills:         { bg: "#fdf3e7", text: "#c07830",  bar: "#c07830"  },
  Health:        { bg: "#fce8e8", text: "#b85050",  bar: "#b85050"  },
  Entertainment: { bg: "#e8f5f5", text: "#3a8f8f",  bar: "#3a8f8f"  },
  Other:         { bg: "#f0ede8", text: "#7a7068",  bar: "#7a7068"  },
};
const CAT_ORDER = ["Food","Transport","Shopping","Bills","Health","Entertainment","Other"];

const dateKey         = (d = new Date()) => d.toISOString().slice(0, 10);
const monthKey        = (d = new Date()) => d.toISOString().slice(0, 7);
const daysInMonth     = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const firstDayOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();

const todayStr    = dateKey();
const monthStr    = monthKey();
const todayLabel  = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const monthLabel  = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
const currentYear = new Date().getFullYear();

// ── Spending storage ──────────────────────────────────────────────────────────
const SPENDING_KEY      = (m) => `spending_v1_${m}`;
const SPENDING_ARCH_KEY = (m) => `spending_arch_v1_${m}`;

function loadMonthSpending(m = monthStr) {
  try { return JSON.parse(localStorage.getItem(SPENDING_KEY(m)) || "[]"); } catch { return []; }
}
function saveMonthSpending(entries, m = monthStr) {
  try { localStorage.setItem(SPENDING_KEY(m), JSON.stringify(entries)); } catch {}
}
function archiveMonthSpending(m) {
  try {
    const key = SPENDING_KEY(m);
    const data = localStorage.getItem(key);
    if (data) localStorage.setItem(SPENDING_ARCH_KEY(m), data);
  } catch {}
}
function initSpendingArchives() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("spending_v1_") && !k.startsWith("spending_arch_") && !k.endsWith(monthStr)) {
        archiveMonthSpending(k.replace("spending_v1_", ""));
      }
    }
  } catch {}
}
function getSpendingHistory() {
  const months = [];
  try {
    for (let mo = 1; mo <= 12; mo++) {
      const m = `${currentYear}-${String(mo).padStart(2, "0")}`;
      const raw = localStorage.getItem(SPENDING_ARCH_KEY(m)) || (m === monthStr ? localStorage.getItem(SPENDING_KEY(m)) : null);
      if (raw) { const entries = JSON.parse(raw); if (entries.length) months.push({ month: m, entries }); }
    }
  } catch {}
  return months;
}

// ── General state storage ─────────────────────────────────────────────────────
const STORE_KEY         = `planner_v5_${monthStr}`;
const MACRO_HISTORY_KEY = `macro_history_v5_${monthStr}`;

function loadState() {
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s) return JSON.parse(s);
    archivePreviousMonth();
    return freshState();
  } catch { return freshState(); }
}
function freshState() {
  return { mealsByDay: {}, workTasks: [], personalTasks: [], lastActiveDate: todayStr, activeMonth: monthStr };
}
function saveState(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} }
function saveDayToHistory(dateStr, meals) {
  try {
    const raw = localStorage.getItem(MACRO_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : {};
    history[dateStr] = sumMacros(meals || []);
    localStorage.setItem(MACRO_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}
function loadMacroHistory() { try { return JSON.parse(localStorage.getItem(MACRO_HISTORY_KEY) || "{}"); } catch { return {}; } }
function archivePreviousMonth() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("planner_v5_") && !k.endsWith(monthStr)) {
        const archKey = `archive_${k}`;
        if (!localStorage.getItem(archKey)) localStorage.setItem(archKey, localStorage.getItem(k));
      }
    }
  } catch {}
}
function getArchives() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("archive_planner_v5_"))
        out.push({ month: k.replace("archive_planner_v5_", ""), data: JSON.parse(localStorage.getItem(k) || "{}") });
    }
  } catch {}
  return out.sort((a, b) => b.month.localeCompare(a.month));
}

// ── Task storage — monthly archive + rollover ────────────────────────────────
const TASK_KEY      = (type, m) => `tasks_v1_${type}_${m}`;
const TASK_ARCH_KEY = (type, m) => `tasks_arch_v1_${type}_${m}`;

function loadMonthTasks(type, m = monthStr) {
  try { return JSON.parse(localStorage.getItem(TASK_KEY(type, m)) || "null"); } catch { return null; }
}
function saveMonthTasks(type, tasks, m = monthStr) {
  try { localStorage.setItem(TASK_KEY(type, m), JSON.stringify(tasks)); } catch {}
}
function archiveMonthTasks(type, m) {
  try {
    const data = localStorage.getItem(TASK_KEY(type, m));
    if (data) localStorage.setItem(TASK_ARCH_KEY(type, m), data);
  } catch {}
}
function getTaskArchives(type) {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`tasks_arch_v1_${type}_`)) {
        const m = k.replace(`tasks_arch_v1_${type}_`, "");
        const tasks = JSON.parse(localStorage.getItem(k) || "[]");
        if (tasks.length) out.push({ month: m, tasks });
      }
    }
  } catch {}
  return out.sort((a, b) => b.month.localeCompare(a.month));
}
function initMonthTasks(type) {
  const current = loadMonthTasks(type, monthStr);
  if (current !== null) return current;
  let prevTasks = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(`tasks_v1_${type}_`) && !k.endsWith(monthStr)) {
      const m = k.replace(`tasks_v1_${type}_`, "");
      if (!prevTasks || m > prevTasks.month) {
        const t = JSON.parse(localStorage.getItem(k) || "[]");
        if (t.length) prevTasks = { month: m, tasks: t };
      }
    }
  }
  if (!prevTasks) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("planner_v5_") && !k.includes("archive") && !k.endsWith(monthStr)) {
        try {
          const s = JSON.parse(localStorage.getItem(k) || "{}");
          const taskKey = type === "work" ? "workTasks" : "personalTasks";
          if (s[taskKey]?.length) {
            const m = k.replace("planner_v5_", "");
            if (!prevTasks || m > prevTasks.month) prevTasks = { month: m, tasks: s[taskKey] };
          }
        } catch {}
      }
    }
  }
  if (!prevTasks) return [];
  archiveMonthTasks(type, prevTasks.month);
  const rolledOver = prevTasks.tasks
    .filter(t => !t.done)
    .map(t => ({ ...t, rolledFrom: prevTasks.month, id: Date.now() + Math.random() }));
  saveMonthTasks(type, rolledOver, monthStr);
  return rolledOver;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sumMacros(meals) {
  return meals.reduce(
    (acc, m) => ({ calories: acc.calories + (parseFloat(m.calories)||0), protein: acc.protein + (parseFloat(m.protein)||0), fibre: acc.fibre + (parseFloat(m.fibre)||0) }),
    { calories: 0, protein: 0, fibre: 0 }
  );
}
function goalScore(t) {
  const keys = ["calories","protein","fibre"];
  return keys.reduce((s,k) => s + Math.min((t[k]||0)/MACRO_GOALS[k],1),0)/keys.length;
}
function categoryBreakdown(entries) {
  const out = {};
  for (const e of entries) { const c = (e.category==="…"||!e.category)?"Other":e.category; out[c]=(out[c]||0)+parseFloat(e.amount||0); }
  return out;
}
function shortMonth(m) { return new Date(m+"-15").toLocaleDateString("en-US",{month:"short"}); }

// ── AI helpers ────────────────────────────────────────────────────────────────
async function parseMFPScreenshot(base64Image, mediaType) {
  const systemPrompt = `You are a precise nutrition data extractor. Extract every food item from a MyFitnessPal food diary screenshot and return ONLY a valid JSON array. No markdown, no explanation.
Each item: { "name": string, "calories": number, "protein": number, "fibre": number }. Use 0 if unclear. Fibre may be "Fiber" or "Dietary Fiber". Exclude meal headers and totals rows.
Example: [{"name":"Oat milk latte","calories":120,"protein":4,"fibre":0}]`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: systemPrompt,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
        { type: "text", text: "Extract all food items. Return only the JSON array." }
      ]}]
    })
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const raw = data.content?.find(b => b.type==="text")?.text || "";
  const items = JSON.parse(raw.replace(/```json|```/g,"").trim());
  if (!Array.isArray(items)) throw new Error("Not an array");
  return items;
}
async function detectCategory(description) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 20,
        messages: [{ role: "user", content: `Categorise this expense into exactly one of: Food, Transport, Shopping, Bills, Health, Entertainment, Other.\nExpense: "${description}"\nRespond with only the category name, nothing else.` }],
      }),
    });
    const data = await res.json();
    const cat = data.content?.[0]?.text?.trim();
    return Object.keys(CATEGORY_COLORS).includes(cat) ? cat : "Other";
  } catch { return "Other"; }
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState("Overview");
  const [state, setState]         = useState(loadState);
  const [spending, setSpending]   = useState(() => { initSpendingArchives(); return loadMonthSpending(); });
  const [workTasks, setWorkTasks] = useState(() => initMonthTasks("work"));
  const [personalTasks, setPersonalTasks] = useState(() => initMonthTasks("personal"));
  const [showArchives, setShowArchives]   = useState(false);
  const archives = getArchives();

  useEffect(() => saveState(state), [state]);
  useEffect(() => saveMonthSpending(spending), [spending]);
  useEffect(() => saveMonthTasks("work", workTasks), [workTasks]);
  useEffect(() => saveMonthTasks("personal", personalTasks), [personalTasks]);
  useEffect(() => {
    if (state.lastActiveDate && state.lastActiveDate !== todayStr) {
      saveDayToHistory(state.lastActiveDate, state.mealsByDay?.[state.lastActiveDate] || []);
      setState(prev => ({ ...prev, lastActiveDate: todayStr }));
    }
  }, []);

  const update = (key, val) => setState(prev => ({ ...prev, [key]: val }));
  const todayMeals  = state.mealsByDay?.[todayStr] || [];
  const todayMacros = sumMacros(todayMeals);
  const updateTodayMeals = (meals) => setState(prev => ({ ...prev, mealsByDay: { ...prev.mealsByDay, [todayStr]: meals } }));
  const updateMealsByDay = (newByDay) => setState(prev => ({ ...prev, mealsByDay: { ...prev.mealsByDay, ...newByDay } }));
  const totalSpent   = spending.reduce((s, e) => s + parseFloat(e.amount||0), 0);
  const workDone     = workTasks.filter(t => t.done).length;
  const personalDone = personalTasks.filter(t => t.done).length;

  return (
    <div style={S.app}>
      <style>{`
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f5f2ed; }
        input::placeholder, textarea::placeholder { color: #b8b0a4; }
        input:focus, textarea:focus { outline: none; border-color: #6b9dc2 !important; }
        select:focus { outline: none; }
        button { cursor: pointer; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c8d8e8; border-radius: 4px; }
        .day-cell:hover { transform: scale(1.18); z-index: 10; }
        .img-drop { border: 2px dashed #c8d8e8; border-radius: 12px; transition: border-color 0.2s, background 0.2s; }
        .img-drop.drag-over { border-color: #4a7fa5; background: #f0f7ff; }
      `}</style>

      <header style={S.header}>
        <div>
          <p style={S.dateText}>{todayLabel}</p>
          <h1 style={S.title}>{new Date().toLocaleDateString("en-US",{month:"long"})} Planner</h1>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
          <div style={S.headerDot} />
          <button onClick={() => setShowArchives(!showArchives)} style={S.archiveBtn}>
            {showArchives ? "← Back" : `Archives (${archives.length})`}
          </button>
        </div>
      </header>

      {showArchives ? <Archives archives={archives} /> : (
        <>
          <nav style={S.nav}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ ...S.tabBtn, ...(tab===t?S.tabActive:{}) }}>{t}</button>
            ))}
          </nav>
          <main style={S.main}>
            {tab==="Overview"  && <Overview totalSpent={totalSpent} todayMacros={todayMacros} workDone={workDone} personalDone={personalDone} workTasks={workTasks} personalTasks={personalTasks} todayMeals={todayMeals} setTab={setTab} />}
            {tab==="Spending"  && <Spending entries={spending} setEntries={setSpending} totalSpent={totalSpent} />}
            {tab==="Macros"    && <Macros todayMeals={todayMeals} updateTodayMeals={updateTodayMeals} updateMealsByDay={updateMealsByDay} todayMacros={todayMacros} />}
            {tab==="Work"      && <TodoList tasks={workTasks} update={setWorkTasks} label="Work" accent="#4a7fa5" taskType="work" />}
            {tab==="Personal"  && <TodoList tasks={personalTasks} update={setPersonalTasks} label="Personal" accent="#7fafc8" taskType="personal" />}
          </main>
        </>
      )}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview({ totalSpent, todayMacros, workDone, personalDone, workTasks, personalTasks, todayMeals, setTab }) {
  const spendPct = Math.min((totalSpent/BUDGET_LIMIT)*100,100);
  const macroItems = [
    { label:"Calories", val:todayMacros.calories, goal:MACRO_GOALS.calories, unit:"kcal", color:"#4a7fa5" },
    { label:"Protein",  val:todayMacros.protein,  goal:MACRO_GOALS.protein,  unit:"g",    color:"#7fafc8" },
    { label:"Fibre",    val:todayMacros.fibre,    goal:MACRO_GOALS.fibre,    unit:"g",    color:"#6abfa0" },
  ];
  return (
    <div style={S.grid2}>
      <div onClick={() => setTab("Macros")} style={{ ...S.card, cursor:"pointer", transition:"transform 0.15s, box-shadow 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(74,127,165,0.12)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="0 1px 8px rgba(0,0,0,0.04)"; }}>
        <p style={S.cardLabel}>Nutrition Today</p>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {macroItems.map(m => {
            const pct = Math.min((m.val/m.goal)*100,100);
            return (
              <div key={m.label}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:2 }}>
                  <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:m.color, fontWeight:500 }}>{m.label}</span>
                  <span style={{ fontFamily:"'DM Serif Display', serif", fontSize:14, color:"#2c2420" }}>
                    {Math.round(m.val)}<span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#a09890", marginLeft:2 }}>{m.unit}</span>
                    <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#c0b8b0", marginLeft:4 }}>/ {m.goal}</span>
                  </span>
                </div>
                <ProgressBar pct={pct} color={m.color} thin />
              </div>
            );
          })}
        </div>
        <p style={{ ...S.tinyNote, marginTop:6 }}>{todayMeals.length} entries today</p>
      </div>

      <Card onClick={() => setTab("Spending")} label="Spending">
        <p style={S.bigNum}>${totalSpent.toFixed(2)}</p>
        <p style={S.subLabel}>of ${BUDGET_LIMIT} budget — {monthLabel}</p>
        <ProgressBar pct={spendPct} color={spendPct>85?"#d4886a":"#4a7fa5"} thin={false} />
        <p style={S.tinyNote}>{(100-spendPct).toFixed(0)}% remaining</p>
      </Card>

      <Card onClick={() => setTab("Work")} label="Work Tasks">
        <p style={S.bigNum}>{workDone}<span style={S.outOf}>/{workTasks.length}</span></p>
        <p style={S.subLabel}>tasks completed</p>
        <ProgressBar pct={workTasks.length?(workDone/workTasks.length)*100:0} color="#4a7fa5" />
        <div style={S.previewList}>
          {workTasks.filter(t=>!t.done).slice(0,2).map(t=><p key={t.id} style={S.previewItem}>· {t.text}</p>)}
        </div>
      </Card>

      <Card onClick={() => setTab("Personal")} label="Personal Tasks">
        <p style={S.bigNum}>{personalDone}<span style={S.outOf}>/{personalTasks.length}</span></p>
        <p style={S.subLabel}>tasks completed</p>
        <ProgressBar pct={personalTasks.length?(personalDone/personalTasks.length)*100:0} color="#7fafc8" />
        <div style={S.previewList}>
          {personalTasks.filter(t=>!t.done).slice(0,2).map(t=><p key={t.id} style={S.previewItem}>· {t.text}</p>)}
        </div>
      </Card>
    </div>
  );
}

// ── Spending ──────────────────────────────────────────────────────────────────
function Spending({ entries, setEntries, totalSpent }) {
  const [desc, setDesc]             = useState("");
  const [amount, setAmount]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [flashId, setFlashId]       = useState(null);
  const [historyView, setHistoryView] = useState("bar");

  const spendingHistory = getSpendingHistory();
  const allMonths = (() => {
    const hist = spendingHistory.filter(h => h.month !== monthStr);
    return [...hist, { month: monthStr, entries }].sort((a,b) => a.month.localeCompare(b.month));
  })();

  const add = async () => {
    if (!desc.trim() || !amount) return;
    const id = Date.now();
    setEntries(prev => [{ id, desc: desc.trim(), amount, category:"…", date:todayStr }, ...prev]);
    setDesc(""); setAmount("");
    setLoading(true);
    const category = await detectCategory(desc.trim());
    setLoading(false);
    setEntries(prev => prev.map(e => e.id===id ? { ...e, category } : e));
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1800);
  };

  const remove = id => setEntries(entries.filter(e => e.id!==id));
  const spendPct = Math.min((totalSpent/BUDGET_LIMIT)*100,100);
  const breakdown = categoryBreakdown(entries);
  const ytdTotal  = allMonths.reduce((s,m) => s + m.entries.reduce((a,e) => a+parseFloat(e.amount||0),0),0);
  const ytdBudget = allMonths.length * BUDGET_LIMIT;
  const ytdPct    = Math.min((ytdTotal/ytdBudget)*100,100);

  return (
    <div style={S.section}>
      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:8 }}>
          <div>
            <p style={S.cardLabel}>{monthLabel} Budget</p>
            <p style={S.bigNum}>${totalSpent.toFixed(2)} <span style={S.subLabel}>/ ${BUDGET_LIMIT}</span></p>
          </div>
          <div style={{ textAlign:"right" }}>
            <p style={{ ...S.tinyNote, color:spendPct>85?"#d4886a":"#8faabc" }}>{(100-spendPct).toFixed(0)}% left</p>
            <p style={{ ...S.tinyNote, marginTop:2 }}>Resets next month</p>
          </div>
        </div>
        <ProgressBar pct={spendPct} color={spendPct>85?"#d4886a":"#4a7fa5"} thin={false} />
        {Object.keys(breakdown).length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:10 }}>
            {CAT_ORDER.filter(c=>breakdown[c]).map(c => {
              const col = CATEGORY_COLORS[c]||CATEGORY_COLORS.Other;
              return <span key={c} style={{ ...S.catChip, background:col.bg, color:col.text }}>{c} · ${breakdown[c].toFixed(0)}</span>;
            })}
          </div>
        )}
      </div>

      {Object.keys(breakdown).length > 0 && (
        <div style={S.card}>
          <p style={S.cardLabel}>Category Breakdown — {monthLabel}</p>
          <CategoryBars breakdown={breakdown} total={totalSpent} />
        </div>
      )}

      {allMonths.length > 0 && (
        <div style={S.card}>
          <p style={S.cardLabel}>Category Breakdown by Month</p>
          <MonthCategoryVisual months={allMonths} />
        </div>
      )}

      {allMonths.length > 0 && (
        <div style={S.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <p style={S.cardLabel}>Year to Date — {currentYear}</p>
              <p style={S.tinyNote}>${ytdTotal.toFixed(0)} of ${ytdBudget.toFixed(0)} annual budget · {allMonths.length} month{allMonths.length!==1?"s":""}</p>
            </div>
            <div style={{ display:"flex", gap:3 }}>
              {[["bar","Bars"],["stacked","Stacked"],["trend","Trend"]].map(([v,l]) => (
                <button key={v} onClick={() => setHistoryView(v)} style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, padding:"3px 8px", borderRadius:99, border:"1px solid #ddd8d0", cursor:"pointer", background:historyView===v?"#4a7fa5":"transparent", color:historyView===v?"white":"#8a7f78" }}>{l}</button>
              ))}
            </div>
          </div>
          <ProgressBar pct={ytdPct} color={ytdPct>85?"#d4886a":"#4a7fa5"} thin={false} />
          <div style={{ marginTop:14 }}>
            {historyView==="bar"     && <MonthlyBarChart months={allMonths} />}
            {historyView==="stacked" && <StackedBarChart months={allMonths} />}
            {historyView==="trend"   && <SpendingTrendChart months={allMonths} />}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:12 }}>
            {CAT_ORDER.map(c => (
              <div key={c} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:CATEGORY_COLORS[c].bar }} />
                <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#a09890" }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={S.card}>
        <p style={S.cardLabel}>Add Expense</p>
        <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#a8c8de", marginBottom:10, marginTop:-4 }}>✦ Category detected automatically by AI</p>
        <div style={S.formRow}>
          <input style={{ ...S.input, flex:1 }} placeholder="e.g. Uber, Groceries, Netflix…" value={desc} onChange={e=>setDesc(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} />
          <input style={{ ...S.input, width:88 }} placeholder="$0.00" type="number" value={amount} onChange={e=>setAmount(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} />
          <button style={{ ...S.addBtn, opacity:loading?0.65:1 }} onClick={add} disabled={loading}>{loading?"…":"Add"}</button>
        </div>
      </div>

      <div style={S.card}>
        <p style={S.cardLabel}>Transactions — {monthLabel}</p>
        {!entries.length && <p style={S.empty}>No expenses this month yet</p>}
        <div style={S.list}>
          {entries.map(e => {
            const colors = CATEGORY_COLORS[e.category]||CATEGORY_COLORS.Other;
            return (
              <div key={e.id} style={{ ...S.listRow, background:flashId===e.id?"#f0f7ff":"transparent", borderRadius:8, padding:"11px 6px", transition:"background 0.5s" }}>
                <div>
                  <p style={S.listMain}>{e.desc}</p>
                  <span style={{ ...S.catChip, background:colors.bg, color:colors.text, marginTop:4, display:"inline-block" }}>{e.category==="…"?"Detecting…":e.category}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <p style={{ ...S.listMain, color:"#4a7fa5" }}>${parseFloat(e.amount).toFixed(2)}</p>
                  <button style={S.removeBtn} onClick={() => remove(e.id)}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Spending Charts ───────────────────────────────────────────────────────────
function MonthCategoryVisual({ months }) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const activeCategories = CAT_ORDER.filter(c => months.some(m => categoryBreakdown(m.entries)[c] > 0));
  const catMax = {};
  activeCategories.forEach(c => { catMax[c] = Math.max(...months.map(m => categoryBreakdown(m.entries)[c]||0), 1); });
  const monthTotals = months.map(m => m.entries.reduce((s,e) => s+parseFloat(e.amount||0),0));

  return (
    <div style={{ marginTop:6 }}>
      <div style={{ marginBottom:16 }}>
        <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#b8b0a4", marginBottom:8, letterSpacing:"0.04em", textTransform:"uppercase" }}>Spend mix per month</p>
        <div style={{ display:"flex", gap:6, alignItems:"flex-end" }}>
          {months.map((m,i) => {
            const bd = categoryBreakdown(m.entries);
            const total = monthTotals[i];
            const isCurrent = m.month === monthStr;
            if (total===0) return (
              <div key={m.month} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ width:"100%", height:60, background:"#f5f2ed", borderRadius:6 }} />
                <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:9, color:"#c0b8b0" }}>{shortMonth(m.month)}</span>
              </div>
            );
            return (
              <div key={m.month} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:9, color:total>BUDGET_LIMIT?"#d4886a":"#8faabc", fontWeight:500 }}>${Math.round(total)}</span>
                <div style={{ width:"100%", height:56, borderRadius:6, overflow:"hidden", display:"flex", flexDirection:"column-reverse", border:isCurrent?"1.5px solid #4a7fa5":"1px solid transparent", boxSizing:"border-box" }}>
                  {CAT_ORDER.filter(c=>bd[c]>0).map(c => {
                    const pct = (bd[c]/total)*100;
                    const isHov = hoveredCell?.month===m.month && hoveredCell?.cat===c;
                    return <div key={c} onMouseEnter={() => setHoveredCell({ month:m.month, cat:c, val:bd[c], pct })} onMouseLeave={() => setHoveredCell(null)} style={{ width:"100%", height:`${pct}%`, background:CATEGORY_COLORS[c].bar, opacity:isHov?1:0.8, transition:"opacity 0.15s", cursor:"pointer" }} />;
                  })}
                </div>
                <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:9, color:isCurrent?"#4a7fa5":"#a09890", fontWeight:isCurrent?600:400 }}>{shortMonth(m.month)}</span>
              </div>
            );
          })}
        </div>
        {hoveredCell && (
          <div style={{ marginTop:8, padding:"7px 12px", background:"#f5f2ed", borderRadius:8, border:"1px solid #e8e4de", display:"inline-flex", alignItems:"center", gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:CATEGORY_COLORS[hoveredCell.cat]?.bar, flexShrink:0 }} />
            <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#3a3028" }}>
              {hoveredCell.cat} · {shortMonth(hoveredCell.month)} · <strong>${hoveredCell.val?.toFixed(0)}</strong>
              <span style={{ color:"#a09890", marginLeft:4 }}>({hoveredCell.pct?.toFixed(0)}%)</span>
            </span>
          </div>
        )}
      </div>

      <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#b8b0a4", marginBottom:8, letterSpacing:"0.04em", textTransform:"uppercase" }}>Spend intensity by category</p>
      <div style={{ display:"grid", gridTemplateColumns:`90px repeat(${months.length}, 1fr)`, gap:3, marginBottom:3 }}>
        <div />
        {months.map(m => <div key={m.month} style={{ fontFamily:"'DM Sans', sans-serif", fontSize:9, color:m.month===monthStr?"#4a7fa5":"#a09890", fontWeight:m.month===monthStr?600:400, textAlign:"center" }}>{shortMonth(m.month)}</div>)}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
        {activeCategories.map(cat => {
          const col = CATEGORY_COLORS[cat];
          return (
            <div key={cat} style={{ display:"grid", gridTemplateColumns:`90px repeat(${months.length}, 1fr)`, gap:3, alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <div style={{ width:7, height:7, borderRadius:2, background:col.bar, flexShrink:0 }} />
                <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:col.text, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cat}</span>
              </div>
              {months.map((m,mi) => {
                const bd = categoryBreakdown(m.entries);
                const val = bd[cat]||0;
                const intensity = val/catMax[cat];
                const isHov = hoveredCell?.month===m.month && hoveredCell?.cat===cat;
                const isCurrent = m.month===monthStr;
                return (
                  <div key={m.month}
                    onMouseEnter={() => val>0 && setHoveredCell({ month:m.month, cat, val, pct:(val/(monthTotals[mi]||1))*100 })}
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{ height:26, borderRadius:5, cursor:val>0?"pointer":"default", background:val>0?col.bar:"#f5f2ed", opacity:val>0?0.2+intensity*0.8:1, border:isCurrent?`1px solid ${col.bar}44`:"1px solid transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"opacity 0.15s", outline:isHov?`2px solid ${col.bar}`:"none" }}>
                    {val>0 && <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:9, color:intensity>0.5?"white":col.text, fontWeight:500 }}>${Math.round(val)}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{ display:"grid", gridTemplateColumns:`90px repeat(${months.length}, 1fr)`, gap:3, alignItems:"center", marginTop:4, paddingTop:6, borderTop:"1px solid #f0ece6" }}>
          <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, color:"#6a6058", fontWeight:600 }}>Total</span>
          {months.map((m,i) => {
            const total = monthTotals[i];
            const over = total>BUDGET_LIMIT, isCurrent = m.month===monthStr;
            return <div key={m.month} style={{ textAlign:"center" }}><span style={{ fontFamily:"'DM Serif Display', serif", fontSize:12, color:over?"#d4886a":isCurrent?"#4a7fa5":"#3a3028", fontWeight:600 }}>{total>0?`$${Math.round(total)}`:"—"}</span></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryBars({ breakdown, total }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7, marginTop:4 }}>
      {CAT_ORDER.filter(c=>breakdown[c]>0).sort((a,b)=>breakdown[b]-breakdown[a]).map(c => {
        const col = CATEGORY_COLORS[c];
        const pct = Math.min((breakdown[c]/total)*100,100);
        return (
          <div key={c}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, color:col.text, fontWeight:500 }}>{c}</span>
              <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#6a6058" }}>${breakdown[c].toFixed(0)} <span style={{ color:"#b8b0a4", fontSize:10 }}>({pct.toFixed(0)}%)</span></span>
            </div>
            <div style={{ background:"#f0ece6", borderRadius:99, height:7, overflow:"hidden" }}>
              <div style={{ width:`${pct}%`, background:col.bar, height:"100%", borderRadius:99, transition:"width 0.5s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyBarChart({ months }) {
  const W=600, H=120, PAD_L=36, PAD_B=20, BAR_GAP=6;
  const maxVal = Math.max(...months.map(m=>m.entries.reduce((s,e)=>s+parseFloat(e.amount||0),0)), BUDGET_LIMIT*1.1);
  const barW = Math.max(8, (W-PAD_L-BAR_GAP*months.length)/months.length-4);
  const yS = v => H-PAD_B-(v/maxVal)*(H-PAD_B-8);
  const goalY = yS(BUDGET_LIMIT);
  return (
    <svg viewBox={`0 0 ${W} ${H+4}`} style={{ width:"100%", overflow:"visible" }}>
      <line x1={PAD_L} y1={goalY} x2={W} y2={goalY} stroke="#4a7fa5" strokeWidth={1} strokeDasharray="5 3" opacity={0.4} />
      <text x={PAD_L-2} y={goalY-3} textAnchor="end" fontSize={8} fill="#8faabc" style={{ fontFamily:"'DM Sans', sans-serif" }}>Budget</text>
      {months.map((m,i) => {
        const total = m.entries.reduce((s,e)=>s+parseFloat(e.amount||0),0);
        const x = PAD_L+i*((W-PAD_L)/months.length)+BAR_GAP/2;
        const over = total>BUDGET_LIMIT;
        const barColor = over?"#d4886a":"#4a7fa5";
        const barH = ((H-PAD_B-8)*Math.min(total,maxVal))/maxVal;
        return (
          <g key={m.month}>
            <rect x={x} y={H-PAD_B-barH} width={barW} height={barH} rx={3} fill={barColor} opacity={0.82} />
            <text x={x+barW/2} y={H-PAD_B+13} textAnchor="middle" fontSize={8} fill="#a09890" style={{ fontFamily:"'DM Sans', sans-serif" }}>{shortMonth(m.month)}</text>
            <text x={x+barW/2} y={H-PAD_B-barH-3} textAnchor="middle" fontSize={7} fill={barColor} style={{ fontFamily:"'DM Sans', sans-serif" }}>${Math.round(total)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StackedBarChart({ months }) {
  const W=600, H=130, PAD_L=36, PAD_B=20, BAR_GAP=6;
  const maxVal = Math.max(...months.map(m=>m.entries.reduce((s,e)=>s+parseFloat(e.amount||0),0)), BUDGET_LIMIT*1.1);
  const barW = Math.max(8,(W-PAD_L-BAR_GAP*months.length)/months.length-4);
  const yS = v => (v/maxVal)*(H-PAD_B-8);
  const goalY = H-PAD_B-yS(BUDGET_LIMIT);
  return (
    <svg viewBox={`0 0 ${W} ${H+4}`} style={{ width:"100%", overflow:"visible" }}>
      <line x1={PAD_L} y1={goalY} x2={W} y2={goalY} stroke="#4a7fa5" strokeWidth={1} strokeDasharray="5 3" opacity={0.4} />
      <text x={PAD_L-2} y={goalY-3} textAnchor="end" fontSize={8} fill="#8faabc" style={{ fontFamily:"'DM Sans', sans-serif" }}>Budget</text>
      {months.map((m,i) => {
        const bd = categoryBreakdown(m.entries);
        const total = (Object.values(bd) as number[]).reduce((s:number,v:number)=>s+v,0);
        const x = PAD_L+i*((W-PAD_L)/months.length)+BAR_GAP/2;
        let yBottom = H-PAD_B;
        const segs = CAT_ORDER.filter(c=>bd[c]>0).map(c=>({ c, val:bd[c], h:yS(bd[c]), color:CATEGORY_COLORS[c].bar }));
        return (
          <g key={m.month}>
            {segs.map(seg => { const rect=<rect key={seg.c} x={x} y={yBottom-seg.h} width={barW} height={seg.h} fill={seg.color} opacity={0.85} />; yBottom-=seg.h; return rect; })}
            <rect x={x} y={yBottom} width={barW} height={3} rx={2} fill={segs[segs.length-1]?.color||"#ccc"} opacity={0.85} />
            <text x={x+barW/2} y={H-PAD_B+13} textAnchor="middle" fontSize={8} fill="#a09890" style={{ fontFamily:"'DM Sans', sans-serif" }}>{shortMonth(m.month)}</text>
            {total>0 && <text x={x+barW/2} y={yBottom-4} textAnchor="middle" fontSize={7} fill="#6a6058" style={{ fontFamily:"'DM Sans', sans-serif" }}>${Math.round(total)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function SpendingTrendChart({ months }) {
  const W=600, H=110, PAD=8, PAD_L=36, PAD_B=20;
  const totals = months.map(m=>m.entries.reduce((s,e)=>s+parseFloat(e.amount||0),0));
  const maxVal = Math.max(...totals, BUDGET_LIMIT*1.1);
  const xS = i => PAD_L+(i/Math.max(months.length-1,1))*(W-PAD_L-PAD);
  const yS = v => H-PAD_B-(v/maxVal)*(H-PAD_B-8);
  const goalY = yS(BUDGET_LIMIT);
  const pathD = totals.reduce((a,v,i)=>a+(i===0?`M ${xS(i)} ${yS(v)}`:`L ${xS(i)} ${yS(v)}`),"");
  const areaD = totals.length>1?`${pathD} L ${xS(totals.length-1)} ${H-PAD_B} L ${xS(0)} ${H-PAD_B} Z`:"";
  return (
    <svg viewBox={`0 0 ${W} ${H+4}`} style={{ width:"100%", overflow:"visible" }}>
      <line x1={PAD_L} y1={goalY} x2={W-PAD} y2={goalY} stroke="#4a7fa5" strokeWidth={1} strokeDasharray="5 3" opacity={0.4} />
      <text x={PAD_L-2} y={goalY-3} textAnchor="end" fontSize={8} fill="#8faabc" style={{ fontFamily:"'DM Sans', sans-serif" }}>Budget</text>
      {areaD && <path d={areaD} fill="#4a7fa5" opacity={0.07} />}
      {totals.length>1 && <path d={pathD} fill="none" stroke="#4a7fa5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {months.map((m,i) => {
        const v=totals[i], over=v>BUDGET_LIMIT;
        return (
          <g key={m.month}>
            <circle cx={xS(i)} cy={yS(v)} r={4} fill={over?"#d4886a":"#4a7fa5"} stroke="white" strokeWidth={1.5} />
            <text x={xS(i)} y={H-PAD_B+13} textAnchor="middle" fontSize={8} fill="#a09890" style={{ fontFamily:"'DM Sans', sans-serif" }}>{shortMonth(m.month)}</text>
            <text x={xS(i)} y={yS(v)-7} textAnchor="middle" fontSize={7} fill={over?"#d4886a":"#4a7fa5"} style={{ fontFamily:"'DM Sans', sans-serif" }}>${Math.round(v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Screenshot Importer ───────────────────────────────────────────────────────
function ScreenshotImporter({ onImport }) {
  const [status, setStatus]     = useState("idle");
  const [message, setMessage]   = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files) => {
    const imageFiles = [...files].filter(f=>f.type.startsWith("image/"));
    if (!imageFiles.length) { setStatus("err"); setMessage("Please select image files (PNG, JPG, HEIC)."); return; }
    setStatus("loading"); setMessage(`Reading ${imageFiles.length} screenshot${imageFiles.length>1?"s":""}…`); setPreviews([]);
    const allItems=[]; let errorCount=0;
    for (const file of imageFiles) {
      try {
        const base64 = await fileToBase64(file);
        setPreviews(prev=>[...prev,base64]);
        setMessage(`Analysing screenshot ${allItems.length+1} of ${imageFiles.length} with AI…`);
        allItems.push(...await parseMFPScreenshot(base64, file.type||"image/jpeg"));
      } catch { errorCount++; }
    }
    if (!allItems.length) { setStatus("err"); setMessage("No food items found. Try a screenshot showing individual foods with calorie and protein values."); return; }
    onImport(allItems);
    setStatus("ok");
    setMessage(`✓ Imported ${allItems.length} food item${allItems.length!==1?"s":""}${errorCount?` (${errorCount} screenshot${errorCount>1?"s":""} couldn't be read)`:""}.`);
    setTimeout(() => { setStatus("idle"); setPreviews([]); }, 3000);
  };

  return (
    <div>
      <div className={`img-drop${dragOver?" drag-over":""}`} onClick={() => fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={() => setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);processFiles(e.dataTransfer.files);}}
        style={{ padding:"24px 16px", textAlign:"center", cursor:"pointer" }}>
        <div style={{ fontSize:28, marginBottom:8 }}>📸</div>
        <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#4a7fa5", fontWeight:500 }}>Tap to select screenshots</p>
        <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#b8b0a4", marginTop:4 }}>or drag & drop · PNG, JPG, HEIC · multiple files supported</p>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>processFiles(e.target.files)} />
      </div>
      {previews.length>0 && (
        <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
          {previews.map((b64,i) => <img key={i} src={`data:image/jpeg;base64,${b64}`} style={{ height:60, width:40, objectFit:"cover", borderRadius:6, border:"1px solid #e8e4de" }} />)}
        </div>
      )}
      {status!=="idle" && (
        <div style={{ marginTop:10, padding:"10px 14px", borderRadius:10, background:status==="ok"?"#eef6f0":status==="err"?"#fce8e8":"#eef2f8", color:status==="ok"?"#4a8c60":status==="err"?"#b85050":"#4a6fa5", fontFamily:"'DM Sans', sans-serif", fontSize:13 }}>
          {message}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
function fileToBase64(file) {
  return new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res((r.result as string).split(",")[1]); r.onerror=()=>rej(new Error("Failed")); r.readAsDataURL(file); });
}

// ── Macros ────────────────────────────────────────────────────────────────────
function Macros({ todayMeals, updateTodayMeals, updateMealsByDay, todayMacros }) {
  const [importOpen, setImportOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ name:"", calories:"", protein:"", fibre:"" });
  const [hoveredDay, setHoveredDay] = useState(null);
  const [chartMacro, setChartMacro] = useState("calories");

  const history     = loadMacroHistory();
  const fullHistory = { ...history, [todayStr]: todayMacros };

  const handleImport = (items) => { updateTodayMeals([...items.map(item=>({id:Date.now()+Math.random(),...item})),...todayMeals]); setImportOpen(false); };
  const addManual    = () => { if (!manualForm.name.trim()) return; updateTodayMeals([{id:Date.now(),...manualForm},...todayMeals]); setManualForm({name:"",calories:"",protein:"",fibre:""}); };
  const removeToday  = id => updateTodayMeals(todayMeals.filter(m=>m.id!==id));

  const now=new Date(), totalDays=daysInMonth(now), startDay=firstDayOfMonth(now), todayDay=now.getDate();
  const dayScores={};
  for (let d=1;d<=totalDays;d++) { const key=`${monthStr}-${String(d).padStart(2,"0")}`; if(fullHistory[key]?.calories>0) dayScores[d]=goalScore(fullHistory[key]); }
  const loggedDays=Object.keys(dayScores);
  const avgScore=loggedDays.length?loggedDays.reduce((s,d)=>s+dayScores[d],0)/loggedDays.length:0;
  const onTrackDays=loggedDays.filter(d=>dayScores[d]>=0.8).length;
  const scoreColor=s=>{ if(s===undefined)return null; if(s>=0.9)return"#4a8c60"; if(s>=0.7)return"#7fafc8"; if(s>=0.5)return"#a8c8de"; return"#d4886a"; };
  const hoveredKey=hoveredDay?`${monthStr}-${String(hoveredDay).padStart(2,"0")}`:null;
  const hoveredTotals=hoveredKey?fullHistory[hoveredKey]:null;
  const chartPoints=Array.from({length:totalDays},(_,i)=>{ const d=i+1,key=`${monthStr}-${String(d).padStart(2,"0")}`; return{day:d,val:fullHistory[key]?.calories>0?(fullHistory[key]?.[chartMacro]??null):null}; });

  return (
    <div style={S.section}>
      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <p style={S.cardLabel}>Import from MyFitnessPal</p>
            <p style={{ ...S.tinyNote, marginTop:0, maxWidth:280 }}>Upload a screenshot of your MFP food diary — AI extracts the data automatically.</p>
          </div>
          <button onClick={() => setImportOpen(!importOpen)} style={{ ...S.addBtn, background:importOpen?"#e8e4de":"#4a7fa5", color:importOpen?"#7a7068":"white", fontSize:12, flexShrink:0, marginLeft:12 }}>
            {importOpen?"Cancel":"📸 Import"}
          </button>
        </div>
        {importOpen && <div style={{ marginTop:14 }}><ScreenshotImporter onImport={handleImport} /></div>}
      </div>

      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <p style={S.cardLabel}>Today's Totals</p>
          <span style={{ ...S.catChip, background:"#eef2f8", color:"#4a6fa5" }}>Resets at midnight</span>
        </div>
        <div style={S.macroRow}>
          {[{label:"Calories",val:todayMacros.calories,goal:MACRO_GOALS.calories,unit:"kcal",color:"#4a7fa5"},{label:"Protein",val:todayMacros.protein,goal:MACRO_GOALS.protein,unit:"g",color:"#7fafc8"},{label:"Fibre",val:todayMacros.fibre,goal:MACRO_GOALS.fibre,unit:"g",color:"#6abfa0"}].map(m=>(
            <div key={m.label} style={S.macroItem}>
              <p style={{ ...S.macroVal, color:m.color, fontSize:20 }}>{Math.round(m.val)}<span style={S.macroUnit}>{m.unit}</span></p>
              <p style={S.macroLabel}>{m.label}</p>
              <ProgressBar pct={Math.min((m.val/m.goal)*100,100)} color={m.color} thin />
              <p style={S.tinyNote}>/ {m.goal}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            <p style={S.cardLabel}>Monthly Progress — {monthLabel}</p>
            <p style={S.tinyNote}>{onTrackDays} days on track · avg {Math.round(avgScore*100)}% of goals met</p>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end" }}>
            {[["#4a8c60","≥90%"],["#7fafc8","≥70%"],["#a8c8de","≥50%"],["#d4886a","<50%"]].map(([c,l])=>(
              <div key={c} style={{ display:"flex", alignItems:"center", gap:2 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:c }} />
                <span style={{ fontSize:9, color:"#a09890", fontFamily:"'DM Sans', sans-serif" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:3, marginBottom:3 }}>
          {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{ textAlign:"center", fontSize:9, color:"#b8b0a4", fontFamily:"'DM Sans', sans-serif", fontWeight:500 }}>{d}</div>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:3 }}>
          {Array.from({length:startDay}).map((_,i)=><div key={`e${i}`} />)}
          {Array.from({length:totalDays}).map((_,i)=>{
            const day=i+1,score=dayScores[day],color=scoreColor(score);
            const isToday=day===todayDay,isFuture=day>todayDay;
            return (
              <div key={day} className="day-cell" onMouseEnter={()=>setHoveredDay(day)} onMouseLeave={()=>setHoveredDay(null)}
                style={{ aspectRatio:"1", borderRadius:6, background:color?color+(hoveredDay===day?"ff":"cc"):isFuture?"#f8f6f3":"#f0ece6", border:isToday?"2px solid #4a7fa5":"1px solid transparent", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:score!==undefined?"pointer":"default", transition:"transform 0.12s", opacity:isFuture?0.4:1 }}>
                <span style={{ fontSize:10, fontFamily:"'DM Sans', sans-serif", fontWeight:isToday?600:400, color:color?"white":isToday?"#4a7fa5":"#8a7f78" }}>{day}</span>
                {score!==undefined && <span style={{ fontSize:7, color:"rgba(255,255,255,0.85)", fontFamily:"'DM Sans', sans-serif" }}>{Math.round(score*100)}%</span>}
              </div>
            );
          })}
        </div>
        {hoveredDay && hoveredTotals?.calories>0 && (
          <div style={{ marginTop:10, padding:"10px 14px", background:"#f5f2ed", borderRadius:10, border:"1px solid #e8e4de" }}>
            <p style={{ ...S.cardLabel, marginBottom:6 }}>{new Date(`${monthStr}-${String(hoveredDay).padStart(2,"0")}T12:00:00`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</p>
            <div style={{ display:"flex", gap:16 }}>
              {[{k:"calories",l:"Cal",u:"kcal"},{k:"protein",l:"Protein",u:"g"},{k:"fibre",l:"Fibre",u:"g"}].map(({k,l,u})=>(
                <div key={k}>
                  <p style={{ fontFamily:"'DM Serif Display', serif", fontSize:16, color:MACRO_COLORS[k] }}>{Math.round(hoveredTotals[k]||0)}<span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:9, color:"#a09890", marginLeft:1 }}>{u}</span></p>
                  <p style={{ fontFamily:"'DM Sans', sans-serif", fontSize:9, color:"#a09890" }}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <p style={S.cardLabel}>Monthly Trend</p>
          <div style={{ display:"flex", gap:4 }}>
            {["calories","protein","fibre"].map(m=>(
              <button key={m} onClick={()=>setChartMacro(m)} style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, padding:"3px 9px", borderRadius:99, border:"1px solid #ddd8d0", cursor:"pointer", background:chartMacro===m?MACRO_COLORS[m]:"transparent", color:chartMacro===m?"white":"#8a7f78", fontWeight:chartMacro===m?500:400 }}>{m.charAt(0).toUpperCase()+m.slice(1)}</button>
            ))}
          </div>
        </div>
        <MiniLineChart points={chartPoints} goal={MACRO_GOALS[chartMacro]} color={MACRO_COLORS[chartMacro]} todayDay={todayDay} />
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
          <p style={S.tinyNote}>Day 1</p>
          <p style={{ ...S.tinyNote, color:MACRO_COLORS[chartMacro] }}>Goal: {MACRO_GOALS[chartMacro]}{chartMacro==="calories"?" kcal":"g"}</p>
          <p style={S.tinyNote}>Day {totalDays}</p>
        </div>
      </div>

      <div style={S.card}>
        <p style={S.cardLabel}>Add Entry Manually</p>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <input style={S.input} placeholder="Food or meal name" value={manualForm.name} onChange={e=>setManualForm({...manualForm,name:e.target.value})} />
          <div style={S.formRow}>
            {[{f:"calories",ph:"Calories"},{f:"protein",ph:"Protein (g)"},{f:"fibre",ph:"Fibre (g)"}].map(({f,ph})=>(
              <input key={f} style={{ ...S.input, flex:1 }} placeholder={ph} type="number" value={manualForm[f]} onChange={e=>setManualForm({...manualForm,[f]:e.target.value})} />
            ))}
            <button style={S.addBtn} onClick={addManual}>Add</button>
          </div>
        </div>
      </div>

      {todayMeals.length>0 && (
        <div style={S.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <p style={S.cardLabel}>Today's Food Log</p>
            <p style={S.tinyNote}>{todayMeals.length} items</p>
          </div>
          <div style={S.list}>
            {todayMeals.map(m=>(
              <div key={m.id} style={S.listRow}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ ...S.listMain, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</p>
                  <div style={{ display:"flex", gap:8, marginTop:2 }}>
                    <p style={{ ...S.listSub, color:"#7fafc8" }}>P: {m.protein||0}g</p>
                    <p style={{ ...S.listSub, color:"#6abfa0" }}>F: {m.fibre||0}g</p>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                  <p style={{ ...S.listMain, color:"#4a7fa5" }}>{m.calories||0} kcal</p>
                  <button style={S.removeBtn} onClick={()=>removeToday(m.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniLineChart({ points, goal, color, todayDay }) {
  const W=700,H=90,PAD=8;
  const logged=points.filter(p=>p.val!==null);
  if (!logged.length) return <div style={{ height:90, display:"flex", alignItems:"center", justifyContent:"center" }}><p style={S.empty}>No data yet this month</p></div>;
  const maxVal=Math.max(...logged.map(p=>p.val),goal*1.2);
  const xS=d=>PAD+((d.day-1)/(points.length-1))*(W-PAD*2);
  const yS=v=>H-PAD-(v/maxVal)*(H-PAD*2);
  const pathD=logged.reduce((a,p,i)=>a+(i===0?`M ${xS(p)} ${yS(p.val)}`:`L ${xS(p)} ${yS(p.val)}`),"");
  const areaD=logged.length>1?`${pathD} L ${xS(logged[logged.length-1])} ${H} L ${xS(logged[0])} ${H} Z`:"";
  const goalY=yS(goal);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:90, overflow:"visible" }}>
      <line x1={PAD} y1={goalY} x2={W-PAD} y2={goalY} stroke={color} strokeWidth={1} strokeDasharray="5 3" opacity={0.35} />
      {areaD && <path d={areaD} fill={color} opacity={0.07} />}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {logged.map(p=><circle key={p.day} cx={xS(p)} cy={yS(p.val)} r={p.day===todayDay?4:2.5} fill={p.day===todayDay?color:"white"} stroke={color} strokeWidth={1.5} />)}
    </svg>
  );
}

// ── Archives ──────────────────────────────────────────────────────────────────
function Archives({ archives }) {
  const [sel, setSel] = useState(archives[0]?.month||null);
  const archive = archives.find(a=>a.month===sel);
  return (
    <div style={{ padding:"0 20px" }}>
      <div style={S.card}>
        <p style={S.cardLabel}>Past Months</p>
        {!archives.length && <p style={S.empty}>No archived months yet — archives appear automatically at month end.</p>}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>
          {archives.map(a => {
            const lbl=new Date(a.month+"-15").toLocaleDateString("en-US",{month:"long",year:"numeric"});
            return <button key={a.month} onClick={()=>setSel(a.month)} style={{ fontFamily:"'DM Sans', sans-serif", fontSize:12, padding:"5px 12px", borderRadius:99, border:"1.5px solid #ddd8d0", background:sel===a.month?"#4a7fa5":"transparent", color:sel===a.month?"white":"#8a7f78" }}>{lbl}</button>;
          })}
        </div>
      </div>
      {archive && <ArchiveDetail archive={archive} />}
    </div>
  );
}

function ArchiveDetail({ archive }) {
  const { month, data } = archive;
  const lbl=new Date(month+"-15").toLocaleDateString("en-US",{month:"long",year:"numeric"});
  let history={};
  try { history=JSON.parse(localStorage.getItem(`macro_history_v5_${month}`)||"{}"); } catch {}
  const loggedDays=Object.keys(history);
  const avgScore=loggedDays.length?loggedDays.reduce((s,k)=>s+goalScore(history[k]),0)/loggedDays.length:0;
  const now=new Date(month+"-15"), totalDays=daysInMonth(now), startDay=firstDayOfMonth(now);
  const dayScores={};
  for(let d=1;d<=totalDays;d++){const key=`${month}-${String(d).padStart(2,"0")}`;if(history[key]?.calories>0)dayScores[d]=goalScore(history[key]);}
  const sc=s=>{if(s===undefined)return null;if(s>=0.9)return"#4a8c60";if(s>=0.7)return"#7fafc8";if(s>=0.5)return"#a8c8de";return"#d4886a";};
  return (
    <div style={{ ...S.section, marginTop:12 }}>
      <div style={S.card}>
        <p style={S.cardLabel}>{lbl} — Summary</p>
        <div style={S.grid2}>
          {[["Avg macro goal",`${Math.round(avgScore*100)}%`]].map(([l,v])=>(
            <div key={l}><p style={S.tinyNote}>{l}</p><p style={{ ...S.bigNum, fontSize:24 }}>{v}</p></div>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <p style={S.cardLabel}>Macro Calendar — {lbl}</p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:3, marginBottom:3 }}>
          {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{ textAlign:"center", fontSize:9, color:"#b8b0a4", fontFamily:"'DM Sans', sans-serif" }}>{d}</div>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:3 }}>
          {Array.from({length:startDay}).map((_,i)=><div key={`e${i}`} />)}
          {Array.from({length:totalDays}).map((_,i)=>{
            const day=i+1,score=dayScores[day],color=sc(score);
            return <div key={day} style={{ aspectRatio:"1", borderRadius:5, background:color?color+"bb":"#f0ece6", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:9, fontFamily:"'DM Sans', sans-serif", color:color?"white":"#c0b8b0" }}>{day}</span></div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Todo List ─────────────────────────────────────────────────────────────────
function TodoList({ tasks, update, label, accent, taskType }) {
  const [text, setText]           = useState("");
  const [priority, setPriority]   = useState("normal");
  const [showArchive, setShowArchive] = useState(false);
  const taskArchives = getTaskArchives(taskType);
  const add = () => { if (!text.trim()) return; update([...tasks,{id:Date.now(),text:text.trim(),done:false,priority,addedMonth:monthStr}]); setText(""); setPriority("normal"); };
  const toggle = id => update(tasks.map(t=>t.id===id?{...t,done:!t.done}:t));
  const remove = id => update(tasks.filter(t=>t.id!==id));
  const pending=tasks.filter(t=>!t.done), done=tasks.filter(t=>t.done), rolledOver=pending.filter(t=>t.rolledFrom);
  const sortedPending=[...pending].sort((a,b)=>({high:0,normal:1,low:2}[a.priority]-{high:0,normal:1,low:2}[b.priority]));
  const priorityColor={high:"#d4886a",normal:"#8faabc",low:"#b8c8d0"};

  if (showArchive) {
    return (
      <div style={S.section}>
        <div style={S.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <p style={S.cardLabel}>{label} — Past Months</p>
            <button onClick={() => setShowArchive(false)} style={{ ...S.addBtn, background:"#e8e4de", color:"#7a7068", fontSize:12, padding:"6px 14px" }}>← Back</button>
          </div>
          {!taskArchives.length && <p style={{ ...S.empty, marginTop:12 }}>No archived months yet — tasks are archived automatically at month end.</p>}
        </div>
        {taskArchives.map(({month,tasks:archTasks}) => {
          const mLabel=new Date(month+"-15").toLocaleDateString("en-US",{month:"long",year:"numeric"});
          const archDone=archTasks.filter(t=>t.done), archPending=archTasks.filter(t=>!t.done);
          return (
            <div key={month} style={S.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <p style={S.cardLabel}>{mLabel}</p>
                <div style={{ display:"flex", gap:6 }}>
                  <span style={{ ...S.catChip, background:"#eef6f0", color:"#4a8c60" }}>{archDone.length} done</span>
                  {archPending.length>0 && <span style={{ ...S.catChip, background:"#fdf3e7", color:"#c07830" }}>{archPending.length} rolled over</span>}
                </div>
              </div>
              {archDone.length>0 && (
                <div style={S.list}>
                  {archDone.map(t=>(
                    <div key={t.id} style={{ ...S.taskRow, opacity:0.7 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                        <div style={{ ...S.checkbox, borderColor:accent, background:accent, flexShrink:0 }}><span style={{ color:"white", fontSize:10, lineHeight:1 }}>✓</span></div>
                        <p style={{ ...S.listMain, textDecoration:"line-through", color:"#b8b0a4", flex:1 }}>{t.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {archPending.length>0 && (
                <div style={{ marginTop:archDone.length?8:0 }}>
                  {archDone.length>0 && <div style={{ borderTop:"1px solid #f0ece6", marginBottom:8 }} />}
                  {archPending.map(t=>(
                    <div key={t.id} style={S.taskRow}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                        <div style={{ ...S.checkbox, borderColor:"#c0b8b0", flexShrink:0 }} />
                        <p style={{ ...S.listMain, flex:1, color:"#a09890" }}>{t.text}</p>
                        <span style={{ ...S.catChip, background:"#fdf3e7", color:"#c07830", fontSize:10 }}>rolled over</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={S.section}>
      <div style={S.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div>
            <p style={S.cardLabel}>{label} Tasks — {monthLabel}</p>
            <p style={S.tinyNote}>{pending.length} remaining · {done.length} done{rolledOver.length>0?` · ${rolledOver.length} rolled over`:""}</p>
          </div>
          <button onClick={() => setShowArchive(true)} style={{ fontFamily:"'DM Sans', sans-serif", fontSize:10, padding:"4px 10px", borderRadius:99, border:"1px solid #ddd8d0", background:"transparent", color:"#a09890", cursor:"pointer", whiteSpace:"nowrap" }}>
            Archive ({taskArchives.length})
          </button>
        </div>
        <ProgressBar pct={tasks.length?(done.length/tasks.length)*100:0} color={accent} thin={false} />
      </div>

      {rolledOver.length>0 && (
        <div style={{ ...S.card, background:"#fdf9f0", border:"1px solid #e8dfc8" }}>
          <p style={{ ...S.cardLabel, color:"#c07830" }}>↩ Rolled over from last month</p>
          <div style={S.list}>
            {rolledOver.map(t => {
              const fromLabel=new Date(t.rolledFrom+"-15").toLocaleDateString("en-US",{month:"long"});
              return (
                <div key={t.id} style={S.taskRow}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                    <button style={{ ...S.checkbox, borderColor:accent }} onClick={() => toggle(t.id)} />
                    <div style={{ flex:1 }}>
                      <p style={S.listMain}>{t.text}</p>
                      <p style={{ ...S.tinyNote, marginTop:1, color:"#c07830" }}>From {fromLabel}</p>
                    </div>
                    <span style={{ ...S.priorityTag, background:priorityColor[t.priority]+"22", color:priorityColor[t.priority] }}>{t.priority}</span>
                  </div>
                  <button style={S.removeBtn} onClick={() => remove(t.id)}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={S.card}>
        <p style={S.cardLabel}>Add Task</p>
        <div style={S.formRow}>
          <input style={{ ...S.input, flex:1 }} placeholder="New task…" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} />
          <select style={S.select} value={priority} onChange={e=>setPriority(e.target.value)}>
            <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </select>
          <button style={{ ...S.addBtn, background:accent }} onClick={add}>Add</button>
        </div>
      </div>

      {sortedPending.filter(t=>!t.rolledFrom).length>0 && (
        <div style={S.card}>
          <p style={S.cardLabel}>To Do</p>
          <div style={S.list}>
            {sortedPending.filter(t=>!t.rolledFrom).map(t=>(
              <div key={t.id} style={S.taskRow}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                  <button style={{ ...S.checkbox, borderColor:accent }} onClick={() => toggle(t.id)} />
                  <p style={{ ...S.listMain, flex:1 }}>{t.text}</p>
                  <span style={{ ...S.priorityTag, background:priorityColor[t.priority]+"22", color:priorityColor[t.priority] }}>{t.priority}</span>
                </div>
                <button style={S.removeBtn} onClick={() => remove(t.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {done.length>0 && (
        <div style={S.card}>
          <p style={S.cardLabel}>Completed</p>
          <div style={S.list}>
            {done.map(t=>(
              <div key={t.id} style={S.taskRow}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                  <button style={{ ...S.checkbox, borderColor:accent, background:accent }} onClick={() => toggle(t.id)}>
                    <span style={{ color:"white", fontSize:10, lineHeight:1 }}>✓</span>
                  </button>
                  <p style={{ ...S.listMain, textDecoration:"line-through", color:"#b8b0a4", flex:1 }}>{t.text}</p>
                </div>
                <button style={S.removeBtn} onClick={() => remove(t.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!tasks.length && (
        <div style={{ ...S.card, textAlign:"center", padding:"32px 20px" }}>
          <p style={S.empty}>All clear — add your first task above</p>
        </div>
      )}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Card({ children, onClick, label }) {
  return (
    <div style={{ ...S.card, cursor:"pointer", transition:"transform 0.15s, box-shadow 0.15s" }} onClick={onClick}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(74,127,165,0.12)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 8px rgba(0,0,0,0.04)";}}>
      <p style={S.cardLabel}>{label}</p>
      {children}
    </div>
  );
}
function ProgressBar({ pct, color, thin }) {
  return (
    <div style={{ background:"#e8e4de", borderRadius:99, height:thin?4:6, margin:"8px 0", overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, background:color, height:"100%", borderRadius:99, transition:"width 0.5s ease" }} />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
import { CSSProperties } from "react";

const S: Record<string, CSSProperties> = {
  app:         { fontFamily:"'DM Sans', sans-serif", background:"#f5f2ed", minHeight:"100vh", maxWidth:780, margin:"0 auto", padding:"0 0 48px" },
  header:      { padding:"32px 24px 20px", display:"flex", justifyContent:"space-between", alignItems:"flex-end" },
  dateText:    { fontFamily:"'DM Sans', sans-serif", fontWeight:300, fontSize:12, color:"#a09890", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:4 },
  title:       { fontFamily:"'DM Serif Display', serif", fontSize:36, color:"#2c2420", fontWeight:400, letterSpacing:"-0.02em" },
  headerDot:   { width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg, #7fafc8, #4a7fa5)", opacity:0.6 },
  archiveBtn:  { fontFamily:"'DM Sans', sans-serif", fontSize:11, padding:"4px 10px", borderRadius:99, border:"1px solid #ddd8d0", background:"transparent", color:"#a09890", cursor:"pointer" },
  nav:         { display:"flex", gap:4, padding:"0 20px 16px", overflowX:"auto" },
  tabBtn:      { fontFamily:"'DM Sans', sans-serif", fontWeight:400, fontSize:13, padding:"7px 16px", borderRadius:99, border:"1.5px solid #ddd8d0", background:"transparent", color:"#8a7f78", letterSpacing:"0.02em", whiteSpace:"nowrap", transition:"all 0.15s" },
  tabActive:   { background:"#4a7fa5", borderColor:"#4a7fa5", color:"white", fontWeight:500 },
  main:        { padding:"0 20px" },
  section:     { display:"flex", flexDirection:"column", gap:12 },
  grid2:       { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  card:        { background:"white", borderRadius:16, padding:"20px", boxShadow:"0 1px 8px rgba(0,0,0,0.04)", border:"1px solid #ede9e3" },
  cardLabel:   { fontFamily:"'DM Sans', sans-serif", fontWeight:500, fontSize:11, color:"#a09890", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 },
  bigNum:      { fontFamily:"'DM Serif Display', serif", fontSize:32, color:"#2c2420", fontWeight:400, lineHeight:1 },
  outOf:       { fontFamily:"'DM Sans', sans-serif", fontSize:18, color:"#c0b8b0", fontWeight:300 },
  subLabel:    { fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#a09890", fontWeight:300, marginTop:2 },
  tinyNote:    { fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#b8b0a4", marginTop:4 },
  previewList: { marginTop:8 },
  previewItem: { fontFamily:"'DM Sans', sans-serif", fontSize:12, color:"#8a7f78", marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  macroRow:    { display:"flex", gap:16, flexWrap:"wrap" },
  macroItem:   { flex:"1 1 80px" },
  macroVal:    { fontFamily:"'DM Serif Display', serif", fontSize:22, fontWeight:400 },
  macroUnit:   { fontFamily:"'DM Sans', sans-serif", fontSize:11, fontWeight:300, color:"#a09890", marginLeft:2 },
  macroLabel:  { fontFamily:"'DM Sans', sans-serif", fontSize:11, color:"#a09890", marginTop:1 },
  formRow:     { display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" },
  input:       { fontFamily:"'DM Sans', sans-serif", fontSize:13, padding:"9px 12px", border:"1.5px solid #ddd8d0", borderRadius:10, background:"#faf9f7", color:"#2c2420", flex:1, transition:"border-color 0.15s" },
  select:      { fontFamily:"'DM Sans', sans-serif", fontSize:13, padding:"9px 10px", border:"1.5px solid #ddd8d0", borderRadius:10, background:"#faf9f7", color:"#2c2420", cursor:"pointer" },
  addBtn:      { fontFamily:"'DM Sans', sans-serif", fontWeight:500, fontSize:13, padding:"9px 18px", borderRadius:10, border:"none", background:"#4a7fa5", color:"white", letterSpacing:"0.02em", whiteSpace:"nowrap" },
  list:        { display:"flex", flexDirection:"column", gap:1 },
  listRow:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 6px", borderBottom:"1px solid #f0ece6" },
  taskRow:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f0ece6", gap:8 },
  listMain:    { fontFamily:"'DM Sans', sans-serif", fontSize:14, color:"#3a3028", fontWeight:400 },
  listSub:     { fontFamily:"'DM Sans', sans-serif", fontSize:11, marginTop:1 },
  removeBtn:   { fontFamily:"'DM Sans', sans-serif", fontSize:18, color:"#c8c0b8", background:"none", border:"none", lineHeight:1, padding:"2px 4px", flexShrink:0 },
  checkbox:    { width:18, height:18, borderRadius:5, border:"1.5px solid #7fafc8", background:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, padding:0 },
  priorityTag: { fontFamily:"'DM Sans', sans-serif", fontSize:10, fontWeight:500, padding:"2px 8px", borderRadius:99, letterSpacing:"0.04em", textTransform:"uppercase" },
  catChip:     { fontFamily:"'DM Sans', sans-serif", fontSize:11, fontWeight:500, padding:"3px 9px", borderRadius:99, letterSpacing:"0.02em" },
  empty:       { fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#b8b0a4", textAlign:"center", padding:"8px 0" },
};
