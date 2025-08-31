// apps/desktop/vite.config.ts
import { defineConfig } from 'vite'
export default defineConfig({ build: { outDir: 'dist', lib: { entry: 'src/main.ts', formats: ['cjs'], fileName: ()=>'main' } } })