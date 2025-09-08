import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDev = process.env.ELECTRON_DEV === '1';

// --- paths & constants (updated for new driver) ---
const RES_UI = path.join(process.resourcesPath, 'ui');
const UI_INDEX = path.join(RES_UI, 'index.html');

const USERDATA = app.getPath('userData');
const BACKUPS = path.join(USERDATA, 'Backups');                 // vdd_settings.xml.<name>.backup etc.

// New official location & filenames for Virtual Display Driver
const SYS_DIR = 'C:\\VirtualDisplayDriver';                      // REQUIRED by new driver docs
const DRIVER_INF = path.join(SYS_DIR, 'MttVDD.inf');             // New INF name
const DEFAULT_XML = path.join(SYS_DIR, 'vdd_settings.xml');

// Optional bundle location for nefconw.exe (not required for this driver)
const BIN_DIR = path.join(process.resourcesPath, 'bin');

// New signed driver package
const DRIVER_ZIP_URL =
  'https://github.com/VirtualDrivers/Virtual-Display-Driver/releases/download/25.7.23/VirtualDisplayDriver-x86.Driver.Only.zip';

// Hardware ID for the new driver
const VDD_HARDWARE_ID = 'Root\\MttVDD';

// Prefer an absolute pnputil.exe to avoid PATH/bitness surprises
const PNPUTIL = (() => {
  const sysRoot = process.env['SystemRoot'] || 'C:\\Windows';
  const system32  = path.join(sysRoot, 'System32',  'pnputil.exe');
  const sysnative = path.join(sysRoot, 'Sysnative', 'pnputil.exe');
  if (exists(system32)) return system32;
  if (exists(sysnative)) return sysnative;
  return 'pnputil.exe';
})();

// --- log bridge ---
const logBuffer: string[] = [];
function log(line: string) {
  const stamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const s = `[${stamp}] ${line}`;
  logBuffer.push(s);
  if (logBuffer.length > 2000) logBuffer.shift();
  win?.webContents.send('vdisplay:log', s);
}

// --- tiny helpers ---
function exists(p: string) { try { fs.accessSync(p); return true; } catch { return false; } }
async function ensureDir(p: string) { await fsp.mkdir(p, { recursive: true }); }

// ---------- ICON HELPERS (tray + window) ----------
function resolveTrayIconPath(): string {
  // Packaged: electron-builder copies to resources/icons
  const prod = path.join(process.resourcesPath, 'icons');

  // Dev fallbacks
  const dev1 = path.join(__dirname, '..', 'assets', 'icons');              // dist/main.cjs -> ../assets/icons
  const dev2 = path.join(process.cwd(), 'apps', 'desktop', 'assets', 'icons');

  const pick = (...cands: string[]) => cands.find(p => exists(p)) || cands[0];

  if (process.platform === 'win32') {
    const p = pick(
      path.join(prod, 'tray.ico'),
      path.join(dev1, 'tray.ico'),
      path.join(dev2, 'tray.ico')
    );
    return p;
  } else if (process.platform === 'darwin') {
    // template image for correct tinting
    return pick(
      path.join(prod, 'trayTemplate.png'),
      path.join(dev1, 'trayTemplate.png'),
      path.join(dev2, 'trayTemplate.png')
    );
  } else {
    // linux
    return pick(
      path.join(prod, 'tray.png'),
      path.join(dev1, 'tray.png'),
      path.join(dev2, 'tray.png')
    );
  }
}

function resolveWindowIconPath(): string | undefined {
  const prod = path.join(process.resourcesPath, 'icons');
  const dev1 = path.join(__dirname, '..', 'assets', 'icons');
  const dev2 = path.join(process.cwd(), 'apps', 'desktop', 'assets', 'icons');

  const pick = (...cands: string[]) => cands.find(p => exists(p));

  if (process.platform === 'win32') {
    return pick(
      path.join(prod, 'app.ico'),
      path.join(dev1, 'app.ico'),
      path.join(dev2, 'app.ico')
    );
  } else if (process.platform === 'darwin') {
    // BrowserWindow ignores icon on mac; return undefined
    return undefined;
  } else {
    // linux
    return pick(
      path.join(prod, 'app.png'),
      path.join(dev1, 'app.png'),
      path.join(dev2, 'app.png')
    );
  }
}
// ---------------------------------------------------

// PowerShell runner
function ps(command: string) {
  return new Promise<{ code: number, stdout: string, stderr: string }>((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

// CMD runner
function cmd(command: string) {
  return new Promise<{ code: number, stdout: string, stderr: string }>((resolve) => {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', command], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

// Safe execFile wrapper
function runExe(file: string, args: string[], opts?: { timeoutMs?: number, cwd?: string }) {
  log(`runExe: "${file}" ${args.map(a=>/[\s"]/g.test(a)?`"${a}"`:a).join(' ')}${opts?.cwd?` (cwd=${opts.cwd})`:''}`);
  return new Promise<{ code: number | string; stdout: string; stderr: string }>((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: opts?.timeoutMs, cwd: opts?.cwd }, (error, stdout, stderr) => {
      const code = (error as any)?.code ?? 0;
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

// Try multiple pnputil arg permutations, logging each, stop on first success (code 0)
async function pnputilAttempt(label: string, argSets: string[][], timeoutMs = 30000): Promise<boolean> {
  for (const args of argSets) {
    const r = await runExe(PNPUTIL, args, { timeoutMs });
    log(`${label} -> code=${r.code} args=${args.join(' ')}`);
    if (r.stdout.trim()) log(r.stdout.trim());
    if (r.stderr.trim()) log(r.stderr.trim());
    if (Number(r.code) === 0) return true;
  }
  return false;
}

// --- admin helpers ---
async function isAdmin(): Promise<boolean> {
  const { stdout } = await ps('([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)');
  const res = /True/i.test(stdout.trim());
  log(`isAdmin=${res}`);
  return res;
}

async function relaunchAsAdmin() {
  const exe = process.execPath.replace(/"/g, '`"');
  const args = process.argv.slice(1).map(a => a.replace(/"/g, '`"')).join(' ');
  const command = `Start-Process -Verb RunAs -FilePath "${exe}" -ArgumentList "${args}"`;
  log(`Relaunching as admin: ${command}`);
  await ps(command);
  app.quit();
}

// --- GPU list ---
async function listGpus(): Promise<string[]> {
  const { stdout, stderr, code } = await ps(`Get-CimInstance -ClassName Win32_VideoController | Select-Object -ExpandProperty Name`);
  if (stderr.trim()) log(`listGpus stderr: ${stderr.trim()}`);
  if (code !== 0) log(`listGpus exit code: ${code}`);
  const lines = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const banned = ['IddSampleDriver', 'Microsoft Remote Display Adapter', 'Parsec Virtual Display Adapter', 'Virtual Display with HDR'];
  const out = lines.filter(n => !banned.some(b => n.toLowerCase().includes(b.toLowerCase())));
  log(`GPUs: ${out.join(' | ') || '(none)'}`);
  return out;
}

// --- config model & XML I/O (supports new <global> & <options>) ---
type Row = { id: string; w: number; h: number; hz: number };
type AppConfig = { gpuName: string; monitorCount: number; active: Row[]; retired: Row[] };

function uid() { return Math.random().toString(36).slice(2, 10); }

function parseXml(xml: string): AppConfig | null {
  try {
    const gc = /<count>\s*([0-9]+)\s*<\/count>/i.exec(xml)?.[1];
    const mon = gc ? parseInt(gc, 10) : 1;
    const gpu = /<friendlyname>([^<]+)<\/friendlyname>/i.exec(xml)?.[1] ?? '(Select GPU)';
    const blocks = Array.from(xml.matchAll(/<resolution>([\s\S]*?)<\/resolution>/gi)).map(m => m[1]);
    const rows: Row[] = [];
    for (const b of blocks) {
      const w = parseInt(/<width>\s*([0-9]+)\s*<\/width>/i.exec(b)?.[1] ?? '0', 10);
      const h = parseInt(/<height>\s*([0-9]+)\s*<\/height>/i.exec(b)?.[1] ?? '0', 10);
      const rates = Array.from(b.matchAll(/<refresh_rate>\s*([0-9]+)\s*<\/refresh_rate>/gi)).map(m => parseInt(m[1], 10));
      for (const hz of (rates.length ? rates : [0])) rows.push({ id: uid(), w, h, hz });
    }
    const cfg = { gpuName: gpu, monitorCount: mon, active: rows.filter(r => r.w && r.h && r.hz), retired: [] };
    return cfg;
  } catch (e:any) {
    log(`parseXml error: ${e.message||e}`);
    return null;
  }
}

function toFilesFromState(s: AppConfig) {
  const valid = s.active.filter(r => r.w > 0 && r.h > 0 && r.hz > 0);
  // Build global refresh list (unique, ascending)
  const globalRates = Array.from(new Set(valid.map(r => r.hz))).sort((a, b) => a - b);
  // group for per-resolution
  const groups = new Map<string, { w: number, h: number, hz: number[] }>();
  for (const r of valid) {
    const k = `${r.w}x${r.h}`;
    if (!groups.has(k)) groups.set(k, { w: r.w, h: r.h, hz: [] });
    const g = groups.get(k)!; if (!g.hz.includes(r.hz)) g.hz.push(r.hz);
  }
  let xml = `<?xml version='1.0' encoding='utf-8'?>\n<vdd_settings>\n  <monitors>\n    <count>${s.monitorCount}</count>\n  </monitors>\n  <gpu>\n    <friendlyname>${(s.gpuName || 'default').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</friendlyname>\n  </gpu>\n`;
  if (globalRates.length) {
    xml += `  <global>\n`;
    for (const hz of globalRates) xml += `    <g_refresh_rate>${hz}</g_refresh_rate>\n`;
    xml += `  </global>\n`;
  }
  xml += `  <resolutions>\n`;
  for (const g of groups.values()) {
    xml += `    <resolution>\n      <width>${g.w}</width>\n      <height>${g.h}</height>\n`;
    for (const hz of g.hz) xml += `      <refresh_rate>${hz}</refresh_rate>\n`;
    xml += `    </resolution>\n`;
  }
  xml += `  </resolutions>\n`;
  xml += `  <options>\n    <CustomEdid>false</CustomEdid>\n    <PreventSpoof>false</PreventSpoof>\n    <EdidCeaOverride>false</EdidCeaOverride>\n    <HardwareCursor>true</HardwareCursor>\n    <SDR10bit>false</SDR10bit>\n    <HDRPlus>false</HDRPlus>\n    <logging>false</logging>\n    <debuglogging>false</debuglogging>\n  </options>\n</vdd_settings>`;
  // (adapter/option kept for historical continuity)
  const adapter = (s.gpuName || '(Select GPU)') + '\n';
  const option = [String(s.monitorCount), ...valid.map(r => `${r.w}, ${r.h}, ${r.hz}`)].join('\n') + '\n';
  return { adapter, option, xml };
}

async function loadSystemConfig(): Promise<AppConfig> {
  try {
    if (exists(DEFAULT_XML)) {
      const xml = await fsp.readFile(DEFAULT_XML, 'utf8');
      const cfg = parseXml(xml);
      if (cfg) { log(`Loaded XML config from ${DEFAULT_XML}`); return cfg; }
    }
  } catch (e: any) {
    log(`loadSystemConfig warning: ${e.message || e}`);
  }
  // Default
  const def: AppConfig = { gpuName: '(Select GPU)', monitorCount: 1, active: [], retired: [] };
  log(`Using default config: ${JSON.stringify(def)}`);
  return def;
}

async function writeSystemConfig(cfg: AppConfig) {
  await ensureDir(SYS_DIR);
  const { xml } = toFilesFromState(cfg);
  await fsp.writeFile(DEFAULT_XML, xml, 'utf8');
  log(`Wrote config to ${SYS_DIR}`);
}

// --- backups (XML only) ---
async function listBackups(): Promise<string[]> {
  await ensureDir(BACKUPS);
  const files = await fsp.readdir(BACKUPS);
  const names = new Set<string>();
  for (const f of files) {
    const m = f.match(/\.(.+)\.backup$/); if (m) names.add(m[1]);
  }
  const arr = Array.from(names).sort();
  log(`Backups found: ${arr.join(', ') || '(none)'}`);
  return arr;
}
async function saveBackup(name: string, cfg: AppConfig) {
  await ensureDir(BACKUPS);
  const { xml } = toFilesFromState(cfg);
  const p = path.join(BACKUPS, `vdd_settings.xml.${name}.backup`);
  await fsp.writeFile(p, xml, 'utf8');
  log(`Saved backup "${name}" -> ${p}`);
}
async function loadBackup(name: string): Promise<AppConfig | null> {
  const xmlf = path.join(BACKUPS, `vdd_settings.xml.${name}.backup`);
  if (exists(xmlf)) {
    const xml = await fsp.readFile(xmlf, 'utf8');
    const cfg = parseXml(xml); if (cfg) { log(`Loaded backup "${name}" (xml)`); return cfg; }
  }
  log(`Backup "${name}" not found`);
  return null;
}
async function deleteBackup(name: string) {
  const p = path.join(BACKUPS, `vdd_settings.xml.${name}.backup`);
  if (exists(p)) await fsp.rm(p, { force: true });
  log(`Deleted backup "${name}"`);
}

// --- driver package bootstrap (NEW flow for C:\\VirtualDisplayDriver) ---
async function ensureDriverHome(): Promise<boolean> {
  try {
    if (exists(DRIVER_INF)) {
      log('Driver files present at C:\\VirtualDisplayDriver.');
      return true;
    }
    log('Driver files missing — downloading & staging.');
    await ensureDir(SYS_DIR);

    const tmpDir = path.join(USERDATA, 'VDD_Download');
    await ensureDir(tmpDir);
    const zip = path.join(tmpDir, 'VirtualDisplayDriver.zip').replace(/\\/g, '/');
    const url = DRIVER_ZIP_URL.replace(/"/g, '`"');

    // Download + extract to temp
    const dl = `Invoke-WebRequest -UseBasicParsing -OutFile "${zip}" -Uri "${url}"`;
    const ex = `Expand-Archive -LiteralPath "${zip}" -DestinationPath "${tmpDir}" -Force`;
    // The zip contains a top-level 'VirtualDisplayDriver' directory
    const srcA = path.join(tmpDir, 'VirtualDisplayDriver', '*').replace(/\\/g, '/');
    const srcB = path.join(tmpDir, '*').replace(/\\/g, '/'); // fallback if structure differs
    const copyTryA = `if (Test-Path "${path.dirname(srcA)}") { Copy-Item "${srcA}" -Destination "${SYS_DIR}" -Recurse -Force }`;
    const copyTryB = `elseif (Test-Path "${tmpDir}") { Copy-Item "${srcB}" -Destination "${SYS_DIR}" -Recurse -Force }`;
    const cleanup = `Remove-Item -Recurse -Force "${tmpDir}"`;
    log(`ensureDriverHome: url=${DRIVER_ZIP_URL}`);
    const { code, stderr } = await ps(`${dl}; ${ex}; ${copyTryA}; ${copyTryB}; ${cleanup}`);
    if (code !== 0) { log(`Driver download/extract failed: ${stderr}`); return false; }
    log('Driver files copied to C:\\VirtualDisplayDriver.');
    const ok = exists(DRIVER_INF);
    log(`DRIVER_INF exists=${ok} (${DRIVER_INF})`);
    return ok;
  } catch (e: any) {
    log(`ensureDriverHome error: ${e.message || e}`);
    return false;
  }
}

// Set registry overrides so the driver knows where to read settings from
async function ensureRegistryOverrides() {
  const script = `
    $path = 'HKLM:\\SOFTWARE\\MikeTheTech\\VirtualDisplayDriver';
    if (-not (Test-Path $path)) { New-Item -Path 'HKLM:\\SOFTWARE\\MikeTheTech' -Name 'VirtualDisplayDriver' -Force | Out-Null }
    New-ItemProperty -Path $path -Name 'VDDPATH' -PropertyType String -Value '${SYS_DIR}' -Force | Out-Null
  `;
  const r = await ps(script);
  if (r.code !== 0) log(`ensureRegistryOverrides stderr: ${r.stderr.trim()}`);
  else log('Registry override set: HKLM\\SOFTWARE\\MikeTheTech\\VirtualDisplayDriver\\VDDPATH');
}

// Returns {published?: 'oem76.inf'}
async function findPublishedInf(): Promise<{ published?: string }> {
  const r = await runExe(PNPUTIL, ['/enum-drivers'], { timeoutMs: 30000 });
  const text = `${r.stdout}\n${r.stderr}`;
  const blocks = text.split(/\r?\n\r?\n/);
  for (const b of blocks) {
    if (/Original Name:\s*MttVDD\.inf/i.test(b)) {
      const m = b.match(/Published Name:\s*(oem\d+\.inf)/i);
      if (m) {
        const pub = m[1];
        log(`findPublishedInf -> ${pub}`);
        return { published: pub };
      }
    }
  }
  log('findPublishedInf -> not found');
  return {};
}

// Prefer HardwareID match; fall back to friendly-name contains 'Virtual Display'
async function getVddInstanceIds(): Promise<string[]> {
  const script = `
    $dev = Get-PnpDevice -HardwareID 'Root\\MttVDD' -ErrorAction SilentlyContinue |
      Select-Object InstanceId

    if (-not $dev) {
      $dev = Get-PnpDevice -Class Display -ErrorAction SilentlyContinue |
        Where-Object { $_.FriendlyName -match 'Virtual\\s*Display' } |
        Select-Object InstanceId
    }

    $dev | ConvertTo-Json -Compress
  `;
  const { stdout, stderr, code } = await ps(script);
  if (stderr.trim()) log(`getVddInstanceIds stderr: ${stderr.trim()}`);
  if (code !== 0) log(`getVddInstanceIds exit code: ${code}`);
  try {
    const parsed = JSON.parse(stdout || '[]');
    const arr = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    const ids = arr.map((x: any) => String(x.InstanceId)).filter(Boolean);
    log(`VDD Instance IDs: ${ids.join(', ') || '(none)'}`);
    return ids;
  } catch (e:any) {
    log(`getVddInstanceIds parse error: ${e.message||e}`);
    return [];
  }
}

// Real run-state based on device presence & Status (running/disabled)
async function getVddRunState(): Promise<'not-detected'|'stopped'|'running'> {
  const script = `
    $dev = Get-PnpDevice -HardwareID 'Root\\MttVDD' -ErrorAction SilentlyContinue |
      Select-Object Status
    if (-not $dev) { 'not-detected' }
    elseif ($dev | Where-Object { $_.Status -match 'Disabled' }) { 'stopped' }
    else { 'running' }
  `;
  const { stdout, stderr, code } = await ps(script);
  if (stderr.trim()) log(`getVddRunState stderr: ${stderr.trim()}`);
  if (code !== 0) log(`getVddRunState exit code: ${code}`);
  const v = (stdout || '').trim().replace(/["'\r\n]+/g,'');
  const state = (v === 'stopped' || v === 'running') ? v as any : 'not-detected';
  log(`getVddRunState -> ${state}`);
  return state;
}

// --- driver management (new) ---
function nefconwPath() {
  const p = path.join(BIN_DIR, 'nefconw.exe');
  const present = exists(p);
  log(`nefconwPath -> ${present ? p : '(not found)'}`);
  return present ? p : null;
}

async function driverInstall(): Promise<void> {
  log('Driver install requested');
  log(`resourcesPath=${process.resourcesPath}`);
  log(`BIN_DIR=${BIN_DIR}`);
  log(`DRIVER_INF=${DRIVER_INF}`);
  if (!(await isAdmin())) { log('Admin required for install'); throw new Error('ELEVATION_REQUIRED'); }

  const ok = await ensureDriverHome();
  if (!ok) throw new Error('DRIVER_FILES_MISSING');

  await ensureRegistryOverrides();

  const nef = nefconwPath();
  if (nef) log(`nefconw present at ${nef} (not required for this driver)`);

  log('Calling pnputil /add-driver ...');
  const added = await pnputilAttempt('pnputil add-driver', [
    ['/add-driver', DRIVER_INF, '/install']
  ], 60000);
  if (!added) throw new Error('PNPUTIL_ADD_DRIVER_FAILED');

  // After install, log state
  await getVddRunState();
}

async function driverUninstall(): Promise<void> {
  log('Driver uninstall requested');
  if (!(await isAdmin())) { log('Admin required for uninstall'); throw new Error('ELEVATION_REQUIRED'); }

  // 1) Try to remove device instances first (helps unlock the package)
  const ids = await getVddInstanceIds();
  for (const id of ids) {
    await pnputilAttempt(`pnputil remove-device (${id})`, [
      ['/remove-device', '/instanceid', id],
      ['/remove-device', '/deviceid', id],
      ['/remove-device', id]
    ], 20000);
  }

  // 2) Delete the installed package with Original Name: MttVDD.inf
  const { published } = await findPublishedInf();
  if (published) {
    const deleted = await pnputilAttempt(`pnputil delete-driver ${published}`, [
      ['/delete-driver', published, '/uninstall', '/force']
    ], 60000);

    if (!deleted) {
      // If deletion failed because a device reappeared, try removing devices again
      const again = await getVddInstanceIds();
      for (const id of again) {
        await pnputilAttempt(`retry remove-device (${id})`, [
          ['/remove-device', '/instanceid', id],
          ['/remove-device', '/deviceid', id],
          ['/remove-device', id]
        ], 20000);
      }
    }
  } else {
    log('No installed MttVDD.inf package found in driver store.');
  }

  await getVddRunState();
  // We intentionally leave C:\\VirtualDisplayDriver & registry to preserve settings.
}

async function driverReload(): Promise<void> {
  log('Driver reload requested');
  if (!(await isAdmin())) { log('Admin required for reload'); throw new Error('ELEVATION_REQUIRED'); }

  const ids = await getVddInstanceIds();
  if (!ids.length) {
    log('No Root\\MttVDD device instances found to restart (is it installed and enabled?)');
    return;
  }
  for (const id of ids) {
    await pnputilAttempt(`pnputil restart-device (${id})`, [
      ['/restart-device', '/instanceid', id],
      ['/restart-device', '/deviceid', id],
      ['/restart-device', id]
    ], 20000);
  }

  await getVddRunState();
}

// Disable without uninstall (Pause)
async function driverDisable(): Promise<void> {
  log('Driver disable requested');
  if (!(await isAdmin())) { log('Admin required for disable'); throw new Error('ELEVATION_REQUIRED'); }

  // Blanket disable by hardware ID
  const blanket = await pnputilAttempt('pnputil disable-device (by hardware-id)', [
    ['/disable-device', '/deviceid', VDD_HARDWARE_ID]
  ], 30000);

  if (!blanket) {
    // Fallback: disable per-instance
    const ids = await getVddInstanceIds();
    if (!ids.length) { log('No Root\\MttVDD instances found to disable'); return; }
    for (const id of ids) {
      await pnputilAttempt(`pnputil disable-device (${id})`, [
        ['/disable-device', '/instanceid', id],
        ['/disable-device', '/deviceid', id],
        ['/disable-device', id]
      ], 30000);
    }
  }

  await getVddRunState();
}

// Enable again (Resume)
async function driverEnable(): Promise<void> {
  log('Driver enable requested');
  if (!(await isAdmin())) { log('Admin required for enable'); throw new Error('ELEVATION_REQUIRED'); }

  // Blanket enable by hardware ID
  const blanket = await pnputilAttempt('pnputil enable-device (by hardware-id)', [
    ['/enable-device', '/deviceid', VDD_HARDWARE_ID]
  ], 30000);

  if (!blanket) {
    // Fallback: enable per-instance
    const ids = await getVddInstanceIds();
    if (!ids.length) { log('No Root\\MttVDD instances found to enable'); return; }
    for (const id of ids) {
      await pnputilAttempt(`pnputil enable-device (${id})`, [
        ['/enable-device', '/instanceid', id],
        ['/enable-device', '/deviceid', id],
        ['/enable-device', id]
      ], 30000);
    }
  }

  await getVddRunState();
}

// --- CLI (still supported for Sunshine) ---
async function handleCli(): Promise<boolean> {
  const args = process.argv.slice(1).filter(a => !a.startsWith('--inspect'));
  const head = args[0]?.toLowerCase();
  if (!head) return false;

  const verb = head;
  const tail = args.slice(1);

  try {
    switch (verb) {
      case 'driv_inst': await driverInstall(); return true;
      case 'driv_unin': await driverUninstall(); return true;
      case 'driv_relo': await driverReload(); return true;
      case 'driv_stop': await driverDisable(); return true;
      case 'driv_start': await driverEnable(); return true;

      case 'back_load': {
        const name = tail.join(' ').trim();
        const cfg = name ? await loadBackup(name) : null;
        if (cfg) await writeSystemConfig(cfg);
        return true;
      }
      case 'back_save': {
        const name = tail.join(' ').trim() || 'Default';
        const cfg = await loadSystemConfig();
        await saveBackup(name, cfg);
        return true;
      }
      case 'back_remo': {
        const name = tail.join(' ').trim();
        if (name) await deleteBackup(name);
        return true;
      }
      case 'moni_sets': {
        const n = parseInt(tail[0] || '0', 10);
        if (n > 0) { const cfg = await loadSystemConfig(); cfg.monitorCount = n; await writeSystemConfig(cfg); }
        return true;
      }
      case 'gpus_sets': {
        const v = tail.join(' ').trim();
        if (v) { const cfg = await loadSystemConfig(); cfg.gpuName = v; await writeSystemConfig(cfg); }
        return true;
      }
      case 'reso_adds':
      case 'reso_remo': {
        const [w, h, hz] = tail.map(x => parseInt(x, 10));
        if (w && h && hz) {
          const cfg = await loadSystemConfig();
          const key = (r: Row) => r.w === w && r.h === h && r.hz === hz;
          if (verb === 'reso_adds') {
            cfg.active = [{ id: uid(), w, h, hz }, ...cfg.active.filter(r => !key(r))];
          } else {
            cfg.active = cfg.active.filter(r => !key(r));
          }
          await writeSystemConfig(cfg);
        }
        return true;
      }
    }
  } catch (e: any) {
    log(`CLI error: ${e.message || e}`);
    return true;
  }
  return false;
}

// --- IPC for renderer ---
type AppState = AppConfig & { backups: string[], driverState: 'not-detected' | 'stopped' | 'running' };

ipcMain.handle('vdisplay:init', async () => {
  const [admin, gpus, cfg, bks, state] = await Promise.all([
    isAdmin(), listGpus(), loadSystemConfig(), listBackups(), getVddRunState()
  ]);
  return { isAdmin: admin, gpus, config: cfg, backups: bks, driverState: state, log: logBuffer };
});

ipcMain.handle('vdisplay:saveConfig', async (_e, cfg: AppConfig) => { await writeSystemConfig(cfg); return true; });
ipcMain.handle('vdisplay:listGpus', async () => listGpus());
ipcMain.handle('vdisplay:backups:list', async () => listBackups());
ipcMain.handle('vdisplay:backups:save', async (_e, name: string, cfg: AppConfig) => { await saveBackup(name, cfg); return true; });
ipcMain.handle('vdisplay:backups:load', async (_e, name: string) => await loadBackup(name));
ipcMain.handle('vdisplay:backups:delete', async (_e, name: string) => { await deleteBackup(name); return true; });

ipcMain.handle('vdisplay:driver:install', async () => { try { await driverInstall(); return { ok: true }; } catch (e: any) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('vdisplay:driver:uninstall', async () => { try { await driverUninstall(); return { ok: true }; } catch (e: any) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('vdisplay:driver:reload', async () => { try { await driverReload(); return { ok: true }; } catch (e: any) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.handle('vdisplay:driver:disable', async () => { try { await driverDisable(); return { ok: true }; } catch (e:any){ return { ok:false, error:String(e.message||e) }; } });
ipcMain.handle('vdisplay:driver:enable',  async () => { try { await driverEnable();  return { ok: true }; } catch (e:any){ return { ok:false, error:String(e.message||e) }; } });
ipcMain.handle('vdisplay:driver:state', async () => {
  const state = await getVddRunState();
  return { state };
});
ipcMain.handle('vdisplay:driver:ensurePkg', async () => await ensureDriverHome());
ipcMain.handle('vdisplay:admin:check', async () => await isAdmin());
ipcMain.handle('vdisplay:admin:relaunch', async () => { await relaunchAsAdmin(); return true; });

// --- window/tray ---
function createWindow() {
  const winIcon = resolveWindowIconPath();
  if (winIcon) log(`Window icon: ${winIcon}`);

  const w = new BrowserWindow({
    width: 1120, height: 800, show: false,
    icon: winIcon,                                 // (ignored on macOS)
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') }
  });
  if (isDev) {
    log('Loading UI from dev server http://localhost:5173');
    w.loadURL('http://localhost:5173');
  } else {
    if (!exists(UI_INDEX)) {
      const msg = `Expected ${UI_INDEX}\nMake sure apps/web/dist was copied to resources/ui.`;
      log(`UI not found: ${msg}`);
      dialog.showErrorBox('UI not found', msg);
    } else {
      log(`Loading UI from file: ${UI_INDEX}`);
      w.loadFile(UI_INDEX);
    }
  }
  w.on('ready-to-show', ()=> { if (!w.isDestroyed()) w.show(); });
  w.on('closed', ()=> { if (win===w) win = null; });
  win = w;
}

function ensureWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { log('Another instance detected — quitting.'); app.quit(); }
else {
  app.on('second-instance', ()=> { log('Second instance invoked — focusing window.'); ensureWindow(); });
  app.whenReady().then(async () => {
    log(`App ready. resourcesPath=${process.resourcesPath}`);
    const handled = await handleCli();
    if (handled) { log('CLI handled, exiting.'); app.quit(); return; }
    createWindow();

    // ---- TRAY with real icon ----
    const trayPath = resolveTrayIconPath();
    let trayImage = nativeImage.createFromPath(trayPath);
    if (!trayImage || trayImage.isEmpty()) {
      trayImage = nativeImage.createEmpty();
      log(`Tray icon missing at ${trayPath}, using empty image.`);
    } else {
      log(`Using tray icon: ${trayPath}`);
      if (process.platform === 'darwin') trayImage.setTemplateImage(true);
    }
    tray = new Tray(trayImage);
    tray.setToolTip('Virtual Display Wizard');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: ()=> ensureWindow() },
      { label: 'Show Config Folder', click: ()=> shell.openPath(SYS_DIR) },
      { type:'separator' },
      { label: 'Quit', click: ()=> app.quit() },
    ]));
    log('Tray initialized.');
  });
  app.on('activate', ()=> { log('App activate'); ensureWindow(); });
  app.on('window-all-closed', ()=> { log('All windows closed (tray continues running)'); });
}
