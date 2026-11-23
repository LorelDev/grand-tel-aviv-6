// שרת פיתוח: אורז את src/ עם esbuild ומגיש את public/.
import * as esbuild from 'esbuild';
import { workerSourcePlugin } from './scripts/esbuild-worker-plugin.mjs';

const ctx = await esbuild.context({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  outfile: 'public/app.js',
  sourcemap: true,
  logLevel: 'info',
  plugins: [workerSourcePlugin({ minify: false })],
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: 'public', port: 5196, host: '127.0.0.1' });
console.log(`\n  Grand Tel Aviv 6 → http://localhost:${port}\n`);
