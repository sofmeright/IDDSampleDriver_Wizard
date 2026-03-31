// apps/desktop/vite.config.ts
import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'src/main.ts',
        preload: 'src/preload.ts',
      },
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
      output: {
        dir: 'dist',
        format: 'cjs',
        entryFileNames: (chunk) => `${chunk.name}.cjs`, // main.cjs, preload.cjs
      },
    },
  },
})