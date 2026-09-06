import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * DAL MOCKUP AL TEMPLATE — il passo di build che rende vera la regola
 * «il mockup è la app, byte per byte».
 *
 * Legge `.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html` (la fonte di verità,
 * che cambia solo per mano dell'owner o con il suo sì) e produce:
 *   · `index.template.html` — il markup del mockup senza le parti che sono del
 *     mockup e non del prodotto (la barra di regia, l'inventario dei componenti,
 *     lo script della regia, il blocco di token DTCG), con lo sprite delle
 *     icone, i vendor che la app originale caricava (xterm, Prism) e il modulo
 *     `app.js`;
 *   · `src/styles/index.css` — i font locali più lo `<style>` del mockup.
 *
 * ⛔ Prima era uno script Python nello scratchpad di una sessione: rigenerava
 * anche `app.js` e `main.js` e ha cancellato due volte il lavoro di Fase 1.
 * Ora vive nel repo, fa una cosa sola, e non tocca mai il JavaScript.
 */
const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCKUP = path.resolve(radice, '../../.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html');
const FONT_LOCALI = [
  ['Instrument Sans', 400, 'instrument-sans-latin-400-normal'],
  ['Instrument Sans', 500, 'instrument-sans-latin-500-normal'],
  ['Instrument Sans', 600, 'instrument-sans-latin-600-normal'],
  ['JetBrains Mono', 400, 'jetbrains-mono-latin-400-normal'],
  ['JetBrains Mono', 500, 'jetbrains-mono-latin-500-normal'],
].map(([famiglia, peso, file]) => `@font-face {\n  font-family: '${famiglia}';\n  src: url('./fonts/${file}.woff2') format('woff2');\n  font-style: normal;\n  font-weight: ${peso};\n  font-display: swap;\n}`).join('\n');

function taglia(html, inizio, fine) {
  const i = html.indexOf(inizio);
  if (i < 0) throw new Error(`non trovo «${inizio}» nel mockup`);
  const j = html.indexOf(fine, i + inizio.length);
  if (j < 0) throw new Error(`non trovo «${fine}» dopo «${inizio}»`);
  return html.slice(0, i) + html.slice(j);
}

export async function generaTemplate() {
  const mockup = await readFile(MOCKUP, 'utf8');
  const stile = /<style[^>]*>([\s\S]*?)<\/style>/u.exec(mockup)?.[1];
  if (!stile) throw new Error('il mockup non ha il suo <style>');
  const sprite = /<svg[^>]*class="talos-sprite"[^>]*>[\s\S]*?<\/svg>/u.exec(mockup)?.[0];
  if (!sprite) throw new Error('il mockup non ha lo sprite delle icone');

  let corpo = mockup
    .replace(/<link[^>]*fonts\.g(?:oogleapis|static)\.com[^>]*>\s*/gu, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>\s*/u, '')
    .replace(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>\s*/u, '')
    .replace(/<script>\s*\(function\(\)\{[\s\S]*?\}\)\(\);\s*<\/script>\s*/u, '')
    // 06/9 cutover: OGNI script in linea del mockup (es. la regia demo della Capability, B4.2) resta fuori — la CSP `script-src 'self'` lo bloccherebbe comunque, e a schermo dava un errore di console a ogni avvio
    .replace(/<script>(?![^<]*src=)[\s\S]*?<\/script>\s*/gu, '')
    .replace(/<title>[\s\S]*?<\/title>/u, '');
  // La barra di regia e' del mockup: dal suo <div> fino al guscio.
  corpo = taglia(corpo, '<div class="talos-regia"', '<div class="talos-shell"');
  // L'inventario dei componenti e' del mockup: la sua <section> intera.
  const inventario = corpo.indexOf('id="schermoComponenti"');
  if (inventario >= 0) {
    const inizio = corpo.lastIndexOf('<section', inventario);
    const fine = corpo.indexOf('<section', inizio + 10);
    corpo = corpo.slice(0, inizio) + corpo.slice(fine);
  }
  if (!corpo.includes('talos-sprite')) corpo = `${sprite}\n${corpo.trim()}`;

  const documento = [
    '<!doctype html>',
    '<html lang="it" data-talos-entrypoint="app">',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '    <meta name="color-scheme" content="dark light">',
    '    <link rel="icon" href="data:,">',
    '    <title>TALOS Codice</title>',
    '    <link rel="stylesheet" href="./vendor/xterm/xterm.css">',
    '    <link rel="stylesheet" href="./styles.css">',
    '  </head>',
    '  <body>',
    corpo.trim(),
    '    <!-- vendor: il terminale vero (xterm) e il colore del codice (Prism), come nella app originale -->',
    '    <script src="./vendor/xterm/xterm.js"></script>',
    '    <script src="./vendor/xterm/addon-fit.js"></script>',
    '    <script src="./vendor/xterm/addon-webgl.js"></script>',
    '    <script src="./vendor/prism/prism.js"></script>',
    '    <script type="module" src="./app.js"></script>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');

  const css = `/* Font locali: la app e' local-first, niente Google Fonts. */\n${FONT_LOCALI}\n\n/* ===== Il foglio del mockup approvato, byte per byte (fase 0). ===== */\n${stile}`;
  await writeFile(path.join(radice, 'index.template.html'), documento, 'utf8');
  await writeFile(path.join(radice, 'src/styles/index.css'), css, 'utf8');
  const blocchi = documento.match(/data-c="[^"]+"/gu) || [];
  return {
    blocchi: new Set(blocchi.map((b) => b.slice(8, -1))).size,
    istanze: blocchi.length,
    schermate: (documento.match(/id="schermo\w+"/gu) || []).length,
    script: (documento.match(/<script/gu) || []).length,
    regia: documento.includes('MockupRegia'),
    sprite: documento.includes('talos-sprite'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generaTemplate().then((esito) => console.log(`Template dal mockup: ${esito.schermate} schermate, ${esito.blocchi} blocchi (${esito.istanze} istanze), ${esito.script} script, regia=${esito.regia}, sprite=${esito.sprite}`))
    .catch((errore) => { console.error(errore.message); process.exitCode = 1; });
}
