/**********************
 * Firebase init
 **********************/
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

/**********************
 * Helpers
 **********************/
const $ = (id) => document.getElementById(id);
const norm = (v) => (v || "").toString().trim();
const alphaSort = (a, b) => a.localeCompare(b, "it", { sensitivity: "base" });

function toDeci(v) {
  const s = norm(v).replace(",", ".");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthLabel(date) {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

/**********************
 * Firestore paths
 **********************/
const settingsDocRef = (uid) =>
db.collection("users").doc(uid).collection("settings").doc("main");
const activitiesColRef = (uid) =>
db.collection("users").doc(uid).collection("activities");

/**********************
 * State
 **********************/
let currentUser = null;
let currentMonth = new Date();
let selectedDay = null;

let settings = {
  models: ["E464", "TAF", "POP", "JAZZ", "ROCK"],
  trains: {},            // per-model: { E464: ["464-001"] }
  scadenze: [],          // global
  abilitazioni: []       // global
};

let activities = []; // {id, date, model, trainId, scadenza, abilitazione, timeDeci, notes}

/**********************
 * UI show/hide
 **********************/
function showAuth(msg = "") {
  $("app").classList.add("hidden");
  $("auth-screen").classList.remove("hidden");
  $("auth-msg").textContent = msg;
}
function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

/**********************
 * Auth buttons
 **********************/
$("btn-login").addEventListener("click", async () => {
  $("auth-msg").textContent = "";
  try {
    const email = norm($("auth-email").value);
    const pass = $("auth-password").value;
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    $("auth-msg").textContent = e.message;
    $("auth-msg").className = "status error";
  }
});

$("btn-register").addEventListener("click", async () => {
  $("auth-msg").textContent = "";
  try {
    const email = norm($("auth-email").value);
    const pass = $("auth-password").value;
    await auth.createUserWithEmailAndPassword(email, pass);
  } catch (e) {
    $("auth-msg").textContent = e.message;
    $("auth-msg").className = "status error";
  }
});

$("btn-logout").addEventListener("click", async () => {
  await auth.signOut();
});

/**********************
 * Tabs
 **********************/
let tabsInitialized = false;
function initTabsOnce() {
  if (tabsInitialized) return;
  tabsInitialized = true;

  const btns = document.querySelectorAll(".tabs button");
  const tabs = document.querySelectorAll(".tab");

  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const tab = b.dataset.tab;

      btns.forEach((x) => x.classList.remove("active"));
      tabs.forEach((x) => x.classList.remove("active"));

      b.classList.add("active");
      $(`tab-${tab}`).classList.add("active");

      if (tab === "calendar") renderCalendar();
      if (tab === "registry") renderRegistry();
      if (tab === "new") refreshNewFormOptions();
      if (tab === "settings") renderSettings();
    });
  });
}

/**********************
 * Load / Save Settings
 **********************/
function ensureModelArrays(m) {
  if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
}

async function loadSettings(uid) {
  const ref = settingsDocRef(uid);
  const snap = await ref.get();

  // DEFAULT SICURI
  const DEFAULT_MODELS = ["E464", "TAF", "POP", "JAZZ", "ROCK"];

  if (!snap.exists) {
    settings = {
      models: [...DEFAULT_MODELS],
      trains: {},
      scadenze: [],
      abilitazioni: []
    };

    DEFAULT_MODELS.forEach(m => {
      settings.trains[m] = [];
    });

    await ref.set(settings);
    return;
  }

  const data = snap.data() || {};

  settings = {
    models: Array.isArray(data.models) && data.models.length
    ? data.models
    : [...DEFAULT_MODELS],

    trains: data.trains || {},
    scadenze: Array.isArray(data.scadenze) ? data.scadenze : [],
    abilitazioni: Array.isArray(data.abilitazioni) ? data.abilitazioni : []
  };

  // 🔒 GARANZIA TOTALE
  settings.models.forEach(m => {
    if (!Array.isArray(settings.trains[m])) {
      settings.trains[m] = [];
    }
  });

  await ref.set(settings, { merge: true });
}

async function saveSettings(uid) {
  // normalize & sort
  settings.models = [...new Set(settings.models.map(norm).filter(Boolean))].sort(alphaSort);
  settings.models.forEach(ensureModelArrays);
  settings.scadenze = [...new Set(settings.scadenze.map(norm).filter(Boolean))].sort(alphaSort);
  settings.abilitazioni = [...new Set(settings.abilitazioni.map(norm).filter(Boolean))].sort(alphaSort);
  for (const m of settings.models) {
    settings.trains[m] = [...new Set((settings.trains[m] || []).map(norm).filter(Boolean))].sort(alphaSort);
  }

  await settingsDocRef(uid).set(settings, { merge: true });
}

/**********************
 * Activities
 **********************/
async function loadActivities(uid) {
  // Order by date desc to reduce UI work; keep up to 2000
  const snap = await activitiesColRef(uid).orderBy("date", "desc").limit(2000).get();
  activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addActivity(uid, a) {
  a.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  const ref = await activitiesColRef(uid).add(a);
  activities.unshift({ id: ref.id, ...a });
}

async function updateActivity(uid, id, patch) {
  await activitiesColRef(uid).doc(id).set(patch, { merge: true });
  const i = activities.findIndex((x) => x.id === id);
  if (i >= 0) activities[i] = { ...activities[i], ...patch };
}

async function deleteActivity(uid, id) {
  await activitiesColRef(uid).doc(id).delete();
  activities = activities.filter((x) => x.id !== id);
}

/**********************
 * Calendar
 **********************/
function buildByDate() {
  const map = {};
  for (const a of activities) {
    if (!a.date) continue;
    if (!map[a.date]) map[a.date] = [];
    map[a.date].push(a);
  }
  return map;
}

function renderCalendar() {
  $("cal-month-label").textContent = monthLabel(currentMonth);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = buildByDate();
  const grid = $("calendar-grid");
  grid.innerHTML = "";

  // header row
  const weekdays = ["L", "M", "M", "G", "V", "S", "D"];
  for (const w of weekdays) {
    const el = document.createElement("div");
    el.className = "cal-header-cell";
    el.textContent = w;
    grid.appendChild(el);
  }

  // blanks
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell";
    empty.style.visibility = "hidden";
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const items = byDate[dateStr] || [];
    const total = items.reduce((s, a) => s + (Number(a.timeDeci) || 0), 0);

    const cell = document.createElement("div");
    cell.className = "cal-cell cal-day";
    if (selectedDay === dateStr) cell.classList.add("active");

    cell.innerHTML = `
    <div class="cal-day-number">${d}</div>
    <div class="cal-day-hours">${total > 0 ? total.toFixed(1) : ""}</div>
    `;

    cell.addEventListener("click", () => {
      selectedDay = dateStr;
      showDaySummary(dateStr, byDate[dateStr] || []);
      renderCalendar(); // refresh highlight
    });

    grid.appendChild(cell);
  }

  // auto-select today if month matches and nothing selected
  if (!selectedDay) {
    const t = new Date();
    if (t.getFullYear() === year && t.getMonth() === month) {
      selectedDay = ymd(t);
      showDaySummary(selectedDay, byDate[selectedDay] || []);
      renderCalendar();
    } else {
      showDaySummary(null, []);
    }
  } else {
    showDaySummary(selectedDay, byDate[selectedDay] || []);
  }
}

function showDaySummary(dateStr, list) {
  const title = $("cal-day-title");
  const hoursEl = $("cal-day-hours");
  const tbody = $("cal-day-activities");

  if (!dateStr) {
    title.textContent = "Seleziona un giorno";
    hoursEl.textContent = "0.0";
    tbody.innerHTML = `<tr><td colspan="7">Nessuna attività</td></tr>`;
    return;
  }

  title.textContent = `Attività del ${dateStr}`;

  if (!list || list.length === 0) {
    hoursEl.textContent = "0.0";
    tbody.innerHTML = `<tr><td colspan="7">Nessuna attività</td></tr>`;
    return;
  }

  const sorted = [...list].sort((a, b) => (a.createdAt?.seconds || 0) < (b.createdAt?.seconds || 0) ? 1 : -1);
  const total = sorted.reduce((s, a) => s + (Number(a.timeDeci) || 0), 0);
  hoursEl.textContent = total.toFixed(1);

  tbody.innerHTML = "";
  for (const a of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.model || ""}</td>
    <td>${a.trainId || ""}</td>
    <td>${a.scadenza || ""}</td>
    <td>${a.abilitazione || ""}</td>
    <td>${Number(a.timeDeci || 0).toFixed(1)}</td>
    <td>${a.notes || ""}</td>
    <td>
    <button type="button" class="secondary" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" class="danger" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  }
}

$("cal-prev").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  selectedDay = null;
  renderCalendar();
});
$("cal-next").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  selectedDay = null;
  renderCalendar();
});

$("cal-day-activities").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit") {
    const a = activities.find((x) => x.id === id);
    if (a) openEditModal(a);
  }

  if (action === "delete") {
    const ok = window.confirm("Vuoi eliminare questa attività?");
    if (!ok) return;
    await deleteActivity(currentUser.uid, id);
    renderCalendar();
    renderRegistry();
  }
});

/**********************
 * New activity
 **********************/
function renderModelSelect(selectEl, modelsArr) {
  selectEl.innerHTML = "";
  for (const m of [...modelsArr].sort(alphaSort)) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    selectEl.appendChild(opt);
  }
}
function renderOptions(selectEl, arr, emptyLabel) {
  selectEl.innerHTML = "";
  if (!arr || arr.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = emptyLabel;
    opt.disabled = true;
    opt.selected = true;
    selectEl.appendChild(opt);
    return;
  }
  for (const v of [...arr].sort(alphaSort)) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  }
}

function refreshNewFormOptions() {
  if (!$("n-date").value) $("n-date").value = ymd(new Date());

  const model = $("n-model").value;
  ensureModelArrays(model);

  renderOptions(
    $("n-train"),
                settings.trains[model],
                "Nessuna matricola (aggiungi in Impostazioni)"
  );

  renderOptions(
    $("n-scadenza"),
                settings.scadenze,
                "Nessuna scadenza (aggiungi in Impostazioni)"
  );

  renderOptions(
    $("n-abilitazione"),
                settings.abilitazioni,
                "Nessuna abilitazione (aggiungi in Impostazioni)"
  );
}

$("n-model").addEventListener("change", refreshNewFormOptions);

$("form-new").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("new-msg").textContent = "";
  $("new-msg").className = "status";

  try {
    const date = $("n-date").value;
    const model = $("n-model").value;
    const trainId = $("n-train").value;
    const scadenza = $("n-scadenza").value;
    const abilitazione = $("n-abilitazione").value;
    const timeDeci = toDeci($("n-timeDeci").value);
    const notes = norm($("n-notes").value);

    if (!date || !model || !trainId || !scadenza || !abilitazione) throw new Error("Campi obbligatori mancanti.");
    if (timeDeci === null) throw new Error("Tempo non valido.");

    await addActivity(currentUser.uid, { date, model, trainId, scadenza, abilitazione, timeDeci, notes });

    $("new-msg").textContent = "Attività salvata.";
    $("new-msg").classList.add("ok");

    $("form-new").reset();
    $("n-date").value = ymd(new Date());

    renderCalendar();
    renderRegistry();
  } catch (err) {
    $("new-msg").textContent = err.message || "Errore nel salvataggio.";
    $("new-msg").classList.add("error");
  }
});

/**********************
 * Registry
 **********************/
function renderRegistryModelFilter() {
  const sel = $("r-filter-model");
  const current = sel.value || "";
  sel.innerHTML = `<option value="">Tutti</option>`;
  for (const m of [...settings.models].sort(alphaSort)) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  }
  sel.value = current;
}

function renderRegistry() {
  renderRegistryModelFilter();

  const model = norm($("r-filter-model").value);
  const trainQ = norm($("r-filter-train").value).toUpperCase();

  const list = activities
  .filter((a) => {
    let ok = true;
    if (model) ok = ok && a.model === model;
    if (trainQ) ok = ok && (a.trainId || "").toUpperCase().includes(trainQ);
    return ok;
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));

  const tbody = $("registry-rows");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">Nessuna attività.</td></tr>`;
    return;
  }

  for (const a of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.date || ""}</td>
    <td>${a.model || ""}</td>
    <td>${a.trainId || ""}</td>
    <td>${a.scadenza || ""}</td>
    <td>${a.abilitazione || ""}</td>
    <td>${Number(a.timeDeci || 0).toFixed(1)}</td>
    <td>${a.notes || ""}</td>
    <td>
    <button type="button" class="secondary" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" class="danger" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  }
}

$("r-apply").addEventListener("click", renderRegistry);
$("r-reset").addEventListener("click", () => {
  $("r-filter-model").value = "";
  $("r-filter-train").value = "";
  renderRegistry();
});

$("registry-rows").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit") {
    const a = activities.find((x) => x.id === id);
    if (a) openEditModal(a);
  }
  if (action === "delete") {
    const ok = window.confirm("Vuoi eliminare questa attività?");
    if (!ok) return;
    await deleteActivity(currentUser.uid, id);
    renderCalendar();
    renderRegistry();
  }
});

/**********************
 * Settings
 **********************/
function renderSettings() {
  // Model select for train
  const sel = $("s-train-model");
  const current = sel.value || settings.models[0] || "";
  sel.innerHTML = "";
  for (const m of settings.models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  }
  sel.value = current || settings.models[0] || "";

  // models list
  const ulModels = $("s-models-list");
  ulModels.innerHTML = "";
  for (const m of settings.models) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${m}</span><button type="button" data-action="del-model" data-model="${m}">✕</button>`;
    ulModels.appendChild(li);
  }

  renderSettingsLists();
}

function renderSettingsLists() {
  // trains list per selected model
  const m = $("s-train-model").value;
  ensureModelArrays(m);
  const ulTrains = $("s-trains-list");
  ulTrains.innerHTML = "";
  for (const t of (settings.trains[m] || []).sort(alphaSort)) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${t}</span><button type="button" data-action="del-train" data-model="${m}" data-name="${t}">✕</button>`;
    ulTrains.appendChild(li);
  }

  // global scadenze
  const ulScad = $("s-scads-list");
  ulScad.innerHTML = "";
  for (const s of (settings.scadenze || []).sort(alphaSort)) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${s}</span><button type="button" data-action="del-scad" data-name="${s}">✕</button>`;
    ulScad.appendChild(li);
  }

  // global abilitazioni
  const ulAbil = $("s-abils-list");
  ulAbil.innerHTML = "";
  for (const a of (settings.abilitazioni || []).sort(alphaSort)) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${a}</span><button type="button" data-action="del-abil" data-name="${a}">✕</button>`;
    ulAbil.appendChild(li);
  }
}

$("s-train-model").addEventListener("change", renderSettingsLists);

// add model
$("s-add-model").addEventListener("click", async () => {
  const v = norm($("s-model-name").value);
  if (!v) return;
  if (!settings.models.includes(v)) settings.models.push(v);
  settings.models.sort(alphaSort);
  ensureModelArrays(v);
  await saveSettings(currentUser.uid);
  $("s-model-name").value = "";
  renderSettings();

  // inizializza select modelli UNA VOLTA
  renderModelSelect($("n-model"), settings.models);
  $("n-model").value = settings.models[0] || "";

  refreshNewFormOptions();
  renderRegistry();
});

// add train (per model)
$("s-add-train").addEventListener("click", async () => {
  const m = $("s-train-model").value;
  const v = norm($("s-train-name").value);
  if (!m || !v) return;
  ensureModelArrays(m);
  if (!settings.trains[m].includes(v)) settings.trains[m].push(v);
  settings.trains[m].sort(alphaSort);
  await saveSettings(currentUser.uid);
  $("s-train-name").value = "";
  renderSettingsLists();
  refreshNewFormOptions();
});

// add scadenza (global)
$("s-add-scad").addEventListener("click", async () => {
  const v = norm($("s-scad-name").value);
  if (!v) return;
  if (!settings.scadenze.includes(v)) settings.scadenze.push(v);
  settings.scadenze.sort(alphaSort);
  await saveSettings(currentUser.uid);
  $("s-scad-name").value = "";
  renderSettingsLists();
  refreshNewFormOptions();
});

// add abilitazione (global)
$("s-add-abil").addEventListener("click", async () => {
  const v = norm($("s-abil-name").value);
  if (!v) return;
  if (!settings.abilitazioni.includes(v)) settings.abilitazioni.push(v);
  settings.abilitazioni.sort(alphaSort);
  await saveSettings(currentUser.uid);
  $("s-abil-name").value = "";
  renderSettingsLists();
  refreshNewFormOptions();
});

// settings delete handlers
$("tab-settings").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;

  if (action === "del-model") {
    const m = btn.dataset.model;
    const ok = window.confirm(`Eliminare il modello "${m}"? (non cancella attività già registrate)`);
    if (!ok) return;

    settings.models = settings.models.filter((x) => x !== m);
    delete settings.trains[m];
    await saveSettings(currentUser.uid);

    renderSettings();
    refreshNewFormOptions();
    return;
  }

  if (action === "del-train") {
    const m = btn.dataset.model;
    const name = btn.dataset.name;
    settings.trains[m] = (settings.trains[m] || []).filter((x) => x !== name);
    await saveSettings(currentUser.uid);
    renderSettingsLists();
    refreshNewFormOptions();
    return;
  }

  if (action === "del-scad") {
    const name = btn.dataset.name;
    settings.scadenze = (settings.scadenze || []).filter((x) => x !== name);
    await saveSettings(currentUser.uid);
    renderSettingsLists();
    refreshNewFormOptions();
    return;
  }

  if (action === "del-abil") {
    const name = btn.dataset.name;
    settings.abilitazioni = (settings.abilitazioni || []).filter((x) => x !== name);
    await saveSettings(currentUser.uid);
    renderSettingsLists();
    refreshNewFormOptions();
    return;
  }
});

/**********************
 * Edit Modal
 **********************/
function openEditModal(a) {
  $("edit-msg").textContent = "";
  $("edit-msg").className = "status";

  $("e-id").value = a.id;
  $("e-date").value = a.date || ymd(new Date());

  renderModelSelect($("e-model"), settings.models);
  $("e-model").value = a.model || settings.models[0];

  refreshEditFormOptions();
  $("e-train").value = a.trainId || $("e-train").value;
  $("e-scadenza").value = a.scadenza || $("e-scadenza").value;
  $("e-abilitazione").value = a.abilitazione || $("e-abilitazione").value;

  $("e-timeDeci").value = String(Number(a.timeDeci || 0).toFixed(1)).replace(".", ",");
  $("e-notes").value = a.notes || "";

  $("modal-overlay").classList.remove("hidden");
  $("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  $("modal-overlay").classList.add("hidden");
  $("edit-modal").classList.add("hidden");
}

function refreshEditFormOptions() {
  const model = $("e-model").value;
  ensureModelArrays(model);

  renderOptions($("e-train"), settings.trains[model], "Nessuna matricola");
  renderOptions($("e-scadenza"), settings.scadenze, "Nessuna scadenza");
  renderOptions($("e-abilitazione"), settings.abilitazioni, "Nessuna abilitazione");
}

$("e-model").addEventListener("change", refreshEditFormOptions);
$("e-cancel").addEventListener("click", closeEditModal);
$("modal-overlay").addEventListener("click", closeEditModal);

$("e-delete").addEventListener("click", async () => {
  const id = $("e-id").value;
  const ok = window.confirm("Vuoi eliminare questa attività?");
  if (!ok) return;
  await deleteActivity(currentUser.uid, id);
  closeEditModal();
  renderCalendar();
  renderRegistry();
});

$("form-edit").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("edit-msg").textContent = "";
  $("edit-msg").className = "status";

  try {
    const id = $("e-id").value;
    const date = $("e-date").value;
    const model = $("e-model").value;
    const trainId = $("e-train").value;
    const scadenza = $("e-scadenza").value;
    const abilitazione = $("e-abilitazione").value;
    const timeDeci = toDeci($("e-timeDeci").value);
    const notes = norm($("e-notes").value);

    if (!id || !date || !model || !trainId || !scadenza || !abilitazione) throw new Error("Campi mancanti.");
    if (timeDeci === null) throw new Error("Tempo non valido.");

    await updateActivity(currentUser.uid, id, { date, model, trainId, scadenza, abilitazione, timeDeci, notes });
    closeEditModal();
    renderCalendar();
    renderRegistry();
  } catch (err) {
    $("edit-msg").textContent = err.message || "Errore modifica.";
    $("edit-msg").classList.add("error");
  }
});

/**********************
 * Backup & Restore
 **********************/
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$("btn-backup").addEventListener("click", async () => {
  if (!currentUser) return;

  // reload fresh (safety)
  await loadSettings(currentUser.uid);
  await loadActivities(currentUser.uid);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
                                 settings,
                                 activities: activities.map((a) => ({
                                   id: a.id,
                                   date: a.date || "",
                                   model: a.model || "",
                                   trainId: a.trainId || "",
                                   scadenza: a.scadenza || "",
                                   abilitazione: a.abilitazione || "",
                                   timeDeci: Number(a.timeDeci || 0),
                                                                    notes: a.notes || ""
                                 }))
  };

  downloadJSON(`manutreni-backup-${currentUser.uid}-${Date.now()}.json`, backup);
});

$("btn-restore").addEventListener("click", async () => {
  if (!currentUser) return;

  const file = $("restore-file").files?.[0];
  if (!file) return alert("Seleziona un file .json");

  const ok = window.confirm("Ripristino = sovrascrive tutto (impostazioni + attività). Continuare?");
  if (!ok) return;

  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch {
    return alert("File non valido.");
  }

  if (!data || !data.settings || !Array.isArray(data.activities)) {
    return alert("Backup non compatibile.");
  }

  // 1) save settings
  settings = data.settings;
  // normalize minimal
  settings.models = Array.isArray(settings.models) ? settings.models : ["E464", "TAF", "POP", "JAZZ", "ROCK"];
  settings.trains = settings.trains || {};
  settings.scadenze = Array.isArray(settings.scadenze) ? settings.scadenze : [];
  settings.abilitazioni = Array.isArray(settings.abilitazioni) ? settings.abilitazioni : [];
  await saveSettings(currentUser.uid);

  // 2) delete all existing activities (in chunks)
  const col = activitiesColRef(currentUser.uid);
  const existing = await col.get();
  const existingDocs = existing.docs;

  async function commitBatchesDelete(docs) {
    for (let i = 0; i < docs.length; i += 450) {
      const batch = db.batch();
      const slice = docs.slice(i, i + 450);
      slice.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await commitBatchesDelete(existingDocs);

  // 3) insert imported activities (in chunks)
  async function commitBatchesInsert(list) {
    for (let i = 0; i < list.length; i += 450) {
      const batch = db.batch();
      const slice = list.slice(i, i + 450);
      slice.forEach((a) => {
        const ref = col.doc(); // new id
        batch.set(ref, {
          date: a.date || "",
          model: a.model || "",
          trainId: a.trainId || "",
          scadenza: a.scadenza || "",
          abilitazione: a.abilitazione || "",
          timeDeci: Number(a.timeDeci || 0),
                  notes: a.notes || "",
                  createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
  }
  await commitBatchesInsert(data.activities);

  // reload UI
  await loadSettings(currentUser.uid);
  await loadActivities(currentUser.uid);
  renderSettings();
  refreshNewFormOptions();
  renderRegistry();
  selectedDay = null;
  currentMonth = new Date();
  renderCalendar();

  alert("Ripristino completato.");
});

/**********************
 * Auth state
 **********************/
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    activities = [];
    selectedDay = null;
    showAuth("");
    return;
  }

  currentUser = user;
  showApp();
  $("user-email").textContent = user.email || "";

  initTabsOnce();

  try {
    await loadSettings(user.uid);
    await loadActivities(user.uid);

    // init default date
    $("n-date").value = ymd(new Date());

    renderSettings();
    refreshNewFormOptions();
    renderRegistry();

    selectedDay = null;
    currentMonth = new Date();
    renderCalendar();
  } catch (e) {
    console.error(e);
    alert("Errore inizializzazione. Apri Console per dettagli.");
  }
});
