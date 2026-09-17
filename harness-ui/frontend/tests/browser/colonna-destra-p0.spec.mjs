import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/** Le foto vanno anche su disco, non solo fra gli allegati: l'owner le guarda una per una. */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/p0-E/', import.meta.url)));
async function foto(page, nome) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await senzaToast(page);
  const byte = await page.locator('.talos-inspector').screenshot();
  await writeFile(path.join(CARTELLA_FOTO, nome), byte);
  return byte;
}
/** Le misure si STAMPANO: una misura che si vede solo quando la prova fallisce non e' una misura. */
function misura(nome, valore) { console.log(`MISURA-P0E ${nome} = ${JSON.stringify(valore)}`); }

/**
 * Chiude i messaggi di sistema prima di fotografare.
 * ⛔ Non è un trucco per una foto più bella: il toast «Collegato di nuovo» è uno strato che vive
 *   SOPRA la app, non fa parte della colonna, e nelle prime foto del 16/09 copriva le ultime due
 *   righe — cioè nascondeva proprio quello che c'era da ispezionare.
 */
async function senzaToast(page) {
  await page.evaluate(() => { const t = document.querySelector('#regioneToast'); if (t) t.hidden = true; });
}

/*
 * ⛔⛔⛔ P0-E — LA COLONNA DESTRA SUL PACCHETTO SERVITO, NEI DUE TEMI.
 *
 * Le prove unitarie di `tests/unit/inspector-processi.test.mjs` e
 * `tests/unit/conversazione-figlia.test.mjs` girano su un DOM finto: dicono che la logica è giusta,
 * NON che a schermo si veda. La lezione del 10-11/09 è esattamente questa — tre errori JavaScript
 * arrivati all'owner con build e 620 test VERDI, trovati aprendo la pagina e leggendo la console.
 * ⇒ Qui si apre la app vera, si fanno i gesti veri, si misura e si fotografa.
 *
 * ⛔⛔ COME SI LANCIA, e perché non basta `npx playwright test`:
 *     TALOS_HARNESS_UI_TEST_PORT=4176 \
 *     TALOS_HARNESS_UI_PUBLIC_DIR="$PWD/harness-ui/frontend/dist" \
 *     npx playwright test tests/browser/colonna-destra-p0.spec.mjs --project=chromium-desktop
 *
 *   Il server serve `harness-ui/public/`, che NON è l'uscita di `npm run build` (che scrive in
 *   `frontend/dist/`): la consegna in `public/` la fa `scripts/aggiorna-4174.ps1` con una copia.
 *   ⛔ Trovato girando, e costa caro saperlo dopo: senza quella variabile questa prova gira contro
 *   il bundle CONSEGNATO l'ultima volta e misura il codice di ieri — la prima esecuzione ha detto
 *   «120 righe» dove il tetto ne vuole 40, e il tetto funzionava benissimo. Un verde (o un rosso)
 *   su un pacchetto stantio non parla del codice che si è appena scritto.
 *   ⛔ `public/` è TRACCIATO e lo rigenerano tutte le corsie: non lo tocca questa, lo consegna chi
 *   fonde. Vedi `fuori_regione` nel report.
 *
 * ⛔ Mai il 4174: `playwright.config.mjs` avvia un server suo, su 4176, con uno store ISOLATO.
 * ⛔ Due temi, sempre tutti e due (owner 11/09).
 * ⛔ Le foto si scattano dopo che il velo d'avvio è stato rimosso.
 *
 * LE MISURE che questa prova prende, e che nel report vanno con i loro numeri:
 *   · nodi della scheda «Processi» con 120 comandi (il tetto deve mordere sul DOM, non sul conto);
 *   · mutazioni della CHAT DELLA MADRE mentre si apre e si chiude una figlia: deve essere ZERO;
 *   · tempo dal clic sulla card al pannello della figlia visibile.
 */

const MADRE = 'p0e-madre';
const FIGLIA = 'p0e-figlia';

/** Un flusso SSE che dice solo «la storia è finita»: la chat esce dalla rigiocata e cronometra. */
const CONFINE_SSE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;

/** Gli eventi della figlia, serviti come SSE: markdown, ragionamento, attrezzi. */
const TESTO_FIGLIA = [
  '## Quello che ho trovato',
  '',
  'Il file ha **tre** problemi e un `TODO` rimasto indietro:',
  '',
  '- il primo',
  '- il secondo',
  '',
  '> Nota: la terza riga è la più lunga e serve a vedere se la colonna regge.',
  '',
  '| campo | valore |',
  '| --- | --- |',
  '| righe | 42 |',
  '',
  '```js',
  'const somma = (a, b) => a + b;',
  'export default somma;',
  '```',
].join('\n');

const EVENTI_FIGLIA = [
  { type: 'RunStarted', input: { consegnaCorta: 'leggi il ledger e riassumilo' }, contesto: { modello: 'z-ai/glm-5.3-flash' } },
  { type: 'ReasoningMessageStart', messageId: 'r1' },
  { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'Prima **leggo** il file, poi conto le righe.' },
  { type: 'ReasoningMessageEnd', messageId: 'r1' },
  { type: 'ToolCallStart', toolCallId: 'tf1', toolCallName: 'leggi' },
  { type: 'ToolCallArgs', toolCallId: 'tf1', delta: '{"percorso":"docs/ledger.md"}' },
  { type: 'ToolCallResult', toolCallId: 'tf1', content: '42 righe' },
  { type: 'TextMessageContent', messageId: 'mf1', delta: TESTO_FIGLIA },
  { type: 'RunFinished', outcome: 'fine-lavoro' },
];
const SSE_FIGLIA = `${EVENTI_FIGLIA.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;

/** I comandi della madre: uno per famiglia, più quelli che servono a far scattare il tetto. */
const COMANDI = [
  'git status --short',
  'npm run build > build.log 2>&1',
  'node --test tests/unit/inspector.test.mjs',
  'docker compose up -d',
  'curl -sS https://registry.npmjs.org/shell-quote/latest',
  'grep -rn "talos-process" src/styles/index.css',
  'pytest -q tests/',
  'cargo build --release',
];

function eventiAttrezzi(quanti) {
  const fuori = [];
  for (let i = 0; i < quanti; i += 1) {
    const id = `sh${i}`;
    fuori.push({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', _sequenza: 100 + i * 3 });
    fuori.push({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando: COMANDI[i % COMANDI.length], descrizione: 'Controlla lo stato del progetto' }), _sequenza: 101 + i * 3 });
    /*
     * Chi resta VIVO e chi fallisce si scelgono con moduli diversi da `COMANDI.length`.
     * ⛔ Alla prima stesura erano entrambi «ogni 8», come i comandi: filtrando «git» uscivano SOLO
     *   righe «In corso», e la foto sembrava dire che gli stati non funzionassero. Una fixture
     *   periodica quanto i dati misura il proprio periodo, non il codice.
     */
    if (i % 13 !== 0) fuori.push({ type: 'ToolCallResult', toolCallId: id, content: i % 5 === 0 ? 'exit 1\nboom' : (i % 11 === 0 ? 'exit 130\nfermato' : 'exit 0\nfatto'), isError: i % 5 === 0, _sequenza: 102 + i * 3 });
  }
  return fuori;
}

for (const modo of ['dark', 'light']) {
  test.describe(`colonna destra P0-E · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    /* ⛔ `locale: 'it-IT'`: i nomi umani degli attrezzi seguono la lingua della UI, e con la lingua
       di serie di Playwright (en-US) la riga diceva «reading a file». Le foto devono essere quelle
       che vede l'owner, non quelle di un browser inglese — visto nella prima foto del 16/09. */
    test.use({ colorScheme: modo, locale: 'it-IT' });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
      }, modo);
      /*
       * ⛔ Le rotte si intercettano con un PREDICATO e non con un glob: la lezione dell'11/09 è che
       *   `page.route('**\/api/v1/sessions')` non copriva la query string e un giro VERO è partito.
       *   Qui si guarda il percorso pulito, e tutto ciò che non è previsto NON viene intercettato.
       */
      await page.route((url) => url.pathname.endsWith(`/sessions/${FIGLIA}/events`), (route) => route.fulfill({ contentType: 'text/event-stream', body: SSE_FIGLIA }));
      await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/events`), (route) => route.fulfill({ contentType: 'text/event-stream', body: CONFINE_SSE }));
      /* ⛔ L'indirizzo si rilegge dalla RICHIESTA: il parametro del predicato non è in scope qui
         dentro. Presa girando: «ReferenceError: url is not defined», sei prove rosse. */
      await page.route((url) => url.pathname.endsWith('/children'), (route) => {
        const suFiglia = new URL(route.request().url()).pathname.includes(FIGLIA);
        /* ⛔ La BUSTA, non il dato nudo: `apiGet` scarta tutto ciò che non è `{ok:true, data}` —
           e lo scarta in silenzio, perché `caricaFigliSessione` ha un `catch` che mette `figli: []`.
           Presa girando: la rotta rispondeva, veniva chiamata due volte, e la scheda restava vuota. */
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: { figli: suFiglia ? [] : [{ sessionId: FIGLIA, task: 'Sei un agente delegato. Preambolo del kernel… leggi il ledger e riassumilo', taskCorto: 'leggi il ledger e riassumilo', conclusa: false, interrotta: false, avviataAlle: new Date().toISOString(), evidenzaDelega: { toolCalls: 3, scritture: 1 } }] } }),
        });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Colonna destra P0-E', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, MADRE);
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
    });

    async function manda(page, lista) {
      await page.evaluate((l) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of l) r.handleRealEvent(e, r.realSessionState.generation);
      }, lista);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    }

    const apriScheda = (page, quale) => page.locator(`#railTabs [data-rail="${quale}"]`).click();

    test(`P0E-PROCESSI — ogni riga dice comando, famiglia e stato; il tetto morde sul DOM (${modo})`, async ({ page }, info) => {
      await manda(page, [{ type: 'RunStarted', input: { consegna: 'Controlla il progetto' }, _sequenza: 1 }, ...eventiAttrezzi(120)]);
      await apriScheda(page, 'processi');

      const rail = page.locator('#railProcessi');
      const righe = rail.locator('[data-c="ProcessRow"]');
      /* ⛔ Il tetto è sul DOM: 40 righe, non 120. Se qualcuno lo togliesse, questa riga diventa rossa. */
      await expect(righe).toHaveCount(40);
      const nodiScheda = await rail.evaluate((n) => n.querySelectorAll('*').length);
      expect(nodiScheda, `nodi della scheda con 120 comandi: ${nodiScheda}`).toBeLessThan(1200);

      /* La riga più recente: icona di famiglia, comando a segmenti, stato con la sua PAROLA. */
      const prima = righe.first();
      await expect(prima.locator('.talos-cmd__eseguibile').first()).toBeVisible();
      await expect(prima.locator('.talos-process__stato-testo')).not.toHaveText('');
      const famiglie = await righe.evaluateAll((n) => [...new Set(n.map((x) => x.dataset.famiglia))].sort());
      expect(famiglie.length, `famiglie riconosciute a schermo: ${famiglie.join(', ')}`).toBeGreaterThan(3);

      /* «Carica altri» c'è, dice quanti, e ne aggiunge altri quaranta. */
      const altri = rail.locator('.talos-process-altri');
      await expect(altri).toContainText('Carica altri');
      await expect(altri).toContainText('120');
      await altri.click();
      await expect(righe).toHaveCount(80);

      /* Il dettaglio si apre SENZA ridisegnare la scheda: la card resta la stessa. */
      const identita = await prima.evaluate((n) => { n.dataset.marcaDiProva = 'io'; return n.dataset.marcaDiProva; });
      expect(identita).toBe('io');
      await prima.locator('.talos-process__apri').click();
      await expect(prima.locator('.talos-process__dettaglio')).toBeVisible();
      await expect(prima.locator('.talos-process__dettaglio')).toContainText('Cartella');

      /* ⛔ Un evento NUOVO non deve azzerare né il filtro, né il dettaglio aperto, né la selezione. */
      await rail.locator('.talos-process-filtro__campo').fill('git');
      await expect(righe.first().locator('.talos-cmd__eseguibile').first()).toHaveText('git');
      const quanteConFiltro = await righe.count();
      await manda(page, [{ type: 'ToolCallStart', toolCallId: 'nuovo-1', toolCallName: 'shell', _sequenza: 9000 }, { type: 'ToolCallArgs', toolCallId: 'nuovo-1', delta: JSON.stringify({ comando: 'git push --force-with-lease' }), _sequenza: 9001 }]);
      await expect(rail.locator('.talos-process-filtro__campo')).toHaveValue('git');
      await expect(righe).toHaveCount(quanteConFiltro + 1);

      misura(`processi.nodiScheda.120comandi.${modo}`, nodiScheda);
      misura(`processi.famiglie.${modo}`, famiglie);
      await info.attach(`processi-${modo}.png`, { body: await foto(page, `processi-${modo}.png`), contentType: 'image/png' });
    });

    test(`P0E-FIGLIA — markdown, ragionamento collassato, e la chat della MADRE non si muove (${modo})`, async ({ page }, info) => {
      await manda(page, [{ type: 'RunStarted', input: { consegna: 'Delega il lavoro' }, _sequenza: 1 }, { type: 'TextMessageContent', messageId: 'mm1', delta: 'Delego a un sotto-agente.', _sequenza: 2 }, { type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 3 }]);
      await apriScheda(page, 'agenti');
      const card = page.locator('#railAgenti [data-c="AgentRow"]');
      await expect(card).toHaveCount(1);

      /*
       * ⛔ LA MISURA CHE CONTA: la chat della madre NON deve ridisegnarsi. Si conta con un
       *   MutationObserver montato PRIMA del clic — un conteggio preso dopo non direbbe niente.
       * ⛔⛔ E PRIMA SI CHIUDE IL GIRO DELLA MADRE. Alla prima stesura non lo facevo, e la misura
       *   diceva 4 mutazioni: erano `attributes:class` su `talos-turn`, su `talos-message__copy
       *   is-streaming` e su una card di attività — cioè la madre che STA ANCORA SCRIVENDO, non la
       *   figlia che la disturba. Misurare la colonna mentre la chat è viva vuol dire attribuire
       *   alla figlia il movimento di qualcun altro: il numero c'era, e diceva un'altra cosa.
       */
      await manda(page, [{ type: 'RunFinished', outcome: 'fine-lavoro', _sequenza: 50 }]);
      await page.waitForTimeout(400); // le classi di fine giro si posano
      await page.evaluate(() => {
        window.__p0eMutazioniMadre = 0;
        const bersaglio = document.querySelector('#conversation');
        window.__p0eDettagli = [];
        window.__p0eOsservatore = new MutationObserver((m) => {
          window.__p0eMutazioniMadre += m.length;
          for (const r of m) window.__p0eDettagli.push(`${r.type}:${r.attributeName || ''}:${(r.target.className || r.target.nodeName || '').toString().slice(0, 60)}`);
        });
        window.__p0eOsservatore.observe(bersaglio, { childList: true, subtree: true, characterData: true, attributes: true });
      });

      const t0 = Date.now();
      await card.click();
      const pannello = page.locator('[data-c="PannelloFiglia"] .talos-figlia');
      await expect(pannello).toBeVisible();
      const msClicPannello = Date.now() - t0;

      /* Il markdown è RESO: titolo, elenco, citazione, tabella, recinto col suo «Copia».
         ⛔ `.assistant-copy` nella figlia sono DUE (la risposta e il ragionamento): si nomina la
         risposta escludendo l'altra, invece di prendere «la prima» e sperare nell'ordine. */
      const risposta = pannello.locator('.assistant-copy:not(.talos-figlia__ragionamento)');
      await expect(risposta.locator('h2')).toHaveText('Quello che ho trovato');
      await expect(risposta.locator('li')).toHaveCount(2);
      await expect(risposta.locator('blockquote')).toHaveCount(1);
      await expect(risposta.locator('table')).toHaveCount(1);
      await expect(pannello.locator('.code-block .code-block-lang')).toHaveText('JavaScript');
      await expect(pannello.locator('.code-block pre')).toContainText('const somma');
      await expect(risposta).not.toContainText('**tre**');

      /* Il ragionamento c'è ed è CHIUSO. ⛔ Si CONTROLLA qui e si APRE dopo le foto: nella prima
         foto del 16/09 l'avevo aperto prima di scattare, e lo scatto non provava più niente. */
      const ragionamento = pannello.locator('[data-c="ReasoningBundle"]');
      await expect(ragionamento).toHaveCount(1);
      await expect(ragionamento.locator('.talos-activity__head')).toHaveAttribute('aria-expanded', 'false');

      /* ⛔ Il codice deve stare NELLA COLONNA: niente sfondamento orizzontale. */
      const sfonda = await pannello.evaluate((n) => n.scrollWidth > n.clientWidth + 1);
      expect(sfonda, 'il pannello della figlia non sfonda la colonna in larghezza').toBe(false);

      misura(`figlia.clicPannelloMs.${modo}`, msClicPannello);
      await info.attach(`figlia-${modo}.png`, { body: await foto(page, `figlia-${modo}.png`), contentType: 'image/png' });
      /* ⛔ Una foto sola non basta: la risposta in markdown sta PIÙ IN BASSO nel corpo che scorre, e
         nella prima foto del 16/09 non si vedeva affatto — cioè la cura principale del punto 10 non
         era stata guardata. Seconda foto in fondo, dove stanno tabella e recinto di codice. */
      await pannello.locator('.talos-figlia__corpo').evaluate((n) => { n.scrollTop = n.scrollHeight; });
      await page.waitForTimeout(150);
      await info.attach(`figlia-markdown-${modo}.png`, { body: await foto(page, `figlia-markdown-${modo}.png`), contentType: 'image/png' });

      /* E si apre: il contenuto c'è già, pronto. */
      await ragionamento.locator('.talos-activity__head').click();
      await expect(ragionamento.locator('.talos-activity__body')).toBeVisible();

      /* Si torna indietro: l'elenco riappare, e la madre continua a non muoversi. */
      await pannello.locator('.talos-figlia__indietro').click();
      await expect(page.locator('#railAgenti')).toBeVisible();

      const { mutazioni, dettagli } = await page.evaluate(() => { window.__p0eOsservatore.disconnect(); return { mutazioni: window.__p0eMutazioniMadre, dettagli: window.__p0eDettagli }; });
      misura(`figlia.mutazioniChatMadre.${modo}`, mutazioni);
      expect(mutazioni, `mutazioni della chat della madre: ${mutazioni} → ${dettagli.join(' | ')} (clic→pannello ${msClicPannello} ms)`).toBe(0);
    });

    test(`P0E-RUNTIME — nessun errore in console mentre si usa la colonna (${modo})`, async ({ page }) => {
      /* ⛔ La lezione dell'11/09: build verde e test verdi non guardano il RUNTIME. */
      const errori = [];
      page.on('pageerror', (e) => errori.push(`pageerror: ${e}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        /*
         * ⛔ I «Failed to load resource» NON si contano, e va detto perché invece di toglierli in
         *   silenzio: il server di prova ha uno store VUOTO e non espone il catalogo modelli né il
         *   runtime agente (lo dichiara lui stesso all'avvio: «Il runtime agente non espone il
         *   catalogo task richiesto»), quindi la app chiede e riceve 404. Sono risposte di rete
         *   attese in questo ambiente, non errori del codice — e contarle renderebbe questa prova
         *   rossa per sempre, cioè inutile. ⛔ Tutto il resto, `pageerror` compresi, conta: sono
         *   proprio i tre errori JavaScript che il 10-11/09 sono arrivati all'owner con build e
         *   620 test verdi.
         */
        if (/Failed to load resource/u.test(m.text())) return;
        errori.push(`console: ${m.text()}`);
      });

      await manda(page, [{ type: 'RunStarted', input: { consegna: 'Prova' }, _sequenza: 1 }, ...eventiAttrezzi(30), { type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 9000 }]);
      for (const scheda of ['processi', 'agenti', 'file', 'contesto', 'processi']) await apriScheda(page, scheda);
      await apriScheda(page, 'agenti');
      await page.locator('#railAgenti [data-c="AgentRow"]').click();
      await expect(page.locator('[data-c="PannelloFiglia"] .talos-figlia')).toBeVisible();
      await page.locator('.talos-figlia__indietro').click();
      await apriScheda(page, 'processi');
      await expect(page.locator('#railProcessi [data-c="ProcessRow"]').first()).toBeVisible();

      expect(errori, `errori a runtime: ${errori.join(' | ')}`).toEqual([]);
    });
  });
}
