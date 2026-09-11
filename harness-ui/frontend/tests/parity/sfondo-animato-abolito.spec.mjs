/*
 * ⛔⛔⛔⛔ LO SFONDO ANIMATO NON SI DISEGNA, E NESSUNO PUÒ RIACCENDERLO SENZA ACCORGERSENE.
 *
 * Owner, 11/09/2026, dopo tre tentativi falliti nello stesso giorno: «SFONDO ANIMATO ABOLITO,
 * NASCONDI DALLE IMPOSTAZIONI E SPEGNI COMPLETAMENTE GLI SFONDI ANIMATI DALLA UI, CI ANDREMO
 * SUCCESSIVAMENTE». Il verbale dei tre tentativi sta in `.claude/CODA-UNICA-DEBITI-2026-09-06.md`,
 * riga BC-09, compresa la frase che l'owner ha chiesto di mettere per iscritto.
 *
 * ⛔ QUESTO CANCELLO SOSTITUISCE `aspetto-non-rende-illeggibile.spec.mjs`, che è uscito dalla suite
 *   nello stesso giro: quello misurava una garanzia sulla scena («0 pixel di scena sotto il testo»),
 *   e una garanzia su una cosa che non si disegna più non è una garanzia — la sua metà «al
 *   contrario» è diventata rossa proprio per questo, perché pretendeva di VEDERE la scena passare
 *   sotto il testo quando il velo veniva tolto. Non è stato cancellato: torna quando torna la scena.
 *
 * ⭐ La prova si fa con le preferenze SALVATE dell'owner, non con un profilo vergine: è lì che sta
 *   la lezione più cara di questa giornata. Su un profilo nuovo l'alfa della scena vale 0,10 e non
 *   si vede quasi niente; con i suoi cursori (scena `terminal`, 100/100/100/150) vale 0,235 — cioè
 *   guardavo uno schermo diverso dal suo e credevo che andasse bene. Uno stato che nessuno ha
 *   scelto non prova niente su chi ha scelto.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.TALOS_URL_ASPETTO || process.env.TALOS_URL_CANCELLO || 'http://127.0.0.1:4177/';

/* Lo stato più forte possibile: scena scelta a mano, cursori al massimo, timbri versionati — senza
   i timbri la chiave versionata ignora questi valori e si misurerebbe il default. */
const PREFERENZE_FORTI = {
  version: 1,
  appearance: {
    themePresetVersione: 2, sceneOverrideVersione: 2, backgroundMotionVersione: 2,
    themePreset: 'calm', sceneOverride: 'terminal', backgroundMotion: true,
    motionIntensity: 100, motionContrast: 100, motionGlow: 100, motionDensity: 150,
  },
};

async function apri(browser, modo) {
  const contesto = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: modo });
  const pagina = await contesto.newPage();
  await pagina.addInitScript((p) => {
    try { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify(p)); } catch { /* profilo senza storage */ }
  }, PREFERENZE_FORTI);
  await pagina.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pagina.waitForTimeout(3200);
  /* ⛔ `evaluate` e non `click()`: il bottone dell'intro esiste nel DOM anche quando il suo velo
     è chiuso, e Playwright si ferma con «Element is not visible» — 12 rossi che non dicevano
     niente sulla scena. Qui l'intro è solo un ostacolo da togliere, non l'oggetto della prova. */
  await pagina.evaluate(() => document.getElementById('introSalta')?.click());
  await pagina.waitForTimeout(500);
  return { contesto, pagina };
}

for (const modo of ['dark', 'light']) {
  test(`la scena non si disegna, nemmeno con le preferenze più forti — tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }) => {
    const { contesto, pagina } = await apri(browser, modo);

    const misura = await pagina.evaluate(() => {
      const leggi = (el, pseudo) => {
        if (!el) return null;
        const s = getComputedStyle(el, pseudo);
        return { display: s.display, content: s.content };
      };
      return {
        classiBody: document.body.className,
        chatPrima: leggi(document.getElementById('schermoChat'), '::before'),
        chatDopo: leggi(document.getElementById('schermoChat'), '::after'),
        bodyPrima: leggi(document.body, '::before'),
        bodyDopo: leggi(document.body, '::after'),
      };
    });

    /* ⛔ La classe deve esserci davvero: se le preferenze non arrivassero, questa prova passerebbe
       misurando una app che non ha mai provato ad accendere niente — un cancello inerte. */
    expect(misura.classiBody, 'le preferenze forti devono arrivare, o la prova non sta misurando lo stato che vogliamo escludere')
      .toContain('background-motion');

    for (const [nome, stato] of Object.entries(misura)) {
      if (nome === 'classiBody' || !stato) continue;
      expect(stato.display, `⛔ ${nome}: la scena è tornata a disegnarsi — l'owner l'ha abolita l'11/09`).toBe('none');
    }

    await contesto.close();
  });

  test(`la sezione «Sfondo e risorse» non compare nelle Impostazioni — tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }) => {
    const { contesto, pagina } = await apri(browser, modo);
    const visibile = await pagina.evaluate(() => {
      const nodo = document.querySelector('[data-settings-group="sfondo"]');
      if (!nodo) return 'assente';
      return getComputedStyle(nodo).display;
    });
    /*
     * ⛔ «assente» va bene quanto «none»: il markup può sparire in un rifacimento futuro. Ciò che
     *   non va bene è che si VEDA — un comando che non governa più niente promette una cosa e non
     *   la fa, ed è la classe di difetto che questo progetto ha già pagato («ventisei comandi su
     *   trentanove: zero pixel»).
     */
    expect(['assente', 'none'], `⛔ la sezione dello sfondo è tornata visibile (display: ${visibile})`).toContain(visibile);
    await contesto.close();
  });
}
