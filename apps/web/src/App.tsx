// apps/web/src/App.tsx
import React, { useEffect, useState } from 'react'

const brandBg = "#310937";
const brandFg = "#00f19d";
const cardBg = "#301c35";
const tableBg = "#74ecbe";
const tableText = "#310937";
const accentText = "#d129ff";

type DriverState = "not-detected" | "stopped" | "running";
type Row = { id: string; w: number; h: number; hz: number };
type AppState = {
  gpuName: string;
  monitorCount: number;
  active: Row[];
  retired: Row[];
  backups: string[];
  selectedBackup: string;
  driverState: DriverState;
};

const k = (...p: string[]) => ["vddw2", ...p].join(":");
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const isNum = (n: any) => typeof n === "number" && Number.isFinite(n);

function normalize(s: AppState): AppState {
  const fix = (r: Row): Row => ({ id: r.id || uid(), w: Math.max(0, Math.round(r.w||0)), h: Math.max(0, Math.round(r.h||0)), hz: Math.max(0, Math.round(r.hz||0)) });
  const uniq = (rows: Row[]) => {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const r of rows.map(fix)) { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } }
    return out;
  };
  return { ...s, active: uniq(s.active), retired: uniq(s.retired) };
}

function saveState(s: AppState) { localStorage.setItem(k("state"), JSON.stringify(normalize(s))); }

function ensureDefaultBackup(s: AppState): AppState {
  const key = k("backup", "Default");
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify(s));
    const list = new Set<string>(JSON.parse(localStorage.getItem(k("backups")) || "[]"));
    list.add("Default");
    localStorage.setItem(k("backups"), JSON.stringify(Array.from(list)));
  }
  const backups = JSON.parse(localStorage.getItem(k("backups")) || "[]");
  return { ...s, backups };
}

function loadState(): AppState {
  const raw = localStorage.getItem(k("state"));
  if (raw) { try { const s = normalize(JSON.parse(raw)); return { ...s, driverState: (s as any).driverState || "not-detected" }; } catch {} }
  const init: AppState = normalize({
    gpuName: "(Select GPU)",
    monitorCount: 1,
    active: [ { id: uid(), w: 1920, h: 1080, hz: 60 }, { id: uid(), w: 2560, h: 1440, hz: 60 } ],
    retired: [],
    backups: JSON.parse(localStorage.getItem(k("backups")) || "[]"),
    selectedBackup: "Default",
    driverState: "not-detected",
  });
  return ensureDefaultBackup(init);
}

function escapeXml(s: string){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function toFiles(s: AppState) {
  const src = s.active.filter(r=>r.w>0&&r.h>0&&r.hz>0);
  const adapter = s.gpuName + "\n";
  const option = [String(s.monitorCount), ...src.map(r => `${r.w}, ${r.h}, ${r.hz}`)].join("\n") + "\n";
  const groups: { id: string; w: number; h: number; rates: number[] }[] = [];
  const seen = new Set<string>();
  for (const r of src) {
    const id = `${r.w}x${r.h}`;
    if (!seen.has(id)) { groups.push({ id, w: r.w, h: r.h, rates: [] }); seen.add(id); }
    const g = groups.find(g => g.id === id)!;
    if (!g.rates.includes(r.hz)) g.rates.push(r.hz);
  }
  let xml = `<?xml version='1.0' encoding='utf-8'?>\n<vdd_settings>\n  <monitors>\n    <count>${s.monitorCount}</count>\n  </monitors>\n  <gpu>\n    <friendlyname>${escapeXml(s.gpuName || "GPU")}</friendlyname>\n  </gpu>\n  <resolutions>\n`;
  for (const g of groups) {
    xml += `    <resolution>\n      <width>${g.w}</width>\n      <height>${g.h}</height>\n`;
    for (const hz of g.rates) xml += `      <refresh_rate>${hz}</refresh_rate>\n`;
    xml += `    </resolution>\n`;
  }
  xml += `  </resolutions>\n</vdd_settings>`;
  return { adapter, option, xml };
}

function crc32(buf: Uint8Array): number { let c = ~0; for (let i=0; i<buf.length; i++){ c ^= buf[i]; for (let k=0; k<8; k++){ c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); } } return ~c >>> 0; }
function dosTimeDate(d = new Date()) { const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | ((Math.floor(d.getSeconds()/2)) & 31)) & 0xffff; const date = ((((d.getFullYear() - 1980) & 127) << 9) | ((d.getMonth()+1) << 5) | d.getDate()) & 0xffff; return { time, date }; }
function str8(s: string){ return new TextEncoder().encode(s); }
function u32(n: number){ const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n, true); return a; }
function u16(n: number){ const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, n, true); return a; }
function concat(chunks: Uint8Array[]){ const len = chunks.reduce((n,c)=>n+c.length,0); const out = new Uint8Array(len); let o=0; for(const c of chunks){ out.set(c,o); o+=c.length; } return out; }
function buildZip(files: {name:string, data:string}[]) {
  const now = dosTimeDate();
  const locs: { name: Uint8Array; data: Uint8Array; offset: number; crc: number }[] = [];
  let offset = 0;
  const locals: Uint8Array[] = [];
  for (const f of files) {
    const name = str8(f.name);
    const data = new TextEncoder().encode(f.data);
    const crc = crc32(data);
    const localHeader = concat([ u32(0x04034b50), u16(20), u16(0), u16(0), u16(now.time), u16(now.date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name ]);
    const record = concat([localHeader, data]);
    locals.push(record);
    locs.push({ name, data, offset, crc });
    offset += record.length;
  }
  const centrals: Uint8Array[] = [];
  let csize = 0;
  for (let i=0;i<locals.length;i++) {
    const f = locs[i];
    const c = concat([ u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(now.time), u16(now.date), u32(f.crc), u32(f.data.length), u32(f.data.length), u16(f.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(f.offset), f.name ]);
    centrals.push(c); csize += c.length;
  }
  const centralDir = concat(centrals);
  const end = concat([ u32(0x06054b50), u16(0), u16(0), u16(locs.length), u16(locs.length), u32(csize), u32(offset), u16(0) ]);
  const zip = concat([...locals, centralDir, end]);
  return new Blob([zip], { type: 'application/zip' });
}

function downloadZip(name: string, files: { name: string; data: string }[]) {
  const blob = buildZip(files);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

export default function App(){
  const [st, setSt] = useState<AppState>(()=>loadState());
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(()=> saveState(st), [st]);
  const gpuList = ["NVIDIA GeForce", "AMD Radeon", "Intel Arc"];

  const saveBackup = (name: string) => {
    const nm = (name||"").trim() || "Default";
    localStorage.setItem(k("backup", nm), JSON.stringify(st));
    const set = new Set(st.backups); set.add(nm);
    const backups = Array.from(set);
    localStorage.setItem(k("backups"), JSON.stringify(backups));
    setSt({ ...st, backups, selectedBackup: nm });
  };
  const loadBackup = (name: string) => {
    const raw = localStorage.getItem(k("backup", name)); if(!raw) return;
    const data = normalize(JSON.parse(raw));
    setSt({ ...data, backups: JSON.parse(localStorage.getItem(k("backups"))||"[]"), selectedBackup: name, driverState: st.driverState });
  };
  const deleteBackup = (name: string) => {
    localStorage.removeItem(k("backup", name));
    const backups = st.backups.filter(b=>b!==name);
    localStorage.setItem(k("backups"), JSON.stringify(backups));
    setSt({ ...st, backups, selectedBackup: backups[0]||"" });
  };
  const downloadConfigsZip = () => {
    const { adapter, option, xml } = toFiles(st);
    downloadZip("configs.zip", [ { name: "adapter.txt", data: adapter }, { name: "option.txt", data: option }, { name: "vdd_settings.xml", data: xml } ]);
  };

  const toggleInstall = () => {
    if(st.driverState === "not-detected") setSt({...st, driverState: "running"});
    else if(st.driverState === "stopped") setSt({...st, driverState: "running"});
    else setSt({...st, driverState: "not-detected"});
  };
  const togglePauseStop = () => {
    if(st.driverState === "running") setSt({...st, driverState: "stopped"});
    else if(st.driverState === "stopped") setSt({...st, driverState: "running"});
  };
  const reloadDriver = () => { setSt({...st, driverState: "running"}); };
  const signOut = () => { fetch('/api/logout', { method: 'POST' }).finally(()=> location.reload()); };

  const labelPause = st.driverState === "running" ? "Pause" : "Resume";
  const labelReload = "Reload";
  const labelInstall = st.driverState === "not-detected" ? "Install" : "Uninstall";

  return (
    <div style={{ background: brandBg, color: "#f3f4f6", minHeight: "100vh" }}>
      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{width:40,height:40,borderRadius:8,background:"#1a1f2b"}} />
            <h1 className="text-2xl font-semibold" style={{ color: brandFg }}>Virtual Display Wizard</h1>
          </div>
          <div className="relative">
            <button onClick={()=> setMenuOpen(v=>!v)} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>⚙️ Options</button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 overflow-hidden shadow-lg" style={{ background: cardBg }}>
                {['Settings','Authentication','User','Check for Updates','About','Help'].map(x=> (
                  <button key={x} className="w-full text-left px-3 py-2 hover:bg-white/10" style={{ color: accentText }}>{x}</button>
                ))}
                <button onClick={signOut} className="w-full text-left px-3 py-2 hover:bg-white/10" style={{ color: accentText }}>Sign Out</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 p-4" style={{ background: cardBg }}>
            <div className="mb-2 font-medium" style={{ color: brandFg }}>Driver</div>
            <div className="grid grid-cols-8 gap-2">
              <div className="col-span-4">
                <div className="text-sm" style={{ color: accentText }}>Detected state:</div>
                <div className="text-lg font-semibold" style={{color: brandFg}}>{st.driverState}</div>
              </div>
              <div className="col-span-4 pr-2">
                <div className="grid grid-cols-3 gap-2 justify-items-start">
                  <div className="text-sm text-right" style={{ color: accentText }}>{labelPause}</div>
                  <div className="text-sm text-right" style={{ color: accentText }}>{labelReload}</div>
                  <div className="text-sm text-right" style={{ color: accentText }}>{labelInstall}</div>
                  <div className="flex justify-start"><button onClick={togglePauseStop} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg:white/10" style={{ color: accentText }}>{st.driverState==="running"?"🛑":"▶️"}</button></div>
                  <div className="flex justify-start"><button onClick={reloadDriver} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg:white/10" style={{ color: accentText }}>🔄️</button></div>
                  <div className="flex justify-start"><button onClick={toggleInstall} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg:white/10" style={{ color: accentText }}>{st.driverState==="not-detected"?"🚀":"🗑️"}</button></div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 p-4" style={{ background: cardBg }}>
            <div className="mb-2 font-medium" style={{ color: brandFg }}>Backups</div>
            <div className="grid grid-cols-2 gap-3 items-start">
              <div>
                <button onClick={downloadConfigsZip} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>Download Configs.zip</button>
              </div>
              <div>
                <select className="rounded px-2 py-1 w-full" style={{ color: accentText }} value={st.selectedBackup} onChange={e=>setSt({...st, selectedBackup: e.target.value})}>
                  {st.backups.length===0 && <option value="">(none)</option>}
                  {st.backups.map(b=> <option key={b} value={b}>{b}</option>)}
                </select>
                <div className="mt-2 grid grid-cols-3 gap-2 justify-items-end w-full">
                  <div className="flex justify-end"><button onClick={()=> st.selectedBackup && loadBackup(st.selectedBackup)} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>Load</button></div>
                  <div className="flex justify-end"><button onClick={()=> saveBackup(st.selectedBackup || "Default")} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>Save</button></div>
                  <div className="flex justify-end">{st.selectedBackup && <button onClick={()=>deleteBackup(st.selectedBackup)} className="px-3 py-1.5 rounded-xl text-sm border border-red-400 hover:bg-red-500/25">Delete</button>}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 p-4" style={{ background: cardBg }}>
            <div className="mb-2 font-medium" style={{ color: brandFg }}>Log</div>
            <div className="h-28 overflow-auto rounded border border-white/10 p-2 text-xs" style={{ background: tableBg, color: tableText }}>—</div>
          </div>
          <div className="rounded-2xl border border-white/10 p-4" style={{ background: cardBg }}>
            <div className="mb-2 font-medium" style={{ color: brandFg }}>GPU & Monitors</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="min-w-[44px]" style={{ color: accentText }}>GPU</label>
                <select className="rounded px-2 py-1 flex-1" style={{ color: accentText }} value={st.gpuName} onChange={e=>setSt({...st, gpuName:e.target.value})}>
                  <option value="(Select GPU)">(Select GPU)</option>
                  {['NVIDIA GeForce','AMD Radeon','Intel Arc'].map(g=> <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="min-w-[72px]" style={{ color: accentText }}>Monitors</label>
                <div className="inline-flex items-center border border-white/20 rounded-lg overflow-hidden">
                  <button className="px-2 py-1 hover:bg-white/10" style={{ color: accentText }} onClick={()=> setSt({...st, monitorCount: Math.max(1, st.monitorCount - 1)})}>–</button>
                  <input className="w-16 text-center px-2 py-1" style={{ color: accentText }} type="number" value={st.monitorCount} onChange={e=> setSt({...st, monitorCount: Math.max(1, Number(e.target.value)||1)})} />
                  <button className="px-2 py-1 hover:bg-white/10" style={{ color: accentText }} onClick={()=> setSt({...st, monitorCount: Math.min(100, st.monitorCount + 1)})}>+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="mb-2 font-medium" style={{ color: brandFg }}>Resolution Enablement:</div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 opacity-70 text-sm">
        <span>© {new Date().getFullYear()} PrecisionPlanIT, HomelabHelpdesk, SoFMeRight (Kai)</span>
      </div>
    </div>
  )
}