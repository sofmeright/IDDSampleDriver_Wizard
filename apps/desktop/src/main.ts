import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'

let win: BrowserWindow | null = null
let tray: Tray | null = null

const isDev = process.env.ELECTRON_DEV === '1'

function createWindow(){
  win = new BrowserWindow({
    width: 1120, height: 800, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  })
  const url = isDev ? 'http://localhost:5173' : 'file://' + path.join(process.resourcesPath, 'ui', 'index.html')
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
      { label: 'Quit', click: ()=> app.quit() },
    ]))
  })
  app.on('window-all-closed', ()=> { /* keep tray app running */ })
}
