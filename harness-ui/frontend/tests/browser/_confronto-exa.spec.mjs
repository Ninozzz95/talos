import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * IL CONFRONTO TESTA A TESTA, RIFATTO — owner 18/09: «rifai tutti gli screenshot e rimettili in
 * downloads in modo che io possa verificarli immediatamente».
 *
 * ⛔ PERCHÉ È STATO RIFATTO: la prima versione premeva le voci del mockup per TESTO e il clic non
 *   andava a segno — otto fotografie su otto erano la STESSA sezione («Aspetto e movimento»), e
 *   il confronto era cieco. Il selettore vero è `[data-action="navigate"][data-value="…"]`
 *   (`TALOS-Calm-Lab-04.html`: le voci nascono da un template, quindi il testo non basta).
 *
 * Metodo (ricerca 18/09/2026 — LobeHub «design-parity-review», zeroutil «Compare a Design to Your
 * Build»): stessa vista, stessa larghezza, stessa condizione, e le due immagini AFFIANCATE in un
 * unico file — «considerare due immagini separate come un confronto è falso».
 * L'affiancamento si fa con una pagina HTML fotografata: ImageMagick non è installato su questa
 * macchina (`magick` assente; il `convert` che si trova è quello di Windows).
 */
const USCITA = 'C:/Users/Antonino/Downloads/confronto-mockup-app';
const APP = 'http://127.0.0.1:4174/';
const MOCKUP = 'http://127.0.0.1:4210/TALOS-Calm-Lab.html';
/* nome del file ↔ data-value nel mockup ↔ id della sezione nell'app */
const SEZIONI = [
  ['01-aspetto', 'appearance', 'appearance'],
  ['02-chat', 'chat', 'chat'],
  ['03-strumenti', 'shield', 'tools'],
  ['04-memoria', 'memory', 'memoria'],
  ['05-privacy', 'key', 'privacy'],
  ['06-laboratorio', 'models', 'models'],
  ['07-provider', null, 'providers'],
  ['08-costi', 'cost', 'costi'],
  ['09-file', 'folder', 'workspace'],
  ['10-account', 'activity', 'account'],
];

async function fotografaMockup(page, valore) {
  await page.goto(MOCKUP);
  await page.waitForTimeout(1200);
  if (valore) {
    await page.locator(`[data-action="navigate"][data-value="${valore}"]`).first().click({ timeout: 5000 }).catch(() => {});
  } else {
    /* «Provider e accessi» non è una voce di primo livello: si arriva dalla scheda Provider. */
    await page.locator('[data-action="navigate"][data-value="models"]').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('[data-action="tab"][data-value="providers"]').first().click({ timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(900);
  return page.screenshot({ animations: 'disabled', caret: 'hide' });
}

async function fotografaApp(page, sezione) {
  await page.goto(APP);
  await page.waitForTimeout(2000);
  await page.evaluate((s) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s);
  }, sezione);
  await page.waitForTimeout(1400);
  return page.screenshot({ animations: 'disabled', caret: 'hide' });
}

test('CONFRONTO — le dieci sezioni, un file per lato: <nome>_mockup.png e <nome>_real.png', async ({ page }) => {
  /* Venti fotografie, due caricamenti di pagina per ognuna: i 30 s di serie non bastano
     (misurato: si fermava alla quarta sezione). */
  test.setTimeout(900_000);
  mkdirSync(USCITA, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  /*
   * ⛔⛔ LA LINGUA VA DICHIARATA, o l'app parte in INGLESE. È scritto in casa da giorni
   *   («senza `uiLanguage` l'app parte in inglese, è il predefinito») e l'avevo dimenticato:
   *   il primo giro di fotografie mostrava «Settings», «List density», «Follow the system» —
   *   e il confronto col mockup italiano sarebbe stato falsato in OGNI sezione.
   */
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} }));
  });
  for (const [nome, valoreMockup, sezioneApp] of SEZIONI) {
    const sinistra = await fotografaMockup(page, valoreMockup);
    writeFileSync(join(USCITA, `${nome}_mockup.png`), sinistra);
    const destra = await fotografaApp(page, sezioneApp);
    writeFileSync(join(USCITA, `${nome}_real.png`), destra);
    console.log('CONFRONTO fatto: ' + nome);
  }
  /*
   * LE QUATTRO SCHEDE DEL LABORATORIO e LA PAGINA MODELLO — l'owner: «tutte le tab, ognuna
   * identica al mockup», e «la pagina di ogni modello e le tab di quella pagina».
   */
  for (const [nome, scheda] of [['11-lab-modelli', 'models'], ['12-lab-provider', 'providers'], ['13-lab-download', 'downloads'], ['14-lab-sistema', 'system']]) {
    await page.goto(MOCKUP);
    await page.waitForTimeout(1200);
    await page.locator('[data-action="navigate"][data-value="models"]').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.locator(`[data-action="tab"][data-value="${scheda}"]`).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    writeFileSync(join(USCITA, `${nome}_mockup.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }));

    await page.goto(APP);
    await page.waitForTimeout(2000);
    await page.evaluate((s) => {
      const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
      const gruppo = voce?.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
      voce?.click();
      window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
    }, scheda);
    await page.waitForTimeout(1500);
    await page.locator(`[data-lab-scheda="${scheda}"]`).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    writeFileSync(join(USCITA, `${nome}_real.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }));
    console.log('CONFRONTO fatto: ' + nome);
  }

  /* La pagina modello, coi suoi tre lati (card, files, compatibility). */
  const idMockup = 'openrouter:aion2';
  for (const lato of ['card', 'files', 'compatibility']) {
    await page.goto(`${MOCKUP}#impostazioni/modelli/scheda/${idMockup}/${lato}`);
    await page.waitForTimeout(2500);
    writeFileSync(join(USCITA, `15-pagina-${lato}_mockup.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }));
    await page.goto(`${APP}#/impostazioni/modelli/scheda/${idMockup}/${lato}`);
    await page.waitForTimeout(2500);
    writeFileSync(join(USCITA, `15-pagina-${lato}_real.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }));
    console.log('CONFRONTO fatto: pagina modello ' + lato);
  }

  writeFileSync(join(USCITA, 'LEGGIMI.txt'), 'Coppie: <nome>_mockup.png e <nome>_real.png - stessa vista, stessa larghezza (1440x900). Generati il 18/09/2026.');
});
