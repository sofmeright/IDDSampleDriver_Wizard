import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let win: BrowserWindow | null = null
let tray: Tray | null = null

const isDev = process.env.ELECTRON_DEV === '1'

function createWindow() {
  win = new BrowserWindow({
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

  win.loadURL(url)
  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => { win = null })
}

function ensureWindow() {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => ensureWindow())

  app.whenReady().then(() => {
    createWindow()

    const img = nativeImage.createEmpty()
    tray = new Tray(img)
    tray.setToolTip('Virtual Display Wizard')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: () => ensureWindow() },
      { label: 'Quit', click: () => app.quit() },
    ]))
  })

  app.on('activate', () => ensureWindow())

  // keep app alive in tray; do not quit on Windows when all windows closed
  app.on('window-all-closed', () => {})
}