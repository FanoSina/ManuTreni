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

function norm(str) {
  return (str || "").toString().trim();
}
function toDeci(input) {
  const s = norm(input).replace(",", ".");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}
function ymd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function monthLabel(dateObj) {
  return dateObj.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}
function alphaSort(a, b) {
  return a.localeCompare(b, "it", { sensitivity: "base" });
}

/**********************
 * State
 **********************/
const DEFAULT_MODELS = ["E464", "TAF", "POP", "JAZZ", "ROCK"];

let currentUser = null;
let currentMonth = new Date();
let selectedDay = null;

let settings = {
  models: [...DEFAULT_MODELS],
  trains: {},       // model -> [name]
  scadenze: {},     // model -> [name]
  abilitazioni: {}  // model -> [name]
};

let activities = []; // {id, date, model, trainId, scadenza, abilitazione, timeDeci, notes}

/**********************
 * Firestore paths
 **********************/
function settingsDocRef(uid) {
  return db.collection("users").doc(uid).collection("settings").doc("main");
}
function activitiesColRef(uid) {
  return db.collection("users").doc(uid).collection("activities");
}

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
 * Auth handlers
 **********************/
$("btn-login").addEventListener("click", async () => {
  $("auth-msg").textContent = "";
  try {
    await auth.signInWithEmailAndPassword(norm($("auth-email").value), $("auth-password").value);
  } catch (e) {
    $("auth-msg").textContent = e.message;
  }
});

$("btn-register").addEventListener("click", async () => {
  $("auth-msg").textContent = "";
  try {
    await auth.createUserWithEmailAndPassword(norm($("auth-email").value), $("auth-password").value);
  } catch (e) {
    $("auth-msg").textContent = e.message;
  }
});

$("btn-logout").addEventListener("click", async () => {
  await auth.signOut();
});

/**********************
 * Tabs
 **********************/
function initTabs() {
  const btns = document.querySelectorAll(".tabs button");
  const tabs = document.querySelectorAll(".tab");

  btns.forEach((b) => {
    b.addEventListener("click", () => {
      const tab = b.dataset.tab;
      btns.forEach((x) => x.classList.remove("active"));
      tabs.forEach((x) => x.classList.remove("active"));

      b.classList.add("active");
      $(`tab-${tab}`).classList.add("active");

      // refresh views
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
async function loadSettings(uid) {
  const ref = settingsDocRef(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    // create defaults
    settings = {
      models: [...DEFAULT_MODELS],
      trains: {},
      scadenze: {},
      abilitazioni: {}
    };
    await ref.set(settings, { merge: true });
    return;
  }

  const data = snap.data() || {};
  settings = {
    models: Array.isArray(data.models) && data.models.length ? data.models : [...DEFAULT_MODELS],
    trains: data.trains || {},
    scadenze: data.scadenze || {},
    abilitazioni: data.abilitazioni || {}
  };

  // ensure maps for all models
  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
    if (!Array.isArray(settings.scadenze[m])) settings.scadenze[m] = [];
    if (!Array.isArray(settings.abilitazioni[m])) settings.abilitazioni[m] = [];
  });
}

async function saveSettings(uid) {
  const ref = settingsDocRef(uid);
  // sort everything alphabetically
  settings.models = [...new Set(settings.models.map(norm).filter(Boolean))].sort(alphaSort);
  settings.models.forEach((m) => {
    settings.trains[m] = [...new Set((settings.trains[m] || []).map(norm).filter(Boolean))].sort(alphaSort);
    settings.scadenze[m] = [...new Set((settings.scadenze[m] || []).map(norm).filter(Boolean))].sort(alphaSort);
    settings.abilitazioni[m] = [...new Set((settings.abilitazioni[m] || []).map(norm).filter(Boolean))].sort(alphaSort);
  });

  await ref.set(settings, { merge: true });
}

/**********************
 * Load Activities
 **********************/
async function loadActivities(uid) {
  // carichiamo fino a 2000 attività ordinate per data desc (sufficiente per un gestionale personale)
  const snap = await activitiesColRef(uid).orderBy("date", "desc").limit(2000).get();
  activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**********************
 * Activity CRUD
 **********************/
async function addActivity(uid, a) {
  a.createdAt = firebase.firestore.FieldValue.serverTimestamp();
  const docRef = await activitiesColRef(uid).add(a);
  activities.unshift({ id: docRef.id, ...a, createdAt: new Date().toISOString() });
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
function buildActivitiesByDate() {
  const map = {};
  for (const a of activities) {
    if (!a.date) continue;
    if (!map[a.date]) map[a.date] = [];
    map[a.date].push(a);
  }
  return map;
}

function renderCalendar() {
  const grid = $("calendar-grid");
  const label = $("cal-month-label");
  label.textContent = monthLabel(currentMonth);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = buildActivitiesByDate();

  grid.innerHTML = "";

  // headers
  const weekdays = ["L", "M", "M", "G", "V", "S", "D"];
  for (const w of weekdays) {
    const h = document.createElement("div");
    h.className = "cal-header-cell";
    h.textContent = w;
    grid.appendChild(h);
  }

  // empty before day 1
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell";
    empty.style.visibility = "hidden";
    grid.appendChild(empty);
  }

  // days
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
      showDaySummary(dateStr, items);
      renderCalendar(); // refresh highlight
    });

    grid.appendChild(cell);
  }

  // if nothing selected, pick today in current month (optional)
  if (!selectedDay) {
    const today = new Date();
    if (today.getFullYear() === year && today.getMonth() === month) {
      selectedDay = ymd(today);
      const items = byDate[selectedDay] || [];
      showDaySummary(selectedDay, items);
      renderCalendar();
    } else {
      showDaySummary(null, []);
    }
  } else {
    const items = byDate[selectedDay] || [];
    showDaySummary(selectedDay, items);
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
  let total = 0;
  tbody.innerHTML = "";

  for (const a of sorted) {
    total += Number(a.timeDeci) || 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.model || ""}</td>
    <td>${a.trainId || ""}</td>
    <td>${a.scadenza || ""}</td>
    <td>${a.abilitazione || ""}</td>
    <td>${Number(a.timeDeci).toFixed(1)}</td>
    <td>${a.notes || ""}</td>
    <td>
    <button type="button" class="secondary" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" class="danger" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  }

  hoursEl.textContent = total.toFixed(1);
}

// month nav
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

// day actions
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
 * New activity form
 **********************/
function renderModelSelect(selectEl, modelsArr) {
  selectEl.innerHTML = "";
  for (const m of modelsArr.sort(alphaSort)) {
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
  // models
  renderModelSelect($("n-model"), settings.models);

  // set today if empty
  if (!$("n-date").value) $("n-date").value = ymd(new Date());

  const model = $("n-model").value || settings.models[0];

  renderOptions($("n-train"), settings.trains[model] || [], "Nessuna matricola (aggiungi in Impostazioni)");
  renderOptions($("n-scadenza"), settings.scadenze[model] || [], "Nessuna scadenza (aggiungi in Impostazioni)");
  renderOptions($("n-abilitazione"), settings.abilitazioni[model] || [], "Nessuna abilitazione (aggiungi in Impostazioni)");
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

    if (!date || !model || !trainId || !scadenza || !abilitazione) {
      throw new Error("Campi obbligatori mancanti.");
    }
    if (timeDeci === null) {
      throw new Error("Tempo non valido.");
    }

    await addActivity(currentUser.uid, {
      date,
      model,
      trainId,
      scadenza,
      abilitazione,
      timeDeci,
      notes
    });

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
  sel.innerHTML = `<option value="">Tutti</option>`;
  for (const m of settings.models.sort(alphaSort)) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    sel.appendChild(opt);
  }
}

function renderRegistry() {
  renderRegistryModelFilter();

  const model = norm($("r-filter-model").value);
  const trainQ = norm($("r-filter-train").value).toUpperCase();

  const list = activities.filter((a) => {
    let ok = true;
    if (model) ok = ok && a.model === model;
    if (trainQ) ok = ok && (a.trainId || "").toUpperCase().includes(trainQ);
    return ok;
  }).sort((a, b) => (a.date < b.date ? 1 : -1));

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
 * Settings UI
 **********************/
function ensureModelMaps(m) {
  if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
  if (!Array.isArray(settings.scadenze[m])) settings.scadenze[m] = [];
  if (!Array.isArray(settings.abilitazioni[m])) settings.abilitazioni[m] = [];
}

function renderSettings() {
  // populate model selectors
  const modelSelectors = [$("s-train-model"), $("s-scad-model"), $("s-abil-model")];
  for (const sel of modelSelectors) {
    sel.innerHTML = "";
    for (const m of settings.models.sort(alphaSort)) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    }
  }

  // models list
  const ulModels = $("s-models-list");
  ulModels.innerHTML = "";
  for (const m of settings.models.sort(alphaSort)) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${m}</span><button type="button" data-action="del-model" data-model="${m}">✕</button>`;
    ulModels.appendChild(li);
  }

  // render lists for selected model
  renderSettingsLists();
}

function renderSettingsLists() {
  const modelTrain = $("s-train-model").value;
  const modelScad = $("s-scad-model").value;
  const modelAbil = $("s-abil-model").value;

  ensureModelMaps(modelTrain);
  ensureModelMaps(modelScad);
  ensureModelMaps(modelAbil);

  const ulTrains = $("s-trains-list");
  ulTrains.innerHTML = "";
  for (const t of (settings.trains[modelTrain] || []).sort(alphaSort)) {
    const li = document.createElement("li");
    li.innerHTML = `<span><small>${modelTrain}</small> — ${t}</span><button type="button" data-action="del-train" data-model="${modelTrain}" data-name="${t}">✕</button>`;
    ulTrains.appendChild(li);
  }

  const ulScads = $("s-scads-list");
  ulScads.innerHTML = "";
  for (const s of (settings.scadenze[modelScad] || []).sort(alphaSort)) {
    const li = document.createElement("li");
    li.innerHTML = `<span><small>${modelScad}</small> — ${s}</span><button type="button" data-action="del-scad" data-model="${modelScad}" data-name="${s}">✕</button>`;
    ulScads.appendChild(li);
  }

  const ulAbils = $("s-abils-list");
  ulAbils.innerHTML = "";
  for (const a of (settings.abilitazioni[modelAbil] || []).sort(alphaSort)) {
    const li = document.createElement("li");
    li.innerHTML = `<span><small>${modelAbil}</small> — ${a}</span><button type="button" data-action="del-abil" data-model="${modelAbil}" data-name="${a}">✕</button>`;
    ulAbils.appendChild(li);
  }
}

$("s-train-model").addEventListener("change", renderSettingsLists);
$("s-scad-model").addEventListener("change", renderSettingsLists);
$("s-abil-model").addEventListener("change", renderSettingsLists);

// add model
$("s-add-model").addEventListener("click", async () => {
  const v = norm($("s-model-name").value);
  if (!v) return;
  if (!settings.models.includes(v)) settings.models.push(v);
  ensureModelMaps(v);
  await saveSettings(currentUser.uid);
  $("s-model-name").value = "";
  renderSettings();
  refreshNewFormOptions();
});

// add train
$("s-add-train").addEventListener("click", async () => {
  const m = $("s-train-model").value;
  const v = norm($("s-train-name").value);
  if (!m || !v) return;
  ensureModelMaps(m);
  if (!settings.trains[m].includes(v)) settings.trains[m].push(v);
  await saveSettings(currentUser.uid);
  $("s-train-name").value = "";
  renderSettingsLists();
  refreshNewFormOptions();
});

// add scadenza
$("s-add-scad").addEventListener("click", async () => {
  const m = $("s-scad-model").value;
  const v = norm($("s-scad-name").value);
  if (!m || !v) return;
  ensureModelMaps(m);
  if (!settings.scadenze[m].includes(v)) settings.scadenze[m].push(v);
  await saveSettings(currentUser.uid);
  $("s-scad-name").value = "";
  renderSettingsLists();
  refreshNewFormOptions();
});

// add abilitazione
$("s-add-abil").addEventListener("click", async () => {
  const m = $("s-abil-model").value;
  const v = norm($("s-abil-name").value);
  if (!m || !v) return;
  ensureModelMaps(m);
  if (!settings.abilitazioni[m].includes(v)) settings.abilitazioni[m].push(v);
  await saveSettings(currentUser.uid);
  $("s-abil-name").value = "";
  renderSettingsLists();
  refreshNewFormOptions();
});

// delete handlers (event delegation)
$("tab-settings").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;

  if (action === "del-model") {
    const m = btn.dataset.model;
    const ok = window.confirm(`Eliminare il modello "${m}" e le sue liste?`);
    if (!ok) return;

    settings.models = settings.models.filter((x) => x !== m);
    delete settings.trains[m];
    delete settings.scadenze[m];
    delete settings.abilitazioni[m];

    await saveSettings(currentUser.uid);
    renderSettings();
    refreshNewFormOptions();
    renderRegistry();
    return;
  }

  const m = btn.dataset.model;
  const name = btn.dataset.name;

  if (action === "del-train") {
    settings.trains[m] = (settings.trains[m] || []).filter((x) => x !== name);
    await saveSettings(currentUser.uid);
    renderSettingsLists();
    refreshNewFormOptions();
  }

  if (action === "del-scad") {
    settings.scadenze[m] = (settings.scadenze[m] || []).filter((x) => x !== name);
    await saveSettings(currentUser.uid);
    renderSettingsLists();
    refreshNewFormOptions();
  }

  if (action === "del-abil") {
    settings.abilitazioni[m] = (settings.abilitazioni[m] || []).filter((x) => x !== name);
    await saveSettings(currentUser.uid);
    renderSettingsLists();
    refreshNewFormOptions();
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

  // models
  renderModelSelect($("e-model"), settings.models);
  $("e-model").value = a.model || settings.models[0];

  refreshEditFormOptions(); // fill dependent
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
  renderOptions($("e-train"), settings.trains[model] || [], "Nessuna matricola");
  renderOptions($("e-scadenza"), settings.scadenze[model] || [], "Nessuna scadenza");
  renderOptions($("e-abilitazione"), settings.abilitazioni[model] || [], "Nessuna abilitazione");
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
 * Init after login
 **********************/
async function initAppForUser(user) {
  currentUser = user;
  $("user-email").textContent = user.email || "";

  // settings + activities
  await loadSettings(user.uid);
  await loadActivities(user.uid);

  // init ui
  initTabs();
  renderSettings();
  refreshNewFormOptions();
  renderRegistry();

  // reset calendar selection
  selectedDay = null;
  currentMonth = new Date();
  renderCalendar();
}

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

  showApp();
  try {
    await initAppForUser(user);
  } catch (e) {
    // if something goes wrong, show message but keep app visible
    console.error(e);
    alert("Errore inizializzazione app. Guarda console.");
  }
});

/**********************
 * First load defaults
 **********************/
document.addEventListener("DOMContentLoaded", () => {
  // defaults
  $("n-date").value = ymd(new Date());
});
