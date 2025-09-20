import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE  = path.join(DATA_DIR, "db.json");

const SEED = {
  admins: [{ id:1, username:"admin", name:"Администратор", password:"2222", active:1 }],
  employees: [{ id:1, firstName:"Демо", lastName:"Сотрудник", password:"1111", active:1 }],
  tasks: [],   // {id, employeeId, ymd, text, done(0/1), source:'admin'|'self'}
  shifts: []   // {id, employeeId, ymd, startedAt, endedAt, segments:[{from,to?}]}
};

function ensureFile(){
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive:true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(SEED, null, 2), "utf8");
}
ensureFile();

function readDB(){
  try{
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);
    if (!Array.isArray(db.admins)) db.admins = [];
    if (!Array.isArray(db.employees)) db.employees = [];
    if (!Array.isArray(db.tasks)) db.tasks = [];
    if (!Array.isArray(db.shifts)) db.shifts = [];
    return db;
  }catch{
    fs.writeFileSync(DB_FILE, JSON.stringify(SEED, null, 2), "utf8");
    return JSON.parse(JSON.stringify(SEED));
  }
}

function writeDB(db){
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}

export function reseed(){ writeDB(SEED); return readDB(); }
export function getAll(){ return readDB(); }
export function saveAll(db){ writeDB(db); }
export function ymd(d=new Date()){ const Y=d.getFullYear(); const M=String(d.getMonth()+1).padStart(2,"0"); const D=String(d.getDate()).padStart(2,"0"); return `${Y}-${M}-${D}`; }
export function cutoffEndMs(ymdStr){ const [Y,M,D]=ymdStr.split("-").map(Number); return new Date(Y,M-1,D+1,3,0,0,0).getTime(); }

export function upsertShiftSegment(db, employeeId, nowMs){
  const day = ymd(new Date(nowMs));
  let act = db.shifts.find(s => s.employeeId===employeeId && s.ymd===day);
  if (!act){
    const prev = new Date(nowMs); prev.setDate(prev.getDate()-1);
    const yPrev = ymd(prev);
    const prevShift = db.shifts.find(s => s.employeeId===employeeId && s.ymd===yPrev);
    if (prevShift && nowMs <= cutoffEndMs(yPrev)) act = prevShift;
  }
  if (!act){
    act = { id: (db.shifts.reduce((m,e)=>Math.max(m,e.id||0),0)||0)+1,
            employeeId, ymd:day, startedAt: nowMs, endedAt: nowMs, segments:[{from:nowMs}] };
    db.shifts.push(act); return act;
  }
  act.segments ||= [];
  if (!act.segments.length || act.segments.at(-1).to) act.segments.push({ from: nowMs });
  act.startedAt = act.segments[0].from;
  act.endedAt   = act.segments.at(-1).to ?? nowMs;
  return act;
}

export function stopShiftSegment(db, employeeId, nowMs){
  let act = db.shifts.find(s => s.employeeId===employeeId && s.segments?.length && !s.segments.at(-1).to && nowMs <= cutoffEndMs(s.ymd));
  if (!act) return null;
  const last = act.segments.at(-1); if (!last.to) last.to = nowMs;
  act.startedAt = act.segments[0].from; act.endedAt = last.to; return act;
}

export function ensureAdminUnique(db){
  const seen = new Set();
  db.admins = db.admins.filter(a=>{
    const u = String(a.username||"").toLowerCase();
    if (!u || seen.has(u)) return false;
    seen.add(u); return true;
  });
}
