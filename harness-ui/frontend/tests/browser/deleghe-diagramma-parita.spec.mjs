/*
 * Le prove della VISTA CLASSICA delle deleghe portate sul diagramma nuovo (owner 13/10/2026: «le quattro funzioni si portano,
 * poi la classica sparisce»). Tabella di chi copre che cosa: handoff `TABELLA-PROVE-CLASSICA-2026-10-13.md`.
 * Qui stanno quelle che non sono un filtro né la riproduzione dal registro (quelle sono in `deleghe-sul-diagramma.spec.mjs`):
 * la tela che si accorcia, la minimappa, gli indicatori di stato e il movimento, la densità, la tastiera, la riproduzione.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, finita, RADICE } from './aiuto-deleghe-diagramma.mjs';

const misura = (grafo) => grafo.evaluate((g) => {
  const tela = g.querySelector('.gv-tela').getBoundingClientRect();
  const cima = g.querySelector('.gv-sessione').getBoundingClientRect();
  return { sopra: Math.round(cima.top - tela.top), sotto: Math.round(tela.bottom - cima.bottom), sinistra: Math.round(cima.left - tela.left), destra: Math.round(tela.right - cima.right),
    zoom: g.querySelector('.gv-percento').textContent.trim(), mondo: g.querySelector('.gv-mondo').style.transform };
});
const dentroLaTela = (carta) => carta.evaluate((n) => { const r = n.getBoundingClientRect(); const c = n.closest('.gv-tela').getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom; });
/* il bordo che gira di chi lavora, misurato sull'OGGETTO (l'animazione che il browser sta davvero eseguendo), non sulla regola */
const bordoCheGira = (carta) => carta.evaluate((n) => n.getAnimations({ subtree: true }).filter((a) => a.effect?.pseudoElement === '::before')
  .map((a) => ({ nome: a.animationName, stato: a.playState, durata: a.effect.getTiming().duration })));

test('DELEGHE-PARITA-01 — la scheda in cima resta intera nella tela quando la finestra si accorcia; AL CONTRARIO lo zoom scelto dalla persona resta', async ({ page }) => {
  // porta DIAGRAMMA-VISTA-02 (09/10: nella classica la scheda principale usciva tagliata in alto dopo un ridimensionamento)
  const { grafo } = await apri(page, [figlia('a', 10), finita('b', 12, 90)]);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  const prima = await misura(grafo);
  for (const lato of ['sopra', 'sotto', 'sinistra', 'destra']) expect(prima[lato], `scheda in cima, ${lato}: ${JSON.stringify(prima)}`).toBeGreaterThanOrEqual(0);
  await page.setViewportSize({ width: 1920, height: 930 });
  await page.waitForTimeout(400);
  const dopo = await misura(grafo);
  for (const lato of ['sopra', 'sotto', 'sinistra', 'destra']) expect(dopo[lato], `dopo il ridimensionamento, ${lato}: ${JSON.stringify(dopo)}`).toBeGreaterThanOrEqual(0);
  // AL CONTRARIO: un gesto della persona (il «+») non viene disfatto da un ridimensionamento
  await grafo.getByRole('button', { name: 'Aumenta lo zoom del 10%' }).click();
  expect(dopo.zoom).toBe('100%');
  await expect(grafo.locator('.gv-percento'), 'il «+» porta al 110% (lo zoom è animato: si aspetta il valore finale)').toHaveText('110%');
  const scelto = '110%';
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(400);
  expect((await misura(grafo)).zoom, 'lo zoom della persona resta').toBe(scelto);
});

test('DELEGHE-PARITA-02 — la minimappa c’è solo quando serve: scena grande E una parte fuori dalla vista; «Adatta» la toglie', async ({ page }) => {
  // porta la parte «minimappa» di RIPRESA-GRAFO-MOCKUP e DIAGRAMMA-VISTA-02b. Nel nuovo la minimappa si muove col puntatore;
  // la strada da tastiera è «0» sulla tela (adatta), detta nell'etichetta della tela.
  // misurato: la minimappa è prevista solo per le scene grandi (più di 25 fra agenti e gruppi: `grafo/tela.js`, `disegnaMinimappa`)
  const ventisei = Array.from({ length: 26 }, (_, i) => figlia(`m${String(i).padStart(2, '0')}`, 10 + i));
  const { grafo } = await apri(page, ventisei);
  const mini = grafo.locator('.gv-minimappa');
  await grafo.getByRole('button', { name: 'Adatta il diagramma alla finestra' }).click();
  await expect(mini, 'tutto in vista: niente minimappa').toBeHidden();
  const piu = grafo.getByRole('button', { name: 'Aumenta lo zoom del 10%' });
  for (let i = 0; i < 12 && !(await mini.isVisible()); i += 1) await piu.click();
  await expect(mini, 'una parte è fuori dalla vista: la minimappa compare').toBeVisible();
  expect(await mini.locator('.gv-mini-blocco').count(), 'i gruppi disegnati nella minimappa').toBeGreaterThan(0);
  await expect(mini.locator('.gv-mini-sessione')).toHaveCount(1);
  // da tastiera: «0» sulla tela adatta, e la minimappa non serve più
  await grafo.locator('.gv-tela').focus();
  await page.keyboard.press('0');
  await expect(mini).toBeHidden();
});

test('DELEGHE-PARITA-02b — AL CONTRARIO: con pochi agenti la minimappa non compare nemmeno ingrandendo', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10), finita('b', 12, 90), figlia('c', 14)]);
  const piu = grafo.getByRole('button', { name: 'Aumenta lo zoom del 10%' });
  for (let i = 0; i < 8; i += 1) await piu.click();
  await expect(grafo.locator('.gv-minimappa')).toBeHidden();
});

test('DELEGHE-PARITA-03 — lo stato si vede, si muove e si legge: chi lavora ha il bordo che gira (piano col movimento ridotto, MAI fermo), chi ha finito no', async ({ page }) => {
  // porta RIPRESA-GRAFO-INDICATORI e la parte «movimento ridotto» di RIPRESA-GRAFO-MOVIMENTO. Regola dell'owner del 24/09:
  // le animazioni si provano col movimento ridotto, e si misura l'animazione che GIRA, non la regola che la dichiara.
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo } = await apri(page, () => figli);
  const carta = grafo.locator('[data-sessione="a"]');
  await expect(carta).toHaveAttribute('data-stato', 'running');
  await expect(carta.locator('.talos-wfg__punto')).toBeVisible();
  await expect(carta.locator('.gv-passo-pill')).toHaveText('In corso');
  await expect(carta).toHaveAccessibleName(/Compito a, In corso/u);
  expect(await bordoCheGira(carta), 'chi lavora: il bordo gira').toEqual([{ nome: 'gv-gira', stato: 'running', durata: 1600 }]);
  // movimento ridotto del SISTEMA (la macchina dell'owner): piano, non fermo
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await bordoCheGira(carta), 'movimento ridotto del sistema: gira piano').toEqual([{ nome: 'gv-gira', stato: 'running', durata: 7000 }]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // movimento ridotto scelto nell'APP (Impostazioni → Aspetto): stessa regola
  await page.evaluate(() => document.body.classList.add('reduce-motion'));
  const conApp = await bordoCheGira(carta);
  expect(conApp.length, `movimento ridotto dell'app: il bordo non si ferma (${JSON.stringify(conApp)})`).toBe(1);
  expect(conApp[0].stato).toBe('running');
  await page.evaluate(() => document.body.classList.remove('reduce-motion'));
  // gli stati finali arrivano in diretta: parola, attributo e colore del punto cambiano
  const colori = [await carta.locator('.talos-wfg__punto').evaluate((n) => getComputedStyle(n).backgroundColor)];
  for (const [extra, parola, stato] of [[{ esitoDelega: 'concluso' }, 'Concluso', 'succeeded'], [{ esitoDelega: 'errore: la prova è fallita' }, 'Non riuscito', 'failed']]) {
    const nuova = finita('a', 10, 70, extra);
    figli.splice(0, 1, nuova);
    await eventoAgente(page, nuova);
    await expect(carta).toHaveAttribute('data-stato', stato, { timeout: 2500 });
    await expect(carta.locator('.gv-passo-pill')).toHaveText(parola);
    await expect(carta).toHaveAccessibleName(new RegExp(`Compito a, ${parola}`, 'u'));
    colori.push(await carta.locator('.talos-wfg__punto').evaluate((n) => getComputedStyle(n).backgroundColor));
  }
  expect(new Set(colori).size, `tre stati, tre colori: ${colori.join(' | ')}`).toBe(3);
  // AL CONTRARIO: chi è fermo (qui non riuscito) non gira; l'altro, che lavora ancora, sì
  expect(await bordoCheGira(carta)).toEqual([]);
  expect((await bordoCheGira(grafo.locator('[data-sessione="b"]'))).map((x) => x.stato)).toEqual(['running']);
});

test('DELEGHE-PARITA-04 — quattordici agenti: si leggono, «Adatta» li mostra tutti, e l’agente scelto resta nella tela anche a 1024×800', async ({ page }) => {
  // porta RIPRESA-GRAFO-DENSITA. ⛔ La parte «scelto da TASTIERA» della classica (fuoco sulla scheda + Invio) qui NON è portata:
  //   sul diagramma nuovo ha un difetto (K1, passato al bugfixer il 13/10/2026): si prova col puntatore, la tastiera la prova chi cura.
  const tredici = Array.from({ length: 13 }, (_, i) => figlia(`d${String(i).padStart(2, '0')}`, 10 + i, { taskCorto: `Agente ${i}` }));
  const { grafo } = await apri(page, [finita('z', 5, 9, { taskCorto: 'Primo' }), ...tredici]);
  await expect(grafo.locator(':scope > header')).toContainText('14 agenti');
  const zoom = () => grafo.locator('.gv-percento').innerText().then((s) => parseInt(s, 10));
  await grafo.getByRole('button', { name: 'Adatta il diagramma alla finestra' }).click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(14);
  for (const id of ['z', 'd00', 'd12']) expect(await dentroLaTela(grafo.locator(`[data-sessione="${id}"]`)), `dopo «Adatta» ${id} è nella tela`).toBe(true);
  const adattato = await zoom();
  expect(adattato, 'adattato resta leggibile (le schede portano nome e stato, non sono punti)').toBeGreaterThanOrEqual(30);
  await expect(grafo.locator('[data-sessione="d12"] .gv-passo-nome')).toHaveText('Agente 12');
  // l'ultimo agente, scelto: il dettaglio è il suo, e la scheda resta nella tela anche col dettaglio aperto
  const ultima = grafo.locator('[data-sessione="d12"]');
  await ultima.click();
  await expect(grafo.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente 12');
  await expect(ultima).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => dentroLaTela(ultima), { message: 'la scheda scelta è nella tela' }).toBe(true);
  // il pulsante della percentuale porta al 100% (qui il diagramma non entra più tutto), e «Adatta» lo riporta intero
  await grafo.locator('.gv-percento').click();
  await expect.poll(zoom, { message: 'il pulsante della percentuale porta al 100%' }).toBe(100);
  await page.setViewportSize({ width: 1024, height: 800 });
  await grafo.getByRole('button', { name: 'Adatta il diagramma alla finestra' }).click();
  await expect.poll(() => dentroLaTela(ultima), { message: 'a 1024×800, dopo «Adatta», resta nella tela' }).toBe(true);
});

test('DELEGHE-PARITA-05 — da tastiera: il dettaglio, il menu «⋯», la lente, e Esc che non arriva mai alla chat', async ({ page }) => {
  // porta RIPRESA-GRAFO-GRAMMATICA (nel nuovo la grammatica È quella del Workflow: qui si prova che vale per le deleghe)
  // la conversazione ha un giro IN CORSO (dalla porta vera, `RunStarted`): è quando Esc, se arriva alla chat, chiede «Fermo il giro?»
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: 'leggi il registro', task: 'Leggi il registro e correggi la guardia di stallo' }), finita('b', 12, 90, { taskCorto: 'controlla le prove' })],
    { richieste: [{ at: at(0), testo: 'Sistema i listini' }] });
  const fermoIlGiro = page.getByText('Fermo il giro?').filter({ visible: true });
  const dettaglio = grafo.locator('.gv-dettaglio');
  await expect(dettaglio).toBeHidden();
  const carta = grafo.locator('[data-sessione="a"]');
  await carta.focus();
  await page.keyboard.press('Enter');
  await expect(dettaglio).toBeVisible();
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('leggi il registro');
  await expect(dettaglio.locator('.talos-wfg__pill').first()).toHaveAttribute('data-tono', 'corso');
  await expect(dettaglio).toContainText('correggi la guardia di stallo');
  // il «⋯» del dettaglio apre il menu VERO della delega (lo stesso del pannello Agenti, fuori dal diagramma): si apre da
  // tastiera col fuoco sulla prima voce, Esc chiude e rende il fuoco al pulsante. ⛔ Le FRECCE fra le voci oggi non si muovono
  //   (K2, passato al bugfixer il 13/10/2026): qui non si provano, la prova rossa la scrive chi cura.
  const altro = dettaglio.getByRole('button', { name: 'Altre azioni sull\'agente' });
  await altro.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu').filter({ visible: true });
  await expect(menu).toHaveCount(1);
  const voci = menu.getByRole('menuitem');
  const quante = await voci.count();
  expect(quante, 'il menu ha voci').toBeGreaterThan(1);
  await expect(voci.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu').filter({ visible: true })).toHaveCount(0);
  await expect(altro).toBeFocused();
  await page.waitForTimeout(300);
  await expect(fermoIlGiro, 'Esc è del menu, non della chat').toHaveCount(0);
  // la lente: apre il campo col fuoco dentro; col testo Esc svuota, a campo vuoto chiude e torna alla lente
  const lente = grafo.getByRole('button', { name: 'Cerca nel diagramma' });
  const campo = grafo.locator('.talos-wfg__cerca');
  await expect(campo).toBeHidden();
  await lente.click();
  await expect(campo).toBeFocused();
  await page.keyboard.type('controlla');
  await expect(campo).toHaveValue('controlla');
  await page.keyboard.press('Escape');
  await expect(campo).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(campo).toBeHidden();
  await expect(lente).toBeFocused();
  await page.waitForTimeout(300);
  await expect(fermoIlGiro, 'nemmeno la lente manda Esc alla chat').toHaveCount(0);
  // nessun controllo nativo (regola dell'owner del 13/09): il filtro per stato e l'ambito sono scelte disegnate
  await expect(grafo.locator('select')).toHaveCount(0);
  // IL CONTROLLO POSITIVO: tornati alla chat, lo stesso tasto la raggiunge e chiede davvero di fermare il giro. Senza questo
  // le due assenze qui sopra non proverebbero niente (una scena senza giro in corso non lo chiede mai).
  await grafo.getByRole('button', { name: 'Torna alla chat' }).click();
  await expect(grafo).toBeHidden();
  await page.locator('#schermoChat').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('Escape');
  await expect(fermoIlGiro, 'fuori dal diagramma Esc arriva alla chat: il giro in corso c’è davvero').toHaveCount(1);
});

test('DELEGHE-PARITA-06 — riproduzione: una velocità sola accesa, parte e si ferma dallo stesso pulsante, e «Torna al vivo» riporta adesso', async ({ page }) => {
  // porta le parti «pausa» e «velocità» di RIPRESA-REPLAY-PLAYER e l'ultima riga di RIPRESA-GRAFO-GRAMMATICA
  const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 12, 3000), figlia('c', 3100)]);
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  const velocita = rip.getByRole('radiogroup', { name: 'Velocità' });
  await expect(velocita.getByRole('radio', { checked: true })).toHaveCount(1);
  // ×300: il cursore conta in minuti (misurato: `aria-valuemax` = minuti dall'inizio), a ×10 in un secondo non cambierebbe
  await velocita.getByRole('radio', { name: '×300' }).click();
  await expect(velocita.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(velocita.getByRole('radio', { name: '×300' })).toHaveAttribute('aria-checked', 'true');
  await expect(rip).toHaveAttribute('data-attiva', 'false');
  const gioca = rip.locator('.gv-rip-gioca');
  const istante = () => rip.locator('.gv-rip-binario').getAttribute('aria-valuenow').then(Number);
  await gioca.click();
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  // dall'inizio: nessuno ha ancora finito
  await expect(rip.locator('.gv-rip-testo')).toContainText('0 di 3 terminati');
  const t1 = await istante();
  await expect.poll(istante, { message: `la riproduzione avanza da ${t1}`, timeout: 6000 }).toBeGreaterThan(t1 + 8);
  // pausa: lo stesso pulsante la ferma, e l'istante non si muove più
  await gioca.click();
  const fermo = await istante();
  await page.waitForTimeout(700);
  expect(await istante(), 'in pausa l’istante resta dov’è').toBe(fermo);
  await expect(rip, 'in pausa si sta ancora guardando il passato').toHaveAttribute('data-attiva', 'true');
  // riprende DA LÌ, non dall'inizio: l'istante si legge SUBITO (a ×300 una ripartenza da capo lo risupererebbe in un secondo)
  expect(fermo, 'la pausa è arrivata abbastanza avanti da distinguere una ripresa da una ripartenza').toBeGreaterThan(8);
  await gioca.click();
  expect(await istante(), `riprende da ${fermo}, non da capo`).toBeGreaterThanOrEqual(fermo);
  await expect.poll(istante, { message: `e va avanti da ${fermo}`, timeout: 4000 }).toBeGreaterThan(fermo);
  await gioca.click();
  // torna al vivo
  await rip.locator('.gv-rip-vivo').click();
  await expect(rip).toHaveAttribute('data-attiva', 'false');
  await expect(rip.locator('.gv-rip-testo')).toContainText('2 di 3 terminati');
  await expect(grafo.locator('[data-sessione="c"]')).toHaveAttribute('data-stato', 'running');
});

test('DELEGHE-PARITA-07 — la scheda in cima dice l’ultima attività della conversazione dall’orologio del server; AL CONTRARIO, senza quell’orario non ne inventa uno', async ({ page }) => {
  /* erano DIAGRAMMA-VISTA-03 e 03b della vista classica (09/10/2026: la scheda principale diceva «Nessuna attività registrata»
     accanto a «1 chiamata», perché i suoi passi erano sempre vuoti). Stessa scena: un giro finito, con un attrezzo. */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 10, 70)]);
  const cima = grafo.locator('.gv-sessione');
  const manda = (eventi) => page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; const g = r.realSessionState.generation; for (const e of lista) r.handleRealEvent(e, g); }, eventi);
  // senza l'orario del server sull'attrezzo: la scheda non inventa un'ora
  await manda([{ type: 'RunStarted', _sequenza: 71000, input: { consegna: 'Dividi il lavoro' } }, { type: 'ToolCallStart', toolCallId: 'p7a', toolCallName: 'leggi', _sequenza: 71001 },
    { type: 'ToolCallResult', toolCallId: 'p7a', content: 'ok', _sequenza: 71002 }, { type: 'RunFinished', _sequenza: 71003 }]);
  await expect(cima).toContainText('Nessuna attività registrata', { timeout: 4000 });
  await expect(cima).not.toContainText('Ultima attività alle');
  // con l'orario del server: l'ora è la sua
  const quando = Date.parse('2026-10-09T13:51:00.000Z');
  const ora = new Date(quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  await manda([{ type: 'RunStarted', _sequenza: 71004, input: { consegna: 'Ancora' } }, { type: 'ToolCallStart', toolCallId: 'p7b', toolCallName: 'leggi', _sequenza: 71005, avviatoA: quando },
    { type: 'ToolCallResult', toolCallId: 'p7b', content: 'ok', _sequenza: 71006 }, { type: 'RunFinished', _sequenza: 71007 }]);
  await expect(cima).toContainText(`Ultima attività alle ${ora}`, { timeout: 4000 });
  await expect(cima).not.toContainText('Nessuna attività registrata');
  expect(errori).toEqual([]);
});

test('DELEGHE-PARITA-08 — una rilettura non rifà ciò che la persona guarda: la scheda è lo STESSO nodo, lo zoom e la posizione restano; col movimento ridotto la scheda non anima il suo spostamento', async ({ page }) => {
  /* era la parte «identità» di RIPRESA-GRAFO-MOVIMENTO della vista classica (dopo «Aggiorna» il nodo era lo stesso e lo zoom pure).
     Il diagramma nuovo non ha «Aggiorna»: rilegge da solo a ogni battito e a ogni evento in diretta. */
  const figli = [figlia('a', 10, { taskCorto: 'Agente A' }), finita('b', 11, 70, { taskCorto: 'Agente B' })];
  const { grafo } = await apri(page, () => figli);
  const a = grafo.locator('[data-sessione="a"]');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa')).toBeVisible(); // l'apertura è finita: la vista iniziale non si rifà più
  await page.waitForTimeout(600);
  const zoomAllApertura = (await misura(grafo)).zoom;
  await grafo.getByRole('button', { name: 'Aumenta lo zoom del 10%' }).click();
  await expect.poll(async () => (await misura(grafo)).zoom, { message: 'lo zoom è cambiato davvero' }).not.toBe(zoomAllApertura);
  await page.waitForTimeout(400); // la tela ha finito di muoversi
  const prima = await misura(grafo);
  expect(prima.mondo, 'la premessa: la tela ha una posizione').not.toBe('');
  await a.evaluate((n) => { window.__schedaPrima = n; });
  // un evento in diretta (stessa struttura, fatti nuovi) e poi un battito intero
  figli[0] = figlia('a', 10, { taskCorto: 'Agente A', attivita: { file: [], chiamate: 7, passi: [] } });
  await eventoAgente(page, figli[0]);
  await page.waitForTimeout(5600);
  expect(await a.evaluate((n) => n === window.__schedaPrima), 'la scheda di «a» è lo stesso nodo di prima').toBe(true);
  const dopo = await misura(grafo);
  expect(dopo.zoom).toBe(prima.zoom);
  expect(dopo.mondo).toBe(prima.mondo);
  // movimento ridotto: nessuna transizione sulle schede (compaiono dove stanno)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await a.evaluate((n) => getComputedStyle(n).transitionDuration.split(',').every((d) => parseFloat(d) === 0))).toBe(true);
});

test('DELEGHE-PARITA-09 — a 1024×800 il diagramma sta nella finestra: non sfonda di lato, e la tela resta grande abbastanza da leggerci', async ({ page }) => {
  /* erano le misure di RIPRESA-GRAFO-FOTO 1024 (le foto si fanno a 1920×1080: le viste strette si provano sul DOM, owner 29/09) */
  const { grafo } = await apri(page, [figlia('a', 10), finita('b', 11, 70)], { finestra: { width: 1024, height: 800 } });
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  const m = await grafo.evaluate((n) => { const c = n.querySelector('.gv-tela').getBoundingClientRect(); const r = n.getBoundingClientRect();
    return { sfonda: n.scrollWidth > n.clientWidth + 1, dentro: r.left >= 0 && r.right <= innerWidth + 1, larghezza: Math.round(c.width), altezza: Math.round(c.height), pagina: document.documentElement.scrollWidth > innerWidth + 1 }; });
  expect(m, JSON.stringify(m)).toMatchObject({ sfonda: false, dentro: true, pagina: false });
  expect(m.larghezza).toBeGreaterThan(250);
  expect(m.altezza).toBeGreaterThan(150);
});

test('DELEGHE-PARITA-10 — tutta la scheda sceglie l’agente (il nome, la pastiglia, il modello, il margine); chiudere il lotto è un comando a parte e non sceglie nessuno', async ({ page }) => {
  /* era RIPRESA-GRAFO-CARD-INTERA della vista classica («badge, misure e spazio aprono, collassa resta separato») */
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: 'Agente A' }), figlia('b', 11, { taskCorto: 'Agente B' })]);
  const nomeNelDettaglio = grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testa');
  const scheda = (id) => grafo.locator(`[data-sessione="${id}"]`);
  const altra = { a: 'b', b: 'a' };
  let scelta = (await scheda('a').getAttribute('aria-pressed')) === 'true' ? 'a' : 'b';
  for (const parte of ['.gv-passo-nome', '.gv-passo-pill', '.gv-passo-modello']) {
    const id = altra[scelta];
    await scheda(id).locator(parte).first().click();
    await expect(scheda(id), `clic su ${parte}`).toHaveAttribute('aria-pressed', 'true');
    await expect(nomeNelDettaglio).toContainText(id === 'a' ? 'Agente A' : 'Agente B');
    scelta = id;
  }
  await scheda(altra[scelta]).click({ position: { x: 4, y: 4 } }); // il margine della scheda
  await expect(scheda(altra[scelta])).toHaveAttribute('aria-pressed', 'true');
  scelta = altra[scelta];
  // il lotto si chiude dal suo pulsante: le schede escono dalla tela, e nessun altro agente viene scelto al posto suo
  await grafo.locator('.gv-testa-chiudi').first().click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(0);
  // chiudere un lotto non è una scelta: il dettaglio resta sull'agente scelto prima, non passa a un altro
  await expect(nomeNelDettaglio).toContainText(scelta === 'a' ? 'Agente A' : 'Agente B');
  await expect(nomeNelDettaglio).not.toContainText(scelta === 'a' ? 'Agente B' : 'Agente A');
});

test('DELEGHE-PARITA-11 — la scheda in cima dice SUBITO l’attrezzo che la conversazione sta usando, e quando ha finito — senza aspettare una rilettura dal server', async ({ page }) => {
  /* era la parte «operazioni in diretta» di RIPRESA-GRAFO-MADRE della vista classica (`data-operativo` entro 1,5 s). Misurato il
     14/10/2026 sul diagramma nuovo: con la rilettura dei figli appesa la scheda restava su «Tra due operazioni» per tutto
     l'attrezzo; col server vivo arrivava al battito (fino a 5 s dopo), e un attrezzo più corto non si vedeva mai. */
  const { grafo } = await apri(page, [finita('a', 10, 70)]);
  const cima = grafo.locator('.gv-sessione');
  const manda = (eventi) => page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; const g = r.realSessionState.generation; for (const e of lista) r.handleRealEvent(e, g); }, eventi);
  await manda([{ type: 'RunStarted', _sequenza: 72000, input: { consegna: 'Sistema i listini' } }]);
  await expect(cima).toContainText('Tra due operazioni', { timeout: 4000 });
  // da qui nessuna rilettura dal server può arrivare: resta solo ciò che la conversazione dice in diretta
  await page.route(`**/api/v1/sessions/${RADICE}/children`, () => { /* appesa */ });
  await page.waitForTimeout(1200);
  await manda([{ type: 'ToolCallStart', toolCallId: 'cima-1', toolCallName: 'leggi', _sequenza: 72001, avviatoA: Date.now() }]);
  await expect(cima).not.toContainText('Tra due operazioni', { timeout: 1500 });
  await expect(cima).toContainText(/Lettura|Legge/u);
  await manda([{ type: 'ToolCallResult', toolCallId: 'cima-1', content: 'letto', _sequenza: 72002 }]);
  await expect(cima).toContainText('Tra due operazioni', { timeout: 1500 });
});
