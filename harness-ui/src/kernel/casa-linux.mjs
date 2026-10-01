/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026) — il CLIENT dal lato Windows: un processo per sessione, acceso alla prima
 *   chiamata, che esegue gli attrezzi dei file nella casa Linux (`casa-linux-servente.mjs`).
 *
 * Misurato il 01/10/2026 (Ubuntu 26.04, WSL 2.7, Node 24.18 per Linux su C:): un Node per chiamata costerebbe ~280 ms a chiamata;
 *   un processo acceso costa 3,1 s a freddo / ~265 ms a caldo una volta, poi ~0,6 ms (file Linux) e ~1,5 ms (file di C:) a
 *   richiesta. ⇒ uno per sessione.
 * Avvio: `wsl -d <distro> [-u <utente F009>] --exec <node> <servente> <rg>` — lo STESSO utente della shell (F009), così i
 *   permessi Linux di file e comandi coincidono. Se il processo esce dopo essersi annunciato, le richieste in volo falliscono
 *   con il motivo (CASA_LINUX_USCITA) e la chiamata successiva lo riaccende; se esce prima, si rimandano una volta (sotto).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVENTE = join(dirname(fileURLToPath(import.meta.url)), 'casa-linux-servente.mjs');

/** `C:\x\y` → `/mnt/c/x/y`. Solo percorsi di un disco: il resto non è un posto da cui Linux possa eseguire. */
export function percorsoWindowsInWsl(percorso) {
  const m = /^([A-Za-z]):[\\/](.*)$/u.exec(String(percorso ?? ''));
  if (!m) throw new Error(`CASA_LINUX_PERCORSO: "${percorso}" non è su un disco di Windows`);
  return `/mnt/${m[1].toLowerCase()}/${m[2].split('\\').join('/')}`.replace(/\/+$/u, '');
}

function erroreDalServente(errore) {
  const e = new Error(errore?.message ?? 'errore della casa Linux');
  if (errore?.code) e.code = errore.code;
  if (errore?.path) e.path = errore.path;
  if (errore?.name && errore.name !== 'Error') e.name = errore.name;
  return e;
}

/**
 * @param {{ distro: string, utente?: string|null, node: string, rg: string, spawnFn?: Function }} opzioni
 *   `node`/`rg`: i binari per Linux (percorsi Windows, `verificaCasaLinux`).
 */
export function creaCasaLinux({ distro, utente = null, node, rg, env, spawnFn = spawn, avvisa = (testo) => console.warn(`[casa-linux] ${testo}`) }) {
  /* SPAWN-AMBIENTE-01: l'ambiente si DICHIARA (il kernel passa `ambienteSenzaCredenziali()`): mai quello intero del server, con
     dentro il token della API locale e le chiavi, nemmeno per wsl.exe. */
  if (!env || typeof env !== 'object') throw new TypeError('CASA_LINUX_ENV: serve l\'ambiente del processo (ambienteSenzaCredenziali).');
  /* Il processo acceso: `pronto` diventa vero quando il servente lo annuncia (ha importato il kernel e legge stdin). */
  let figlio = null;
  let prossimo = 0;
  /* id → { messaggio, rimandata, risolvi, rifiuta } */
  const attese = new Map();

  const falliscono = (motivo) => {
    for (const { rifiuta } of attese.values()) rifiuta(motivo);
    attese.clear();
  };
  const scrivi = (oggetto) => {
    try { figlio?.processo.stdin.write(`${JSON.stringify(oggetto)}\n`); return true; } catch { return false; }
  };

  /*
   * ⛔⛔ Il servizio di WSL a volte non risponde: `wsl.exe` resta appeso ~30 s e poi esce con `Wsl/Service/0x8007274c`
   *   (misurato il 01/10/2026 sotto avvii concorrenti; difetto noto: microsoft/WSL#12960, openai/codex#46703,
   *   stablyai/orca#20583). E l'errore `wsl.exe` lo scrive su STDOUT (misurato col `-u` di un utente inesistente), quindi
   *   ogni riga che non è del protocollo finisce nel motivo, insieme a stderr.
   * ⇒ Se il processo esce PRIMA che il servente annunci `pronto`, le richieste non sono mai arrivate di là: si rimandano UNA
   *   volta a un processo nuovo, anche le scritture, perché non sono state eseguite. Dopo l'annuncio non si rimanda niente: una
   *   scrittura potrebbe essere già avvenuta, e si dice che la casa si è fermata.
   */
  const avvia = () => {
    const argomenti = ['-d', distro, ...(utente ? ['-u', utente] : []), '--exec', percorsoWindowsInWsl(node), percorsoWindowsInWsl(SERVENTE), percorsoWindowsInWsl(rg)];
    const processo = spawnFn('wsl.exe', argomenti, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stato = { processo, pronto: false, errori: '' };
    const annota = (testo) => { stato.errori = `${stato.errori}${String(testo).replace(/\0/gu, '')}`.slice(-4096); };
    processo.stderr?.on('data', annota);
    createInterface({ input: processo.stdout }).on('line', (riga) => {
      let risposta;
      try { risposta = JSON.parse(riga); } catch { annota(`${riga}\n`); return; }
      if (risposta?.pronto === true) { stato.pronto = true; return; }
      const attesa = attese.get(risposta?.id);
      if (!attesa) return;
      attese.delete(risposta.id);
      if (risposta.ok) attesa.risolvi(risposta.valore);
      else attesa.rifiuta(erroreDalServente(risposta.errore));
    });
    /* `close`, non `exit`: arriva dopo che stdout è stato letto tutto, quindi `pronto` è già stato visto se è stato scritto. */
    processo.once('close', (codice) => {
      if (figlio !== stato) return;
      figlio = null;
      const testo = stato.errori.trim();
      const motivo = Object.assign(new Error(`CASA_LINUX_USCITA: la casa Linux si è fermata (uscita ${codice ?? 'sconosciuta'})${testo ? `: ${testo.slice(-600)}` : ''}`), { code: 'CASA_LINUX_USCITA' });
      if (stato.pronto) { falliscono(motivo); return; }
      const daRimandare = [];
      for (const [id, attesa] of attese) {
        if (attesa.rimandata) { attese.delete(id); attesa.rifiuta(motivo); }
        else daRimandare.push(attesa);
      }
      if (daRimandare.length === 0) return;
      /* Il rinvio costa l'attesa di wsl.exe (fino a ~30 s): si dice nel registro del server, mai un ripiego muto. */
      avvisa(`wsl.exe è uscito prima che la casa Linux partisse (uscita ${codice ?? 'sconosciuta'}${testo ? `: ${testo.slice(-300)}` : ''}); ${daRimandare.length === 1 ? '1 richiesta rimandata' : `${daRimandare.length} richieste rimandate`} a un processo nuovo.`);
      avvia();
      for (const attesa of daRimandare) { attesa.rimandata = true; scrivi(attesa.messaggio); }
    });
    processo.once('error', (errore) => {
      if (figlio !== stato) return;
      figlio = null;
      falliscono(Object.assign(new Error(`CASA_LINUX_AVVIO: ${errore.message}`), { code: 'CASA_LINUX_AVVIO' }));
    });
    figlio = stato;
    return stato;
  };

  /** Esegue `op` nella casa Linux. `segnale` (lo Stop del giro) annulla QUELLA richiesta: il servente resta acceso. */
  function chiama(op, args = {}, { segnale } = {}) {
    if (segnale?.aborted) return Promise.reject(Object.assign(new Error('fermato su richiesta'), { name: 'AbortError', code: 'ABORT_ERR' }));
    if (!figlio) avvia();
    const id = ++prossimo;
    const messaggio = { id, op, args };
    return new Promise((risolvi, rifiuta) => {
      const allStop = () => {
        if (!attese.has(id)) return;
        attese.delete(id);
        scrivi({ annulla: id });
        rifiuta(Object.assign(new Error('fermato su richiesta'), { name: 'AbortError', code: 'ABORT_ERR' }));
      };
      attese.set(id, {
        messaggio, rimandata: false,
        risolvi: (v) => { segnale?.removeEventListener?.('abort', allStop); risolvi(v); },
        rifiuta: (e) => { segnale?.removeEventListener?.('abort', allStop); rifiuta(e); },
      });
      segnale?.addEventListener?.('abort', allStop, { once: true });
      if (!scrivi(messaggio)) {
        attese.delete(id);
        rifiuta(Object.assign(new Error('CASA_LINUX_USCITA: la casa Linux non accetta richieste'), { code: 'CASA_LINUX_USCITA' }));
      }
    });
  }

  /** Chiude con la sessione: stdin chiuso (il servente ferma le ricerche ed esce), e dopo 2 s si uccide. */
  function chiudi() {
    const stato = figlio;
    if (!stato) return;
    figlio = null;
    falliscono(Object.assign(new Error('CASA_LINUX_CHIUSA: la sessione è finita'), { code: 'CASA_LINUX_CHIUSA' }));
    try { stato.processo.stdin.end(); } catch { /* già chiuso */ }
    const uccidi = setTimeout(() => { try { stato.processo.kill(); } catch { /* già uscito */ } }, 2000);
    uccidi.unref?.();
    stato.processo.once('exit', () => clearTimeout(uccidi));
  }

  /* `pronta`: il servente si è annunciato (kernel importato, stdin in lettura); `accesa` con `pronta` falso = sta ancora partendo. */
  return { chiama, chiudi, distro, utente, get accesa() { return figlio !== null; }, get pronta() { return figlio?.pronto === true; } };
}

/**
 * La casa Linux di UNA sessione (la tiene il registro, sulla voce): una per distro e utente. Se fra un giro e l'altro cambia
 * l'utente (l'interruttore di F009) o la distro predefinita, la vecchia si chiude e ne nasce una nuova; `chiudi` va con la
 * sessione (eliminazione, spegnimento del server).
 */
export function creaCasaLinuxSessione({ node, rg, env, crea = creaCasaLinux }) {
  let attuale = null;
  let chiave = null;
  return {
    prendi({ distro, utente = null }) {
      const nuova = `${distro}\0${utente ?? ''}`;
      if (nuova !== chiave) {
        attuale?.chiudi();
        attuale = crea({ distro, utente, node, rg, env });
        chiave = nuova;
      }
      return attuale;
    },
    chiudi() {
      attuale?.chiudi();
      attuale = null;
      chiave = null;
    },
  };
}
