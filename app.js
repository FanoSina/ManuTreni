// 🔥 FIREBASE CONFIG (INCALA IL TUO)
const firebaseConfig = {
  apiKey: "AIzaSyCqLfhYJLru8RVmVhOCmYWo1MDzNaOQGpQ",
  authDomain: "manutrain-aced7.firebaseapp.com",
  projectId: "manutrain-aced7",
  storageBucket: "manutrain-aced7.firebasestorage.app",
  messagingSenderId: "1031834557198",
  appId: "1:1031834557198:web:8b40c5379d2b682423955f"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const $ = id => document.getElementById(id);
let currentUser = null;
let activitiesCache = [];

/* AUTH */
$("login-form").onsubmit = async e => {
  e.preventDefault();
  try {
    await auth.signInWithEmailAndPassword(
      $("auth-email").value,
                                          $("auth-password").value
    );
  } catch (err) {
    $("auth-message").textContent = err.message;
  }
};

$("register-btn").onclick = async () => {
  try {
    await auth.createUserWithEmailAndPassword(
      $("auth-email").value,
                                              $("auth-password").value
    );
  } catch (err) {
    $("auth-message").textContent = err.message;
  }
};

$("logout-btn").onclick = () => auth.signOut();

auth.onAuthStateChanged(user => {
  if (!user) {
    $("auth-screen").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }
  currentUser = user;
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
  loadActivities();
});

/* TABS */
document.querySelectorAll(".tabs button").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".tabs button,.tab")
    .forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    $("tab-" + b.dataset.tab).classList.add("active");
  };
});

/* CRUD */
$("activity-form").onsubmit = async e => {
  e.preventDefault();
  await db.collection("activities").add({
    uid: currentUser.uid,
    date: $("a-date").value,
                                        model: $("a-model").value,
                                        train: $("a-train").value,
                                        time: Number($("a-time").value),
                                        notes: $("a-notes").value
  });
  loadActivities();
};

async function loadActivities() {
  const snap = await db.collection("activities")
  .where("uid", "==", currentUser.uid)
  .get();

  activitiesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAll();
  renderCalendar();
}

function renderAll() {
  $("all-activities").innerHTML = "";
  activitiesCache.forEach(a => {
    $("all-activities").innerHTML += `
    <tr>
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.train}</td>
    <td>${a.time}</td>
    <td>${a.notes || ""}</td>
    <td><button onclick="del('${a.id}')">🗑</button></td>
    </tr>`;
  });
}

function renderCalendar() {
  const grid = $("calendar-grid");
  grid.innerHTML = "";
  activitiesCache.forEach(a => {
    const d = document.createElement("div");
    d.textContent = a.date;
    d.onclick = () => showDay(a.date);
    grid.appendChild(d);
  });
}

function showDay(date) {
  $("day-title").textContent = date;
  $("day-activities").innerHTML = "";
  activitiesCache.filter(a => a.date === date).forEach(a => {
    $("day-activities").innerHTML += `
    <tr>
    <td>${a.model}</td>
    <td>${a.train}</td>
    <td>${a.time}</td>
    <td>${a.notes || ""}</td>
    <td><button onclick="del('${a.id}')">🗑</button></td>
    </tr>`;
  });
}

async function del(id) {
  await db.collection("activities").doc(id).delete();
  loadActivities();
}
