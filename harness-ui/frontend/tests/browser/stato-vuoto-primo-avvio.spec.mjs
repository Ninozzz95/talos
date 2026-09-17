import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ PO-27 — LO STATO VUOTO ONESTO AL POSTO DELLA MODALE «PRIMO AVVIO». 17/09/2026.
 *
 * Fino a ieri chi apriva TALOS senza cartella trovava un velo modale a quattro passi davanti a
 * tutto. Ricerca 17/09/2026 (UserOnboard «Empty States»; 72Technologies «Empty States as
 * Onboarding»; Fluent 2 «Onboarding»): lo schermo vuoto è l'unica superficie che tutti i nuovi
 * vedono, e il suo lavoro è portare alla prima azione utile senza interrompere.
 *
 * ⛔ SECONDO GIRO, dalla revisione, e sono due difetti veri che questo file adesso sorveglia:
 *  · D1 — l'invito leggeva `cartellaAssoluta`, vuota finché non arriva `RunStarted`: lampeggiava a
 *    ogni cambio di sessione e restava acceso SOPRA la conversazione di una sessione conclusa
 *    riaperta. È uno stato di PRIMO AVVIO, non «manca un dato»;
 *  · D5 — era un banner accanto allo stato vuoto invece che dentro, e offriva una seconda porta
 *    per il modello mentre la pillola del composer, due centimetri più sotto, dice già «Scegli il
 *    modello». Una porta per cosa.
 */

const CARTELLA = 'C:\\progetti\\AVM';

async function apriApp(page, { tema = 'dark', larghezza = 1440, altezza = 900, modello = '' } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode, model }) => {
    if (window.top !== window) return;
    try {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model } }));
    } catch { /* finestra privata o quota: la app parte lo stesso col tema predefinito */ }
  }, { colorMode: tema === 'light' ? 'light' : 'dark', model: modello });
  await page.route('**/api/v1/sessions/po27-*/events*', (rotta) => rotta.fulfill({ contentType: 'text/event-stream', body: '' }));
  /*
   * ⛔⛔ LA PREMESSA SI COSTRUISCE, NON SI SPERA. Trovato facendo girare la cartella INTERA invece
   *   del solo file: da soli questi passavano, in mezzo agli altri fallivano tutti. Non era un
   *   difetto del prodotto — era il prodotto che fa la cosa giusta: dal 02/09 l'avvio riapre
   *   l'ULTIMA sessione disponibile, e lo store dei test è uno solo per esecuzione, quindi le
   *   sessioni create dagli spec precedenti c'erano ancora.
   * ⇒ Qui serve un profilo senza sessioni, e lo si dichiara: l'elenco torna vuoto. Solo la GET
   *   dell'elenco, con o senza query — un glob nudo sul percorso non coprirebbe la query string
   *   (lezione 11/09), e intercettare anche le POST significherebbe spegnere il prodotto invece
   *   di metterlo nello stato che si vuole misurare.
   * ⛔ Il glob non si scrive DENTRO questo commento: due asterischi seguiti da una barra chiudono
   *   il blocco, e il resto del file diventa codice rotto. Preso dal parser, non dalla rilettura.
   */
  await page.route(/\/api\/v1\/sessions(\?[^/]*)?$/u, (rotta) => (
    rotta.request().method() === 'GET'
      ? rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: [] } }) })
      : rotta.continue()
  ));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}

const invito = (page) => page.locator('#invitoPrimoAvvio');
const azioniVisibili = (page) => page.locator('#invitoPrimoAvvio [data-invito-azione]:not([hidden])');

test('PO27-VUOTO-01 — senza cartella: nessuna modale, lo stato vuoto del progetto, UNA porta', async ({ page }) => {
  await apriApp(page);
  await expect(invito(page)).toBeVisible();
  /* ⛔ D5: è lo stato vuoto che il progetto ha già, non una scheda accanto. Marchio, nome, titolo. */
  await expect(invito(page)).toHaveClass(/talos-empty/);
  await expect(invito(page).locator('.talos-empty__mark')).toHaveCount(1);
  await expect(invito(page).locator('.talos-orbitron-brand')).toHaveText('TALOS');
  await expect(page.locator('#invitoPrimoAvvioTitolo')).toHaveText('Da dove cominciamo?');
  await expect(page.locator('#invitoPrimoAvvioRiga')).toHaveText('Per iniziare scegli una cartella: TALOS legge e scrive solo lì dentro.');
  /* ⛔ D2: la riga che cambia da sola si annuncia a chi non guarda lo schermo. */
  await expect(page.locator('#invitoPrimoAvvioRiga')).toHaveAttribute('role', 'status');
  await expect(page.locator('#invitoPrimoAvvioRiga')).toHaveAttribute('aria-live', 'polite');
  /* ⛔ D5: UNA porta. Il modello ce l'ha già, la pillola del composer — qui si NOMINA e basta. */
  await expect(azioniVisibili(page)).toHaveCount(1);
  await expect(azioniVisibili(page).nth(0)).toHaveText('Scegli una cartella');
  await expect(page.locator('#invitoPrimoAvvioNota')).toHaveText('Il modello si sceglie dalla pillola qui sotto.');
  await expect(page.locator('[data-open-sheet="model"]')).toBeVisible();
  /*
   * ⛔ L'ASSENZA SI CONTA. Non l'id del velo cancellato (quel selettore passerebbe per costruzione)
   *   ma OGNI superficie modale della app: dialoghi nativi aperti e veli modali visibili.
   */
  const modali = await page.evaluate(() => document.querySelectorAll('dialog[open]').length + document.querySelectorAll('.overlay-layer--modal:not([hidden])').length);
  expect(modali, 'al primo avvio non si deve aprire nessuna superficie modale').toBe(0);
});

test('PO27-VUOTO-02 — col modello già scelto la riga resta una, e la nota lo dice', async ({ page }) => {
  await apriApp(page, { modello: 'qwen/qwen3.8-flash' });
  await expect(invito(page)).toBeVisible();
  await expect(azioniVisibili(page)).toHaveCount(1, 'il modello non aggiunge una porta: ne ha già una');
  await expect(page.locator('#invitoPrimoAvvioNota')).toContainText('Il modello è pronto');
});

test('PO27-VUOTO-03 — AL CONTRARIO: con una sessione aperta l\'invito non c\'è', async ({ page }) => {
  await apriApp(page, { modello: 'qwen/qwen3.8-flash' });
  await expect(invito(page)).toBeVisible();
  await page.evaluate((cartella) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('po27-viva', 'workspace', 'Sessione PO-27', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Ciao' }, contesto: { cartella, modello: 'qwen/qwen3.8-flash' } }, runtime.realSessionState.generation);
  }, CARTELLA);
  await expect(invito(page)).toBeHidden();
});

test('PO27-VUOTO-04 — D1: una sessione CONCLUSA riaperta senza `RunStarted` non riaccende l\'invito', async ({ page }) => {
  /*
   * ⛔ È il caso che il revisore ha misurato e che la prima stesura non vedeva: `cartellaAssoluta`
   *   resta vuota finché non arriva un `RunStarted`, e l'invito si riaccendeva SOPRA la
   *   conversazione. Qui la sessione si apre e la chat si riempie SENZA un `RunStarted` nuovo.
   */
  await apriApp(page, { modello: 'qwen/qwen3.8-flash' });
  await expect(invito(page)).toBeVisible();
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('po27-conclusa', 'workspace', 'Conclusa', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
  });
  await expect(invito(page)).toBeHidden('una sessione aperta è la prova che il primo avvio è passato');
});

test('PO27-VUOTO-05 — «Scegli una cartella» apre il foglio Nuova sessione che già esiste', async ({ page }) => {
  await apriApp(page);
  await page.locator('#invitoPrimoAvvio [data-invito-azione="cartella"]').click();
  await expect(page.locator('#sheetDialog[open], #veloNuova:not([hidden])').first()).toBeVisible();
});
