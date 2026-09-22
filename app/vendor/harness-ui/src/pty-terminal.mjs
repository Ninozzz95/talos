/**
 * pty-terminal.mjs — Terminale REALE, ledger in
 * `.claude/LEDGER-TERMINALE-REALE.md`. Owner, 28/8: *"deve essere un
 * terminale vero e proprio bash [...] che non ha limiti [...] usabile
 * dall'utente con le sue dita umane"* — non il log a righe dei comandi
 * dell'agente (quello resta, invariato, nel tool-call della chat).
 *
 * Ricerca fatta prima di scrivere: su Windows (dove non esiste
 * un primitivo PTY POSIX nativo), lo stato dell'arte monta Git Bash dentro
 * una PTY vera — la stessa strategia adottata da altri strumenti dello
 * stesso tipo.
 * Verificato empiricamente su QUESTA macchina (non presunto): `node-pty`
 * include il prebuild `win32-x64` DENTRO il pacchetto npm (zero
 * compilazione), Git Bash è installato
 * (`C:\Program Files\Git\bin\bash.exe`, lo stesso binario che questa
 * sessione usa per il proprio tool Bash), e una sonda reale
 * (`pty.spawn` + un comando scritto come keystroke) ha prodotto un
 * prompt MINGW64 vero con sequenze ANSI vere.
 *
 * ⛔ Questo modulo NON impone timeout, non tronca l'output, non ha una
 * allowlist di comandi — a differenza di `eseguiComandoSandboxato`
 * (l'attrezzo `shell` dato in mano a un MODELLO): qui la shell è in
 * mano al proprietario della macchina, "non ha limiti" per richiesta
 * esplicita.
 */
import { spawn as spawnPty } from 'node-pty';
import { existsSync } from 'node:fs';

import { ambienteSenzaVariabiliDelServer } from './ambiente-solo-server.mjs';

/** ⛔ Solo win32: `existsFn` iniettabile per i test, mai una vera ricerca su disco lì. */
const PERCORSI_GIT_BASH_WINDOWS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

/**
 * Tetto del backlog **PER SCHEDA** — un replay alla riconnessione, non uno
 * storico infinito.
 *
 * ⛔⛔ W1-01 (05/9): verificato che il tetto è per voce del registro e non
 * globale (`voce.byteBacklog` vive dentro la singola voce), perché con più
 * schede per sessione un tetto globale farebbe sparire il backlog di una
 * scheda quando ne parla un'altra. Il numero è **200.000 byte per scheda**:
 * dichiarato, non infinito. Stessa disciplina di VS Code, che limita lo
 * scrollback ripristinato di una sessione persistente con
 * `terminal.integrated.persistentSessionScrollback` (default **100 righe**,
 * code.visualstudio.com/docs/terminal/advanced, letto il 05/09/2026) invece di
 * rigiocare tutto. ⛔ E il backlog DEVE stare qui: `node-pty` non tiene
 * scrollback proprio — lo scrollback vive in xterm, lato client, e un F5 lo
 * azzera (ricerca 05/09/2026).
 */
export const BACKLOG_MASSIMO_BYTE = 200_000;

/*
 * ⛔ 14/09 (F04 della review, riprodotto): il tetto NON si rispettava con un solo pezzo — il vecchio ciclo si fermava a
 *   `backlog.length > 1`, quindi un `cat` di un file grosso lasciava in memoria un elemento da megabyte PER SCHEDA, e
 *   il numero dichiarato qui sopra («200.000 byte per scheda, dichiarato, non infinito») era falso proprio nel caso che
 *   conta. Adesso l'ultimo pezzo si TAGLIA, e si tiene la CODA: è quella che la scheda deve rivedere al rientro.
 * ⛔ Il taglio è sui byte UTF-8, mai sui caratteri: si entra da destra e si scavalcano i byte di continuazione
 *   (`10xxxxxx`), perché una sequenza multi-byte spezzata arriverebbe a xterm come `�` — cioè il backlog
 *   consegnerebbe caratteri che la shell non ha mai scritto.
 */
function limitaBacklog(voce) {
  while (voce.byteBacklog > BACKLOG_MASSIMO_BYTE && voce.backlog.length > 1) {
    voce.byteBacklog -= Buffer.byteLength(voce.backlog.shift(), 'utf8');
  }
  if (voce.byteBacklog <= BACKLOG_MASSIMO_BYTE || voce.backlog.length === 0) return;
  const ultimo = Buffer.from(voce.backlog[0], 'utf8');
  let taglio = ultimo.length - BACKLOG_MASSIMO_BYTE;
  while (taglio < ultimo.length && (ultimo[taglio] & 0xc0) === 0x80) taglio += 1;
  const coda = ultimo.subarray(taglio).toString('utf8');
  voce.backlog[0] = coda;
  voce.byteBacklog = Buffer.byteLength(coda, 'utf8');
}

/** Una PTY disconnessa da più di così viene chiusa dal reaper — pulizia di schede mai più tornate, non un limite sulla shell viva. */
export const MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA = 10;

/*
 * ⛔⛔⛔ CLI-REQ-04 (17/09/2026) — L'AMBIENTE DELLA SHELL DELLA PERSONA.
 *
 * Fino a oggi `apri` passava `env: process.env`, cioè l'ambiente INTERO del server. Dentro ci
 * sono il token di loopback a 64 esadecimali che protegge TUTTA la nostra API locale e la chiave
 * privata che firma le ricevute (`desktop/runtime.mjs:47-60`, `src/config.mjs:601` e `:625-627`).
 * Un `npm install` con i suoi script di installazione, o un attrezzo scaricato, lanciato dalla
 * persona in questa scheda poteva leggerli e usarli.
 *
 * ⛔ Ricerca prima di scrivere, 17/09/2026: la documentazione di `node:child_process`
 * (nodejs.org/api/child_process.html) dichiara `env` con default `process.env`, cioè l'eredità
 * INTERA è il comportamento predefinito e va disfatta a mano; lo stato dell'arte sui segreti in
 * Node (nodejs-security.com/blog/do-not-use-secrets-in-environment-variables-and-here-is-how-to
 * -do-it-better) chiama l'eredità automatica una violazione del minimo privilegio.
 *
 * ⛔ L'elenco e la funzione NON vivono più qui: stanno in `ambiente-solo-server.mjs`, perché dal
 * secondo giro il browser di sistema (`browser-vivo.mjs`) ha lo stesso bisogno e due copie
 * divergerebbero al primo segreto nuovo. Lì stanno anche il perché dell'elenco CHIUSO e la
 * misura che mostra che D-10E NON copre già questi nomi.
 *
 * ⛔ L'ELENCO DEI PUNTI CHE AVVIANO PROCESSI CON L'AMBIENTE INTERO — cioè chi altri ha questo
 * stesso difetto, quanto è coperto e quanto no — sta in
 * `.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md`, misurato il 17/09/2026. Chi tocca questa riga
 * lo rilegga: una cura su una sola strada non chiude la classe.
 */
export { VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE, VARIABILI_SOLO_DEL_SERVER } from './ambiente-solo-server.mjs';

/** Il nome con cui questo modulo ha sempre esposto la funzione: una sola implementazione, due nomi. */
export const ambienteDelTerminale = ambienteSenzaVariabiliDelServer;

/**
 * Sceglie la shell reale da lanciare. Su Windows: Git Bash se esiste
 * — altrimenti `cmd.exe`, ma
 * DICHIARATO (`enforcement:'cmd-fallback'`), mai un fallback silenzioso
 * spacciato per bash (stesso principio "onestà sull'enforcement" già
 * in uso per l'attrezzo `shell` dell'agente). Su POSIX: `$SHELL` o
 * `/bin/bash`.
 */
export function sceltaShell(deps = {}) {
  const platform = deps.platform ?? process.platform;
  const existsFn = deps.existsFn ?? existsSync;
  const env = deps.env ?? process.env;
  if (platform === 'win32') {
    const percorsi = deps.percorsiGitBash ?? PERCORSI_GIT_BASH_WINDOWS;
    const gitBash = percorsi.find((percorso) => existsFn(percorso));
    if (gitBash) return { comando: gitBash, argomenti: ['--login', '-i'], enforcement: 'git-bash' };
    return { comando: 'cmd.exe', argomenti: [], enforcement: 'cmd-fallback' };
  }
  return { comando: env.SHELL || '/bin/bash', argomenti: ['-l'], enforcement: 'posix-shell' };
}

/**
 * Codifica/decodifica del framing binario sulla WebSocket — un byte di
 * comando in testa, mai lo stream incapsulato in JSON (corromperebbe le
 * sequenze ANSI/di controllo — guardia raccolta in ricerca:
 * xtermjs.org/docs/guides/flowcontrol). `0` = dati grezzi (tastiera
 * umana → PTY, o PTY → schermo). `1` = controllo JSON (resize, o
 * l'evento di uscita della shell).
 */
export const TIPO_FRAME_DATI = 0;
export const TIPO_FRAME_CONTROLLO = 1;

export function codificaFrame(tipo, payload) {
  const corpo = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  return Buffer.concat([Buffer.from([tipo]), corpo]);
}

/** AL CONTRARIO — un frame vuoto o con un tipo ignoto torna `null`, mai un crash. */
export function decodificaFrame(dati) {
  const buf = Buffer.isBuffer(dati) ? dati : Buffer.from(dati);
  if (buf.length === 0) return null;
  const tipo = buf[0];
  if (tipo !== TIPO_FRAME_DATI && tipo !== TIPO_FRAME_CONTROLLO) return null;
  return { tipo, payload: buf.subarray(1) };
}

/**
 * Registro delle PTY vive, per id. Una riconnessione sullo STESSO id
 * riaggancia la PTY viva invece di aprirne una seconda (un F5 non perde la
 * shell) — stesso principio del `Last-Event-ID` già in uso per SSE, qui
 * applicato a una PTY invece che a un run dell'agente.
 *
 * ⛔⛔ W1-01 (05/9) — l'id NON è più il `sessionId`: è il **`terminalId`**, e
 * una sessione può averne più d'uno. Chi decide quali id esistono, a quale
 * sessione appartengono e in quale cartella si aprono è
 * `terminal-registry.mjs`; questo file non autorizza niente, tiene solo in
 * vita le PTY. ⇒ Ogni id ha la sua voce, quindi la sua PTY, il suo backlog e
 * i suoi ascoltatori: due schede della stessa sessione **non condividono
 * I/O**, ed è il criterio della riga (provato in `pty-terminal.test.mjs`).
 */
export function creaRegistroTerminali(deps = {}) {
  const spawnPtyFn = deps.spawnPtyFn ?? spawnPty;
  const sceltaShellFn = deps.sceltaShellFn ?? sceltaShell;
  const ambienteFn = deps.ambienteFn ?? ambienteDelTerminale; // ⛔ CLI-REQ-04: iniettabile per i test.
  const clock = deps.clock ?? (() => Date.now());
  /** @type {Map<string, any>} */
  const terminali = new Map();

  function apri({ id, cartella, cols = 80, rows = 24 }) {
    const esistente = terminali.get(id);
    if (esistente && !esistente.chiusa) {
      esistente.ultimaDisconnessioneMs = null;
      return esistente;
    }
    const scelta = sceltaShellFn();
    const handle = spawnPtyFn(scelta.comando, scelta.argomenti, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cartella,
      env: ambienteFn(), // ⛔ CLI-REQ-04 (17/09/2026): mai `process.env` intero — vedi VARIABILI_SOLO_DEL_SERVER.
    });
    const voce = {
      id,
      handle,
      enforcement: scelta.enforcement,
      comando: scelta.comando, // 06/9 B1: il nome della shell arriva alla scheda
      backlog: [],
      byteBacklog: 0,
      ultimaDisconnessioneMs: null,
      chiusa: false,
      ascoltatori: new Set(),
    };
    handle.onData((dati) => {
      voce.backlog.push(dati);
      voce.byteBacklog += Buffer.byteLength(dati, 'utf8');
      limitaBacklog(voce);
      for (const ascolta of voce.ascoltatori) ascolta({ tipo: 'dati', dati });
    });
    handle.onExit(({ exitCode, signal }) => {
      voce.chiusa = true;
      for (const ascolta of voce.ascoltatori) ascolta({ tipo: 'uscita', exitCode, signal });
    });
    terminali.set(id, voce);
    return voce;
  }

  function scrivi(id, dati) {
    terminali.get(id)?.handle.write(dati);
  }

  function ridimensiona(id, cols, rows) {
    const voce = terminali.get(id);
    if (voce && !voce.chiusa && cols > 0 && rows > 0) voce.handle.resize(cols, rows);
  }

  /*
   * ⛔ 14/09 (F05 della review, riprodotto): una scheda che si stacca NON rende orfana una PTY che un'ALTRA finestra sta
   *   ancora guardando. Prima il timbro si metteva comunque, e dieci minuti dopo il reaper uccideva un terminale vivo
   *   sotto gli occhi di chi lo stava usando — difetto che il lavoro a due finestre di oggi rende tutt'altro che teorico.
   *   Il timbro lo mette solo l'ULTIMO che se ne va; se resta qualcuno, si azzera.
   */
  function segnaDisconnesso(id) {
    const voce = terminali.get(id);
    if (voce) voce.ultimaDisconnessioneMs = voce.ascoltatori.size === 0 ? clock() : null;
  }

  /** Chiusura esplicita (mai implicita): l'owner chiude la scheda del terminale dalla UI. */
  function chiudiForzato(id) {
    const voce = terminali.get(id);
    if (!voce) return;
    try { voce.handle.kill(); } catch { /* già morta, nulla da fare */ }
    terminali.delete(id);
  }

  /**
   * Chiude solo le PTY orfane da più di `MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA`
   * — mai quelle ancora attaccate a un client (`ultimaDisconnessioneMs`
   * nullo finché una WS resta aperta), mai per un tetto di tempo sulla
   * shell VIVA.
   */
  function reap() {
    const ora = clock();
    for (const [id, voce] of terminali) {
      // ⛔ 14/09 (F05): «orfana» vuol dire che NESSUNO la guarda — il timbro da solo non basta, perché un'altra finestra
      //   può essersi riagganciata nel frattempo. Due condizioni, non una.
      const orfanaScaduta = voce.ascoltatori.size === 0
        && voce.ultimaDisconnessioneMs !== null
        && ora - voce.ultimaDisconnessioneMs > MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000;
      if (voce.chiusa || orfanaScaduta) {
        try { voce.handle.kill(); } catch { /* già morta */ }
        terminali.delete(id);
      }
    }
  }

  /**
   * ⭐ W1-01 (05/9) — lo stato di UNA PTY, senza esporre la voce mutabile del
   * registro fuori da qui (stesso principio di `cartellaDi` in
   * `session-registry.mjs`). Serve all'elenco delle schede per dire «shell
   * viva» / «shell già uscita»: `null` significa «nessuna PTY per questo id»,
   * che è un terzo fatto e non si confonde con `{viva:false}`.
   */
  function stato(id) {
    const voce = terminali.get(id);
    if (!voce) return null;
    return { viva: !voce.chiusa, enforcement: voce.enforcement, byteBacklog: voce.byteBacklog };
  }

  /**
   * ⭐⭐⭐ Come `apri`, ma DICE se ha ripreso una PTY viva o ne ha aperta una
   * nuova.
   *
   * ⛔ Serve perché da fuori le due cose sono indistinguibili: il ponte
   * rigioca il backlog in entrambi i casi, e una PTY appena creata ha backlog
   * vuoto — che è anche l'aspetto di una shell viva che non ha ancora
   * stampato niente. Dedurlo dall'assenza di backlog è un indovinello, non una
   * misura, e l'interfaccia finiva per dire «riconnesso» senza poter sapere se
   * la shell della persona fosse sopravvissuta. Lo stato dell'arte separa
   * l'identità della CONNESSIONE da quella della SESSIONE e fa dichiarare al
   * server se ha davvero ripreso (un pattern noto come "connection state
   * recovery", ricerca del 05/09/2026: websocket.org/guides/reconnection/).
   *
   * ⛔ La risposta viene dallo STESSO controllo che fa `apri` («la voce esiste
   * e non è chiusa»), letto un attimo prima: non è una seconda verità che può
   * divergere dalla prima. Fra la lettura e la chiamata non c'è `await`.
   *
   * @returns {{voce:object, ripresa:boolean}} `ripresa:false` significa shell
   *   NUOVA — la prima volta in assoluto, oppure dopo che il reaper ha chiuso
   *   quella di prima.
   */
  function apriDichiarando({ id, cartella, cols, rows }) {
    const esistente = terminali.get(id);
    const ripresa = Boolean(esistente && !esistente.chiusa);
    return { voce: apri({ id, cartella, cols, rows }), ripresa };
  }

  return {
    apri, apriDichiarando, scrivi, ridimensiona, segnaDisconnesso, chiudiForzato, reap, stato,
    /** ⛔ Solo per i test — mai usato dal codice di produzione. */
    _terminali: terminali,
  };
}
