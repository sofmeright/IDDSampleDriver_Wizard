// ui/desktop/src/main.ts — Thin Electron shell.
// Window management, tray, single-instance lock, admin elevation.
// ALL driver/config/backup operations go through the Go API.
import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDev = process.env.ELECTRON_DEV === '1';

const RES_UI = path.join(process.resourcesPath, 'ui');
const UI_INDEX = path.join(RES_UI, 'index.html');
const SYS_DIR = 'C:\\VirtualDisplayDriver';

const API_BASE = process.env.DWIZ_API || 'http://127.0.0.1:5757';

// --- log bridge ---
const logBuffer: string[] = [];
function log(line: string) {
  const stamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const s = `[${stamp}] ${line}`;
  logBuffer.push(s);
  if (logBuffer.length > 2000) logBuffer.shift();
  win?.webContents.send('vdisplay:log', s);
}

// --- helpers ---
function exists(p: string) { try { fs.accessSync(p); return true; } catch { return false; } }

// --- Go API client ---
async function api<T = any>(method: string, path: string, body?: any): Promise<T> {
  const url = `${API_BASE}${path}`;
  log(`API ${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path}: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// --- Admin (GUI concern — Go backend detects, Electron relaunches) ---
async function isAdmin(): Promise<boolean> {
  try {
    // Check via Go API — if API is running elevated, we're good
    const status = await api('GET', '/api/status');
    return true; // API responded = it's running (admin check is backend-internal)
  } catch {
    return false;
  }
}

async function relaunchAsAdmin() {
  const exe = process.execPath.replace(/"/g, '`"');
  const args = process.argv.slice(1).map(a => a.replace(/"/g, '`"')).join(' ');
  const child = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `Start-Process -Verb RunAs -FilePath "${exe}" -ArgumentList "${args}"`,
  ], { windowsHide: true });
  child.on('close', () => app.quit());
}

// --- IPC handlers → Go API ---
ipcMain.handle('vdisplay:init', async () => {
  try {
    const [status, gpus, backups] = await Promise.all([
      api('GET', '/api/status'),
      api('GET', '/api/gpus'),
      api('GET', '/api/backups'),
    ]);

    // Map Go API response to the UI's expected shape
    const config = status.Config || { gpuName: '(Select GPU)', monitorCount: 1, active: [], retired: [] };
    const driverState = status.Driver?.Running ? 'running'
      : status.Driver?.Installed ? 'stopped'
      : 'not-detected';

    const gpuNames = (gpus || []).map((g: any) => g.Name);
    const backupNames = (backups || []).map((b: any) => b.Name);

    // Map config resolutions to the flat Row format the UI expects
    const active: Array<{id: string; w: number; h: number; hz: number}> = [];
    for (const r of config.Resolutions || []) {
      for (const hz of r.RefreshRates || []) {
        active.push({ id: Math.random().toString(36).slice(2, 10), w: r.Width, h: r.Height, hz });
      }
    }

    return {
      isAdmin: true, // API is running = elevated
      gpus: gpuNames,
      config: {
        gpuName: config.GPU || '(Select GPU)',
        monitorCount: config.MonitorCount || 1,
        active,
        retired: [],
      },
      backups: backupNames,
      driverState,
      log: logBuffer,
    };
  } catch (e: any) {
    log(`init error: ${e.message || e}`);
    return {
      isAdmin: false,
      gpus: [],
      config: { gpuName: '(Select GPU)', monitorCount: 1, active: [], retired: [] },
      backups: [],
      driverState: 'not-detected' as const,
      log: logBuffer,
    };
  }
});

ipcMain.handle('vdisplay:saveConfig', async (_e, cfg: any) => {
  // Convert UI format (flat rows) to API format (grouped resolutions)
  const resMap = new Map<string, { Width: number; Height: number; RefreshRates: number[] }>();
  for (const r of cfg.active || []) {
    const k = `${r.w}x${r.h}`;
    if (!resMap.has(k)) resMap.set(k, { Width: r.w, Height: r.h, RefreshRates: [] });
    const entry = resMap.get(k)!;
    if (!entry.RefreshRates.includes(r.hz)) entry.RefreshRates.push(r.hz);
  }

  await api('POST', '/api/reconcile', {
    config: {
      monitor_count: cfg.monitorCount,
      gpu: cfg.gpuName,
      resolutions: Array.from(resMap.values()).map(r => ({
        width: r.Width,
        height: r.Height,
        refresh_rates: r.RefreshRates,
      })),
    },
  });
  return true;
});

ipcMain.handle('vdisplay:listGpus', async () => {
  const gpus = await api('GET', '/api/gpus');
  return (gpus || []).map((g: any) => g.Name);
});

ipcMain.handle('vdisplay:backups:list', async () => {
  const backups = await api('GET', '/api/backups');
  return (backups || []).map((b: any) => b.Name);
});

ipcMain.handle('vdisplay:backups:save', async (_e, name: string) => {
  await api('POST', '/api/backups', { name });
  return true;
});

ipcMain.handle('vdisplay:backups:load', async (_e, name: string) => {
  await api('POST', '/api/backups/restore', { name });
  // After restore, re-read config from API
  const status = await api('GET', '/api/status');
  const config = status.Config || {};
  const active: Array<{id: string; w: number; h: number; hz: number}> = [];
  for (const r of config.Resolutions || []) {
    for (const hz of r.RefreshRates || []) {
      active.push({ id: Math.random().toString(36).slice(2, 10), w: r.Width, h: r.Height, hz });
    }
  }
  return {
    gpuName: config.GPU || '(Select GPU)',
    monitorCount: config.MonitorCount || 1,
    active,
    retired: [],
  };
});

ipcMain.handle('vdisplay:backups:delete', async (_e, name: string) => {
  // Delete is not yet in Go API — for now, no-op
  log(`backup delete "${name}" — not yet implemented in Go API`);
  return true;
});

ipcMain.handle('vdisplay:driver:install', async () => {
  try {
    const res = await api('POST', '/api/reconcile', { driver: { installed: true } });
    return { ok: true, results: res };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('vdisplay:driver:uninstall', async () => {
  try {
    const res = await api('POST', '/api/reconcile', { driver: { installed: false } });
    return { ok: true, results: res };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('vdisplay:driver:reload', async () => {
  try {
    const res = await api('POST', '/api/reconcile', { driver: { installed: true, reload: true } });
    return { ok: true, results: res };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('vdisplay:driver:disable', async () => {
  // Disable is reload-adjacent — not yet modeled
  log('driver disable — not yet implemented via reconcile');
  return { ok: false, error: 'not implemented' };
});

ipcMain.handle('vdisplay:driver:enable', async () => {
  try {
    const res = await api('POST', '/api/reconcile', { driver: { installed: true, reload: true } });
    return { ok: true, results: res };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('vdisplay:driver:state', async () => {
  try {
    const status = await api('GET', '/api/status');
    const state = status.Driver?.Running ? 'running'
      : status.Driver?.Installed ? 'stopped'
      : 'not-detected';
    return { state };
  } catch {
    return { state: 'not-detected' };
  }
});

ipcMain.handle('vdisplay:driver:ensurePkg', async () => {
  // Package staging happens automatically during install
  return true;
});

ipcMain.handle('vdisplay:admin:check', async () => {
  return isAdmin();
});

ipcMain.handle('vdisplay:admin:relaunch', async () => {
  await relaunchAsAdmin();
  return true;
});

// --- window/tray (unchanged — pure Electron concerns) ---
function resolveTrayIconPath(): string {
  const prod = path.join(process.resourcesPath, 'icons');
  const dev1 = path.join(__dirname, '..', 'assets', 'icons');
  const dev2 = path.join(process.cwd(), 'ui', 'desktop', 'assets', 'icons');

  const pick = (...cands: string[]) => cands.find(p => exists(p)) || cands[0];

  if (process.platform === 'win32') {
    return pick(path.join(prod, 'tray.ico'), path.join(dev1, 'tray.ico'), path.join(dev2, 'tray.ico'));
  } else if (process.platform === 'darwin') {
    return pick(path.join(prod, 'trayTemplate.png'), path.join(dev1, 'trayTemplate.png'), path.join(dev2, 'trayTemplate.png'));
  } else {
    return pick(path.join(prod, 'tray.png'), path.join(dev1, 'tray.png'), path.join(dev2, 'tray.png'));
  }
}

function resolveWindowIconPath(): string | undefined {
  const prod = path.join(process.resourcesPath, 'icons');
  const dev1 = path.join(__dirname, '..', 'assets', 'icons');
  const dev2 = path.join(process.cwd(), 'ui', 'desktop', 'assets', 'icons');
  const pick = (...cands: string[]) => cands.find(p => exists(p));
  if (process.platform === 'win32') return pick(path.join(prod, 'app.ico'), path.join(dev1, 'app.ico'), path.join(dev2, 'app.ico'));
  if (process.platform === 'darwin') return undefined;
  return pick(path.join(prod, 'app.png'), path.join(dev1, 'app.png'), path.join(dev2, 'app.png'));
}

function createWindow() {
  const winIcon = resolveWindowIconPath();
  if (winIcon) log(`Window icon: ${winIcon}`);

  const w = new BrowserWindow({
    width: 1120,
    height: 800,
    show: false,
    icon: winIcon,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });

  if (isDev) {
    log('Loading UI from dev server http://localhost:5173');
    w.loadURL('http://localhost:5173');
  } else {
    if (!exists(UI_INDEX)) {
      const msg = `Expected ${UI_INDEX}\nMake sure ui/web/dist was copied to resources/ui.`;
      log(`UI not found: ${msg}`);
      dialog.showErrorBox('UI not found', msg);
    } else {
      log(`Loading UI from file: ${UI_INDEX}`);
      w.loadFile(UI_INDEX);
    }
  }
  w.on('ready-to-show', () => { if (!w.isDestroyed()) w.show(); });
  w.on('closed', () => { if (win === w) win = null; });
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
  app.on('second-instance', () => { log('Second instance invoked — focusing window.'); ensureWindow(); });
  app.whenReady().then(async () => {
    log(`App ready. resourcesPath=${process.resourcesPath}`);
    log(`API base: ${API_BASE}`);
    createWindow();

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
    tray.setToolTip('DisplayWizard');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: () => ensureWindow() },
      { label: 'Show Config Folder', click: () => shell.openPath(SYS_DIR) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
    log('Tray initialized.');
  });
  app.on('activate', () => { log('App activate'); ensureWindow(); });
  app.on('window-all-closed', () => { log('All windows closed (tray continues running)'); });
}
