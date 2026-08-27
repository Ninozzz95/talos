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
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

    await p.digita('#customTaskConsegna', 'Add and export a function `sottrai(a, b)` in src/matematica.mjs that returns a - b. Add a test for it in test/matematica.test.mjs, following the style of the existing somma test.');
    await p.screenshot('compito-scritto', { nota: 'prima dell\'invio' });

    await p.submit('#customTaskForm');
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
