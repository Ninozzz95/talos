/*
 * In QUALE condizione i fogli dei temi dipingono il fondo di verde? L'owner l'ha visto; le mie due
 * misure (tema chiaro e tema scuro, tema `calm`) no. Qui si provano TUTTI e quattordici i temi, in
 * tutt'e due le modalità, e si cerca la dominante verde. ⛔ Nessuna scrittura sul server.
 */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const temi = readFileSync(resolve('harness-ui/frontend/src/styles/temi.css'), 'utf8');
const aspetto = readFileSync(resolve('harness-ui/frontend/src/styles/aspetto.css'), 'utf8');
/* I quattordici nomi, letti dal foglio stesso invece che scritti a mano. */
const NOMI = [...new Set([...temi.matchAll(/data-talos-theme="([a-z]+)"/g)].map((m) => m[1]))];
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:4174/');
  await p.waitForTimeout(3500);
  await p.addStyleTag({ content: temi + '\n' + aspetto });
  console.log(`temi trovati nel foglio: ${NOMI.length} → ${NOMI.join(', ')}\n`);
  const verdi = [];
  for (const tema of NOMI) {
    for (const modalita of ['scuro', 'chiaro']) {
      const r = await p.evaluate(([t, m]) => {
        const root = document.documentElement;
        root.setAttribute('data-talos-theme', t);
        root.setAttribute('data-talos-scene', t);
        if (m === 'chiaro') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
        const c2 = getComputedStyle(root).backgroundColor;
        const m2 = /(\d+), (\d+), (\d+)/.exec(c2);
        if (!m2) return { colore: c2, verde: false };
        const [, rr, gg, bb] = m2.map(Number);
        /* «Verde» = la componente G supera le altre due in modo visibile, non per un punto. */
        return { colore: c2, verde: gg > rr + 6 && gg > bb + 6 };
      }, [tema, modalita]);
      if (r.verde) { verdi.push(`${tema}/${modalita} → ${r.colore}`); }
    }
  }
  console.log(verdi.length ? `⛔ TEMI CHE DIPINGONO DI VERDE (${verdi.length}):\n  ${verdi.join('\n  ')}`
    : '✔ nessuno dei temi, in nessuna modalità, produce un fondo verde');
  await p.screenshot({ path: resolve('scratchpad/prove/modalita-shell/caccia-al-verde.png') });
} finally { await b.close(); }
