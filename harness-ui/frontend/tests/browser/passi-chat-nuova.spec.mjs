/*
 * Owner 04/11/2026 16:11: «gli steps di una chat vanno in una chat nuova». La chat A lavora con la sua lista dei Passi, la persona apre una
 * chat nuova: la lista di A restava sopra il compositore della chat nuova, e con la sua revisione scartava la lista della chat nuova.
 * Le liste sono costruite con `applicaPassi` del server e l'evento ha la forma di `session-registry.mjs` (`broadcast(voce, { type: 'CUSTOM',
 * name: EVENTO_PASSI, value: stato })`): niente inventato. Il flusso di A si rigioca come lo scrive `http-app.mjs` (`scriviEventoSse`) con il
 * confine di `iscrizione-sessione.mjs`.
 */
import { expect, test } from '@playwright/test';
import { applicaPassi, EVENTO_PASSI, statoPassiVuoto } from '../../../src/passi-del-giro.mjs';

const A = 'chat-a-al-lavoro';
const B = 'chat-b-nuova';
const MODELLO = 'chatgpt:gpt-prova';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };

/** Le liste di un giro, una revisione dopo l'altra, come le fa il server. */
function giroDiPassi(testi, quante, ora0 = Date.now() - 60_000) {
  let stato = statoPassiVuoto();
  const eventi = [];
  for (let passo = 0; passo < quante; passo += 1) {
    const voci = testi.map((testo, i) => ({ testo, stato: i < passo ? 'completed' : i === passo ? 'in_progress' : 'pending' }));
    ({ stato } = applicaPassi(stato, { voci }, ora0 + passo * 5_000));
    eventi.push({ type: 'CUSTOM', name: EVENTO_PASSI, value: stato });
  }
  return eventi;
}
const TESTI_A = ['Controllo stato Git e worktree esistenti', 'Creo un worktree separato da HEAD pulito', 'Verifico il nuovo worktree'];
const TESTI_B = ['Leggo il file della chat nuova', 'Rispondo nella chat nuova'];
const storiaDiA = () => [{ type: 'RunStarted', threadId: A, runId: 'ra' }, ...giroDiPassi(TESTI_A, 3)].map((e, i) => ({ ...e, _sequenza: i + 1 }));

/** `storie`: una per lettura (l'ultima si ripete), come le vede chi apre A la prima volta, la seconda... */
async function apriA(page, ...storie) {
  let letture = 0;
  const richieste = [];
  await page.route(`**/api/v1/sessions/${A}/events*`, (route) => {
    /* come il server (`http-app.mjs:10515`): con `?after=` si riprende dopo quella sequenza. Una chat pronta riprende così, senza rigiocare. */
    const dopo = Number(new URL(route.request().url()).searchParams.get('after') ?? 0);
    richieste.push(dopo);
    const storia = storie[Math.min(letture, storie.length - 1)].filter((e) => !(e._sequenza <= dopo));
    letture += 1;
    return route.fulfill({
      contentType: 'text/event-stream',
      body: `retry: 3600000\n${[...storia, CONFINE].map((e) => `${typeof e._sequenza === 'number' ? `id: ${e._sequenza}\n` : ''}data: ${JSON.stringify(e)}\n\n`).join('')}`,
    });
  });
  await page.route(`**/api/v1/sessions/${B}/events*`, () => { /* resta aperto */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await vaiSuA(page);
  return richieste;
}
async function vaiSuA(page, conclusa = false) {
  await page.evaluate(([id, modello, finita]) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'A al lavoro', modello, { conclusa: finita, modello });
  }, [A, MODELLO, conclusa]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
}
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);
const nuovaChat = (page) => page.evaluate((modello) => {
  window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaLibera: 'C:/progetto-di-prova', nomeCartella: 'progetto-di-prova', modello });
}, MODELLO);
const nomiDeiPassi = (page) => page.locator('.talos-chat-foot > .talos-passi .talos-tool-row__name').allTextContents();
async function foto(page, nome) {
  const cartella = process.env.TALOS_FOTO_PASSI;
  if (!cartella) return;
  for (const tema of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    await page.screenshot({ path: `${cartella}/${nome}-${tema === 'light' ? 'chiaro' : 'scuro'}.png` });
  }
}

test.use({ viewport: { width: 1920, height: 1080 } });

test('PASSI-NUOVA-01 la chat A lavora, si apre una chat nuova: nessun passo di A; tornando su A, tutti i suoi, una volta sola', async ({ page }) => {
  await apriA(page, storiaDiA());
  const passi = page.locator('.talos-chat-foot > .talos-passi');
  await expect(passi).toBeVisible();
  expect(await nomiDeiPassi(page)).toEqual(TESTI_A);

  await nuovaChat(page);
  await foto(page, 'chat-nuova-mentre-a-lavora');
  await expect(passi, 'la chat nuova non mostra i passi di A').toBeHidden();

  await vaiSuA(page);
  await expect(passi).toBeVisible();
  expect(await nomiDeiPassi(page), 'tutti i passi di A, una volta sola').toEqual(TESTI_A);
  await expect(page.locator('.talos-passi')).toHaveCount(1);
  await foto(page, 'ritorno-su-a');
});

test('PASSI-NUOVA-02 al contrario: la chat nuova che lavora mostra i SUOI passi, anche se la lista di A aveva una revisione più alta', async ({ page }) => {
  await apriA(page, storiaDiA());
  await nuovaChat(page);
  await manda(page, [{ type: 'RunStarted', threadId: B, runId: 'rb' }, ...giroDiPassi(TESTI_B, 1)]);
  const passi = page.locator('.talos-chat-foot > .talos-passi');
  await expect(passi).toBeVisible();
  expect(await nomiDeiPassi(page)).toEqual(TESTI_B);
  await expect(passi).toContainText(/0 (di|of) 2/u);
  await foto(page, 'chat-nuova-coi-suoi-passi');
});

test('PASSI-NUOVA-03 cliccare di nuovo la chat già aperta non toglie la sua lista', async ({ page }) => {
  await apriA(page, storiaDiA());
  await vaiSuA(page);
  await expect(page.locator('.talos-chat-foot > .talos-passi')).toBeVisible();
  expect(await nomiDeiPassi(page)).toEqual(TESTI_A);
});

test('PASSI-NUOVA-04 una chat finita tenuta pronta: tornandoci la sua lista c\'è ancora', async ({ page }) => {
  const storia = [...storiaDiA(), { type: 'RunFinished', threadId: A, runId: 'ra', outcome: { type: 'success' }, _sequenza: 5 }];
  /* l'elenco del server conosce A (come `b1-chat-pronte.spec`): senza, la potatura delle pronte la toglie e il ritorno rigioca tutto */
  await page.route((url) => url.pathname === '/api/v1/sessions', (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: { ok: true,
    data: { items: [{ sessionId: A, nome: 'A al lavoro', conclusa: true, interrotta: false, avviataAlle: '2026-11-04T15:00:00.000Z', modello: MODELLO }] }, meta: {} } })));
  const richieste = await apriA(page, storia);
  const passi = page.locator('.talos-chat-foot > .talos-passi');
  await expect(passi).toBeVisible();
  await nuovaChat(page);
  await expect(passi).toBeHidden();
  const esito = await page.evaluate(() => window.__talosHarnessUiRuntime.chatPronte?.()?.ultimoEsito ?? null);
  expect(esito?.esito, 'A è davvero tenuta pronta: si torna senza rigiocata').toBe('pronta');
  await vaiSuA(page, true);
  expect(richieste.at(-1), 'il ritorno riprende dopo l\'ultima sequenza vista: nessuna rigiocata ricostruisce la lista').toBe(5);
  await expect(passi).toBeVisible();
  expect(await nomiDeiPassi(page)).toEqual(TESTI_A);
});

test('PASSI-NUOVA-05 A finisce mentre si è nella chat nuova: la chat nuova resta pulita, e tornando su A la lista è quella finita, chiusa', async ({ page }) => {
  const viva = storiaDiA();
  const ultima = giroDiPassi(TESTI_A, 4).at(-1);
  const finita = [...viva, { ...ultima, _sequenza: 5 }, { type: 'RunFinished', threadId: A, runId: 'ra', outcome: { type: 'success' }, _sequenza: 6 }];
  await apriA(page, viva, finita);
  await nuovaChat(page);
  const esito = await page.evaluate(() => window.__talosHarnessUiRuntime.chatPronte?.()?.ultimoEsito ?? null);
  expect(esito?.esito, 'A lavorava: non si tiene pronta, al ritorno si rigioca').toBe('giro-vivo');
  const passi = page.locator('.talos-chat-foot > .talos-passi');
  await expect(passi).toBeHidden();
  await vaiSuA(page, true);
  await expect(passi).toBeVisible();
  expect(await nomiDeiPassi(page)).toEqual(TESTI_A);
  await expect(passi).toContainText(/3 (di|of) 3/u);
  await expect(passi.locator('.talos-activity__head')).toHaveAttribute('aria-expanded', 'false');
});

/*
 * Revisione del blocco chat 04/11 (P1): durante `disegnaStoriaEreditata` gli eventi ESPORTATI del padre passano per `handleRealEvent` con la
 * stessa generazione e con `state.realSession.id` già uguale al ramo. Con quella chiave la lista del padre (revisione 3) diventava la lista
 * del ramo, e la revisione 1 del ramo (il server conta per sessione: `passiDaEventi(voce.eventi)`) si scartava. La chiave giusta è la
 * sessione da cui viene l'evento, come Hermes (`use-message-stream/index.ts:595-597`, `setSessionTodos(sessionId, ...)`).
 */
test('PASSI-NUOVA-06 un ramo (Riprova / Modifica e rimanda) mostra i SUOI passi, anche se il padre aveva una revisione più alta', async ({ page }) => {
  const PADRE = 'padre-coi-passi';
  const RAMO = 'ramo-del-padre';
  const TESTI_PADRE = ['Passo del padre uno', 'Passo del padre due', 'Passo del padre tre'];
  const TESTI_RAMO = ['Passo del ramo uno', 'Passo del ramo due'];
  const conSequenza = (eventi) => eventi.map((e, i) => ({ ...e, _sequenza: i + 1 }));
  const flusso = (storia) => `retry: 3600000\n${[...storia, CONFINE].map((e) => `${typeof e._sequenza === 'number' ? `id: ${e._sequenza}\n` : ''}data: ${JSON.stringify(e)}\n\n`).join('')}`;
  const ok = (route, data) => route.fulfill({ json: { ok: true, data, meta: {} } });
  const storiaPadre = conSequenza([{ type: 'RunStarted', threadId: PADRE, runId: 'rp1' }, ...giroDiPassi(TESTI_PADRE, 3),
    { type: 'RunFinished', threadId: PADRE, runId: 'rp1', outcome: { type: 'success' } }, { type: 'RunStarted', threadId: PADRE, runId: 'rp2' },
    { type: 'RunFinished', threadId: PADRE, runId: 'rp2', outcome: { type: 'success' } }]);
  /* il ramo nasce senza eventi suoi; il suo primo giro scrive la SUA lista, a revisione 1 */
  const storiaRamo = conSequenza([{ type: 'RunStarted', threadId: RAMO, runId: 'rr1' }, ...giroDiPassi(TESTI_RAMO, 1)]);
  const righe = [
    { sessionId: PADRE, taskId: PADRE, nome: 'Padre', conclusa: true, modello: MODELLO, avviataAlle: '2026-11-04T10:00:00Z' },
    { sessionId: RAMO, taskId: RAMO, nome: 'Padre (ramo)', conclusa: false, modello: MODELLO, avviataAlle: '2026-11-04T10:05:00Z', forkDa: PADRE, forkPrimaDelGiro: 'rp2' },
  ];
  await page.route((url) => url.pathname === '/api/v1/sessions', (route) => (route.request().method() === 'GET' ? ok(route, { items: righe }) : route.fallback()));
  await page.route(`**/api/v1/sessions/${PADRE}/export`, (route) => ok(route, { sessionId: PADRE, eventi: storiaPadre }));
  await page.route(`**/api/v1/sessions/${PADRE}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: flusso(storiaPadre) }));
  await page.route(`**/api/v1/sessions/${RAMO}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: flusso(storiaRamo) }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali?.());
  await page.evaluate(([id, modello]) => window.__talosHarnessUiRuntime.passaASessione(id, id, id, modello, { conclusa: false, modello }), [RAMO, MODELLO]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  const passi = page.locator('.talos-chat-foot > .talos-passi');
  await expect(passi).toBeVisible();
  await expect.poll(() => nomiDeiPassi(page), { message: 'il ramo lavora con la sua lista: deve vedere la sua, non quella del padre' }).toEqual(TESTI_RAMO);
  await expect(page.locator('.talos-passi')).toHaveCount(1);
  await foto(page, 'ramo-coi-suoi-passi');
});
