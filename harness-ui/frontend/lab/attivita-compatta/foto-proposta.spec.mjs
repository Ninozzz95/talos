import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { ORDINE_SCENE_ATTIVITA } from '../fixtures/attivita-compatta.js';

/*
 * R4 — ATTIVITÀ COMPATTA · FOTO «DOPO»: il prototipo, con gli STESSI eventi delle foto del prodotto
 * (`foto-attuale.spec.mjs`), negli stessi stati: S0 come arriva, S1 dopo un clic sulla testa, S2 con
 * tutte le voci leggibili e i ragionamenti aperti (nel prodotto S2 = ogni gruppo interno aperto).
 * Le misure vanno in `misure-proposta-*.json`, accanto a quelle del prodotto.
 */
const QUI = fileURLToPath(new URL('.', import.meta.url));
const FOTO = resolve(QUI, '..', '..', '..', 'docs', 'foto-attivita');
mkdirSync(FOTO, { recursive: true });

const VIEWPORTS = [[1920, 1080], [1440, 900], [1024, 800], [2560, 1440]];

async function misura(page) {
  return page.evaluate(() => {
    const r = (el) => el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
    const segmenti = [...document.querySelectorAll('#schermoChat .talos-segmento')];
    return {
      segmenti: segmenti.map((s) => ({
        altezza: r(s),
        nudo: s.classList.contains('talos-segmento--nudo'),
        testa: s.querySelector('.talos-segmento__riassunto')?.textContent.replace(/\s+/g, ' ').trim() || '',
        voci: s.querySelectorAll('.talos-segmento__voci > .talos-voce').length,
        testaAltezza: r(s.querySelector('.talos-segmento__testa:not([hidden])')),
        rigaAltezza: r(s.querySelector('.talos-voce__riga')),
      })),
      turnoTalos: r([...document.querySelectorAll('#schermoChat .talos-turn[data-turno="talos"]')].at(-1)),
      prosa: Math.round([...([...document.querySelectorAll('#schermoChat .talos-turn[data-turno="talos"]')].at(-1)?.querySelectorAll('.talos-message__copy') || [])].reduce((s, c) => s + c.getBoundingClientRect().height, 0)),
      segmentiTotale: Math.round(segmenti.reduce((s, c) => s + c.getBoundingClientRect().height, 0)),
    };
  });
}

for (const tema of ['dark', 'light']) {
  for (const [w, h] of VIEWPORTS) {
    /* 1024×800 e 2560×1440 solo per la scena lunga: sono le larghezze dove la riga si stringe e si allarga. */
    const scene = (w === 1024 || w === 2560) ? ['lungo', 'errore'] : ORDINE_SCENE_ATTIVITA;
    test(`proposta ${tema} ${w}x${h}`, async ({ page }) => {
      const errori = [];
      page.on('pageerror', (e) => errori.push(e.message));
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
      const misure = [];
      for (const scena of scene) {
        for (const stato of ['S0', 'S1', 'S2']) {
          await page.goto(`/?componente=AttivitaCompatta&scena=${scena}&tema=${tema}&stato=${stato}&foto=1`);
          await page.waitForFunction(() => document.documentElement.dataset.visualReady === 'true', null, { timeout: 20_000 });
          await page.evaluate(() => {
            const u = document.querySelector('#schermoChat .talos-turn[data-turno="utente"]');
            u?.scrollIntoView({ block: 'start' });
            u?.closest('.talos-conversation, #conversation')?.scrollBy(0, -24);
          });
          await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
          const nome = `proposta-${scena}-${stato}-${w}x${h}-${tema}`;
          await page.screenshot({ path: join(FOTO, `${nome}.png`), animations: 'disabled' });
          const m = await misura(page);
          const ragionamenti = await page.locator('#schermoChat .talos-voce[data-tipo="ragionamento"]').count();
          const nudo = m.segmenti.every((s) => s.nudo);
          const clic = stato === 'S0' || nudo ? 0 : stato === 'S1' ? 1 : 1 + ragionamenti;
          misure.push({ foto: `${nome}.png`, scena, stato, tema, viewport: `${w}x${h}`, clic, clicViaMenu: stato === 'S2' ? 2 : null, ...m });
        }
      }
      writeFileSync(join(FOTO, `misure-proposta-${w}x${h}-${tema}.json`), `${JSON.stringify(misure, null, 2)}\n`);
      expect(errori, 'nessun errore JavaScript nella pagina').toEqual([]);
    });
  }
}

/* La variante «riga quieta», una foto per tema: è una domanda all'owner, non la proposta di serie. */
for (const tema of ['dark', 'light']) {
  test(`proposta variante quieta ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.goto(`/?componente=AttivitaCompatta&scena=breve&tema=${tema}&stato=S0&foto=1&variante=quieta`);
    await page.waitForFunction(() => document.documentElement.dataset.visualReady === 'true');
    await page.evaluate(() => document.querySelector('#schermoChat .talos-turn[data-turno="utente"]')?.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(FOTO, `proposta-breve-S0-quieta-1920x1080-${tema}.png`), animations: 'disabled' });
  });
}
