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
const $ = (id) => document.getElementById(id);
const norm = (v) => (v || "").toString().trim();
const alphaSort = (a, b) => a.localeCompare(b, "it", { sensitivity: "base" });

function toDeci(v) {
  const n = parseFloat(norm(v).replace(",", "."));
  return Number.isNaN(n) ? null : Math.round(n * 10) / 10;
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

let listenersAttached = {
  modelNew: false,
  registry: false,
  calendar: false,
  settings: false,
  modal: false,
  tabs: false
};

/********************************************************
 * FIRESTORE REFS
 ********************************************************/
const settingsDoc = (uid) =>
db.collection("users").doc(uid).collection("settings").doc("main");

const activitiesCol = (uid) =>
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
 * LOAD & SAVE SETTINGS
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
    DEFAULT_MODELS.forEach((m) => (settings.trains[m] = []));
    await ref.set(settings);
    return;
  }

  const data = snap.data() || {};
  settings.models =
  Array.isArray(data.models) && data.models.length ? data.models : [...DEFAULT_MODELS];

  settings.trains = data.trains || {};
  settings.scadenze = Array.isArray(data.scadenze) ? data.scadenze : [];
  settings.abilitazioni = Array.isArray(data.abilitazioni) ? data.abilitazioni : [];

  // garantisci array per ogni modello
  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
  });

    // normalizza/sort
    settings.models = [...new Set(settings.models.map(norm).filter(Boolean))].sort(alphaSort);
    settings.scadenze = [...new Set(settings.scadenze.map(norm).filter(Boolean))].sort(alphaSort);
    settings.abilitazioni = [...new Set(settings.abilitazioni.map(norm).filter(Boolean))].sort(alphaSort);
    for (const m of settings.models) {
      settings.trains[m] = [...new Set((settings.trains[m] || []).map(norm).filter(Boolean))].sort(alphaSort);
    }

    await ref.set(settings, { merge: true });
}

async function saveSettings() {
  if (!currentUser) throw new Error("User not authenticated");
  await settingsDoc(currentUser.uid).set(settings, { merge: true });
}

/********************************************************
 * ACTIVITIES CRUD
 ********************************************************/
async function loadActivities(uid) {
  const snap = await activitiesCol(uid).get();
  activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addActivity(a) {
  const ref = await activitiesCol(currentUser.uid).add(a);
  activities.push({ id: ref.id, ...a });
}

async function updateActivity(id, patch) {
  await activitiesCol(currentUser.uid).doc(id).set(patch, { merge: true });
  const i = activities.findIndex((x) => x.id === id);
  if (i >= 0) activities[i] = { ...activities[i], ...patch };
}

async function deleteActivity(id) {
  await activitiesCol(currentUser.uid).doc(id).delete();
  activities = activities.filter((x) => x.id !== id);
}

/********************************************************
 * TABS
 ********************************************************/
function initTabsOnce() {
  if (listenersAttached.tabs) return;
  listenersAttached.tabs = true;

  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));

      btn.classList.add("active");
      $(`tab-${btn.dataset.tab}`).classList.add("active");

      if (btn.dataset.tab === "calendar") renderCalendar();
      if (btn.dataset.tab === "registry") renderRegistry();
      if (btn.dataset.tab === "new") refreshNewForm();
      if (btn.dataset.tab === "settings") renderSettings();
    });
  });
}

/********************************************************
 * NEW ACTIVITY FORM
 ********************************************************/
function renderModelSelect(sel, list) {
  sel.innerHTML = "";
  list.forEach((m) => sel.appendChild(new Option(m, m)));
}

function renderOptions(sel, list, emptyLabel) {
  sel.innerHTML = "";
  if (!list || list.length === 0) {
    const o = new Option(emptyLabel, "");
    o.disabled = true;
    o.selected = true;
    sel.appendChild(o);
    return;
  }
  list.forEach((v) => sel.appendChild(new Option(v, v)));
}

function refreshNewForm() {
  if (!$("n-date").value) $("n-date").value = ymd(new Date());

  let model = $("n-model").value;
  if (!model || !settings.models.includes(model)) {
    model = settings.models[0] || "E464";
    $("n-model").value = model;
  }

  renderOptions($("n-train"), settings.trains[model] || [], "Nessuna matricola");
  renderOptions($("n-scadenza"), settings.scadenze, "Nessuna scadenza");
  renderOptions($("n-abilitazione"), settings.abilitazioni, "Nessuna abilitazione");
}

function initNewFormOnce() {
  if (listenersAttached.modelNew) return;
  listenersAttached.modelNew = true;

  $("n-model").addEventListener("change", refreshNewForm);

  $("form-new").addEventListener("submit", async (e) => {
    e.preventDefault();

    const a = {
      date: $("n-date").value,
                                 model: $("n-model").value,
                                 trainId: $("n-train").value,
                                 scadenza: $("n-scadenza").value,
                                 abilitazione: $("n-abilitazione").value,
                                 timeDeci: toDeci($("n-timeDeci").value),
                                 notes: norm($("n-notes").value),
                                 createdAt: new Date().toISOString()
    };

    if (!a.date || !a.model || !a.trainId || !a.scadenza || !a.abilitazione) {
      return alert("Compila tutti i campi obbligatori.");
    }
    if (a.timeDeci === null) return alert("Tempo non valido (es. 0.5, 1.2).");

    await addActivity(a);

    $("form-new").reset();
    $("n-date").value = ymd(new Date());

    // mantieni modello corrente
    refreshNewForm();
    renderCalendar();
    renderRegistry();
  });
}

/********************************************************
 * CALENDAR
 ********************************************************/
function buildByDate() {
  const byDate = {};
  activities.forEach((a) => {
    if (!a.date) return;
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });
  return byDate;
}

function renderCalendar() {
  $("cal-month-label").textContent = monthLabel(currentMonth);

  const grid = $("calendar-grid");
  grid.innerHTML = "";

  const byDate = buildByDate();

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // header giorni
  ["L", "M", "M", "G", "V", "S", "D"].forEach((w) => {
    const h = document.createElement("div");
    h.className = "cal-header-cell";
    h.textContent = w;
    grid.appendChild(h);
  });

  // vuoti
  for (let i = 0; i < startWeekday; i++) {
    const e = document.createElement("div");
    e.className = "cal-cell";
    e.style.visibility = "hidden";
    grid.appendChild(e);
  }

  // giorni
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const list = byDate[dateStr] || [];
    const total = list.reduce((s, a) => s + (Number(a.timeDeci) || 0), 0);

    const cell = document.createElement("div");
    cell.className = "cal-cell cal-day";
    if (selectedDay === dateStr) cell.classList.add("active");

    cell.innerHTML = `
    <div class="cal-day-number">${d}</div>
    <div class="cal-day-hours">${total > 0 ? total.toFixed(1) : ""}</div>
    `;

    cell.addEventListener("click", () => {
      selectedDay = dateStr;
      showDaySummary(dateStr, list);
      renderCalendar(); // evidenzia selezione
    });

    grid.appendChild(cell);
  }

  if (!selectedDay) {
    showDaySummary(null, []);
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

  const total = list.reduce((s, a) => s + (Number(a.timeDeci) || 0), 0);
  hoursEl.textContent = total.toFixed(1);

  tbody.innerHTML = "";
  list
  .slice()
  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  .forEach((a) => {
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
  });
}

function initCalendarOnce() {
  if (listenersAttached.calendar) return;
  listenersAttached.calendar = true;

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

  // delega azioni nella tabella del giorno
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
      const ok = confirm("Eliminare questa attività?");
      if (!ok) return;
      await deleteActivity(id);
      renderCalendar();
      renderRegistry();
    }
  });
}

/********************************************************
 * REGISTRY (✅ RIPARATO)
 ********************************************************/
function renderRegistryModelFilter() {
  const sel = $("r-filter-model");
  const current = sel.value || "";
  sel.innerHTML = `<option value="">Tutti</option>`;
  settings.models.forEach((m) => {
    sel.appendChild(new Option(m, m));
  });
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

  list.forEach((a) => {
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
  });
}

function initRegistryOnce() {
  if (listenersAttached.registry) return;
  listenersAttached.registry = true;

  $("r-apply").addEventListener("click", renderRegistry);

  $("r-reset").addEventListener("click", () => {
    $("r-filter-model").value = "";
    $("r-filter-train").value = "";
    renderRegistry();
  });

  // azioni edit/delete
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
      const ok = confirm("Eliminare questa attività?");
      if (!ok) return;
      await deleteActivity(id);
      renderRegistry();
      renderCalendar();
    }
  });
}

/********************************************************
 * SETTINGS (salva davvero)
 ********************************************************/
function renderSettings() {
  // lista modelli (solo visuale)
  $("s-models-list").innerHTML = "";
  settings.models.forEach((m) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${m}</span>`;
    $("s-models-list").appendChild(li);
  });

  // select modello matricole
  const sel = $("s-train-model");
  sel.innerHTML = "";
  settings.models.forEach((m) => sel.appendChild(new Option(m, m)));
  sel.value = sel.value || settings.models[0] || "E464";

  renderSettingsLists();
}

function renderSettingsLists() {
  const model = $("s-train-model").value || settings.models[0];

  // matricole
  $("s-trains-list").innerHTML = "";
  (settings.trains[model] || []).forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    $("s-trains-list").appendChild(li);
  });

  // scadenze
  $("s-scads-list").innerHTML = "";
  settings.scadenze.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    $("s-scads-list").appendChild(li);
  });

  // abilitazioni
  $("s-abils-list").innerHTML = "";
  settings.abilitazioni.forEach((a) => {
    const li = document.createElement("li");
    li.textContent = a;
    $("s-abils-list").appendChild(li);
  });
}

function initSettingsOnce() {
  if (listenersAttached.settings) return;
  listenersAttached.settings = true;

  $("s-train-model").addEventListener("change", renderSettingsLists);

  $("s-add-train").addEventListener("click", async () => {
    const model = $("s-train-model").value;
    const v = norm($("s-train-name").value);
    if (!model || !v) return;

    if (!Array.isArray(settings.trains[model])) settings.trains[model] = [];
    if (!settings.trains[model].includes(v)) settings.trains[model].push(v);
    settings.trains[model].sort(alphaSort);

    await saveSettings();
    $("s-train-name").value = "";
    renderSettingsLists();
    refreshNewForm();
  });

  $("s-add-scad").addEventListener("click", async () => {
    const v = norm($("s-scad-name").value);
    if (!v) return;

    if (!settings.scadenze.includes(v)) settings.scadenze.push(v);
    settings.scadenze.sort(alphaSort);

    await saveSettings();
    $("s-scad-name").value = "";
    renderSettingsLists();
    refreshNewForm();
  });

  $("s-add-abil").addEventListener("click", async () => {
    const v = norm($("s-abil-name").value);
    if (!v) return;

    if (!settings.abilitazioni.includes(v)) settings.abilitazioni.push(v);
    settings.abilitazioni.sort(alphaSort);

    await saveSettings();
    $("s-abil-name").value = "";
    renderSettingsLists();
    refreshNewForm();
  });
}

/********************************************************
 * EDIT MODAL (modifica/elimina)
 ********************************************************/
function openEditModal(a) {
  $("edit-msg").textContent = "";
  $("edit-msg").className = "status";

  $("e-id").value = a.id;
  $("e-date").value = a.date || ymd(new Date());

  // modello
  renderModelSelect($("e-model"), settings.models);
  $("e-model").value = a.model || settings.models[0];

  refreshEditOptions();

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

function refreshEditOptions() {
  const model = $("e-model").value;
  renderOptions($("e-train"), settings.trains[model] || [], "Nessuna matricola");
  renderOptions($("e-scadenza"), settings.scadenze, "Nessuna scadenza");
  renderOptions($("e-abilitazione"), settings.abilitazioni, "Nessuna abilitazione");
}

function initModalOnce() {
  if (listenersAttached.modal) return;
  listenersAttached.modal = true;

  $("e-model").addEventListener("change", refreshEditOptions);

  $("e-cancel").addEventListener("click", closeEditModal);
  $("modal-overlay").addEventListener("click", closeEditModal);

  $("e-delete").addEventListener("click", async () => {
    const id = $("e-id").value;
    const ok = confirm("Eliminare questa attività?");
    if (!ok) return;
    await deleteActivity(id);
    closeEditModal();
    renderCalendar();
    renderRegistry();
  });

  $("form-edit").addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = $("e-id").value;
    const patch = {
      date: $("e-date").value,
                                  model: $("e-model").value,
                                  trainId: $("e-train").value,
                                  scadenza: $("e-scadenza").value,
                                  abilitazione: $("e-abilitazione").value,
                                  timeDeci: toDeci($("e-timeDeci").value),
                                  notes: norm($("e-notes").value)
    };

    if (!patch.date || !patch.model || !patch.trainId || !patch.scadenza || !patch.abilitazione) {
      return alert("Campi mancanti.");
    }
    if (patch.timeDeci === null) return alert("Tempo non valido.");

    await updateActivity(id, patch);
    closeEditModal();
    renderCalendar();
    renderRegistry();
  });
}

/********************************************************
 * INIT AFTER LOGIN
 ********************************************************/
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    showAuth("");
    return;
  }

  currentUser = user;
  showApp();
  $("user-email").textContent = user.email || "";

  initTabsOnce();
  initCalendarOnce();
  initRegistryOnce();
  initSettingsOnce();
  initModalOnce();
  initNewFormOnce();

  await loadSettings(user.uid);
  await loadActivities(user.uid);

  // init new form selects (una volta)
  renderModelSelect($("n-model"), settings.models);
  $("n-model").value = settings.models[0] || "E464";

  $("n-date").value = ymd(new Date());
  refreshNewForm();

  renderSettings();
  renderRegistry();
  renderCalendar();
});
