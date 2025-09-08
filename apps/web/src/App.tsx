// apps/web/src/App.tsx
import React, { useEffect, useState } from "react";
import brandUrl from "./assets/brand.png"; // <— your logo

declare global { interface Window { vdisplay?: any } }
// (If your TS setup lacks image module types, uncomment below)
// declare module "*.png" { const src: string; export default src; }

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

function saveState(s: AppState) {
  localStorage.setItem(k("state"), JSON.stringify(normalize(s)));
}

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
  if (raw) {
    try { const s = normalize(JSON.parse(raw)); return { ...s, driverState: (s as any).driverState || "not-detected" }; } catch {}
  }
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

function escapeXml(s: string){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function crc32(buf: Uint8Array): number {
  let c = ~0; for (let i=0; i<buf.length; i++){ c ^= buf[i]; for (let k=0; k<8; k++){ c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); } } return ~c >>> 0;
}
function dosTimeDate(d = new Date()) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | ((Math.floor(d.getSeconds()/2)) & 31)) & 0xffff;
  const date = ((((d.getFullYear() - 1980) & 127) << 9) | ((d.getMonth()+1) << 5) | d.getDate()) & 0xffff;
  return { time, date };
}
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
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(now.time), u16(now.date),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0),
      name
    ]);
    const record = concat([localHeader, data]);
    locals.push(record);
    locs.push({ name, data, offset, crc });
    offset += record.length;
  }
  const centrals: Uint8Array[] = [];
  let csize = 0;
  for (let i=0;i<locals.length;i++) {
    const f = locs[i];
    const name = f.name;
    const c = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(now.time), u16(now.date),
      u32(f.crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(f.offset), name
    ]);
    centrals.push(c); csize += c.length;
  }
  const centralDir = concat(centrals);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(locs.length), u16(locs.length), u32(csize), u32(offset), u16(0)
  ]);
  const zip = concat([...locals, centralDir, end]);
  return new Blob([zip], { type: 'application/zip' });
}

function downloadZip(name: string, files: { name: string; data: string }[]) {
  const blob = buildZip(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

export default function App(){
  const [st, setSt] = useState<AppState>(()=>loadState());
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(()=> saveState(st), [st]);

  // === IPC wiring (a–b) ===
  const api = typeof window !== 'undefined' ? window.vdisplay : undefined;
  const [isAdmin, setIsAdmin] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [gpuList, setGpuList] = useState<string[]>(["NVIDIA GeForce", "AMD Radeon", "Intel Arc"]); // fallback

  useEffect(() => {
    if (!api) return;
    api.init().then((init:any) => {
      setIsAdmin(init.isAdmin);
      setGpuList(init.gpus?.length ? init.gpus : gpuList);
      setSt(s => ({
        ...s,
        gpuName: init.config.gpuName || s.gpuName,
        monitorCount: init.config.monitorCount ?? s.monitorCount,
        active: init.config.active?.length ? init.config.active : s.active,
        retired: init.config.retired ?? s.retired,
        backups: init.backups ?? s.backups,
        driverState: init.driverState
      }));
      setLogLines(init.log || []);
    });
    api.onLog((line:string) => setLogLines(prev => [...prev, line].slice(-500)));
  }, []);

  useEffect(() => {
    if (!api) return;
    // whenever key fields change, write system config
    api.saveConfig({ gpuName: st.gpuName, monitorCount: st.monitorCount, active: st.active, retired: st.retired }).catch(()=>{});
  }, [st.gpuName, st.monitorCount, st.active]);

  const relaunchAdmin = () => api?.relaunchAsAdmin();

  const refreshDriverState = async () => {
    if (!api) return;
    const r = await api.driverState();
    if (r?.state) setSt(s => ({ ...s, driverState: r.state as DriverState }));
  };

  const doInstall = async () => {
    const r = await api?.driverInstall();
    if (r && r.error === 'ELEVATION_REQUIRED') setIsAdmin(false);
    await refreshDriverState();
  };
  const doUninstall = async () => {
    await api?.driverUninstall();
    await refreshDriverState();
  };
  const doReload = async () => {
    await api?.driverReload();
    await refreshDriverState();
  };

  const saveBackupIPC = async (name:string) => { await api?.saveBackup(name, { gpuName: st.gpuName, monitorCount: st.monitorCount, active: st.active, retired: st.retired }); };
  const loadBackupIPC = async (name:string) => {
    const cfg = await api?.loadBackup(name);
    if (cfg) setSt(s => ({ ...s, ...cfg, selectedBackup: name }));
  };
  const deleteBackupIPC = async (name:string) => { await api?.deleteBackup(name); setSt(s => ({ ...s, backups: s.backups.filter(b=>b!==name), selectedBackup: s.backups[0]||'' })); };

  // === local backup helpers (still using localStorage UI) ===
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
    downloadZip("configs.zip", [
      { name: "adapter.txt", data: adapter },
      { name: "option.txt", data: option },
      { name: "vdd_settings.xml", data: xml },
    ]);
  };

  // Pause/Resume remains local UI state
  const togglePauseStop = () => {
    if(st.driverState === "running") setSt({...st, driverState: "stopped"});
    else if(st.driverState === "stopped") setSt({...st, driverState: "running"});
  };

  const signOut = () => { fetch('/api/logout', { method: 'POST' }).finally(()=> location.reload()); };

  const labelPause = st.driverState === "running" ? "Pause" : "Resume";
  const labelReload = "Reload";
  const labelInstall = st.driverState === "not-detected" ? "Install" : "Uninstall";

  return (
    <div style={{ background: brandBg, color: "#f3f4f6", minHeight: "100vh" }}>
      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Replaced placeholder with bundled image */}
            <img
              src={brandUrl}
              alt="Virtual Display Wizard"
              width={40}
              height={40}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                objectFit: "cover",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08)"
              }}
              onError={(e) => {
                // graceful fallback to colored square if image missing
                const el = e.currentTarget;
                el.style.display = "none";
                const fallback = document.createElement("div");
                fallback.style.width = "40px";
                fallback.style.height = "40px";
                fallback.style.borderRadius = "8px";
                fallback.style.background = "#1a1f2b";
                el.parentElement?.insertBefore(fallback, el);
              }}
            />
            <h1 className="text-2xl font-semibold" style={{ color: brandFg }}>Virtual Display Wizard</h1>
          </div>
          <div className="relative">
            <GhostBtn onClick={()=> setMenuOpen(v=>!v)}>⚙️ Options</GhostBtn>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 overflow-hidden shadow-lg" style={{ background: cardBg }}>
                <MenuItem>Settings</MenuItem>
                <MenuItem>Authentication</MenuItem>
                <MenuItem>User</MenuItem>
                <MenuItem>Check for Updates</MenuItem>
                <MenuItem>About</MenuItem>
                <MenuItem>Help</MenuItem>
                <MenuItem onClick={signOut}>Sign Out</MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* (d) Needs Admin banner */}
      {!isAdmin && (
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-4 px-3 py-2 rounded-lg border border-yellow-400/40 bg-yellow-200/10 text-sm">
            ⚠️ Some actions need Administrator rights. <button onClick={relaunchAdmin} className="underline">Relaunch as Admin</button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card title="Driver">
            <div className="grid grid-cols-8 gap-2">
              <div className="col-span-4">
                <div className="text-sm" style={{ color: accentText }}>Detected state:</div>
                <div className="text-lg font-semibold" style={{color: brandFg}}>{st.driverState}</div>
              </div>
              <div className="col-span-4 pr-2">
                <div className="grid grid-cols-3 gap-2 justify-items-end">
                  <div className="text-sm text-right" style={{ color: accentText }}>{labelPause}</div>
                  <div className="text-sm text-right" style={{ color: accentText }}>{labelReload}</div>
                  <div className="text-sm text-right" style={{ color: accentText }}>{labelInstall}</div>
                  {/* (c) Real handlers */}
                  <div className="flex justify-end"><button onClick={togglePauseStop} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>{st.driverState==="running"?"🛑":"▶️"}</button></div>
                  <div className="flex justify-end"><button onClick={doReload} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>🔄️</button></div>
                  <div className="flex justify-end"><button onClick={() => (st.driverState==="not-detected" ? doInstall() : doUninstall())} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>{st.driverState==="not-detected"?"🚀":"🗑️"}</button></div>
                </div>
              </div>
            </div>
          </Card>
          <Card title="Backups">
            <div className="grid grid-cols-2 gap-3 items-start">
              <div>
                <GhostBtn onClick={downloadConfigsZip}>Download Configs.zip</GhostBtn>
              </div>
              <div>
                <select className="rounded px-2 py-1 w-full" style={{ color: accentText }} value={st.selectedBackup} onChange={e=>setSt({...st, selectedBackup: e.target.value})}>
                  {st.backups.length===0 && <option value="">(none)</option>}
                  {st.backups.map(b=> <option key={b} value={b}>{b}</option>)}
                </select>
                <div className="mt-2 grid grid-cols-3 gap-2 justify-items-end w-full">
                  <div className="flex justify-end"><GhostBtn onClick={()=> st.selectedBackup && loadBackup(st.selectedBackup)}>Load</GhostBtn></div>
                  <div className="flex justify-end"><GhostBtn onClick={()=> saveBackup(st.selectedBackup || "Default")}>Save</GhostBtn></div>
                  <div className="flex justify-end">{st.selectedBackup && <GhostBtn danger onClick={()=>deleteBackup(st.selectedBackup)}>Delete</GhostBtn>}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Log">
            {/* (e) Live log */}
            <div className="h-28 overflow-auto rounded border border-white/10 p-2 text-xs" style={{ background: tableBg, color: tableText }}>
              {logLines.length ? logLines.map((l,i)=><div key={i}>{l}</div>) : '—'}
            </div>
          </Card>
          <Card title="GPU & Monitors">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="min-w-[44px]" style={{ color: accentText }}>GPU</label>
                <select className="rounded px-2 py-1 flex-1" style={{ color: accentText }} value={st.gpuName} onChange={e=>setSt({...st, gpuName:e.target.value})}>
                  <option value="(Select GPU)">(Select GPU)</option>
                  {gpuList.map((g:string)=> <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="min-w-[72px]" style={{ color: accentText }}>Monitors</label>
                <NumberSpinner value={st.monitorCount} min={1} max={100} onChange={v=> setSt({...st, monitorCount: clamp(v,1,100)}) } />
              </div>
            </div>
          </Card>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="mb-2 font-medium" style={{ color: brandFg }}>Resolution Enablement:</div>
      </div>
      <div className="max-w-6xl mx-auto px-6 mt-2 grid md:grid-cols-2 gap-4">
        <ResTable
          title="Disabled / Retired"
          rows={st.retired}
          onChange={(rows)=> setSt({...st, retired: rows})}
          onMove={(ids)=> moveBetween(ids, 'retired', 'active', st, setSt)}
          side="left"
          mode="disabled"
        />
        <ResTable
          title="Configured / Available"
          rows={st.active}
          onChange={(rows)=> setSt({...st, active: rows})}
          onMove={(ids)=> moveBetween(ids, 'active', 'retired', st, setSt)}
          side="right"
          mode="active"
        />
      </div>
      <div className="max-w-6xl mx-auto px-6 py-8 opacity-70 text-sm">
        <span>© {new Date().getFullYear()} PrecisionPlanIT, HomelabHelpdesk, SoFMeRight (Kai)</span>
      </div>
      <style>{baseCss}</style>
    </div>
  );
}

function moveBetween(ids: string[], from: 'active'|'retired', to: 'active'|'retired', st: AppState, setSt: (s: AppState)=>void){
  if(ids.length===0) return;
  const src = [...st[from]]; const dst = [...st[to]];
  const keep: Row[] = []; const moved: Row[] = [];
  for(const r of src){ if(ids.includes(r.id)) moved.push(r); else keep.push(r); }
  setSt({ ...st, [from]: keep, [to]: [...dst, ...moved] } as AppState);
}

function Card(p:{ title:string, children:React.ReactNode }){
  return (
    <div className="rounded-2xl border border-white/10 p-4" style={{ background: cardBg }}>
      <div className="mb-2 font-medium" style={{ color: brandFg }}>{p.title}</div>
      {p.children}
    </div>
  );
}

function RowBar(p:{ children:React.ReactNode }){ return <div className="flex flex-wrap items-center gap-2">{p.children}</div>; }

function GhostBtn(p:{ children:React.ReactNode, onClick?:()=>void, danger?:boolean }){
  return <button onClick={p.onClick} className={`px-3 py-1.5 rounded-xl text-sm border ${p.danger? 'border-red-400 hover:bg-red-500/25' : 'border-white/30 hover:bg-white/10'}`} style={{ color: p.danger? undefined : accentText }}>{p.children}</button>
}

function MenuItem(p:{ children:React.ReactNode, onClick?:()=>void }){
  return <button onClick={p.onClick} className="w-full text-left px-3 py-2 hover:bg-white/10" style={{ color: accentText }}>{p.children}</button>
}

function NumberSpinner(p:{ value:number, min?:number, max?:number, onChange:(v:number)=>void }){
  const dec = ()=> p.onChange(clamp(p.value - 1, p.min ?? -Infinity, p.max ?? Infinity));
  const inc = ()=> p.onChange(clamp(p.value + 1, p.min ?? -Infinity, p.max ?? Infinity));
  return (
    <div className="inline-flex items-center border border-white/20 rounded-lg overflow-hidden">
      <button className="px-2 py-1 hover:bg-white/10" style={{ color: accentText }} onClick={dec}>–</button>
      <input className="w-16 text-center px-2 py-1" style={{ color: accentText }} type="number" value={p.value} onChange={e=> p.onChange(Number(e.target.value)||0)} />
      <button className="px-2 py-1 hover:bg-white/10" style={{ color: accentText }} onClick={inc}>+</button>
    </div>
  )
}

type ResTableProps = {
  title:string, rows: Row[], onChange:(r:Row[])=>void, onMove:(ids:string[])=>void, side:'left'|'right', mode:'disabled'|'active'
};

function ResTable(p: ResTableProps){
  const [selected, setSelected] = useState<string[]>([]);
  const toggleSel = (id:string)=> setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  const addBlank = ()=>{ const n: Row = { id: uid(), w: 0, h: 0, hz: 0 }; p.onChange([...p.rows, n]); };
  const insertAt = (idx:number, pos:'above'|'below')=>{
    const i = pos==='above'? idx : idx+1;
    const n: Row = { id: uid(), w: 0, h: 0, hz: 0 };
    const next = [...p.rows.slice(0,i), n, ...p.rows.slice(i)];
    p.onChange(next);
  };
  const remove = (id:string)=> p.onChange(p.rows.filter(r=>r.id!==id));
  const updateCell = (id:string, field: keyof Row, value: number)=>{
    const v = isNum(value) ? Math.max(0, Math.round(value)) : 0;
    p.onChange(p.rows.map(r=> r.id===id ? { ...r, [field]: v } as Row : r));
  };
  const moveUp = (idx:number)=>{ if(idx<=0) return; const arr=[...p.rows]; [arr[idx-1],arr[idx]]=[arr[idx],arr[idx-1]]; p.onChange(arr); };
  const moveDown = (idx:number)=>{ if(idx>=p.rows.length-1) return; const arr=[...p.rows]; [arr[idx+1],arr[idx]]=[arr[idx],arr[idx+1]]; p.onChange(arr); };
  const delSelected = ()=> p.onChange(p.rows.filter(r=> !selected.includes(r.id)));

  return (
    <Card title={p.title}>
      <div className="mb-2 flex items-center gap-2">
        {p.mode==='disabled' ? (
          <>
            <div className="flex-1" />
            <GhostBtn danger onClick={delSelected}>Delete</GhostBtn>
          </>
        ) : (
          <>
            <div className="flex-1" />
            <GhostBtn onClick={addBlank}>+ Add</GhostBtn>
            <GhostBtn danger onClick={delSelected}>Delete</GhostBtn>
          </>
        )}
      </div>
      <div className="rounded-xl border border-white/15 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/10 text-white">
            <tr>
              <Th className="w-10">Sel</Th>
              <Th>Width</Th>
              <Th>Height</Th>
              <Th>Refresh (Hz)</Th>
              <Th className="w-40 text-right">Actions</Th>
            </tr>
          </thead>
          <tbody style={{ background: tableBg, color: tableText }}>
            {p.rows.map((r, idx)=> (
              <tr key={r.id} className="border-t border-white/10">
                <td className="text-center"><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggleSel(r.id)} /></td>
                <TdEditable value={r.w} onChange={v=>updateCell(r.id,'w',v)} />
                <TdEditable value={r.h} onChange={v=>updateCell(r.id,'h',v)} />
                <TdEditable value={r.hz} onChange={v=>updateCell(r.id,'hz',v)} />
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    <Icon onClick={()=>insertAt(idx,'above')} title="Insert above">⟰</Icon>
                    <Icon onClick={()=>insertAt(idx,'below')} title="Insert below">⟱</Icon>
                    <Icon onClick={()=>moveUp(idx)} title="Move up">▲</Icon>
                    <Icon onClick={()=>moveDown(idx)} title="Move down">▼</Icon>
                    <Icon onClick={()=>p.onMove([r.id])} title={p.side==='left'? 'Enable (move right)':'Disable (move left)'}>{p.side==='left'? '⇢':'⇠'}</Icon>
                    <Icon danger onClick={()=>remove(r.id)} title="Delete">✕</Icon>
                  </div>
                </td>
              </tr>
            ))}
            {p.rows.length===0 && (
              <tr><td colSpan={5} className="text-center py-8 opacity-60">No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th(p:{ children:React.ReactNode, className?:string }){ return <th className={"text-left px-3 py-2 font-medium "+(p.className||"")}>{p.children}</th>; }

function TdEditable(p:{ value:number, onChange:(v:number)=>void }){
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(p.value>0? String(p.value): "");
  useEffect(()=> setVal(p.value>0? String(p.value): ""), [p.value]);
  const commit = ()=> { const trimmed = String(val).trim(); const n = trimmed===""? 0 : Number(trimmed); if(isNum(n)) p.onChange(n); setEditing(false); };
  return (
    <td className="px-3 py-1">
      {!editing ? (
        <button className="text-left w-full" style={{ color: tableText }} onClick={()=> setEditing(true)}>{val===""? <span className="opacity-50">—</span> : val}</button>
      ) : (
        <input autoFocus className="w-28 px-2 py-1 rounded" style={{ color: tableText }} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} onKeyDown={e=>{ if(e.key==='Enter') commit(); if(e.key==='Escape') setEditing(false); }} />
      )}
    </td>
  );
}

function Icon(p:{ children:React.ReactNode, title?:string, onClick?:()=>void, danger?:boolean }){
  return <button title={p.title} onClick={p.onClick} className={`px-2 py-1 rounded ${p.danger? 'text-red-300' : ''}`} style={{ color: p.danger? undefined : accentText }}>{p.children}</button>
}

const baseCss = `
  :root { color-scheme: dark; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, "Helvetica Neue", Arial; }
  table { border-collapse: separate; border-spacing: 0; }
`;
