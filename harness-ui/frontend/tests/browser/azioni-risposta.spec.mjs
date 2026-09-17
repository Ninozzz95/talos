import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BC-60 — LE AZIONI SULLA RISPOSTA: DUE IN RIGA, IL RESTO NEL «⋯» E NEL TASTO DESTRO.
 * 17/09/2026.
 *
 * Prima di oggi la riga sotto la risposta aveva TRE icone affiancate (Copia · Ascolta · Chiedi di
 * nuovo), nessun menu di overflow, nessun tasto destro e nessun Elimina.
 *
 * ⛔ Che cosa si misura, e perché così:
 *  · «al più due in riga» è un CONTEGGIO, e il «⋯» non entra nel conto perché non è un'azione ma
 *    il modo di raggiungerne altre: si contano i `[data-message-action]` che non sono il «⋯»;
 *  · «intersezione vuota, unione completa» si prova confrontando gli INSIEMI dei testi, non
 *    guardando che il menu «abbia delle voci»: una voce ripetuta in riga e nel menu passerebbe
 *    qualunque prova di presenza;
 *  · «il menu non copre il testo» è una misura in pixel fra il fondo del testo della risposta e
 *    la cima del menu, non un'impressione.
 *
 * ⛔ Nessun giro con un modello vero: gli eventi arrivano da una rotta finta, come in tutte le
 *   prove di questa cartella.
 */

const VOCI_ATTESE_MENU = ['Chiedi di nuovo', 'Elimina la risposta'];

async function apriApp(page, { tema = 'dark', larghezza = 1440, altezza = 900 } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema === 'light' ? 'light' : 'dark' });
  await page.route('**/api/v1/sessions/bc60-*/events*', (rotta) => rotta.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}

/** Una risposta VERA del prodotto: sessione aperta, `RunStarted`, poi il testo del modello. */
async function unaRisposta(page, testo = 'Ecco la risposta: ho letto il file e non ho cambiato niente.') {
  await page.evaluate((contenuto) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('bc60-uno', 'workspace', 'BC-60 azioni', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generazione = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Leggi il file e dimmi cosa c\'è' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' } }, generazione);
    runtime.handleRealEvent({ type: 'TextMessageStart', messageId: 'm1' }, generazione);
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: contenuto }, generazione);
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: 'm1' }, generazione);
    runtime.handleRealEvent({ type: 'RunFinished' }, generazione);
  }, testo);
  await expect(page.locator('#conversation .assistant-copy').first()).toContainText('Ecco la risposta');
}

/* ⛔ Ristretto alla RISPOSTA: dal 17/09 anche il messaggio della persona ha la sua riga d'azioni,
   e un selettore largo conterebbe le due righe insieme. L'ha trovato Playwright con «strict mode
   violation», non una rilettura — ed è la prova che la metà nuova di BC-60 esiste davvero. */
const azioniInRiga = (page) => page.locator('#conversation .talos-message:has(.assistant-copy) .talos-message__actions [data-message-action]:not([data-message-action="piu"])');
const vociMenu = (page) => page.locator('#menuRispostaMessaggio [role="menuitem"]');

test('BC60-01 — in riga al più DUE azioni, più il «⋯» che non è un\'azione', async ({ page }) => {
  await apriApp(page);
  await unaRisposta(page);
  await expect(azioniInRiga(page)).toHaveCount(2);
  await expect(page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]')).toHaveCount(1);
  await expect(page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]')).toHaveAttribute('aria-haspopup', 'menu');
  await expect(page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]')).toHaveAttribute('aria-expanded', 'false');
});

test('BC60-02 — riga e menu: intersezione VUOTA, unione COMPLETA, con Elimina', async ({ page }) => {
  await apriApp(page);
  await unaRisposta(page);
  const inRiga = await azioniInRiga(page).evaluateAll((nodi) => nodi.map((n) => n.getAttribute('aria-label')));
  await page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]').click();
  await expect(vociMenu(page)).toHaveCount(VOCI_ATTESE_MENU.length);
  const nelMenu = await vociMenu(page).allTextContents();
  expect(nelMenu, 'le voci del menu, per nome').toEqual(VOCI_ATTESE_MENU);
  expect(nelMenu, 'la lista si giudica da ciò che MANCA: Elimina deve esserci').toContain('Elimina la risposta');
  /* ⛔ Intersezione: si confrontano gli insiemi, non si guarda che «ci siano voci». */
  const normale = (s) => s.replace(/\s+/gu, ' ').trim().toLowerCase();
  const comuni = inRiga.map(normale).filter((v) => nelMenu.map(normale).includes(v));
  expect(comuni, 'nessuna azione deve stare in riga E nel menu').toEqual([]);
  expect([...inRiga, ...nelMenu].length, 'unione completa: quattro azioni in tutto').toBe(4);
});

/**
 * ⛔⛔ 17/09, secondo giro — LA SOVRAPPOSIZIONE SI MISURA, NON SI DEDUCE DALLA POSIZIONE.
 *
 * La prima stesura confrontava il bordo alto del menu col FONDO DEL TESTO dello stesso messaggio:
 * il revisore l'ha misurato e non poteva fallire, perché la riga d'azioni sta sempre sotto quel
 * testo. E dal tasto destro il menu si apriva al puntatore, sopra il testo, in quattro foto su
 * quattro — con la prova verde.
 * ⇒ Qui si misura l'AREA di sovrapposizione fra il rettangolo del menu e quelli che NON deve
 *   coprire (il testo della risposta e la scheda di approvazione sotto), sui due percorsi.
 */
const AREA_SOVRAPPOSTA = `(a, b) => {
  const larghezza = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const altezza = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return Math.round(larghezza * altezza);
}`;

async function sovrapposizioni(page) {
  return page.evaluate(`((sovrapposta) => {
    const menu = document.querySelector('#menuRispostaMessaggio').getBoundingClientRect();
    const testo = document.querySelector('#conversation .assistant-copy').getBoundingClientRect();
    const bottone = document.querySelector('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]').getBoundingClientRect();
    const carta = document.querySelector('#conversation [data-c="ApprovalCard"]')?.getBoundingClientRect() ?? null;
    return {
      sulTesto: sovrapposta(menu, testo),
      sullaCarta: carta ? sovrapposta(menu, carta) : 0,
      sottoIlPulsante: Math.round(menu.top - bottone.bottom),
    };
  })(${AREA_SOVRAPPOSTA})`);
}

for (const percorso of ['dal «⋯»', 'dal tasto destro']) {
  test(`BC60-03 (${percorso}) — il menu si àncora al pulsante e non copre NIENTE di ciò che si legge`, async ({ page }) => {
    await apriApp(page);
    await unaRisposta(page);
    /* Una scheda di approvazione sotto la risposta: è quella che il menu copriva nelle foto. */
    await page.evaluate(() => {
      const r = window.__talosHarnessUiRuntime;
      r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'bc60-app', azione: { tipo: 'shell', comando: 'npm run build' } }, r.realSessionState.generation);
    });
    await expect(page.locator('#conversation [data-c="ApprovalCard"]')).toBeVisible();
    const piu = page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]');
    if (percorso === 'dal «⋯»') await piu.click();
    else await page.locator('#conversation .talos-message:has(.assistant-copy)').first().click({ button: 'right', position: { x: 120, y: 12 } });
    await expect(page.locator('#menuRispostaMessaggio')).toBeVisible();
    await expect(piu).toHaveAttribute('aria-expanded', 'true');
    const m = await sovrapposizioni(page);
    expect(m.sottoIlPulsante, 'il menu scende SOTTO il pulsante').toBeGreaterThanOrEqual(0);
    expect(m.sulTesto, `il menu copriva ${m.sulTesto} px² del testo della risposta`).toBe(0);
    /*
     * ⛔ E la scheda di approvazione SOTTO? Un menu a tendina copre ciò che ha sotto: è quello che
     *   fa un menu, e pretendere zero vorrebbe dire spingere il contenuto, cosa che nessun menu
     *   del progetto fa. La proprietà onesta non è «non copre» ma «non BLOCCA»: quanto copre si
     *   misura, e si pretende che UN Esc lo tolga di mezzo per intero.
     */
    expect(m.sullaCarta, 'la misura di quanto il menu copre la scheda sotto, per il rapporto').toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#menuRispostaMessaggio')).toBeHidden();
    const carta = page.locator('#conversation [data-c="ApprovalCard"]');
    await expect(carta).toBeVisible();
    await expect(carta.locator('button', { hasText: 'Consenti una volta' })).toBeEnabled();
  });
}

test('BC60-03-bis — Esc chiude e RESTITUISCE il fuoco al «⋯» (W3C APG, Menu Button)', async ({ page }) => {
  await apriApp(page);
  await unaRisposta(page);
  const piu = page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]');
  await piu.click();
  await expect(page.locator('#menuRispostaMessaggio')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menuRispostaMessaggio')).toBeHidden();
  await expect(piu).toHaveAttribute('aria-expanded', 'false');
  /* ⛔ Il fuoco stava su una voce del menu: sparito il menu, deve tornare al pulsante che l'ha aperto. */
  expect(await page.evaluate(() => document.activeElement?.dataset?.messageAction ?? null)).toBe('piu');
  /* Un secondo clic richiude: un menu che si apre e basta è mezzo controllo. */
  await piu.click();
  await expect(page.locator('#menuRispostaMessaggio')).toBeVisible();
  await piu.click();
  await expect(page.locator('#menuRispostaMessaggio')).toBeHidden();
});

test('BC60-04 — il tasto destro sul messaggio apre LO STESSO menu', async ({ page }) => {
  await apriApp(page);
  await unaRisposta(page);
  /* ⛔ Il messaggio della RISPOSTA, non il primo `.talos-message` della conversazione: il primo è
     quello della persona, e prendere quello avrebbe provato una superficie che non ho toccato. */
  await page.locator('#conversation .talos-message:has(.assistant-copy)').first().click({ button: 'right' });
  await expect(page.locator('#menuRispostaMessaggio')).toBeVisible();
  expect(await vociMenu(page).allTextContents()).toEqual(VOCI_ATTESE_MENU);
});

test('BC60-05 — Elimina chiede conferma, e la cancellazione passa dal SERVER', async ({ page }) => {
  await apriApp(page);
  await unaRisposta(page);
  /* ⛔ La DELETE si intercetta: una prova non cancella davvero il registro di nessuno, e così si
     misura anche CHE COSA il client chiede — l'indirizzo, non solo l'effetto a schermo. */
  const chieste = [];
  await page.route('**/api/v1/sessions/*/messages/*', (rotta) => {
    chieste.push({ metodo: rotta.request().method(), url: rotta.request().url() });
    return rotta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { rimosso: true, riferimento: 'm1', toltoDalModello: true } }) });
  });
  await page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]').click();
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Elimina la risposta' }).click();
  /* Primo clic: il menu resta aperto e la voce chiede conferma. La risposta è ancora lì, e NESSUNA richiesta è partita. */
  await expect(page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Confermi? Elimina la risposta' })).toBeVisible();
  await expect(page.locator('#conversation .assistant-copy')).toHaveCount(1);
  expect(chieste, 'una conferma non è ancora una cancellazione').toEqual([]);
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Confermi? Elimina la risposta' }).click();
  await expect(page.locator('#conversation .assistant-copy')).toHaveCount(0);
  expect(chieste.length, 'una DELETE, una sola').toBe(1);
  expect(chieste[0].metodo).toBe('DELETE');
  expect(chieste[0].url).toContain('/messages/m1');
  await expect(page.locator('#regioneToast, .toast-region').first()).toContainText('il modello non la legge più');
});

test('BC60-06 — se il server RIFIUTA, la risposta resta dov\'è e il toast lo dice', async ({ page }) => {
  await apriApp(page);
  await unaRisposta(page);
  await page.route('**/api/v1/sessions/*/messages/*', (rotta) => rotta.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'SESSION_STILL_RUNNING', message: 'La sessione sta ancora lavorando: aspetta la fine del giro, o fermalo.' } }),
  }));
  await page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]').click();
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Elimina la risposta' }).click();
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Confermi? Elimina la risposta' }).click();
  /* ⛔ Il DOM si tocca DOPO l'esito: un rifiuto non deve lasciare la persona convinta di aver cancellato. */
  await expect(page.locator('#conversation .assistant-copy')).toHaveCount(1);
  /* ⛔ L'apostrofo è quello DRITTO, come lo scrive la app: la prima stesura ne usava uno curvo e la
     prova era rossa su una differenza tipografica, non su un comportamento. */
  await expect(page.locator('#regioneToast, .toast-region').first()).toContainText("Non l'ho eliminato");
});

test('BC60-07 — quando il modello può ricordarla ancora, il toast NON dice «eliminata»', async ({ page }) => {
  await apriApp(page);
  await unaRisposta(page);
  await page.route('**/api/v1/sessions/*/messages/*', (rotta) => rotta.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { rimosso: true, riferimento: 'm1', toltoDalModello: false, motivo: 'posizione-assente' } }),
  }));
  await page.locator('#conversation .talos-message:has(.assistant-copy) [data-message-action="piu"]').click();
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Elimina la risposta' }).click();
  await page.locator('#menuRispostaMessaggio [role="menuitem"]', { hasText: 'Confermi? Elimina la risposta' }).click();
  await expect(page.locator('#conversation .assistant-copy')).toHaveCount(0);
  await expect(page.locator('#regioneToast, .toast-region').first()).toContainText('potrebbe ricordarla ancora');
});
