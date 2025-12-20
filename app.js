/**********************
 * FIREBASE INIT
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
 * HELPERS
 **********************/
const $ = (id) => document.getElementById(id);
const norm = (v) => (v || "").trim();
const toDeci = (v) => {
  const n = parseFloat(norm(v).replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 10) / 10;
};
const today = () => new Date().toISOString().split("T")[0];
const alpha = (a, b) => a.localeCompare(b, "it", { sensitivity: "base" });

/**********************
 * STATE
 **********************/
let currentUser = null;
let currentMonth = new Date();
let selectedDay = null;

let settings = {
  models: ["E464", "TAF", "POP", "JAZZ", "ROCK"],
  trains: {},            // { E464: ["464-001"] }
  scadenze: [],          // GLOBALI
  abilitazioni: []       // GLOBALI
};

let activities = [];     // attività Firestore

/**********************
 * FIRESTORE REFS
 **********************/
const settingsRef = (uid) =>
db.collection("users").doc(uid).collection("settings").doc("main");

const activitiesRef = (uid) =>
db.collection("users").doc(uid).collection("activities");

/**********************
 * AUTH
 **********************/
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    $("auth-screen").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }

  currentUser = user;
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("user-email").textContent = user.email;

  await loadSettings();
  await loadActivities();
  initTabs();
  initNewForm();
  renderSettings();
  renderRegistry();
  renderCalendar();
});

/**********************
 * LOAD / SAVE
 **********************/
async function loadSettings() {
  const snap = await settingsRef(currentUser.uid).get();
  if (snap.exists) {
    settings = snap.data();
  } else {
    await settingsRef(currentUser.uid).set(settings);
  }

  settings.models.sort(alpha);
  settings.scadenze.sort(alpha);
  settings.abilitazioni.sort(alpha);
}

async function saveSettings() {
  await settingsRef(currentUser.uid).set(settings);
}

async function loadActivities() {
  const snap = await activitiesRef(currentUser.uid).orderBy("date").get();
  activities = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**********************
 * TABS
 **********************/
function initTabs() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
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
}

/**********************
 * NUOVA ATTIVITÀ
 **********************/
function initNewForm() {
  $("n-date").value = today();
  $("n-model").onchange = refreshNewForm;

  $("form-new").onsubmit = async (e) => {
    e.preventDefault();

    const a = {
      date: $("n-date").value,
      model: $("n-model").value,
      trainId: $("n-train").value,
      scadenza: $("n-scadenza").value,
      abilitazione: $("n-abilitazione").value,
      timeDeci: toDeci($("n-timeDeci").value),
      notes: norm($("n-notes").value),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!a.date || !a.model || !a.trainId || !a.scadenza || !a.abilitazione)
      return alert("Campi obbligatori mancanti");
    if (a.timeDeci === null) return alert("Tempo non valido");

    const ref = await activitiesRef(currentUser.uid).add(a);
    activities.push({ id: ref.id, ...a });

    $("form-new").reset();
    $("n-date").value = today();

    renderCalendar();
    renderRegistry();
  };
}

function refreshNewForm() {
  // MODELLI
  $("n-model").innerHTML = "";
  settings.models.forEach(m => $("n-model").append(new Option(m, m)));

  const model = $("n-model").value;

  // MATRICOLA (per modello)
  $("n-train").innerHTML = "";
  (settings.trains[model] || []).forEach(t => $("n-train").append(new Option(t, t)));

  // SCADENZE GLOBALI
  $("n-scadenza").innerHTML = "";
  settings.scadenze.forEach(s => $("n-scadenza").append(new Option(s, s)));

  // ABILITAZIONI GLOBALI
  $("n-abilitazione").innerHTML = "";
  settings.abilitazioni.forEach(a => $("n-abilitazione").append(new Option(a, a)));
}

/**********************
 * IMPOSTAZIONI
 **********************/
function renderSettings() {
  // MODELLI
  $("s-models-list").innerHTML = "";
  settings.models.forEach(m => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${m}</span>`;
    $("s-models-list").appendChild(li);
  });

  // SCADENZE
  $("s-scads-list").innerHTML = "";
  settings.scadenze.forEach(s => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${s}</span>`;
    $("s-scads-list").appendChild(li);
  });

  // ABILITAZIONI
  $("s-abils-list").innerHTML = "";
  settings.abilitazioni.forEach(a => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${a}</span>`;
    $("s-abils-list").appendChild(li);
  });
}

/**********************
 * CALENDARIO
 **********************/
function renderCalendar() {
  const grid = $("calendar-grid");
  const label = $("cal-month-label");

  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  label.textContent = currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const firstDay = new Date(y, m, 1);
  const start = (firstDay.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();

  const byDate = {};
  activities.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  grid.innerHTML = "";
  ["L","M","M","G","V","S","D"].forEach(d => {
    const h = document.createElement("div");
    h.className = "cal-header-cell";
    h.textContent = d;
    grid.appendChild(h);
  });

  for (let i = 0; i < start; i++) grid.appendChild(document.createElement("div"));

  for (let d = 1; d <= days; d++) {
    const date = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const items = byDate[date] || [];
    const total = items.reduce((s,a)=>s+(a.timeDeci||0),0);

    const cell = document.createElement("div");
    cell.className = "cal-cell cal-day";
    if (date === selectedDay) cell.classList.add("active");

    cell.innerHTML = `
    <div class="cal-day-number">${d}</div>
    <div class="cal-day-hours">${total ? total.toFixed(1) : ""}</div>
    `;

    cell.onclick = () => {
      selectedDay = date;
      showDay(date);
      renderCalendar();
    };

    grid.appendChild(cell);
  }
}

function showDay(date) {
  const list = activities.filter(a => a.date === date);
  $("cal-day-title").textContent = `Attività del ${date}`;
  $("cal-day-hours").textContent =
  list.reduce((s,a)=>s+(a.timeDeci||0),0).toFixed(1);

  const tbody = $("cal-day-activities");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7">Nessuna attività</td></tr>`;
    return;
  }

  list.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci}</td>
    <td>${a.notes||""}</td>
    <td>
    <button onclick="editActivity('${a.id}')">✏️</button>
    <button onclick="deleteActivity('${a.id}')">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  });
}

$("cal-prev").onclick = () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); };
$("cal-next").onclick = () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); };

/**********************
 * MODIFICA / ELIMINA
 **********************/
window.editActivity = (id) => {
  const a = activities.find(x => x.id === id);
  if (!a) return alert("Attività non trovata");
  alert("Qui puoi riusare la modale già presente: dati pronti");
};

window.deleteActivity = async (id) => {
  if (!confirm("Eliminare attività?")) return;
  await activitiesRef(currentUser.uid).doc(id).delete();
  activities = activities.filter(a => a.id !== id);
  renderCalendar();
  renderRegistry();
};

/**********************
 * REGISTRO
 **********************/
function renderRegistry() {
  const tbody = $("registry-rows");
  tbody.innerHTML = "";

  activities
  .sort((a,b)=>a.date<b.date?1:-1)
  .forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci}</td>
    <td>${a.notes||""}</td>
    <td>
    <button onclick="editActivity('${a.id}')">✏️</button>
    <button onclick="deleteActivity('${a.id}')">🗑️</button>
    </td>
    `;
    tbody.appendChild(tr);
  });
}
