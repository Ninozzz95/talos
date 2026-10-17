/*
 * Owner 13/10/2026 — le tre cose che la vista classica delle deleghe mostrava e il diagramma nuovo no, portate nel nuovo
 * (mockup approvato lo stesso giorno, handoff `mockup-attivita-diagramma-2026-10-13/`):
 *   1. «che cosa fa adesso» su ogni scheda (e sulla scheda in cima: che cosa fa la conversazione);
 *   2. i conti — una frase coi totali in testata, una riga nel dettaglio dell'agente;
 *   3. «Attività recenti»: una colonna a destra della tela con gli ultimi passi di tutti, accesa e spenta dalla barra.
 * Più due difetti visti sul 4174 dopo la consegna del 13/10: la barra su due righe guardando una richiesta passata, e il
 * dettaglio che raddoppiava l'altezza con molti file.
 * Le figlie hanno la forma vera di `GET …/children` (`attivita`, `operazioneCorrente`, `usageSessione`). Solo letture.
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

const ora = (s) => new Date(Date.parse(at(s))).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const passo = (s, attrezzo, percorso) => ({ tipo: 'attrezzo', attrezzo, percorso, quando: at(s) });
/* cinque agenti: due finiti, uno che scrive un file, uno che ragiona, uno fra due operazioni */
const SCENA = () => [
  finita('a', 10, 70, { taskCorto: 'Correggi i prezzi', attivita: { file: [{ percorso: 'src/prezzi.js', letto: true, scritto: true }, { percorso: 'test/prezzi.test.js', scritto: true, creato: true }], chiamate: 9,
    passi: [{ tipo: 'avvio', quando: at(10) }, passo(20, 'leggi', 'src/prezzi.js'), passo(48, 'scrivi', 'test/prezzi.test.js'), { tipo: 'fine', quando: at(70) }] }, usageSessione: { prompt_tokens: 38000, completion_tokens: 2100 } }),
  finita('b', 12, 96, { taskCorto: 'Leggi il CSV', attivita: { file: [], chiamate: 4, passi: [] } }),
  figlia('c', 320, { taskCorto: 'Riscrivi le prove', attivita: { file: [{ percorso: 'test/sconti.test.js', scritto: true }], chiamate: 14, attrezzoCorrente: 'scrivi', bersaglioCorrente: 'test/unit/sconti.test.js',
    passi: [{ tipo: 'avvio', quando: at(320) }, passo(340, 'leggi', 'src/sconti.js')] }, usageSessione: { prompt_tokens: 55000, completion_tokens: 3000 } }),
  figlia('d', 322, { taskCorto: 'Controlla le valute', operazioneCorrente: { status: 'running', kind: 'reasoning' }, attivita: { file: [], chiamate: 6, passi: [passo(330, 'leggi', 'src/valute.js')] } }),
  figlia('e', 324, { taskCorto: 'Rivedi il lavoro', attivita: { file: [], chiamate: 0, attrezzoCorrente: null, passi: [] } }),
];

test('DELEGHE-ATTIVITA-01 — ogni scheda dice che cosa fa l’agente: l’attrezzo in volo col SUO file, «ragiona», fra due operazioni, o quando ha fatto l’ultima cosa; il modello scende accanto allo stato e la scheda non cresce', async ({ page }) => {
  /* la scena è VIVA (una funzione): dopo l'evento il prodotto rilegge le figlie, e la rotta deve rispondere coi fatti nuovi.
     Con una scena fissa la rilettura riportava «d» a «Ragionamento in corso» quando arrivava dopo l'evento: 2 corse rosse su 28
     a quattro lavoratori (13/10/2026, vista dal bugfixer 1 volta su 7) — un difetto del banco, non del diagramma. */
  const figli = SCENA();
  const { grafo } = await apri(page, () => figli);
  const riga = (id) => grafo.locator(`[data-sessione="${id}"] .gv-passo-attivita`);
  // chi lavora: il nome umano dell'attrezzo (mai l'id) e il NOME del file della chiamata in volo, non quello del passo di prima
  await expect(riga('c')).toHaveText('Scrive sconti.test.js');
  await expect(riga('c')).toHaveAttribute('data-vivo', 'true');
  await expect(riga('d')).toHaveText('Ragionamento in corso');
  await expect(riga('e')).toHaveText('Tra due operazioni');
  // chi è fermo: quando ha fatto l'ultima cosa; senza un'ora, lo dice
  await expect(riga('a')).toHaveText(`Ultima attività alle ${ora(70)}`);
  await expect(riga('a')).toHaveAttribute('data-vivo', 'false');
  await expect(riga('b')).toHaveText('Nessuna attività registrata');
  // il modello sta accanto allo stato, nella riga in fondo; la scheda è alta come prima (86 px a zoom 1: la disposizione non cambia)
  const piede = grafo.locator('[data-sessione="c"] .gv-passo-piede');
  await expect(piede.locator('.gv-passo-pill')).toHaveText('In corso'); // le parole delle deleghe (owner 14/10/2026), non «In esecuzione»
  // owner 13/10/2026: accanto allo stato il nome CORTO del modello (come nella lista delle sessioni); quello intero resta nel suggerimento
  await expect(piede.locator('.gv-passo-modello')).toHaveText('glm-5.3-flash');
  await expect(grafo.locator('[data-sessione="c"]')).toHaveAttribute('title', /z-ai\/glm-5\.3-flash$/u);
  await grafo.locator('.gv-percento').click();
  await expect(grafo.locator('.gv-percento')).toHaveText('100%');
  expect(Math.round(await grafo.locator('[data-sessione="c"]').evaluate((n) => n.getBoundingClientRect().height))).toBe(86);
  // chi usa un lettore di schermo lo sente insieme al nome e allo stato
  await expect(grafo.locator('[data-sessione="d"]')).toHaveAccessibleName(/Controlla le valute, In corso, .*Ragionamento in corso/u);
  // dal vivo: l'agente finisce ⇒ la riga passa a «Ultima attività alle…»
  const finitaD = finita('d', 322, 400, { taskCorto: 'Controlla le valute', attivita: { file: [], chiamate: 7, passi: [passo(330, 'leggi', 'src/valute.js'), { tipo: 'fine', quando: at(400) }] } });
  figli.splice(figli.findIndex((f) => f.sessionId === 'd'), 1, finitaD);
  await eventoAgente(page, finitaD);
  await expect(riga('d')).toHaveText(`Ultima attività alle ${ora(400)}`, { timeout: 4000 });
});

test('DELEGHE-ATTIVITA-02 — la scheda in cima dice che cosa fa la conversazione: aspetta i suoi agenti finché lavorano; AL CONTRARIO, finiti tutti, non aspetta nessuno', async ({ page }) => {
  const figli = SCENA();
  const { grafo } = await apri(page, () => figli);
  const cima = grafo.locator('.gv-sessione');
  await expect(cima).toContainText('Aspetta 3 agenti');
  // il modello col nome corto, come sulle schede degli agenti (13/10/2026); l'intero, col fornitore, sta nel suggerimento
  await expect(cima).toContainText('glm-5.3-flash');
  await expect(cima).not.toContainText('z-ai/');
  await expect(cima.locator('.talos-wfg__passo-modello')).toHaveAttribute('title', /z-ai\/glm-5\.3-flash/u);
  // AL CONTRARIO: quando nessuno lavora più la scheda non dice più che aspetta
  for (const id of ['c', 'd', 'e']) { const i = figli.findIndex((f) => f.sessionId === id); figli[i] = finita(id, 320, 500, { taskCorto: figli[i].taskCorto }); await eventoAgente(page, figli[i]); }
  await expect(cima).not.toContainText('Aspetta', { timeout: 8000 });
});

test('DELEGHE-ATTIVITA-03 — i conti: i totali in una frase in testata («almeno» quando un agente non li dichiara) e quelli dell’agente nel dettaglio', async ({ page }) => {
  const { grafo } = await apri(page, SCENA());
  const descrizione = grafo.locator('.talos-wfg__descrizione');
  // 9 + 4 + 14 + 6 + 0 chiamate; 2 + 0 + 1 + 0 + 0 file; i token li dichiarano due agenti su cinque ⇒ «almeno»
  await expect(descrizione).toContainText('Finora: 33 chiamate, 3 file toccati e almeno ');
  await expect(descrizione).toContainText(' token. Scegli un agente');
  await expect(descrizione).not.toContainText('almeno 33');
  await grafo.locator('[data-sessione="a"]').click();
  const conti = grafo.locator('.gv-dettaglio [data-conti]');
  await expect(conti).toContainText('9 chiamate');
  await expect(conti).toContainText('2 file');
  await expect(conti).toContainText('token');
  // AL CONTRARIO: un agente che non dichiara i token non ne mostra, e uno senza nessun conto non ha la riga
  await grafo.locator('[data-sessione="b"]').click();
  await expect(grafo.locator('.gv-dettaglio [data-conti]')).toHaveText(/^4 chiamate · 0 file$/u);
});

test('DELEGHE-ATTIVITA-03b — AL CONTRARIO: senza nessun conto dichiarato la testata resta la frase di prima, e niente «0 chiamate» inventato', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10, { attivita: undefined }), finita('b', 12, 90, { attivita: undefined })]);
  await expect(grafo.locator('.talos-wfg__descrizione')).toHaveText(/^Gli agenti avviati da questa conversazione/u);
  await grafo.locator('[data-sessione="b"]').click();
  await expect(grafo.locator('.gv-dettaglio')).toBeVisible();
  await expect(grafo.locator('.gv-dettaglio [data-conti]')).toHaveCount(0);
});

test('DELEGHE-ATTIVITA-04 — «Attività recenti»: una colonna a destra della tela, dal passo più nuovo, e ogni voce porta al suo agente; il pulsante la spegne, la tela si riallarga e la scelta si ricorda', async ({ page }) => {
  const { grafo } = await apri(page, SCENA());
  const colonna = grafo.locator('.gv-attivita');
  const pulsante = grafo.locator('[data-attivita]');
  await expect(colonna).toBeVisible();
  await expect(pulsante).toHaveAttribute('aria-pressed', 'true');
  await expect(colonna).toHaveAccessibleName('Attività recenti');
  const voci = colonna.locator('.gv-attivita-voce');
  // i passi con l'ora di tutti gli agenti, dal più nuovo: c@340, d@330, c@320 (avvio), a@70 (fine), a@48, a@20, a@10 (avvio)
  await expect(voci).toHaveCount(7);
  await expect(voci.nth(0)).toContainText('Riscrivi le prove');
  await expect(voci.nth(0)).toContainText('Letto src/sconti.js');
  await expect(voci.nth(0).locator('.gv-attivita-ora')).toHaveText(ora(340));
  await expect(voci.nth(1)).toContainText('Controlla le valute');
  await expect(voci.nth(3)).toContainText('Correggi i prezzi');
  await expect(voci.nth(3)).toContainText('Concluso');
  await expect(voci.nth(0).locator('use')).toHaveAttribute('href', '#i-eye'); // l'icona è della specie dell'attrezzo (una lettura)
  // la colonna sta ACCANTO alla tela, non sopra: i due rettangoli non si toccano
  const fianco = await grafo.evaluate((g) => { const t = g.querySelector('.gv-area').getBoundingClientRect(); const c = g.querySelector('.gv-attivita').getBoundingClientRect(); return { telaDestra: Math.round(t.right), colonnaSinistra: Math.round(c.left), tela: Math.round(t.width) }; });
  expect(fianco.colonnaSinistra, JSON.stringify(fianco)).toBeGreaterThanOrEqual(fianco.telaDestra);
  // una voce porta al suo agente: lo sceglie e il dettaglio è il suo (col puntatore e da tastiera)
  await voci.nth(3).click();
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(grafo.locator('.talos-wfg__dettaglio-nome')).toHaveText('Correggi i prezzi');
  await voci.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(grafo.locator('.talos-wfg__dettaglio-nome')).toHaveText('Controlla le valute');
  // spenta: la colonna sparisce e la tela prende il suo posto
  await pulsante.click();
  await expect(colonna).toBeHidden();
  await expect(pulsante).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => grafo.evaluate((g) => Math.round(g.querySelector('.gv-area').getBoundingClientRect().width))).toBeGreaterThan(fianco.tela + 250);
  // e si ricorda: ricaricata la pagina e riaperto il diagramma, resta spenta
  expect(await page.evaluate(() => localStorage.getItem('talos.harness.desktop.deleghe-attivita.v1'))).toBe('0');
});

test('DELEGHE-ATTIVITA-04c — una voce NON scompone il diagramma: lo zoom resta quello che era e la vista si sposta solo quanto serve perché la scheda si veda intera; AL CONTRARIO, con lo zoom della persona e la scheda fuori dalla vista, ci entra e lo zoom resta il suo', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); // la finestra della foto del 13/10 in cui il diagramma finiva contro il bordo
  const { grafo } = await apri(page, SCENA());
  const voci = grafo.locator('.gv-attivita .gv-attivita-voce');
  await expect(voci).toHaveCount(7);
  const vista = () => grafo.evaluate((g) => { const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/u.exec(g.querySelector('.gv-mondo').style.transform); return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) }; });
  /* quanto una scheda esce dalla tela (0 = si vede intera) */
  const fuori = (id) => grafo.evaluate((g, sessione) => { const c = g.querySelector(`[data-sessione="${sessione}"]`)?.getBoundingClientRect(); const t = g.querySelector('.gv-area').getBoundingClientRect();
    return c ? Math.round(Math.max(0, t.left - c.left, c.right - t.right, t.top - c.top, c.bottom - t.bottom)) : null; }, id);
  const ferma = async () => { let prima = null; await expect.poll(async () => { const ora = JSON.stringify(await vista()); const uguale = ora === prima; prima = ora; return uguale; }, { intervals: [120], timeout: 4000, message: 'la vista si ferma' }).toBe(true); return vista(); };
  const adattata = await ferma();
  expect(await fuori('d'), 'a diagramma adattato la scheda si vede intera').toBe(0);
  // la voce di «Controlla le valute» (d): il dettaglio si apre e toglie altezza alla tela, ma il diagramma non si scompone
  await voci.nth(1).click();
  await expect(grafo.locator('.talos-wfg__dettaglio-nome')).toHaveText('Controlla le valute');
  const dopo = await ferma();
  expect(dopo.zoom, `lo zoom non cambia: ${JSON.stringify({ adattata, dopo })}`).toBe(adattata.zoom);
  expect(dopo.x, `in orizzontale non si muove niente: ${JSON.stringify({ adattata, dopo })}`).toBe(adattata.x);
  expect(await fuori('d'), 'la scheda scelta si vede intera').toBe(0);
  // un'altra voce, col dettaglio già aperto e la scheda già in vista: niente si muove
  await voci.nth(0).click();
  await expect(grafo.locator('.talos-wfg__dettaglio-nome')).toHaveText('Riscrivi le prove');
  expect(await fuori('c')).toBe(0);
  expect((await ferma()).zoom).toBe(adattata.zoom);
  // AL CONTRARIO: la persona ingrandisce finché la scheda di uno degli agenti dell'elenco esce dalla vista; la sua voce ce la riporta
  const piu = grafo.getByRole('button', { name: 'Aumenta lo zoom del 10%' });
  const candidati = [['a', 3, 'Correggi i prezzi'], ['d', 1, 'Controlla le valute'], ['c', 0, 'Riscrivi le prove']]; // [agente, la sua voce, il suo nome]
  let uscita = null;
  for (let i = 0; i < 12 && !uscita; i += 1) { await piu.click(); await ferma(); for (const c of candidati) { if ((await fuori(c[0])) !== 0) { uscita = c; break; } } }
  const dellaPersona = await ferma();
  expect(uscita, `ingrandendo, una scheda esce dalla vista: ${JSON.stringify(dellaPersona)}`).not.toBeNull();
  const [agente, voce, nome] = uscita;
  await voci.nth(voce).click();
  await expect(grafo.locator('.talos-wfg__dettaglio-nome')).toHaveText(nome);
  const riportata = await ferma();
  expect(await fuori(agente), `la scheda di «${nome}» rientra per intero: ${JSON.stringify({ dellaPersona, riportata })}`).toBe(0);
  expect(riportata.zoom, 'e lo zoom resta quello scelto dalla persona').toBe(dellaPersona.zoom);
});

test('DELEGHE-ATTIVITA-04b — AL CONTRARIO: senza nessun passo la colonna lo dice, e un aggiornamento dal vivo che non cambia niente non toglie il fuoco dalla voce', async ({ page }) => {
  const figli = [figlia('a', 10, { taskCorto: 'Agente A', attivita: { file: [], chiamate: 1, passi: [] } })];
  const { grafo } = await apri(page, () => figli);
  const colonna = grafo.locator('.gv-attivita');
  await expect(colonna.locator('.talos-wfg__vuoto')).toHaveText('Ancora nessun passo. Qui compare ciò che fanno gli agenti.');
  await expect(colonna.locator('.gv-attivita-voce')).toHaveCount(0);
  // arriva un passo dal vivo: la voce compare
  figli[0] = figlia('a', 10, { taskCorto: 'Agente A', attivita: { file: [], chiamate: 2, passi: [passo(30, 'leggi', 'src/a.js')] } });
  await eventoAgente(page, figli[0]);
  const voce = colonna.locator('.gv-attivita-voce');
  await expect(voce).toHaveCount(1, { timeout: 4000 });
  await voce.focus();
  // un aggiornamento che non cambia l'elenco (stessi passi) non lo ricostruisce: il fuoco resta dov'è
  await eventoAgente(page, { ...figli[0] });
  await page.waitForTimeout(1500);
  await expect(voce).toBeFocused();
});

test('DELEGHE-ATTIVITA-05 — in RIPRODUZIONE i fatti di adesso non si dicono: le schede tornano col modello, la testata con la sua frase, e l’elenco mostra solo ciò che era già successo', async ({ page }) => {
  const { grafo } = await apri(page, SCENA());
  await expect(grafo.locator('[data-sessione="c"] .gv-passo-attivita')).toBeVisible();
  const rip = grafo.locator('.gv-rip');
  await rip.locator('.gv-rip-binario').focus();
  await page.keyboard.press('Home'); // l'inizio della storia
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(grafo.locator('.gv-passo-attivita')).toHaveCount(0);
  await expect(grafo.locator('.gv-sessione')).not.toContainText('Aspetta');
  await expect(grafo.locator('.talos-wfg__descrizione')).toHaveText(/^Gli agenti avviati da questa conversazione/u);
  // all'inizio della storia è successa una cosa sola: il primo agente è partito
  const allInizio = grafo.locator('.gv-attivita .gv-attivita-voce');
  await expect(allInizio).toHaveCount(1);
  await expect(allInizio).toContainText('Correggi i prezzi');
  await expect(allInizio).toContainText('Avviato');
  // tornati al vivo, tutto com'era
  await rip.locator('.gv-rip-vivo').click();
  await expect(grafo.locator('[data-sessione="c"] .gv-passo-attivita')).toBeVisible();
  await expect(grafo.locator('.gv-attivita .gv-attivita-voce')).toHaveCount(7);
});

for (const [w, h] of [[1440, 900], [1024, 800]]) {
  test(`DELEGHE-ATTIVITA-06 (${w}×${h}) — a diagramma stretto la colonna non toglie tela: non si apre da sola, il pulsante la mostra SOPRA la tela e la toglie`, async ({ page }) => {
    const { grafo } = await apri(page, SCENA(), { finestra: { width: w, height: h } });
    const colonna = grafo.locator('.gv-attivita');
    const pulsante = grafo.locator('[data-attivita]');
    await expect(colonna).toBeHidden();
    await expect(pulsante).toBeVisible();
    await expect(pulsante).toHaveAttribute('aria-pressed', 'false');
    const tela = () => grafo.evaluate((g) => Math.round(g.querySelector('.gv-area').getBoundingClientRect().width));
    const prima = await tela();
    await pulsante.click();
    await expect(colonna).toBeVisible();
    await expect(pulsante).toHaveAttribute('aria-pressed', 'true');
    expect(await tela(), 'sopra la tela: la tela non si stringe').toBe(prima);
    const dentro = await grafo.evaluate((g) => { const p = g.querySelector('.gv-palco').getBoundingClientRect(); const c = g.querySelector('.gv-attivita').getBoundingClientRect(); return c.left >= p.left - 1 && c.right <= p.right + 1 && c.top >= p.top - 1 && c.bottom <= p.bottom + 1; });
    expect(dentro, 'la colonna resta dentro il palco').toBe(true);
    await pulsante.click();
    await expect(colonna).toBeHidden();
  });
}

for (const lingua of ['it', 'en']) {
  test(`DELEGHE-ATTIVITA-07 (${lingua}) — a 1920 la barra sta su UNA riga anche guardando una richiesta PASSATA (etichetta lunga), e niente è tagliato`, async ({ page }) => {
    /* visto sul 4174 il 13/10/2026: «Richiesta delle 20:24» mandava gli attrezzi della tela su una seconda riga, a sinistra.
       Scena: tre richieste, due hanno delegato e l'ULTIMA no ⇒ si guarda la seconda, con la sua etichetta lunga. */
    const { grafo } = await apri(page, SCENA(), { lingua, cartella: 'C:/progetti/listini',
      richieste: [{ at: at(0), testo: 'Sistema i listini' }, { at: at(300), testo: 'Ora aggiungi le prove' }, { at: at(600), testo: 'Grazie, basta così' }] });
    await expect(grafo.locator('[data-richieste] > button')).toBeVisible();
    await expect(grafo.locator('[data-richieste] > button')).toContainText(lingua === 'it' ? 'Richiesta delle' : 'Request at');
    const righe = () => grafo.evaluate((g) => { const c = g.querySelector('.gv-comandi'); const v = [...c.querySelectorAll(':scope > .gv-comandi-gruppo > *')].filter((x) => x.offsetParent);
      return { righe: new Set(v.map((x) => Math.round(x.getBoundingClientRect().top / 10))).size, sborda: c.scrollWidth > c.clientWidth + 1, tagliati: [...c.querySelectorAll('button')].filter((x) => x.offsetParent && x.scrollWidth > x.clientWidth + 1).length }; });
    await expect.poll(async () => (await righe()).righe, { message: 'una riga sola a 1920' }).toBe(1);
    expect(await righe()).toEqual({ righe: 1, sborda: false, tagliati: 0 });
    // la voce scelta di ogni scelta a segmenti resta scritta; la vista non scelta, se compatta, resta raggiungibile col suo nome
    await expect(grafo.getByRole('radio', { name: lingua === 'it' ? 'Tempo' : 'Time' })).toBeVisible();
  });
}

test('DELEGHE-ATTIVITA-08 — molti file non alzano il dettaglio: cinque righe, poi l’elenco scorre; AL CONTRARIO con pochi file è alto uguale', async ({ page }) => {
  const settanta = Array.from({ length: 70 }, (_, i) => ({ percorso: `src/contratti/file-${String(i).padStart(2, '0')}.js`, letto: true }));
  const { grafo } = await apri(page, [finita('tanti', 10, 70, { taskCorto: 'Tanti file', attivita: { file: settanta, chiamate: 80, passi: [] } }), finita('pochi', 12, 90, { taskCorto: 'Pochi file', attivita: { file: settanta.slice(0, 2), chiamate: 3, passi: [] } })]);
  const altezza = () => grafo.evaluate((g) => Math.round(g.querySelector('.gv-dettaglio').getBoundingClientRect().height));
  await grafo.locator('[data-sessione="pochi"]').click();
  await expect(grafo.locator('.gv-dettaglio [data-file] [data-percorso]')).toHaveCount(2);
  const conPochi = await altezza();
  await grafo.locator('[data-sessione="tanti"]').click();
  await expect(grafo.locator('.gv-dettaglio [data-file]')).toContainText('70');
  const elenco = grafo.locator('.gv-dettaglio [data-file] > .talos-wfg__evidenze');
  const misura = await elenco.evaluate((n) => ({ visibile: n.clientHeight, intero: n.scrollHeight }));
  expect(misura.intero, `l'elenco scorre al suo interno: ${JSON.stringify(misura)}`).toBeGreaterThan(misura.visibile + 100);
  expect(misura.visibile).toBeLessThanOrEqual(144);
  expect(await altezza(), `con 70 file il dettaglio non si alza: ${conPochi} px con 2 file`).toBeLessThanOrEqual(conPochi + 110);
  // la tela ha ancora il suo spazio (a 1920×1080 erano 430 px col dettaglio al tetto)
  expect(await grafo.evaluate((g) => Math.round(g.querySelector('.gv-area').getBoundingClientRect().height))).toBeGreaterThan(480);
});
