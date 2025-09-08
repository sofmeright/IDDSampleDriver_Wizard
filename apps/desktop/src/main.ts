// apps/desktop/src/main.ts
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { spawn, execFile, exec } from 'node:child_process'

let win: BrowserWindow | null = null

const CONFIG_DIR = 'C:\\IddSampleDriver'
const APP_DIR = path.join(app.getPath('appData'), 'VirtualDisplayWizard')
const BACKUP_DIR = path.join(APP_DIR, 'Backups')
const DRIVER_DIR = path.join(APP_DIR, 'IddDriver')
const BIN_DIR = path.join(process.resourcesPath, 'bin') // put nefconw.exe here if you ship it

const isDev = process.env.ELECTRON_DEV === '1'

function sendLog(line: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('log:append', line)
  }
  // also log to console for diagnostics
  console.log(line)
}

function ensureDirs() {
  for (const p of [APP_DIR, BACKUP_DIR, DRIVER_DIR]) {
    try { fs.mkdirSync(p, { recursive: true }) } catch {}
  }
}

function readText(p: string) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}
function writeText(p: string, s: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, s, 'utf8')
}

function parseXml(xml: string) {
  const get = (re: RegExp) => (xml.match(re) ?? [,''])[1]
  const gpuName = unescapeXml(get(/<friendlyname>([\s\S]*?)<\/friendlyname>/))
  const count = Number(get(/<monitors>[\s\S]*?<count>(\d+)<\/count>[\s\S]*?<\/monitors>/)) || 0
  const blocks = xml.split(/<\/resolution>/g)
  const active: { w:number; h:number; hz:number }[] = []
  for (const b of blocks) {
    const w = Number((b.match(/<width>(\d+)<\/width>/) ?? [,''])[1]) || 0
    const h = Number((b.match(/<height>(\d+)<\/height>/) ?? [,''])[1]) || 0
    const rMatches = [...b.matchAll(/<refresh_rate>(\d+)<\/refresh_rate>/g)]
    if (w>0 && h>0 && rMatches.length) {
      for (const m of rMatches) {
        const hz = Number(m[1]) || 0
        if (hz>0) active.push({ w,h,hz })
      }
    }
  }
  return { gpuName, monitorCount: count, active }
}

function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeXml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function toFiles(payload: {
  gpuName: string
  monitorCount: number
  active: {w:number;h:number;hz:number}[]
}) {
  const src = payload.active.filter(r=>r.w>0&&r.h>0&&r.hz>0)
  const adapter = (payload.gpuName || '') + '\n'
  const option = [String(payload.monitorCount), ...src.map(r => `${r.w}, ${r.h}, ${r.hz}`)].join('\n') + '\n'

  const key = (w:number,h:number)=>`${w}x${h}`
  const groups: Record<string,{w:number;h:number;rates:number[]}> = {}
  for (const r of src) {
    const k = key(r.w,r.h)
    if (!groups[k]) groups[k] = { w:r.w, h:r.h, rates:[] }
    if (!groups[k].rates.includes(r.hz)) groups[k].rates.push(r.hz)
  }

  let xml = `<?xml version='1.0' encoding='utf-8'?>\n<vdd_settings>\n  <monitors>\n    <count>${payload.monitorCount}</count>\n  </monitors>\n  <gpu>\n    <friendlyname>${escapeXml(payload.gpuName || 'GPU')}</friendlyname>\n  </gpu>\n  <resolutions>\n`
  for (const g of Object.values(groups)) {
    xml += `    <resolution>\n      <width>${g.w}</width>\n      <height>${g.h}</height>\n`
    for (const hz of g.rates) xml += `      <refresh_rate>${hz}</refresh_rate>\n`
    xml += `    </resolution>\n`
  }
  xml += `  </resolutions>\n</vdd_settings>`
  return { adapter, option, xml }
}

function readConfigFromDisk() {
  const xmlPath = path.join(CONFIG_DIR, 'vdd_settings.xml')
  const optPath = path.join(CONFIG_DIR, 'option.txt')
  const adaPath = path.join(CONFIG_DIR, 'adapter.txt')

  if (fs.existsSync(xmlPath)) {
    sendLog(`Reading ${xmlPath}`)
    const xml = readText(xmlPath)
    const parsed = parseXml(xml)
    return { ...parsed }
  }

  const opt = readText(optPath)
  const ada = readText(adaPath).trim()
  if (opt) {
    sendLog(`Reading ${optPath} + ${adaPath}`)
    const lines = opt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
    const monitorCount = Number(lines.shift() || '0') || 0
    const active: {w:number;h:number;hz:number}[] = []
    for (const L of lines) {
      const m = L.match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/)
      if (m) active.push({ w:+m[1], h:+m[2], hz:+m[3] })
    }
    return { gpuName: ada || '(Select GPU)', monitorCount, active }
  }

  sendLog(`No config found; initializing defaults`)
  return {
    gpuName: '(Select GPU)',
    monitorCount: 1,
    active: [{ w:1920, h:1080, hz:60 }]
  }
}

function writeConfigToDisk(payload: {
  gpuName:string; monitorCount:number; active:{w:number;h:number;hz:number}[]
}) {
  ensureDirs()
  const { adapter, option, xml } = toFiles(payload)
  writeText(path.join(CONFIG_DIR,'adapter.txt'), adapter)
  writeText(path.join(CONFIG_DIR,'option.txt'), option)
  writeText(path.join(CONFIG_DIR,'vdd_settings.xml'), xml)
  sendLog(`Wrote adapter.txt, option.txt, vdd_settings.xml to ${CONFIG_DIR}`)
}

function listBackups(): string[] {
  ensureDirs()
  if (!fs.existsSync(BACKUP_DIR)) return []
  const names = new Set<string>()
  const files = fs.readdirSync(BACKUP_DIR)
  const rx = /^(adapter\.txt|option\.txt|vdd_settings\.xml)\.(.+)\.backup$/i
  for (const f of files) {
    const m = f.match(rx)
    if (m) names.add(m[2])
  }
  return Array.from(names).sort()
}

function loadBackup(name: string) {
  ensureDirs()
  const xmlPath = path.join(BACKUP_DIR, `vdd_settings.xml.${name}.backup`)
  const optPath = path.join(BACKUP_DIR, `option.txt.${name}.backup`)
  const adaPath = path.join(BACKUP_DIR, `adapter.txt.${name}.backup`)

  if (fs.existsSync(xmlPath)) {
    const parsed = parseXml(readText(xmlPath))
    sendLog(`Loaded backup "${name}" (xml)`)
    return parsed
  }

  if (fs.existsSync(optPath) || fs.existsSync(adaPath)) {
    const opt = readText(optPath)
    const ada = readText(adaPath).trim()
    const lines = opt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
    const monitorCount = Number(lines.shift() || '0') || 0
    const active: {w:number;h:number;hz:number}[] = []
    for (const L of lines) {
      const m = L.match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/)
      if (m) active.push({ w:+m[1], h:+m[2], hz:+m[3] })
    }
    sendLog(`Loaded backup "${name}" (txt)`)
    return { gpuName: ada || '(Select GPU)', monitorCount, active }
  }

  throw new Error(`Backup "${name}" not found`)
}

function saveBackup(name: string, payload: {
  gpuName:string; monitorCount:number; active:{w:number;h:number;hz:number}[]
}) {
  ensureDirs()
  const { adapter, option, xml } = toFiles(payload)
  writeText(path.join(BACKUP_DIR, `adapter.txt.${name}.backup`), adapter)
  writeText(path.join(BACKUP_DIR, `option.txt.${name}.backup`), option)
  writeText(path.join(BACKUP_DIR, `vdd_settings.xml.${name}.backup`), xml)
  sendLog(`Saved backup "${name}"`)
}

function deleteBackup(name: string) {
  ensureDirs()
  for (const base of ['adapter.txt','option.txt','vdd_settings.xml']) {
    const p = path.join(BACKUP_DIR, `${base}.${name}.backup`)
    try { fs.unlinkSync(p); sendLog(`Deleted ${path.basename(p)}`) } catch {}
  }
}

function psBool(script: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command', script], (err, stdout) => {
      if (err) return resolve(false)
      const s = (stdout||'').toString().trim().toLowerCase()
      resolve(s === 'true')
    })
  })
}

async function isAdmin(): Promise<boolean> {
  return psBool('(New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)')
}

function relaunchAsAdmin() {
  const exe = process.execPath
  const args = process.argv.slice(1) // preserve CLI semantics
  const quotedArgs = args.map(a => `'${a.replace(/'/g,"''")}'`).join(', ')
  const cmd = `Start-Process -FilePath '${exe.replace(/'/g,"''")}' -ArgumentList ${quotedArgs} -Verb RunAs`
  execFile('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command', cmd])
  app.quit()
}

function psOut(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-Command', cmd], { maxBuffer: 10*1024*1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.toString() || err.message))
      resolve(stdout?.toString() ?? '')
    })
  })
}

async function listGpus(): Promise<string[]> {
  const out = await psOut(`Get-CimInstance -ClassName Win32_VideoController | Select-Object -ExpandProperty Name`)
  const raw = out.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  const skip = [
    'IddSampleDriver',
    'Microsoft Remote Display Adapter',
    'Parsec Virtual Display Adapter',
    'Virtual Display with HDR'
  ].map(s=>s.toLowerCase())
  const names = raw.filter(n => !skip.some(s => n.toLowerCase().includes(s)))
  return Array.from(new Set(names))
}

async function driverInfName(): Promise<string|undefined> {
  try {
    const out = await psOut(`pnputil /enum-devices /deviceid ROOT\\iddsampledriver`)
    const m = out.match(/Driver Name:\s+(oem\d+\.inf)/i)
    return m?.[1]
  } catch { return undefined }
}

async function ensureDriverFiles(): Promise<void> {
  const inf = path.join(DRIVER_DIR, 'IddSampleDriver.inf')
  if (fs.existsSync(inf)) return
  sendLog('Driver package missing; downloading…')
  ensureDirs()
  const zipPath = path.join(DRIVER_DIR, 'IddSampleDriver.zip')
  const ps = `
$ProgressPreference='SilentlyContinue'
$u='https://github.com/itsmikethetech/Virtual-Display-Driver/releases/download/24.9.11/IddSampleDriver.zip'
$dst='${zipPath.replace(/\\/g,'\\\\')}'
Invoke-WebRequest -Uri $u -OutFile $dst
Expand-Archive -LiteralPath $dst -DestinationPath '${DRIVER_DIR.replace(/\\/g,'\\\\')}' -Force
`
  await psOut(ps)
  sendLog('Driver package downloaded/unpacked.')
}

async function driverInstall(): Promise<void> {
  if (!(await isAdmin())) throw new Error('Administrator privileges required')
  await ensureDriverFiles()

  const nef = path.join(BIN_DIR, 'nefconw.exe')
  if (fs.existsSync(nef)) {
    await psOut(`& '${nef.replace(/\\/g,'\\\\')}' --create-device-node --hardware-id ROOT\\iddsampledriver --class-name Display --class-guid 4D36E968-E325-11CE-BFC1-08002BE10318`)
    sendLog('Created device node via nefconw.exe')
  } else {
    sendLog('nefconw.exe not packaged; skipping device-node creation')
  }

  const inf = path.join(DRIVER_DIR, 'IddSampleDriver.inf')
  await psOut(`pnputil /add-driver '${inf.replace(/\\/g,'\\\\')}' /install`)
  sendLog('pnputil add-driver complete')
}

async function driverUninstall(): Promise<void> {
  if (!(await isAdmin())) throw new Error('Administrator privileges required')
  const inf = await driverInfName()
  if (inf) {
    await psOut(`pnputil /delete-driver ${inf} /uninstall /force`)
    sendLog(`Deleted driver ${inf}`)
  }
  await psOut(`pnputil /remove-device /deviceid ROOT\\iddsampledriver`)
  sendLog('Removed device ROOT\\iddsampledriver')
}

async function driverReload(): Promise<void> {
  if (!(await isAdmin())) throw new Error('Administrator privileges required')
  await psOut(`pnputil /restart-device /deviceid ROOT\\iddsampledriver`)
  sendLog('Restarted device ROOT\\iddsampledriver')
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 800,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') }
  })

  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(process.resourcesPath, 'ui', 'index.html').replace(/\\/g,'/')}`

  win.loadURL(url)
  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => { win = null })
}

function ensureWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return }
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', () => ensureWindow())
  app.whenReady().then(() => {
    ensureDirs()
    createWindow()
    wireIpc()
    handleCliOnce()
  })
  app.on('activate', () => ensureWindow())
  app.on('window-all-closed', () => {})
}

function wireIpc() {
  ipcMain.handle('admin:is-elevated', async () => await isAdmin())
  ipcMain.handle('admin:relaunch', () => { relaunchAsAdmin() })

  ipcMain.handle('gpus:list', async () => {
    try { const g = await listGpus(); return g }
    catch (e:any) { sendLog(`GPU list error: ${e.message}`); return [] }
  })

  ipcMain.handle('config:load', async () => {
    try { return readConfigFromDisk() }
    catch (e:any) { sendLog(`Load config error: ${e.message}`); throw e }
  })
  ipcMain.handle('config:save', async (_e, payload) => {
    try { writeConfigToDisk(payload); return true }
    catch (e:any) { sendLog(`Write config error: ${e.message}`); throw e }
  })

  ipcMain.handle('backups:list', async () => listBackups())
  ipcMain.handle('backups:save', async (_e, name:string, payload:any) => { saveBackup(name, payload); return true })
  ipcMain.handle('backups:load', async (_e, name:string) => loadBackup(name))
  ipcMain.handle('backups:delete', async (_e, name:string) => { deleteBackup(name); return true })

  ipcMain.handle('driver:install', async () => { await driverInstall(); return true })
  ipcMain.handle('driver:uninstall', async () => { await driverUninstall(); return true })
  ipcMain.handle('driver:reload', async () => { await driverReload(); return true })
}

function handleCliOnce() {
  const args = process.argv.slice(1) // keep parity with AHK naming
  // e.g. Driv_Inst | Driv_Unin | Driv_Relo
  // Back_Load <name> | Back_Save <name> | Back_Remo <name>
  // Moni_Sets <int>
  // GPUs_Sets <string>
  // Reso_Adds <w> <h> <hz>
  // Reso_Remo <w> <h> <hz>
  if (!args.length) return
  const cmd = args[0]
  const rest = args.slice(1)
  sendLog(`CLI: ${cmd} ${rest.join(' ')}`)

  try {
    switch (cmd) {
      case 'Driv_Inst': driverInstall().finally(()=>app.quit()); break
      case 'Driv_Unin': driverUninstall().finally(()=>app.quit()); break
      case 'Driv_Relo': driverReload().finally(()=>app.quit()); break

      case 'Back_Load': {
        const name = rest[0] || 'Default'
        const s = loadBackup(name)
        writeConfigToDisk(s)
        app.quit()
        break
      }
      case 'Back_Save': {
        const name = rest[0] || 'Default'
        const s = readConfigFromDisk()
        saveBackup(name, s)
        app.quit()
        break
      }
      case 'Back_Remo': {
        const name = rest[0] || 'Default'
        deleteBackup(name)
        app.quit()
        break
      }

      case 'Moni_Sets': {
        const n = Number(rest[0]||'0')||0
        const s = readConfigFromDisk()
        s.monitorCount = n
        writeConfigToDisk(s)
        app.quit()
        break
      }

      case 'GPUs_Sets': {
        const val = rest.join(' ').trim()
        const s = readConfigFromDisk()
        s.gpuName = val || s.gpuName
        writeConfigToDisk(s)
        app.quit()
        break
      }

      case 'Reso_Adds': {
        const [w,h,hz] = rest.map(n=>Number(n)||0)
        const s = readConfigFromDisk()
        s.active = [{w,h,hz}, ...s.active.filter(r=>!(r.w===w&&r.h===h&&r.hz===hz))]
        writeConfigToDisk(s)
        app.quit()
        break
      }

      case 'Reso_Remo': {
        const [w,h,hz] = rest.map(n=>Number(n)||0)
        const s = readConfigFromDisk()
        s.active = s.active.filter(r=>!(r.w===w&&r.h===h&&r.hz===hz))
        writeConfigToDisk(s)
        app.quit()
        break
      }
    }
  } catch (e:any) {
    dialog.showErrorBox('Command error', e?.message || String(e))
    app.quit()
  }
}
