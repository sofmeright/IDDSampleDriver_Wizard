// apps/desktop/src/main.ts
import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let win: BrowserWindow | null = null
const isDev = process.env.ELECTRON_DEV === '1'

function createWindow() {
  const w = new BrowserWindow({
    width: 1120,
    height: 800,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') }
  })

  if (isDev) {
    w.loadURL('http://localhost:5173')
  } else {
    const htmlPath = path.join(process.resourcesPath, 'ui', 'index.html') // <-- extraResources location
    if (!fs.existsSync(htmlPath)) {
      dialog.showErrorBox('UI not found', `Expected ${htmlPath}`)
    } else {
      w.loadFile(htmlPath)
    }
  }

  w.on('ready-to-show', () => { if (!w.isDestroyed()) w.show() })
  w.on('closed', () => { if (win === w) win = null })
  win = w
}

// Add this so the window is actually created
app.whenReady().then(createWindow)
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
// Optional: quit on Windows when all windows closed
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })