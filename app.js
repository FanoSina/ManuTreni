/* ---------- STORAGE ---------- */
const load = k => JSON.parse(localStorage.getItem(k) || "[]");
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let activities = load("activities");
let models = load("models");
let trains = load("trains");
let scadenze = load("scadenze");
let abilitazioni = load("abilitazioni");

/* ---------- TABS ---------- */
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  };
});

/* ---------- SETTINGS ---------- */
function refreshModels() {
  const lists = [
    ["models-list", models],
    ["s-train-model", models, true],
    ["s-scad-model", models, true],
    ["s-abil-model", models, true],
    ["a-model", models, true]
  ];

  lists.forEach(([id, arr, select]) => {
    const el = document.getElementById(id);
    el.innerHTML = "";
    arr.forEach(m => {
      if (select) {
        const o = document.createElement("option");
        o.textContent = m;
        el.appendChild(o);
      } else {
        const li = document.createElement("li");
        li.textContent = m;
        el.appendChild(li);
      }
    });
  });

  refreshDependent();
}

function refreshDependent() {
  const model = document.getElementById("a-model").value;
  const fill = (id, arr) => {
    const el = document.getElementById(id);
    el.innerHTML = "";
    arr.filter(x => x.model === model).forEach(x => {
      const o = document.createElement("option");
      o.textContent = x.name;
      el.appendChild(o);
    });
  };

  fill("a-train", trains);
  fill("a-scadenza", scadenze);
  fill("a-abilitazione", abilitazioni);
}

document.getElementById("add-model").onclick = () => {
  const v = s_model.value.trim();
  if (v) {
    models.push(v);
    save("models", models);
    refreshModels();
  }
};

function bindAdd(btn, input, arr, key) {
  btn.onclick = () => {
    const model = document.getElementById(`s-${key}-model`).value;
    const val = input.value.trim();
    if (val) {
      arr.push({ model, name: val });
      save(key, arr);
      refreshDependent();
    }
  };
}

bindAdd(add_train, s_train, trains, "train");
bindAdd(add_scadenza, s_scadenza, scadenze, "scad");
bindAdd(add_abilitazione, s_abilitazione, abilitazioni, "abil");

/* ---------- ACTIVITIES ---------- */
activity_form.onsubmit = e => {
  e.preventDefault();
  activities.push({
    date: a_date.value,
    model: a_model.value,
    train: a_train.value,
    scadenza: a_scadenza.value,
    abilitazione: a_abilitazione.value,
    hours: +a_hours.value,
    notes: a_notes.value
  });
  save("activities", activities);
  renderAll();
  activity_form.reset();
};

/* ---------- CALENDAR ---------- */
let current = new Date();

function renderCalendar() {
  const grid = calendar_grid;
  grid.innerHTML = "";
  month_label.textContent = current.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const year = current.getFullYear();
  const month = current.getMonth();
  const days = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= days; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.textContent = d;
    cell.onclick = () => selectDay(date, cell);
    grid.appendChild(cell);
  }
}

function selectDay(date, cell) {
  document.querySelectorAll(".calendar-grid div").forEach(c => c.classList.remove("active-day"));
  cell.classList.add("active-day");

  day_title.textContent = `Attività del ${date}`;
  const list = activities.filter(a => a.date === date);
  day_body.innerHTML = "";
  let tot = 0;

  list.forEach((a, i) => {
    tot += a.hours;
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.model}</td>
    <td>${a.train}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.hours}</td>
    <td><button onclick="openEdit(${activities.indexOf(a)})">✏️</button></td>
    `;
    day_body.appendChild(tr);
  });

  day_total.textContent = tot.toFixed(1);
}

prev_month.onclick = () => { current.setMonth(current.getMonth() - 1); renderCalendar(); };
next_month.onclick = () => { current.setMonth(current.getMonth() + 1); renderCalendar(); };

/* ---------- REGISTRY ---------- */
function renderRegistry() {
  registry_body.innerHTML = "";
  activities.forEach((a, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.train}</td>
    <td>${a.hours}</td>
    <td>${a.notes || ""}</td>
    <td><button onclick="openEdit(${i})">✏️</button></td>
    `;
    registry_body.appendChild(tr);
  });
}

/* ---------- MODAL ---------- */
function openEdit(i) {
  modal.classList.remove("hidden");
  edit_index.value = i;
  edit_hours.value = activities[i].hours;
  edit_notes.value = activities[i].notes;
}

save_edit.onclick = () => {
  const i = edit_index.value;
  activities[i].hours = +edit_hours.value;
  activities[i].notes = edit_notes.value;
  save("activities", activities);
  modal.classList.add("hidden");
  renderAll();
};

delete_edit.onclick = () => {
  activities.splice(edit_index.value, 1);
  save("activities", activities);
  modal.classList.add("hidden");
  renderAll();
};

close_modal.onclick = () => modal.classList.add("hidden");

/* ---------- INIT ---------- */
function renderAll() {
  renderCalendar();
  renderRegistry();
}

refreshModels();
renderAll();
