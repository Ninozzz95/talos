/*
 * L'aiutante nativo del computer use, visto dal server (passo 5 del piano, decisione 129; forma FORMA-ATTREZZO-COLLEGAMENTO §3).
 *
 * - Parte SOLO dopo aver controllato l'impronta del `.exe` (sha256 dei byte) contro quella fissata qui: impronta diversa, file assente o
 *   impronta non ancora fissata ⇒ nessun processo, e l'attrezzo risponde «not available on this computer». È così che «mai il binario
 *   originale» si tiene: l'originale (con telemetria e aggiornamenti) ha un'altra impronta.
 * - Client MCP su stdio (JSON-RPC a righe), come `native/aiutante-nativo/prova-dal-vivo.mjs:46-70`, col ciclo di vita della specifica
 *   MCP 2025-06-18 (modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle, letta il 04/11/2026): `initialize`, poi
 *   `notifications/initialized`; ogni richiesta ha un tetto e, scaduta o annullata, `notifications/cancelled`; la chiusura su stdio è
 *   «closing the input stream … waiting for the server to exit … SIGTERM … SIGKILL».
 * - Uno per macchina (`aiutantePerMacchina`, uno per percorso nel processo del server); si spegne dopo 5 minuti senza compiti e alla
 *   chiusura dell'app (`chiudiTuttiGliAiutanti`).
 * - Ambiente del figlio ripulito: mai le chiavi dei fornitori a un binario di terzi. Hermes fa lo stesso:
 *   `tools/computer_use/permissions.py:39-49` («cua-driver is a third-party binary — it must never inherit provider API keys») e
 *   `cua_backend.py:175-184` (`sanitized_cua_driver_env`). Qui con una lista di chiavi AMMESSE, non di chiavi tolte: la chiave di un
 *   fornitore nuovo resta fuori senza che nessuno se ne ricordi.
 */
import { spawn as spawnReale } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile as readFileReale } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/**
 * Il testo che il modello riceve quando l'aiutante non c'è o non è quello giusto (forma §3). Cancello S2 (b) del Tester, 05/11/2026: il
 * modello leggeva «not available» e diceva alla persona «attiva il computer use», che non ha un interruttore. Il testo è intero e si dà
 * da solo: dice che non c'è niente da accendere, cosa dire, e di non riprovare.
 */
export const NON_DISPONIBILE = 'computer_use is not available on this computer: this TALOS install has no working PC helper, and there is '
  + 'no setting the person can turn on. Do not tell the person to enable computer use. Tell them plainly that TALOS cannot use the screen '
  + 'here, then do the task another way or stop. Do not retry.';
/**
 * L'impronta del binario POTATO di rilascio: lo sha256 dei byte del `.exe`, che `native/aiutante-nativo/costruisci.mjs:168` scrive nel
 * rapporto JSON di `--uscita` (il campo `sha256` dentro `binario`). Questa è la build del 05/11/2026 (pin 0cdcec94bc99, `-j 2`, 54.299.071 byte),
 * rimisurata con `sha256sum` sul file. Si fissa con un commit, mai da un file accanto al `.exe` (chi può cambiare il `.exe` può
 * cambiare anche quello); un `.exe` ricostruito con altri byte non parte finché qui non c'è la sua impronta.
 */
export const IMPRONTA_AIUTANTE_PC = '592abc5c72494fb8afa203acb075032a6e2eedc932c9e4fa0ef21a8e0dc35f8e';
export const MS_INATTIVO = 5 * 60_000;
const MS_RISPOSTA = 20_000;
const MS_USCITA = 2_000;
const SHA256 = /^[a-f0-9]{64}$/u;

/** Le sole variabili d'ambiente che il figlio riceve (Windows ne vuole alcune per avviarsi e per le cartelle dell'utente). */
export const AMBIENTE_AMMESSO = Object.freeze(['SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'SystemDrive', 'SYSTEMDRIVE', 'PATH', 'Path',
  'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'ProgramData', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME',
  'HOMEDRIVE', 'HOMEPATH', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'ComSpec', 'COMSPEC']);
export function ambientePulito(ambiente = process.env) {
  const fuori = {};
  for (const k of AMBIENTE_AMMESSO) if (typeof ambiente?.[k] === 'string') fuori[k] = ambiente[k];
  return { ...fuori, DO_NOT_TRACK: '1', CUA_TELEMETRY: '0' }; // come prova-dal-vivo.mjs:47
}

/**
 * Dove sta il binario. Nell'app installata il guscio passa `TALOS_AIUTANTE_PC` (`desktop/runtime.mjs`, `resources/aiutante-pc/`), e vale
 * solo un percorso assoluto; altrimenti è dove la build potata lo mette (`costruisci.mjs:166`):
 * `%LOCALAPPDATA%\tb\potato-target\release\cua-driver.exe`. In tutti e due i casi l'impronta resta il cancello.
 */
export function percorsoAiutantePredefinito(ambiente = process.env) {
  const dalGuscio = typeof ambiente?.TALOS_AIUTANTE_PC === 'string' ? ambiente.TALOS_AIUTANTE_PC.trim() : '';
  if (dalGuscio && isAbsolute(dalGuscio)) return dalGuscio;
  return join(String(ambiente?.LOCALAPPDATA ?? ''), 'tb', 'potato-target', 'release', 'cua-driver.exe');
}

/**
 * Cancello S2 (a) del Tester, 05/11/2026: l'aiutante si offre al modello solo se può partire — impronta fissata nella sua forma e file
 * presente. Se no il nucleo non riceve gli attrezzi, e il modello non vede un `computer_use` che risponderebbe solo «not available».
 * L'impronta dei byte si controlla comunque alla prima chiamata (`apri`): qui si guarda solo ciò che costa niente.
 */
export function aiutanteUsabile({ exe, impronta, esiste = existsSync } = {}) {
  if (typeof impronta !== 'string' || !SHA256.test(impronta)) return false;
  if (typeof exe !== 'string' || !exe) return false;
  try { return esiste(exe) === true; } catch { return false; }
}

/**
 * Gli argomenti dell'aiutante (giudice v1790, 13/11): il cursore di cua (acceso di serie, `cursor-overlay/src/lib.rs:97`) si spegne SOLO quando il segno di
 * TALOS (cursore e bordo) si vede davvero, e lo dice il guscio con `TALOS_SEGNO_ACCESO=1` (`desktop/runtime.mjs` all'avvio del server,
 * `desktop/child-bootstrap.mjs` quando smette di vedersi). Senza, cioè segno spento di serie, Windows vecchio, fuori Windows, protezione rifiutata, la
 * CLI o un server lanciato a mano, il cursore dell'aiutante resta. Come Hermes, gli argomenti si scelgono a ogni lancio (`cua_backend_driver.py:96-98`).
 */
export function argomentiAiutante(ambiente = process.env) {
  return ambiente?.TALOS_SEGNO_ACCESO === '1' ? ['mcp', '--no-overlay'] : ['mcp'];
}

const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

/** L'errore di ogni chiamata dopo un riavvio per il cursore non riuscito: il compito si ferma (attrezzo `guarda` ⇒ assenza `cursore`), mai senza cursore. */
export const CURSORE_NON_RIMESSO = 'cursor-not-restored';
const NESSUN_CURSORE = Object.freeze({ ok: false, dati: null, immagine: null, errore: CURSORE_NON_RIMESSO });

/**
 * @param {{ exe: string, improntaAttesa?: string|null, avvia?: typeof spawnReale, leggi?: (p: string) => Promise<Buffer>,
 *   ambiente?: object, msInattivo?: number, msRisposta?: number, registro?: (riga: string) => void, quandoCursore?: (conCursore: boolean) => void }} o
 */
export function creaAiutanteMcp({ exe, improntaAttesa = IMPRONTA_AIUTANTE_PC, avvia = spawnReale, leggi = readFileReale, ambiente = process.env,
  msInattivo = MS_INATTIVO, msRisposta = MS_RISPOSTA, registro = (riga) => console.warn(riga), quandoCursore = () => {} } = {}) {
  let figlio = null; let pronto = null; let resto = ''; let id = 0; const attese = new Map();
  /* Giro 5 della bolla (owner 14/11): il guscio mostra il segno di TALOS solo se nessun aiutante gira col SUO cursore. Lo sa solo il server: si dice quando
     cambia (un figlio partito senza `--no-overlay` che vive), mai a ogni chiamata. Chi ascolta e lancia non ferma l'aiutante. */
  let dettoConCursore = false;
  const diCursore = () => {
    const ora = Boolean(figlio) && !senzaCursore;
    if (ora === dettoConCursore) return;
    dettoConCursore = ora;
    try { quandoCursore(ora); } catch { /* il guscio è andato: niente da fare qui */ }
  };
  let compiti = 0; let timer = null; let avvii = 0;
  let chiuso = false; // spento per sempre (chiusura dell'app): `apri` non riavvia più nulla (revisione del passo 5, difetto 7)
  /* Giudice v1793-v1794 (13/11): il segno di TALOS smette di vedersi mentre il figlio gira col cursore spento. Si chiude al CONFINE DEL PASSO (nessuna
     chiamata in volo: un clic non si tronca), la chiamata dopo lo riapre e `argomentiAiutante` riletto gli rende il cursore. Come Hermes, che riavvia
     l'aiutante prima della chiamata dopo, mai durante (`tools/computer_use/cua_backend_session.py:479`, «(re)starting before call»). */
  let senzaCursore = false; // il figlio di adesso è partito con `--no-overlay`
  let inVolo = 0; let daChiudere = false; let daRiaprire = false;
  let cursorePerso = false; // il riavvio per il cursore non è riuscito: ogni chiamata del compito risponde CURSORE_NON_RIMESSO
  /* Giro 6 della bolla (owner 14/11 15:46): col ritmo lento lo schermo restava senza cursore 6,6-8,6 s, perché l'aiutante ripartiva solo alla chiamata
     dopo e cua disegna il suo cursore solo alla prima mossa (posizione `None` finché un comando non la mette, `cursor-overlay/src/lib.rs:204-210`). Ora,
     a compito in corso, riparte SUBITO al confine, e ogni avvio col suo cursore riceve `move_cursor` all'ultimo punto annunciato (`puntoNoto`): senza
     `scope:'desktop'` muove solo il cursore disegnato, mai il mouse vero (`platform-windows/src/tools/move_cursor.rs:27,44`). Hermes tiene acceso il
     cursore di cua su Windows (`tools/computer_use/cua_backend.py:45-50`) e lo vede muoversi solo con le azioni: qui la prima mossa è nostra. */
  let ultimoPunto = null; // l'ultimo punto annunciato del compito in corso, in pixel fisici globali; `null` fra un compito e l'altro
  let riapertura = null; // la ripartenza in corso dopo il confine: la chiamata del passo la aspetta
  const mettiCursore = () => {
    if (!figlio || senzaCursore || !ultimoPunto || compiti === 0) return;
    inVolo += 1; // conta come una chiamata: un segno che cambia proprio adesso chiude dopo la sua risposta
    chiediRpc('tools/call', { name: 'move_cursor', arguments: { x: ultimoPunto.x, y: ultimoPunto.y } }).finally(() => { inVolo -= 1; alConfine(); });
  };
  const riapri = () => {
    daRiaprire = false;
    // impronta, avvio o app chiusa: il compito si ferma con la frase del cursore, mai un'azione su uno schermo senza cursore
    riapertura = apri().then((r) => { if (!r.ok) cursorePerso = true; return r.ok; }).finally(() => { riapertura = null; });
    return riapertura;
  };
  const alConfine = () => {
    if (!daChiudere || inVolo > 0) return;
    daChiudere = false;
    if (!figlio) return;
    daRiaprire = true;
    registro('[computer-use] the TALOS cursor stopped showing: the PC helper closes after its last call and restarts with its own cursor');
    spegni();
    if (compiti > 0) riapri(); // a compito in corso subito; senza compito alla chiamata dopo, come prima
  };

  const fermaTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const armaTimer = () => {
    fermaTimer();
    if (compiti > 0 || !figlio) return;
    timer = setTimeout(() => { timer = null; if (compiti === 0) spegni(); }, msInattivo);
    timer.unref?.();
  };
  // la chiusura della specifica su stdio: prima l'ingresso, poi l'attesa, poi la forza
  const spegni = () => {
    fermaTimer();
    const f = figlio; figlio = null; pronto = null; resto = '';
    diCursore(); // il suo cursore se ne va con lui
    for (const fine of [...attese.values()]) fine({ error: { message: 'closed' } });
    attese.clear();
    if (!f) return;
    try { f.stdin?.end(); } catch { /* già chiuso */ }
    const forza = setTimeout(() => { try { f.kill(); } catch { /* già uscito */ } }, MS_USCITA);
    forza.unref?.();
    f.once?.('exit', () => clearTimeout(forza));
  };

  /** Impronta controllata a OGNI avvio: un `.exe` cambiato fra due compiti non parte. */
  const controllaImpronta = async () => {
    if (typeof improntaAttesa !== 'string' || !SHA256.test(improntaAttesa)) return 'impronta-non-fissata';
    let byte;
    try { byte = await leggi(exe); } catch { return 'binario'; }
    const vista = createHash('sha256').update(byte).digest('hex');
    return vista === improntaAttesa ? null : 'impronta';
  };

  const scrivi = (m) => { try { if (!figlio?.stdin) return false; figlio.stdin.write(`${JSON.stringify(m)}\n`); return true; } catch { return false; } };
  const chiediRpc = (method, params, segnale) => new Promise((fine) => {
    if (!figlio) { fine({ error: { message: 'closed' } }); return; }
    id += 1; const mio = id;
    let t = null;
    const chiudiAttesa = (m) => { clearTimeout(t); segnale?.removeEventListener?.('abort', suAbort); attese.delete(mio); fine(m); };
    const annulla = (motivo) => { scrivi({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: mio, reason: motivo } }); chiudiAttesa({ error: { message: motivo } }); };
    const suAbort = () => annulla('aborted');
    t = setTimeout(() => annulla('timeout'), msRisposta);
    t.unref?.();
    attese.set(mio, chiudiAttesa);
    if (segnale?.aborted) { suAbort(); return; }
    segnale?.addEventListener?.('abort', suAbort, { once: true });
    if (!scrivi({ jsonrpc: '2.0', id: mio, method, params })) chiudiAttesa({ error: { message: 'closed' } });
  });

  const avviaFiglio = async () => {
    const motivo = await controllaImpronta();
    if (motivo) return { ok: false, motivo };
    if (chiuso) return { ok: false, motivo: 'chiuso' };
    let f;
    try {
      /* reperto 4 e giudice v1790 (13/11): `--no-overlay` solo col segno di TALOS davvero acceso, letto adesso e non alla creazione (`argomentiAiutante`).
         Hermes tiene acceso il cursore di cua su Windows (`cua_backend.py:45-50`): la scelta opposta vale solo quando il cursore di TALOS si vede. */
      const argomenti = argomentiAiutante(ambiente);
      f = avvia(exe, argomenti, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: ambientePulito(ambiente) });
      senzaCursore = argomenti.includes('--no-overlay');
    } catch { return { ok: false, motivo: 'avvio' }; }
    avvii += 1;
    figlio = f; daRiaprire = false; daChiudere = false;
    diCursore(); // nello stesso giro dell'avvio, prima di ogni chiamata: il guscio nasconde il segno prima che il cursore dell'aiutante serva
    /*
     * Revisione del passo 5, difetto 10a (04/11/2026): l'impronta si ricontrolla DOPO l'avvio, sul file che è partito. Fra il primo
     *   controllo e `spawn` il `.exe` poteva essere sostituito; ora un file diverso al secondo controllo ⇒ il figlio si uccide subito,
     *   prima di `initialize` (nessuno strumento gli arriva mai). Su Windows un `.exe` in esecuzione non si riscrive sul posto, quindi
     *   il secondo controllo legge l'immagine partita. Hermes controlla la firma del demone prima di lanciarlo
     *   (`tools/computer_use/cua_backend_daemon.py:44-62`); qui il controllo è doppio, prima e dopo.
     */
    /* Giro 4 della bolla (controllore CU, 13/11): il secondo controllo dura (35-77 ms su 51 MB) e il segno può spegnersi proprio lì. Conta come chiamata in
       volo fino alla risposta a `initialize`: la chiusura per il cursore aspetta la fine dell'avvio (`alConfine()` dopo), mai un avvio troncato che
       finirebbe in «not available on this computer». */
    inVolo += 1;
    const dopo = await controllaImpronta();
    if (dopo || chiuso) {
      inVolo -= 1;
      try { f.kill(); } catch { /* già uscito */ }
      if (figlio === f) spegni();
      return { ok: false, motivo: dopo ?? 'chiuso' };
    }
    f.stdout?.setEncoding?.('utf8');
    f.stdout?.on('data', (d) => {
      resto += d;
      // si divide solo su \n (trappola U+2028 delle righe JSON)
      for (let i = resto.indexOf('\n'); i >= 0; i = resto.indexOf('\n')) {
        const riga = resto.slice(0, i).trim(); resto = resto.slice(i + 1);
        const m = json(riga);
        if (m && attese.has(m.id)) attese.get(m.id)(m);
      }
    });
    f.stderr?.on?.('data', () => { /* il diario dell'aiutante non entra mai nel contesto del modello */ });
    f.on?.('error', () => { if (figlio === f) spegni(); });
    f.on?.('exit', () => { if (figlio === f) spegni(); });
    const init = await chiediRpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'talos', version: '1' } });
    inVolo -= 1;
    if (init.error || figlio !== f) { if (figlio === f) spegni(); return { ok: false, motivo: 'initialize' }; }
    scrivi({ jsonrpc: '2.0', method: 'notifications/initialized' });
    alConfine(); // il segno spento durante l'avvio: si chiude adesso, la chiamata dopo lo riapre col cursore
    mettiCursore(); // giro 6: partito col suo cursore a compito in corso, si disegna subito all'ultimo punto, senza aspettare una mossa
    return { ok: true };
  };

  /** Avvia (se serve) dopo il controllo dell'impronta. `{ ok: true }` o `{ ok: false, motivo }`; nessun processo se l'impronta non torna. */
  const apri = async () => {
    if (chiuso) return { ok: false, motivo: 'chiuso' };
    if (!pronto) pronto = avviaFiglio().then((r) => { if (!r.ok) pronto = null; return r; });
    const r = await pronto;
    if (r.ok) { cursorePerso = false; armaTimer(); }
    return r;
  };

  return {
    apri,
    /** Uno strumento dell'aiutante: `{ ok, dati, immagine: { base64, mime } | null, errore }`. Mai un'eccezione. */
    async chiama(nome, argomenti = {}, segnale) {
      if (cursorePerso) return NESSUN_CURSORE;
      if (riapertura || (!figlio && daRiaprire)) {
        if (!(await (riapertura ?? riapri()))) return NESSUN_CURSORE; // giro 6: la ripartenza già in corso si aspetta, mai un secondo avvio
      }
      if (!figlio) return { ok: false, dati: null, immagine: null, errore: 'not-started' };
      inVolo += 1;
      let r;
      try { r = await chiediRpc('tools/call', { name: nome, arguments: argomenti }, segnale); } finally { inVolo -= 1; alConfine(); }
      const ris = r.result ?? {};
      const parti = Array.isArray(ris.content) ? ris.content : [];
      const img = parti.find((p) => p?.type === 'image' && typeof p.data === 'string');
      return {
        ok: !r.error && ris.isError !== true,
        errore: r.error?.message ?? (ris.isError ? String(parti.find((p) => p?.type === 'text')?.text ?? 'error').slice(0, 300) : null),
        dati: ris.structuredContent ?? null,
        immagine: img ? { base64: img.data, mime: typeof img.mimeType === 'string' ? img.mimeType : 'image/png' } : null,
      };
    },
    /** Un compito comincia: niente spegnimento finché non finisce. Torna la funzione che lo chiude (una volta sola). */
    compito() {
      compiti += 1; fermaTimer();
      let fatto = false;
      return () => { if (fatto) return; fatto = true; compiti = Math.max(0, compiti - 1); if (compiti === 0) ultimoPunto = null; armaTimer(); };
    },
    /** Giro 6 della bolla: l'ultimo punto annunciato del cursore (l'evento `annuncio` del ciclo, pixel fisici globali), per ridisegnare il cursore
        dell'aiutante che riparte. Un punto non numerico si scarta e resta il precedente. */
    puntoNoto(p) {
      if (p === null || typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      ultimoPunto = { x: Math.round(p.x), y: Math.round(p.y) };
    },
    /** Il guscio ha detto che il segno cambia (`desktop/child-bootstrap.mjs` ha già aggiornato l'ambiente). Si chiude SOLO un figlio partito senza il suo
        cursore mentre adesso il segno non si vede: un figlio col cursore, o il segno ancora acceso, non riparte mai per niente. */
    segnoCambiato() {
      if (!figlio || !senzaCursore || argomentiAiutante(ambiente).includes('--no-overlay')) return;
      daChiudere = true; alConfine();
    },
    chiudi: spegni,
    /** Alla chiusura dell'app: spento, e da qui ogni `apri` risponde `{ ok: false, motivo: 'chiuso' }` (un compito in volo non lo riaccende). */
    chiudiPerSempre: () => { chiuso = true; spegni(); },
    stato: () => ({ vivo: Boolean(figlio), compiti, avvii, chiuso }),
  };
}

const perMacchina = new Map();
let processoInChiusura = false;
let ascoltaIlSegno = false;
/** Uno per macchina: lo stesso percorso dà sempre lo stesso aiutante dentro il processo del server. Dopo la chiusura dell'app, uno spento. */
export function aiutantePerMacchina(opzioni) {
  const k = String(opzioni?.exe ?? '');
  if (processoInChiusura) { const spento = creaAiutanteMcp(opzioni); spento.chiudiPerSempre(); return spento; }
  /* Il messaggio privato `{ tipo: 'segno' }` del guscio: `child-bootstrap.mjs`, precaricato, lo ascolta per primo e aggiorna l'ambiente (gli ascoltatori
     si chiamano nell'ordine in cui sono stati aggiunti, Node `events.md`, `emitter.emit()`); qui gli aiutanti lo rileggono. Senza canale (la CLI, un
     server lanciato a mano) nessun guscio parla, e nessun ascoltatore. */
  if (!ascoltaIlSegno && typeof process.send === 'function') {
    ascoltaIlSegno = true;
    process.on('message', (m) => { if (m?.tipo === 'segno') for (const a of perMacchina.values()) a.segnoCambiato(); });
  }
  if (!perMacchina.has(k)) {
    const chiave = {};
    perMacchina.set(k, creaAiutanteMcp({ ...opzioni, quandoCursore: (conCursore) => { diAlGuscio(chiave, conCursore); opzioni?.quandoCursore?.(conCursore); } }));
  }
  return perMacchina.get(k);
}

/* Giro 5 della bolla: gli aiutanti di questo processo che girano col loro cursore. Al guscio si dice `{ tipo: 'segno-aiutante', conCursore }` solo quando il
   «almeno uno» cambia, col canale privato che c'è già (come `{ tipo: 'sveglio' }`, `src/pc-sveglio.mjs`). Senza canale (la CLI, un server a mano) niente. */
const conIlCursore = new Set();
function diAlGuscio(chiave, conCursore) {
  const prima = conIlCursore.size > 0;
  if (conCursore) conIlCursore.add(chiave); else conIlCursore.delete(chiave);
  const ora = conIlCursore.size > 0;
  if (ora === prima || typeof process.send !== 'function' || process.connected === false) return;
  try { process.send({ tipo: 'segno-aiutante', conCursore: ora }, () => {}); } catch { /* il guscio è andato */ }
}
/**
 * Alla chiusura dell'app: spegne tutti gli aiutanti avviati da questo processo, per sempre (revisione del passo 5, difetto 7). Il server
 * la chiama DOPO `sessionRegistry.chiudi`; un compito ancora in volo che chiede `apri` riceve `chiuso` e non lascia un processo orfano.
 */
export function chiudiTuttiGliAiutanti() {
  processoInChiusura = true;
  for (const a of perMacchina.values()) a.chiudiPerSempre();
  perMacchina.clear();
}
