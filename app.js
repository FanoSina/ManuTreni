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
const storage = firebase.storage();

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
function nowIso() {
  return new Date().toISOString();
}
function containsCI(text, q) {
  return (text || "").toString().toLowerCase().includes((q || "").toLowerCase());
}
function safeFileName(name) {
  return (name || "file")
  .replace(/[^\w.\-() ]+/g, "_")
  .replace(/\s+/g, "_")
  .slice(0, 120);
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
let procedures = [];

const listeners = {
  tabs: false,
  calendar: false,
  registry: false,
  settings: false,
  modal: false,
  newform: false,
  procedures: false
};

/********************************************************
 * FIRESTORE REFS
 ********************************************************/
const settingsDoc = (uid) =>
db.collection("users").doc(uid).collection("settings").doc("main");

const activitiesCol = (uid) =>
db.collection("users").doc(uid).collection("activities");

const proceduresCol = (uid) =>
db.collection("users").doc(uid).collection("procedures");

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

  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
  });

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
 * PROCEDURES CRUD + STORAGE
 ********************************************************/
async function loadProcedures(uid) {
  const snap = await proceduresCol(uid).get();
  procedures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addProcedure(p) {
  const ref = await proceduresCol(currentUser.uid).add(p);
  procedures.push({ id: ref.id, ...p });
  return ref.id;
}

async function updateProcedure(id, patch) {
  await proceduresCol(currentUser.uid).doc(id).set(patch, { merge: true });
  const i = procedures.findIndex((x) => x.id === id);
  if (i >= 0) procedures[i] = { ...procedures[i], ...patch };
}

async function deleteProcedure(id) {
  // elimina anche gli allegati su Storage (best effort)
  const p = procedures.find(x => x.id === id);
  if (p && Array.isArray(p.attachments)) {
    for (const att of p.attachments) {
      if (att && att.storagePath) {
        try { await storage.ref(att.storagePath).delete(); } catch (_) {}
      }
    }
  }
  await proceduresCol(currentUser.uid).doc(id).delete();
  procedures = procedures.filter((x) => x.id !== id);
}

async function uploadFilesToProcedure(procId, files, onProgress) {
  if (!currentUser) throw new Error("Not logged");

  const uploaded = [];

  for (const file of files) {
    const fname = safeFileName(file.name);
    const path = `users/${currentUser.uid}/procedures/${procId}/${Date.now()}_${fname}`;
    const ref = storage.ref(path);
    const task = ref.put(file, {
      contentType: file.type || "application/octet-stream"
    });

    const result = await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          if (onProgress) {
            const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
            onProgress(pct, file.name);
          }
        },
        (err) => reject(err),
              async () => {
                const url = await task.snapshot.ref.getDownloadURL();
                resolve({ url, storagePath: path });
              }
      );
    });

    uploaded.push({
      name: file.name,
      type: file.type || "",
      size: file.size || 0,
      url: result.url,
      storagePath: result.storagePath,
      createdAt: nowIso()
    });
  }

  return uploaded;
}

/********************************************************
 * TABS
 ********************************************************/
function initTabsOnce() {
  if (listeners.tabs) return;
  listeners.tabs = true;

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
      if (btn.dataset.tab === "procedures") {
        renderProceduresFilters();
        renderProceduresList();
        refreshProcedureFormOptions();
      }
    });
  });
}

/********************************************************
 * COMMON SELECT RENDER
 ********************************************************/
function renderModelSelect(sel, list) {
  sel.innerHTML = "";
  (list || []).forEach((m) => sel.appendChild(new Option(m, m)));
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

/********************************************************
 * NEW ACTIVITY FORM
 ********************************************************/
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
  if (listeners.newform) return;
  listeners.newform = true;

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
                                 createdAt: nowIso()
    };

    if (!a.date || !a.model || !a.trainId || !a.scadenza || !a.abilitazione) {
      return alert("Compila tutti i campi obbligatori.");
    }
    if (a.timeDeci === null) return alert("Tempo non valido.");

    await addActivity(a);

    $("form-new").reset();
    $("n-date").value = ymd(new Date());
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

  ["L", "M", "M", "G", "V", "S", "D"].forEach((w) => {
    const h = document.createElement("div");
    h.className = "cal-header-cell";
    h.textContent = w;
    grid.appendChild(h);
  });

  for (let i = 0; i < startWeekday; i++) {
    const e = document.createElement("div");
    e.className = "cal-cell";
    e.style.visibility = "hidden";
    grid.appendChild(e);
  }

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
      renderCalendar();
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
  if (listeners.calendar) return;
  listeners.calendar = true;

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
      const ok = confirm("Eliminare questa attività?");
      if (!ok) return;
      await deleteActivity(id);
      renderCalendar();
      renderRegistry();
    }
  });
}

/********************************************************
 * REGISTRY
 ********************************************************/
function renderRegistryModelFilter() {
  const sel = $("r-filter-model");
  const current = sel.value || "";
  sel.innerHTML = `<option value="">Tutti</option>`;
  settings.models.forEach((m) => sel.appendChild(new Option(m, m)));
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
  if (listeners.registry) return;
  listeners.registry = true;

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
      const ok = confirm("Eliminare questa attività?");
      if (!ok) return;
      await deleteActivity(id);
      renderRegistry();
      renderCalendar();
    }
  });
}

/********************************************************
 * SETTINGS
 ********************************************************/
function renderSettings() {
  $("s-models-list").innerHTML = "";
  settings.models.forEach((m) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${m}</span>`;
    $("s-models-list").appendChild(li);
  });

  const sel = $("s-train-model");
  sel.innerHTML = "";
  settings.models.forEach((m) => sel.appendChild(new Option(m, m)));
  sel.value = sel.value || settings.models[0] || "E464";

  renderSettingsLists();
}

function renderSettingsLists() {
  const model = $("s-train-model").value || settings.models[0];

  $("s-trains-list").innerHTML = "";
  (settings.trains[model] || []).forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    $("s-trains-list").appendChild(li);
  });

  $("s-scads-list").innerHTML = "";
  settings.scadenze.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s;
    $("s-scads-list").appendChild(li);
  });

  $("s-abils-list").innerHTML = "";
  settings.abilitazioni.forEach((a) => {
    const li = document.createElement("li");
    li.textContent = a;
    $("s-abils-list").appendChild(li);
  });
}

function initSettingsOnce() {
  if (listeners.settings) return;
  listeners.settings = true;

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
    refreshProcedureFormOptions();
    renderProceduresFilters();
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
    refreshProcedureFormOptions();
    renderProceduresFilters();
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
 * EDIT MODAL (attività)
 ********************************************************/
function openEditModal(a) {
  $("edit-msg").textContent = "";
  $("edit-msg").className = "status";

  $("e-id").value = a.id;
  $("e-date").value = a.date || ymd(new Date());

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
  if (listeners.modal) return;
  listeners.modal = true;

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
                                  notes: norm($("e-notes").value),
                                  updatedAt: nowIso()
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
 * PROCEDURES UI
 ********************************************************/
function refreshProcedureFormOptions() {
  renderModelSelect($("p-model"), settings.models);
  if (!$("p-model").value) $("p-model").value = settings.models[0] || "E464";

  renderOptions($("p-scadenza"), settings.scadenze, "Nessuna scadenza");
}

function renderProceduresFilters() {
  const mSel = $("pf-model");
  const sSel = $("pf-scadenza");
  const curM = mSel.value || "";
  const curS = sSel.value || "";

  mSel.innerHTML = `<option value="">Tutti</option>`;
  settings.models.forEach(m => mSel.appendChild(new Option(m, m)));
  mSel.value = curM;

  sSel.innerHTML = `<option value="">Tutte</option>`;
  settings.scadenze.forEach(s => sSel.appendChild(new Option(s, s)));
  sSel.value = curS;
}

function getFilteredProcedures() {
  const fm = norm($("pf-model").value);
  const fs = norm($("pf-scadenza").value);
  const q = norm($("pf-q").value);

  return procedures
  .filter(p => {
    let ok = true;
    if (fm) ok = ok && p.model === fm;
    if (fs) ok = ok && p.scadenza === fs;
    if (q) ok = ok && (containsCI(p.title, q) || containsCI(p.body, q));
    return ok;
  })
  .sort((a, b) => (a.updatedAt || a.createdAt || "") < (b.updatedAt || b.createdAt || "") ? 1 : -1);
}

function renderProceduresList() {
  const tbody = $("proc-rows");
  tbody.innerHTML = "";

  const list = getFilteredProcedures();
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">Nessuna procedura.</td></tr>`;
    return;
  }

  list.forEach(p => {
    const updated = (p.updatedAt || p.createdAt || "").slice(0, 10);
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${p.model || ""}</td>
    <td>${p.scadenza || ""}</td>
    <td>${p.title || ""}</td>
    <td>${updated}</td>
    <td>
    <button type="button" class="secondary" data-action="open" data-id="${p.id}">Apri</button>
    <button type="button" class="danger" data-action="del" data-id="${p.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  });
}

function setProcedureForm(p) {
  $("p-id").value = p?.id || "";
  $("p-title").value = p?.title || "";
  $("p-body").value = p?.body || "";

  refreshProcedureFormOptions();
  if (p?.model) $("p-model").value = p.model;
  if (p?.scadenza) $("p-scadenza").value = p.scadenza;

  renderProcedureAttachments(p?.attachments || []);
  $("p-delete").classList.toggle("hidden", !p?.id);
}

function clearProcedureForm() {
  $("p-id").value = "";
  $("p-title").value = "";
  $("p-body").value = "";
  $("p-file").value = "";
  $("p-upload-status").textContent = "";
  $("p-progress-wrap").classList.add("hidden");
  $("p-progress-bar").style.width = "0%";
  refreshProcedureFormOptions();
  renderProcedureAttachments([]);
  $("p-delete").classList.add("hidden");
}

function renderProcedureAttachments(list) {
  const ul = $("p-attachments");
  ul.innerHTML = "";

  if (!list || list.length === 0) {
    const li = document.createElement("li");
    li.className = "att-empty";
    li.textContent = "Nessun allegato.";
    ul.appendChild(li);
    return;
  }

  list.forEach((a, idx) => {
    const li = document.createElement("li");
    li.className = "att-item";
    li.innerHTML = `
    <div class="att-left">
    <div class="att-name">${a.name || "file"}</div>
    <div class="att-meta">${(a.type || "").slice(0, 30)} • ${a.size ? Math.round(a.size/1024) : 0} KB</div>
    <a class="att-link" href="${a.url}" target="_blank" rel="noopener">Apri</a>
    </div>
    <button type="button" class="danger" data-action="rm-att" data-idx="${idx}">Rimuovi</button>
    `;
    ul.appendChild(li);
  });
}

function initProceduresOnce() {
  if (listeners.procedures) return;
  listeners.procedures = true;

  $("pf-apply").addEventListener("click", renderProceduresList);
  $("pf-reset").addEventListener("click", () => {
    $("pf-model").value = "";
    $("pf-scadenza").value = "";
    $("pf-q").value = "";
    renderProceduresList();
  });

  $("proc-rows").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === "open") {
      const p = procedures.find(x => x.id === id);
      if (p) setProcedureForm(p);
    }

    if (action === "del") {
      const ok = confirm("Eliminare questa procedura (e gli allegati)?");
      if (!ok) return;
      await deleteProcedure(id);
      clearProcedureForm();
      renderProceduresList();
    }
  });

  $("p-clear").addEventListener("click", clearProcedureForm);

  $("form-proc").addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = norm($("p-id").value);
    const model = $("p-model").value;
    const scadenza = $("p-scadenza").value;
    const title = norm($("p-title").value);
    const body = norm($("p-body").value);

    if (!model || !scadenza || !title) {
      return alert("Modello, Scadenza e Titolo sono obbligatori.");
    }

    const existing = id ? procedures.find(x => x.id === id) : null;
    const patch = {
      model,
      scadenza,
      title,
      body,
      updatedAt: nowIso()
    };

    if (!id) {
      const newDoc = {
        ...patch,
        attachments: [],
        createdAt: nowIso()
      };
      const newId = await addProcedure(newDoc);
      const p = procedures.find(x => x.id === newId);
      setProcedureForm(p);
    } else {
      await updateProcedure(id, patch);
      const p = procedures.find(x => x.id === id);
      setProcedureForm(p);
    }

    renderProceduresList();
  });

  $("p-delete").addEventListener("click", async () => {
    const id = norm($("p-id").value);
    if (!id) return;
    const ok = confirm("Eliminare questa procedura (e gli allegati)?");
    if (!ok) return;
    await deleteProcedure(id);
    clearProcedureForm();
    renderProceduresList();
  });

  $("p-upload").addEventListener("click", async () => {
    const files = $("p-file").files;
    if (!files || files.length === 0) return alert("Seleziona almeno un file.");

    let id = norm($("p-id").value);
    if (!id) {
      // se non esiste procedura, la creiamo al volo per avere un procId
      const model = $("p-model").value;
      const scadenza = $("p-scadenza").value;
      const title = norm($("p-title").value) || "Senza titolo";
      const body = norm($("p-body").value);

      if (!model || !scadenza) return alert("Seleziona Modello e Scadenza prima di caricare.");
      const newDoc = {
        model, scadenza, title, body,
        attachments: [],
        createdAt: nowIso(),
                                 updatedAt: nowIso()
      };
      id = await addProcedure(newDoc);
      const p = procedures.find(x => x.id === id);
      setProcedureForm(p);
      renderProceduresList();
    }

    $("p-upload-status").textContent = "Upload in corso...";
    $("p-progress-wrap").classList.remove("hidden");
    $("p-progress-bar").style.width = "0%";

    try {
      const uploaded = await uploadFilesToProcedure(id, Array.from(files), (pct, name) => {
        $("p-progress-bar").style.width = `${pct}%`;
        $("p-upload-status").textContent = `Caricamento: ${pct}% (${name})`;
      });

      const p = procedures.find(x => x.id === id);
      const next = [...(p.attachments || []), ...uploaded];

      await updateProcedure(id, { attachments: next, updatedAt: nowIso() });
      $("p-file").value = "";

      $("p-upload-status").textContent = "Upload completato.";
      $("p-progress-bar").style.width = "100%";

      setProcedureForm(procedures.find(x => x.id === id));
      renderProceduresList();
    } catch (err) {
      console.error(err);
      $("p-upload-status").textContent = "Errore upload.";
      alert("Errore durante upload. Controlla regole Storage e login.");
    }
  });

  $("p-attachments").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='rm-att']");
    if (!btn) return;

    const id = norm($("p-id").value);
    if (!id) return;

    const idx = Number(btn.dataset.idx);
    const p = procedures.find(x => x.id === id);
    if (!p || !Array.isArray(p.attachments) || idx < 0 || idx >= p.attachments.length) return;

    const ok = confirm("Rimuovere questo allegato? Verrà eliminato anche da Storage.");
    if (!ok) return;

    const att = p.attachments[idx];
    if (att && att.storagePath) {
      try { await storage.ref(att.storagePath).delete(); } catch (_) {}
    }

    const next = p.attachments.filter((_, i) => i !== idx);
    await updateProcedure(id, { attachments: next, updatedAt: nowIso() });

    setProcedureForm(procedures.find(x => x.id === id));
    renderProceduresList();
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
  initProceduresOnce();

  await loadSettings(user.uid);
  await loadActivities(user.uid);
  await loadProcedures(user.uid);

  // init new activity form
  renderModelSelect($("n-model"), settings.models);
  $("n-model").value = settings.models[0] || "E464";
  $("n-date").value = ymd(new Date());
  refreshNewForm();

  // init procedures form/options
  refreshProcedureFormOptions();
  renderProceduresFilters();
  renderProceduresList();
  clearProcedureForm();

  renderSettings();
  renderRegistry();
  renderCalendar();
});
