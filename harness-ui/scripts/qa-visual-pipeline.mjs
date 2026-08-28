#!/usr/bin/env node
/**
 * qa-visual-pipeline.mjs — pipeline di analisi/debugging visivo, riusabile.
 *
 * Owner, 27/8: "dobbiamo creare questa pipeline di analisi/debugging
 * automatizzata in modo che tu possa fare tutte le prove al posto mio".
 * Fino a qui ogni verifica dal vivo era uno script usa-e-getta nello
 * scratchpad, mai committato — questo file lo è: vive nel repo, chiunque
 * lo rilancia con lo stesso comando, ogni corsa lascia una prova su disco
 * (non solo nel terminale di chi l'ha eseguita).
 *
 * Cosa fa, ad ogni corsa:
 * - Lancia un Chrome dedicato con CDP (mai quello dell'owner, mai la
 *   porta 9333 — riservata al ponte ADB verso il Pad).
 * - Esegue lo SCENARIO scelto (una sequenza di passi: click, digita,
 *   aspetta, controlla) — il default è "nuova-sessione-compito-libero",
 *   end-to-end con una VERA chiamata al modello scelto.
 * - Cattura uno screenshot ad ogni passo — inclusi passi INTERMEDI
 *   mentre l'agente lavora (regola di memoria: "lo screenshot va
 *   scattato DURANTE", non solo alla fine).
 * - Cattura i log console (Runtime.consoleAPICalled), le eccezioni JS
 *   non gestite (Runtime.exceptionThrown) e le risposte HTTP >= 400
 *   (Network.responseReceived) per l'intera corsa — non solo cosa SI
 *   VEDE, anche cosa la pagina ha detto/rotto sottotraccia.
 * - Scrive un report.json in .qa-runs/<timestamp>/ con l'elenco
 *   screenshot + log + eccezioni + richieste fallite.
 *
 * Uso:
 *   node scripts/qa-visual-pipeline.mjs [scenario] [--url=http://...] [--porta=9556]
 *
 * Scenari disponibili: vedi SCENARI sotto. Aggiungerne uno nuovo è
 * scrivere una funzione async(p) => {...} e registrarla lì — nessun'altra
 * parte dello script va toccata.
 *
 * ⛔ Il compito reale (scenario di default) chiama davvero un modello a
 * pagamento sulla chiave configurata sul server. Non è un mock: è la
 * prova che l'owner ha chiesto di fare "come farebbe un umano".
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE_HARNESS_UI = dirname(QUI);

const ARGV = process.argv.slice(2);
const SCENARIO_NOME = ARGV.find((a) => !a.startsWith('--')) || 'nuova-sessione-compito-libero';
const URL_BASE = (ARGV.find((a) => a.startsWith('--url='))?.slice(6)) || 'http://127.0.0.1:4174/';
const PORTA_CDP = Number(ARGV.find((a) => a.startsWith('--porta='))?.slice(8) || 9556);
const CHROME_PATH = process.env.TALOS_QA_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// --------------------------------------------------------------------
// Client CDP minimo: comandi via Promise, eventi ascoltati per l'intera corsa.
// --------------------------------------------------------------------
class ClientCdp {
  constructor(ws) {
    this.ws = ws;
    this.prossimoId = 1;
    this.inAttesa = new Map();
    this.logConsole = [];
    this.eccezioni = [];
    this.richiesteFallite = [];
    ws.addEventListener('message', (event) => this.onMessaggio(JSON.parse(event.data)));
  }

  onMessaggio(msg) {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const testo = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      this.logConsole.push({ tipo: msg.params.type, testo, quando: new Date().toISOString() });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      this.eccezioni.push({ testo: msg.params.exceptionDetails?.text, url: msg.params.exceptionDetails?.url, quando: new Date().toISOString() });
    } else if (msg.method === 'Network.responseReceived') {
      const { response } = msg.params;
      if (response.status >= 400) {
        this.richiesteFallite.push({ url: response.url, status: response.status, quando: new Date().toISOString() });
      }
    }
    if (msg.id && this.inAttesa.has(msg.id)) {
      const { resolve, reject } = this.inAttesa.get(msg.id);
      this.inAttesa.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.prossimoId++;
      this.inAttesa.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(espressione) {
    const risultato = await this.send('Runtime.evaluate', { expression: espressione, returnByValue: true, awaitPromise: true });
    if (risultato.exceptionDetails) throw new Error(JSON.stringify(risultato.exceptionDetails));
    return risultato.result?.value;
  }
}

function j(valore) { return JSON.stringify(valore); }

// --------------------------------------------------------------------
// Avvio/spegnimento Chrome — MAI la porta 9333 (ponte ADB), MAI il profilo dell'owner.
// --------------------------------------------------------------------
function lanciaChrome({ porta, userDataDir, url }) {
  return spawn(CHROME_PATH, [
    `--remote-debugging-port=${porta}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    url,
  ], { stdio: 'ignore', windowsHide: true });
}

async function attendiCdp(porta, tentativiMassimi = 30) {
  for (let tentativo = 0; tentativo < tentativiMassimi; tentativo += 1) {
    try {
      const risposta = await fetch(`http://127.0.0.1:${porta}/json`);
      if (risposta.ok) {
        const target = (await risposta.json()).find((t) => t.type === 'page');
        if (target) return target.webSocketDebuggerUrl;
      }
    } catch { /* Chrome non ancora pronto — riprova */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Chrome non risponde su CDP porta ${porta} entro il timeout`);
}

function chiudiChromeAlbero(pid) {
  try {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  } catch { /* già terminato, o mai partito — non bloccare la pulizia */ }
}

// --------------------------------------------------------------------
// La pipeline: un handle per scrivere scenari leggibili passo-passo.
// --------------------------------------------------------------------
class Pipeline {
  constructor({ outDir, cdp }) {
    this.outDir = outDir;
    this.cdp = cdp;
    this.numeroStep = 0;
    this.report = [];
  }

  async screenshot(nome, { nota = '' } = {}) {
    this.numeroStep += 1;
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'png' });
    const fileName = `${String(this.numeroStep).padStart(2, '0')}-${nome}.png`;
    writeFileSync(join(this.outDir, fileName), Buffer.from(data, 'base64'));
    this.report.push({ step: this.numeroStep, nome, file: fileName, nota, quando: new Date().toISOString() });
    console.log(`  [${String(this.numeroStep).padStart(2, '0')}] screenshot: ${fileName}${nota ? ` — ${nota}` : ''}`);
    return fileName;
  }

  async click(selettore) {
    const trovato = await this.cdp.evaluate(`(() => { const el = document.querySelector(${j(selettore)}); if (el) el.click(); return !!el; })()`);
    if (!trovato) throw new Error(`Selettore non trovato per il click: ${selettore}`);
  }

  async digita(selettore, valore, { evento = 'input' } = {}) {
    const trovato = await this.cdp.evaluate(`(() => {
      const el = document.querySelector(${j(selettore)});
      if (!el) return false;
      el.value = ${j(valore)};
      el.dispatchEvent(new Event(${j(evento)}, {bubbles:true}));
      return true;
    })()`);
    if (!trovato) throw new Error(`Selettore non trovato per digitare: ${selettore}`);
  }

  async submit(selettoreForm) {
    const trovato = await this.cdp.evaluate(`(() => { const el = document.querySelector(${j(selettoreForm)}); if (el) el.requestSubmit(); return !!el; })()`);
    if (!trovato) throw new Error(`Form non trovato: ${selettoreForm}`);
  }

  /** Per bottoni generati dinamicamente senza selettore stabile (es. "Pausa"/"Elimina" di una riga automazione) — trova per testo dentro un contenitore. */
  async clickByText(selettoreContenitore, testoContenuto) {
    const trovato = await this.cdp.evaluate(`(() => {
      const contenitore = document.querySelector(${j(selettoreContenitore)});
      if (!contenitore) return false;
      const el = [...contenitore.querySelectorAll('button')].find((b) => b.textContent.includes(${j(testoContenuto)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!trovato) throw new Error(`Nessun bottone con testo "${testoContenuto}" dentro ${selettoreContenitore}`);
  }

  async testo(selettore) {
    return this.cdp.evaluate(`document.querySelector(${j(selettore)})?.textContent?.trim() ?? null`);
  }

  async esiste(selettore) {
    return this.cdp.evaluate(`!!document.querySelector(${j(selettore)})`);
  }

  async contaMessaggiUtente() {
    return this.cdp.evaluate("document.querySelectorAll('.user-message').length");
  }

  async attendi(ms) { await new Promise((r) => setTimeout(r, ms)); }

  /**
   * ⭐⭐⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md). `digita()`
   * sopra imposta `.value` su un `<input>` — non funziona su xterm.js,
   * che non legge un `.value`: ascolta veri eventi di tastiera/input sul
   * suo textarea nascosto (`.xterm-helper-textarea`). `Input.insertText`
   * (CDP) inserisce testo allo stesso livello di una digitazione umana
   * reale (la stessa tecnica di Puppeteer per l'unicode) — funziona con
   * QUALUNQUE editor basato su eventi nativi, xterm.js incluso.
   */
  async digitaTastieraVera(testo) {
    await this.cdp.send('Input.insertText', { text: testo });
  }

  /** Per tasti non-stampabili (Enter, Tab, frecce...) — `Input.insertText` non li copre, serve un vero keyDown/keyUp. */
  async premiTasto(key, { code = key } = {}) {
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  }

  /**
   * ⛔⛔⛔ 28/8 — trovato dal vivo: `click()` sopra usa `el.click()`
   * sintetico via JS — dispatcha un evento `click`, ma xterm.js prende
   * il FOCUS sul suo textarea nascosto rispondendo a un vero
   * `mousedown` con coordinate reali (hit-testing sul canvas), non a un
   * `.click()` DOM generico. Senza focus vero, `Input.insertText`
   * arriva al documento ma non a xterm — la tastiera "reale" non basta
   * se il click che la precede non lo è altrettanto. Stesse coordinate
   * di un dito umano: centro dell'elemento, mousePressed+mouseReleased
   * via CDP.
   */
  async clickReale(selettore) {
    const rect = await this.cdp.evaluate(`(() => { const el = document.querySelector(${j(selettore)}); if (!el) return null; const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
    if (!rect) throw new Error(`Selettore non trovato per il click reale: ${selettore}`);
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  }

  /**
   * ⛔ 27/8 — trovato in QUESTA stessa corsa: un'attesa fissa (600ms) dopo
   * l'apertura del model picker non bastava per il VERO fetch a
   * OpenRouter (417 modelli, payload reale, non un mock) — lo script
   * proseguiva mentre la lista era ancora "Carico il catalogo…". Non un
   * difetto del prodotto: un limite dello script. Fa polling finché
   * `espressioneJs` non torna truthy, o rilancia oltre il timeout.
   */
  async attendiCondizione(espressioneJs, { timeoutMs = 8000, intervalMs = 200, descrizione = espressioneJs } = {}) {
    const scadenza = Date.now() + timeoutMs;
    while (Date.now() < scadenza) {
      if (await this.cdp.evaluate(espressioneJs)) return;
      await this.attendi(intervalMs);
    }
    throw new Error(`Condizione mai vera entro ${timeoutMs}ms: ${descrizione}`);
  }

  nota(testo) {
    console.log(`  · ${testo}`);
    this.report.push({ nota: testo, quando: new Date().toISOString() });
  }

  /**
   * ⛔⛔⛔ 28/8 — trovato dal vivo, PIÙ tentativi con segnali diversi (il
   * flag `eventoTerminaleVisto`, la bolla "sta elaborando"): un turno
   * con PIÙ tool-call in sequenza (es. `document_create` rifiutato per
   * nome duplicato → una domanda di chiarimento → un secondo
   * `document_create`) fa sparire/riapparire quei segnali PIÙ volte
   * nello stesso turno — un singolo "diventato falso" non basta.
   * Robusto per costruzione: aspetta che `selettore` smetta di
   * CRESCERE (stesso testo per `giriStabili` controlli di fila,
   * `intervalMs` di distanza) — vero indipendentemente da quanti
   * tool-call/reasoning intermedi il turno contiene.
   */
  async attendiTestoStabile(selettore, { timeoutMs = 90000, intervalMs = 800, giriStabili = 3 } = {}) {
    const scadenza = Date.now() + timeoutMs;
    let precedente = null;
    let contatore = 0;
    while (Date.now() < scadenza) {
      const attuale = await this.cdp.evaluate(`document.querySelector(${j(selettore)})?.textContent?.length ?? -1`);
      if (attuale === precedente && attuale > 0) {
        contatore += 1;
        if (contatore >= giriStabili) return;
      } else {
        contatore = 0;
      }
      precedente = attuale;
      await this.attendi(intervalMs);
    }
    throw new Error(`Il testo di "${selettore}" non si è mai stabilizzato entro ${timeoutMs}ms`);
  }

  /**
   * ⭐⭐⭐ 27/8 — owner: "ogni verifica visiva deve automaticamente
   * annotare nel taccuino tutti errori di UI/UX e funzionalità". Un
   * difetto è LEGATO all'ultimo screenshot scattato (quello in cui è
   * stato visto), mai un elenco slegato dalle prove — chi rilegge il
   * taccuino deve poter aprire ESATTAMENTE il file che mostra il
   * problema. `severita`: 'blocco' (rompe il flusso) | 'difetto'
   * (sbagliato ma non blocca) | 'nota' (dubbio da verificare).
   */
  difetto(descrizione, { severita = 'difetto' } = {}) {
    const ultimoScreenshot = [...this.report].reverse().find((r) => r.file)?.file ?? null;
    const voce = { tipo: 'difetto', severita, descrizione, screenshot: ultimoScreenshot, quando: new Date().toISOString() };
    this.report.push(voce);
    this.difetti = this.difetti || [];
    this.difetti.push(voce);
    console.log(`  ⛔ [${severita}] ${descrizione}${ultimoScreenshot ? ` (${ultimoScreenshot})` : ''}`);
  }

  salvaReport() {
    const reportPath = join(this.outDir, 'report.json');
    writeFileSync(reportPath, JSON.stringify({
      scenario: SCENARIO_NOME,
      urlBase: URL_BASE,
      eseguitoAlle: new Date().toISOString(),
      step: this.report,
      difetti: this.difetti || [],
      logConsole: this.cdp.logConsole,
      eccezioni: this.cdp.eccezioni,
      richiesteFallite: this.cdp.richiesteFallite,
    }, null, 2));

    const difetti = this.difetti || [];
    const righeTaccuino = [
      `# Taccuino QA — ${SCENARIO_NOME}`,
      '',
      `Eseguito: ${new Date().toISOString()} · URL: ${URL_BASE}`,
      '',
      difetti.length === 0
        ? '✅ Nessun difetto annotato in questa corsa.'
        : `⛔ ${difetti.length} difetto/i annotati:`,
      ...difetti.map((d) => `- [${d.severita}] ${d.descrizione}${d.screenshot ? ` — vedi \`${d.screenshot}\`` : ''}`),
      '',
      this.cdp.eccezioni.length > 0 ? `⛔ ${this.cdp.eccezioni.length} eccezione/i JS non gestite (vedi report.json)` : '✅ Nessuna eccezione JS.',
      this.cdp.richiesteFallite.length > 0 ? `⛔ ${this.cdp.richiesteFallite.length} richieste HTTP fallite (vedi report.json)` : '✅ Nessuna richiesta HTTP fallita.',
    ];
    writeFileSync(join(this.outDir, 'taccuino.md'), righeTaccuino.join('\n'));
    return reportPath;
  }
}

// --------------------------------------------------------------------
// SCENARI — ognuno è async (p) => {...}. Il default esegue la pipeline
// intera "come farebbe un umano": apre l'app, avvia una sessione libera
// con un modello scelto dal catalogo vero, scrive un compito reale,
// osserva l'esecuzione, controlla la Review.
// --------------------------------------------------------------------
const SCENARI = {
  async 'nuova-sessione-compito-libero'(p) {
    await p.attendi(1500);
    await p.screenshot('stato-iniziale', { nota: 'app appena caricata, nessuna sessione' });

    await p.click('#newSessionBtn');
    await p.attendi(500);
    await p.screenshot('modale-nuova-sessione', { nota: 'compito libero, nessuna prova per banco' });
    if (await p.esiste('[data-start-task]')) {
      p.difetto('la modale "Nuova sessione" mostra ancora prove per banco — l\'owner le ha fatte rimuovere', { severita: 'blocco' });
    }

    await p.click('.model-picker-trigger');
    // ⛔ il catalogo è un fetch VERO a OpenRouter (417 modelli) — un'attesa fissa non basta sempre, si aspetta la condizione.
    await p.attendiCondizione(
      "!document.querySelector('.model-picker-list')?.textContent?.includes('Carico il catalogo')",
      { descrizione: 'catalogo modelli caricato' },
    );
    await p.screenshot('model-picker-aperto', { nota: 'catalogo OpenRouter, gruppi per provider' });

    await p.digita('.model-picker-search input', 'deepseek');
    await p.attendiCondizione("!!document.querySelector('.model-picker-option')", { descrizione: 'risultati di ricerca renderizzati' });
    await p.screenshot('model-picker-ricerca', { nota: 'filtrato su "deepseek"' });

    // con la ricerca attiva ogni gruppo che matcha è già aperto automaticamente (vedi renderLista() in app.js) — nessun click sull'header serve.
    const primaOpzione = await p.testo('.model-picker-option');
    p.nota(`prima opzione dopo la ricerca: ${primaOpzione}`);
    await p.click('.model-picker-option');
    await p.attendi(200);
    const modelloScelto = await p.testo('.model-picker-trigger-label');
    p.nota(`modello selezionato: ${modelloScelto}`);
    await p.screenshot('model-picker-scelto', { nota: 'trigger aggiornato, pannello chiuso' });

    // ⛔ 27/8, secondo giro — la modale non chiede più il compito (owner: "quello si fa
    // direttamente da interfaccia chat"). Il form qui sceglie SOLO cartella+modello;
    // il submit chiama avviaSessionePendente() e apre la chat vuota, il compito si scrive
    // nel composer normale, che lo consuma al primo invio (state.pendingCustomSession).
    await p.submit('#customTaskForm');
    await p.attendiCondizione("!!document.querySelector('#conversationEmptyState')", { descrizione: 'chat vuota pronta dopo la scelta cartella+modello' });
    await p.screenshot('sessione-pronta-vuota', { nota: 'nessuna sessione lato server ancora — solo cartella+modello scelti' });

    await p.digita('#composerInput', 'Add and export a function `sottrai(a, b)` in src/matematica.mjs that returns a - b. Add a test for it in test/matematica.test.mjs, following the style of the existing somma test.');
    await p.screenshot('compito-scritto', { nota: 'prima dell\'invio, nel composer normale' });

    await p.cdp.evaluate("document.querySelector('#composerForm').requestSubmit()");
    p.nota('sessione avviata — inizia il ciclo di attesa con screenshot periodici DURANTE l\'esecuzione');

    const massimoAttesaMs = 120_000;
    const intervalloMs = 4_000;
    let trascorsoMs = 0;
    let concluso = false;
    while (trascorsoMs < massimoAttesaMs && !concluso) {
      await p.attendi(intervalloMs);
      trascorsoMs += intervalloMs;
      await p.screenshot(`esecuzione-t${Math.round(trascorsoMs / 1000)}s`);
      const runStrip = await p.testo('#sessionTitle');
      const eventoTerminale = await p.cdp.evaluate("window.__talosHarnessUiRuntime?.realSessionState?.eventoTerminaleVisto ?? null");
      p.nota(`t=${Math.round(trascorsoMs / 1000)}s — sessionTitle="${runStrip}" eventoTerminaleVisto=${eventoTerminale}`);
      if (eventoTerminale === true) concluso = true;
    }
    if (!concluso) {
      p.difetto(`nessun evento terminale ricevuto entro ${massimoAttesaMs / 1000}s di attesa`, { severita: 'nota' });
    }

    await p.screenshot('conversazione-finale', { nota: 'stato della chat a fine attesa' });

    const reviewFilesCount = await p.cdp.evaluate("window.__talosHarnessUiRuntime?.realSessionState?.reviewFiles?.size ?? 0");
    p.nota(`file in Review: ${reviewFilesCount}`);
    if (concluso && reviewFilesCount === 0) {
      p.difetto('la sessione si è conclusa ma la Review non ha nessun file — il modello ha scritto qualcosa?', { severita: 'nota' });
    }
    if (reviewFilesCount > 0) {
      await p.click('#commandPaletteBtn');
      await p.attendi(200);
      await p.click('[data-command="review"]'); // ⛔ non "[data-open-view=diff]" — quell'attributo non esiste, era un mio errore
      await p.attendi(400);
      await p.screenshot('review-finale', { nota: 'diff reale prodotto dal modello' });
    }

    await p.click('#commandPaletteBtn');
    await p.attendi(200);
    await p.click('[data-command="terminal"]');
    await p.attendi(300);
    await p.screenshot('terminale-finale', { nota: 'output shell/prova se usato' });

    // ⭐ ogni eccezione JS o richiesta HTTP fallita vista durante l'intera corsa entra nel taccuino come difetto, non solo nel report.json.
    for (const e of p.cdp.eccezioni) p.difetto(`eccezione JS non gestita: ${e.testo} (${e.url})`, { severita: 'blocco' });
    for (const r of p.cdp.richiesteFallite) p.difetto(`richiesta HTTP fallita: ${r.status} ${r.url}`, { severita: 'blocco' });
  },

  /*
   * ⭐⭐⭐ 27/8 — owner: "procedi al testing umano". Copre il resto del
   * ciclo di vita di una sessione e le superfici non toccate dallo
   * scenario precedente — navigazione sidebar, terminale diretto (`!`),
   * fork, export, automazioni, doctor, impostazioni, capability hub — la
   * maggior parte GRATUITA (nessuna chiamata al modello): fork è solo
   * bookkeeping, export legge dati già persistiti, automazioni/doctor/
   * settings non toccano mai talosLavora. Un solo resume VERO (a
   * pagamento) per confermare che continua davvero una sessione conclusa.
   */
  async 'sessione-lifecycle-completo'(p) {
    await p.attendi(1500);
    await p.screenshot('sidebar-al-boot', { nota: 'design deliberato (26/8, vedi il commento di testa in app.js): zero fetch al mount, la sidebar resta vuota finché nessuna azione di sessione la aggiorna' });
    if (await p.esiste('.session-item.real-session-item')) {
      p.difetto('la sidebar mostra sessioni reali subito al boot, senza nessuna azione — comportamento diverso da quello DELIBERATO e testato (CODE-COMPOSER-DEMO-SEND-01/HARNESS-BOARD-MOBILE-HONESTY-01, "zero fetch al mount")', { severita: 'nota' });
    } else {
      p.nota('confermato: sidebar vuota al boot, per design — un umano che riapre la pagina non rivede le sessioni precedenti finché non ne avvia/apre una. Segnalato, non corretto: decisione esplicita già presa il 26/8 con due test a supporto.');
    }
    // Prerequisito del RESTO di questo scenario (fork/review/export su una sessione VERA):
    // stessa funzione che ogni azione di sessione richiama già da sola — non sto aggirando
    // niente, sto solo simulando l'azione minima che un umano farebbe per popolare la sidebar.
    await p.cdp.evaluate("window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali()");
    await p.attendiCondizione("!!document.querySelector('.session-item.real-session-item')", { descrizione: 'sidebar popolata dopo aggiornaElencoSessioniReali()' });
    await p.screenshot('sidebar-sessioni-reali', { nota: 'sessioni concluse dai giri precedenti, persistite su disco' });

    // --- Navigazione: passa alla prima sessione reale ---
    await p.click('.session-item.real-session-item');
    await p.attendi(400);
    await p.screenshot('sessione-selezionata', { nota: 'passaASessione — storia riprodotta dall\'EventSource' });

    // --- Review della sessione reale (se ha file) ---
    await p.click('#commandPaletteBtn');
    await p.attendi(200);
    await p.click('[data-command="review"]');
    await p.attendi(400);
    await p.screenshot('review-sessione-esistente');

    // --- Terminale DIRETTO: "!comando", mai passato dal modello ---
    await p.digita('#composerInput', '!echo verifica-terminale-umano');
    await p.cdp.evaluate("document.querySelector('#composerForm').requestSubmit()");
    await p.attendiCondizione(
      "document.querySelector('.terminal-window')?.textContent?.includes('verifica-terminale-umano')",
      { timeoutMs: 10000, descrizione: 'output del comando diretto nel terminale' },
    );
    await p.screenshot('terminale-comando-diretto', { nota: '!echo — bypassa il modello, va dritto alla shell' });
    const terminaleTesto = await p.testo('.terminal-window');
    if (!terminaleTesto?.includes('verifica-terminale-umano')) {
      p.difetto('il terminale non mostra l\'output del comando diretto', { severita: 'blocco' });
    }

    // --- Fork (gratis: nessuna chiamata al modello, solo bookkeeping) ---
    // ⛔ niente click su [data-open-panel="inspector"]: aria-expanded="true" di default su desktop, il Context Rail è già visibile — cliccarlo lo avrebbe CHIUSO (toggle).
    const contaSessioniPrimaDelFork = await p.cdp.evaluate("document.querySelectorAll('.session-item.real-session-item').length");
    await p.click('[data-action="fork-session"]');
    await p.attendiCondizione(
      `document.querySelectorAll('.session-item.real-session-item').length > ${contaSessioniPrimaDelFork}`,
      { descrizione: 'la sidebar mostra la sessione forkata' },
    );
    await p.screenshot('fork-completato', { nota: 'nuova sessione, stessa storia — zero chiamate al modello' });

    // --- Export: intercetta il blob scaricato, verifica lo schema ---
    const exportOk = await p.cdp.evaluate(`(() => {
      window.__ultimoBlobEsportato = null;
      const originale = URL.createObjectURL;
      URL.createObjectURL = (blob) => { window.__ultimoBlobEsportato = blob; return originale.call(URL, blob); };
      return true;
    })()`);
    if (!exportOk) p.difetto('impossibile intercettare URL.createObjectURL per verificare l\'export', { severita: 'nota' });
    await p.click('#commandPaletteBtn');
    await p.attendi(200);
    await p.click('[data-command="export"]');
    await p.attendi(300);
    const exportTesto = await p.cdp.evaluate(`(async () => {
      if (!window.__ultimoBlobEsportato) return null;
      return await window.__ultimoBlobEsportato.text();
    })()`);
    if (exportTesto) {
      let corpoExport;
      try { corpoExport = JSON.parse(exportTesto); } catch { corpoExport = null; }
      p.nota(`export schema: ${corpoExport?.schema ?? corpoExport?.note ?? '(non riconosciuto)'}`);
      if (!corpoExport?.schema?.startsWith?.('talos.harness-ui.session-export')) {
        p.difetto(`l'export non ha lo schema reale atteso — ricevuto: ${JSON.stringify(corpoExport).slice(0, 200)}`, { severita: 'blocco' });
      }
    } else {
      p.difetto('nessun blob intercettato per l\'export — il comando ha chiamato URL.createObjectURL?', { severita: 'nota' });
    }
    await p.screenshot('export-eseguito');

    // --- Automazioni: crea, verifica listata, metti in pausa, elimina — tutto gratis ---
    await p.click('[data-open-view="automations"]');
    await p.attendi(300);
    await p.screenshot('automazioni-vista');
    await p.click('[data-automation-action="new"]');
    await p.attendiCondizione("!document.querySelector('#sheetBody')?.textContent?.includes('Carico')", { descrizione: 'foglio nuova automazione caricato' });
    await p.digita('#sheetBody input[type="number"]', '5'); // intervallo minimo consentito
    await p.attendi(150);
    await p.click('#sheetBody button[type="submit"], #sheetBody .primary-btn');
    await p.attendiCondizione("!!document.querySelector('#automationListReal .automation-row')", { descrizione: 'automazione creata e listata' });
    await p.screenshot('automazione-creata');
    await p.clickByText('#automationListReal', 'Attiva');
    await p.attendi(300);
    await p.screenshot('automazione-attivata');
    await p.clickByText('#automationListReal', 'Elimina');
    await p.attendiCondizione("!document.querySelector('#automationListReal .automation-row')", { descrizione: 'automazione eliminata dalla lista' });
    p.nota('automazione creata, attivata ed eliminata — ciclo completo verificato');

    // --- Impostazioni: Riduci movimento, Doctor ---
    await p.click('[data-open-view="settings"]');
    await p.attendi(300);
    await p.click('#reducedMotionToggle');
    await p.attendi(150);
    const motionOn = await p.cdp.evaluate("document.body.classList.contains('reduce-motion')");
    p.nota(`reduce-motion dopo il toggle: ${motionOn}`);
    await p.click('#reducedMotionToggle'); // ripristina
    await p.click('[data-control-action="doctor"]');
    await p.attendiCondizione("document.querySelector('#toastRegion')?.textContent?.includes('Doctor:')", { descrizione: 'toast Doctor con esito reale' });
    const doctorToast = await p.testo('#toastRegion');
    p.nota(`Doctor: ${doctorToast}`);
    await p.screenshot('impostazioni-doctor');

    // --- Capability hub ---
    await p.click('[data-mode="chat"]'); // ⛔ non "[data-open-view=chat]": quell'attributo non esiste, la vista Chat si sceglie coi tab Chat/Split/Board
    await p.attendi(200);
    await p.click('#capabilityBtn');
    await p.attendi(300);
    await p.screenshot('capability-hub');
    await p.click('#closeSheet');

    // --- Resume/Compact: VERIFICATO nel codice PRIMA di questo passo (mai un selettore indovinato) —
    // nessun elemento in index.html chiama resumeSession()/compactSession(). Le due funzioni esistono,
    // sono testate a unità, ma un umano non ha ALCUN bottone per raggiungerle oggi: non è un passo
    // saltato per pigrizia, è il test stesso ("come farebbe un umano") che non trova nulla da premere.
    p.difetto('Resume e Compact: nessun elemento della UI chiama resumeSession()/compactSession() — le funzioni esistono e sono testate a unità, ma un umano non ha alcun bottone per raggiungerle', { severita: 'blocco' });

    for (const e of p.cdp.eccezioni) p.difetto(`eccezione JS non gestita: ${e.testo} (${e.url})`, { severita: 'blocco' });
    for (const r of p.cdp.richiesteFallite) {
      if (r.url.endsWith('/favicon.ico')) continue; // già dichiarato, cosmetico
      p.difetto(`richiesta HTTP fallita: ${r.status} ${r.url}`, { severita: 'blocco' });
    }
  },

  /**
   * ⭐⭐⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md). Owner: "deve
   * essere un terminale vero e proprio bash [...] usabile dall'utente con
   * le sue dita umane". Digitazione con `Input.insertText`/`Input.dispatchKeyEvent`
   * (CDP) — lo stesso livello di un tasto premuto per davvero, non
   * `el.value=...` (xterm.js non legge un `.value`, ascolta eventi di
   * tastiera veri sul suo textarea nascosto).
   *
   * ⛔ xterm.js disegna su `<canvas>` per default (non spans DOM
   * colorati) — verificare "cosa dice lo schermo" query-ando il DOM
   * sarebbe fragile e potrebbe mentire. Si legge lo schermo dalla STESSA
   * API che xterm.js espone per questo (`term.buffer.active`,
   * `getLine().translateToString()`) — la fonte vera, non una sua ombra
   * nel DOM. Il colore/l'aspetto restano verificati dallo SCREENSHOT,
   * ispezionato come ogni altro (regola dello schermo).
   */
  async 'terminale-reale'(p) {
    await p.attendi(1200);
    await p.screenshot('stato-iniziale', { nota: 'app appena caricata, terminale non ancora aperto' });

    await p.click('[data-mode="terminal"]');
    await p.attendiCondizione(
      "document.querySelector('#terminalStatusChip')?.textContent !== 'in attesa'",
      { descrizione: 'la connessione WS del terminale è partita' },
    );
    await p.screenshot('terminale-aperto', { nota: 'tab aperto, xterm.js montata, connessione in corso' });

    await p.attendiCondizione(
      "document.querySelector('#terminalStatusChip')?.textContent === 'connesso'",
      { timeoutMs: 8000, descrizione: 'PTY vera connessa (chip "connesso")' },
    );
    const chipTesto = await p.testo('#terminalStatusChip');
    p.nota(`chip di stato terminale: "${chipTesto}"`);
    await p.screenshot('terminale-connesso', { nota: 'prompt reale della shell (Git Bash o $SHELL), prima di digitare' });

    const leggiSchermo = "(() => { const t = window.__talosHarnessUiRuntime?.statoTerminale?.().term; if (!t) return null; const buf = t.buffer.active; const righe = []; for (let y = 0; y < buf.length; y++) righe.push(buf.getLine(y)?.translateToString(true) ?? ''); return righe.join('\\n'); })()";
    /*
     * ⛔ "connesso" è vero appena la WebSocket apre — la PTY lato server
     * viene spawnata IN QUEL MOMENTO, il primo output (motd/prompt)
     * arriva un istante dopo, via rete. Stessa famiglia già documentata
     * sopra per il catalogo modelli: un controllo immediato non basta,
     * `attendiCondizione` sì.
     */
    await p.attendiCondizione(
      `(${leggiSchermo})?.trim().length > 0`,
      { timeoutMs: 5000, descrizione: 'il primo output della PTY (prompt/motd) è arrivato' },
    );
    const schermoIniziale = await p.cdp.evaluate(leggiSchermo);
    p.nota(`schermo letto da term.buffer.active (assaggio): ${JSON.stringify(String(schermoIniziale).slice(-160))}`);

    // Focus reale: click dentro il pannello, come farebbe un dito umano — poi tastiera vera, non un .value sintetico.
    await p.clickReale('#realTerminalMount');
    await p.attendi(200);

    const marcatore = `talos-qa-marker-${Date.now()}`;
    await p.digitaTastieraVera(`echo ${marcatore}`);
    await p.attendi(150);
    await p.screenshot('terminale-digitato', { nota: 'comando digitato con tastiera VERA (Input.insertText), non ancora inviato' });
    await p.premiTasto('Enter');

    await p.attendiCondizione(
      `${leggiSchermo}?.includes(${j(marcatore)})`,
      { timeoutMs: 6000, descrizione: 'output del comando reale tornato dalla PTY' },
    );
    await p.screenshot('terminale-eseguito', { nota: 'output vero della shell dopo Invio' });

    const schermoFinale = await p.cdp.evaluate(leggiSchermo);
    if (!schermoFinale?.includes(marcatore)) {
      p.difetto(`il marcatore "${marcatore}" digitato non appare nello schermo del terminale dopo Invio — la PTY non ha eseguito il comando`, { severita: 'blocco' });
    } else {
      p.nota('round-trip completo: tastiera VERA (CDP) → xterm.onData → WebSocket → PTY reale → output tornato indietro e renderizzato. Non un log, non una simulazione.');
    }

    // ⛔ 28/8 — controllo mirato: il prompt Git Bash è normalmente colorato (verde/magenta/giallo/ciano via ANSI), ma la prima ispezione visiva mostrava tutto uniforme. Si campionano i pixel VERI del canvas xterm (getImageData), non un'impressione visiva su uno screenshot compresso.
    /*
     * ⭐⭐⭐ 28/8 — colore ANSI reale: verificato che serve il renderer
     * WebGL (montaTerminaleSeServe() in app.js, LEDGER-TERMINALE-REALE.md
     * per la storia completa — il renderer DOM di xterm.js v6 dipende da
     * un <style> iniettato a runtime che la CSP `style-src 'self'` di
     * questo server scarta in silenzio). Con WebGL attivo il colore è
     * pixel GPU veri su un <canvas> — si campionano i pixel VERI
     * (getImageData), non un'impressione visiva su uno screenshot
     * compresso, e si verifica ANCHE quale renderer è davvero attivo
     * (mai presumere che WebGL abbia funzionato solo perché richiesto).
     */
    const diagColore = await p.cdp.evaluate(`(() => {
      const enforcement = window.__talosHarnessUiRuntime?.statoTerminale?.().enforcementColore ?? null;
      const canvasList = [...document.querySelectorAll('#realTerminalMount canvas')];
      // drawImage su un canvas 2d di appoggio legge i pixel VERI del canvas sorgente (WebGL incluso) senza dover riaprire un contesto WebGL per leggerli.
      const appoggio = document.createElement('canvas');
      const campioniColore = new Set();
      for (const c of canvasList) {
        if (c.width === 0 || c.height === 0) continue;
        appoggio.width = c.width; appoggio.height = c.height;
        const actx = appoggio.getContext('2d');
        actx.drawImage(c, 0, 0);
        const dati = actx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < dati.length; i += 4 * 7) {
          if (dati[i + 3] > 0) campioniColore.add(\`\${dati[i]},\${dati[i + 1]},\${dati[i + 2]}\`);
        }
      }
      return { enforcement, numeroCanvas: canvasList.length, coloriDistinti: campioniColore.size, assaggio: [...campioniColore].slice(0, 10) };
    })()`);
    p.nota(`colore ANSI — renderer: "${diagColore.enforcement}", canvas trovati: ${diagColore.numeroCanvas}, colori RGB distinti: ${diagColore.coloriDistinti}`);
    if (diagColore.enforcement !== 'webgl') {
      p.difetto(`renderer attivo "${diagColore.enforcement}", non "webgl" — colori ANSI probabilmente assenti (fallback dichiarato, non un crash, ma da capire perché WebGL non è partito qui)`, { severita: 'nota' });
    } else if (diagColore.coloriDistinti <= 2) {
      p.difetto(`renderer webgl attivo ma solo ${diagColore.coloriDistinti} colori RGB distinti campionati — il prompt Git Bash è normalmente colorato, possibile regressione`, { severita: 'blocco' });
    } else {
      p.nota(`colori ANSI confermati: ${diagColore.coloriDistinti} colori RGB distinti nel canvas WebGL reale, assaggio ${JSON.stringify(diagColore.assaggio)}`);
    }

    for (const e of p.cdp.eccezioni) p.difetto(`eccezione JS non gestita: ${e.testo} (${e.url})`, { severita: 'blocco' });
    for (const r of p.cdp.richiesteFallite) {
      if (r.url.endsWith('/favicon.ico')) continue;
      p.difetto(`richiesta HTTP fallita: ${r.status} ${r.url}`, { severita: 'blocco' });
    }
  },

  /**
   * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`,
   * ledger `LEDGER-FASE-A-HOOKS.md`. Prova la catena INTERA, non solo
   * il pannello: un hook dichiarato in `.harness-ui-hooks.json` (nella
   * cartella-progetto configurata per questa corsa, un solo hook
   * `pre_tool_call` che rifiuta `scrivi`) — (1) NON fidato non blocca
   * nulla (una scrittura vera riesce); (2) l'owner lo fida dal
   * pannello Control-plane VERO (click reale, non un fetch diretto);
   * (3) una volta fidato, blocca DAVVERO una scrittura successiva
   * (REFUSED nel bubble della chat). Richiede due sessioni reali —
   * costa una piccola cifra reale, come ogni altro scenario di questo
   * file che chiama un modello vero.
   */
  async 'fase-a-hooks'(p) {
    await p.attendi(1200);
    await p.screenshot('stato-iniziale', { nota: 'app appena caricata' });

    // --- Sessione 1: hook presente ma NON fidato — la scrittura deve riuscire ---
    await p.digita('#composerInput', 'Crea un file chiamato non-bloccato.txt con dentro il testo "ok". Nient\'altro.');
    await p.submit('#composerForm');
    await p.attendiCondizione(
      "window.__talosHarnessUiRuntime?.realSessionState?.eventoTerminaleVisto === true",
      { timeoutMs: 60000, descrizione: 'la prima sessione (hook NON fidato) è conclusa' },
    );
    await p.screenshot('sessione1-hook-non-fidato-conclusa', { nota: 'la scrittura doveva riuscire: il hook non è ancora fidato' });
    const testoChat1 = await p.cdp.evaluate("document.querySelector('.conversation')?.textContent ?? ''");
    if (!/non-bloccato\.txt/.test(testoChat1)) {
      p.difetto('la sessione 1 non menziona il file atteso da nessuna parte nella chat — il modello potrebbe non aver chiamato scrivi affatto (variabilità del modello, non necessariamente un bug)', { severita: 'nota' });
    }
    if (/REFUSED/.test(testoChat1)) {
      p.difetto('la sessione 1 mostra REFUSED — un hook non ancora fidato NON deve bloccare nulla', { severita: 'blocco' });
    } else {
      p.nota('sessione 1: nessun REFUSED, come atteso — un hook non fidato è come se non esistesse');
    }

    // --- Fida l'hook dal pannello VERO — raggiunto dalla palette comandi (⌘K → "Agents, hooks e doctor"), come farebbe un umano da qualunque vista. ---
    await p.click('#commandPaletteBtn');
    await p.attendi(200);
    await p.click('[data-command="control"]');
    await p.attendiCondizione("!!document.querySelector('#hooksListMount button, #hooksListMount .status-chip')", { descrizione: 'il pannello hook ha finito di caricare' });
    await p.screenshot('pannello-hook-non-fidato', { nota: 'il hook "blocca-scritture" deve apparire con un bottone "Fida"' });
    const primaDiFidare = await p.testo('#hooksListMount');
    if (!/blocca-scritture/.test(primaDiFidare ?? '')) {
      p.difetto(`il pannello non mostra l'hook "blocca-scritture" — trovato invece: ${JSON.stringify(primaDiFidare)}`, { severita: 'blocco' });
    }
    await p.clickByText('#hooksListMount', 'Fida');
    await p.attendiCondizione("document.querySelector('#hooksListMount')?.textContent?.includes('attivo')", { timeoutMs: 5000, descrizione: 'il hook diventa "attivo" dopo Fida' });
    await p.screenshot('pannello-hook-fidato', { nota: 'ora deve mostrare "attivo", niente più bottone' });
    await p.click('#closeSheet');

    // --- Sessione 2 (follow-up sulla stessa sessione, conclusa — submitPrompt fa resume): hook ORA fidato, la scrittura deve essere BLOCCATA ---
    /*
     * ⛔⛔⛔ 28/8 — trovato dal vivo, TRE tentativi (flag `eventoTerminaleVisto`,
     * bolla "sta elaborando"): entrambi possono diventare falsi/sparire
     * PIÙ VOLTE nello stesso turno se il modello incontra un ostacolo a
     * metà (qui: un nome file già usato da un run precedente di questo
     * stesso scenario → una domanda di chiarimento → un secondo
     * tentativo) — un singolo "è diventato vero/falso" cattura il turno
     * a metà. `attendiTestoStabile` è indipendente da QUANTI passi
     * intermedi il turno contiene.
     */
    await p.digita('#composerInput', `Crea un file chiamato bloccato-${Date.now()}.txt con dentro il testo "ok". Nient'altro.`);
    await p.submit('#composerForm');
    await p.attendi(1000); // lascia partire il turno prima di misurare la prima lunghezza stabile
    await p.attendiTestoStabile('.conversation');
    await p.screenshot('sessione2-hook-fidato-conclusa', { nota: 'la scrittura doveva essere RIFIUTATA dal hook, ora attivo' });
    const testoChat2 = await p.cdp.evaluate("document.querySelector('.conversation')?.textContent ?? ''");
    if (/REFUSED/.test(testoChat2) && /blocco di prova FASE A/.test(testoChat2)) {
      p.nota('CONFERMATO: l\'hook fidato ha bloccato scrivi per davvero — REFUSED col motivo esatto dichiarato dal hook, visibile nel bubble della chat.');
    } else {
      p.difetto(`atteso REFUSED con "blocco di prova FASE A" nella chat della sessione 2, non trovato. Assaggio chat: ${JSON.stringify(testoChat2.slice(-800))}`, { severita: 'blocco' });
    }

    for (const e of p.cdp.eccezioni) p.difetto(`eccezione JS non gestita: ${e.testo} (${e.url})`, { severita: 'blocco' });
    for (const r of p.cdp.richiesteFallite) {
      if (r.url.endsWith('/favicon.ico')) continue;
      p.difetto(`richiesta HTTP fallita: ${r.status} ${r.url}`, { severita: 'blocco' });
    }
  },

  /*
   * ⭐⭐⭐ 28/8 — FASE B (permessi per-attrezzo, LEDGER-FASE-B-PERMESSI.md).
   *
   * ⛔⛔⛔ RIVISTO dopo un bug reale trovato dal PRIMO giro di questo stesso
   * scenario: un primo tentativo (chiediApprovazioneFn costruita appena
   * un attrezzo qualunque vuole 'chiedi') produceva la card giusta per
   * shell ma la faceva TRAPELARE anche su scrivi (nessun override) — la
   * card che appare qui sotto NON è più quella di allora, è la CONFERMA
   * del ripiego sicuro: shell:'chiedi' fuori da "On request" fallisce
   * CHIUSO (REFUSED, motivo esplicito), mai un bypass, mai una perdita
   * verso scrivi. La cura che mostra la card anche sotto "Workspace
   * write" resta bloccata da coordinamento (vedi il commento nel
   * sorgente, session-registry.mjs) — non promessa qui.
   */
  async 'fase-b-permessi-per-attrezzo'(p) {
    await p.attendi(1200);
    await p.screenshot('stato-iniziale', { nota: 'app appena caricata, nessuna sessione, nessun override' });

    // --- Apre il foglio Permessi dalla pillola VERA del composer, come farebbe un umano ---
    await p.click('[data-open-sheet="permissions"]');
    await p.attendi(300);
    await p.screenshot('foglio-permessi-aperto', { nota: 'policy sessione + i 4 select per-attrezzo, tutti su "Come la sessione"' });

    for (const tool of ['scrivi', 'prova', 'shell', 'document_create']) {
      if (!(await p.esiste(`select[data-tool-permission-select="${tool}"]`))) {
        p.difetto(`manca il select per-attrezzo per "${tool}" nel foglio Permessi`, { severita: 'blocco' });
      }
    }
    const policyAttiva = await p.testo('.sheet-option.active');
    if (!policyAttiva?.includes('Workspace write')) {
      p.difetto(`la policy sessione di default non è "Workspace write" — trovato: ${JSON.stringify(policyAttiva)}`, { severita: 'nota' });
    }

    // --- Imposta shell:'chiedi' — select nativo, evento change VERO (stesso pattern di p.digita già in uso per input testuali) ---
    await p.digita('select[data-tool-permission-select="shell"]', 'chiedi', { evento: 'change' });
    await p.attendi(150);
    const selectValore = await p.cdp.evaluate("document.querySelector('select[data-tool-permission-select=\"shell\"]')?.value");
    if (selectValore !== 'chiedi') {
      p.difetto(`il select shell non riflette 'chiedi' dopo il cambio — valore letto: ${JSON.stringify(selectValore)}`, { severita: 'blocco' });
    }
    p.nota(`select shell.value dopo il cambio: ${JSON.stringify(selectValore)} (state.permessiPerAttrezzo non è esposto su __talosHarnessUiRuntime — il select è la sola sonda diretta, la prova vera arriva dalla card di approvazione più sotto)`);
    await p.screenshot('shell-chiedi-impostato', { nota: 'select shell su "Chiedi conferma"' });
    await p.click('#closeSheet');
    await p.attendi(300);

    // --- Prima sessione (implicita, cartella unica): chiede shell — ripiego sicuro, REFUSED fail-closed ---
    /*
     * ⛔⛔⛔ 28/8 — trovato dal vivo, DUE bug del MIO script (non del
     * prodotto), nello stesso giro: (1) `attendiTestoStabile` con la
     * soglia di default (3 giri × 800ms) dichiarava "stabile" durante una
     * pausa nel ragionamento, PRIMA che il turno finisse per davvero — il
     * turno successivo veniva rifiutato con un toast onesto "Messaggio
     * non consegnato... a metà esecuzione", mai un bug di prodotto; (2) un
     * controllo per sostanza (`/fase-b-shell-ok/`) trovava SEMPRE un falso
     * positivo, perché quella stessa stringa è già nel PROMPT dell'owner,
     * sempre visibile in chat — mai una prova che il comando sia girato.
     * ⛔ `eventoTerminaleVisto` NON è la cura qui (a differenza di
     * nuova-sessione-compito-libero): un secondo turno sulla STESSA
     * sessione lo trova già `true` dal primo, esattamente il difetto già
     * documentato per fase-a-hooks — si risolverebbe all'istante, prima
     * che il turno nuovo sia davvero finito. Cura vera: la STESSA
     * `attendiTestoStabile`, ma con una soglia più conservativa (5 giri
     * da 1500ms — 7.5s di silenzio vero, non 2.4s) per sopravvivere a
     * una pausa di ragionamento normale; e via il controllo che si
     * auto-inganna sul secondo.
     */
    await p.digita('#composerInput', 'Esegui con l\'attrezzo shell il comando `echo fase-b-shell-ok` e riportami l\'output esatto che ricevi. Nient\'altro, non scrivere file.');
    await p.submit('#composerForm');
    await p.attendi(1000);
    await p.attendiTestoStabile('.conversation', { giriStabili: 5, intervalMs: 1500 });
    const testoChatDopoRichiesta = await p.cdp.evaluate("document.querySelector('.conversation')?.textContent ?? ''");
    await p.screenshot('shell-refused-fail-closed', { nota: 'ripiego sicuro: shell:\'chiedi\' sotto Workspace write fallisce CHIUSO, mai una card che trapela' });
    if (await p.esiste('.real-approval-card')) {
      p.difetto('è apparsa una .real-approval-card — inattesa col ripiego sicuro attuale (chiediApprovazioneFn non costruita fuori da "On request")', { severita: 'blocco' });
    } else if (/REFUSED/.test(testoChatDopoRichiesta) && /non ha un canale di approvazione attivo/.test(testoChatDopoRichiesta)) {
      p.nota('CONFERMATO: shell:\'chiedi\' sotto "Workspace write" fallisce chiuso col motivo esatto — nessuna card, nessun bypass silenzioso (ripiego sicuro, non la cura finale).');
    } else {
      p.difetto(`esito inatteso per la richiesta shell (né REFUSED col motivo atteso né una card) — chat: ${JSON.stringify(testoChatDopoRichiesta.slice(-800))}`, { severita: 'blocco' });
    }

    // --- Secondo turno, STESSA sessione: scrivi (nessun override) — deve passare SENZA chiedere ---
    const cardPrimaDiScrivi = await p.cdp.evaluate("document.querySelectorAll('.real-approval-card').length");
    const nomeFile = `fase-b-scrivi-${Date.now()}.txt`;
    await p.digita('#composerInput', `Crea un file chiamato ${nomeFile} con dentro il testo "ok". Nient'altro, non chiamare shell.`);
    await p.submit('#composerForm');
    await p.attendi(1000);
    await p.attendiTestoStabile('.conversation', { giriStabili: 5, intervalMs: 1500 });
    await p.screenshot('scrivi-senza-approvazione', { nota: 'scrivi non ha un override: deve passare dritto, zero card nuova' });
    const cardDopoScrivi = await p.cdp.evaluate("document.querySelectorAll('.real-approval-card').length");
    if (cardDopoScrivi !== cardPrimaDiScrivi) {
      p.difetto(`scrivi (nessun override per-attrezzo) ha prodotto una NUOVA card di approvazione — atteso zero, isolamento per-attrezzo rotto (era ${cardPrimaDiScrivi}, ora ${cardDopoScrivi})`, { severita: 'blocco' });
    }
    const testoChatFinale = await p.cdp.evaluate("document.querySelector('.conversation')?.textContent ?? ''");
    if (/REFUSED/.test(testoChatFinale.slice(testoChatDopoRichiesta.length))) {
      p.difetto(`scrivi è stato REFUSED senza motivo — sotto "Workspace write" senza override dovrebbe passare: ${JSON.stringify(testoChatFinale.slice(-500))}`, { severita: 'blocco' });
    } else if (testoChatFinale.includes(nomeFile)) {
      p.nota(`CONFERMATO: scrivi (nessun override) passa senza card di approvazione — isolamento per-attrezzo verificato nei due versi nella STESSA sessione. File: ${nomeFile}`);
    } else {
      p.difetto(`la chat non menziona ${nomeFile} da nessuna parte — il modello potrebbe non aver chiamato scrivi (variabilità del modello)`, { severita: 'nota' });
    }

    for (const e of p.cdp.eccezioni) p.difetto(`eccezione JS non gestita: ${e.testo} (${e.url})`, { severita: 'blocco' });
    for (const r of p.cdp.richiesteFallite) {
      if (r.url.endsWith('/favicon.ico')) continue;
      p.difetto(`richiesta HTTP fallita: ${r.status} ${r.url}`, { severita: 'blocco' });
    }
  },

  /*
   * ⭐⭐⭐ 28/8 — FASE C (sub-agenti, LEDGER-FASE-C-SUBAGENTI.md).
   * Criterio di completamento del ledger: una sessione padre delega
   * DAVVERO a una figlia isolata, la figlia scrive un file per davvero
   * nella SUA cartella (mai in quella del padre), il padre riceve il
   * riassunto, il foglio "Albero sessione" mostra la figlia vera.
   * ⛔ Richiede una SECONDA cartella isolata, già creata sul disco
   * PRIMA di questa corsa (la delega non crea cartelle da sola — vedi
   * il ledger, Rischi): `talos-prova-harness-figlio`, sorella di
   * `talos-prova-harness`.
   */
  async 'fase-c-subagenti'(p) {
    await p.attendi(1200);
    await p.screenshot('stato-iniziale', { nota: 'app appena caricata, nessuna sessione' });

    const cartellaFiglio = 'C:/Users/Antonino/Desktop/projects/talos-prova-harness-figlio';
    const nomeFile = `fase-c-figlio-${Date.now()}.txt`;
    const testoFile = 'delegato con successo';
    await p.digita(
      '#composerInput',
      `Usa l'attrezzo delega_sottotask per delegare a un sotto-agente questo compito, nella cartella isolata `
      + `\`${cartellaFiglio}\`: crea un file chiamato ${nomeFile} con dentro il testo esatto "${testoFile}". `
      + `Aspetta il riassunto del sotto-agente e riportamelo per intero. Nient'altro: non scrivere tu stesso alcun file.`,
    );
    await p.submit('#composerForm');
    p.nota('delega inviata — il padre aspetta un ciclo agentico INTERO della figlia (elenca/scrivi/prova suoi), non solo una risposta: soglia di stabilità generosa');
    // ⛔ una delega annida un secondo ciclo agentico completo dentro il primo — più lento di un turno singolo, la soglia di stabilità riflette questo (non un numero a caso, vedi la caccia al falso-positivo di FASE B più sopra in questo stesso file).
    await p.attendiTestoStabile('.conversation', { giriStabili: 6, intervalMs: 2000, timeoutMs: 150000 });
    await p.screenshot('delega-conclusa', { nota: 'il padre ha ricevuto il riassunto della figlia' });

    const testoChat = await p.cdp.evaluate("document.querySelector('.conversation')?.textContent ?? ''");
    if (/^REFUSED/.test(testoChat) || /Delega rifiutata/.test(testoChat)) {
      p.difetto(`la delega è stata rifiutata — atteso un successo su una cartella isolata valida: ${JSON.stringify(testoChat.slice(-500))}`, { severita: 'blocco' });
    } else if (/Sotto-agente:/.test(testoChat)) {
      p.nota('CONFERMATO: la chat del padre mostra il riassunto del sotto-agente (via il ToolCallResult standard, nessun evento nuovo — la semplificazione decisa nel ledger).');
    } else {
      p.difetto(`nessun segnale di delega riuscita né di rifiuto nella chat — il modello potrebbe non aver chiamato delega_sottotask (variabilità del modello): ${JSON.stringify(testoChat.slice(-500))}`, { severita: 'nota' });
    }

    /*
     * --- La prova che conta di più: il file esiste per DAVVERO, nella
     * cartella GIUSTA, mai in quella del padre. Questa funzione gira
     * in Node (non nel browser): existsSync/readFileSync diretti,
     * nessun giro per `p.cdp.evaluate` — quello serve solo per codice
     * che deve girare DENTRO la pagina.
     */
    const percorsoFiglio = `${cartellaFiglio}/${nomeFile}`;
    const percorsoNelPadre = `C:/Users/Antonino/Desktop/projects/talos-prova-harness/${nomeFile}`;
    if (!existsSync(percorsoFiglio)) {
      p.difetto(`il file NON esiste nella cartella della figlia: ${percorsoFiglio} — la delega non ha scritto per davvero, o ha scritto altrove`, { severita: 'blocco' });
    } else {
      const contenutoVero = readFileSync(percorsoFiglio, 'utf8');
      if (!contenutoVero.includes(testoFile)) {
        p.difetto(`il file della figlia esiste ma il contenuto non è quello atteso — letto: ${JSON.stringify(contenutoVero.slice(0, 200))}`, { severita: 'blocco' });
      } else {
        p.nota(`CONFERMATO: il file esiste per davvero in ${percorsoFiglio}, contenuto verificato sul disco.`);
      }
    }
    if (existsSync(percorsoNelPadre)) {
      p.difetto(`ISOLAMENTO ROTTO: il file è finito ANCHE nella cartella del padre (${percorsoNelPadre}) — la figlia non stava lavorando isolata`, { severita: 'blocco' });
    } else {
      p.nota('CONFERMATO: nessun file con questo nome nella cartella del padre — isolamento vero, non solo dichiarato.');
    }

    // --- Il foglio "Albero sessione" mostra la figlia VERA, non le due righe finte di prima ---
    await p.click('#sessionTitleButton');
    await p.attendiCondizione(
      "!document.querySelector('#subagentTreeMount')?.textContent?.includes('Carico')",
      { descrizione: 'il pannello deleghe ha finito di caricare' },
    );
    await p.screenshot('albero-sessione-con-figlia', { nota: 'deve mostrare la delega vera, non "Responsive audit"/"A11y review" (righe finte rimosse in questa fase)' });
    const testoAlbero = await p.testo('#subagentTreeMount');
    if (/Responsive audit|A11y review/.test(testoAlbero ?? '')) {
      p.difetto('il foglio Albero sessione mostra ANCORA le righe finte — non sostituite per davvero', { severita: 'blocco' });
    } else if (/Nessuna delega ancora/.test(testoAlbero ?? '')) {
      p.difetto(`il foglio dice "nessuna delega" ma la chat mostrava un riassunto — GET .../children non vede la figlia: ${JSON.stringify(testoAlbero)}`, { severita: 'blocco' });
    } else {
      p.nota(`CONFERMATO: Albero sessione mostra la delega vera: ${JSON.stringify(testoAlbero)}`);
    }
    await p.click('#closeSheet');

    for (const e of p.cdp.eccezioni) p.difetto(`eccezione JS non gestita: ${e.testo} (${e.url})`, { severita: 'blocco' });
    for (const r of p.cdp.richiesteFallite) {
      if (r.url.endsWith('/favicon.ico')) continue;
      p.difetto(`richiesta HTTP fallita: ${r.status} ${r.url}`, { severita: 'blocco' });
    }
  },
};

// --------------------------------------------------------------------
async function main() {
  const scenario = SCENARI[SCENARIO_NOME];
  if (!scenario) {
    console.error(`Scenario sconosciuto: "${SCENARIO_NOME}". Disponibili: ${Object.keys(SCENARI).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(RADICE_HARNESS_UI, '.qa-runs', `${SCENARIO_NOME}-${timestamp}`);
  mkdirSync(outDir, { recursive: true });
  const userDataDir = mkdtempSync(join(tmpdir(), 'talos-qa-chrome-'));

  console.log(`Scenario: ${SCENARIO_NOME}`);
  console.log(`URL: ${URL_BASE}`);
  console.log(`Output: ${outDir}`);

  const chromeProc = lanciaChrome({ porta: PORTA_CDP, userDataDir, url: URL_BASE });
  try {
    const wsUrl = await attendiCdp(PORTA_CDP);
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new ClientCdp(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const pipeline = new Pipeline({ outDir, cdp });
    await scenario(pipeline);

    const reportPath = pipeline.salvaReport();
    console.log('');
    console.log(`Report: ${reportPath}`);
    console.log(`Screenshot: ${pipeline.report.filter((r) => r.file).length}`);
    console.log(`Righe console: ${cdp.logConsole.length}, eccezioni JS: ${cdp.eccezioni.length}, richieste HTTP fallite: ${cdp.richiesteFallite.length}`);
    if (cdp.eccezioni.length > 0) {
      console.log('⛔ ECCEZIONI JS CATTURATE:');
      for (const e of cdp.eccezioni) console.log(`  - ${e.testo} (${e.url})`);
    }
    if (cdp.richiesteFallite.length > 0) {
      console.log('⛔ RICHIESTE HTTP FALLITE:');
      for (const r of cdp.richiesteFallite) console.log(`  - ${r.status} ${r.url}`);
    }

    ws.close();
  } finally {
    chiudiChromeAlbero(chromeProc.pid);
  }
}

main().catch((error) => {
  console.error('Pipeline fallita:', error);
  process.exitCode = 1;
});
