// apps/web/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

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

declare global {
  interface Window {
    vdisplay: {
      version: string
      isAdmin(): Promise<boolean>
      relaunchAsAdmin(): Promise<void>
      listGpus(): Promise<string[]>
      loadConfig(): Promise<{gpuName:string; monitorCount:number; active:{w:number;h:number;hz:number}[]}>
      saveConfig(payload: {gpuName:string; monitorCount:number; active:{w:number;h:number;hz:number}[]}): Promise<boolean>
      listBackups(): Promise<string[]>
      saveBackup(name:string, payload:any): Promise<boolean>
      loadBackup(name:string): Promise<{gpuName:string; monitorCount:number; active:{w:number;h:number;hz:number}[]}>
      deleteBackup(name:string): Promise<boolean>
      driverInstall(): Promise<boolean>
      driverUninstall(): Promise<boolean>
      driverReload(): Promise<boolean>
      onLog(cb:(line:string)=>void): ()=>void
    }
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const isNum = (n: any) => typeof n === "number" && Number.isFinite(n);

function normalizeRows(rows: {w:number;h:number;hz:number}[]): Row[] {
  return rows.map(r => ({ id: uid(), w: Math.max(0, Math.round(r.w||0)), h: Math.max(0, Math.round(r.h||0)), hz: Math.max(0, Math.round(r.hz||0)) }))
}

export default function App(){
  const [gpuList, setGpuList] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const [st, setSt] = useState<AppState>(()=>({
    gpuName: "(Select GPU)",
    monitorCount: 1,
    active: normalizeRows([{ w:1920, h:1080, hz:60 }]),
    retired: [],
    backups: [],
    selectedBackup: "Default",
    driverState: "not-detected",
  }))

  useEffect(() => {
    const off = window.vdisplay.onLog(line => {
      setLogs(prev => [...prev, line].slice(-500))
    })
    return off
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: 1e9 })
  }, [logs])

  useEffect(() => {
    (async () => {
      try {
        setIsAdmin(await window.vdisplay.isAdmin())
      } catch {}
      try {
        const cfg = await window.vdisplay.loadConfig()
        const gpus = await window.vdisplay.listGpus()
        const backups = await window.vdisplay.listBackups()
        setGpuList(gpus)
        setSt(s => ({
          ...s,
          gpuName: cfg.gpuName || s.gpuName,
          monitorCount: cfg.monitorCount || s.monitorCount,
          active: normalizeRows(cfg.active || []),
          backups,
          selectedBackup: backups.includes(s.selectedBackup) ? s.selectedBackup : (backups[0] || "Default"),
          driverState: s.driverState
        }))
      } catch (e:any) {
        setLogs(prev => [...prev, `Load error: ${e?.message || e}`])
      }
    })()
  }, [])

  useEffect(() => {
    const payload = {
      gpuName: st.gpuName,
      monitorCount: st.monitorCount,
      active: st.active.filter(r=>r.w>0 && r.h>0 && r.hz>0).map(({id, ...rest})=>rest)
    }
    window.vdisplay.saveConfig(payload).catch(e=>{
      setLogs(prev => [...prev, `Save error: ${e?.message || e}`])
    })
  }, [st.gpuName, st.monitorCount, st.active])

  const saveBackup = async (name: string) => {
    const nm = (name||"").trim() || "Default"
    const payload = { gpuName: st.gpuName, monitorCount: st.monitorCount, active: st.active.map(({id,...r})=>r) }
    await window.vdisplay.saveBackup(nm, payload)
    const list = await window.vdisplay.listBackups()
    setSt(s=>({ ...s, backups: list, selectedBackup: nm }))
  }
  const loadBackup = async (name: string) => {
    const data = await window.vdisplay.loadBackup(name)
    setSt(s=>({
      ...s,
      gpuName: data.gpuName || s.gpuName,
      monitorCount: data.monitorCount || s.monitorCount,
      active: normalizeRows(data.active || []),
      selectedBackup: name
    }))
  }
  const deleteBackup = async (name: string) => {
    await window.vdisplay.deleteBackup(name)
    const list = await window.vdisplay.listBackups()
    setSt(s=>({ ...s, backups: list, selectedBackup: list[0] || "" }))
  }

  const toggleInstall = async () => {
    try {
      if (st.driverState === "not-detected") {
        await window.vdisplay.driverInstall()
        setSt(s=>({ ...s, driverState: 'running' }))
      } else {
        await window.vdisplay.driverUninstall()
        setSt(s=>({ ...s, driverState: 'not-detected' }))
      }
    } catch (e:any) { setLogs(prev=>[...prev, `Install/Uninstall: ${e?.message||e}`]) }
  }
  const togglePauseStop = async () => {
    try {
      // Use reload as resume if we were "stopped" (UI concept); uninstall/install is handled via install button
      await window.vdisplay.driverReload()
      setSt(s=>({ ...s, driverState: s.driverState === 'running' ? 'stopped' : 'running' }))
    } catch (e:any) { setLogs(prev=>[...prev, `Pause/Resume: ${e?.message||e}`]) }
  }
  const reloadDriver = async () => {
    try { await window.vdisplay.driverReload(); setSt(s=>({ ...s, driverState: 'running' })) }
    catch (e:any) { setLogs(prev=>[...prev, `Reload: ${e?.message||e}`]) }
  }

  const labelPause = st.driverState === "running" ? "Pause" : "Resume";
  const labelReload = "Reload";
  const labelInstall = st.driverState === "not-detected" ? "Install" : "Uninstall";

  return (
    <div style={{ background: brandBg, color: "#f3f4f6", minHeight: "100vh" }}>
      <div className="max-w-6xl mx-auto px-6 py-3">
        {!isAdmin && (
          <div className="mb-3 text-sm flex items-center justify-between rounded-lg px-3 py-2" style={{ background: '#4b244a' }}>
            <div>Needs Admin to install/uninstall driver.</div>
            <button onClick={()=>window.vdisplay.relaunchAsAdmin()} className="px-3 py-1.5 rounded-md border border-white/30 hover:bg-white/10" style={{ color: accentText }}>
              Relaunch as Admin
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{width:40,height:40,borderRadius:8,background:"#1a1f2b"}} />
            <h1 className="text-2xl font-semibold" style={{ color: brandFg }}>Virtual Display Wizard</h1>
          </div>
          <GhostBtn onClick={()=>location.reload()}>🔄 Refresh</GhostBtn>
        </div>
      </div>

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
                  <div className="flex justify-end"><button onClick={togglePauseStop} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>{st.driverState==="running"?"🛑":"▶️"}</button></div>
                  <div className="flex justify-end"><button onClick={reloadDriver} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>🔄️</button></div>
                  <div className="flex justify-end"><button onClick={toggleInstall} className="px-3 py-1.5 rounded-xl text-sm border border-white/30 hover:bg-white/10" style={{ color: accentText }}>{st.driverState==="not-detected"?"🚀":"🗑️"}</button></div>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Backups">
            <div className="grid grid-cols-2 gap-3 items-start">
              <div>
                <GhostBtn onClick={async ()=>{
                  const payload = { gpuName: st.gpuName, monitorCount: st.monitorCount, active: st.active.map(({id,...r})=>r) }
                  const files = toFiles(payload)
                  downloadZip("configs.zip", [
                    { name: "adapter.txt", data: files.adapter },
                    { name: "option.txt", data: files.option },
                    { name: "vdd_settings.xml", data: files.xml },
                  ])
                }}>Download Configs.zip</GhostBtn>
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
            <div ref={logRef} className="h-28 overflow-auto rounded border border-white/10 p-2 text-xs" style={{ background: tableBg, color: tableText, whiteSpace:'pre-wrap' }}>
              {logs.length ? logs.join('\n') : '—'}
            </div>
          </Card>
          <Card title="GPU & Monitors">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="min-w-[44px]" style={{ color: accentText }}>GPU</label>
                <select className="rounded px-2 py-1 flex-1" style={{ color: accentText }} value={st.gpuName} onChange={e=>setSt({...st, gpuName:e.target.value})}>
                  <option value="(Select GPU)">(Select GPU)</option>
                  {gpuList.map(g=> <option key={g} value={g}>{g}</option>)}
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

// ======= helpers reused from your UI (unchanged visuals) =======
function toFiles(s: {gpuName:string; monitorCount:number; active:{w:number;h:number;hz:number}[]}) {
  const src = s.active.filter(r=>r.w>0&&r.h>0&&r.hz>0)
  const adapter = s.gpuName + "\n"
  const option = [String(s.monitorCount), ...src.map(r => `${r.w}, ${r.h}, ${r.hz}`)].join("\n") + "\n"
  const groups: { id: string; w: number; h: number; rates: number[] }[] = []
  const seen = new Set<string>()
  for (const r of src) {
    const id = `${r.w}x${r.h}`
    if (!seen.has(id)) { groups.push({ id, w: r.w, h: r.h, rates: [] }); seen.add(id) }
    const g = groups.find(g => g.id === id)!
    if (!g.rates.includes(r.hz)) g.rates.push(r.hz)
  }
  let xml = `<?xml version='1.0' encoding='utf-8'?>\n<vdd_settings>\n  <monitors>\n    <count>${s.monitorCount}</count>\n  </monitors>\n  <gpu>\n    <friendlyname>${s.gpuName}</friendlyname>\n  </gpu>\n  <resolutions>\n`
  for (const g of groups) {
    xml += `    <resolution>\n      <width>${g.w}</width>\n      <height>${g.h}</height>\n`
    for (const hz of g.rates) xml += `      <refresh_rate>${hz}</refresh_rate>\n`
    xml += `    </resolution>\n`
  }
  xml += `  </resolutions>\n</vdd_settings>`
  return { adapter, option, xml }
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

function GhostBtn(p:{ children:React.ReactNode, onClick?:()=>void, danger?:boolean }){
  return <button onClick={p.onClick} className={`px-3 py-1.5 rounded-xl text-sm border ${p.danger? 'border-red-400 hover:bg-red-500/25' : 'border-white/30 hover:bg-white/10'}`} style={{ color: p.danger? undefined : accentText }}>{p.children}</button>
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
