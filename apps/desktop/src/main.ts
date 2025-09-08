import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let win: BrowserWindow | null = null
let tray: Tray | null = null

const isDev = process.env.ELECTRON_DEV === '1'
const TRAY_IMG = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='
)

function uiFilePath() {
  return isDev
    ? null
    : path.join(process.resourcesPath, 'ui', 'index.html') // ← copied by extraResources
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs')
  const hasPreload = fs.existsSync(preloadPath)

  const w = new BrowserWindow({
    width: 1120,
    height: 800,
    show: false,
    webPreferences: { preload: hasPreload ? preloadPath : undefined },
  })

  if (isDev) {
    w.loadURL('http://localhost:5173')
  } else {
    const uiPath = uiFilePath()
    if (!uiPath || !fs.existsSync(uiPath)) {
      dialog.showErrorBox('UI not found', `Expected ${uiPath}\nMake sure apps/web/dist exists and extraResources copied it to resources/ui.`)
    } else {
      w.loadFile(uiPath) // ← no file:// URL, directly load the file path
    }
  }

  w.on('ready-to-show', () => { if (!w.isDestroyed()) w.show() })
  w.on('closed', () => { if (win === w) win = null })

  // If anything fails to load, tell us exactly why
  w.webContents.on('did-fail-load', (_e, code, desc, url) => {
    dialog.showErrorBox('Load failed', `code=${code}\ndesc=${desc}\nurl=${url}`)
  })
  w.webContents.on('render-process-gone', (_e, details) => {
    dialog.showErrorBox('Renderer crashed', JSON.stringify(details, null, 2))
  })

  // Optional: flip on to auto-open devtools when debugging a white screen locally
  if (process.env.DEBUG_UI === '1') w.webContents.openDevTools({ mode: 'detach' })

  win = w
}

function ensureWindow() {
  const w = win
  if (!w || w.isDestroyed()) { createWindow(); return }
  try { if (w.isMinimized()) w.restore(); if (!w.isVisible()) w.show(); w.focus() } catch { createWindow() }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => ensureWindow())

  app.whenReady().then(() => {
    createWindow()
    tray = new Tray(TRAY_IMG)
    try { tray.setToolTip('Virtual Display Wizard') } catch {}
    const menu = Menu.buildFromTemplate([
      { label: 'Open', click: () => ensureWindow() },
      { label: 'Quit', click: () => app.quit() },
    ])
    try { tray.setContextMenu(menu) } catch {}
  })

  app.on('activate', () => ensureWindow())
  app.on('window-all-closed', () => {}) // keep in tray
  process.on('uncaughtException', () => {}) // suppress modal crash box
}
