/*
 * UI deleghe (owner 12/10/2026, approvata la sera stessa): le deleghe di una conversazione si vedono nel diagramma del Workflow
 * (`montaGrafoWorkflow` attraverso `grafo/run-dalle-deleghe.js`). È IL diagramma delle deleghe: la vista classica è stata tolta il 14/10/2026.
 * Le figlie hanno la forma vera di `GET …/children`. Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';
import { apri, at, figlia, finita, RADICE } from './aiuto-deleghe-diagramma.mjs'; // il banco comune delle prove del diagramma (scena, rotte, apertura)

test('DELEGHE-DIAGRAMMA-01 — di serie le deleghe stanno sul diagramma del Workflow: lotti, agenti, conti che tornano, nessun comando del run', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, [finita('a', 10, 70), finita('b', 11, 80, { esitoDelega: 'fallito' }), figlia('c', 300), figlia('d', 301, { approvalPendingCount: 1 })]);
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo.locator(':scope > header')).toContainText('4 agenti in 2 lotti, avviati da questa conversazione');
  await expect(grafo.locator(':scope > header')).toContainText('2 di 4 terminati'); // la conversazione non è un agente delegato
  await expect(grafo.locator('[data-sessione]')).toHaveCount(4); // i quattro agenti (la conversazione è la scheda in cima)
  await expect(grafo.locator('.gv-sessione')).toContainText('Sistema i listini');
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('data-stato', 'failed');
  await expect(grafo.locator('[data-sessione="d"]')).toHaveAttribute('data-stato', 'waiting_human');
  await expect(grafo.getByText(/^Fase \d/u)).toHaveCount(0); // le parole del Workflow non compaiono
  await expect(grafo.getByRole('button', { name: 'Pausa', exact: true })).toHaveCount(0); // i comandi del run sono del motore dei Workflow
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('title', /Compito a · z-ai\/glm-5\.3-flash/u);
  // il titolo del lotto è il solo nome; l'ora sta nella riga del conto (nel titolo andava a capo col punto appeso)
  await expect(grafo.locator('.gv-testa-nome').first()).toHaveText('Delega 1');
  await expect(grafo.locator('.gv-testa-conto').first()).toHaveText(/^\d\d:\d\d · 2 di 2 terminati · 1 da guardare$/u);
  // la testata riempie la sua larghezza anche con un nome corto: freccia e barra arrivano al bordo destro
  const testa = await grafo.locator('.gv-testa').first().evaluate((t) => {
    const r = (x) => x.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(t).paddingRight);
    return { bordo: r(t).right - pad, freccia: r(t.querySelector('.gv-testa-chiudi')).right, barra: r(t.querySelector('.gv-testa-sotto')).right };
  });
  expect(Math.abs(testa.bordo - testa.freccia)).toBeLessThan(2);
  expect(Math.abs(testa.bordo - testa.barra)).toBeLessThan(2);
  // AL CONTRARIO: agenti senza orario di nascita, niente ora e nessun punto appeso (DELEGHE-DIAGRAMMA-05 ha 4.999 agenti senza orario)
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-02 — la vista classica non c’è più: nessun pulsante per tornarci, e chi l’aveva scelta (la vecchia preferenza nel browser) apre lo stesso il diagramma delle deleghe', async ({ page }) => {
  /* fino al 14/10/2026 questa prova passava da «Vista classica» a «Diagramma nuovo» e ritorno. La preferenza restava nel browser
     ('0' = classica): chi l'aveva messa non deve trovarsi senza diagramma. */
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.deleghe-sul-diagramma.v1', '0'); } catch { /* */ } });
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11)]);
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo.locator('[data-sessione="a"]')).toBeVisible();
  await expect(grafo.getByRole('button', { name: /Vista classica|Diagramma nuovo/u })).toHaveCount(0);
  await expect(grafo.locator('[data-anteprima-deleghe]')).toHaveCount(0);
});

/* 13/10/2026: prima, senza agenti, si ricadeva sulla vista classica («senza agenti si vede la vista classica che lo dice»). Ora
   lo stato vuoto lo dice il diagramma nuovo: le sue prove stanno in `deleghe-diagramma-vuoto.spec.mjs`. */
test('DELEGHE-DIAGRAMMA-03 — senza agenti si apre comunque il diagramma NUOVO, nello stato vuoto (non più la vista classica)', async ({ page }) => {
  const { grafo } = await apri(page, []);
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo).toHaveAttribute('data-vuoto', 'true');
  await expect(grafo.getByRole('button', { name: 'Diagramma nuovo', exact: true })).toHaveCount(0);
});

test('DELEGHE-DIAGRAMMA-04 — in inglese: «batches», nessun pulsante «Classic view», nessuna parola italiana nella testata', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 10, 70), figlia('b', 11)], { lingua: 'en' });
  await expect(grafo.locator(':scope > header')).toContainText('2 agents in 1 batch, started by this conversation');
  await expect(grafo.getByRole('button', { name: /Classic view|New diagram/u })).toHaveCount(0);
  await expect(grafo.locator(':scope > header')).not.toContainText(/lott[oi]|agenti|avviati|terminati/u);
});

test('DELEGHE-DIAGRAMMA-05 — 4.999 agenti senza orario: un lotto solo, il conto raggruppato, e la tela non disegna cinquemila schede', async ({ page }) => {
  test.setTimeout(120_000);
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const tanti = Array.from({ length: 4999 }, (_, i) => ({ sessionId: `t${i}`, padreId: RADICE, taskCorto: `Agente ${i + 1}`, conclusa: i % 5 !== 0 }));
  const { grafo } = await apri(page, tanti);
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo.locator(':scope > header')).toContainText('4.999 agenti in 1 lotto');
  expect(await grafo.locator('[data-nodo-id]').count()).toBeLessThan(400);
  // era R4-GRAPH-5000-BOUNDED della vista classica («cinquemila sessioni non montano cinquemila nodi»): misurato il 14/10/2026, 96 schede montate e ~1.120 nodi in tutto il diagramma
  expect(await grafo.locator('*').count(), 'i nodi del diagramma con 4.999 agenti').toBeLessThan(3_000);
  await expect(grafo.locator('.gv-testa').first()).toContainText('3.999 di 4.999 terminati');
  await expect(grafo.locator('.gv-testa-nome').first()).toHaveText('Delega 1');
  await expect(grafo.locator('.gv-testa-conto').first()).not.toContainText(/\d\d:\d\d|· $|^ ·/u);
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-06 — diagramma e pannello Agenti si seguono nei due versi; la scheda in cima apre la conversazione', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 10, 70), figlia('b', 11), figlia('c', 12)]);
  // diagramma → pannello
  await grafo.locator('[data-sessione="b"]').click();
  await expect(page.locator('#railAgenti [data-sessione-figlia="b"]')).toHaveAttribute('data-evidenziata', 'true');
  await expect(page.locator('#railAgenti [data-sessione-figlia="a"]')).not.toHaveAttribute('data-evidenziata', 'true');
  await expect(page.locator('#railAgenti [data-sessione-figlia="b"]')).toHaveAttribute('aria-current', 'true');
  // pannello → diagramma (il diagramma resta aperto)
  await page.locator('#railAgenti [data-sessione-figlia="c"]').click();
  await expect(grafo.locator('[data-sessione="c"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#railAgenti [data-sessione-figlia="c"]')).toHaveAttribute('data-evidenziata', 'true');
  await expect(grafo).toBeVisible();
  // la scheda in cima è la conversazione: col tasto, apre il suo contesto
  await grafo.locator('.gv-sessione').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#railTabs [data-rail="contesto"]')).toHaveAttribute('aria-selected', 'true');
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-07 — «Segui» va sull\'agente al lavoro partito per ultimo, il pannello lo segue, e un clic della persona lo spegne', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, [finita('a', 10, 70), figlia('b', 11), figlia('c', 300), finita('d', 400, 420)]);
  const segui = grafo.locator('[data-segui]');
  await expect(segui).toBeVisible();
  await expect(segui).toHaveAttribute('aria-pressed', 'false');
  await segui.click();
  await expect(segui).toHaveAttribute('aria-pressed', 'true');
  // c è al lavoro ed è partito dopo b; d è partito dopo ancora ma ha finito
  await expect(grafo.locator('[data-sessione="c"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#railAgenti [data-sessione-figlia="c"]')).toHaveAttribute('data-evidenziata', 'true');
  // AL CONTRARIO: la persona sceglie un altro agente, «Segui» si spegne e non la riporta indietro
  await grafo.locator('[data-sessione="b"]').click();
  await expect(segui).toHaveAttribute('aria-pressed', 'false');
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-09 — al battito il diagramma prende i dati nuovi del server: un agente nuovo compare, uno finito cambia stato', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo, scritture } = await apri(page, figli);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  // il server cambia: a finisce, ne nasce uno nuovo (la rotta legge lo stesso elenco a ogni richiesta)
  figli.splice(0, 1, finita('a', 10, 30)); figli.push(figlia('z', 12));
  // un battito (5 s) + la rilettura: è la rete per ciò che non manda eventi (gli eventi in diretta arrivano subito, DELEGHE-DIAGRAMMA-13)
  await expect(grafo.locator('[data-sessione="z"]')).toBeVisible({ timeout: 7000 });
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'succeeded', { timeout: 1000 });
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-08 — AL CONTRARIO: senza agenti al lavoro «Segui» non sceglie nessuno', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 11, 80)]);
  await grafo.locator('[data-segui]').click();
  await expect(grafo.locator('[data-sessione][aria-pressed="true"]')).toHaveCount(0);
});

/*
 * Owner 12/10/2026 sera: «le deleghe si accodano a quella passata… bisogna differenziare le deleghe passate dalle deleghe nuove».
 * Decisione: «Una richiesta alla volta».
 */
const DUE_RICHIESTE = [{ at: at(0), testo: 'Sistema i listini' }, { at: at(200), testo: 'Risultato di un agente', origine: 'delega' }, { at: at(300), testo: 'Ora aggiungi le prove' }];
const DELEGHE_DI_DUE = () => [finita('a', 10, 70), finita('b', 12, 90), figlia('c', 320), figlia('d', 321)];

test('DELEGHE-DIAGRAMMA-10 — una richiesta alla volta: di serie le deleghe dell’ULTIMA richiesta, con i suoi conti; le passate dal selettore', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, DELEGHE_DI_DUE(), { richieste: DUE_RICHIESTE });
  // di serie: solo c e d (la richiesta delle 14:05), non le due già finite della richiesta di prima
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('[data-sessione="c"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione="a"]')).toHaveCount(0);
  await expect(grafo.locator(':scope > header')).toContainText('2 agenti in 1 lotto');
  await expect(grafo.locator(':scope > header')).toContainText('0 di 2 terminati');
  // il pannello Agenti fa lo stesso: la richiesta in corso aperta in cima, la passata ripiegata sotto col suo titolo e il suo conto
  const pannello = page.locator('#railAgenti');
  await expect(pannello.locator('.talos-agenti-richiesta')).toHaveCount(2);
  await expect(pannello.locator('.talos-agenti-richiesta').nth(0)).toContainText('Questa richiesta · Ora aggiungi le prove');
  await expect(pannello.locator('.talos-agenti-richiesta').nth(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(pannello.locator('.talos-agenti-richiesta').nth(1)).toContainText('Sistema i listini');
  await expect(pannello.locator('.talos-agenti-richiesta').nth(1)).toContainText('2 agenti · tutti finiti');
  await expect(pannello.locator('.talos-agenti-richiesta').nth(1)).toHaveAttribute('aria-expanded', 'false');
  await expect(pannello.locator('[data-sessione-figlia]')).toHaveCount(2);
  await expect(pannello.locator('[data-sessione-figlia="a"]')).toHaveCount(0);
  await pannello.locator('.talos-agenti-richiesta').nth(1).click();
  await expect(pannello.locator('[data-sessione-figlia="a"]')).toBeVisible();
  await expect(pannello.locator('[data-sessione-figlia]')).toHaveCount(4);
  // AL CONTRARIO: una ricerca apre anche la richiesta ripiegata (chi cerca un agente non sa in quale richiesta stava)
  await pannello.locator('.talos-agenti-richiesta').nth(1).click();
  await expect(pannello.locator('[data-sessione-figlia="a"]')).toHaveCount(0);
  await pannello.getByRole('searchbox').fill('Compito a');
  await expect(pannello.locator('[data-sessione-figlia="a"]')).toBeVisible();
  await pannello.getByRole('searchbox').fill('');
  const selettore = grafo.locator('[data-richieste]');
  await expect(selettore).toBeVisible();
  await expect(selettore.getByRole('button').first()).toContainText('Questa richiesta');
  // il selettore elenca le DUE richieste della persona (la ripartenza automatica non è una richiesta) e «Tutte»
  await selettore.getByRole('button').first().click();
  await expect(selettore.getByRole('menuitemradio')).toHaveCount(3);
  await expect(selettore.getByRole('menuitemradio').nth(0)).toContainText('Questa richiesta · Ora aggiungi le prove');
  await expect(selettore.getByRole('menuitemradio').nth(1)).toContainText(/Richiesta delle \d\d:\d\d · Sistema i listini/u);
  await expect(selettore.getByRole('menuitemradio').nth(1)).toContainText('2 agenti · tutti finiti');
  // la richiesta passata
  await selettore.getByRole('menuitemradio').nth(1).click();
  await expect(grafo.locator('[data-sessione="a"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione="c"]')).toHaveCount(0);
  await expect(grafo.locator(':scope > header')).toContainText('2 di 2 terminati');
  // tutte insieme
  await selettore.getByRole('button').first().click();
  await selettore.getByRole('menuitemradio', { name: /Tutte le richieste/u }).click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(4);
  await expect(selettore.getByRole('button').first()).toContainText('Tutte le richieste');
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-11 — AL CONTRARIO: una sola richiesta che ha delegato, nessun selettore, e tutto come prima', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 10, 70), figlia('b', 12)], { richieste: [DUE_RICHIESTE[0], { at: at(900), testo: 'Grazie' }] });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('[data-richieste]')).toBeHidden();
});

test('DELEGHE-DIAGRAMMA-12 — nel dettaglio il «⋯» apre il menu VERO della delega (lo stesso del pannello Agenti) e il dettaglio dice come è partito l’agente', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [figlia('a', 10, { avvio: 'da-solo' }), figlia('b', 11, { avvio: 'consentito' }), figlia('c', 12)]);
  await grafo.locator('[data-sessione="a"]').click();
  const dettaglio = grafo.locator('.gv-dettaglio');
  await expect(dettaglio).toBeVisible();
  await expect(dettaglio).toContainText('da solo');
  await dettaglio.locator('[data-focus-key="dettaglio:menu"]').click();
  /* il menu è quello dell'app (pannello Agenti): porta «Apri come sessione intera» e «Ferma questa delega»; quello del diagramma
     resta chiuso. Misurato: con la sola voce «Apri la conversazione» la prova non distingueva i due menu (ce l'hanno entrambi). */
  await expect(page.getByRole('menuitem', { name: 'Apri come sessione intera' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Ferma questa delega' })).toBeVisible();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-altro > .talos-wfg__menu')).toBeHidden();
  await page.keyboard.press('Escape');
  await grafo.locator('[data-sessione="b"]').click();
  await expect(dettaglio).toContainText('consentito da te');
  /* al contrario: senza il dato, il dettaglio non inventa come è partito */
  await grafo.locator('[data-sessione="c"]').click();
  await expect(dettaglio).not.toContainText('da solo');
  await expect(dettaglio).not.toContainText('consentito da te');
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-13 — un evento in diretta arriva al diagramma SUBITO, senza aspettare il battito di 5 s', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo, scritture } = await apri(page, figli);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  /* il server e l'evento dicono la STESSA cosa (misurato il 12/10: con la rotta rimasta indietro la rilettura cancellava
     l'evento, e la prova non distingueva il codice vecchio dal nuovo): nasce «z», e l'evento lo annuncia. */
  const nuova = figlia('z', 12);
  figli.push(nuova);
  const t0 = Date.now();
  await page.evaluate(([radice, agente]) => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', _sequenza: 60001, value: { version: 1, sessionId: radice, parentId: radice, childId: agente.sessionId, agent: agente } }, r.realSessionState.generation);
  }, [RADICE, nuova]);
  /* 1,5 s: ben sotto il battito (5 s, partito all'apertura del diagramma, pochi istanti fa) */
  await expect(grafo.locator('[data-sessione="z"]')).toBeVisible({ timeout: 1500 });
  expect(Date.now() - t0).toBeLessThan(2500);
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

/* Owner 13/10/2026 (mockup approvato; ciò che resta fuori dal filtro SPARISCE): le funzioni che aveva solo la vista classica. */
const scenaFiltri = () => [
  finita('a', 10, 70), figlia('b', 11),
  finita('c', 400, 460, { esitoDelega: 'fallito' }), figlia('d', 401, { inAttesaApprovazione: true }),
  figlia('e', 12, { padreId: 'b', parentId: 'b' }),
];

test('DELEGHE-DIAGRAMMA-14 — filtro per stato: il menu porta i conti, gli altri agenti spariscono, la riga sopra la tela lo dice e «Mostra tutti» li riporta', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, scenaFiltri());
  await expect(grafo.locator('[data-sessione]')).toHaveCount(5);
  await expect(grafo.locator('[data-mostrati]')).toBeHidden();
  const stato = grafo.locator('[data-filtro-stato]');
  await expect(stato.locator('> button')).toContainText('Tutti gli stati');
  await stato.locator('> button').click();
  await expect(stato.locator('[data-stato-id="all"] .talos-wfg__menu-conto')).toHaveText('5');
  await expect(stato.locator('[data-stato-id="working"] .talos-wfg__menu-conto')).toHaveText('2');
  await expect(stato.locator('[data-stato-id="waiting"] .talos-wfg__menu-conto')).toHaveText('1');
  await expect(stato.locator('[data-stato-id="failed"] .talos-wfg__menu-conto')).toHaveText('1');
  await stato.locator('[data-stato-id="failed"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await expect(grafo.locator('[data-sessione="c"]')).toBeVisible();
  await expect(stato.locator('> button')).toHaveAttribute('aria-pressed', 'true');
  await expect(stato.locator('> button')).toContainText('Non riusciti · 1');
  const riga = grafo.locator('[data-mostrati]');
  await expect(riga).toBeVisible();
  await expect(riga).toContainText('Si vede 1 agente su 5');
  await expect(riga).toContainText('solo: Non riusciti');
  /* la barra dei comandi resta su una riga */
  expect(await grafo.locator('.gv-comandi').evaluate((c) => new Set([...c.querySelectorAll(':scope > .gv-comandi-gruppo > *')].filter((x) => x.offsetParent).map((x) => Math.round(x.getBoundingClientRect().top / 20))).size)).toBe(1);
  await riga.getByRole('button', { name: 'Mostra tutti' }).click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(5);
  await expect(riga).toBeHidden();
  await expect(stato.locator('> button')).toHaveAttribute('aria-pressed', 'false');
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-15 — «Isola» dal dettaglio: restano l’agente e quelli che ha avviato, l’agente resta scelto, e dalla riga si torna a tutti', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, scenaFiltri());
  await grafo.locator('[data-sessione="b"]').click();
  const dettaglio = grafo.locator('.gv-dettaglio');
  await dettaglio.locator('[data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('[data-sessione="b"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione="e"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('aria-pressed', 'true');
  const riga = grafo.locator('[data-mostrati]');
  await expect(riga).toContainText('Si vedono 2 agenti su 5');
  await expect(riga).toContainText('solo «Compito b» e gli agenti che ha avviato');
  await riga.getByRole('button', { name: 'Mostra tutti' }).click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(5);
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('aria-pressed', 'true'); // la scelta della persona resta
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-16 — AL CONTRARIO: senza cartella nota «Tutta la cartella» è spenta e dice perché; uno stato senza agenti non si sceglie', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 10, 70), figlia('b', 11)]);
  const cartella = grafo.locator('[data-ambito] [data-ambito-id="cartella"]');
  await expect(cartella).toBeDisabled();
  await expect(cartella).toHaveAttribute('title', 'Questa conversazione non ha una cartella');
  await expect(grafo.locator('[data-ambito] [data-ambito-id="sessione"]')).toHaveAttribute('aria-checked', 'true');
  await grafo.locator('[data-filtro-stato] > button').click();
  await expect(grafo.locator('[data-filtro-stato] [data-stato-id="failed"]')).toBeDisabled();
  await expect(grafo.locator('[data-filtro-stato] [data-stato-id="working"]')).toBeEnabled();
});

test('DELEGHE-DIAGRAMMA-17 — ambito «Cartella»: le altre conversazioni della stessa cartella in un gruppo loro, e «Questa conversazione» le toglie', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const cartella = 'C:/progetti/listini';
  const altre = [
    { sessionId: 'altra-1', taskId: 'workspace', nome: 'Rivedi il README', modello: 'z-ai/glm-5.3-flash', conclusa: true, avviataAlle: at(2), cartella },
    { sessionId: 'altrove', taskId: 'workspace', nome: 'Un altro progetto', modello: 'z-ai/glm-5.3-flash', conclusa: true, avviataAlle: at(3), cartella: 'C:/progetti/altro' },
  ];
  const { grafo, scritture } = await apri(page, [finita('a', 10, 70), figlia('b', 11)], { cartella, altre });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  const tutta = grafo.locator('[data-ambito] [data-ambito-id="cartella"]');
  await expect(tutta).toBeEnabled();
  await tutta.click();
  await expect(tutta).toHaveAttribute('aria-checked', 'true');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await expect(grafo.locator('[data-sessione="altra-1"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione="altrove"]')).toHaveCount(0); // un'altra cartella resta fuori
  await expect(grafo).toContainText('Stessa cartella');
  /* la testata non spaccia le altre conversazioni per agenti di questa (foto vera del 13/10: «8 agents in 4 batches») */
  await expect(grafo.locator('.talos-wfg__cima')).toContainText('2 agenti in 1 lotto, avviati da questa conversazione · 1 altra conversazione in questa cartella');
  await grafo.locator('[data-ambito] [data-ambito-id="sessione"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-18 — conversazione RIAPERTA: i giri non portano l’ora (solo l’avvio degli attrezzi), e le richieste si distinguono lo stesso', async ({ page }) => {
  /* la forma vera del giornale (sessione 91f2b6e2 del 13/10/2026 sul 4177): `RunStarted` senza `at`, poi un `ToolCallStart` con
     `avviatoA`. Prima di questa cura le richieste restavano senza ora, venivano scartate, e i 6 agenti finivano tutti insieme. */
  const ms = (s) => Date.parse(at(s));
  const riaperta = [{ testo: 'Sistema i listini', avviatoA: ms(2) }, { testo: 'Risultato di un agente', origine: 'delega', avviatoA: ms(201) }, { testo: 'Ora aggiungi le prove', avviatoA: ms(302) }];
  const { grafo } = await apri(page, DELEGHE_DI_DUE(), { richieste: riaperta });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('[data-sessione="c"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione="a"]')).toHaveCount(0);
  await expect(grafo.locator('[data-richieste] > button')).toBeVisible();
  await grafo.locator('[data-richieste] > button').click();
  await expect(grafo.locator('[data-richieste] [role="menuitemradio"]')).toHaveCount(3); // due richieste + «tutte»: il rientro di un agente non è una richiesta
});

test('DELEGHE-DIAGRAMMA-19 — nel dettaglio la colonna «File»: prima i creati e i modificati, poi i letti; un clic apre il file nel pannello Files; senza file la colonna non c’è', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const file = [{ percorso: 'NOTE.md', letto: true, scritto: false, creato: false }, { percorso: 'src/csv.js', letto: true, scritto: true, creato: false }, { percorso: 'test/csv.test.js', letto: false, scritto: true, creato: true }];
  const { grafo } = await apri(page, [figlia('a', 10, { attivita: { file, fileTagliati: 2, chiamate: 5, passi: [] } }), figlia('b', 11)]);
  await grafo.locator('[data-sessione="a"]').click();
  const colonna = grafo.locator('.gv-dettaglio [data-file]');
  await expect(colonna).toBeVisible();
  await expect(colonna.locator('h4')).toHaveText('File · 5'); // tre elencati + due lasciati fuori dal server
  await expect(colonna.locator('[data-percorso]')).toHaveCount(3);
  expect(await colonna.locator('[data-percorso]').evaluateAll((v) => v.map((x) => `${x.querySelector('.talos-wfg__evidenza-nome').textContent} ${x.dataset.percorso}`)))
    .toEqual(['Creato test/csv.test.js', 'Modificato src/csv.js', 'Letto NOTE.md']);
  await expect(colonna).toContainText('e altri 2 file');
  /* le colonne non si accavallano: quella dei file sta fra le evidenze e il compito */
  const sinistra = await grafo.locator('.gv-dettaglio > *').evaluateAll((v) => v.filter((x) => x.offsetParent).map((x) => Math.round(x.getBoundingClientRect().left)));
  expect([...sinistra].sort((x, y) => x - y)).toEqual(sinistra);
  /* il clic apre il file nel lettore dell'app: si vede dalla richiesta del suo contenuto (una lettura, non una scrittura) */
  const chiesta = page.waitForRequest((r) => new URL(r.url()).pathname.endsWith('/file') && new URL(r.url()).searchParams.get('percorso') === 'src/csv.js', { timeout: 5000 });
  await colonna.locator('[data-percorso="src/csv.js"]').click();
  await chiesta;
  await expect(page.locator('#railTabs [data-rail="file"]')).toHaveAttribute('aria-selected', 'true');
  /* al contrario: un agente senza il fatto dei file non ha la colonna */
  await grafo.locator('[data-sessione="b"]').click();
  await expect(colonna).toBeHidden();
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-20 — la scheda in cima segue la conversazione dal vivo: al lavoro, finita, e un suo ERRORE o uno STOP non diventano «Conclusa»', async ({ page }) => {
  /* era RIPRESA-GRAFO-MADRE e RIPRESA-GRAFO-MADRE-ERRORE della vista classica. Portandole (13/10/2026) si è visto che sul
     diagramma nuovo, dopo un errore, la scheda diceva «Riuscito»: l'esito della conversazione sta in `ultimoEsito`.
     14/10/2026 (owner, «Quelle delle deleghe»): la conversazione dice il suo stato con le parole della barra laterale —
     «In corso», «Conclusa», «Non riuscita», «Interrotta» — non con quelle del run di un Workflow. */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 10, 70)]);
  const cima = grafo.locator('.gv-sessione');
  const manda = (eventi) => page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; const g = r.realSessionState.generation; for (const e of lista) r.handleRealEvent(e, g); }, eventi);
  await manda([{ type: 'RunStarted', _sequenza: 70000, input: { consegna: 'x' } }, { type: 'ToolCallStart', toolCallId: 'madre-live', toolCallName: 'leggi', _sequenza: 70001, avviatoA: Date.now() }]);
  await expect(cima).toContainText('In corso', { timeout: 2000 });
  await manda([{ type: 'ToolCallResult', toolCallId: 'madre-live', content: 'letto', _sequenza: 70002 }, { type: 'RunFinished', _sequenza: 70003 }]);
  await expect(cima).toContainText('Conclusa', { timeout: 2000 });
  await manda([{ type: 'RunStarted', _sequenza: 70004, input: { consegna: 'y' } }, { type: 'RunError', _sequenza: 70005, message: 'errore', code: 'x' }]);
  await expect(cima).not.toContainText('Conclusa', { timeout: 2000 });
  await expect(cima).toContainText('Non riuscita');
  await manda([{ type: 'RunStarted', _sequenza: 70006, input: { consegna: 'z' } }, { type: 'RunError', _sequenza: 70007, message: 'fermato', code: 'fermato' }]);
  await expect(cima).not.toContainText('Conclusa', { timeout: 2000 });
  await expect(cima).not.toContainText(/Non riuscit|Fallit/u); // fermata dalla persona: non è un fallimento
  await expect(cima).toContainText('Interrotta');
  await expect(cima).not.toContainText('Annullat');
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-21 — confini: un nipote in diretta entra sotto il suo agente, un evento di un’ALTRA conversazione non entra', async ({ page }) => {
  /* era RIPRESA-AGENTI-CONFINI della vista classica (la parte «collassa il ramo» era la sua forma: nel nuovo c'è «Isola») */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo } = await apri(page, figli);
  const manda = (value) => page.evaluate((v) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: v }, r.realSessionState.generation); }, value);
  const nipote = figlia('nipote', 40, { padreId: 'a', parentId: 'a', taskCorto: 'Nipote in diretta' });
  await manda({ version: 1, sessionId: RADICE, parentId: 'a', childId: 'nipote', reason: 'created', agent: nipote });
  await expect(grafo.locator('[data-sessione="nipote"]')).toBeVisible({ timeout: 2000 });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  const intruso = figlia('intruso', 41, { padreId: RADICE });
  /* 13/10/2026 (bugfixer, review): tolta la guardia sull'evento (`applicaEventoAgenti`: la conversazione dell'evento è questa?)
     la prova restava VERDE — l'intruso entrava nel diagramma (misurato: c'è a 50 ms e a 300 ms) e la rilettura di `/children`,
     dove non c'è, lo toglieva prima degli 800 ms. Ora si guarda se è MAI comparso, non se c'è alla fine. */
  await page.evaluate(() => { window.__intrusoVisto = false; new MutationObserver(() => { if (document.querySelector('[data-sessione="intruso"]')) window.__intrusoVisto = true; }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sessione'] }); });
  await manda({ version: 1, sessionId: 'estranea', parentId: RADICE, childId: 'intruso', reason: 'created', agent: intruso });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__intrusoVisto), 'l’intruso non compare nemmeno per un istante').toBe(false);
  await expect(grafo.locator('[data-sessione="intruso"]')).toHaveCount(0);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  /* il nipote sta col suo agente: isolando «a» restano lui e il nipote */
  await grafo.locator('[data-sessione="a"]').click();
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('[data-sessione="nipote"]')).toBeVisible();
  expect(errori).toEqual([]);
});

/* 13/10/2026 (bugfixer, review): la metà «un evento di un'ALTRA conversazione non entra» della 21 non difendeva la guardia di
   `applicaEventoAgenti` (tolta, la 21 restava verde, anche guardando se l'intruso compariva mai). Qui la scena più semplice, dove
   senza la guardia l'intruso SI VEDE (misurato: nel diagramma a 50 ms e a 300 ms, finché la rilettura del server non lo toglie). */
test('DELEGHE-DIAGRAMMA-21b — un evento che dichiara un’ALTRA conversazione non fa comparire il suo agente, nemmeno per un istante', async ({ page }) => {
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo } = await apri(page, figli);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await page.evaluate(() => { window.__intrusoVisto = false; new MutationObserver(() => { if (document.querySelector('[data-sessione="intruso"]')) window.__intrusoVisto = true; }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sessione'] }); });
  const intruso = figlia('intruso', 41, { padreId: RADICE });
  await page.evaluate((v) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: v }, r.realSessionState.generation); }, { version: 1, sessionId: 'estranea', parentId: RADICE, childId: 'intruso', reason: 'created', agent: intruso });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__intrusoVisto)).toBe(false);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  // AL CONTRARIO: lo stesso agente, annunciato da QUESTA conversazione (e che il server conosce), entra
  figli.push(intruso);
  await page.evaluate((v) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: v }, r.realSessionState.generation); }, { version: 1, sessionId: RADICE, parentId: RADICE, childId: 'intruso', reason: 'created', agent: intruso });
  await expect.poll(() => page.evaluate(() => window.__intrusoVisto), { timeout: 2000 }).toBe(true);
});

test('DELEGHE-DIAGRAMMA-22 — ciò che il server sa di più nuovo sostituisce lo stato arrivato in diretta e rimasto indietro', async ({ page }) => {
  /* era RIPRESA-GRAFO-RICONNESSIONE: un agente visto «al lavoro» da un evento in diretta è finito mentre il flusso taceva.
     Nel diagramma nuovo lo riporta la rilettura (il battito): lo stato in diretta non resta attaccato alla scheda. */
  const figli = [figlia('a', 10)];
  const { grafo } = await apri(page, figli);
  const nuova = figlia('z', 12);
  figli.push(nuova);
  await page.evaluate(([radice, agente]) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', _sequenza: 60001, value: { version: 1, sessionId: radice, parentId: radice, childId: agente.sessionId, agent: agente } }, r.realSessionState.generation); }, [RADICE, nuova]);
  await expect(grafo.locator('[data-sessione="z"]')).toHaveAttribute('data-stato', 'running', { timeout: 2000 });
  figli.splice(1, 1, finita('z', 12, 60)); // nessun evento: lo sa solo il server
  await expect(grafo.locator('[data-sessione="z"]')).toHaveAttribute('data-stato', 'succeeded', { timeout: 8000 });
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'running');
});

test('DELEGHE-DIAGRAMMA-23 — un agente che FINISCE in diretta cambia stato sulla sua scheda subito, anche se non nasce nessun altro agente', async ({ page }) => {
  /* il caso più comune dal vivo, e non era provato: DELEGHE-DIAGRAMMA-09 cambiava lo stato INSIEME alla nascita di un agente
     (struttura nuova ⇒ rilettura delle righe). A struttura invariata la scheda restava «al lavoro» (13/10/2026). */
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo } = await apri(page, figli);
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('data-stato', 'running');
  const finitaB = finita('b', 11, 60);
  figli.splice(1, 1, finitaB);
  await page.evaluate(([radice, agente]) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', _sequenza: 60002, value: { version: 1, sessionId: radice, parentId: radice, childId: agente.sessionId, reason: 'updated', agent: agente } }, r.realSessionState.generation); }, [RADICE, finitaB]);
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('data-stato', 'succeeded', { timeout: 1500 });
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'running');
  await expect(grafo.locator(':scope > header')).toContainText('1 di 2 terminati');
});

test('DELEGHE-DIAGRAMMA-24 — un’altra conversazione non eredita il diagramma: cambiando conversazione si chiude e torna la chat; «Torna alla chat» lo chiude', async ({ page }) => {
  /* era RIPRESA-GRAFO-NAVIGAZIONE (seconda metà) e la chiusura di RIPRESA-GRAFO-INGRESSI */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11)]);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await page.route('**/api/v1/sessions/dsd-altra/children', (r) => r.fulfill({ json: { ok: true, data: { figli: [] } } }));
  // il flusso dell'altra conversazione porta il suo confine fra storia e presente, come quello vero (senza, la chat resta sotto il velo)
  await page.route('**/api/v1/sessions/dsd-altra/events*', flussoConConfine);
  await page.evaluate(() => { window.__talosHarnessUiRuntime.passaASessione('dsd-altra', 'workspace', 'Altra conversazione'); });
  await attendiFineStoria(page);
  await expect(grafo).toHaveCount(0);
  await expect(page.locator('#schermoChat')).toBeVisible();
  await expect(page.locator('#conversation')).toHaveCSS('visibility', 'visible');
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-25 — una rilettura FALLITA non svuota il diagramma: le schede restano, e quando il server torna gli stati si aggiornano', async ({ page }) => {
  /* era RIPRESA-GRAFO-ERRORE */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo } = await apri(page, figli);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  let rotto = true;
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => (rotto
    ? r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Banco temporaneamente offline' } }) })
    : r.fulfill({ json: { ok: true, data: { figli: figli.map((a) => ({ ...a, conclusa: true, conclusaAlle: at(90), esitoDelega: 'concluso' })) } } })));
  await page.waitForTimeout(6500); // almeno un battito con il server rotto
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'running');
  rotto = false;
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'succeeded', { timeout: 8000 });
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('data-stato', 'succeeded');
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-26 — riproduzione: all’inizio nessuno ha ancora lavorato, a metà si vede chi lavorava, e «Torna al vivo» riporta a adesso', async ({ page }) => {
  /* era RIPRESA-REPLAY-PLAYER (seek) e RIPRESA-GRAFO-SNAPSHOT-INIZIALE della vista classica: la riproduzione del diagramma nuovo è
     quella del Workflow (WF-UI-REPLAY), dai fatti di nascita e fine degli agenti */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [finita('a', 10, 70), finita('b', 80, 200), figlia('c', 210)];
  const { grafo, scritture } = await apri(page, figli);
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await expect(grafo.locator('[data-sessione][data-stato="succeeded"]')).toHaveCount(2);
  await expect(grafo.locator('[data-sessione][data-stato="running"]')).toHaveCount(1);
  const cursore = grafo.getByRole('slider', { name: 'Istante della riproduzione' });
  await cursore.focus();
  await page.keyboard.press('Home'); // all'inizio: nessun passo fantasma, nessuno concluso
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(grafo.locator('[data-sessione][data-stato="succeeded"]')).toHaveCount(0);
  await expect(grafo.locator('.talos-wfg__aggiornato-ora')).toContainText('Riproduzione alle');
  /* 13/10/2026 (bugfixer, review): il titolo promette «a metà si vede chi lavorava», ma la prova guardava solo l'inizio — tolta
     dalla storia la FINE degli agenti restava verde. Si avanza a passi finché «a» ha finito e «b» lavora: quell'istante esiste
     (fra 1 min 20 s e 3 min 20 s), e «c» lì non è ancora nata. */
  let aMeta = false;
  for (let passo = 0; passo < 80 && !aMeta; passo += 1) {
    await page.keyboard.press('ArrowRight');
    aMeta = (await grafo.locator('[data-sessione="a"]').getAttribute('data-stato')) === 'succeeded' && (await grafo.locator('[data-sessione="b"]').getAttribute('data-stato')) === 'running';
  }
  expect(aMeta, 'a metà della storia: «a» ha finito, «b» lavora').toBe(true);
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(grafo.locator('[data-sessione="c"]')).not.toHaveAttribute('data-stato', /running|succeeded/u);
  /* in riproduzione un evento in diretta non sposta l'istante che si sta guardando */
  const istante = await cursore.getAttribute('aria-valuenow');
  figli.splice(2, 1, finita('c', 210, 260)); // il server e l'evento dicono la stessa cosa
  await page.evaluate(([radice, agente]) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', _sequenza: 60010, value: { version: 1, sessionId: radice, parentId: radice, childId: agente.sessionId, reason: 'updated', agent: agente } }, r.realSessionState.generation); }, [RADICE, finita('c', 210, 260)]);
  await page.waitForTimeout(1200);
  expect(await cursore.getAttribute('aria-valuenow')).toBe(istante);
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await grafo.getByRole('button', { name: 'Torna al vivo' }).click();
  await expect(rip).toHaveAttribute('data-attiva', 'false');
  await expect(grafo.locator('[data-sessione][data-stato="succeeded"]')).toHaveCount(3, { timeout: 7000 }); // ora anche c, finita nel frattempo
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

/* Owner 13/10/2026 («Collega la storia salvata»): la riproduzione legge la cronologia OSSERVATA del registro, come la classica. */
const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: RADICE, seq, at: at(secondi), coverage: 'complete', event, node });
const STORIA_OSSERVATA = () => {
  const a = figlia('a', 60);
  return [
    registrato(1, 0, { sessionId: RADICE, padreId: null, conclusa: false, avviataAlle: at(0), taskCorto: 'Sistema i listini' }, 'created'),
    registrato(2, 60, a, 'created'),
    registrato(3, 180, { ...a, inAttesaApprovazione: true }), // ha aspettato la persona: dai soli fatti di adesso non si saprebbe
    registrato(4, 300, { ...a, inAttesaApprovazione: false }),
    registrato(5, 420, finita('a', 60, 420)),
    registrato(6, 480, figlia('b', 480), 'created'),
  ];
};

test('DELEGHE-DIAGRAMMA-27 — la riproduzione rigioca la storia SALVATA dal registro: si rivede anche ciò che i fatti di adesso non dicono (un agente che aspettava te)', async ({ page }) => {
  /* era RIPRESA-REPLAY-HTTP-UI / -PLAYER della vista classica (`GET /sessions/:id/agent-timeline`, a pagine) */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const cronologia = { record: STORIA_OSSERVATA() };
  const { grafo, scritture } = await apri(page, [finita('a', 60, 420), figlia('b', 480)], { cronologia });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await expect(rip).toHaveAttribute('data-storia', 'registro');
  await expect(rip.locator('.gv-rip-nota')).toHaveText('Rigiocata dalla storia degli stati del registro');
  expect(cronologia.chiamate, 'la storia si legge a pagine fino in fondo').toBeGreaterThanOrEqual(3);
  const cursore = grafo.getByRole('slider', { name: 'Istante della riproduzione' });
  await cursore.focus();
  await page.keyboard.press('Home');
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  const visti = [];
  const guarda = async () => { const s = (await grafo.locator('[data-sessione="a"]').getAttribute('data-stato')) ?? 'nessuno'; if (visti.at(-1) !== s) visti.push(s); };
  await guarda();
  for (let i = 0; i < 12; i += 1) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); await guarda(); }
  expect(visti.filter((s) => s !== 'pending' && s !== 'nessuno'), `stati di «a» nel tempo: ${visti.join(' → ')}`).toEqual(['running', 'waiting_human', 'running', 'succeeded']);
  expect(['pending', 'nessuno']).toContain(visti[0]); // all'inizio «a» non era ancora nato
  await grafo.getByRole('button', { name: 'Torna al vivo' }).click();
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'succeeded');
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-28 — la storia non si legge: la barra lo DICE con «Riprova», il diagramma dal vivo resta, e riprovando torna; senza registro si rigioca dai fatti e lo si dichiara', async ({ page }) => {
  /* era RIPRESA-REPLAY-ERRORE della vista classica */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const cronologia = { record: STORIA_OSSERVATA(), rotta: true };
  const { grafo } = await apri(page, [finita('a', 60, 420), figlia('b', 480)], { cronologia });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-storia', 'errore');
  await expect(rip.locator('.gv-rip-errore')).toContainText('La storia non si è potuta leggere');
  await expect(rip.locator('.gv-rip-nota')).toBeHidden();
  await expect(rip).toHaveAttribute('data-pronta', 'false'); // niente riproduzione su una storia che non c'è
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2); // il vivo non dipende dalla storia
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('data-stato', 'running');
  /* «Riprova» rilegge DAVVERO, e SUBITO. Misurato il 13/10/2026: finché la lettura fallisce il diagramma riprova anche da solo,
     ogni 1-2 secondi (mai a meno di 0,9 s da una lettura all'altra). Perché la prova misuri il PULSANTE e non quelle riletture:
     si aspetta una rilettura automatica fallita, e in quell'istante il server torna e si preme (in un colpo, dentro la pagina) —
     la lettura nuova deve partire entro 0,7 s, prima che possa arrivare la prossima automatica.
     ⛔ Le due stesure di prima: il clic di Playwright cadeva 2 volte su 4 (la rilettura automatica trovava la storia tornata
     buona prima del clic e «Riprova» spariva); con 2 s di attesa la prova passava anche col pulsante SPENTO (mutazione). */
  await expect(rip.getByRole('button', { name: 'Riprova' })).toBeVisible();
  const fallite = cronologia.chiamate;
  await expect.poll(() => cronologia.chiamate, { timeout: 12_000, intervals: [25], message: 'una rilettura automatica (fallita) è appena passata' }).toBeGreaterThan(fallite);
  cronologia.rotta = false;
  const prima = cronologia.chiamate;
  await rip.locator('[data-azione="riprova-storia"]').evaluate((b) => b.click());
  await expect.poll(() => cronologia.chiamate, { timeout: 700, intervals: [25], message: '«Riprova» rilegge subito' }).toBeGreaterThan(prima);
  await expect(rip).toHaveAttribute('data-storia', 'registro', { timeout: 3000 });
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await expect(rip.locator('.gv-rip-errore')).toBeHidden();
  expect(errori).toEqual([]);
});

test('DELEGHE-DIAGRAMMA-29 — AL CONTRARIO: un registro senza storia per questa conversazione ⇒ si rigioca dai fatti, e la barra dice QUALE storia è', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 60, 420), figlia('b', 480)]);
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await expect(rip).toHaveAttribute('data-storia', 'fatti');
  await expect(rip.locator('.gv-rip-nota')).toHaveText('Rigiocata dall’inizio e dalla fine di ogni agente');
  const cursore = grafo.getByRole('slider', { name: 'Istante della riproduzione' });
  await cursore.focus();
  await page.keyboard.press('Home');
  const visti = [];
  for (let i = 0; i < 12; i += 1) { const s = (await grafo.locator('[data-sessione="a"]').getAttribute('data-stato')) ?? 'nessuno'; if (visti.at(-1) !== s) visti.push(s); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); }
  expect(visti).not.toContain('waiting_human'); // dai fatti di adesso l'attesa di allora non si può sapere: e non la si inventa
});

/* Misura del 13/10/2026: con ambito, richiesta e stato la barra andava su TRE righe a 1440×900 e 1024×800 (pannello di destra
   aperto), e su due già a 1920 in italiano. Qui la forma che deve tenere. */
const barra = (grafo) => grafo.evaluate((g) => {
  const c = g.querySelector('.gv-comandi'); const gb = g.getBoundingClientRect();
  const visibili = [...c.querySelectorAll(':scope > .gv-comandi-gruppo > *')].filter((x) => x.offsetParent);
  const nome = (x) => (x.dataset.ambito !== undefined ? 'ambito' : x.dataset.richieste !== undefined ? 'richieste' : x.dataset.filtroStato !== undefined ? 'stato' : x.dataset.segui !== undefined ? 'segui' : x.dataset.attivita !== undefined ? 'attivita' : x.classList.contains('gv-viste') ? 'viste' : x.classList.contains('gv-percorso') ? 'percorso' : 'attrezzo');
  const righe = new Map();
  for (const x of visibili) { const t = Math.round(x.getBoundingClientRect().top / 10); if (!righe.has(t)) righe.set(t, []); righe.get(t).push(nome(x)); }
  return { righe: [...righe.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v), fuori: visibili.filter((x) => { const b = x.getBoundingClientRect(); return b.right > gb.right + 1 || b.left < gb.left - 1; }).length,
    tagliati: [...c.querySelectorAll('button')].filter((x) => x.offsetParent && x.scrollWidth > x.clientWidth + 1).length, sborda: c.scrollWidth > c.clientWidth + 1 };
});

for (const lingua of ['it', 'en']) {
  test(`DELEGHE-DIAGRAMMA-30 (${lingua}) — la barra dei comandi: UNA riga a 1920, DUE righe ordinate quando il diagramma è stretto (che cosa si guarda / come), niente fuori o tagliato`, async ({ page }) => {
    const { grafo } = await apri(page, DELEGHE_DI_DUE(), { lingua, richieste: DUE_RICHIESTE, cartella: 'C:/progetti/listini' });
    const larga = await barra(grafo);
    expect(larga.righe.length, `1920 ${lingua}: ${JSON.stringify(larga.righe)}`).toBe(1);
    expect([larga.fuori, larga.tagliati, larga.sborda]).toEqual([0, 0, false]);
    for (const [w, h] of [[1440, 900], [1024, 800]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(400);
      const stretta = await barra(grafo);
      expect(stretta.righe.length, `${w}x${h} ${lingua}: ${JSON.stringify(stretta.righe)}`).toBe(2);
      expect(stretta.righe[0]).toEqual(['ambito', 'richieste', 'stato', 'attivita']); // che cosa si guarda (in fondo, il pulsante dell'attività recente)
      expect(stretta.righe[1].slice(0, 3)).toEqual(['viste', 'percorso', 'segui']); // come
      expect([stretta.fuori, stretta.tagliati, stretta.sborda]).toEqual([0, 0, false]);
    }
    /* stretta, la voce NON scelta di una scelta a segmenti è solo l'icona: il nome resta per i lettori di schermo e nel `title` */
    const nonScelta = grafo.locator('[data-ambito] [data-ambito-id="cartella"]');
    await expect(nonScelta).toHaveAttribute('aria-checked', 'false');
    expect(await nonScelta.locator('span').evaluate((s) => s.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    await expect(grafo.getByRole('radio', { name: lingua === 'it' ? 'Cartella' : 'Whole folder' })).toBeVisible();
    expect((await nonScelta.getAttribute('title')) ?? '').not.toBe('');
    /* e si usa ancora: scelta, prende la scritta */
    await nonScelta.click();
    await expect(nonScelta).toHaveAttribute('aria-checked', 'true');
    expect(await nonScelta.locator('span').evaluate((s) => s.getBoundingClientRect().width)).toBeGreaterThan(20);
  });
}

/* 13/10/2026 (bugfixer, review): in riproduzione la scheda in cima diceva la durata di ADESSO («52 min» alle 10:16 rigiocate),
   non quella dell'istante che si guarda. Qui la conversazione è nata il 12/10 alle 14:00: dal vivo dura ore, all'inizio della
   storia secondi, e dentro la storia mai più dei suoi 3 minuti e mezzo. */
test('DELEGHE-DIAGRAMMA-31 — riproduzione: la scheda in cima dice la durata DELL’ISTANTE rigiocato, non quella di adesso; al vivo torna quella di adesso', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 80, 200), figlia('c', 210)]);
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  const durata = grafo.locator('.talos-wfg__coordinatore-riga .talos-wfg__passo-durata');
  await expect(durata).toHaveText(/^\d+ h \d+ min$/u); // dal vivo: la conversazione è nata ieri e non ha finito
  const cursore = grafo.getByRole('slider', { name: 'Istante della riproduzione' });
  await cursore.focus();
  await page.keyboard.press('Home');
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(durata).toHaveText(/^\d+ s$/u); // all'inizio della storia (10 s dopo la nascita della conversazione)
  await page.keyboard.press('ArrowRight'); // un passo avanti nella storia: ancora riproduzione, ancora dentro i 3 min 30 s della storia
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(durata).toHaveText(/^(\d+ s|[0-3] min)$/u);
  await grafo.getByRole('button', { name: 'Torna al vivo' }).click();
  await expect(rip).toHaveAttribute('data-attiva', 'false');
  await expect(durata).toHaveText(/^\d+ h \d+ min$/u);
  expect(errori).toEqual([]);
});
