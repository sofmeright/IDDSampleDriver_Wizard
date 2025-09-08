// apps/desktop/src/main/paths.ts
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

export function resolveResourcePath(...p: string[]) {
  // In prod, resourcesPath points to "<app>\resources"
  const prod = path.join(process.resourcesPath, ...p);
  if (app.isPackaged && fs.existsSync(prod)) return prod;

  // Dev fallback: __dirname is dist/main; go up to project root of desktop
  const dev = path.join(__dirname, "..", "..", "bin", ...p.slice(1)); // if p starts with "bin"
  if (fs.existsSync(dev)) return dev;

  // Another dev fallback: works if you run from apps/desktop
  const dev2 = path.join(process.cwd(), ...p);
  return dev2;
}

export function nefconPath() {
  return resolveResourcePath("bin", "nefconw.exe");
}