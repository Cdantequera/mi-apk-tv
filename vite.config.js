import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { streamProxyPlugin } from './vite-plugin-stream-proxy.js';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), streamProxyPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
});
