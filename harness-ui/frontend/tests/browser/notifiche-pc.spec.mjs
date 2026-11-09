import { expect, test } from '@playwright/test';

/*
 * Il pannello delle notifiche del PC sul registro del server (31/10/2026, consegna della Frontend `CONSEGNA-NOTIFICHE-PC-2026-10-31.md`,
 * FE-002/042/043). Il server qui è finto, con la forma VERA delle rotte (`src/notifiche-rotte.mjs`: `GET /api/v1/notifications?dopo`,
 * `POST /seen {ids}`, `POST /seen-all {finoA}`; la voce di `src/notifiche-registro.mjs`) e dell'avviso `talos.notifica` sul flusso
 * globale `/api/v1/remote/events`. Ogni scrittura verso il server si registra: le prove contano quante e quali.
 */

const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const ADESSO = Date.now();
const ISO = (msFa) => new Date(ADESSO - msFa).toISOString();
const VOCE = (seq, fatto, extra = {}) => ({ id: `${fatto}:s-${seq}:k${seq}`, seq, fatto, azione: null,
  cosa: { tipo: 'sessione', id: 'n-altra', nome: 'Redesign sidebar' }, dato: null, porta: { tipo: 'sessione', id: 'n-altra' },
  istante: ISO(60_000 * (20 - seq)), stato: { visto: false, risolto: false }, ...extra });

function registroFinto(voci) {
  const r = { voci: [...voci], viste: [], tutte: [] };
  r.ultimoSeq = () => r.voci.reduce((m, v) => Math.max(m, v.seq), 0);
  r.totaleDaFare = () => r.voci.filter((v) => (v.fatto === 'approvazione' || v.fatto === 'domanda') && !v.stato.risolto).length;
  return r;
}

async function prepara(page, { voci = [], elenco = null, lingua = 'it', flusso = null, posta = null, notificheDiSistema = false } = {}) {
  const reg = registroFinto(voci);
  reg.letti = [];
  reg.letture = []; // i cursori delle GET delle voci, in ordine
  /* la posta «Da guardare» delle automazioni (`/api/v1/automations/inbox`) e il suo «letto», quando la prova li usa */
  if (posta) {
    await page.route((url) => url.pathname === '/api/v1/automations/inbox', (route) => route.fulfill({ contentType: 'application/json', body: busta({ items: posta }) }));
    await page.route((url) => /^\/api\/v1\/automations\/[^/]+\/runs\/[^/]+\/letta$/u.test(url.pathname), (route) => {
      const [, , , , id, , runId] = new URL(route.request().url()).pathname.split('/');
      reg.letti.push({ id, runId });
      const g = posta.find((x) => x.runId === runId); if (g) g.letta = true;
      return route.fulfill({ contentType: 'application/json', body: busta({ ok: true }) });
    });
  }
  /* una Notification finta col permesso dato: ogni notifica di sistema si registra in `window.__notificheDiSistema` */
  if (notificheDiSistema) {
    await page.addInitScript(() => {
      window.__notificheDiSistema = [];
      class Finta { constructor(titolo, o) { this.titolo = titolo; this.o = o; window.__notificheDiSistema.push({ titolo, corpo: o?.body, tag: o?.tag }); } addEventListener() {} close() {} }
      Finta.permission = 'granted';
      Finta.requestPermission = async () => 'granted';
      window.Notification = Finta;
    });
  }
  const sessioni = elenco ?? [
    { sessionId: 'n-aperta', nome: 'Aperta da sola', taskId: 'workspace', modello: 'z-ai/glm-5.3-flash', conclusa: true, inAttesaApprovazione: false, interrotta: false, usage: null, avviataAlle: ISO(1_000) },
    { sessionId: 'n-altra', nome: 'Redesign sidebar', taskId: 'workspace', modello: 'z-ai/glm-5.3-flash', conclusa: false, inAttesaApprovazione: true, interrotta: false, usage: null, avviataAlle: ISO(3_600_000) },
  ];
  await page.route('**/api/v1/sessions*', async (route) => {
    if (new URL(route.request().url()).pathname !== '/api/v1/sessions') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: busta({ items: sessioni }) });
  });
  await page.route('**/api/v1/sessions/*/events*', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'retry: 600000\n\n' }));
  /* D-16: una riga chiede sempre al server se la conversazione c'è ancora; le sessioni qui sono finte, quindi c'è. Le prove che vogliono un 404 lo dicono */
  await page.route('**/api/v1/sessions/*/children', (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli: [] }) }));
  await page.route((url) => url.pathname === '/api/v1/notifications', (route) => {
    const dopo = Number(new URL(route.request().url()).searchParams.get('dopo') || 0);
    reg.letture.push(dopo);
    const dopoIlCursore = reg.voci.filter((v) => v.seq > dopo).sort((a, b) => a.seq - b.seq);
    return route.fulfill({ contentType: 'application/json', body: busta({ voci: dopoIlCursore.slice(0, 100), altre: dopoIlCursore.length > 100, ultimoSeq: reg.ultimoSeq(), totaleDaFare: reg.totaleDaFare() }) });
  });
  await page.route((url) => url.pathname === '/api/v1/notifications/seen', async (route) => {
    const { ids } = route.request().postDataJSON();
    reg.viste.push(ids);
    return route.fulfill({ contentType: 'application/json', body: busta({ cambiate: ids.length }) });
  });
  await page.route((url) => url.pathname === '/api/v1/notifications/seen-all', async (route) => {
    reg.tutte.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: busta({ cambiate: 0 }) });
  });
  /* il flusso globale: la foto all'apertura e, se la prova la passa, una voce; `retry` lungo così il flusso chiuso non si riapre di continuo */
  await page.route((url) => url.pathname === '/api/v1/remote/events', (route) => {
    const righe = [`retry: 600000\n`, `data: ${JSON.stringify({ type: 'talos.notifica', voce: null, ultimoSeq: reg.ultimoSeq(), totaleDaFare: reg.totaleDaFare() })}\n\n`];
    if (flusso) {
      const avviso = flusso();
      /* come il server vero: la voce dell'avviso è già nel registro (l'avviso parte dopo il disco), quindi anche la GET la vede */
      if (avviso.voce && !reg.voci.some((v) => v.id === avviso.voce.id)) reg.voci.push(avviso.voce);
      righe.push(`data: ${JSON.stringify(avviso)}\n\n`);
    }
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: righe.join('') });
  });
  await page.addInitScript((l) => {
    localStorage.setItem('talos.desktop.workspace.v2', JSON.stringify({ version: 2, density: 'comfortable', restoreWorkspace: true, lastSession: 'n-aperta', presets: {} }));
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { uiLanguage: l } }));
  }, lingua);
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  return reg;
}
const pannello = (page) => page.locator('#pannelloNotifiche');
const righe = (page) => pannello(page).locator('.talos-notifica__elenco .talos-list-row');
const scheda = (page, id) => pannello(page).locator(`[data-notifica-scheda="${id}"]`);

/* il flusso vero del browser, per mandargli un avviso quando la prova lo decide */
const conFlussi = (page) => page.addInitScript(() => {
  const Vero = window.EventSource;
  window.EventSource = class extends Vero { constructor(...a) { super(...a); (window.__flussi ??= []).push(this); } };
});
const avvisa = (page, avviso) => page.evaluate((a) => {
  for (const f of window.__flussi) if (f.url.includes('/api/v1/remote/events')) f.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(a) }));
}, { type: 'talos.notifica', ...avviso });
const idSessione = (page) => page.evaluate(() => window.__talosHarnessUiRuntime?.realSessionState?.id ?? null);
const riposo = (page, ms = 300) => page.evaluate((t) => new Promise((r) => { setTimeout(r, t); }), ms);
/* una risposta che parte quando la prova la libera */
function cancello() { let libera; const aperto = new Promise((r) => { libera = r; }); return { aperto, libera }; }
const SPARITA = (id) => (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ type: 'about:blank', title: 'Not found', status: 404, code: 'NOT_FOUND', detail: `Session ${id} not found` }) });
const VIVA = (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli: [] }) });
const portaDi = (id, nome = 'Redesign sidebar') => ({ cosa: { tipo: 'sessione', id, nome }, porta: { tipo: 'sessione', id } });
/* 04/11/2026, settima suite della candidata: B02o, B08, B11, B13 e B16 erano rossi anche da soli, 3 su 3. Non era il carico: dalla
   decisione 62 dell'owner (03/11, 02f42db39, `vociInOrdine` in `src/components/notifiche.js`) le «Finished» della STESSA chat diventano una
   riga sola, la più recente, e queste prove mettevano tutte le loro «fine» nella chat `n-altra` (350 voci = 1 riga). Quello che misurano
   (pagine, fuoco, cursore, salto di `seq`, scorrimento) vuole righe distinte: ogni «fine» sta nella sua chat. L'unione delle gemelle la
   prova NOTIF-PC-D23 in `tests/unit/notifiche-registro-pc.test.mjs`. */
const inChatSua = (seq, nome) => portaDi(`n-chat-${seq}`, nome ?? `Chat ${seq}`);

const TUTTE_LE_VOCI = [
  VOCE(1, 'fine', { cosa: { tipo: 'sessione', id: 'n-altra', nome: 'Redesign sidebar' } }),
  VOCE(2, 'approvazione', { azione: 'scrivi', dato: { genere: 'file', valore: 'src/selettore.js' } }),
  VOCE(3, 'domanda', { dato: { genere: 'testo', valore: 'Quale ramo uso?' } }),
  VOCE(4, 'azione-persona', { azione: 'consentito', dato: { genere: 'file', valore: 'src/a.js' }, stato: { visto: true, risolto: true } }),
  VOCE(5, 'giro-saltato', { cosa: { tipo: 'automazione', id: 'a1', nome: 'Report del mattino' }, porta: { tipo: 'automazione', id: 'a1' }, id: 'giro:a1:r1' }),
  VOCE(6, 'errore', { dato: { genere: 'codice-errore', valore: 'PROVIDER_RATE_LIMITED' } }),
  VOCE(7, 'interrotta'),
  VOCE(8, 'fatto-del-futuro', { dato: { genere: 'testo', valore: 'x' } }),
];

test('NOTIF-PC-B01 — the number is only what waits for you; «Da fare» lists exactly those, «Tutto» every fact with its sentence and no code', async ({ page }) => {
  await prepara(page, { voci: TUTTE_LE_VOCI });
  await expect(page.locator('#notificationsBadge')).toHaveText('2');
  await expect(page.locator('#notificationsBtn')).toHaveAttribute('aria-label', 'Notifiche: 2 cose aspettano te');
  await page.locator('#notificationsBtn').click();
  await expect(pannello(page)).toBeVisible();
  await expect(scheda(page, 'da-fare')).toHaveAttribute('aria-selected', 'true');
  await expect(scheda(page, 'da-fare')).toHaveText('Da fare 2');
  await expect(righe(page)).toHaveCount(2);
  await expect(righe(page).nth(0)).toContainText('Ha una domanda:');
  await expect(righe(page).nth(0)).toContainText('Quale ramo uso?');
  await expect(righe(page).nth(1)).toContainText('Vuole scrivere questo file:');
  await expect(righe(page).nth(1).locator('[data-notifica-dato="file"]')).toHaveText('src/selettore.js');
  await expect(pannello(page).locator('[data-azione="segna-tutte"]')).toHaveCount(0, { timeout: 1000 });

  await scheda(page, 'tutto').click();
  await expect(righe(page)).toHaveCount(TUTTE_LE_VOCI.length);
  const testo = (await pannello(page).innerText()).replace(/\s+/gu, ' ');
  for (const frase of ['Ha finito', 'Hai consentito: src/a.js', 'Report del mattino', 'Saltato', 'Da riprendere', 'Nuovo avviso']) expect(testo).toContain(frase);
  for (const codice of ['PROVIDER_RATE_LIMITED', 'fatto-del-futuro', 'giro-saltato', 'azione-persona', 'Invalid Date', '60 min', '24 h']) expect(testo).not.toContain(codice);
  await expect(pannello(page).locator('.talos-list-row--traccia')).toHaveCount(1);
  await expect(pannello(page).locator('[data-azione="segna-tutte"]')).toBeVisible();
  /* l'ora come nella barra di sinistra: oggi l'orario */
  await expect(righe(page).first().locator('.talos-list-row__aside')).toHaveText(/^\d{2}:\d{2}$/u);
});

test('NOTIF-PC-B02 — a tap sends ONE /seen and opens the session; seen is not resolved: the entry stays in «Da fare» and the number does not drop', async ({ page }) => {
  /* due voci: il tocco su una sola deve segnare vista SOLO quella (con una voce sola «tutte» e «quella» coincidono) */
  const reg = await prepara(page, { voci: [VOCE(1, 'fine'), VOCE(2, 'approvazione', { azione: 'shell', dato: { genere: 'comando', valore: 'npm install' } })] });
  await expect(page.locator('#notificationsBadge')).toHaveText('1');
  await page.locator('#notificationsBtn').click();
  await righe(page).first().click();
  await expect.poll(() => reg.viste).toEqual([['approvazione:s-2:k2']]);
  await expect(pannello(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe('n-altra');
  await expect(page.locator('#notificationsBadge')).toHaveText('1');
  await page.locator('#notificationsBtn').click();
  await expect(righe(page)).toHaveCount(1);
  await expect(righe(page).first()).not.toHaveAttribute('data-tono', 'accento');
});

/* Revisione dei blocchi 10-12, D-3: la voce di una sessione eliminata non apre una chat fantasma. Il controllo positivo: una sessione che non è
   nell'elenco ma esiste si apre lo stesso, quindi la prova non passa perché la riga non fa niente. */
test('NOTIF-PC-B02g — D-15: a finished run whose conversation is gone says so and opens no ghost chat', async ({ page }) => {
  const automazione = { cosa: { tipo: 'automazione', id: 'a1', nome: 'Backup serale' }, porta: { tipo: 'automazione', id: 'a1' } };
  await prepara(page, { voci: [VOCE(1, 'giro-finito', { id: 'giro:a1:r1', ...automazione })] });
  await page.route((url) => url.pathname === '/api/v1/automations/a1/runs', (route) => route.fulfill({ contentType: 'application/json', body: busta({ items: [{ runId: 'r1', automazioneId: 'a1', sessionId: 'sparita-1', esito: 'finita', letta: true }] }) }));
  await page.route((url) => url.pathname === '/api/v1/sessions/sparita-1/children', SPARITA('sparita-1'));
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  const prima = await idSessione(page);
  await righe(page).first().click();
  await expect(page.getByText('Questa conversazione non esiste più').first()).toBeVisible();
  await expect(page.locator('#regioneToast .talos-toast').filter({ hasText: 'Questa conversazione non esiste più' }).getByText('Questa conversazione non esiste più'), 'una frase sola: il badge non la ripete').toHaveCount(1)
  expect(await idSessione(page), 'nessuna chat fantasma').toBe(prima);
});

test('NOTIF-PC-B02h — D-16: a conversation deleted elsewhere while the list still shows it says so and opens no ghost chat', async ({ page }) => {
  await prepara(page, { voci: [VOCE(1, 'fine')] }); // `n-altra` è nell'elenco finto, e l'elenco si rilegge ogni 15 s
  await page.route((url) => url.pathname === '/api/v1/sessions/n-altra/children', SPARITA('n-altra'));
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  const prima = await idSessione(page);
  await righe(page).first().click();
  await expect(page.getByText('Questa conversazione non esiste più').first()).toBeVisible();
  expect(await idSessione(page), 'nessuna chat fantasma').toBe(prima);
});

test('NOTIF-PC-B02q — D-16 on the real answer of the server: a conversation it does not know is told as gone', async ({ page }) => {
  await prepara(page, { voci: [VOCE(1, 'fine', portaDi('n-mai-esistita'))] });
  await page.route((url) => url.pathname === '/api/v1/sessions/n-mai-esistita/children', (route) => route.continue()); // niente finto: risponde il server di prova
  const risposta = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/sessions/n-mai-esistita/children');
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  const prima = await idSessione(page);
  await righe(page).first().click();
  expect((await risposta).status(), 'il 404 vero').toBe(404);
  await expect(page.getByText('Questa conversazione non esiste più').first()).toBeVisible();
  expect(await idSessione(page), 'nessuna chat fantasma').toBe(prima);
});

test('NOTIF-PC-B02m — N10: only a 404 stops a row; with any other error the conversation opens as before', async ({ page }) => {
  await prepara(page, { voci: [VOCE(1, 'fine')] });
  await page.route((url) => url.pathname === '/api/v1/sessions/n-altra/children', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ title: 'x', status: 500 }) }));
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await righe(page).first().click();
  await expect.poll(() => idSessione(page)).toBe('n-altra');
  await expect(page.getByText('Questa conversazione non esiste più')).toHaveCount(0);
});

test('NOTIF-PC-B02i — D-24: a slow answer does not take you back from the chat you moved to', async ({ page }) => {
  const c = cancello();
  await prepara(page, { voci: [VOCE(1, 'fine')] });
  await page.route((url) => url.pathname === '/api/v1/sessions/n-altra/children', async (route) => { await c.aperto; return VIVA(route); });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await righe(page).first().click();
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('n-terza', 'workspace', 'Terza', 'z-ai/glm-5.3-flash', { conclusa: true }));
  await expect.poll(() => idSessione(page)).toBe('n-terza');
  c.libera();
  await riposo(page);
  expect(await idSessione(page), 'resta dove è andata').toBe('n-terza');
});

test('NOTIF-PC-B02j — D-24: of two rows tapped in a row the last one wins, whichever answers first', async ({ page }) => {
  const c = cancello();
  await prepara(page, { voci: [VOCE(1, 'fine', portaDi('n-veloce', 'Veloce')), VOCE(2, 'fine', portaDi('n-lenta', 'Lenta'))] });
  await page.route((url) => url.pathname === '/api/v1/sessions/n-lenta/children', async (route) => { await c.aperto; return VIVA(route); });
  const tocca = async (nome) => {
    await page.locator('#notificationsBtn').click();
    await scheda(page, 'tutto').click();
    await righe(page).filter({ hasText: nome }).click();
  };
  await tocca('Lenta');
  await tocca('Veloce');
  await expect.poll(() => idSessione(page)).toBe('n-veloce');
  c.libera();
  await riposo(page);
  expect(await idSessione(page)).toBe('n-veloce');
  /* lente tutte e due, e la prima toccata risponde per prima: non deve aprirsi lei, né togliere il posto all'ultima */
  const d = cancello();
  const e = cancello();
  await page.route((url) => url.pathname === '/api/v1/sessions/n-lenta/children', async (route) => { await d.aperto; return VIVA(route); });
  await page.route((url) => url.pathname === '/api/v1/sessions/n-veloce/children', async (route) => { await e.aperto; return VIVA(route); });
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('n-terza', 'workspace', 'Terza', 'z-ai/glm-5.3-flash', { conclusa: true }));
  await expect.poll(() => idSessione(page)).toBe('n-terza');
  await tocca('Lenta');
  await tocca('Veloce');
  d.libera();
  await riposo(page);
  expect(await idSessione(page), 'la prima riga non si apre più').toBe('n-terza');
  e.libera();
  await expect.poll(() => idSessione(page)).toBe('n-veloce');
});

test('NOTIF-PC-B02n — D-24: a slow run of an automation does not take you back either', async ({ page }) => {
  const c = cancello();
  const automazione = { cosa: { tipo: 'automazione', id: 'a1', nome: 'Backup serale' }, porta: { tipo: 'automazione', id: 'a1' } };
  await prepara(page, { voci: [VOCE(1, 'giro-finito', { id: 'giro:a1:r1', ...automazione })] });
  await page.route((url) => url.pathname === '/api/v1/automations/a1/runs', async (route) => { await c.aperto; return route.fulfill({ contentType: 'application/json', body: busta({ items: [{ runId: 'r1', automazioneId: 'a1', sessionId: 'n-altra', esito: 'finita', letta: true }] }) }); });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await righe(page).first().click();
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('n-terza', 'workspace', 'Terza', 'z-ai/glm-5.3-flash', { conclusa: true }));
  await expect.poll(() => idSessione(page)).toBe('n-terza');
  c.libera();
  await riposo(page);
  expect(await idSessione(page)).toBe('n-terza');
});

test('NOTIF-PC-B02b — a row of a deleted conversation says so and opens nothing; one missing from the list but alive still opens', async ({ page }) => {
  const porta = (id) => ({ cosa: { tipo: 'sessione', id, nome: 'Redesign sidebar' }, porta: { tipo: 'sessione', id } });
  await prepara(page, { voci: [VOCE(1, 'fine', { ...porta('n-viva') }), VOCE(2, 'fine', { ...porta('n-sparita') })] });
  await page.route((url) => url.pathname === '/api/v1/sessions/n-sparita/children', (route) => route.fulfill({ status: 404, contentType: 'application/json',
    body: JSON.stringify({ type: 'about:blank', title: 'Not found', status: 404, code: 'NOT_FOUND', detail: 'Session not found' }) }));
  await page.route((url) => url.pathname === '/api/v1/sessions/n-viva/children', (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli: [] }) }));
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  const prima = await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id);
  await righe(page).first().click();
  await expect(page.getByText('Questa conversazione non esiste più').first()).toBeVisible();
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id), 'nothing opened').toBe(prima);
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await righe(page).nth(1).click();
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe('n-viva');
});

/* Revisione dei blocchi 10-12, difetti minori del pannello */
test('NOTIF-PC-B02c — D-4: a turn already read still opens its conversation, read from the runs of the automation', async ({ page }) => {
  const voce = VOCE(1, 'giro-finito', { id: 'giro:a1:r1', cosa: { tipo: 'automazione', id: 'a1', nome: 'Report del mattino' }, porta: { tipo: 'automazione', id: 'a1' } });
  await prepara(page, { posta: [], voci: [voce] });
  await page.route((url) => url.pathname === '/api/v1/automations/a1/runs', (route) => route.fulfill({ contentType: 'application/json',
    body: busta({ items: [{ runId: 'r1', automazioneId: 'a1', sessionId: 'n-altra', esito: 'finita', letta: true }] }) }));
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await righe(page).first().click();
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe('n-altra');
});

test('NOTIF-PC-B02d — D-5: an entry arriving with the panel open leaves the focus where it was', async ({ page }) => {
  await page.addInitScript(() => {
    const Vero = window.EventSource;
    window.EventSource = class extends Vero { constructor(...a) { super(...a); (window.__flussi ??= []).push(this); } };
  });
  await prepara(page, { voci: [VOCE(1, 'domanda')] });
  await page.locator('#notificationsBtn').click();
  const chiudi = pannello(page).locator('#chiudiNotifiche, [aria-label="Chiudi notifiche"]').first();
  await chiudi.focus();
  await expect(chiudi).toBeFocused();
  const nuova = VOCE(2, 'domanda', { id: 'domanda:n-altra:r9' });
  await page.evaluate((v) => {
    for (const f of window.__flussi) if (f.url.includes('/api/v1/remote/events')) f.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'talos.notifica', voce: v, ultimoSeq: 2, totaleDaFare: 2 }) }));
  }, nuova);
  await expect(righe(page)).toHaveCount(2);
  await expect(chiudi).toBeFocused();
});

test('NOTIF-PC-B02e — D-6: «Mark all as seen» refused by the server says so and the button stays', async ({ page }) => {
  await prepara(page, { voci: [VOCE(1, 'fine')] });
  await page.route((url) => url.pathname === '/api/v1/notifications/seen-all', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ title: 'x', status: 500 }) }));
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await pannello(page).locator('[data-azione="segna-tutte"]').click();
  await expect(page.getByText('Non sono riuscito a segnarle come viste').first()).toBeVisible();
  await expect(pannello(page).locator('[data-azione="segna-tutte"]')).toBeVisible();
});

test('NOTIF-PC-B02f — D-9: closed with Esc, one click on the bell opens the panel again', async ({ page }) => {
  await prepara(page, { voci: [VOCE(1, 'fine')] });
  await page.locator('#notificationsBtn').click();
  await expect(pannello(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pannello(page)).toBeHidden();
  await page.locator('#notificationsBtn').click();
  await expect(pannello(page)).toBeVisible();
});

test('NOTIF-PC-B02k — D-19: a «Mark all» refused by the server does not bring back what was resolved meanwhile', async ({ page }) => {
  const c = cancello();
  await conFlussi(page);
  const voce = VOCE(1, 'approvazione', { id: 'approvazione:n-altra:r1', azione: 'shell', dato: { genere: 'comando', valore: 'npm test' } });
  await prepara(page, { voci: [voce, VOCE(2, 'fine')] });
  await page.route((url) => url.pathname === '/api/v1/notifications/seen-all', async (route) => { await c.aperto; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ title: 'x', status: 500 }) }); });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await pannello(page).locator('[data-azione="segna-tutte"]').click();
  await avvisa(page, { voce: { ...voce, seq: 3, stato: { visto: true, risolto: true } }, ultimoSeq: 3, totaleDaFare: 0 });
  await expect(page.locator('#notificationsBadge')).toBeHidden();
  c.libera();
  await expect(page.getByText('Non sono riuscito a segnarle come viste').first()).toBeVisible();
  await scheda(page, 'da-fare').click();
  await expect(pannello(page).locator('[data-notifica-vuoto]')).toBeVisible();
  await expect(scheda(page, 'da-fare')).toHaveText('Da fare');
});

test('NOTIF-PC-B02l — D-19: a run becomes read only once the server has agreed to «Mark all»', async ({ page }) => {
  const posta = [{ runId: 'r1', automazioneId: 'a1', nome: 'Report del mattino', esito: 'finita', partitaAlle: ISO(60_000), daGuardare: true, letta: false }];
  const voce = VOCE(1, 'giro-finito', { id: 'giro:a1:r1', cosa: { tipo: 'automazione', id: 'a1', nome: 'Report del mattino' }, porta: { tipo: 'automazione', id: 'a1' } });
  const reg = await prepara(page, { posta, voci: [voce] });
  const rifiuta = (url) => url.pathname === '/api/v1/notifications/seen-all';
  await page.route(rifiuta, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ title: 'x', status: 500 }) }));
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await pannello(page).locator('[data-azione="segna-tutte"]').click();
  await expect(page.getByText('Non sono riuscito a segnarle come viste').first()).toBeVisible();
  await riposo(page);
  expect(reg.letti, 'rifiutata: il giro non è letto').toEqual([]);
  await page.unroute(rifiuta);
  await pannello(page).locator('[data-azione="segna-tutte"]').click();
  await expect.poll(() => reg.letti, 'accettata: il giro è letto una volta').toEqual([{ id: 'a1', runId: 'r1' }]);
});

test('NOTIF-PC-B02o — D-18, N9: an entry arriving keeps the focus on the row, on «More», on «Show more» and on «Mark all»', async ({ page }) => {
  await conFlussi(page);
  const lungo = `${'parola '.repeat(60)}fine`;
  const voci = Array.from({ length: 60 }, (_, i) => VOCE(i + 1, 'fine', { id: `fine:s:${i + 1}`, ...inChatSua(i + 1) }));
  /* due righe lunghe: «Altro» è uno per riga, e la prova guarda quello della seconda */
  voci.push(VOCE(61, 'domanda', { id: 'domanda:n-altra:lunga', dato: { genere: 'testo', valore: lungo } }), VOCE(62, 'domanda', { id: 'domanda:n-altra:lunga-2', dato: { genere: 'testo', valore: lungo } }));
  await prepara(page, { voci });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await expect(righe(page)).toHaveCount(50);
  let seq = 62;
  const arrivaUnaVoce = async () => {
    seq += 1;
    const nome = `Nuova ${seq}`;
    await avvisa(page, { voce: VOCE(seq, 'fine', { id: `fine:nuova:${seq}`, ...inChatSua(seq, nome) }), ultimoSeq: seq, totaleDaFare: 1 });
    await expect(pannello(page)).toContainText(nome);
  };
  const obiettivi = [
    ['la riga', pannello(page).locator('[data-notifica-id="domanda:n-altra:lunga"]')],
    ['«Altro» della riga', pannello(page).locator('[data-notifica-id="domanda:n-altra:lunga"] + [data-azione="altro"]')],
    ['«Mostra altre»', pannello(page).locator('[data-azione="mostra-altre"]')],
    ['«Segna tutte»', pannello(page).locator('[data-azione="segna-tutte"]')],
    ['la linguetta', scheda(page, 'tutto')],
  ];
  for (const [nome, nodo] of obiettivi) {
    await nodo.focus();
    await expect(nodo, nome).toBeFocused();
    await arrivaUnaVoce();
    await expect(nodo, `${nome}: il fuoco resta`).toBeFocused();
  }
});

test('NOTIF-PC-B02p — D-25: when the focused row goes away the focus stays in the panel, on the tab', async ({ page }) => {
  await conFlussi(page);
  const prima = VOCE(1, 'domanda', { id: 'domanda:n-altra:r1' });
  const seconda = VOCE(2, 'domanda', { id: 'domanda:n-altra:r2' });
  await prepara(page, { voci: [prima, seconda] });
  await page.locator('#notificationsBtn').click();
  await expect(righe(page)).toHaveCount(2);
  const riga = pannello(page).locator('[data-notifica-id="domanda:n-altra:r1"]');
  await riga.focus();
  await expect(riga).toBeFocused();
  await avvisa(page, { voce: { ...prima, seq: 3, stato: { visto: true, risolto: true } }, ultimoSeq: 3, totaleDaFare: 1 });
  await expect(righe(page)).toHaveCount(1);
  await expect(scheda(page, 'da-fare')).toBeFocused();
});

test('NOTIF-PC-B11 — N2: a register longer than a page is read to the end in one go, and the newest is on top', async ({ page }) => {
  /* 350 e non 160: con due pagine sole la seconda lettura la faceva comunque l'avviso d'apertura del flusso, e un tetto a una pagina passava */
  const voci = Array.from({ length: 350 }, (_, i) => VOCE(i + 1, 'fine', { id: `fine:s:${i + 1}`, istante: ISO(1000 * (400 - i)), ...inChatSua(i + 1, `Voce ${i + 1}`) }));
  const reg = await prepara(page, { voci });
  await expect.poll(() => reg.letture.slice(0, 4), 'ogni pagina riparte da dove finisce quella prima').toEqual([0, 100, 200, 300]);
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await expect(righe(page).first()).toContainText('Voce 350');
  for (const mostrate of [100, 150, 200, 250, 300, 350]) {
    await pannello(page).locator('[data-azione="mostra-altre"]').click();
    await expect(righe(page)).toHaveCount(mostrate);
  }
  await expect(righe(page).last()).toContainText('Voce 1');
});

test('NOTIF-PC-B12 — N3: a cursor fallen out of the register (`ripartito`) starts the list again', async ({ page }) => {
  await prepara(page, { voci: [VOCE(1, 'fine', { id: 'fine:vecchia', ...portaDi('n-altra', 'Vecchia') })] });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await expect(righe(page)).toHaveCount(1);
  const nuova = VOCE(600, 'fine', { id: 'fine:nuova', ...portaDi('n-altra', 'Nuova') });
  await page.route((url) => url.pathname === '/api/v1/notifications', (route) => route.fulfill({ contentType: 'application/json', body: busta({ voci: [nuova], altre: false, ultimoSeq: 600, totaleDaFare: 0, ripartito: true }) }));
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  await expect(pannello(page)).toContainText('Nuova');
  await expect(pannello(page)).not.toContainText('Vecchia');
  await expect(righe(page)).toHaveCount(1);
});

test('NOTIF-PC-B13 — N4: a register behind the cursor (a new data folder) is read from the start, once', async ({ page }) => {
  const reg = await prepara(page, { voci: [VOCE(5, 'fine', { id: 'fine:vecchia', ...portaDi('n-altra', 'Vecchia') })] });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await expect(righe(page)).toHaveCount(1);
  await expect.poll(() => reg.letture.length).toBeGreaterThan(0);
  await riposo(page);
  reg.voci.splice(0, reg.voci.length, VOCE(1, 'fine', { id: 'fine:nuova-1', ...inChatSua(1, 'Nuova uno') }), VOCE(2, 'fine', { id: 'fine:nuova-2', ...inChatSua(2, 'Nuova due') }));
  reg.letture.length = 0;
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  await expect(righe(page)).toHaveCount(2);
  await expect(pannello(page)).toContainText('Nuova due');
  await expect(pannello(page)).not.toContainText('Vecchia');
  expect(reg.letture, 'il cursore vecchio, poi da capo').toEqual([5, 0]);
});

test('NOTIF-PC-B14 — N5: the same entry reaches the system notification once, however many times it arrives', async ({ page }) => {
  await conFlussi(page);
  const primaVoce = VOCE(1, 'domanda', { id: 'domanda:n-altra:r1' });
  await prepara(page, { notificheDiSistema: true, voci: [primaVoce] });
  await expect(page.locator('#notificationsBadge')).toHaveText('1');
  const etichette = () => page.evaluate(() => window.__notificheDiSistema.map((n) => n.tag));
  await expect.poll(etichette).toEqual([primaVoce.id]);
  const voce = VOCE(2, 'domanda', { id: 'domanda:n-altra:r2' });
  await avvisa(page, { voce, ultimoSeq: 2, totaleDaFare: 2 });
  await expect.poll(etichette).toEqual([primaVoce.id, voce.id]);
  await avvisa(page, { voce: { ...voce, seq: 3, stato: { visto: true, risolto: false } }, ultimoSeq: 3, totaleDaFare: 2 });
  /* controllo positivo: il filo è vivo, una voce nuova passa */
  const altra = VOCE(4, 'domanda', { id: 'domanda:n-altra:r4' });
  await avvisa(page, { voce: altra, ultimoSeq: 4, totaleDaFare: 3 });
  await expect.poll(etichette).toEqual([primaVoce.id, voce.id, altra.id]);
});

test('NOTIF-PC-B15 — N1: with the window in view the chat you are looking at stays silent, another one does not', async ({ page }) => {
  await conFlussi(page);
  await prepara(page, { notificheDiSistema: true, voci: [VOCE(1, 'domanda', { id: 'domanda:n-altra:r1' })] });
  await expect(page.locator('#notificationsBadge')).toHaveText('1');
  await page.locator('#sessionList .talos-session-item', { hasText: 'Redesign sidebar' }).click();
  await expect.poll(() => idSessione(page)).toBe('n-altra');
  const qui = VOCE(2, 'domanda', { id: 'domanda:n-altra:r2' });
  const altrove = VOCE(3, 'domanda', { id: 'domanda:n-aperta:r3', ...portaDi('n-aperta', 'Aperta da sola') });
  await avvisa(page, { voce: qui, ultimoSeq: 2, totaleDaFare: 2 });
  await avvisa(page, { voce: altrove, ultimoSeq: 3, totaleDaFare: 3 });
  await expect.poll(() => page.evaluate(() => window.__notificheDiSistema.map((n) => n.tag))).toEqual(['domanda:n-altra:r1', altrove.id]);
});

test('NOTIF-PC-B16 — N8: a jump in `seq` reads what went by without an alert', async ({ page }) => {
  await conFlussi(page);
  const reg = await prepara(page, { voci: [VOCE(1, 'fine', inChatSua(1))] });
  const lettura = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/notifications');
  await page.locator('#notificationsBtn').click();
  await lettura;
  await scheda(page, 'tutto').click();
  await expect(righe(page)).toHaveCount(1);
  await riposo(page);
  const persa = VOCE(2, 'fine', { id: 'fine:persa-2', ...inChatSua(2, 'Persa') });
  const salto = VOCE(3, 'fine', { id: 'fine:salto-3', ...inChatSua(3, 'Salto') });
  reg.voci.push(persa, salto);
  await avvisa(page, { voce: salto, ultimoSeq: 3, totaleDaFare: 0 });
  await expect(righe(page)).toHaveCount(3);
  await expect(pannello(page)).toContainText('Persa');
});

test('NOTIF-PC-B03 — «Mark all as seen» only in «All», with the boundary; «To do» is unchanged (English)', async ({ page }) => {
  const reg = await prepara(page, { lingua: 'en', voci: [VOCE(2, 'approvazione', { azione: 'scrivi', dato: { genere: 'file', valore: 'a.js' } }), VOCE(3, 'fine')] });
  await page.locator('#notificationsBtn').click();
  await expect(scheda(page, 'da-fare')).toHaveText('To do 1');
  await expect(pannello(page).locator('[data-azione="segna-tutte"]')).toHaveCount(0);
  await scheda(page, 'tutto').click();
  await pannello(page).locator('[data-azione="segna-tutte"]').click();
  await expect.poll(() => reg.tutte).toEqual([{ finoA: 3 }]);
  await scheda(page, 'da-fare').click();
  await expect(righe(page)).toHaveCount(1);
  await expect(righe(page).first()).toContainText('It wants to write this file:');
});

test('NOTIF-PC-B04 — empty «To do»: the sentence, its line and the last three things; an empty register has no «Latest»', async ({ page }) => {
  await prepara(page, { voci: [VOCE(1, 'fine'), VOCE(2, 'interrotta'), VOCE(3, 'fine'), VOCE(4, 'azione-persona', { azione: 'negato', dato: { genere: 'comando', valore: 'rm -rf build' }, stato: { visto: true, risolto: true } })] });
  await expect(page.locator('#notificationsBadge')).toBeHidden();
  await page.locator('#notificationsBtn').click();
  await expect(pannello(page).locator('[data-notifica-vuoto]')).toContainText('Niente da fare');
  await expect(pannello(page).locator('[data-notifica-vuoto]')).toContainText('Quando TALOS ha bisogno di te, lo trovi qui.');
  await expect(pannello(page)).toContainText('Ultime cose');
  await expect(righe(page)).toHaveCount(3);
  await expect(righe(page).first()).toContainText('Hai negato: rm -rf build');
});

test('NOTIF-PC-B05 AL CONTRARIO — an empty register: the sentence and no «Latest»; the consent footer stays the last thing after a redraw', async ({ page }) => {
  await prepara(page, { voci: [] });
  await page.locator('#notificationsBtn').click();
  await expect(pannello(page).locator('[data-notifica-vuoto]')).toBeVisible();
  await expect(pannello(page)).not.toContainText('Ultime cose');
  await scheda(page, 'tutto').click();
  await scheda(page, 'da-fare').click();
  const ultimo = await pannello(page).evaluate((p) => p.lastElementChild?.className);
  expect(ultimo).toContain('talos-notification-panel__sistema');
  await page.keyboard.press('Escape');
  await expect(pannello(page)).toBeHidden();
  await expect(page.locator('#notificationsBtn')).toBeFocused();
});

test('NOTIF-PC-B06 — a new entry from the stream updates the number; the arrows move between the tabs', async ({ page }) => {
  const nuova = VOCE(9, 'approvazione', { id: 'approvazione:n-altra:r9', azione: 'shell', dato: { genere: 'comando', valore: 'npm test' } });
  await prepara(page, { voci: [VOCE(1, 'fine')], flusso: () => ({ type: 'talos.notifica', voce: nuova, ultimoSeq: 9, totaleDaFare: 1 }) });
  await expect(page.locator('#notificationsBadge')).toHaveText('1');
  await page.locator('#notificationsBtn').click();
  await expect(righe(page)).toHaveCount(1);
  await expect(righe(page).first()).toContainText('npm test');
  await scheda(page, 'da-fare').focus();
  await page.keyboard.press('ArrowRight');
  await expect(scheda(page, 'tutto')).toBeFocused();
  await expect(scheda(page, 'tutto')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(scheda(page, 'da-fare')).toHaveAttribute('aria-selected', 'true');
});

test('NOTIF-PC-B07 — hostile data stays text; a long data has «More» and opens in the row', async ({ page }) => {
  const lungo = `${'parola '.repeat(60)}fine`;
  await prepara(page, { voci: [
    VOCE(1, 'domanda', { dato: { genere: 'testo', valore: '<img src=x onerror="window.__rotto=1">' } }),
    VOCE(2, 'domanda', { dato: { genere: 'testo', valore: lungo } }),
  ] });
  await page.locator('#notificationsBtn').click();
  await expect(righe(page)).toHaveCount(2);
  await expect(pannello(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rotto)).toBeUndefined();
  await expect(righe(page).nth(1)).toContainText('<img src=x');
  const altro = pannello(page).locator('[data-azione="altro"]');
  await expect(altro).toHaveCount(1);
  await altro.click();
  await expect(righe(page).nth(0)).toHaveAttribute('data-aperta', 'true');
  await expect(altro).toHaveCount(0);
});

test('NOTIF-PC-B08 (review 1) — a refresh with nothing new does not redraw: the row opened with «More» stays open and the list keeps its scroll', async ({ page }) => {
  const lungo = `${'parola '.repeat(60)}fine`;
  const voci = Array.from({ length: 14 }, (_, i) => VOCE(i + 1, 'fine', { id: `fine:s:${i + 1}`, ...inChatSua(i + 1) }));
  voci.push(VOCE(20, 'domanda', { dato: { genere: 'testo', valore: lungo } }));
  await prepara(page, { voci });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await pannello(page).locator('[data-azione="altro"]').click();
  const aperta = pannello(page).locator('.talos-list-row[data-aperta="true"]');
  await expect(aperta).toHaveCount(1);
  await pannello(page).locator('.talos-notifica__elenco').evaluate((e) => { e.scrollTop = 120; });
  const prima = await pannello(page).locator('.talos-notifica__elenco').evaluate((e) => e.scrollTop);
  expect(prima).toBeGreaterThan(0);
  /* un segno sul nodo: se il pannello si ridisegna, la riga è un nodo nuovo e il segno sparisce */
  await aperta.evaluate((n) => { n.__stessoNodo = true; });
  /* il giro dell'elenco sessioni legge il cursore: niente di nuovo */
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await expect(aperta).toHaveCount(1);
  expect(await aperta.evaluate((n) => n.__stessoNodo === true), 'nothing new: the panel was not redrawn').toBe(true);
  expect(await pannello(page).locator('.talos-notifica__elenco').evaluate((e) => e.scrollTop)).toBe(prima);
});

test('NOTIF-PC-B09 (review 2) — at the first reading a waiting permission reaches the system notification; an old finished turn does not', async ({ page }) => {
  await prepara(page, { notificheDiSistema: true, voci: [
    VOCE(1, 'fine', { id: 'fine:n-altra:giro-1' }),
    VOCE(2, 'approvazione', { id: 'approvazione:n-altra:r2', azione: 'shell', dato: { genere: 'comando', valore: 'npm install' } }),
  ] });
  await expect(page.locator('#notificationsBadge')).toHaveText('1');
  await expect.poll(() => page.evaluate(() => window.__notificheDiSistema.map((n) => n.tag))).toEqual(['approvazione:n-altra:r2']);
  const [n] = await page.evaluate(() => window.__notificheDiSistema);
  expect(n.titolo).toBe('Redesign sidebar');
  expect(n.corpo).toContain('npm install');
});

test('NOTIF-PC-B10 (review 8) — «Mark all as seen» also marks the automation turn read, and a tap on a turn writes «read» once', async ({ page }) => {
  const posta = [{ runId: 'r1', automazioneId: 'a1', nome: 'Report del mattino', esito: 'finita', partitaAlle: ISO(60_000), daGuardare: true, letta: false },
    { runId: 'r2', automazioneId: 'a2', nome: 'Backup serale', esito: 'fallita', partitaAlle: ISO(90_000), daGuardare: true, letta: false }];
  const giro = (seq, id, runId, nome) => VOCE(seq, 'giro-finito', { id: `giro:${id}:${runId}`, cosa: { tipo: 'automazione', id, nome }, porta: { tipo: 'automazione', id } });
  const reg = await prepara(page, { posta, voci: [giro(1, 'a1', 'r1', 'Report del mattino'), giro(2, 'a2', 'r2', 'Backup serale')] });
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await righe(page).filter({ hasText: 'Backup serale' }).click();
  await expect.poll(() => reg.letti).toEqual([{ id: 'a2', runId: 'r2' }]);
  await page.locator('#notificationsBtn').click();
  await scheda(page, 'tutto').click();
  await pannello(page).locator('[data-azione="segna-tutte"]').click();
  await expect.poll(() => reg.letti).toEqual([{ id: 'a2', runId: 'r2' }, { id: 'a1', runId: 'r1' }]);
});
