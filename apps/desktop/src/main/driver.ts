// apps/desktop/src/main/driver.ts
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { nefconPath } from "./paths";

// tiny helper that logs stdout/stderr
function runExe(file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      const code = (error as any)?.code ?? 0;
      resolve({ code, stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function userDataDir(sub = "") {
  const base = app.getPath("userData"); // %AppData%\<YourApp>
  const p = path.join(base, sub);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function driverDir() {
  return userDataDir("IddDriver");
}

// Path to INF we downloaded/extracted earlier
function infPath() {
  return path.join(driverDir(), "IddSampleDriver.inf");
}

export async function createDeviceNode(log: (s: string) => void) {
  const exe = nefconPath();
  log(`nefcon: ${exe}`);
  const args = [
    "--create-device-node",
    "--hardware-id", "ROOT\\iddsampledriver",
    "--class-name", "Display",
    "--class-guid", "4D36E968-E325-11CE-BFC1-08002BE10318"
  ];
  const r = await runExe(exe, args);
  log(`nefcon create-device-node -> code=${r.code}`);
  if (r.stdout.trim()) log(r.stdout.trim());
  if (r.stderr.trim()) log(r.stderr.trim());
  return r.code === 0;
}

export async function addAndInstallDriver(log: (s: string) => void) {
  const inf = infPath();
  if (!fs.existsSync(inf)) {
    log(`INF not found at ${inf}`);
    return { ok: false, code: -1 };
  }
  // IMPORTANT: no manual quotes; let execFile handle it.
  const r = await runExe("pnputil", ["/add-driver", inf, "/install"]);
  log(`pnputil /add-driver -> code=${r.code}`);
  if (r.stdout.trim()) log(r.stdout.trim());
  if (r.stderr.trim()) log(r.stderr.trim());
  return { ok: r.code === 0, code: r.code };
}

export async function restartDevice(log: (s: string) => void) {
  const r = await runExe("pnputil", ["/restart-device", "/deviceid", "ROOT\\iddsampledriver"]);
  log(`pnputil /restart-device -> code=${r.code}`);
  if (r.stdout.trim()) log(r.stdout.trim());
  if (r.stderr.trim()) log(r.stderr.trim());
  return r.code === 0;
}

export async function removeDeviceAndDriver(log: (s: string) => void, infName?: string) {
  // Try removing the device first
  let r = await runExe("pnputil", ["/remove-device", "/deviceid", "ROOT\\iddsampledriver"]);
  log(`pnputil /remove-device -> code=${r.code}`);
  if (r.stdout.trim()) log(r.stdout.trim());
  if (r.stderr.trim()) log(r.stderr.trim());

  // If we know the INF (oem*.inf), uninstall+force. Otherwise skip.
  if (infName) {
    r = await runExe("pnputil", ["/delete-driver", infName, "/uninstall", "/force"]);
    log(`pnputil /delete-driver -> code=${r.code}`);
    if (r.stdout.trim()) log(r.stdout.trim());
    if (r.stderr.trim()) log(r.stderr.trim());
  }
}
