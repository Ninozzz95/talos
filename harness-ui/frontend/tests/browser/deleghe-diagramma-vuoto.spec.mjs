/*
 * Lo STATO VUOTO del diagramma delle deleghe (13/10/2026): una conversazione che non ha ancora avviato agenti.
 * Prima, senza agenti, il prodotto ricadeva sulla vista classica (`legacy/app.js`, `apriDelegheSulDiagramma`: «nessuna figlia: il
 * diagramma di prima sa dirlo»), che mostrava la sola scheda della conversazione senza una parola. È l'ultima cosa che teneva
 * viva la classica come ripiego: il diagramma nuovo la dice da sé.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, RADICE } from './aiuto-deleghe-diagramma.mjs';

test('DELEGHE-VUOTO-01 — senza agenti si apre il diagramma NUOVO (non la classica): lo dice in testata, mostra la conversazione in cima, e toglie i comandi che non hanno niente su cui agire', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [];
  const { grafo, scritture } = await apri(page, () => figli);
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  // la testata lo dice in due righe: che cosa c'è (niente) e quando comparirà qualcosa
  await expect(grafo.locator('.talos-wfg__sommario')).toHaveText('Nessun agente avviato da questa conversazione');
  await expect(grafo.locator('.talos-wfg__descrizione')).toHaveText('Quando TALOS divide un compito fra più agenti, compaiono qui, lotto per lotto.');
  // niente conti di cose che non ci sono («0 di 0 terminati»)
  await expect(grafo.locator('.talos-wfg__stato-run')).not.toContainText('0 di 0');
  // la conversazione sta in cima, da sola; nessuna scheda d'agente, nessun lotto
  await expect(grafo.locator('.gv-sessione')).toBeVisible();
  await expect(grafo.locator('.gv-sessione')).toContainText('Sistema i listini');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(0);
  await expect(grafo.locator('.gv-testa')).toHaveCount(0);
  // i comandi che agiscono sugli agenti non ci sono: stato, «Segui», percorso, riproduzione
  await expect(grafo.locator('[data-filtro-stato]')).toBeHidden();
  await expect(grafo.locator('[data-segui]')).toBeHidden();
  await expect(grafo.locator('.gv-rip')).toBeHidden();
  // la colonna dell'attività dice che non c'è ancora niente
  await expect(grafo.locator('.gv-attivita .talos-wfg__vuoto')).toHaveText('Ancora nessun passo. Qui compare ciò che fanno gli agenti.');
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-VUOTO-02 — dal vuoto al primo agente, in diretta: la scheda compare, la testata conta, i comandi tornano', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [];
  const { grafo } = await apri(page, () => figli);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(0);
  const primo = figlia('a', 40, { taskCorto: 'Correggi i prezzi' });
  figli.push(primo);
  await eventoAgente(page, primo, 'created');
  await expect(grafo.locator('[data-sessione="a"]')).toBeVisible({ timeout: 4000 });
  await expect(grafo.locator('.talos-wfg__sommario')).toContainText('1 agente in 1 lotto');
  await expect(grafo.locator('[data-filtro-stato]')).toBeVisible();
  await expect(grafo.locator('[data-segui]')).toBeVisible();
  await expect(grafo.locator('.gv-rip')).toBeVisible();
  // e con lui le viste, la ricerca e i gruppi
  await expect(grafo.locator('[data-vista="lettura"]')).toBeVisible();
  await expect(grafo.getByRole('button', { name: 'Cerca nel diagramma', exact: true })).toBeVisible();
  await expect(grafo.getByRole('button', { name: 'Gruppi', exact: true })).toBeVisible();
  expect(errori).toEqual([]);
});

test('DELEGHE-VUOTO-03 — AL CONTRARIO: con un agente la testata non dice «Nessun agente»; e in inglese lo stato vuoto ha le sue due frasi', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10)]);
  await expect(grafo.locator('.talos-wfg__sommario')).toContainText('1 agente in 1 lotto');
  await expect(grafo.locator('.talos-wfg__sommario')).not.toContainText('Nessun agente');
});

test('DELEGHE-VUOTO-03b — lo stato vuoto in inglese', async ({ page }) => {
  const { grafo } = await apri(page, [], { lingua: 'en' });
  await expect(grafo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(grafo.locator('.talos-wfg__sommario')).toHaveText('No agents started by this conversation');
  await expect(grafo.locator('.talos-wfg__descrizione')).toHaveText('When TALOS splits a task among several agents, they appear here, batch by batch.');
});

test('DELEGHE-VUOTO-04 — senza agenti non si offrono le viste né la ricerca né i gruppi; e sotto la scheda della conversazione non pende nessun tronco', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, []);
  await expect(grafo).toHaveAttribute('data-vuoto', 'true');
  // «Tempo» e «Lettura» senza agenti erano due riquadri bianchi: le viste non si offrono
  await expect(grafo.locator('[data-vista="lettura"]')).toBeHidden();
  await expect(grafo.getByRole('button', { name: 'Cerca nel diagramma', exact: true })).toBeHidden();
  await expect(grafo.getByRole('button', { name: 'Gruppi', exact: true })).toBeHidden();
  // restano l'ambito, lo zoom e la colonna dell'attività
  await expect(grafo.locator('[data-ambito]')).toBeVisible();
  await expect(grafo.getByRole('button', { name: 'Adatta il diagramma alla finestra' })).toBeVisible();
  await expect(grafo.getByRole('button', { name: 'Attività recenti' })).toBeVisible();
  // la tela: la scheda della conversazione DENTRO la vista, a grandezza naturale, e nessun filo disegnato
  const misure = await grafo.evaluate((g) => {
    const s = g.querySelector('.gv-sessione').getBoundingClientRect(); const t = g.querySelector('.gv-sessione').closest('[role="group"]').getBoundingClientRect();
    return { dentro: s.left >= t.left && s.right <= t.right && s.top >= t.top && s.bottom <= t.bottom, larga: Math.round(s.width), fili: g.querySelectorAll('.gv-albero, .gv-arco').length,
      fuoriCentro: Math.round(Math.abs((s.left + s.width / 2) - (t.left + t.width / 2))), fuoriCentroY: Math.round(Math.abs((s.top + s.height / 2) - (t.top + t.height / 2))) };
  });
  expect(misure.dentro, JSON.stringify(misure)).toBe(true);
  // al CENTRO della tela, come ogni diagramma adattato (con l'altezza infinita la vista restava in alto a sinistra)
  expect(misure.fuoriCentro, JSON.stringify(misure)).toBeLessThanOrEqual(2);
  // anche in altezza (il margine sotto la scheda la tiene 12 px sopra il centro): con l'altezza infinita restava in cima
  expect(misure.fuoriCentroY, JSON.stringify(misure)).toBeLessThanOrEqual(16);
  expect(misure.larga).toBe(320); // zoom 100%: prima la disposizione vuota aveva misure infinite e lo zoom cadeva al 10%
  expect(misure.fili).toBe(0);
  // il modello sulla scheda della conversazione ha il nome corto, come sulle schede degli agenti; l'intero sta nel suggerimento
  const sotto = grafo.locator('.gv-sessione .talos-wfg__passo-modello');
  await expect(sotto).toContainText('glm-5.3-flash');
  await expect(sotto).not.toContainText('z-ai/');
  await expect(sotto).toHaveAttribute('title', /z-ai\/glm-5\.3-flash/u);
  expect(errori).toEqual([]);
});

test('DELEGHE-VUOTO-05 — con «Lettura» ricordata lo stato vuoto mostra comunque la tela; nato il primo agente torna «Lettura», e la scelta ricordata non è stata toccata', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const CHIAVE = `talos.grafo-workflow.v1:${RADICE}:deleghe`;
  await page.addInitScript((k) => { try { sessionStorage.setItem(k, JSON.stringify({ vista: 'lettura' })); } catch { /* */ } }, CHIAVE);
  const figli = [];
  const { grafo } = await apri(page, () => figli);
  await expect(grafo).toHaveAttribute('data-vuoto', 'true');
  await expect(grafo).toHaveAttribute('data-vista', 'dipendenze');
  await expect(grafo.locator('.gv-sessione')).toBeVisible();
  await expect(grafo.locator('.gv-lettura')).toBeHidden();
  expect(await page.evaluate((k) => sessionStorage.getItem(k), CHIAVE)).toBe(JSON.stringify({ vista: 'lettura' }));
  const primo = figlia('a', 40, { taskCorto: 'Correggi i prezzi' });
  figli.push(primo);
  await eventoAgente(page, primo, 'created');
  await expect(grafo).toHaveAttribute('data-vuoto', 'false', { timeout: 4000 });
  await expect(grafo).toHaveAttribute('data-vista', 'lettura');
  await expect(grafo.locator('.gv-lettura')).toContainText('Correggi i prezzi');
  await expect(grafo.locator('[data-vista="lettura"]')).toBeVisible();
  // e tornando alle dipendenze la scheda dell'agente si vede, a una grandezza leggibile
  await grafo.locator('[data-vista="dipendenze"]').click();
  await expect(grafo.locator('[data-sessione="a"]')).toBeVisible();
  const larga = await grafo.locator('[data-sessione="a"]').evaluate((n) => Math.round(n.getBoundingClientRect().width));
  expect(larga).toBeGreaterThan(120);
  expect(errori).toEqual([]);
});

test('DELEGHE-VUOTO-06 — AL CONTRARIO: nell’ambito «Cartella», con altre conversazioni e nessun agente, la testata lo dice ancora ma i comandi ci sono', async ({ page }) => {
  const altre = [{ sessionId: 'altra-1', taskId: 'workspace', nome: 'Rivedi il README', modello: 'z-ai/glm-5.3-flash', conclusa: true, avviataAlle: at(-600), conclusaAlle: at(-300), cartella: 'C:/progetti/listini' }];
  const { grafo } = await apri(page, [], { cartella: 'C:/progetti/listini', altre });
  await expect(grafo).toHaveAttribute('data-vuoto', 'true');
  await grafo.locator('[data-ambito-id="cartella"]').click();
  await expect(grafo).toHaveAttribute('data-vuoto', 'false');
  await expect(grafo.locator('.talos-wfg__sommario')).toHaveText('Nessun agente avviato da questa conversazione · 1 altra conversazione in questa cartella');
  await expect(grafo.locator('[data-sessione="altra-1"]')).toBeVisible();
  await expect(grafo.locator('[data-vista="lettura"]')).toBeVisible();
  await expect(grafo.locator('[data-filtro-stato]')).toBeVisible();
  await expect(grafo.locator('.talos-wfg__stato-run')).not.toContainText('0 di 0');
  // le altre conversazioni non le ha avviate questa: nessuna freccia dalla scheda in cima; e senza agenti niente da rigiocare
  expect(await grafo.evaluate((g) => g.querySelectorAll('.gv-albero').length)).toBe(0);
  await expect(grafo.locator('.gv-rip')).toBeHidden();
  // e tornando alla conversazione lo stato vuoto torna
  await grafo.locator('[data-ambito-id="sessione"]').click();
  await expect(grafo).toHaveAttribute('data-vuoto', 'true');
  await expect(grafo.locator('[data-vista="lettura"]')).toBeHidden();
});

test('DELEGHE-VUOTO-02b — in una finestra bassa, nato il primo agente la vista si adatta come all’apertura: la sua scheda sta TUTTA dentro la tela', async ({ page }) => {
  // senza adattare, la tela restava ferma sulla sola scheda della conversazione (al centro) e il lotto nuovo usciva dal fondo
  const figli = [];
  const { grafo } = await apri(page, () => figli, { finestra: { width: 1920, height: 700 } });
  await expect(grafo).toHaveAttribute('data-vuoto', 'true');
  const primo = figlia('a', 40, { taskCorto: 'Correggi i prezzi' });
  figli.push(primo);
  await eventoAgente(page, primo, 'created');
  await expect(grafo.locator('[data-sessione="a"]')).toBeVisible({ timeout: 4000 });
  await expect.poll(() => grafo.evaluate((g) => {
    const tela = g.querySelector('.gv-sessione').closest('[role="group"]').getBoundingClientRect();
    const dentro = (n) => { const r = n.getBoundingClientRect(); return r.top >= tela.top && r.bottom <= tela.bottom && r.left >= tela.left && r.right <= tela.right; };
    return dentro(g.querySelector('[data-sessione="a"]')) && dentro(g.querySelector('.gv-sessione'));
  }), { timeout: 4000 }).toBe(true);
});

test('DELEGHE-VUOTO-07 — un giro rimasto a metà (il processo è morto): senza agenti la scheda in cima dice «Interrotta», non «In corso» né «Conclusa»', async ({ page }) => {
  /* era RIPRESA-GRAFO-MADRE-INTERROTTA della vista classica (09/10/2026: la barra laterale diceva «interrotta» e il nodo radice
     «Concluso», perché l'ultimo evento rigiocato era un RunStarted senza fine). Owner 14/10/2026, «Quelle delle deleghe»: la scheda
     dice «Interrotta», come la barra laterale (prima «Annullato», la parola del run di un Workflow). */
  const { grafo } = await apri(page, [], { principale: { interrotta: true, ultimoEsito: null, motivoChiusura: null }, richieste: [{ testo: 'Un giro lento', avviatoA: at(5) }] });
  await expect(grafo).toHaveAttribute('data-vuoto', 'true');
  await expect(page.locator(`[data-real-session-id="${RADICE}"]`).first(), 'la premessa: la barra laterale dice «interrotta»').toContainText('interrotta');
  const cima = grafo.locator('.gv-sessione');
  await expect(cima).toContainText('Interrotta');
  await expect(cima).not.toContainText('In corso');
  await expect(cima).not.toContainText('Conclusa');
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Interrotta/u);
});

test('DELEGHE-VUOTO-08 — una conversazione di cui non si leggono gli agenti non eredita quelli della conversazione di prima', async ({ page }) => {
  /* era RIPRESA-GRAFO-SESSIONE-VUOTA della vista classica: si guarda una conversazione con due agenti, poi se ne apre un'altra
     la cui lettura fallisce (503). Il diagramma della seconda è vuoto: nessuna scheda d'agente rimasta dalla prima. */
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11)]);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await grafo.getByRole('button', { name: 'Torna alla chat', exact: true }).click();
  await page.route('**/api/v1/sessions/dsd-altra/children', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Lettura non disponibile' } }) }));
  await page.route('**/api/v1/sessions/dsd-altra/events*', () => { /* aperto e muto */ });
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('dsd-altra', 'workspace', 'Sessione senza agenti letti', 'z-ai/glm-5.3-flash', { conclusa: false });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  });
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(0);
  await page.locator('#railAgenti').getByRole('button', { name: /diagram/iu }).first().click();
  const secondo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(secondo).toHaveAttribute('data-sorgente', 'deleghe');
  await expect(secondo).toHaveAttribute('data-vuoto', 'true');
  await expect(secondo.locator('[data-sessione]')).toHaveCount(0);
  await expect(secondo.locator('.gv-sessione')).toContainText('Sessione senza agenti letti');
});
