// apps/desktop/src/preload.ts
import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('vdisplay', { version: '0.1.0' })