/*
 * gh-service.mjs — ⭐ F6-3 (27/09/2026): le PULL REQUEST della scheda «GitHub», con la CLI ufficiale `gh`.
 *
 * Decisioni dell'owner (memoria `decisioni-owner-f6-github-26-09`, punti 1, 5-7, 25-28) e ricerca
 * (`.claude/RICERCA-F6-3-PR-2026-09-27.md`, clone di `gh` v2.101.0 in `TALOS-RICERCHE/concorrenti/gh-cli-2026-09-27`):
 *
 *   · GitHub SOLO attraverso `gh`, come Hermes (`apps/desktop/electron/git-review-ops.ts:33-44`), Codex e Claude Code:
 *     il token resta nel portachiavi di `gh`, TALOS non lo legge mai (`auth status --json hosts` non lo stampa).
 *   · `gh` assente (o più vecchio della 2.97, l'ultima misurata) ⇒ lo scarica TALOS: zip portatile UFFICIALE della
 *     v2.101.0, impronta SHA256 controllata due volte (contro `checksums.txt` della release e contro quella scritta qui),
 *     estratto con `tar.exe` di Windows nella cartella dati di TALOS. Niente amministratore, PATH non toccato.
 *   · «Collega GitHub» = `gh auth login --web --clipboard`: senza terminale `gh` NON apre il browser, STAMPA codice e
 *     indirizzo (`internal/authflow/flow.go:48-84`) ⇒ qui si leggono per FORMA (XXXX-XXXX e l'indirizzo del device flow),
 *     mai per le parole inglesi intorno.
 *   · PR del ramo e PR aperte con `gh pr list --json` — ⛔ mai il testo per le persone: «no pull requests found» e «no checks
 *     reported» sono inglese che cambia; qui una lista vuota È la risposta. I controlli arrivano nel campo `statusCheckRollup`
 *     e si riducono come fa `gh pr checks` (`pkg/cmd/pr/checks/aggregate.go:36-93`).
 *   · ⛔ `--repo` SEMPRE esplicito, preso dal remoto del ramo: il repository dell'owner ha tre remoti, e la scelta implicita
 *     di `gh` non è la nostra.
 *   · ⛔ Ogni valore che viene da git, da GitHub o dalla persona va nella forma `--flag=valore` (revisione del 27/09): come
 *     argomento separato, un titolo «--web» o «--draft» potrebbe essere letto come un'opzione; attaccato col `=` è solo testo.
 *   · Crea: `gh pr create --head --base --title --body-file -` (+ `--draft`): con tutti e quattro `gh` non chiede niente e non
 *     spinge niente («Use `--head` to explicitly skip any forking or pushing behavior»). Il ramo non inviato è un rifiuto
 *     NOMINATO (`GH_BRANCH_NOT_PUSHED`): la scheda lo trasforma nella conferma di Invia/Pubblica (decisioni 2 e 22).
 *   · Nessun `.bat`/`.cmd`: `gh.exe` e `tar.exe` per percorso assoluto, `shell:false` dalla politica di processo.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { createProcessPolicy } from './process-policy.mjs';

export const VERSIONE_GH = '2.101.0';
/** La più vecchia misurata con tutti i comandi che servono (`auth status --json`, `pr list --json statusCheckRollup`): 2.97.0 sul PC dell'owner, 27/09. */
export const VERSIONE_GH_MINIMA = '2.97.0';
/** Impronte lette il 27/09/2026 da `gh_2.101.0_checksums.txt` della release ufficiale; lo zip amd64 anche scaricato e riverificato. */
export const PACCHETTI_GH = Object.freeze({
  'win32-x64': Object.freeze({ nome: 'gh_2.101.0_windows_amd64.zip', sha256: 'bc6c814367b193cd8e713611d61e36013c0ef843b8f516458fe3eda039192794' }),
  'win32-arm64': Object.freeze({ nome: 'gh_2.101.0_windows_arm64.zip', sha256: 'e6cbb2d4afdad3e70f3d38b8d1ebaa3a0870a897cfc0e4cf569826710b96b4fd' }),
});
const INDIRIZZO_RILASCIO = `https://github.com/cli/cli/releases/download/v${VERSIONE_GH}/`;
const FILE_IMPRONTE = `gh_${VERSIONE_GH}_checksums.txt`;
const TETTO_ZIP_BYTE = 64 * 1024 * 1024;
const TIMEOUT_LETTURA_MS = 30_000; // Hermes `runGh`: 30 s
const TIMEOUT_CREA_MS = 60_000;
const TIMEOUT_SCARICA_MS = 5 * 60_000;
/** Il codice del device flow scade in 900 s (docs GitHub); un minuto in più, poi il login si ferma da sé. */
const TIMEOUT_LOGIN_MS = 16 * 60_000;
const TETTO_USCITA_BYTE = 8 * 1024 * 1024;
/** Limiti di GitHub per titolo e testo di una PR. */
const TETTO_TITOLO = 256;
const TETTO_TESTO = 65_536;
const CAMPI_PR = 'number,title,url,state,isDraft,isCrossRepository,headRepositoryOwner,headRefName,baseRefName,author,updatedAt,createdAt,reviewDecision,mergeStateStatus';

/**
 * Le chiavi d'ambiente che `gh` vede. `APPDATA`/`LOCALAPPDATA`/`USERPROFILE`: la sua configurazione e il portachiavi;
 * `PATH`: `gh` chiama `git`. `GH_TOKEN`/`GITHUB_TOKEN`/`GH_CONFIG_DIR` passano SE la persona li ha impostati (hanno la
 * precedenza su ciò che è salvato, `gh help environment`): TALOS non li legge, li lascia a `gh`.
 */
const AMBIENTE_GH = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'USERNAME',
  'ProgramData', 'PROGRAMDATA', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_CONFIG_DIR',
  'GH_PROMPT_DISABLED', 'GH_NO_UPDATE_NOTIFIER', 'GH_NO_EXTENSION_UPDATE_NOTIFIER', 'GH_SPINNER_DISABLED', 'NO_COLOR', 'GH_PAGER',
]);
/** `gh help environment`: nessuna domanda nel terminale, nessun avviso d'aggiornamento, niente colori, niente pager. */
const AMBIENTE_FISSO = Object.freeze({
  GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1', GH_SPINNER_DISABLED: '1', NO_COLOR: '1', GH_PAGER: '',
});

export class GhServiceError extends Error {
  /**
   * ⛔⛔ K4a (03/10/2026, owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — il `message` è la
   *   frase INGLESE (riserva per la CLI, il modello e i log). Le due frasi che la scheda GitHub mostra davvero — l'errore
   *   dell'installazione e quello dell'accesso — portano anche `frase: { chiave, params }`: la chiave dell'area `server` del
   *   dizionario (`server.gh.…`) e i valori. Ricerca 03/10/2026: codice stabile + valori + riserva inglese (Google AIP-193).
   * @param {{chiave: string, params?: object}} [frase]
   */
  constructor(message, code = 'GH_COMMAND_FAILED', dettagli = null, frase = null) {
    super(message);
    this.name = 'GhServiceError';
    this.code = code;
    if (dettagli) this.dettagli = dettagli;
    if (frase?.chiave) { this.chiave = frase.chiave; if (frase.params) this.params = frase.params; }
  }
}

/** I campi `<campo>Chiave` e `<campo>Params` di una frase, se ne ha: mai una chiave senza il suo testo. */
const campiFrase = (campo, frase) => (frase?.chiave ? { [`${campo}Chiave`]: frase.chiave, ...(frase.params ? { [`${campo}Params`]: frase.params } : {}) } : {});

/** `2.97.0` ≥ `2.97.0`? Solo i tre numeri; una versione illeggibile non è mai «abbastanza nuova». */
export function versioneAlmeno(versione, minima) {
  const a = /^(\d+)\.(\d+)\.(\d+)/u.exec(String(versione ?? ''));
  const b = /^(\d+)\.(\d+)\.(\d+)/u.exec(minima);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i += 1) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  }
  return true;
}

/**
 * Proprietario e nome di un repository su github.com dall'indirizzo di un remoto (https, ssh `git@`, `ssh://`), o `null`
 * se il remoto non è su github.com. ⛔ Un nome con caratteri che GitHub non ammette non passa: finisce in `--repo`.
 */
export function repoDaIndirizzo(url) {
  const testo = String(url ?? '').trim();
  const m = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/u.exec(testo);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return `${m[1]}/${m[2]}`;
}

/**
 * I controlli di una PR dal campo `statusCheckRollup`, ridotti come `gh pr checks` (`aggregate.go:36-93`): l'ultima
 * esecuzione per nome, cinque esiti (passato · fallito · in corso · saltato · annullato), e i conteggi.
 */
export function controlliDaRollup(rollup) {
  const voci = Array.isArray(rollup) ? rollup.filter((c) => c && typeof c === 'object') : [];
  const ordinati = [...voci].sort((a, b) => String(b.startedAt ?? b.createdAt ?? '').localeCompare(String(a.startedAt ?? a.createdAt ?? '')));
  const visti = new Set();
  const esito = [];
  const conteggi = { passati: 0, falliti: 0, inCorso: 0, saltati: 0, annullati: 0 };
  for (const c of ordinati) {
    const contesto = c.__typename === 'StatusContext';
    const nome = String((contesto ? c.context : c.name) ?? '').trim() || '(senza nome)';
    const flusso = contesto ? null : (typeof c.workflowName === 'string' && c.workflowName ? c.workflowName : null);
    const chiave = contesto ? `contesto\0${nome}` : `esecuzione\0${nome}\0${flusso ?? ''}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    const statoGrezzo = String((contesto ? c.state : (c.status === 'COMPLETED' ? c.conclusion : c.status)) ?? '').toUpperCase();
    let stato;
    if (statoGrezzo === 'SUCCESS') { stato = 'passato'; conteggi.passati += 1; }
    else if (statoGrezzo === 'SKIPPED' || statoGrezzo === 'NEUTRAL') { stato = 'saltato'; conteggi.saltati += 1; }
    else if (['ERROR', 'FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(statoGrezzo)) { stato = 'fallito'; conteggi.falliti += 1; }
    else if (statoGrezzo === 'CANCELLED') { stato = 'annullato'; conteggi.annullati += 1; }
    else { stato = 'in-corso'; conteggi.inCorso += 1; }
    const indirizzo = String((contesto ? c.targetUrl : c.detailsUrl) ?? '');
    esito.push({
      nome, flusso, stato,
      indirizzo: /^https:\/\/github\.com\//u.test(indirizzo) ? indirizzo : null,
      inizio: c.startedAt ?? c.createdAt ?? null,
      fine: c.completedAt ?? null,
    });
  }
  const ordine = { fallito: 0, 'in-corso': 1, annullato: 2, passato: 3, saltato: 4 };
  esito.sort((a, b) => ordine[a.stato] - ordine[b.stato] || a.nome.localeCompare(b.nome));
  return { voci: esito, conteggi, totale: esito.length };
}

/** Una riga di PR come la scheda la usa: niente di ciò che `gh` restituisce passa senza essere stato letto qui. */
function prDaGh(pr) {
  if (!pr || typeof pr !== 'object' || !Number.isSafeInteger(pr.number)) return null;
  const url = typeof pr.url === 'string' && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/u.test(pr.url) ? pr.url : null;
  return {
    numero: pr.number,
    titolo: String(pr.title ?? ''),
    url,
    stato: ['OPEN', 'CLOSED', 'MERGED'].includes(pr.state) ? pr.state.toLowerCase() : 'sconosciuto',
    bozza: pr.isDraft === true,
    daFork: pr.isCrossRepository === true,
    ramo: String(pr.headRefName ?? ''),
    base: String(pr.baseRefName ?? ''),
    autore: typeof pr.author?.login === 'string' ? pr.author.login : null,
    aggiornata: pr.updatedAt ?? null,
    creata: pr.createdAt ?? null,
    revisione: typeof pr.reviewDecision === 'string' && pr.reviewDecision ? pr.reviewDecision : null,
    unione: typeof pr.mergeStateStatus === 'string' ? pr.mergeStateStatus : null,
    ...(Array.isArray(pr.statusCheckRollup) ? { controlli: controlliDaRollup(pr.statusCheckRollup) } : {}),
  };
}

/**
 * Titolo e testo della bozza come `gh pr create --fill` (`create.go:709-737`): un commit ⇒ il suo soggetto e il suo corpo;
 * più commit ⇒ il nome del ramo con `-`/`_` come spazi, e l'elenco dei soggetti dal più vecchio.
 */
export function bozzaDaCommit(ramo, commit) {
  const elenco = Array.isArray(commit) ? commit : [];
  if (elenco.length === 1) return { titolo: elenco[0].soggetto ?? '', testo: elenco[0].corpo ?? '' };
  const titolo = String(ramo ?? '').replace(/[-_]/gu, ' ');
  const testo = [...elenco].reverse().map((c) => `- **${c.soggetto}**\n`).join('');
  return { titolo, testo };
}

/** Il codice del device flow e il suo indirizzo, letti per FORMA dallo stderr di `gh auth login` (mai dalle parole). */
export function codiceDiAccesso(testo) {
  const pulito = String(testo ?? '').replace(/\u001b\[[0-9;]*m/gu, '');
  const codice = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/u.exec(pulito)?.[1] ?? null;
  const indirizzo = /(https:\/\/github\.com\/login\/device)\b/u.exec(pulito)?.[1] ?? null;
  return { codice, indirizzo };
}

function rifiuto(errore) {
  if (errore instanceof GhServiceError) return { erroreAvvio: errore.message, code: errore.code, ...(errore.dettagli ? { dettagli: errore.dettagli } : {}) };
  return { erroreAvvio: errore?.message || 'gh failed', code: 'GH_COMMAND_FAILED' };
}

/**
 * @param {object} opzioni
 * @param {string} opzioni.cartellaStrumenti  dove TALOS tiene il SUO `gh` (`<dati>/.tools/gh/`)
 * @param {object} opzioni.servizioGit        `creaServizioGit(...)`: ramo, remoti, riferimento e la bozza della PR
 */
export function creaServizioGh({
  cartellaStrumenti,
  servizioGit,
  piattaforma = process.platform,
  architettura = process.arch,
  ambiente = process.env,
  eseguiFn = null,
  avviaFn = null,
  scaricaFn = null,
  estraiFn = null,
  esisteFn = null,
  adesso = () => Date.now(),
} = {}) {
  if (typeof cartellaStrumenti !== 'string' || !isAbsolute(cartellaStrumenti)) throw new GhServiceError('The TALOS tools folder is required', 'GH_STORE_UNAVAILABLE');
  if (!servizioGit || typeof servizioGit.sincronizzazione !== 'function') throw new GhServiceError('The git service is required', 'GH_STORE_UNAVAILABLE');
  const cartellaVersione = join(cartellaStrumenti, VERSIONE_GH);
  const eseguibileTalos = join(cartellaVersione, 'bin', 'gh.exe');
  const esiste = esisteFn ?? (async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } });

  /* ─────────── eseguire `gh` ─────────── */

  function politica(eseguibile, cartella) {
    return createProcessPolicy({ allowedExecutables: [eseguibile], cwdRoot: cartella, envAllowlist: AMBIENTE_GH });
  }

  async function eseguiVero(eseguibile, argomenti, { cartella, input = null, timeoutMs = TIMEOUT_LETTURA_MS } = {}) {
    const policy = politica(eseguibile, cartella);
    return new Promise((esci) => {
      const figlio = policy.execFile(eseguibile, argomenti, {
        cwd: cartella, encoding: 'buffer', timeout: timeoutMs, maxBuffer: TETTO_USCITA_BYTE, windowsHide: true, env: AMBIENTE_FISSO,
      }, (errore, stdout, stderr) => {
        const fuori = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout ?? '');
        const errori = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '');
        if (!errore) { esci({ codice: 0, stdout: fuori, stderr: errori }); return; }
        esci({
          codice: typeof errore.code === 'number' ? errore.code : null, stdout: fuori, stderr: errori,
          scaduto: errore.killed === true || errore.signal != null,
          avvioFallito: errore.code === 'ENOENT',
          troppoGrande: errore.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        });
      });
      figlio.stdin?.on('error', () => {});
      figlio.stdin?.end(input ?? undefined);
    });
  }
  const esegui = eseguiFn ?? eseguiVero;

  /* ─────────── trovare `gh` ─────────── */

  /** `gh.exe` sul PATH, cercato come farebbe la shell ma senza shell (niente `where`, niente `.bat`/`.cmd`). */
  async function ghSulPath() {
    const cartelle = String(ambiente.PATH ?? ambiente.Path ?? '').split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/u, '$1')).filter((c) => c && isAbsolute(c));
    for (const c of cartelle) {
      const candidato = join(c, piattaforma === 'win32' ? 'gh.exe' : 'gh');
      if (await esiste(candidato)) return candidato;
    }
    return null;
  }

  async function versioneDi(eseguibile) {
    const esito = await esegui(eseguibile, ['--version'], { cartella: cartellaStrumenti });
    if (esito.codice !== 0) return null;
    return /\bgh version (\d+\.\d+\.\d+)/u.exec(esito.stdout)?.[1] ?? null;
  }

  /**
   * Quale `gh` si usa: quello del sistema se c'è ed è abbastanza nuovo (è quello che la persona aggiorna), altrimenti quello
   * di TALOS se è già stato scaricato. `null` se nessuno dei due: la scheda offre di scaricarlo.
   */
  let trovatoInCache = null;
  async function trova({ forza = false } = {}) {
    if (trovatoInCache && !forza) return trovatoInCache;
    await mkdir(cartellaStrumenti, { recursive: true });
    const diSistema = await ghSulPath();
    let sistemaTroppoVecchio = null;
    if (diSistema) {
      const versione = await versioneDi(diSistema);
      if (versione && versioneAlmeno(versione, VERSIONE_GH_MINIMA)) {
        trovatoInCache = { eseguibile: diSistema, origine: 'sistema', versione };
        return trovatoInCache;
      }
      sistemaTroppoVecchio = versione ?? 'illeggibile';
    }
    if (await esiste(eseguibileTalos)) {
      const versione = await versioneDi(eseguibileTalos);
      if (versione) {
        trovatoInCache = { eseguibile: eseguibileTalos, origine: 'talos', versione, ...(sistemaTroppoVecchio ? { sistemaTroppoVecchio } : {}) };
        return trovatoInCache;
      }
    }
    return sistemaTroppoVecchio ? { eseguibile: null, origine: null, versione: null, sistemaTroppoVecchio } : null;
  }

  async function ghPronto() {
    const trovato = await trova();
    if (!trovato?.eseguibile) throw new GhServiceError('GitHub CLI is not installed', 'GH_NOT_INSTALLED', trovato?.sistemaTroppoVecchio ? { sistemaTroppoVecchio: trovato.sistemaTroppoVecchio } : null);
    return trovato;
  }

  /** Lancia `gh` e traduce ogni fallimento in un codice NOMINATO; lo stderr di `gh` resta il messaggio, per chi legge. */
  async function gh(argomenti, { cartella = cartellaStrumenti, input = null, timeoutMs = TIMEOUT_LETTURA_MS } = {}) {
    const { eseguibile } = await ghPronto();
    const esito = await esegui(eseguibile, argomenti, { cartella, input, timeoutMs });
    if (esito.codice === 0) return esito;
    if (esito.troppoGrande) throw new GhServiceError('The GitHub response exceeds the allowed limit', 'GH_OUTPUT_TOO_LARGE');
    if (esito.scaduto) throw new GhServiceError('GitHub did not respond within the maximum time', 'GH_TIMEOUT');
    if (esito.avvioFallito) { trovatoInCache = null; throw new GhServiceError('GitHub CLI is no longer reachable', 'GH_NOT_INSTALLED'); }
    /* uscita 4 = «authentication required» (`gh help exit-codes`): un codice, non una frase */
    if (esito.codice === 4) throw new GhServiceError('GitHub is not connected', 'GH_NOT_LOGGED_IN');
    throw new GhServiceError(String(esito.stderr || '').trim().split('\n').slice(-3).join(' ') || 'gh answered with an error', 'GH_COMMAND_FAILED');
  }

  function json(esito) {
    try { return JSON.parse(esito.stdout); } catch { throw new GhServiceError('GitHub response not readable', 'GH_OUTPUT_INVALID'); }
  }

  /* ─────────── stato e accesso ─────────── */

  async function accesso() {
    const esito = await gh(['auth', 'status', '--json', 'hosts', '--hostname', 'github.com'], {}).catch((e) => {
      if (e?.code === 'GH_COMMAND_FAILED' || e?.code === 'GH_NOT_LOGGED_IN') return null;
      throw e;
    });
    const voci = esito ? json(esito)?.hosts?.['github.com'] : null;
    const attiva = Array.isArray(voci) ? voci.find((v) => v?.active === true) ?? voci[0] : null;
    if (!attiva || attiva.state !== 'success') return { collegato: false, account: attiva?.login ?? null, ambiti: [] };
    return {
      collegato: true,
      account: typeof attiva.login === 'string' ? attiva.login : null,
      ambiti: String(attiva.scopes ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      protocollo: attiva.gitProtocol ?? null,
      fonte: attiva.tokenSource ?? null,
    };
  }

  /* ─────────── scaricare `gh` ─────────── */

  async function scaricaVero(url, destinazione, { tettoByte, timeoutMs }) {
    const controllo = AbortSignal.timeout(timeoutMs);
    const risposta = await fetch(url, { redirect: 'follow', signal: controllo });
    if (!risposta.ok || !risposta.body) throw new GhServiceError(`Download failed (HTTP ${risposta.status})`, 'GH_DOWNLOAD_FAILED', null, { chiave: 'server.gh.install.downloadFailed', params: { status: risposta.status } });
    const hash = createHash('sha256');
    let byte = 0;
    const conta = new Transform({
      transform(pezzo, _codifica, avanti) {
        byte += pezzo.length;
        if (byte > tettoByte) { avanti(new GhServiceError('The downloaded file is larger than expected', 'GH_DOWNLOAD_FAILED', null, { chiave: 'server.gh.install.fileTooBig' })); return; }
        hash.update(pezzo);
        avanti(null, pezzo);
      },
    });
    await pipeline(Readable.fromWeb(risposta.body), conta, createWriteStream(destinazione));
    return { byte, sha256: hash.digest('hex') };
  }
  const scarica = scaricaFn ?? scaricaVero;

  async function estraiVero(zip, destinazione) {
    const tar = join(ambiente.SystemRoot ?? ambiente.WINDIR ?? 'C:\\Windows', 'System32', 'tar.exe');
    if (!(await esiste(tar))) throw new GhServiceError('Windows tar.exe is missing to extract GitHub CLI', 'GH_EXTRACT_FAILED', null, { chiave: 'server.gh.install.noTar' });
    const esito = await esegui(tar, ['-xf', zip, '-C', destinazione], { cartella: destinazione, timeoutMs: 120_000 });
    if (esito.codice !== 0) { const detto = String(esito.stderr || '').trim(); throw new GhServiceError(detto || 'Extraction failed', 'GH_EXTRACT_FAILED', null, detto ? null : { chiave: 'server.gh.install.extractFailed' }); }
  }
  const estrai = estraiFn ?? estraiVero;

  let installazione = null;
  let ultimoErroreInstallazione = null;
  let ultimaFraseInstallazione = null; // la chiave del dizionario dell'ultimo errore, se la porta
  async function installaInterno() {
    const pacchetto = PACCHETTI_GH[`${piattaforma}-${architettura}`];
    if (!pacchetto) throw new GhServiceError(`GitHub CLI cannot be installed by TALOS on ${piattaforma}-${architettura}`, 'GH_UNSUPPORTED_PLATFORM', null, { chiave: 'server.gh.install.unsupported', params: { platform: piattaforma, arch: architettura } });
    await mkdir(cartellaStrumenti, { recursive: true });
    const lavoro = join(cartellaStrumenti, `.scarica-${VERSIONE_GH}-${adesso()}`);
    await mkdir(lavoro, { recursive: true });
    try {
      const impronte = join(lavoro, FILE_IMPRONTE);
      await scarica(`${INDIRIZZO_RILASCIO}${FILE_IMPRONTE}`, impronte, { tettoByte: 64 * 1024, timeoutMs: TIMEOUT_LETTURA_MS });
      const riga = (await readFile(impronte, 'utf8')).split('\n').map((r) => r.trim().split(/\s+/u)).find((p) => p[1] === pacchetto.nome);
      if (!riga || riga[0].toLowerCase() !== pacchetto.sha256) {
        throw new GhServiceError('The checksum published by GitHub does not match the one TALOS expects: no installation', 'GH_CHECKSUM_MISMATCH', null, { chiave: 'server.gh.install.checksumPublished' });
      }
      const zip = join(lavoro, pacchetto.nome);
      const scaricato = await scarica(`${INDIRIZZO_RILASCIO}${pacchetto.nome}`, zip, { tettoByte: TETTO_ZIP_BYTE, timeoutMs: TIMEOUT_SCARICA_MS });
      if (scaricato.sha256 !== pacchetto.sha256) {
        throw new GhServiceError('The downloaded file does not have the expected checksum: no installation', 'GH_CHECKSUM_MISMATCH', null, { chiave: 'server.gh.install.checksumFile' });
      }
      const estratto = join(lavoro, 'estratto');
      await mkdir(estratto, { recursive: true });
      await estrai(zip, estratto);
      if (!(await esiste(join(estratto, 'bin', 'gh.exe')))) throw new GhServiceError('The zip does not contain bin/gh.exe', 'GH_EXTRACT_FAILED', null, { chiave: 'server.gh.install.noGhExe' });
      await writeFile(join(estratto, 'talos-installazione.json'), JSON.stringify({ versione: VERSIONE_GH, pacchetto: pacchetto.nome, sha256: pacchetto.sha256, installato: new Date(adesso()).toISOString() }, null, 1), 'utf8');
      await rm(cartellaVersione, { recursive: true, force: true });
      await rename(estratto, cartellaVersione);
      trovatoInCache = null;
    } finally {
      await rm(lavoro, { recursive: true, force: true }).catch(() => {});
    }
  }

  /* ─────────── collegare l'account ─────────── */

  const collegamento = { stato: 'fermo', codice: null, indirizzo: null, errore: null, frase: null, figlio: null, timer: null };
  let avvioCollegamento = null;

  function avviaVero(eseguibile, argomenti) {
    const policy = politica(eseguibile, cartellaStrumenti);
    return policy.spawn(eseguibile, argomenti, { cwd: cartellaStrumenti, env: AMBIENTE_FISSO, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const avvia = avviaFn ?? avviaVero;

  function chiudiCollegamento(stato, errore = null, frase = null) {
    clearTimeout(collegamento.timer);
    collegamento.timer = null;
    collegamento.figlio = null;
    collegamento.stato = stato;
    collegamento.errore = errore;
    collegamento.frase = errore ? frase : null;
    if (stato !== 'in-attesa') { collegamento.codice = null; collegamento.indirizzo = null; }
  }

  function vistaCollegamento() {
    return { stato: collegamento.stato, codice: collegamento.codice, indirizzo: collegamento.indirizzo, errore: collegamento.errore, ...campiFrase('errore', collegamento.frase) };
  }

  /* ─────────── il repository e il ramo della sessione ─────────── */

  function daGit(esito) {
    if (esito && typeof esito === 'object' && typeof esito.erroreAvvio === 'string') throw new GhServiceError(esito.erroreAvvio, esito.code ?? 'GH_GIT_FAILED');
    return esito;
  }

  /**
   * Il repository GitHub del ramo: il remoto che il ramo segue, altrimenti quello su cui si pubblicherebbe (la stessa scelta
   * di git, `remotoPerInvio`). ⛔ Mai un altro remoto «perché è su GitHub»: la PR va dove va il ramo.
   */
  async function repoDelRamo(sessionId) {
    const sinc = daGit(await servizioGit.sincronizzazione({ sessionId }));
    if (!sinc.ramo) throw new GhServiceError('No branch: HEAD is detached', 'GIT_DETACHED');
    const nomeRemoto = sinc.riferimento?.remoto ?? sinc.remotoPerInvio ?? null;
    const remoto = sinc.remoti?.find((r) => r.nome === nomeRemoto) ?? null;
    if (!remoto) throw new GhServiceError('This repository has no remote for the branch', 'GIT_NO_REMOTE');
    const repo = repoDaIndirizzo(remoto.urlInvio ?? remoto.url) ?? repoDaIndirizzo(remoto.url);
    if (!repo) throw new GhServiceError(`The remote “${remoto.nome}” is not on github.com`, 'GH_NOT_GITHUB');
    return { repo, remoto: remoto.nome, sinc };
  }

  const ramiPredefiniti = new Map();
  async function ramoPredefinito(repo) {
    const noto = ramiPredefiniti.get(repo);
    if (noto && adesso() - noto.quando < 10 * 60_000) return noto.nome;
    const nome = json(await gh(['repo', 'view', repo, '--json', 'defaultBranchRef']))?.defaultBranchRef?.name ?? null;
    if (typeof nome === 'string' && nome) ramiPredefiniti.set(repo, { nome, quando: adesso() });
    return nome;
  }

  const servizio = Object.freeze({
    /** Tutto ciò che la scheda deve sapere prima di mostrare le PR: `gh` c'è? di chi? è collegato? */
    async stato() {
      try {
        const trovato = await trova();
        const base = {
          versioneTalos: VERSIONE_GH,
          installazione: { inCorso: installazione != null, errore: ultimoErroreInstallazione, ...campiFrase('errore', ultimaFraseInstallazione) },
          collegamento: vistaCollegamento(),
          installabile: Boolean(PACCHETTI_GH[`${piattaforma}-${architettura}`]),
        };
        if (!trovato?.eseguibile) return { ...base, gh: { trovato: false, sistemaTroppoVecchio: trovato?.sistemaTroppoVecchio ?? null }, accesso: { collegato: false, account: null, ambiti: [] } };
        return { ...base, gh: { trovato: true, origine: trovato.origine, versione: trovato.versione, sistemaTroppoVecchio: trovato.sistemaTroppoVecchio ?? null }, accesso: await accesso() };
      } catch (errore) { return rifiuto(errore); }
    },

    /** Scarica e installa il `gh` di TALOS (una installazione alla volta; chi arriva durante aspetta la stessa). */
    async installa() {
      try {
        if (!installazione) {
          ultimoErroreInstallazione = null; ultimaFraseInstallazione = null;
          installazione = installaInterno()
            .catch((errore) => { ultimoErroreInstallazione = errore?.message ?? 'Installation failed'; ultimaFraseInstallazione = errore?.chiave ? { chiave: errore.chiave, params: errore.params } : (errore?.message ? null : { chiave: 'server.gh.install.failed' }); throw errore; })
            .finally(() => { installazione = null; });
        }
        await installazione;
        const trovato = await trova({ forza: true });
        return { ok: true, gh: { trovato: Boolean(trovato?.eseguibile), origine: trovato?.origine ?? null, versione: trovato?.versione ?? null } };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * «Collega GitHub»: avvia `gh auth login --web`, aspetta il codice (al massimo 20 s) e lo restituisce con l'indirizzo.
     * Il processo resta vivo finché la persona non conferma su github.com; `stato()` dice quando ha finito.
     */
    async collega() {
      /* un secondo clic mentre il primo aspetta ancora il codice riceve lo STESSO login (revisione del 27/09: un secondo
         `gh auth login` lasciava il primo processo orfano fino al suo tempo massimo) */
      if (avvioCollegamento) return avvioCollegamento;
      avvioCollegamento = servizio.collegaDaCapo().finally(() => { avvioCollegamento = null; });
      return avvioCollegamento;
    },

    async collegaDaCapo() {
      try {
        if (collegamento.stato === 'in-attesa' && collegamento.codice) return { ok: true, ...vistaCollegamento() };
        const { eseguibile } = await ghPronto();
        const figlio = avvia(eseguibile, ['auth', 'login', '--web', '--clipboard', '--hostname', 'github.com', '--git-protocol', 'https', '--skip-ssh-key']);
        collegamento.figlio = figlio;
        collegamento.stato = 'avvio';
        collegamento.codice = null;
        collegamento.indirizzo = null;
        collegamento.errore = null; collegamento.frase = null;
        let letto = '';
        const primoCodice = new Promise((esci) => {
          const leggi = (pezzo) => {
            letto += String(pezzo);
            const trovato = codiceDiAccesso(letto);
            if (trovato.codice && collegamento.stato === 'avvio') {
              collegamento.codice = trovato.codice;
              collegamento.indirizzo = trovato.indirizzo ?? 'https://github.com/login/device';
              collegamento.stato = 'in-attesa';
              esci(true);
            }
          };
          figlio.stderr?.on('data', leggi);
          figlio.stdout?.on('data', leggi);
          figlio.on('error', (errore) => { chiudiCollegamento('fallito', errore?.message ?? 'gh did not start', errore?.message ? null : { chiave: 'server.gh.login.notStarted' }); esci(false); });
          /* chi annulla stacca prima il figlio (`chiudiCollegamento`), quindi qui arriva solo una fine che nessuno ha chiesto */
          figlio.on('close', (codice) => {
            if (collegamento.figlio !== figlio) return;
            const ultime = codice === 0 ? '' : letto.trim().split('\n').slice(-2).join(' '); // le ultime righe di `gh`, nelle sue parole
            chiudiCollegamento(codice === 0 ? 'collegato' : 'fallito', codice === 0 ? null : (ultime || `gh exited with ${codice}`), codice === 0 || ultime ? null : { chiave: 'server.gh.login.exitedWith', params: { code: codice } });
            esci(false);
          });
          setTimeout(() => esci(false), 20_000).unref?.();
        });
        collegamento.timer = setTimeout(() => {
          if (collegamento.figlio === figlio) { try { figlio.kill(); } catch { /* già uscito */ } chiudiCollegamento('scaduto', 'The code has expired: start again', { chiave: 'server.gh.login.codeExpired' }); }
        }, TIMEOUT_LOGIN_MS);
        collegamento.timer.unref?.();
        const arrivato = await primoCodice;
        if (!arrivato && collegamento.stato !== 'collegato') {
          if (collegamento.figlio === figlio) { try { figlio.kill(); } catch { /* già uscito */ } chiudiCollegamento('fallito', collegamento.errore ?? 'GitHub CLI did not give an access code', collegamento.errore ? collegamento.frase : { chiave: 'server.gh.login.noCode' }); }
          throw new GhServiceError(collegamento.errore ?? 'GitHub CLI did not give an access code', 'GH_LOGIN_FAILED', null, collegamento.frase ?? (collegamento.errore ? null : { chiave: 'server.gh.login.noCode' }));
        }
        return { ok: true, ...vistaCollegamento() };
      } catch (errore) { return rifiuto(errore); }
    },

    /** Ferma un collegamento in attesa del codice. `fermato:false` se non c'era niente da fermare. */
    async annullaCollegamento() {
      const figlio = collegamento.figlio;
      if (!figlio) return { ok: true, fermato: false };
      collegamento.stato = 'annullato';
      try { figlio.kill(); } catch { /* già uscito */ }
      chiudiCollegamento('annullato');
      return { ok: true, fermato: true };
    },

    /**
     * La PR del ramo della sessione (con i suoi controlli) e le PR aperte del repository, le proprie prima.
     * ⛔ La PR del ramo: stesso repository (mai una da fork), aperta prima; una chiusa o unita si mostra solo se il ramo
     *   non è quello predefinito (`gh`, `finder.go:449-452`, cli/cli#4263).
     */
    async pullRequest({ sessionId } = {}) {
      try {
        const { repo, remoto, sinc } = await repoDelRamo(sessionId);
        const ramoRemoto = sinc.riferimento?.ramo ?? sinc.ramo;
        const [delRamo, aperte, chi, predefinito] = await Promise.all([
          gh(['pr', 'list', `--repo=${repo}`, `--head=${ramoRemoto}`, '--state', 'all', '--limit', '30', '--json', `${CAMPI_PR},statusCheckRollup`]).then(json),
          gh(['pr', 'list', `--repo=${repo}`, '--state', 'open', '--limit', '50', '--json', CAMPI_PR]).then(json),
          accesso(),
          ramoPredefinito(repo).catch(() => null),
        ]);
        const candidate = (Array.isArray(delRamo) ? delRamo : []).map(prDaGh).filter((p) => p && !p.daFork);
        const aperta = candidate.find((p) => p.stato === 'open') ?? null;
        const ramoDellaPr = aperta ?? (ramoRemoto !== predefinito ? candidate[0] ?? null : null);
        const io = chi.account;
        const elenco = (Array.isArray(aperte) ? aperte : []).map(prDaGh).filter(Boolean)
          .sort((a, b) => Number(b.autore === io) - Number(a.autore === io) || String(b.aggiornata ?? '').localeCompare(String(a.aggiornata ?? '')));
        return {
          repo, remoto, ramo: sinc.ramo, ramoRemoto, pubblicato: Boolean(sinc.riferimento) && !sinc.riferimentoSparito,
          avanti: sinc.avanti ?? 0, indietro: sinc.indietro ?? 0, ramoPredefinito: predefinito,
          account: io, prDelRamo: ramoDellaPr, aperte: elenco,
        };
      } catch (errore) { return rifiuto(errore); }
    },

    /** I controlli di una PR (per l'aggiornamento mentre corrono, decisione 27). */
    async controlli({ sessionId, numero } = {}) {
      try {
        if (!Number.isSafeInteger(numero) || numero <= 0) throw new GhServiceError('Invalid PR number', 'QUERY_INVALID');
        const { repo } = await repoDelRamo(sessionId);
        const dati = json(await gh(['pr', 'view', String(numero), `--repo=${repo}`, '--json', 'number,state,statusCheckRollup']));
        return { numero, stato: String(dati?.state ?? '').toLowerCase() || null, controlli: controlliDaRollup(dati?.statusCheckRollup) };
      } catch (errore) { return rifiuto(errore); }
    },

    /** La bozza del modulo: base preselezionata, rami del remoto, titolo e testo come `--fill`. */
    async bozza({ sessionId, base = null } = {}) {
      try {
        const { repo, remoto, sinc } = await repoDelRamo(sessionId);
        const predefinito = await ramoPredefinito(repo).catch(() => null);
        const perPr = daGit(await servizioGit.perLaPr({ sessionId, remoto, base, basePredefinita: predefinito }));
        const { titolo, testo } = bozzaDaCommit(sinc.ramo, perPr.commit);
        return {
          repo, remoto, ramo: sinc.ramo, ramoRemoto: sinc.riferimento?.ramo ?? sinc.ramo,
          pubblicato: Boolean(sinc.riferimento) && !sinc.riferimentoSparito, avanti: sinc.avanti ?? 0,
          base: perPr.base, ramoPredefinito: predefinito, basi: perPr.ramiRemoti.filter((r) => r !== (sinc.riferimento?.ramo ?? sinc.ramo)),
          baseTrovata: perPr.baseTrovata, commit: perPr.commit.length, commitOltre: perPr.commitOltre === true, titolo, testo,
        };
      } catch (errore) { return rifiuto(errore); }
    },

    /**
     * Crea la PR. ⛔ Il ramo deve essere già sul remoto e senza commit da inviare: altrimenti `GH_BRANCH_NOT_PUSHED`, e la scheda
     *   passa dalla conferma di Invia/Pubblica. `gh` non spinge mai al posto nostro.
     */
    async crea({ sessionId, titolo, testo = '', base, bozza = false } = {}) {
      try {
        const t = typeof titolo === 'string' ? titolo.trim() : '';
        if (!t) throw new GhServiceError('A title is required', 'GH_INPUT_INVALID');
        if (t.length > TETTO_TITOLO) throw new GhServiceError(`The title exceeds ${TETTO_TITOLO} characters`, 'GH_INPUT_INVALID');
        if (typeof testo !== 'string' || testo.length > TETTO_TESTO) throw new GhServiceError(`The text exceeds ${TETTO_TESTO} characters`, 'GH_INPUT_INVALID');
        if (typeof base !== 'string' || !base || base.startsWith('-')) throw new GhServiceError('A base branch is required', 'GH_INPUT_INVALID');
        const { repo, remoto, sinc } = await repoDelRamo(sessionId);
        const perPr = daGit(await servizioGit.perLaPr({ sessionId, remoto, base }));
        if (!perPr.ramiRemoti.includes(base)) throw new GhServiceError(`The branch “${base}” is not on ${remoto}`, 'GH_BASE_UNKNOWN');
        if (!sinc.riferimento || sinc.riferimentoSparito || (sinc.avanti ?? 0) > 0) {
          throw new GhServiceError('The branch must be pushed to GitHub first', 'GH_BRANCH_NOT_PUSHED', { pubblicato: Boolean(sinc.riferimento) && !sinc.riferimentoSparito, avanti: sinc.avanti ?? 0, remoto });
        }
        if (sinc.riferimento.ramo === base) throw new GhServiceError('The base and the branch are the same', 'GH_INPUT_INVALID');
        const esito = await gh(['pr', 'create', `--repo=${repo}`, `--head=${sinc.riferimento.ramo}`, `--base=${base}`, `--title=${t}`, '--body-file', '-', ...(bozza === true ? ['--draft'] : [])], { input: testo, timeoutMs: TIMEOUT_CREA_MS });
        const url = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/u.exec(esito.stdout);
        if (!url) throw new GhServiceError('GitHub did not return the PR address', 'GH_OUTPUT_INVALID');
        return { ok: true, url: url[0], numero: Number(url[1]), repo, base, ramo: sinc.riferimento.ramo, bozza: bozza === true };
      } catch (errore) { return rifiuto(errore); }
    },
  });
  return servizio;
}
