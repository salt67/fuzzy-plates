import { fuzzyMatch } from "./fuzzyPlates.js";

const STORAGE_KEY = "fuzzyPlateData";
const EXPIRY_HOURS = 12;
const VEHICLE_FIELDS = ["color","make","model"];

let firstLoadedAt = null;
let userPlates = new Map();

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString();  // or customize
}

function normalizePlateKey(str) {
  return str.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function extractVehicleSummary(rows) {
  const vals = {color:new Set(),make:new Set(),model:new Set()};

  for (const r of rows) {
    for (const f of VEHICLE_FIELDS) {
      const key = Object.keys(r.data).find(k => k.trim().toLowerCase() === f);
      if (!key) continue;
      const v = r.data[key]?.trim();
      if (v) vals[f].add(v);
    }
  }

  return [vals.color, vals.make, vals.model]
    .map(set => set.size ? [...set].join("/") : "")
    .filter(Boolean)
    .join(" ");
}

const defaultPlates = [
  "XYZ999",
  "Q0Q-8B8",
  "ABC I23",
  "AB0-123",
  "ABC123",
  "E0CKICF"
];

function currentPlates() {
  if (userPlates.size) {
    return Array.from(userPlates.keys()).reverse();
  }
  return [...defaultPlates].reverse(); // default too
}

function savePlates() {
  if (!userPlates.size) return;

  const payload = {
    savedAt: Date.now(),
    loadedAt: firstLoadedAt,
    entries: [...userPlates.entries()]
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadSaved() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const { savedAt, loadedAt, entries } = JSON.parse(raw);
    if ((Date.now()-savedAt)/36e5 > EXPIRY_HOURS) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    userPlates = new Map(entries);
    firstLoadedAt = loadedAt;
    document.getElementById("loadStatus").textContent =
      `Loaded ${userPlates.size} unique plates, entered at ${formatTimestamp(firstLoadedAt)}`;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function parsePlain(text) {
  const map = new Map();
  text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).forEach((p,i)=>{
    const key = normalizePlateKey(p);
    if (!key) return;
    if (!map.has(key)) map.set(key,{plate:p,rows:[]});
    map.get(key).rows.push({line:i+1,data:{Raw:p}});
  });
  return map;
}

function parseTSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(/\t/).map(h=>h.trim());
  const rows = lines.slice(1);
  let idx = headers.findIndex(h=>/plate/i.test(h));
  if (idx<0) idx = 0;

  const map = new Map();
  rows.forEach((line,i)=>{
    const cols = line.split(/\t/);
    const raw = cols[idx];
    if (!raw) return;
    const key = normalizePlateKey(raw);
    if (!key) return;
    if (!map.has(key)) map.set(key,{plate:raw,rows:[]});
    const obj={};
    headers.forEach((h,j)=>obj[h]=cols[j]?.trim()||"");
    map.get(key).rows.push({line:i+2,data:obj});
  });

  return map;
}

function loadUserPlates() {

  // remove blank rows
  let raw = plateInput.value;
  const cleaned = raw
    .split(/\r?\n/)
    .filter(line => line.trim() !== "")   // keep rows with any real content
    .join("\n");
  plateInput.value = cleaned;
  if (!cleaned) return;

  const isTSV = cleaned.includes("\t");
  userPlates = isTSV ? parseTSV(cleaned) : parsePlain(cleaned);

  firstLoadedAt = Date.now();
  savePlates();

  loadStatus.textContent =
    `Loaded ${userPlates.size} unique plates, entered at ${formatTimestamp(firstLoadedAt)}`;

  render();
}

clearStoredPlates.addEventListener("click", ()=>{
  localStorage.removeItem(STORAGE_KEY);
  userPlates.clear();
  plateInput.value="";
  loadStatus.textContent="Cleared saved plates";
  firstLoadedAt = null;
  render();
});

function render() {
  let foundAny = false;
  const q = searchInput.value;
  const ul = results;
  ul.innerHTML = "";

  currentPlates().forEach(key=>{
    const r = fuzzyMatch(key,q);
    if (!r.match) return;

    foundAny = true;

    const li=document.createElement("li");
    const info=userPlates.get(key);

    if (!info) {
      li.innerHTML = `<div style="font-family:monospace;font-size:1.4rem;font-weight:bold">${r.rendered}</div>`;
      ul.appendChild(li);
      return;
    }

    const details=document.createElement("details");
    const summary=document.createElement("summary");
    summary.innerHTML = r.rendered;

    const sumLine = extractVehicleSummary(info.rows);
    if (sumLine) {
      const m=document.createElement("div");
      m.className="sum-line";
      m.textContent=sumLine;
      summary.appendChild(m);
    }

    details.appendChild(summary);

    info.rows.forEach(row=>{
      const d=document.createElement("div");
      d.className="details-meta";
      const fields = Object.entries(row.data)
            .filter(([_,v])=>v && v.trim())
            .map(([k,v])=>`${k}=${v}`)
            .join(" | ");
      d.textContent = `Line ${row.line}: ${fields}`;
      details.appendChild(d);
    });

    li.appendChild(details);
    ul.appendChild(li);
  });

  if (!foundAny && q.trim() !== "") {
    const li = document.createElement("li");
    li.textContent = "No matching results";
    li.style.color = "#888";
    li.style.fontSize = "1rem";
    li.style.padding = "8px 0 0 0";
    ul.appendChild(li);
  }  
}

loadBtn.addEventListener("click", loadUserPlates);
searchInput.addEventListener("input", render);

loadSaved();
render();
