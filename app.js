/**************** FIREBASE ****************/
firebase.initializeApp({
  apiKey: "AIzaSyCqLfhYJLru8RVmVhOCmYWo1MDzNaOQGpQ",
  authDomain: "manutrain-aced7.firebaseapp.com",
  projectId: "manutrain-aced7"
});

const auth = firebase.auth();
const db = firebase.firestore();

/**************** HELPERS ****************/
const $ = id => document.getElementById(id);
const norm = v => (v||"").trim();
const toDeci = v => {
  const n = parseFloat(norm(v).replace(",","."));
  return isNaN(n) ? null : Math.round(n*10)/10;
};
const today = () => new Date().toISOString().split("T")[0];

/**************** STATE ****************/
let user = null;
let settings = {
  models: ["E464","TAF","POP","JAZZ","ROCK"],
  trains: {},
  scadenze: [],
  abilitazioni: []
};
let activities = [];
let currentMonth = new Date();

/**************** AUTH ****************/
$("btn-login").onclick = () =>
auth.signInWithEmailAndPassword(
  $("auth-email").value,
                                $("auth-password").value
).catch(e=>$("auth-msg").textContent=e.message);

$("btn-register").onclick = () =>
auth.createUserWithEmailAndPassword(
  $("auth-email").value,
                                    $("auth-password").value
).catch(e=>$("auth-msg").textContent=e.message);

$("btn-logout").onclick = ()=>auth.signOut();

/**************** AUTH STATE ****************/
auth.onAuthStateChanged(async u=>{
  if(!u){
    $("auth-screen").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }
  user=u;
  $("auth-screen").classList.add("hidden");
  $("app").classList.remove("hidden");

  await loadSettings();
  await loadActivities();
  initUI();
});

/**************** SETTINGS ****************/
async function loadSettings(){
  const ref=db.collection("users").doc(user.uid);
  const snap=await ref.get();
  if(!snap.exists){
    settings.models.forEach(m=>settings.trains[m]=[]);
    await ref.set({settings});
  } else {
    settings=snap.data().settings;
  }
}

async function saveSettings(){
  await db.collection("users").doc(user.uid).set({settings});
}

/**************** ACTIVITIES ****************/
async function loadActivities(){
  const snap=await db.collection("users").doc(user.uid)
  .collection("activities").get();
  activities=snap.docs.map(d=>({id:d.id,...d.data()}));
}

async function addActivity(a){
  await db.collection("users").doc(user.uid)
  .collection("activities").add(a);
  await loadActivities();
}

/**************** UI ****************/
function initUI(){
  // tabs
  document.querySelectorAll(".tabs button").forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));
      document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
      b.classList.add("active");
      $("tab-"+b.dataset.tab).classList.add("active");
      if(b.dataset.tab==="calendar") renderCalendar();
      if(b.dataset.tab==="registry") renderRegistry();
    };
  });

  // new activity
  $("n-date").value=today();
  refreshModelSelects();

  $("n-model").onchange=refreshNewForm;

  $("form-new").onsubmit=async e=>{
    e.preventDefault();
    const a={
      date:$("n-date").value,
      model:$("n-model").value,
      trainId:$("n-train").value,
      scadenza:$("n-scadenza").value,
      abilitazione:$("n-abilitazione").value,
      timeDeci:toDeci($("n-timeDeci").value),
      notes:norm($("n-notes").value)
    };
    if(a.timeDeci==null) return alert("Tempo non valido");
    await addActivity(a);
    renderCalendar();
    renderRegistry();
    e.target.reset();
    $("n-date").value=today();
  };

  // settings models
  $("s-add-model").onclick=async ()=>{
    const m=norm($("s-model-name").value);
    if(!m||settings.models.includes(m))return;
    settings.models.push(m);
    settings.trains[m]=[];
    await saveSettings();
    renderSettings();
    refreshModelSelects();
  };

  $("s-models-list").onclick=async e=>{
    const m=e.target.dataset.model;
    if(!m)return;
    if(!confirm("Rimuovere modello?"))return;
    settings.models=settings.models.filter(x=>x!==m);
    delete settings.trains[m];
    await saveSettings();
    renderSettings();
    refreshModelSelects();
  };

  renderSettings();
  renderCalendar();
  renderRegistry();
}

function refreshModelSelects(){
  ["n-model","s-train-model"].forEach(id=>{
    const sel=$(id); sel.innerHTML="";
    settings.models.forEach(m=>sel.appendChild(new Option(m,m)));
  });
  refreshNewForm();
}

function refreshNewForm(){
  const m=$("n-model").value;
  $("n-train").innerHTML="";
  (settings.trains[m]||[]).forEach(t=>$("n-train").appendChild(new Option(t,t)));
  $("n-scadenza").innerHTML="";
  settings.scadenze.forEach(s=>$("n-scadenza").appendChild(new Option(s,s)));
  $("n-abilitazione").innerHTML="";
  settings.abilitazioni.forEach(a=>$("n-abilitazione").appendChild(new Option(a,a)));
}

/**************** CALENDAR ****************/
function renderCalendar(){
  $("cal-month-label").textContent=currentMonth.toLocaleDateString("it",{month:"long",year:"numeric"});
  const grid=$("calendar-grid"); grid.innerHTML="";
  const days=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,0).getDate();
  for(let d=1;d<=days;d++){
    const cell=document.createElement("div");
    cell.textContent=d;
    grid.appendChild(cell);
  }
}

/**************** REGISTRY ****************/
function renderRegistry(){
  const tb=$("registry-rows"); tb.innerHTML="";
  activities.forEach(a=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
    <td>${a.date}</td>
    <td>${a.model}</td>
    <td>${a.trainId}</td>
    <td>${a.scadenza}</td>
    <td>${a.abilitazione}</td>
    <td>${a.timeDeci}</td>
    <td>${a.notes||""}</td>
    <td></td>`;
    tb.appendChild(tr);
  });
}
