import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * FOTO della cura gemella 0.2.2 giro 3: la carta del TERMINALE, righe vere scritte dalla sonda della CLI (azione VERA del nucleo del PC →
 * adattatore della CLI → approvalDialogLines, 100 colonne), disegnate in un terminale monospazio chiaro e scuro, 1920×1080. Nessuna pagina
 * del prodotto, nessuna rete. Fino al giro 5 stava solo nella cartella di lavoro dell'agente del giro 3 (mai committata); rimessa nel ramo
 * dal revisore della pagina del giro 5 (giudice v1886) con i percorsi portabili. Il testo lo scrive la sonda della CLI, che non sta in
 * questo ramo: `TERMINALE_TESTO` dice dov'è; senza, la prova si salta e lo dice.
 */
const TESTO = process.env.TERMINALE_TESTO ?? '';
const FOTO = path.resolve(process.env.TERMINALE_FOTO ?? fileURLToPath(new URL('../../artifacts/terminale-prima-022/', import.meta.url)));
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

for (const modo of ['light', 'dark']) {
  test(`TERMINALE PRIMA ${modo}`, async ({ page }) => {
    test.skip(!TESTO || !existsSync(TESTO), 'TERMINALE_TESTO non dato: le righe del terminale le scrive la sonda della CLI');
    await page.setViewportSize({ width: 1920, height: 1080 });
    const righe = (await readFile(TESTO, 'utf8')).split('\n');
    const [chiusa, aperta] = [righe.slice(0, righe.indexOf('── full review (v) ──')), righe.slice(righe.indexOf('── full review (v) ──'))];
    const colori = modo === 'dark' ? { bg: '#0c0c0c', fg: '#d4d4d4', dim: '#7f7f7f' } : { bg: '#fafafa', fg: '#1e1e1e', dim: '#6b6b6b' };
    const blocco = (r) => `<pre>${r.map((l) => (/^\s*(What it sends:|… |Values cut|──)/u.test(l) ? `<span class="d">${esc(l)}</span>` : esc(l))).join('\n')}</pre>`;
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:${colori.bg};color:${colori.fg};font:15px/1.35 Consolas,"Cascadia Mono",monospace;display:flex;gap:28px;padding:20px}pre{margin:0;white-space:pre}.d{color:${colori.dim}}</style>${blocco(chiusa)}${blocco(aperta.slice(0, 48))}`);
    await expect(page.locator('pre')).toHaveCount(2);
    await mkdir(FOTO, { recursive: true });
    await writeFile(path.join(FOTO, `terminale-prima-${modo}.png`), await page.screenshot());
    const testo = await page.locator('body').innerText();
    expect(testo).toContain('Other details');
    expect(testo).not.toContain('sk-proj-');
  });
}
