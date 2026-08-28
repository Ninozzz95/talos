/**
 * pty-terminal.mjs — Terminale REALE, ledger in
 * `.claude/LEDGER-TERMINALE-REALE.md`. Owner, 28/8: *"deve essere un
 * terminale vero e proprio bash [...] che non ha limiti [...] usabile
 * dall'utente con le sue dita umane"* — non il log a righe dei comandi
 * dell'agente (quello resta, invariato, nel tool-call della chat).
 *
 * Ricerca fatta prima di scrivere: Hermes, su Windows (dove non esiste
 * un primitivo PTY POSIX nativo), monta Git Bash dentro una PTY vera —
 * "same strategy Claude Code uses"
 * (hermes-agent.nousresearch.com/docs/user-guide/windows-native).
 * Verificato empiricamente su QUESTA macchina (non presunto): `node-pty`
 * include il prebuild `win32-x64` DENTRO il pacchetto npm (zero
 * compilazione), Git Bash è installato
 * (`C:\Program Files\Git\bin\bash.exe`, lo stesso binario che questa
 * sessione Claude Code usa per il proprio tool Bash), e una sonda reale
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

/** ⛔ Solo win32: `existsFn` iniettabile per i test, mai una vera ricerca su disco lì. */
const PERCORSI_GIT_BASH_WINDOWS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

/** Tetto del backlog per terminale — un replay alla riconnessione, non uno storico infinito. */
export const BACKLOG_MASSIMO_BYTE = 200_000;

/** Una PTY disconnessa da più di così viene chiusa dal reaper — pulizia di schede mai più tornate, non un limite sulla shell viva. */
export const MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA = 10;

/**
 * Sceglie la shell reale da lanciare. Su Windows: Git Bash se esiste
 * (stessa strada di Hermes/Claude Code) — altrimenti `cmd.exe`, ma
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
 * Registro delle PTY vive, per id (id = sessionId quando una sessione
 * agente è aperta, altrimenti un id di terminale standalone — vedi
 * `terminal-ws.mjs`). Una riconnessione sullo STESSO id riaggancia la
 * PTY viva invece di aprirne una seconda (un F5 non perde la shell) —
 * stesso principio del `Last-Event-ID` già in uso per SSE, qui
 * applicato a una PTY invece che a un run dell'agente.
 */
export function creaRegistroTerminali(deps = {}) {
  const spawnPtyFn = deps.spawnPtyFn ?? spawnPty;
  const sceltaShellFn = deps.sceltaShellFn ?? sceltaShell;
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
      env: process.env,
    });
    const voce = {
      id,
      handle,
      enforcement: scelta.enforcement,
      backlog: [],
      byteBacklog: 0,
      ultimaDisconnessioneMs: null,
      chiusa: false,
      ascoltatori: new Set(),
    };
    handle.onData((dati) => {
      voce.backlog.push(dati);
      voce.byteBacklog += Buffer.byteLength(dati, 'utf8');
      while (voce.byteBacklog > BACKLOG_MASSIMO_BYTE && voce.backlog.length > 1) {
        voce.byteBacklog -= Buffer.byteLength(voce.backlog.shift(), 'utf8');
      }
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

  function segnaDisconnesso(id) {
    const voce = terminali.get(id);
    if (voce) voce.ultimaDisconnessioneMs = clock();
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
      const orfanaScaduta = voce.ultimaDisconnessioneMs !== null
        && ora - voce.ultimaDisconnessioneMs > MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000;
      if (voce.chiusa || orfanaScaduta) {
        try { voce.handle.kill(); } catch { /* già morta */ }
        terminali.delete(id);
      }
    }
  }

  return {
    apri, scrivi, ridimensiona, segnaDisconnesso, chiudiForzato, reap,
    /** ⛔ Solo per i test — mai usato dal codice di produzione. */
    _terminali: terminali,
  };
}
