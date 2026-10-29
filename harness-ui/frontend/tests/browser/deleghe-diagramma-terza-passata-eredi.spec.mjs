/*
 * TERZA PASSATA DEL REVISORE (14/10/2026) — «ogni prova cancellata ha davvero la sua erede?» (punto 2 del brief), dopo la
 * rimozione della vista classica (`7d3f78421`) e delle sue prove (`4be46a76f`). Qui stanno le metà che nella tabella
 * (`TABELLA-PROVE-CLASSICA-2026-10-13.md`) risultano «già coperte» o «forma della classica» e che, rilette sul corpo della prova
 * di prima, guardavano una FUNZIONE che sul diagramma nuovo nessuna prova guarda.
 * «[REGGE]» = attaccato, ha retto (la funzione c'è: da oggi c'è anche la sua prova). Senza etichetta = ROSSA: un difetto, con la
 * cura proposta nel rapporto (`handoff …/bugfixer/RAPPORTO-TERZA-PASSATA-2026-10-14.md`). Solo letture.
 */
import { expect, test } from '@playwright/test';
import { apri, eventoAgente, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

/* la tela monta solo le schede vicine alla vista: una scheda che non c'è nel DOM è fuori dalla tela */
/* 28/10/2026: sotto carico la scheda può uscire dalla tela fra il conteggio e la misura (la tela smonta ciò che è lontano): allora non è
   nella tela, e la prova lo dice invece di esplodere su closest(...) null. Una sola misura, senza attese fra le due letture. */
const dentroLaTela = async (carta) => (await carta.count()) > 0 && carta.first().evaluate((n) => { const tela = n.closest('.gv-tela'); if (!n.isConnected || !tela) return false; const r = n.getBoundingClientRect(); const c = tela.getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom; }).catch(() => false);
const lente = (grafo) => grafo.getByRole('button', { name: 'Cerca nel diagramma' });
const campo = (grafo) => grafo.getByRole('searchbox', { name: 'Cerca fra agenti e lotti del diagramma' });

/* dodici agenti in un lotto (una colonna più alta della tela, ingrandita): il primo e l'ultimo lavorano, gli altri hanno finito */
const dodici = () => Array.from({ length: 12 }, (_, i) => (i === 0 || i === 11 ? figlia(`s${String(i).padStart(2, '0')}`, 10 + i, { taskCorto: `Agente ${i + 1}` })
  : finita(`s${String(i).padStart(2, '0')}`, 10 + i, 60 + i, { taskCorto: `Agente ${i + 1}` })));
async function ingrandita(grafo, page) {
  const piu = grafo.getByRole('button', { name: 'Aumenta lo zoom del 10%' });
  const zoom = () => grafo.locator('.gv-percento').innerText().then((s) => parseInt(s, 10));
  for (let i = 0; i < 14 && (await zoom()) < 150; i += 1) { await piu.click(); await page.waitForTimeout(120); }
  expect(await zoom(), 'la premessa: la tela è ingrandita').toBeGreaterThanOrEqual(150);
}

test('TERZA-SEGUI-01 [REGGE] — con «Segui» acceso la VISTA va sull’agente che lavora: quando finisce lui e resta al lavoro un altro (fuori dalla tela), un aggiornamento porta la tela sull’altro (era RIPRESA-GRAFO-SEGUI-AGGIORNA: «porta la vista sull’agente che lavora adesso»)', async ({ page }) => {
  const figli = dodici();
  const { grafo } = await apri(page, () => figli);
  await expect(grafo.locator(':scope > header')).toContainText('12 agenti in 1 lotto');
  await ingrandita(grafo, page);
  const segui = grafo.locator('[data-segui]');
  await segui.click();
  await expect(segui).toHaveAttribute('aria-pressed', 'true');
  // l'ultimo partito fra chi lavora è «s11», in fondo alla colonna
  await expect(grafo.locator('[data-sessione="s11"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => dentroLaTela(grafo.locator('[data-sessione="s11"]')), { message: '«Segui» porta nella tela l’agente che lavora' }).toBe(true);
  expect(await grafo.locator('[data-sessione="s00"]').count() === 0 || !(await dentroLaTela(grafo.locator('[data-sessione="s00"]'))), 'la premessa: l’altro agente al lavoro, in cima alla colonna, è fuori dalla tela').toBe(true);
  // «s11» finisce: resta al lavoro solo «s00»
  figli[11] = finita('s11', 21, 95, { taskCorto: 'Agente 12' });
  await eventoAgente(page, figli[11], 'completed');
  await expect(grafo.locator('[data-sessione="s00"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 9000 });
  await expect.poll(() => dentroLaTela(grafo.locator('[data-sessione="s00"]')), { timeout: 9000, message: 'la tela si è spostata sull’agente che lavora adesso' }).toBe(true);
  await expect(segui).toHaveAttribute('aria-pressed', 'true');
});

test('TERZA-SEGUI-02 [REGGE] — con «Segui» acceso l’agente al lavoro resta nella tela anche quando la finestra cambia misura (era RIPRESA-GRAFO-SEGUI: «resta nella tela anche quando la finestra cambia»)', async ({ page }) => {
  const figli = dodici();
  const { grafo } = await apri(page, () => figli);
  await expect(grafo.locator(':scope > header')).toContainText('12 agenti in 1 lotto');
  await ingrandita(grafo, page);
  const segui = grafo.locator('[data-segui]');
  await segui.click();
  await expect(grafo.locator('[data-sessione="s11"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => dentroLaTela(grafo.locator('[data-sessione="s11"]'))).toBe(true);
  await page.setViewportSize({ width: 1024, height: 800 });
  // la classica lo riportava dentro subito; qui si aspetta fino a due battiti (la rilettura è ogni 5 s)
  const visto = [];
  for (let i = 0; i < 11; i += 1) {
    const c = grafo.locator('[data-sessione="s11"]');
    visto.push((await c.count()) > 0 && (await dentroLaTela(c)) ? 1 : 0);
    if (visto.at(-1) === 1) break;
    await page.waitForTimeout(1000);
  }
  expect(visto.at(-1), `l’agente seguito è nella tela dopo il ridimensionamento (un campione al secondo: ${visto.join('')})`).toBe(1);
  await expect(segui).toHaveAttribute('aria-pressed', 'true');
});

test('TERZA-CERCA-01 — trenta agenti in tre lotti (oltre 25 il diagramma si apre con un lotto solo aperto): la ricerca trova un agente anche se sta in un lotto CHIUSO — come trovava la vista classica — e Invio lo porta in vista', async ({ page }) => {
  // la tabella dichiara non portata «la ricerca sulle righe non caricate (oltre 50 agenti per lotto)»: qui i lotti sono da dieci
  const lotto = (k, nascita, vivo) => Array.from({ length: 10 }, (_, i) => (vivo && i < 3 ? figlia(`l${k}-${i}`, nascita + i, { taskCorto: `Agente ${k}.${i + 1}` }) : finita(`l${k}-${i}`, nascita + i, nascita + 40 + i, { taskCorto: `Agente ${k}.${i + 1}` })));
  const figli = [...lotto(1, 10, false), ...lotto(2, 200, false), ...lotto(3, 400, true)];
  figli[4] = finita('l1-4', 14, 54, { taskCorto: 'Controlla le valute straniere' }); // nel primo lotto, che all'apertura è chiuso
  const { grafo } = await apri(page, figli);
  await expect(grafo.locator(':scope > header')).toContainText('30 agenti in 3 lotti');
  await expect(grafo).toHaveAttribute('data-livello', 'gruppi');
  await expect(grafo.locator('[data-sessione="l3-0"]'), 'la premessa: è aperto il lotto dove si lavora').toBeVisible();
  await expect(grafo.locator('[data-sessione="l1-4"]'), 'la premessa: il lotto dell’agente cercato è chiuso').toHaveCount(0);
  await lente(grafo).click();
  await campo(grafo).fill('valute');
  await page.waitForTimeout(500);
  const esito = (await grafo.locator('.talos-wfg__esito-cerca').innerText()).trim();
  expect(esito, 'la ricerca trova l’agente del lotto chiuso').toMatch(/^1 agente/u);
  await campo(grafo).press('Enter');
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa')).toContainText('Controlla le valute straniere', { timeout: 4000 });
  await expect(grafo.locator('[data-sessione="l1-4"]')).toHaveAttribute('aria-pressed', 'true');
});

test('TERZA-STRETTA-01 [REGGE] — alla misura più piccola della finestra dell’app (900×600, `desktop/main.mjs`) il diagramma delle deleghe non sfonda, «Torna alla chat» si raggiunge e la tela mostra ancora la scheda della conversazione; vuoto e con agenti', async ({ page }) => {
  const misura = (grafo) => grafo.evaluate((g) => {
    const r = (x) => x?.getBoundingClientRect(); const tela = r(g.querySelector('.gv-tela')); const cima = r(g.querySelector('.gv-sessione')); const torna = r(g.querySelector('.talos-wfg__torna'));
    return { pagina: document.documentElement.scrollWidth > innerWidth + 1, sfonda: g.scrollWidth > g.clientWidth + 1, tela: [Math.round(tela.width), Math.round(tela.height)],
      cimaDentro: cima.top >= tela.top - 1 && cima.bottom <= tela.bottom + 1 && cima.left >= tela.left - 1 && cima.right <= tela.right + 1,
      torna: torna.width > 0 && torna.left >= 0 && torna.right <= innerWidth + 1 && torna.top >= 0 && torna.bottom <= innerHeight + 1 };
  });
  const finestra = { width: 900, height: 600 };
  const vuoto = await apri(page, [], { finestra });
  await expect(vuoto.grafo).toHaveAttribute('data-vuoto', 'true');
  await page.waitForTimeout(700);
  const mv = await misura(vuoto.grafo);
  expect(mv, `vuoto a 900×600: ${JSON.stringify(mv)}`).toMatchObject({ pagina: false, sfonda: false, cimaDentro: true, torna: true });
  const pieno = await apri(page, [figlia('a', 10, { taskCorto: 'Agente A' }), finita('b', 11, 70, { taskCorto: 'Agente B' }), figlia('c', 12, { taskCorto: 'Agente C' })], { finestra });
  await expect(pieno.grafo.locator('[data-sessione]')).toHaveCount(3);
  await page.waitForTimeout(900);
  const mp = await misura(pieno.grafo);
  expect(mp, `con tre agenti a 900×600: ${JSON.stringify(mp)}`).toMatchObject({ pagina: false, sfonda: false, torna: true });
  expect(mp.tela[0], JSON.stringify(mp)).toBeGreaterThan(250);
  expect(mp.tela[1], JSON.stringify(mp)).toBeGreaterThan(120);
});
