/********************************************************
 * Firebase config
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
 * Helpers
 ********************************************************/
const $ = (id) => document.getElementById(id);
const norm = (v) => (v || "").toString().trim();
const alphaSort = (a, b) => a.localeCompare(b, "it", { sensitivity: "base" });

const nowIso = () => new Date().toISOString();
const ymd = (d) => d.toISOString().split("T")[0];

function toDeci(v) {
  const n = parseFloat(norm(v).replace(",", "."));
  return Number.isNaN(n) ? null : Math.round(n * 10) / 10;
}
function monthLabel(date) {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
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
 * Firestore paths
 ********************************************************/
const settingsRef = (uid) => db.collection("users").doc(uid).collection("settings").doc("main");
const activitiesCol = (uid) => db.collection("users").doc(uid).collection("activities");
const proceduresCol = (uid) => db.collection("users").doc(uid).collection("procedures");

/********************************************************
 * State
 ********************************************************/
let currentUser = null;
let settings = {
  models: [],
  trains: {},        // { MODEL: [matricole...] }
  scadenze: [],
  abilitazioni: []
};
let activities = []; // [{id,...}]
let procedures = []; // [{id,...}]
let currentMonth = new Date();
let selectedDay = null;

/********************************************************
 * UI: show/hide
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
 * Auth events
 ********************************************************/
$("btn-login").addEventListener("click", async () => {
  try {
    await auth.signInWithEmailAndPassword(norm($("auth-email").value), $("auth-password").value);
  } catch (e) {
    showAuth(e.message);
  }
});

$("btn-register").addEventListener("click", async () => {
  try {
    await auth.createUserWithEmailAndPassword(norm($("auth-email").value), $("auth-password").value);
  } catch (e) {
    showAuth(e.message);
  }
});

$("btn-logout").addEventListener("click", async () => {
  await auth.signOut();
});

/********************************************************
 * Tabs
 ********************************************************/
function initTabs() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));

      btn.classList.add("active");
      $(`tab-${btn.dataset.tab}`).classList.add("active");

      if (btn.dataset.tab === "calendar") renderCalendar();
      if (btn.dataset.tab === "registry") renderRegistry();
      if (btn.dataset.tab === "new") refreshNewActivityFormOptions();
      if (btn.dataset.tab === "procedures") {
        refreshProcedureFormOptions();
        renderProceduresFilters();
        renderProceduresList();
      }
      if (btn.dataset.tab === "settings") renderSettingsAll();
    });
  });
}

/********************************************************
 * Load / Save settings
 ********************************************************/
async function loadSettings(uid) {
  const snap = await settingsRef(uid).get();

  // default base
  const DEFAULT_MODELS = ["E464", "TAF", "POP", "JAZZ", "ROCK"];

  if (!snap.exists) {
    settings = {
      models: [...DEFAULT_MODELS],
      trains: {},
      scadenze: [],
      abilitazioni: []
    };
    DEFAULT_MODELS.forEach((m) => (settings.trains[m] = []));
    await settingsRef(uid).set(settings);
    return;
  }

  const data = snap.data() || {};
  settings.models = Array.isArray(data.models) && data.models.length ? data.models : [...DEFAULT_MODELS];
  settings.trains = data.trains || {};
  settings.scadenze = Array.isArray(data.scadenze) ? data.scadenze : [];
  settings.abilitazioni = Array.isArray(data.abilitazioni) ? data.abilitazioni : [];

  // normalize + unique + sort
  settings.models = [...new Set(settings.models.map(norm).filter(Boolean))].sort(alphaSort);
  settings.scadenze = [...new Set(settings.scadenze.map(norm).filter(Boolean))].sort(alphaSort);
  settings.abilitazioni = [...new Set(settings.abilitazioni.map(norm).filter(Boolean))].sort(alphaSort);

  // ensure trains array for each model
  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
    settings.trains[m] = [...new Set(settings.trains[m].map(norm).filter(Boolean))].sort(alphaSort);
  });

  await settingsRef(uid).set(settings, { merge: true });
}

async function saveSettings() {
  await settingsRef(currentUser.uid).set(settings, { merge: true });
}

/********************************************************
 * Load activities / procedures
 ********************************************************/
async function loadActivities(uid) {
  const snap = await activitiesCol(uid).get();
  activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function loadProcedures(uid) {
  const snap = await proceduresCol(uid).get();
  procedures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/********************************************************
 * Activities CRUD
 ********************************************************/
async function addActivity(data) {
  const ref = await activitiesCol(currentUser.uid).add(data);
  activities.push({ id: ref.id, ...data });
}
async function updateActivity(id, patch) {
  await activitiesCol(currentUser.uid).doc(id).set(patch, { merge: true });
  const i = activities.findIndex((a) => a.id === id);
  if (i >= 0) activities[i] = { ...activities[i], ...patch };
}
async function deleteActivity(id) {
  await activitiesCol(currentUser.uid).doc(id).delete();
  activities = activities.filter((a) => a.id !== id);
}

/********************************************************
 * Procedures CRUD + Storage
 ********************************************************/
async function addProcedure(data) {
  const ref = await proceduresCol(currentUser.uid).add(data);
  procedures.push({ id: ref.id, ...data });
  return ref.id;
}
async function updateProcedure(id, patch) {
  await proceduresCol(currentUser.uid).doc(id).set(patch, { merge: true });
  const i = procedures.findIndex((p) => p.id === id);
  if (i >= 0) procedures[i] = { ...procedures[i], ...patch };
}
async function deleteProcedure(id) {
  const p = procedures.find((x) => x.id === id);
  if (p && Array.isArray(p.attachments)) {
    for (const att of p.attachments) {
      if (att && att.storagePath) {
        try { await storage.ref(att.storagePath).delete(); } catch (_) {}
      }
    }
  }
  await proceduresCol(currentUser.uid).doc(id).delete();
  procedures = procedures.filter((p) => p.id !== id);
}

async function uploadFiles(procId, files, onProgress) {
  const uploaded = [];
  for (const file of files) {
    const fname = safeFileName(file.name);
    const path = `users/${currentUser.uid}/procedures/${procId}/${Date.now()}_${fname}`;
    const ref = storage.ref(path);

    const task = ref.put(file, { contentType: file.type || "application/octet-stream" });

    const res = await new Promise((resolve, reject) => {
      task.on("state_changed",
              (snap) => {
                const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
                onProgress?.(pct, file.name);
              },
              reject,
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
      url: res.url,
      storagePath: res.storagePath,
      createdAt: nowIso()
    });
  }
  return uploaded;
}

/********************************************************
 * Render helpers (selects)
 ********************************************************/
function setSelectOptions(sel, list, emptyLabel = "Nessuna voce") {
  sel.innerHTML = "";
  if (!list || list.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = emptyLabel;
    o.disabled = true;
    o.selected = true;
    sel.appendChild(o);
    return;
  }
  list.forEach((v) => sel.appendChild(new Option(v, v)));
}

function renderModelSelect(sel, withAll = false) {
  const cur = sel.value;
  sel.innerHTML = "";
  if (withAll) sel.appendChild(new Option("Tutti", ""));
  settings.models.forEach((m) => sel.appendChild(new Option(m, m)));
  if (withAll && cur === "") sel.value = "";
  else if (settings.models.includes(cur)) sel.value = cur;
  else sel.value = withAll ? "" : (settings.models[0] || "");
}

/********************************************************
 * New activity form
 ********************************************************/
function refreshNewActivityFormOptions() {
  renderModelSelect($("a-model"), false);

  const model = $("a-model").value || (settings.models[0] || "");
  setSelectOptions($("a-trainId"), settings.trains[model] || [], "Nessuna matricola (aggiungi in Impostazioni)");
  setSelectOptions($("a-scadenza"), settings.scadenze, "Nessuna scadenza (aggiungi in Impostazioni)");
  setSelectOptions($("a-abilitazione"), settings.abilitazioni, "Nessuna abilitazione (aggiungi in Impostazioni)");
}

function initNewActivityForm() {
  $("a-date").value = ymd(new Date());

  $("a-model").addEventListener("change", refreshNewActivityFormOptions);

  $("btn-new-clear").addEventListener("click", () => {
    $("form-new-activity").reset();
    $("a-date").value = ymd(new Date());
    refreshNewActivityFormOptions();
    $("a-status").textContent = "";
  });

  $("form-new-activity").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("a-status").textContent = "";

    const date = $("a-date").value;
    const model = $("a-model").value;
    const trainId = $("a-trainId").value;
    const scadenza = $("a-scadenza").value;
    const abilitazione = $("a-abilitazione").value;
    const timeDeci = toDeci($("a-timeDeci").value);
    const notes = norm($("a-notes").value);

    if (!date || !model || !trainId || !scadenza || !abilitazione) {
      $("a-status").textContent = "Compila tutti i campi obbligatori.";
      return;
    }
    if (timeDeci === null) {
      $("a-status").textContent = "Tempo non valido.";
      return;
    }

    await addActivity({
      date, model, trainId, scadenza, abilitazione, timeDeci, notes,
      createdAt: nowIso()
    });

    $("a-status").textContent = "Salvata.";
    $("form-new-activity").reset();
    $("a-date").value = ymd(new Date());
    refreshNewActivityFormOptions();

    // refresh views
    renderCalendar();
    renderRegistry();
  });
}

/********************************************************
 * Calendar
 ********************************************************/
function activitiesByDate() {
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

  const grid = $("calendar-grid");
  grid.innerHTML = "";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = activitiesByDate();

  // headers
  ["L", "M", "M", "G", "V", "S", "D"].forEach((w) => {
    const h = document.createElement("div");
    h.className = "cal-header-cell";
    h.textContent = w;
    grid.appendChild(h);
  });

  for (let i = 0; i < startWeekday; i++) {
    const e = document.createElement("div");
    e.className = "cal-cell ghost";
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
    <div class="cal-day-top">
    <div class="cal-day-number">${d}</div>
    <div class="cal-day-hours">${total > 0 ? total.toFixed(1) : ""}</div>
    </div>
    `;

    cell.addEventListener("click", () => {
      selectedDay = dateStr;
      renderDaySummary(dateStr);
      renderCalendar();
    });

    grid.appendChild(cell);
  }

  // keep summary synced
  if (!selectedDay) {
    // default to today if in same month, else none
    const todayStr = ymd(new Date());
    const inMonth = todayStr.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`);
    selectedDay = inMonth ? todayStr : null;
  }
  renderDaySummary(selectedDay);
}

function renderDaySummary(dateStr) {
  const tbody = $("cal-day-rows");
  tbody.innerHTML = "";

  if (!dateStr) {
    $("cal-day-title").textContent = "Seleziona un giorno";
    $("cal-day-hours").textContent = "0.0";
    tbody.innerHTML = `<tr><td colspan="7">Nessuna attività</td></tr>`;
    $("btn-day-add").disabled = true;
    return;
  }

  $("btn-day-add").disabled = false;
  $("cal-day-title").textContent = `Attività del ${dateStr}`;

  const list = activities.filter((a) => a.date === dateStr).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const total = list.reduce((s, a) => s + (Number(a.timeDeci) || 0), 0);
  $("cal-day-hours").textContent = total.toFixed(1);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">Nessuna attività</td></tr>`;
    return;
  }

  for (const a of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.model || ""}</td>
    <td>${a.trainId || ""}</td>
    <td>${a.scadenza || ""}</td>
    <td>${a.abilitazione || ""}</td>
    <td>${Number(a.timeDeci || 0).toFixed(1)}</td>
    <td>${a.notes || ""}</td>
    <td class="actions">
    <button type="button" class="secondary" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" class="danger" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  }
}

function initCalendarControls() {
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

  $("btn-day-add").addEventListener("click", () => {
    // go to new tab and prefill date
    document.querySelector('.tabs button[data-tab="new"]').click();
    if (selectedDay) $("a-date").value = selectedDay;
  });

    $("cal-day-rows").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;

      const id = btn.dataset.id;
      const action = btn.dataset.action;

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
 * Registry
 ********************************************************/
function renderRegistry() {
  // model filter options
  renderModelSelect($("r-filter-model"), true);

  const model = norm($("r-filter-model").value);
  const trainQ = norm($("r-filter-trainId").value).toUpperCase();
  const from = norm($("r-from").value);
  const to = norm($("r-to").value);

  const list = activities
  .filter((a) => {
    let ok = true;
    if (model) ok = ok && a.model === model;
    if (trainQ) ok = ok && (a.trainId || "").toUpperCase().includes(trainQ);
    if (from) ok = ok && (a.date || "") >= from;
    if (to) ok = ok && (a.date || "") <= to;
    return ok;
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));

  const tbody = $("registry-rows");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">Nessuna attività</td></tr>`;
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
    <td class="actions">
    <button type="button" class="secondary" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" class="danger" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  }
}

function initRegistryControls() {
  $("r-apply").addEventListener("click", renderRegistry);
  $("r-reset").addEventListener("click", () => {
    $("r-filter-model").value = "";
    $("r-filter-trainId").value = "";
    $("r-from").value = "";
    $("r-to").value = "";
    renderRegistry();
  });

  $("registry-rows").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

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
 * Edit modal (activities)
 ********************************************************/
function openEditModal(a) {
  $("edit-status").textContent = "";

  $("e-id").value = a.id;
  $("e-date").value = a.date || ymd(new Date());

  renderModelSelect($("e-model"), false);
  $("e-model").value = a.model || (settings.models[0] || "");

  refreshEditModalOptions();

  $("e-trainId").value = a.trainId || $("e-trainId").value;
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

function refreshEditModalOptions() {
  const model = $("e-model").value || (settings.models[0] || "");
  setSelectOptions($("e-trainId"), settings.trains[model] || [], "Nessuna matricola");
  setSelectOptions($("e-scadenza"), settings.scadenze, "Nessuna scadenza");
  setSelectOptions($("e-abilitazione"), settings.abilitazioni, "Nessuna abilitazione");
}

function initEditModal() {
  $("e-cancel").addEventListener("click", closeEditModal);
  $("modal-overlay").addEventListener("click", closeEditModal);

  $("e-model").addEventListener("change", refreshEditModalOptions);

  $("e-delete").addEventListener("click", async () => {
    const id = $("e-id").value;
    const ok = confirm("Eliminare questa attività?");
    if (!ok) return;
    await deleteActivity(id);
    closeEditModal();
    renderCalendar();
    renderRegistry();
  });

  $("form-edit-activity").addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = $("e-id").value;
    const patch = {
      date: $("e-date").value,
                                           model: $("e-model").value,
                                           trainId: $("e-trainId").value,
                                           scadenza: $("e-scadenza").value,
                                           abilitazione: $("e-abilitazione").value,
                                           timeDeci: toDeci($("e-timeDeci").value),
                                           notes: norm($("e-notes").value),
                                           updatedAt: nowIso()
    };

    if (!patch.date || !patch.model || !patch.trainId || !patch.scadenza || !patch.abilitazione) {
      $("edit-status").textContent = "Campi mancanti.";
      return;
    }
    if (patch.timeDeci === null) {
      $("edit-status").textContent = "Tempo non valido.";
      return;
    }

    await updateActivity(id, patch);
    closeEditModal();
    renderCalendar();
    renderRegistry();
  });
}

/********************************************************
 * Settings UI
 ********************************************************/
function renderSettingsAll() {
  // models list
  const ul = $("s-models-list");
  ul.innerHTML = "";
  settings.models.forEach((m) => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span>${m}</span>
    <button type="button" class="danger" data-action="del-model" data-model="${m}">✕</button>
    `;
    ul.appendChild(li);
  });

  // train model select
  const sel = $("s-train-model");
  sel.innerHTML = "";
  settings.models.forEach((m) => sel.appendChild(new Option(m, m)));
  if (!sel.value) sel.value = settings.models[0] || "";

  renderSettingsTrainsList();
  renderSettingsScadenzeList();
  renderSettingsAbilitazioniList();

  // refresh other selects
  refreshNewActivityFormOptions();
  refreshProcedureFormOptions();
  renderProceduresFilters();
  renderRegistry();
}

function renderSettingsTrainsList() {
  const model = $("s-train-model").value || (settings.models[0] || "");
  const ul = $("s-trains-list");
  ul.innerHTML = "";

  const list = (settings.trains[model] || []).slice().sort(alphaSort);
  if (list.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">Nessuna matricola</span>`;
    ul.appendChild(li);
    return;
  }

  list.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span>${t}</span>
    <button type="button" class="danger" data-action="del-train" data-model="${model}" data-train="${t}">✕</button>
    `;
    ul.appendChild(li);
  });
}

function renderSettingsScadenzeList() {
  const ul = $("s-scads-list");
  ul.innerHTML = "";

  const list = settings.scadenze.slice().sort(alphaSort);
  if (list.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">Nessuna scadenza</span>`;
    ul.appendChild(li);
    return;
  }

  list.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span>${s}</span>
    <button type="button" class="danger" data-action="del-scad" data-name="${s}">✕</button>
    `;
    ul.appendChild(li);
  });
}

function renderSettingsAbilitazioniList() {
  const ul = $("s-abils-list");
  ul.innerHTML = "";

  const list = settings.abilitazioni.slice().sort(alphaSort);
  if (list.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">Nessuna abilitazione</span>`;
    ul.appendChild(li);
    return;
  }

  list.forEach((a) => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span>${a}</span>
    <button type="button" class="danger" data-action="del-abil" data-name="${a}">✕</button>
    `;
    ul.appendChild(li);
  });
}

function initSettingsControls() {
  $("s-train-model").addEventListener("change", renderSettingsTrainsList);

  $("s-add-model").addEventListener("click", async () => {
    const m = norm($("s-model-name").value);
    if (!m) return;
    if (settings.models.includes(m)) return;

    settings.models.push(m);
    settings.models.sort(alphaSort);
    if (!settings.trains[m]) settings.trains[m] = [];

    await saveSettings();
    $("s-model-name").value = "";
    renderSettingsAll();
  });

  $("s-add-train").addEventListener("click", async () => {
    const model = $("s-train-model").value;
    const t = norm($("s-train-name").value);
    if (!model || !t) return;

    if (!Array.isArray(settings.trains[model])) settings.trains[model] = [];
    if (!settings.trains[model].includes(t)) settings.trains[model].push(t);
    settings.trains[model].sort(alphaSort);

    await saveSettings();
    $("s-train-name").value = "";
    renderSettingsAll();
  });

  $("s-add-scad").addEventListener("click", async () => {
    const s = norm($("s-scad-name").value);
    if (!s) return;
    if (!settings.scadenze.includes(s)) settings.scadenze.push(s);
    settings.scadenze.sort(alphaSort);

    await saveSettings();
    $("s-scad-name").value = "";
    renderSettingsAll();
  });

  $("s-add-abil").addEventListener("click", async () => {
    const a = norm($("s-abil-name").value);
    if (!a) return;
    if (!settings.abilitazioni.includes(a)) settings.abilitazioni.push(a);
    settings.abilitazioni.sort(alphaSort);

    await saveSettings();
    $("s-abil-name").value = "";
    renderSettingsAll();
  });

  // delegated deletes
  $("tab-settings").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "del-model") {
      const model = btn.dataset.model;
      const ok = confirm(`Rimuovere il modello ${model}? (Non cancella dati già registrati)`);
      if (!ok) return;

      settings.models = settings.models.filter((m) => m !== model);
      delete settings.trains[model];

      await saveSettings();
      renderSettingsAll();
      return;
    }

    if (action === "del-train") {
      const model = btn.dataset.model;
      const train = btn.dataset.train;
      settings.trains[model] = (settings.trains[model] || []).filter((x) => x !== train);
      await saveSettings();
      renderSettingsAll();
      return;
    }

    if (action === "del-scad") {
      const name = btn.dataset.name;
      settings.scadenze = settings.scadenze.filter((x) => x !== name);
      await saveSettings();
      renderSettingsAll();
      return;
    }

    if (action === "del-abil") {
      const name = btn.dataset.name;
      settings.abilitazioni = settings.abilitazioni.filter((x) => x !== name);
      await saveSettings();
      renderSettingsAll();
      return;
    }
  });
}

/********************************************************
 * Procedures
 ********************************************************/
function refreshProcedureFormOptions() {
  renderModelSelect($("p-model"), false);
  setSelectOptions($("p-scadenza"), settings.scadenze, "Nessuna scadenza");
}

function renderProceduresFilters() {
  // model filter
  renderModelSelect($("pf-model"), true);

  // scadenza filter
  const cur = $("pf-scadenza").value;
  $("pf-scadenza").innerHTML = "";
  $("pf-scadenza").appendChild(new Option("Tutte", ""));
  settings.scadenze.forEach((s) => $("pf-scadenza").appendChild(new Option(s, s)));
  $("pf-scadenza").value = settings.scadenze.includes(cur) ? cur : "";
}

function getFilteredProcedures() {
  const fm = norm($("pf-model").value);
  const fs = norm($("pf-scadenza").value);
  const q = norm($("pf-q").value);

  return procedures
  .filter((p) => {
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
    tbody.innerHTML = `<tr><td colspan="5">Nessuna procedura</td></tr>`;
    return;
  }

  list.forEach((p) => {
    const upd = (p.updatedAt || p.createdAt || "").slice(0, 10);
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${p.model || ""}</td>
    <td>${p.scadenza || ""}</td>
    <td>${p.title || ""}</td>
    <td>${upd}</td>
    <td class="actions">
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

  $("p-upload-status").textContent = "";
  $("p-progress-wrap").classList.add("hidden");
  $("p-progress-bar").style.width = "0%";
  $("p-files").value = "";
}

function clearProcedureForm() {
  setProcedureForm(null);
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

function initProceduresControls() {
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
      const p = procedures.find((x) => x.id === id);
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

  $("form-procedure").addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = norm($("p-id").value);
    const model = $("p-model").value;
    const scadenza = $("p-scadenza").value;
    const title = norm($("p-title").value);
    const body = norm($("p-body").value);

    if (!model || !scadenza || !title) {
      alert("Modello, Scadenza e Titolo sono obbligatori.");
      return;
    }

    if (!id) {
      const newId = await addProcedure({
        model, scadenza, title, body,
        attachments: [],
        createdAt: nowIso(),
                                       updatedAt: nowIso()
      });
      setProcedureForm(procedures.find((x) => x.id === newId));
    } else {
      await updateProcedure(id, { model, scadenza, title, body, updatedAt: nowIso() });
      setProcedureForm(procedures.find((x) => x.id === id));
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
    const files = $("p-files").files;
    if (!files || files.length === 0) {
      alert("Seleziona almeno un file.");
      return;
    }

    let id = norm($("p-id").value);

    // if no procedure yet, create it
    if (!id) {
      const model = $("p-model").value;
      const scadenza = $("p-scadenza").value;
      const title = norm($("p-title").value) || "Senza titolo";
      const body = norm($("p-body").value);

      if (!model || !scadenza) {
        alert("Seleziona Modello e Scadenza prima di caricare.");
        return;
      }

      id = await addProcedure({
        model, scadenza, title, body,
        attachments: [],
        createdAt: nowIso(),
                              updatedAt: nowIso()
      });

      setProcedureForm(procedures.find((x) => x.id === id));
      renderProceduresList();
    }

    $("p-upload-status").textContent = "Upload in corso...";
    $("p-progress-wrap").classList.remove("hidden");
    $("p-progress-bar").style.width = "0%";

    try {
      const uploaded = await uploadFiles(id, Array.from(files), (pct, name) => {
        $("p-progress-bar").style.width = `${pct}%`;
        $("p-upload-status").textContent = `Caricamento ${pct}% (${name})`;
      });

      const p = procedures.find((x) => x.id === id);
      const next = [...(p.attachments || []), ...uploaded];

      await updateProcedure(id, { attachments: next, updatedAt: nowIso() });
      setProcedureForm(procedures.find((x) => x.id === id));
      renderProceduresList();

      $("p-upload-status").textContent = "Upload completato.";
      $("p-progress-bar").style.width = "100%";
    } catch (err) {
      console.error(err);
      alert("Errore upload. Controlla Storage rules e che tu sia loggato.");
      $("p-upload-status").textContent = "Errore upload.";
    }
  });

  $("p-attachments").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='rm-att']");
    if (!btn) return;

    const id = norm($("p-id").value);
    if (!id) return;

    const idx = Number(btn.dataset.idx);
    const p = procedures.find((x) => x.id === id);
    if (!p || !Array.isArray(p.attachments)) return;

    const att = p.attachments[idx];
    if (!att) return;

    const ok = confirm("Rimuovere allegato? (verrà eliminato anche da Storage)");
    if (!ok) return;

    if (att.storagePath) {
      try { await storage.ref(att.storagePath).delete(); } catch (_) {}
    }

    const next = p.attachments.filter((_, i) => i !== idx);
    await updateProcedure(id, { attachments: next, updatedAt: nowIso() });
    setProcedureForm(procedures.find((x) => x.id === id));
    renderProceduresList();
  });
}

/********************************************************
 * Backup / Restore
 ********************************************************/
async function doBackup() {
  $("backup-status").textContent = "Creo backup...";

  // fresh read to avoid stale
  await loadSettings(currentUser.uid);
  await loadActivities(currentUser.uid);
  await loadProcedures(currentUser.uid);

  const payload = {
    version: 1,
    exportedAt: nowIso(),
    settings,
    activities: activities.map(({ id, ...rest }) => rest),
    procedures: procedures.map(({ id, ...rest }) => rest)
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `manutreni-backup-${ymd(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  $("backup-status").textContent = "Backup scaricato.";
}

async function doRestore() {
  const file = $("restore-file").files?.[0];
  if (!file) {
    alert("Seleziona un file JSON di backup.");
    return;
  }

  const ok = confirm("Ripristino: verranno reinseriti settings/attività/procedure. Vuoi continuare?");
  if (!ok) return;

  $("backup-status").textContent = "Leggo backup...";
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    alert("JSON non valido.");
    return;
  }

  if (!data || !data.settings) {
    alert("Backup non valido (mancano settings).");
    return;
  }

  $("backup-status").textContent = "Ripristino settings...";
  settings = data.settings;

  // normalize
  settings.models = [...new Set((settings.models || []).map(norm).filter(Boolean))].sort(alphaSort);
  settings.scadenze = [...new Set((settings.scadenze || []).map(norm).filter(Boolean))].sort(alphaSort);
  settings.abilitazioni = [...new Set((settings.abilitazioni || []).map(norm).filter(Boolean))].sort(alphaSort);
  settings.trains = settings.trains || {};
  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
    settings.trains[m] = [...new Set(settings.trains[m].map(norm).filter(Boolean))].sort(alphaSort);
  });

  await saveSettings();

  // activities restore
  $("backup-status").textContent = "Ripristino attività...";
  const acts = Array.isArray(data.activities) ? data.activities : [];
  // batch write (max 500 per batch)
  for (let i = 0; i < acts.length; i += 400) {
    const batch = db.batch();
    const slice = acts.slice(i, i + 400);
    slice.forEach((a) => {
      const ref = activitiesCol(currentUser.uid).doc();
      batch.set(ref, a);
    });
    await batch.commit();
  }

  // procedures restore
  $("backup-status").textContent = "Ripristino procedure...";
  const procs = Array.isArray(data.procedures) ? data.procedures : [];
  for (let i = 0; i < procs.length; i += 400) {
    const batch = db.batch();
    const slice = procs.slice(i, i + 400);
    slice.forEach((p) => {
      const ref = proceduresCol(currentUser.uid).doc();
      batch.set(ref, p);
    });
    await batch.commit();
  }

  // reload in-memory
  await loadActivities(currentUser.uid);
  await loadProcedures(currentUser.uid);

  $("backup-status").textContent = "Ripristino completato.";
  renderSettingsAll();
  renderRegistry();
  renderCalendar();
  refreshProcedureFormOptions();
  renderProceduresFilters();
  renderProceduresList();
}

/********************************************************
 * Hook backup buttons
 ********************************************************/
function initBackupControls() {
  $("btn-backup").addEventListener("click", doBackup);
  $("btn-restore").addEventListener("click", doRestore);
}

/********************************************************
 * Init after login
 ********************************************************/
auth.onAuthStateChanged(async (u) => {
  if (!u) {
    currentUser = null;
    showAuth("");
    return;
  }

  currentUser = u;
  $("user-email").textContent = u.email || "";

  showApp();

  await loadSettings(u.uid);
  await loadActivities(u.uid);
  await loadProcedures(u.uid);

  initTabs();
  initNewActivityForm();
  initCalendarControls();
  initRegistryControls();
  initEditModal();
  initSettingsControls();
  initProceduresControls();
  initBackupControls();

  // initial renders
  refreshNewActivityFormOptions();
  refreshProcedureFormOptions();
  renderProceduresFilters();
  renderProceduresList();
  renderSettingsAll();
  renderRegistry();
  renderCalendar();
});
