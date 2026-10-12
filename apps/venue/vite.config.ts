import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist/web', emptyOutDir: true, target: 'es2020' },
  server: { port: 5174, proxy: { '/api': 'http://localhost:8080', '/print': 'http://localhost:8080' } },
});
