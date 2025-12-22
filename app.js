/***********************
 * Firebase (Auth + Firestore) - NO Storage
 ***********************/
const firebaseConfig = {
  apiKey: "AIzaSyCqLfhYJLru8RVmVhOCmYWo1MDzNaOQGpQ",
  authDomain: "manutrain-aced7.firebaseapp.com",
  projectId: "manutrain-aced7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/***********************
 * Helpers
 ***********************/
const $ = (id) => document.getElementById(id);
const norm = (v) => (v ?? "").toString().trim();
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
  return (text || "").toLowerCase().includes((q || "").toLowerCase());
}

/***********************
 * Firestore paths
 ***********************/
const userDoc = (uid) => db.collection("users").doc(uid);
const settingsDoc = (uid) => userDoc(uid).collection("settings").doc("main");
const activitiesCol = (uid) => userDoc(uid).collection("activities");
const proceduresCol = (uid) => userDoc(uid).collection("procedures");

/***********************
 * State
 ***********************/
let currentUser = null;

let settings = {
  models: [],
  trains: {},       // { MODEL: [matricole...] }
  scadenze: [],
  abilitazioni: []
};

let activities = []; // {id,...}
let procedures = []; // {id,...}

let currentMonth = new Date();
let selectedDay = null;

/***********************
 * AUTH UI
 ***********************/
function showAuth(msg = "") {
  $("auth-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("auth-msg").textContent = msg;
}
function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

/***********************
 * Load / Save
 ***********************/
async function ensureDefaultSettings(uid) {
  const snap = await settingsDoc(uid).get();
  const DEFAULT_MODELS = ["E464", "TAF", "POP", "JAZZ", "ROCK"];

  if (!snap.exists) {
    const base = {
      models: [...DEFAULT_MODELS],
      trains: {},
      scadenze: [],
      abilitazioni: []
    };
    DEFAULT_MODELS.forEach((m) => (base.trains[m] = []));
    await settingsDoc(uid).set(base);
  }
}

async function loadSettings(uid) {
  await ensureDefaultSettings(uid);
  const snap = await settingsDoc(uid).get();
  const data = snap.data() || {};

  // IMPORTANTISSIMO: niente sort() -> l'ordine è quello salvato
  settings.models = Array.isArray(data.models) ? data.models.map(norm).filter(Boolean) : [];
  settings.trains = data.trains || {};
  settings.scadenze = Array.isArray(data.scadenze) ? data.scadenze.map(norm).filter(Boolean) : [];
  settings.abilitazioni = Array.isArray(data.abilitazioni) ? data.abilitazioni.map(norm).filter(Boolean) : [];

  // dedupe preservando ordine
  settings.models = dedupePreserve(settings.models);
  settings.scadenze = dedupePreserve(settings.scadenze);
  settings.abilitazioni = dedupePreserve(settings.abilitazioni);

  // assicura array trains per modello e dedupe preservando ordine
  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
    settings.trains[m] = dedupePreserve(settings.trains[m].map(norm).filter(Boolean));
  });

  // salva normalizzato
  await settingsDoc(uid).set(settings, { merge: true });
}

function dedupePreserve(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const k = norm(v);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

async function saveSettings() {
  await settingsDoc(currentUser.uid).set(settings, { merge: true });
}

async function loadActivities(uid) {
  const snap = await activitiesCol(uid).get();
  activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadProcedures(uid) {
  const snap = await proceduresCol(uid).get();
  procedures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadAll() {
  await loadSettings(currentUser.uid);
  await loadActivities(currentUser.uid);
  await loadProcedures(currentUser.uid);
}

/***********************
 * Tabs
 ***********************/
function initTabs() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));

      btn.classList.add("active");
      $(`tab-${btn.dataset.tab}`).classList.add("active");

      // refresh view on entry
      if (btn.dataset.tab === "calendar") renderCalendar();
      if (btn.dataset.tab === "new") refreshNewActivityFormOptions();
      if (btn.dataset.tab === "registry") renderRegistry();
      if (btn.dataset.tab === "procedures") {
        refreshProcedureFormOptions();
        renderProceduresFilters();
        renderProceduresList();
      }
      if (btn.dataset.tab === "settings") renderSettingsAll();
    });
  });
}

/***********************
 * Select helpers
 ***********************/
function setSelectOptions(sel, list, emptyLabel = "Nessuna voce") {
  const cur = sel.value;
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
  if (list.includes(cur)) sel.value = cur;
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

/***********************
 * New activity
 ***********************/
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
    $("a-status").textContent = "";
    refreshNewActivityFormOptions();
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

    await activitiesCol(currentUser.uid).add({
      date, model, trainId, scadenza, abilitazione, timeDeci, notes,
      createdAt: nowIso()
    });

    await loadActivities(currentUser.uid);
    $("a-status").textContent = "Salvata.";
    $("form-new-activity").reset();
    $("a-date").value = ymd(new Date());
    refreshNewActivityFormOptions();

    renderCalendar();
    renderRegistry();
  });
}

/***********************
 * Calendar
 ***********************/
function activitiesByDate() {
  const map = {};
  for (const a of activities) {
    if (!a.date) continue;
    (map[a.date] ||= []).push(a);
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
      renderCalendar(); // highlight
    });

    grid.appendChild(cell);
  }

  if (!selectedDay) {
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
    return;
  }

  $("cal-day-title").textContent = `Attività del ${dateStr}`;
  const list = activities
  .filter((a) => a.date === dateStr)
  .sort((a, b) => (a.createdAt || "") < (b.createdAt || "") ? 1 : -1);

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
        await activitiesCol(currentUser.uid).doc(id).delete();
        await loadActivities(currentUser.uid);
        renderCalendar();
        renderRegistry();
      }
    });
}

/***********************
 * Registry
 ***********************/
function renderRegistry() {
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
  .sort((a, b) => (a.date || "") < (b.date || "") ? 1 : -1);

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
      await activitiesCol(currentUser.uid).doc(id).delete();
      await loadActivities(currentUser.uid);
      renderRegistry();
      renderCalendar();
    }
  });
}

/***********************
 * Edit modal (activities)
 ***********************/
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
    await activitiesCol(currentUser.uid).doc(id).delete();
    await loadActivities(currentUser.uid);
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

    await activitiesCol(currentUser.uid).doc(id).set(patch, { merge: true });
    await loadActivities(currentUser.uid);
    closeEditModal();
    renderCalendar();
    renderRegistry();
  });
}

/***********************
 * Drag & Drop (solo maniglia ☰)
 ***********************/
const dragState = {
  listId: null,
  fromIndex: null,
  draggingValue: null
};

function enableDragOnlyFromHandle(ul) {
  // abilita draggable SOLO se l'utente inizia dalla maniglia
  ul.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    const li = handle.closest("li[data-value]");
    if (!li) return;
    li.draggable = true;
  }, { passive: true });

  ul.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li[data-value]");
    if (!li) return;

    const handle = e.target.closest(".drag-handle");
    // se non parte dalla maniglia, blocca
    if (!handle) {
      e.preventDefault();
      return;
    }

    const ulId = ul.id;
    dragState.listId = ulId;
    dragState.draggingValue = li.dataset.value;

    const siblings = [...ul.querySelectorAll("li[data-value]")];
    dragState.fromIndex = siblings.findIndex((x) => x.dataset.value === dragState.draggingValue);

    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragState.draggingValue); } catch {}
  });

  ul.addEventListener("dragend", (e) => {
    const li = e.target.closest("li[data-value]");
    if (li) {
      li.classList.remove("dragging");
      li.draggable = false; // torna bloccato
    }
    ul.querySelectorAll("li.over").forEach((x) => x.classList.remove("over"));
    dragState.listId = null;
    dragState.fromIndex = null;
    dragState.draggingValue = null;
  });

  ul.addEventListener("dragover", (e) => {
    if (dragState.listId !== ul.id) return;
    e.preventDefault();
    const li = e.target.closest("li[data-value]");
    if (!li) return;
    ul.querySelectorAll("li.over").forEach((x) => x.classList.remove("over"));
    li.classList.add("over");
    e.dataTransfer.dropEffect = "move";
  });

  ul.addEventListener("drop", async (e) => {
    if (dragState.listId !== ul.id) return;
    e.preventDefault();

    const targetLi = e.target.closest("li[data-value]");
    if (!targetLi) return;

    const siblings = [...ul.querySelectorAll("li[data-value]")];
    const toIndex = siblings.findIndex((x) => x.dataset.value === targetLi.dataset.value);

    if (dragState.fromIndex === null || toIndex < 0) return;
    if (dragState.fromIndex === toIndex) return;

    await handleReorder(ul.id, dragState.fromIndex, toIndex);

    ul.querySelectorAll("li.over").forEach((x) => x.classList.remove("over"));
  });
}

function moveItem(arr, from, to) {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

async function handleReorder(listId, fromIndex, toIndex) {
  // MODELS
  if (listId === "s-models-list") {
    settings.models = moveItem(settings.models, fromIndex, toIndex);
    await saveSettings();
    await loadSettings(currentUser.uid);
    renderSettingsAll();
    return;
  }

  // SCADENZE
  if (listId === "s-scads-list") {
    settings.scadenze = moveItem(settings.scadenze, fromIndex, toIndex);
    await saveSettings();
    await loadSettings(currentUser.uid);
    renderSettingsAll();
    return;
  }

  // ABILITAZIONI
  if (listId === "s-abils-list") {
    settings.abilitazioni = moveItem(settings.abilitazioni, fromIndex, toIndex);
    await saveSettings();
    await loadSettings(currentUser.uid);
    renderSettingsAll();
    return;
  }

  // TRAINS (per modello selezionato)
  if (listId === "s-trains-list") {
    const model = $("s-train-model").value || settings.models[0] || "";
    if (!model) return;
    const arr = settings.trains[model] || [];
    settings.trains[model] = moveItem(arr, fromIndex, toIndex);
    await saveSettings();
    await loadSettings(currentUser.uid);
    renderSettingsAll();
    return;
  }
}

/***********************
 * Settings
 ***********************/
function renderSettingsAll() {
  // MODELS
  const ulModels = $("s-models-list");
  ulModels.innerHTML = "";
  settings.models.forEach((m) => {
    const li = document.createElement("li");
    li.dataset.value = m;
    li.innerHTML = `
    <div class="li-left">
    <span class="drag-handle" title="Trascina per ordinare">☰</span>
    <span class="li-text">${m}</span>
    </div>
    <button type="button" class="danger" data-action="del-model" data-model="${m}">✕</button>
    `;
    ulModels.appendChild(li);
  });

  // train model select
  const sel = $("s-train-model");
  const curModel = sel.value;
  sel.innerHTML = "";
  settings.models.forEach((m) => sel.appendChild(new Option(m, m)));
  if (settings.models.includes(curModel)) sel.value = curModel;
  else sel.value = settings.models[0] || "";

  renderSettingsTrainsList();
  renderSettingsScadenzeList();
  renderSettingsAbilitazioniList();

  // refresh selects elsewhere
  refreshNewActivityFormOptions();
  refreshProcedureFormOptions();
  renderProceduresFilters();
  renderProceduresList();
  renderRegistry();
  renderCalendar();

  // DnD enable (una volta per render: è ok)
  enableDragOnlyFromHandle(ulModels);
  enableDragOnlyFromHandle($("s-trains-list"));
  enableDragOnlyFromHandle($("s-scads-list"));
  enableDragOnlyFromHandle($("s-abils-list"));
}

function renderSettingsTrainsList() {
  const model = $("s-train-model").value || (settings.models[0] || "");
  const ul = $("s-trains-list");
  ul.innerHTML = "";

  const list = (settings.trains[model] || []);
  if (list.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">Nessuna matricola</span>`;
    ul.appendChild(li);
    return;
  }

  list.forEach((t) => {
    const li = document.createElement("li");
    li.dataset.value = t;
    li.innerHTML = `
    <div class="li-left">
    <span class="drag-handle" title="Trascina per ordinare">☰</span>
    <span class="li-text">${t}</span>
    </div>
    <button type="button" class="danger" data-action="del-train" data-model="${model}" data-train="${t}">✕</button>
    `;
    ul.appendChild(li);
  });
}

function renderSettingsScadenzeList() {
  const ul = $("s-scads-list");
  ul.innerHTML = "";

  const list = settings.scadenze;
  if (list.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">Nessuna scadenza</span>`;
    ul.appendChild(li);
    return;
  }

  list.forEach((s) => {
    const li = document.createElement("li");
    li.dataset.value = s;
    li.innerHTML = `
    <div class="li-left">
    <span class="drag-handle" title="Trascina per ordinare">☰</span>
    <span class="li-text">${s}</span>
    </div>
    <button type="button" class="danger" data-action="del-scad" data-name="${s}">✕</button>
    `;
    ul.appendChild(li);
  });
}

function renderSettingsAbilitazioniList() {
  const ul = $("s-abils-list");
  ul.innerHTML = "";

  const list = settings.abilitazioni;
  if (list.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="muted">Nessuna abilitazione</span>`;
    ul.appendChild(li);
    return;
  }

  list.forEach((a) => {
    const li = document.createElement("li");
    li.dataset.value = a;
    li.innerHTML = `
    <div class="li-left">
    <span class="drag-handle" title="Trascina per ordinare">☰</span>
    <span class="li-text">${a}</span>
    </div>
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

    settings.models.push(m); // append -> ordine scelto dall'utente
    if (!settings.trains[m]) settings.trains[m] = [];

    await saveSettings();
    await loadSettings(currentUser.uid);
    $("s-model-name").value = "";
    renderSettingsAll();
  });

  $("s-add-train").addEventListener("click", async () => {
    const model = $("s-train-model").value;
    const t = norm($("s-train-name").value);
    if (!model || !t) return;

    if (!Array.isArray(settings.trains[model])) settings.trains[model] = [];
    if (!settings.trains[model].includes(t)) settings.trains[model].push(t); // append

    await saveSettings();
    await loadSettings(currentUser.uid);
    $("s-train-name").value = "";
    renderSettingsAll();
  });

  $("s-add-scad").addEventListener("click", async () => {
    const s = norm($("s-scad-name").value);
    if (!s) return;
    if (!settings.scadenze.includes(s)) settings.scadenze.push(s); // append

    await saveSettings();
    await loadSettings(currentUser.uid);
    $("s-scad-name").value = "";
    renderSettingsAll();
  });

  $("s-add-abil").addEventListener("click", async () => {
    const a = norm($("s-abil-name").value);
    if (!a) return;
    if (!settings.abilitazioni.includes(a)) settings.abilitazioni.push(a); // append

    await saveSettings();
    await loadSettings(currentUser.uid);
    $("s-abil-name").value = "";
    renderSettingsAll();
  });

  $("tab-settings").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "del-model") {
      const model = btn.dataset.model;
      const ok = confirm(`Rimuovere il modello ${model}?`);
      if (!ok) return;

      settings.models = settings.models.filter((m) => m !== model);
      delete settings.trains[model];

      await saveSettings();
      await loadSettings(currentUser.uid);
      renderSettingsAll();
      return;
    }

    if (action === "del-train") {
      const model = btn.dataset.model;
      const train = btn.dataset.train;
      settings.trains[model] = (settings.trains[model] || []).filter((x) => x !== train);

      await saveSettings();
      await loadSettings(currentUser.uid);
      renderSettingsAll();
      return;
    }

    if (action === "del-scad") {
      const name = btn.dataset.name;
      settings.scadenze = settings.scadenze.filter((x) => x !== name);

      await saveSettings();
      await loadSettings(currentUser.uid);
      renderSettingsAll();
      return;
    }

    if (action === "del-abil") {
      const name = btn.dataset.name;
      settings.abilitazioni = settings.abilitazioni.filter((x) => x !== name);

      await saveSettings();
      await loadSettings(currentUser.uid);
      renderSettingsAll();
      return;
    }
  });
}

/***********************
 * Procedures (text only)
 ***********************/
function refreshProcedureFormOptions() {
  renderModelSelect($("p-model"), false);
  setSelectOptions($("p-scadenza"), settings.scadenze, "Nessuna scadenza");
}

function renderProceduresFilters() {
  renderModelSelect($("pf-model"), true);
  setSelectOptions($("pf-scadenza"), ["", ...settings.scadenze], ""); // trick: gestiamo manuale sotto
  // ricrea bene "Tutte"
  const cur = $("pf-scadenza").value;
  $("pf-scadenza").innerHTML = "";
  $("pf-scadenza").appendChild(new Option("Tutte", ""));
  settings.scadenze.forEach((s) => $("pf-scadenza").appendChild(new Option(s, s)));
  if (settings.scadenze.includes(cur)) $("pf-scadenza").value = cur;
  else $("pf-scadenza").value = "";
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

function setProcedureForm(p) {
  $("p-id").value = p?.id || "";
  $("p-title").value = p?.title || "";
  $("p-body").value = p?.body || "";

  refreshProcedureFormOptions();
  if (p?.model) $("p-model").value = p.model;
  if (p?.scadenza) $("p-scadenza").value = p.scadenza;

  $("p-delete").classList.toggle("hidden", !p?.id);
  $("p-status").textContent = "";
}

function clearProcedureForm() {
  setProcedureForm(null);
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
      const ok = confirm("Eliminare questa procedura?");
      if (!ok) return;
      await proceduresCol(currentUser.uid).doc(id).delete();
      await loadProcedures(currentUser.uid);
      clearProcedureForm();
      renderProceduresList();
    }
  });

  $("p-clear").addEventListener("click", clearProcedureForm);

  $("form-procedure").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("p-status").textContent = "";

    const id = norm($("p-id").value);
    const model = $("p-model").value;
    const scadenza = $("p-scadenza").value;
    const title = norm($("p-title").value);
    const body = norm($("p-body").value);

    if (!model || !scadenza || !title) {
      $("p-status").textContent = "Modello, Scadenza e Titolo sono obbligatori.";
      return;
    }

    if (!id) {
      const ref = await proceduresCol(currentUser.uid).add({
        model, scadenza, title, body,
        createdAt: nowIso(),
                                                           updatedAt: nowIso()
      });
      await loadProcedures(currentUser.uid);
      const created = procedures.find((x) => x.id === ref.id);
      setProcedureForm(created);
      $("p-status").textContent = "Procedura salvata.";
    } else {
      await proceduresCol(currentUser.uid).doc(id).set({
        model, scadenza, title, body,
        updatedAt: nowIso()
      }, { merge: true });

      await loadProcedures(currentUser.uid);
      const updated = procedures.find((x) => x.id === id);
      setProcedureForm(updated);
      $("p-status").textContent = "Procedura aggiornata.";
    }

    renderProceduresList();
  });

  $("p-delete").addEventListener("click", async () => {
    const id = norm($("p-id").value);
    if (!id) return;
    const ok = confirm("Eliminare questa procedura?");
    if (!ok) return;

    await proceduresCol(currentUser.uid).doc(id).delete();
    await loadProcedures(currentUser.uid);
    clearProcedureForm();
    renderProceduresList();
  });
}

/***********************
 * Backup / Restore (JSON)
 ***********************/
async function doBackup() {
  $("backup-status").textContent = "Creo backup...";

  await loadAll();

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

  const ok = confirm("Ripristino: verranno inseriti settings/attività/procedure. Continuare?");
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

  $("backup-status").textContent = "Ripristino impostazioni...";
  settings = data.settings;

  // normalize preservando ordine
  settings.models = dedupePreserve((settings.models || []).map(norm).filter(Boolean));
  settings.scadenze = dedupePreserve((settings.scadenze || []).map(norm).filter(Boolean));
  settings.abilitazioni = dedupePreserve((settings.abilitazioni || []).map(norm).filter(Boolean));
  settings.trains = settings.trains || {};
  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) settings.trains[m] = [];
    settings.trains[m] = dedupePreserve(settings.trains[m].map(norm).filter(Boolean));
  });

  await saveSettings();

  $("backup-status").textContent = "Ripristino attività...";
  const acts = Array.isArray(data.activities) ? data.activities : [];
  for (let i = 0; i < acts.length; i += 400) {
    const batch = db.batch();
    acts.slice(i, i + 400).forEach((a) => batch.set(activitiesCol(currentUser.uid).doc(), a));
    await batch.commit();
  }

  $("backup-status").textContent = "Ripristino procedure...";
  const procs = Array.isArray(data.procedures) ? data.procedures : [];
  for (let i = 0; i < procs.length; i += 400) {
    const batch = db.batch();
    procs.slice(i, i + 400).forEach((p) => batch.set(proceduresCol(currentUser.uid).doc(), p));
    await batch.commit();
  }

  await loadAll();

  $("backup-status").textContent = "Ripristino completato.";
  renderSettingsAll();
  renderRegistry();
  renderCalendar();
  refreshProcedureFormOptions();
  renderProceduresFilters();
  renderProceduresList();
}

function initBackupControls() {
  $("btn-backup").addEventListener("click", doBackup);
  $("btn-restore").addEventListener("click", doRestore);
}

/***********************
 * Auth events
 ***********************/
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

/***********************
 * Boot
 ***********************/
auth.onAuthStateChanged(async (u) => {
  if (!u) {
    currentUser = null;
    showAuth("");
    return;
  }

  currentUser = u;
  $("user-email").textContent = u.email || "";
  showApp();

  await loadAll();

  initTabs();
  initNewActivityForm();
  initCalendarControls();
  initRegistryControls();
  initEditModal();
  initSettingsControls();
  initProceduresControls();
  initBackupControls();

  refreshNewActivityFormOptions();
  refreshProcedureFormOptions();
  renderProceduresFilters();
  renderProceduresList();
  renderSettingsAll();
  renderRegistry();
  renderCalendar();
});
