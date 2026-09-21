import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';

// Banco isolato: il picker viene dal sorgente attuale, senza copie della sua logica.
export async function avviaBancoBC50({ prima = false } = {}) {
  const radice = fileURLToPath(new URL('../', import.meta.url));
  // Versione iniziale verificata pulita; mai git checkout né scritture sui sorgenti.
  const riferimento = 'e52c062ecde54c0c71cba849bfc413edf155369f';
  const originali = new Map();
  if (prima) for (const file of ['src/components/fonti-modelli.js', 'src/styles/mockup-td.css']) {
    originali.set(`/${file}`, execFileSync('git', ['show', `${riferimento}:harness-ui/frontend/${file}`], { cwd: radice, windowsHide: true }));
  }
  const sorgente = await readFile(resolve(radice, 'src/legacy/app.js'), 'utf8');
  const albero = ts.createSourceFile('app.js', sorgente, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let picker;
  function visita(nodo) {
    if (ts.isFunctionDeclaration(nodo) && nodo.name?.text === 'creaModelPicker') picker = nodo.getText(albero);
    ts.forEachChild(nodo, visita);
  }
  visita(albero);
  if (!picker) throw new Error('Il picker reale non è stato trovato: aggiornare il banco.');
  const modulo = `import { PROVIDER_DIRETTI, eFonteDiretta, fontiDelSelettore, modelliDellaFonte, fraseVuotoDiretto, senzaChiave, aggiornaTestoModelloSelettore } from '/src/components/fonti-modelli.js';
import { apiGet, textElement, icon, state } from '/lab/fixtures/bc50.js';
export ${picker}`;
  const tipi = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  const server = createServer(async (req, res) => {
    try {
      const percorso = new URL(req.url, 'http://localhost').pathname;
      if (percorso === '/lab/picker-reale.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(modulo); return;
      }
      // Identico confine di copyVendoredAssets della build, senza copiare sul disco.
      const relativo = decodeURIComponent(percorso).replace(/^\/src\/styles\/fonts\//u, '/src/assets/fonts/');
      const file = resolve(radice, `.${relativo}`);
      if (!file.startsWith(radice.endsWith(sep) ? radice : `${radice}${sep}`)) { res.writeHead(403); res.end(); return; }
      const contenuto = originali.get(percorso) ?? await readFile(file);
      res.writeHead(200, { 'Content-Type': `${tipi[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(contenuto);
    } catch { res.writeHead(404); res.end('Risorsa del banco non trovata'); }
  });
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  return { url: `http://127.0.0.1:${server.address().port}`, chiudi: () => new Promise((ok, no) => server.close(e => e ? no(e) : ok())) };
}
