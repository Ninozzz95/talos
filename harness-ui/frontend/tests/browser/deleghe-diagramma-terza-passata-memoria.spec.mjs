/*
 * TERZA PASSATA DEL REVISORE (14/10/2026) — attacchi alla MEMORIA ALLA RICARICA del diagramma delle deleghe (`d540de080`).
 * Punto 3 del brief: memoria corrotta, enorme, di un altro tipo; una richiesta nuova fra la scelta e la ricarica; il filtro
 * ricordato quando l'ambito «cartella» non c'è più; due diagrammi (Workflow e deleghe) della stessa conversazione; la
 * riproduzione aperta al momento della ricarica; il Workflow che scrive solo la vista.
 * «[REGGE]» = attaccato, ha retto. Senza etichetta = ROSSA: un difetto, con la cura proposta nel rapporto
 * (`handoff …/bugfixer/RAPPORTO-TERZA-PASSATA-2026-10-14.md`). Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { CONFINE } from './aiuto-confine.mjs';
import { apri, at, figlia, finita, RADICE, ricarica, T0 } from './aiuto-deleghe-diagramma.mjs';
import { apriRailDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

const CHIAVE = `talos.grafo-workflow.v1:${RADICE}:deleghe`;
const scena = () => [
  figlia('a', 10, { taskCorto: 'Correggi i prezzi' }),
  finita('b', 11, 70, { taskCorto: 'Leggi il CSV' }),
  finita('c', 12, 80, { taskCorto: 'Controlla le valute', esitoDelega: 'fallito' }),
  figlia('d', 13, { taskCorto: 'Riscrivi le prove' }),
];
const filtro = (grafo) => grafo.locator('[data-filtro-stato]');
const scegliStato = async (grafo, id) => { await filtro(grafo).locator('> button').click(); await filtro(grafo).locator(`[data-stato-id="${id}"]`).click(); };
const lente = (grafo) => grafo.getByRole('button', { name: 'Cerca nel diagramma' });
const campo = (grafo) => grafo.getByRole('searchbox', { name: 'Cerca fra agenti e lotti del diagramma' });
const nomeNelDettaglio = (grafo) => grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa');
const memoria = (page) => page.evaluate((k) => { try { return JSON.parse(sessionStorage.getItem(k) ?? 'null'); } catch { return 'NON-JSON'; } }, CHIAVE);
const GUASTO = { status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Banco temporaneamente offline' } }) };

test('TERZA-MEMORIA-01 — dal pannello «Apri questo agente nel diagramma» con un filtro per stato RICORDATO che lo nasconde: il diagramma si apre SU DI LUI (chi arriva su un agente preciso ha già scelto), mai senza la sua scheda e con un dettaglio che porta l’id tecnico', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, scena());
  await scegliStato(grafo, 'failed');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1); // la premessa: il filtro c'è, resta solo «c»
  await expect.poll(async () => (await memoria(page))?.filtro, { message: 'la premessa: il filtro è nella memoria della scheda' }).toBe('failed');
  // la persona torna alla chat (il diagramma si chiude, la memoria resta) e dal pannello apre nel diagramma un agente AL LAVORO
  await grafo.locator('.talos-wfg__torna').click();
  await expect(grafo).toHaveCount(0);
  await page.locator('#railAgenti [data-sessione-figlia="a"]').click();
  /* pannello v2 (29/10/2026): il clic sulla riga apre il dettaglio NELLA riga; «Apri questo agente nel diagramma» è il suo «Mostra nel diagramma» (stessa azione: apriDiagramma({ figlia, tipo: 'deleghe' })) */
  await page.locator('#railAgenti [data-sessione-figlia="a"]').getByRole('button', { name: 'Mostra nel diagramma' }).click();
  const dopo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(dopo).toBeVisible();
  await expect(nomeNelDettaglio(dopo), 'un dettaglio si è aperto').toBeVisible();
  await page.waitForTimeout(800); // la prima lettura, la ripresa della memoria e la scelta sono finite
  const visto = { scheda: await dopo.locator('[data-sessione="a"]').count(), dettaglio: (await nomeNelDettaglio(dopo).innerText()).replace(/\s+/gu, ' ').trim(),
    filtro: await filtro(dopo).locator('> button').innerText() };
  expect(visto.dettaglio, `il dettaglio non porta un id tecnico: ${JSON.stringify(visto)}`).not.toMatch(/\bs-a\b/u);
  expect(visto.scheda, `l’agente chiesto è nel diagramma: ${JSON.stringify(visto)}`).toBe(1);
  await expect(dopo.locator('[data-sessione="a"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(nomeNelDettaglio(dopo)).toContainText('Correggi i prezzi');
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

/* la riga di una figlia come la dà `GET /api/v1/sessions` (`session-registry.mjs`, `elenca()`: i figli ci sono, col loro
   `padreId`, `conclusa`, `ultimoEsito`): è da lì che il diagramma li conosce quando `…/children` non risponde */
const comeNellElenco = (a) => ({ sessionId: a.sessionId, taskId: 'workspace', nome: a.taskCorto, taskDelega: a.taskCorto, modello: a.modello, avviataAlle: a.avviataAlle,
  conclusa: a.conclusa === true, interrotta: false, padreId: RADICE, profonditaDelega: 1, ultimoEsito: a.conclusa ? (a.esitoDelega === 'fallito' ? 'errore' : 'concluso') : null });

test('TERZA-MEMORIA-02 [REGGE] — alla ricarica la PRIMA lettura di `…/children` fallisce (503), ma l’elenco delle sessioni porta i figli come fa il server vero: filtro e agente scelto si riprendono lo stesso, la memoria non si cancella, e quando la lettura torna niente cambia', async ({ page }) => {
  let rotto = false; const figli = scena();
  const { grafo } = await apri(page, () => figli, { altre: figli.map(comeNellElenco) });
  await scegliStato(grafo, 'working');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await grafo.locator('[data-sessione="d"]').click();
  await expect(nomeNelDettaglio(grafo)).toContainText('Riscrivi le prove');
  await expect.poll(async () => await memoria(page), { message: 'la premessa: filtro e agente scelto sono nella memoria' }).toMatchObject({ filtro: 'working', scelto: 'd' });
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => (rotto ? r.fulfill(GUASTO) : r.fulfill({ json: { ok: true, data: { figli } } })));
  rotto = true;
  const dopo = await ricarica(page);
  await expect(dopo, 'il prodotto riapre il diagramma anche se la lettura è fallita').toBeVisible();
  await expect(dopo.locator('.talos-wfg__avviso')).toContainText('Dati non aggiornati'); // la premessa: si sta guardando una lettura fallita
  await expect(dopo.locator('[data-sessione]')).toHaveCount(2);
  await expect(filtro(dopo).locator('> button')).toHaveAttribute('aria-pressed', 'true');
  await expect(dopo.locator('[data-sessione="d"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await memoria(page)).toMatchObject({ filtro: 'working', scelto: 'd' });
  rotto = false;
  await expect(dopo.locator('.talos-wfg__avviso')).toBeHidden({ timeout: 9000 }); // la lettura è tornata
  await expect(dopo.locator('[data-sessione]')).toHaveCount(2);
  await expect(dopo.locator('[data-sessione="d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(dopo).not.toContainText('non è più fra gli agenti mostrati');
  expect(await memoria(page)).toMatchObject({ filtro: 'working', scelto: 'd' });
});

/* la memoria della scheda è di chi la scrive: una versione più vecchia dell'app, un'estensione, una voce tagliata a metà */
const CORROTTE = [
  ['non è JSON', '{"vista":"dipendenze","filtro":"work'],
  ['un numero', '5'],
  ['una stringa', '"working"'],
  ['un elenco', '["cartella","failed","prove","d"]'],
  ['null', 'null'],
  ['ogni campo di un altro tipo', JSON.stringify({ vista: { a: 1 }, ambito: ['cartella'], filtro: { stato: 'failed' }, cerca: 42, scelto: { sessionId: 'd' } })],
  ['nomi che esistono su ogni oggetto', JSON.stringify({ vista: 'constructor', ambito: 'hasOwnProperty', filtro: '__proto__', scelto: 'toString' })],
  ['uno stato che non esiste', JSON.stringify({ filtro: 'esploso', scelto: 'non-esiste', ambito: 'cartella' })],
  ['enorme (oltre il tetto di lettura)', JSON.stringify({ filtro: 'failed', cerca: 'x'.repeat(5000), scelto: 'd' })],
  ['la conversazione stessa come agente scelto', JSON.stringify({ scelto: RADICE })],
];
for (const [nome, valore] of CORROTTE) {
  test(`TERZA-MEMORIA-03 [REGGE] — memoria ${nome}: il diagramma si apre lo stesso con tutti gli agenti, senza filtro, senza ricerca, senza errori, e sceglie come a ogni apertura`, async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    await page.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('terza.messa')) { sessionStorage.setItem(k, v); sessionStorage.setItem('terza.messa', '1'); } } catch { /* */ } }, [CHIAVE, valore]);
    const { grafo, scritture } = await apri(page, scena());
    await expect(grafo.locator('[data-sessione]')).toHaveCount(4);
    await expect(filtro(grafo).locator('> button')).toHaveAttribute('aria-pressed', 'false');
    await expect(grafo.locator('[data-mostrati]')).toBeHidden();
    await expect(campo(grafo)).toBeHidden();
    await expect(grafo.locator('[data-spento="true"]')).toHaveCount(0);
    await expect(grafo.locator('[data-ambito] [data-ambito-id="sessione"]')).toHaveAttribute('aria-checked', 'true');
    await expect(grafo.locator('[data-sessione][aria-pressed="true"]')).toHaveCount(1); // chi lavora, come a ogni apertura
    await expect(grafo).toHaveAttribute('data-vista', 'dipendenze');
    // e la voce viene riscritta sana: un oggetto con le sole scelte di adesso
    const voce = await memoria(page);
    expect(voce, JSON.stringify(voce)).toMatchObject({ vista: 'dipendenze' });
    expect(Object.keys(voce).sort().join(), JSON.stringify(voce)).toBe('vista');
    expect(scritture).toEqual([]);
    expect(errori).toEqual([]);
  });
}

test('TERZA-MEMORIA-04 — una ricerca ricordata fatta di soli spazi (che il campo, scrivendo, non lascerebbe mai) non spegne tutto il diagramma: si scarta come gli altri valori rimasti indietro', async ({ page }) => {
  await page.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('terza.messa')) { sessionStorage.setItem(k, v); sessionStorage.setItem('terza.messa', '1'); } } catch { /* */ } }, [CHIAVE, JSON.stringify({ vista: 'dipendenze', cerca: '   ' })]);
  const { grafo } = await apri(page, scena());
  await expect(grafo.locator('[data-sessione]')).toHaveCount(4);
  await page.waitForTimeout(500);
  const visto = { spenti: await grafo.locator('[data-sessione][data-spento="true"]').count(), lente: await lente(grafo).getAttribute('aria-expanded'), esito: (await grafo.locator('.talos-wfg__esito-cerca').innerText()).trim() };
  expect(visto, JSON.stringify(visto)).toEqual({ spenti: 0, lente: 'false', esito: '' });
});

/* Due richieste: la prima ha un agente fallito («c»), la seconda no. La persona guarda la richiesta PASSATA col filtro «Da
   guardare» e sceglie «c». Alla ricarica contano due arrivi: `…/children` (un JSON piccolo) e la STORIA della conversazione (il
   flusso degli eventi, coi due giri nella forma vera del giornale: `RunStarted` senza ora, poi l'avvio del primo attrezzo con
   `avviatoA`, in fondo il confine). Il prodotto riapre il diagramma appena i figli sono letti (`leggiFigliSessione`), anche a
   storia non ancora rigiocata: quale dei due arriva prima decide che cosa si vede. */
async function ricaricaConDueRichieste(page, { storiaDopoMs, figliDopoMs }) {
  const figli = [finita('a', 10, 70, { taskCorto: 'Agente A' }), finita('c', 12, 80, { taskCorto: 'Agente C', esitoDelega: 'fallito' }), figlia('e', 300, { taskCorto: 'Agente E' }), finita('f', 301, 400, { taskCorto: 'Agente F' })];
  const { grafo } = await apri(page, figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }, { testo: 'Seconda richiesta', at: at(200) }] });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2); // di serie l'ultima richiesta: e, f
  await grafo.locator('[data-richieste] > button').click();
  await grafo.locator('[data-richieste] [role="menuitemradio"]').filter({ hasText: 'Prima richiesta' }).click();
  await expect(grafo.locator('[data-sessione="c"]')).toBeVisible();
  await scegliStato(grafo, 'failed');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await grafo.locator('[data-sessione="c"]').click();
  await expect.poll(async () => await memoria(page), { message: 'la premessa: filtro e agente scelto sono nella memoria' }).toMatchObject({ filtro: 'failed', scelto: 'c' });
  const storia = [{ testo: 'Prima richiesta', avviatoA: T0 + 5_000 }, { testo: 'Seconda richiesta', avviatoA: T0 + 200_000 }].flatMap((x, i) => [
    { type: 'RunStarted', _sequenza: 60001 + i * 3, input: { consegna: x.testo }, contesto: { modello: 'z-ai/glm-5.3-flash' } },
    { type: 'ToolCallStart', _sequenza: 60002 + i * 3, toolCallId: `terza-richiesta-${i}`, toolCallName: 'delega', avviatoA: x.avviatoA },
    { type: 'ToolCallResult', _sequenza: 60003 + i * 3, toolCallId: `terza-richiesta-${i}`, content: 'ok' }]);
  const dopoUnPo = (ms) => new Promise((fatto) => setTimeout(fatto, ms));
  await page.route(`**/api/v1/sessions/${RADICE}/events*`, async (route) => {
    await dopoUnPo(storiaDopoMs);
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 3600000\n${[...storia, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
  });
  await page.route(`**/api/v1/sessions/${RADICE}/children`, async (route) => { await dopoUnPo(figliDopoMs); await route.fulfill({ json: { ok: true, data: { figli } } }); });
  const dopo = await ricarica(page); // torna quando il confine è arrivato: la storia è stata rigiocata tutta
  await expect(dopo).toBeVisible({ timeout: 8000 });
  await expect(dopo.locator('[data-richieste]'), 'le due richieste sono note: c’è il loro selettore').toBeVisible({ timeout: 6000 });
  await page.waitForTimeout(1500); // la rilettura che segue l'ultimo arrivo è finita
  return { dopo, visto: { schede: await dopo.locator('[data-sessione]').count(), filtro: (await filtro(dopo).locator('> button').innerText()).trim(), tolta: await dopo.getByText('non è più fra gli agenti mostrati').count(), memoria: await memoria(page) } };
}

test('TERZA-MEMORIA-05 — ricarica di una conversazione con due richieste, la storia arriva DOPO i figli (conversazione lunga): il filtro ricordato non resta acceso su una richiesta che non ha nessuno in quello stato — diagramma vuoto — e niente viene annunciato come «tolto»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { visto } = await ricaricaConDueRichieste(page, { storiaDopoMs: 1200, figliDopoMs: 0 });
  expect(visto.schede, `la richiesta mostrata (l’ultima) ha due agenti e si vedono: ${JSON.stringify(visto)}`).toBe(2);
  expect(visto.tolta, `nessuna riga «la selezione è stata tolta» dopo una ricarica: ${JSON.stringify(visto)}`).toBe(0);
  expect(errori).toEqual([]);
});

test('TERZA-MEMORIA-05b [REGGE] — AL CONTRARIO, la stessa ricarica con la storia arrivata PRIMA dei figli: il filtro rimasto indietro cade in silenzio, si vedono i due agenti dell’ultima richiesta, nessuna riga «tolta»', async ({ page }) => {
  const { visto } = await ricaricaConDueRichieste(page, { storiaDopoMs: 0, figliDopoMs: 1200 });
  expect(visto, JSON.stringify(visto)).toMatchObject({ schede: 2, tolta: 0, filtro: 'Tutti gli stati' });
  expect(visto.memoria.filtro, JSON.stringify(visto)).toBeUndefined();
});

test('TERZA-MEMORIA-06 [REGGE] — l’ambito «Cartella» ricordato quando la cartella non si sa più, e il filtro che valeva solo lì: si torna a «Questa conversazione», il filtro senza agenti cade, e la memoria non li ritenta', async ({ page }) => {
  const cartella = 'C:/progetti/listini';
  // l'unico «da guardare» è un'altra conversazione della stessa cartella
  const altre = [{ sessionId: 'altra-1', taskId: 'workspace', nome: 'Rivedi il README', modello: 'z-ai/glm-5.3-flash', conclusa: true, ultimoEsito: 'errore', avviataAlle: at(2), cartella }];
  const figli = [figlia('a', 10, { taskCorto: 'Agente A' }), finita('b', 11, 70, { taskCorto: 'Agente B' })];
  const { grafo } = await apri(page, figli, { cartella, altre });
  await grafo.locator('[data-ambito] [data-ambito-id="cartella"]').click();
  await expect(grafo.locator('[data-sessione="altra-1"]')).toBeVisible();
  await scegliStato(grafo, 'failed');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await expect.poll(async () => await memoria(page)).toMatchObject({ ambito: 'cartella', filtro: 'failed' });
  // alla ricarica la conversazione non dichiara più la sua cartella (la riga della sessione arriva senza)
  await page.route((u) => u.pathname === '/api/v1/sessions', (r) => r.fulfill({ json: { ok: true, data: { items: [{ sessionId: RADICE, taskId: 'workspace', nome: 'Sistema i listini', modello: 'z-ai/glm-5.3-flash', conclusa: false, avviataAlle: at(0) }] } } }));
  const dopo = await ricarica(page);
  await expect(dopo.locator('[data-sessione]')).toHaveCount(2);
  await expect(dopo.locator('[data-ambito] [data-ambito-id="sessione"]')).toHaveAttribute('aria-checked', 'true');
  await expect(dopo.locator('[data-ambito] [data-ambito-id="cartella"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(filtro(dopo).locator('> button')).toHaveAttribute('aria-pressed', 'false');
  await expect(dopo.locator('[data-mostrati]')).toBeHidden();
  await expect(dopo).not.toContainText('non è più fra gli agenti mostrati');
  const voce = await memoria(page);
  expect(voce.ambito, JSON.stringify(voce)).toBeUndefined();
  expect(voce.filtro, JSON.stringify(voce)).toBeUndefined();
});

test('TERZA-MEMORIA-07 [REGGE] — Workflow e deleghe della STESSA conversazione hanno due voci di memoria: passare dal Workflow (che cambia vista e scrive la sua) non porta via filtro e ricerca delle deleghe, né prima né dopo una ricarica; e il Workflow continua a scrivere SOLO la vista', async ({ page }) => {
  const S = 'wf-terza-miste';
  const scenaWf = costruisciScena(3, { sessionId: S });
  await instradaScena(page, scenaWf);
  const json = (data) => ({ contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.api.v1' } }) });
  const f = (id, extra) => ({ sessionId: id, parentId: S, padreId: S, task: `Compito di ${id}`, taskCorto: `Compito ${id}`, modello: 'z-ai/glm-5.3-flash', conclusa: false, interrotta: false, avviataAlle: at(10), attivita: { file: [], chiamate: 0, passi: [] }, ...extra });
  await page.route((u) => u.pathname === '/api/v1/sessions', (r) => r.fulfill(json({ items: [{ sessionId: S, taskId: 'workspace', nome: 'Workflow e deleghe', modello: 'z-ai/glm-5.3-flash', conclusa: false }] })));
  await page.route(`**/api/v1/sessions/${S}/children`, (r) => r.fulfill(json({ figli: [f('m1', { taskCorto: 'Leggi il registro' }), f('m2', { taskCorto: 'Scrivi le prove' }), f('m3', { taskCorto: 'Impagina', conclusa: true, conclusaAlle: at(90), esitoDelega: 'concluso' })] })));
  const rail = await apriRailDellaScena(page, scenaWf);
  await rail.getByRole('tab', { name: 'Deleghe' }).click();
  await rail.locator('[data-sessione-figlia="m1"]').click();
  /* pannello v2 (29/10/2026): il clic sulla riga apre il dettaglio NELLA riga; «Apri questo agente nel diagramma» è il suo «Mostra nel diagramma» (stessa azione: apriDiagramma({ figlia, tipo: 'deleghe' })) */
  await rail.locator('[data-sessione-figlia="m1"]').getByRole('button', { name: 'Mostra nel diagramma' }).click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await scegliStato(grafo, 'working');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await lente(grafo).click();
  await campo(grafo).fill('prove');
  await expect(grafo.locator('[data-sessione="m1"]')).toHaveAttribute('data-spento', 'true');
  // al Workflow: cambia vista (scrive la SUA voce) e cerca
  await grafo.getByRole('button', { name: 'Workflow', exact: true }).click();
  await expect(grafo).toHaveAttribute('data-sorgente', 'workflow');
  await grafo.locator('[data-vista="lettura"]').click();
  await expect(grafo).toHaveAttribute('data-vista', 'lettura');
  const voci = await page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).filter((k) => k.startsWith('talos.grafo-workflow.v1:')).map((k) => [k, JSON.parse(sessionStorage.getItem(k))])));
  expect(Object.keys(voci).sort(), JSON.stringify(voci)).toEqual([`talos.grafo-workflow.v1:${S}`, `talos.grafo-workflow.v1:${S}:deleghe`]);
  expect(voci[`talos.grafo-workflow.v1:${S}`], 'il Workflow scrive solo la vista').toEqual({ vista: 'lettura' });
  expect(voci[`talos.grafo-workflow.v1:${S}:deleghe`]).toMatchObject({ vista: 'dipendenze', filtro: 'working', cerca: 'prove' });
  // di nuovo alle deleghe: com'erano, e con la LORO vista (non «Lettura»)
  await grafo.getByRole('button', { name: 'Deleghe', exact: true }).click();
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo).toHaveAttribute('data-vista', 'dipendenze');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(campo(grafo)).toHaveValue('prove');
  // e dopo una ricarica vera
  await page.reload();
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(filtro(grafo).locator('> button')).toHaveAttribute('aria-pressed', 'true');
  await expect(campo(grafo)).toHaveValue('prove');
});

test('TERZA-MEMORIA-08 [REGGE] — ricarica con la RIPRODUZIONE aperta su un istante passato: il diagramma torna AL VIVO (l’istante non si ricorda), col filtro e l’agente scelto di prima, e gli stati sono quelli di adesso', async ({ page }) => {
  const { grafo } = await apri(page, scena());
  await scegliStato(grafo, 'finished');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1); // «b» (concluso); «c» è «da guardare»
  await grafo.locator('[data-sessione="b"]').click();
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await rip.locator('.gv-rip-binario').focus();
  await page.keyboard.press('Home');
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(grafo.locator('[data-sessione="b"]')).not.toHaveAttribute('data-stato', 'succeeded'); // all'inizio non aveva finito
  const dopo = await ricarica(page);
  await expect(dopo.locator('[data-sessione]')).toHaveCount(1);
  await expect(dopo.locator('.gv-rip')).toHaveAttribute('data-attiva', 'false');
  await expect(dopo.locator('[data-sessione="b"]')).toHaveAttribute('data-stato', 'succeeded');
  await expect(dopo.locator('[data-sessione="b"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(filtro(dopo).locator('> button')).toHaveAttribute('aria-pressed', 'true');
  const voce = await memoria(page);
  expect(Object.keys(voce).sort().join(), JSON.stringify(voce)).toBe('filtro,scelto,vista');
});

/* Il brief: «il mutante V2 ("in vista dopo la ricarica") era sopravvissuto e ho TOLTO la riga che copriva: se per te serviva,
   dimostralo». DELEGHE-MEMORIA-08 prova sei agenti, che stanno tutti nella tela. Qui il lotto è più alto della tela. */
const dentroLaTela = async (carta) => (await carta.count()) > 0 && carta.evaluate((n) => { const r = n.getBoundingClientRect(); const c = n.closest('.gv-tela').getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom; });
test('TERZA-MEMORIA-09 — dodici agenti in un lotto più alto della tela, la persona sceglie l’ULTIMO (dal pannello Agenti): dopo la ricarica l’agente ripreso, col suo dettaglio aperto, è NELLA TELA — non una scheda che non si vede', async ({ page }) => {
  const dodici = Array.from({ length: 12 }, (_, i) => figlia(`s${String(i).padStart(2, '0')}`, 10 + i, { taskCorto: `Agente ${i + 1}` }));
  const { grafo } = await apri(page, dodici);
  await expect(grafo.locator(':scope > header')).toContainText('12 agenti in 1 lotto');
  // dal pannello: il diagramma va sull'agente e lo porta in vista
  await page.locator('#railAgenti [data-sessione-figlia="s11"]').click();
  await expect(nomeNelDettaglio(grafo)).toContainText('Agente 12');
  await expect.poll(() => dentroLaTela(grafo.locator('[data-sessione="s11"]')), { message: 'la premessa: scelto dal pannello, l’agente è nella tela' }).toBe(true);
  await expect.poll(async () => (await memoria(page))?.scelto, { message: 'la premessa: la scelta è nella memoria' }).toBe('s11');
  const dopo = await ricarica(page);
  await expect(nomeNelDettaglio(dopo)).toContainText('Agente 12'); // ripreso, col suo dettaglio
  await page.waitForTimeout(1200); // la vista d'apertura è finita
  const visto = { nelDom: await dopo.locator('[data-sessione="s11"]').count(), nellaTela: await dentroLaTela(dopo.locator('[data-sessione="s11"]')), zoom: (await dopo.locator('.gv-percento').innerText()).trim() };
  expect(visto.nellaTela, `dopo la ricarica la scheda dell’agente ripreso è nella tela: ${JSON.stringify(visto)}`).toBe(true);
});
