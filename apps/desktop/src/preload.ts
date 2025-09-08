// apps/desktop/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('vdisplay', {
  version: '0.1.0',

  isAdmin: () => ipcRenderer.invoke('admin:is-elevated'),
  relaunchAsAdmin: () => ipcRenderer.invoke('admin:relaunch'),

  listGpus: () => ipcRenderer.invoke('gpus:list'),

  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (payload: any) => ipcRenderer.invoke('config:save', payload),

  listBackups: () => ipcRenderer.invoke('backups:list'),
  saveBackup: (name: string, payload: any) => ipcRenderer.invoke('backups:save', name, payload),
  loadBackup: (name: string) => ipcRenderer.invoke('backups:load', name),
  deleteBackup: (name: string) => ipcRenderer.invoke('backups:delete', name),

  driverInstall: () => ipcRenderer.invoke('driver:install'),
  driverUninstall: () => ipcRenderer.invoke('driver:uninstall'),
  driverReload: () => ipcRenderer.invoke('driver:reload'),

  onLog: (cb: (line:string)=>void) => {
    const ch = (_:any, line:string)=> cb(line)
    ipcRenderer.on('log:append', ch)
    return () => ipcRenderer.removeListener('log:append', ch)
  },
})
