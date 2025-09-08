// apps/desktop/src/main.ts
import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let win: BrowserWindow | null = null
const isDev = process.env.ELECTRON_DEV === '1'

function findUiHtml(): string | null {
  const appPath = app.getAppPath()
  const candidates = [
    isDev ? path.join(process.cwd(), 'apps/web/dist/index.html') : '',
    path.join(process.resourcesPath, 'ui', 'index.html'),
    path.join(path.dirname(appPath), 'ui', 'index.html'),
    path.join(appPath, 'ui', 'index.html'),
    path.join(__dirname, '..', 'ui', 'index.html'),
  ].filter(Boolean) as string[]

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch {}
  }
  dialog.showErrorBox(
    'UI not found',
    `Tried:\n${candidates.join('\n')}\n\nMake sure apps/web/dist was copied to resources/ui.`
  )
  return null
}

function createWindow() {
  const w = new BrowserWindow({
    width: 1120,
    height: 800,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  })

  if (isDev) {
    w.loadURL('http://localhost:5173')
  } else {
    const ui = findUiHtml()
    if (ui) w.loadFile(ui)
  }

  w.on('ready-to-show', () => { if (!w.isDestroyed()) w.show() })
  w.on('closed', () => { if (win === w) win = null })
  win = w
}

app.whenReady().then(createWindow)
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
