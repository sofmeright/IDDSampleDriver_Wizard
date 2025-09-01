import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  server: { port: 5173 },
  build: { outDir: 'dist' },
  plugins: [react()]
})
