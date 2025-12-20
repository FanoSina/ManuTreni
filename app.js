/*************************************************
 * Firebase init
 *************************************************/
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

/*************************************************
 * Helpers
 *************************************************/
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
function monthLabel(date) {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

/*************************************************
 * Firestore refs
 *************************************************/
const settingsRef = (uid) =>
db.collection("users").doc(uid).collection("settings").doc("main");

const activitiesRef = (uid) =>
db.collection("users").doc(uid).collection("activities");

/*************************************************
 * State
 *************************************************/
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

/*************************************************
 * AUTH UI
 *************************************************/
function showAuth(msg = "") {
  $("auth-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("auth-msg").textContent = msg;
}
function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

/*************************************************
 * AUTH ACTIONS
 *************************************************/
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

/*************************************************
 * SETTINGS LOAD (ANTI-MENU-VUOTO)
 *************************************************/
async function loadSettings(uid) {
  const ref = settingsRef(uid);
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

  settings.models = Array.isArray(data.models) && data.models.length
  ? data.models
  : [...DEFAULT_MODELS];

  settings.trains = data.trains || {};
  settings.scadenze = Array.isArray(data.scadenze) ? data.scadenze : [];
  settings.abilitazioni = Array.isArray(data.abilitazioni) ? data.abilitazioni : [];

  settings.models.forEach((m) => {
    if (!Array.isArray(settings.trains[m])) {
      settings.trains[m] = [];
    }
  });

  await ref.set(settings, { merge: true });
}

/*************************************************
 * ACTIVITIES
 *************************************************/
async function loadActivities(uid) {
  const snap = await activitiesRef(uid).get();
  activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addActivity(uid, a) {
  const ref = await activitiesRef(uid).add(a);
  activities.push({ id: ref.id, ...a });
}

async function updateActivity(uid, id, patch) {
  await activitiesRef(uid).doc(id).set(patch, { merge: true });
  const i = activities.findIndex((x) => x.id === id);
  if (i >= 0) activities[i] = { ...activities[i], ...patch };
}

async function deleteActivity(uid, id) {
  await activitiesRef(uid).doc(id).delete();
  activities = activities.filter((x) => x.id !== id);
}

/*************************************************
 * TABS
 *************************************************/
document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "calendar") renderCalendar();
    if (btn.dataset.tab === "registry") renderRegistry();
    if (btn.dataset.tab === "new") refreshNewFormOptions();
    if (btn.dataset.tab === "settings") renderSettings();
  };
});

/*************************************************
 * NEW ACTIVITY FORM
 *************************************************/
function renderModelSelect(select, list) {
  select.innerHTML = "";
  list.forEach((m) => select.appendChild(new Option(m, m)));
}

function renderOptions(select, list, emptyLabel) {
  select.innerHTML = "";
  if (!list.length) {
    const o = new Option(emptyLabel, "");
    o.disabled = true;
    o.selected = true;
    select.appendChild(o);
    return;
  }
  list.forEach((v) => select.appendChild(new Option(v, v)));
}

function refreshNewFormOptions() {
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

$("form-new").onsubmit = async (e) => {
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

  await addActivity(currentUser.uid, a);
  $("form-new").reset();
  refreshNewFormOptions();
  renderCalendar();
  renderRegistry();
};

/*************************************************
 * CALENDAR
 *************************************************/
function renderCalendar() {
  $("cal-month-label").textContent = monthLabel(currentMonth);
  $("calendar-grid").innerHTML = "Calendario OK";
}

/*************************************************
 * REGISTRY
 *************************************************/
function renderRegistry() {
  $("registry-rows").innerHTML = "";
  activities.forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci}</td>
    <td>
    <button onclick="editActivity('${a.id}')">✏️</button>
    <button onclick="removeActivity('${a.id}')">🗑️</button>
    </td>`;
    $("registry-rows").appendChild(tr);
  });
}

window.editActivity = (id) => {
  const a = activities.find((x) => x.id === id);
  if (!a) return;
  $("n-date").value = a.date;
  $("n-model").value = a.model;
  refreshNewFormOptions();
  $("n-train").value = a.trainId;
  $("n-scadenza").value = a.scadenza;
  $("n-abilitazione").value = a.abilitazione;
  $("n-timeDeci").value = a.timeDeci;
  $("n-notes").value = a.notes || "";
};

window.removeActivity = async (id) => {
  if (!confirm("Eliminare attività?")) return;
  await deleteActivity(currentUser.uid, id);
  renderRegistry();
  renderCalendar();
};

/*************************************************
 * SETTINGS UI (base)
 *************************************************/
function renderSettings() {
  $("s-models-list").innerHTML = "";
  settings.models.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m;
    $("s-models-list").appendChild(li);
  });
}

/*************************************************
 * AUTH STATE
 *************************************************/
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    showAuth();
    return;
  }

  currentUser = user;
  showApp();
  $("user-email").textContent = user.email;

  await loadSettings(user.uid);
  await loadActivities(user.uid);

  // init model select ONCE
  renderModelSelect($("n-model"), settings.models);
  $("n-model").value = settings.models[0];

  if (!modelListenerAttached) {
    $("n-model").addEventListener("change", refreshNewFormOptions);
    modelListenerAttached = true;
  }

  refreshNewFormOptions();
  renderRegistry();
  renderCalendar();
});
