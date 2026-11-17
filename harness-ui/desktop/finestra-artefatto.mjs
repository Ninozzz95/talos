/*
 * ⭐ 0.2.1-ART D1 (09/11/2026; owner sulla 0.2.0: «non si può aprire a parte»; vincolo del giudice delle 19:13) — LA FINESTRA DELL'ARTEFATTO.
 *   «Apri» della carta di un artefatto apriva `about:blank` e ci posava poi la pagina: nell'app PC il gestore delle finestre nuove della
 *   principale (main.mjs) nega TUTTO, quindi nessuna finestra, e la carta diceva «Il browser ha bloccato la nuova scheda».
 * ⇒ La forma degli aggiornamenti e del menu (`canale-aggiornamenti.mjs`, `barra-finestra.mjs`), senza ponte nuovo:
 *   · guscio → pagina: a ogni caricamento `executeJavaScript` posa il gettone in `window.__talosGuscioArtefatti` (solo la cornice
 *     principale: una pagina resa in chat vive in una cornice a origine nulla e non lo legge);
 *   · pagina → guscio: `window.open('talos-desktop://artefatto?gettone=…&pagina=/api/v1/pagine/<lasciapassare>/<nome>')`, NEGATO qui;
 *     col gettone giusto e la pagina in forma il guscio apre LUI una finestra sua.
 * ⛔ La finestra (Electron security §2-5, §13-14; Hermes `apps/desktop/electron/challenge-window.ts:113-144` e `window-open-policy.ts:11-16`):
 *   `sandbox`, `contextIsolation`, niente `nodeIntegration`, niente preload, niente `webview`; una sessione IN MEMORIA sua (niente cookie
 *   di TALOS: la rotta delle pagine vive del lasciapassare, `http-app.mjs`), permessi negati e scaricamenti annullati; `window.open` →
 *   deny anche lì; la navigazione e i rimandi restano dentro il lasciapassare di quell'artefatto (la regola della cornice in chat,
 *   `runtime.mjs` `navigazioneCorniceConsentita`). La CSP è quella che il server dà già all'anteprima (`sandbox allow-scripts; …`).
 * ⛔ Mai `openExternal` di un artefatto (Electron security §15; Hermes `preview-artifact.tsx:51-73` lo fa, noi no): fuori da TALOS
 *   perderebbe la CSP del server.
 *
 * ⭐ 0.2.2, giro di sicurezza 2 (10/11/2026; revisione 3 reperto 1 MEDIO, giudice v1301) — LA RETE DELLE PAGINE RESE.
 *   Misurato con Electron 44.3.0 (Chrome 152) e un finto STUN/TURN su 127.0.0.1: una pagina resa con `connect-src 'none'` crea
 *   `RTCPeerConnection` e i pacchetti arrivano a host e porta scelti da lei (UDP allo STUN, TCP al TURN), dalla finestra dell'artefatto e
 *   dall'anteprima in chat (era già così nella 0.2.0). `webrtc 'block'` nella politica non è applicato; la sola politica WebRTC lascia
 *   passare il TCP; il solo proxy lascia l'UDP.
 * ⇒ Tre strati, ognuno misurato da solo a 0 UDP e 0 TCP (`tests/finestra-artefatto-rete.spec.mjs`). Il terzo canale è il NOME del
 *   server (`stun:<dato>.attaccante`: il dato esce nella domanda al DNS): lo chiude lo strato 1; gli strati 2 e 3 da soli NO per il nome
 *   del TURN (Chromium lo risolve prima di passare dal proxy; misurato nel registro di rete), quindi lo strato 1 non è un di più:
 *   1. `Connection-Allowlist: (response-origin)` posata dal GUSCIO sulla risposta di ogni pagina resa (Chrome 152 la applica di serie:
 *      fetch, WebSocket, navigazione E WebRTC; si eredita in `srcdoc`, `blob:` e `data:`). Vale nella sessione degli artefatti (ogni
 *      risposta) e in quella della principale (`chiudiRetePagineRese`: i soli documenti «sandbox» del servizio, così l'app e il
 *      Browser tengono la loro rete). Il server non cambia: il browser del remoto e del telefono resta com'era (lo decide il giudice).
 *   2. nella finestra dell'artefatto, la sessione manda tutto a un proxy che non c'è, con la sola base del servizio in eccezione…
 *   3. …e il contenuto ha WebRTC senza UDP diretto (`disable_non_proxied_udp`): gli resta il TCP, che va al proxy morto.
 *   La pagina non si carica finché 2 e 3 non sono posati; se non si posano, la finestra non si apre.
 *   ⚠ Lo strato 1 vive di una funzione di Chromium: a ogni cambio di versione di Electron la prova con Electron vero dice se regge ancora.
 *   ⚠ Electron tiene UN solo ascolto `onHeadersReceived` per sessione: un altro, posato altrove, toglierebbe la lista in silenzio.
 *   Fonti: Electron `session.setProxy`/`ProxyConfig` e `webContents.setWebRTCIPHandlingPolicy` (electronjs.org, letti il 10/11/2026);
 *   Chrome «Connection Allowlists» (developer.chrome.com/blog/connection-allowlists-origin-trial e Intent to Ship su blink-dev: di serie
 *   da Chrome 152; letti il 10/11/2026). Hermes chiude la rete di una finestra non fidata nella sessione (`link-metadata.ts:156-159`,
 *   `webRequest` su una partizione sua); goose posa la politica sui documenti con `onHeadersReceived` (`ui/desktop/src/main.ts:2448-2460`).
 *   Nessuno dei due chiude WebRTC (cercato nel codice: 0).
 *
 * ⭐ 0.2.2, giro di sicurezza 3 (10/11/2026; controllore del giro 2, reperto N1; owner 22:51) — LA PAGINA CHE CADE.
 *   Misurato (Electron 44.3.0 / Chrome 152.0.7977.78): con la lista delle connessioni una cornice FIGLIA della pagina resa (`srcdoc`,
 *   `javascript:`, annidata) che crea `RTCPeerConnection` fa chiudere a Chromium il processo che la disegna (alla cornice con la lista
 *   non viene dato il servizio dei nomi locali di WebRTC, `content/browser/browser_interface_binders.cc:998-1040`; la richiesta senza
 *   servizio è un messaggio non valido). Dalla rete non esce niente, ma quel processo era UNO per tutte le anteprime in chat: cadevano
 *   anche le sorelle innocue, e l'app non riceveva nulla (nessun evento del guscio per una cornice figlia).
 *   Strade misurate: `webrtc 'block'` nella politica (cade lo stesso), senza i nomi locali di WebRTC (cade lo stesso e la pagina vede
 *   l'indirizzo vero della macchina: scartata), un processo per pagina resa (le sorelle restano vive, 0 uscite). La protezione non si allenta.
 * ⇒ 1. `isolaPagineRese`: ogni documento «sandbox» ha un processo SUO (`IsolateSandboxedIframes`, raggruppamento per documento): cade
 *      solo la pagina che ci prova. Costo: un processo per anteprima aperta.
 *   2. `sorvegliaAnteprime`: il guscio guarda le cornici del servizio dentro la principale; quella il cui processo è caduto la dice al
 *      documento dell'app (`talos:anteprime-cadute`, coi soli percorsi), che la ricarica UNA volta e poi mostra «Pagina non caricata»
 *      (`frontend/src/components/anteprime-cadute.js`). La finestra dell'artefatto fa lo stesso da sé: una ricarica, poi si chiude.
 *   3. (F4) dopo il nostro ascolto `onHeadersReceived` il metodo di QUELLA sessione lancia: un secondo ascolto non toglie più la lista
 *      in silenzio, ferma l'avvio. 4. (F3) la lista si posa anche se la pagina arriva dall'altro nome di questa macchina (`localhost`, `[::1]`).
 *   Hermes ricarica la finestra caduta con un tetto (`apps/desktop/electron/window-renderer-lifecycle.ts:13-14, 109-110`).
 */
import { timingSafeEqual } from 'node:crypto';
import { origineDiPagina } from './runtime.mjs'; // giro di sicurezza 5: l'origine propria di una pagina resa

export const PARTIZIONE_ARTEFATTI = 'talos-artefatti'; // senza `persist:`: in memoria, sparisce con l'app
export const PROPRIETA_PAGINA = '__talosGuscioArtefatti';
const PAGINA = /^\/api\/v1\/pagine\/([A-Za-z0-9_-]{43})\/([^/?#]+)$/u;
/* giro 5: la stessa pagina sulla sua origine, come la manda la carta nel guscio (`frontend/src/components/lettore/fonti.js`, `indirizzoDellaPagina`) */
const PAGINA_SULLA_SUA_ORIGINE = /^http:\/\/[0-9a-f]{32}\.localhost:\d{1,5}(\/api\/v1\/pagine\/[^?#]*)$/u;
/** Il percorso di una pagina data come percorso o come indirizzo sulla sua origine (`null` se non è né l'uno né l'altro). */
function percorsoDellaPagina(pagina) {
  if (typeof pagina !== 'string') return null;
  if (pagina.startsWith('/')) return pagina;
  return PAGINA_SULLA_SUA_ORIGINE.exec(pagina)?.[1] ?? null;
}

function stessoGettone(a, b) {
  const x = Buffer.from(String(a ?? '')); const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Il percorso di una pagina resa, come lo controlla la carta (`frontend/src/components/artifact-card.js`, `paginaValida`). */
function paginaInForma(pagina) {
  const percorso = percorsoDellaPagina(pagina);
  if (percorso === null) return false;
  const m = PAGINA.exec(percorso);
  if (!m) return false;
  try {
    const nome = decodeURIComponent(m[2]);
    return nome !== '.' && nome !== '..' && !/[\\/:\x00-\x1f\x7f]/u.test(nome);
  } catch { return false; }
}

/**
 * @returns {null | {valida:false} | {valida:true, pagina:string}} `null` = non è una richiesta d'artefatto (la gestisce chi viene dopo).
 */
export function richiestaArtefatto(indirizzo, gettone) {
  let url;
  try { url = new URL(String(indirizzo ?? '')); } catch { return null; }
  if (url.protocol !== 'talos-desktop:' || url.hostname !== 'artefatto') return null;
  if (url.pathname !== '' && url.pathname !== '/') return { valida: false };
  if (!stessoGettone(url.searchParams.get('gettone'), gettone)) return { valida: false };
  const pagina = url.searchParams.get('pagina');
  if (!paginaInForma(pagina)) return { valida: false };
  return { valida: true, pagina };
}

/**
 * Dentro la finestra si va solo nella cartella del lasciapassare di partenza, sulla stessa origine.
 * Revisioni di sicurezza 1 (R3) e 3 (reperto 6): `..%2f` e `..%5c` non sono segmenti di punti, quindi restano nel prefisso e li
 * fermava solo il server (`leggiFilePagina`). Una barra codificata nel percorso d'arrivo non serve a nessuna pagina: qui è negata.
 */
export function navigazioneArtefattoConsentita(partenza, destinazione) {
  try {
    const da = new URL(partenza);
    const a = new URL(destinazione);
    const m = PAGINA.exec(da.pathname);
    return Boolean(m) && a.origin === da.origin && a.pathname.startsWith(`/api/v1/pagine/${m[1]}/`) && !/%2f|%5c/iu.test(a.pathname);
  } catch { return false; }
}

/**
 * Revisioni di sicurezza 1 (R1) e 3 (reperto 5): il gettone si posa solo sul documento dell'app (la radice del servizio). La
 * principale può arrivare, sulla stessa origine, su una pagina resa (`/api/v1/pagine/…`): lì il gettone lo leggerebbe la pagina del modello.
 */
export function documentoDellApp(indirizzo, base) {
  try {
    const url = new URL(String(indirizzo ?? ''));
    return url.origin === new URL(String(base ?? '')).origin && url.pathname === '/';
  } catch { return false; }
}

/** Quante finestre d'artefatto insieme (revisioni 1 R2 e 3 reperto 4: prima nessun tetto, 12 richieste = 12 finestre). */
export const TETTO_FINESTRE_ARTEFATTO = 8;

/**
 * Il titolo della finestra (revisione 3, reperto 2). Il titolo lo sceglie la pagina, cioè il modello: passava «Accesso a TALOS …
 * Inserisci la password» con U+202E, in una finestra con l'icona di TALOS. Ora: davanti un segno FISSO che dice che è un artefatto
 * (inglese di serie, italiano se il sistema è in italiano: la regola di `etichettaSegnala`), via i caratteri di formato e invisibili
 * (`\p{C}`: bidi, larghezza zero, uso privato…), controlli e ogni genere di spazio ridotti a UNO spazio (niente righe, niente
 * imbottitura che spinga via la coda), 120 caratteri al massimo contati per carattere.
 */
export function titoloFinestraArtefatto(titolo, lingua) {
  const segno = /^it(?:[-_]|$)/iu.test(String(lingua ?? '')) ? 'Artefatto' : 'Artifact';
  const pulito = String(titolo ?? '').replace(/[\p{Cc}\p{Z}]+/gu, ' ').replace(/\p{C}/gu, '').trim();
  const breve = [...pulito].slice(0, 120).join('').trim();
  return breve ? `${segno} · ${breve} — TALOS` : `${segno} — TALOS`;
}

export function opzioniFinestraArtefatto(sessione, { icona, lingua } = {}) {
  return {
    width: 1100, height: 800, minWidth: 420, minHeight: 320, show: false, title: titoloFinestraArtefatto('', lingua), autoHideMenuBar: true,
    backgroundColor: '#ffffff', ...(icona ? { icon: icona } : {}),
    webPreferences: {
      sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false,
      webviewTag: false, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, session: sessione,
    },
  };
}

/**
 * Giro 3, F4. Electron tiene UN solo ascolto `onHeadersReceived` per sessione: un secondo, posato da chiunque, toglie il primo in
 * silenzio, e con lui la lista delle connessioni. Dopo il nostro, il metodo di QUELLA sessione lancia: chi ne posa un altro lo scopre
 * all'avvio. Misurato su Electron 44.3.0: `session.webRequest` è sempre lo stesso oggetto e il metodo è una proprietà sua, riscrivibile.
 * L'oggetto resta in questo insieme (non debole) perché non venga rifatto senza il sigillo.
 */
export const SECONDO_ASCOLTO = 'onHeadersReceived: questa sessione ha già il suo ascolto, quello che chiude la rete delle pagine rese (finestra-artefatto.mjs)';
const ascoltiSigillati = new Set();
function posaAscolto(sessione, ...argomenti) {
  const richieste = sessione.webRequest;
  if (ascoltiSigillati.has(richieste)) throw new Error(SECONDO_ASCOLTO);
  richieste.onHeadersReceived(...argomenti);
  ascoltiSigillati.add(richieste);
  Object.defineProperty(richieste, 'onHeadersReceived', { value() { throw new Error(SECONDO_ASCOLTO); }, writable: false, configurable: false, enumerable: true });
}

const sessioniProtette = new WeakSet();
function proteggiSessione(sessione) {
  if (sessioniProtette.has(sessione)) return;
  sessioniProtette.add(sessione);
  sessione.setPermissionRequestHandler((_contenuto, _permesso, rispondi) => rispondi(false));
  sessione.setPermissionCheckHandler(() => false);
  sessione.on('will-download', (evento) => evento.preventDefault());
  /* strato 1: nella sessione degli artefatti OGNI risposta porta la lista (lì dentro tutto è pagina resa), anche senza la politica del server */
  posaAscolto(sessione, (dettagli, rispondi) => rispondi({ responseHeaders: conLista(dettagli?.responseHeaders) }));
}

/* ───── La rete delle pagine rese (giro di sicurezza 2, vedi in testa) ───── */

/** «Solo l'origine che ha dato la risposta»: la cartella della pagina. La lista vuota `()` fermerebbe anche i suoi script e le sue immagini (misurato). */
export const LISTA_CONNESSIONI = '(response-origin)';
/** Un proxy che non c'è: la porta 1 di questa macchina. Niente parte, nemmeno la richiesta `CONNECT` (con un proxy vivo ci arriverebbe host e porta). */
export const PROXY_MORTO = 'http://127.0.0.1:1';
export const POLITICA_WEBRTC = 'disable_non_proxied_udp';

function conLista(intestazioni) {
  /* al posto di qualunque lista arrivi: due intestazioni farebbero una lista non valida */
  const altre = Object.entries(intestazioni ?? {}).filter(([nome]) => nome.toLowerCase() !== 'connection-allowlist');
  return { ...Object.fromEntries(altre), 'Connection-Allowlist': [LISTA_CONNESSIONI] };
}

/**
 * Strato 2, la configurazione del proxy della sessione degli artefatti: tutto al proxy morto, diretta solo la base del servizio.
 * `<-loopback>` toglie l'eccezione che Chromium dà di serie a OGNI porta di 127.0.0.1 e localhost; la base deve avere la SUA porta.
 * Giro 5: diretti anche i nomi delle pagine ALLA STESSA PORTA (`*.localhost:<porta>`): ogni pagina ha la sua origine, e le finestre di pagine
 * diverse dividono la sessione e il proxy. Chromium risolve quei nomi sul loopback da sé (niente DNS: misurato nel registro di rete); il
 * servizio a quella porta risponde a un nome di pagina solo col lasciapassare della sua etichetta (`src/http-app.mjs`).
 */
export function reteChiusa(base) {
  const url = new URL(String(base ?? ''));
  if (!url.port) throw new Error('base senza porta');
  return { mode: 'fixed_servers', proxyRules: PROXY_MORTO, proxyBypassRules: `<-loopback>;${url.host};*.localhost:${url.port}` };
}

const retiChiuse = new WeakMap(); // sessione → { origine, promessa }: il proxy si posa una volta per servizio
function chiudiRete(sessione, origine) {
  const gia = retiChiuse.get(sessione);
  if (gia?.origine === origine) return gia.promessa;
  const promessa = Promise.resolve().then(() => sessione.setProxy(reteChiusa(origine)));
  retiChiuse.set(sessione, { origine, promessa });
  promessa.catch(() => { if (retiChiuse.get(sessione)?.promessa === promessa) retiChiuse.delete(sessione); }); // fallito: la volta dopo si riprova
  return promessa;
}

const haSandbox = (intestazioni) => Object.entries(intestazioni ?? {})
  .filter(([nome]) => nome.toLowerCase() === 'content-security-policy')
  .flatMap(([, valori]) => [valori].flat())
  .some((valore) => String(valore).split(/[;,]/u).some((direttiva) => direttiva.trim().split(/\s+/u)[0].toLowerCase() === 'sandbox'));

/**
 * Strato 1 nella sessione della PRINCIPALE (giudice v1301: l'anteprima in chat). Le intestazioni nuove per una risposta, o `null` se non
 * è una pagina resa. Pagina resa = un documento del servizio che dichiara `sandbox` nella sua politica (le pagine, la rotta vecchia degli
 * artefatti, il lettore: il server lo dà solo al contenuto non fidato) oppure sta sotto `/api/v1/pagine/` (anche se la politica mancasse).
 * Il documento dell'app e ogni altra origine (i siti del Browser, il suo proxy sull'altro nome di loopback) non si toccano.
 * Giro 3, F3: il servizio risponde alla sua porta anche come `localhost` e `[::1]` (`src/http-app.mjs`, gli Host ammessi). Una pagina sotto
 * `/api/v1/pagine/` arrivata da uno di quei nomi riceve la lista lo stesso (prima la fermava solo `frame-ancestors 'self'` del servizio).
 * Lì vale SOLO il percorso, non «sandbox»: su quel nome vive il proxy del Browser, che deve tenere la sua rete.
 */
const NOMI_DI_QUESTA_MACCHINA = ['127.0.0.1', 'localhost', '[::1]'];
export function intestazioniPaginaResa(dettagli, base) {
  try {
    const url = new URL(String(dettagli?.url ?? ''));
    const servizio = new URL(String(base ?? ''));
    const sottoLePagine = url.pathname.startsWith('/api/v1/pagine/');
    /* giro 5: la pagina sulla sua origine (`<etichetta>.localhost` alla porta del servizio) è una pagina resa come le altre */
    const resa = url.origin === servizio.origin
      ? sottoLePagine || haSandbox(dettagli.responseHeaders)
      : sottoLePagine && url.protocol === servizio.protocol && url.port === servizio.port
        && (NOMI_DI_QUESTA_MACCHINA.includes(url.hostname) || origineDiPagina(url.href, servizio.origin));
    return resa ? conLista(dettagli.responseHeaders) : null;
  } catch { return null; }
}

/** I documenti che passano dall'ascolto della principale: il servizio locale coi suoi tre nomi (Electron li accetta tutti e tre: misurato) e, dal
 *  giro 5, i nomi delle pagine (`*.localhost`: il modello di Chromium comprende `localhost` e ogni nome sotto). */
export const DOCUMENTI_LOCALI = Object.freeze({ urls: ['http://127.0.0.1/*', 'http://localhost/*', 'http://[::1]/*', 'http://*.localhost/*'], types: ['mainFrame', 'subFrame'] });

/**
 * Da chiamare una volta, dopo `app.whenReady`, sulla sessione della principale. `base()` è l'origine del servizio del momento (o `null`).
 * Il filtro lascia fuori tutto ciò che non è un documento del servizio locale: le chiamate dell'app non passano di qui.
 */
export function chiudiRetePagineRese(sessione, base) {
  posaAscolto(sessione, { urls: [...DOCUMENTI_LOCALI.urls], types: [...DOCUMENTI_LOCALI.types] }, (dettagli, rispondi) => {
    const nuove = intestazioniPaginaResa(dettagli, base());
    rispondi(nuove ? { responseHeaders: nuove } : {});
  });
}

/* ───── La pagina che cade (giro di sicurezza 3, vedi in testa) ───── */

/** Le cornici «sandbox» in processi propri, uno per ORIGINE: la funzione di Chromium col suo raggruppamento di serie, chiesto per nome. */
export const ISOLAMENTO_PAGINE_RESE = 'IsolateSandboxedIframes:grouping/per-origin';

/*
 * Giro 5 (11/11/2026; owner 09:12, strada (c); controllore del giro 4, punto 1, che ha smentito il «non si può» del giro 4):
 *   il giro 4 chiedeva un processo per DOCUMENTO, per tutta l'app: anche un sito del pannello Browser con 20 cornici chiuse diventava 20
 *   processi (493 MB contro 38 MB). Le righe di Chromium lette allora restano vere (il raggruppamento vale per tutto il processo,
 *   `content/browser/renderer_host/navigation_request.cc:5074-5089`; di serie «per-origin», `third_party/blink/common/features.cc:938-949`),
 *   ma col raggruppamento di serie basta che ogni pagina abbia un'ORIGINE sua (Chromium `site_per_process_oopsif_browsertest.cc`, misurato
 *   dal controllore): `<etichetta>.localhost` alla porta del servizio (`src/guardia-origine.mjs`, `runtime.mjs` `origineDiPagina`).
 *   Le pagine stanno ognuna nel suo processo; le cornici di un sito del Browser, tutte della stessa origine, tornano in uno solo.
 *   Si chiede per nome (non si lascia al valore di serie): una versione di Chromium che cambiasse il valore lo dice la prova di Electron.
 */
/** Da chiamare PRIMA di `app.whenReady`, sulla riga di comando di Chromium (`app.commandLine`). Tiene le funzioni già accese da altri. */
export function isolaPagineRese(rigaDiComando) {
  const nome = ISOLAMENTO_PAGINE_RESE.split(':')[0];
  const altre = String(rigaDiComando.getSwitchValue('enable-features') ?? '').split(',').filter((funzione) => funzione && funzione.split(':')[0] !== nome);
  rigaDiComando.appendSwitch('enable-features', [...altre, ISOLAMENTO_PAGINE_RESE].join(','));
}

/** Il nome dell'evento che arriva al documento dell'app (lo stesso in `frontend/src/components/anteprime-cadute.js`). */
export const EVENTO_ANTEPRIME_CADUTE = 'talos:anteprime-cadute';

/** Il copione per `executeJavaScript` della principale: JSON, mai testo interpolato. `indirizzi` sono percorsi (`pathname + search`). */
export function copioneAnteprimeCadute(indirizzi) {
  return `(() => { window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTO_ANTEPRIME_CADUTE)}, { detail: { indirizzi: ${JSON.stringify([...indirizzi].map(String))} } })); })();`;
}

/** Quanti giri di fila una cornice deve risultare caduta prima di dirlo: un cambio di processo in corso non è una caduta. */
export const GIRI_PRIMA_DI_DIRLO = 2;

/**
 * Guarda le anteprime dentro la principale. Chromium non manda al guscio nessun evento quando cade il processo di una cornice figlia
 * (misurato: né `render-process-gone` né `child-process-gone` né `did-fail-load`); la cornice resta nell'albero, ma «staccata». Quindi:
 * a ogni documento del servizio arrivato in una cornice figlia si segna il suo nodo e il suo percorso (dopo la caduta non si leggono più),
 * e ogni `ogni` millisecondi, SOLO finché ce n'è almeno una, si guarda se è ancora viva. Caduta per due giri di fila ⇒ il suo percorso va
 * al documento dell'app, una volta. Una cornice tolta dalla pagina non è una caduta. Nel registro mai i percorsi (portano il lasciapassare).
 * @param {any} contenuto il `webContents` della principale
 * @param {() => string|null} base l'origine del servizio del momento
 * @returns {{ controlla: () => void, ferma: () => void }}
 */
export function sorvegliaAnteprime(contenuto, base, { registro = () => {}, ogni = 600, timer = globalThis } = {}) {
  const viste = new Map(); // nodo della cornice → { percorsi: [il primo, l'ultimo], giri }
  let giro = null;
  const ferma = () => { if (giro !== null) { timer.clearInterval(giro); giro = null; } };
  const cornici = () => { try { return [...(contenuto.mainFrame?.frames ?? [])]; } catch { return []; } };
  const nodo = (cornice) => { try { return cornice.frameTreeNodeId; } catch { return undefined; } };
  const caduta = (cornice) => { try { return cornice.isDestroyed() || cornice.detached === true; } catch { return true; } };
  const percorso = (indirizzo) => {
    try {
      const url = new URL(String(indirizzo ?? ''));
      /* giro 5: anche una pagina sulla sua origine; all'app va il solo percorso, che è quello con cui la conosce */
      const servizio = new URL(String(base() ?? '')).origin;
      return url.origin === servizio || origineDiPagina(url.href, servizio) ? `${url.pathname}${url.search}` : null;
    } catch { return null; }
  };
  const controlla = () => {
    const ora = new Map(cornici().map((cornice) => [nodo(cornice), cornice]));
    const cadute = [];
    for (const [id, vista] of [...viste]) {
      const cornice = ora.get(id);
      if (!cornice) { viste.delete(id); continue; }
      if (!caduta(cornice)) { vista.giri = 0; continue; }
      vista.giri += 1;
      if (vista.giri < GIRI_PRIMA_DI_DIRLO) continue;
      viste.delete(id);
      cadute.push(...vista.percorsi);
    }
    if (!viste.size) ferma();
    if (!cadute.length) return;
    let app = false;
    try { app = documentoDellApp(contenuto.getURL(), base()); } catch { /* la principale non c'è più */ }
    if (!app) return;
    registro('Anteprima caduta: avvisata l\'app.');
    /* la cornice principale direttamente: l'avviso non aspetta la fine di un carico che una cornice caduta può non chiudere mai */
    Promise.resolve().then(() => contenuto.mainFrame.executeJavaScript(copioneAnteprimeCadute(new Set(cadute)))).catch(() => { registro('Anteprima caduta: avviso non consegnato.'); });
  };
  contenuto.on('did-frame-navigate', (_evento, indirizzo, _codice, _testo, principale, processo, numero) => {
    if (principale) { viste.clear(); ferma(); return; }
    const dove = percorso(indirizzo);
    if (dove === null) return;
    const cornice = cornici().find((c) => { try { return c.processId === processo && c.routingId === numero; } catch { return false; } });
    const id = cornice ? nodo(cornice) : undefined;
    if (id === undefined) return;
    const gia = viste.get(id);
    viste.set(id, { percorsi: gia ? [gia.percorsi[0], dove] : [dove], giri: 0 });
    if (giro === null) { giro = timer.setInterval(controlla, ogni); giro?.unref?.(); }
  });
  contenuto.once('destroyed', () => { viste.clear(); ferma(); });
  return { controlla, ferma };
}

/** Quante volte la finestra dell'artefatto ricarica da sé una pagina caduta, prima di mostrare «Pagina non caricata.». */
export const RICARICHE_FINESTRA_ARTEFATTO = 1;

/*
 * Giro di sicurezza 4 (11/11/2026; controllore del giro 3, reperto C3; decisione 375): la finestra che cade DUE volte spariva senza una
 * parola (solo una riga nel registro). Ora resta e dice la stessa riga del pannello e del lettore, «Pagina non caricata.», con una frase che
 * dice cosa fare e un «Riprova» che funziona: riporta la pagina vera e il conto delle ricariche riparte (un gesto della persona, come nel
 * pannello). Se la pagina cade sempre, «Riprova» fa UNA ricarica e torna la stessa riga: mai un giro. Se il lasciapassare della finestra è
 * scaduto (30 minuti fermo) la frase dice la strada che funziona sempre: riaprirla dalla sua carta.
 * La riga è un documento `data:` nostro, senza copioni (il «Riprova» è un collegamento) e con la politica che chiude tutto: Hermes fa lo
 * stesso con la finestra caduta (`apps/desktop/electron/renderer-load-error-page.ts:16-22, 38-43`, `main.ts:13955-13970`: pagina `data:`
 * con un pulsante che porta all'indirizzo VERO, non alla pagina d'errore).
 */
export const TESTI_PAGINA_NON_CARICATA = Object.freeze({
  en: Object.freeze({ titolo: 'Page not loaded.', spiegazione: 'It stopped working twice. Try again, or open it again from its card in the chat.', riprova: 'Try again',
    nonDisponibile: 'It could not be loaded. Try again, or open it again from its card in the chat.' }),
  it: Object.freeze({ titolo: 'Pagina non caricata.', spiegazione: 'Si è fermata due volte. Riprova, oppure riaprila dalla sua carta nella chat.', riprova: 'Riprova',
    nonDisponibile: 'Non si è potuta caricare. Riprova, oppure riaprila dalla sua carta nella chat.' }),
});
export const RIGA_FINESTRA_NON_CARICATA = 'Finestra dell\'artefatto: la pagina è caduta di nuovo dopo la ricarica; mostrata «Pagina non caricata».';
/* Giro 5 (controllore del giro 4, caso `w-scaduta`): la finestra ferma oltre 30 minuti la cui pagina cade ricarica con un lasciapassare scaduto e il
   servizio risponde 404 in JSON. La finestra lo mostrava crudo. Ora: la stessa riga, con la frase che non dice «due volte». */
export const RIGA_FINESTRA_RIFIUTATA = 'Finestra dell\'artefatto: il servizio ha rifiutato la pagina (lasciapassare scaduto o pagina tolta); mostrata «Pagina non caricata».';
const inAttributo = (testo) => String(testo).replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

/** La riga della finestra, come indirizzo `data:`. `pagina` è l'indirizzo vero della pagina (il «Riprova»); `lingua` quella del sistema. */
export function paginaNonCaricata(pagina, lingua, { rifiutata = false } = {}) {
  const it = /^it(?:[-_]|$)/iu.test(String(lingua ?? ''));
  const testi = { ...TESTI_PAGINA_NON_CARICATA[it ? 'it' : 'en'] };
  if (rifiutata) testi.spiegazione = testi.nonDisponibile;
  const html = `<!doctype html><html lang="${it ? 'it' : 'en'}"><head><meta charset="utf-8">`
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">'
    + `<meta name="color-scheme" content="light dark"><title>${testi.titolo}</title><style>`
    + ':root{color-scheme:light dark;font-family:"Segoe UI",system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;'
    + 'background:Canvas;color:CanvasText}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.15rem;margin:0 0 .5rem}'
    + 'p{margin:0 0 1.25rem;line-height:1.5;opacity:.8}a{display:inline-block;padding:.5rem 1.1rem;border-radius:.4rem;'
    + 'background:#2563eb;color:#fff;text-decoration:none;font-weight:600}a:hover{background:#1d4ed8}a:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}'
    + `</style></head><body><main role="alert"><h1>${testi.titolo}</h1><p>${testi.spiegazione}</p>`
    + `<a href="${inAttributo(pagina)}">${testi.riprova}</a></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** Il copione da passare a `executeJavaScript` della principale: JSON, mai testo interpolato (come `copioneStato`). */
export function copioneGettoneArtefatti(gettone) {
  return `(() => { window[${JSON.stringify(PROPRIETA_PAGINA)}] = Object.freeze({ gettone: ${JSON.stringify(String(gettone))} }); })();`;
}

/**
 * La consegna del gettone alla principale, a ogni caricamento (revisioni 1 R1, 2 N20, 3 reperto 5 e M25). Solo se il documento è l'app;
 * solo nella cornice principale (`contenuto.executeJavaScript`: nelle cornici vive il contenuto del modello); SENZA il secondo argomento,
 * che regalerebbe alla pagina un gesto dell'utente a ogni caricamento e qui non serve a niente.
 * @returns {boolean} se la consegna è partita
 */
export function consegnaGettoneArtefatti(contenuto, base, gettone, registro = () => {}) {
  if (!documentoDellApp(contenuto.getURL(), base)) return false;
  contenuto.executeJavaScript(copioneGettoneArtefatti(gettone)).catch(() => { registro('Gettone degli artefatti non consegnato.'); });
  return true;
}

/**
 * Le finestre degli artefatti. `sessione()` si chiama alla prima apertura (dopo `app.whenReady`).
 * `lingua` è quella del sistema per il segno nel titolo: una stringa o una funzione (`app.getLocale()` vale solo dopo `ready`).
 * @param {{BrowserWindow:any, sessione:() => any, registro?:(riga:string) => void, icona?:string, lingua?:string|(() => string)}} dipendenze
 */
export function creaFinestreArtefatto({ BrowserWindow, sessione, registro = () => {}, icona, lingua }) {
  const aperte = new Map(); // finestra → indirizzo, nell'ordine d'apertura
  const inUscita = new WeakSet(); // chiuse da noi per il tetto: Electron le toglie dopo, intanto non contano
  const viva = (finestra) => !inUscita.has(finestra) && !finestra.isDestroyed();
  return {
    apri({ base, pagina }) {
      if (!paginaInForma(pagina)) { registro('Finestra dell\'artefatto non aperta: pagina fuori forma.'); return null; }
      let indirizzo;
      let servizio;
      try {
        indirizzo = new URL(pagina, base);
        servizio = new URL(base).origin;
        /* giro 5: la pagina sulla SUA origine (`<etichetta>.localhost` alla porta del servizio), o sul nome del servizio come prima */
        if (indirizzo.origin !== servizio && !origineDiPagina(indirizzo.href, servizio)) throw new Error('origine');
        reteChiusa(servizio); // senza una porta sua il servizio non avrebbe un'eccezione stretta nel proxy: non si apre
      } catch { registro('Finestra dell\'artefatto non aperta: indirizzo del servizio non valido.'); return null; }
      /* Revisione 3, reperto 9: `new URL` toglie spazi e controlli in testa e in coda, e `.. ` diventava `/api/v1/pagine/`. La forma
         si ricontrolla sul percorso RISOLTO, che deve stare nello stesso lasciapassare chiesto. */
      if (!paginaInForma(indirizzo.pathname) || PAGINA.exec(indirizzo.pathname)[1] !== PAGINA.exec(percorsoDellaPagina(pagina))[1] || indirizzo.search || indirizzo.hash) {
        registro('Finestra dell\'artefatto non aperta: pagina fuori forma.'); return null;
      }
      /* Revisioni 1 (R2) e 3 (reperto 4): la stessa pagina non apre una seconda finestra, torna davanti quella che c'è… */
      for (const [gia, dove] of aperte) {
        if (dove !== indirizzo.href || !viva(gia)) continue;
        if (gia.isMinimized?.()) gia.restore();
        gia.show(); gia.focus();
        return gia;
      }
      /* …e oltre il tetto se ne va la più vecchia (chi ha il gettone non riempie lo schermo di finestre) */
      const vive = [...aperte.keys()].filter(viva);
      for (const vecchia of vive.slice(0, Math.max(0, vive.length - TETTO_FINESTRE_ARTEFATTO + 1))) {
        inUscita.add(vecchia);
        try { vecchia.destroy(); } catch { /* già chiusa */ } // `destroy`, non `close`: una pagina non la trattiene (revisione 2, appunto C)
      }
      const jar = sessione();
      proteggiSessione(jar);
      const linguaOra = typeof lingua === 'function' ? lingua() : lingua;
      const finestra = new BrowserWindow(opzioniFinestraArtefatto(jar, { icona, lingua: linguaOra }));
      aperte.set(finestra, indirizzo.href);
      finestra.removeMenu();
      const contenuto = finestra.webContents;
      contenuto.setWindowOpenHandler(() => ({ action: 'deny' }));
      const resta = (evento, destinazione) => {
        if (!navigazioneArtefattoConsentita(indirizzo.href, destinazione ?? evento?.url)) evento.preventDefault();
      };
      contenuto.on('will-navigate', resta);
      contenuto.on('will-redirect', resta);
      /* Revisione 3, reperto 3: le cornici figlie le vieta già la politica del server (`frame-src 'none'`); questo è il secondo strato */
      contenuto.on('will-frame-navigate', resta);
      contenuto.on('will-attach-webview', (evento) => evento.preventDefault());
      /* Revisione 2, appunto C: senza la politica «sandbox» del server un `beforeunload` teneva aperta la finestra (misurato: la X non
         chiudeva). `preventDefault` QUI vuol dire «ignora il rifiuto della pagina e scaricala» (Electron, «will-prevent-unload»;
         lobe-chat `apps/desktop/src/main/core/browser/Browser.ts:385`). */
      contenuto.on('will-prevent-unload', (evento) => evento.preventDefault());
      contenuto.on('page-title-updated', (evento, titolo) => {
        evento.preventDefault();
        finestra.setTitle(titoloFinestraArtefatto(titolo, linguaOra));
      });
      /* Giro 3 (N1): il processo della pagina può cadere (vedi in testa). UNA ricarica da sé; se cade ancora, giro 4 (C3): la finestra resta e
         mostra «Pagina non caricata.» con «Riprova» (`paginaNonCaricata`), mai un giro di ricariche. La rete resta chiusa: proxy e lista sono
         della sessione, la politica WebRTC è del contenuto (misurato dopo la ricarica). */
      let cadute = 0;
      let sullaRiga = false;
      contenuto.on('render-process-gone', () => {
        if (finestra.isDestroyed()) return;
        cadute += 1;
        if (cadute <= RICARICHE_FINESTRA_ARTEFATTO) { contenuto.reload(); return; }
        registro(RIGA_FINESTRA_NON_CARICATA);
        sullaRiga = true;
        Promise.resolve().then(() => finestra.loadURL(paginaNonCaricata(indirizzo.href, linguaOra))).catch(() => {
          registro('Finestra dell\'artefatto chiusa: la riga non si è caricata.');
          try { if (!finestra.isDestroyed()) finestra.destroy(); } catch { /* già chiusa */ }
        });
      });
      /* «Riprova» dalla riga è il gesto della persona: il conto delle ricariche riparte (la navigazione la controlla `resta`, sopra) */
      contenuto.on('will-navigate', (evento, destinazione) => {
        if (sullaRiga && (destinazione ?? evento?.url) === indirizzo.href) { sullaRiga = false; cadute = 0; }
      });
      /* Giro 5 (controllore del giro 4, `w-scaduta`): il servizio rifiuta una pagina del lasciapassare (scaduto dopo 30 minuti fermo, pagina tolta) e
         la finestra mostrerebbe il suo JSON. Al posto del rifiuto la stessa riga, con la frase giusta; «Riprova» porta alla pagina vera. */
      contenuto.on('did-navigate', (_evento, arrivo, codice) => {
        if (finestra.isDestroyed() || !(Number(codice) >= 400) || !navigazioneArtefattoConsentita(indirizzo.href, arrivo)) return;
        registro(RIGA_FINESTRA_RIFIUTATA);
        sullaRiga = true;
        Promise.resolve().then(() => finestra.loadURL(paginaNonCaricata(indirizzo.href, linguaOra, { rifiutata: true }))).catch(() => {
          registro('Finestra dell\'artefatto chiusa: la riga non si è caricata.');
          try { if (!finestra.isDestroyed()) finestra.destroy(); } catch { /* già chiusa */ }
        });
      });
      finestra.once('ready-to-show', () => { if (!finestra.isDestroyed()) { finestra.show(); finestra.focus(); } });
      finestra.on('closed', () => { aperte.delete(finestra); });
      /* La rete si chiude PRIMA di caricare (strati 3 e 2): se non si chiude, la pagina non parte e la finestra se ne va. */
      Promise.resolve()
        .then(() => { contenuto.setWebRTCIPHandlingPolicy(POLITICA_WEBRTC); return chiudiRete(jar, servizio); })
        .then(() => {
          if (!finestra.isDestroyed()) return finestra.loadURL(indirizzo.href).catch(() => registro('Finestra dell\'artefatto: pagina non caricata.'));
          return undefined;
        }, () => {
          registro('Finestra dell\'artefatto non aperta: rete non chiusa.');
          try { if (!finestra.isDestroyed()) finestra.destroy(); } catch { /* già chiusa */ }
        });
      return finestra;
    },
    chiudiTutte() {
      /* `destroy`, non `close`: all'uscita dell'app nessuna pagina viene interpellata (Hermes `hud-close.ts:45-48`, `challenge-window.ts:188-190`) */
      for (const finestra of [...aperte.keys()]) { try { if (!finestra.isDestroyed()) finestra.destroy(); } catch { /* già chiusa */ } }
      aperte.clear();
    },
  };
}

/**
 * Il primo passo del gestore delle finestre nuove della principale. `null` = non è una richiesta d'artefatto.
 * Ogni richiesta d'artefatto è NEGATA come finestra di Chromium; solo una valida, col servizio pronto, apre la finestra del guscio.
 */
export function gestisciRichiestaArtefatto(url, { gettone, base, apri, registro = () => {}, dopo = setImmediate }) {
  const richiesta = richiestaArtefatto(url, gettone);
  if (!richiesta) return null;
  if (!richiesta.valida) registro('Richiesta di aprire un artefatto negata: gettone o pagina non validi.');
  else if (!base) registro('Richiesta di aprire un artefatto negata: servizio locale non pronto.');
  else dopo(() => apri({ base, pagina: richiesta.pagina }));
  return { action: 'deny' };
}
