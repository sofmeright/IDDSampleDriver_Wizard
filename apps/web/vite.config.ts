import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? './' : '/',   // ← critical for packaged Electron
  server: { port: 5173 },
  build: { outDir: 'dist' },
  plugins: [react()],
}))
