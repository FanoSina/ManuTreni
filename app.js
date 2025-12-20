/********************************************************
 * FIREBASE INIT
 ********************************************************/
const firebaseConfig = {
  apiKey: "AIzaSyCqLfhYJLru8RVmVhOCmYWo1MDzNaOQGpQ",
  authDomain: "manutrain-aced7.firebaseapp.com",
  projectId: "manutrain-aced7",
  storageBucket: "manutrain-aced7.appspot.com",
  messagingSenderId: "1031834557198",
  appId: "1:1031834557198:web:8b40c5379d2b682423955f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/********************************************************
 * HELPERS
 ********************************************************/
const $ = id => document.getElementById(id);
const norm = v => (v || "").toString().trim();
const alphaSort = (a, b) => a.localeCompare(b, "it", { sensitivity: "base" });

function toDeci(v) {
  const n = parseFloat(norm(v).replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 10) / 10;
}
function ymd(d) {
  return d.toISOString().split("T")[0];
}
function monthLabel(d) {
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

/********************************************************
 * STATE
 ********************************************************/
let currentUser = null;
let currentMonth = new Date();
let selectedDay = null;

let settings = {
  models: [],
  trains: {},
  scadenze: [],
  abilitazioni: []
};

let activities = [];
let modelListenerAttached = false;

/********************************************************
 * FIRESTORE REFS
 ********************************************************/
const settingsDoc = uid =>
db.collection("users").doc(uid).collection("settings").doc("main");

const activitiesCol = uid =>
db.collection("users").doc(uid).collection("activities");

/********************************************************
 * AUTH UI
 ********************************************************/
function showAuth(msg = "") {
  $("auth-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("auth-msg").textContent = msg;
}
function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

/********************************************************
 * AUTH ACTIONS
 ********************************************************/
$("btn-login").onclick = async () => {
  try {
    await auth.signInWithEmailAndPassword(
      norm($("auth-email").value),
                                          $("auth-password").value
    );
  } catch (e) {
    showAuth(e.message);
  }
};

$("btn-register").onclick = async () => {
  try {
    await auth.createUserWithEmailAndPassword(
      norm($("auth-email").value),
                                              $("auth-password").value
    );
  } catch (e) {
    showAuth(e.message);
  }
};

$("btn-logout").onclick = async () => {
  await auth.signOut();
};

/********************************************************
 * LOAD & SAVE SETTINGS (ROBUSTO)
 ********************************************************/
async function loadSettings(uid) {
  const ref = settingsDoc(uid);
  const snap = await ref.get();

  const DEFAULT_MODELS = ["E464", "TAF", "POP", "JAZZ", "ROCK"];

  if (!snap.exists) {
    settings = {
      models: [...DEFAULT_MODELS],
      trains: {},
      scadenze: [],
      abilitazioni: []
    };
    DEFAULT_MODELS.forEach(m => settings.trains[m] = []);
    await ref.set(settings);
    return;
  }

  const data = snap.data() || {};
  settings.models = Array.isArray(data.models) && data.models.length
  ? data.models
  : [...DEFAULT_MODELS];

  settings.trains = data.trains || {};
  settings.scadenze = Array.isArray(data.scadenze) ? data.scadenze : [];
  settings.abilitazioni = Array.isArray(data.abilitazioni) ? data.abilitazioni : [];

  settings.models.forEach(m => {
    if (!Array.isArray(settings.trains[m])) {
      settings.trains[m] = [];
    }
  });

  await ref.set(settings, { merge: true });
}

async function saveSettings() {
  if (!currentUser) return;
  await settingsDoc(currentUser.uid).set(settings, { merge: true });
}

/********************************************************
 * ACTIVITIES
 ********************************************************/
async function loadActivities(uid) {
  const snap = await activitiesCol(uid).get();
  activities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function addActivity(a) {
  const ref = await activitiesCol(currentUser.uid).add(a);
  activities.push({ id: ref.id, ...a });
}

async function updateActivity(id, patch) {
  await activitiesCol(currentUser.uid).doc(id).set(patch, { merge: true });
  const i = activities.findIndex(x => x.id === id);
  if (i >= 0) activities[i] = { ...activities[i], ...patch };
}

async function deleteActivity(id) {
  await activitiesCol(currentUser.uid).doc(id).delete();
  activities = activities.filter(x => x.id !== id);
}

/********************************************************
 * TABS
 ********************************************************/
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "calendar") renderCalendar();
    if (btn.dataset.tab === "registry") renderRegistry();
    if (btn.dataset.tab === "new") refreshNewForm();
    if (btn.dataset.tab === "settings") renderSettings();
  };
});

/********************************************************
 * NEW ACTIVITY FORM
 ********************************************************/
function renderModelSelect(sel) {
  sel.innerHTML = "";
  settings.models.forEach(m => sel.appendChild(new Option(m, m)));
}

function renderOptions(sel, list, emptyLabel) {
  sel.innerHTML = "";
  if (!list.length) {
    const o = new Option(emptyLabel, "");
    o.disabled = true;
    o.selected = true;
    sel.appendChild(o);
    return;
  }
  list.forEach(v => sel.appendChild(new Option(v, v)));
}

function refreshNewForm() {
  if (!$("n-date").value) $("n-date").value = ymd(new Date());

  let model = $("n-model").value;
  if (!model || !settings.models.includes(model)) {
    model = settings.models[0];
    $("n-model").value = model;
  }

  renderOptions($("n-train"), settings.trains[model], "Nessuna matricola");
  renderOptions($("n-scadenza"), settings.scadenze, "Nessuna scadenza");
  renderOptions($("n-abilitazione"), settings.abilitazioni, "Nessuna abilitazione");
}

$("form-new").onsubmit = async e => {
  e.preventDefault();

  const a = {
    date: $("n-date").value,
    model: $("n-model").value,
    trainId: $("n-train").value,
    scadenza: $("n-scadenza").value,
    abilitazione: $("n-abilitazione").value,
    timeDeci: toDeci($("n-timeDeci").value),
    notes: norm($("n-notes").value)
  };

  if (a.timeDeci === null) return alert("Tempo non valido");

  await addActivity(a);
  $("form-new").reset();
  refreshNewForm();
  renderCalendar();
  renderRegistry();
};

/********************************************************
 * CALENDAR
 ********************************************************/
function renderCalendar() {
  $("cal-month-label").textContent = monthLabel(currentMonth);
  const grid = $("calendar-grid");
  grid.innerHTML = "";

  const byDate = {};
  activities.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();

  ["L","M","M","G","V","S","D"].forEach(w => {
    const h = document.createElement("div");
    h.className = "cal-header-cell";
    h.textContent = w;
    grid.appendChild(h);
  });

  for (let i = 0; i < start; i++) {
    const e = document.createElement("div");
    e.className = "cal-cell";
    e.style.visibility = "hidden";
    grid.appendChild(e);
  }

  for (let d = 1; d <= days; d++) {
    const date = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const list = byDate[date] || [];
    const total = list.reduce((s,a)=>s+(a.timeDeci||0),0);

    const c = document.createElement("div");
    c.className = "cal-cell cal-day";
    if (selectedDay === date) c.classList.add("active");
    c.innerHTML = `<div>${d}</div><div class="cal-day-hours">${total?total.toFixed(1):""}</div>`;
    c.onclick = () => {
      selectedDay = date;
      showDaySummary(date, list);
      renderCalendar();
    };
    grid.appendChild(c);
  }

  if (!selectedDay) showDaySummary(null, []);
}

function showDaySummary(date, list) {
  $("cal-day-title").textContent = date ? `Attività del ${date}` : "Nessuna attività";
  const tbody = $("cal-day-activities");
  tbody.innerHTML = "";
  if (!list || !list.length) {
    tbody.innerHTML = `<tr><td colspan="7">Nessuna attività</td></tr>`;
    $("cal-day-hours").textContent = "0.0";
    return;
  }
  let tot = 0;
  list.forEach(a => {
    tot += a.timeDeci || 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci.toFixed(1)}</td>
    <td>${a.notes||""}</td>
    <td>
    <button onclick="removeActivity('${a.id}')">🗑️</button>
    </td>`;
    tbody.appendChild(tr);
  });
  $("cal-day-hours").textContent = tot.toFixed(1);
}

/********************************************************
 * REGISTRY
 ********************************************************/
function renderRegistry() {
  $("registry-rows").innerHTML = "";
  activities.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci}</td>
    <td>
    <button onclick="removeActivity('${a.id}')">🗑️</button>
    </td>`;
    $("registry-rows").appendChild(tr);
  });
}

window.removeActivity = async id => {
  if (!confirm("Eliminare attività?")) return;
  await deleteActivity(id);
  renderCalendar();
  renderRegistry();
};

/********************************************************
 * SETTINGS UI (SCRIVE DAVVERO)
 ********************************************************/
function renderSettings() {
  $("s-models-list").innerHTML = "";
  settings.models.forEach(m => {
    const li = document.createElement("li");
    li.textContent = m;
    $("s-models-list").appendChild(li);
  });

  const sel = $("s-train-model");
  sel.innerHTML = "";
  settings.models.forEach(m => sel.appendChild(new Option(m,m)));
  renderSettingsLists();
}

function renderSettingsLists() {
  const m = $("s-train-model").value;
  $("s-trains-list").innerHTML = "";
  (settings.trains[m]||[]).forEach(t=>{
    const li=document.createElement("li");
    li.textContent=t;
    $("s-trains-list").appendChild(li);
  });

  $("s-scads-list").innerHTML="";
  settings.scadenze.forEach(s=>{
    const li=document.createElement("li");
    li.textContent=s;
    $("s-scads-list").appendChild(li);
  });

  $("s-abils-list").innerHTML="";
  settings.abilitazioni.forEach(a=>{
    const li=document.createElement("li");
    li.textContent=a;
    $("s-abils-list").appendChild(li);
  });
}

$("s-train-model").onchange = renderSettingsLists;

$("s-add-train").onclick = async ()=>{
  const m=$("s-train-model").value;
  const v=norm($("s-train-name").value);
  if(!m||!v)return;
  if(!settings.trains[m].includes(v))settings.trains[m].push(v);
  await saveSettings();
  $("s-train-name").value="";
  renderSettingsLists();
  refreshNewForm();
};

$("s-add-scad").onclick = async ()=>{
  const v=norm($("s-scad-name").value);
  if(!v)return;
  if(!settings.scadenze.includes(v))settings.scadenze.push(v);
  await saveSettings();
  $("s-scad-name").value="";
  renderSettingsLists();
  refreshNewForm();
};

$("s-add-abil").onclick = async ()=>{
  const v=norm($("s-abil-name").value);
  if(!v)return;
  if(!settings.abilitazioni.includes(v))settings.abilitazioni.push(v);
  await saveSettings();
  $("s-abil-name").value="";
  renderSettingsLists();
  refreshNewForm();
};

/********************************************************
 * AUTH STATE
 ********************************************************/
auth.onAuthStateChanged(async user=>{
  if(!user){
    currentUser=null;
    showAuth();
    return;
  }

  currentUser=user;
  showApp();
  $("user-email").textContent=user.email;

  await loadSettings(user.uid);
  await loadActivities(user.uid);

  renderModelSelect($("n-model"));
  $("n-model").value=settings.models[0];

  if(!modelListenerAttached){
    $("n-model").onchange=refreshNewForm;
    modelListenerAttached=true;
  }

  refreshNewForm();
  renderRegistry();
  renderCalendar();
});
