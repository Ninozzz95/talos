import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * FE-073 (R10, ledger approvato dal Desktop 05/11 17:09): su Windows senza cornice di cattura il guscio non disegna il segno e lo dice alla bolla con
 * `executeJavaScript` → `window.postMessage({tipo:'segno-assente', motivo:'windows-vecchio'}, location.origin)` sulla finestra della bolla. Qui la stessa chiamata
 * nella pagina vera della bolla; gli eventi arrivano sul canale da un'altra pagina della stessa origine, come dalla pagina principale.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/bolla-segno-assente/', import.meta.url)));
const ASSENTE = { tipo: 'segno-assente', motivo: 'windows-vecchio' };
const AVVISO = { 'it-IT': 'Su questa versione di Windows il mio cursore non si vede: segui la pillola', 'en-US': "On this version of Windows my cursor can't be shown: follow the pill" };

async function apri(browser, viewport, locale) {
  const ctx = await browser.newContext({ viewport, locale });
  const errori = [];
  const bolla = await ctx.newPage();
  bolla.on('pageerror', (e) => errori.push(e.message));
  await bolla.goto('bolla.html');
  await expect(bolla.locator('textarea')).toBeVisible();
  const voce = await ctx.newPage();
  await voce.goto('segno.html');
  const sulCanale = (m) => voce.evaluate((x) => { const c = new BroadcastChannel('talos-bolla'); c.postMessage(x); c.close(); }, m);
  const evento = (name, value) => sulCanale({ tipo: 'evento', evento: { name, value } });
  const dalGuscio = () => bolla.evaluate((m) => window.postMessage(m, location.origin), ASSENTE);
  return { ctx, bolla, errori, sulCanale, evento, dalGuscio };
}

for (const [nome, viewport, locale] of [['desktop', { width: 1440, height: 900 }, 'it-IT'], ['telefono', { width: 390, height: 844 }, 'it-IT'], ['desktop-inglese', { width: 1440, height: 900 }, 'en-US']]) {
  test(`BOL-R10 ${nome}: l avviso del guscio nella pillola del primo compito, la pausa vince, il primo esito lo toglie, il secondo compito no`, async ({ browser }) => {
    const { ctx, bolla, errori, sulCanale, evento, dalGuscio } = await apri(browser, viewport, locale);
    const avviso = AVVISO[locale];
    const corpo = bolla.locator('body');

    await sulCanale(ASSENTE);
    await evento('talos.computer-use-passo', { fase: 'annuncio', n: 1, bersaglio: 'Prova dal canale' });
    await expect(corpo).toContainText('Prova dal canale');
    await expect(corpo).not.toContainText(avviso);
    await evento('talos.computer-use-esito', { esito: 'completato', motivo: 'completato', decisioni: [], spese: [] });
    await expect(bolla.locator('textarea')).toBeVisible();

    await dalGuscio();
    await dalGuscio();
    await bolla.waitForTimeout(100);
    await expect(bolla.locator('textarea')).toBeVisible();
    await expect(corpo).not.toContainText(avviso);

    await evento('talos.computer-use-passo', { fase: 'annuncio', n: 1, bersaglio: 'Cerco il treno' });
    await expect(corpo).toContainText(avviso);
    await expect(corpo).not.toContainText('Cerco il treno');
    /* Trovato dalle foto (05/11): su una riga sola la frase finiva in «…» proprio prima di «segui la pillola». Si legge per intero, e la pillola non cresce. */
    const fase = bolla.locator('.fase');
    expect(await fase.evaluate((n) => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1), 'l avviso si legge per intero').toBe(false);
    const altezzaConAvviso = (await fase.locator('xpath=..').boundingBox()).height;
    await bolla.screenshot({ path: path.join(FOTO, `avviso-${nome}.png`) });

    await evento('talos.computer-use-pausa', { motivo: 'persona', fase: 'inizio' });
    await expect(corpo).not.toContainText(avviso);
    await bolla.screenshot({ path: path.join(FOTO, `pausa-${nome}.png`) });
    await evento('talos.computer-use-pausa', { motivo: 'persona', fase: 'fine' });
    await expect(corpo).toContainText(avviso);

    await evento('talos.computer-use-passo', { fase: 'esito', n: 1, esito: 'confermata', motivo: null });
    await expect(corpo).not.toContainText(avviso);
    await evento('talos.computer-use-esito', { esito: 'completato', motivo: 'completato', decisioni: [], spese: [] });
    await expect(bolla.locator('textarea')).toBeVisible();

    await dalGuscio();
    await evento('talos.computer-use-passo', { fase: 'annuncio', n: 1, bersaglio: 'Secondo compito' });
    await expect(corpo).toContainText('Secondo compito');
    await expect(corpo).not.toContainText(avviso);
    expect(Math.abs((await fase.locator('xpath=..').boundingBox()).height - altezzaConAvviso), 'la pillola ha la stessa altezza con e senza avviso').toBeLessThanOrEqual(1);
    await bolla.screenshot({ path: path.join(FOTO, `secondo-compito-${nome}.png`) });

    expect(errori).toEqual([]);
    await ctx.close();
  });
}

/*
 * FE-074 (R11, Desktop 05/11 18:34): il guscio dice «segno assente» una volta per avvio e non lo ripete. La bolla che si ricarica nella stessa finestra lo ricorda
 * nell'archivio della sessione: arrivato e non ancora detto, lo dice al primo compito dopo il ricarico; già detto, non torna.
 */
for (const [nome, viewport, locale, colorScheme] of [['desktop', { width: 1440, height: 900 }, 'it-IT', 'light'], ['desktop-scuro', { width: 1440, height: 900 }, 'it-IT', 'dark'], ['telefono-inglese', { width: 390, height: 844 }, 'en-US', 'light']]) {
  test(`BOL-R11 ${nome}: l avviso sopravvive a un ricarico prima del compito, e dopo averlo detto non torna`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, locale, colorScheme });
    const errori = [];
    const bolla = await ctx.newPage();
    bolla.on('pageerror', (e) => errori.push(e.message));
    await bolla.goto('bolla.html');
    await expect(bolla.locator('textarea')).toBeVisible();
    const voce = await ctx.newPage();
    await voce.goto('segno.html');
    const evento = (name, value) => voce.evaluate((x) => { const c = new BroadcastChannel('talos-bolla'); c.postMessage(x); c.close(); }, { tipo: 'evento', evento: { name, value } });
    const dalGuscio = () => bolla.evaluate((m) => window.postMessage(m, location.origin), ASSENTE);
    const avviso = AVVISO[locale];
    const corpo = bolla.locator('body');

    await dalGuscio();
    await expect.poll(() => bolla.evaluate(() => sessionStorage.getItem('talos.bolla.segnoAssente'))).toBe('atteso');
    await bolla.reload();
    await expect(bolla.locator('textarea')).toBeVisible();
    await evento('talos.computer-use-passo', { fase: 'annuncio', n: 1, bersaglio: 'Cerco il treno' });
    await expect(corpo).toContainText(avviso);
    await bolla.screenshot({ path: path.join(FOTO, `ricarico-avviso-${nome}.png`) });

    await bolla.reload();
    await expect(bolla.locator('textarea')).toBeVisible();
    await evento('talos.computer-use-passo', { fase: 'annuncio', n: 2, bersaglio: 'Apro la pagina' });
    await expect(corpo).toContainText('Apro la pagina');
    await expect(corpo).not.toContainText(avviso);
    await dalGuscio();
    await evento('talos.computer-use-esito', { esito: 'completato', motivo: 'completato', decisioni: [], spese: [] });
    await evento('talos.computer-use-passo', { fase: 'annuncio', n: 1, bersaglio: 'Secondo compito' });
    await expect(corpo).toContainText('Secondo compito');
    await expect(corpo).not.toContainText(avviso);
    await bolla.screenshot({ path: path.join(FOTO, `ricarico-gia-letto-${nome}.png`) });

    expect(errori).toEqual([]);
    await ctx.close();
  });
}
