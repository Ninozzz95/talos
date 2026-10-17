/*
 * DOPO UNA RICARICA IL DIAGRAMMA DELLE DELEGHE TORNA COM'ERA (14/10/2026).
 * Era della vista classica (RIPRESA-GRAFO-NAVIGAZIONE, prima metà: «ricarica ricorda la ricerca»): ricordava nella scheda
 * l'ambito, la ricerca, il filtro per stato e l'agente scelto. Il diagramma nuovo ricordava solo la vista.
 * Ogni valore ricordato si convalida sui fatti di adesso: ciò che è rimasto indietro torna al valore di serie, in silenzio.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';
import { apri, at, figlia, finita, ricarica } from './aiuto-deleghe-diagramma.mjs';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

const scena = () => [
  figlia('a', 10, { taskCorto: 'Correggi i prezzi' }),
  finita('b', 11, 70, { taskCorto: 'Leggi il CSV' }),
  finita('c', 12, 80, { taskCorto: 'Controlla le valute', esitoDelega: 'fallito' }),
  figlia('d', 13, { taskCorto: 'Riscrivi le prove' }),
];
const filtro = (grafo) => grafo.locator('[data-filtro-stato]');
const scegliStato = async (grafo, id) => { await filtro(grafo).locator('> button').click(); await filtro(grafo).locator(`[data-stato-id="${id}"]`).click(); };
const lente = (grafo) => grafo.getByRole('button', { name: 'Cerca nel diagramma' });
const campo = (grafo) => grafo.getByRole('searchbox', { name: 'Cerca fra agenti e lotti del diagramma' }); // nelle deleghe i gruppi sono «lotti»
const pillDelDettaglio = (grafo) => grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa');

test('DELEGHE-MEMORIA-01 — dopo una ricarica il diagramma si riapre com’era: il filtro per stato, la ricerca nella lente, l’agente scelto dalla persona', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, scena());
  await expect(grafo.locator('[data-sessione]')).toHaveCount(4);
  await scegliStato(grafo, 'working');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await lente(grafo).click();
  await campo(grafo).fill('prove');
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-spento', 'true');
  await grafo.locator('[data-sessione="d"]').click();
  await expect(pillDelDettaglio(grafo)).toContainText('Riscrivi le prove');

  const dopo = await ricarica(page);
  await expect(dopo).toBeVisible();
  // il filtro per stato
  await expect(dopo.locator('[data-sessione]')).toHaveCount(2);
  await expect(filtro(dopo).locator('> button')).toHaveAttribute('aria-pressed', 'true');
  await expect(filtro(dopo).locator('> button')).toContainText('Al lavoro · 2');
  await expect(dopo.locator('[data-mostrati]')).toBeVisible();
  // la ricerca: la lente è aperta col suo testo, dice quanti ne trova, e chi non corrisponde è attenuato
  await expect(campo(dopo)).toBeVisible();
  await expect(campo(dopo)).toHaveValue('prove');
  await expect(lente(dopo)).toHaveAttribute('aria-expanded', 'true');
  await expect(dopo.locator('.talos-wfg__esito-cerca')).toContainText('1 agente e 0 lotti corrispondono');
  await expect(dopo.locator('.talos-wfg__esito-cerca')).not.toContainText('fas');
  await expect(campo(dopo)).toHaveAttribute('placeholder', 'Cerca agenti o lotti…');
  await expect(dopo.locator('[data-sessione="a"]')).toHaveAttribute('data-spento', 'true');
  await expect(dopo.locator('[data-sessione="d"]')).toHaveAttribute('data-spento', 'false');
  // l'agente scelto, col suo dettaglio
  await expect(dopo.locator('[data-sessione="d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(pillDelDettaglio(dopo)).toContainText('Riscrivi le prove');
  // nessuna riga «non è più fra gli agenti mostrati»: niente è stato tolto
  await expect(dopo).not.toContainText('non è più fra gli agenti mostrati');
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('DELEGHE-MEMORIA-02 — l’ambito «Cartella» torna dopo la ricarica; e ciò che la persona toglie (lente chiusa, «Mostra tutti») NON torna', async ({ page }) => {
  const cartella = 'C:/progetti/listini';
  const altre = [{ sessionId: 'altra-1', taskId: 'workspace', nome: 'Rivedi il README', modello: 'z-ai/glm-5.3-flash', conclusa: true, avviataAlle: at(2), cartella }];
  const { grafo } = await apri(page, scena(), { cartella, altre });
  await scegliStato(grafo, 'failed');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await lente(grafo).click();
  await campo(grafo).fill('valute');
  // la persona chiude la lente e toglie il filtro; per ULTIMA cosa sceglie l'ambito (niente dopo: è questa scelta a doversi ricordare)
  await lente(grafo).click();
  await expect(campo(grafo)).toBeHidden();
  await grafo.locator('[data-azione="mostra-tutti"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(4);
  await grafo.locator('[data-ambito] [data-ambito-id="cartella"]').click();
  await expect(grafo.locator('[data-sessione="altra-1"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(5);

  const dopo = await ricarica(page);
  await expect(dopo).toBeVisible();
  await expect(dopo.locator('[data-ambito] [data-ambito-id="cartella"]')).toHaveAttribute('aria-checked', 'true');
  await expect(dopo.locator('[data-sessione="altra-1"]')).toBeVisible();
  await expect(dopo.locator('[data-sessione]')).toHaveCount(5);
  await expect(filtro(dopo).locator('> button')).toHaveAttribute('aria-pressed', 'false');
  await expect(dopo.locator('[data-mostrati]')).toBeHidden();
  await expect(campo(dopo)).toBeHidden();
  await expect(dopo.locator('[data-spento="true"]')).toHaveCount(0);
});

test('DELEGHE-MEMORIA-02b — la ricerca si ricorda mentre la si scrive (niente altro dopo), e chiudere la lente la dimentica', async ({ page }) => {
  const { grafo } = await apri(page, scena());
  // il dettaglio dell'agente scelto all'apertura è arrivato: dopo, niente scrive più la memoria al posto della ricerca
  await expect(pillDelDettaglio(grafo)).toContainText('Correggi i prezzi');
  await page.waitForTimeout(400);
  await lente(grafo).click();
  await campo(grafo).fill('csv');
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('data-spento', 'false');
  let dopo = await ricarica(page);
  await expect(campo(dopo)).toHaveValue('csv');
  await expect(dopo.locator('[data-sessione="a"]')).toHaveAttribute('data-spento', 'true');
  // adesso la chiude, e non fa altro
  await lente(dopo).click();
  await expect(campo(dopo)).toBeHidden();
  dopo = await ricarica(page);
  await expect(dopo.locator('[data-sessione]')).toHaveCount(4);
  await expect(campo(dopo)).toBeHidden();
  await expect(lente(dopo)).toHaveAttribute('aria-expanded', 'false');
  await expect(dopo.locator('[data-spento="true"]')).toHaveCount(0);
});

test('DELEGHE-MEMORIA-03 — AL CONTRARIO: ciò che è rimasto indietro non si riprende — uno stato senza più agenti non svuota il diagramma, un agente che non c’è più non si sceglie, e nessuna riga lo «toglie»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  let figli = scena();
  const { grafo } = await apri(page, () => figli);
  await scegliStato(grafo, 'working');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await grafo.locator('[data-sessione="d"]').click();
  await expect(pillDelDettaglio(grafo)).toContainText('Riscrivi le prove');
  // mentre la pagina è chiusa: «a» finisce, «d» viene eliminato — nessuno lavora più
  figli = [finita('a', 10, 90, { taskCorto: 'Correggi i prezzi' }), figli[1], figli[2]];

  const dopo = await ricarica(page);
  await expect(dopo).toBeVisible();
  await expect(dopo.locator('[data-sessione]')).toHaveCount(3);
  await expect(filtro(dopo).locator('> button')).toHaveAttribute('aria-pressed', 'false');
  await expect(filtro(dopo).locator('> button')).toContainText('Tutti gli stati');
  await expect(dopo.locator('[data-mostrati]')).toBeHidden();
  await expect(dopo.locator('[data-sessione="d"]')).toHaveCount(0);
  await expect(dopo).not.toContainText('non è più fra gli agenti mostrati');
  await expect(dopo).not.toContainText('Riscrivi le prove');
  // al posto dell'agente sparito il diagramma sceglie come a ogni apertura (nessuno lavora: chi chiede attenzione), col suo dettaglio
  await expect(dopo.locator('[data-sessione][aria-pressed="true"]')).toHaveCount(1);
  await expect(dopo.locator('[data-sessione="c"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(pillDelDettaglio(dopo)).toContainText('Controlla le valute');
  // e la memoria non conserva il valore scartato: una seconda ricarica non lo ritenta
  const voce = await page.evaluate(() => JSON.parse(sessionStorage.getItem('talos.grafo-workflow.v1:dsd-radice:deleghe') ?? '{}'));
  expect(voce.filtro, JSON.stringify(voce)).toBeUndefined();
  expect(voce.scelto, JSON.stringify(voce)).toBeUndefined();
  expect(errori).toEqual([]);
});

test('DELEGHE-MEMORIA-04 — AL CONTRARIO: l’agente che il diagramma sceglie DA SOLO aprendosi non si ricorda — alla ricarica sceglie chi lavora adesso', async ({ page }) => {
  let figli = [figlia('a', 10, { taskCorto: 'Correggi i prezzi' }), finita('b', 11, 70, { taskCorto: 'Leggi il CSV' })];
  const { grafo } = await apri(page, () => figli);
  // nessun clic: all'apertura il diagramma sceglie chi lavora
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('aria-pressed', 'true');
  // mentre la pagina è chiusa «a» finisce e parte «e»
  figli = [finita('a', 10, 90, { taskCorto: 'Correggi i prezzi' }), figli[1], figlia('e', 95, { taskCorto: 'Aggiorna il registro' })];

  const dopo = await ricarica(page);
  await expect(dopo.locator('[data-sessione]')).toHaveCount(3);
  await expect(dopo.locator('[data-sessione="e"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(dopo.locator('[data-sessione="a"]')).toHaveAttribute('aria-pressed', 'false');
});

test('DELEGHE-MEMORIA-05 — AL CONTRARIO: la memoria è della conversazione — il diagramma di un’ALTRA conversazione non eredita ricerca e filtro', async ({ page }) => {
  const { grafo } = await apri(page, scena());
  await scegliStato(grafo, 'working');
  await lente(grafo).click();
  await campo(grafo).fill('prove');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  // l'altra conversazione, coi suoi agenti
  await page.route('**/api/v1/sessions/dsd-altra/children', (r) => r.fulfill({ json: { ok: true, data: { figli: [
    { ...figlia('x', 20, { taskCorto: 'Scrivi le prove nuove' }), parentId: 'dsd-altra', padreId: 'dsd-altra' },
    { ...finita('y', 21, 60, { taskCorto: 'Impagina' }), parentId: 'dsd-altra', padreId: 'dsd-altra' }] } } }));
  await page.route('**/api/v1/sessions/dsd-altra/events*', flussoConConfine);
  await page.evaluate(() => { window.__talosHarnessUiRuntime.passaASessione('dsd-altra', 'workspace', 'Altra conversazione'); });
  await attendiFineStoria(page);
  await expect(grafo).toHaveCount(0);
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await page.locator('#railAgenti').getByRole('button', { name: /diagram/iu }).first().click();
  const altro = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(altro.locator('[data-sessione]')).toHaveCount(2);
  await expect(filtro(altro).locator('> button')).toHaveAttribute('aria-pressed', 'false');
  await expect(campo(altro)).toBeHidden();
  await expect(altro.locator('[data-spento="true"]')).toHaveCount(0);
});

test('DELEGHE-MEMORIA-06 — AL CONTRARIO: il diagramma del WORKFLOW ricorda solo la vista, come prima', async ({ page }) => {
  const scenaWf = costruisciScena(5, { sessionId: 'wf-memoria-5' });
  await instradaScena(page, scenaWf);
  const grafo = await apriDiagrammaDellaScena(page, scenaWf);
  await lente(grafo).click();
  await grafo.getByRole('searchbox').fill('passo');
  await grafo.locator('.gv-passo').first().click();
  const voci = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('talos.grafo-workflow.v1:')).map((k) => JSON.parse(sessionStorage.getItem(k))));
  expect(voci.length).toBeGreaterThan(0);
  for (const voce of voci) expect(Object.keys(voce), JSON.stringify(voce)).toEqual(['vista']);
});

test('DELEGHE-MEMORIA-07 — un diagramma chiuso PRIMA della sua prima lettura non cancella ciò che era ricordato: riaperto, lo riprende', async ({ page }) => {
  const { grafo } = await apri(page, scena());
  await scegliStato(grafo, 'working');
  await lente(grafo).click();
  await campo(grafo).fill('prove');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  /* alla ricarica il diagramma si riapre da solo: appena il suo elemento entra nella pagina (prima che la prima lettura finisca)
     la persona lo chiude. Montandosi il diagramma scrive la sua vista nella memoria: non deve portarsi via il resto. */
  await page.addInitScript(() => {
    new MutationObserver((_, osservatore) => {
      const torna = document.querySelector('#schermoChat > [data-c="GrafoAgenti"] .talos-wfg__torna');
      if (!torna) return;
      osservatore.disconnect(); window.__chiusoPrimaDellaLettura = document.querySelectorAll('#schermoChat > [data-c="GrafoAgenti"] [data-sessione]').length; torna.click();
    }).observe(document, { childList: true, subtree: true });
  });
  const dopo = await ricarica(page);
  await expect.poll(() => page.evaluate(() => window.__chiusoPrimaDellaLettura)).toBe(0); // chiuso davvero prima che ci fosse una scheda
  await expect(dopo).toHaveCount(0);
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await page.locator('#railAgenti').getByRole('button', { name: /diagram/iu }).first().click();
  await expect(dopo.locator('[data-sessione]')).toHaveCount(2);
  await expect(filtro(dopo).locator('> button')).toContainText('Al lavoro · 2');
  await expect(campo(dopo)).toHaveValue('prove');
});

const dentroLaTela = (carta) => carta.evaluate((n) => { const r = n.getBoundingClientRect(); const c = n.closest('.gv-tela').getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom; });
const sei = () => Array.from({ length: 6 }, (_, i) => (i === 5 ? finita(`s${i}`, 10 + i, 80, { taskCorto: `Agente ${i + 1}`, esitoDelega: 'fallito' }) : figlia(`s${i}`, 10 + i, { taskCorto: `Agente ${i + 1}` })));

test('DELEGHE-MEMORIA-08 — l’agente scelto resta NELLA TELA: dopo «Mostra tutti» (era l’unico mostrato, torna a essere l’ultimo di sei) e dopo la ricarica che lo riprende', async ({ page }) => {
  // foto del 14/10/2026: dettaglio aperto su «Riscrivi le prove», e la sua scheda tagliata sotto il bordo della tela
  const { grafo } = await apri(page, sei());
  await scegliStato(grafo, 'failed');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await grafo.locator('[data-sessione="s5"]').click();
  await expect(pillDelDettaglio(grafo)).toContainText('Agente 6');
  await grafo.locator('[data-azione="mostra-tutti"]').click();
  await expect(grafo.locator('[data-sessione="s0"]')).toBeAttached();
  await expect(pillDelDettaglio(grafo)).toContainText('Agente 6'); // la scelta è tenuta
  await expect(grafo.locator('[data-sessione="s5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => dentroLaTela(grafo.locator('[data-sessione="s5"]')), { message: 'dopo «Mostra tutti» la scheda scelta è nella tela' }).toBe(true);
  // e dopo una ricarica, ripresa dalla memoria
  const dopo = await ricarica(page);
  await expect(pillDelDettaglio(dopo)).toContainText('Agente 6');
  await expect(dopo.locator('[data-sessione="s5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => dentroLaTela(dopo.locator('[data-sessione="s5"]')), { message: 'dopo la ricarica la scheda ripresa è nella tela' }).toBe(true);
});
