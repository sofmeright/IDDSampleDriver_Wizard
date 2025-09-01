import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main', // we'll force the final name below
    },
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
      output: {
        entryFileNames: 'main.cjs', // <— ensure the file is exactly dist/main.cjs
      },
    },
  },
})