/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  // Relative Pfade: nötig für GitHub Pages (Unterpfad) und Electron (file/127.0.0.1).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three-mesh-bvh'],
          vendor: ['idb'],
        },
      },
    },
  },
  publicDir: 'public',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
