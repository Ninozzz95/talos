import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ ASPETTO-RESET — «RESETTA» NON DEVE DUPLICARE LA COLONNA DELL'ANTEPRIMA.
 *
 * Owner, giro dei bug del 20/09/2026: «in impostazioni di aspetto se premo resetta in alto a destra
 * duplica la aside di destra di anteprima all infinito».
 *
 * ⛔ LA CATENA, letta sul sorgente e non supposta:
 *   1. il tasto «Ripristina tutto l'aspetto» (`[data-reset-appearance]`, `settings-view.ts:370-372`)
 *      chiama `options.resetAppearance()`;
 *   2. che è `resettaAspettoDesktop` (`legacy/app.js:15275`), il quale **rimonta** la vista con
 *      `montaImpostazioni(...)` a `:15283`;
 *   3. `montaImpostazioni` (`components/impostazioni.js:93`) chiama `views.get(screen)?.dispose()`
 *      a `:95` — quindi il vecchio giro VUOLE essere chiuso;
 *   4. ma quel `dispose()` (`features/settings/settings-view.ts:960`) ferma due osservatori e
 *      abortisce il controller, e **non ferma l'anteprima**: `anteprimaTema?.ferma()` non c'è;
 *   5. il telaio `.settings-layout` viene **riusato**, non ricreato (`settings-view.ts:245-253`,
 *      ed è voluto: due telai incastrati sarebbero la forma del doppio `#schermoHome`);
 *   6. la nuova chiusura nasce con `anteprimaTema = null` (`:267`), la sua guardia `if (!anteprimaTema)`
 *      è vera, e `montaAnteprimaTema(aside)` (`:270`) **appende** una seconda colonna nello STESSO
 *      `aside` — `components/anteprima-tema.js:348`, `contenitore.append(colonna)`, senza guardare
 *      cosa c'è già dentro.
 *   ⇒ **+1 copia per pressione**, e le copie vecchie restano VIVE: canvas, `requestAnimationFrame`,
 *     due osservatori e l'ascoltatore del movimento ridotto (è quel che `ferma()` disfa,
 *     `anteprima-tema.js:462-471`).
 *
 * ⛔ Si misura il **DOM vero nella app vera**, non il modulo in isolamento: la duplicazione nasce
 *   dall'incontro fra il rimontaggio della vista e il telaio riusato, e un banco che monta il
 *   modulo da solo non può vederla.
 */

test.use({ locale: 'it-IT' });

/** Apre l'app, entra in Impostazioni e si ferma sulla sezione «Aspetto». */
async function apriAspetto(page, { tema }) {
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-appearance').click();
}

/*
 * ⛔ QUESTO BLOCCO È UNA STRINGA: dentro non si usano apici inversi, o chiudono la stringa. È la
 *   trappola già scritta in bc78 e in questo progetto la si è ripetuta quattro volte in un giorno,
 *   l'ultima dentro il commento che diceva di non farlo.
 *
 * ⛔ Si contano le colonne DENTRO gli slot dell'anteprima (`[data-settings-preview-mount]`,
 *   `settings-view.ts:248-249`): è lì che il montaggio appende, ed è l'unico posto in cui una
 *   duplicazione ha senso.
 * ⛔⛔ SI SOMMANO TUTTI GLI SLOT, NON SI GUARDA IL PRIMO — e la review avversaria ha bocciato la
 *   versione precedente proprio qui, con ragione: querySelector restituisce lo slot che compare
 *   PRIMO NEL DOCUMENTO, e con il guasto vero i telai si annidano — il primo è il piu' ESTERNO,
 *   quello originale, che tiene UNA colonna. Misurato dal revisore sulla pre-cura integrale:
 *   nelloSlot leggeva 1 mentre colonne leggeva 6. Cioe' il contatore che questo commento chiama
 *   «l'unico posto in cui una duplicazione ha senso» non vedeva la malattia che deve scoprire.
 *   È la seconda volta che questa prova viene bocciata per un contatore troppo stretto: la prima
 *   era il numero di colonne, adesso il posto in cui contarle.
 * ⛔⛔ E SI CONTA ANCHE LA STRUTTURA — perche' la duplicazione della colonna NON e' l'unico sintomo:
 *   togliendo la correzione del content il telaio torna ad annidarsi, la griglia si sfalda e il
 *   tasto finisce coperto, ma le colonne restano UNA (la cura del proprietario unico ferma la
 *   precedente) e la prova restava VERDE. Un sintomo misurato non e' il difetto misurato.
 */
const CONTA = `(() => {
  const radice = document.querySelector('#schermoImpostazioni') || document;
  const slots = [...radice.querySelectorAll('[data-settings-preview-mount]')];
  const telai = [...radice.querySelectorAll('.settings-layout')];
  return {
    colonne: document.querySelectorAll('.appearance-preview').length,
    nelloSlot: slots.reduce((n, s) => n + s.querySelectorAll(':scope > .appearance-preview').length, 0),
    slotColonne: slots.map((s) => s.querySelectorAll(':scope > .appearance-preview').length),
    tele: document.querySelectorAll('.appearance-preview canvas').length,
    slotTrovato: slots.length > 0,
    telai: telai.length,
    annidati: telai.filter((t) => t.parentElement?.closest('.settings-layout')).length,
    slot: slots.length,
    /* E IL PANNELLO DEVE DIRE IL VERO: subito dopo un ripristino, nessuna riga deve offrire di
       ripristinare — se una lo offre, il pannello sta mentendo sul valore che mostra. Misurato dal
       revisore: una cura SBAGLIATA che non rimonta affatto la vista passa la prova allargata e
       lascia gli indicatori ACCESI su righe gia' al default. Solo quelli DISEGNATI: getClientRects
       esclude le righe nascoste, che non mentono a nessuno. */
    ripristiniAccesi: [...radice.querySelectorAll('button.settings-reset')].filter((b) => b.getClientRects().length > 0).length,
  };
})()`;

for (const tema of ['dark', 'light']) {
  test(`ASPETTO-RESET-01 (${tema}) — cinque «Resetta» lasciano UNA sola colonna di anteprima`, async ({ page }) => {
    await apriAspetto(page, { tema });
    /* ⛔ LA PREMESSA: la colonna deve esserci PRIMA, o non si sta misurando una duplicazione. */
    const prima = await page.evaluate(CONTA);
    console.log(`MISURA-ASPETTO-RESET ${tema} prima = ${JSON.stringify(prima)}`);
    expect(prima.slotTrovato, 'la scena non si è formata: nessuno slot dell’anteprima').toBe(true);
    expect(prima.nelloSlot, 'la scena non si è formata: nella sezione Aspetto la colonna dell’anteprima non è montata').toBe(1);

    /*
     * ⛔ LE PRESSIONI SONO SINTETICHE — `element.click()` — E IL PERCHÉ È MISURATO, non prudenza:
     *   con la duplicazione in corso le colonne si impilano, la griglia si sfalda e il tasto
     *   finisce COPERTO. Misurato a 1280×720: dopo la prima pressione il tasto è a (729,158), dopo
     *   la seconda scende a (729,569) e `elementFromPoint` al suo centro non restituisce più il
     *   tasto ma `.preview-note`, cioè la colonna. Da lì un clic VERO non arriva: è il secondo
     *   effetto dello stesso difetto, e si asserisce in fondo a questa prova.
     *   ⇒ Sintetiche qui per poter contare fino a cinque; **l'ultima è vera**, ed è quella che
     *     pretende che il tasto resti raggiungibile.
     */
    const progressione = [];
    const telaiProgressione = [];
    for (let i = 1; i <= 5; i++) {
      await page.evaluate(() => document.querySelector('[data-reset-appearance]')?.click());
      await page.waitForTimeout(200);
      const s = await page.evaluate(CONTA);
      progressione.push(s.colonne);
      telaiProgressione.push(`${s.telai}/${s.annidati}`);
    }
    console.log(`MISURA-ASPETTO-RESET ${tema} progressione colonne (1..5) = ${JSON.stringify(progressione)}`);
    console.log(`MISURA-ASPETTO-RESET ${tema} progressione telai/annidati (1..5) = ${JSON.stringify(telaiProgressione)}`);

    const dopo = await page.evaluate(CONTA);
    console.log(`MISURA-ASPETTO-RESET ${tema} dopo 5 = ${JSON.stringify(dopo)}`);
    /* ⛔ Il verdetto. Cinque pressioni, e la colonna dev'essere ancora UNA: è il numero che dice se
       una pressione aggiunge una copia. `> 1` è la duplicazione; `0` sarebbe l'opposto — la colonna
       sparita — e sarebbe un difetto uguale e contrario. */
    expect(dopo.nelloSlot, `dopo 5 «Resetta» le colonne dell'anteprima negli slot sono ${dopo.nelloSlot}, non 1 (per slot: ${JSON.stringify(dopo.slotColonne)}) — progressione: ${JSON.stringify(progressione)}`).toBe(1);
    expect(dopo.colonne, `nel documento ci sono ${dopo.colonne} colonne dell'anteprima, non 1`).toBe(1);
    /* Le tele seguono le colonne: una tela viva di una colonna rimossa è il giro che continua a
       girare senza che niente si veda — è il costo che la duplicazione lascia dietro di sé. */
    expect(dopo.tele, `ci sono ${dopo.tele} tele dell'anteprima: i giri vecchi non sono stati spenti`).toBe(1);

    /*
     * ⛔⛔ E LA STRUTTURA NON SI DEVE ESSERE MOSSA. Questa è la metà che la prima versione di questa
     *   prova NON guardava, e senza di lei una cura su quattro risultava inutile: il sintomo
     *   «colonne» restava a 1 mentre i telai si annidavano uno dentro l'altro, la griglia si
     *   sfaldava e il tasto finiva coperto.
     */
    expect(dopo.annidati, `i telai delle Impostazioni si sono annidati: ${dopo.annidati} dentro un altro telaio (erano ${prima.annidati}) — progressione telai: ${JSON.stringify(telaiProgressione)}`).toBe(0);
    expect(dopo.telai, `i telai delle Impostazioni sono passati da ${prima.telai} a ${dopo.telai}`).toBe(prima.telai);
    expect(dopo.slot, `gli slot dell'anteprima sono passati da ${prima.slot} a ${dopo.slot}`).toBe(prima.slot);

    /*
     * ⛔⛔ E IL PANNELLO DEVE DIRE IL VERO. Questa metà mancava, e la review ha portato una cura
     *   DIVERSA e SBAGLIATA che passava la prova allargata con la schermata che mente: togliere il
     *   rimontaggio (`views.get(screen)?.dispose()` → `if (views.get(screen)) return;`) impedisce la
     *   duplicazione, il ripristino AVVIENE davvero, e in compenso gli indicatori restano **accesi**
     *   su righe già al default — cioè il pannello offre di ripristinare ciò che è già stato
     *   ripristinato. Subito dopo un ripristino, nessuna riga ha niente da ripristinare: zero.
     */
    expect(dopo.ripristiniAccesi, `dopo il ripristino restano ${dopo.ripristiniAccesi} indicatori accesi su righe già al default: il pannello non dice il vero su ciò che mostra`).toBe(0);

    /*
     * ⛔ E IL TASTO DEVE RESTARE RAGGIUNGIBILE. È l'altra metà della promessa, e si prova col
     *   GESTO VERO: le colonne impilate coprivano «Ripristina tutto l'aspetto», e un comando che
     *   non si può premere non è un comando.
     */
    await expect(page.locator('[data-reset-appearance]')).toBeVisible();
    await page.locator('[data-reset-appearance]').click({ timeout: 5000 });
    /* E dopo il gesto vero, di nuovo una sola: anche l'ultima pressione non deve aggiungere niente. */
    const finale = await page.evaluate(CONTA);
    expect(finale.nelloSlot, `dopo il clic VERO la colonna è ${finale.nelloSlot}, non 1`).toBe(1);
    expect(finale.ripristiniAccesi, 'dopo il clic VERO il pannello mostra indicatori accesi').toBe(0);
  });
}
