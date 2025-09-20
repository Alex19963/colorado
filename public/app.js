"use strict";

/* ===== TZ ===== */
const TZ = "Asia/Dushanbe";
const TZ_OFFSET = "+05:00";

/* ===== KEYS ===== */
const K = {
  employees: "co_employees",
  currentEmployee: "co_current_employee",
  shiftKey: (id) => `co_shift_active_${id}`,
  lastShiftKey: (id) => `co_shift_last_${id}`,
  historyKey: (id) => `co_shift_history_${id}`,
  tasksKey: (id, ymd) => `co_tasks_${id}_${ymd}`,
  admins: "co_admins",
  currentAdmin: "co_current_admin",
};

/* ===== utils ===== */
const $ = (s, r = document) => r.querySelector(s);
const jget = (k, fb = null) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; }
};
const jset = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
const hm  = (d) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour12:false, hour:"2-digit", minute:"2-digit" }).format(d);
const hhmm = (t) => hm(new Date(t));
const toMs = (dateStr, timeStr) => { const s = `${dateStr}T${(String(timeStr)||"00:00")}:00${TZ_OFFSET}`; const t = Date.parse(s); return Number.isFinite(t) ? t : NaN; };
const durHM = (ms) => { const m = Math.max(0, Math.round(ms/60000)); const h = Math.floor(m/60); const mm = String(m%60).padStart(2,"0"); return `${h}:${mm}`; };
const sumSegments = (segs=[]) => segs.reduce((s,g)=> s + Math.max(0,(g.to||Date.now()) - g.from), 0);
const cutoffEndMs = (ymdStr) => Date.parse(`${ymdStr}T00:00:00${TZ_OFFSET}`) + 27*60*60*1000;

function setText(sel, v){ const el=$(sel); if (el) el.textContent=v; }
function setVal(sel, v){ const el=$(sel); if (el) el.value=v; }
function on(sel, ev, fn){ const el=$(sel); if (el) el.addEventListener(ev, fn); }

/* ===== seed & migrate ===== */
function migrateAdmins(){
  let list = jget(K.admins, []);
  if (!Array.isArray(list)) list = [];
  if (!list.length) list = [{ id:1, name:"Администратор", username:"admin", password:"2222", active:1 }];
  list.forEach(a => { if (!a.username) a.username="admin"; a.username=String(a.username).toLowerCase(); if (a.active==null) a.active=1; });
  const seen = new Set(); list = list.filter(a => { const u=a.username; if (seen.has(u)) return false; seen.add(u); return true; });
  jset(K.admins, list);
}
function ensureSeed(){
  let emps = jget(K.employees, null);
  if (!Array.isArray(emps) || emps.length===0){
    jset(K.employees, [{ id:1, firstName:"Демо", lastName:"Сотрудник", password:"1111", active:1 }]);
  }
  let admins = jget(K.admins, null);
  if (!Array.isArray(admins) || admins.length===0){
    jset(K.admins, [{ id:1, name:"Администратор", username:"admin", password:"2222", active:1 }]);
  } else {
    migrateAdmins();
  }
}
window.CO_RESEED = () => { localStorage.clear(); ensureSeed(); alert("Демо-данные восстановлены."); };

/* ===== notify channel ===== */
let BC = null;
try{ BC = new BroadcastChannel("co_events"); }catch{ BC = null; }
function pingStorage(){ try{ localStorage.setItem("co__ping", String(Date.now())); }catch{} }
function notifyAll(type, payload){
  try{ fetch("/api/notify",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ type, ...(payload||{}) }) }).catch(()=>{}); }catch{}
  try{ BC?.postMessage({ type, ...(payload||{}) }); }catch{}
  pingStorage();
}

/* ===== router ===== */
document.addEventListener("DOMContentLoaded", () => {
  ensureSeed();
  const page = document.body.getAttribute("data-page");
  if (page === "index") initIndex();
  if (page === "employee") initEmployee();
  if (page === "admin-login") initAdminLogin();
  if (page === "admin") initAdmin();
});

/* ===== employee login ===== */
function initIndex(){
  const form = $("#empLoginForm"), pass = $("#empPass"), err = $("#empErr");
  if (!form || !pass) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault(); if (err) err.hidden = true;
    const p = String((pass.value||"").trim());
    const showBad = () => { err.textContent = "Неправильный пароль."; err.hidden = false; };
    if (p.length < 4){ showBad(); return; }
    const list = jget(K.employees, []);
    const emp  = list.find(x => String(x.password) === p && x.active);
    if (!emp){ showBad(); return; }
    const displayName = `${emp.firstName||""} ${emp.lastName||""}`.trim() || (emp.name||"Сотрудник");
    sessionStorage.setItem(K.currentEmployee, JSON.stringify({ id: emp.id, name: displayName }));
    location.href = "employee.html";
  });
}

/* ===== admin login ===== */
function initAdminLogin(){
  const form = $("#adminLoginForm"), user = $("#adminUser"), pass = $("#adminPass"), err = $("#adminErr");
  if (!form || !user || !pass) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault(); if (err) err.hidden = true;
    const u = String((user.value||"").trim().toLowerCase());
    const p = String((pass.value||"").trim());
    const showBad = () => { err.textContent = "Неправильный логин или пароль."; err.hidden = false; };
    if (u.length < 3 || p.length < 4){ showBad(); return; }
    const list = (jget(K.admins, [])).map(a => ({...a, username: String(a.username||"").toLowerCase()}));
    const admin = list.find(x => x.active && x.username === u && String(x.password) === p);
    if (!admin){ showBad(); return; }
    sessionStorage.setItem(K.currentAdmin, JSON.stringify({ id: admin.id, name: admin.name || admin.username || "Администратор" }));
    location.href = "admin.html";
  });
}

/* ===== admin panel ===== */
function initAdmin(){
  const me = parse(sessionStorage.getItem(K.currentAdmin));
  if (!me){ location.replace("admin-login.html"); return; }

  setText("#adminName", me.name || "—");
  on("#adminLogout","click",(e)=>{ e.preventDefault(); sessionStorage.removeItem(K.currentAdmin); location.href="admin-login.html"; });

  const tabs = $("#adminTabs");
  const panels = [...document.querySelectorAll("[data-tab-panel]")];

  function showTab(key){
    panels.forEach(p => p.hidden = (p.id !== `tab-${key}`));
    tabs.querySelectorAll("button[data-tab]").forEach(b => b.setAttribute("aria-current", b.dataset.tab===key ? "true" : "false"));
    if (key==="emp") renderEmpTab();
    if (key==="task") { renderBulkTaskList(); renderBulkPreview(); }
    if (key==="rep")  { fillRepSelects(); renderReport(); }
    if (key==="fire") fillFireSelect();
    if (key==="acc")  fillAccount();
  }
  tabs.addEventListener("click", (e)=>{ const b=e.target.closest("button[data-tab]"); if(!b) return; showTab(b.dataset.tab); });
  showTab("emp");

  function employees(){ return jget(K.employees, []).filter(x => x.active!==0); }
  function saveEmployees(list){ jset(K.employees, list); }
  function getActive(id){ return jget(K.shiftKey(id), null); }

  /* employees tab */
  function renderEmpTab(){
    renderEmpList();
    const form = $("#empAddForm"), btn = $("#empAddToggle"), cancel = $("#empAddCancel"), err = $("#empAddErr");
    if (btn) btn.onclick = ()=>{ form.hidden = !form.hidden; if (!form.hidden) $("#empFirst")?.focus(); };
    if (cancel) cancel.onclick = ()=>{ form.hidden = true; err.hidden = true; form.reset?.(); };
    form?.addEventListener("submit",(e)=>{
      e.preventDefault(); if (err) err.hidden = true;
      const first = String(($("#empFirst").value||"").trim());
      const last  = String(($("#empLast").value||"").trim());
      const pass  = String(($("#empPassNew").value||"").trim());
      if (first.length<2 || last.length<2){ err.textContent="Имя и фамилия минимум 2 символа."; err.hidden=false; return; }
      if (pass.length<4){ err.textContent="Пароль минимум 4 символа."; err.hidden=false; return; }
      const list = employees();
      if (list.some(e => String(e.password)===pass)){ err.textContent="Пароль уже используется."; err.hidden=false; return; }
      const nextId = (list.reduce((m,e)=> Math.max(m, e.id), 0) || 0) + 1;
      list.push({ id: nextId, firstName:first, lastName:last, password:pass, active:1 });
      saveEmployees(list);
      form.hidden = true; form.reset?.(); err.hidden=true;
      renderEmpList(); renderBulkTaskList(); renderBulkPreview(); fillRepSelects(); fillFireSelect();
      alert("Сотрудник добавлен.");
    });
  }

  function renderEmpList(){
    const box = $("#empList"), empty = $("#empEmpty");
    const list = employees();
    if (!box || !empty) return;
    if (!list.length){ empty.hidden=false; box.innerHTML=""; return; }
    empty.hidden=true; box.innerHTML="";
    for (const e of list){
      const row = document.createElement("div");
      row.className = "row-emp";

      const name = `${e.firstName||""} ${e.lastName||""}`.trim() || (e.name||"Сотрудник");
      const nameEl = document.createElement("div");
      nameEl.innerHTML = `<b>${name}</b><div class="muted" style="font-size:12px">Пароль: ${e.password||"—"}</div>`;

      const act = getActive(e.id);
      const onShift = !!(act && act.segments && !act.segments[act.segments.length-1]?.to && Date.now() <= cutoffEndMs(act.ymd));
      const firstStart = act?.segments?.[0]?.from || null;

      const dot = document.createElement("div");
      dot.className = `dot ${onShift ? "dot--green" : "dot--red"}`;
      dot.title = onShift ? "Смена идёт" : "Нет активной сессии";

      const startedEl = document.createElement("div"); startedEl.className="muted"; startedEl.textContent=`Начало первой сессии: ${firstStart ? hhmm(firstStart) : "—:—"}`;
      const idEl = document.createElement("div"); idEl.className="muted"; idEl.textContent=`ID: ${e.id}`;

      const btns = document.createElement("div"); btns.style.cssText="display:flex;gap:8px";
      const btnStart = document.createElement("button"); btnStart.type="button"; btnStart.className="btn"; btnStart.textContent="Начать";
      const btnStop  = document.createElement("button"); btnStop.type="button";  btnStop.className="btn"; btnStop.textContent="Закончить";
      const btnEdit  = document.createElement("button"); btnEdit.type="button";  btnEdit.className="btn"; btnEdit.textContent="Изменить";

      btnStop.disabled  = !onShift;

      btnStart.addEventListener("click", ()=>{ beginSegment(e.id); renderEmpList(); });
      btnStop .addEventListener("click", ()=>{ endSegment(e.id);   renderEmpList(); });
      btnEdit .addEventListener("click", ()=>{ openEmpEditor(e); });

      btns.appendChild(btnStart); btns.appendChild(btnStop); btns.appendChild(btnEdit);
      row.appendChild(nameEl); row.appendChild(dot); row.appendChild(startedEl); row.appendChild(idEl); row.appendChild(btns);
      box.appendChild(row);
    }
  }

  function openEmpEditor(emp){
    const first = prompt("Имя:", emp.firstName || "");
    if (first===null) return;
    const last  = prompt("Фамилия:", emp.lastName || "");
    if (last===null) return;
    let pass = prompt("Пароль (мин. 4):", String(emp.password||""));
    if (pass===null) return;
    pass = String(pass).trim();
    if (first.trim().length<2 || last.trim().length<2 || pass.length<4){ alert("Минимальные длины: имя 2, фамилия 2, пароль 4."); return; }
    const list = jget(K.employees, []).filter(x=>x.active!==0);
    if (list.some(e => e.id!==emp.id && String(e.password)===pass)){ alert("Пароль занят другим сотрудником."); return; }
    const idx = list.findIndex(x => x.id===emp.id);
    if (idx!==-1){
      list[idx].firstName = first.trim();
      list[idx].lastName  = last.trim();
      list[idx].password  = pass;
      jset(K.employees, list);
      renderEmpList(); renderBulkTaskList(); renderBulkPreview(); fillRepSelects(); fillFireSelect();
      alert("Данные сотрудника обновлены.");
    }
  }

  /* admin start/stop */
  function beginSegment(id){
    const now = Date.now();
    let act = getActive(id);
    if (act && now <= cutoffEndMs(act.ymd)){
      act.segments = act.segments || [];
      if (!act.segments.length || act.segments[act.segments.length-1].to){ act.segments.push({ from: now }); }
      jset(K.shiftKey(id), act);
      upsertHistory(id, act);
    } else {
      if (act && now > cutoffEndMs(act.ymd)){ finalizeShiftToHistory(id, act); act = null; }
      const y = ymd(new Date(now));
      act = { ymd: y, startedAt: now, segments:[{from: now}] };
      jset(K.shiftKey(id), act);
      upsertHistory(id, act);
    }
    notifyAll("shift-started", { employeeId: id });
    return act;
  }

  function endSegment(id){
    const now = Date.now();
    let act = getActive(id);
    if (!act) return null;
    act.segments = act.segments || [];
    if (!act.segments.length){ act.segments.push({from: act.startedAt}); }
    if (!act.segments[act.segments.length-1].to){ act.segments[act.segments.length-1].to = now; }
    act.startedAt = act.segments[0].from;
    jset(K.shiftKey(id), act);
    upsertHistory(id, act);
    if (now > cutoffEndMs(act.ymd)){
      finalizeShiftToHistory(id, act);
      localStorage.removeItem(K.shiftKey(id));
      jset(K.lastShiftKey(id), { endedAt: now });
    }
    notifyAll("shift-stopped", { employeeId: id });
    return act;
  }

  function upsertHistory(id, act){
    const key = K.historyKey(id);
    const hist = jget(key, []);
    const idx = hist.findIndex(r => r.ymd === act.ymd);
    const tasks = jget(K.tasksKey(id, act.ymd), []);
    const total = tasks.length;
    const done  = tasks.filter(t => t.done).length;
    const endedAt = (act.segments && act.segments[act.segments.length-1].to) || act.startedAt;
    const record = { ymd: act.ymd, startedAt: act.segments[0].from, endedAt, total, done, segments: act.segments };
    if (idx === -1) hist.push(record); else hist[idx] = record;
    jset(key, hist);
  }
  function finalizeShiftToHistory(id, act){
    act.segments = act.segments || [];
    if (!act.segments.length) act.segments.push({from: act.startedAt, to: Date.now()});
    if (!act.segments[act.segments.length-1].to) act.segments[act.segments.length-1].to = Date.now();
    upsertHistory(id, act);
  }

  /* bulk tasks */
  function renderBulkTaskList(){
    const box = $("#bulkTaskList");
    const list = employees(); if (!box) return; box.innerHTML = "";
    for (const e of list){
      const label = document.createElement("label");
      label.className = "choice";
      const cb = document.createElement("input"); cb.type="checkbox"; cb.value=String(e.id);
      const span = document.createElement("span"); span.textContent = `${e.firstName||""} ${e.lastName||""}`.trim() || (e.name||"Сотрудник");
      label.appendChild(cb); label.appendChild(span);
      box.appendChild(label);
    }
  }
  function renderBulkPreview(){
    const box = $("#bulkPreview"), empty=$("#bulkPreviewEmpty");
    if (!box || !empty) return;
    const list = employees();
    const day = ymd();
    let any = false;
    box.innerHTML = "";
    for (const e of list){
      const items = jget(K.tasksKey(e.id, day), []);
      if (!items.length) continue;
      any = true;
      const card = document.createElement("div");
      card.className = "rep-row";
      const header = document.createElement("div");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:8px";
      header.innerHTML = `<b>${(e.firstName||"")+" "+(e.lastName||"")}</b><span class="muted">${items.filter(t=>t.done).length}/${items.length}</span>`;
      const listBox = document.createElement("div");
      listBox.className = "tasks-box";
      listBox.style.display = "block";
      listBox.innerHTML = items.map(t => `
        <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed #222">
          <div>${t.text}</div><div class="muted">${t.source==="admin"?"админ":"сотр."} · ${t.done?"✓":"—"}</div>
        </div>`).join("");
      card.appendChild(header);
      card.appendChild(listBox);
      box.appendChild(card);
    }
    empty.hidden = any;
  }
  on("#bulkTaskForm","submit",(e)=>{
    e.preventDefault();
    const txt = ($("#bulkTaskText").value||"").trim();
    const err = $("#bulkTaskErr");
    const ids = [...document.querySelectorAll("#bulkTaskList input[type=checkbox]:checked")].map(c=>Number(c.value));
    if (txt.length<2){ err.textContent="Введите текст задания."; err.hidden=false; return; }
    if (!ids.length){ err.textContent="Выберите хотя бы одного сотрудника."; err.hidden=false; return; }
    err.hidden=true;
    const day = ymd();
    for (const id of ids){
      const key = K.tasksKey(id, day);
      const items = jget(key, []);
      items.push({ id: Date.now()+Math.floor(Math.random()*1e6), text: txt, done:0, source:"admin" });
      jset(key, items);
    }
    $("#bulkTaskText").value = "";
    document.querySelectorAll("#bulkTaskList input[type=checkbox]").forEach(c=>c.checked=false);
    renderBulkPreview();
    alert("Задание выдано.");
  });

  /* report */
  function fillRepSelects(){
    const sel = $("#repEmp"); const list = employees();
    if (!sel) return;
    sel.innerHTML = "";
    for (const e of list){
      const opt = document.createElement("option");
      opt.value = String(e.id);
      opt.textContent = `${e.firstName||""} ${e.lastName||""}`.trim() || (e.name||"Сотрудник");
      sel.appendChild(opt);
    }
    const mInp = $("#repMonth");
    if (mInp && !mInp.value){
      const d = new Date(); const m = String(d.getMonth()+1).padStart(2,"0");
      mInp.value = `${new Intl.DateTimeFormat("en", {timeZone:TZ, year:"numeric"}).format(d)}-${m}`;
    }
  }
  function monthRange(ym){
    const [Y,M] = ym.split("-").map(Number);
    const from = Date.parse(`${String(Y).padStart(4,"0")}-${String(M).padStart(2,"0")}-01T00:00:00${TZ_OFFSET}`);
    const to   = Date.parse(`${String(M===12?Y+1:Y).padStart(4,"0")}-${String(M===12?1:M+1).padStart(2,"0")}-01T00:00:00${TZ_OFFSET}`);
    const fromYMD = new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(from));
    const toYMD   = new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(to));
    return { fromYMD, toYMD };
  }
  function renderReport(){
    const empSel = $("#repEmp"); if (!empSel) return;
    const empId = Number(empSel.value);
    if (!empId){ $("#repEmpty").hidden=false; $("#repList").innerHTML=""; return; }
    const ymv = ($("#repMonth")?.value) || "";
    const {fromYMD, toYMD} = monthRange(ymv);
    const hist = jget(K.historyKey(empId), []).filter(r => r.ymd >= fromYMD && r.ymd < toYMD);
    const listBox = $("#repList"); const empty = $("#repEmpty");
    if (!hist.length){
      if (empty) empty.hidden=false; if (listBox) listBox.innerHTML="";
      setText("#repDays","0"); setText("#repHours","0:00"); setText("#repDone","0"); setText("#repTotal","0");
      return;
    }
    if (empty) empty.hidden=true; if (listBox) listBox.innerHTML="";
    const totalMs = hist.reduce((s,r)=> s + (r.segments ? sumSegments(r.segments) : Math.max(0,(r.endedAt||0)-(r.startedAt||0))), 0);
    const sumDone = hist.reduce((s,r)=> s + (r.done||0), 0);
    const sumTotal = hist.reduce((s,r)=> s + (r.total||0), 0);
    setText("#repDays", String(hist.length));
    setText("#repHours", durHM(totalMs));
    setText("#repDone", String(sumDone));
    setText("#repTotal", String(sumTotal));

    for (const r of hist.sort((a,b)=> (a.ymd > b.ymd ? -1:1))){
      const startedShown = r.segments?.[0]?.from ?? r.startedAt;
      const endedShown   = r.segments?.[r.segments.length-1]?.to ?? r.endedAt;

      const row = document.createElement("div"); row.className="rep-row"; row.dataset.day=r.ymd;
      const top = document.createElement("div"); top.className="rep-grid";
      const dEl = document.createElement("div"); dEl.innerHTML = `<b>${r.ymd}</b>`;
      const sEl = document.createElement("div"); sEl.textContent = `Начало: ${hhmm(startedShown)}`;
      const eEl = document.createElement("div"); eEl.textContent = `Конец: ${hhmm(endedShown)}`;
      const dur = document.createElement("div"); dur.className="muted";
      const durMs = r.segments ? sumSegments(r.segments) : Math.max(0,(endedShown||0)-(startedShown||0));
      dur.textContent = `Длительность: ${durHM(durMs)}`;
      const btns = document.createElement("div"); btns.style.cssText="display:flex;gap:8px;justify-content:flex-end";
      const edit = document.createElement("button"); edit.className="btn"; edit.type="button"; edit.textContent="Изменить";
      const show = document.createElement("button"); show.className="btn"; show.type="button"; show.textContent="Задания";
      btns.appendChild(edit); btns.appendChild(show);
      top.appendChild(dEl); top.appendChild(sEl); top.appendChild(eEl); top.appendChild(dur); top.appendChild(btns);
      row.appendChild(top);

      const tasksBox = document.createElement("div"); tasksBox.className="tasks-box"; tasksBox.hidden=true;
      row.appendChild(tasksBox);

      show.addEventListener("click", ()=>{
        if (!tasksBox.dataset.loaded){
          const items = jget(K.tasksKey(empId, r.ymd), []);
          tasksBox.innerHTML = items.length
            ? items.map(t => `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed #222">
                <div>${t.text}</div><div class="muted">${t.source==="admin"?"админ":"сотр."} · ${t.done?"✓":"—"}</div>
              </div>`).join("")
            : `<span class="muted">Заданий нет.</span>`;
          tasksBox.dataset.loaded = "1";
        }
        tasksBox.hidden = !tasksBox.hidden;
      });

      edit.addEventListener("click", ()=>{
        const topNow = row.firstElementChild;
        topNow.innerHTML = "";
        topNow.className = "rep-grid";
        const dEl2 = document.createElement("div"); dEl2.innerHTML = `<b>${r.ymd}</b>`;
        const sInput = document.createElement("input"); sInput.type="time"; sInput.className="inp"; sInput.value = hm(new Date(startedShown));
        const eInput = document.createElement("input"); eInput.type="time"; eInput.className="inp"; eInput.value = hm(new Date(endedShown));
        const warn = document.createElement("div"); warn.className="muted"; warn.textContent="Коррекция начала и конца смены";
        const btns2 = document.createElement("div"); btns2.style.cssText="display:flex;gap:8px;justify-content:flex-end";
        const save = document.createElement("button"); save.className="btn"; save.type="button"; save.textContent="Сохранить";
        const cancel = document.createElement("button"); cancel.className="btn"; cancel.type="button"; cancel.textContent="Отмена";
        btns2.appendChild(save); btns2.appendChild(cancel);
        topNow.appendChild(dEl2); topNow.appendChild(sInput); topNow.appendChild(eInput); topNow.appendChild(warn); topNow.appendChild(btns2);

        cancel.addEventListener("click", ()=> renderReport());
        save.addEventListener("click", ()=>{
          const sVal = (sInput.value||"00:00"); const eVal = (eInput.value||"00:00");
          let sMs = toMs(r.ymd, sVal); let eMs = toMs(r.ymd, eVal);
          if (isNaN(sMs)||isNaN(eMs)){ alert("Время некорректно."); return; }
          if (eMs <= sMs) eMs += 24*60*60*1000;
          const hist = jget(K.historyKey(empId), []);
          const idx = hist.findIndex(x=> x.ymd===r.ymd);
          if (idx!==-1){
            hist[idx].startedAt = sMs;
            hist[idx].endedAt = eMs;
            hist[idx].segments = [{ from: sMs, to: eMs }];
            jset(K.historyKey(empId), hist);
          }
          renderReport();
        });
      });

      listBox.appendChild(row);
    }
  }
  on("#repEmp","change",renderReport);
  on("#repMonth","change",renderReport);
  on("#repPrintBtn","click",()=> window.print());

  /* fire */
  function fillFireSelect(){
    const sel = $("#fireEmp"); if (!sel) return;
    sel.innerHTML = "";
    for (const e of jget(K.employees, []).filter(x=>x.active!==0)){
      const opt = document.createElement("option");
      opt.value = String(e.id);
      opt.textContent = `${e.firstName||""} ${e.lastName||""}`.trim() || (e.name||"Сотрудник");
      sel.appendChild(opt);
    }
  }
  on("#fireBtn","click", ()=>{
    const sel = $("#fireEmp"); const id = Number(sel?.value);
    if (!id) return;
    if (!confirm("Удалить ВСЕ данные сотрудника без возможности восстановления?")) return;

    const list = jget(K.employees, []).filter(e => e.id !== id);
    jset(K.employees, list);

    localStorage.removeItem(K.shiftKey(id));
    localStorage.removeItem(K.lastShiftKey(id));
    localStorage.removeItem(K.historyKey(id));
    const pref = `co_tasks_${id}_`;
    const keys = [];
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i); if (k && k.startsWith(pref)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));

    renderEmpList(); renderBulkTaskList(); renderBulkPreview(); fillRepSelects(); fillFireSelect();
    alert("Сотрудник и данные удалены.");
  });

  /* admin account */
  function fillAccount(){
    const me = parse(sessionStorage.getItem(K.currentAdmin));
    const list = jget(K.admins, []);
    const admin = list.find(a => a.id === me?.id);
    setVal("#adminUserCurrent", admin?.username || "");
    setVal("#adminUserNew",     admin?.username || "");
    setVal("#adminPassNew", "");
    setVal("#adminPassNew2", "");
    $("#adminCredsErr")?.setAttribute("hidden","");
  }
  on("#adminCredsForm","submit",(e)=>{
    e.preventDefault();
    const me = parse(sessionStorage.getItem(K.currentAdmin));
    const err = $("#adminCredsErr");
    const u = String(($("#adminUserNew").value||"").trim().toLowerCase());
    const p1 = String(($("#adminPassNew").value||"").trim());
    const p2 = String(($("#adminPassNew2").value||"").trim());
    if (u.length<3){ err.textContent="Логин минимум 3 символа."; err.hidden=false; return; }
    if (p1.length<4){ err.textContent="Пароль минимум 4 символа."; err.hidden=false; return; }
    if (p1!==p2){ err.textContent="Пароли не совпадают."; err.hidden=false; return; }
    const list = jget(K.admins, []);
    if (list.some(a => a.id!==me.id && String(a.username).toLowerCase()===u)){ err.textContent="Логин уже используется."; err.hidden=false; return; }
    const idx = list.findIndex(a => a.id===me.id);
    if (idx!==-1){
      list[idx].username = u;
      list[idx].password = p1;
      jset(K.admins, list);
      sessionStorage.setItem(K.currentAdmin, JSON.stringify({ id: list[idx].id, name: list[idx].name || u }));
      setText("#adminName", list[idx].name || u);
      err.hidden=true;
      alert("Данные учётки обновлены.");
    }
  });

  /* live refresh for admin */
  const refresh = () => {
    if (!document.querySelector("#tab-emp")?.hidden) renderEmpList?.();
    if (!document.querySelector("#tab-rep")?.hidden) renderReport?.();
  };
  try{
    const es = new EventSource("/api/events");
    es.addEventListener("shift-started", refresh);
    es.addEventListener("shift-stopped", refresh);
  }catch{}
  try{
    BC?.addEventListener("message", (ev)=>{ const t=ev.data?.type; if (t==="shift-started"||t==="shift-stopped") refresh(); });
  }catch{}
  window.addEventListener("storage", (e)=>{ if (e.key === "co__ping") refresh(); });
  window.addEventListener("focus", refresh);
}

/* ===== employee panel ===== */
function initEmployee(){
  const me = parse(sessionStorage.getItem(K.currentEmployee));
  if (!me){ location.replace("index.html"); return; }

  setText("#empName", me.name || "—");
  on("#logoutLink","click",(e)=>{ e.preventDefault(); sessionStorage.removeItem(K.currentEmployee); location.href="index.html"; });

  const startView   = $("#startView");
  const shiftView   = $("#shiftView");
  const startedAtEl = $("#startedAt");
  const endedAtRow  = $("#endedAtRow");
  const endedAtEl   = $("#endedAt");

  const shiftKey = K.shiftKey(me.id);
  const lastKey  = K.lastShiftKey(me.id);
  const histKey  = K.historyKey(me.id);

  const loadHistory = () => jget(histKey, []);
  const saveHistory = (arr) => jset(histKey, arr);

  const renderHistory = () => {
    const list = loadHistory();
    const box = $("#historyList"); const empty = $("#historyEmpty");
    if (!box || !empty) return;
    if (!list.length){ empty.hidden=false; box.innerHTML=""; return; }
    empty.hidden=true; box.innerHTML="";
    list.slice(-10).reverse().forEach(r=>{
      const first = r.segments?.[0]?.from ?? r.startedAt;
      const last  = r.segments?.[r.segments.length-1]?.to ?? r.endedAt;
      const row = document.createElement("div");
      row.style.cssText="display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line);background:#10141c;border-radius:12px;padding:8px 12px";
      const left = document.createElement("div"); left.className="muted"; left.textContent=`${r.ymd} · ${hhmm(first)}—${hhmm(last)}`;
      const right= document.createElement("div"); right.className="muted"; right.textContent=`выполнено ${r.done}/${r.total} · ${durHM(r.segments?sumSegments(r.segments):(last-first))}`;
      row.appendChild(left); row.appendChild(right); box.appendChild(row);
    });
  };

  function showStartOnly(){
    startView.hidden=false; shiftView.hidden=true;
    const last = jget(lastKey, null);
    if (last?.endedAt){ endedAtEl.textContent = hhmm(last.endedAt); endedAtRow.hidden=false; } else { endedAtRow.hidden=true; }
    renderHistory();
  }
  function showShiftUI(act){
    startView.hidden=true; shiftView.hidden=false;
    startedAtEl.textContent = hhmm(act.segments?.[0]?.from || act.startedAt);
    renderTasks(me.id);
  }

  function finalizeSelf(act){
    if (act && act.segments?.length && !act.segments[act.segments.length-1].to){
      act.segments[act.segments.length-1].to = Date.now();
    }
    localStorage.removeItem(shiftKey);
    jset(lastKey, { endedAt: Date.now() });
  }

  function beginSegmentSelf(){
    const now = Date.now();
    let act = jget(shiftKey, null);
    if (act && now > cutoffEndMs(act.ymd)){ finalizeSelf(act); act = null; }
    if (!act){
      const y = ymd(new Date(now));
      act = { ymd: y, startedAt: now, segments:[{from: now}] };
    } else {
      act.segments = act.segments || [];
      if (!act.segments.length || act.segments[act.segments.length-1].to){ act.segments.push({ from: now }); }
      act.startedAt = act.segments[0].from;
    }
    jset(shiftKey, act);
    showShiftUI(act);

    const tasks = jget(K.tasksKey(me.id, act.ymd), []);
    const record = { ymd: act.ymd, startedAt: act.startedAt, endedAt: act.startedAt, total: tasks.length, done: tasks.filter(t => t.done).length, segments: act.segments };
    const hist = loadHistory();
    const idx = hist.findIndex(r => r.ymd === act.ymd);
    if (idx === -1) hist.push(record); else hist[idx] = record;
    saveHistory(hist);

    notifyAll("shift-started", { employeeId: me.id });
  }

  function endSegmentSelf(){
    let act = jget(shiftKey, null);
    if (!act){ showStartOnly(); return; }
    const now = Date.now();
    act.segments = act.segments || [];
    if (!act.segments.length) act.segments.push({from: act.startedAt});
    if (!act.segments[act.segments.length-1].to) act.segments[act.segments.length-1].to = now;
    act.startedAt = act.segments[0].from;
    jset(shiftKey, act);

    const tasks = jget(K.tasksKey(me.id, act.ymd), []);
    const record = { ymd: act.ymd, startedAt: act.startedAt, endedAt: now, total: tasks.length, done: tasks.filter(t => t.done).length, segments: act.segments };
    const hist = loadHistory();
    const idx = hist.findIndex(r => r.ymd === act.ymd);
    if (idx === -1) hist.push(record); else hist[idx] = record;
    saveHistory(hist);

    if (now > cutoffEndMs(act.ymd)){ finalizeSelf(act); }
    showStartOnly();

    notifyAll("shift-stopped", { employeeId: me.id });
  }

  function syncFromEvent(type, employeeId){
    if (employeeId !== me.id) return;
    const now = Date.now();
    if (type === "shift-started"){
      let act = jget(shiftKey, null);
      if (!act || (act.segments?.[act.segments.length-1]?.to)){
        const y = ymd(new Date(now));
        act = { ymd:y, startedAt: now, segments:[{from: now}] };
        jset(shiftKey, act);
        const tasks = jget(K.tasksKey(me.id, act.ymd), []);
        const record = { ymd: act.ymd, startedAt: act.startedAt, endedAt: act.startedAt, total: tasks.length, done: tasks.filter(t => t.done).length, segments: act.segments };
        const hist = loadHistory(); const idx = hist.findIndex(r=>r.ymd===act.ymd);
        if (idx===-1) hist.push(record); else hist[idx]=record; saveHistory(hist);
      }
      showShiftUI(jget(shiftKey,null));
    }
    if (type === "shift-stopped"){
      let act = jget(shiftKey, null);
      if (act && !(act.segments?.[act.segments.length-1]?.to)){
        act.segments = act.segments || [];
        if (!act.segments.length) act.segments.push({from: act.startedAt});
        if (!act.segments[act.segments.length-1].to) act.segments[act.segments.length-1].to = now;
        act.startedAt = act.segments[0].from;
        jset(shiftKey, act);
        const tasks = jget(K.tasksKey(me.id, act.ymd), []);
        const record = { ymd: act.ymd, startedAt: act.startedAt, endedAt: now, total: tasks.length, done: tasks.filter(t => t.done).length, segments: act.segments };
        const hist = loadHistory(); const idx = hist.findIndex(r=>r.ymd===act.ymd);
        if (idx===-1) hist.push(record); else hist[idx]=record; saveHistory(hist);
      }
      showStartOnly();
    }
  }

  const act0 = jget(shiftKey, null);
  if (act0 && Date.now() <= cutoffEndMs(act0.ymd) && act0.segments?.length && !act0.segments[act0.segments.length-1].to){
    showShiftUI(act0);
  } else {
    showStartOnly();
  }

  on("#startShiftBtn","click", beginSegmentSelf);
  on("#stopShiftBtn","click",  endSegmentSelf);

  /* tasks */
  const tasksEmpty = $("#tasksEmpty");
  const taskList   = $("#taskList");
  function loadTasks(id, day = ymd()){ return (jget(K.tasksKey(id, day), [])).map(t => ({...t, done: t.done ? 1 : 0})); }
  function renderTasks(id){
    if (!taskList || !tasksEmpty) return;
    const day = ymd(); let items = loadTasks(id, day);
    const title = $("#shiftView h2"); const doneCount = items.filter(t => t.done).length;
    if (title) title.textContent = `Задания (${doneCount}/${items.length})`;
    if (!items.length){ tasksEmpty.hidden=false; taskList.innerHTML=""; return; }
    tasksEmpty.hidden=true; taskList.innerHTML="";
    items.sort((a,b)=> (a.done - b.done) || (a.id - b.id));
    for (const t of items){
      const row = document.createElement("div");
      row.dataset.id = String(t.id);
      row.dataset.source = t.source || "self";
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);background:#10141c;border-radius:12px;padding:10px 12px";
      const left = document.createElement("div"); left.style.cssText="display:flex;align-items:center;gap:10px;flex:1 1 auto;min-width:0";
      const toggle = document.createElement("button"); toggle.type="button"; toggle.dataset.action="toggle";
      toggle.setAttribute("aria-pressed", t.done ? "true" : "false");
      toggle.title = t.done ? "Отметить как невыполнено" : "Отметить как выполнено";
      toggle.style.cssText = `width:20px;height:20px;border-radius:6px;border:1px solid var(--line);background:${t.done ? "#1d3b24" : "transparent"};display:inline-flex;align-items:center;justify-content:center;cursor:pointer`;
      toggle.textContent = t.done ? "✓" : "";
      const textWrap = document.createElement("div"); textWrap.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0";
      const txt = document.createElement("div"); txt.className="task-text"; txt.textContent=t.text;
      txt.style.cssText = `color:var(--text);font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52vw;${t.done ? "text-decoration:line-through;opacity:.6" : ""}`;
      const badge = document.createElement("span"); badge.textContent = (t.source === "admin") ? "админ" : "ваше";
      badge.className = (t.source === "admin") ? "badge badge--admin" : "badge badge--self";
      textWrap.appendChild(txt); textWrap.appendChild(badge);
      left.appendChild(toggle); left.appendChild(textWrap);
      const actions = document.createElement("div"); actions.style.cssText="display:flex;gap:8px;flex:0 0 auto";
      if ((t.source||"self") === "self") {
        const edit = document.createElement("button"); edit.type="button"; edit.textContent="Изменить"; edit.dataset.action="edit"; edit.className="btn";
        const del  = document.createElement("button"); del.type="button";  del.textContent="Удалить";  del.dataset.action="delete"; del.className="btn btn-danger";
        actions.appendChild(edit); actions.appendChild(del);
      } else {
        const lock = document.createElement("span"); lock.textContent="от админа"; lock.className="muted"; actions.appendChild(lock);
      }
      row.appendChild(left); row.appendChild(actions); taskList.appendChild(row);
    }
  }
  on("#taskAddForm","submit", (e)=>{
    e.preventDefault();
    const text = ($("#taskText").value||"").trim(); if (text.length<2) return;
    const day = ymd(); const items = jget(K.tasksKey(me.id, day), []); items.push({ id: Date.now(), text, done:0, source:"self" });
    jset(K.tasksKey(me.id, day), items); $("#taskText").value=""; renderTasks(me.id);
  });
  taskList?.addEventListener("click",(e)=>{
    const btn = e.target.closest("button"); if (!btn) return;
    const row = btn.closest("[data-id]"); if (!row) return;
    const id = Number(row.dataset.id);
    const day = ymd();
    let items = jget(K.tasksKey(me.id, day), []);
    const idx = items.findIndex(t=>t.id===id);
    if (idx===-1) return;
    const action = btn.dataset.action;
    if (action==="toggle"){ items[idx].done = items[idx].done ? 0 : 1; }
    if (action==="delete" && (row.dataset.source||"self")==="self"){ items.splice(idx,1); }
    if (action==="edit"   && (row.dataset.source||"self")==="self"){
      const t = prompt("Изменить задание:", items[idx].text);
      if (t===null) return;
      const tt = String(t).trim(); if (tt.length<2) return;
      items[idx].text = tt;
    }
    jset(K.tasksKey(me.id, day), items);
    renderTasks(me.id);
  });

  try{
    const es = new EventSource("/api/events");
    es.addEventListener("shift-started", (ev)=>{ try{ const d=JSON.parse(ev.data||"{}"); syncFromEvent("shift-started", d.employeeId); }catch{} });
    es.addEventListener("shift-stopped", (ev)=>{ try{ const d=JSON.parse(ev.data||"{}"); syncFromEvent("shift-stopped", d.employeeId); }catch{} });
  }catch{}
  try{
    BC?.addEventListener("message",(ev)=>{ const t=ev.data?.type, id=ev.data?.employeeId; if (t==="shift-started"||t==="shift-stopped") syncFromEvent(t,id); });
  }catch{}
  window.addEventListener("storage",(e)=>{ if (e.key==="co__ping"){ const meId = me.id; const a = jget(K.shiftKey(meId), null); if (a && !a.segments?.[a.segments.length-1]?.to) showShiftUI(a); else showStartOnly(); }});
}
