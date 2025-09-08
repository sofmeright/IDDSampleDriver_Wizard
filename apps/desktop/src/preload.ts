// apps/desktop/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

type Row = { id:string; w:number; h:number; hz:number };
type Config = { gpuName:string; monitorCount:number; active:Row[]; retired:Row[] };
type InitResult = { isAdmin:boolean; gpus:string[]; config:Config; backups:string[]; driverState:'not-detected'|'stopped'|'running'; log:string[] };

const api = {
  init: (): Promise<InitResult> => ipcRenderer.invoke('vdisplay:init'),
  onLog: (fn: (line:string)=>void) => ipcRenderer.on('vdisplay:log', (_e, line)=> fn(line)),
  saveConfig: (cfg:Config) => ipcRenderer.invoke('vdisplay:saveConfig', cfg),

  listGpus: () => ipcRenderer.invoke('vdisplay:listGpus'),

  listBackups: () => ipcRenderer.invoke('vdisplay:backups:list'),
  saveBackup: (name:string, cfg:Config) => ipcRenderer.invoke('vdisplay:backups:save', name, cfg),
  loadBackup: (name:string) => ipcRenderer.invoke('vdisplay:backups:load', name),
  deleteBackup: (name:string) => ipcRenderer.invoke('vdisplay:backups:delete', name),

  driverInstall: () => ipcRenderer.invoke('vdisplay:driver:install'),
  driverUninstall: () => ipcRenderer.invoke('vdisplay:driver:uninstall'),
  driverReload: () => ipcRenderer.invoke('vdisplay:driver:reload'),
  ensureDriverPkg: () => ipcRenderer.invoke('vdisplay:driver:ensurePkg'),

  isAdmin: () => ipcRenderer.invoke('vdisplay:admin:check'),
  relaunchAsAdmin: () => ipcRenderer.invoke('vdisplay:admin:relaunch'),
};

contextBridge.exposeInMainWorld('vdisplay', api);

export type RendererApi = typeof api;
