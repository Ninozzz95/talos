import { test, expect } from '@playwright/test';

/*
 * ⛔ Diagnosi delle sessioni lunghe bloccate (06/11/2026, `RAPPORTO-DIAGNOSI-SESSIONI-LUNGHE-2026-11-06.md`, righe 3-40) e pezzo P5 della
 *   ricognizione del giudice dell'11/11: durante la rigiocata della storia ogni evento di consenso, domanda o richiesta MCP rileggeva
 *   l'elenco delle sessioni (`aggiornaElencoSessioniReali`, un GET `/api/v1/sessions` e la barra laterale ridisegnata). Una chat lunga in
 *   «Chiedi» ha due eventi per consenso: centinaia di letture in fila sulle 6 connessioni HTTP/1.1 del browser, e la stella o un clic
 *   aspettavano in fondo (modello della fila: 31 ms senza letture davanti, 31,8 s con 2400).
 * ⛔ La prova del 06/11 (`rigiocata-consensi-elenco.spec.mjs` nel worktree `agente-sessioni-lunghe`) non è mai stata committata e il
 *   worktree non c'è più: RISCRITTA dal rapporto. Storia da 200 giri con 400 eventi di consenso (200 richieste e 200 risposte): dopo
 *   l'apertura i GET dell'elenco devono essere al più 4 (prima della cura circa 400).
 * In più: alla fine della storia parte UNA lettura (l'elenco resta giusto), un consenso DAL VIVO rilegge ancora l'elenco, e le letture
 *   chieste mentre una è in volo si uniscono (single-flight, come `caricaNotifiche`) con al più una lettura in coda.
 * Concorrenti: Hermes carica la storia dalla coda e sincronizza la stella in sottofondo (`apps/desktop/src/api/sessions.ts:517`,
 *   `store/session-pin-sync.ts:1-21`); Claude Code «timers, input and rendering keep running while the transcript loads» (`CHANGELOG.md:1546`).
 */
const ID = 'consensi-lunga';
const MODELLO = 'prova/modello-senza-catalogo';
const GIRI = 200;
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const giro = (n) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${n}`, input: { consegna: `Giro ${n}`, ...(n > 1 ? { seguito: true } : {}) } },
  { type: 'ToolCallStart', toolCallId: `c-${n}`, toolCallName: 'shell' },
  { type: 'ToolCallArgs', toolCallId: `c-${n}`, delta: JSON.stringify({ comando: `echo ${n}` }) },
  { type: 'ApprovalRequested', requestId: `q-${n}`, azione: { tipo: 'comando', comando: `echo ${n}`, toolCallId: `c-${n}` } },
  { type: 'ApprovalResolved', requestId: `q-${n}`, approvato: true },
  { type: 'ToolCallResult', messageId: `rc-${n}`, toolCallId: `c-${n}`, content: `${n}`, role: 'tool', isError: false, comando: `echo ${n}`, exitCode: 0 },
  { type: 'TextMessageStart', messageId: `a-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `a-${n}`, delta: `Fatto il giro ${n}.` },
  { type: 'TextMessageEnd', messageId: `a-${n}` },
  { type: 'RunFinished', threadId: 't', runId: `r-${n}`, outcome: { type: 'success' } },
];
const STORIA = Array.from({ length: GIRI }, (_, i) => giro(i + 1)).flat().map((e, i) => ({ ...e, _sequenza: i + 1 }));
/* Giro dei gialli (revisore dell'11/11, R8): la storia sopra ha solo consensi, e una guardia tolta su una domanda o su una richiesta MCP
   restava viva. Questa storia ha le altre quattro: domanda chiesta e risolta, richiesta MCP chiesta e risolta (forme da
   `harness-ui/src/agui-events.mjs:426-457`), una coppia per tipo a ogni giro. */
const ID_DOMANDE = 'domande-mcp-lunga';
const giroDomandeMcp = (n) => [
  { type: 'RunStarted', threadId: 't', runId: `d-${n}`, input: { consegna: `Giro ${n}`, ...(n > 1 ? { seguito: true } : {}) } },
  { type: 'UserQuestionRequested', requestId: `uq-${n}`, questions: [{ id: 'scelta', question: `Quale ${n}?`, options: [{ label: 'A', description: 'Prima' }, { label: 'B', description: 'Seconda' }] }] },
  { type: 'UserQuestionResolved', requestId: `uq-${n}`, status: 'answered', answers: { scelta: 'A' }, da: 'persona' },
  { type: 'McpElicitationRequested', requestId: `mcp-${n}`, server: 'github', mode: 'form', message: `Il titolo ${n}`, requestedSchema: { type: 'object', properties: { titolo: { type: 'string' } } } },
  { type: 'McpElicitationResolved', requestId: `mcp-${n}`, action: 'accept', da: 'persona' },
  { type: 'TextMessageStart', messageId: `da-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `da-${n}`, delta: `Fatto il giro ${n}.` },
  { type: 'TextMessageEnd', messageId: `da-${n}` },
  { type: 'RunFinished', threadId: 't', runId: `d-${n}`, outcome: { type: 'success' } },
];
const STORIA_DOMANDE = Array.from({ length: GIRI }, (_, i) => giroDomandeMcp(i + 1)).flat().map((e, i) => ({ ...e, _sequenza: i + 1 }));
const flusso = (eventi) => `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;

async function apri(page, { id = ID, storia = STORIA } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'light', uiLanguage: 'it' } }));
    /* ogni lettura dell'elenco annota se partiva DURANTE la storia: quella della fine della storia parte a rigiocata finita */
    window.__lettureElenco = [];
    const originale = window.fetch;
    window.fetch = function (risorsa, ...resto) {
      try {
        const url = new URL(typeof risorsa === 'string' ? risorsa : risorsa.url, location.href);
        if (url.pathname === '/api/v1/sessions' && (resto[0]?.method ?? 'GET').toUpperCase() === 'GET') {
          window.__lettureElenco.push({ inRigiocata: window.__talosHarnessUiRuntime?.realSessionState?.inRigiocata ?? null, id: window.__talosHarnessUiRuntime?.realSessionState?.id ?? null,
            pila: String(new Error('lettura').stack).split('\n').slice(2, 14).map((r) => r.trim().replace(/^at /u, '').replace(/ \(.*$/u, '')).join(' < ') });
        }
      } catch { /* una risorsa strana non è una lettura dell'elenco */ }
      return originale.call(this, risorsa, ...resto);
    };
  });
  const elenco = { get: 0, aperto: false };
  page.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/v1/sessions' && elenco.aperto) elenco.get += 1;
  });
  await page.route(`**/api/v1/sessions/${id}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: flusso(storia) }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  return elenco;
}

test('RIGIOCATA-CONSENSI-ELENCO — 200 giri con 400 eventi di consenso: dopo l apertura al più 4 letture dell elenco, una alla fine della storia, e dal vivo si rilegge ancora', async ({ page }) => {
  test.setTimeout(120_000);
  const elenco = await apri(page);
  await page.waitForLoadState('networkidle').catch(() => {});
  elenco.aperto = true;
  await page.evaluate(({ id, modello }) => { window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Chat lunga con consensi', modello, { conclusa: true, modello }); }, { id: ID, modello: MODELLO });
  await page.waitForFunction(({ id, n }) => {
    const rs = window.__talosHarnessUiRuntime.realSessionState;
    return rs.id === id && rs.inRigiocata === false && rs.sequenzeViste.size === n;
  }, { id: ID, n: STORIA.length }, { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  const dopoLaStoria = elenco.get;
  console.log(`[rigiocata-consensi-elenco] GET /api/v1/sessions dopo l apertura: ${dopoLaStoria} (eventi di consenso nella storia: ${STORIA.filter((e) => e.type.startsWith('Approval')).length})`);
  expect(dopoLaStoria, 'la storia non rilegge l elenco a ogni consenso').toBeLessThanOrEqual(4);
  expect(dopoLaStoria, 'alla fine della storia l elenco si rilegge (resta giusto)').toBeGreaterThanOrEqual(1);
  const letture = await page.evaluate((id) => window.__lettureElenco.filter((l) => l.id === id), ID);
  console.log(`[rigiocata-consensi-elenco] letture della chat: ${JSON.stringify(letture)}`);
  /* la lettura del CONFINE: parte a storia finita dentro `handleRealEvent` (il `talos.fine-rigiocata`). Ce n'è un'altra a storia
     finita, programmata 60 ms dopo da `programmaAggiornamentoElencoSessioniReali`, che da sola non prova il confine: senza la pila un
     mutante che toglieva la lettura del confine restava vivo (mutanti dell'11/11). */
  expect(letture.some((l) => l.inRigiocata === false && /aggiornaElencoSessioniReali < handleRealEvent/u.test(l.pila)), 'una lettura parte al confine della storia, dentro handleRealEvent').toBe(true);
  /* durante la storia partono solo le letture dell'apertura (misurate con la cura: 2, fra cui quella di `source.onopen`): un consenso
     rigiocato che rilegge si vede qui anche quando la lettura unica in volo (single-flight) tiene basso il totale */
  expect(letture.filter((l) => l.inRigiocata === true).length, 'durante la storia nessuna lettura oltre a quelle dell apertura').toBeLessThanOrEqual(2);

  // dal vivo un consenso rilegge ancora l'elenco: la guardia vale solo durante la storia
  const primaDalVivo = elenco.get;
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'q-vivo', azione: { tipo: 'comando', comando: 'echo vivo' }, _sequenza: 100_000 }, r.realSessionState.generation);
  });
  await expect.poll(() => elenco.get, { message: 'un consenso dal vivo rilegge l elenco' }).toBeGreaterThan(primaDalVivo);
});

test('RIGIOCATA-DOMANDE-MCP-ELENCO — 200 giri con 400 domande e 400 richieste MCP: le altre quattro guardie tengono l elenco fermo durante la storia', async ({ page }) => {
  test.setTimeout(120_000);
  const elenco = await apri(page, { id: ID_DOMANDE, storia: STORIA_DOMANDE });
  await page.waitForLoadState('networkidle').catch(() => {});
  elenco.aperto = true;
  await page.evaluate(({ id, modello }) => { window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Chat lunga con domande', modello, { conclusa: true, modello }); }, { id: ID_DOMANDE, modello: MODELLO });
  await page.waitForFunction(({ id, n }) => {
    const rs = window.__talosHarnessUiRuntime.realSessionState;
    return rs.id === id && rs.inRigiocata === false && rs.sequenzeViste.size === n;
  }, { id: ID_DOMANDE, n: STORIA_DOMANDE.length }, { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
  const letture = await page.evaluate((id) => window.__lettureElenco.filter((l) => l.id === id), ID_DOMANDE);
  const inStoria = letture.filter((l) => l.inRigiocata === true).length;
  console.log(`[rigiocata-domande-mcp] GET dopo l apertura: ${elenco.get}; letture durante la storia: ${inStoria}; dopo: ${letture.length - inStoria}`);
  expect(inStoria, 'domande e richieste MCP rigiocate non rileggono l elenco').toBeLessThanOrEqual(2);
  expect(elenco.get, 'la storia non rilegge l elenco a ogni domanda o richiesta MCP').toBeLessThanOrEqual(4);
  expect(letture.some((l) => l.inRigiocata === false && /aggiornaElencoSessioniReali < handleRealEvent/u.test(l.pila)), 'una lettura parte al confine della storia').toBe(true);
});

test('ELENCO-SINGLE-FLIGHT — dieci richieste dell elenco di fila: una lettura in volo e al più una in coda; chi aspetta ha l elenco dopo l ultima', async ({ page }) => {
  test.setTimeout(60_000);
  const elenco = await apri(page);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
  /* la risposta del server si fa aspettare: le dieci richieste arrivano tutte con la prima in volo */
  let rilascia;
  const cancello = new Promise((ok) => { rilascia = ok; });
  await page.route('**/api/v1/sessions', async (route) => { if (route.request().method() === 'GET') await cancello; return route.continue(); });
  elenco.aperto = true;
  const fatto = page.evaluate(() => Promise.all(Array.from({ length: 10 }, () => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali())).then(() => true));
  await expect.poll(() => elenco.get).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(300);
  rilascia();
  expect(await fatto).toBe(true);
  await page.waitForTimeout(300);
  console.log(`[elenco-single-flight] GET per dieci richieste: ${elenco.get}`);
  expect(elenco.get, 'una in volo, al più una in coda').toBeLessThanOrEqual(2);
  expect(elenco.get).toBeGreaterThanOrEqual(1);
});
