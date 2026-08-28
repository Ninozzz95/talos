/**
 * workspace-watcher.mjs — segnala quando i file di un workspace
 * cambiano FUORI dall'app (Explorer, un editor, git...). Piano
 * `elegant-spinning-dongarra.md`, owner 27/8: "se muovo i file il
 * work tree non si aggiorna automaticamente".
 *
 * ⛔ Ricerca fatta PRIMA di scrivere (28/8, REGOLA ZERO): `fs.watch`
 * nativo di Node ha difetti reali anche su Windows (più eventi per
 * salvataggio, nessun debounce — non solo "niente ricorsione su
 * Linux", quel difetto specifico non ci tocca dato che questo backend
 * gira SOLO su Windows). `chokidar` è lo standard de facto (VS Code,
 * webpack, vite, parcel lo usano) proprio perché normalizza questi
 * casi — owner 28/8 aveva già approvato dipendenze npm nel backend
 * (document_create): stessa eccezione, stesso motivo (Node non ha il
 * vincolo di first-paint del bundle browser), qui per un problema
 * diverso.
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
import chokidarReale from 'chokidar';

const DEBOUNCE_MS = 400;
const TETTO_MASSIMO_MS = 2_000;
const IGNORATI = [/(^|[/\\])\.git([/\\]|$)/, /(^|[/\\])node_modules([/\\]|$)/];

const guardati = new Map(); // cartella -> { watcher, sottoscrittori: Set<fn>, timerDebounce, primoEventoRaffica, percorsiInSospeso }

export function creaGestoreWorkspaceWatcher({ chokidar = chokidarReale } = {}) {
  /**
   * Sottoscrive `onCambiamento(percorsiRelativi)` ai cambiamenti REALI
   * (mai quelli della scansione iniziale — `ready` li separa) di
   * `cartella`. Torna una funzione di disiscrizione — MAI un throw:
   * un watcher che fallisce ad avviarsi (cartella inesistente,
   * permessi) degrada a "nessun refresh automatico", non rompe la
   * sessione che lo ha chiesto.
   */
  function guardaWorkspace(cartella, onCambiamento) {
    let voce = guardati.get(cartella);
    if (!voce) {
      voce = { watcher: null, sottoscrittori: new Set(), timerDebounce: null, primoEventoRaffica: 0, percorsiInSospeso: new Set() };
      guardati.set(cartella, voce);
      try {
        const watcher = chokidar.watch(cartella, {
          ignored: (percorso) => IGNORATI.some((rx) => rx.test(percorso)),
          ignoreInitial: true, // ⭐ mai un refresh per la scansione di avvio — solo cambiamenti VERI dopo che il watcher è pronto
          persistent: true,
        });
        watcher.on('all', (_evento, percorsoAssoluto) => {
          const relativo = percorsoAssoluto.slice(cartella.length).replace(/^[/\\]+/, '').split(/[/\\]+/).join('/');
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
            for (const s of voce.sottoscrittori) s(percorsi);
          }, attesa);
        });
        watcher.on('error', () => { /* ⛔ degrado silenzioso per costruzione — vedi doc sopra: mai un throw che romperebbe la sessione */ });
        voce.watcher = watcher;
      } catch { /* stesso principio: nessun refresh automatico, non un guasto */ }
    }
    voce.sottoscrittori.add(onCambiamento);
    return () => {
      voce.sottoscrittori.delete(onCambiamento);
      if (voce.sottoscrittori.size === 0) {
        clearTimeout(voce.timerDebounce);
        voce.watcher?.close();
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
