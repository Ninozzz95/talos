/*
 * 13/10/2026 (bugfixer, lotto 3, SECONDA PASSATA) — revisione avversaria di `d0a397649`: le cure delle riserve della parte A, le
 * decisioni dell'owner sul diagramma (D9, D10, D14, D15), il nome breve.
 * Come nella prima passata: `[REGGE]` = ho provato a romperlo e ha retto; `[DIFETTO]` = consegnata rossa alla sessione desktop
 * (i file del diagramma sono suoi). Solo letture: ogni scrittura si ferma e si conta (banco comune).
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, finita, RADICE } from './aiuto-deleghe-diagramma.mjs';

const DUE_RICHIESTE = [{ at: at(0), testo: 'Sistema i listini' }, { at: at(300), testo: 'Ora aggiungi le prove' }];
const DELEGHE_DI_DUE = () => [finita('a', 10, 70, { taskCorto: 'Correggi i prezzi' }), finita('b', 12, 90, { taskCorto: 'Leggi il CSV' }), finita('e', 20, 60, { padreId: 'b', parentId: 'b', taskCorto: 'Conta le righe' }),
  figlia('c', 320, { taskCorto: 'Riscrivi le prove' }), figlia('d', 321, { taskCorto: 'Controlla le valute' })];
const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: RADICE, seq, at: at(secondi), coverage: 'complete', event, node });

/* ——— R1 di nuovo: a 2560 (a 1920 c'è già `REVISIONE-BARRA`, da lanciare con --repeat-each=10) ——— */
for (const lingua of ['it', 'en']) {
  test(`SECONDA-BARRA (${lingua}, 2560) [REGGE] — nessun «ResizeObserver loop», nessun errore di pagina, la barra non oscilla`, async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    await page.addInitScript(() => { window.__ro = []; window.addEventListener('error', (e) => { if (/ResizeObserver/iu.test(String(e.message))) window.__ro.push(e.message); }); });
    const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 310, 400), figlia('c', 610)], { lingua, finestra: { width: 2560, height: 1200 },
      richieste: [{ at: at(0), testo: 'Sistema i listini' }, { at: at(300), testo: 'Ora aggiungi le prove' }, { at: at(600), testo: 'Grazie, basta così' }] });
    const barra = grafo.locator('.gv-comandi');
    await barra.evaluate((n) => { window.__cambi = 0; new MutationObserver(() => { window.__cambi += 1; }).observe(n, { attributes: true, attributeFilter: ['data-compatta'] }); });
    const richieste = grafo.locator('[data-richieste]');
    for (const voce of [1, 2, 0]) { await richieste.locator('> button').click(); await richieste.locator('[role="menuitemradio"]').nth(voce).click(); await page.waitForTimeout(250); }
    for (const larghezza of [2500, 1700, 2560, 1300, 2560]) { await page.setViewportSize({ width: larghezza, height: 1200 }); await page.waitForTimeout(250); }
    const prima = await page.evaluate(() => window.__cambi);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__cambi), 'a riposo la barra non cambia forma da sola').toBe(prima);
    expect(prima, 'pochi cambi di forma in tutto').toBeLessThanOrEqual(16);
    expect(await page.evaluate(() => window.__ro)).toEqual([]);
    expect(errori).toEqual([]);
  });
}

/* ——— D14 ——— */
test('SECONDA-D14-01 [REGGE] — l’avviso «il ramo non è più isolato» resta dopo un aggiornamento dal vivo, e «Cartella» scelta dopo lo toglie', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = DELEGHE_DI_DUE();
  const { grafo } = await apri(page, () => figli, { richieste: DUE_RICHIESTE, cartella: 'C:/progetti/listini' });
  const selettore = grafo.locator('[data-richieste]');
  const scegli = async (n) => { await selettore.getByRole('button').first().click(); await selettore.getByRole('menuitemradio').nth(n).click(); };
  await scegli(1);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await grafo.locator('[data-sessione="b"]').click();
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await scegli(0);
  const avviso = grafo.locator('[data-mostrati] [data-isolamento-tolto]');
  await expect(avviso).toBeVisible();
  await expect(avviso).toContainText('Leggi il CSV');
  // un aggiornamento dal vivo (c finisce): la struttura si rilegge, l'avviso resta
  figli.splice(3, 1, finita('c', 320, 380, { taskCorto: 'Riscrivi le prove' }));
  await eventoAgente(page, figli[3], 'finished');
  await expect(grafo.locator('[data-sessione="c"]')).toHaveAttribute('data-stato', 'succeeded');
  await expect(avviso).toBeVisible();
  // un'altra scelta della persona (l'ambito) lo toglie
  await grafo.locator('[data-ambito] [data-ambito-id="cartella"]').click();
  await expect(avviso).toBeHidden();
  expect(errori).toEqual([]);
});

/* ——— D9 ——— */
test('SECONDA-D9-01 [DIFETTO] — un registro che dichiara buchi e non ha NESSUN record leggibile: la riproduzione non resta su «Carico la storia…» per sempre (si rigioca dai fatti, come quando il registro non c’è)', async ({ page }) => {
  /* Il server può rispondere così: `agent-timeline.mjs`, `ripristina` — un file della cronologia in cui NESSUN record è valido lascia
     uno stream con `coverage: 'partial'` e zero voci. Oggi: `data-pronta="false"`, «Carico la storia…» senza fine accanto a
     «Storia del registro incompleta». Vale anche con `coverage: 'complete'` e zero voci (misurato con una sonda). */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 60, 420)], { cronologia: { record: [], coverage: 'partial' } });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true', { timeout: 10_000 });
  const testo = (await rip.innerText()).replace(/\s+/gu, ' ');
  expect(testo).not.toMatch(/null|undefined|NaN|Invalid/u);
  expect(errori).toEqual([]);
});

test('SECONDA-D9-02 [REGGE] — registro, poi errore, poi di nuovo registro: la nota «incompleta» non si perde per strada', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 60)];
  const cronologia = { record: [registrato(1, 30, { sessionId: RADICE, padreId: null, conclusa: false, avviataAlle: at(0), taskCorto: 'Sistema i listini' }, 'created'), registrato(2, 60, figlia('a', 60), 'created')], coverage: 'partial' };
  const { grafo } = await apri(page, () => figli, { cronologia });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-copertura', 'partial');
  cronologia.rotta = true;
  cronologia.record.push(registrato(3, 420, finita('a', 60, 420)));
  figli.splice(0, 1, finita('a', 60, 420));
  await eventoAgente(page, figli[0], 'finished');
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'succeeded');
  cronologia.rotta = false;
  await eventoAgente(page, figli[0], 'updated');
  await expect(rip).toHaveAttribute('data-storia', 'registro', { timeout: 15_000 });
  await expect(rip).toHaveAttribute('data-copertura', 'partial', { timeout: 15_000 });
  expect(errori).toEqual([]);
});

/* ——— il dettaglio dai fatti, in riproduzione ——— */
test('SECONDA-DETTAGLIO-01 [REGGE] — in riproduzione il dettaglio non anticipa: prima dell’inizio dell’agente niente «Concluso», e al vivo torna com’è', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 10, 70, { taskCorto: 'Correggi i prezzi' }), finita('b', 200, 400, { taskCorto: 'Leggi il CSV' })]);
  await expect(grafo.locator('.gv-rip')).toHaveAttribute('data-pronta', 'true');
  await grafo.locator('[data-sessione="b"]').click();
  const dettaglio = grafo.locator('.gv-dettaglio');
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Leggi il CSV');
  const cursore = grafo.getByRole('slider', { name: 'Istante della riproduzione' });
  await cursore.focus();
  await page.keyboard.press('Home');
  await expect(grafo.locator('.gv-rip')).toHaveAttribute('data-attiva', 'true');
  await expect(grafo.locator('[data-sessione="b"]')).not.toHaveAttribute('data-stato', /succeeded|running/u);
  // all'inizio della storia «b» non era partito: il suo dettaglio, se è aperto, non dice che ha concluso né un intervallo di ore
  if (await dettaglio.locator('.talos-wfg__dettaglio-nome').count()) {
    await expect(dettaglio.locator('.talos-wfg__passo-modello').first()).not.toContainText('–');
    await expect(dettaglio).not.toContainText('Concluso');
  }
  expect(errori).toEqual([]);
});

/* ——— un id POSIZIONALE che tiene memoria attraverso un cambio di struttura (chiesto dal coordinatore: «quelli sì dimmeli») ——— */
test('SECONDA-POSIZIONE-01 [DIFETTO?] — l’agente SCELTO resta lui quando il filtro per stato cambia le posizioni: il dettaglio non passa a un altro agente', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  // a ha finito; b e c lavorano. Tutti: a=0, b=1, c=2. Solo «al lavoro»: b=0, c=1 ⇒ l'id posizionale di b diventa quello che era di a,
  // e quello che era di b passa a c.
  const { grafo } = await apri(page, [finita('a', 10, 70, { taskCorto: 'Agente A' }), figlia('b', 12, { taskCorto: 'Agente B' }), figlia('c', 14, { taskCorto: 'Agente C' })]);
  const dettaglio = grafo.locator('.gv-dettaglio');
  await grafo.locator('[data-sessione="b"]').click();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente B');
  const stato = grafo.locator('[data-filtro-stato]');
  await stato.locator('> button').click();
  await stato.locator('[data-stato-id="working"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await page.waitForTimeout(600);
  // o il dettaglio è ancora di B, o è chiuso: MAI di C (né di A)
  const nomi = await dettaglio.locator('.talos-wfg__dettaglio-nome').allTextContents();
  expect(nomi.filter((n) => n !== 'Agente B'), `il dettaglio dopo il filtro: ${JSON.stringify(nomi)}`).toEqual([]);
  // e la scheda segnata come scelta, se c'è, è quella di B
  const scelte = await grafo.locator('[data-sessione][aria-pressed="true"], [data-sessione][data-selezionato="true"], [data-sessione].gv-passo--scelto, [data-sessione][aria-selected="true"]').evaluateAll((n) => n.map((x) => x.dataset.sessione));
  expect(scelte.filter((s) => s !== 'b'), `schede segnate come scelte: ${JSON.stringify(scelte)}`).toEqual([]);
  // tolto il filtro: di nuovo B, non A né C
  await grafo.locator('[data-mostrati]').getByRole('button').first().click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await page.waitForTimeout(600);
  const dopo = await dettaglio.locator('.talos-wfg__dettaglio-nome').allTextContents();
  expect(dopo.filter((n) => n !== 'Agente B'), `il dettaglio tolto il filtro: ${JSON.stringify(dopo)}`).toEqual([]);
  expect(errori).toEqual([]);
});

test('SECONDA-POSIZIONE-02 [DIFETTO?] — il blocco CHIUSO dalla persona resta chiuso lui quando un filtro toglie il blocco prima: non si chiude quello che ne prende il posto', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  // due lotti: il primo (a, finito) e il secondo (b e c, al lavoro)
  const { grafo } = await apri(page, [finita('a', 10, 70, { taskCorto: 'Agente A' }), figlia('b', 300, { taskCorto: 'Agente B' }), figlia('c', 301, { taskCorto: 'Agente C' })]);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  const blocchi = grafo.locator('.gv-blocco, [data-blocco]');
  const quanti = await blocchi.count();
  test.skip(quanti < 2, `la scena non ha dato due blocchi (${quanti}): niente da provare qui`);
  // chiudo il PRIMO blocco (quello di a) col suo pulsante
  await blocchi.first().getByRole('button').first().click();
  await expect(grafo.locator('[data-sessione="a"]')).toBeHidden();
  await expect(grafo.locator('[data-sessione="b"]')).toBeVisible();
  // filtro «al lavoro»: il blocco di a sparisce, quello di b e c diventa il primo
  const stato = grafo.locator('[data-filtro-stato]');
  await stato.locator('> button').click();
  await stato.locator('[data-stato-id="working"]').click();
  await page.waitForTimeout(600);
  await expect(grafo.locator('[data-sessione="b"]'), 'il lotto di b e c non l’ha chiuso nessuno').toBeVisible();
  await expect(grafo.locator('[data-sessione="c"]')).toBeVisible();
  expect(errori).toEqual([]);
});
