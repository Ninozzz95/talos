/*
 * CURE DELLA RIVERIFICA (14/10/2026), le prove dell'autore accanto a quelle del revisore (`deleghe-diagramma-riverifica-cure.spec.mjs`).
 * RIV-T3-01 il revisore l'ha provata all'APERTURA del diagramma; «a diagramma già aperto» l'ha letta e non provata: è qui.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, at, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

const scelti = (grafo) => grafo.locator('[data-sessione][aria-pressed="true"]').evaluateAll((n) => n.map((x) => x.dataset.sessione));

test('RIV-T3-02 — a diagramma GIÀ aperto, un agente di una richiesta passata scelto nel pannello Agenti: il diagramma guarda la sua richiesta e lo sceglie in vista, non apre la sua conversazione — AL CONTRARIO un agente dell’ultima richiesta resta lì com’era', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [finita('b', 11, 70, { taskCorto: 'Leggi il CSV' }), finita('c', 12, 80, { taskCorto: 'Controlla le valute', esitoDelega: 'fallito' }), figlia('e', 300, { taskCorto: 'Riscrivi le prove' }), finita('f', 301, 400, { taskCorto: 'Impagina' })];
  const { grafo, scritture } = await apri(page, figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }, { testo: 'Seconda richiesta', at: at(200) }] });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2); // la premessa: di serie l'ultima richiesta (e, f)
  // AL CONTRARIO: un agente della richiesta mostrata si sceglie e basta
  await page.locator('#railAgenti [data-sessione-figlia="f"]').click();
  await expect.poll(() => scelti(grafo)).toEqual(['f']);
  const menu = grafo.locator('[data-richieste] > button');
  const etichettaPrima = (await menu.innerText()).trim();
  // la richiesta passata nel pannello, poi «c»
  await page.locator('#railAgenti').getByRole('button', { name: /Prima richiesta/u }).click();
  await page.locator('#railAgenti [data-sessione-figlia="c"]').click();
  await expect.poll(() => scelti(grafo), { timeout: 8000 }).toEqual(['c']);
  await expect(grafo, 'il diagramma resta aperto: non si è aperta la conversazione dell’agente').toBeVisible();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa')).toContainText('Controlla le valute');
  await expect(grafo.locator('[data-sessione="c"]')).toBeInViewport();
  // il menu dice che si guarda un'altra richiesta (le chiama per ora: «Richiesta delle …»)
  await expect.poll(async () => (await menu.innerText()).trim(), { message: 'il menu dice la richiesta che si guarda' }).not.toBe(etichettaPrima);
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

const nuovaRichiesta = (page, { testo, quando, seq }) => page.evaluate(({ t, q, s }) => {
  const r = window.__talosHarnessUiRuntime; const g = r.realSessionState.generation;
  r.handleRealEvent({ type: 'RunStarted', _sequenza: s, at: q, input: { consegna: t }, contesto: { modello: 'z-ai/glm-5.3-flash' } }, g);
}, { t: testo, q: quando, s: seq });

test('RIV-T4-05 — la richiesta mostrata cambia DA SOLA mentre la persona aveva ingrandito la tela su un altro punto: il diagramma si apre come a ogni apertura e l’agente scelto è in vista — non resta la vista di prima su un posto vuoto', async ({ page }) => {
  const { eventoAgente } = await import('./aiuto-deleghe-diagramma.mjs');
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const lotto = (k, nascita, vivo) => Array.from({ length: 10 }, (_, i) => (vivo ? figlia(`l${k}-${i}`, nascita + i, { taskCorto: `Agente ${k}.${i + 1}` }) : finita(`l${k}-${i}`, nascita + i, nascita + 40 + i, { taskCorto: `Agente ${k}.${i + 1}` })));
  const figli = [...lotto(1, 10, false), ...lotto(2, 100, false), ...lotto(3, 400, true)];
  const { grafo, scritture } = await apri(page, () => figli); // le richieste non si sanno ancora
  await expect(grafo.locator(':scope > header')).toContainText('30 agenti in 3 lotti');
  // la persona ingrandisce molto e sposta la tela lontano
  for (let i = 0; i < 8; i++) await grafo.getByRole('button', { name: 'Aumenta lo zoom del 10%' }).click();
  const tela = grafo.locator('.gv-tela').first();
  const r = await tela.boundingBox();
  await page.mouse.move(r.x + 40, r.y + 40); await page.mouse.down(); await page.mouse.move(r.x + r.width - 40, r.y + r.height - 40, { steps: 8 }); await page.mouse.up();
  await nuovaRichiesta(page, { testo: 'Prima richiesta', quando: at(5), seq: 50101 });
  await nuovaRichiesta(page, { testo: 'Seconda richiesta', quando: at(300), seq: 50103 });
  await eventoAgente(page, figli[20]);
  await expect(grafo.locator(':scope > header')).toContainText('10 agenti in 1 lotto', { timeout: 8000 });
  await page.waitForTimeout(1500);
  const scelto = await scelti(grafo);
  expect(scelto).toHaveLength(1);
  await expect(grafo.locator(`[data-sessione="${scelto[0]}"]`), 'l’agente scelto si vede').toBeInViewport();
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

for (const [id, chi, passata, nome] of [['RIV-T3-03', 'c', true, 'Controlla le valute'], ['RIV-T3-04', 'f', false, 'Impagina']]) {
  test(`${id} — a diagramma aperto, un agente ${passata ? 'di una richiesta PASSATA' : 'della richiesta mostrata'} NASCOSTO dal filtro per stato: chi arriva su un agente preciso ha già scelto (regola di T3), il filtro cade e l’agente è scelto in vista — mai una richiesta cambiata con «0 agenti» e nessuno scelto (misurato prima della cura)`, async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    const figli = [finita('b', 11, 70, { taskCorto: 'Leggi il CSV' }), finita('c', 12, 80, { taskCorto: 'Controlla le valute', esitoDelega: 'fallito' }), figlia('e', 300, { taskCorto: 'Riscrivi le prove' }), finita('f', 301, 400, { taskCorto: 'Impagina' })];
    const { grafo, scritture } = await apri(page, figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }, { testo: 'Seconda richiesta', at: at(200) }] });
    await grafo.locator('[data-filtro-stato] > button').click();
    await grafo.locator('[data-filtro-stato] [data-stato-id="working"]').click();
    await expect(grafo.locator('[data-sessione]')).toHaveCount(1); // la premessa: solo «e», al lavoro
    if (passata) await page.locator('#railAgenti').getByRole('button', { name: /Prima richiesta/u }).click();
    await page.locator(`#railAgenti [data-sessione-figlia="${chi}"]`).click();
    await expect.poll(() => scelti(grafo), { timeout: 8000 }).toEqual([chi]);
    await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa')).toContainText(nome);
    await expect(grafo.locator(`[data-sessione="${chi}"]`)).toBeInViewport();
    await expect(grafo.locator('[data-filtro-stato] > button'), 'il filtro è caduto').toHaveAttribute('aria-pressed', 'false');
    expect(scritture).toEqual([]);
    expect(errori).toEqual([]);
  });
}

test('RIV-T3-05 — AL CONTRARIO: a diagramma aperto, un agente di una richiesta passata che il filtro della persona MOSTRA («Non riusciti», ed è non riuscito): si guarda la sua richiesta e il filtro RESTA — cade solo se nasconde l’agente chiesto', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [finita('b', 11, 70, { taskCorto: 'Leggi il CSV' }), finita('c', 12, 80, { taskCorto: 'Controlla le valute', esitoDelega: 'fallito' }), figlia('e', 300, { taskCorto: 'Riscrivi le prove' }), finita('f', 301, 400, { taskCorto: 'Impagina', esitoDelega: 'fallito' })];
  const { grafo, scritture } = await apri(page, figli, { richieste: [{ testo: 'Prima richiesta', at: at(5) }, { testo: 'Seconda richiesta', at: at(200) }] });
  await grafo.locator('[data-filtro-stato] > button').click();
  await grafo.locator('[data-filtro-stato] [data-stato-id="failed"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1); // la premessa: solo «f», non riuscito
  await page.locator('#railAgenti').getByRole('button', { name: /Prima richiesta/u }).click();
  await page.locator('#railAgenti [data-sessione-figlia="c"]').click();
  await expect.poll(() => scelti(grafo), { timeout: 8000 }).toEqual(['c']);
  await expect(grafo.locator('[data-filtro-stato] > button'), 'il filtro della persona mostra l’agente: resta').toHaveAttribute('aria-pressed', 'true');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});
