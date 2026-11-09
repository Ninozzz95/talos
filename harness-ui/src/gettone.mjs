/*
 * ⛔⛔ «GETTONE SEMPRE» (decisione dell'owner, 02/11/2026; forma `Downloads/TALOS/desktop/in-corso/FORMA-SEGRETO-DELLA-PAGINA-2026-11-02.md`,
 *   OK di Mobile, CLI e Performance). Ogni server TALOS ha il gettone di loopback: nasce in memoria, entra da un cookie HttpOnly e muore col
 *   processo. Qui stanno le regole, in un posto solo: chi lo decide all'avvio, come si confronta, come si fa e si spende un biglietto.
 *
 * Contro chi protegge, detto per intero (punto aperto del Desktop nella forma):
 *   · un altro sito nel browser della persona: lo fermano già Host e Origin;
 *   · un programma che parla HTTP al loopback senza aver letto il segreto, per esempio un comando del modello che scrive un `Origin` finto
 *     o legge `GET /`: QUESTO è il bersaglio;
 *   · un altro utente di Windows: non legge né la memoria né il file della chiave dei biglietti;
 *   · ⛔ NON un programma dello STESSO utente coi pieni poteri, che può leggere i file dell'utente, il profilo del browser, o l'elenco dei processi nell'istante in cui
 *     un biglietto passa dalla riga di comando di `cmd`: nessuno lo promette (Hermes lo dice uguale, `hermes_cli/web_routers/webapp.py:136-146`). Per il modello la
 *     chiave dei biglietti è una credenziale della casa (`path-policy.mjs`): è ATTRITO sul testo del comando, non un confine: un comando abbastanza contorto non lo vede;
 *   · ⛔ NON un server locale verso cui il browser della persona viene mandato: il cookie segue l'host, non la porta (RFC 6265 §8.5). Dentro la finestra di TALOS un
 *     dev server passa dall'altro nome di loopback e il cookie non lo raggiunge (`/api/v1/browser/proxy`); nel browser di tutti i giorni il problema resta, finché
 *     l'owner non decide (rapporto GETTONE-SEMPRE-2026-11-03.md, R2).
 *
 * Fonti lette il 03/11/2026 (`TALOS-RICERCHE/concorrenti/hermes-agent-2026-11-01`):
 *   · `hermes_cli/web_server.py:454-474`, ogni `/api/` vuole il gettone; `:297-308`, confronto con `hmac.compare_digest`;
 *   · `gateway/run_api.py:83-86`, «any loopback peer (any OS user) could read from GET /, so the gateway-hosted listener never publishes it»;
 *   · `hermes_cli/web_routers/webapp.py:26-28`, `LAUNCH_TICKET_TTL_SECONDS = 60`, e `:63-77`, il registro tiene scadenza e generazione,
 *     mai il gettone; `:81-82`, «a launcher's argv carries this, not the token»;
 *   · Codex `app-server-transport/src/transport/websocket.rs:167-171`: rifiuta di partire senza autenticazione dove serve.
 * CVE dell'anno, stessa forma del buco: CVE-2026-61613 (Cursor, endpoint locale dell'agente senza autenticazione), CVE-2026-26317
 * (OpenClaw, scritture su localhost senza difesa), blakecrosley.com «loopback is not a trust boundary» (letti il 03/11/2026).
 *
 * ⛔ Il biglietto: `scadenza.casuale.firma`, firma HMAC-SHA256 di `scadenza.casuale` con una chiave DERIVATA dal gettone. Più semplice di
 *   Hermes, che lo conia sul server e lo chiede da un socket del proprietario: qui lo firma chi conosce la chiave, nessuna rotta nuova e
 *   nessun endpoint che restituisca un segreto. La chiave derivata esiste perché il comando dei biglietti del Tester deve poterla tenere
 *   in un file. Anche il cookie del biglietto, che il browser scrive nel profilo, è un valore derivato (`valoreDelCookie`): vale finché il server vive e apre l'API, ma il
 *   gettone vero non tocca il disco. Telefono, CLI e app installata mandano il gettone, e vale anche lui: il loro cookie non è persistente o non passa da un browser.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { posix, win32 } from 'node:path';

export const NOME_COOKIE = 'talos_token';
export const CAMPO_BIGLIETTO = 'ingresso';
export const DURATA_BIGLIETTO_MS = 60_000;
/** Il cookie del biglietto dura finché il server vive (owner, 02/11): a browser chiuso si rientra, al riavvio il gettone è nuovo e il cookie non vale più. */
export const DURATA_COOKIE_S = 30 * 24 * 60 * 60;
export const MODO_SENZA_GETTONE = 'prove';
export const ARGOMENTO_SENZA_GETTONE = '--senza-gettone';
/** La riga di comando del modo prove: la scrive il codice di una prova, mai l'ambiente di chi la lancia (condizione del Mobile). */
export const ARGV_SENZA_GETTONE = `${ARGOMENTO_SENZA_GETTONE}=${MODO_SENZA_GETTONE}`;
/** La cartella della casa con la chiave dei biglietti: credenziale della casa in `path-policy.mjs`. */
export const CARTELLA_CHIAVI_BIGLIETTI = '.talos-biglietti';

const FORMA_BIGLIETTO = /^(\d{13})\.([0-9a-f]{32})\.([0-9a-f]{64})$/u;
const TETTO_SPESI = 4096;
const CONTESTO_CHIAVE = 'talos-biglietti-v1';
const CONTESTO_COOKIE = 'talos-cookie-v1';
const CONTESTO_PAGINA_LOCALE = 'talos-pagina-locale-v1';

function erroreGettone(code, messaggio) {
  return Object.assign(new Error(`${code}: ${messaggio}`), { code });
}

/** Un gettone nuovo: 32 byte casuali, in esadecimale come quello del guscio. */
export function creaGettone() {
  return randomBytes(32).toString('hex');
}

/** Tempo costante, su impronte a lunghezza fissa: due lunghezze diverse non lanciano (`timingSafeEqual` le rifiuta). Un valore vuoto non è mai uguale. */
export function gettoneUguale(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/** Il valore che il browser tiene nel profilo. Muore col gettone: al riavvio non vale più. */
export function valoreDelCookie(gettone) {
  return createHmac('sha256', gettone).update(CONTESTO_COOKIE).digest('hex');
}

/** Il cookie apre se porta il gettone (telefono, CLI, app installata) o il valore derivato (chi è entrato col biglietto). Le due strade costano lo stesso. */
export function cookieValido(valore, gettone) {
  const comeGettone = gettoneUguale(valore, gettone);
  const comeDerivato = typeof gettone === 'string' && gettone !== '' && gettoneUguale(valore, valoreDelCookie(gettone));
  return comeGettone || comeDerivato;
}

/**
 * Il lasciapassare di UNA pagina di un server locale: lo dà solo chi ha il cookie, vale solo per quell'indirizzo e solo su quel nome del server, non apre nient'altro.
 * ⛔ S1 della CLI, 03/11/2026: il nome sta nella firma perché la pagina legge il suo `pass` nell'indirizzo. Senza, lo riportava sul nome della finestra con una navigazione da
 *   un altro sito: il cookie Strict non parte, niente 403, e la pagina girava sull'origine della finestra. `127.0.0.1` e `localhost` sono due siti (WebKit
 *   `LayoutTests/http/tests/cookies/same-site`, letto il 03/11/2026). Hermes ammette i due nomi sullo stesso server (`hermes_cli/web_server_boundary.py:84-97`), ma non serve
 *   pagine altrui: il legame col nome qui è nostro. `host` è l'Host a cui la pagina arriverà: viene da un'intestazione, quindi non contiene un a capo.
 */
export function firmaPaginaLocale(gettone, host, indirizzo) {
  return createHmac('sha256', gettone).update(`${CONTESTO_PAGINA_LOCALE}\n${host}\n${indirizzo}`).digest('hex');
}

export function chiaveDeiBiglietti(gettone) {
  return createHmac('sha256', gettone).update(CONTESTO_CHIAVE).digest();
}

const firma = (chiave, corpo) => createHmac('sha256', chiave).update(corpo).digest('hex');

/** Fa un biglietto. `chiave` è il Buffer di `chiaveDeiBiglietti`. Lo usa chi ha avviato il server. */
export function creaBiglietto(chiave, { adesso = Date.now(), durataMs = DURATA_BIGLIETTO_MS } = {}) {
  const corpo = `${adesso + durataMs}.${randomBytes(16).toString('hex')}`;
  return `${corpo}.${firma(chiave, corpo)}`;
}

/**
 * Chi spende i biglietti di UN server. `consuma(biglietto)` torna vero una volta sola. Il motivo di un rifiuto non esce di qui: chi
 * chiama risponde sempre allo stesso modo. Si guarda anche che la scadenza non superi i 60 s: un biglietto firmato per un'ora non esiste.
 */
export function creaCassaDeiBiglietti({ gettone, adesso = Date.now }) {
  const chiave = chiaveDeiBiglietti(gettone);
  /* ⛔ Revisione R12: niente pulizia a tempo. Con un orologio che torna indietro un biglietto tolto dall'elenco tornerebbe valido; si tiene finché c'è posto, i più vecchi escono per primi */
  const spesi = new Set();
  return {
    consuma(biglietto) {
      const parti = typeof biglietto === 'string' ? FORMA_BIGLIETTO.exec(biglietto) : null;
      if (!parti) return false;
      const [, scadenza, casuale, firmaVista] = parti;
      if (!gettoneUguale(firmaVista, firma(chiave, `${scadenza}.${casuale}`))) return false;
      const ora = adesso();
      const finisce = Number(scadenza);
      if (finisce < ora || finisce > ora + DURATA_BIGLIETTO_MS) return false;
      if (spesi.has(casuale)) return false;
      if (spesi.size >= TETTO_SPESI) spesi.delete(spesi.values().next().value);
      spesi.add(casuale);
      return true;
    },
  };
}

/*
 * Le cartelle dell'app sul telefono. N3 della seconda revisione (03/11/2026): anche i nomi che portano allo stesso posto, la memoria «device encrypted» (`user_de`),
 *   le schede di memoria adottate (`/mnt/expand/<id>/user/N`) e i nomi di `/storage` (`self/primary`, `/mnt/user/N/emulated/N`, `/mnt/sdcard`).
 */
const RADICE_ANDROID = String.raw`^/(?:data/(?:data|user(?:_de)?/\d+)|mnt/expand/[^/]+/user(?:_de)?/\d+|(?:storage/emulated/\d+|storage/self/primary|mnt/user/\d+/emulated/\d+|sdcard|mnt/sdcard)/Android/data)/ai\.talos`;
const CARTELLA_ANDROID = new RegExp(`${RADICE_ANDROID}(?:[./]|$)`, 'iu');
/*
 * La sola cartella delle prove sul Pad (`CARTELLA_PAD` in `mobile/scripts/r4-mobile/prove-r4-pad.mjs:25`): lì il modo prove deve partire. Lettere esatte, senza la `i`:
 *   su Android i nomi distinguono le maiuscole, e un'eccezione larga aprirebbe una cartella vera. N6 della seconda revisione: SOLO il pacchetto di prova `ai.talos.dev`
 *   (`prove-r4-pad.mjs:24`) e solo nella sua memoria interna; mai sopra `ai.talos`.
 */
const PROVE_ANDROID = /^\/data\/(?:data|user\/\d+)\/ai\.talos\.dev\/files\/kernel-r4-prova(?:\/|$)/u;

/** Le forme di Windows che dicono lo stesso disco: `\\?\C:\…`, `\\?\UNC\localhost\c$\…`, `\\localhost\c$\…`, `\\127.0.0.1\c$\…`. */
function discoLocaleWindows(cartella) {
  const s = cartella.replaceAll('/', '\\').replace(/^\\\\\?\\UNC\\/iu, '\\\\').replace(/^\\\\[?.]\\/u, '');
  const amministrativa = /^\\\\(?:localhost|127\.0\.0\.1|\[?::1\]?|\.)\\([a-z])\$(\\.*)?$/iu.exec(s);
  return amministrativa ? `${amministrativa[1]}:${amministrativa[2] ?? '\\'}` : s;
}

/** Il percorso vero: risolve giunzioni, collegamenti e nomi corti. Una coda che non esiste ancora si riattacca all'antenato che esiste. */
function percorsoVero(cartella, p, veroFn) {
  const coda = [];
  let testa = cartella;
  for (let i = 0; i < 64; i += 1) {
    try { return p.join(veroFn(testa), ...coda.toReversed()); } catch { /* si sale di uno */ }
    const su = p.dirname(testa);
    if (su === testa) break;
    coda.push(p.basename(testa));
    testa = su;
  }
  return cartella;
}

/**
 * N3: una cartella del telefono si riconosce come è scritta, normalizzata (`//`, `/./`, `..`) e nel suo percorso vero (un collegamento che porta nei dati). È di prova
 * solo se TUTTE e tre le forme stanno nelle prove del Pad: un `..` o un collegamento che porta altrove resta una cartella vera. Su Windows niente percorso vero:
 * un percorso del telefono lì non esiste.
 */
function cartellaAndroidVera(cartella, veroFn, windows) {
  const pulita = posix.normalize(cartella);
  const forme = windows ? [cartella, pulita] : [cartella, pulita, percorsoVero(pulita, posix, veroFn)];
  return forme.some((c) => CARTELLA_ANDROID.test(c)) && !forme.every((c) => PROVE_ANDROID.test(c));
}

/** Dispositivo e inode, o `null`: un file system che non dà l'inode (0) non dice chi è. */
function identitaDi(percorso, statFn) {
  try {
    const s = statFn(percorso, { bigint: true });
    return s && s.ino !== undefined && String(s.ino) !== '0' ? `${s.dev}:${s.ino}` : null;
  } catch { return null; }
}

/**
 * N2 della seconda revisione (03/11/2026): `\\<nome del PC>\c$\…` e `\\?\GLOBALROOT\Device\HarddiskVolumeN\…` raggiungono il disco ma sfuggivano alle parole. Qui si
 * guarda CHI è: se un antenato che esiste ha un nome che comincia per TALOS e suo padre è (stesso dispositivo, stesso inode) una cartella dati, la cartella è vera.
 */
function sottoDatiPerIdentita(cartella, basi, p, statFn, readdirFn) {
  const dati = new Set(basi.map((b) => identitaDi(b, statFn)).filter(Boolean));
  if (dati.size === 0) return false;
  /* N10 della terza revisione (03/11/2026): `TALOS::$INDEX_ALLOCATION` (flusso NTFS) raggiunge la cartella TALOS ma il suo nome SCRITTO non comincia per TALOS.
     Si prende allora l'identità delle cartelle TALOS che stanno davvero nelle cartelle dati (il loro nome vero, letto dal disco), e basta che un antenato qualunque
     sia una di loro. */
  const vere = new Set();
  for (const base of basi) {
    let nomi = [];
    try { nomi = readdirFn(base); } catch { /* cartella dati che non c'è */ }
    for (const nome of nomi) if (/^talos(?:$|[-_ ])/iu.test(String(nome))) { const id = identitaDi(p.join(base, String(nome)), statFn); if (id) vere.add(id); }
  }
  let figlia = cartella;
  for (let i = 0; i < 64; i += 1) {
    if (vere.has(identitaDi(figlia, statFn))) return true;
    const padre = p.dirname(figlia);
    if (padre === figlia) return false;
    if (/^talos(?:$|[-_ ])/iu.test(p.basename(figlia)) && dati.has(identitaDi(padre, statFn))) return true;
    figlia = padre;
  }
  return false;
}

function caseDiSistema() {
  const case_ = [homedir()];
  /* ⛔ `userInfo` non guarda USERPROFILE: la casa la dice il sistema, e un ambiente finto non la cambia (revisione R5) */
  try { case_.push(userInfo().homedir); } catch { /* utente senza voce */ }
  return case_;
}

/**
 * Le cartelle dati vere del prodotto: l'app installata, il 4174, l'app Android. ⛔ Revisione R5: non ci si fida dell'ambiente di chi lancia. Una cartella è vera se,
 * nella sua forma pulita o nel suo percorso vero, sta sotto la cartella dati di una casa, con un nome che comincia per TALOS. `case` e `veroFn` sono per le prove.
 */
export function cartellaVera(cartella, env = {}, piattaforma = process.platform, { case: caseDate = caseDiSistema(), veroFn = realpathSync.native, statFn = statSync, readdirFn = readdirSync } = {}) {
  if (typeof cartella !== 'string' || cartella.trim() === '') return false;
  const risolvi = piattaforma === process.platform || veroFn !== realpathSync.native ? veroFn : (c) => c;
  const windows = piattaforma === 'win32';
  if (cartellaAndroidVera(cartella, risolvi, windows)) return true;
  const p = windows ? win32 : posix;
  const pulito = (c) => { const r = p.resolve(windows ? discoLocaleWindows(c) : c); return windows ? r.toLowerCase() : r; };
  /* N2: il percorso vero si chiede anche sulla stringa com'è scritta (`\\?\GLOBALROOT\…` lo risolve il sistema, non la nostra pulizia) */
  const dueForme = (c) => [pulito(c), pulito(percorsoVero(p.resolve(windows ? discoLocaleWindows(c) : c), p, risolvi)), pulito(percorsoVero(c, p, risolvi))];
  const dati = windows
    ? [env.APPDATA, env.LOCALAPPDATA, ...caseDate.flatMap((h) => [win32.join(h, 'AppData', 'Roaming'), win32.join(h, 'AppData', 'Local')])]
    : [env.XDG_CONFIG_HOME, ...[env.HOME, ...caseDate].filter(Boolean).flatMap((h) => [posix.join(h, '.config'), posix.join(h, 'Library', 'Application Support'), posix.join(h, '.local', 'share')])];
  const datiScritti = dati.filter((b) => typeof b === 'string' && b.trim() !== '');
  if ((piattaforma === process.platform || statFn !== statSync) && sottoDatiPerIdentita(cartella, datiScritti, p, statFn, readdirFn)) return true;
  const basi = datiScritti.flatMap(dueForme);
  return dueForme(cartella).some((assoluta) => basi.some((base) => {
    const relativo = p.relative(base, assoluta);
    if (relativo === '' || relativo.startsWith('..') || p.isAbsolute(relativo)) return false;
    return /^talos(?:$|[-_ ])/iu.test(relativo.split(p.sep)[0]);
  }));
}

/**
 * ⛔ La decisione dell'avvio, in un punto solo, per `server.mjs`.
 *   · il gettone nell'AMBIENTE non si accetta più (condizione del Mobile: «SOLO dallo stdin»): su Android si legge da /proc, su Windows lo
 *     legge un altro processo dello stesso utente, e i figli lo ereditano;
 *   · `daStdin`: il lanciatore l'ha portato (app installata, telefono, 4174, avvio col doppio clic);
 *   · `--senza-gettone=prove`: solo sulla riga di comando, solo fuori dalle cartelle vere. L'ambiente non lo accende mai;
 *   · altrimenti il server se ne crea uno e lo tiene per sé (avvio a mano come nel README): stampa un biglietto, mai il gettone.
 * @returns {{ gettone: string|null, origine: 'lanciatore'|'generato'|'prove' }}
 */
export function scegliGettone({ argv = [], env = {}, daStdin = null, cartelle = [], piattaforma = process.platform, crea = creaGettone } = {}) {
  const nomeInAmbiente = Object.keys(env).find((k) => k.toUpperCase() === 'TALOS_HARNESS_UI_TOKEN' && typeof env[k] === 'string' && env[k].trim() !== '');
  if (nomeInAmbiente && !daStdin) throw erroreGettone('TOKEN_FROM_ENV_REFUSED', 'the token is no longer accepted from the environment: pass it on stdin with TALOS_HARNESS_UI_SEGRETI_DA=stdin.');
  const chieste = argv.filter((a) => a === ARGOMENTO_SENZA_GETTONE || String(a).startsWith(`${ARGOMENTO_SENZA_GETTONE}=`));
  if (chieste.length > 0) {
    if (chieste.length > 1 || chieste[0] !== ARGV_SENZA_GETTONE) throw erroreGettone('NO_TOKEN_MODE_INVALID', `the only accepted form is ${ARGV_SENZA_GETTONE}.`);
    if (daStdin) throw erroreGettone('NO_TOKEN_MODE_INVALID', 'a token and the no-token test mode exclude each other.');
    if (cartelle.some((c) => cartellaVera(c, env, piattaforma))) throw erroreGettone('NO_TOKEN_MODE_REFUSED', 'the no-token test mode never runs on a real data folder.');
    return { gettone: null, origine: 'prove' };
  }
  return daStdin ? { gettone: daStdin, origine: 'lanciatore' } : { gettone: crea(), origine: 'generato' };
}
