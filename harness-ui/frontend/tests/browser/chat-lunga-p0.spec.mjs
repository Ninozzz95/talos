import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * ⛔⛔⛔ P0 corsia C, punto 8 (16/09/2026) — IL RAGIONAMENTO COMPRESSO SI PARSAVA LO STESSO, E LE CHAT
 * LUNGHE PAGAVANO TUTTO L'ALBERO A OGNI FOTOGRAMMA.
 *
 * ⭐ Quello che NON è un difetto, misurato prima di cercarne uno (regola: «chiedersi se il difetto
 *   esisteva»): il testo dell'assistente NON si ri-parsa per token. `programmaRenderMessaggioStreaming`
 *   coalesce su UN rAF per tutti i messaggi, `renderizzaMarkdownIncrementale` ritocca solo la coda
 *   instabile, e nella chat non c'è un solo `innerHTML`. Il difetto vero era altrove.
 *
 * ⛔ Il difetto vero: `ReasoningMessageContent` chiamava `renderizzaMarkdownIncrementale` a OGNI
 *   delta anche a scheda CHIUSA — e una traccia di ragionamento senza righe vuote non ha blocchi
 *   stabili, quindi «incrementale» lì vuol dire «tutto da capo ogni volta»: O(T²) su testo che
 *   nessuno sta guardando.
 *
 * ⭐ Ricerca 16/09/2026 (fonti aperte prima di scrivere):
 *   · mawentory/hermes-fastui#46 «Window Reasoning / thinking blocks (collapsed); do not keep every
 *     token in live markdown» — «the collapsed header stays cheap (one line, Thinking…)», il buffer
 *     del ragionamento non deve entrare nel nodo markdown vivo né creare «a token-per-node DOM»,
 *     e «collapsed-by-default remains true during a long stream; expanding is opt-in per block».
 *   · vellum-ai/vellum-assistant#42658 «render the Thinking drawer's reasoning one markdown block at
 *     a time» — l'apertura si paga a pezzi, non in un frame solo.
 *   · web.dev «content-visibility» (letto 16/09/2026): `auto` salta layout/paint del fuori schermo,
 *     ma vuole `contain-intrinsic-size`, e con `auto <length>` il browser RICORDA l'ultima altezza
 *     resa. ⛔ Senza quello, dentro uno scorrevole, `scrollHeight` balla (infrequently.org e bram.us,
 *     dic. 2020, «content-visibility vs jumpy scrollbars») — e qui `scrollTop = scrollHeight` è
 *     proprio il gesto del ripristino: una cura che fa ballare lo scorrevole sarebbe peggio del male.
 *
 * ⛔ La sessione da 34.026 righe dell'owner NON è nel repository (i cancelli LAG l'hanno usata su un
 *   banco, con una copia dello store). Qui la cronologia è SINTETICA e dichiarata: stessa forma
 *   (turni con markdown, blocchi di codice, righe attrezzo, schede di ragionamento), taglia scelta
 *   per far vedere il costo. I numeri valgono come confronto PRIMA/DOPO sullo stesso scenario, non
 *   come misura della sessione dell'owner.
 * ⛔ Mai il 4174: server proprio, store vuoto.
 * ⛔ Si lancia come `scroll-p0.spec.mjs` (stessa testata): `node scripts/build.mjs`, poi
 *   `TALOS_HARNESS_UI_PUBLIC_DIR="$PWD/dist"` e `TALOS_HARNESS_UI_TEST_PORT=4186`, altrimenti il
 *   server serve il pacchetto COMMITTATO e si misura il bundle di ieri.
 *   Le misure si scrivono in `frontend/artifacts/p0-C/misure-<etichetta>.json`; l'etichetta è
 *   `TALOS_P0C_MISURA` (`prima` di serie).
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const CARTELLA_MISURE = resolve(QUI, '..', '..', 'artifacts', 'p0-C');
/*
 * ⛔⛔⛔ 16/09 — L'ETICHETTA DI SERIE NON È PIÙ `prima`, E LA RAGIONE È UN DANNO FATTO DUE VOLTE.
 *   Con `prima` come valore di serie, OGNI giro della suite lanciato senza pensarci puntava al file
 *   della misura PRIMA della cura e lo riscriveva con numeri presi DOPO. È successo, l'ho corretto
 *   con una guardia, e poi è successo di nuovo — perché per far passare una passata avevo messo
 *   `TALOS_P0C_SOVRASCRIVI=1` e la guardia si è fatta da parte.
 * ⇒ La cura non è ricordarsi la variabile: è togliere la trappola. Il valore di serie è un nome
 *   neutro, così un giro distratto non può più colpire una misura che conta. Chi vuole scrivere
 *   `prima` o `dopo` lo dice per nome — cioè lo sta facendo apposta.
 *   (Stessa lezione del 28/08 sul banco: «corri riscrive il file se le ripetizioni non combaciano».)
 */
const ETICHETTA = process.env.TALOS_P0C_MISURA || 'giro-di-controllo';

test.use({ channel: 'chrome' });

/** Tre giri, mediana: un giro solo su una macchina viva non è una misura. */
const GIRI = Number(process.env.TALOS_P0C_GIRI || 3);
const mediana = (valori) => {
  const ordinati = [...valori].sort((a, b) => a - b);
  const meta = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 ? ordinati[meta] : Math.round((ordinati[meta - 1] + ordinati[meta]) / 2);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    /*
     * ⛔⛔⛔ 16/09 (giro di riparazione) — QUANDO IL MONTAGGIO È DAVVERO FINITO.
     *   L'attesa di prima guardava solo se il corpo CONTENEVA l'ultima riga. Ma a scheda chiusa il
     *   testo grezzo è già tutto depositato dentro il `<pre>` (è la cura di CHAT-LUNGA-P0-03),
     *   quindi quella condizione era vera al PRIMO giro del ciclo e l'attesa finiva prima ancora
     *   che il montaggio cominciasse: il fotogramma peggiore dell'apertura non veniva osservato.
     *   ⇒ Il montaggio è finito quando il corpo ha nodi ELEMENTO (markdown, non testo grezzo) E
     *   fra quelli c'è l'ultima riga. Vale anche sul pacchetto di PRIMA della cura, dove il corpo
     *   nasce già montato: lì la condizione è vera subito, ed è corretto che lo sia.
     */
    window.__p0cMontato = (corpo) => corpo.querySelectorAll('*').length > 0 && corpo.textContent.includes('Rileggo il file numero 479');
    /* La sonda dei fotogrammi lunghi va installata PRIMA del primo script della pagina. */
    window.__p0cLoaf = { voci: [], longtask: [] };
    for (const [tipo, deposito] of [['long-animation-frame', 'voci'], ['longtask', 'longtask']]) {
      try {
        const osservatore = new PerformanceObserver((lista) => {
          for (const voce of lista.getEntries()) {
            window.__p0cLoaf[deposito].push({ durata: voce.duration, bloccante: voce.blockingDuration || 0, inizio: voce.startTime });
          }
        });
        osservatore.observe({ type: tipo, buffered: false });
      } catch { /* un browser senza LoAF non fa fallire la prova: il campo resta vuoto e si dichiara */ }
    }
  });
  await page.route('**/api/v1/sessions/chat-lunga-*/events', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
});

async function apri(page, id) {
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(`chat-lunga-${id}`, 'workspace', 'Cronologia lunga', 'local:prova', { conclusa: false, modello: 'local:prova' });
  }, id);
}

/*
 * Il ragionamento sintetico: ~240 righe da ~85 caratteri, separate da UN solo a capo — la forma in
 * cui i modelli scrivono davvero una traccia di pensiero (un elenco di passi).
 * ⛔ È anche il caso peggiore per `renderizzaMarkdownIncrementale`, e non per capriccio:
 *   `confineBlocchiStabili` chiude un blocco solo su una riga VUOTA fuori da un recinto, quindi
 *   senza righe vuote non esiste nessun blocco stabile e ogni delta ri-parsa TUTTO il testo
 *   ricostruendo tutti i suoi nodi. Con le righe vuote il renderer incrementale funziona già bene:
 *   misurato, e scritto nel rapporto — è la ragione per cui questa fixture non le usa.
 */
const RIGA_PENSIERO = (i) => `${i + 1}. Rileggo il file numero ${i} e confronto la firma con quella attesa, poi decido come procedere.`;
const RAGIONAMENTO_20K = Array.from({ length: 240 }, (_, i) => RIGA_PENSIERO(i)).join('\n');

/** I delta di una scheda di ragionamento che nasce adesso: uno per riga, come arriva dal modello. */
function deltaRagionamentoVivo(quanti, sequenzaBase, messageId = 'vivo') {
  const lista = [{ type: 'ReasoningMessageStart', messageId, _sequenza: sequenzaBase }];
  for (let i = 0; i < quanti; i += 1) lista.push({ type: 'ReasoningMessageContent', messageId, delta: `${RIGA_PENSIERO(i)}\n`, _sequenza: sequenzaBase + 1 + i });
  return lista;
}

async function misura(page, corpo) {
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => { window.__p0cLoaf.voci = []; window.__p0cLoaf.longtask = []; });
  const metricheA = await cdp.send('Performance.getMetrics');
  const t0 = Date.now();
  const dentroPaginaMs = await corpo();
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const durataMs = Date.now() - t0;
  /*
   * ⛔⛔ 16/09, GIRO DI RIPARAZIONE — I FOTOGRAMMI LUNGHI ARRIVANO DOPO IL LAVORO.
   *   `long-animation-frame` riporta il fotogramma quando è finito, disegno compreso, e il disegno
   *   viene dopo il `requestAnimationFrame` su cui questa misura si fermava: il fotogramma da
   *   183 ms dell'apertura cadeva FUORI dalla lettura e la colonna diceva 0. Si aspetta la quiete
   *   prima di leggere — e il cronometro è già fermo qui sopra, così l'attesa non entra nel tempo.
   */
  await page.waitForTimeout(600);
  const metricheB = await cdp.send('Performance.getMetrics');
  const leggi = (payload, nome) => payload.metrics.find((m) => m.name === nome)?.value ?? 0;
  const dom = await page.evaluate(() => ({
    nodi: document.querySelectorAll('*').length,
    loaf: window.__p0cLoaf.voci.map((v) => Math.round(v.durata)),
    bloccante: Math.round(window.__p0cLoaf.voci.reduce((s, v) => s + v.bloccante, 0)),
    longtaskMs: Math.round(window.__p0cLoaf.longtask.reduce((s, v) => s + v.durata, 0)),
  }));
  await cdp.detach();
  return {
    durataMs,
    dentroPaginaMs: Number.isFinite(dentroPaginaMs) ? dentroPaginaMs : -1,
    nodi: dom.nodi,
    loafOltre50: dom.loaf.filter((d) => d > 50).length,
    loafPeggiore: dom.loaf.length ? Math.max(...dom.loaf) : 0,
    mainThreadBloccatoMs: dom.bloccante,
    longtaskMs: dom.longtaskMs,
    jsHeapUsedMB: Math.round((leggi(metricheB, 'JSHeapUsedSize') - leggi(metricheA, 'JSHeapUsedSize')) / 1048576 * 10) / 10,
  };
}

/** Una cronologia sintetica: `turni` turni con testo markdown, un blocco di codice, due righe attrezzo e un ragionamento. */
function eventiCronologia(turni) {
  const lista = [];
  let seq = 1;
  for (let t = 0; t < turni; t += 1) {
    lista.push({ type: 'RunStarted', input: { consegna: `Compito numero ${t}`, seguito: t > 0 }, _sequenza: seq += 1 });
    lista.push({ type: 'ReasoningMessageStart', messageId: `r${t}`, _sequenza: seq += 1 });
    lista.push({ type: 'ReasoningMessageContent', messageId: `r${t}`, delta: RAGIONAMENTO_20K, _sequenza: seq += 1 });
    lista.push({ type: 'ReasoningMessageEnd', messageId: `r${t}`, _sequenza: seq += 1 });
    lista.push({ type: 'ToolCallStart', toolCallId: `t${t}a`, toolCallName: 'leggi', _sequenza: seq += 1 });
    lista.push({ type: 'ToolCallArgs', toolCallId: `t${t}a`, delta: `{"percorso":"src/file-${t}.js"}`, _sequenza: seq += 1 });
    lista.push({ type: 'ToolCallResult', toolCallId: `t${t}a`, ok: true, _sequenza: seq += 1 });
    const testo = `## Turno ${t}\n\n${Array.from({ length: 12 }, (_, i) => `Riga ${i}: il risultato del passo, spiegato con qualche parola in piu' del necessario.`).join('\n\n')}\n\n\`\`\`js\nconst x${t} = ${t};\nconsole.log(x${t});\n\`\`\`\n\nChiusura del turno ${t}.\n`;
    lista.push({ type: 'TextMessageContent', messageId: `m${t}`, delta: testo, _sequenza: seq += 1 });
    lista.push({ type: 'TextMessageEnd', messageId: `m${t}`, _sequenza: seq += 1 });
  }
  lista.push({ type: 'RunFinished', outcome: { type: 'success' }, _sequenza: seq += 1 });
  return lista;
}

const scarica = (page, lista) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, lista);

/*
 * ⛔ Il tempo che conta è quello del MAIN THREAD della pagina, non il giro di Playwright: 240
 *   `page.evaluate` separati misurano l'IPC (≈2,3 ms l'uno, misurato) e nascondono il lavoro vero.
 *   Qui il ciclo sta DENTRO la pagina e il cronometro è `performance.now()` attorno al ciclo.
 */
const scaricaCronometrata = (page, lista) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  const t0 = performance.now();
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
  return Math.round(performance.now() - t0);
}, lista);

test('MISURA-P0-C — apertura di una cronologia lunga e ragionamento collassato dal vivo', async ({ page }, testInfo) => {
  /*
   * ⛔⛔ 16/09 — LA MISURA GIÀ PRESA NON SI RIBATTE PER DISTRAZIONE, e la regola nasce da un danno
   *   vero: l'etichetta di serie è `prima`, e ogni giro della suite fatto senza `TALOS_P0C_MISURA`
   *   ha riscritto la misura PRIMA della cura con numeri presi DOPO. Me ne sono accorto solo perché
   *   due file dicevano la stessa cosa. È la forma del 28/08 sul banco («corri riscrive il file se
   *   le ripetizioni non combaciano»): una misura pagata una volta sola va protetta.
   * ⛔ Si SALTA, non si fallisce: un rifiuto qui renderebbe rossa tutta la suite a chi la lancia per
   *   controllare i cancelli, e un rosso che non parla di un difetto insegna a ignorare i rossi.
   */
  const destinazione = resolve(CARTELLA_MISURE, `misure-${ETICHETTA}.json`);
  test.skip(existsSync(destinazione) && process.env.TALOS_P0C_SOVRASCRIVI !== '1',
    `misure-${ETICHETTA}.json esiste già: usa TALOS_P0C_MISURA=<altra etichetta>, o TALOS_P0C_SOVRASCRIVI=1 per rifarla davvero`);
  test.setTimeout(180_000);
  const giriReplay = [];
  const giriVivo = [];
  const giriScala = [];
  const giriApertura = [];

  for (let giro = 0; giro < GIRI; giro += 1) {
    await page.goto('/');
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await apri(page, `misura-${giro}`);

    /* A — la CRONOLOGIA: rigiocata differita, come quando si apre una sessione dalla barra. */
    const eventi = eventiCronologia(60);
    await page.evaluate(() => { window.__talosHarnessUiRuntime.realSessionState.deferHistoricalRendering = true; });
    giriReplay.push(await misura(page, async () => {
      const dentro = await scaricaCronometrata(page, eventi);
      await page.waitForFunction(() => document.querySelectorAll('#conversation .is-streaming').length === 0, null, { timeout: 60000 });
      return dentro;
    }));

    /* B — DAL VIVO: una scheda di ragionamento che riceve i delta mentre resta CHIUSA. */
    await page.evaluate(() => { window.__talosHarnessUiRuntime.realSessionState.deferHistoricalRendering = false; });
    giriVivo.push(await misura(page, () => scaricaCronometrata(page, deltaRagionamentoVivo(240, 90000))));

    /*
     * B-bis — LA SCALA. Un numero solo non dice se il costo è lineare o quadratico, e la differenza
     * fra i due è tutto: una traccia di pensiero vera arriva anche a cinque volte questa.
     * ⛔ Va misurata su una scheda NUOVA, non su quella di sopra: continuare la stessa partirebbe
     *   da un testo già lungo e falserebbe il rapporto.
     */
    const doppio = await misura(page, () => scaricaCronometrata(page, deltaRagionamentoVivo(480, 95000, 'vivo-doppio')));
    giriScala.push({ delta240Ms: giriVivo[giriVivo.length - 1].dentroPaginaMs, delta480Ms: doppio.dentroPaginaMs, rapporto: Math.round((doppio.dentroPaginaMs / Math.max(1, giriVivo[giriVivo.length - 1].dentroPaginaMs)) * 100) / 100 });

    /*
     * C — L'APERTURA della scheda. ⛔ Il clic si dà DENTRO la pagina e il cronometro sta lì:
     *   `locator.click()` di Playwright su un albero da 25.000 nodi costa ~1,9 s di sue verifiche
     *   (misurato), e sommarle sarebbe attribuire al prodotto il tempo dello strumento.
     */
    giriApertura.push(await misura(page, () => page.evaluate(async () => {
      const nota = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop();
      const testa = nota.querySelector(':scope > .talos-activity__head');
      const corpo = nota.querySelector('.tool-note-detail');
      const t0 = performance.now();
      testa.click();
      for (let i = 0; i < 600; i += 1) {
        if (window.__p0cMontato(corpo)) break;
        await new Promise((ok) => requestAnimationFrame(ok));
      }
      return Math.round(performance.now() - t0);
    })));
  }

  const riassumi = (giri) => Object.fromEntries(Object.keys(giri[0]).map((chiave) => [chiave, mediana(giri.map((g) => g[chiave]))]));
  const misure = {
    quando: new Date().toISOString(),
    etichetta: ETICHETTA,
    scenario: {
        cronologia: '60 turni · 60 ragionamenti da ~20.000 caratteri · 60 righe attrezzo · 60 blocchi di codice',
      vivo: '240 delta di ragionamento a scheda CHIUSA',
      scala: '240 delta contro 480 delta, due schede distinte: dice se il costo è lineare o quadratico',
      apertura: 'un clic (dentro la pagina) sulla testa di un ragionamento da ~480 righe',
      giri: GIRI,
    },
    replay: riassumi(giriReplay),
    ragionamentoVivoCollassato: riassumi(giriVivo),
    scalaRagionamento: riassumi(giriScala),
    aperturaRagionamento: riassumi(giriApertura),
    grezzi: { replay: giriReplay, vivo: giriVivo, scala: giriScala, apertura: giriApertura },
  };
  mkdirSync(CARTELLA_MISURE, { recursive: true });
  writeFileSync(destinazione, `${JSON.stringify(misure, null, 2)}\n`, 'utf8');
  await testInfo.attach(`misure-${ETICHETTA}.json`, { body: JSON.stringify(misure, null, 2), contentType: 'application/json' });
  console.log(`[P0-C ${ETICHETTA}] replay ${misure.replay.dentroPaginaMs}ms · vivo240 ${misure.ragionamentoVivoCollassato.dentroPaginaMs}ms · scala480/240 ${misure.scalaRagionamento.rapporto}x · apertura ${misure.aperturaRagionamento.dentroPaginaMs}ms · nodi ${misure.replay.nodi} · LoAF peggiore ${misure.replay.loafPeggiore}/${misure.ragionamentoVivoCollassato.loafPeggiore}/${misure.aperturaRagionamento.loafPeggiore}`);
});

test('CHAT-LUNGA-P0-01 — un ragionamento CHIUSO non ha nemmeno un nodo nel corpo', async ({ page }) => {
  await apri(page, 'chiuso');
  const lista = [{ type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 }, { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 }];
  for (let i = 0; i < 240; i += 1) lista.push({ type: 'ReasoningMessageContent', messageId: 'r1', delta: `${RIGA_PENSIERO(i)}\n`, _sequenza: 3 + i });
  await scarica(page, lista);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

  const stato = await page.evaluate(() => {
    const nota = document.querySelector('#conversation .real-reasoning-note');
    const corpo = nota?.querySelector('.tool-note-detail');
    return {
      schedaChiusa: nota?.querySelector(':scope > .talos-activity__head')?.getAttribute('aria-expanded'),
      elementiNelCorpo: corpo ? corpo.querySelectorAll('*').length : -1,
    };
  });
  expect(stato.schedaChiusa, 'di serie la scheda è compressa').toBe('false');
  expect(stato.elementiNelCorpo, 'a scheda chiusa il corpo non deve avere nodi elemento: non c’è niente da guardare').toBe(0);
});

test('CHAT-LUNGA-P0-02 — aprire un ragionamento da ~41.000 caratteri non produce un fotogramma oltre 50 ms', async ({ page }) => {
  /*
   * ⛔ 480 righe, non 240: con 240 il fotogramma peggiore misurato PRIMA della cura stava già sotto
   *   i 50 ms, quindi una prova su quella taglia sarebbe stata verde in entrambi i mondi — cioè non
   *   avrebbe guardato niente. Con 480 il numero misurato prima era 118 ms. La taglia di una prova
   *   si sceglie MISURANDO dove il difetto si vede, non a occhio.
   * ⛔⛔⛔ 16/09, GIRO DI RIPARAZIONE — E LA TAGLIA NON È SOLO QUELLA DELLA TRACCIA: È LA PAGINA.
   *   Con la sola scheda in una chat vuota questo cancello è VERDE anche sul pacchetto di prima
   *   della cura (misurato tre volte su tre, 16/09): scoprire un corpo grosso costa poco se il
   *   documento è piccolo, e i 118-127 ms si erano visti dentro lo scenario della MISURA, cioè
   *   dopo una cronologia lunga. Un cancello provato in uno scenario in cui il difetto non si
   *   manifesta non guarda niente, quindi qui la cronologia c'è: 60 turni, come nella misura.
   * ⛔⛔⛔⛔ 16/09, SECONDO GIRO DI RIPARAZIONE — OGNI NUMERO QUI SOPRA È UN NUMERO DI MACCHINA, NON
   *   UNA PROPRIETÀ DEL DIFETTO. Tutti (118, 127, e i 183/181/158 ms che nel primo rapporto avevo
   *   riportato come «CHAT-LUNGA-P0-02 rosso al base, 3 giri su 3») vengono da DESKTOP-BJ9I7OU,
   *   Chrome di canale `chrome`, il 16/09/2026. Sulla macchina del controllore, stessa sequenza e
   *   stesso giorno, il fotogramma peggiore al commit base è stato 245 e 196 ms: la DIREZIONE
   *   coincide (sopra il tetto prima della cura, sotto dopo), la CIFRA no — e una cifra scritta
   *   senza dire dov'è stata presa si legge come una costante del prodotto.
   * ⇒ Per questo il cancello asserisce una SOGLIA (50 ms, la stessa della specifica
   *   `long-animation-frame`) e mai un valore atteso: i numeri restano qui solo come traccia di
   *   come la taglia è stata scelta, ognuno con la sua macchina e la sua data accanto.
   */
  await apri(page, 'apertura');
  /* La cronologia lunga PRIMA: è la pagina in cui l'apertura costa davvero (e in cui la persona apre una scheda). */
  await page.evaluate(() => { window.__talosHarnessUiRuntime.realSessionState.deferHistoricalRendering = true; });
  await scarica(page, eventiCronologia(60));
  await page.waitForFunction(() => document.querySelectorAll('#conversation .is-streaming').length === 0, null, { timeout: 60000 });
  await page.evaluate(() => { window.__talosHarnessUiRuntime.realSessionState.deferHistoricalRendering = false; });
  /* ⛔ Le sequenze partono SOPRA quelle della cronologia (60 turni × 9 eventi ≈ 540): un evento con
     una sequenza già passata viene scartato, e la scheda resterebbe a metà senza dire perché. */
  await scarica(page, [
    { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 2000 },
    ...deltaRagionamentoVivo(480, 2001),
    { type: 'ReasoningMessageEnd', messageId: 'vivo', _sequenza: 2900 },
  ]);
  /* Il clic dentro la pagina: `locator.click()` porta con sé le proprie verifiche, e qui si misura un fotogramma. */
  const alClic = await page.evaluate(async () => {
    const nota = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop();
    const corpo = nota.querySelector('.tool-note-detail');
    const prima = { elementi: corpo.querySelectorAll('*').length, testoGiàDentro: corpo.textContent.includes('Rileggo il file numero 479'), fotogrammiAttesi: 0 };
    /*
     * ⛔⛔ 16/09, GIRO DI RIPARAZIONE — LA SONDA SI AZZERA QUI, NON PRIMA.
     *   Azzerandola dal lato di Playwright restavano dentro i fotogrammi della FIXTURE: 480 delta
     *   sparati in UN SOLO task fanno un fotogramma da ~213 ms che non c'entra niente con
     *   l'apertura (misurato: il fotogramma cadeva a 1625 ms e il clic a 1986). Il cancello
     *   accusava l'apertura di un costo del banco. Adesso l'azzeramento è l'ultima cosa prima del
     *   clic, nello stesso task: quello che si conta è solo ciò che l'apertura provoca.
     */
    window.__p0cLoaf.voci = [];
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    window.__p0cLoaf.voci = [];
    nota.querySelector(':scope > .talos-activity__head').click();
    for (let i = 0; i < 600; i += 1) {
      if (window.__p0cMontato(corpo)) break;
      prima.fotogrammiAttesi = i + 1;
      await new Promise((ok) => requestAnimationFrame(ok));
    }
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    return prima;
  });

  /*
   * ⛔⛔ 16/09, GIRO DI RIPARAZIONE — IL NUMERO SI LEGGE UNA VOLTA SOLA, E DOPO CHE LA PAGINA È FERMA.
   *   Prima si leggeva il massimo, e SUBITO DOPO la lista, con due giri separati: il fotogramma
   *   lungo dello scoprimento arriva dopo il `requestAnimationFrame` (il disegno viene dopo), e
   *   finiva nella seconda lettura e non nella prima — cioè il cancello stampava «164 ms» e
   *   passava. Un numero letto prima che il lavoro sia finito non smentisce nessuno.
   * ⛔ `long-animation-frame` riporta SOLO i fotogrammi oltre 50 ms (è la soglia della specifica):
   *   una lista vuota vuol dire «nessun fotogramma lungo», non «non ho guardato».
   */
  await page.waitForTimeout(600);
  const lunghi = await page.evaluate(() => window.__p0cLoaf.voci.map((v) => Math.round(v.durata)));
  const peggiore = Math.max(0, ...lunghi);
  console.log(`[CHAT-LUNGA-P0-02] fotogrammi oltre 50 ms: ${lunghi.join(', ') || 'nessuno'} · montaggio atteso per ${alClic.fotogrammiAttesi} fotogrammi · al clic il corpo aveva ${alClic.elementi} elementi e il testo grezzo ${alClic.testoGiàDentro ? 'già dentro' : 'assente'}`);
  expect(peggiore, `il fotogramma peggiore dell'apertura è stato di ${peggiore} ms (al clic il corpo aveva ${alClic.elementi} elementi e il testo grezzo ${alClic.testoGiàDentro ? 'già dentro' : 'assente'})`).toBeLessThanOrEqual(50);
  const corpoUltimo = page.locator('#conversation .real-reasoning-note .tool-note-detail').last();
  await expect(corpoUltimo).toContainText('Rileggo il file numero 0');
  await expect(corpoUltimo).toContainText('Rileggo il file numero 479');
});

test('CHAT-LUNGA-P0-04 — un messaggio già finito non si ridisegna mai più (la cache per id non serve)', async ({ page }) => {
  /*
   * ⛔ Prima di aggiungere una cache «testo → nodi» per i messaggi completati, la domanda è se il
   *   difetto esista: un messaggio finito viene ri-parsato? Qui si conta. Se il numero è ZERO, la
   *   cache sarebbe codice morto — e questa prova diventa la guardia che tiene vero quel zero.
   * ⛔ «Zero» è il numero più pericoloso: si conferma AL CONTRARIO, cioè guardando che lo stesso
   *   osservatore veda eccome le mutazioni del messaggio che sta ancora arrivando.
   */
  await apri(page, 'cache');
  await scarica(page, [
    { type: 'RunStarted', input: { consegna: 'Scrivi qualcosa' }, _sequenza: 1 },
    { type: 'TextMessageContent', messageId: 'finito', delta: '# Titolo\n\nUn paragrafo.\n\n- uno\n- due\n\n```js\nconst a = 1;\n```\n', _sequenza: 2 },
    { type: 'TextMessageEnd', messageId: 'finito', _sequenza: 3 },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('#conversation .is-streaming').length === 0, null, { timeout: 20000 });

  const conteggi = await page.evaluate(async () => {
    const copie = [...document.querySelectorAll('#conversation .assistant-copy')];
    const finito = copie[copie.length - 1];
    let sulFinito = 0;
    let sulNuovo = 0;
    const osservaFinito = new MutationObserver((r) => { sulFinito += r.length; });
    osservaFinito.observe(finito, { childList: true, subtree: true, characterData: true, attributes: true });
    const r = window.__talosHarnessUiRuntime;
    for (let i = 0; i < 240; i += 1) r.handleRealEvent({ type: 'TextMessageContent', messageId: 'nuovo', delta: `pezzo ${i} `, _sequenza: 100 + i }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'TextMessageEnd', messageId: 'nuovo', _sequenza: 400 }, r.realSessionState.generation);
    await new Promise((ok) => setTimeout(ok, 400));
    const nuove = [...document.querySelectorAll('#conversation .assistant-copy')];
    const nuovo = nuove[nuove.length - 1];
    const osservaNuovo = new MutationObserver((rr) => { sulNuovo += rr.length; });
    osservaNuovo.observe(nuovo, { childList: true, subtree: true, characterData: true, attributes: true });
    r.handleRealEvent({ type: 'TextMessageContent', messageId: 'nuovo', delta: 'ancora testo. ', _sequenza: 500 }, r.realSessionState.generation);
    await new Promise((ok) => setTimeout(ok, 400));
    osservaFinito.disconnect();
    osservaNuovo.disconnect();
    return { sulFinito, sulNuovo, testoFinito: finito.textContent.trim().slice(0, 20) };
  });
  expect(conteggi.testoFinito.startsWith('Titolo'), `il messaggio finito e ancora quello: ${conteggi.testoFinito}`).toBe(true);
  expect(conteggi.sulFinito, 'un messaggio finito non viene toccato da 240 eventi successivi').toBe(0);
  expect(conteggi.sulNuovo, 'AL CONTRARIO: lo stesso osservatore vede eccome il messaggio ancora in corso').toBeGreaterThan(0);
});

test('CHAT-LUNGA-P0-03 — il testo del ragionamento resta leggibile e cercabile anche senza averlo aperto', async ({ page }) => {
  /*
   * ⛔ Il verso contrario della cura: non montare il corpo NON deve voler dire perdere il testo.
   *   A giro finito il pensiero sta nel DOM come testo semplice (nessun markdown, nessun Prism):
   *   la ricerca nella pagina, l'esportazione e i cancelli LAG continuano a trovarlo.
   */
  await apri(page, 'testo');
  await scarica(page, [
    { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 },
    { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
    { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Prima leggo i test.\n\nPoi guardo il sorgente.', _sequenza: 3 },
    { type: 'ReasoningMessageEnd', messageId: 'r1', _sequenza: 4 },
  ]);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const corpo = page.locator('#conversation .real-reasoning-note .tool-note-detail');
  expect(await corpo.evaluate((e) => e.textContent)).toBe('Prima leggo i test.\n\nPoi guardo il sorgente.');
  expect(await corpo.evaluate((e) => e.querySelectorAll('*').length), 'testo semplice, nessun nodo di markdown finché non lo si apre').toBe(0);
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — I DUE CANCELLI QUI SOTTO ESISTONO PERCHÉ IL CONTROLLORE
 * HA PROVATO A ROMPERE LA CURA E NON CI È RIUSCITO.
 *
 * La decisione «questo corpo si disegna?» la chiedono DUE punti, uno dopo l'altro: il `case`
 * `ReasoningMessageContent` decide se PRENOTARE il disegno, `disegnaPezzoRagionamento` decide se
 * ESEGUIRLO al fotogramma dopo. Sono in SERIE, quindi togliendone una sola i quattro cancelli di
 * prima restavano verdi: l'altra reggeva da sola. Un cancello che non morde su una riga che si
 * suppone portante è un cancello che non sta guardando quella riga.
 * ⇒ Qui ognuna delle due prende il SUO cancello, sul comportamento che protegge DA SOLA:
 *   · P0-05 — la seconda: richiudere mentre si monta ferma il montaggio (e riaprire lo riprende);
 *   · P0-06 — la prima: una scheda CHIUSA che riceve delta non tira la vista dove nessuno guarda.
 * ⛔ L'autorità vera resta UNA, `ragionamentoAperto`: romperne il corpo (una riga sola) fa tornare
 *   rossi P0-01 e P0-03 — misurato il 16/09, ed è la prova al contrario che vale per entrambe.
 */

test('CHAT-LUNGA-P0-05 — richiudere la scheda mentre si monta FERMA il montaggio, e riaprirla lo riprende', async ({ page }) => {
  await apri(page, 'stop-montaggio');
  await scarica(page, [
    { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 },
    ...deltaRagionamentoVivo(480, 2),
    { type: 'ReasoningMessageEnd', messageId: 'vivo', _sequenza: 900 },
  ]);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

  const esito = await page.evaluate(async () => {
    const nota = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop();
    const testa = nota.querySelector(':scope > .talos-activity__head');
    const corpo = nota.querySelector('.tool-note-detail');
    const attendi = (n) => new Promise((ok) => { let i = 0; const giro = () => (i++ >= n ? ok() : requestAnimationFrame(giro)); giro(); });

    testa.click();                      // apre: il montaggio comincia, un pezzo per fotogramma
    await attendi(2);
    const aMeta = { elementi: corpo.querySelectorAll('*').length, finito: window.__p0cMontato(corpo) };

    testa.click();                      // e la persona la richiude subito
    await attendi(1);
    const subitoDopoLaChiusura = corpo.querySelectorAll('*').length;
    await attendi(30);                  // trenta fotogrammi: se il montaggio continuasse, si vedrebbe
    const dopo = { aperta: testa.getAttribute('aria-expanded'), elementi: corpo.querySelectorAll('*').length, finito: window.__p0cMontato(corpo) };

    testa.click();                      // riaperta: riprende da dove era rimasto
    for (let i = 0; i < 600; i += 1) { if (window.__p0cMontato(corpo)) break; await attendi(1); }
    return { aMeta, subitoDopoLaChiusura, dopo, ripresa: window.__p0cMontato(corpo), elementiFinali: corpo.querySelectorAll('*').length };
  });

  /* ⛔ La precondizione è metà della prova: se il primo fotogramma montasse già tutto, il resto non
     guarderebbe niente. Sul pacchetto di PRIMA della cura questa riga è rossa, perché lì il corpo
     è già montato per intero prima ancora che qualcuno lo apra. */
  expect(esito.aMeta.finito, `dopo due fotogrammi il montaggio deve essere COMINCIATO e non finito (elementi: ${esito.aMeta.elementi})`).toBe(false);
  expect(esito.aMeta.elementi, 'due fotogrammi devono aver montato qualcosa').toBeGreaterThan(0);
  expect(esito.dopo.aperta, 'il secondo clic la richiude').toBe('false');
  expect(esito.dopo.finito, `richiusa, il montaggio si è fermato (elementi ${esito.subitoDopoLaChiusura} → ${esito.dopo.elementi} in trenta fotogrammi)`).toBe(false);
  expect(esito.dopo.elementi, 'a scheda chiusa non si aggiunge un solo nodo in più').toBe(esito.subitoDopoLaChiusura);
  expect(esito.ripresa, `riaperta, il montaggio riprende e arriva in fondo (${esito.elementiFinali} elementi)`).toBe(true);
});

test('CHAT-LUNGA-P0-06 — una scheda di ragionamento CHIUSA non tira la vista dove nessuno sta guardando', async ({ page }) => {
  /*
   * ⛔ Il `case` chiede `ragionamentoAperto` per DUE cose: prenotare il disegno (ridondante, la
   *   decisione vera è nel disegnatore) e SEGUIRE la scheda con lo scrittore unico dello scroll.
   *   La seconda non è ridondante: seguire una scheda chiusa vuol dire strappare la vista dal testo
   *   che la persona sta leggendo per portarla su una riga che non mostra niente.
   * ⛔ DICHIARATO: questo cancello è VERDE anche sul pacchetto di PRIMA della cura — lì la stessa
   *   condizione esisteva già sullo scroll. Non prova la cura: tiene ferma una riga che altrimenti
   *   nessuno guarderebbe, ed è esattamente il buco che il controllore ha trovato.
   */
  await apri(page, 'tira');
  const lista = [
    { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 },
    { type: 'ReasoningMessageStart', messageId: 'r1', _sequenza: 2 },
    { type: 'ReasoningMessageContent', messageId: 'r1', delta: `${RIGA_PENSIERO(0)}\n`, _sequenza: 3 },
  ];
  for (let m = 0; m < 3; m += 1) {
    lista.push({ type: 'TextMessageContent', messageId: `t${m}`, delta: Array.from({ length: 40 }, (_, i) => `Paragrafo ${m * 40 + i}: il testo continua per qualche riga, così la colonna cresce davvero.\n\n`).join(''), _sequenza: 10 + m });
    lista.push({ type: 'TextMessageEnd', messageId: `t${m}`, _sequenza: 20 + m });
  }
  await scarica(page, lista);
  await page.waitForFunction(() => document.querySelectorAll('#conversation .is-streaming').length === 0, null, { timeout: 20000 });
  await page.waitForTimeout(400);

  const partenza = await page.evaluate(() => {
    const sc = document.querySelector('#schermoChat .talos-conversation');
    const nota = document.querySelector('#conversation .real-reasoning-note');
    const sonda = { base: sc.scrollTop, max: 0 };
    window.__p0cSonda = sonda;
    const guarda = () => { sonda.max = Math.max(sonda.max, Math.abs(sc.scrollTop - sonda.base)); if (window.__p0cSonda === sonda) requestAnimationFrame(guarda); };
    requestAnimationFrame(guarda);
    return {
      corsa: sc.scrollHeight - sc.clientHeight,
      base: sc.scrollTop,
      /* quanto sta SOPRA il bordo alto della vista: è di là che la vista verrebbe strappata */
      schedaSopraDiPx: Math.round(sc.getBoundingClientRect().top - nota.getBoundingClientRect().bottom),
      chiusa: nota.querySelector(':scope > .talos-activity__head').getAttribute('aria-expanded'),
    };
  });
  expect(partenza.corsa, 'serve corsa vera, altrimenti la prova non prova niente').toBeGreaterThan(600);
  expect(partenza.chiusa, 'la scheda è compressa, come di serie').toBe('false');
  expect(partenza.schedaSopraDiPx, `la scheda deve stare SOPRA la vista (sta a ${partenza.schedaSopraDiPx}px)`).toBeGreaterThan(200);

  const delta = [];
  for (let i = 1; i < 21; i += 1) delta.push({ type: 'ReasoningMessageContent', messageId: 'r1', delta: `${RIGA_PENSIERO(i)}\n`, _sequenza: 100 + i });
  await scarica(page, delta);
  await page.waitForTimeout(800);
  const sonda = await page.evaluate(() => ({ ...window.__p0cSonda }));
  expect(sonda.max, `venti delta a scheda chiusa hanno spostato la vista di ${sonda.max}px`).toBe(0);
});

/*
 * ⛔⛔⛔⛔ 16/09/2026, SECONDO GIRO DI RIPARAZIONE — IL CANCELLO CHE IL CONTROLLORE HA COMPRATO CON
 * UNA REGRESSIONE VERA, RIPRODOTTA DA LUI E NON DA ME.
 *
 * Il percorso: la persona APRE il ragionamento mentre il modello scrive, lo RICHIUDE prima che il
 * montaggio a pezzi sia arrivato in fondo, poi arriva `ReasoningMessageEnd`. Il montaggio si ferma
 * (è giusto: è CHAT-LUNGA-P0-05), ma il deposito del testo grezzo si rifiutava perché la scheda
 * «aveva già disegnato qualcosa» ⇒ il corpo restava con la PRIMA FETTA e il resto del pensiero
 * spariva dal DOM. Misurato dal controllore su questa identica sequenza: corpo 7.595 caratteri su
 * 47.302 grezzi, 84 nodi, ultima riga ASSENTE (al commit base: 44.530 caratteri, 481 nodi, ultima
 * riga presente). ⇒ Rompeva l'invariante di CHAT-LUNGA-P0-03 — ricerca nella pagina, export dal DOM
 * e i cancelli LAG che leggono `textContent` non trovavano più il pensiero.
 *
 * ⭐ Ricerca 16/09/2026, prima di scrivere la cura (regola zero — pattern «render on expand» che non
 *   perde il contenuto):
 *   · Chrome for Developers, «Making collapsed content accessible with hidden=until-found»
 *     (developer.chrome.com/docs/css-ui/hidden-until-found, letto 16/09/2026): contenuto dentro una
 *     sezione collassata con `display:none` «becomes impossible to search using a find-in-page
 *     search»; `hidden=until-found` applica `content-visibility:hidden` invece di `display:none`
 *     proprio perché «skipped contents must be accessible to the find-in-page algorithm». ⇒ La
 *     regola che ne discende, e che questo cancello tiene ferma: saltare il DISEGNO di ciò che è
 *     chiuso è legittimo, saltare il CONTENUTO no — il testo deve restare nel documento.
 *   · TypeFox/baukasten#60 «Tree mounts collapsed children | DOM is O(all nodes), not O(visible)» e
 *     mherod/swiz#857 «lazily mount collapsed transcript message bodies» (letti 16/09/2026): il
 *     montaggio pigro si fa con la SORGENTE DI VERITÀ NEL DATO (qui `testoRagionamentoPerScheda`),
 *     mai nel DOM parziale — «mount on expand, unmount on transition end» funziona solo se il
 *     contenuto sopravvive fuori dal DOM. Qui la fetta montata non è mai la verità: la verità è il
 *     grezzo, e un montaggio interrotto si BUTTA, non si conserva.
 *
 * ⛔ I tre stati si provano tutti e tre nello stesso cancello, perché la cura tocca la condizione
 *   che li separa: «mai aperta», «aperta e lasciata aperta», «aperta e richiusa a metà».
 */
test('CHAT-LUNGA-P0-07 — aperta e RICHIUSA a metà montaggio, alla fine il pensiero c’è tutto lo stesso', async ({ page }) => {
  const GREZZO = Array.from({ length: 480 }, (_, i) => `${RIGA_PENSIERO(i)}\n`).join('');

  /* CASO A — la sequenza del controllore: apri → 2 fotogrammi → richiudi → 2 fotogrammi → fine. */
  await apri(page, 'richiusa-a-meta');
  await scarica(page, [
    { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 },
    ...deltaRagionamentoVivo(480, 2, 'meta'),
  ]);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

  const caso = await page.evaluate(async () => {
    const attendi = (n) => new Promise((ok) => { let i = 0; const giro = () => (i++ >= n ? ok() : requestAnimationFrame(giro)); giro(); });
    const nota = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop();
    const testa = nota.querySelector(':scope > .talos-activity__head');
    const corpo = nota.querySelector('.tool-note-detail');
    const r = window.__talosHarnessUiRuntime;

    testa.click();                 // APRE mentre il modello scrive
    await attendi(2);              // due fotogrammi: il montaggio è cominciato e non è finito
    const aMeta = { caratteri: corpo.textContent.length, nodi: corpo.querySelectorAll('*').length };
    testa.click();                 // RICHIUDE prima della fine
    await attendi(2);
    r.handleRealEvent({ type: 'ReasoningMessageEnd', messageId: 'meta', _sequenza: 900 }, r.realSessionState.generation);
    await attendi(10);
    const dopoLaFine = { caratteri: corpo.textContent.length, nodi: corpo.querySelectorAll('*').length, testo: corpo.textContent, aperta: testa.getAttribute('aria-expanded') };

    /* E riaperta dieci minuti dopo deve mostrare TUTTO, non la fetta di prima. */
    testa.click();
    for (let i = 0; i < 900; i += 1) { if (window.__p0cMontato(corpo)) break; await attendi(1); }
    const riaperta = { montata: window.__p0cMontato(corpo), nodi: corpo.querySelectorAll('*').length, ultima: corpo.textContent.includes('Rileggo il file numero 479'), prima: corpo.textContent.includes('Rileggo il file numero 0') };
    return { aMeta, dopoLaFine, riaperta };
  });

  /* La precondizione: se due fotogrammi montassero già tutto, il resto non guarderebbe niente. */
  expect(caso.aMeta.nodi, 'due fotogrammi devono aver montato qualcosa').toBeGreaterThan(0);
  expect(caso.aMeta.caratteri, `a metà montaggio il corpo deve avere MENO del grezzo (aveva ${caso.aMeta.caratteri} su ${GREZZO.length})`).toBeLessThan(GREZZO.length);
  expect(caso.dopoLaFine.aperta, 'alla fine la scheda è chiusa: è il caso che il controllore ha rotto').toBe('false');
  /* ⛔ Il cuore: il pensiero c’è TUTTO, come testo, esattamente come per una scheda mai aperta. */
  expect(caso.dopoLaFine.testo, 'il corpo deve contenere il pensiero GREZZO per intero, non la prima fetta').toBe(GREZZO);
  expect(caso.dopoLaFine.nodi, 'e come testo semplice: nessun nodo di markdown lasciato a metà').toBe(0);
  expect(caso.riaperta.montata && caso.riaperta.prima && caso.riaperta.ultima, `riaperta, la scheda mostra tutto (${caso.riaperta.nodi} nodi)`).toBe(true);

  /* CASO B — MAI APERTA: il comportamento di sempre non si muove. */
  await apri(page, 'mai-aperta');
  await scarica(page, [
    { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 },
    ...deltaRagionamentoVivo(480, 2, 'mai'),
    { type: 'ReasoningMessageEnd', messageId: 'mai', _sequenza: 900 },
  ]);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const maiAperta = await page.evaluate(() => {
    const corpo = [...document.querySelectorAll('#conversation .real-reasoning-note .tool-note-detail')].pop();
    return { testo: corpo.textContent, nodi: corpo.querySelectorAll('*').length };
  });
  expect(maiAperta.testo, 'mai aperta: il grezzo intero, come in CHAT-LUNGA-P0-03').toBe(GREZZO);
  expect(maiAperta.nodi, 'mai aperta: zero nodi elemento').toBe(0);

  /* CASO C — APERTA E LASCIATA APERTA: alla fine si finisce di disegnarla in markdown. */
  await apri(page, 'lasciata-aperta');
  await scarica(page, [
    { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 },
    ...deltaRagionamentoVivo(480, 2, 'aperta'),
  ]);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const lasciataAperta = await page.evaluate(async () => {
    const attendi = (n) => new Promise((ok) => { let i = 0; const giro = () => (i++ >= n ? ok() : requestAnimationFrame(giro)); giro(); });
    const nota = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop();
    const testa = nota.querySelector(':scope > .talos-activity__head');
    const corpo = nota.querySelector('.tool-note-detail');
    const r = window.__talosHarnessUiRuntime;
    testa.click();
    await attendi(2);
    r.handleRealEvent({ type: 'ReasoningMessageEnd', messageId: 'aperta', _sequenza: 900 }, r.realSessionState.generation);
    for (let i = 0; i < 900; i += 1) { if (window.__p0cMontato(corpo)) break; await attendi(1); }
    return { aperta: testa.getAttribute('aria-expanded'), nodi: corpo.querySelectorAll('*').length, prima: corpo.textContent.includes('Rileggo il file numero 0'), ultima: corpo.textContent.includes('Rileggo il file numero 479') };
  });
  expect(lasciataAperta.aperta, 'resta aperta').toBe('true');
  expect(lasciataAperta.nodi, 'lasciata aperta: markdown, quindi nodi elemento').toBeGreaterThan(0);
  expect(lasciataAperta.prima && lasciataAperta.ultima, `lasciata aperta: il montaggio arriva in fondo (${lasciataAperta.nodi} nodi)`).toBe(true);
});

/*
 * ⛔⛔ TEMA CHIARO E SCURO, SEMPRE TUTTI E DUE (regola dell'owner, 11/09) — e qui si fotografa
 *   esattamente lo stato che il controllore ha trovato rotto: la scheda RIAPERTA dopo la sequenza
 *   apri → richiudi a metà montaggio → `ReasoningMessageEnd`. Prima della cura, in quella foto si
 *   sarebbe vista la sola prima fetta del pensiero; adesso si vede tutto, ultima riga compresa.
 *   Le foto finiscono in `frontend/artifacts/p0-C/`.
 */
for (const modo of ['dark', 'light']) {
  test(`CHAT-LUNGA-P0-FOTO — il ragionamento riaperto dopo apri→chiudi→fine, tema ${modo}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: modo });
    await page.addInitScript((colorMode) => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
    }, modo);
    await page.goto('/');
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await apri(page, `foto-richiusa-${modo}`);
    await scarica(page, [
      { type: 'RunStarted', input: { consegna: 'Pensaci su' }, _sequenza: 1 },
      ...deltaRagionamentoVivo(480, 2, 'foto'),
    ]);
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

    /* La sequenza, dentro la pagina: apri, due fotogrammi, richiudi, due fotogrammi, fine. */
    await page.evaluate(async () => {
      const attendi = (n) => new Promise((ok) => { let i = 0; const giro = () => (i++ >= n ? ok() : requestAnimationFrame(giro)); giro(); });
      const testa = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop().querySelector(':scope > .talos-activity__head');
      const r = window.__talosHarnessUiRuntime;
      testa.click();
      await attendi(2);
      testa.click();
      await attendi(2);
      r.handleRealEvent({ type: 'ReasoningMessageEnd', messageId: 'foto', _sequenza: 900 }, r.realSessionState.generation);
      await attendi(10);
      testa.click(); // e la persona la riapre
    });
    /* ⛔ Il montaggio VERO: nodi elemento nel corpo E l'ultima riga fra quelli — a scheda chiusa il
       grezzo è già nel `<pre>`, quindi «contiene l'ultima riga» da solo sarebbe vero troppo presto. */
    await page.waitForFunction(() => {
      const corpo = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop()?.querySelector('.tool-note-detail');
      return !!corpo && corpo.querySelectorAll('*').length > 0 && corpo.textContent.includes('Rileggo il file numero 479');
    }, null, { timeout: 30000 });
    await page.locator('#conversation .real-reasoning-note').last().locator(':scope > .talos-activity__body')
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    /*
     * Si scorre in fondo al corpo: la prova della cura è l'ULTIMA riga, non la prima.
     * ⛔ `corpo.lastElementChild` non basta: il markdown di un elenco numerato è UN solo elemento,
     *   e centrarlo mostra il MEZZO del pensiero (misurato: la prima foto ritraeva le righe 239-243,
     *   cioè proprio la zona che esisteva anche prima della cura). Si scende fino all'ultima foglia.
     */
    await page.evaluate(() => {
      const corpo = [...document.querySelectorAll('#conversation .real-reasoning-note')].pop().querySelector('.tool-note-detail');
      let foglia = corpo;
      while (foglia.lastElementChild) foglia = foglia.lastElementChild;
      foglia.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(300);
    mkdirSync(CARTELLA_MISURE, { recursive: true });
    await page.screenshot({ path: resolve(CARTELLA_MISURE, `ragionamento-riaperto-dopo-chiusura-${modo}.png`), fullPage: false });
  });
}
