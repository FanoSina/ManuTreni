let db;
let currentMonth = new Date();
const $ = id => document.getElementById(id);

function openDB(){
  return new Promise(res=>{
    const r = indexedDB.open("treniDB",1);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      d.createObjectStore("activities",{keyPath:"id",autoIncrement:true});
      d.createObjectStore("trainIds",{keyPath:"name"});
      d.createObjectStore("scadenze",{keyPath:"name"});
      d.createObjectStore("abilitazioni",{keyPath:"name"});
    };
    r.onsuccess = e => { db=e.target.result; res(); };
  });
}

const getAll = s => new Promise(r=>db.transaction(s).objectStore(s).getAll().onsuccess=e=>r(e.target.result));
const add = (s,o)=>new Promise(r=>db.transaction(s,"readwrite").objectStore(s).add(o).onsuccess=r);
const put = (s,o)=>new Promise(r=>db.transaction(s,"readwrite").objectStore(s).put(o).onsuccess=r);
const del = (s,k)=>new Promise(r=>db.transaction(s,"readwrite").objectStore(s).delete(k).onsuccess=r);
const get = (s,k)=>new Promise(r=>db.transaction(s).objectStore(s).get(k).onsuccess=e=>r(e.target.result));

function initTabs(){
  document.querySelectorAll(".tabs button").forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll(".tabs button,.tab").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      $("tab-"+b.dataset.tab).classList.add("active");
      if(b.dataset.tab==="calendar")renderCalendar();
      if(b.dataset.tab==="list")refreshList();
    };
  });
}

function initNew(){
  $("input-date").value=new Date().toISOString().split("T")[0];
  $("form-new-activity").onsubmit=async e=>{
    e.preventDefault();
    await add("activities",{
      date:$("input-date").value,
              model:$("input-model").value,
              trainId:$("input-trainId").value,
              scadenza:$("input-scadenza").value,
              abilitazione:$("input-abilitazione").value,
              timeDeci:parseFloat($("input-timeDeci").value.replace(",",".")),
              notes:$("input-notes").value
    });
    renderCalendar(); refreshList();
  };
}

async function renderCalendar(){
  const grid=$("calendar-grid");
  const label=$("cal-month-label");
  const y=currentMonth.getFullYear(), m=currentMonth.getMonth();
  label.textContent=currentMonth.toLocaleDateString("it-IT",{month:"long",year:"numeric"});
  grid.innerHTML="";
  ["L","M","M","G","V","S","D"].forEach(d=>grid.innerHTML+=`<div class="cal-cell cal-header">${d}</div>`);
  const first=new Date(y,m,1), start=(first.getDay()+6)%7, days=new Date(y,m+1,0).getDate();
  for(let i=0;i<start;i++)grid.innerHTML+=`<div class="cal-cell cal-empty"></div>`;
  const all=await getAll("activities"), map={};
  all.forEach(a=>(map[a.date]=map[a.date]||[]).push(a));
  for(let d=1;d<=days;d++){
    const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const items=map[ds]||[];
    const tot=items.reduce((s,a)=>s+a.timeDeci,0);
    grid.innerHTML+=`
    <div class="cal-cell cal-day ${items.length?'has-activities':''}"
    onclick="showDay('${ds}')">
    <span class="cal-day-number">${d}</span>
    <span class="cal-day-hours">${tot?tot.toFixed(1):""}</span>
    </div>`;
  }
}

async function showDay(d){
  const items=(await getAll("activities")).filter(a=>a.date===d);
  $("cal-day-title").textContent=d;
  $("cal-day-hours").textContent=items.reduce((s,a)=>s+a.timeDeci,0).toFixed(1);
  $("cal-day-activities").innerHTML=items.map(a=>`
  <tr>
  <td>${a.model}</td>
  <td>${a.trainId}</td>
  <td>${a.scadenza}</td>
  <td>${a.abilitazione}</td>
  <td>${a.timeDeci}</td>
  <td>${a.notes||""}</td>
  <td>
  <button onclick="edit(${a.id})">✏️</button>
  <button onclick="remove(${a.id})">🗑️</button>
  </td>
  </tr>`).join("");
}

async function refreshList(){
  $("activities-table-body").innerHTML=(await getAll("activities")).map(a=>`
  <tr>
  <td>${a.date}</td>
  <td>${a.model}</td>
  <td>${a.trainId}</td>
  <td>${a.scadenza}</td>
  <td>${a.abilitazione}</td>
  <td>${a.timeDeci}</td>
  <td>${a.notes||""}</td>
  <td>
  <button onclick="edit(${a.id})">✏️</button>
  <button onclick="remove(${a.id})">🗑️</button>
  </td>
  </tr>`).join("");
}

window.edit=async id=>{
  const a=await get("activities",id);
  $("edit-id").value=a.id;
  $("edit-date").value=a.date;
  $("edit-timeDeci").value=a.timeDeci;
  $("edit-notes").value=a.notes||"";
  $("modal-overlay").classList.remove("hidden");
  $("edit-modal").classList.remove("hidden");
};

window.remove=async id=>{
  if(confirm("Eliminare attività?")){
    await del("activities",id);
    renderCalendar(); refreshList();
  }
};

$("edit-cancel").onclick=()=>{
  $("modal-overlay").classList.add("hidden");
  $("edit-modal").classList.add("hidden");
};

$("form-edit-activity").onsubmit=async e=>{
  e.preventDefault();
  await put("activities",{
    id:+$("edit-id").value,
            date:$("edit-date").value,
            timeDeci:+$("edit-timeDeci").value,
            notes:$("edit-notes").value
  });
  $("modal-overlay").classList.add("hidden");
  $("edit-modal").classList.add("hidden");
  renderCalendar(); refreshList();
};

document.addEventListener("DOMContentLoaded",async()=>{
  await openDB();
  initTabs();
  initNew();
  renderCalendar();
  refreshList();
});
