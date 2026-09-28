import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * R4 — ATTIVITÀ COMPATTA · le PROVE del prototipo (non del prodotto). Ogni prova dice cosa la farebbe
 * diventare rossa: se il prototipo non la passa, la proposta non si può scrivere così nel prodotto.
 */
const QUI = fileURLToPath(new URL('.', import.meta.url));
const FOTO = resolve(QUI, '..', '..', '..', 'docs', 'foto-attivita');
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const esiti = {};

async function apri(page, { scena = 'lungo', tema = 'dark', stato = 'S0' } = {}) {
  await page.goto(`/?componente=AttivitaCompatta&scena=${scena}&tema=${tema}&stato=${stato}&foto=1`);
  await page.waitForFunction(() => document.documentElement.dataset.visualReady === 'true', null, { timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('V1 — tastiera: Invio apre, frecce fra le voci, destra/sinistra sul dettaglio, Esc torna alla testa', async ({ page }) => {
  await apri(page);
  const testa = page.locator('.talos-segmento__riassunto').first();
  await testa.focus();
  await page.keyboard.press('Enter');
  await expect(testa).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  const righe = page.locator('.talos-segmento__voci > .talos-voce > .talos-voce__riga');
  await expect(righe.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(righe.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(righe.last()).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(righe.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.talos-voce').nth(0).locator('.talos-voce__dettaglio')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(righe.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowLeft');
  await expect(testa).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(testa).toBeFocused();
  /* Il Tab resta quello di sempre: ogni riga è un bottone nel giro. */
  await page.keyboard.press('Tab'); // il «⋯»
  await expect(page.locator('.talos-segmento__altro').first()).toBeFocused();
  await page.keyboard.press('Tab'); // i filtri vengono prima delle voci, nell'ordine del DOM
  await expect(page.locator('.talos-filtro[data-filtro="tutte"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.talos-filtro').nth(1)).toBeFocused();
  esiti.V1 = 'verde';
});

test('V2 — un segmento CHIUSO si apre da solo quando la navigazione cerca un testo dentro (hidden=until-found)', async ({ page }) => {
  await apri(page);
  const testa = page.locator('.talos-segmento__riassunto').first();
  await expect(testa).toHaveAttribute('aria-expanded', 'false');
  /* La ricerca nella pagina (Ctrl+F) non si comanda da Playwright; la navigazione a un frammento percorre la
     STESSA strada del browser («ancestor revealing algorithm»: `beforematch`, poi via `hidden`). */
  const info = await page.evaluate(() => {
    const pre = [...document.querySelectorAll('.talos-voce__dettaglio pre')].find((p) => p.textContent.includes("return 'cercato'"));
    pre.id = 'trovami';
    const riga = pre.closest('.talos-voce').querySelector('.talos-voce__riga');
    return { chiusaPrima: riga.getAttribute('aria-expanded') };
  });
  expect(info.chiusaPrima).toBe('false');
  await page.evaluate(() => { location.hash = 'trovami'; });
  await expect(testa).toHaveAttribute('aria-expanded', 'true');
  const riga = page.locator('.talos-voce:has(#trovami) > .talos-voce__riga');
  await expect(riga).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#trovami')).toBeVisible();
  esiti.V2 = 'verde';
});

test('V3 — errore leggibile a segmento chiuso: voce fissata e conteggio in rosso, senza aprire', async ({ page }) => {
  await apri(page, { scena: 'errore' });
  const seg = page.locator('.talos-segmento').first();
  await expect(seg.locator('.talos-segmento__riassunto')).toHaveAttribute('aria-expanded', 'false');
  await expect(seg.locator('.talos-segmento__errore')).toHaveText(/1 comando non riuscito/);
  const fissata = seg.locator('.talos-segmento__fissate .talos-voce__riga');
  await expect(fissata).toBeVisible();
  await expect(fissata).toContainText('Esegue i test unitari del frontend');
  await expect(fissata).toContainText('exit 1');
  await fissata.click();
  await expect(seg.locator('.talos-segmento__riassunto')).toHaveAttribute('aria-expanded', 'true');
  await expect(seg.locator('.talos-voce[data-stato="fallito"] > .talos-voce__riga')).toHaveAttribute('aria-expanded', 'true');
  await expect(seg.locator('.talos-voce[data-stato="fallito"] > .talos-voce__riga')).toBeFocused();
  esiti.V3 = 'verde';
});

test('V4 — conteggi veritieri: elenco ≠ ricerca, modifica ≠ «altra azione»', async ({ page }) => {
  await apri(page, { scena: 'lungo' });
  /* La forma intera sta nella descrizione accessibile anche quando a schermo, stretta, c'è quella breve. */
  const testo = await page.locator('.talos-segmento__testa .sr-only').first().textContent();
  const aSchermo = await page.locator('.talos-segmento__conteggi').first().textContent();
  expect(aSchermo).not.toMatch(/…$/);
  expect(testo).toMatch(/(^|, )1 ricerca(,|$)/);
  expect(testo).toContain('1 cartella elencata');
  expect(testo).toContain('1 file modificato');
  expect(testo).not.toMatch(/altr[ae] azion/);
  expect(testo).not.toMatch(/2 ricerche/);
  esiti.V4 = { descrizione: testo, aSchermo };
});

test('V5 — filtri: «Ragionamenti» mostra solo i tre ragionamenti, e lo dice', async ({ page }) => {
  await apri(page, { scena: 'lungo', stato: 'S1' });
  const filtro = page.locator('.talos-filtro[data-filtro="ragionamento"]');
  await expect(filtro).toHaveText('Ragionamenti 3');
  await filtro.click();
  await expect(filtro).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.talos-segmento__voci > .talos-voce:not([hidden])')).toHaveCount(3);
  await expect(page.locator('.talos-segmento__nota')).toHaveText('Mostrate 3 voci su 9.');
  await page.locator('.talos-filtro[data-filtro="tutte"]').click();
  await expect(page.locator('.talos-segmento__voci > .talos-voce:not([hidden])')).toHaveCount(9);
  esiti.V5 = 'verde';
});

test('V6 — menu «⋯» e tasto destro: frecce, Esc che riporta il fuoco, «Apri tutti i ragionamenti»', async ({ page }) => {
  await apri(page, { scena: 'lungo' });
  const altro = page.locator('.talos-segmento__altro').first();
  await altro.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('#r4aMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[role=menuitem]').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.locator('[role=menuitem]').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(altro).toBeFocused();
  await page.locator('.talos-segmento__testa').first().click({ button: 'right' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Apri tutti i ragionamenti' }).click();
  await expect(page.locator('.talos-voce[data-tipo="ragionamento"] > .talos-voce__riga[aria-expanded="true"]')).toHaveCount(3);
  await expect(page.locator('.talos-voce[data-tipo="attrezzo"] > .talos-voce__riga[aria-expanded="true"]')).toHaveCount(0);
  esiti.V6 = 'verde';
});

test('V7 — dal vivo la riga del segmento NON cambia altezza, e l’«adesso» non lampeggia', async ({ page }) => {
  await apri(page, { scena: 'vivo' });
  const campioni = [];
  const testoAdesso = [];
  const seg = page.locator('.talos-segmento').first();
  const leggi = async () => {
    const m = await seg.evaluate((s) => ({
      testa: s.querySelector('.talos-segmento__testa:not([hidden])')?.getBoundingClientRect().height ?? null,
      adesso: s.querySelector('.talos-segmento__adesso')?.textContent ?? '',
      stato: s.dataset.stato,
    }));
    campioni.push(m.testa); testoAdesso.push([Date.now(), m.adesso, m.stato]);
  };
  await leggi();
  /* La banda è nascosta in foto: il seguito si lancia dalla sua porta di prova, senza aspettarlo. */
  await page.evaluate(() => { void window.__r4aSeguito?.(); });
  for (let i = 0; i < 16; i += 1) { await page.waitForTimeout(400); await leggi(); }
  const altezze = [...new Set(campioni.filter((x) => x !== null).map((x) => Math.round(x)))];
  esiti.V7 = { altezze, testoAdesso: testoAdesso.map(([, a, s]) => `${s}:${a}`) };
  expect(altezze.length, `altezze della testa viste: ${altezze.join(', ')}`).toBe(1);
  /* Il difetto trovato da questa prova: fra due chiamate la riga diceva «concluso» e poi di nuovo «vivo». */
  const primoConcluso = testoAdesso.findIndex(([, , s]) => s === 'concluso');
  const dopo = primoConcluso < 0 ? [] : testoAdesso.slice(primoConcluso).map(([, , s]) => s);
  expect(dopo.every((s) => s === 'concluso'), `sequenza degli stati: ${testoAdesso.map(([, , s]) => s).join(' ')}`).toBe(true);
});

test('V8 — accessibilità automatica (axe-core) nei due temi, segmento aperto con dettagli e menu', async ({ page }) => {
  const risultati = {};
  for (const tema of ['dark', 'light']) {
    await apri(page, { scena: 'errore', tema, stato: 'S2' });
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(async () => {
      const ris = await window.axe.run(document.querySelector('#schermoChat .talos-turn[data-turno="talos"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
      return ris.violations.map((v) => ({ id: v.id, impatto: v.impact, nodi: v.nodes.length, esempio: v.nodes[0]?.target?.join(' ') }));
    });
    risultati[tema] = r;
  }
  esiti.V8 = risultati;
  expect(risultati.dark.filter((v) => v.impatto === 'critical' || v.impatto === 'serious')).toEqual([]);
  expect(risultati.light.filter((v) => v.impatto === 'critical' || v.impatto === 'serious')).toEqual([]);
});

test('V9 — colonna a 320 px: niente scorrimento orizzontale, i bersagli cedono per primi', async ({ page }) => {
  await apri(page, { scena: 'lungo', stato: 'S1' });
  const m = await page.evaluate(() => {
    const s = document.querySelector('.talos-segmento');
    s.style.width = '320px';
    return new Promise((ok) => requestAnimationFrame(() => ok({
      larghezza: s.getBoundingClientRect().width,
      scroll: s.scrollWidth,
      testaScroll: s.querySelector('.talos-segmento__testa').scrollWidth,
      testaLarga: s.querySelector('.talos-segmento__testa').clientWidth,
      bersagli: getComputedStyle(s.querySelector('.talos-segmento__bersagli')).display,
    })));
  });
  esiti.V9 = m;
  expect(m.scroll).toBeLessThanOrEqual(Math.ceil(m.larghezza));
  expect(m.testaScroll).toBeLessThanOrEqual(m.testaLarga);
  expect(m.bersagli).toBe('none');
  await page.screenshot({ path: join(FOTO, 'proposta-lungo-S1-colonna320-dark.png'), clip: await page.locator('.talos-segmento').first().boundingBox() });
});

test.afterAll(() => {
  writeFileSync(join(FOTO, 'verifica-proposta.json'), `${JSON.stringify(esiti, null, 2)}\n`);
});
