// apps/desktop/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

type Row = { id:string; w:number; h:number; hz:number };
type Config = { gpuName:string; monitorCount:number; active:Row[]; retired:Row[] };
type InitResult = {
  isAdmin:boolean; gpus:string[];
  config:Config; backups:string[];
  driverState:'not-detected'|'stopped'|'running';
  log:string[];
};

const api = {
  // init + log
  init: (): Promise<InitResult> => ipcRenderer.invoke('vdisplay:init'),
  onLog: (fn: (line:string)=>void) => ipcRenderer.on('vdisplay:log', (_e, line)=> fn(line)),

  // config
  saveConfig: (cfg:Config) => ipcRenderer.invoke('vdisplay:saveConfig', cfg),

  // helpers
  listGpus: () => ipcRenderer.invoke('vdisplay:listGpus'),

  // backups (IPC version, optional for your UI)
  listBackups: () => ipcRenderer.invoke('vdisplay:backups:list'),
  saveBackup: (name:string, cfg:Config) => ipcRenderer.invoke('vdisplay:backups:save', name, cfg),
  loadBackup: (name:string) => ipcRenderer.invoke('vdisplay:backups:load', name),
  deleteBackup: (name:string) => ipcRenderer.invoke('vdisplay:backups:delete', name),

  // driver
  driverInstall: () => ipcRenderer.invoke('vdisplay:driver:install'),
  driverUninstall: () => ipcRenderer.invoke('vdisplay:driver:uninstall'),
  driverReload: () => ipcRenderer.invoke('vdisplay:driver:reload'),
  ensureDriverPkg: () => ipcRenderer.invoke('vdisplay:driver:ensurePkg'),
  driverState: () => ipcRenderer.invoke('vdisplay:driver:state'),
  // Elevation is handled per-operation by the Go backend (native UAC); the GUI
  // no longer checks admin status or relaunches itself elevated.
};

contextBridge.exposeInMainWorld('vdisplay', api);
export type RendererApi = typeof api;
