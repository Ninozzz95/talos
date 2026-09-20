import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BC-63 / R1 — i GESTI del componente condiviso, misurati sul Terminale. 17/09/2026.
 *
 * ⛔ Perché questo file esiste, detto senza addolcirlo. Dopo aver estratto la meccanica delle
 *   linguette da `terminale.js` in `schede.js`, la suite era verde e il revisore avversariale ha
 *   MISURATO che non provava niente: disattivando insieme `auxclick` (tasto centrale chiude),
 *   `dblclick` (rinomina), `Delete`, `F2` e la guardia `inerte` — cioè PROPRIO le meccaniche
 *   traslocate — 1214 prove unitarie e 18 prove browser restavano verdi. Un refactor senza prove
 *   sui gesti è un trasloco fatto a occhi chiusi.
 *
 * ⛔ Cosa questo file può e non può provare:
 *   · i gesti si fanno con mouse e tastiera VERI (`button: 'middle'`, `F2`, `Delete`), non
 *     chiamando le funzioni: è così che li usa la persona, e un gestore staccato deve cadere.
 *   · servono DUE schede per provare una chiusura, quindi serve una sessione VERA sul server di
 *     prova (store vuoto, porta di `playwright.config.mjs`): mai il 4174.
 *   · la Revisione NON è provata qui: le sue linguette non si chiudono e non si rinominano
 *     (misurato: nessuna azione di chiusura esiste in `creaSchedeReview`), quindi questi gesti
 *     riguardano solo il Terminale.
 *
 * ⛔ Ognuna di queste prove è stata verificata AL CONTRARIO disattivando il suo gestore in
 *   `schede.js` e vedendola diventare rossa; i numeri stanno nel rapporto della corsia.
 */

test.use({ locale: 'it-IT' });

/** I nomi delle linguette vere del Terminale, senza il «+ Nuovo». */
const linguette = (page) => page.evaluate(() => [...document.querySelectorAll('.talos-terminal__tab[role="tab"][data-terminale-id]')]
  .map((b) => b.innerText.replace(/\s+/g, ' ').trim()));

/**
 * Apre la app su una sessione VERA e porta `quante` schede nel Terminale.
 *
 * ⛔ L'ERMETICITÀ, e perché è scritta così. Le cinque prove passavano una per una e si
 *   contraddicevano a vicenda quando giravano in fila (misurato: `DOPPIOCLIC` e `INERTE` si
 *   alternavano nel fallire, verdi da sole in 1,9 s). Causa: allo `goto('/')` la app RIAPRE DA SOLA
 *   l'ultima sessione dello store — che nella corsa in fila è quella del test precedente — e
 *   comincia a caricarne le schede; il mio `passaASessione` arriva sopra un caricamento già in
 *   volo, e per un attimo la barra mostra le linguette di un'altra sessione. Un conteggio preso in
 *   quell'attimo passa o fallisce a seconda di quanto è veloce il disco.
 * ⇒ Si aspetta che l'apertura automatica sia FINITA (rete quieta), poi si passa alla propria
 *   sessione, poi si verifica che sia DAVVERO la propria prima di contare; e il conteggio si
 *   riprende dopo un assestamento, come già fa `terminale-una-scheda-sola` (BC-62).
 */
async function apriTerminaleConSchede(page, request, baseURL, etichetta, quante = 1) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (window.top !== window) return; // lo script gira in OGNI cornice, anche sandboxata
  });
  const cartella = mkdtempSync(join(tmpdir(), `bc63-${etichetta}-`));
  const r = await request.post(new URL('/api/v1/sessions/custom', baseURL).href, {
    data: { cartellaLibera: cartella, consegna: `prova BC-63 ${etichetta}: non fare nulla`, modello: 'z-ai/glm-5.3-flash' },
  });
  expect(r.ok(), 'creazione della sessione di prova').toBe(true);
  const id = (await r.json()).data.sessionId;
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.waitForLoadState('networkidle'); // l'apertura automatica dell'ultima sessione ha finito
  await page.evaluate((i) => window.__talosHarnessUiRuntime.passaASessione(i, 'workspace', 'BC-63', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), id);
  await page.waitForFunction((i) => window.__talosHarnessUiRuntime.realSessionState?.id === i, id, { timeout: 15_000 });
  await page.locator('[data-mode="terminal"]:visible').first().click();
  await expect.poll(() => linguette(page), { message: `${etichetta}: la prima scheda`, timeout: 20_000 }).toHaveLength(1);
  await page.waitForTimeout(700); // assestamento: un doppione tardivo deve avere il tempo di comparire
  expect(await linguette(page), `${etichetta}: una sola scheda anche dopo l'assestamento`).toHaveLength(1);
  for (let n = 1; n < quante; n += 1) {
    /* ⛔ BC-68, 17/09: il «+ Nuovo» non è più `role="tab"` — si prende dal suo attributo, che è
       quello che il prodotto usa per riconoscerlo, e non dalla parola scritta sopra. */
    await page.locator('[data-terminale-nuova]').click();
    await expect.poll(() => linguette(page), { message: `${etichetta}: scheda ${n + 1}`, timeout: 20_000 }).toHaveLength(n + 1);
  }
  return id;
}

const dueSchede = (page, request, baseURL, etichetta) => apriTerminaleConSchede(page, request, baseURL, etichetta, 2);
const unaScheda = (page, request, baseURL, etichetta) => apriTerminaleConSchede(page, request, baseURL, etichetta, 1);

test('BC63-R1-CENTRALE — il tasto centrale sulla linguetta la CHIUDE (è il gesto di ogni browser)', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  await dueSchede(page, request, baseURL, 'centrale');
  const seconde = await linguette(page);
  /* ⛔ Il clic centrale si dà sulla linguetta VERA, non su una coordinata calcolata: se un giorno
     la barra si sposta, la prova deve continuare a colpire la stessa cosa. */
  await page.locator('.talos-terminal__tab[role="tab"][data-terminale-id]').nth(1).click({ button: 'middle' });
  await expect.poll(() => linguette(page), { message: 'dopo il clic centrale resta una scheda', timeout: 15_000 }).toHaveLength(1);
  expect((await linguette(page))[0], 'è rimasta la PRIMA, non una a caso').toBe(seconde[0]);
});

test('BC63-R1-CANC — Canc chiude la scheda che ha il fuoco, e il fuoco non si perde', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  await dueSchede(page, request, baseURL, 'canc');
  const prima = (await linguette(page))[0];
  await page.locator('.talos-terminal__tab[role="tab"][data-terminale-id]').nth(1).focus();
  await page.keyboard.press('Delete');
  await expect.poll(() => linguette(page), { message: 'Canc ha chiuso la scheda a fuoco', timeout: 15_000 }).toHaveLength(1);
  expect((await linguette(page))[0], 'è rimasta la prima').toBe(prima);
});

test('BC63-R1-F2 — F2 apre la rinomina, Invio conferma e il nome RESTA', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  await unaScheda(page, request, baseURL, 'f2');
  const linguetta = page.locator('.talos-terminal__tab[role="tab"][data-terminale-id]').first();
  await linguetta.focus();
  await page.keyboard.press('F2');
  const campo = page.locator('.talos-terminal__rinomina');
  await expect(campo, 'F2 apre il campo di rinomina').toBeVisible();
  await campo.fill('registro processi');
  await campo.press('Enter');
  await expect(campo, 'Invio chiude il campo').toBeHidden();
  await expect.poll(() => linguette(page), { message: 'il nome scelto resta sulla linguetta', timeout: 10_000 }).toEqual(['registro processi']);
});

test('BC63-R1-DOPPIOCLIC — il doppio clic apre la rinomina, Esc annulla e il nome di prima torna', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  await unaScheda(page, request, baseURL, 'dblclick');
  const nomeDiPrima = (await linguette(page))[0];
  const linguetta = page.locator('.talos-terminal__tab[role="tab"][data-terminale-id]').first();
  await linguetta.dblclick();
  const campo = page.locator('.talos-terminal__rinomina');
  await expect(campo, 'il doppio clic apre il campo di rinomina').toBeVisible();
  await campo.fill('nome buttato via');
  /* ⛔ `page.keyboard`, non `campo.press`: dopo `fill` il fuoco è già nel campo, e `press` su un
     locator rifà il focus su un nodo che l'Esc sta per staccare — misurato, resta appeso fino allo
     scadere del test. Il gesto vero è premere il tasto dove si sta scrivendo. */
  await page.keyboard.press('Escape');
  await expect(campo, 'Esc chiude il campo').toBeHidden();
  await expect.poll(() => linguette(page), { message: 'Esc non salva: torna il nome di prima', timeout: 10_000 }).toEqual([nomeDiPrima]);
});

test('BC63-R1-INERTE — durante la rinomina la linguetta è INERTE: un doppio clic dentro il campo non butta via ciò che hai scritto', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  await unaScheda(page, request, baseURL, 'inerte');
  const linguetta = page.locator('.talos-terminal__tab[role="tab"][data-terminale-id]').first();
  await linguetta.focus();
  await page.keyboard.press('F2');
  const campo = page.locator('.talos-terminal__rinomina');
  await expect(campo).toBeVisible();
  await campo.fill('nome a meta');
  /* ⛔ Il gesto vero: dentro un campo di testo si fa doppio clic per SCEGLIERE UNA PAROLA. Senza la
     guardia `inerte` quel doppio clic arriva alla linguetta sotto, che riapre la rinomina da capo:
     il campo si ricrea col valore VECCHIO e ciò che hai scritto sparisce, senza un errore. */
  await campo.dblclick();
  await expect(campo, 'il campo è ancora lì').toBeVisible();
  await expect(campo, 'e conserva ciò che hai scritto').toHaveValue('nome a meta');
  /* ⛔ E la tastiera della striscia resta sospesa: Canc dentro il campo è roba del campo, non chiude
     la scheda. Prima `End`, perché il doppio clic ha SELEZIONATO una parola e lì Canc la
     cancellerebbe davvero — sarebbe il campo che fa il suo mestiere, non la prova che misura il suo.
     (Misurato: senza `End` il nome finiva «nome a», e la prova accusava il prodotto per un gesto
     del browser.) */
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  await expect.poll(() => linguette(page), { message: 'la scheda non si è chiusa', timeout: 5_000 }).toHaveLength(1);
  await expect(campo, 'e il testo è intatto: Canc a fine riga non cancella niente').toHaveValue('nome a meta');
  await page.keyboard.press('Enter');
  await expect.poll(() => linguette(page), { timeout: 10_000 }).toEqual(['nome a meta']);
});
