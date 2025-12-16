/**************************************************
 * SUPABASE CONFIG
 **************************************************/
const SUPABASE_URL = 'https://gpnmrtbwyytybdblmtka.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwbm1ydGJ3eXl0eWJkYmxtdGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MDIwNTksImV4cCI6MjA4MTQ3ODA1OX0.pGhuP0P0fm8xFmMUy707_i0TKVdE1P_9-bOq9DNWZfI';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
let currentUser = null;
let currentMonth = new Date();
let cachedTrainIds = [];
let cachedScadenze = [];
let cachedAbilitazioni = [];

/**************************************************
 * UI SHOW/HIDE
 **************************************************/
function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
}
function showLogin() {
  $("auth-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

/**************************************************
 * AUTH
 **************************************************/
function setAuthMsg(text, type = "") {
  const el = $("auth-message");
  el.textContent = text || "";
  el.className = "status " + (type || "");
}

async function checkSessionAndBoot() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error(error);
    currentUser = null;
    showLogin();
    return;
  }

  const session = data.session;
  if (!session?.user) {
    currentUser = null;
    showLogin();
    return;
  }

  currentUser = session.user;
  showApp();
  await bootApp();
}

function initAuth() {
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthMsg("Accesso in corso…");

    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMsg(error.message, "error");
      return;
    }
    setAuthMsg("");
    await checkSessionAndBoot();
  });

  $("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthMsg("Registrazione in corso…");

    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setAuthMsg(error.message, "error");
      return;
    }

    setAuthMsg("Registrazione ok. Controlla la mail e conferma l’account, poi fai login.", "ok");
  });

  $("logout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    currentUser = null;
    showLogin();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      currentUser = session.user;
      showApp();
      bootApp();
    } else {
      currentUser = null;
      showLogin();
    }
  });
}

/**************************************************
 * SUPABASE HELPERS (CRUD)
 **************************************************/
async function sbSelect(table, filters = {}, order = null) {
  let q = supabase.from(table).select("*").eq("user_id", currentUser.id);
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  if (order) q = q.order(order.col, { ascending: order.asc });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function sbInsert(table, row) {
  const { error } = await supabase.from(table).insert({ ...row, user_id: currentUser.id });
  if (error) throw error;
}

async function sbUpdate(table, id, patch) {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
}

async function sbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

/**************************************************
 * TABS
 **************************************************/
function initTabs() {
  const btns = document.querySelectorAll(".tabs button");
  const tabs = document.querySelectorAll(".tab");

  btns.forEach((b) => {
    b.addEventListener("click", async () => {
      const tab = b.dataset.tab;

      btns.forEach((x) => x.classList.remove("active"));
      tabs.forEach((x) => x.classList.remove("active"));

      b.classList.add("active");
      $("tab-" + tab).classList.add("active");

      if (tab === "calendar") await renderCalendar();
      if (tab === "list") await refreshActivitiesList();
      if (tab === "new") await refreshNewFormOptions();
      if (tab === "settings") await refreshSettingsUI();
    });
  });
}

/**************************************************
 * SETTINGS
 **************************************************/
function initSettingsForms() {
  $("form-add-trainId").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const model = $("settings-train-model").value;
      const name = $("settings-trainId").value.trim();
      if (!name) return;

      await sbInsert("train_ids", { model, name });
      $("settings-trainId").value = "";
      await loadSettingsCache();
      await refreshSettingsUI();
      await refreshNewFormOptions();
    } catch (err) {
      alert("Errore matricola: " + err.message);
    }
  });

  $("form-add-scadenza").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const name = $("settings-scadenza").value.trim();
      if (!name) return;

      await sbInsert("scadenze", { name });
      $("settings-scadenza").value = "";
      await loadSettingsCache();
      await refreshSettingsUI();
      await refreshNewFormOptions();
    } catch (err) {
      alert("Errore scadenza: " + err.message);
    }
  });

  $("form-add-abilitazione").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const name = $("settings-abilitazione").value.trim();
      if (!name) return;

      await sbInsert("abilitazioni", { name });
      $("settings-abilitazione").value = "";
      await loadSettingsCache();
      await refreshSettingsUI();
      await refreshNewFormOptions();
    } catch (err) {
      alert("Errore abilitazione: " + err.message);
    }
  });

  // delete delegation
  $("tab-settings").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;
    const table = btn.dataset.table;
    const id = btn.dataset.id;
    try {
      await sbDelete(table, id);
      await loadSettingsCache();
      await refreshSettingsUI();
      await refreshNewFormOptions();
    } catch (err) {
      alert("Errore eliminazione: " + err.message);
    }
  });
}

async function loadSettingsCache() {
  cachedTrainIds = await sbSelect("train_ids", {}, { col: "model", asc: true });
  cachedScadenze = await sbSelect("scadenze", {}, { col: "name", asc: true });
  cachedAbilitazioni = await sbSelect("abilitazioni", {}, { col: "name", asc: true });
}

async function refreshSettingsUI() {
  // train_ids list
  const ulT = $("list-trainIds");
  ulT.innerHTML = "";
  cachedTrainIds
  .slice()
  .sort((a, b) => a.model.localeCompare(b.model) || a.name.localeCompare(b.name))
  .forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${t.model}</strong> — ${t.name}</span>
    <button type="button" data-del="1" data-table="train_ids" data-id="${t.id}">✕</button>`;
    ulT.appendChild(li);
  });

  const ulS = $("list-scadenze");
  ulS.innerHTML = "";
  cachedScadenze
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${s.name}</span>
    <button type="button" data-del="1" data-table="scadenze" data-id="${s.id}">✕</button>`;
    ulS.appendChild(li);
  });

  const ulA = $("list-abilitazioni");
  ulA.innerHTML = "";
  cachedAbilitazioni
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((a) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${a.name}</span>
    <button type="button" data-del="1" data-table="abilitazioni" data-id="${a.id}">✕</button>`;
    ulA.appendChild(li);
  });
}

/**************************************************
 * NEW ACTIVITY FORM
 **************************************************/
function setSaveStatus(text, type = "") {
  const el = $("save-status");
  el.textContent = text || "";
  el.className = "status " + (type || "");
}

async function refreshNewFormOptions() {
  // trainId depends on model
  const model = $("input-model").value;

  // train ids
  const trainSel = $("input-trainId");
  trainSel.innerHTML = "";
  const trains = cachedTrainIds.filter((t) => t.model === model).sort((a, b) => a.name.localeCompare(b.name));
  if (trains.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nessuna matricola: aggiungi da Impostazioni";
    opt.disabled = true;
    opt.selected = true;
    trainSel.appendChild(opt);
  } else {
    trains.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = t.name;
      trainSel.appendChild(opt);
    });
  }

  // scadenze
  const scSel = $("input-scadenza");
  scSel.innerHTML = "";
  const sc = cachedScadenze.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (sc.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nessuna scadenza: aggiungi da Impostazioni";
    opt.disabled = true;
    opt.selected = true;
    scSel.appendChild(opt);
  } else {
    sc.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.name;
      opt.textContent = s.name;
      scSel.appendChild(opt);
    });
  }

  // abilitazioni
  const abSel = $("input-abilitazione");
  abSel.innerHTML = "";
  const ab = cachedAbilitazioni.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (ab.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nessuna abilitazione: aggiungi da Impostazioni";
    opt.disabled = true;
    opt.selected = true;
    abSel.appendChild(opt);
  } else {
    ab.forEach((x) => {
      const opt = document.createElement("option");
      opt.value = x.name;
      opt.textContent = x.name;
      abSel.appendChild(opt);
    });
  }
}

function initNewActivityForm() {
  $("input-date").value = new Date().toISOString().split("T")[0];

  $("input-model").addEventListener("change", refreshNewFormOptions);

  $("form-new-activity").addEventListener("submit", async (e) => {
    e.preventDefault();
    setSaveStatus("");

    try {
      const date = $("input-date").value;
      const model = $("input-model").value;
      const trainId = $("input-trainId").value;
      const scadenza = $("input-scadenza").value;
      const abilitazione = $("input-abilitazione").value;
      const timeDeci = parseFloat($("input-timeDeci").value.replace(",", ".").trim());
      const notes = $("input-notes").value || "";

      if (!date || !model || !trainId || !scadenza || !abilitazione) {
        throw new Error("Compila tutti i campi obbligatori.");
      }
      if (Number.isNaN(timeDeci)) throw new Error("Tempo non valido.");

      await sbInsert("activities", {
        date,
        model,
        train_id: trainId,
        scadenza,
        abilitazione,
        time_deci: timeDeci,
        notes
      });

      setSaveStatus("Attività salvata.", "ok");
      $("input-timeDeci").value = "";
      $("input-notes").value = "";

      await renderCalendar();
      await refreshActivitiesList();
    } catch (err) {
      console.error(err);
      setSaveStatus("Errore: " + err.message, "error");
    }
  });
}

/**************************************************
 * ACTIVITIES (LIST + CALENDAR)
 **************************************************/
async function getAllActivities() {
  // Prendiamo tutto per ora (poi si ottimizza con range mensile)
  return await sbSelect("activities", {}, { col: "date", asc: false });
}

async function refreshActivitiesList() {
  const tbody = $("activities-table-body");
  tbody.innerHTML = "";

  const activities = await getAllActivities();
  if (activities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">Nessuna attività.</td></tr>`;
    return;
  }

  activities.forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.train_id}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${Number(a.time_deci).toFixed(1)}</td>
    <td>${a.notes || ""}</td>
    <td>
    <button type="button" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  });
}

function monthLabel(date) {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

async function renderCalendar() {
  const grid = $("calendar-grid");
  const label = $("cal-month-label");

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  label.textContent = monthLabel(currentMonth);

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const all = await getAllActivities();
  const byDate = {};
  all.forEach((a) => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  grid.innerHTML = "";

  ["L","M","M","G","V","S","D"].forEach((w) => {
    const el = document.createElement("div");
    el.className = "cal-cell cal-header";
    el.textContent = w;
    grid.appendChild(el);
  });

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-cell cal-empty";
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const items = byDate[dateStr] || [];
    const total = items.reduce((s, a) => s + Number(a.time_deci || 0), 0);

    const cell = document.createElement("div");
    cell.className = "cal-cell cal-day";
    if (items.length > 0) cell.classList.add("has-activities");

    cell.innerHTML = `
    <span class="cal-day-number">${d}</span>
    <span class="cal-day-hours">${total > 0 ? total.toFixed(1) : ""}</span>
    `;

    cell.addEventListener("click", () => showDaySummary(dateStr, items));
    grid.appendChild(cell);
  }
}

function showDaySummary(dateStr, list) {
  $("cal-day-title").textContent = list.length ? `Attività del ${dateStr}` : `Nessuna attività il ${dateStr}`;
  const total = list.reduce((s, a) => s + Number(a.time_deci || 0), 0);
  $("cal-day-hours").textContent = total.toFixed(1);

  const tbody = $("cal-day-activities");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7">Nessuna attività registrata.</td></tr>`;
    return;
  }

  list.forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.model}</td>
    <td>${a.train_id}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${Number(a.time_deci).toFixed(1)}</td>
    <td>${a.notes || ""}</td>
    <td>
    <button type="button" data-action="edit" data-id="${a.id}">✏️</button>
    <button type="button" data-action="delete" data-id="${a.id}">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  });
}

function initCalendarNav() {
  $("cal-prev").addEventListener("click", async () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    await renderCalendar();
  });
  $("cal-next").addEventListener("click", async () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    await renderCalendar();
  });
}

/**************************************************
 * EDIT / DELETE (event delegation + modal)
 **************************************************/
function initActionsDelegation() {
  // registro
  $("activities-table-body").addEventListener("click", handleActionClick);
  // calendario day table
  $("cal-day-activities").addEventListener("click", handleActionClick);
}

async function handleActionClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "delete") {
    if (!confirm("Eliminare questa attività?")) return;
    try {
      await sbDelete("activities", id);
      await renderCalendar();
      await refreshActivitiesList();
      // refresh day summary if currently showing same day: semplice, riprenderà al prossimo click
    } catch (err) {
      alert("Errore eliminazione: " + err.message);
    }
  }

  if (action === "edit") {
    try {
      const rows = await sbSelect("activities", { id });
      const a = rows[0];
      if (!a) return;

      await openEditModal(a);
    } catch (err) {
      alert("Errore lettura attività: " + err.message);
    }
  }
}

async function openEditModal(a) {
  $("edit-id").value = a.id;
  $("edit-date").value = a.date;
  $("edit-model").value = a.model;
  $("edit-timeDeci").value = String(a.time_deci).replace(".", ",");
  $("edit-notes").value = a.notes || "";

  // popola select edit
  await populateEditOptions(a.model, a.train_id, a.scadenza, a.abilitazione);

  $("modal-overlay").classList.remove("hidden");
  $("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  $("modal-overlay").classList.add("hidden");
  $("edit-modal").classList.add("hidden");
}

async function populateEditOptions(model, trainId, scadenza, abilitazione) {
  // train ids by model
  const trainSel = $("edit-trainId");
  trainSel.innerHTML = "";
  cachedTrainIds
  .filter((t) => t.model === model)
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = t.name;
    trainSel.appendChild(opt);
  });
  if (trainId) trainSel.value = trainId;

  const scSel = $("edit-scadenza");
  scSel.innerHTML = "";
  cachedScadenze
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = s.name;
    scSel.appendChild(opt);
  });
  if (scadenza) scSel.value = scadenza;

  const abSel = $("edit-abilitazione");
  abSel.innerHTML = "";
  cachedAbilitazioni
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((x) => {
    const opt = document.createElement("option");
    opt.value = x.name;
    opt.textContent = x.name;
    abSel.appendChild(opt);
  });
  if (abilitazione) abSel.value = abilitazione;

  $("edit-model").onchange = async () => {
    const newModel = $("edit-model").value;
    await populateEditOptions(newModel, "", $("edit-scadenza").value, $("edit-abilitazione").value);
  };
}

function initEditModal() {
  $("edit-cancel").addEventListener("click", closeEditModal);
  $("modal-overlay").addEventListener("click", closeEditModal);

  $("form-edit-activity").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = $("edit-id").value;

      const patch = {
        date: $("edit-date").value,
                                           model: $("edit-model").value,
                                           train_id: $("edit-trainId").value,
                                           scadenza: $("edit-scadenza").value,
                                           abilitazione: $("edit-abilitazione").value,
                                           time_deci: parseFloat($("edit-timeDeci").value.replace(",", ".").trim()),
                                           notes: $("edit-notes").value || ""
      };

      if (Number.isNaN(patch.time_deci)) throw new Error("Decimi non validi.");

      await sbUpdate("activities", id, patch);
      closeEditModal();

      await renderCalendar();
      await refreshActivitiesList();
    } catch (err) {
      alert("Errore modifica: " + err.message);
    }
  });
}

/**************************************************
 * BOOT APP
 **************************************************/
async function bootApp() {
  // init once (safe: re-calls are idempotent enough for this scope)
  initTabs();
  initSettingsForms();
  initNewActivityForm();
  initCalendarNav();
  initActionsDelegation();
  initEditModal();

  await loadSettingsCache();
  await refreshSettingsUI();
  await refreshNewFormOptions();
  await renderCalendar();
  await refreshActivitiesList();
}

/**************************************************
 * INIT
 **************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  initAuth();
  await checkSessionAndBoot();
});
