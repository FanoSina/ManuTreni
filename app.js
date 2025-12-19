/***********************
 * FIREBASE CONFIG
 ***********************/
const firebaseConfig = {
  apiKey: "AIzaSyCqLfhYJLru8RVmVhOCmYWo1MDzNaOQGpQ",
  authDomain: "manutrain-aced7.firebaseapp.com",
  projectId: "manutrain-aced7",
  storageBucket: "manutrain-aced7.firebasestorage.app",
  messagingSenderId: "1031834557198",
  appId: "1:1031834557198:web:8b40c5379d2b682423955f"
};


firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const $ = (id) => document.getElementById(id);

let currentUser = null;

let models = [];        // [{id, name}]
let trains = [];        // [{id, model, name}]
let scadenze = [];      // [{id, name}]
let abilitazioni = [];  // [{id, name}]
let activities = [];    // [{id, ...}]

let currentMonth = new Date();
let selectedDate = null;

/***********************
 * UTILS
 ***********************/
function normText(s) {
  return (s || "").toString().trim();
}
function upper(s) {
  return normText(s).toUpperCase();
}
function parseDeci(s) {
  const x = parseFloat(normText(s).replace(",", "."));
  return Number.isFinite(x) ? x : NaN;
}
function fmtMonth(date) {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}
function isoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function setStatus(el, msg, cls = "") {
  el.textContent = msg || "";
  el.className = "status" + (cls ? " " + cls : "");
}
function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
}
function showAuth() {
  $("auth-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

/***********************
 * AUTH
 ***********************/
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus($("auth-message"), "Accesso in corso…");

  try {
    await auth.signInWithEmailAndPassword(
      normText($("auth-email").value),
                                          $("auth-password").value
    );
    setStatus($("auth-message"), "");
  } catch (err) {
    setStatus($("auth-message"), err.message || "Errore accesso", "error");
  }
});

$("register-btn").addEventListener("click", async () => {
  setStatus($("auth-message"), "Registrazione in corso…");

  try {
    await auth.createUserWithEmailAndPassword(
      normText($("auth-email").value),
                                              $("auth-password").value
    );
    setStatus($("auth-message"), "Registrazione ok. Ora sei dentro.", "ok");
  } catch (err) {
    setStatus($("auth-message"), err.message || "Errore registrazione", "error");
  }
});

$("logout-btn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    showAuth();
    return;
  }

  currentUser = user;
  showApp();

  // boot
  initTabs();
  initCalendarNav();
  initForms();
  initTablesActions();
  initModal();

  // data
  await loadAllData();
  bootUI();
});

/***********************
 * TABS
 ***********************/
function initTabs() {
  const btns = document.querySelectorAll(".tabs button");
  const tabs = document.querySelectorAll(".tab");

  btns.forEach((b) => {
    b.onclick = async () => {
      const tab = b.dataset.tab;

      btns.forEach((x) => x.classList.remove("active"));
      tabs.forEach((x) => x.classList.remove("active"));

      b.classList.add("active");
      $("tab-" + tab).classList.add("active");

      // refresh views if needed
      if (tab === "calendar") renderCalendar();
      if (tab === "list") renderRegistry();
      if (tab === "new") refreshNewFormDropdowns();
      if (tab === "settings") renderSettings();
    };
  });
}

/***********************
 * FIRESTORE QUERIES
 ***********************/
function colRef(name) {
  return db.collection(name);
}

async function getUserDocs(collectionName) {
  const snap = await colRef(collectionName)
  .where("uid", "==", currentUser.uid)
  .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addDoc(collectionName, data) {
  await colRef(collectionName).add({ ...data, uid: currentUser.uid, createdAt: new Date().toISOString() });
}

async function updateDoc(collectionName, id, data) {
  await colRef(collectionName).doc(id).update({ ...data, updatedAt: new Date().toISOString() });
}

async function deleteDoc(collectionName, id) {
  await colRef(collectionName).doc(id).delete();
}

/***********************
 * LOAD DATA
 ***********************/
async function loadAllData() {
  const [m, t, s, a, act] = await Promise.all([
    getUserDocs("models"),
                                              getUserDocs("train_ids"),
                                              getUserDocs("scadenze"),
                                              getUserDocs("abilitazioni"),
                                              getUserDocs("activities")
  ]);

  models = m.sort((x, y) => (x.name || "").localeCompare(y.name || "", "it"));
  trains = t.sort((x, y) => {
    const c = (x.model || "").localeCompare(y.model || "", "it");
    return c !== 0 ? c : (x.name || "").localeCompare(y.name || "", "it");
  });
  scadenze = s.sort((x, y) => (x.name || "").localeCompare(y.name || "", "it"));
  abilitazioni = a.sort((x, y) => (x.name || "").localeCompare(y.name || "", "it"));

  activities = act
  .map(x => ({ ...x, timeDeci: Number(x.timeDeci) || 0 }))
  .sort((x, y) => (x.date < y.date ? 1 : -1));
}

/***********************
 * BOOT UI
 ***********************/
function bootUI() {
  // default date
  $("a-date").value = isoDate(new Date());

  // populate static dropdowns
  refreshModelDropdowns();
  refreshNewFormDropdowns();
  refreshFilterModels();

  // render views
  renderCalendar();
  renderRegistry();
  renderSettings();

  // default selected date summary = today
  selectedDate = isoDate(new Date());
  renderDaySummary(selectedDate);
}

/***********************
 * DROPDOWNS
 ***********************/
function refreshModelDropdowns() {
  // new form model select
  const modelSel = $("a-model");
  modelSel.innerHTML = "";

  if (models.length === 0) {
    modelSel.innerHTML = `<option value="">Nessun modello: aggiungi da Impostazioni</option>`;
    modelSel.disabled = true;
  } else {
    modelSel.disabled = false;
    models.forEach((m) => {
      modelSel.innerHTML += `<option value="${m.name}">${m.name}</option>`;
    });
  }

  // settings train model select
  const sTrainModel = $("s-train-model");
  sTrainModel.innerHTML = "";
  if (models.length === 0) {
    sTrainModel.innerHTML = `<option value="">Nessun modello</option>`;
    sTrainModel.disabled = true;
  } else {
    sTrainModel.disabled = false;
    models.forEach((m) => {
      sTrainModel.innerHTML += `<option value="${m.name}">${m.name}</option>`;
    });
  }

  // edit modal model select
  const eModel = $("e-model");
  eModel.innerHTML = "";
  if (models.length === 0) {
    eModel.innerHTML = `<option value="">Nessun modello</option>`;
    eModel.disabled = true;
  } else {
    eModel.disabled = false;
    models.forEach((m) => {
      eModel.innerHTML += `<option value="${m.name}">${m.name}</option>`;
    });
  }
}

function refreshNewFormDropdowns() {
  // model already populated
  const model = $("a-model").value || (models[0]?.name || "");

  // trains by model
  const trainSel = $("a-train");
  const t = trains.filter(x => x.model === model).sort((a,b)=>a.name.localeCompare(b.name,"it"));
  trainSel.innerHTML = "";
  if (!model || t.length === 0) {
    trainSel.innerHTML = `<option value="">Nessuna matricola: aggiungi da Impostazioni</option>`;
    trainSel.disabled = true;
  } else {
    trainSel.disabled = false;
    t.forEach(x => trainSel.innerHTML += `<option value="${x.name}">${x.name}</option>`);
  }

  // scadenze
  const scSel = $("a-scadenza");
  scSel.innerHTML = "";
  if (scadenze.length === 0) {
    scSel.innerHTML = `<option value="">Nessuna scadenza: aggiungi da Impostazioni</option>`;
    scSel.disabled = true;
  } else {
    scSel.disabled = false;
    scadenze.forEach(x => scSel.innerHTML += `<option value="${x.name}">${x.name}</option>`);
  }

  // abilitazioni
  const abSel = $("a-abilitazione");
  abSel.innerHTML = "";
  if (abilitazioni.length === 0) {
    abSel.innerHTML = `<option value="">Nessuna abilitazione: aggiungi da Impostazioni</option>`;
    abSel.disabled = true;
  } else {
    abSel.disabled = false;
    abilitazioni.forEach(x => abSel.innerHTML += `<option value="${x.name}">${x.name}</option>`);
  }
}

function refreshEditDropdowns(selected) {
  // selected: activity object
  // model dropdown already has options; set value:
  $("e-model").value = selected.model || (models[0]?.name || "");

  // trains by chosen model
  const model = $("e-model").value;
  const trainSel = $("e-train");
  const t = trains.filter(x => x.model === model).sort((a,b)=>a.name.localeCompare(b.name,"it"));
  trainSel.innerHTML = "";
  if (t.length === 0) {
    trainSel.innerHTML = `<option value="${selected.trainId || ""}">${selected.trainId || "Nessuna matricola"}</option>`;
  } else {
    t.forEach(x => trainSel.innerHTML += `<option value="${x.name}">${x.name}</option>`);
    if (selected.trainId) trainSel.value = selected.trainId;
  }

  // scadenze
  const scSel = $("e-scadenza");
  scSel.innerHTML = "";
  if (scadenze.length === 0) {
    scSel.innerHTML = `<option value="${selected.scadenza || ""}">${selected.scadenza || "Nessuna scadenza"}</option>`;
  } else {
    scadenze.forEach(x => scSel.innerHTML += `<option value="${x.name}">${x.name}</option>`);
    if (selected.scadenza) scSel.value = selected.scadenza;
  }

  // abilitazioni
  const abSel = $("e-abilitazione");
  abSel.innerHTML = "";
  if (abilitazioni.length === 0) {
    abSel.innerHTML = `<option value="${selected.abilitazione || ""}">${selected.abilitazione || "Nessuna abilitazione"}</option>`;
  } else {
    abilitazioni.forEach(x => abSel.innerHTML += `<option value="${x.name}">${x.name}</option>`);
    if (selected.abilitazione) abSel.value = selected.abilitazione;
  }
}

function refreshFilterModels() {
  const sel = $("filter-model");
  const current = sel.value || "";
  // reset options
  sel.innerHTML = `<option value="">Tutti</option>`;
  models.forEach(m => sel.innerHTML += `<option value="${m.name}">${m.name}</option>`);
  sel.value = current;
}

/***********************
 * CALENDAR
 ***********************/
function initCalendarNav() {
  $("cal-prev").onclick = () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); };
  $("cal-next").onclick = () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); };
}

function renderCalendar() {
  $("cal-month-label").textContent = fmtMonth(currentMonth);

  const grid = $("calendar-grid");
  grid.innerHTML = "";

  const weekdays = ["L", "M", "M", "G", "V", "S", "D"];
  weekdays.forEach(w => {
    const el = document.createElement("div");
    el.className = "cal-cell cal-header";
    el.textContent = w;
    grid.appendChild(el);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-11

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lun=0

  const daysInMonth = new Date(year, month+1, 0).getDate();

  for (let i=0; i<startWeekday; i++){
    const empty = document.createElement("div");
    empty.className = "cal-cell cal-empty";
    grid.appendChild(empty);
  }

  // totals by date
  const byDate = {};
  for (const a of activities) {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  }

  for (let d=1; d<=daysInMonth; d++){
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const items = byDate[dateStr] || [];
    const tot = items.reduce((s,x)=>s+(Number(x.timeDeci)||0), 0);

    const cell = document.createElement("div");
    cell.className = "cal-cell cal-day";
    if (items.length) cell.classList.add("has");

    cell.innerHTML = `
    <div class="num">${d}</div>
    <div class="tot">${tot>0 ? tot.toFixed(1) : ""}</div>
    `;

    cell.onclick = () => {
      selectedDate = dateStr;
      renderDaySummary(dateStr);
    };

    grid.appendChild(cell);
  }

  // keep summary consistent
  if (!selectedDate) {
    selectedDate = isoDate(new Date());
  }
  renderDaySummary(selectedDate);
}

function renderDaySummary(dateStr) {
  const title = $("day-title");
  const totalEl = $("day-total");
  const tbody = $("day-activities");

  const list = activities
  .filter(a => a.date === dateStr)
  .sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  title.textContent = list.length ? `Attività del ${dateStr}` : `Nessuna attività il ${dateStr}`;

  const tot = list.reduce((s,x)=>s+(Number(x.timeDeci)||0), 0);
  totalEl.textContent = tot.toFixed(1);

  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Nessuna attività.</td></tr>`;
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
    <td>${a.notes ? escapeHtml(a.notes) : ""}</td>
    <td>
    <button type="button" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  }
}

/***********************
 * REGISTRY
 ***********************/
function initTablesActions() {
  // day table actions
  $("day-activities").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    const activity = activities.find(x => x.id === id);
    if (!activity) return;

    if (action === "edit") openEditModal(activity);
    if (action === "delete") {
      const ok = confirm("Eliminare questa attività?");
      if (!ok) return;
      await deleteDoc("activities", id);
      await loadAllData();
      renderCalendar();
      renderRegistry();
    }
  });

  // registry actions
  $("all-activities").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    const activity = activities.find(x => x.id === id);
    if (!activity) return;

    if (action === "edit") openEditModal(activity);
    if (action === "delete") {
      const ok = confirm("Eliminare questa attività?");
      if (!ok) return;
      await deleteDoc("activities", id);
      await loadAllData();
      renderCalendar();
      renderRegistry();
    }
  });

  // filters
  $("btn-apply-filters").onclick = () => renderRegistry();
  $("btn-reset-filters").onclick = () => {
    $("filter-model").value = "";
    $("filter-train").value = "";
    renderRegistry();
  };
}

function renderRegistry() {
  const tbody = $("all-activities");
  const modelF = $("filter-model").value || "";
  const trainF = normText($("filter-train").value);

  // filter
  let list = [...activities];

  if (modelF) list = list.filter(x => x.model === modelF);
  if (trainF) list = list.filter(x => (x.trainId || "").toUpperCase().includes(trainF.toUpperCase()));

  // sort newest first by date + createdAt
  list.sort((a,b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt || "") < (b.createdAt || "") ? 1 : -1;
  });

  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Nessuna attività.</td></tr>`;
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
    <td>${a.notes ? escapeHtml(a.notes) : ""}</td>
    <td>
    <button type="button" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  }
}

/***********************
 * FORMS (NEW + SETTINGS)
 ***********************/
function initForms() {
  // new activity dropdown dependency
  $("a-model").addEventListener("change", refreshNewFormDropdowns);

  // add activity
  $("activity-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("save-message");
    setStatus(msg, "");

    const date = $("a-date").value;
    const model = $("a-model").value;
    const trainId = $("a-train").value;
    const scad = $("a-scadenza").value;
    const abil = $("a-abilitazione").value;
    const timeDeci = parseDeci($("a-time").value);
    const notes = normText($("a-notes").value);

    if (!date || !model || !trainId || !scad || !abil) {
      setStatus(msg, "Compila tutti i campi obbligatori.", "error");
      return;
    }
    if (!Number.isFinite(timeDeci)) {
      setStatus(msg, "Tempo non valido (es. 1.5).", "error");
      return;
    }

    try {
      await addDoc("activities", {
        date,
        model,
        trainId,
        scadenza: scad,
        abilitazione: abil,
        timeDeci,
        notes
      });

      setStatus(msg, "Attività salvata.", "ok");

      // reset inputs
      $("a-time").value = "";
      $("a-notes").value = "";

      await loadAllData();
      renderCalendar();
      renderRegistry();
    } catch (err) {
      console.error(err);
      setStatus(msg, "Errore nel salvataggio.", "error");
    }
  });

  // SETTINGS: add model
  $("form-add-model").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = upper($("s-model").value);
    if (!name) return;

    // avoid duplicates (local)
    if (models.some(m => upper(m.name) === name)) {
      alert("Modello già presente.");
      return;
    }

    await addDoc("models", { name });
    $("s-model").value = "";
    await loadAllData();
    refreshModelDropdowns();
    refreshNewFormDropdowns();
    refreshFilterModels();
    renderSettings();
  });

  // SETTINGS: add trainId
  $("form-add-train").addEventListener("submit", async (e) => {
    e.preventDefault();
    const model = $("s-train-model").value;
    const name = upper($("s-train").value);
    if (!model || !name) return;

    // avoid duplicates for model+name
    if (trains.some(t => t.model === model && upper(t.name) === name)) {
      alert("Matricola già presente per questo modello.");
      return;
    }

    await addDoc("train_ids", { model, name });
    $("s-train").value = "";
    await loadAllData();
    refreshNewFormDropdowns();
    renderSettings();
  });

  // SETTINGS: add scadenza
  $("form-add-scadenza").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = normText($("s-scadenza").value);
    if (!name) return;

    if (scadenze.some(s => s.name === name)) {
      alert("Scadenza già presente.");
      return;
    }

    await addDoc("scadenze", { name });
    $("s-scadenza").value = "";
    await loadAllData();
    refreshNewFormDropdowns();
    renderSettings();
  });

  // SETTINGS: add abilitazione
  $("form-add-abilitazione").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = normText($("s-abilitazione").value);
    if (!name) return;

    if (abilitazioni.some(a => a.name === name)) {
      alert("Abilitazione già presente.");
      return;
    }

    await addDoc("abilitazioni", { name });
    $("s-abilitazione").value = "";
    await loadAllData();
    refreshNewFormDropdowns();
    renderSettings();
  });
}

/***********************
 * SETTINGS RENDER + DELETE
 ***********************/
function renderSettings() {
  // models list
  const lm = $("list-models");
  lm.innerHTML = "";
  if (!models.length) lm.innerHTML = `<li class="muted">Nessun modello.</li>`;
  models.forEach(m => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span>${m.name}</span>
    <button class="x" type="button" data-del="models" data-id="${m.id}">✕</button>
    `;
    lm.appendChild(li);
  });

  // trains list
  const lt = $("list-trains");
  lt.innerHTML = "";
  if (!trains.length) lt.innerHTML = `<li class="muted">Nessuna matricola.</li>`;
  trains.forEach(t => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span><strong>${t.model}</strong> — ${t.name}</span>
    <button class="x" type="button" data-del="train_ids" data-id="${t.id}">✕</button>
    `;
    lt.appendChild(li);
  });

  // scadenze list
  const ls = $("list-scadenze");
  ls.innerHTML = "";
  if (!scadenze.length) ls.innerHTML = `<li class="muted">Nessuna scadenza.</li>`;
  scadenze.forEach(s => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span>${s.name}</span>
    <button class="x" type="button" data-del="scadenze" data-id="${s.id}">✕</button>
    `;
    ls.appendChild(li);
  });

  // abilitazioni list
  const la = $("list-abilitazioni");
  la.innerHTML = "";
  if (!abilitazioni.length) la.innerHTML = `<li class="muted">Nessuna abilitazione.</li>`;
  abilitazioni.forEach(a => {
    const li = document.createElement("li");
    li.innerHTML = `
    <span>${a.name}</span>
    <button class="x" type="button" data-del="abilitazioni" data-id="${a.id}">✕</button>
    `;
    la.appendChild(li);
  });

  // settings model dropdown for trainIds
  refreshModelDropdowns();
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-del]");
  if (!btn) return;

  const col = btn.dataset.del;
  const id = btn.dataset.id;
  if (!col || !id) return;

  const ok = confirm("Eliminare questa voce?");
  if (!ok) return;

  await deleteDoc(col, id);
  await loadAllData();
  refreshModelDropdowns();
  refreshNewFormDropdowns();
  refreshFilterModels();
  renderSettings();
});

/***********************
 * MODAL (EDIT ACTIVITY)
 ***********************/
function initModal() {
  $("edit-close").onclick = closeEditModal;
  $("modal-overlay").onclick = closeEditModal;

  $("e-model").addEventListener("change", () => {
    // keep current selections if possible
    const current = {
      model: $("e-model").value,
                                trainId: $("e-train").value,
                                scadenza: $("e-scadenza").value,
                                abilitazione: $("e-abilitazione").value
    };
    refreshEditDropdowns(current);
  });

  $("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("edit-message");
    setStatus(msg, "");

    const id = $("e-id").value;
    const date = $("e-date").value;
    const model = $("e-model").value;
    const trainId = $("e-train").value;
    const scad = $("e-scadenza").value;
    const abil = $("e-abilitazione").value;
    const timeDeci = parseDeci($("e-time").value);
    const notes = normText($("e-notes").value);

    if (!id || !date || !model || !trainId || !scad || !abil) {
      setStatus(msg, "Dati mancanti.", "error");
      return;
    }
    if (!Number.isFinite(timeDeci)) {
      setStatus(msg, "Tempo non valido.", "error");
      return;
    }

    try {
      await updateDoc("activities", id, {
        date, model, trainId,
        scadenza: scad,
        abilitazione: abil,
        timeDeci,
        notes
      });

      setStatus(msg, "Salvato.", "ok");

      await loadAllData();
      closeEditModal();
      renderCalendar();
      renderRegistry();
    } catch (err) {
      console.error(err);
      setStatus(msg, "Errore nel salvataggio.", "error");
    }
  });

  $("edit-delete").onclick = async () => {
    const id = $("e-id").value;
    if (!id) return;
    const ok = confirm("Eliminare questa attività?");
    if (!ok) return;

    await deleteDoc("activities", id);
    await loadAllData();
    closeEditModal();
    renderCalendar();
    renderRegistry();
  };
}

function openEditModal(activity) {
  $("e-id").value = activity.id;
  $("e-date").value = activity.date || isoDate(new Date());
  $("e-time").value = String(activity.timeDeci ?? "").replace(".", ",");
  $("e-notes").value = activity.notes || "";

  refreshModelDropdowns();
  refreshEditDropdowns(activity);

  setStatus($("edit-message"), "");
  $("modal-overlay").classList.remove("hidden");
  $("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  $("modal-overlay").classList.add("hidden");
  $("edit-modal").classList.add("hidden");
}

/***********************
 * SAFE HTML
 ***********************/
function escapeHtml(str) {
  return String(str)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
}
