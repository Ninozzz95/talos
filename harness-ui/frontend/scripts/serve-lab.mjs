import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLab } from './build-lab.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist-lab');
const port = Number.parseInt(process.env.TALOS_FRONTEND_LAB_PORT || '4175', 10);
const types = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);

const { manifest } = await buildLab({ outputDir: output });
const allowlist = new Set(['/index.html', '/build-manifest.json', ...manifest.files.map((file) => `/${file.path}`)]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', `http://127.0.0.1:${port}`).pathname;
  if (pathname === '/health') { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"ok":true}'); return; }
  const target = pathname === '/' ? '/index.html' : pathname;
  if (!allowlist.has(target)) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const body = await readFile(path.join(output, ...target.slice(1).split('/')));
    response.writeHead(200, { 'content-type': types.get(path.extname(target)) || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Laboratorio TALOS su http://127.0.0.1:${port}`));
