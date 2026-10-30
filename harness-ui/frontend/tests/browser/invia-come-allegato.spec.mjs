import { expect, test } from '@playwright/test';

/*
 * §4.2, regola N (owner 22/10/2026; bozzetto «Invia come allegato» approvato il 29/10, «Sì, così»). Il server si ferma PRIMA di pagare
 * quando il messaggio da solo non entra, col codice REQUEST_TOO_LARGE e i numeri in alto (`agent-service.mjs`, `richiesta-troppo-grande.mjs`).
 * L'evento finto porta il testo VERO del server (la frase inglese di `RichiestaTroppoGrande` e la sua chiave), non un testo inventato.
 */
const LOG = `Guarda questo log e dimmi perché la build fallisce:\n${Array.from({ length: 40 }, (_, i) => `[12:00:${String(i % 60).padStart(2, '0')}] ERROR build step ${i}: module not found ./pacchetto-${i}`).join('\n')}`;
const DATI = { tokensRichiesta: 212000, tokensCornice: 18000, finestra: 200000, fonte: 'stima' };
const MESSAGGIO = 'Your message is about 212,000 tokens; with the system and tools (about 18,000) it does not fit this model\'s 200,000-token window. Nothing was summarized or sent.';

async function giroFermato(page, { allegabile, rigiocata = false, bozza = '' }) {
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await page.evaluate(({ testo, dati, messaggio, allegabile, rigiocata, bozza }) => {
    const runtime = window.__talosHarnessUiRuntime;
    const s = runtime.realSessionState;
    s.id = 'sessione-allegato-prova';
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: testo }, _sequenza: 92000 }, s.generation); // la bolla della persona, come dal server
    s.ultimaDomanda = testo;
    if (bozza) document.querySelector('#composerInput').value = bozza; // la persona sta già scrivendo altro quando arriva l'errore
    s.inRigiocata = rigiocata;
    runtime.handleRealEvent({ type: 'RunError', code: 'REQUEST_TOO_LARGE', message: messaggio, messageChiave: 'server.run.requestTooLarge',
      messageParams: { ...dati, allegabile }, ...dati, allegabile, _sequenza: 92001 }, s.generation);
    s.inRigiocata = false;
  }, { testo: LOG, dati: DATI, messaggio: MESSAGGIO, allegabile, rigiocata, bozza });
}

/* Revisione del blocco 19: due protezioni senza prova (mutanti sopravvissuti) — il testo che torna e il clic non scrivono MAI sopra la
   bozza della persona, né quella scritta prima dell'errore né quella scritta dopo. */
test('ALLEGA-UI-03 — la bozza della persona resta: prima dell\'errore il testo non torna sopra, e il clic non la cancella', async ({ page }) => {
  const corpi = [];
  await page.route('**/api/v1/sessions/sessione-allegato-prova/resume', async (route) => {
    corpi.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: [], inPausa: false } }) });
  });
  await giroFermato(page, { allegabile: true, bozza: 'una domanda nuova, scritta prima' });
  const casella = page.locator('#composerInput');
  await expect(casella).toHaveValue('una domanda nuova, scritta prima');
  await casella.fill('e adesso un\'altra ancora, scritta dopo');
  await page.locator('#conversation .real-session-status').last().getByRole('button', { name: 'Invia come allegato' }).click();
  await expect.poll(() => corpi.length).toBe(1);
  expect(corpi[0].messaggio).toBe(LOG);
  await expect(casella).toHaveValue('e adesso un\'altra ancora, scritta dopo');
});

test('ALLEGA-UI-01 — la carta d\'attenzione coi numeri, il testo nella casella, «Invia come allegato» rimanda il testo ESATTO col segno', async ({ page }) => {
  const corpi = [];
  await page.route('**/api/v1/sessions/sessione-allegato-prova/resume', async (route) => {
    corpi.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: [], inPausa: false } }) });
  });
  await giroFermato(page, { allegabile: true });
  const carta = page.locator('#conversation .real-session-status').last();
  await expect(carta).toContainText('Il messaggio è troppo grande per questo modello.');
  await expect(carta).toContainText('212.000');
  await expect(carta).toContainText('Non è stato inviato niente e non hai speso niente.');
  await expect(carta).not.toHaveClass(/real-session-error/u, { timeout: 1000 }); // attenzione, non il rosso del guasto
  await expect(page.locator('#composerInput')).toHaveValue(LOG);
  const bolla = page.locator('#conversation .talos-message--user').last();
  await expect(bolla).toHaveClass(/talos-message--non-inviato/u);
  await expect(bolla.locator('.talos-message__stato')).toHaveText('Non inviato');
  await page.screenshot({ path: 'test-results/invia-come-allegato.png' });

  const pulsante = carta.getByRole('button', { name: 'Invia come allegato' });
  await expect(pulsante).toHaveCount(1);
  /* un DOPPIO clic rapido, nello stesso istante, prima che la carta si ridisegni: il secondo non deve rimandare il testo */
  await pulsante.evaluate((b) => { b.click(); b.click(); });
  await expect.poll(() => corpi.length).toBe(1);
  expect(corpi[0].messaggio).toBe(LOG.trim() === LOG ? LOG : LOG.trim());
  expect(corpi[0].allegaSeTroppoGrande).toBe(true);
  await expect(page.locator('#composerInput')).toHaveValue('');
  if (await pulsante.count()) await pulsante.evaluate((b) => b.click()); // un secondo clic, se il pulsante c'è ancora
  await page.waitForTimeout(300);
  expect(corpi.length, 'una volta sola per carta').toBe(1);
});

test('ALLEGA-UI-02 — al contrario: con immagini o un testo corto il pulsante non c\'è e la carta dice perché; rigiocata, niente casella', async ({ page }) => {
  await giroFermato(page, { allegabile: false });
  const carta = page.locator('#conversation .real-session-status').last();
  await expect(carta).toContainText('Qui non c’è niente da spostare in un allegato');
  await expect(carta.getByRole('button', { name: 'Invia come allegato' })).toHaveCount(0);

  await page.locator('#composerInput').fill('');
  await giroFermato(page, { allegabile: true, rigiocata: true });
  const cartaRigiocata = page.locator('#conversation .real-session-status').last();
  await expect(cartaRigiocata.getByRole('button', { name: 'Invia come allegato' })).toHaveCount(0);
  await expect(page.locator('#composerInput')).toHaveValue('');
  await expect(page.locator('#conversation .talos-message--user').last()).toHaveClass(/talos-message--non-inviato/u);
});
