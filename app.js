/**************************************************
 * SUPABASE CONFIG
 **************************************************/
const SUPABASE_URL = "https://gpnmrtbwyytybdblmtka.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwbm1ydGJ3eXl0eWJkYmxtdGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MDIwNTksImV4cCI6MjA4MTQ3ODA1OX0.pGhuP0P0fm8xFmMUy707_i0TKVdE1P_9-bOq9DNWZfI";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/**************************************************
 * UTILS
 **************************************************/
const $ = id => document.getElementById(id);

/**************************************************
 * AUTH LOGIC
 **************************************************/
async function checkSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    showApp();
  } else {
    showLogin();
  }
}

function showApp() {
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

function showLogin() {
  $("auth-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

/**************************************************
 * LOGIN / REGISTER / LOGOUT
 **************************************************/
function initAuth() {
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("auth-email").value;
    const password = $("auth-password").value;
    $("auth-message").textContent = "Accesso in corso…";

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      $("auth-message").textContent = error.message;
    } else {
      $("auth-message").textContent = "";
      showApp();
    }
  });

  $("register-form").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("auth-email").value;
    const password = $("auth-password").value;
    $("auth-message").textContent = "Registrazione in corso…";

    const { error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      $("auth-message").textContent = error.message;
    } else {
      $("auth-message").textContent =
      "Registrazione completata. Controlla la mail.";
    }
  });

  $("logout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    showLogin();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) showApp();
    else showLogin();
  });
}

/**************************************************
 * INDEXEDDB (LOCALE – INVARIATO)
 **************************************************/
let db;
let currentMonth = new Date();

function openDB() {
  return new Promise(resolve => {
    const req = indexedDB.open("treniDB", 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      d.createObjectStore("activities", {
        keyPath: "id",
        autoIncrement: true
      });
      d.createObjectStore("trainIds", { keyPath: "name" });
      d.createObjectStore("scadenze", { keyPath: "name" });
      d.createObjectStore("abilitazioni", { keyPath: "name" });
    };
    req.onsuccess = e => {
      db = e.target.result;
      resolve();
    };
  });
}

const getAll = s =>
new Promise(r =>
db
.transaction(s)
.objectStore(s)
.getAll().onsuccess = e => r(e.target.result)
);

const add = (s, o) =>
new Promise(r =>
db
.transaction(s, "readwrite")
.objectStore(s)
.add(o).onsuccess = r
);

const put = (s, o) =>
new Promise(r =>
db
.transaction(s, "readwrite")
.objectStore(s)
.put(o).onsuccess = r
);

const del = (s, k) =>
new Promise(r =>
db
.transaction(s, "readwrite")
.objectStore(s)
.delete(k).onsuccess = r
);

const get = (s, k) =>
new Promise(r =>
db
.transaction(s)
.objectStore(s)
.get(k).onsuccess = e => r(e.target.result)
);

/**************************************************
 * UI LOGIC (INVARIATA)
 **************************************************/
function initTabs() {
  document.querySelectorAll(".tabs button").forEach(b => {
    b.onclick = () => {
      document
      .querySelectorAll(".tabs button,.tab")
      .forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      $("tab-" + b.dataset.tab).classList.add("active");
      if (b.dataset.tab === "calendar") renderCalendar();
      if (b.dataset.tab === "list") refreshList();
    };
  });
}

function initNew() {
  $("input-date").value = new Date().toISOString().split("T")[0];
  $("form-new-activity").onsubmit = async e => {
    e.preventDefault();
    await add("activities", {
      date: $("input-date").value,
              model: $("input-model").value,
              trainId: $("input-trainId").value,
              scadenza: $("input-scadenza").value,
              abilitazione: $("input-abilitazione").value,
              timeDeci: parseFloat(
                $("input-timeDeci").value.replace(",", ".")
              ),
              notes: $("input-notes").value
    });
    renderCalendar();
    refreshList();
  };
}

async function renderCalendar() {
  const grid = $("calendar-grid");
  const label = $("cal-month-label");
  const y = currentMonth.getFullYear(),
  m = currentMonth.getMonth();
  label.textContent = currentMonth.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric"
  });
  grid.innerHTML = "";

  ["L", "M", "M", "G", "V", "S", "D"].forEach(
    d => (grid.innerHTML += `<div class="cal-cell cal-header">${d}</div>`)
  );

  const first = new Date(y, m, 1),
  start = (first.getDay() + 6) % 7,
  days = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < start; i++)
    grid.innerHTML += `<div class="cal-cell cal-empty"></div>`;

  const all = await getAll("activities"),
  map = {};
  all.forEach(a => (map[a.date] = map[a.date] || []).push(a));

  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(
      2,
      "0"
    )}`;
    const items = map[ds] || [];
    const tot = items.reduce((s, a) => s + a.timeDeci, 0);
    grid.innerHTML += `
    <div class="cal-cell cal-day ${items.length ? "has-activities" : ""}"
    onclick="showDay('${ds}')">
    <span class="cal-day-number">${d}</span>
    <span class="cal-day-hours">${tot ? tot.toFixed(1) : ""}</span>
    </div>`;
  }
}

async function showDay(d) {
  const items = (await getAll("activities")).filter(a => a.date === d);
  $("cal-day-title").textContent = d;
  $("cal-day-hours").textContent = items
  .reduce((s, a) => s + a.timeDeci, 0)
  .toFixed(1);

  $("cal-day-activities").innerHTML = items
  .map(
    a => `
    <tr>
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci}</td>
    <td>${a.notes || ""}</td>
    <td>
    <button onclick="edit(${a.id})">✏️</button>
    <button onclick="remove(${a.id})">🗑️</button>
    </td>
    </tr>`
  )
  .join("");
}

async function refreshList() {
  $("activities-table-body").innerHTML = (await getAll("activities"))
  .map(
    a => `
    <tr>
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci}</td>
    <td>${a.notes || ""}</td>
    <td>
    <button onclick="edit(${a.id})">✏️</button>
    <button onclick="remove(${a.id})">🗑️</button>
    </td>
    </tr>`
  )
  .join("");
}

window.edit = async id => {
  const a = await get("activities", id);
  $("edit-id").value = a.id;
  $("edit-date").value = a.date;
  $("edit-timeDeci").value = a.timeDeci;
  $("edit-notes").value = a.notes || "";
  $("modal-overlay").classList.remove("hidden");
  $("edit-modal").classList.remove("hidden");
};

window.remove = async id => {
  if (confirm("Eliminare attività?")) {
    await del("activities", id);
    renderCalendar();
    refreshList();
  }
};

$("edit-cancel").onclick = () => {
  $("modal-overlay").classList.add("hidden");
  $("edit-modal").classList.add("hidden");
};

$("form-edit-activity").onsubmit = async e => {
  e.preventDefault();
  await put("activities", {
    id: +$("edit-id").value,
            date: $("edit-date").value,
            timeDeci: +$("edit-timeDeci").value,
            notes: $("edit-notes").value
  });
  $("modal-overlay").classList.add("hidden");
  $("edit-modal").classList.add("hidden");
  renderCalendar();
  refreshList();
};

/**************************************************
 * INIT
 **************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  initAuth();
  await checkSession();

  await openDB();
  initTabs();
  initNew();
  renderCalendar();
  refreshList();
});
