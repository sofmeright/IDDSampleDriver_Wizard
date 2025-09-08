// apps/desktop/src/preload.d.ts
import type { RendererApi } from './preload';
declare global {
  interface Window { vdisplay: RendererApi }
}
export {};