import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let win: BrowserWindow | null = null
let tray: Tray | null = null

const isDev = process.env.ELECTRON_DEV === '1'

// 1x1 transparent PNG (valid NativeImage so Tray is stable on Windows)
const TRAY_IMG = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='
)

function createWindow() {
  const w = new BrowserWindow({
    width: 1120,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  const url = isDev
    ? 'http://localhost:5173'
    : pathToFileURL(path.join(process.resourcesPath, 'ui', 'index.html')).toString()

  w.loadURL(url)

  w.on('ready-to-show', () => {
    if (!w.isDestroyed()) w.show()
  })

  w.on('closed', () => {
    if (win === w) win = null
  })

  win = w
}

function ensureWindow() {
  const w = win
  if (!w || w.isDestroyed()) {
    createWindow()
    return
  }
  try {
    if (w.isMinimized()) w.restore()
    if (!w.isVisible()) w.show()
    w.focus()
  } catch {
    createWindow()
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => ensureWindow())

  app.whenReady().then(() => {
    createWindow()

    // Create a stable Tray icon; avoid createEmpty() on Windows
    tray = new Tray(TRAY_IMG)
    try { tray.setToolTip('Virtual Display Wizard') } catch {}

    const menu = Menu.buildFromTemplate([
      { label: 'Open', click: () => ensureWindow() },
      { label: 'Quit', click: () => app.quit() },
    ])

    try { tray.setContextMenu(menu) } catch {}
  })

  app.on('activate', () => ensureWindow())

  // Keep running in tray on Windows
  app.on('window-all-closed', () => {})

  // Final safety net to avoid the modal error box
  process.on('uncaughtException', () => { /* swallow & keep running */ })
}