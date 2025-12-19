let activities = JSON.parse(localStorage.getItem("activities") || "[]");

function save() {
  localStorage.setItem("activities", JSON.stringify(activities));
}

function render() {
  const cal = document.getElementById("calendar-body");
  const reg = document.getElementById("registry-body");
  cal.innerHTML = "";
  reg.innerHTML = "";

  activities.forEach((a, i) => {
    const row = `
    <tr>
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.train}</td>
    <td>${a.deadline}</td>
    <td>${a.cert}</td>
    <td>${a.hours}</td>
    <td>${a.notes}</td>
    <td><button onclick="edit(${i})">✏️</button></td>
    </tr>
    `;
    cal.innerHTML += row;
    reg.innerHTML += row;
  });
}

document.getElementById("activity-form").onsubmit = e => {
  e.preventDefault();

  activities.push({
    date: date.value,
    model: model.value,
    train: train.value,
    deadline: deadline.value,
    cert: cert.value,
    hours: hours.value,
    notes: notes.value
  });

  save();
  render();
  e.target.reset();
};

function edit(i) {
  modal.classList.remove("hidden");
  editId.value = i;
  editHours.value = activities[i].hours;
  editNotes.value = activities[i].notes;
}

saveEdit.onclick = () => {
  const i = editId.value;
  activities[i].hours = editHours.value;
  activities[i].notes = editNotes.value;
  save();
  render();
  modal.classList.add("hidden");
};

deleteEdit.onclick = () => {
  activities.splice(editId.value, 1);
  save();
  render();
  modal.classList.add("hidden");
};

document.querySelectorAll(".tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  };
});

render();
