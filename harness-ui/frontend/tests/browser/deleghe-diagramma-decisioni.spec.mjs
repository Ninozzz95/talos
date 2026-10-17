/*
 * Owner 13/10/2026 sera — le decisioni prese dopo la revisione del diagramma delle deleghe (rapporto del lotto 2, D8-D15):
 *   D10  nel dettaglio di un agente «Avviato da» / «Ha avviato» al posto di «Da cosa dipende / Cosa aspetta», nascosti a zero
 *        (nel Workflow restano com'erano: lo prova `grafo-workflow.spec.mjs`);
 *   D14  ramo isolato + cambio di richiesta: l'isolamento si TOGLIE e la riga sopra la tela lo dice (mai un filtro che riappare);
 *   D15  «Cartella» spenta dice il perché anche da tastiera e al lettore di schermo.
 * Le figlie hanno la forma vera di `GET …/children`. Solo letture.
 */
import { expect, test } from '@playwright/test';
import { apri, at, figlia, finita, RADICE } from './aiuto-deleghe-diagramma.mjs';

test('DELEGHE-DECISIONI-10 — nel dettaglio di un agente: «Ha avviato» per chi ha avviato altri agenti, «Avviato da» per chi è stato avviato da un agente, e a zero la riga non c’è', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  // a ha avviato n (un nipote della conversazione); b non ha avviato nessuno
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: 'Correggi i prezzi' }), figlia('b', 12, { taskCorto: 'Leggi il CSV' }), figlia('n', 40, { padreId: 'a', parentId: 'a', taskCorto: 'Controlla i decimali' })]);
  const dettaglio = grafo.locator('.gv-dettaglio');
  // chi ha avviato un agente: solo «Ha avviato (1)»
  await grafo.locator('[data-sessione="a"]').click();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Correggi i prezzi');
  await expect(dettaglio.getByRole('button', { name: 'Ha avviato (1)' })).toBeVisible();
  await expect(dettaglio.getByRole('button', { name: /^Avviato da/u })).toHaveCount(0);
  await expect(dettaglio).not.toContainText('Da cosa dipende');
  await expect(dettaglio).not.toContainText('Cosa aspetta');
  // la riga accende il focus sugli agenti avviati, e la pastiglia lo dice con le stesse parole
  await dettaglio.getByRole('button', { name: 'Ha avviato (1)' }).click();
  await expect(grafo.locator('.gv-fuoco')).toContainText('Avviati da Correggi i prezzi: 1 agente');
  await grafo.locator('.gv-fuoco .gv-fuoco-via').click();
  // chi è stato avviato da un agente: solo «Avviato da (1)»
  await grafo.locator('[data-sessione="n"]').click();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Controlla i decimali');
  await expect(dettaglio.getByRole('button', { name: 'Avviato da (1)' })).toBeVisible();
  await expect(dettaglio.getByRole('button', { name: /^Ha avviato/u })).toHaveCount(0);
  await dettaglio.getByRole('button', { name: 'Avviato da (1)' }).click();
  await expect(grafo.locator('.gv-fuoco')).toContainText('Chi ha avviato Controlla i decimali: 1 agente');
  await grafo.locator('.gv-fuoco .gv-fuoco-via').click();
  // AL CONTRARIO: avviato dalla conversazione e senza agenti suoi ⇒ 0 e 0: nessuna delle due righe, e nemmeno il loro contenitore
  await grafo.locator('[data-sessione="b"]').click();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Leggi il CSV');
  await expect(dettaglio.locator('.gv-dettaglio-focus')).toHaveCount(0);
  await expect(dettaglio.getByRole('button', { name: /^(Avviato da|Ha avviato|Da cosa dipende|Cosa aspetta)/u })).toHaveCount(0);
  expect(errori).toEqual([]);
});

test('DELEGHE-DECISIONI-10b — le stesse due righe in inglese', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: 'Fix the prices' }), figlia('n', 40, { padreId: 'a', parentId: 'a', taskCorto: 'Check the decimals' })], { lingua: 'en' });
  const dettaglio = grafo.locator('.gv-dettaglio');
  await grafo.locator('[data-sessione="a"]').click();
  await expect(dettaglio.getByRole('button', { name: 'It started (1)' })).toBeVisible();
  await dettaglio.getByRole('button', { name: 'It started (1)' }).click();
  await expect(grafo.locator('.gv-fuoco')).toContainText('Started by Fix the prices: 1 agent');
  await grafo.locator('.gv-fuoco .gv-fuoco-via').click();
  await grafo.locator('[data-sessione="n"]').click();
  await expect(dettaglio.getByRole('button', { name: 'Started by (1)' })).toBeVisible();
  await dettaglio.getByRole('button', { name: 'Started by (1)' }).click();
  await expect(grafo.locator('.gv-fuoco')).toContainText('Who started Check the decimals: 1 agent');
});

const DUE_RICHIESTE = [{ at: at(0), testo: 'Sistema i listini' }, { at: at(300), testo: 'Ora aggiungi le prove' }];
/* la richiesta di prima: a, b ed e (avviato da b); la richiesta in corso: c e d */
const DELEGHE_DI_DUE = () => [finita('a', 10, 70, { taskCorto: 'Correggi i prezzi' }), finita('b', 12, 90, { taskCorto: 'Leggi il CSV' }), finita('e', 20, 60, { padreId: 'b', parentId: 'b', taskCorto: 'Conta le righe' }),
  figlia('c', 320, { taskCorto: 'Riscrivi le prove' }), figlia('d', 321, { taskCorto: 'Controlla le valute' })];

test('DELEGHE-DECISIONI-14 — ramo isolato e cambio di richiesta: l’isolamento si toglie, la riga sopra la tela lo dice col nome, «Chiudi» la toglie, e tornando alla richiesta di prima il ramo NON è più isolato', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, DELEGHE_DI_DUE(), { richieste: DUE_RICHIESTE });
  const selettore = grafo.locator('[data-richieste]');
  const riga = grafo.locator('[data-mostrati]');
  const scegli = async (n) => { await selettore.getByRole('button').first().click(); await selettore.getByRole('menuitemradio').nth(n).click(); };
  // la richiesta di prima (a, b, e), e lì il ramo di b isolato: restano b ed e
  await scegli(1);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await grafo.locator('[data-sessione="b"]').click();
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(riga).toContainText('solo «Leggi il CSV» e gli agenti che ha avviato');
  await expect(riga.locator('[data-isolamento-tolto]')).toBeHidden();
  // cambio di richiesta: si vedono TUTTI gli agenti della richiesta in corso, e la riga dice che il ramo non è più isolato
  await scegli(0);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('[data-sessione="c"]')).toBeVisible();
  await expect(riga).toBeVisible();
  await expect(riga.locator('[data-isolamento-tolto]')).toHaveText('Hai cambiato richiesta: non si vede più solo «Leggi il CSV» e gli agenti che ha avviato.');
  await expect(grafo.locator('.gv-dettaglio'), 'il dettaglio dell’agente che non si vede più è chiuso').toBeHidden();
  await expect(riga).toHaveAttribute('role', 'status');
  // niente è nascosto: «Si vedono N su M» e «Mostra tutti» non compaiono accanto all'avviso
  await expect(riga.locator('[data-azione="mostra-tutti"]')).toBeHidden();
  // un aggiornamento dal vivo non lo cancella; «Chiudi» sì, e la riga sparisce
  await page.waitForTimeout(1500);
  await expect(riga.locator('[data-isolamento-tolto]')).toBeVisible();
  await riga.locator('[data-azione="chiudi-isolamento-tolto"]').click();
  await expect(riga).toBeHidden();
  // tornando alla richiesta di prima il ramo NON torna isolato da solo: ci sono tutti e tre, e niente avviso
  await scegli(1);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await expect(grafo.locator('[data-sessione="a"]')).toBeVisible();
  await expect(riga).toBeHidden();
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DECISIONI-14b — AL CONTRARIO: senza un ramo isolato il cambio di richiesta non dice niente; e un’altra scelta (lo stato) toglie l’avviso', async ({ page }) => {
  const { grafo } = await apri(page, DELEGHE_DI_DUE(), { richieste: DUE_RICHIESTE });
  const selettore = grafo.locator('[data-richieste]');
  const riga = grafo.locator('[data-mostrati]');
  const scegli = async (n) => { await selettore.getByRole('button').first().click(); await selettore.getByRole('menuitemradio').nth(n).click(); };
  await scegli(1);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await expect(riga).toBeHidden();
  await scegli(0);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(riga).toBeHidden();
  // col ramo isolato e poi tolto dal cambio di richiesta, scegliere uno stato fa sparire l'avviso (resta la riga del filtro)
  await scegli(1);
  await grafo.locator('[data-sessione="b"]').click();
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await scegli(0);
  await expect(riga.locator('[data-isolamento-tolto]')).toBeVisible();
  await grafo.locator('[data-filtro-stato] > button').click();
  await grafo.locator('[data-filtro-stato] [data-stato-id="working"]').click();
  await expect(riga.locator('[data-isolamento-tolto]')).toBeHidden();
  await expect(riga).toContainText('solo: ');
});

test('DELEGHE-DECISIONI-15 — «Cartella» spenta: le frecce ci portano il fuoco senza sceglierla, e col fuoco il suggerimento del prodotto dice perché (a chi guarda e a chi ascolta); Invio, Spazio e il clic non la scelgono', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, [figlia('a', 10), figlia('b', 12)]); // la conversazione non ha una cartella
  const conversazione = grafo.locator('[data-ambito] [data-ambito-id="sessione"]');
  const cartella = grafo.locator('[data-ambito] [data-ambito-id="cartella"]');
  const suggerimento = page.locator('#talosTip');
  await expect(cartella).toHaveAttribute('aria-disabled', 'true');
  expect(await cartella.evaluate((b) => b.disabled), 'spenta con aria-disabled, non con disabled: resta raggiungibile').toBe(false);
  // da tastiera: la freccia porta il fuoco su «Cartella», che NON viene scelta
  await conversazione.focus();
  await page.keyboard.press('ArrowRight');
  await expect(cartella).toBeFocused();
  await expect(cartella).toHaveAttribute('aria-checked', 'false');
  await expect(conversazione).toHaveAttribute('aria-checked', 'true');
  // il perché: il suggerimento del prodotto, aperto dal fuoco e legato al pulsante (il lettore di schermo lo legge come descrizione)
  await expect(suggerimento).toBeVisible();
  await expect(suggerimento).toHaveText('Questa conversazione non ha una cartella');
  await expect(cartella).toHaveAttribute('aria-describedby', 'talosTip');
  // una volta sola: nessuna seconda scritta sopra la tela
  await expect(grafo.locator('[data-mostrati]')).toBeHidden();
  // Invio e Spazio non la scelgono, e niente si rilegge
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');
  await expect(cartella).toHaveAttribute('aria-checked', 'false');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  // la freccia torna indietro: il fuoco lascia «Cartella»
  await page.keyboard.press('ArrowLeft');
  await expect(conversazione).toBeFocused();
  await expect(conversazione).toHaveAttribute('aria-checked', 'true');
  // col puntatore: il clic non la sceglie
  await cartella.click({ force: true });
  await expect(cartella).toHaveAttribute('aria-checked', 'false');
  expect(errori).toEqual([]);
  expect(scritture).toEqual([]);
});

test('DELEGHE-DECISIONI-15b — AL CONTRARIO: con una cartella la freccia SCEGLIE «Cartella» e la riga del perché non compare', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 12)], { cartella: 'C:/progetti/listini' });
  const conversazione = grafo.locator('[data-ambito] [data-ambito-id="sessione"]');
  const cartella = grafo.locator('[data-ambito] [data-ambito-id="cartella"]');
  await expect(cartella).toHaveAttribute('aria-disabled', 'false');
  await conversazione.focus();
  await page.keyboard.press('ArrowRight');
  await expect(cartella).toHaveAttribute('aria-checked', 'true');
  await expect(cartella).toBeFocused();
  await expect(page.locator('#talosTip')).not.toHaveText('Questa conversazione non ha una cartella');
});

/* D9 — la storia del registro a buchi: la barra della riproduzione lo dice, con l'ora da cui comincia */
const ora = (s) => new Date(Date.parse(at(s))).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: RADICE, seq, at: at(secondi), coverage: 'complete', event, node });
const STORIA = () => { const a = figlia('a', 60);
  return [registrato(1, 30, { sessionId: RADICE, padreId: null, conclusa: false, avviataAlle: at(0), taskCorto: 'Sistema i listini' }, 'created'), registrato(2, 60, a, 'created'), registrato(3, 420, finita('a', 60, 420))]; };

test('DELEGHE-DECISIONI-09 — una storia del registro INCOMPLETA: la barra della riproduzione lo dice, con l’ora da cui comincia (italiano e inglese); a diagramma stretto la nota resta, su una riga sua', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 60, 420)], { cronologia: { record: STORIA(), coverage: 'partial' } });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-storia', 'registro');
  await expect(rip).toHaveAttribute('data-copertura', 'partial');
  const nota = rip.locator('.gv-rip-nota');
  await expect(nota).toHaveText(`Storia del registro incompleta: comincia alle ${ora(30)}, può mancare qualche passaggio`);
  await expect(nota).toBeVisible();
  // la barra resta su una riga a diagramma largo: la nota sta a destra del binario, alla sua altezza
  const largo = await rip.evaluate((r) => { const n = r.querySelector('.gv-rip-nota').getBoundingClientRect(); const b = r.querySelector('.gv-rip-binario').getBoundingClientRect(); return { stessaRiga: Math.abs((n.top + n.bottom) / 2 - (b.top + b.bottom) / 2) < 12, binario: Math.round(b.width) }; });
  expect(largo.stessaRiga, JSON.stringify(largo)).toBe(true);
  expect(largo.binario, 'il binario non è schiacciato dalla nota').toBeGreaterThan(300);
  // a diagramma stretto la nota di serie sparisce, ma «incompleta» resta: va sotto, tutta dentro il diagramma, senza scorrere di lato
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(nota).toBeVisible();
  const stretto = await grafo.evaluate((g) => { const n = g.querySelector('.gv-rip-nota').getBoundingClientRect(); const b = g.querySelector('.gv-rip-binario').getBoundingClientRect(); const r = g.getBoundingClientRect();
    return { sotto: n.top >= b.bottom - 1, dentro: n.left >= r.left - 1 && n.right <= r.right + 1 && n.bottom <= r.bottom + 1, scorre: g.scrollWidth > g.clientWidth + 1 }; });
  expect(stretto, JSON.stringify(stretto)).toEqual({ sotto: true, dentro: true, scorre: false });
  expect(errori).toEqual([]);
});

test('DELEGHE-DECISIONI-09b — AL CONTRARIO: una storia completa dice la frase di sempre (in inglese quella incompleta dice «incomplete»), e a diagramma stretto la nota di sempre sparisce', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 60, 420)], { cronologia: { record: STORIA() } });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-storia', 'registro');
  await expect(rip.locator('.gv-rip-nota')).toHaveText('Rigiocata dalla storia degli stati del registro');
  expect(await rip.getAttribute('data-copertura')).toBeNull();
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(rip.locator('.gv-rip-nota')).toBeHidden();
});

test('DELEGHE-DECISIONI-09c — la stessa nota in inglese', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 60, 420)], { lingua: 'en', cronologia: { record: STORIA(), coverage: 'partial' } });
  await expect(grafo.locator('.gv-rip .gv-rip-nota')).toHaveText(/^Registry history incomplete: it starts at \d{2}:\d{2}, some changes may be missing$/u);
});

/* Il nome di un agente è un nome, non la consegna intera (misurato sui dati veri il 13/10/2026: da 537 a 7.550 caratteri) */
test('DELEGHE-DECISIONI-NOME — con una consegna di migliaia di caratteri: scheda, suggerimento, nome letto, voce dell’attività, titolo del lotto e riga del ramo isolato portano un nome breve; il testo intero resta nel dettaglio e si cerca', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const consegna = `Sei un agente. Leggi src/csv.js e di’ che cosa si rompe.\n\n${'Vincolo: non toccare altro, e spiega ogni passaggio. '.repeat(100)}FINE-DELLA-CONSEGNA`;
  expect(consegna.length).toBeGreaterThan(5000);
  const passo = (s, percorso) => ({ tipo: 'attrezzo', attrezzo: 'leggi', percorso, quando: at(s) });
  const { grafo } = await apri(page, [
    figlia('a', 10, { taskCorto: consegna, task: consegna, attivita: { file: [], chiamate: 2, passi: [passo(30, 'src/csv.js')] } }),
    figlia('b', 12, { taskCorto: 'Leggi il listino', attivita: { file: [], chiamate: 1, passi: [passo(20, 'listino.csv')] } }),
    figlia('n', 40, { padreId: 'a', parentId: 'a', taskCorto: 'Conta le righe' }),
  ]);
  const scheda = grafo.locator('[data-sessione="a"]');
  await expect(scheda).toBeVisible();
  const nomi = await scheda.evaluate((c) => ({ aria: (c.getAttribute('aria-label') ?? '').length, title: (c.title ?? '').length, testo: c.querySelector('.gv-passo-nome').textContent.length }));
  expect(nomi.aria, JSON.stringify(nomi)).toBeLessThan(320);
  expect(nomi.title, JSON.stringify(nomi)).toBeLessThan(320);
  expect(nomi.testo).toBeLessThanOrEqual(160);
  await expect(scheda.locator('.gv-passo-nome')).toHaveText(/^Sei un agente\. Leggi src\/csv\.js e di’ che cosa si rompe\. Vincolo:.*…$/u);
  // la voce dell'attività: stessa altezza di quella di un agente dal nome corto, nome letto breve
  const voci = grafo.locator('.gv-attivita .gv-attivita-voce');
  await expect(voci).toHaveCount(2);
  const righe = await voci.evaluateAll((v) => v.map((x) => ({ alta: Math.round(x.getBoundingClientRect().height), aria: (x.getAttribute('aria-label') ?? '').length })));
  expect(righe[0].alta, JSON.stringify(righe)).toBe(righe[1].alta);
  for (const r of righe) expect(r.aria, JSON.stringify(righe)).toBeLessThan(320);
  // il titolo del lotto del sotto-agente («Deleghe di …») non porta la consegna
  const titoli = await grafo.locator('.talos-wfg__fase-nome, .talos-wfg__gruppo-nome').evaluateAll((n) => n.map((x) => (x.textContent ?? '').length));
  for (const lunghezza of titoli) expect(lunghezza, JSON.stringify(titoli)).toBeLessThan(120);
  // il testo INTERO resta nel dettaglio («Task corrente»)…
  await scheda.click();
  await expect(grafo.locator('.gv-dettaglio')).toContainText('FINE-DELLA-CONSEGNA');
  // …e isolando il ramo la riga sopra la tela resta una riga da leggere
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  const riga = grafo.locator('[data-mostrati]');
  await expect(riga).toContainText('e gli agenti che ha avviato');
  expect((await riga.innerText()).length).toBeLessThan(220);
  expect(errori).toEqual([]);
});

/* Dalla revisione del bugfixer (lotto 3, parte A), le osservazioni senza prova rossa */
test('DELEGHE-DECISIONI-COLONNA-01 — con la colonna «Attività recenti» aperta la prima vista è adattata alla tela VERA: nessun lotto e nessuna scheda tocca il bordo (1920×1080)', async ({ page }) => {
  const passo = (s, percorso) => ({ tipo: 'attrezzo', attrezzo: 'leggi', percorso, quando: at(s) });
  const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 12, 96), figlia('c', 320, { attivita: { file: [], chiamate: 2, passi: [passo(330, 'src/a.js')] } }), figlia('d', 322), figlia('e', 324)]);
  await expect(grafo.locator('.gv-attivita')).toBeVisible();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(5);
  // la vista si ferma (l'adattamento iniziale non è animato, ma la disposizione arriva in più passi)
  const margini = () => grafo.evaluate((g) => { const t = g.querySelector('.gv-area').getBoundingClientRect();
    const dentro = [...g.querySelectorAll('.gv-area [data-blocco], .gv-area [data-sessione], .gv-area .gv-sessione')].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0);
    return { quanti: dentro.length, sinistra: Math.round(Math.min(...dentro.map((r) => r.left)) - t.left), destra: Math.round(t.right - Math.max(...dentro.map((r) => r.right))), sopra: Math.round(Math.min(...dentro.map((r) => r.top)) - t.top), sotto: Math.round(t.bottom - Math.max(...dentro.map((r) => r.bottom))) }; });
  let prima = null;
  await expect.poll(async () => { const ora = JSON.stringify(await margini()); const uguale = ora === prima; prima = ora; return uguale; }, { intervals: [150], timeout: 5000 }).toBe(true);
  const m = await margini();
  expect(m.quanti).toBeGreaterThanOrEqual(7); // la scheda in cima, i due lotti, almeno qualche scheda
  // adattata: a destra e a sinistra resta il margine dell'adattamento (24 px), mai un lotto contro il bordo
  expect(m.destra, JSON.stringify(m)).toBeGreaterThanOrEqual(16);
  expect(m.sinistra, JSON.stringify(m)).toBeGreaterThanOrEqual(16);
  expect(m.sopra, JSON.stringify(m)).toBeGreaterThanOrEqual(8);
  expect(m.sotto, JSON.stringify(m)).toBeGreaterThanOrEqual(8);
});

test('DELEGHE-DECISIONI-COLONNA-02 — a diagramma stretto un clic sul pulsante della colonna PRIMA che arrivino i fatti la apre sopra la tela: non capovolge la scelta ricordata', async ({ page }) => {
  // il clic più precoce possibile: appena il pulsante entra nella pagina
  await page.addInitScript(() => {
    window.__clicPrecoce = 0;
    new MutationObserver(() => { const b = document.querySelector('.talos-wfg [data-attivita]'); if (b && window.__clicPrecoce === 0) { window.__clicPrecoce = 1; b.click(); } }).observe(document, { subtree: true, childList: true });
  });
  const { grafo } = await apri(page, [figlia('a', 10, { attivita: { file: [], chiamate: 1, passi: [{ tipo: 'attrezzo', attrezzo: 'leggi', percorso: 'src/a.js', quando: at(20) }] } }), figlia('b', 11)], { finestra: { width: 1024, height: 800 } });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  expect(await page.evaluate(() => window.__clicPrecoce), 'il clic precoce è partito').toBe(1);
  // la scelta ricordata non è stata toccata (resta «aperta»: mai scritto '0')
  expect(await page.evaluate(() => localStorage.getItem('talos.harness.desktop.deleghe-attivita.v1'))).not.toBe('0');
  // e il clic ha fatto ciò che fa a diagramma stretto: la colonna sopra la tela, con le sue voci
  const colonna = grafo.locator('.gv-attivita');
  await expect(colonna).toBeVisible();
  await expect(colonna).toHaveAttribute('data-forzata', 'true');
  await expect(colonna.locator('.gv-attivita-voce')).toHaveCount(1);
  await expect(grafo.locator('[data-attivita]')).toHaveAttribute('aria-pressed', 'true');
});

/* Viste nelle foto del 13/10/2026 sera, prima del commit */
test('DELEGHE-DECISIONI-DETTAGLIO-01 — cambiata richiesta il dettaglio si chiude: non resta aperto su un agente che il diagramma non mostra più', async ({ page }) => {
  const { grafo } = await apri(page, DELEGHE_DI_DUE(), { richieste: DUE_RICHIESTE });
  const selettore = grafo.locator('[data-richieste]');
  const scegli = async (n) => { await selettore.getByRole('button').first().click(); await selettore.getByRole('menuitemradio').nth(n).click(); };
  await scegli(1);
  await grafo.locator('[data-sessione="b"]').click();
  const dettaglio = grafo.locator('.gv-dettaglio');
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Leggi il CSV');
  await scegli(0);
  await expect(grafo.locator('[data-sessione="c"]')).toBeVisible();
  await expect(grafo.locator('[data-sessione="b"]')).toHaveCount(0);
  await expect(dettaglio, 'nessun agente è scelto: niente dettaglio').toBeHidden();
  // AL CONTRARIO: «Isola» tiene scelto il suo agente, e il dettaglio resta il suo
  await scegli(1);
  await grafo.locator('[data-sessione="b"]').click();
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(dettaglio).toBeVisible();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Leggi il CSV');
});

test('DELEGHE-DECISIONI-DETTAGLIO-02 — storia del registro a buchi (nessun record dell’agente): il dettaglio dice inizio e fine dai fatti, mai «non ancora partito» accanto a «Concluso»', async ({ page }) => {
  // il registro ha visto solo la conversazione e «a»: di «b» (concluso) non ha niente
  const record = [registrato(1, 30, { sessionId: RADICE, padreId: null, conclusa: false, avviataAlle: at(0), taskCorto: 'Sistema i listini' }, 'created'), registrato(2, 60, figlia('a', 60), 'created'), registrato(3, 420, finita('a', 60, 420))];
  const { grafo } = await apri(page, [finita('a', 60, 420, { taskCorto: 'Correggi i prezzi' }), finita('b', 70, 200, { taskCorto: 'Leggi il CSV' })], { cronologia: { record, coverage: 'partial' } });
  await expect(grafo.locator('.gv-rip')).toHaveAttribute('data-copertura', 'partial'); // la storia del registro è stata letta
  await grafo.locator('[data-sessione="b"]').click();
  const sotto = grafo.locator('.gv-dettaglio .talos-wfg__passo-modello').first();
  await expect(sotto).toContainText(`${ora(70)}–${ora(200)}`);
  await expect(grafo.locator('.gv-dettaglio')).not.toContainText('non ancora partito');
  // chi nel registro c'è resta com'era: dai suoi tentativi
  await grafo.locator('[data-sessione="a"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__passo-modello').first()).toContainText(`${ora(60)}–${ora(420)}`);
});

/* L3-13 — una storia che non si legge non si ritenta a ogni rilettura del diagramma: l'attesa cresce, «Riprova» non aspetta */
test('DELEGHE-DECISIONI-STORIA-01 — la cronologia del registro rotta: le riletture automatiche si diradano (1 s, 2 s, 5 s, 15 s…), «Riprova» legge subito, e quando il registro torna la storia arriva', async ({ page }) => {
  test.slow();
  const cronologia = { record: STORIA(), rotta: true };
  const { grafo, scritture } = await apri(page, [figlia('a', 60), figlia('b', 70)], { cronologia });
  const rip = grafo.locator('.gv-rip');
  await expect(rip.getByRole('button', { name: 'Riprova' })).toBeVisible();
  // 14 secondi con la rotta sempre rotta: prima erano 8-9 letture in 12 s; ora la prima, poi dopo ≥1 s, ≥2 s, ≥5 s (la quinta cade oltre)
  const allInizio = cronologia.chiamate;
  await page.waitForTimeout(14_000);
  const automatiche = cronologia.chiamate - allInizio;
  expect(automatiche, `letture automatiche in 14 s (in tutto ${cronologia.chiamate})`).toBeLessThanOrEqual(4);
  expect(cronologia.chiamate, 'ma si ritenta: non una lettura sola').toBeGreaterThanOrEqual(3);
  // «Riprova» non aspetta: legge subito anche dentro l'attesa (e, se fallisce ancora, una seconda volta)
  const prima = cronologia.chiamate;
  await rip.locator('[data-azione="riprova-storia"]').evaluate((b) => b.click());
  await expect.poll(() => cronologia.chiamate, { timeout: 700, intervals: [25], message: '«Riprova» rilegge subito' }).toBeGreaterThan(prima);
  // il registro torna: «Riprova» legge la storia, l'errore sparisce e la nota dice da dove viene
  cronologia.rotta = false;
  await rip.locator('[data-azione="riprova-storia"]').evaluate((b) => b.click());
  await expect(rip).toHaveAttribute('data-storia', 'registro', { timeout: 4000 });
  await expect(rip.locator('.gv-rip-errore')).toBeHidden();
  await expect(rip.locator('.gv-rip-nota')).toHaveText('Rigiocata dalla storia degli stati del registro');
  expect(scritture).toEqual([]);
});

test('DELEGHE-DECISIONI-STORIA-02 — isolato un ramo, l’agente che prende il posto di un altro NON ne eredita la storia: il dettaglio dice i suoi orari, e tornando a tutti ognuno ha i suoi', async ({ page }) => {
  // «a» e «b» nello stesso lotto: isolando «b», prende il POSTO che aveva «a». Fino al 13/10 sera ne prendeva anche l'id di nodo
  // (posizionale); ora gli id seguono la sessione, e si afferma.
  const { grafo } = await apri(page, [finita('a', 60, 420, { taskCorto: 'Correggi i prezzi' }), finita('b', 70, 200, { taskCorto: 'Leggi il CSV' }), finita('n', 100, 150, { padreId: 'b', parentId: 'b', taskCorto: 'Conta le righe' })]);
  const sotto = grafo.locator('.gv-dettaglio .talos-wfg__passo-modello').first();
  await grafo.locator('[data-sessione="b"]').click();
  await expect(sotto).toContainText(`${ora(70)}–${ora(200)}`);
  const nodoDiA = await grafo.locator('[data-sessione="a"]').getAttribute('data-nodo-id');
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  expect(await grafo.locator('[data-sessione="b"]').getAttribute('data-nodo-id'), 'gli id seguono la sessione: «b» NON prende l’id di «a»').not.toBe(nodoDiA);
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-nome')).toHaveText('Leggi il CSV');
  await expect(sotto, 'gli orari di «b», non quelli di «a»').toContainText(`${ora(70)}–${ora(200)}`);
  await page.waitForTimeout(1500); // anche dopo le riletture: non torna la storia di prima
  await expect(sotto).toContainText(`${ora(70)}–${ora(200)}`);
  await expect(sotto).not.toContainText(`–${ora(420)}`);
  // si torna a tutti: «a» ha i suoi orari
  await grafo.locator('[data-mostrati] [data-azione="mostra-tutti"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3);
  await grafo.locator('[data-sessione="a"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-nome')).toHaveText('Correggi i prezzi');
  await expect(sotto).toContainText(`${ora(60)}–${ora(420)}`);
});
