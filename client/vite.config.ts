import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, 'index.html'),
        control: resolve(__dirname, 'control.html'),
      },
    },
  },
});
