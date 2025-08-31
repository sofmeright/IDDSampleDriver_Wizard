// apps/desktop/src/main.ts
import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut } from 'electron'
import path from 'node:path'

let tray: Tray | null = null
let win: BrowserWindow | null = null

const isDev = process.env.NODE_ENV !== 'production'

function createWindow(){
  win = new BrowserWindow({ width: 1120, height: 800, show: false, webPreferences: { preload: path.join(__dirname, 'preload.js') } })
  const url = isDev ? 'http://localhost:5173' : new URL(path.join(process.resourcesPath, 'ui', 'index.html'), 'file:').toString()
  win.loadURL(url)
  win.on('ready-to-show', ()=> win?.show())
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', ()=> { if (win) { win.show(); win.focus() } })
  app.whenReady().then(()=>{
    createWindow()
    const img = nativeImage.createEmpty()
    tray = new Tray(img)
    tray.setToolTip('Virtual Display Wizard')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: ()=> win?.show() },
      { label: 'Quit', click: ()=> app.quit() }
    ]))
    globalShortcut.register('CommandOrControl+Shift+V', ()=> win?.show())
  })
}

app.on('window-all-closed', ()=> { /* keep tray app running */ })