const firebaseConfig = {
  apiKey: "AIzaSyCqLfhYJLru8RVmVhOCmYWo1MDzNaOQGpQ",
  authDomain: "manutrain-aced7.firebaseapp.com",
  projectId: "manutrain-aced7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const $ = id => document.getElementById(id);
let uid = null;
let settings = { models: [], trains:{}, scads:[], abils:[] };
let activities = [];
let procedures = [];

/* ---------- AUTH ---------- */
$("login").onclick = () =>
auth.signInWithEmailAndPassword($("email").value, $("password").value)
.catch(e => $("auth-msg").textContent = e.message);

$("register").onclick = () =>
auth.createUserWithEmailAndPassword($("email").value, $("password").value)
.catch(e => $("auth-msg").textContent = e.message);

$("logout").onclick = () => auth.signOut();

auth.onAuthStateChanged(async u => {
  if(!u){ $("auth").classList.remove("hidden"); $("app").classList.add("hidden"); return; }
  uid = u.uid;
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  await loadAll();
  renderAll();
});

/* ---------- DATA ---------- */
async function loadAll(){
  const s = await db.collection("users").doc(uid).get();
  if(!s.exists){
    settings = { models:["E464","TAF","POP","JAZZ","ROCK"], trains:{}, scads:[], abils:[] };
    settings.models.forEach(m=>settings.trains[m]=[]);
    await db.collection("users").doc(uid).set(settings);
  } else settings = s.data();

  activities = (await db.collection("users").doc(uid).collection("activities").get())
  .docs.map(d=>({id:d.id,...d.data()}));

  procedures = (await db.collection("users").doc(uid).collection("procedures").get())
  .docs.map(d=>({id:d.id,...d.data()}));
}

/* ---------- RENDER ---------- */
function renderAll(){
  renderSelects();
  renderCalendar();
  renderRegistry();
  renderProcedures();
  renderSettings();
}

function renderSelects(){
  [$("a-model"),$("p-model"),$("s-model-train")].forEach(sel=>{
    sel.innerHTML="";
    settings.models.forEach(m=>sel.add(new Option(m,m)));
  });
  $("a-scad").innerHTML=settings.scads.map(s=>`<option>${s}</option>`).join("");
  $("a-abil").innerHTML=settings.abils.map(a=>`<option>${a}</option>`).join("");
  $("p-scad").innerHTML=settings.scads.map(s=>`<option>${s}</option>`).join("");
}

/* ---------- ATTIVITÀ ---------- */
$("save-activity").onclick = async ()=>{
  const a={
    date:$("a-date").value,
    model:$("a-model").value,
    train:$("a-train").value,
    scad:$("a-scad").value,
    abil:$("a-abil").value,
    time:parseFloat($("a-time").value),
    notes:$("a-notes").value
  };
  await db.collection("users").doc(uid).collection("activities").add(a);
  await loadAll(); renderAll();
};

function renderCalendar(){
  const grid=$("calendar-grid"); grid.innerHTML="";
  activities.forEach(a=>{
    const d=document.createElement("div");
    d.textContent=`${a.date} ${a.time}`;
    grid.appendChild(d);
  });
}

function renderRegistry(){
  $("registry-list").innerHTML=
  activities.map(a=>`<li>${a.date} ${a.model} ${a.train} ${a.time}</li>`).join("");
}

/* ---------- PROCEDURE ---------- */
$("save-procedure").onclick=async()=>{
  const p={
    model:$("p-model").value,
    scad:$("p-scad").value,
    title:$("p-title").value,
    body:$("p-body").value
  };
  await db.collection("users").doc(uid).collection("procedures").add(p);
  await loadAll(); renderProcedures();
};

function renderProcedures(){
  $("procedure-list").innerHTML=
  procedures.map(p=>`<li>${p.model} – ${p.title}</li>`).join("");
}

/* ---------- SETTINGS ---------- */
$("add-model").onclick=async()=>{
  settings.models.push($("s-model").value);
  settings.trains[$("s-model").value]=[];
  await db.collection("users").doc(uid).set(settings);
  await loadAll(); renderSettings();
};

$("add-scad").onclick=async()=>{
  settings.scads.push($("s-scad").value);
  await db.collection("users").doc(uid).set(settings);
  await loadAll(); renderSettings();
};

$("add-abil").onclick=async()=>{
  settings.abils.push($("s-abil").value);
  await db.collection("users").doc(uid).set(settings);
  await loadAll(); renderSettings();
};

function renderSettings(){
  $("models-list").innerHTML=settings.models.map(m=>`<li>${m}</li>`).join("");
  $("scads-list").innerHTML=settings.scads.map(s=>`<li>${s}</li>`).join("");
  $("abils-list").innerHTML=settings.abils.map(a=>`<li>${a}</li>`).join("");
}

/* ---------- BACKUP ---------- */
$("backup").onclick=()=>{
  const data={settings,activities,procedures};
  const blob=new Blob([JSON.stringify(data)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="backup.json";
  a.click();
};

$("restore-btn").onclick=async()=>{
  const f=$("restore").files[0];
  const data=JSON.parse(await f.text());
  await db.collection("users").doc(uid).set(data.settings);
};
