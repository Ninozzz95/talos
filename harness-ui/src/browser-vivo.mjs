/**
 * browser-vivo.mjs — M1 (07/09/2026): il MOTORE del browser vivo, cioè far
 * vivere un Chromium che è NOSTRO.
 *
 * Perché esiste. La vista Browser incornicia le pagine con un `<iframe>`, e su
 * un sito che vieta la cornice resta un rettangolo grigio: misurato oggi, il
 * ripiego non scattava nemmeno, perché Chrome carica DENTRO la cornice la
 * propria pagina d'errore e spara un `load` regolare — la cornice non sa di
 * aver fallito. Il ripiego B è quindi un browser VERO: il Chromium già
 * installato sul computer (Chrome o Edge — su Windows 11 Edge c'è sempre),
 * avviato dal nostro server con un PROFILO SEPARATO e pilotato via CDP.
 *
 * ⛔ SICUREZZA, non negoziabile. La pagina di terzi è SEMPRE contenuto non
 * affidabile. Perciò: processo separato che non vede le nostre API; profilo in
 * una cartella nostra, MAI quello personale della persona (i suoi cookie e le
 * sue sessioni non entrano qui); porta di debug solo su loopback; e la sandbox
 * di Chrome resta ACCESA — vedi `argomentiChromium()`.
 *
 * Fonti lette il 07/09/2026, PRIMA di scrivere:
 * · chrome-launcher, `docs/chrome-flags-for-tools.md` — la lista dei flag per
 *   un browser pilotato e, testuale, che `--no-sandbox` «is not recommended»;
 *   lì stanno anche i flag RIMOSSI da Chrome (`--disable-infobars` via nel
 *   2019, `--headless=new` inutile dal 132 di gennaio 2025) che qui NON si
 *   scrivono.
 * · ChromeDevTools/devtools-protocol issue #55 (FAQ) — con
 *   `--remote-debugging-port=0` Chrome sceglie una porta libera e scrive
 *   l'indirizzo del browser SIA su stderr SIA nel file `DevToolsActivePort`
 *   dentro il profilo.
 * · Puppeteer, `waitForWSEndpoint` — la riga si riconosce con
 *   `/^DevTools listening on (ws:\/\/.*?)\r?$/`, letta A RIGHE da stderr.
 * · CDP, dominio Target — `flatten` «Enables "flat" access to the session via
 *   specifying sessionId attribute in the commands», e «We plan to make this
 *   the default, deprecate non-flattened mode, and eventually retire it»
 *   (crbug 991325).
 * · chromium issue 40096993 — dal 111 il server CDP risponde **403** a una
 *   stretta di mano WebSocket che porta un'intestazione `Origin` non
 *   dichiarata in `--remote-allow-origins`. Vedi `argomentiChromium()`: qui
 *   quel flag NON si passa, ed è una scelta motivata.
 *
 * ⛔ Nessuna dipendenza nuova: `node:child_process`, `node:fs`, `node:readline`
 * e il `ws` che il backend ha già. Il browser NON si avvia mai nei test —
 * `avvia` ed `esiste` stanno nel contratto proprio perché si possano fingere.
 */
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { urlAmmesso } from './browser-frame.mjs';

/** Tetto d'attesa della riga «DevTools listening on …»: oltre, errore parlante. */
export const ATTESA_AVVIO_MS = 20_000;
/** Tetto d'attesa di UNA risposta CDP: un comando che non torna non resta appeso per sempre. */
export const ATTESA_CDP_MS = 30_000;
/** Tetto d'attesa del caricamento di una pagina in `vaiA`. */
export const ATTESA_CARICAMENTO_MS = 20_000;
/** Quanto si concede al processo per uscire da solo prima di ucciderlo davvero. */
export const GRAZIA_CHIUSURA_MS = 3_000;

/**
 * La riga che Chrome stampa su stderr quando il server CDP è in piedi.
 * ⛔ Il `\r` finale è obbligatorio nel modello: su Windows la riga arriva con
 * il ritorno a capo dentro, e senza questo il ws finirebbe con un carattere
 * invisibile che poi rompe la connessione (è la stessa cura che sta nel
 * `waitForWSEndpoint` di Puppeteer, letto il 07/09/2026).
 */
const RIGA_DEVTOOLS = /^\s*DevTools listening on (ws:\/\/\S+?)\s*$/;

function errore(codice, messaggio, causa) {
  const e = new Error(messaggio);
  e.codice = codice;
  if (causa !== undefined) e.causa = causa;
  return e;
}

/** Toglie i doppioni tenendo il PRIMO: l'ordine dei candidati È la preferenza. */
function senzaDoppioni(elenco) {
  const visti = new Set();
  const fuori = [];
  for (const voce of elenco) {
    const v = String(voce || '').trim();
    if (!v || visti.has(v)) continue;
    visti.add(v);
    fuori.push(v);
  }
  return fuori;
}

/**
 * Il canale si legge dal PERCORSO. Edge si controlla PER PRIMO: il suo percorso
 * su macOS è «Microsoft Edge.app/Contents/MacOS/Microsoft Edge» e non contiene
 * «chrome», ma un domani un canale Dev potrebbe contenerlo — l'ordine dei
 * controlli è la difesa.
 * @param {string} percorso
 * @returns {'chrome'|'edge'|'chromium'}
 */
export function canaleDaPercorso(percorso) {
  const p = String(percorso || '').toLowerCase();
  if (p.includes('msedge') || p.includes('microsoft edge') || p.includes('microsoft-edge')) return 'edge';
  if (p.includes('chromium')) return 'chromium';
  if (p.includes('chrome')) return 'chrome';
  return 'chromium';
}

/**
 * I percorsi da provare, IN ORDINE di preferenza: prima quello dichiarato
 * dall'ambiente (se l'owner ha un binario suo, comanda lui), poi Chrome, poi
 * Edge, poi Chromium. ⛔ Qui non si tocca il disco: questa funzione dice solo
 * DOVE guardare — chi guarda è `trovaChromium`.
 * @param {string} piattaforma `process.platform`
 * @param {Record<string,string|undefined>} ambiente `process.env`
 * @returns {string[]}
 */
export function candidatiChromium(piattaforma = process.platform, ambiente = process.env) {
  const amb = ambiente || {};
  const dichiarato = amb.TALOS_CHROMIUM || amb.CHROME_PATH || '';
  const fuori = dichiarato ? [String(dichiarato)] : [];

  if (piattaforma === 'win32') {
    const radici = [amb.PROGRAMFILES, amb['PROGRAMFILES(X86)'], amb.LOCALAPPDATA].filter(Boolean);
    /* ⛔ Edge è un binario a 64 bit e sta comunque, per default, sotto
       «Program Files (x86)» (Microsoft Learn, 07/09/2026): la radice si prova
       tutte e tre le volte invece di scommettere su una sola. */
    for (const r of radici) fuori.push(`${r}\\Google\\Chrome\\Application\\chrome.exe`);
    for (const r of radici) fuori.push(`${r}\\Microsoft\\Edge\\Application\\msedge.exe`);
    for (const r of radici) fuori.push(`${r}\\Chromium\\Application\\chrome.exe`);
    return senzaDoppioni(fuori);
  }

  if (piattaforma === 'darwin') {
    const casa = amb.HOME || '';
    fuori.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    if (casa) fuori.push(`${casa}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`);
    fuori.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    if (casa) fuori.push(`${casa}/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`);
    fuori.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
    return senzaDoppioni(fuori);
  }

  if (piattaforma === 'linux') {
    fuori.push('/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome');
    fuori.push('/usr/bin/microsoft-edge-stable', '/usr/bin/microsoft-edge');
    fuori.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium');
    return senzaDoppioni(fuori);
  }

  /* Una piattaforma che non conosciamo non riceve percorsi INVENTATI: resta il
     solo binario dichiarato dall'ambiente, se c'è. Meglio zero candidati che
     una lista che finge di sapere. */
  return senzaDoppioni(fuori);
}

/**
 * Il primo candidato che esiste DAVVERO sul disco.
 * @param {{piattaforma?:string, ambiente?:Record<string,string|undefined>, esiste?:(percorso:string)=>boolean}} deps
 * @returns {{percorso:string, canale:'chrome'|'edge'|'chromium'}|null}
 */
export function trovaChromium({ piattaforma = process.platform, ambiente = process.env, esiste } = {}) {
  /*
   * ⛔⛔ 07/9 — qui il ripiego era `() => false`: senza il parametro `esiste` la funzione
   *   rispondeva SEMPRE «nessun browser», cioè era INERTE PER COSTRUZIONE fuori dai test. Trovato
   *   dal vivo al primo giro vero: Chrome era al suo posto
   *   (`C:\Program Files\Google\Chrome\Application\chrome.exe`) e la app diceva di non trovarlo.
   *   È la stessa famiglia del cancello semantico spento da sempre: un ripiego che non guarda
   *   niente supera ogni prova finché nessuno gli chiede la verità.
   * ⇒ Il ripiego è la domanda VERA al disco; l'iniezione resta, e serve ai test.
   */
  const guarda = typeof esiste === 'function' ? esiste : ((dove) => existsSync(dove));
  for (const percorso of candidatiChromium(piattaforma, ambiente)) {
    let c = false;
    try { c = Boolean(guarda(percorso)); } catch { c = false; }
    if (c) return { percorso, canale: canaleDaPercorso(percorso) };
  }
  return null;
}

/**
 * Gli argomenti di un Chromium PILOTATO nel 2026 (fonte: chrome-launcher,
 * `chrome-flags-for-tools.md`, letto il 07/09/2026).
 *
 * ⛔ Quello che NON c'è, e perché:
 * · `--no-sandbox` — la documentazione di chrome-launcher lo dichiara «not
 *   recommended», e qui la pagina caricata è contenuto ostile per definizione:
 *   la sandbox è esattamente il muro che ci serve. Non si spegne, mai.
 * · `--remote-allow-origins=*` — servirebbe solo a un client che manda
 *   l'intestazione `Origin` nella stretta di mano (chromium 40096993, il 403
 *   dal Chrome 111). Il nostro client è `ws` da Node e NON manda `Origin`;
 *   metterlo a `*` aprirebbe l'endpoint di debug a QUALUNQUE pagina web aperta
 *   in quel browser — cioè al contenuto non affidabile che stiamo isolando.
 * · `--disable-dev-shm-usage` — è una cura per `/dev/shm` piccola dentro
 *   Docker; qui il browser gira sul computer della persona.
 * · `--headless=new` — ⛔ 08/09/2026, owner: «non si devono aprire schede chrome in bg». Fino a
 *   oggi qui c'era scritto il contrario («la finestra serve viva») ed era una premessa mai
 *   misurata: una finestra vera spuntava sullo schermo della persona, e restava li' mentre lei
 *   lavorava. MISURATO prima di cambiarla (C35 nello scratchpad): stessa pagina animata, 6 secondi,
 *   **599 fotogrammi** con la finestra davanti, **599** con la finestra coperta da un'altra e
 *   **599** in headless. Il compositore produce lo stesso, e lo screencast li prende lo stesso.
 *   ⇒ la finestra non serviva a vedere: serviva solo a disturbare.
 *
 * @param {{cartellaProfilo:string, porta?:number}} opzioni
 * @returns {string[]}
 */
/**
 * Lo user agent di Chrome senza la parola «Headless»: in headless Chrome la aggiunge da se', e
 * alcuni siti servono una pagina diversa (o un blocco) a chi la porta. Non si finge un altro
 * browser — versione, sistema e motore restano quelli veri: si toglie solo l'etichetta.
 */
export function userAgentSenzaHeadless(agente = AGENTE_PREDEFINITO) {
  return String(agente).replace(/HeadlessChrome/gi, 'Chrome');
}

export const AGENTE_PREDEFINITO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function argomentiChromium({ cartellaProfilo, porta = 0 } = {}) {
  if (!cartellaProfilo) throw errore('BROWSER_VIVO_PROFILO_MANCANTE', 'Serve la cartella del profilo: il browser pilotato non usa mai quello personale');
  return [
    /* ⛔ Porta 0: la sceglie Chrome e la leggiamo dalla riga su stderr. Una
       porta fissa è un conflitto che prima o poi capita — due sessioni, o un
       altro strumento che l'ha già presa. */
    `--remote-debugging-port=${porta}`,
    /* Il profilo è NOSTRO. È questo flag, non una promessa, a tenere fuori i
       cookie e le sessioni della persona. */
    `--user-data-dir=${cartellaProfilo}`,
    /* Niente primo avvio, niente «vuoi Chrome come predefinito», niente app di
       default installate al volo. */
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    /* Niente finestre di aggiornamento né traffico di componenti. */
    '--disable-component-update',
    '--disable-sync',
    /* Niente ripristino di sessione: un profilo pilotato che si riapre con le
       schede di ieri è uno stato che nessuno ha chiesto. */
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    /* ⛔ Senza questi tre, una finestra coperta o in secondo piano viene
       strozzata dal browser e ogni misura di fluidità diventa falsa (lezione
       già pagata: `requestAnimationFrame` a ~1/s su una finestra occlusa). */
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    /* Niente estensioni (il profilo è nuovo, ma un profilo aziendale con
       policy potrebbe iniettarle) e niente richieste di permesso che bloccano
       l'agente aspettando un clic umano. */
    '--disable-extensions',
    '--deny-permission-prompts',
    '--disable-notifications',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    /* ⛔ Nessuna finestra sullo schermo di chi lavora. `--headless=new` e' lo stesso browser
       completo (stesso rendering, stesse estensioni possibili, stesso compositore): dal 132 il
       vecchio headless non esiste piu' e `--headless` da solo significa gia' questo, ma il nome
       esplicito dice a chi legge QUALE dei due si intende. */
    '--headless=new',
    /* ⛔ In headless lo user agent contiene «HeadlessChrome» e alcuni siti lo rifiutano o servono
       una pagina diversa: la lettura sarebbe di un'altra pagina rispetto a quella che la persona
       vede nel suo browser. Si toglie la parola, non si finge un altro browser. */
    `--user-agent=${userAgentSenzaHeadless()}`,
    /* Si parte da una pagina vuota: la «nuova scheda» di Chrome fa rete e
       mostra contenuti che non c'entrano niente con noi. */
    'about:blank',
  ];
}

/**
 * Avvia il browser e risolve quando il server CDP RISPONDE DAVVERO — cioè
 * quando la riga «DevTools listening on ws://…» è arrivata su stderr. Prima di
 * quella riga il processo esiste ma non è pilotabile: dire «avviato» lì
 * sarebbe dire una cosa che non è vera.
 *
 * @param {{percorso:string, cartellaProfilo:string, avvia?:Function, attesaMs?:number, creaCartella?:Function, terminaAlbero?:Function}} opzioni
 * @returns {Promise<{pid:number|null, wsUrl:string, percorso:string, chiudi:()=>Promise<{chiuso:boolean, modo:string}>, processo:object}>}
 */
export async function avviaBrowserVivo({
  percorso,
  cartellaProfilo,
  avvia,
  attesaMs = ATTESA_AVVIO_MS,
  creaCartella = (dove) => mkdirSync(dove, { recursive: true }),
  terminaAlbero = terminaAlberoDiSistema,
  graziaMs = GRAZIA_CHIUSURA_MS,
} = {}) {
  if (!percorso) throw errore('BROWSER_VIVO_SENZA_BINARIO', 'Nessun Chromium da avviare: manca il percorso del binario');
  if (!cartellaProfilo) throw errore('BROWSER_VIVO_PROFILO_MANCANTE', 'Serve la cartella del profilo: il browser pilotato non usa mai quello personale');

  /* La cartella del profilo si crea se manca: Chrome la creerebbe da sé, ma
     allora un errore di permessi arriverebbe come «il browser non è partito»
     invece che come quello che è. */
  try { creaCartella(cartellaProfilo); } catch (causa) {
    throw errore('BROWSER_VIVO_PROFILO_NON_CREABILE', `Non riesco a creare la cartella del profilo (${cartellaProfilo})`, causa);
  }

  const argomenti = argomentiChromium({ cartellaProfilo });
  const lancia = typeof avvia === 'function' ? avvia : avviaDiSistema;
  let processo;
  try { processo = lancia(percorso, argomenti); } catch (causa) {
    throw errore('BROWSER_VIVO_NON_PARTE', `Non riesco ad avviare il browser (${percorso})`, causa);
  }
  if (!processo || !processo.stderr) {
    throw errore('BROWSER_VIVO_SENZA_STDERR', 'Il browser è partito senza stderr: la porta di debug si legge solo da lì');
  }

  const chiudi = creaChiusura(processo, terminaAlbero, graziaMs);
  let wsUrl;
  try {
    wsUrl = await attendiWsUrl(processo, attesaMs);
  } catch (causa) {
    /* ⛔ Se non è arrivato l'indirizzo, il processo NON si lascia in giro: un
       Chromium orfano con un profilo nostro è un consumo che nessuno vedrà. */
    await chiudi().catch(() => {});
    throw causa;
  }
  return { pid: processo.pid ?? null, wsUrl, percorso, processo, chiudi };
}

/** Il lancio vero. `stdio` con stderr a tubo: è la nostra unica fonte per la porta. */
function avviaDiSistema(percorso, argomenti) {
  return spawn(percorso, argomenti, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
}

/**
 * Legge stderr A RIGHE finché non trova l'indirizzo. ⛔ A pezzi (`on('data')`)
 * non funzionerebbe: la riga può arrivare spezzata in due chunk.
 */
function attendiWsUrl(processo, attesaMs) {
  return new Promise((risolvi, rifiuta) => {
    const lettore = createInterface({ input: processo.stderr });
    const coda = [];
    let finito = false;
    const chiudiLettore = () => { try { lettore.close(); } catch { /* già chiuso */ } };
    const finisci = (fn, valore) => {
      if (finito) return;
      finito = true;
      clearTimeout(scadenza);
      chiudiLettore();
      processo.off?.('exit', suUscita);
      processo.off?.('error', suErrore);
      fn(valore);
    };
    const scadenza = setTimeout(() => {
      finisci(rifiuta, errore(
        'BROWSER_VIVO_ATTESA_SCADUTA',
        `Il browser non ha annunciato la porta di debug entro ${Math.round(attesaMs / 1000)} secondi. Ultime righe: ${coda.join(' | ') || '(nessuna)'}`,
      ));
    }, attesaMs);
    scadenza.unref?.();

    const suUscita = (codice) => finisci(rifiuta, errore(
      'BROWSER_VIVO_USCITO_SUBITO',
      `Il browser è uscito (codice ${codice}) prima di annunciare la porta di debug. Ultime righe: ${coda.join(' | ') || '(nessuna)'}`,
    ));
    const suErrore = (causa) => finisci(rifiuta, errore('BROWSER_VIVO_NON_PARTE', 'Il browser non è partito', causa));
    processo.on?.('exit', suUscita);
    processo.on?.('error', suErrore);

    lettore.on('line', (riga) => {
      /* Le ultime righe si tengono: se scade l'attesa, l'errore deve DIRE cosa
         il browser stava dicendo, non solo che il tempo è finito. */
      coda.push(String(riga).trim());
      if (coda.length > 5) coda.shift();
      const trovato = RIGA_DEVTOOLS.exec(String(riga));
      if (trovato) finisci(risolvi, trovato[1]);
    });
    lettore.on('close', () => {
      if (!finito) finisci(rifiuta, errore('BROWSER_VIVO_STDERR_CHIUSO', 'Lo stderr del browser si è chiuso senza annunciare la porta di debug'));
    });
  });
}

/**
 * Chiude DAVVERO. Non si chiede al browser via CDP di chiudersi: se il
 * problema è proprio che CDP non risponde, quella strada è chiusa per
 * definizione. Si va al processo.
 */
function creaChiusura(processo, terminaAlbero, graziaMs = GRAZIA_CHIUSURA_MS) {
  let gia = false;
  return async function chiudi() {
    if (gia) return { chiuso: true, modo: 'già chiuso' };
    gia = true;
    if (processo.exitCode !== null && processo.exitCode !== undefined) return { chiuso: true, modo: 'era già uscito' };

    const uscita = new Promise((r) => {
      if (typeof processo.once === 'function') processo.once('exit', () => r(true));
      else r(false);
    });

    let modo = 'segnale';
    try {
      const fatto = await Promise.resolve(terminaAlbero(processo));
      if (fatto) modo = 'albero';
    } catch { /* si prosegue col segnale: un fallimento qui non è una scusa */ }

    const scaduto = new Promise((r) => { const t = setTimeout(() => r(false), graziaMs); t.unref?.(); });
    const uscitoInTempo = await Promise.race([uscita, scaduto]);
    if (uscitoInTempo) return { chiuso: true, modo };

    /* ⛔ Ultima parola: SIGKILL. Un `taskkill` che fallisce o un processo che
       ignora il segnale non devono lasciare un browser vivo. */
    try { processo.kill?.('SIGKILL'); } catch { /* già morto */ }
    return { chiuso: true, modo: 'forzata' };
  };
}

/**
 * Su Windows i figli di Chrome (renderer, GPU, utility) NON muoiono col padre:
 * si uccide l'albero con `taskkill /T /F`. Altrove basta il segnale al gruppo.
 */
function terminaAlberoDiSistema(processo) {
  const pid = processo?.pid;
  if (!pid) return false;
  if (process.platform === 'win32') {
    return new Promise((r) => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => r(true));
    });
  }
  try { processo.kill('SIGTERM'); } catch { /* già morto */ }
  return true;
}

/**
 * Il client CDP: un contatore di id, una mappa delle richieste in volo, e gli
 * eventi smistati per nome.
 *
 * `socket` è un WebSocket alla maniera di `ws` (già dipendenza del backend):
 * `send`, `close`, e `on('message'|'close'|'error')`. Nei test è un finto con
 * la stessa forma — per questo il socket lo passa il chiamante e non lo apre
 * questo modulo.
 *
 * @param {{send:Function, close?:Function, on?:Function, addEventListener?:Function}} socket
 * @param {{attesaMs?:number}} opzioni
 */
export function creaClientCdp(socket, { attesaMs = ATTESA_CDP_MS } = {}) {
  if (!socket || typeof socket.send !== 'function') throw errore('CDP_SOCKET_INVALIDO', 'Serve un WebSocket con «send» per parlare col browser');

  let prossimoId = 1;
  let chiuso = false;
  const inVolo = new Map();
  const ascoltatori = new Map();

  const ascolta = (evento, cb) => {
    if (typeof socket.on === 'function') socket.on(evento, cb);
    else if (typeof socket.addEventListener === 'function') socket.addEventListener(evento, (e) => cb(evento === 'message' ? e.data : e));
  };

  function smista(messaggio) {
    let m;
    try { m = JSON.parse(typeof messaggio === 'string' ? messaggio : String(messaggio)); } catch { return; }
    if (m && m.id !== undefined && inVolo.has(m.id)) {
      const attesa = inVolo.get(m.id);
      inVolo.delete(m.id);
      clearTimeout(attesa.scadenza);
      if (m.error) {
        /* ⛔ L'errore del browser si riporta INTERO: il codice e il messaggio
           veri. Un «comando fallito» generico costringe chi legge a indovinare. */
        attesa.rifiuta(errore('CDP_ERRORE', `${attesa.metodo}: ${m.error.message || 'errore senza messaggio'} (codice ${m.error.code ?? 'ignoto'})`, m.error));
      } else {
        attesa.risolvi(m.result ?? {});
      }
      return;
    }
    if (m && m.method) {
      const contesto = { sessionId: m.sessionId ?? null, metodo: m.method };
      for (const cb of ascoltatori.get(m.method) || []) { try { cb(m.params ?? {}, contesto); } catch { /* un ascoltatore rotto non ferma gli altri */ } }
      for (const cb of ascoltatori.get('*') || []) { try { cb(m.params ?? {}, contesto); } catch { /* idem */ } }
    }
  }

  function abbandonaTutti(motivo) {
    for (const [, attesa] of inVolo) {
      clearTimeout(attesa.scadenza);
      attesa.rifiuta(errore('CDP_SOCKET_CHIUSO', `${attesa.metodo}: ${motivo}`));
    }
    inVolo.clear();
  }

  ascolta('message', smista);
  ascolta('close', () => { chiuso = true; abbandonaTutti('la connessione col browser si è chiusa'); });
  ascolta('error', () => { chiuso = true; abbandonaTutti('la connessione col browser è andata in errore'); });

  /**
   * @param {string} metodo es. `Page.navigate`
   * @param {object} parametri
   * @param {string|null} sessionId ⛔ in modo «flat» il sessionId viaggia in
   *   OGNI messaggio destinato a una scheda: senza, il comando finisce al
   *   browser invece che alla pagina.
   */
  function invia(metodo, parametri = {}, sessionId = null) {
    if (chiuso) return Promise.reject(errore('CDP_SOCKET_CHIUSO', `${metodo}: la connessione col browser è già chiusa`));
    const id = prossimoId++;
    const messaggio = { id, method: metodo, params: parametri || {} };
    if (sessionId) messaggio.sessionId = sessionId;
    return new Promise((risolvi, rifiuta) => {
      const scadenza = setTimeout(() => {
        inVolo.delete(id);
        rifiuta(errore('CDP_ATTESA_SCADUTA', `${metodo}: nessuna risposta dal browser entro ${Math.round(attesaMs / 1000)} secondi`));
      }, attesaMs);
      scadenza.unref?.();
      inVolo.set(id, { risolvi, rifiuta, scadenza, metodo });
      try {
        socket.send(JSON.stringify(messaggio));
      } catch (causa) {
        inVolo.delete(id);
        clearTimeout(scadenza);
        rifiuta(errore('CDP_INVIO_FALLITO', `${metodo}: non riesco a scrivere sulla connessione col browser`, causa));
      }
    });
  }

  /** Ritorna la funzione per STACCARSI: un ascoltatore che nessuno può togliere è una perdita. */
  function su(evento, cb) {
    if (!ascoltatori.has(evento)) ascoltatori.set(evento, new Set());
    ascoltatori.get(evento).add(cb);
    return () => { ascoltatori.get(evento)?.delete(cb); };
  }

  function chiudiClient() {
    chiuso = true;
    abbandonaTutti('il client è stato chiuso');
    ascoltatori.clear();
    try { socket.close?.(); } catch { /* un socket già morto non si richiude */ }
  }

  return { invia, su, chiudi: chiudiClient };
}

/**
 * Apre una scheda vuota e ci si aggancia.
 *
 * ⛔ `flatten: true` è obbligatorio, non un'opzione. La documentazione del
 * dominio Target (letta il 07/09/2026) dice testualmente: «Enables "flat"
 * access to the session via specifying sessionId attribute in the commands.
 * We plan to make this the default, deprecate non-flattened mode, and
 * eventually retire it» (crbug 991325). Nel modo vecchio i messaggi della
 * scheda viaggiavano incapsulati dentro `Target.sendMessageToTarget` e gli
 * eventi dentro `Target.receivedMessageFromTarget`: una busta dentro la busta.
 * Nel modo flat il `sessionId` sta in cima a ogni messaggio — ed è così che il
 * resto di questo modulo (e i quattro moduli che ci si appoggiano) parla con
 * la pagina.
 *
 * @param {{invia:Function}} cdp
 * @returns {Promise<{targetId:string, sessionId:string}>}
 */
export async function apriSchedaVuota(cdp, { url = 'about:blank', browserContextId = null } = {}) {
  /*
   * ⛔ 07/9 — `browserContextId` non è un dettaglio: le schede aperte nel contesto PREDEFINITO si
   *   scambiano cookie, localStorage e sessionStorage, quindi due sessioni di TALOS che aprono due
   *   pagine si vedrebbero i dati a vicenda. Il contesto è un confine di STORAGE (non di finestra:
   *   schede di contesti diversi convivono nella stessa finestra). Chi apre la scheda decide se
   *   isolarla; qui si passa solo ciò che il chiamante ha chiesto.
   *   Ricerca 07/09/2026: vercel-labs/agent-browser #1068, guida CDP di browser-use.
   */
  const creata = await cdp.invia('Target.createTarget', browserContextId ? { url, browserContextId } : { url });
  const targetId = creata?.targetId;
  if (!targetId) throw errore('BROWSER_VIVO_SCHEDA_SENZA_ID', 'Il browser ha aperto una scheda senza dirci il suo identificativo');
  const agganciata = await cdp.invia('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = agganciata?.sessionId;
  if (!sessionId) throw errore('BROWSER_VIVO_SESSIONE_MANCANTE', 'Il browser non ha assegnato una sessione alla scheda: senza sessionId non si può pilotare');
  return { targetId, sessionId };
}

/** Traduce i `net::ERR_…` di Chrome in una frase che una persona può leggere. */
function motivoDiRete(testo) {
  const t = String(testo || '');
  if (/ERR_NAME_NOT_RESOLVED/.test(t)) return 'Il nome del sito non esiste';
  if (/ERR_CONNECTION_REFUSED/.test(t)) return 'Nessuno risponde a quell\'indirizzo';
  if (/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/.test(t)) return 'Il sito non ha risposto in tempo';
  if (/ERR_CERT|ERR_SSL/.test(t)) return 'Il certificato del sito non è valido';
  if (/ERR_ABORTED/.test(t)) return 'Il caricamento è stato interrotto';
  if (/ERR_BLOCKED_BY/.test(t)) return 'Il browser ha bloccato la pagina';
  return t || 'La pagina non si è caricata';
}

/**
 * Porta la scheda a un indirizzo e dice com'è andata DAVVERO.
 *
 * ⛔ `Page.navigate` non riporta lo stato HTTP: da solo direbbe «ok» anche su
 * un 404 o un 500 (la pagina d'errore del sito È una pagina che si carica —
 * è lo stesso inganno per cui la cornice `<iframe>` non si accorgeva del
 * fallimento). Perciò si accende anche `Network`, si prende lo stato dalla
 * risposta del documento principale e si aspetta che il frame smetta di
 * caricare.
 *
 * Il filtro sugli indirizzi è quello che il repo ha già, `urlAmmesso` di
 * `browser-frame.mjs`: solo `http:`/`https:` (fuori `file:`, `chrome:`,
 * `devtools:`, `view-source:` — con cui una pagina ostile leggerebbe il disco
 * o si prenderebbe il browser) e mai credenziali nell'indirizzo. ⛔ Loopback e
 * indirizzi privati restano AMMESSI di proposito: `localhost:5173` è il motivo
 * per cui questo browser esiste — sta dove sta l'agente, ed è il vantaggio che
 * un gateway in cloud non può avere.
 *
 * @param {{invia:Function, su:Function}} cdp
 * @param {string} sessionId
 * @param {string} url
 * @returns {Promise<{ok:boolean, stato:number|null, errore:string|null, url:string}>}
 */
export async function vaiA(cdp, sessionId, url, { attesaMs = ATTESA_CARICAMENTO_MS } = {}) {
  let indirizzo;
  try { indirizzo = new URL(String(url)); } catch {
    return { ok: false, stato: null, errore: 'URL non valido', url: String(url) };
  }
  const ammesso = urlAmmesso(indirizzo);
  if (!ammesso.ok) return { ok: false, stato: null, errore: ammesso.motivo, url: indirizzo.href };

  await cdp.invia('Page.enable', {}, sessionId);
  await cdp.invia('Network.enable', {}, sessionId);

  /* Gli stati dei documenti si raccolgono PRIMA di navigare: il frameId lo
     conosciamo solo dopo, e la risposta può arrivare prima che `Page.navigate`
     abbia risolto. */
  const statiPerFrame = new Map();
  const staccaRisposta = cdp.su('Network.responseReceived', (p) => {
    if (p?.type === 'Document' && p?.frameId) statiPerFrame.set(p.frameId, p?.response?.status ?? null);
  });

  let fine;
  const caricata = new Promise((r) => { fine = r; });
  let frameAtteso = null;
  /* ⛔ La fine del caricamento può arrivare PRIMA che `Page.navigate` ci abbia
     detto quale riquadro guardare: senza memoria, quel caso resterebbe in
     attesa fino allo scadere del tetto e verrebbe raccontato come «lenta». */
  const fermiVisti = new Set();
  let loadVisto = false;
  const controlla = (p) => {
    if (p?.frameId) fermiVisti.add(p.frameId);
    if (frameAtteso && p?.frameId === frameAtteso) fine('caricata');
  };
  const staccaFermo = cdp.su('Page.frameStoppedLoading', controlla);
  const staccaLoad = cdp.su('Page.loadEventFired', () => { loadVisto = true; if (frameAtteso) fine('caricata'); });

  const smonta = () => { staccaRisposta(); staccaFermo(); staccaLoad(); };

  try {
    const esito = await cdp.invia('Page.navigate', { url: indirizzo.href }, sessionId);
    if (esito?.errorText) {
      return { ok: false, stato: null, errore: motivoDiRete(esito.errorText), url: indirizzo.href };
    }
    frameAtteso = esito?.frameId || null;
    if (!frameAtteso) return { ok: false, stato: null, errore: 'Il browser non ha detto quale riquadro sta caricando', url: indirizzo.href };
    if (fermiVisti.has(frameAtteso) || loadVisto) fine('caricata');
    /* Se la risposta era già arrivata mentre navigavamo, non si aspetta a vuoto. */
    const scaduta = new Promise((r) => { const t = setTimeout(() => r('scaduta'), attesaMs); t.unref?.(); });
    const come = await Promise.race([caricata, scaduta]);
    const stato = statiPerFrame.has(frameAtteso) ? statiPerFrame.get(frameAtteso) : null;
    if (come === 'scaduta') {
      return { ok: false, stato, errore: `La pagina non ha finito di caricare entro ${Math.round(attesaMs / 1000)} secondi`, url: indirizzo.href };
    }
    /* ⛔ Uno stato HTTP di errore È un fallimento, anche se il documento si è
       caricato: è esattamente il caso che la cornice non sapeva vedere. */
    if (typeof stato === 'number' && stato >= 400) {
      return { ok: false, stato, errore: `Il sito ha risposto ${stato}`, url: indirizzo.href };
    }
    return { ok: true, stato, errore: null, url: indirizzo.href };
  } catch (causa) {
    return { ok: false, stato: null, errore: causa?.message || 'Il browser non ha eseguito la navigazione', url: indirizzo.href };
  } finally {
    smonta();
  }
}

/**
 * La riga che Chrome stampa su stderr → l'indirizzo del server CDP, o `null`.
 * ⛔ Solo `ws://`: una riga che parla d'altro non è un indirizzo, e restituire
 * qualcosa «che ci somiglia» qui vorrebbe dire fallire più avanti, dove è più
 * difficile capire perché.
 * @param {string} riga
 * @returns {string|null}
 */
export function wsUrlDaRiga(riga) {
  const trovato = RIGA_DEVTOOLS.exec(String(riga ?? ''));
  return trovato ? trovato[1] : null;
}
