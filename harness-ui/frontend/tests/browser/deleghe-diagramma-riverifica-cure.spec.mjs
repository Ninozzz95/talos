/*
 * RIVERIFICA DELLE CURE DELLA TERZA PASSATA (14/10/2026) — il revisore attacca i CONFINI delle cure di `383942413`.
 * Brief: `handoff …/BRIEF-BUGFIXER-RIVERIFICA-CURE-2026-10-14.md`. La regola T4 (approvata dall'owner il 14/10) NON si riapre:
 * «quando la richiesta mostrata cambia DA SOLA e il filtro per stato lì non ha nessuno, il filtro cade in silenzio; per la scelta
 * uscita per lo stesso motivo il diagramma sceglie come a ogni apertura». Qui si guarda dove la regola smette di valere.
 * «[REGGE]» = attaccato, ha retto. Senza etichetta = ROSSA: un difetto, con la cura proposta nel rapporto
 * (`handoff …/bugfixer/RAPPORTO-RIVERIFICA-CURE-2026-10-14.md`). Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

const filtro = (grafo) => grafo.locator('[data-filtro-stato]');
const scegliStato = async (grafo, id) => { await filtro(grafo).locator('> button').click(); await filtro(grafo).locator(`[data-stato-id="${id}"]`).click(); };
const nomeNelDettaglio = (grafo) => grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa');
/** Una richiesta NUOVA della persona, dalla porta vera (`RunStarted` della conversazione, con la sua ora): come quando scrive. */
const nuovaRichiesta = (page, { testo, quando, seq }) => page.evaluate(({ t, q, s }) => {
  const r = window.__talosHarnessUiRuntime; const g = r.realSessionState.generation;
  r.handleRealEvent({ type: 'RunStarted', _sequenza: s, at: q, input: { consegna: t }, contesto: { modello: 'z-ai/glm-5.3-flash' } }, g);
}, { t: testo, q: quando, s: seq });
const ciòCheSiVede = async (grafo) => ({
  schede: await grafo.locator('[data-sessione]').count(),
  filtro: (await filtro(grafo).locator('> button').innerText()).replace(/\s+/gu, ' ').trim(),
  premuto: await filtro(grafo).locator('> button').getAttribute('aria-pressed'),
  testata: (await grafo.locator(':scope > header .talos-wfg__sommario').innerText()).replace(/\s+/gu, ' ').trim(),
  scelto: await grafo.locator('[data-sessione][aria-pressed="true"]').evaluateAll((n) => n.map((x) => x.dataset.sessione)),
  dettaglio: (await nomeNelDettaglio(grafo).count()) && (await nomeNelDettaglio(grafo).isVisible()) ? (await nomeNelDettaglio(grafo).innerText()).replace(/\s+/gu, ' ').trim() : null,
  tolta: await grafo.getByText('non è più fra gli agenti mostrati').count(),
});

test('RIV-T4-01 — il filtro per stato era già rimasto senza nessuno (l’unico «non riuscito» è ripartito con «Riprova»), poi la persona scrive e nasce una richiesta NUOVA con un agente al lavoro: la richiesta mostrata cambia DA SOLA e lì quello stato non ha nessuno ⇒ il filtro cade in silenzio, come dice la regola T4 — non resta acceso su «0 agenti»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  let figli = [finita('b', 11, 70, { taskCorto: 'Leggi il CSV' }), finita('c', 12, 80, { taskCorto: 'Controlla le valute', esitoDelega: 'fallito' })];
  const { grafo, scritture } = await apri(page, () => figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }] });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await scegliStato(grafo, 'failed');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  // «Riprova» su «c»: lavora di nuovo. Stessa richiesta: il filtro resta acceso e vuoto (la regola di sempre, qui non si tocca)
  const cDiNuovo = figlia('c', 12, { taskCorto: 'Controlla le valute' });
  figli = [figli[0], cDiNuovo];
  await eventoAgente(page, cDiNuovo);
  await expect(grafo.locator('[data-sessione]'), 'la premessa: sulla stessa richiesta il filtro resta acceso e vuoto').toHaveCount(0, { timeout: 8000 });
  // la persona scrive di nuovo; il modello delega un agente che lavora
  await nuovaRichiesta(page, { testo: 'Seconda richiesta', quando: at(300), seq: 50101 });
  const n = figlia('n', 310, { taskCorto: 'Agente nuovo' });
  figli = [...figli, n];
  await eventoAgente(page, n, 'created');
  await expect(grafo.locator('[data-richieste]'), 'la premessa: le richieste sono due, e si guarda l’ultima (da sola)').toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500); // la rilettura che segue l'evento è finita
  const visto = await ciòCheSiVede(grafo);
  expect(visto.premuto, `il filtro cade: la richiesta è cambiata da sola e «Non riusciti» lì non ha nessuno — ${JSON.stringify(visto)}`).toBe('false');
  expect(visto.schede, `l’agente della richiesta nuova si vede — ${JSON.stringify(visto)}`).toBe(1);
  expect(visto.tolta, JSON.stringify(visto)).toBe(0);
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('RIV-T4-02 [REGGE] — AL CONTRARIO: nasce una richiesta nuova e lì QUALCUNO è nello stato del filtro (un agente al lavoro): il filtro resta, mostra solo lui; l’agente che la persona aveva scelto è uscito con la richiesta e il diagramma sceglie come a ogni apertura, senza la riga «tolta»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  let figli = [figlia('a', 10, { taskCorto: 'Agente A' }), finita('b', 11, 70, { taskCorto: 'Agente B' })];
  const { grafo, scritture } = await apri(page, () => figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }] });
  await scegliStato(grafo, 'working');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await grafo.locator('[data-sessione="a"]').click(); // scelto DALLA PERSONA
  await expect(nomeNelDettaglio(grafo)).toContainText('Agente A');
  await nuovaRichiesta(page, { testo: 'Seconda richiesta', quando: at(300), seq: 50101 });
  const n = figlia('n', 310, { taskCorto: 'Agente N' }); const m = finita('m', 311, 330, { taskCorto: 'Agente M' });
  figli = [...figli, n, m];
  await eventoAgente(page, n, 'created');
  await expect(grafo.locator('[data-richieste]')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1500);
  const visto = await ciòCheSiVede(grafo);
  expect(visto, JSON.stringify(visto)).toMatchObject({ premuto: 'true', schede: 1, scelto: ['n'], tolta: 0 });
  expect(visto.dettaglio, JSON.stringify(visto)).toContain('Agente N');
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('RIV-T4-03 [REGGE] — la richiesta la cambia la PERSONA (dal menu): il filtro NON cade anche se lì non ha nessuno, nemmeno alla rilettura dal vivo che segue', async ({ page }) => {
  let figli = [finita('b', 11, 70, { taskCorto: 'Agente B' }), finita('c', 12, 80, { taskCorto: 'Agente C', esitoDelega: 'fallito' }), figlia('e', 300, { taskCorto: 'Agente E' }), finita('f', 301, 400, { taskCorto: 'Agente F' })];
  const { grafo, scritture } = await apri(page, () => figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }, { testo: 'Seconda richiesta', at: at(200) }] });
  await grafo.locator('[data-richieste] > button').click();
  await grafo.locator('[data-richieste] [role="menuitemradio"]').filter({ hasText: 'Prima richiesta' }).click();
  await scegliStato(grafo, 'failed');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await grafo.locator('[data-richieste] > button').click();
  await grafo.locator('[data-richieste] [role="menuitemradio"]').filter({ hasText: 'Seconda richiesta' }).click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(0);
  // una rilettura dal vivo (un agente della richiesta mostrata finisce)
  const eFinito = finita('e', 300, 420, { taskCorto: 'Agente E' });
  figli = [figli[0], figli[1], eFinito, figli[3]];
  await eventoAgente(page, eFinito);
  await page.waitForTimeout(1500);
  const visto = await ciòCheSiVede(grafo);
  expect(visto, JSON.stringify(visto)).toMatchObject({ premuto: 'true', schede: 0, tolta: 0 });
  expect(scritture).toEqual([]);
});

test('RIV-T4-04 — oltre 25 agenti la regola «sceglie come a ogni apertura» non vale: le richieste si sanno DOPO gli agenti (la gara della ricarica di T4), trenta agenti ⇒ si era aperto un lotto solo; la richiesta mostrata cambia da sola e ne ha dieci, ma il suo lotto resta CHIUSO (all’apertura sarebbe aperto) e il dettaglio resta su una scheda che non si vede', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const lotto = (k, nascita, vivo) => Array.from({ length: 10 }, (_, i) => (vivo ? figlia(`l${k}-${i}`, nascita + i, { taskCorto: `Agente ${k}.${i + 1}` }) : finita(`l${k}-${i}`, nascita + i, nascita + 40 + i, { taskCorto: `Agente ${k}.${i + 1}` })));
  const figli = [...lotto(1, 10, false), ...lotto(2, 100, false), ...lotto(3, 400, true)];
  const { grafo, scritture } = await apri(page, () => figli); // le richieste non si sanno ancora (la storia arriva dopo)
  await expect(grafo.locator(':scope > header')).toContainText('30 agenti in 3 lotti');
  await expect(grafo.locator('[data-sessione][aria-pressed="true"]'), 'la premessa: all’apertura è scelto chi lavora').toHaveCount(1);
  // arriva la storia: due richieste; la seconda ha avviato i dieci che lavorano
  await nuovaRichiesta(page, { testo: 'Prima richiesta', quando: at(5), seq: 50101 });
  await nuovaRichiesta(page, { testo: 'Seconda richiesta', quando: at(300), seq: 50103 });
  await eventoAgente(page, figli[20]); // la rilettura dal vivo che arriva comunque (qui la spinge un evento qualunque)
  await expect(grafo.locator('[data-richieste]'), 'la premessa: la richiesta mostrata è cambiata da sola').toBeVisible({ timeout: 8000 });
  await expect(grafo.locator(':scope > header')).toContainText('10 agenti in 1 lotto', { timeout: 8000 });
  await page.waitForTimeout(1500);
  const visto = await ciòCheSiVede(grafo);
  // all'apertura, con 10 agenti, il diagramma è al livello «agenti»: tutto aperto, e chi lavora scelto e visibile.
  // (Autore, cura del 14/10: la tela monta solo le schede che si VEDONO — misurato, un'apertura con gli stessi dieci agenti ne monta
  //  7 a 930×695 — quindi «aperto» si misura con le schede montate (prima della cura erano 0) e con la scelta in vista, non con 10.)
  expect(visto.schede, `con dieci agenti il lotto della richiesta è aperto, come a ogni apertura — ${JSON.stringify(visto)}`).toBeGreaterThan(0);
  expect(visto.scelto.length, `la scelta è su una scheda che si vede — ${JSON.stringify(visto)}`).toBe(1);
  await expect(grafo.locator(`[data-sessione="${visto.scelto[0]}"]`)).toBeInViewport();
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('RIV-T3-01 — «Apri questo agente nel diagramma» dal pannello su un agente di una richiesta PASSATA: chi arriva su un agente preciso ha già scelto (regola di T3), ma il diagramma si apre sull’ultima richiesta, senza di lui, e sceglie un ALTRO agente', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [finita('b', 11, 70, { taskCorto: 'Leggi il CSV' }), finita('c', 12, 80, { taskCorto: 'Controlla le valute', esitoDelega: 'fallito' }), figlia('e', 300, { taskCorto: 'Riscrivi le prove' }), finita('f', 301, 400, { taskCorto: 'Impagina' })];
  const { grafo, scritture } = await apri(page, figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }, { testo: 'Seconda richiesta', at: at(200) }] });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2); // la premessa: di serie l'ultima richiesta (e, f)
  await grafo.locator('.talos-wfg__torna').click();
  await expect(grafo).toHaveCount(0);
  // il pannello divide gli agenti per richiesta: quella passata è chiusa, la persona la apre e sceglie «c»
  await page.locator('#railAgenti').getByRole('button', { name: /Prima richiesta/u }).click();
  await page.locator('#railAgenti [data-sessione-figlia="c"]').click();
  /* pannello v2 (29/10/2026): il clic sulla riga apre il dettaglio NELLA riga; «Apri questo agente nel diagramma» è il suo «Mostra nel diagramma» (stessa azione: apriDiagramma({ figlia, tipo: 'deleghe' })) */
  await page.locator('#railAgenti [data-sessione-figlia="c"]').getByRole('button', { name: 'Mostra nel diagramma' }).click();
  const dopo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(dopo).toBeVisible();
  await page.waitForTimeout(1200);
  const visto = await ciòCheSiVede(dopo);
  expect(visto.scelto, `il diagramma è su «c», l’agente chiesto — ${JSON.stringify(visto)}`).toEqual(['c']);
  expect(visto.dettaglio ?? '', JSON.stringify(visto)).toContain('Controlla le valute');
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});
