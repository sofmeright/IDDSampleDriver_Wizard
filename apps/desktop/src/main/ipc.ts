// apps/desktop/src/main/ipc.ts (excerpt)
import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createDeviceNode, addAndInstallDriver, restartDevice } from "./driver";
import { downloadDriverIfMissing } from "./download"; // your existing download logic

function logToRenderer(win: Electron.BrowserWindow, msg: string) {
  const line = `[${new Date().toISOString().slice(0,19).replace('T',' ')}] ${msg}`;
  win.webContents.send("vdisplay:log", line);
}

ipcMain.handle("vdisplay:driverInstall", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!;
  logToRenderer(win, "Driver install requested");
  const ok = await downloadDriverIfMissing((s)=>logToRenderer(win,s)); // writes to %AppData%/.../IddDriver
  if (!ok) return { error: "DOWNLOAD_FAILED" };

  const created = await createDeviceNode((s)=>logToRenderer(win,s));
  if (!created) return { error: "CREATE_DEVICE_FAILED" };

  const add = await addAndInstallDriver((s)=>logToRenderer(win,s));
  if (!add.ok) {
    // 740 = requires elevation; 5 = access denied; 123 = invalid name
    if (add.code === 740 || add.code === 5) return { error: "ELEVATION_REQUIRED" };
    return { error: "ADD_DRIVER_FAILED", code: add.code };
  }

  await restartDevice((s)=>logToRenderer(win,s));
  return { ok: true };
});
