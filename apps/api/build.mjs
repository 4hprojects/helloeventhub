// Bundles the API (and its workspace-local @heh/contracts source) into dist/.
// Third-party dependencies stay external and are installed in the runtime image.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@heh/'));

await build({
  entryPoints: ['src/server.ts', 'src/worker.ts', 'src/scripts/seed.ts', 'src/scripts/create-admin.ts', 'src/scripts/ensure-indexes.ts', 'src/scripts/retention.ts'],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external,
  define: { 'process.env.APP_VERSION': JSON.stringify(process.env.APP_VERSION ?? pkg.version) },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
