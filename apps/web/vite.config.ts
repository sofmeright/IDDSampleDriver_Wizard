// apps/web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? './' : '/',
  server: { port: 5173 },
  build: { outDir: 'dist' },
  plugins: [react()]
}))