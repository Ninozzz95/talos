import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ 17/09/2026 — LE DUE COSE CHE MANCAVANO SOTTO LA RISPOSTA E SOPRA DI ESSA.
 *
 *  · BC-60, l'altra metà: il messaggio della PERSONA non aveva nessuna azione e nessun tasto
 *    destro. La regola dell'owner del 13/09 — «una lista di azioni si giudica da ciò che manca» —
 *    era nata proprio su questa asimmetria.
 *  · BC-75: a fine giro, i file modificati in QUEL giro, ognuno col collegamento alla sua scheda
 *    nella Revisione. Il componente esisteva dal 05/09 e non lo chiamava nessuno.
 *
 * ⛔ Niente giri con un modello vero: gli eventi arrivano dalla porta del runtime, com'è già uso in
 *   questa cartella, e la DELETE si intercetta — una prova non cancella il registro di nessuno.
 */

const CARTELLA = 'C:\\progetti\\AVM';

async function apriApp(page, { tema = 'dark', larghezza = 1440, altezza = 900 } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema === 'light' ? 'light' : 'dark' });
  await page.route('**/api/v1/sessions/bc75-*/events*', (rotta) => rotta.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}

/** Un giro vero: domanda, risposta, e `scritture` file scritti prima di `RunFinished`. */
async function unGiro(page, { consegna = 'Scrivi le note', scritture = [], sequenza = 1 } = {}) {
  await page.evaluate(({ consegna: testo, scritture: file, sequenza: seq, cartella }) => {
    const r = window.__talosHarnessUiRuntime;
    if (!r.realSessionState.id) r.passaASessione('bc75-uno', 'workspace', 'BC-75', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: seq, input: { consegna: testo, seguito: seq > 1 }, contesto: { cartella, modello: 'qwen/qwen3.8-flash' } }, g);
    r.handleRealEvent({ type: 'TextMessageStart', messageId: `m${seq}` }, g);
    r.handleRealEvent({ type: 'TextMessageContent', messageId: `m${seq}`, delta: `Risposta del giro ${seq}.` }, g);
    r.handleRealEvent({ type: 'TextMessageEnd', messageId: `m${seq}` }, g);
    for (const percorso of file) {
      r.handleRealEvent({ type: 'StateDelta', delta: [{ op: 'add', path: `/file/${percorso}`, value: { op: 'add', dopo: 'riga uno\nriga due\n' } }] }, g);
    }
    r.handleRealEvent({ type: 'RunFinished' }, g);
  }, { consegna, scritture, sequenza, cartella: CARTELLA });
}

const carte = (page) => page.locator('#conversation [data-c="TouchedFiles"]');

/* ───────────────────────────────────────────── BC-60, il messaggio della persona ─── */

test('UTENTE-01 — il messaggio della persona ha la sua riga: due azioni, più il «⋯»', async ({ page }) => {
  await apriApp(page);
  await unGiro(page);
  const messaggio = page.locator('#conversation .talos-message--user').first();
  await expect(messaggio.locator('[data-message-action]:not([data-message-action="piu"])')).toHaveCount(2);
  await expect(messaggio.locator('[data-message-action="copy"]')).toHaveAttribute('aria-label', 'Copia il tuo messaggio');
  await expect(messaggio.locator('[data-message-action="riusa"]')).toHaveCount(1);
  await expect(messaggio.locator('[data-message-action="piu"]')).toHaveAttribute('aria-haspopup', 'menu');
  /*
   * ⛔⛔ LA RIGA VALE IL SUO CONTENUTO. Trovato in una FOTO e poi misurato: era alta **154 px**
   *   invece di 30, perché una delle icone era un `<svg>` senza classe di misura e dentro un flex
   *   si allargava fino a riempire. Non si vedeva — la riga è trasparente finché non ci passi
   *   sopra — ma il menu si ancora al suo FONDO e compariva staccato dal messaggio.
   * ⛔ Il numero è un TETTO, non un valore esatto: un tema con i controlli più grandi resta
   *   legittimo, 154 px no.
   */
  const altezza = await messaggio.locator('.talos-message__actions').evaluate((n) => Math.round(n.getBoundingClientRect().height));
  expect(altezza, `la riga d'azioni era alta ${altezza} px: un'icona senza misura si allarga fino a riempire`).toBeLessThan(60);
});

test('UTENTE-02 — riga e menu: intersezione vuota, unione completa, e la conferma DICE che se ne va anche la risposta', async ({ page }) => {
  await apriApp(page);
  await unGiro(page);
  const messaggio = page.locator('#conversation .talos-message--user').first();
  const inRiga = await messaggio.locator('[data-message-action]:not([data-message-action="piu"])').evaluateAll((n) => n.map((b) => b.getAttribute('aria-label')));
  await messaggio.locator('[data-message-action="piu"]').click();
  const nelMenu = await page.locator('#menuRispostaMessaggio [role="menuitem"]').allTextContents();
  expect(nelMenu).toEqual(['Elimina il messaggio']);
  const normale = (s) => s.replace(/\s+/gu, ' ').trim().toLowerCase();
  expect(inRiga.map(normale).filter((v) => nelMenu.map(normale).includes(v)), 'intersezione vuota').toEqual([]);
  /* ⛔ La conferma non nasconde la conseguenza: se ne va anche la risposta che ne dipendeva. */
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Elimina il messaggio' }).click();
  await expect(page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Confermi? Elimina anche la risposta' })).toBeVisible();
});

test('UTENTE-03 — «Riusa nel composer» riempie il composer e NON invia', async ({ page }) => {
  await apriApp(page);
  await unGiro(page, { consegna: 'Scrivi le note del progetto' });
  let inviate = 0;
  await page.route('**/api/v1/sessions/**', (rotta) => { if (rotta.request().method() === 'POST') inviate += 1; return rotta.continue(); });
  await page.locator('#conversation .talos-message--user [data-message-action="riusa"]').first().click();
  await expect(page.locator('#composerInput')).toHaveValue('Scrivi le note del progetto');
  expect(inviate, 'riusare NON è rimandare: il composer si riempie e basta').toBe(0);
});

test('UTENTE-04 — Elimina manda `giro:<sequenza>`, cioè il TURNO, non la sola bolla', async ({ page }) => {
  await apriApp(page);
  await unGiro(page, { sequenza: 7 });
  const chieste = [];
  await page.route('**/api/v1/sessions/*/messages/*', (rotta) => {
    chieste.push(decodeURIComponent(rotta.request().url().split('/messages/')[1]));
    return rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { rimosso: true, toltoDalModello: true } }) });
  });
  await page.locator('#conversation .talos-message--user [data-message-action="piu"]').first().click();
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Elimina il messaggio' }).click();
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Confermi? Elimina anche la risposta' }).click();
  expect(chieste, 'il riferimento è il GIRO, col numero di sequenza vero').toEqual(['giro:7']);
  await expect(page.locator('#regioneToast, .toast-region').first()).toContainText('con la risposta che gli era seguita');
});

/* ───────────────────────────────────────────────────────── BC-75, i file del giro ─── */

test('BC75-01 — a fine giro UNA carta coi file di QUEL giro, col conto e il collegamento', async ({ page }) => {
  await apriApp(page);
  await unGiro(page, { scritture: ['src/uno.mjs', 'src/due.mjs'] });
  await expect(carte(page)).toHaveCount(1);
  const carta = carte(page).first();
  await expect(carta.locator('.talos-touched__titolo')).toHaveText('2 file modificati');
  await expect(carta.locator('.talos-touched__row')).toHaveCount(2);
  /* Il nome si legge, il percorso intero sta nel `title`: la regola di BC-63. */
  await expect(carta.locator('.talos-touched__row').first()).toHaveAttribute('title', 'src/uno.mjs');
  /* ⛔ Niente «Annulla»: un annullamento vero del giro non esiste, e un bottone che non fa niente non si disegna. */
  expect(await carta.locator('button').allTextContents()).not.toContain('Annulla');
  /* Il clic sulla riga porta nella Revisione, su QUELLA scheda. */
  await carta.locator('.talos-touched__row').nth(1).click();
  await expect(page.locator('#schermoReview')).toBeVisible();
  await expect(page.locator('#schermoReview .talos-schede__tab[aria-selected="true"]')).toContainText('due.mjs');
});

test('BC75-02 — nessuna carta in un giro senza scritture, e una sola per giro (non una per scrittura)', async ({ page }) => {
  await apriApp(page);
  await unGiro(page, { scritture: [] });
  await expect(carte(page)).toHaveCount(0, 'una carta «0 file» è rumore che sembra un esito');
  await unGiro(page, { sequenza: 2, scritture: ['a.txt', 'b.txt', 'c.txt'] });
  await expect(carte(page)).toHaveCount(1);
  await expect(carte(page).first().locator('.talos-touched__row')).toHaveCount(3, 'tre scritture, UNA carta con tre righe');
  /* ⛔ E un secondo `RunFinished` dello stesso giro (una riconnessione che rigioca) non ne aggiunge una seconda. */
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'RunFinished' }, r.realSessionState.generation);
  });
  await expect(carte(page)).toHaveCount(1);
});

test('BC75-03 — la carta si ricostruisce dal REPLAY: riaprendo la sessione torna da sola', async ({ page }) => {
  await apriApp(page);
  await unGiro(page, { scritture: ['src/replay.mjs'] });
  await expect(carte(page)).toHaveCount(1);
  /*
   * ⛔ Il replay VERO: si passa a un'altra sessione e si torna — la chat si ricostruisce dagli
   *   eventi, che è il modo in cui il difetto «la carta sparisce alla ricarica» si vedrebbe.
   */
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc75-altra', 'workspace', 'Altra', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
  });
  await expect(carte(page)).toHaveCount(0);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc75-uno', 'workspace', 'BC-75', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
  });
  await unGiro(page, { scritture: ['src/replay.mjs'] });
  await expect(carte(page)).toHaveCount(1, 'rigiocando la storia la carta si ricostruisce, non si perde');
});
