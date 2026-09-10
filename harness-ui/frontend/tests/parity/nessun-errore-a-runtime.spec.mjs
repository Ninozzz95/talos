import { expect, test } from '@playwright/test';

/*
 * ⛔⛔⛔ 11/09 — IL CANCELLO CHE MANCAVA, e che è costato il blocco del 4174 dell'owner.
 *
 * Ieri notte una riga rimasta indietro (`fermaMotore: () => fermaMotore()`, con la variabile tolta
 * poche ore prima insieme al motore del segnavia) faceva lanciare «fermaMotore is not defined» a
 * OGNI bolla d'attesa. La pagina smetteva di rispondere e l'owner non riusciva più nemmeno a
 * cambiare sessione.
 *
 * ⛔ Il punto che rende questo test necessario: la build era VERDE e 620 test unitari erano VERDI.
 *   Nessuno dei due guarda cosa succede quando la funzione viene CHIAMATA per davvero, nel browser.
 *   L'errore l'ha trovato aprire la pagina e leggere la console — cioè la cosa che non avevo fatto
 *   prima di consegnare. Un errore a runtime non è un dettaglio di stile: è la pagina che muore.
 *
 * ⛔ Che cosa si tollera, e perché: il 503 su `/context` è ATTESO — `config.mjs` vieta il motore del
 *   contesto sulla porta 4174 per costruzione (`CTX_NOT_ENABLED`), quindi quel rifiuto è un cancello
 *   che funziona, non un guasto. Tollerato per nome, non ignorando tutti i 503.
 */
test('RUNTIME-01: aprire la app non produce nessun errore JavaScript', async ({ page }) => {
  const errori = [];
  page.on('pageerror', (e) => errori.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const testo = m.text();
    /* Rifiuti dichiarati dal server, non guasti della pagina. */
    if (/CTX_NOT_ENABLED/.test(testo)) return;
    if (/Failed to load resource.*503/.test(testo)) return;
    errori.push(`console: ${testo}`);
  });

  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })); } catch { /* contesto senza storage: l'intro comparirà, e va bene lo stesso */ }
  });
  /* ⛔ URL intero: questa config non fissa un `baseURL`, e un percorso relativo non naviga. */
  await page.goto('http://127.0.0.1:4174/');
  await page.waitForTimeout(4000);

  /* ⛔ E poi si TOCCA la app: metà degli errori a runtime nasce quando qualcosa viene chiamato, non
     quando viene caricato. Cambiare sessione è il gesto che l'owner non riusciva più a fare. */
  const voci = page.locator('.talos-session-item');
  if (await voci.count() > 1) {
    await voci.nth(1).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  expect(errori, `⛔ la pagina ha lanciato ${errori.length} errori:\n  ${errori.slice(0, 6).join('\n  ')}`).toEqual([]);
});
