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
import { watch as watchReale } from 'node:fs';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

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

export function creaGestoreWorkspaceWatcher({ watchFn = watchReale } = {}) {
  /**
   * Sottoscrive `onCambiamento(percorsiRelativi)` ai cambiamenti REALI
   * (mai quelli della scansione iniziale — `ready` li separa) di
   * `cartella`. Torna una funzione di disiscrizione — MAI un throw:
   * un watcher che fallisce ad avviarsi (cartella inesistente,
   * permessi) degrada a "nessun refresh automatico", non rompe la
   * sessione che lo ha chiesto.
   */
  function guardaWorkspace(cartella, onCambiamento) {
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
