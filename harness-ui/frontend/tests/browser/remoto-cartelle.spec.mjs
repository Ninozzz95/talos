import { expect, test } from '@playwright/test';

/*
 * R5.12 (owner 23/10/2026, bozzetto approvato: scene 7-8) — LE CARTELLE DEI DISPOSITIVI SUL PC. Le risposte di `/api/v1/remote…`
 * sono finte (gli stati del bozzetto); il protocollo e il cancello delle scritture sono provati nei test del server
 * (`remoto-cartelle-dispositivi`, `remoto-cartelle-consenso-rotte`). Qui l'interfaccia:
 *   · scena 7: una richiesta di cartella diventa la carta «Allow … to work in …?» sotto l'icona «Connected devices»; il fuoco NON va
 *     su «Allow» (un Invio battuto altrove non deve dare una cartella), Esc la nasconde, l'icona la riporta; «Allow» e «Not now»
 *     rispondono al server;
 *   · scena 8: Settings › Connected devices, «Allowed folders» sotto il dispositivo, «⋯» e tasto destro con «Revoke», «Add folder»
 *     con la finestra della nuova sessione in modalità «scegli» (una colonna, nessuna cartella di serie).
 */
const ORA = Date.now();

async function fingi(page) {
  const stato = {
    chiamate: [], corpi: [],
    consensi: [{ richiestaId: 'richiesta-0001', dispositivoId: 't1', nomeDispositivo: 'Pad di Nino', nome: 'AVM', percorso: 'D:\\Projects\\AVM', scadeAlle: new Date(ORA + 110_000).toISOString() }],
    cartelle: [{ cartellaId: 'cartella-0000000000000001', nome: 'talos-site', percorso: 'D:\\Projects\\talos-site', consentitaAlle: new Date(ORA).toISOString(), da: 'consenso', esiste: true }],
    rifiutaAggiunta: false,
  };
  const corpo = () => ({
    disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: 'pc', inLinea: ['t1'],
    telefoni: [{ id: 't1', nome: 'Pad di Nino', collegatoAlle: ORA, inLinea: true, percorso: { tipo: 'diretto', rttMs: 38 }, revocatoAlle: null }],
    attese: [], accoppiamento: { sbagliati: 0 }, consensi: stato.consensi,
  });
  await page.route('**/api/v1/remote**', async (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname;
    stato.chiamate.push(`${r.method()} ${p}`);
    if (r.method() !== 'GET') stato.corpi.push(r.postData());
    if (p === '/api/v1/remote') return route.fulfill({ json: { ok: true, data: corpo() } });
    const consenso = /^\/api\/v1\/remote\/consents\/([^/]+)\/(allow|deny)$/u.exec(p);
    if (consenso) {
      stato.consensi = stato.consensi.filter((c) => c.richiestaId !== consenso[1]);
      return route.fulfill({ json: { ok: true, data: { esito: consenso[2] === 'allow' ? 'consentita' : 'negata' } } });
    }
    if (p === '/api/v1/remote/phones/t1/folders' && r.method() === 'GET') return route.fulfill({ json: { ok: true, data: { cartelle: stato.cartelle } } });
    if (p === '/api/v1/remote/phones/t1/folders') {
      if (stato.rifiutaAggiunta) return route.fulfill({ status: 403, json: { ok: false, error: { code: 'FOLDER_NOT_ALLOWED', message: 'This folder belongs to TALOS and cannot be given to a device.' } } });
      const { percorso } = JSON.parse(r.postData());
      stato.cartelle = [...stato.cartelle, { cartellaId: 'cartella-0000000000000002', nome: percorso.split('\\').pop(), percorso, consentitaAlle: new Date().toISOString(), da: 'anticipo', esiste: true }];
      return route.fulfill({ json: { ok: true, data: { cartellaId: 'cartella-0000000000000002', nome: percorso.split('\\').pop() } } });
    }
    const revoca = /^\/api\/v1\/remote\/phones\/t1\/folders\/([^/]+)\/revoke$/u.exec(p);
    if (revoca && stato.revocaBlocca) {
      /* owner 27/10/2026 (il nega vince): la cartella restava raggiungibile da «Projects» ⇒ il server la tiene come BLOCCATA */
      stato.cartelle = stato.cartelle.map((c) => (c.cartellaId === revoca[1] ? { cartellaId: c.cartellaId, nome: c.nome, percorso: c.percorso, bloccataAlle: new Date().toISOString(), bloccata: true, esiste: true } : c));
      return route.fulfill({ json: { ok: true, data: { revocata: true, bloccata: true, tramite: { cartellaId: 'cartella-progetti', nome: 'Projects' }, stessaCartella: false } } });
    }
    if (revoca) { stato.cartelle = stato.cartelle.filter((c) => c.cartellaId !== revoca[1]); return route.fulfill({ json: { ok: true, data: { revocata: true } } }); }
    const sblocca = /^\/api\/v1\/remote\/phones\/t1\/folders\/([^/]+)\/unblock$/u.exec(p);
    if (sblocca) { stato.cartelle = stato.cartelle.filter((c) => c.cartellaId !== sblocca[1]); return route.fulfill({ json: { ok: true, data: { sbloccata: true } } }); }
    return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND' } } });
  });
  await page.route('**/api/v1/workspace-browser**', (route) => route.fulfill({ json: { ok: true, data: {
    root: 'D:\\', path: 'D:\\Projects', parent: 'D:\\',
    items: [{ name: 'AVM', path: 'D:\\Projects\\AVM', projectId: null }, { name: 'Notes', path: 'D:\\Projects\\Notes', projectId: null }],
    recommended: [{ label: 'AVM', path: 'D:\\Projects\\AVM', kind: 'project', projectId: 'default' }],
  } } }));
  await page.route('**/api/v1/workspace-info**', (route) => route.fulfill({ json: { ok: true, data: {} } }));
  return stato;
}
/* ⛔ 23/10 (misurato a 1920×1080): con il modulo «nuova cartella» nascosto l'albero restava a 230 px e «Selected folder» si
   gonfiava a 307 px di vuoto, nella nuova sessione come nella scelta per un dispositivo. L'albero prende l'altezza, la riga no. */
async function alberoCheRiempie(page) {
  await expect(page.locator('.workspace-chooser-tree-frame')).toBeVisible();
  const [albero, scelta] = await Promise.all([
    page.locator('.workspace-chooser-tree-frame').boundingBox(),
    page.locator('.workspace-chooser-selection').boundingBox(),
  ]);
  expect(albero.height).toBeGreaterThan(400);
  expect(scelta.height).toBeLessThan(90);
}
async function apri(page, { colorMode = null } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript((tema) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en', ...(tema ? { colorMode: tema } : {}) } }));
  }, colorMode);
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
}

test('REMOTO-CARTELLE-01 — la carta del consenso sotto l\'icona: il fuoco non va su «Allow», Esc la nasconde e l\'icona la riporta; «Allow» risponde al server', async ({ page }) => {
  const stato = await fingi(page);
  await apri(page);
  const carta = page.locator('[data-remoto-consenso="richiesta-0001"]');
  await expect(carta).toBeVisible({ timeout: 10_000 });
  await expect(carta).toContainText('Pad di Nino');
  await expect(carta).toContainText('D:\\Projects\\AVM');
  await expect(carta.locator('[data-remoto-consenso-scade]')).toContainText(/\d:\d\d/);
  /* la carta sta SOTTO l'icona */
  const [icona, rect] = await Promise.all([page.locator('#telefoniRemoto').boundingBox(), carta.boundingBox()]);
  expect(rect.y).toBeGreaterThan(icona.y + icona.height - 1);
  /* AL CONTRARIO di una carta che ruba il fuoco: Invio battuto altrove non consente niente */
  await expect(carta.locator('[data-remoto-consenti]')).not.toBeFocused();
  await page.keyboard.press('Enter');
  expect(stato.chiamate.filter((c) => c.startsWith('POST'))).toEqual([]);
  /* Esc la nasconde, l'icona la riporta e ci mette il fuoco (sulla carta, non su «Allow») */
  await carta.focus();
  await page.keyboard.press('Escape');
  await expect(carta).toBeHidden();
  await page.locator('#telefoniRemoto').click();
  await expect(carta).toBeVisible();
  await expect(carta).toBeFocused();
  await expect(carta.locator('[data-remoto-consenti]')).not.toHaveAttribute('data-in-armamento', /.*/u, { timeout: 5_000 });
  await carta.locator('[data-remoto-consenti]').click();
  await expect(carta).toBeHidden();
  expect(stato.chiamate).toContain('POST /api/v1/remote/consents/richiesta-0001/allow');
});

test('REMOTO-CARTELLE-02 — «Not now» nega; Settings › Connected devices mostra le cartelle consentite, e «Revoke» sta nel «⋯» e nel tasto destro', async ({ page }) => {
  const stato = await fingi(page);
  await apri(page);
  const carta = page.locator('[data-remoto-consenso="richiesta-0001"]');
  await carta.locator('[data-remoto-non-ora]').click();
  await expect(carta).toBeHidden();
  expect(stato.chiamate).toContain('POST /api/v1/remote/consents/richiesta-0001/deny');
  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('[data-settings-tab="telefoni"]').click();
  const sezione = page.locator('[data-remoto-cartelle="t1"]');
  await expect(sezione).toContainText('Allowed folders');
  const riga = sezione.locator('[data-remoto-cartella="cartella-0000000000000001"]');
  await expect(riga).toContainText('talos-site');
  await expect(riga).toContainText('allowed today');
  /* il tasto destro sulla riga apre lo stesso menu del «⋯», con «Revoke» */
  await riga.click({ button: 'right' });
  await expect(page.locator('#menuCartellaDispositivo [role=menuitem]')).toHaveText(['Revoke']);
  await page.keyboard.press('Escape');
  await riga.locator('[data-remoto-cartella-altro]').click();
  await page.locator('#menuCartellaDispositivo [role=menuitem]', { hasText: 'Revoke' }).click();
  await expect(riga).toHaveCount(0, { timeout: 10_000 });
  expect(stato.chiamate).toContain('POST /api/v1/remote/phones/t1/folders/cartella-0000000000000001/revoke');
});

test('REMOTO-CARTELLE-03 — «Add folder» apre la scelta in una colonna senza cartella di serie; consente quella scelta; un rifiuto resta nella finestra', async ({ page }) => {
  const stato = await fingi(page);
  stato.consensi = [];
  await apri(page);
  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('[data-settings-tab="telefoni"]').click();
  await page.locator('[data-remoto-cartelle="t1"] [data-remoto-aggiungi-cartella]').click();
  await expect(page.locator('.sheet-dialog')).toContainText('Which folder can Pad di Nino work in?');
  await expect(page.locator('.workspace-chooser-settings')).toBeHidden();
  await expect(page.locator('#workspaceChooserSubmit')).toHaveText('Allow this folder');
  await expect(page.locator('#workspaceChooserSubmitNote')).toHaveText('Choose a folder in the list.');
  /* la domanda la fa il titolo della finestra: niente «Choose the working folder» della nuova sessione qui sotto */
  await expect(page.locator('#workspaceChooserBrowserTitle')).toHaveCount(0);
  await alberoCheRiempie(page);
  /* prima un rifiuto del server: resta accanto al pulsante, scritto come errore */
  stato.rifiutaAggiunta = true;
  await page.getByRole('treeitem', { name: 'Notes' }).click();
  await page.locator('#workspaceChooserSubmit').click();
  await expect(page.locator('#workspaceChooserSubmitNote')).toContainText(/TALOS|folder/i);
  await expect(page.locator('#workspaceChooserSubmitNote')).toHaveAttribute('data-errore', '');
  await expect(page.locator('.sheet-dialog')).toBeVisible();
  /* poi consente */
  stato.rifiutaAggiunta = false;
  await page.locator('#workspaceChooserSubmit').click();
  await expect(page.locator('.sheet-dialog')).toBeHidden();
  expect(stato.corpi.filter(Boolean).map((c) => JSON.parse(c))).toContainEqual({ percorso: 'D:\\Projects\\Notes' });
  await expect(page.locator('[data-remoto-cartelle="t1"]')).toContainText('Notes', { timeout: 10_000 });
  /* AL CONTRARIO: la stessa finestra aperta per una nuova sessione torna com'era (due colonne, cartella di serie, «Start…») */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toHaveClass(/sheet-dialog--new-session/);
  await expect(page.locator('#sheetDialog')).not.toHaveClass(/sheet-dialog--scelta-cartella/);
  await expect(page.locator('.workspace-chooser-settings')).toBeVisible();
  await expect(page.locator('#workspaceChooserSubmit')).not.toHaveText('Allow this folder');
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('#workspaceChooserBrowserTitle')).toHaveText('Choose the working folder');
  await alberoCheRiempie(page);
});

/* ---------------------------------------------------------------- la seconda porta: le carte nella chat (attrezzi del modello) */
async function inChat(page, stato) {
  const risposte = [];
  await page.route('**/api/v1/sessions/cartelle-proof/events', () => { /* aperto e muto */ });
  await page.route('**/api/v1/sessions/cartelle-proof/approve', async (route) => {
    risposte.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('cartelle-proof', 'workspace', 'Cartelle dalla chat', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'RunStarted', input: { consegna: 'give my Pad the AVM folder' }, _sequenza: 1 }, r.realSessionState.generation);
  });
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
  return risposte;
}
const eventi = (page, lista) => page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent(e, r.realSessionState.generation); }, lista);
const DISPOSITIVO = { idCorto: 't1abcdef', nome: 'Pad di Nino', inLinea: true, ultimaVoltaAlle: null };
const CARTELLA = { cartellaId: 'cartella-0000000000000009', nome: 'AVM', percorso: 'D:\\Projects\\AVM' };

test('REMOTO-CARTELLE-04 — chat: la carta «Allow … to work in …?» col dispositivo e la cartella come altrove; «Allow» / «Not now», niente «Modifica»; approvata, risponde', async ({ page }) => {
  const stato = await fingi(page);
  stato.consensi = [];
  await apri(page);
  const risposte = await inChat(page, stato);
  await eventi(page, [{ type: 'ApprovalRequested', requestId: 'cart-req-1', _sequenza: 2, azione: { tipo: 'remote_phone_folder_allow', toolCallId: 'call-c1', telefono: DISPOSITIVO, cartella: CARTELLA } }]);
  const carta = page.locator('[data-request-id="cart-req-1"]');
  await expect(carta).toBeVisible();
  await expect(carta).toContainText('Folder for a device');
  await expect(carta).toContainText('Allow Pad di Nino to work in “AVM”?');
  await expect(carta).toContainText('Full access too');
  await expect(carta.locator('[data-telefoni-cartella="consenti"] .talos-remoto-riga__nome')).toHaveText(['Pad di Nino', 'AVM']);
  await expect(carta.locator('[data-telefoni-cartella="consenti"] .talos-remoto-riga__dettaglio').last()).toHaveText('D:\\Projects\\AVM');
  await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Allow');
  await expect(carta.locator('[data-nega]')).toHaveText('Not now');
  await expect(carta.locator('[data-modifica-automazione]')).toHaveCount(0);
  await carta.locator('[data-approva-una-volta]').click();
  await expect.poll(() => risposte).toEqual([{ requestId: 'cart-req-1', approvato: true }]);
});

test('REMOTO-CARTELLE-05 — chat: togliere ha la sua carta («Revoke» / «Keep it»); in Accesso pieno, senza carta, la riga porta «Done without asking» e il blocco dice quale cartella a chi', async ({ page }) => {
  const stato = await fingi(page);
  stato.consensi = [];
  await apri(page);
  await inChat(page, stato);
  await eventi(page, [{ type: 'ApprovalRequested', requestId: 'cart-req-2', _sequenza: 2, azione: { tipo: 'remote_phone_folder_revoke', toolCallId: 'call-c2', telefono: DISPOSITIVO, cartella: CARTELLA } }]);
  const carta = page.locator('[data-request-id="cart-req-2"]');
  await expect(carta).toContainText('Take back a folder');
  await expect(carta).toContainText('Stop Pad di Nino working in “AVM”?');
  await expect(carta.locator('[data-telefoni-cartella="togli"]')).toBeVisible();
  await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Revoke');
  await expect(carta.locator('[data-nega]')).toHaveText('Keep it');
  /* Accesso pieno: nessuna carta, l'esito col suo segno */
  await eventi(page, [
    { type: 'ToolCallStart', toolCallId: 'call-c3', toolCallName: 'remote_phone_folder_revoke', _sequenza: 3 },
    { type: 'ToolCallResult', toolCallId: 'call-c3', content: '"Pad di Nino" (id t1abcdef) can no longer work in "talos-site" (D:\\Projects\\talos-site). Sessions already open in that folder refuse its writes from now on. Full access: done without asking the person.', _sequenza: 4 },
    { type: 'TextMessageStart', messageId: 'cart-m1', _sequenza: 5 },
    { type: 'TextMessageContent', messageId: 'cart-m1', delta: 'Done.', _sequenza: 6 },
    { type: 'TextMessageEnd', messageId: 'cart-m1', _sequenza: 7 },
    { type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 8 },
  ]);
  const segno = page.locator('.talos-tool-row__senza-carta');
  await expect(segno).toBeVisible();
  await page.locator('.talos-tool-row[data-senza-carta="si"]').click();
  await expect(page.locator('[data-telefoni-senza-carta]')).toContainText('“talos-site” was taken back from “Pad di Nino”');
});

/* ⛔ 24/10/2026 — le cure della revisione avversaria (F1-1…F1-6). Ogni prova è stata vista rossa sul codice di prima. */
const armata = (carta) => expect(carta.locator('[data-remoto-consenti]')).not.toHaveAttribute('data-in-armamento', /.*/u, { timeout: 5_000 });

test('REMOTO-CARTELLE-06 — con 80 cartelle l\'albero scorre dentro di sé (nuova sessione a 1920×1080 e «Add folder» a 1024×800): la colonna non scorre', async ({ page }) => {
  const stato = await fingi(page);
  stato.consensi = [];
  const items = Array.from({ length: 80 }, (_, i) => ({ name: `cartella-${String(i).padStart(3, '0')}`, path: `D:\\Projects\\cartella-${String(i).padStart(3, '0')}`, projectId: null }));
  await page.route('**/api/v1/workspace-browser**', (route) => route.fulfill({ json: { ok: true, data: {
    root: 'D:\\', path: 'D:\\Projects', parent: 'D:\\', items, recommended: [{ label: 'AVM', path: 'D:\\Projects\\AVM', kind: 'project', projectId: 'default' }],
  } } }));
  const misura = () => page.evaluate(() => {
    const col = document.querySelector('.workspace-chooser-browser');
    const albero = document.querySelector('.workspace-chooser-tree-frame');
    return { colonna: col.scrollHeight - col.clientHeight, alberoScorre: albero.scrollHeight > albero.clientHeight + 2, alberoH: albero.getBoundingClientRect().height };
  });
  await apri(page);
  await page.locator('#newSessionBtn').click();
  await page.locator('.workspace-chooser-tree-frame [role="treeitem"]').nth(79).waitFor({ state: 'attached' });
  const grande = await misura();
  expect(grande.colonna).toBeLessThanOrEqual(2);
  expect(grande.alberoScorre).toBe(true);
  expect(grande.alberoH).toBeGreaterThan(400);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.locator('[data-vaia="impostazioni"]:visible').first().click();
  await page.locator('[data-settings-tab="telefoni"]').click();
  await page.locator('[data-remoto-cartelle="t1"] [data-remoto-aggiungi-cartella]').click();
  await page.locator('.workspace-chooser-tree-frame [role="treeitem"]').nth(79).waitFor({ state: 'attached' });
  const piccola = await misura();
  expect(piccola.colonna).toBeLessThanOrEqual(2);
  expect(piccola.alberoScorre).toBe(true);
  const pulsante = await page.locator('#workspaceChooserSubmit').boundingBox();
  expect(pulsante.y + pulsante.height).toBeLessThanOrEqual(800);
});

test('REMOTO-CARTELLE-07 — «Allow» non si preme appena la carta compare (arriva senza un gesto della persona): si arma dopo un attimo', async ({ page }) => {
  const stato = await fingi(page);
  /* la richiesta arriva DOPO l'avvio, col controllo periodico: come quando un dispositivo la manda mentre la persona lavora */
  const richiesta = stato.consensi;
  stato.consensi = [];
  await apri(page);
  await page.waitForTimeout(500);
  stato.consensi = richiesta;
  const carta = page.locator('[data-remoto-consenso="richiesta-0001"]');
  const si = carta.locator('[data-remoto-consenti]');
  await si.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(si).toHaveAttribute('data-in-armamento');
  await expect(si).toHaveAttribute('aria-disabled', 'true');
  /* il clic della persona arriva SUBITO (force: Playwright aspetterebbe da sé che il pulsante non sia più aria-disabled) */
  await si.click({ force: true });
  await page.waitForTimeout(150);
  expect(stato.chiamate.filter((c) => c.startsWith('POST'))).toEqual([]);
  /* AL CONTRARIO: un attimo dopo, lo stesso clic consente */
  await armata(carta);
  await si.click();
  await expect.poll(() => stato.chiamate).toContain('POST /api/v1/remote/consents/richiesta-0001/allow');
});

test('REMOTO-CARTELLE-08 — con un dispositivo in linea la latenza cambia a ogni giro: la sezione non si ridisegna (il fuoco resta) e la latenza a schermo si aggiorna', async ({ page }) => {
  test.setTimeout(60_000);
  const stato = await fingi(page);
  stato.consensi = [];
  let giri = 0;
  await page.route('**/api/v1/remote', (route) => {
    giri += 1;
    return route.fulfill({ json: { ok: true, data: {
      disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: 'pc', inLinea: ['t1'],
      telefoni: [{ id: 't1', nome: 'Pad di Nino', collegatoAlle: ORA, inLinea: true, percorso: { tipo: 'diretto', rttMs: 30 + giri }, revocatoAlle: null }],
      attese: [], accoppiamento: { sbagliati: 0 }, consensi: [],
    } } });
  });
  await apri(page);
  await page.locator('[data-vaia="impostazioni"]:visible').first().click();
  await page.locator('[data-settings-tab="telefoni"]').click();
  const altro = page.locator('[data-remoto-cartella="cartella-0000000000000001"] [data-remoto-cartella-altro]');
  await altro.focus();
  const dettaglio = page.locator('[data-remoto-telefono="t1"] .talos-remoto-riga__dettaglio');
  const prima = await dettaglio.textContent();
  const giriPrima = giri;
  await expect.poll(() => giri, { timeout: 20_000 }).toBeGreaterThan(giriPrima + 1);
  await page.waitForTimeout(300);
  await expect(altro).toBeFocused();
  await expect(dettaglio).not.toHaveText(prima);
  await expect(dettaglio).toContainText(`${30 + giri} ms`);
});

test('REMOTO-CARTELLE-09 — con un dispositivo già in linea all\'avvio il secondo controllo arriva dopo ~3 s, non dopo 20', async ({ page }) => {
  test.setTimeout(40_000);
  const stato = await fingi(page);
  stato.consensi = [];
  const tempi = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/v1/remote') tempi.push(Date.now()); });
  await apri(page);
  await expect.poll(() => tempi.length, { timeout: 12_000 }).toBeGreaterThan(1);
  expect(tempi[1] - tempi[0]).toBeLessThan(8_000);
});

test('REMOTO-CARTELLE-10 — una richiesta scaduta: «Allow» spento e un clic non consente niente', async ({ page }) => {
  const stato = await fingi(page);
  stato.consensi = [{ ...stato.consensi[0], scadeAlle: new Date(Date.now() + 2_500).toISOString() }];
  await apri(page);
  const carta = page.locator('[data-remoto-consenso="richiesta-0001"]');
  await expect(carta).toBeVisible({ timeout: 10_000 });
  await expect(carta.locator('[data-remoto-consenso-scade]')).toHaveText(/^expired$/iu, { timeout: 10_000 });
  await expect(carta.locator('[data-remoto-consenti]')).toBeDisabled();
  await carta.locator('[data-remoto-consenti]').click({ force: true });
  await page.waitForTimeout(150);
  expect(stato.chiamate.filter((c) => c.startsWith('POST'))).toEqual([]);
});

test('REMOTO-CARTELLE-11 — owner 24/10: «Later» nella testata della carta la nasconde come Esc, senza rispondere; l\'icona la riporta', async ({ page }) => {
  const stato = await fingi(page);
  await apri(page);
  const carta = page.locator('[data-remoto-consenso="richiesta-0001"]');
  await expect(carta).toBeVisible({ timeout: 10_000 });
  const dopo = carta.locator('.talos-approval__head [data-remoto-piu-tardi]');
  await expect(dopo).toHaveText('Later');
  /* nel piede restano due azioni */
  await expect(carta.locator('.talos-approval__foot button')).toHaveCount(2);
  await dopo.click();
  await expect(carta).toBeHidden();
  expect(stato.chiamate.filter((c) => c.startsWith('POST'))).toEqual([]);
  /* «New session» non è più coperta */
  await page.locator('#newSessionBtn').click({ timeout: 3_000 });
  await page.keyboard.press('Escape');
  /* AL CONTRARIO: la richiesta aspetta ancora, e l'icona riporta la carta */
  await page.locator('#telefoniRemoto').click();
  await expect(carta).toBeVisible();
});

test('REMOTO-CARTELLE-12 — 24/10 (contratto col Mobile): «This computer · <nome> · <codice breve>» con le prime 4 dell\'id, come sul dispositivo', async ({ page }) => {
  const stato = await fingi(page);
  stato.consensi = [];
  await page.route('**/api/v1/remote', (route) => route.fulfill({ json: { ok: true, data: {
    disponibile: true, acceso: true, relay: { modo: 'n0' }, sceltaFatta: true, pcId: '31ABcdef0123456789', nomePc: 'DESKTOP-ESEMPIO', inLinea: [],
    telefoni: [], attese: [], accoppiamento: { sbagliati: 0 }, consensi: [],
  } } }));
  await apri(page);
  await page.locator('[data-vaia="impostazioni"]:visible').first().click();
  await page.locator('[data-settings-tab="telefoni"]').click();
  await expect(page.locator('[data-remoto-questo-pc]')).toContainText('This computer');
  await expect(page.locator('[data-remoto-questo-pc]')).toContainText('DESKTOP-ESEMPIO · 31ab');
});

for (const tema of ['dark', 'light']) {
  test(`REMOTO-CARTELLE-11 (${tema}) — owner 27/10/2026, il nega vince: «Revoke» su una cartella ancora raggiungibile la lascia BLOCCATA e lo dice; il suo menu ha solo «Unblock»`, async ({ page }) => {
    const stato = await fingi(page);
    stato.consensi = [];
    stato.revocaBlocca = true;
    await apri(page, { colorMode: tema });
    await page.locator('[data-vaia="impostazioni"]').click();
    await page.locator('[data-settings-tab="telefoni"]').click();
    const riga = page.locator('[data-remoto-cartella="cartella-0000000000000001"]');
    await riga.locator('[data-remoto-cartella-altro]').click();
    await page.locator('#menuCartellaDispositivo [role=menuitem]', { hasText: 'Revoke' }).click();
    const avviso = page.getByRole('status').filter({ hasText: 'It is now blocked' });
    await expect(avviso).toContainText('“talos-site” revoked from Pad di Nino');
    await expect(avviso).toContainText('It is now blocked: it was still reachable through “Projects”.');
    await expect(riga).toHaveAttribute('data-remoto-bloccata', '');
    await expect(riga.locator('.talos-badge--warning')).toHaveText('Blocked');
    await expect(riga).toContainText('the device’s turns can’t open it, not even from another allowed folder'); // A-R6 (27/10): la frase onesta
    /* il tema chiesto è quello a schermo: luminanza dello sfondo del corpo (la prima corsa fotografava il chiaro due volte) */
    const luce = await page.evaluate(() => { const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/gu).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; });
    expect(tema === 'dark' ? luce < 0.35 : luce > 0.65, `luminanza ${luce} per ${tema}`).toBe(true);
    await expect(riga).not.toContainText('allowed today');
    await page.locator('[data-remoto-cartelle="t1"]').screenshot({ path: `test-results/remoto-cartella-bloccata-${tema}.png` });
    await riga.click({ button: 'right' });
    await expect(page.locator('#menuCartellaDispositivo [role=menuitem]')).toHaveText(['Unblock']);
    await page.locator('#menuCartellaDispositivo [role=menuitem]', { hasText: 'Unblock' }).click();
    await expect(riga).toHaveCount(0, { timeout: 10_000 });
    expect(stato.chiamate).toContain('POST /api/v1/remote/phones/t1/folders/cartella-0000000000000001/unblock');
  });
}

for (const tema of ['dark', 'light']) {
  test(`REMOTO-CARTELLE-13 (${tema}) — owner 27/10/2026 (contratto cartelle bloccate, giro 2, B4): la carta «Unblock … for …?» dalla chat, «Unblock» / «Keep it blocked», niente «Modifica»; approvata, risponde`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const stato = await fingi(page);
    stato.consensi = [];
    await apri(page, { colorMode: tema });
    const risposte = await inChat(page, stato);
    await eventi(page, [{ type: 'ApprovalRequested', requestId: 'cart-req-13', _sequenza: 2, azione: { tipo: 'remote_phone_folder_unblock', toolCallId: 'call-c13', telefono: DISPOSITIVO, cartella: CARTELLA } }]);
    const carta = page.locator('[data-request-id="cart-req-13"]');
    await expect(carta).toBeVisible();
    await expect(carta).toContainText('Unblock a folder');
    await expect(carta).toContainText('Unblock “AVM” for Pad di Nino?');
    await expect(carta).toContainText('Full access too');
    await expect(carta).toContainText('It is not allowed by itself');
    await expect(carta.locator('[data-telefoni-cartella="sblocca"] .talos-remoto-riga__nome')).toHaveText(['Pad di Nino', 'AVM']);
    await expect(carta.locator('[data-approva-una-volta]')).toHaveText('Unblock');
    await expect(carta.locator('[data-nega]')).toHaveText('Keep it blocked');
    await expect(carta.locator('[data-modifica-automazione]')).toHaveCount(0);
    const luce = await page.evaluate(() => { const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/gu).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; });
    expect(tema === 'dark' ? luce < 0.35 : luce > 0.65, `luminanza ${luce} per ${tema}`).toBe(true);
    await page.screenshot({ path: `test-results/remoto-carta-sblocca-${tema}.png` });
    await carta.locator('[data-approva-una-volta]').click();
    await expect.poll(() => risposte).toEqual([{ requestId: 'cart-req-13', approvato: true }]);
  });
}

for (const tema of ['dark', 'light']) {
  test(`REMOTO-CARTELLE-14 (${tema}) — revisione del blocco 10, B-R3: la carta per una cartella BLOCCATA dice che consentendo la si sblocca; senza blocco non lo dice`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const stato = await fingi(page);
    stato.consensi = [{ ...stato.consensi[0], bloccata: true }];
    await apri(page, { colorMode: tema });
    const carta = page.locator('[data-remoto-consenso="richiesta-0001"]');
    await expect(carta).toBeVisible({ timeout: 10_000 });
    await expect(carta).toHaveAttribute('data-remoto-consenso-bloccata', '');
    await expect(carta.locator('.talos-approval__why')).toContainText('You had blocked it for this device: allowing it unblocks it.');
    await page.screenshot({ path: `test-results/remoto-consenso-bloccata-${tema}.png` });
  });
}

test('REMOTO-CARTELLE-14b — al contrario: una cartella non bloccata ha la carta di sempre', async ({ page }) => {
  await fingi(page);
  await apri(page);
  const carta = page.locator('[data-remoto-consenso="richiesta-0001"]');
  await expect(carta).toBeVisible({ timeout: 10_000 });
  await expect(carta).not.toHaveAttribute('data-remoto-consenso-bloccata', /.*/u);
  await expect(carta.locator('.talos-approval__why')).not.toContainText('blocked');
});
