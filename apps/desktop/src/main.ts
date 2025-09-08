import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from 'electron'
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
    const htmlPath = path.join(__dirname, 'ui', 'index.html') // now inside app.asar
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