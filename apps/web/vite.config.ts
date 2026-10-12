import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolveApiProxyTarget } from './vite.proxy';

export default defineConfig(() => {
  let fileEnv: Record<string, string | undefined> = {};
  try {
    fileEnv = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const env = { ...fileEnv, ...process.env };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: { '/api': { target: resolveApiProxyTarget(env), changeOrigin: false } },
    },
    build: { sourcemap: false, target: 'es2020' },
  };
});
