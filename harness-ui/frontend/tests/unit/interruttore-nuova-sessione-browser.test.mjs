/*
 * 11/10/2026 — L'INTERRUTTORE «Mostra ragionamento» NELLA FINESTRA DELLA NUOVA SESSIONE DEBORDAVA (visto dall'owner e in foto).
 * Misurato sul 4177: l'interruttore era 38×38 (un quadrato) e il pallino da 24 px scorreva di 27: 13 px oltre il suo bordo, fuori
 * dalla riga. Causa: `.workspace-chooser-inline-toggle input{width:38px;height:38px}` (`foglio-monolite.css`), nata per una casella
 * di spunta, batteva `.talos-switch` per specificità. Stessa malattia già curata nei fogli (`index.css`, `.sheet-toggle-row`).
 * La prova usa il CSS VERO impacchettato (non il foglio letto a mano: `primitives.css` non arriva al bundle) in una pagina vuota.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const sorgenti = { name: 'sorgenti-interruttore', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'sw' };
  });
  b.onLoad({ filter: /.*/, namespace: 'sw' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader: extname(args.path) === '.css' ? 'css' : 'js' }));
} };

let browser;
test.after(() => browser?.close());

test('INTERRUTTORE-NUOVA-SESSIONE: nella riga della nuova sessione il pallino resta DENTRO l interruttore, acceso e spento; una casella di spunta tiene i suoi 38 px', async (t) => {
  const stile = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], entryPoints: [resolve(frontend, 'src/styles/main.css')], tsconfigRaw: {}, bundle: true, write: false, external: ['./fonts/*'], logLevel: 'silent' });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  t.after(() => page.close());
  await page.route('**/*', (route) => route.abort());
  await page.setContent(`<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><form class="workspace-chooser" style="width:440px;padding:20px">
    <label class="workspace-chooser-inline-toggle" id="riga"><span><strong>Mostra ragionamento</strong><small>Da spento vedi solo quanto ha ragionato.</small></span><input type="checkbox" role="switch" class="talos-switch" id="interruttore" checked></label>
    <label class="workspace-chooser-inline-toggle"><span><strong>Una casella</strong></span><input type="checkbox" id="casella"></label>
  </form></body></html>`);
  await page.addStyleTag({ content: stile.outputFiles[0].text });
  const misura = () => page.evaluate(() => {
    const i = document.getElementById('interruttore'); const riga = document.getElementById('riga');
    const b = i.getBoundingClientRect(); const r = riga.getBoundingClientRect();
    // il pallino è lo pseudo-elemento: larghezza e scorrimento veri, letti dallo stile calcolato
    const dopo = getComputedStyle(i, '::after');
    const larghezzaPallino = parseFloat(dopo.width) || 0;
    const matrice = dopo.transform && dopo.transform !== 'none' ? new DOMMatrixReadOnly(dopo.transform) : new DOMMatrixReadOnly();
    const st = getComputedStyle(i);
    const inizio = b.left + (parseFloat(st.borderLeftWidth) || 0) + (parseFloat(st.paddingLeft) || 0) + (parseFloat(dopo.marginLeft) || 0);
    return { w: Math.round(b.width), h: Math.round(b.height), fineInterruttore: b.right, finePallino: inizio + matrice.m41 + larghezzaPallino, fineRiga: r.right, pallino: larghezzaPallino };
  });
  for (const acceso of [true, false]) {
    await page.evaluate((v) => { document.getElementById('interruttore').checked = v; }, acceso);
    const m = await misura();
    assert.ok(m.w > m.h, `${acceso ? 'acceso' : 'spento'}: l interruttore è una pillola, non un quadrato (${m.w}×${m.h})`);
    assert.ok(m.pallino > 0, 'il pallino esiste (premessa della misura)');
    assert.ok(m.finePallino <= m.fineInterruttore + 0.5, `${acceso ? 'acceso' : 'spento'}: il pallino finisce a ${m.finePallino.toFixed(1)}, l interruttore a ${m.fineInterruttore.toFixed(1)}`);
    assert.ok(m.fineInterruttore <= m.fineRiga, 'l interruttore sta nella riga');
  }
  // AL CONTRARIO: la regola di prima vale ancora per ciò per cui era nata
  assert.deepEqual(await page.evaluate(() => { const b = document.getElementById('casella').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }), [38, 38]);
});
