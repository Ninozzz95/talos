import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BC-71 — I TRE RESIDUI DEL GIRO BC-63/BC-67, misurati sulla app viva.
 *
 * (a) `#copyAllDiffs` esiste DUE VOLTE nel DOM. ⛔ E non è solo lui: contando TUTTI gli id del
 *     documento (non cercando quello nominato nella scheda) vengono fuori anche
 *     `inspector-tab-context`, `inspector-tab-files`, `inspector-tab-agents` — quattro doppioni,
 *     non uno. È la stessa causa per tutti e quattro: `legacy/frammenti.html` monta, nascosto, un
 *     pezzo di monolite che porta gli stessi id che `bridge/legacy-dom.js` assegna al markup del
 *     mockup.
 *     ⛔ Correzione onesta alla scheda della coda: «il `$()` aggiorna il primo, quello invisibile»
 *     è al contrario. I frammenti si appendono al `body` DOPO il guscio, quindi in ordine di
 *     documento il primo è quello del mockup — cioè quello VISIBILE. Il difetto resta: un id
 *     doppio rende ambigui `getElementById`, `aria-controls` e `aria-labelledby`, e il secondo
 *     nodo non riceve mai né l'ascoltatore né lo stato.
 *
 * (b) IL SOMMARIO DELLA TESTATA HA DUE SCRITTORI. `renderRealReviewList` scrive
 *     `riassuntoReview(voci)` dentro `.talos-topbar__path`; `aggiornaTestataSessione` (che la
 *     stessa funzione chiama poche righe prima, e che `aggiornaSommarioReviewReale` richiama dopo)
 *     ci scrive la regola decisa il 06/09 — «il terzo posto porta SEMPRE la cartella, e il
 *     riassunto della vista si aggiunge dopo un separatore». Vince l'ultimo che passa.
 *     ⛔ E non è solo la forma: i due scrittori CONTANO in modo diverso. `riassuntoReview` usa
 *     `contaDiff`, che se il server non ha già contato le righe le conta da `code`;
 *     `riassuntoReviewTestata` leggeva `v.aggiunte`/`v.rimozioni` e basta, cioè ZERO quando quei
 *     campi non ci sono. Due numeri diversi per lo stesso fatto.
 *
 * (c) `#browserTesto` mostra il TESTO DIMOSTRATIVO del template («Registro dei processi…») finché
 *     una lettura vera non lo sostituisce. È il gemello di BC-67 nel Browser.
 *
 * ⛔ Tutte e tre si misurano sulla app vera, con la porta VERA degli eventi.
 */

async function apri(page, { larghezza = 1024, altezza = 800, tema = 'dark' } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/bc71-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}

const ID_DOPPI = `(() => {
  const conta = new Map();
  for (const n of document.querySelectorAll('[id]')) conta.set(n.id, (conta.get(n.id) || 0) + 1);
  return [...conta].filter(([, q]) => q > 1).map(([id, q]) => ({ id, quanti: q }));
})()`;

test('BC71-A — nessun id compare due volte nel documento, con e senza sessione', async ({ page }) => {
  await apri(page);
  /* La PREMESSA: il ponte ha montato davvero i frammenti del monolite, altrimenti questa prova
     girerebbe su mezza pagina e il verde non direbbe niente. */
  const montato = await page.evaluate(() => Boolean(document.querySelector('#talos-legacy')) && document.querySelectorAll('[id]').length > 200);
  expect(montato, 'la scena non si è formata: i frammenti del monolite non sono montati').toBe(true);
  expect(await page.evaluate(ID_DOPPI), 'id doppi senza sessione').toEqual([]);
  await page.evaluate(() => {
    window.__talosHarnessUiRuntime.passaASessione('bc71-uno', 'workspace', 'BC71', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(ID_DOPPI), 'id doppi con una sessione viva').toEqual([]);
});

test('BC71-A — il pulsante «Copia i diff» che il prodotto cabla è quello che si VEDE', async ({ page }) => {
  await apri(page);
  const m = await page.evaluate(() => {
    const scelto = document.querySelector('#copyAllDiffs');
    return {
      quanti: document.querySelectorAll('[id="copyAllDiffs"]').length,
      nellaTestata: Boolean(scelto?.closest('#schermoReview .talos-topbar')),
      nelMonolite: Boolean(scelto?.closest('#talos-legacy')),
    };
  });
  expect(m.quanti, 'il pulsante «Copia i diff» deve esistere una volta sola').toBe(1);
  expect(m.nellaTestata, 'il pulsante cablato deve essere quello della testata della Revisione').toBe(true);
  expect(m.nelMonolite, 'il pulsante cablato non deve essere quello nascosto del monolite').toBe(false);
});

test('BC71-B — il sommario della Revisione ha UN solo scrittore, e i due passaggi dicono la stessa cosa', async ({ page }) => {
  await apri(page);
  const m = await page.evaluate(async () => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc71-due', 'workspace', 'BC71', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    /* La Revisione APERTA: una testata dentro una vista nascosta non ha larghezza, e la misura di
       ciò che si vede varrebbe zero. */
    r.executeCommand('review');
    await new Promise((x) => requestAnimationFrame(x));
    const g = r.realSessionState.generation;
    let seq = 4000;
    /* Un giro vero, così la sessione conosce la sua cartella: la regola del 06/09 dice che il terzo
       posto della testata la porta SEMPRE, e senza di lei non si potrebbe nemmeno vedere se il
       riassunto le si aggiunge dopo il separatore o le prende il posto. */
    r.handleRealEvent({ type: 'RunStarted', _sequenza: seq += 1, input: { consegna: 'Scrivi due file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
    /* Una scrittura vera, con il «prima» e il «dopo» — il diff lo calcola il prodotto, riga per
       riga, e la voce che ne esce NON porta i campi `aggiunte`/`rimozioni`: è esattamente il caso
       in cui i due scrittori davano numeri diversi. */
    const scrivi = (id, percorso, prima, dopo) => {
      r.handleRealEvent({ type: 'StateDelta', _sequenza: seq += 1, delta: [{ op: prima === null ? 'add' : 'replace', path: `/file/${percorso}`, value: dopo, ...(prima === null ? {} : { prima }) }] }, g);
    };
    scrivi('s1', 'src/uno.mjs', 'riga uno\nriga vecchia\n', 'riga uno\nriga due\nriga tre\n');
    await new Promise((x) => requestAnimationFrame(x));
    const leggi = () => {
      const n = document.querySelector('#schermoReview .talos-topbar__path');
      const barra = document.querySelector('#schermoReview .talos-topbar');
      return {
        testo: (n?.textContent || '').trim(),
        nascosto: Boolean(n?.hidden),
        /* ⛔ Si misura anche se si VEDE, e non si asserisce: `index.css:534` toglie il terzo posto
           sotto i 900 px di CONTENITORE, e la Revisione, con la colonna dei dettagli aperta, sta
           sotto quella soglia a tutte e due le misure del desktop. Il numero finisce nel rapporto:
           riparare un sommario che nessuno vede sarebbe mezza cura, e dirlo è l'altra metà. */
        display: n ? getComputedStyle(n).display : null,
        larghezzaBarra: barra ? Math.round(barra.getBoundingClientRect().width) : null,
      };
    };
    const dopoElenco = leggi();
    /* Una seconda scrittura, come in una sessione vera: entrambi gli scrittori ripassano. */
    scrivi('s2', 'src/due.mjs', null, 'altra riga\n');
    await new Promise((x) => requestAnimationFrame(x));
    return { dopoElenco, dopoSommario: leggi(), file: r.realSessionState.reviewFiles.size };
  });
  console.log(`MISURA-BC71B = ${JSON.stringify(m)}`);
  expect(m.file, 'la scena non si è formata: nessun file nella Revisione').toBeGreaterThan(0);
  /* La regola del 06/09: il terzo posto porta SEMPRE la cartella, e il riassunto viene dopo un
     separatore. Il testo del PRIMO scrittore («Nessuna modifica in questa sessione», o il solo
     conteggio senza cartella) non deve più comparire in nessuno dei due momenti. */
  for (const [quando, letto] of [['dopo l’elenco', m.dopoElenco], ['dopo il sommario', m.dopoSommario]]) {
    expect(letto.testo, `${quando}: la testata non deve dire «Nessuna modifica in questa sessione»`).not.toContain('Nessuna modifica');
    expect(letto.testo, `${quando}: la testata deve portare la cartella e il riassunto, separati`).toMatch(/·/);
  }
  /* E i due momenti devono avere la STESSA forma — cartella, separatore, conteggio, righe: se due
     scrittori restassero, la forma cambierebbe da un passaggio all'altro (prima della cura erano
     «1 file modificato» e «2 file modificati», senza cartella e senza righe). */
  const FORMA = /^[^·]+ · \d+ file modificat[oi] · \+\d+ −\d+$/u;
  expect(m.dopoElenco.testo, 'dopo l’elenco la testata non ha la forma decisa il 06/09').toMatch(FORMA);
  expect(m.dopoSommario.testo, 'dopo il sommario la testata non ha la forma decisa il 06/09').toMatch(FORMA);
  /*
   * ⛔ Il costo VERO del doppio scrittore, e la ragione per cui non basta cancellare una riga: lo
   *   scrittore rimasto contava `v.aggiunte`/`v.rimozioni`, campi che una scrittura senza conteggi
   *   dal server NON porta ⇒ le righe aggiunte e tolte sparivano dalla testata. Qui si pretendono.
   */
  expect(m.dopoSommario.testo, 'la testata deve portare le righe aggiunte e tolte').toMatch(/\+\d+\s+−\d+/);
  expect(m.dopoSommario.testo, 'e non possono essere zero: due file scritti, righe vere').not.toMatch(/\+0\s+−0/);
});

test('BC71-C — il Browser non mostra MAI il testo dimostrativo del template', async ({ page }) => {
  await apri(page);
  const demo = 'Registro dei processi';
  const stati = await page.evaluate(async (frase) => {
    const leggi = (quando) => {
      const n = document.querySelector('#browserTesto');
      const r = n?.getBoundingClientRect();
      return {
        quando,
        visibile: Boolean(n) && !n.hidden && n.offsetParent !== null && r.width > 0 && r.height > 0,
        haLaFrase: (n?.textContent || '').includes(frase),
      };
    };
    const fuori = [leggi('all’avvio')];
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc71-tre', 'workspace', 'BC71', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    let seq = 9000;
    /* Il Browser aperto SENZA nessuna scheda: è lo stato in cui, se il disegno del template
       restasse, il testo d'esempio si vedrebbe senza che nessuna regia l'abbia nascosto. */
    r.executeCommand('browser');
    await new Promise((x) => requestAnimationFrame(x));
    await new Promise((x) => setTimeout(x, 120));
    fuori.push(leggi('Browser aperto, nessuna scheda'));
    /* «In apertura»: l'attrezzo è partito con il suo indirizzo e il risultato NON è ancora
       arrivato. È lo stato che la scheda della coda nomina. */
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'b1', toolCallName: 'naviga', _sequenza: seq += 1 }, g);
    r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'b1', delta: JSON.stringify({ url: 'https://esempio.test/' }), _sequenza: seq += 1 }, g);
    r.executeCommand('browser');
    await new Promise((x) => requestAnimationFrame(x));
    await new Promise((x) => setTimeout(x, 120));
    fuori.push(leggi('scheda in apertura'));
    /* E dopo una lettura vera: il testo c'è, ed è quello della pagina, non quello del template. */
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'b1', content: 'Pagina vera\n\nIl testo che ha letto l’agente.', _sequenza: seq += 1 }, g);
    await new Promise((x) => requestAnimationFrame(x));
    await new Promise((x) => setTimeout(x, 120));
    const dopo = leggi('dopo la lettura vera');
    dopo.testo = (document.querySelector('#browserTesto')?.textContent || '').trim().slice(0, 60);
    fuori.push(dopo);
    return fuori;
  }, demo);
  console.log(`MISURA-BC71C = ${JSON.stringify(stati)}`);
  /* La PREMESSA: la scena è arrivata fino alla lettura vera. */
  expect(stati.at(-1).testo, 'la scena non si è formata: la lettura vera non è arrivata a schermo').toContain('Pagina vera');
  const guai = stati.filter((s) => s.haLaFrase);
  expect(guai, `il testo dimostrativo del template è nel DOM: ${JSON.stringify(guai)}`).toEqual([]);
});
