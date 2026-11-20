import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'api-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        server: path.resolve(import.meta.dirname, 'server/start.ts'),
        'analysis-worker': path.resolve(import.meta.dirname, 'server/analysis-worker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
