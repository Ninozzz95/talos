/*
 * R5.11 — «Annulla le modifiche ai file», dal PC e dal telefono (owner 18/10/2026: «Come Hermes, PC e telefono»).
 *
 * Il disegno è quello di Hermes (`tools/checkpoint_manager.py`, clone 2026-10-07), letto nel codice e adattato:
 *   · un archivio git OMBRA, nudo, fuori dal progetto: `GIT_DIR` = l'archivio, `GIT_WORK_TREE` = il progetto, un indice suo
 *     (`_git_env`, righe 316-355). Il `.git` del progetto non si tocca mai, e un progetto senza git funziona uguale;
 *   · la configurazione dell'utente NON entra (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` = un file vuoto, `GIT_CONFIG_NOSYSTEM=1`, righe
 *     335-346): una firma GPG o un helper delle credenziali aprirebbero finestre a metà giro;
 *   · UNA foto per turno, prima del primo attrezzo che scrive (`ensure_checkpoint`, righe 918-946, `new_turn` 803-805);
 *   · `add -A` → `write-tree` → `commit-tree` → `update-ref`, e nessuna foto se l'albero è uguale al precedente (`_take`,
 *     righe 1416-1560);
 *   · il REGISTRO delle scritture dell'agente: l'impronta sha256 di ogni file che TALOS ha scritto (`record_agent_write`, 825-851);
 *   · il ripristino SICURO: si rimette solo un file il cui contenuto di adesso è ancora quello che l'agente ha scritto; uno toccato
 *     dopo dalla persona si SALTA e si dice (`_safe_restore_plan`, righe 853-916);
 *   · una foto prima di ripristinare, per poter annullare l'annullamento (riga ~1259);
 *   · le esclusioni di serie (dipendenze, build, cache, binari, segreti `.env`) e i tetti: 10 MB per file, 50.000 file.
 *
 * ⭐ Dove facciamo di più (e perché):
 *   · Hermes, a registro VUOTO, ripiega sul ripristino PIENO (`ledger_empty`, riga 1215): rimetterebbe anche file mai scritti
 *     dall'agente. Qui no: ciò che TALOS non ha scritto si salta sempre, e la persona lo può includere a mano, file per file.
 *   · I file si rimettono BYTE PER BYTE: `info/attributes` spegne conversioni di fine riga, filtri (LFS) e codifiche del progetto,
 *     che altrimenti potrebbero cambiare il contenuto all'andata o al ritorno.
 *   · Le scritture FUORI dal progetto (con «Full access») non si possono annullare: si contano e si dicono, non si tacciono.
 *   · Il conteggio dei file salta le cartelle escluse (Hermes conta anche `node_modules`, e un progetto JavaScript sfora per quello).
 *
 * ⛔ Un servizio di supporto: NON blocca mai un giro (owner 12/10, «errori di compattazione non fermano mai la chat», per legge
 *   su ogni servizio di supporto). Ogni guasto diventa «per questo turno non si può annullare», col motivo, mai un'eccezione.
 *
 * Codex ha tolto il suo annulla (`codex-rs/features/src/lib.rs:440-443`); Claude Code fotografa solo Write/Edit, non i comandi.
 * Qui la foto copre anche ciò che fa un comando della shell: si annulla però solo se la persona lo sceglie (TALOS non sa che cosa
 * un comando ha scritto, quindi non lo dà per suo).
 */

import { createHash } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

import { createProcessPolicy } from './process-policy.mjs';

export const ESCLUSIONI_DI_SERIE = Object.freeze([
  'node_modules/', 'dist/', 'build/', 'target/', 'out/', '.next/', '.nuxt/',
  '__pycache__/', '*.pyc', '*.pyo', '.cache/', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/', 'coverage/', '.coverage',
  '.venv/', 'venv/', 'env/',
  '.git/', '.hg/', '.svn/', '.worktrees/',
  '*.so', '*.dylib', '*.dll', '*.o', '*.a', '*.jar', '*.class', '*.exe', '*.obj', '*.node',
  '*.mp4', '*.mov', '*.mkv', '*.webm', '*.zip', '*.tar', '*.tar.gz', '*.tgz', '*.7z', '*.rar', '*.iso',
  '.env', '.env.*',
  '.DS_Store', 'Thumbs.db', '*.log',
]);
/** I nomi di cartella che il conteggio salta (le esclusioni di serie che finiscono con `/`). */
const CARTELLE_ESCLUSE = new Set(ESCLUSIONI_DI_SERIE.filter((x) => x.endsWith('/')).map((x) => x.slice(0, -1)));

export const MASSIMO_FILE = 50_000;
export const MASSIMO_BYTE_PER_FILE = 10 * 1024 * 1024;
export const PUNTI_PER_SESSIONE = 20;
export const VOCI_DEL_REGISTRO = 2_000;
export const TETTO_DIFF_BYTE = 200 * 1024; // il filo verso il telefono ha un tetto di 1 MiB per messaggio
const TIMEOUT_GIT_MS = 60_000;
const RIF_ULTIMO = 'refs/talos/ultimo';
const GIT_MINIMO = [2, 25]; // `--pathspec-from-file` (2.25) e `git restore` (2.23)

const AMBIENTE = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TMP', 'TEMP', 'LANG', 'LC_ALL',
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM',
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_TERMINAL_PROMPT', 'GIT_OPTIONAL_LOCKS',
]);
/* Gli attributi del progetto non devono cambiare i byte: niente fine riga, niente filtri (LFS), niente codifiche. */
const ATTRIBUTI = '* -text -filter -ident -working-tree-encoding\n';

const ID_SESSIONE = /^[A-Za-z0-9_-]{1,128}$/;
const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** Il percorso relativo in forma git (barre in avanti), o null se esce dal progetto. */
export function relativoAlProgetto(progetto, assoluto) {
  const r = relative(progetto, assoluto);
  if (!r || r.startsWith('..') || isAbsolute(r)) return null;
  return r.split(sep).join('/');
}

/** Una cartella troppo larga per fotografarla (Hermes: `/` e la home, riga 929). */
export function cartellaTroppoLarga(cartella) {
  const p = resolve(cartella);
  const radice = parse(p).root;
  const uguale = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  return uguale(p, radice) || uguale(p.replace(/[\\/]+$/, ''), radice.replace(/[\\/]+$/, '')) || uguale(p, resolve(homedir()));
}

async function improntaDelFile(assoluto) {
  try {
    const h = createHash('sha256');
    const fh = await fsp.open(assoluto, fsc.O_RDONLY);
    try {
      for await (const pezzo of fh.createReadStream()) h.update(pezzo);
    } finally { await fh.close().catch(() => {}); }
    return h.digest('hex');
  } catch { return null; }
}

/** Conta i file fino a `tetto`, saltando le cartelle escluse; torna `tetto + 1` appena lo supera. */
export async function contaFile(cartella, tetto = MASSIMO_FILE) {
  let n = 0;
  const pila = [cartella];
  while (pila.length) {
    const d = pila.pop();
    let voci;
    try { voci = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const v of voci) {
      if (v.isDirectory()) { if (!CARTELLE_ESCLUSE.has(v.name)) pila.push(join(d, v.name)); }
      else if (++n > tetto) return n;
    }
  }
  return n;
}

async function scriviAtomico(file, testo) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, testo, 'utf8');
  await fsp.rename(tmp, file);
}
async function leggiJson(file, vuoto) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return vuoto; }
}

/**
 * `cartellaDelloStore(progetto)` → la cartella dove vive l'archivio di QUEL progetto (fuori dal progetto: il server passa la
 * cartella dati del progetto, PO-26). `eseguiGitFn` solo per le prove.
 */
export function creaPuntiDiRipristino({
  cartellaDelloStore,
  eseguiGitFn = null,
  clock = () => Date.now(),
  contaFileFn = contaFile,
  avvisa = () => {},
} = {}) {
  if (typeof cartellaDelloStore !== 'function') throw new TypeError('creaPuntiDiRipristino: cartellaDelloStore is required.');
  const code = new Map(); // store → la fine dell'ultima operazione: un archivio, un'operazione alla volta
  const fatti = new Set(); // `${sessione}:${turno}` già fotografati (o rinunciati) in questo processo
  const inSospeso = new Map(); // progetto → percorsi assoluti che un attrezzo sta scrivendo
  let versioneGit = null; // null = da misurare; { ok, motivo }
  /* PERF 29/10/2026: `${sessione}:${turno}` → la foto partita all'inizio del giro ({ progetto, esito }), finché la prima scrittura non
     la prende. Un turno senza scritture la lascia qui e non diventa un punto; il turno dopo della stessa sessione la scavalca. */
  const anticipate = new Map();

  /**
   * Il file è cambiato (o è nato) da quando la foto è partita? Un file che non c'è, no: la foto dice già che mancava. I 10 ms: su
   * Windows la data di un file scritto PRIMA di `Date.now()` esce fino a 1,2 ms dopo (misurato, due orologi diversi); e ciò che cambia
   * nei primi 10 ms la foto lo vede lo stesso, perché `add -A` legge i file solo dopo almeno due processi git.
   */
  async function cambiatoDopo(assoluto, dalle) {
    const st = await fsp.stat(assoluto).catch(() => null);
    return Boolean(st) && Math.max(st.mtimeMs, st.ctimeMs) > dalle + 10;
  }

  function inFila(store, lavoro) {
    const prima = code.get(store) ?? Promise.resolve();
    const dopo = prima.then(lavoro, lavoro);
    code.set(store, dopo.catch(() => {}));
    return dopo;
  }

  function git(store, progetto, argomenti, { indice = null, cwd = progetto, senzaArchivio = false } = {}) {
    if (eseguiGitFn) return eseguiGitFn({ store, progetto, argomenti, indice, cwd });
    const env = {
      /* `init --bare` rifiuta GIT_WORK_TREE (Hermes, `_init_store`, righe 529-531): lì non si danno né l'uno né l'altro */
      ...(senzaArchivio ? {} : { GIT_DIR: join(store, 'repo'), GIT_WORK_TREE: progetto }),
      ...(indice ? { GIT_INDEX_FILE: indice } : {}),
      GIT_CONFIG_GLOBAL: join(store, 'config-vuota'), GIT_CONFIG_SYSTEM: join(store, 'config-vuota'), GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'TALOS', GIT_AUTHOR_EMAIL: 'talos@localhost.invalid',
      GIT_COMMITTER_NAME: 'TALOS', GIT_COMMITTER_EMAIL: 'talos@localhost.invalid',
      GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
    };
    const policy = createProcessPolicy({ allowedExecutables: ['git'], cwdRoot: cwd, envAllowlist: AMBIENTE });
    return new Promise((esci) => {
      /* `core.quotepath=false`: i percorsi del diff restano leggibili (la finestra lo divide file per file) */
      policy.execFile('git', ['-c', 'core.longpaths=true', '-c', 'core.autocrlf=false', '-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false', ...argomenti], {
        cwd, env, encoding: 'buffer', timeout: TIMEOUT_GIT_MS, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
      }, (errore, stdout, stderr) => {
        esci({
          codice: errore ? (typeof errore.code === 'number' ? errore.code : -1) : 0,
          stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout ?? '')),
          stderr: Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? ''),
          assente: errore?.code === 'ENOENT',
        });
      });
    });
  }
  const testo = (r) => r.stdout.toString('utf8').trim();
  const pezziZ = (r) => r.stdout.toString('utf8').split('\0').filter(Boolean);
  async function gitOk(store, progetto, argomenti, opzioni) {
    const r = await git(store, progetto, argomenti, opzioni);
    if (r.codice !== 0) throw Object.assign(new Error(`git ${argomenti[0]}: ${r.stderr.trim().slice(0, 300) || r.codice}`), { codiceGit: r.codice });
    return r;
  }

  async function gitDisponibile(store, progetto) {
    if (versioneGit) return versioneGit;
    const r = await git(store, progetto, ['--version'], { cwd: progetto });
    if (r.assente) return (versioneGit = { ok: false, motivo: 'git-assente' });
    /* 19/10/2026: un errore che non è l'assenza (un timeout, un processo che non parte) NON si ricorda: si riprova la prossima volta.
       Ricordato, avrebbe tolto «Annulla» dal PC per tutta la vita del processo (`gitPresente`, session-registry). */
    if (r.codice !== 0) return { ok: false, motivo: 'git-assente' };
    const m = /(\d+)\.(\d+)/.exec(testo(r));
    const [a, b] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
    return (versioneGit = (a > GIT_MINIMO[0] || (a === GIT_MINIMO[0] && b >= GIT_MINIMO[1])) ? { ok: true } : { ok: false, motivo: 'git-vecchio' });
  }

  /* PERF 29/10/2026: le cartelle e l'archivio si preparano in due passi, perché fra i due si misura git. Prima `init --bare` partiva
     a ogni turno anche senza git (Mobile, (g)): falliva, avvisava, e al turno dopo ci riprovava. */
  async function preparaCartelle(progetto) {
    const store = await cartellaDelloStore(progetto);
    await fsp.mkdir(join(store, 'indici'), { recursive: true });
    await fsp.mkdir(join(store, 'sessioni'), { recursive: true });
    /* la configurazione «vuota» è un file vero: Git per Windows rifiuta `\\.\nul` («unable to access … Invalid argument», misurato) */
    await fsp.writeFile(join(store, 'config-vuota'), '', { flag: 'a' });
    return store;
  }

  async function preparaArchivio(store, progetto) {
    const repo = join(store, 'repo');
    try { await fsp.access(join(repo, 'HEAD')); } catch {
      await gitOk(store, progetto, ['init', '--bare', '--quiet', repo], { cwd: store, senzaArchivio: true });
      await fsp.mkdir(join(repo, 'info'), { recursive: true });
      await fsp.writeFile(join(repo, 'info', 'exclude'), `${ESCLUSIONI_DI_SERIE.join('\n')}\n`, 'utf8');
      await fsp.writeFile(join(repo, 'info', 'attributes'), ATTRIBUTI, 'utf8');
      await gitOk(store, progetto, ['config', 'gc.auto', '0'], { cwd: store });
    }
  }

  const indiceDi = (store, nome) => join(store, 'indici', `${process.pid}-${nome}.index`);

  /** Mette nell'indice lo stato di adesso del progetto, senza i file oltre il tetto (torna quali ha tolto). */
  async function fotografaNellIndice(store, progetto, indice, base) {
    /*
     * PERF 29/10/2026 (sessione Talos performance, revisione del Desktop) — l'indice resta fra una foto e l'altra e si riallinea alla base
     * con `read-tree -m`: la fusione a un albero tiene le date di ogni voce uguale alla base, così `add -A` rilegge solo i file cambiati.
     * Prima l'indice si cancellava e `read-tree` senza `-m` perdeva tutte le date ⇒ ogni foto rileggeva l'intero progetto (Hermes fa lo
     * stesso, `checkpoint_manager.py` `_take`). Il «racy git» (un file cambiato nello stesso istante in cui l'indice è stato scritto) lo
     * copre git da sé e le prove lo cercano (IDX-03). Un indice che git non accetta si butta e si rifà come prima.
     * ⛔ Limite dichiarato, lo stesso di `git status`/`git diff` (accettato dal Desktop il 29/10): un file riscritto con la STESSA misura e
     *   con la data riportata a un secondo PIÙ VECCHIO non si vede. Provato: data vecchia di 10 s ⇒ cambio perso (prima di questa leva la
     *   rilettura completa lo prendeva). Succede con `cp -p`, `rsync -t` o unzip solo se anche la misura coincide; editor, scritture di
     *   TALOS, `git checkout` e npm mettono sempre la data di adesso.
     */
    if (!base) await fsp.rm(indice, { force: true });
    else if ((await git(store, progetto, ['read-tree', '-m', base], { indice })).codice !== 0) {
      await fsp.rm(indice, { force: true });
      await gitOk(store, progetto, ['read-tree', base], { indice });
    }
    await gitOk(store, progetto, ['add', '-A', '--ignore-errors'], { indice });
    const cambiati = pezziZ(await gitOk(store, progetto, base
      ? ['diff', '--cached', '--name-only', '--no-renames', '-z', base]
      : ['ls-files', '-z'], { indice }));
    const grandi = [];
    for (const rel of cambiati) {
      const st = await fsp.stat(join(progetto, rel)).catch(() => null);
      if (st && st.size > MASSIMO_BYTE_PER_FILE) grandi.push(rel);
    }
    if (grandi.length) {
      const elenco = join(store, 'indici', `${process.pid}-grandi.txt`);
      await fsp.writeFile(elenco, `${grandi.join('\0')}\0`);
      /* oltre il tetto: nell'indice resta com'era nel punto di partenza (o non c'è), così non risulta né cambiato né cancellato */
      await gitOk(store, progetto, base
        ? ['--literal-pathspecs', 'reset', '--quiet', base, `--pathspec-from-file=${elenco}`, '--pathspec-file-nul']
        : ['--literal-pathspecs', 'rm', '--cached', '--quiet', '--ignore-unmatch', `--pathspec-from-file=${elenco}`, '--pathspec-file-nul'], { indice });
    }
    return grandi;
  }

  async function ultimo(store, progetto) {
    const r = await git(store, progetto, ['rev-parse', '--verify', '--quiet', `${RIF_ULTIMO}^{commit}`]);
    return r.codice === 0 && SHA.test(testo(r)) ? testo(r) : null;
  }

  /** La foto vera (Hermes `_take`). Torna lo sha del punto: nuovo, o il precedente se non è cambiato niente. */
  async function scatta(store, progetto, messaggio) {
    const n = await contaFileFn(progetto, MASSIMO_FILE);
    if (n > MASSIMO_FILE) throw Object.assign(new Error('too many files'), { motivo: 'troppi-file' });
    const prima = await ultimo(store, progetto);
    const indice = indiceDi(store, 'foto');
    const grandi = await fotografaNellIndice(store, progetto, indice, prima);
    const albero = testo(await gitOk(store, progetto, ['write-tree'], { indice }));
    if (prima) {
      const alberoPrima = testo(await gitOk(store, progetto, ['rev-parse', `${prima}^{tree}`]));
      if (alberoPrima === albero) return { commit: prima, grandi };
    }
    const commit = testo(await gitOk(store, progetto, ['commit-tree', albero, ...(prima ? ['-p', prima] : []), '-m', messaggio], { indice }));
    const cas = await git(store, progetto, ['update-ref', RIF_ULTIMO, commit, ...(prima ? [prima] : [])]);
    if (cas.codice !== 0) await gitOk(store, progetto, ['update-ref', RIF_ULTIMO, commit]); // un altro processo è passato prima: vince l'ultimo, la catena resta raggiungibile dai riferimenti delle sessioni
    return { commit, grandi };
  }

  const fileSessione = (store, sessionId) => join(store, 'sessioni', `${sessionId}.json`);
  const fileRegistro = (store) => join(store, 'registro-scritture.json');

  async function annotaPunto(store, progetto, sessionId, voce) {
    const f = fileSessione(store, sessionId);
    const s = await leggiJson(f, { punti: [] });
    const punti = Array.isArray(s.punti) ? s.punti : [];
    punti.push(voce);
    const via = punti.splice(0, Math.max(0, punti.length - PUNTI_PER_SESSIONE));
    if (voce.commit) await gitOk(store, progetto, ['update-ref', `refs/talos/punti/${sessionId}/${voce.chiave}`, voce.commit]);
    for (const v of via) if (v.commit) await git(store, progetto, ['update-ref', '-d', `refs/talos/punti/${sessionId}/${v.chiave}`]);
    await scriviAtomico(f, JSON.stringify({ punti }, null, 1));
  }

  async function annotaFuori(store, sessionId, turno, assoluto) {
    const f = fileSessione(store, sessionId);
    const s = await leggiJson(f, { punti: [] });
    const p = (s.punti ?? []).findLast((x) => x.turno === turno) ?? null;
    if (!p) return;
    p.fuori = [...new Set([...(p.fuori ?? []), assoluto])].slice(0, 50);
    await scriviAtomico(f, JSON.stringify(s, null, 1));
  }

  /** Revisione del Desktop 29/10: i file che qualcun altro ha cambiato durante il turno, prima che TALOS li riscrivesse. */
  async function annotaAltri(store, sessionId, turno, rel, motivo) {
    const f = fileSessione(store, sessionId);
    const s = await leggiJson(f, { punti: [] });
    const p = (s.punti ?? []).findLast((x) => x.turno === turno) ?? null;
    if (!p) return;
    p.altri = { ...(p.altri ?? {}), [rel]: motivo };
    await scriviAtomico(f, JSON.stringify(s, null, 1));
  }

  /*
   * PERF 29/10/2026, revisione del Desktop — con la foto in anticipo la finestra fra la foto e la scrittura copre anche il tempo in cui
   * il modello pensa (anche minuti). Se la persona cambia X in quel tempo e poi TALOS lo modifica (la modifica della persona finisce DENTRO
   * la versione di TALOS), annullare rimetterebbe la X di inizio turno e la modifica della persona sparirebbe in silenzio. ⇒ A OGNI
   * scrittura del turno, PRIMA che l'attrezzo scriva: X già scritto da TALOS in questo turno ⇒ cambiato da altri se l'impronta di adesso
   * non è quella registrata; mai scritto ⇒ cambiato da altri se la sua data è dopo l'inizio della foto. `persona` se nel turno non è
   * girata la shell; con la shell non si sa chi è stato (`non-di-talos`, la scelta prudente). Annullare li salta e lo dice.
   */
  const turni = new Map(); // `${sessione}:${turno}` → { progetto, dalle, scritti: Set(rel), shell }
  function turnoDi(chiave, progetto, dalle) {
    turni.delete(chiave);
    while (turni.size >= 500) turni.delete(turni.keys().next().value);
    const t = { progetto, dalle, scritti: new Set(), shell: false };
    turni.set(chiave, t);
    return t;
  }
  async function cambiatoDaAltri(t, progetto, rel, assoluto) {
    if (!t.scritti.has(rel)) return cambiatoDopo(assoluto, t.dalle);
    const store = await cartellaDelloStore(progetto);
    const voce = (await leggiJson(fileRegistro(store), {}))[rel];
    if (!voce) return cambiatoDopo(assoluto, t.dalle); // la scrittura di TALOS non è arrivata in fondo: conta la data
    return (await improntaDelFile(assoluto)) !== voce.sha256;
  }

  const valida = (sessionId) => typeof sessionId === 'string' && ID_SESSIONE.test(sessionId);

  return {
    /**
     * 19/10/2026 (trovato dal Mobile: sul telefono git non c'è e `file_changes_undo` si offriva lo stesso) — sincrono, per chi lega
     * gli attrezzi: `false` SOLO quando git è già stato misurato e manca (o è troppo vecchio); `null` finché non si è misurato.
     */
    gitPresente() { return versioneGit ? versioneGit.ok : null; },
    /** La misura di git, fatta una volta (il server la lancia all'avvio). `cartella`: una cartella che esiste, per il cwd. */
    async misuraGit(cartella) { return gitDisponibile(cartella, cartella); },
    /**
     * PERF 29/10/2026 (owner, sessione Talos performance) — la foto del turno parte all'INIZIO del giro, mentre il modello pensa, e la
     * prima scrittura la trova fatta: su un progetto grande erano ~5,2 s di git davanti alla prima scrittura (micro-scrittura, modello
     * finto). OpenCode `packages/core/src/session/runner/step.ts:74-76`: «The start snapshot only has to exist before local tools
     * run… captured while the provider request is in flight instead of delaying it». Sincrona e mai un'eccezione: chi la chiama non la
     * aspetta (la catena d'avvio della sessione è sincrona, P-13). `pronta` serve alle prove.
     */
    anticipa({ sessionId, turno, progetto } = {}) {
      const niente = { pronta: Promise.resolve(false) };
      if (!valida(sessionId) || !Number.isSafeInteger(turno) || typeof progetto !== 'string' || !progetto) return niente;
      if (versioneGit && !versioneGit.ok) return niente;
      if (cartellaTroppoLarga(progetto)) return niente;
      const chiave = `${sessionId}:${turno}`;
      if (fatti.has(chiave)) return niente;
      const gia = anticipate.get(chiave);
      if (gia) return { pronta: gia.esito.then(() => true) };
      for (const k of anticipate.keys()) if (k.startsWith(`${sessionId}:`)) anticipate.delete(k);
      while (anticipate.size >= 200) anticipate.delete(anticipate.keys().next().value);
      const dalle = Date.now(); // orologio vero: si confronta con le date dei file
      const esito = (async () => {
        const store = await preparaCartelle(progetto);
        return inFila(store, async () => {
          const disp = await gitDisponibile(store, progetto);
          if (!disp.ok) return { motivo: disp.motivo };
          await preparaArchivio(store, progetto);
          return { foto: await scatta(store, progetto, `TALOS: before turn ${turno} of ${sessionId}`), dalle };
        });
      })().catch((e) => ({ motivo: e?.motivo ?? 'git' }));
      anticipate.set(chiave, { progetto, esito });
      return { pronta: esito.then(() => true) };
    },
    /**
     * Prima di un attrezzo che scrive (`scrivi`, `file_edit`, `shell`): la foto del turno, una volta sola. `turno` è il numero
     * del turno della persona nella conversazione RADICE (le figlie scrivono dentro il turno della madre). Mai un'eccezione.
     */
    async primaDiScrivere({ sessionId, turno, seqAvvio = null, progetto, percorso = null, cartellaAttrezzo = progetto, chiamante = sessionId } = {}) {
      if (!valida(sessionId) || !Number.isSafeInteger(turno) || typeof progetto !== 'string' || !progetto) return { fatto: false, motivo: 'argomenti' };
      const assoluto = typeof percorso === 'string' && percorso ? resolve(cartellaAttrezzo, percorso) : null;
      if (assoluto) {
        /* per chiamante: due conversazioni nello stesso progetto non si mescolano le scritture in corso */
        const k = `${progetto}\0${chiamante}`;
        const s = inSospeso.get(k) ?? new Set();
        s.add(assoluto); inSospeso.set(k, s);
      }
      const chiave = `${sessionId}:${turno}`;
      const giaFatto = fatti.has(chiave);
      const rel = assoluto ? relativoAlProgetto(progetto, assoluto) : null;
      if (giaFatto && !(assoluto && rel === null)) {
        const t = turni.get(chiave);
        if (t?.progetto === progetto) {
          if (!assoluto) t.shell = true;
          else {
            const altro = await cambiatoDaAltri(t, progetto, rel, assoluto).catch(() => false);
            t.scritti.add(rel);
            if (altro) {
              const motivo = t.shell ? 'non-di-talos' : 'persona';
              cartellaDelloStore(progetto).then((store) => inFila(store, () => annotaAltri(store, sessionId, turno, rel, motivo)))
                .catch((e) => avvisa({ tipo: 'registro', motivo: e?.message }));
            }
          }
        }
        return { fatto: false, motivo: 'gia-fatto' };
      }
      if (!giaFatto) {
        fatti.add(chiave);
        if (fatti.size > 5_000) fatti.delete(fatti.values().next().value); // i turni crescono: i più vecchi non tornano
        const t = turnoDi(chiave, progetto, Date.now()); // prima della foto: la data è al più presto quella vera, mai dopo
        if (!assoluto) t.shell = true;
        else if (rel !== null) t.scritti.add(rel);
      }
      if (cartellaTroppoLarga(progetto)) return { fatto: false, motivo: 'cartella-troppo-larga' };
      /* la foto in anticipo di questo turno, se c'è e se è dello stesso progetto: si aspetta (può essere ancora in corso) */
      const anticipo = giaFatto ? null : anticipate.get(chiave);
      if (anticipo) anticipate.delete(chiave);
      const pronto = anticipo && anticipo.progetto === progetto ? await anticipo.esito : null;
      let store;
      try { store = await preparaCartelle(progetto); } catch (e) { avvisa({ tipo: 'store', motivo: e?.message }); return { fatto: false, motivo: 'store' }; }
      return inFila(store, async () => {
        if (giaFatto) { // solo per dire che una scrittura è uscita dal progetto
          await annotaFuori(store, sessionId, turno, assoluto).catch(() => {});
          return { fatto: false, motivo: 'gia-fatto' };
        }
        const disp = await gitDisponibile(store, progetto);
        const alle = new Date(clock()).toISOString();
        const fuori = assoluto && relativoAlProgetto(progetto, assoluto) === null ? [assoluto] : [];
        /* la sequenza del RunStarted del turno: il messaggio della persona a schermo la porta (`giro:<sequenza>`) */
        const seq = Number.isSafeInteger(seqAvvio) ? { seqAvvio } : {};
        if (!disp.ok) {
          await annotaPunto(store, progetto, sessionId, { chiave: `t${turno}`, turno, ...seq, commit: null, motivo: disp.motivo, alle, fuori }).catch(() => {});
          return { fatto: false, motivo: disp.motivo };
        }
        /* il file da scrivere cambiato DOPO l'inizio della foto (la persona, un altro programma): la foto non lo ha com'è adesso, se ne
           scatta una nuova come prima del 29/10. Per gli altri file la finestra in più è quella fra l'inizio del giro e la prima
           scrittura (OpenCode fa lo stesso, `step.ts:74-76`), e il ripristino resta quello sicuro: rimette solo ciò che TALOS ha scritto. */
        const fresca = pronto?.foto && !(assoluto && await cambiatoDopo(assoluto, pronto.dalle));
        if (fresca) {
          const t = turni.get(chiave);
          if (t) t.dalle = Math.min(t.dalle, pronto.dalle); // la foto è di inizio giro: da lì si guarda chi altro cambia i file
          const { commit, grandi } = pronto.foto;
          try {
            await annotaPunto(store, progetto, sessionId, { chiave: `t${turno}`, turno, ...seq, commit, alle, fuori, ...(grandi.length ? { grandi: grandi.slice(0, 50) } : {}) });
            return { fatto: true, commit };
          } catch { /* sotto: la foto si rifà nel modo di sempre */ }
        }
        try {
          await preparaArchivio(store, progetto);
          const { commit, grandi } = await scatta(store, progetto, `TALOS: before turn ${turno} of ${sessionId}`);
          await annotaPunto(store, progetto, sessionId, { chiave: `t${turno}`, turno, ...seq, commit, alle, fuori, ...(grandi.length ? { grandi: grandi.slice(0, 50) } : {}) });
          return { fatto: true, commit };
        } catch (e) {
          const motivo = e?.motivo ?? 'git';
          avvisa({ tipo: 'foto', motivo, dettaglio: String(e?.message ?? e).slice(0, 300) });
          await annotaPunto(store, progetto, sessionId, { chiave: `t${turno}`, turno, ...seq, commit: null, motivo, alle, fuori }).catch(() => {});
          return { fatto: false, motivo };
        }
      });
    },

    /** Dopo l'attrezzo: l'impronta di ciò che TALOS ha appena scritto, nel registro (Hermes `record_agent_write`). */
    async dopoLaScrittura({ progetto, chiamante } = {}) {
      const k = `${progetto}\0${chiamante}`;
      const s = inSospeso.get(k);
      if (!s?.size) return;
      inSospeso.delete(k);
      let store;
      try { store = await cartellaDelloStore(progetto); } catch { return; }
      await inFila(store, async () => {
        const reg = await leggiJson(fileRegistro(store), {});
        for (const assoluto of s) {
          const rel = relativoAlProgetto(progetto, assoluto);
          if (rel === null) continue;
          const impronta = await improntaDelFile(assoluto);
          delete reg[rel];
          reg[rel] = { sha256: impronta, alle: clock() }; // null = l'agente l'ha cancellato
        }
        const chiavi = Object.keys(reg);
        for (const k of chiavi.slice(0, Math.max(0, chiavi.length - VOCI_DEL_REGISTRO))) delete reg[k];
        await fsp.mkdir(store, { recursive: true });
        await scriviAtomico(fileRegistro(store), JSON.stringify(reg));
      }).catch((e) => avvisa({ tipo: 'registro', motivo: e?.message }));
    },

    /**
     * R-26 B (owner 29/10/2026 notte) — fra i percorsi assoluti dati, quelli che TALOS ha scritto (il registro qui sopra) e che da allora
     *   nessuno ha cambiato: l'impronta di adesso è quella registrata. Il kernel lascia passare `git stash`/`reset --hard`/… solo su
     *   modifiche tutte dell'agente. ⛔ Ciò che ha scritto un comando della shell non è nel registro (TALOS non sa che cosa ha scritto),
     *   quindi conta come della persona: la scelta prudente, la stessa del ripristino sicuro.
     */
    async dellAgente({ progetto, assoluti = [] } = {}) {
      if (typeof progetto !== 'string' || !Array.isArray(assoluti) || assoluti.length === 0) return [];
      let store;
      try { store = await cartellaDelloStore(progetto); } catch { return []; }
      const reg = await leggiJson(fileRegistro(store), {}).catch(() => ({}));
      const suoi = [];
      for (const assoluto of assoluti) {
        const rel = relativoAlProgetto(progetto, assoluto);
        const voce = rel === null ? null : reg[rel];
        if (!voce || typeof voce.sha256 !== 'string') continue;
        if ((await improntaDelFile(assoluto)) === voce.sha256) suoi.push(assoluto);
      }
      return suoi;
    },

    /** I punti di una conversazione, dal più vecchio: `{ turno, alle, annullabile, motivo?, fuori }`. */
    async elenco({ sessionId, progetto } = {}) {
      if (!valida(sessionId) || typeof progetto !== 'string') return [];
      let store;
      try { store = await cartellaDelloStore(progetto); } catch { return []; }
      const s = await leggiJson(fileSessione(store, sessionId), { punti: [] });
      return (s.punti ?? []).filter((p) => Number.isSafeInteger(p.turno)).map((p) => ({
        turno: p.turno, ...(Number.isSafeInteger(p.seqAvvio) ? { seqAvvio: p.seqAvvio } : {}), alle: p.alle, annullabile: Boolean(p.commit), ...(p.motivo ? { motivo: p.motivo } : {}), fuori: p.fuori?.length ?? 0,
      }));
    },

    /**
     * Che cosa cambierebbe annullando dal turno `turno` in poi: il primo punto a quel turno o dopo. Per ogni file cambiato da
     * allora: si rimette (`ripristina`) solo se il contenuto di adesso è ancora quello che TALOS ha scritto; altrimenti si salta
     * (`salta`, motivo `persona` = toccato dopo, `non-di-talos` = mai scritto da TALOS: un comando, o la persona).
     */
    async anteprima({ sessionId, progetto, turno } = {}) {
      if (!valida(sessionId) || typeof progetto !== 'string' || !Number.isSafeInteger(turno)) return { ok: false, motivo: 'argomenti' };
      let store;
      try { store = await cartellaDelloStore(progetto); } catch { return { ok: false, motivo: 'store' }; }
      return inFila(store, () => pianifica(store, progetto, sessionId, turno, { conDiff: true }));
    },

    /** Annulla dal turno `turno` in poi. `includi`: file saltati che la persona ha scelto di rimettere lo stesso. */
    async ripristina({ sessionId, progetto, turno, includi = [] } = {}) {
      if (!valida(sessionId) || typeof progetto !== 'string' || !Number.isSafeInteger(turno)) return { ok: false, motivo: 'argomenti' };
      let store;
      try { store = await cartellaDelloStore(progetto); } catch { return { ok: false, motivo: 'store' }; }
      return inFila(store, async () => {
        const piano = await pianifica(store, progetto, sessionId, turno, { conDiff: false });
        if (!piano.ok) return piano;
        const scelti = new Set((Array.isArray(includi) ? includi : []).filter((x) => typeof x === 'string'));
        const extra = piano.salta.filter((s) => scelti.has(s.percorso)).map((s) => s.percorso);
        const bersagli = [...piano.ripristina.map((r) => r.percorso), ...extra];
        /* `durante`: i saltati perché cambiati da qualcun altro mentre il turno lavorava (chi chiama lo dice per nome) */
        const durante = piano.salta.filter((s) => s.durante && !scelti.has(s.percorso)).map((s) => s.percorso);
        if (!bersagli.length) return { ok: true, ripristinati: [], saltati: piano.salta.map((s) => s.percorso), durante, fuori: piano.fuori };
        /* una foto PRIMA: l'annullamento si può annullare (Hermes, «pre-rollback snapshot») */
        const prima = await scatta(store, progetto, `TALOS: before undoing to turn ${piano.turno} of ${sessionId}`).catch(() => null);
        const daRimettere = [];
        const daTogliere = [];
        for (const rel of bersagli) {
          const c = await git(store, progetto, ['cat-file', '-e', `${piano.commit}:${rel}`]);
          (c.codice === 0 ? daRimettere : daTogliere).push(rel);
        }
        if (daRimettere.length) {
          const elenco = join(store, 'indici', `${process.pid}-rimetti.txt`);
          await fsp.writeFile(elenco, `${daRimettere.join('\0')}\0`);
          await gitOk(store, progetto, ['--literal-pathspecs', 'restore', `--source=${piano.commit}`, '--worktree',
            `--pathspec-from-file=${elenco}`, '--pathspec-file-nul'], { indice: indiceDi(store, 'rimetti') });
        }
        const tolti = [];
        for (const rel of daTogliere) {
          try { await fsp.rm(join(progetto, rel), { force: true }); tolti.push(rel); } catch { /* resta: si dice sotto */ }
        }
        const reg = await leggiJson(fileRegistro(store), {});
        for (const rel of [...daRimettere, ...tolti]) delete reg[rel];
        await scriviAtomico(fileRegistro(store), JSON.stringify(reg));
        if (prima?.commit) {
          /* `da` e `file`: ciò che serve a «Rifai» per sapere che cosa ha cambiato l'annullamento, e verso quale stato */
          await annotaPunto(store, progetto, sessionId, {
            chiave: `a${clock()}`, turno: null, tipo: 'prima-di-annullare', commit: prima.commit, da: piano.commit,
            file: [...daRimettere, ...tolti], alle: new Date(clock()).toISOString(),
          }).catch(() => {});
        }
        return {
          ok: true,
          ripristinati: [...daRimettere, ...tolti],
          nonTolti: daTogliere.filter((r) => !tolti.includes(r)),
          saltati: piano.salta.filter((s) => !scelti.has(s.percorso)).map((s) => s.percorso),
          durante,
          fuori: piano.fuori,
        };
      });
    },

    /**
     * «Rifai»: rimette com'erano prima dell'ULTIMO annullamento i file che quell'annullamento aveva cambiato. Stessa prudenza
     * dell'annullamento: un file toccato DOPO l'annullamento (il suo contenuto non è più quello che l'annullamento aveva messo)
     * si salta e si dice. Un annullamento si rifà una volta sola.
     */
    async rifai({ sessionId, progetto } = {}) {
      if (!valida(sessionId) || typeof progetto !== 'string') return { ok: false, motivo: 'argomenti' };
      let store;
      try { store = await cartellaDelloStore(progetto); } catch { return { ok: false, motivo: 'store' }; }
      return inFila(store, async () => {
        const f = fileSessione(store, sessionId);
        const s = await leggiJson(f, { punti: [] });
        const p = (s.punti ?? []).findLast((x) => x.tipo === 'prima-di-annullare');
        if (!p?.commit || !p.da || !Array.isArray(p.file)) return { ok: false, motivo: 'niente-da-rifare' };
        if (p.rifatto) return { ok: false, motivo: 'gia-rifatto' };
        const daRimettere = [];
        const daTogliere = [];
        const saltati = [];
        for (const rel of p.file) {
          /* com'è adesso il file, contro com'era dopo l'annullamento (= com'era nel punto `da`) */
          const atteso = await git(store, progetto, ['rev-parse', '--verify', '--quiet', `${p.da}:${rel}`]);
          const esiste = await fsp.stat(join(progetto, rel)).then(() => true, () => false);
          let intatto;
          if (atteso.codice !== 0) intatto = !esiste;
          else if (!esiste) intatto = false;
          else {
            const ora = await git(store, progetto, ['hash-object', '--', rel]);
            intatto = ora.codice === 0 && testo(ora) === testo(atteso);
          }
          if (!intatto) { saltati.push(rel); continue; }
          const c = await git(store, progetto, ['cat-file', '-e', `${p.commit}:${rel}`]);
          (c.codice === 0 ? daRimettere : daTogliere).push(rel);
        }
        if (daRimettere.length) {
          const elenco = join(store, 'indici', `${process.pid}-rifai.txt`);
          await fsp.writeFile(elenco, `${daRimettere.join('\0')}\0`);
          await gitOk(store, progetto, ['--literal-pathspecs', 'restore', `--source=${p.commit}`, '--worktree',
            `--pathspec-from-file=${elenco}`, '--pathspec-file-nul'], { indice: indiceDi(store, 'rifai') });
        }
        const tolti = [];
        for (const rel of daTogliere) {
          try { await fsp.rm(join(progetto, rel), { force: true }); tolti.push(rel); } catch { /* resta: si dice sotto */ }
        }
        /* i file tornano quelli che TALOS aveva scritto: il registro li riconosce di nuovo come suoi */
        const reg = await leggiJson(fileRegistro(store), {});
        for (const rel of [...daRimettere, ...tolti]) reg[rel] = { sha256: await improntaDelFile(join(progetto, rel)), alle: clock() };
        await scriviAtomico(fileRegistro(store), JSON.stringify(reg));
        p.rifatto = true;
        await scriviAtomico(f, JSON.stringify(s, null, 1));
        return { ok: true, rifatti: [...daRimettere, ...tolti], saltati, nonTolti: daTogliere.filter((r) => !tolti.includes(r)) };
      });
    },

    /** Per le prove e per lo spegnimento: aspetta che ogni archivio abbia finito. */
    async fermo() {
      /* le foto in anticipo prima: una può non essere ancora in fila (aspetta la cartella dello store) */
      await Promise.all([...anticipate.values()].map((a) => a.esito));
      await Promise.all([...code.values()]);
    },
  };

  async function pianifica(store, progetto, sessionId, turno, { conDiff }) {
    const s = await leggiJson(fileSessione(store, sessionId), { punti: [] });
    const punti = (s.punti ?? []).filter((p) => Number.isSafeInteger(p.turno) && p.turno >= turno);
    const punto = punti[0] ?? null;
    if (!punto) return { ok: false, motivo: 'nessun-punto' };
    if (!punto.commit) return { ok: false, motivo: punto.motivo ?? 'nessun-punto', turno: punto.turno };
    const fuori = [...new Set(punti.flatMap((p) => p.fuori ?? []))];
    const indice = indiceDi(store, 'anteprima');
    let grandi;
    try { grandi = await fotografaNellIndice(store, progetto, indice, punto.commit); } catch (e) { return { ok: false, motivo: 'git', dettaglio: String(e?.message ?? e).slice(0, 300) }; }
    const righe = pezziZ(await gitOk(store, progetto, ['diff', '--cached', '--name-status', '--no-renames', '-z', punto.commit], { indice }));
    const cambiati = [];
    for (let i = 0; i + 1 < righe.length; i += 2) cambiati.push({ stato: righe[i][0], percorso: righe[i + 1] });
    const reg = await leggiJson(fileRegistro(store), {});
    /* cambiati da qualcun altro durante un turno, prima che TALOS li riscrivesse (`annotaAltri`): la versione di TALOS li contiene */
    const altri = Object.assign({}, ...punti.map((p) => (p.altri && typeof p.altri === 'object' ? p.altri : {})));
    const ripristina = [];
    const salta = [];
    for (const c of cambiati) {
      if (Object.hasOwn(altri, c.percorso)) { salta.push({ ...c, motivo: altri[c.percorso] === 'persona' ? 'persona' : 'non-di-talos', durante: true }); continue; }
      const voce = reg[c.percorso];
      if (!voce) { salta.push({ ...c, motivo: 'non-di-talos' }); continue; }
      const adesso = await improntaDelFile(join(progetto, c.percorso));
      if (adesso === voce.sha256) ripristina.push(c);
      else salta.push({ ...c, motivo: 'persona' });
    }
    let diff = '';
    let troncato = false;
    if (conDiff && cambiati.length) {
      const d = await git(store, progetto, ['diff', '--cached', '--no-color', '--no-renames', '--no-ext-diff', punto.commit], { indice });
      const b = d.stdout;
      troncato = b.length > TETTO_DIFF_BYTE;
      diff = (troncato ? b.subarray(0, TETTO_DIFF_BYTE) : b).toString('utf8');
    }
    return {
      ok: true, turno: punto.turno, commit: punto.commit, alle: punto.alle,
      ripristina, salta, fuori, troppoGrandi: grandi, ...(conDiff ? { diff, troncato } : {}),
    };
  }
}
