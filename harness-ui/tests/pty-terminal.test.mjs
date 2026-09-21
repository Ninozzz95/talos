import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ambienteDelTerminale,
  BACKLOG_MASSIMO_BYTE,
  codificaFrame,
  creaRegistroTerminali,
  decodificaFrame,
  MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA,
  sceltaShell,
  TIPO_FRAME_CONTROLLO,
  TIPO_FRAME_DATI,
  VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE,
  VARIABILI_SOLO_DEL_SERVER,
} from '../src/pty-terminal.mjs';

/**
 * ⭐ Stesso principio del resto della suite: mai una PTY VERA nei test
 * unitari (costerebbe un processo di sistema, non deterministico) — una
 * finta iniettabile che implementa esattamente la superficie di `IPty`
 * usata da questo modulo (`onData`/`onExit`/`write`/`resize`/`kill`),
 * verificata contro `node_modules/node-pty/typings/node-pty.d.ts` prima
 * di scrivere `pty-terminal.mjs`.
 */
function ptyFinta() {
  const ascoltatoriDati = [];
  const ascoltatoriUscita = [];
  const finta = {
    scritture: [],
    resizeChiamate: [],
    uccisa: false,
    onData(cb) { ascoltatoriDati.push(cb); return { dispose() {} }; },
    onExit(cb) { ascoltatoriUscita.push(cb); return { dispose() {} }; },
    write(dati) { finta.scritture.push(dati); },
    resize(cols, rows) { finta.resizeChiamate.push({ cols, rows }); },
    kill() { finta.uccisa = true; },
    _emettiDati(dati) { for (const cb of ascoltatoriDati) cb(dati); },
    _emettiUscita(exitCode, signal) { for (const cb of ascoltatoriUscita) cb({ exitCode, signal }); },
  };
  return finta;
}

function registroPerTest(overrides = {}) {
  const ptyCreate = [];
  const spawnPtyFn = overrides.spawnPtyFn ?? ((comando, argomenti, opzioni) => {
    const p = ptyFinta();
    ptyCreate.push({ comando, argomenti, opzioni, p });
    return p;
  });
  let ora = overrides.oraIniziale ?? 0;
  const clock = overrides.clock ?? (() => ora);
  const avanza = (ms) => { ora += ms; };
  const registro = creaRegistroTerminali({
    spawnPtyFn,
    sceltaShellFn: overrides.sceltaShellFn ?? (() => ({ comando: 'shell-finta', argomenti: ['-i'], enforcement: 'test' })),
    clock,
  });
  return { registro, ptyCreate, avanza };
}

test('⭐⭐⭐ apri: spawna con cwd/cols/rows richiesti, usando la shell scelta da sceltaShellFn', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/progetto', cols: 100, rows: 30 });
  assert.equal(ptyCreate.length, 1);
  assert.equal(ptyCreate[0].comando, 'shell-finta');
  assert.deepEqual(ptyCreate[0].argomenti, ['-i']);
  assert.equal(ptyCreate[0].opzioni.cwd, 'C:/progetto');
  assert.equal(ptyCreate[0].opzioni.cols, 100);
  assert.equal(ptyCreate[0].opzioni.rows, 30);
});

test('⭐⭐⭐ apri due volte sullo STESSO id vivo: riaggancia, non spawna una seconda PTY', () => {
  const { registro, ptyCreate } = registroPerTest();
  const prima = registro.apri({ id: 'a', cartella: 'C:/x' });
  const seconda = registro.apri({ id: 'a', cartella: 'C:/x' });
  assert.equal(ptyCreate.length, 1, 'una sola spawn per lo stesso id ancora vivo');
  assert.equal(prima, seconda);
});

test('⭐⭐ i dati emessi dalla PTY arrivano a ogni ascoltatore registrato', () => {
  const { registro, ptyCreate } = registroPerTest();
  const voce = registro.apri({ id: 'a', cartella: 'C:/x' });
  const ricevuti = [];
  voce.ascoltatori.add((evento) => ricevuti.push(evento));
  ptyCreate[0].p._emettiDati('ciao');
  assert.deepEqual(ricevuti, [{ tipo: 'dati', dati: 'ciao' }]);
});

test('⭐⭐ il backlog resta sotto BACKLOG_MASSIMO_BYTE, scartando i pezzi più vecchi', () => {
  const { registro, ptyCreate } = registroPerTest();
  const voce = registro.apri({ id: 'a', cartella: 'C:/x' });
  const pezzo = 'x'.repeat(1000);
  const numeroPezzi = Math.ceil(BACKLOG_MASSIMO_BYTE / 1000) + 20;
  for (let i = 0; i < numeroPezzi; i += 1) ptyCreate[0].p._emettiDati(pezzo);
  assert.ok(voce.byteBacklog <= BACKLOG_MASSIMO_BYTE, `byteBacklog=${voce.byteBacklog} deve restare sotto il tetto`);
  assert.ok(voce.backlog.length < numeroPezzi, 'i pezzi più vecchi devono essere stati scartati');
});

test('⭐ scrivi/ridimensiona instradano alla PTY giusta', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  registro.scrivi('a', 'echo ciao\r');
  registro.ridimensiona('a', 120, 40);
  assert.deepEqual(ptyCreate[0].p.scritture, ['echo ciao\r']);
  assert.deepEqual(ptyCreate[0].p.resizeChiamate, [{ cols: 120, rows: 40 }]);
});

test('⛔⛔ AL CONTRARIO — ridimensiona con cols/rows non positivi non tocca la PTY', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  registro.ridimensiona('a', 0, 40);
  registro.ridimensiona('a', 10, -1);
  assert.deepEqual(ptyCreate[0].p.resizeChiamate, []);
});

test('⛔ scrivi/ridimensiona su un id ignoto non lanciano (mai un crash su un client tardivo)', () => {
  const { registro } = registroPerTest();
  assert.doesNotThrow(() => { registro.scrivi('fantasma', 'x'); registro.ridimensiona('fantasma', 1, 1); });
});

test('⭐⭐⭐ reap chiude solo le PTY disconnesse da PIÙ di MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  registro.apri({ id: 'vecchia', cartella: 'C:/x' });
  registro.apri({ id: 'recente', cartella: 'C:/x' });
  registro.segnaDisconnesso('vecchia');
  avanza((MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000) - 1);
  registro.segnaDisconnesso('recente'); // disconnessa proprio ora, all'ultimo istante disponibile
  avanza(2); // 'vecchia' ora supera il tetto, 'recente' no
  registro.reap();
  assert.equal(ptyCreate[0].p.uccisa, true, 'la PTY vecchia va chiusa');
  assert.equal(ptyCreate[1].p.uccisa, false, 'la PTY recente resta viva');
  assert.equal(registro._terminali.has('vecchia'), false);
  assert.equal(registro._terminali.has('recente'), true);
});

test('⛔⛔⛔ AL CONTRARIO — reap non chiude MAI una PTY ancora connessa, anche con l\'orologio molto avanti', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  registro.apri({ id: 'attaccata', cartella: 'C:/x' });
  avanza(MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000 * 100);
  registro.reap();
  assert.equal(ptyCreate[0].p.uccisa, false);
  assert.equal(registro._terminali.has('attaccata'), true);
});

test('⭐ chiudiForzato uccide e rimuove subito, a prescindere dal tempo', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  registro.chiudiForzato('a');
  assert.equal(ptyCreate[0].p.uccisa, true);
  assert.equal(registro._terminali.has('a'), false);
});

test('⭐⭐ apri dopo una uscita reale (handle.onExit) NON riaggancia una PTY morta: ne spawna una nuova', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  ptyCreate[0].p._emettiUscita(0, undefined);
  registro.apri({ id: 'a', cartella: 'C:/x' });
  assert.equal(ptyCreate.length, 2, 'una PTY uscita non è viva: una riapertura ne crea una nuova');
});

test('⭐⭐⭐ sceltaShell — win32 con Git Bash presente: enforcement git-bash, comando esatto', () => {
  const scelta = sceltaShell({
    platform: 'win32',
    existsFn: (percorso) => percorso === 'C:\\Program Files\\Git\\bin\\bash.exe',
    percorsiGitBash: ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'],
  });
  assert.deepEqual(scelta, { comando: 'C:\\Program Files\\Git\\bin\\bash.exe', argomenti: ['--login', '-i'], enforcement: 'git-bash' });
});

test('⛔⛔ AL CONTRARIO — sceltaShell su win32 senza Git Bash: fallback DICHIARATO, mai spacciato per bash', () => {
  const scelta = sceltaShell({ platform: 'win32', existsFn: () => false, percorsiGitBash: ['C:\\nope\\bash.exe'] });
  assert.equal(scelta.enforcement, 'cmd-fallback');
  assert.equal(scelta.comando, 'cmd.exe');
});

test('⭐ sceltaShell — POSIX usa $SHELL quando presente, altrimenti /bin/bash', () => {
  assert.equal(sceltaShell({ platform: 'linux', env: { SHELL: '/usr/bin/zsh' } }).comando, '/usr/bin/zsh');
  assert.equal(sceltaShell({ platform: 'linux', env: {} }).comando, '/bin/bash');
});

test('⭐⭐⭐ codificaFrame/decodificaFrame: round-trip per entrambi i tipi', () => {
  const frameDati = codificaFrame(TIPO_FRAME_DATI, 'echo ciao\r');
  const decDati = decodificaFrame(frameDati);
  assert.equal(decDati.tipo, TIPO_FRAME_DATI);
  assert.equal(decDati.payload.toString('utf8'), 'echo ciao\r');

  const frameCtrl = codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ tipo: 'resize', cols: 80, rows: 24 }));
  const decCtrl = decodificaFrame(frameCtrl);
  assert.equal(decCtrl.tipo, TIPO_FRAME_CONTROLLO);
  assert.deepEqual(JSON.parse(decCtrl.payload.toString('utf8')), { tipo: 'resize', cols: 80, rows: 24 });
});

test('⛔⛔⛔ AL CONTRARIO — decodificaFrame su input vuoto o tipo ignoto torna null, mai un crash', () => {
  assert.equal(decodificaFrame(Buffer.alloc(0)), null);
  assert.equal(decodificaFrame(Buffer.from([99, 1, 2, 3])), null);
});

/*
 * ⛔⛔⛔ CLI-REQ-04 (17/09/2026) — IL TERMINALE NON EREDITA I SEGRETI DEL SERVER.
 *
 * Fino a oggi `apri` passava `env: process.env`, cioè l'ambiente INTERO del server: dentro ci
 * sono il token di loopback che protegge tutta la nostra API, la chiave privata delle ricevute e
 * la chiave della fonte di ricerca web. Un `npm install` con i suoi script di installazione,
 * lanciato dalla persona in questa scheda, poteva leggerli.
 *
 * ⛔ Il verso opposto conta quanto questo, ed è il motivo per cui l'elenco è CHIUSO e non a forma:
 * il terminale è della PERSONA («un terminale vero e proprio [...] che non ha limiti», intestazione
 * di `pty-terminal.mjs`). `GH_TOKEN`, `NPM_TOKEN`, `PATH`, `HOME` sono suoi e devono restare — un
 * filtro «tutto ciò che sembra una credenziale» farebbe fallire `gh` e `npm publish` dentro TALOS
 * e funzionare nella Git Bash della stessa macchina.
 *
 * ⛔⛔ SECONDO GIRO (B4): i nomi sono scritti QUI PER ESTESO, non presi iterando l'elenco del
 * prodotto. La versione precedente scorreva `VARIABILI_SOLO_DEL_SERVER` nei due versi, quindi con
 * un elenco VUOTO non asseriva niente e passava per costruzione — una misura che non può
 * smentirti non sta misurando. Adesso togliere un nome dal prodotto fa diventare rossa questa
 * riga, ed è quello che deve succedere.
 */
const SEGRETI_DEL_SERVER_ATTESI = [
  'TALOS_HARNESS_UI_TOKEN',
  'TALOS_HARNESS_RECEIPT_KEY_ID',
  'TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64',
  'TALOS_HARNESS_SEARCH_API_KEY',
  'ELECTRON_RUN_AS_NODE',
];

test('⛔⛔⛔ CLI-REQ-04 — il terminale NON eredita i segreti del server, asseriti UNO PER UNO per nome', () => {
  // ⛔ Valori FINTI: un segreto vero non entra mai in una prova né in un log.
  const finti = {
    TALOS_HARNESS_UI_TOKEN: 'a'.repeat(64),
    TALOS_HARNESS_RECEIPT_KEY_ID: 'chiave-finta-di-prova',
    TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64: 'b'.repeat(64),
    TALOS_HARNESS_SEARCH_API_KEY: 'tvly-' + 'd'.repeat(32),
    ELECTRON_RUN_AS_NODE: '1',
    GH_TOKEN: 'ghp_' + 'c'.repeat(36),
    HOME: '/casa/di-prova',
  };
  const precedenti = Object.fromEntries(Object.keys(finti).map((k) => [k, process.env[k]]));
  Object.assign(process.env, finti);
  try {
    const { registro, ptyCreate } = registroPerTest();
    registro.apri({ id: 'a', cartella: 'C:/x' });
    const ambiente = ptyCreate[0].opzioni.env;

    // Uno per uno, scritti a mano: nessuna iterazione su una lista che potrebbe essere vuota.
    assert.equal(ambiente.TALOS_HARNESS_UI_TOKEN, undefined, 'il token di loopback non deve arrivare alla shell');
    assert.equal(ambiente.TALOS_HARNESS_RECEIPT_KEY_ID, undefined, 'l\'id della chiave ricevute nemmeno');
    assert.equal(ambiente.TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64, undefined, 'la chiave privata delle ricevute nemmeno');
    assert.equal(ambiente.TALOS_HARNESS_SEARCH_API_KEY, undefined, 'la chiave della ricerca web nemmeno');
    assert.equal(ambiente.ELECTRON_RUN_AS_NODE, undefined, 'e nemmeno il commutatore che fa partire Electron come Node');

    // ⛔ «Zero» confermato al contrario: quelle variabili ci sono DAVVERO nell'ambiente del server.
    for (const nome of SEGRETI_DEL_SERVER_ATTESI) {
      assert.equal(process.env[nome], finti[nome], `${nome} doveva essere addosso al processo, o la prova sopra è vuota`);
    }

    // La metà «senza limiti»: la roba della persona resta, per nome.
    assert.equal(ambiente.GH_TOKEN, finti.GH_TOKEN);
    assert.equal(ambiente.HOME, finti.HOME);
    const percorso = ambiente.PATH ?? ambiente.Path;
    assert.ok(typeof percorso === 'string' && percorso.length > 0, 'PATH/Path deve arrivare alla shell');
  } finally {
    for (const [k, v] of Object.entries(precedenti)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('⛔⛔ CLI-REQ-04 — l\'elenco del prodotto contiene esattamente i nomi decisi, né uno in più né uno in meno', () => {
  /*
   * ⛔ Il confronto è sugli INSIEMI: un nome tolto dal prodotto e uno aggiunto senza decisione
   * fanno rossa questa riga allo stesso modo. È il contrappeso alla prova qui sopra, che guarda
   * il comportamento; questa guarda la DICHIARAZIONE.
   */
  assert.deepEqual([...VARIABILI_SOLO_DEL_SERVER].sort(), [...SEGRETI_DEL_SERVER_ATTESI].sort());
});

test('⛔⛔ CLI-REQ-04 — la riconnessione resta invariata: un secondo apri sullo stesso id vivo non rispawna', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  registro.apri({ id: 'a', cartella: 'C:/x' });
  assert.equal(ptyCreate.length, 1);
});

test('⛔ CLI-REQ-04 AL CONTRARIO — ambienteDelTerminale lascia passare tutto il resto e scarta gli undefined', () => {
  const dentro = ambienteDelTerminale({
    TALOS_HARNESS_UI_TOKEN: 'a'.repeat(64),
    MIA_VARIABILE: 'resta',
    SENZA_VALORE: undefined,
  });
  assert.deepEqual(dentro, { MIA_VARIABILE: 'resta' });
});

/*
 * ⛔⛔⛔ CLI-REQ-04, punto (a) — L'ELENCO NON DEVE INVECCHIARE IN SILENZIO.
 *
 * Un elenco chiuso è giusto oggi e sbagliato il giorno in cui qualcuno mette nell'ambiente del
 * figlio una variabile nuova: nessuno se ne accorgerebbe, perché il risultato sbagliato (una
 * variabile che passa) ha lo stesso aspetto di quello giusto.
 *
 * ⛔⛔ SECONDO GIRO (B4) — LA GUARDIA SI AGGIRAVA, E ADESSO FALLISCE CHIUSA. La prima versione
 * cercava `ambiente.NOME =` e le chiavi dentro `Object.assign(ambiente, { ... })`: bastava
 * scrivere `ambiente['X'] = …`, uno spread `...altro`, un secondo `Object.assign` o un nome
 * minuscolo per passarle davanti senza che protestasse. Una guardia che non sa leggere una forma
 * deve NEGARE, non tacere (è la lezione «una guardia che esplode è assente», al contrario).
 * ⇒ Adesso ogni occorrenza della parola `ambiente` nel corpo di `creaAvvioFiglio` va classificata:
 * se non è una delle forme che questa prova sa leggere, la prova è ROSSA e stampa il testo che
 * non ha saputo leggere.
 */
function corpoDiCreaAvvioFiglio(sorgente) {
  const inizio = sorgente.indexOf('export function creaAvvioFiglio');
  assert.notEqual(inizio, -1, 'creaAvvioFiglio non trovata in runtime.mjs: il filtro è rotto');
  const fine = sorgente.indexOf('\n}', inizio);
  assert.notEqual(fine, -1, 'fine di creaAvvioFiglio non trovata');
  return sorgente.slice(inizio, fine);
}

/** Le forme note, in ordine: ognuna consuma il testo che ha letto, e ciò che avanza è un rifiuto. */
function nomiMessiNellAmbiente(corpo) {
  const nomi = new Set();
  let resto = corpo;
  const consuma = (regexp, raccogli) => {
    resto = resto.replace(regexp, (...args) => { raccogli?.(...args); return ' \u0000 '; });
  };
  // 1 · `Object.assign(ambiente, { CHIAVE: ..., ... })` — un oggetto letterale, senza spread.
  consuma(/Object\.assign\(ambiente,\s*\{([^{}]*)\}\s*\)/g, (_tutto, dentro) => {
    assert.ok(!dentro.includes('...'), `spread dentro Object.assign(ambiente, …): la guardia non sa leggerlo → ${dentro.trim()}`);
    for (const m of dentro.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)) nomi.add(m[1]);
  });
  // 2 · `ambiente.NOME = ...` e `delete ambiente.NOME` (il delete non AGGIUNGE, ma è una forma nota).
  consuma(/delete\s+ambiente\.([A-Za-z_$][\w$]*)/g);
  consuma(/\bambiente\.([A-Za-z_$][\w$]*)\s*=/g, (_tutto, nome) => nomi.add(nome));
  // 3 · Letture innocue: la dichiarazione e il passaggio a `spawn`.
  consuma(/const\s+ambiente\s*=/g);
  consuma(/env:\s*ambiente\b/g);
  // 18/09/2026 — la LETTURA in una condizione, `if (!ambiente.NOME?.trim())`, entrata col lavoro di rilascio («se nessuno ha
  //   scelto il kernel, usa l'hotfix»). Legge e basta: la scrittura che la segue è la forma 2, e il suo nome è già contato lì.
  consuma(/!\s*ambiente\.[A-Za-z_$][\w$]*\?\.trim\(\)/g);
  // ⛔ Tutto ciò che nomina ancora `ambiente` è una forma che questa guardia NON sa leggere.
  const avanzi = [...resto.matchAll(/.{0,60}\bambiente\b.{0,60}/g)].map((m) => m[0].trim());
  assert.deepEqual(avanzi, [], `forme di scrittura su \`ambiente\` che la guardia non sa leggere:\n  ${avanzi.join('\n  ')}`);
  return nomi;
}

test('⛔⛔⛔ CLI-REQ-04 (a) — ogni variabile che runtime.mjs mette nel figlio è tolta o dichiarata innocua per nome', () => {
  const sorgente = readFileSync(new URL('../desktop/runtime.mjs', import.meta.url), 'utf8');
  const nomi = nomiMessiNellAmbiente(corpoDiCreaAvvioFiglio(sorgente));

  /*
   * ⛔ Il filtro che produce `nomi` può rompersi e restituire un insieme VUOTO: allora ogni
   * asserzione sotto passerebbe per costruzione. Si conferma al contrario, pretendendo di
   * ritrovare la variabile che questa richiesta esiste per togliere.
   */
  assert.ok(nomi.size >= 9, `estratti solo ${nomi.size} nomi da runtime.mjs: il filtro è rotto`);
  assert.ok(nomi.has('TALOS_HARNESS_UI_TOKEN'), 'il token deve comparire fra i nomi estratti');

  const tolte = new Set(VARIABILI_SOLO_DEL_SERVER.map((n) => n.toUpperCase()));
  const innocue = new Set(VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE.map((n) => n.toUpperCase()));
  const nonDecise = [...nomi].filter((n) => !tolte.has(n.toUpperCase()) && !innocue.has(n.toUpperCase()));
  assert.deepEqual(nonDecise, [], `variabili nuove in runtime.mjs senza una decisione: ${nonDecise.join(', ')}`);
});

test('⛔⛔ CLI-REQ-04 (a) AL CONTRARIO — la guardia RIFIUTA le forme che non sa leggere', () => {
  /*
   * ⛔ Provata nel verso che deve fallire, su quattro forme vere. Senza questa prova la guardia
   * sarebbe «verde perché non ha guardato», che è esattamente il difetto che deve impedire.
   */
  const testa = 'export function creaAvvioFiglio({ env = process.env }) {\n  const ambiente = { ...env };\n';
  const coda = '\n  return { options: { env: ambiente } };\n}\n';
  const forme = [
    ["  ambiente['TALOS_NUOVA'] = 'x';", /non sa leggere/],
    ['  Object.assign(ambiente, { ...altroOggetto });', /spread/],
    ['  Object.assign(ambiente, altroOggetto);', /non sa leggere/],
    ['  const secondo = ambiente;', /non sa leggere/],
  ];
  for (const [riga, atteso] of forme) {
    assert.throws(
      () => nomiMessiNellAmbiente(corpoDiCreaAvvioFiglio(testa + riga + coda)),
      atteso,
      `la guardia deve RIFIUTARE questa forma: ${riga.trim()}`,
    );
  }
  // E nel verso giusto la stessa guardia legge senza protestare.
  const sana = testa + "  ambiente.TALOS_UNA = 'x';\n  Object.assign(ambiente, { TALOS_DUE: 'y' });" + coda;
  assert.deepEqual([...nomiMessiNellAmbiente(corpoDiCreaAvvioFiglio(sana))].sort(), ['TALOS_DUE', 'TALOS_UNA']);
});

/*
 * ⛔⛔⛔ CLI-REQ-04, B3 del secondo giro — E I SEGRETI CHE IL SERVER LEGGE DA `config.mjs`.
 *
 * `runtime.mjs` dice cosa il desktop METTE nell'ambiente del figlio, ma non tutto ciò che è nostro
 * passa di lì: `config.mjs` legge variabili `TALOS_*` che possono arrivare dall'ambiente della
 * macchina. `TALOS_HARNESS_SEARCH_API_KEY` (`config.mjs:685`) è il caso che il primo giro non
 * aveva deciso per nome: è la chiave della fonte di ricerca web, sta nel NOSTRO spazio di nomi,
 * e quindi va tolta — criterio dell'owner, «si toglie ciò che esiste perché TALOS lo usa, non le
 * credenziali della persona».
 *
 * ⛔ La forma di credenziale qui è deliberatamente PIÙ LARGA di `eUnaCredenziale()` del kernel, e
 * la differenza è essa stessa una misura: `eUnaCredenziale('TALOS_HARNESS_RECEIPT_KEY_ID')` è
 * `false` (misurato il 17/09/2026) perché la sua regexp ha `_KEY$` e `^KEY_` ma non `_KEY_`.
 * Usare la regexp del kernel qui vorrebbe dire non accorgersi proprio del nome che conta.
 */
const FORMA_DI_SEGRETO = /TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE|AUTH|_KEY_|_KEY$|API_KEY/;

test('⛔⛔⛔ CLI-REQ-04 (B-1) — OGNI segreto letto da config.mjs è deciso per nome, anche quelli NON `TALOS_*`', () => {
  /*
   * ⛔ Il primo giro guardava solo i nomi `TALOS_*`, e `OPENROUTER_API_KEY`/`HF_TOKEN` passavano
   *   senza che nessuno avesse deciso niente. Passare per distrazione e passare per decisione si
   *   somigliano: è esattamente la cosa che questa guardia esiste per separare.
   * ⇒ Adesso legge TUTTI i nomi con forma di credenziale che `config.mjs` prende dall'ambiente, e
   *   pretende che ognuno stia in uno dei due elenchi — tolto, oppure lasciato APPOSTA.
   */
  const sorgente = readFileSync(new URL('../src/config.mjs', import.meta.url), 'utf8');
  const tutti = new Set([...sorgente.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
  assert.ok(tutti.size >= 20, `estratti solo ${tutti.size} nomi da config.mjs: il filtro è rotto`);

  const segreti = [...tutti].filter((n) => FORMA_DI_SEGRETO.test(n)).sort();
  /*
   * ⛔ «Zero» si conferma al contrario: si pretende di ritrovare per nome i sei che oggi sappiamo
   *   esserci — i quattro nostri e i due della persona. Se il filtro si rompesse, questa riga lo
   *   direbbe invece di lasciar passare una lista vuota.
   */
  assert.deepEqual(segreti, [
    'HF_TOKEN',
    'OPENROUTER_API_KEY',
    'TALOS_HARNESS_RECEIPT_KEY_ID',
    'TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64',
    'TALOS_HARNESS_SEARCH_API_KEY',
    'TALOS_HARNESS_UI_TOKEN',
  ]);

  const decisi = new Set([...VARIABILI_SOLO_DEL_SERVER, ...VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE]
    .map((n) => n.toUpperCase()));
  const indecisi = segreti.filter((n) => !decisi.has(n.toUpperCase()));
  assert.deepEqual(indecisi, [], `segreti letti da config.mjs e mai decisi: ${indecisi.join(', ')}`);

  // ⛔ E la decisione è quella dell'owner, non una a caso: le due della PERSONA restano.
  assert.ok(VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE.includes('OPENROUTER_API_KEY'));
  assert.ok(VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE.includes('HF_TOKEN'));
  const ambiente = ambienteDelTerminale({ OPENROUTER_API_KEY: 'sk-finta', HF_TOKEN: 'hf_finta', TALOS_HARNESS_UI_TOKEN: 'a'.repeat(64) });
  assert.deepEqual(ambiente, { OPENROUTER_API_KEY: 'sk-finta', HF_TOKEN: 'hf_finta' });
});

test('⛔⛔ CLI-REQ-04 — il confronto dei nomi è SENZA maiuscole, e romperlo deve farsi sentire', () => {
  /*
   * ⛔ Su Windows i nomi delle variabili d'ambiente non distinguono maiuscole e minuscole, e
   *   `runtime.mjs:47` filtra già i suoi con una regexp `/i`. Il confronto qui lo faceva anche
   *   prima, ma NESSUNA prova lo copriva: toglierlo non faceva cadere niente — cioè era una cura
   *   senza cancello.
   */
  const dentro = ambienteDelTerminale({
    talos_harness_ui_token: 'a'.repeat(64),
    Talos_Harness_Receipt_Key_Id: 'finta',
    electron_run_as_node: '1',
    MIA: 'resta',
  });
  assert.deepEqual(dentro, { MIA: 'resta' }, 'gli stessi nomi in minuscolo devono essere tolti uguale');
});

/*
 * ⭐⭐⭐ W1-01 (05/9) — IL CRITERIO DELLA RIGA. Fino al 04/9 l'id della PTY *era*
 * il sessionId, quindi «due schede nella stessa sessione» non era nemmeno
 * esprimibile. Questi test provano la cosa che la riga chiede: due schede della
 * STESSA sessione sono due PTY separate, con I/O e backlog separati.
 */

test('⭐⭐⭐ DUE SCHEDE della stessa sessione NON condividono I/O: scrivo in una, l\'altra non vede niente', () => {
  const { registro, ptyCreate } = registroPerTest();
  const a = registro.apri({ id: 'sess-1', cartella: 'C:/lavoro' });        // prima scheda (id === sessionId)
  const b = registro.apri({ id: 'term-2', cartella: 'C:/lavoro' });        // seconda scheda della stessa sessione
  assert.equal(ptyCreate.length, 2, 'due schede = due PTY vere, mai una condivisa');

  const vistiDaA = [];
  const vistiDaB = [];
  a.ascoltatori.add((evento) => vistiDaA.push(evento));
  b.ascoltatori.add((evento) => vistiDaB.push(evento));

  registro.scrivi('term-2', 'echo solo-per-b\r');
  assert.deepEqual(ptyCreate[0].p.scritture, [], 'la tastiera della scheda B non deve MAI finire nella shell della scheda A');
  assert.deepEqual(ptyCreate[1].p.scritture, ['echo solo-per-b\r']);

  ptyCreate[1].p._emettiDati('output di b');
  assert.deepEqual(vistiDaA, [], 'l\'output di B non arriva agli ascoltatori di A');
  assert.deepEqual(vistiDaB, [{ tipo: 'dati', dati: 'output di b' }]);
  assert.deepEqual(a.backlog, [], 'e nemmeno nel backlog di A: un F5 su A non deve rigiocare l\'output di B');
  assert.deepEqual(b.backlog, ['output di b']);
});

test('⭐⭐⭐ il tetto del backlog è PER SCHEDA, non globale: riempire una non svuota l\'altra', () => {
  const { registro, ptyCreate } = registroPerTest();
  const a = registro.apri({ id: 'scheda-a', cartella: 'C:/x' });
  const b = registro.apri({ id: 'scheda-b', cartella: 'C:/x' });
  b._notaDiProva = true;
  ptyCreate[1].p._emettiDati('riga preziosa di B');

  const pezzo = 'x'.repeat(1000);
  for (let i = 0; i < Math.ceil(BACKLOG_MASSIMO_BYTE / 1000) + 20; i += 1) ptyCreate[0].p._emettiDati(pezzo);

  assert.ok(a.byteBacklog <= BACKLOG_MASSIMO_BYTE, `A resta sotto il suo tetto (${a.byteBacklog})`);
  assert.deepEqual(b.backlog, ['riga preziosa di B'], 'il traffico di A non deve sfrattare il backlog di B — il tetto è di 200.000 byte CIASCUNA');
  assert.equal(b.byteBacklog, Buffer.byteLength('riga preziosa di B', 'utf8'));
});

test('⛔⛔⛔ AL CONTRARIO — chiudere UNA scheda non tocca le altre della stessa sessione', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'sess-1', cartella: 'C:/x' });
  registro.apri({ id: 'term-2', cartella: 'C:/x' });
  registro.chiudiForzato('term-2');
  assert.equal(ptyCreate[1].p.uccisa, true);
  assert.equal(ptyCreate[0].p.uccisa, false, 'la scheda che nessuno ha chiuso resta viva');
  assert.equal(registro._terminali.has('sess-1'), true);
  assert.equal(registro._terminali.has('term-2'), false);
});

test('⭐⭐⭐ il reaper delle PTY orfane continua a valere PER OGNI scheda, non solo per la prima', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  registro.apri({ id: 'sess-1', cartella: 'C:/x' });
  registro.apri({ id: 'term-2', cartella: 'C:/x' });
  registro.apri({ id: 'term-3', cartella: 'C:/x' });
  registro.segnaDisconnesso('term-2');
  registro.segnaDisconnesso('term-3');
  avanza(MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000 + 1);
  registro.reap();
  assert.equal(ptyCreate[0].p.uccisa, false, 'sess-1 è ancora attaccata: non si tocca');
  assert.equal(ptyCreate[1].p.uccisa, true);
  assert.equal(ptyCreate[2].p.uccisa, true, 'la terza scheda non deve sfuggire al reaper solo perché è la terza');
  assert.deepEqual([...registro._terminali.keys()], ['sess-1']);
});

test('⭐⭐⭐ SHUTDOWN — chiudere tutte le schede fotografando le chiavi (come fa server.mjs) non ne lascia nemmeno una viva', () => {
  const { registro, ptyCreate } = registroPerTest();
  for (const id of ['sess-1', 'term-2', 'term-3', 'term-4']) registro.apri({ id, cartella: 'C:/x' });
  /* ⛔ Esattamente la riga di server.mjs: le chiavi si fotografano PRIMA, perché chiudiForzato cancella dalla stessa Map. */
  for (const id of [...registro._terminali.keys()]) registro.chiudiForzato(id);
  assert.equal(registro._terminali.size, 0, 'zero PTY superstiti allo shutdown');
  assert.deepEqual(ptyCreate.map((c) => c.p.uccisa), [true, true, true, true]);
});

test('⭐⭐ stato(): tre fatti distinti — viva, uscita, inesistente', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'viva', cartella: 'C:/x' });
  registro.apri({ id: 'morta', cartella: 'C:/x' });
  ptyCreate[1].p._emettiUscita(0, undefined);
  assert.equal(registro.stato('viva').viva, true);
  assert.equal(registro.stato('morta').viva, false);
  assert.equal(registro.stato('mai-esistita'), null, '⛔ null non è {viva:false}: "non c\'è" e "è uscita" sono due fatti diversi');
});

/*
 * ⭐⭐⭐ Il segnale «ripreso» — la misura che l'interfaccia non poteva fare.
 *
 * ⛔ Il ponte rigioca il backlog sia quando riaggancia una PTY viva sia quando
 * il reaper l'ha chiusa e ne nasce una nuova. Una PTY appena creata ha backlog
 * vuoto, che è anche l'aspetto di una shell viva che non ha ancora stampato
 * niente: dedurre la ripresa dall'assenza di backlog è un indovinello. Qui la
 * risposta viene dal registro, che è l'unico che la sa.
 */
test('⭐⭐⭐ apriDichiarando: la PRIMA apertura in assoluto NON è una ripresa', () => {
  const { registro } = registroPerTest();
  const esito = registro.apriDichiarando({ id: 'a', cartella: 'C:/progetto' });
  assert.equal(esito.ripresa, false, 'la prima volta la shell è nuova per definizione');
  assert.equal(esito.voce.id, 'a');
});

test('⭐⭐⭐ apriDichiarando: riagganciare una PTY VIVA è una ripresa, e non spawna', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/progetto' });
  const esito = registro.apriDichiarando({ id: 'a', cartella: 'C:/progetto' });
  assert.equal(esito.ripresa, true);
  assert.equal(ptyCreate.length, 1, 'nessuna seconda PTY');
});

test('⭐⭐⭐ AL CONTRARIO — dopo che il reaper ha chiuso la shell, riaprire NON è una ripresa', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/progetto' });
  registro.segnaDisconnesso('a');
  // Oltre la finestra di grazia: il reaper chiude la PTY orfana.
  avanza(1000 * 60 * 60);
  registro.reap();
  const esito = registro.apriDichiarando({ id: 'a', cartella: 'C:/progetto' });
  // ⛔ È il caso che conta: da fuori sembra identico a una riconnessione
  // riuscita, e invece la shell della persona non c'è più.
  assert.equal(esito.ripresa, false);
  assert.equal(ptyCreate.length, 2, 'una PTY NUOVA è nata');
});

test('⭐⭐ apriDichiarando dà la STESSA voce di apri: una sola verità, non due', () => {
  const { registro } = registroPerTest();
  const voce = registro.apri({ id: 'a', cartella: 'C:/progetto' });
  assert.equal(registro.apriDichiarando({ id: 'a', cartella: 'C:/progetto' }).voce, voce);
});

/*
 * ⛔⛔⛔ 14/09 — F04 e F05 della review, riprodotti PRIMA di curarli. Sono due promesse che questo file scrive nella
 *   propria documentazione e che il codice non manteneva:
 *   F04 «200.000 byte per scheda, dichiarato, non infinito» — il vecchio ciclo si fermava a `backlog.length > 1`,
 *       quindi UN solo `cat` di un file grosso restava in memoria intero.
 *   F05 «mai quelle ancora attaccate a un client» — il timbro si metteva a ogni scheda che si staccava, anche con
 *       un'altra finestra ancora agganciata, e dieci minuti dopo il reaper uccideva una shell viva.
 */

test('⛔⛔⛔ F04 — un SOLO pezzo più grande del tetto viene TAGLIATO, e si tiene la CODA', () => {
  const { registro, ptyCreate } = registroPerTest();
  const voce = registro.apri({ id: 't1', cartella: '/tmp' });
  const visti = [];
  voce.ascoltatori.add((evento) => visti.push(evento));

  const enorme = 'a'.repeat(BACKLOG_MASSIMO_BYTE * 3);
  ptyCreate[0].p._emettiDati(enorme);

  const tenuto = voce.backlog.join('');
  assert.ok(voce.byteBacklog <= BACKLOG_MASSIMO_BYTE, `tenuti ${voce.byteBacklog} byte contro un tetto di ${BACKLOG_MASSIMO_BYTE}`);
  assert.equal(voce.byteBacklog, Buffer.byteLength(tenuto, 'utf8'), 'il contatore dice la verità su ciò che è rimasto in memoria');
  assert.ok(enorme.endsWith(tenuto), 'si tiene la CODA: è quella che la scheda deve rivedere al rientro');
  assert.equal(visti.length, 1);
  assert.equal(visti[0].dati, enorme, 'chi guarda DAL VIVO riceve tutto: il taglio riguarda solo la memoria');
});

test('⛔⛔ F04 — il taglio non spezza mai un carattere UTF-8 a metà (niente � nel backlog)', () => {
  const { registro, ptyCreate } = registroPerTest();
  const voce = registro.apri({ id: 't1', cartella: '/tmp' });

  // ⛔ 3 byte per carattere e 200.000 NON è multiplo di 3: il taglio cade DENTRO una sequenza, che è il caso da provare.
  const enorme = '∑'.repeat(100_000);
  assert.equal(Buffer.byteLength(enorme, 'utf8'), 300_000);
  ptyCreate[0].p._emettiDati(enorme);

  const tenuto = voce.backlog.join('');
  assert.ok(voce.byteBacklog <= BACKLOG_MASSIMO_BYTE);
  assert.ok(!tenuto.includes('�'), 'un carattere spezzato arriverebbe a xterm come sostituto: sarebbe output mai scritto dalla shell');
  assert.equal(tenuto.replaceAll('∑', ''), '', 'tutto ciò che resta sono caratteri interi');
  assert.ok(enorme.endsWith(tenuto));
});

test('⛔ F04 — sotto il tetto non si taglia NIENTE (il verso in cui la cura non deve mordere)', () => {
  const { registro, ptyCreate } = registroPerTest();
  const voce = registro.apri({ id: 't1', cartella: '/tmp' });

  ptyCreate[0].p._emettiDati('prima riga\r\n');
  ptyCreate[0].p._emettiDati('seconda riga\r\n');

  assert.deepEqual(voce.backlog, ['prima riga\r\n', 'seconda riga\r\n']);
  assert.equal(voce.byteBacklog, Buffer.byteLength('prima riga\r\nseconda riga\r\n', 'utf8'));
});

test('⛔⛔⛔ F05 — una finestra che si stacca NON rende orfana la PTY che un\'ALTRA sta ancora guardando', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  const voce = registro.apri({ id: 't1', cartella: '/tmp' });
  const finestraA = () => {};
  const finestraB = () => {};
  voce.ascoltatori.add(finestraA);
  voce.ascoltatori.add(finestraB);

  voce.ascoltatori.delete(finestraA); // A chiude la scheda
  registro.segnaDisconnesso('t1');
  assert.equal(voce.ultimaDisconnessioneMs, null, 'resta B a guardare: nessun timbro di orfana');

  avanza((MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA + 5) * 60_000);
  registro.reap();

  assert.equal(registro.stato('t1')?.viva, true, 'la shell che B sta usando è ancora viva');
  assert.equal(ptyCreate[0].p.uccisa, false);
});

test('⛔⛔ F05 — il reaper guarda CHI c\'è adesso, non solo il timbro: una scheda riagganciata non viene chiusa', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  const voce = registro.apri({ id: 't1', cartella: '/tmp' });

  registro.segnaDisconnesso('t1'); // nessuno guardava: il timbro si mette davvero
  assert.notEqual(voce.ultimaDisconnessioneMs, null);
  voce.ascoltatori.add(() => {}); // una finestra si riaggancia mentre il timbro è ancora lì

  avanza((MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA + 5) * 60_000);
  registro.reap();

  assert.equal(registro.stato('t1')?.viva, true);
  assert.equal(ptyCreate[0].p.uccisa, false);
});

test('⛔ AL CONTRARIO — F05: la scheda DAVVERO abbandonata viene chiusa dal reaper come prima', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  const voce = registro.apri({ id: 't1', cartella: '/tmp' });
  const unica = () => {};
  voce.ascoltatori.add(unica);

  voce.ascoltatori.delete(unica);
  registro.segnaDisconnesso('t1');
  assert.notEqual(voce.ultimaDisconnessioneMs, null, 'l\'ULTIMO che se ne va mette il timbro');

  avanza((MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA + 1) * 60_000);
  registro.reap();

  assert.equal(registro.stato('t1'), null, 'la pulizia delle schede mai più tornate continua a funzionare');
  assert.equal(ptyCreate[0].p.uccisa, true);
});
