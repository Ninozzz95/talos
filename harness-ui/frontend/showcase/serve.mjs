import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const files = new Set([
  'showcase/index.html', 'showcase/styles.css', 'showcase/showcase.js',
  'src/styles/tokens.css',
  ...['connessione.js', 'dialoghi.js', 'motion-mockup.js'].flatMap(name =>
    [`src/components/${name}`, `showcase/baseline/${name}`]),
]);
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };

/** Servitore del solo banco componenti: nessuna API o directory del workspace. */
export function createShowcaseServer() {
  return createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }); res.end(); return;
    }
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, ''); }
    catch { res.writeHead(400, headers); res.end('Richiesta non valida'); return; }
    if (name === '' || name === 'showcase') {
      res.writeHead(302, { ...headers, Location: '/showcase/' }); res.end(); return;
    }
    if (name === 'showcase/') name = 'showcase/index.html';
    if (!files.has(name)) { res.writeHead(404, headers); res.end(); return; }
    try {
      const data = await readFile(new URL(name, root));
      res.writeHead(200, { ...headers, 'Content-Type': types[name.split('.').at(-1)], 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(500, headers); res.end('File del banco non disponibile. Verifica il pacchetto.');
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find(value => value.startsWith('--port='));
  const port = arg ? Number(arg.slice(7)) : 5189;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Porta non valida');
  const server = createShowcaseServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Banco UI: http://127.0.0.1:${server.address().port}/showcase/`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
}
