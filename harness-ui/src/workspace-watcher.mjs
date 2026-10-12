/**
 * workspace-watcher.mjs — segnala quando i file di un workspace
 * cambiano FUORI dall'app (Explorer, un editor, git...). Piano
 * `elegant-spinning-dongarra.md`, owner 27/8: "se muovo i file il
 * work tree non si aggiorna automaticamente".
 *
 * ⛔ Ricerca fatta PRIMA di scrivere (28/8, REGOLA ZERO): `fs.watch`
 * nativo di Node ha difetti reali anche su Windows (più eventi per
 * salvataggio e `filename` non sempre presente), quindi debounce e
 * normalizzazione restano qui. Il profilo reale del 1/9 ha però
 * invalidato l'uso di Chokidar per QUESTO percorso ricorsivo: oltre
 * 255 mila handle e un core occupato a riposo dopo l'attivazione su un
 * workspace grande. Node 24 usa `ReadDirectoryChangesW` per la
 * ricorsione Windows con una registrazione nativa e supporta `ignore`,
 * `AbortSignal` e `persistent:false`: il contratto upstream viene
 * adottato direttamente dietro questo adapter TALOS.
 *
 * ⭐ Un watcher per CARTELLA, non per sessione: due sessioni sulla
 * stessa cartella (un fork, un resume) condividono un solo watcher —
 * conteggio dei sottoscrittori, chiuso quando l'ultimo si disiscrive.
 * Mai duplicare un handle di sistema operativo per la stessa cartella.
 *
 * ⭐ `.git`/`node_modules` esclusi dal WATCH (non dalla vista
 * dell'albero, che li mostra già se aperti a mano): sono le due
 * cartelle a più alto churn di qualunque progetto reale — un `git
 * status`/`npm install` rifarebbe scattare l'albero decine di volte
 * per un cambiamento che l'utente non è mai lì a guardare.
 *
 * ⭐ Debounce IBRIDO (ricerca 28/8): il timer si resetta ad ogni nuovo
 * evento (raffiche di scritture diventano UN solo segnale), ma un
 * tetto massimo forza comunque un invio anche durante una raffica
 * lunghissima — mai un'attesa indefinita.
 */
import { lstatSync, readdirSync, realpathSync, watch as watchReale } from 'node:fs';
import { dirname, isAbsolute, parse, relative, resolve, sep, win32 } from 'node:path';

const DEBOUNCE_MS = 400;
const TETTO_MASSIMO_MS = 2_000;
/*
 * Stato interno del server: viene scritto mentre una sessione è in corso.
 * Se il workspace scelto è la cartella Harness (o la radice del worktree),
 * osservarlo produrrebbe un feedback continuo: l'evento aggiorna la sessione,
 * la sessione scrive il proprio registro e il registro riattiva il watcher.
 * Queste directory non fanno parte dell'albero del progetto dell'owner e
 * restano leggibili tramite le loro API dedicate, quindi sono escluse dal
 * refresh automatico allo stesso modo di `.git` e `node_modules`.
 */
const IGNORATI = [
  /(^|[/\\])\.git([/\\]|$)/,
  /(^|[/\\])node_modules([/\\]|$)/,
  /(^|[/\\])\.(?:sessions-store|automations|generated-images|local-models|hooks-trust|mcp-trust|plugin-trust|notes-store|tasks-store|memory-store|tool-forge-store)([/\\]|$)/,
  /(^|[/\\])\.provider-runtime\.json$/,
];

function eRadiceVolume(cartella) {
  const assoluta = resolve(cartella);
  const radice = parse(assoluta).root;
  return assoluta === radice || dirname(assoluta) === assoluta;
}

/*
 * ⛔ 20/09/2026, CI di rilascio: `fs.watch` ricorsivo su un percorso con una
 * componente CORTA 8.3 (`C:\Users\RUNNER~1\…`) ABORTISCE il processo — assert
 * nativo `!_wcsnicmp(filename, dir, dirlen)` in libuv src/win/fs-event.c riga 72
 * (issue libuv #5010): il watcher nasce sul nome CORTO, ReadDirectoryChangesW
 * restituisce nomi LUNGHI, il confronto del prefisso non torna più. Il runner
 * GitHub imposta TEMP in forma corta di serie, e ogni suite che nasce in
 * `mkdtemp(join(tmpdir(), …))` ci finisce dentro. Non è intercettabile da
 * JavaScript: è un abort del processo. ⇒ La cartella si porta alla sua forma
 * LUNGA prima di osservarla. `realpathSync` normale NON espande le forme 8.3
 * (misurato il 13/09 su `C:/PROGRA~1`); quello NATIVO sì (misurato il 20/09:
 * `C:/PROGRA~1` → `C:\Program Files`). Se la forma lunga non è ottenibile
 * (cartella inesistente, come nei test con watcher finti) si osserva il
 * percorso com'è — il comportamento di sempre, non un guasto nuovo.
 *
 * ⛔ 12/10/2026, F-E-001 (S1, stress test della CLI 0.5.5, riprodotto nell'isolamento
 * vero): il ripiego «si osserva il percorso com'è» ERA il caso che abortisce. Dentro un
 * isolamento il realpath nativo è rifiutato (EPERM), oppure un precaricamento lo fa
 * ricadere sul realpath JavaScript, che torna SENZA errore e col nome ancora corto:
 * `C:\Users\me\DOWNLO~1\…` arrivava a fs.watch e il processo moriva con 0xC0000409.
 * Owner 12/10 («tutte e due»): (1) ogni segmento corto si ricostruisce per IDENTITÀ del
 * file — la voce della cartella madre con lo stesso dev+ino, una sola corrispondenza,
 * come la CLI (cli/src/security/real-path.ts, expandShortNames, f211ea03f); (2) se un
 * segmento corto resta non provato la cartella NON si sorveglia: niente aggiornamento
 * automatico, nessun abort (Cline, agenda-task-manager.ts:1453-1464, resolveWatchRoot:
 * senza la forma risolta non crea il watcher). È un passo oltre Cline, che rinuncia e basta.
 * Vale solo su Windows: altrove `~1` è un nome qualunque e libuv non ha quel confronto.
 */
const SEGMENTO_CORTO = /~\d/u;
const SEPARATORI = /[\\/]+/u;

function haUnSegmentoCorto(percorso) {
  const { root } = win32.parse(percorso);
  return percorso.slice(root.length).split(SEPARATORI).some((segmento) => SEGMENTO_CORTO.test(segmento));
}

const DISCO_VERO = {
  realpathNativo: (cartella) => realpathSync.native(cartella),
  elenca: (cartella) => readdirSync(cartella),
  // lstat, mai stat: un collegamento alla cartella (`Programmi` → `Program Files`) seguito è lo STESSO file, e due corrispondenze non provano niente
  identita: (percorso) => lstatSync(percorso, { bigint: true }),
};

/** Ogni segmento 8.3 sostituito dal nome lungo provato per identità; `null` se uno non si prova. */
function espandiNomiCorti(percorso, disco) {
  const { root } = win32.parse(percorso);
  let corrente = root;
  for (const segmento of percorso.slice(root.length).split(SEPARATORI).filter(Boolean)) {
    const prossimo = win32.join(corrente, segmento);
    if (!SEGMENTO_CORTO.test(segmento)) { corrente = prossimo; continue; }
    let nomi;
    let cercato;
    try {
      nomi = disco.elenca(corrente);
      cercato = disco.identita(prossimo);
    } catch {
      return null;
    }
    // una voce che si chiama davvero `note~1` è già il suo nome lungo
    if (nomi.includes(segmento)) { corrente = prossimo; continue; }
    // ino 0 = il filesystem non dà un'identità: non è una prova
    if (!cercato || cercato.ino === 0n) return null;
    const uguali = nomi.filter((nome) => {
      try {
        const voce = disco.identita(win32.join(corrente, nome));
        return voce.ino === cercato.ino && voce.dev === cercato.dev;
      } catch {
        return false;
      }
    });
    if (uguali.length !== 1) return null;
    corrente = win32.join(corrente, uguali[0]);
  }
  return corrente;
}

/**
 * La cartella da consegnare a fs.watch, oppure `null` quando sorvegliarla abortirebbe il processo.
 */
export function formaLungaPerLaSorveglianza(cartella, { piattaforma = process.platform, disco = DISCO_VERO } = {}) {
  let risolta = cartella;
  try {
    risolta = disco.realpathNativo(cartella);
  } catch {
    risolta = cartella;
  }
  if (piattaforma !== 'win32' || !haUnSegmentoCorto(risolta)) return risolta;
  return espandiNomiCorti(risolta, disco);
}

const guardati = new Map(); // cartella -> { watcher, controller, sottoscrittori: Set<fn>, timerDebounce, primoEventoRaffica, percorsiInSospeso }

function percorsoRelativoEvento(cartella, filename) {
  if (filename === null || filename === undefined) return '.';
  const grezzo = Buffer.isBuffer(filename) ? filename.toString('utf8') : String(filename);
  if (grezzo.length === 0) return '.';
  const assoluto = isAbsolute(grezzo) ? resolve(grezzo) : resolve(cartella, grezzo);
  const relativo = relative(resolve(cartella), assoluto);
  if (relativo === '' || relativo === '..' || relativo.startsWith(`..${sep}`)) return '.';
  return relativo.split(/[/\\]+/).join('/');
}

function percorsoIgnorato(percorso) {
  return percorso !== '.' && IGNORATI.some((rx) => rx.test(percorso));
}

export function creaGestoreWorkspaceWatcher({ watchFn = watchReale, piattaforma = process.platform, disco = DISCO_VERO } = {}) {
  /**
   * Sottoscrive `onCambiamento(percorsiRelativi)` ai cambiamenti REALI
   * (mai quelli della scansione iniziale — `ready` li separa) di
   * `cartella`. Torna una funzione di disiscrizione — MAI un throw:
   * un watcher che fallisce ad avviarsi (cartella inesistente,
   * permessi) degrada a "nessun refresh automatico", non rompe la
   * sessione che lo ha chiesto.
   */
  function guardaWorkspace(cartellaRichiesta, onCambiamento) {
    const cartella = formaLungaPerLaSorveglianza(cartellaRichiesta, { piattaforma, disco });
    // F-E-001: un nome corto non provato a fs.watch abortisce il processo (libuv #5010). Senza sorveglianza la sessione vive.
    if (cartella === null) return () => {};
    /*
     * Full access può indicare una radice come `C:\\`. Anche il watcher nativo
     * ricorsivo non deve trasformare l’intero volume in una sorgente di eventi
     * permanente prima che il modello riceva il primo messaggio. La radice resta
     * leggibile a richiesta tramite workspace-tree, ma non ha refresh automatico:
     * stato onesto e fail-closed, coerente con il lazy tree.
     */
    if (eRadiceVolume(cartella)) return () => {};
    let voce = guardati.get(cartella);
    if (!voce) {
      voce = { watcher: null, controller: null, sottoscrittori: new Set(), timerDebounce: null, primoEventoRaffica: 0, percorsiInSospeso: new Set() };
      guardati.set(cartella, voce);
      try {
        const controller = new AbortController();
        const watcher = watchFn(cartella, {
          recursive: true,
          persistent: false,
          encoding: 'utf8',
          ignore: IGNORATI,
          signal: controller.signal,
        }, (_evento, filename) => {
          const relativo = percorsoRelativoEvento(cartella, filename);
          // Il filtro nativo riduce gli eventi a monte; questo secondo guard
          // difende adapter finti, backend OS e versioni Node non omogenei.
          if (percorsoIgnorato(relativo)) return;
          voce.percorsiInSospeso.add(relativo);
          const adesso = Date.now();
          if (!voce.timerDebounce) voce.primoEventoRaffica = adesso;
          clearTimeout(voce.timerDebounce);
          const restaSulTetto = TETTO_MASSIMO_MS - (adesso - voce.primoEventoRaffica);
          const attesa = Math.max(0, Math.min(DEBOUNCE_MS, restaSulTetto));
          voce.timerDebounce = setTimeout(() => {
            const percorsi = [...voce.percorsiInSospeso];
            voce.percorsiInSospeso.clear();
            voce.timerDebounce = null;
            /*
             * ⛔⛔⛔ 28/8, trovato dal vivo: un `for...of` senza try/catch
             * ABORTISCE l'intero giro al primo sottoscrittore che lancia —
             * i sottoscrittori DOPO quello (in ordine di iscrizione, quindi
             * le sessioni create PIÙ DI RECENTE sulla stessa cartella) non
             * venivano mai notificati. Ogni sottoscrittore è isolato dagli
             * altri, come broadcast() già fa per i propri ascoltatori.
             */
            for (const s of voce.sottoscrittori) {
              try { s(percorsi); } catch { /* un sottoscrittore rotto non deve mai bloccare gli altri */ }
            }
          }, attesa);
        });
        watcher.on?.('error', () => { /* ⛔ degrado silenzioso per costruzione — vedi doc sopra: mai un throw che romperebbe la sessione */ });
        watcher.unref?.();
        voce.watcher = watcher;
        voce.controller = controller;
      } catch { /* stesso principio: nessun refresh automatico, non un guasto */ }
    }
    voce.sottoscrittori.add(onCambiamento);
    return () => {
      voce.sottoscrittori.delete(onCambiamento);
      if (voce.sottoscrittori.size === 0) {
        clearTimeout(voce.timerDebounce);
        voce.controller?.abort();
        try { voce.watcher?.close(); } catch { /* la chiusura via signal può averlo già chiuso */ }
        guardati.delete(cartella);
      }
    };
  }

  /** Solo per i test — mai chiamata da codice di produzione. */
  function quantiWatcherAttiviPerTest() {
    return guardati.size;
  }

  return { guardaWorkspace, quantiWatcherAttiviPerTest };
}

export const { guardaWorkspace } = creaGestoreWorkspaceWatcher();
