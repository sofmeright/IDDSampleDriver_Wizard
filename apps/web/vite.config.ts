import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' for production (Electron file://), '/' for dev server
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? './' : '/',
  server: { port: 5173 },
  build: { outDir: 'dist' },
  plugins: [react()]
}))