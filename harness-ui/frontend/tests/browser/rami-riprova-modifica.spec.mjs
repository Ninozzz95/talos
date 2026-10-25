import { expect, test } from '@playwright/test';

import { CONFINE, attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

/*
 * 24/10/2026 — «Riprova» e «Modifica e rimanda» come RAMI (owner: bozzetto `mockup-riprova-*` approvato, «Matita = modifica»,
 *   «Ferma e invia»; contratto CONTRATTO-RIPROVA-MODIFICA-RAMI). Si prova la strada intera della finestra, col server finto:
 *   il taglio chiesto al punto giusto, la domanda rimandata nel ramo, la storia del padre disegnata sopra il ramo (in sola
 *   lettura), le frecce ‹ n / N › nel posto giusto, «Ferma e invia», le immagini, il messaggio non salvato, il punto riassunto.
 * ⛔ Nessun giro con un modello vero: rotte finte; ogni POST si intercetta e si conta.
 */

const A = 'rami-A'; const B = 'rami-B';
const IMG = (c) => ({ tipo: 'immagine', id: c.repeat(64), nome: `${c}.png`, url: `/api/v1/chat-images/${c.repeat(64)}` });

function giro(runId, consegna, seq, { seguito = seq > 1, immagini } = {}) {
  return [
    { type: 'RunStarted', runId, _sequenza: seq, input: { consegna, seguito, ...(immagini ? { immagini } : {}) }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' } },
    { type: 'TextMessageStart', messageId: `m-${runId}`, _sequenza: seq + 1 },
    { type: 'TextMessageContent', messageId: `m-${runId}`, delta: `Risposta a «${consegna}».`, _sequenza: seq + 2 },
    { type: 'TextMessageEnd', messageId: `m-${runId}`, _sequenza: seq + 3 },
    { type: 'RunFinished', runId, _sequenza: seq + 4 },
  ];
}
const flusso = (eventi) => (route) => route.fulfill({
  status: 200, contentType: 'text/event-stream',
  body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`,
});
const ok = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', json: { ok: true, data } });

/**
 * Il banco: la sessione A con due giri (r1, r2) e, se `conRamo`, il ramo B già tagliato prima di r2. `storiaDiA` cambia la storia di A.
 * Restituisce le richieste POST viste, per nome.
 */
async function banco(page, { conRamo = false, storiaDiA = [...giro('r1', 'domanda 1', 1), ...giro('r2', 'domanda 2', 10)], fork = null, tema = 'dark' } = {}) {
  const viste = { fork: [], resume: [], stop: [] };
  const righe = [{ sessionId: A, taskId: A, nome: 'Rami', conclusa: true, modello: 'qwen/qwen3.8-flash', avviataAlle: '2026-10-24T10:00:00Z' }];
  const rigaB = { sessionId: B, taskId: B, nome: 'Rami (ramo)', conclusa: true, modello: 'qwen/qwen3.8-flash', avviataAlle: '2026-10-24T10:05:00Z', forkDa: A, forkPrimaDelGiro: 'r2' };
  if (conRamo) righe.push(rigaB);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET' ? ok(route, { items: righe }) : route.fallback()));
  await page.route(`**/api/v1/sessions/${A}/events*`, flusso(storiaDiA));
  await page.route(`**/api/v1/sessions/${B}/events*`, flussoConConfine);
  await page.route(`**/api/v1/sessions/${A}/export`, (route) => ok(route, { sessionId: A, eventi: storiaDiA }));
  await page.route(`**/api/v1/sessions/${B}/export`, (route) => ok(route, { sessionId: B, eventi: giro('r1', viste.resume.at(-1)?.messaggio ?? 'domanda 2', 1) }));
  await page.route(`**/api/v1/sessions/${A}/fork`, async (route) => {
    const corpo = route.request().postDataJSON(); viste.fork.push(corpo);
    if (fork) return fork(route, corpo);
    if (!righe.includes(rigaB)) righe.push(rigaB);
    return ok(route, { sessionId: B, forkDa: A, forkPrimaDelGiro: corpo.primaDelGiro, taglio: { primaDelGiro: corpo.primaDelGiro, messaggio: 'domanda 2', ...(corpo.primaDelGiro === 'r2' ? {} : {}) } });
  });
  await page.route('**/api/v1/sessions/*/resume', (route) => { viste.resume.push(route.request().postDataJSON()); return ok(route, { sessionId: B }); });
  await page.route('**/api/v1/sessions/*/stop', async (route) => {
    viste.stop.push(route.request().url());
    await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunFinished', runId: 'r3' }, r.realSessionState.generation); });
    return ok(route, { fermata: true });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  return { viste, righe };
}
async function apri(page, id) {
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, s, 'Rami', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' }), id);
  await attendiFineStoria(page);
}
const domande = (page) => page.locator('#conversation .talos-message--user');
const risposte = (page) => page.locator('#conversation .talos-message:not(.talos-message--user):has(.assistant-copy)');
const nomi = (nodi) => nodi.map((n) => n.getAttribute('aria-label') || n.textContent);
/** il ramo B risponde dal vivo, come farebbe il server dopo il resume */
async function rispondeIlRamo(page, testo) {
  await page.evaluate((eventi) => { const r = window.__talosHarnessUiRuntime; for (const e of eventi) r.handleRealEvent(e, r.realSessionState.generation); },
    giro('b1', testo, 1, { seguito: true }).map(({ _sequenza, ...e }) => ({ ...e, _sequenza: _sequenza + 100 })));
}

test('RAMI-B1 «Riprova» sulla seconda risposta: taglia prima di r2 in A, rimanda la STESSA domanda nel ramo, la storia di A sta sopra in sola lettura', async ({ page }) => {
  const { viste } = await banco(page);
  await apri(page, A);
  await expect(domande(page)).toHaveCount(2);
  await risposte(page).nth(1).click({ button: 'right' });
  const voci = page.locator('#menuRispostaMessaggio [role="menuitem"]');
  expect(await voci.evaluateAll(nomi)).toEqual(['Riprova', 'Elimina la risposta']);
  await expect(voci.first()).toContainText('Ramo nuovo · questa risposta resta');
  await voci.first().click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.fork).toEqual([{ primaDelGiro: 'r2' }]);
  expect(viste.resume[0].messaggio).toBe('domanda 2');
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe(B);
  /* la storia di A fino al taglio: il giro 1 sì, la vecchia risposta 2 no */
  await expect(domande(page).first()).toContainText('domanda 1');
  await expect(page.locator('#conversation')).not.toContainText('Risposta a «domanda 2»');
  /* ⛔ ereditato = sola lettura: nessuna sequenza, quindi «Elimina» non colpisce A dal ramo */
  expect(await domande(page).first().evaluate((d) => [d.dataset.riferimentoMessaggio ?? null, d.dataset.giroDi])).toEqual([null, A]);
  await rispondeIlRamo(page, 'domanda 2');
  /* tutte le versioni hanno la stessa domanda ⇒ le frecce sulla RISPOSTA, 2 / 2 */
  const frecce = page.locator('#conversation .talos-rami-versioni');
  await expect(frecce).toHaveCount(1);
  await expect(risposte(page).last().locator('.talos-rami-versioni')).toHaveCount(1);
  await expect(frecce.locator('.talos-rami-versioni__numero')).toHaveText('2 / 2');
  await expect(frecce.locator('.talos-rami-versioni__avanti')).toBeDisabled();
  await expect(frecce.locator('.talos-rami-versioni__indietro')).toBeEnabled();
});

test('RAMI-B2 la matita: «Modifica e rimanda» in linea; Invia manda il testo NUOVO nel ramo e le frecce vanno sul messaggio', async ({ page }) => {
  const { viste } = await banco(page);
  await apri(page, A);
  const seconda = domande(page).nth(1);
  await seconda.hover();
  await seconda.locator('[data-message-action="modifica"]').click();
  const campo = seconda.locator('textarea');
  await expect(campo).toHaveValue('domanda 2');
  await expect(seconda.locator('.talos-rami-modifica__riga .talos-button')).toHaveText(['Annulla', 'Invia']);
  await campo.fill('domanda 2, ma con il tema di sistema');
  await seconda.getByRole('button', { name: 'Invia' }).click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.fork).toEqual([{ primaDelGiro: 'r2' }]);
  expect(viste.resume[0].messaggio).toBe('domanda 2, ma con il tema di sistema');
  await rispondeIlRamo(page, 'domanda 2, ma con il tema di sistema');
  await expect(domande(page).last().locator('.talos-rami-versioni .talos-rami-versioni__numero')).toHaveText('2 / 2');
});

test('RAMI-B3 Annulla ed Esc rimettono la bolla com\'era; un messaggio non ancora salvato non si modifica (lo dice)', async ({ page }) => {
  const { viste } = await banco(page);
  await apri(page, A);
  const prima = domande(page).first();
  await prima.hover();
  await prima.locator('[data-message-action="modifica"]').click();
  await prima.locator('textarea').press('Escape');
  await expect(prima.locator('textarea')).toHaveCount(0);
  await expect(prima.locator('.message-bubble')).toHaveText('domanda 1');
  await expect(prima.locator('[data-message-action="modifica"]')).toBeVisible();
  /* al contrario: senza giro salvato, niente ramo */
  await prima.evaluate((d) => { delete d.dataset.giro; });
  await prima.locator('[data-message-action="modifica"]').click();
  await expect(prima.locator('textarea')).toHaveCount(0);
  await expect(page.locator('body')).toContainText('non è ancora salvato');
  expect(viste.fork).toEqual([]);
});

test('RAMI-B4 a giro in corso: «Ferma e invia» — prima lo stop, poi il ramo', async ({ page }) => {
  const { viste, righe } = await banco(page);
  await apri(page, A);
  /* a giro in corso il server dice «non conclusa»: dopo il RunStarted l'interfaccia rilegge l'elenco, e una riga ferma su
     «conclusa» richiuderebbe il giro (la guardia di `chiusaDalServer`, giusta) — è il banco che deve dire il vero */
  righe[0].conclusa = false;
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunStarted', runId: 'r3', _sequenza: 50, input: { consegna: 'domanda 3', seguito: true } }, r.realSessionState.generation); });
  const seconda = domande(page).nth(1);
  await seconda.hover();
  await seconda.locator('[data-message-action="modifica"]').click();
  await expect(seconda.getByRole('button', { name: 'Ferma e invia' })).toBeVisible();
  await expect(seconda.locator('.talos-rami-modifica__nota')).toContainText('sta ancora rispondendo');
  await seconda.getByRole('button', { name: 'Ferma e invia' }).click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.stop.length).toBe(1);
  expect(viste.fork).toEqual([{ primaDelGiro: 'r2' }]);
});

test('RAMI-B5 con immagini: ripartono col messaggio, e quella tolta non parte', async ({ page }) => {
  const storia = [...giro('r1', 'domanda 1', 1), ...giro('r2', 'guarda queste due', 10, { immagini: [IMG('a'), IMG('b')] })];
  const { viste } = await banco(page, { storiaDiA: storia });
  await apri(page, A);
  const seconda = domande(page).nth(1);
  await seconda.hover();
  await seconda.locator('[data-message-action="modifica"]').click();
  await expect(seconda.locator('.talos-rami-modifica__immagini .talos-image-card')).toHaveCount(2);
  /* foto del 24/10: le immagini comparivano DUE volte — nella modifica e nella galleria sotto, che la modifica non trovava perché
     sta nel contenitore del messaggio, non dentro la bolla. In tutta la conversazione, solo le due della modifica sono visibili */
  await expect(page.locator('#conversation .talos-image-card:visible')).toHaveCount(2);
  await seconda.getByRole('button', { name: 'Togli b.png' }).click();
  await expect(seconda.locator('.talos-rami-modifica__immagini .talos-image-card')).toHaveCount(1);
  await seconda.getByRole('button', { name: 'Invia' }).click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0].immagini).toEqual([{ id: 'a'.repeat(64) }]);
});

test('RAMI-B6 il punto finito in un riassunto: la frase giusta, nessun cambio di sessione, nessun invio', async ({ page }) => {
  const { viste } = await banco(page, {
    fork: (route) => route.fulfill({ status: 409, contentType: 'application/json', json: { ok: false, error: { code: 'SESSION_NOT_READY', message: 'no', reason: 'fork-point-compacted' } } }),
  });
  await apri(page, A);
  await risposte(page).nth(1).click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect(page.locator('body')).toContainText('è stato riassunto');
  expect(viste.resume).toEqual([]);
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe(A);
});

test('RAMI-B7 aprire il ramo dall\'elenco: la storia di A sopra, le frecce 2 / 2; «‹» porta alla versione 1 (A), dove le frecce dicono 1 / 2', async ({ page }) => {
  await banco(page, { conRamo: true });
  await page.waitForFunction(() => true);
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali?.());
  await apri(page, B);
  await expect(domande(page).first()).toContainText('domanda 1');
  await rispondeIlRamo(page, 'domanda 2');
  const frecce = page.locator('#conversation .talos-rami-versioni');
  await expect(frecce.locator('.talos-rami-versioni__numero')).toHaveText('2 / 2');
  await frecce.locator('.talos-rami-versioni__indietro').click();
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe(A);
  await attendiFineStoria(page);
  await expect(page.locator('#conversation .talos-rami-versioni .talos-rami-versioni__numero')).toHaveText('1 / 2');
});

/* ------------------------------------------------------------------------------------------------------------------------------
 * 24/10/2026 sera — le cure della REVISIONE A BLOCCO 4 (§3, «Riprova e Modifica come rami»). Un banco più libero: sessioni a piacere,
 *   ognuna con la sua riga e i suoi eventi; ogni non-GET non finto si ferma e si conta (`altri`).
 * ------------------------------------------------------------------------------------------------------------------------------ */
const MOD = 'qwen/qwen3.8-flash';
const rigaDi = (id, extra = {}) => ({ sessionId: id, taskId: id, nome: id, conclusa: true, modello: MOD, ...extra });
async function bancoLibero(page, sessioni, { fork = null, stop = null, tema = 'dark' } = {}) {
  const viste = { fork: [], resume: [], stop: [], altri: [] };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && r.method() !== 'HEAD') { viste.altri.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.fulfill({ status: 404, contentType: 'application/json', json: { ok: false, error: { code: 'NOT_FOUND', message: 'non finto' } } }); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET'
    ? ok(route, { items: Object.values(sessioni).filter((s) => !s.eliminata).map((s) => s.riga) }) : route.fallback()));
  for (const [id, s] of Object.entries(sessioni)) {
    await page.route(`**/api/v1/sessions/${id}/events*`, (route) => flusso(s.eliminata ? [] : s.eventi)(route));
    await page.route(`**/api/v1/sessions/${id}/export`, (route) => (s.eliminata
      ? route.fulfill({ status: 404, contentType: 'application/json', json: { ok: false, error: { code: 'NOT_FOUND', message: 'Session not found' } } })
      : ok(route, { sessionId: id, eventi: s.eventi })));
    await page.route(`**/api/v1/sessions/${id}/fork`, async (route) => {
      const corpo = route.request().postDataJSON(); viste.fork.push([id, corpo]);
      if (fork) return fork(route, id, corpo);
      const tagliato = s.eventi.find((e) => e.type === 'RunStarted' && e.runId === corpo.primaDelGiro);
      return ok(route, { sessionId: 'nuovo', forkDa: id, forkPrimaDelGiro: corpo.primaDelGiro, taglio: { primaDelGiro: corpo.primaDelGiro, messaggio: tagliato?.input?.consegna ?? '' } });
    });
  }
  /* K3b: prima del resume la finestra allinea la lingua della sessione — una scrittura del banco, finta come le altre */
  await page.route('**/api/v1/sessions/*/settings', (route) => (route.request().method() === 'GET' ? route.fallback() : ok(route, {})));
  await page.route('**/api/v1/sessions/nuovo/events*', flusso([]));
  await page.route('**/api/v1/sessions/nuovo/export', (route) => ok(route, { sessionId: 'nuovo', eventi: [] }));
  await page.route('**/api/v1/sessions/*/resume', (route) => { viste.resume.push(route.request().postDataJSON()); return ok(route, { sessionId: 'nuovo' }); });
  await page.route('**/api/v1/sessions/*/stop', async (route) => {
    viste.stop.push(new URL(route.request().url()).pathname);
    if (stop) return stop(route);
    await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunFinished', runId: 'vivo' }, r.realSessionState.generation); });
    return ok(route, { fermata: true });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali?.());
  return viste;
}
const DUE_GIRI = () => [...giro('r1', 'domanda 1', 1), ...giro('r2', 'domanda 2', 10)];
const numeri = (page) => page.locator('#conversation .talos-rami-versioni__numero').allTextContents();
const idCorrente = (page) => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id);
const giroVivo = (page) => page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunStarted', runId: 'vivo', _sequenza: 500, input: { consegna: 'lavoro lungo', seguito: true } }, r.realSessionState.generation); });
/* il messaggio con un FILE, nella forma vera di `testoConAllegati` (frase, intestazione, riga «- nome (percorso)», blocco «--- … ---») */
const FRASE = 'riassumi questo';
const CONSEGNA_FILE = `${FRASE}\n\nAttachments of this message:\n- note.txt (C:/progetti/AVM/note.txt)\n\n--- note.txt (C:/progetti/AVM/note.txt) ---\ncontenuto segreto del file`;
const BOLLA_FILE = { testo: FRASE, allegati: [{ tipo: 'file', nome: 'note.txt', percorso: 'C:/progetti/AVM/note.txt', caratteri: 26 }] };
function giroConBolla(runId, consegna, seq, bolla) {
  const [inizio, ...resto] = giro(runId, consegna, seq);
  return [{ ...inizio, input: { ...inizio.input, bolla } }, ...resto];
}

test('REV4-RT2 «Riprova» sulla PRIMA risposta di due: taglia prima di r1 e rimanda LA SUA domanda, non l\'ultima', async ({ page }) => {
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A', { avviataAlle: '2026-10-24T10:00:00Z' }), eventi: DUE_GIRI() } });
  await apri(page, 'A');
  await risposte(page).first().click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.fork).toEqual([['A', { primaDelGiro: 'r1' }]]);
  expect(viste.resume[0].messaggio).toBe('domanda 1');
  expect(viste.altri).toEqual([]);
});

test('REV4-R1 il secondo «Riprova» dal ramo taglia dal PUNTO del ramo: tre versioni dello stesso punto, «n / 3» ovunque', async ({ page }) => {
  const sessioni = {
    A: { riga: rigaDi('A', { avviataAlle: '2026-10-24T10:00:00Z' }), eventi: DUE_GIRI() },
    B: { riga: rigaDi('B', { avviataAlle: '2026-10-24T10:05:00Z', forkDa: 'A', forkPrimaDelGiro: 'r2' }), eventi: giro('b1', 'domanda 2', 1, { seguito: true }) },
    C: { riga: rigaDi('C', { avviataAlle: '2026-10-24T10:09:00Z' }), eventi: giro('c1', 'domanda 2', 1, { seguito: true }), eliminata: true },
  };
  const viste = await bancoLibero(page, sessioni);
  await apri(page, 'B');
  await expect(domande(page)).toHaveCount(2);
  await risposte(page).last().click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect.poll(() => viste.fork.length).toBe(1);
  expect(viste.fork[0], 'la prima domanda propria del ramo B è la domanda del punto (A, r2)').toEqual(['A', { primaDelGiro: 'r2' }]);
  /* la terza versione come il server la registrerebbe */
  Object.assign(sessioni.C.riga, { forkDa: viste.fork[0][0], forkPrimaDelGiro: viste.fork[0][1].primaDelGiro }); sessioni.C.eliminata = false;
  const conti = {};
  for (const id of ['A', 'B', 'C']) {
    await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali?.());
    await apri(page, id);
    await expect.poll(() => numeri(page)).toHaveLength(1);
    conti[id] = await numeri(page);
  }
  expect(conti).toEqual({ A: ['1 / 3'], B: ['2 / 3'], C: ['3 / 3'] });
});

test('REV4-R1b senza la sorgente in elenco il secondo «Riprova» ripiega sul ramo stesso', async ({ page }) => {
  const viste = await bancoLibero(page, {
    A: { riga: rigaDi('A'), eventi: DUE_GIRI(), eliminata: true },
    B: { riga: rigaDi('B', { avviataAlle: '2026-10-24T10:05:00Z', forkDa: 'A', forkPrimaDelGiro: 'r2' }), eventi: giro('b1', 'domanda 2', 1, { seguito: true }) },
  });
  await apri(page, 'B');
  await risposte(page).last().click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect.poll(() => viste.fork.length).toBe(1);
  expect(viste.fork[0]).toEqual(['B', { primaDelGiro: 'b1' }]);
});

test('REV4-R2 a giro in corso la voce del «⋯» dice «Ferma e riprova», con la riga «Il giro in corso si ferma»; poi stop e ramo', async ({ page }) => {
  const sessioni = { A: { riga: rigaDi('A', { avviataAlle: '2026-10-24T10:00:00Z' }), eventi: DUE_GIRI() } };
  const viste = await bancoLibero(page, sessioni);
  await apri(page, 'A');
  sessioni.A.riga.conclusa = false;
  await giroVivo(page);
  await risposte(page).first().click({ button: 'right' });
  const voce = page.locator('#menuRispostaMessaggio [role="menuitem"]').first();
  await expect(voce).toHaveAttribute('aria-label', 'Ferma e riprova');
  await expect(voce).toContainText('Il giro in corso si ferma');
  await voce.click();
  await expect.poll(() => viste.fork.length).toBe(1);
  expect(viste.stop.length).toBe(1);
  /* a giro fermo, di nuovo «Riprova» */
  await page.keyboard.press('Escape');
});

test('REV4-R3 lo stop FALLISCE: niente ramo, e un avviso lo dice', async ({ page }) => {
  test.setTimeout(60_000);
  const sessioni = { A: { riga: rigaDi('A', { avviataAlle: '2026-10-24T10:00:00Z' }), eventi: DUE_GIRI() } };
  const viste = await bancoLibero(page, sessioni, { stop: (route) => route.fulfill({ status: 500, contentType: 'application/json', json: { ok: false, error: { code: 'INTERNAL', message: 'stop non riuscito' } } }) });
  await apri(page, 'A');
  sessioni.A.riga.conclusa = false;
  await giroVivo(page);
  const prima = domande(page).first();
  await prima.hover();
  await prima.locator('[data-message-action="modifica"]').click();
  await prima.locator('textarea').fill('domanda 1 riscritta');
  await prima.getByRole('button', { name: 'Ferma e invia' }).click();
  await expect(page.locator('body')).toContainText('non si è fermato', { timeout: 25_000 });
  expect(viste.stop.length).toBeGreaterThan(0);
  expect(viste.fork, '⛔ lo stop è fallito: il ramo non doveva partire').toEqual([]);
  expect(viste.resume).toEqual([]);
  expect(await idCorrente(page)).toBe('A');
  /* la modifica resta aperta, col testo: si può riprovare */
  await expect(prima.locator('textarea')).toHaveValue('domanda 1 riscritta');
});

test('REV4-R4 «Modifica e rimanda» con un FILE: il file riparte come chip, e uno tolto non riparte', async ({ page }) => {
  const eventi = [...giro('r1', 'domanda 1', 1), ...giroConBolla('r2', CONSEGNA_FILE, 10, BOLLA_FILE)];
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi } });
  await apri(page, 'A');
  const seconda = domande(page).nth(1);
  await seconda.hover();
  await seconda.locator('[data-message-action="modifica"]').click();
  await expect(seconda.locator('.talos-rami-modifica__file')).toHaveText(['note.txt']);
  await expect(seconda.locator('.talos-rami-modifica__nota')).toContainText('Gli allegati ripartono');
  await seconda.locator('textarea').fill('riassumi in tre righe');
  await seconda.getByRole('button', { name: 'Invia' }).click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0].messaggio).toBe(CONSEGNA_FILE.replace(FRASE, 'riassumi in tre righe'));
  expect(viste.resume[0].bolla).toEqual({ testo: 'riassumi in tre righe', allegati: [{ tipo: 'file', nome: 'note.txt', percorso: 'C:/progetti/AVM/note.txt' }] });
  /* la bolla del ramo: frase + chip, mai il contenuto del file */
  await expect(domande(page).last().locator('.message-bubble')).toHaveText('riassumi in tre righe');
  await expect(page.locator('#conversation')).not.toContainText('contenuto segreto del file');
});

test('REV4-R4b il file tolto prima di inviare non riparte', async ({ page }) => {
  const eventi = [...giro('r1', 'domanda 1', 1), ...giroConBolla('r2', CONSEGNA_FILE, 10, BOLLA_FILE)];
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi } });
  await apri(page, 'A');
  const seconda = domande(page).nth(1);
  await seconda.hover();
  await seconda.locator('[data-message-action="modifica"]').click();
  await seconda.getByRole('button', { name: 'Togli note.txt' }).click();
  await expect(seconda.locator('.talos-rami-modifica__file')).toHaveCount(0);
  await seconda.getByRole('button', { name: 'Invia' }).click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0]).toEqual({ messaggio: FRASE });
});

test('REV4-R5 «Riprova» su un messaggio con un FILE: la bolla del ramo è frase + chip, e il server riceve la bolla', async ({ page }) => {
  const eventi = [...giro('r1', 'domanda 1', 1), ...giroConBolla('r2', CONSEGNA_FILE, 10, BOLLA_FILE)];
  const viste = await bancoLibero(page, { A: { riga: rigaDi('A'), eventi } });
  await apri(page, 'A');
  await risposte(page).nth(1).click({ button: 'right' });
  await page.locator('#menuRispostaMessaggio [role="menuitem"]').first().click();
  await expect.poll(() => viste.resume.length).toBe(1);
  expect(viste.resume[0].messaggio, 'il modello riceve il file, come prima').toBe(CONSEGNA_FILE);
  expect(viste.resume[0].bolla).toEqual({ testo: FRASE, allegati: [{ tipo: 'file', nome: 'note.txt', percorso: 'C:/progetti/AVM/note.txt', caratteri: 26 }] });
  const ultima = domande(page).last();
  await expect(ultima.locator('.message-bubble')).toHaveText(FRASE);
  await expect(page.locator('#conversation')).not.toContainText('contenuto segreto del file');
  await expect(page.locator('#conversation .talos-allegati-chip__nome').last()).toHaveText('note.txt');
});

test('REV4-R6 nella storia EREDITATA «Elimina la risposta», «Annulla le modifiche ai file» ed «Elimina il messaggio» sono spente e dicono perché', async ({ page }) => {
  const viste = await bancoLibero(page, {
    A: { riga: rigaDi('A', { avviataAlle: '2026-10-24T10:00:00Z' }), eventi: DUE_GIRI() },
    B: { riga: rigaDi('B', { avviataAlle: '2026-10-24T10:05:00Z', forkDa: 'A', forkPrimaDelGiro: 'r2' }), eventi: giro('b1', 'domanda 2', 1, { seguito: true }) },
  });
  await apri(page, 'B');
  await expect(domande(page)).toHaveCount(2);
  /* la risposta ereditata (da A) */
  await risposte(page).first().click({ button: 'right' });
  const elimina = page.locator('#menuRispostaMessaggio').getByRole('menuitem', { name: 'Elimina la risposta', exact: true });
  await expect(elimina).toBeDisabled();
  await expect(elimina).toContainText('Fa parte della conversazione da cui nasce questo ramo');
  await page.keyboard.press('Escape');
  /* la risposta propria del ramo: accesa */
  await risposte(page).last().click({ button: 'right' });
  await expect(page.locator('#menuRispostaMessaggio').getByRole('menuitem', { name: 'Elimina la risposta', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  /* il messaggio ereditato della persona: Annulla ed Elimina spente, con la riga */
  await domande(page).first().click({ button: 'right' });
  for (const nome of ['Annulla le modifiche ai file da qui', 'Elimina il messaggio']) {
    const voce = page.locator(`[role="menu"]:visible [role="menuitem"][aria-label="${nome}"]`);
    await expect(voce).toBeDisabled();
    await expect(voce).toContainText('Fa parte della conversazione da cui nasce questo ramo');
  }
  expect(viste.altri).toEqual([]);
});

test('REV4-R7 la sorgente eliminata non è una versione (niente frecce verso il nulla); la conferma dell\'eliminazione conta i rami', async ({ page }) => {
  const sessioni = {
    A: { riga: rigaDi('A', { avviataAlle: '2026-10-24T10:00:00Z' }), eventi: DUE_GIRI(), eliminata: true },
    B: { riga: rigaDi('B', { avviataAlle: '2026-10-24T10:05:00Z', forkDa: 'A', forkPrimaDelGiro: 'r2' }), eventi: giro('b1', 'domanda 2', 1, { seguito: true }) },
  };
  await bancoLibero(page, sessioni);
  await apri(page, 'B');
  await page.waitForTimeout(400);
  expect(await numeri(page)).toEqual([]);
  /* la conferma, con A in elenco e due rami da un punto */
  sessioni.A.eliminata = false;
  sessioni.C = { riga: rigaDi('C', { avviataAlle: '2026-10-24T10:06:00Z', forkDa: 'A', forkPrimaDelGiro: 'r1' }), eventi: [] };
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali?.());
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator('[data-real-session-id="A"]').click({ button: 'right' });
  await page.locator('.session-actions-menu').getByRole('menuitem', { name: 'Elimina', exact: true }).click();
  await expect(page.locator('#eliminaSessioneRami')).toHaveText('2 rami perdono la storia visibile: sono stati tagliati da questa sessione.');
  await expect(page.locator('#eliminaSessioneRami'), 'detto PRIMA di premere: la riga si vede').toBeVisible();
});

test('REV4-CATENA una catena oltre gli 8 anelli dice in cima che la conversazione più vecchia non è mostrata', async ({ page }) => {
  const sessioni = { S0: { riga: rigaDi('S0', { avviataAlle: '2026-10-24T10:00:00Z' }), eventi: giro('g0', 'radice', 1) } };
  for (let i = 1; i <= 10; i++) sessioni[`S${i}`] = { riga: rigaDi(`S${i}`, { avviataAlle: `2026-10-24T10:${String(i).padStart(2, '0')}:00Z`, forkDa: `S${i - 1}`, forkPrimaDelGiro: `g${i}` }), eventi: [...giro(`h${i}`, `domanda ${i}`, 1, { seguito: true }), ...giro(`g${i + 1}`, `seguito ${i}`, 10)] };
  await bancoLibero(page, sessioni);
  await apri(page, 'S10');
  const nota = page.locator('#conversation').getByText('La conversazione più vecchia non è mostrata');
  await expect(nota).toHaveCount(1);
  /* e sta SOPRA la prima domanda disegnata */
  const sopra = await page.evaluate(() => {
    const n = [...document.querySelectorAll('#conversation *')].find((x) => x.children.length === 0 && x.textContent.includes('La conversazione più vecchia non è mostrata'));
    const d = document.querySelector('#conversation .talos-message--user');
    return Boolean(n && d && (n.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(sopra).toBe(true);
});
