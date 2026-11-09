/*
 * Git senza i comandi della configurazione del repository — `PROPOSTA-GIT-SICURO-2026-10-31.md` (Desktop, revisione 2; OK della CLI,
 * correzioni del Mobile accolte; Performance in attesa al momento della scrittura).
 *
 * ⛔ Il difetto, MISURATO il 31/10/2026 con Git 2.55.0.windows.3: una cartella COPIATA (zip, rsync, cartella condivisa) porta il suo
 *   `.git/config`, e alcune chiavi sono COMANDI che Git esegue da solo — `core.fsmonitor` a ogni `git status`, `filter.<n>.clean` a
 *   `status`/`diff`/`add`, `diff.<n>.textconv` a `diff`. `statoGit` di TALOS (ogni inizio giro) ha eseguito un `core.fsmonitor`.
 *   Stato dell'arte: GitHub Copilot CLI CVE-2026-45033 (chiavi eseguibili di un repo scoperto, cura con `safe.bareRepository=explicit`
 *   via `GIT_CONFIG_COUNT`); TruffleHog CVE-2025-41390 (Talos: sovrascrivere le chiavi da riga di comando; Red Hat: colpisce i repo
 *   copiati file per file, non i cloni).
 *
 * La cura, più stretta di quelle e senza rompere LFS: si neutralizzano le chiavi eseguibili con ambito `local` o `worktree` (quelle che
 *   arrivano con la cartella), lette con `--show-scope` su TUTTI gli ambiti — ⛔ mai con `--local`, che non segue le inclusioni
 *   (misurato dal Desktop e dal Mobile: una chiave in `include.path` sparisce con `--local`, con `--show-scope` risulta `local`).
 *   Le `system` (Git per Windows porta `filter.lfs.*`) e le `global` della persona restano: sono sue. Leggere la configurazione non
 *   esegue niente. In più, sempre, `SEMPRE_NELLE_LETTURE` (sottomoduli, repo nudi, firma di `log`).
 *
 * Forma chiesta dalla CLI (31/10): `ambienteGitSicuro` restituisce le sole AGGIUNTE all'ambiente, in coda a un `GIT_CONFIG_COUNT` già
 *   presente (mai sovrascritto); `ARGOMENTI_DIFF_SICURI` per diff/show/log; `chiaviEseguibiliLocali` per il classificatore;
 *   `cartellaGitDelComando` per `-C`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ambienteSenzaVariabiliDelServer } from '../ambiente-solo-server.mjs';

export const ARGOMENTI_DIFF_SICURI = Object.freeze(['--no-textconv', '--no-ext-diff']);

/* Revisione 2: la lista INTERA delle chiavi che eseguono un comando (documentazione di git-config), non solo quelle viste. */
export const SCHEMA_CHIAVI_ESEGUIBILI = [
  '^(core\\.(fsmonitor|hookspath|pager|editor|sshcommand|askpass)',
  'credential\\.helper',
  'diff\\.external',
  'diff\\..+\\.(command|textconv)',
  'filter\\..+\\.(clean|smudge|process)',
  'gpg\\.program',
  'gpg\\..+\\.program',
  'merge\\..+\\.driver',
  'sequence\\.editor',
  'pager\\..+)$',
].join('|');

/* Sempre, nelle letture automatiche (revisione 2): un repo nudo non si scopre da solo (Copilot CLI); i sottomoduli non si guardano
   (Mobile, misurato: il fsmonitor di un sottomodulo lo esegue lo `status` del padre, che non ha chiavi sue); `log` non verifica firme
   (`gpg.program`). Revisione 3 (Mobile, misurato; `add` misurato dal Desktop): i GANCI copiati con la cartella in `.git/hooks`
   (`post-index-change` parte già con uno `status` che riscrive l'indice, e con `git add` dei punti di ripristino) non hanno nessuna
   chiave da leggere ⇒ `core.hooksPath` vuoto SEMPRE, non solo quando è locale. */
export const SEMPRE_NELLE_LETTURE = Object.freeze([
  Object.freeze(['core.hooksPath', '']),
  Object.freeze(['safe.bareRepository', 'explicit']),
  Object.freeze(['diff.ignoreSubmodules', 'all']),
  Object.freeze(['log.showSignature', 'false']),
]);

const AMBITI_DELLA_CARTELLA = new Set(['local', 'worktree']);
const TEMPO_MASSIMO_MS = 4_000;

/** `git config --show-scope --null --name-only` ⇒ [{ ambito, chiave }] (coppie separate da NUL). */
export function leggiChiaviConAmbito(testo) {
  const pezzi = String(testo ?? '').split('\0');
  const fuori = [];
  for (let i = 0; i + 1 < pezzi.length; i += 2) {
    const ambito = pezzi[i].trim();
    const chiave = pezzi[i + 1].trim().toLowerCase();
    if (ambito && chiave) fuori.push({ ambito, chiave });
  }
  return fuori;
}

/** Git lanciato SENZA shell: `null` se non c'è o non risponde (mai un'eccezione); codice 1 = nessuna chiave, la risposta normale. */
function eseguiGitReale(argomenti, cartella) {
  return new Promise((risolvi) => {
    let figlio;
    try {
      /* ⛔ 17/09/2026 (A-bis, SPAWN-AMBIENTE-01; rosso nella suite del blocco del 31/10): `env` dichiarato come negli altri lanci di git
         (`workspace-info.mjs`) — senza, la lettura delle chiavi ereditava l'ambiente INTERO del server, token e chiavi compresi. */
      figlio = spawn('git', argomenti, { cwd: cartella, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...ambienteSenzaVariabiliDelServer(), GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } });
    } catch { risolvi(null); return; }
    const pezzi = [];
    const orologio = setTimeout(() => { try { figlio.kill(); } catch { /* già uscito */ } }, TEMPO_MASSIMO_MS);
    /* ⛔ L-2 (come `guardie-attese-e-lavoro.mjs`, misurato da R26-LUNGA): con una cartella oltre i 260 caratteri git non parte e i canali
       emettono `read ENOTCONN`; senza chi li ascolta l'errore non è gestito e cade l'INTERO processo. */
    figlio.stdout.on('error', () => {});
    figlio.stderr.on('error', () => {});
    figlio.stdout.on('data', (d) => pezzi.push(d));
    figlio.stderr.on('data', () => {});
    figlio.once('error', () => { clearTimeout(orologio); risolvi(null); });
    figlio.once('close', (codice) => {
      clearTimeout(orologio);
      risolvi(codice === 0 || codice === 1 ? Buffer.concat(pezzi).toString('utf8') : null);
    });
  });
}

/**
 * Le chiavi eseguibili che la CARTELLA porta con sé (ambito local/worktree, inclusioni comprese), senza doppioni. `[]` se non ce ne
 * sono; `null` se Git non ha saputo rispondere (assente, configurazione rotta). Niente cache (revisione 2): andrebbe invalidata anche
 * dai file inclusi e da `config.worktree`; prima la misura di Performance.
 */
export async function chiaviEseguibiliLocali(cartella, { eseguiGit = eseguiGitReale } = {}) {
  if (typeof cartella !== 'string' || !cartella) return [];
  const uscita = await eseguiGit(['config', '--show-scope', '--null', '--name-only', '--get-regexp', SCHEMA_CHIAVI_ESEGUIBILI], cartella);
  if (uscita === null) return null;
  return [...new Set(leggiChiaviConAmbito(uscita).filter((r) => AMBITI_DELLA_CARTELLA.has(r.ambito)).map((r) => r.chiave))];
}

/**
 * Le AGGIUNTE all'ambiente che spengono le chiavi date, in coda a un `GIT_CONFIG_COUNT` già presente in `envBase` (un conteggio storto
 * o assente vale 0), più `SEMPRE_NELLE_LETTURE`. `core.fsmonitor` va a `false`, le altre a vuoto (misurato: tutte e due spengono il
 * comando, l'uscita di Git resta corretta).
 */
export function aggiunteConChiaviSpente(envBase = {}, chiavi = []) {
  const contatoPrima = Number.parseInt(envBase?.GIT_CONFIG_COUNT ?? '', 10);
  let n = Number.isSafeInteger(contatoPrima) && contatoPrima > 0 ? contatoPrima : 0;
  const aggiunte = {};
  const metti = (chiave, valore) => { aggiunte[`GIT_CONFIG_KEY_${n}`] = chiave; aggiunte[`GIT_CONFIG_VALUE_${n}`] = valore; n += 1; };
  for (const [chiave, valore] of SEMPRE_NELLE_LETTURE) metti(chiave, valore);
  for (const chiave of chiavi ?? []) metti(chiave, chiave === 'core.fsmonitor' ? 'false' : '');
  aggiunte.GIT_CONFIG_COUNT = String(n);
  /* revisione 3 (Mobile): una lettura non riscrive l'indice della persona, quindi niente `post-index-change` nemmeno così */
  aggiunte.GIT_OPTIONAL_LOCKS = '0';
  return aggiunte;
}

/**
 * L'ambiente sicuro per lanciare Git in `cartella`: le aggiunte da unire a `envBase` (`{ ...envBase, ...aggiunte }`), oppure `null` se
 * Git non ha saputo dire quali chiavi porta la cartella: chi chiama SALTA la lettura automatica, mai «procede senza cura». Non lancia
 * eccezioni e non aspetta oltre il tempo massimo.
 */
export async function ambienteGitSicuro(cartella, envBase = process.env, opzioni = {}) {
  const chiavi = await chiaviEseguibiliLocali(cartella, opzioni);
  return chiavi === null ? null : aggiunteConChiaviSpente(envBase, chiavi);
}

/**
 * La stessa cura come argomenti `-c chiave=valore` da mettere PRIMA del sottocomando, per chi lancia Git con un ambiente filtrato
 * (`process-policy` con `envAllowlist`, dove le variabili `GIT_CONFIG_*` non passerebbero). `GIT_OPTIONAL_LOCKS` resta una variabile:
 * chi può la passa. `null` se Git non ha saputo dire le chiavi (si salta la lettura).
 */
export async function argomentiGitSicuri(cartella, opzioni = {}) {
  const { conSottomoduli = false } = opzioni;
  const chiavi = await chiaviEseguibiliLocali(cartella, opzioni);
  if (chiavi === null) return null;
  let sempre = SEMPRE_NELLE_LETTURE;
  if (conSottomoduli) {
    const { chiavi: delleSottocartelle, completo } = await chiaviEseguibiliDeiSottomoduli(cartella, opzioni);
    chiavi.push(...delleSottocartelle.filter((c) => !chiavi.includes(c)));
    /* completo: si guarda dentro ogni sottomodulo (le sue chiavi sono spente). Non completo (oltre 3 livelli, una lettura fallita):
       ripiego a chiusura sicura del Mobile, `dirty` — Git non entra nell'albero di lavoro dei sottomoduli (misurato: spia=0) e vede
       ancora un commit del sottomodulo spostato; la persona perde solo «modificato dentro», per quella volta. */
    /* completo: la chiave non si mette affatto, così resta la scelta della persona (mai un `none` imposto) */
    sempre = SEMPRE_NELLE_LETTURE
      .filter(([chiave]) => !(completo && chiave === 'diff.ignoreSubmodules'))
      .map(([chiave, valore]) => (chiave === 'diff.ignoreSubmodules' ? [chiave, 'dirty'] : [chiave, valore]));
  }
  const coppie = [...sempre, ...chiavi.map((c) => [c, c === 'core.fsmonitor' ? 'false' : ''])];
  return coppie.flatMap(([chiave, valore]) => ['-c', `${chiave}=${valore}`]);
}

const PROFONDITA_SOTTOMODULI = 3;

/**
 * Le chiavi eseguibili dei SOTTOMODULI con un albero di lavoro (fino a 3 livelli), per chi deve vederne le modifiche (lo stato della
 * scheda Git): invece di non guardarli si spengono anche le loro chiavi — le `-c` valgono per tutti i Git figli (Git le passa in
 * `GIT_CONFIG_PARAMETERS`), e un nome di filtro spento vale per tutti i repo; ganci e `fsmonitor` sono già spenti per tutti.
 * ⛔ Revisione 4 (Mobile, misurato): i sottomoduli si trovano dall'INDICE (`ls-files --stage`, modo 160000), mai da `.gitmodules`,
 *   `.git/modules` o `git submodule`: un repo INCORPORATO (voce 160000 e `emb/.git` dentro, senza `.gitmodules`) lo `status` del padre
 *   lo apre ed esegue il suo `fsmonitor`, e quelle tre strade non lo vedono. Per ognuno si legge la sua `.git` (cartella o file).
 * `{ chiavi, completo }`: `completo:false` oltre i 3 livelli o se una lettura fallisce ⇒ chi chiama usa il ripiego `dirty`.
 */
export async function chiaviEseguibiliDeiSottomoduli(cartella, { eseguiGit = eseguiGitReale, profondita = PROFONDITA_SOTTOMODULI } = {}) {
  const radice = await eseguiGit(['rev-parse', '--show-toplevel'], cartella);
  if (radice === null) return { chiavi: [], completo: true }; // non un repository: nessun sottomodulo; la lettura dirà il resto
  const top = radice.trim();
  if (!top) return { chiavi: [], completo: true };
  /* l'indice si legge senza aggiornarlo, e comunque coi comandi della cartella spenti */
  const indice = await eseguiGit(['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', 'ls-files', '--stage', '-z'], top);
  if (indice === null) return { chiavi: [], completo: false };
  const percorsi = indice.split('\0').filter((r) => r.startsWith('160000 ')).map((r) => r.slice(r.indexOf('\t') + 1)).filter(Boolean);
  const conAlbero = percorsi.map((p) => path.resolve(top, p)).filter((dentro) => existsSync(path.join(dentro, '.git')));
  if (conAlbero.length === 0) return { chiavi: [], completo: true };
  if (profondita <= 0) return { chiavi: [], completo: false }; // un livello in più di quelli che si leggono
  const chiavi = new Set();
  for (const dentro of conAlbero) {
    const sue = await chiaviEseguibiliLocali(dentro, { eseguiGit });
    if (sue === null) return { chiavi: [...chiavi], completo: false };
    for (const c of sue) chiavi.add(c);
    const sotto = await chiaviEseguibiliDeiSottomoduli(dentro, { eseguiGit, profondita: profondita - 1 });
    for (const c of sotto.chiavi) chiavi.add(c);
    if (!sotto.completo) return { chiavi: [...chiavi], completo: false };
  }
  return { chiavi: [...chiavi], completo: true };
}

/**
 * La cartella del repo che un comando git aprirà davvero (CLI, revisione 2): quella di `-C <dir>` (anche ripetuto, ognuno relativo al
 * precedente, come fa Git) quando c'è, altrimenti `cwd`. `--git-dir`, `--work-tree` e `GIT_DIR` non si risolvono qui: chi classifica
 * non li auto-approva.
 */
export function cartellaGitDelComando(argomenti, cwd) {
  let cartella = cwd;
  const a = Array.isArray(argomenti) ? argomenti : [];
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    if (x === '-C' && typeof a[i + 1] === 'string') { cartella = path.resolve(cartella, a[i + 1]); i += 1; continue; }
    if (x === '-c' && typeof a[i + 1] === 'string') { i += 1; continue; }
    if (typeof x === 'string' && !x.startsWith('-')) break; // il sottocomando: le opzioni globali sono finite
  }
  return cartella;
}
