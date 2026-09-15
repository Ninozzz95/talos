/**
 * Il filtro che decide che cosa NON entra nell'elenco profondo dei file dato al modello,
 * perche' il progetto stesso lo considera ignorabile (`.gitignore`).
 *
 * ⛔ Perche' non e' «leggere un file e fare match»: sbagliare una regola qui significa
 * NASCONDERE AL MODELLO FILE CHE ESISTONO — cioe' rifare, in un altro modo, il difetto
 * che stiamo curando. Il 27/08/2026 un pattern `mobile/docs/` ha reso inerte
 * `!docs/immagini/*.png` e per giorni ogni screenshot nuovo e' stato ignorato IN SILENZIO.
 * Quel caso e' la prova numero uno della suite (`tests/gitignore-elenco.test.mjs`).
 *
 * ── FONTI ────────────────────────────────────────────────────────────────────────────
 * [G] Git — `gitignore` Documentation, sezione PATTERN FORMAT.
 *     https://git-scm.com/docs/gitignore — letta il 10/09/2026.
 * [P] POSIX / fnmatch(3p), flag FNM_PATHNAME + bracket expression negata con `!`.
 *     https://www.man7.org/linux/man-pages/man3/fnmatch.3p.html — letta il 10/09/2026.
 * [O] ORACOLO: ogni regola qui sotto e' stata verificata contro `git check-ignore` VERO
 *     su un repo di prova, il 10/09/2026, prima di scrivere una riga di questo file.
 *
 * Citazioni verbatim da [G], che questo modulo implementa una per una:
 *
 *  1. «Trailing spaces are ignored unless they are quoted with backslash ("\").»
 *     → tagliaSpaziFinali()
 *  2. «An optional prefix "!" which negates the pattern; any matching file excluded by a
 *     previous pattern will become included again.»
 *     → regola.negata, e l'ULTIMA regola che matcha decide (vedi decidiRiga()).
 *  3. ⛔ «It is not possible to re-include a file if a parent directory of that file is
 *     excluded. Git doesn't list excluded directories for performance reasons, so any
 *     patterns on contained files have no effect, no matter where they are defined.»
 *     → il ciclo sui GENITORI dentro tieni(). E' il cuore del caso 27/08.
 *  4. «If there is a separator at the beginning or middle (or both) of the pattern, then
 *     the pattern is relative to the directory level of the particular .gitignore file
 *     itself. Otherwise the pattern may also match at any level below the .gitignore level.»
 *     → ancorato / fluttuante in compilaRiga().
 *  5. «If there is a separator at the end of the pattern then the pattern will only match
 *     directories, otherwise the pattern can match both files and directories.»
 *     → regola.soloDirectory.
 *  6. «An asterisk "*" matches anything except a slash. The character "?" matches any one
 *     character except "/". The range notation, e.g. [a-zA-Z], can be used to match one of
 *     the characters in a range.»
 *     → globARegex(): `*` → [^/]*, `?` → [^/], `[...]` → classe che non attraversa mai `/` [P].
 *  7. «A leading "**" followed by a slash means match in all directories.»
 *     «A trailing "/**" matches everything inside.»
 *     «A slash followed by two consecutive asterisks then a slash matches zero or more
 *      directories.» → i tre rami di `**` in globARegex().
 *  8. «A backslash ("\") can be used to escape any character. […] a backslash at the end of
 *     a pattern is an invalid pattern that never matches.» → globARegex() + compilaRiga().
 *  9. Annidati e precedenza: «Patterns read from a .gitignore file in the same directory as
 *     the path, or in any parent directory […] with patterns in the higher level files
 *     being overridden by those in lower level files down to the directory containing the
 *     file.» → le regole dei file piu' profondi entrano DOPO nell'elenco, quindi vincono.
 *
 * ── ⛔ COSA NON IMPLEMENTO (limiti DICHIARATI, non da scoprire) ───────────────────────
 *  L1. `core.excludesFile` (il gitignore globale dell'utente): richiede leggere la config
 *      git dell'utente. Fuori perimetro: un elenco per il modello deve mostrare il
 *      progetto, non le preferenze personali di chi lo apre. `.git/info/exclude` invece
 *      SI', perche' e' del repo (vedi FONTI_IMPLICITE).
 *  L2. `git check-ignore --no-index` e le regole da riga di comando: non esistono qui.
 *  L3. Le classi POSIX nominate — `[[:alpha:]]`, `[[:digit:]]` — sono passate alla regex
 *      cosi' come sono e NON funzionano. Sono rarissime in un `.gitignore` vero; se un
 *      giorno servono, il posto e' classeARegex().
 *  L4. Il case-folding di `core.ignoreCase`: qui il confronto e' SEMPRE sensibile alle
 *      maiuscole, anche su Windows dove il filesystem non lo e'. Scelta prudente: la
 *      direzione dell'errore e' «tengo un file di troppo», mai «ne nascondo uno».
 *  L5. I symlink a directory sono trattati come FILE (git fa lo stesso: non ci scende).
 *  L6. Un `\` dentro il pattern e' sempre un ESCAPE, mai un separatore di percorso. Su
 *      Windows un `.gitignore` con `src\build` non funziona — e non funziona neanche con
 *      git vero, quindi e' fedelta', non un limite nostro.
 *  L7. ⛔ Se la CARTELLA DI LAVORO STESSA e' ignorata (aprire `node_modules/` o una
 *      cartella che il repo padre esclude), il filtro NON svuota l'elenco: le regole dei
 *      genitori valgono per i percorsi DENTRO, ma la cartella aperta non si nasconde mai.
 *      Non e' un'invenzione: ripgrep fa lo stesso — `skip_entry` in `crates/ignore/src/walk.rs`
 *      «Returns Ok(false) without running any ignore/hidden checks for depth-0 entries,
 *      which are the paths explicitly provided as arguments» (letto via ctx7 il 10/09/2026).
 *      ⛔ E il verso opposto ha un costo misurato da un concorrente: Hermes Agent
 *      issue #45286 (giugno 2026) — l'albero file del Desktop filtra col `.gitignore`
 *      senza un interruttore «mostra ignorati», e in un monorepo le cartelle top-level
 *      possedute da repo figli SPARISCONO dalla vista pur esistendo sul disco.
 *      https://github.com/NousResearch/hermes-agent/issues/45286
 *  L8. `info/exclude` di un WORKTREE: lo cerco via `commondir`, ma se quel file manca o e'
 *      in una forma inattesa si rinuncia in silenzio — perdere `info/exclude` fa TENERE
 *      qualche file in piu', mai nasconderne.
 *
 * ── LA SCELTA: A MANO, non una libreria ──────────────────────────────────────────────
 * La libreria di riferimento e' `ignore` (kaelzhang/node-ignore, 500+ test verificati
 * contro `git check-ignore`). Non la aggiungo, per tre ragioni DICHIARATE:
 *  a) `package.json` non ha oggi NESSUN matcher di glob (ne' `ignore`, ne' `minimatch`,
 *     ne' `picomatch`): sarebbe una dipendenza NUOVA, e il progetto chiede una ragione
 *     dichiarata per ognuna. La ragione mancherebbe: vedi (b) e (c).
 *  b) Il contratto che il camminatore consuma e' `(percorsoRelativo, eDirectory)`, con
 *     `eDirectory` esplicito. `ignore` non ha quel parametro: vuole il suffisso `/` nel
 *     percorso, quindi andrebbe comunque avvolto — e l'avvolgimento e' il punto dove si
 *     sbaglia il caso 27/08.
 *  c) `ignore` non gestisce i `.gitignore` ANNIDATI: la composizione per base andrebbe
 *     scritta a mano lo stesso. Cioe' la meta' difficile del lavoro resterebbe nostra.
 *  d) ⛔ E `ignore` non risale ai `.gitignore` dei GENITORI: e' il buco misurato il
 *     10/09/2026 partendo da `harness-ui/`, e la parte che ripgrep stesso ha corretto solo
 *     nella 15.0.0. Adottarla non ce l'avrebbe evitato.
 * Costo misurato della via a mano: 300 righe di modulo (di cui ~110 di specifica citata)
 * + 38 prove, e un oracolo `git check-ignore` per fissare la semantica prima di scrivere.
 * Il perimetro coperto e' l'insieme dei costrutti che compaiono in un `.gitignore` reale;
 * ogni buco noto e' dichiarato in L1-L8.
 *
 * ── PROVE (10/09/2026) ───────────────────────────────────────────────────────────────
 *  · 930 confronti contro `git check-ignore` su repo di prova: 0 disaccordi.
 *  · Da `harness-ui/` (sottocartella di un worktree): l'INSIEME dei file tenuti coincide
 *    esattamente con `git ls-files` + `git ls-files --others --exclude-standard` —
 *    680 contro 680, zero in piu' e zero in meno, in entrambe le direzioni.
 */

import { promises as fsPromises } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';

/** Esiti di una valutazione. L'ultima regola che matcha decide [G, punto 2]. */
const ESCLUSO = 'escluso';
const INCLUSO = 'incluso';
const NESSUNA = 'nessuna';

/** Il nome del file di regole, e le fonti implicite lette da creaFiltroGitignore(). */
export const NOME_FILE_REGOLE = '.gitignore';
export const FONTI_IMPLICITE = Object.freeze(['.git/info/exclude']);

/** Tetti di sicurezza della scoperta dei file annidati. Dichiarati, non nascosti. */
const PROFONDITA_MASSIMA = 24;
const CARTELLE_MASSIME = 5000;
/**
 * ⛔⛔⛔ 12/09/2026 — IL TETTO IN TEMPO. Owner: «quasi un minuto al primo messaggio». Misurato
 * sulla cartella `Desktop` (che non e' un repo ma contiene decine di repo): questa raccolta
 * legge 288 `.gitignore` per 6.002 regole in **12.342 ms**, prima ancora di elencare una cartella;
 * sul repo `AVM-harness-desktop` 57 file, 969 regole, 1.593 ms. I tetti in cartelle (5.000) e in
 * profondita' (24) non mordevano in tempo. Oltre il budget la raccolta si ferma e lo dichiara
 * (`filtro.incompleto`): le regole non lette non nascondono niente — la direzione dell'errore
 * resta «tengo di piu'», come per un file illeggibile.
 */
export const TEMPO_MASSIMO_RACCOLTA_MS = 1500;
/** ⛔ Quanti livelli si puo' RISALIRE cercando la radice del repo, per non finire su `C:\`. */
const RISALITA_MASSIMA = 64;

// ─────────────────────────────────────────────────────────────────────────────────────
// Parsing di UNA riga
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * [G] «Trailing spaces are ignored unless they are quoted with backslash ("\").»
 * Solo lo SPAZIO, non il tab: git taglia ' ' (trim_trailing_spaces in dir.c).
 * Uno spazio e' protetto se preceduto da un numero DISPARI di backslash.
 */
function tagliaSpaziFinali(riga) {
  let fine = riga.length;
  while (fine > 0 && riga[fine - 1] === ' ') {
    let barre = 0;
    for (let i = fine - 2; i >= 0 && riga[i] === '\\'; i -= 1) barre += 1;
    if (barre % 2 === 1) break; // protetto: si ferma qui
    fine -= 1;
  }
  return riga.slice(0, fine);
}

function scappaRegex(carattere) {
  return carattere.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Trova la `]` che chiude una classe aperta in `apertura`, o -1 se non c'e'. */
function chiusuraClasse(pattern, apertura) {
  let i = apertura + 1;
  if (pattern[i] === '!' || pattern[i] === '^') i += 1;
  if (pattern[i] === ']') i += 1; // una `]` in prima posizione e' letterale
  while (i < pattern.length) {
    if (pattern[i] === '\\') { i += 2; continue; }
    if (pattern[i] === ']') return i;
    i += 1;
  }
  return -1;
}

/**
 * [G] «The range notation, e.g. [a-zA-Z]» + [P] con FNM_PATHNAME la classe non matcha `/`.
 * ⛔ L3: le classi POSIX nominate non sono tradotte.
 */
function classeARegex(testo) {
  let dentro = testo.slice(1, -1);
  let negata = false;
  if (dentro.startsWith('!') || dentro.startsWith('^')) { negata = true; dentro = dentro.slice(1); }
  // Dentro una classe regex vanno neutralizzati solo `\`, `]` e `^`; `-` e il resto passano.
  const corpo = dentro.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\^/g, '\\^');
  return negata ? `[^/${corpo}]` : `[${corpo.replace(/\//g, '')}]`;
}

/**
 * Traduce un glob gitignore in sorgente regex. Il `/` non e' mai attraversato da `*`, `?`
 * o da una classe [G punto 6, P]; i tre casi di `**` sono quelli di [G punto 7].
 */
function globARegex(pattern) {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];

    if (c === '\\') { // [G punto 8] escape di qualunque carattere
      if (i + 1 < pattern.length) { re += scappaRegex(pattern[i + 1]); i += 2; continue; }
      i += 1; continue; // backslash finale: gia' scartato in compilaRiga()
    }

    if (c === '*') {
      let j = i;
      while (j < pattern.length && pattern[j] === '*') j += 1;
      const quanti = j - i;
      const primaSlash = i === 0 || pattern[i - 1] === '/';
      const dopoSlash = j >= pattern.length || pattern[j] === '/';

      // ⛔ «Other consecutive asterisks are considered regular asterisks»: il ramo
      // speciale vale SOLO per esattamente due, isolati fra slash o estremi.
      if (quanti === 2 && primaSlash && dopoSlash) {
        if (i === 0 && j < pattern.length) {          // «**/» iniziale: in tutte le directory
          re += '(?:.+/)?'; i = j + 1; continue;
        }
        if (j >= pattern.length) {                     // «/**» finale: tutto quel che c'e' dentro
          re += '.+'; i = j; continue;
        }
        re = `${re.slice(0, -1)}(?:/.+)?/`; i = j + 1; continue; // «/**/»: zero o piu' directory
      }
      re += '[^/]*'; i = j; continue;
    }

    if (c === '?') { re += '[^/]'; i += 1; continue; }

    if (c === '[') {
      const fine = chiusuraClasse(pattern, i);
      if (fine === -1) { re += '\\['; i += 1; continue; } // `[` spaiata = letterale
      re += classeARegex(pattern.slice(i, fine + 1));
      i = fine + 1; continue;
    }

    re += scappaRegex(c); i += 1;
  }
  return re;
}

/**
 * Compila UNA riga in una regola, o null se la riga non e' una regola
 * (vuota, commento, o pattern invalido).
 * @param {string} riga
 * @param {string} base cartella del `.gitignore` che l'ha prodotta, con `/`, senza slash finale
 */
export function compilaRiga(riga, base = '') {
  let p = typeof riga === 'string' ? riga : '';
  if (p.endsWith('\r')) p = p.slice(0, -1); // file CRLF: su Windows e' la norma, non l'eccezione
  p = tagliaSpaziFinali(p);                  // [G punto 1]
  if (p === '') return null;                 // «A blank line matches no files»
  if (p.startsWith('#')) return null;        // «A line starting with # serves as a comment»

  let negata = false;
  if (p.startsWith('!')) { negata = true; p = p.slice(1); } // [G punto 2]
  if (p === '') return null;

  let soloDirectory = false;
  if (p.endsWith('/')) { soloDirectory = true; p = p.slice(0, -1); } // [G punto 5]
  if (p === '') return null;

  // [G punto 8] «a backslash at the end of a pattern is an invalid pattern that never matches»
  let barreFinali = 0;
  for (let i = p.length - 1; i >= 0 && p[i] === '\\'; i -= 1) barreFinali += 1;
  if (barreFinali % 2 === 1) return null;

  // [G punto 4] uno slash all'inizio o in mezzo ancora il pattern alla base.
  // Lo slash FINALE e' gia' stato tolto sopra, quindi non conta: `frotz/` resta fluttuante.
  const ancorato = p.includes('/');
  if (p.startsWith('/')) p = p.slice(1);
  if (p === '') return null;

  const corpo = globARegex(p);
  const prefisso = ancorato ? '' : '(?:.*/)?'; // fluttuante: «may also match at any level below»
  return {
    negata,
    soloDirectory,
    base,
    origine: riga,
    regex: new RegExp(`^${prefisso}${corpo}$`),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Compilazione di un insieme di regole
// ─────────────────────────────────────────────────────────────────────────────────────

function normalizzaPercorso(percorso) {
  if (typeof percorso !== 'string') return '';
  let p = percorso.replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  while (p.startsWith('/')) p = p.slice(1);
  while (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Unisce piu' gruppi di righe, ognuno con la sua base, in un solo giudice.
 * ⛔ L'ORDINE E' LA PRECEDENZA [G punto 9]: chi arriva dopo vince. Chi chiama passa
 * prima le fonti deboli (`.git/info/exclude`), poi la radice, poi gli annidati per
 * profondita' crescente.
 * @param {{righe: string[], base?: string}[]} gruppi
 */
export function componiRegole(gruppi) {
  const regole = [];
  for (const gruppo of gruppi ?? []) {
    const base = normalizzaPercorso(gruppo?.base ?? '');
    for (const riga of gruppo?.righe ?? []) {
      const regola = compilaRiga(riga, base);
      if (regola) regole.push(regola);
    }
  }
  return creaGiudice(regole);
}

/**
 * Le regole in forma pura, per poterle provare senza disco.
 * @param {string[]|string} righe
 * @param {{base?: string}} opzioni
 * @returns {{tieni: (percorso: string, eDirectory?: boolean) => boolean, quante: number}}
 */
export function compilaRegole(righe, { base = '' } = {}) {
  const elenco = typeof righe === 'string' ? righe.split('\n') : (righe ?? []);
  return componiRegole([{ righe: elenco, base }]);
}

function creaGiudice(regole) {
  const memoria = new Map();

  /*
   * ⛔ 12/09/2026 — LE REGOLE SI INDICIZZANO PER BASE, non si scorrono tutte. Con 6.002 regole
   *   (Desktop) ogni percorso nuovo costava 0,265 ms, e una mappa che conta i file di migliaia di
   *   cartelle ne chiede decine di migliaia: secondi interi spesi a confrontare `a/b/c` con regole
   *   che vivono in `progetti/x/y/` e non possono riguardarlo. Una regola con base `B` puo' matchare
   *   solo un percorso che inizia con `B/`: quindi per un percorso si guardano SOLO le regole della
   *   radice e dei suoi antenati. L'ordine resta quello di prima — le basi dalla piu' corta alla piu'
   *   lunga, e dentro ogni base l'ordine di inserimento — cioe' «piu' si scende piu' si vince»
   *   [G punto 9] e «l'ultima che matcha decide» [G punto 2] valgono identici: due basi diverse
   *   sullo stesso ramo sono sempre una antenata dell'altra, e la raccolta le aggiunge in ampiezza.
   */
  const perBase = new Map();
  for (const regola of regole) {
    const gruppo = perBase.get(regola.base);
    if (gruppo) gruppo.push(regola); else perBase.set(regola.base, [regola]);
  }

  /** L'ultima regola che matcha decide [G punto 2]. */
  function decidiRiga(percorso, eDirectory) {
    const chiave = `${eDirectory ? 'd' : 'f'}:${percorso}`;
    const gia = memoria.get(chiave);
    if (gia !== undefined) return gia;

    let esito = NESSUNA;
    /* Le basi candidate: '' e ogni antenato del percorso, dalla radice in giu'. */
    const basi = [''];
    for (let i = percorso.indexOf('/'); i !== -1; i = percorso.indexOf('/', i + 1)) basi.push(percorso.slice(0, i));
    for (const base of basi) {
      const gruppo = perBase.get(base);
      if (!gruppo) continue;
      const porzione = base === '' ? percorso : percorso.slice(base.length + 1);
      if (porzione === '') continue;
      for (const regola of gruppo) {
        if (regola.soloDirectory && !eDirectory) continue; // [G punto 5]
        if (!regola.regex.test(porzione)) continue;
        esito = regola.negata ? INCLUSO : ESCLUSO;
      }
    }
    memoria.set(chiave, esito);
    return esito;
  }

  /**
   * true = TIENI. ⛔ Il ciclo sui genitori e' [G punto 3], la regola del 27/08: una
   * negazione NON puo' ripescare un file se una cartella genitore e' esclusa. La faccio
   * qui dentro e non solo nella potatura del camminatore, cosi' l'esito e' giusto anche
   * se qualcuno interroga un percorso profondo di punto in bianco.
   */
  function tieniDa(percorso, eDirectory = false, daSegmento = 1) {
    const norm = normalizzaPercorso(percorso);
    if (norm === '') return true; // la radice non si nasconde mai
    const segmenti = norm.split('/');
    for (let i = Math.max(1, daSegmento); i < segmenti.length; i += 1) {
      if (decidiRiga(segmenti.slice(0, i).join('/'), true) === ESCLUSO) return false;
    }
    return decidiRiga(norm, Boolean(eDirectory)) !== ESCLUSO;
  }

  const tieni = (percorso, eDirectory = false) => tieniDa(percorso, eDirectory, 1);

  return { tieni, tieniDa, quante: regole.length, regole };
}

// ─────────────────────────────────────────────────────────────────────────────────────
// Lettura dal disco
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ Un file che non c'e', o che non si legge, NON deve far sparire niente dall'elenco.
 * Torna [] e va avanti: la direzione dell'errore e' sempre «tengo di piu'».
 */
async function leggiRighe(fs, percorsoAssoluto) {
  try {
    const testo = await fs.readFile(percorsoAssoluto, 'utf8');
    return typeof testo === 'string' ? testo.split('\n') : [];
  } catch {
    return [];
  }
}

/**
 * Risale da `radice` cercando la cartella di lavoro del repo — quella che contiene `.git`.
 *
 * ⛔ `.git` puo' essere una DIRECTORY (repo normale) o un FILE (worktree: dentro c'e'
 * `gitdir: <percorso>`). Vanno bene entrambi: questa sessione gira proprio in un worktree,
 * e trattarne solo uno dei due avrebbe fatto fallire la risalita in silenzio.
 *
 * ⛔ Due tetti dichiarati, per non salire all'infinito verso `C:\`:
 *    - `risalitaMassima` livelli (default 64);
 *    - lo stop naturale quando `dirname(x) === x`, cioe' la radice del volume.
 * Se non si trova nessun `.git`, ci si ferma alla radice DATA: una cartella di lavoro che
 * non e' un repo non deve far salire il filtro sopra quello che l'utente ha aperto.
 */
async function trovaRadiceRepo(fs, radice, risalitaMassima) {
  if (typeof fs.stat !== 'function') return null;
  let corrente = radice;
  for (let salite = 0; salite <= risalitaMassima; salite += 1) {
    try {
      await fs.stat(join(corrente, '.git')); // file o directory: basta che esista
      return corrente;
    } catch { /* non qui: si sale */ }
    const sopra = dirname(corrente);
    if (!sopra || sopra === corrente) return null; // radice del volume
    corrente = sopra;
  }
  return null; // tetto raggiunto
}

/**
 * Dove sta `info/exclude` per questo repo.
 * Repo normale: `<radiceRepo>/.git/info/exclude`.
 * Worktree: `.git` e' un FILE con `gitdir:`, e le regole condivise stanno nel COMMON DIR,
 * che il file `commondir` dentro il gitdir indica. Se qualcosa non torna si rinuncia:
 * perdere `info/exclude` significa TENERE qualche file in piu', mai nasconderne.
 */
async function cartellaGit(fs, radiceRepo) {
  const punto = join(radiceRepo, '.git');
  try {
    const stato = await fs.stat(punto);
    if (stato?.isDirectory?.()) return punto;
  } catch { return null; }
  try {
    const testo = await fs.readFile(punto, 'utf8');
    const trovato = /^gitdir:\s*(.+)$/m.exec(String(testo));
    if (!trovato) return null;
    const gitdir = trovato[1].trim();
    try {
      const comune = String(await fs.readFile(join(gitdir, 'commondir'), 'utf8')).trim();
      return isAbsolute(comune) ? comune : join(gitdir, comune);
    } catch {
      return gitdir;
    }
  } catch { return null; }
}

/**
 * Legge le regole da una cartella e restituisce il filtro da dare al camminatore.
 *
 * ⛔⛔ LA RACCOLTA PARTE DALLA RADICE DEL REPO, NON DALLA CARTELLA DI LAVORO.
 * [G] «Patterns read from a .gitignore file in the same directory as the path, or IN ANY
 * PARENT DIRECTORY (up to the top-level of the working tree) […]». Una cartella di lavoro
 * e' quasi sempre una SOTTOCARTELLA del repo, e le regole che contano di piu' (quelle degli
 * artefatti) stanno nel `.gitignore` di radice. Misurato il 10/09/2026 su `harness-ui/`:
 * partendo dalla sottocartella si trovavano 7 regole da 2 fonti invece delle 940 da 56 che
 * si vedono dalla radice, e 944 file di artefatti che git considera ignorati finivano
 * nell'elenco dato al modello, mangiando il tetto di 1.500.
 * ⇒ Il giudice ragiona in coordinate RELATIVE ALLA RADICE DEL REPO; il filtro pubblico
 * riceve percorsi relativi alla cartella di lavoro e antepone il prefisso.
 *
 * ⛔ SCELTA DICHIARATA (L7): se la cartella di lavoro STESSA e' ignorata (aprire
 * `node_modules/` come workspace), il filtro NON svuota l'elenco. Git li' non mostrerebbe
 * niente, ma qui l'utente ha scelto quella cartella apposta, e un elenco vuoto sarebbe di
 * nuovo «nascondere al modello file che esistono». I genitori si controllano solo DENTRO
 * la cartella di lavoro; le regole dei genitori si applicano ai percorsi lo stesso.
 *
 * Cerca i `.gitignore` ANNIDATI scendendo in ampiezza e POTANDO con le regole gia' note:
 * non entra in `node_modules` se il `.gitignore` di radice lo esclude, quindi il costo e'
 * proporzionale alle cartelle che il camminatore visitera' comunque.
 *
 * @param {{radice: string, fs?: object, profonditaMassima?: number, cartelleMassime?: number,
 *          risalitaMassima?: number}} opzioni
 * @returns {Promise<((percorsoRelativo: string, eDirectory?: boolean) => boolean) &
 *          {quante: number, fonti: string[], radiceRepo: string|null, prefissoLavoro: string}>}
 */
export async function creaFiltroGitignore({
  radice,
  fs = fsPromises,
  profonditaMassima = PROFONDITA_MASSIMA,
  cartelleMassime = CARTELLE_MASSIME,
  risalitaMassima = RISALITA_MASSIMA,
  tempoMassimoMs = TEMPO_MASSIMO_RACCOLTA_MS,
  orologio = () => performance.now(),
} = {}) {
  const regole = [];
  const fonti = [];
  const avvioMs = orologio();
  const budgetMs = Number.isFinite(tempoMassimoMs) ? Math.max(0, tempoMassimoMs) : Infinity;
  let incompleto = false;

  const aggiungi = (righe, base, etichetta) => {
    const prima = regole.length;
    for (const riga of righe) {
      const regola = compilaRiga(riga, base);
      if (regola) regole.push(regola);
    }
    if (regole.length > prima) fonti.push(etichetta);
  };

  // ⛔ RISALITA FINO ALLA RADICE DEL REPO — e in che cosa DIVERGO da ripgrep.
  // [R] ripgrep, crate `ignore`, `Ignore::add_parents()` in `crates/ignore/src/dir.rs`,
  //     sorgente letto il 10/09/2026:
  //     https://github.com/BurntSushi/ripgrep/blob/master/crates/ignore/src/dir.rs
  //     Accumula TUTTI gli antenati fino alla radice del filesystem e NON si ferma al repo:
  //     tiene un flag `has_git`, calcolato con `parent.join(".git").exists()`, e lo usa per
  //     la precedenza. ⭐ Da li' prendo la rilevazione con `exists()`, che copre `.git`
  //     DIRECTORY e `.git` FILE (worktree) senza distinguerli — e' il caso di oggi.
  //     ⛔ Ma qui mi FERMO al primo `.git`: un elenco per il modello non deve ereditare
  //     regole da cartelle fuori dal progetto che l'utente ha aperto.
  // [R2] ripgrep CHANGELOG 15.0.0 (2025-10-15), letto il 10/09/2026: fra le correzioni,
  //     «a commonly reported bug related to applying gitignore rules from parent
  //     directories». ⇒ Il buco che sto chiudendo qui e' il difetto CLASSICO di questa
  //     funzione, non una svista locale: chi lo scrive lo sbaglia quasi sempre.
  const radiceRepo = await trovaRadiceRepo(fs, radice, risalitaMassima);
  const partenza = radiceRepo ?? radice;
  // Il pezzo di percorso fra la radice del repo e la cartella di lavoro, con `/`.
  const prefissoLavoro = radiceRepo ? normalizzaPercorso(relative(radiceRepo, radice)) : '';
  const segmentiPrefisso = prefissoLavoro === '' ? 0 : prefissoLavoro.split('/').length;
  const sulDisco = (base) => join(partenza, ...(base ? base.split('/') : []));

  // `.git/` non entra mai in un elenco per il modello: git stesso non lo lista.
  // Prima di tutto il resto, cosi' resta la regola piu' DEBOLE.
  aggiungi(['.git/'], '', '(implicita) .git/');

  // Precedenza piu' bassa dei `.gitignore`, quindi prima di loro [G, DESCRIPTION].
  // ⛔ L1: `core.excludesFile` no — quello e' dell'utente, non del progetto.
  const dotGit = radiceRepo ? await cartellaGit(fs, radiceRepo) : null;
  if (dotGit) {
    const righe = await leggiRighe(fs, join(dotGit, 'info', 'exclude'));
    if (righe.length) aggiungi(righe, '', FONTI_IMPLICITE[0]);
  }

  // I `.gitignore` dei GENITORI, dalla radice del repo giu' fino alla cartella di lavoro
  // (esclusa: quella la legge la camminata qui sotto). Ognuno con la SUA base, e piu' si
  // scende piu' si vince [G punto 9].
  const scaletta = prefissoLavoro === '' ? [] : prefissoLavoro.split('/');
  for (let i = 0; i < scaletta.length; i += 1) {
    const base = scaletta.slice(0, i).join('/');
    const righe = await leggiRighe(fs, join(sulDisco(base), NOME_FILE_REGOLE));
    if (righe.length) aggiungi(righe, base, base ? `${base}/${NOME_FILE_REGOLE}` : NOME_FILE_REGOLE);
  }

  // Ampiezza dalla cartella di lavoro in giu'. Le basi restano relative al REPO.
  const giudiceVivo = () => creaGiudice(regole);
  const coda = [prefissoLavoro];
  let visitate = 0;

  while (coda.length > 0 && visitate < cartelleMassime) {
    if (orologio() - avvioMs > budgetMs) { incompleto = true; break; } // tetto in tempo (12/09): si dichiara, non si nasconde
    const base = coda.shift();
    visitate += 1;

    const righe = await leggiRighe(fs, join(sulDisco(base), NOME_FILE_REGOLE));
    if (righe.length) aggiungi(righe, base, base ? `${base}/${NOME_FILE_REGOLE}` : NOME_FILE_REGOLE);

    if (base.split('/').filter(Boolean).length - segmentiPrefisso >= profonditaMassima) continue;

    let voci;
    try {
      voci = await fs.readdir(sulDisco(base), { withFileTypes: true });
    } catch {
      continue; // ⛔ una cartella illeggibile non nasconde nulla: semplicemente non porta regole
    }

    const giudice = giudiceVivo();
    for (const voce of voci) {
      // ⛔ L5: un symlink a cartella non e' isDirectory() qui, e va bene: git non ci scende.
      if (!voce.isDirectory?.()) continue;
      const figlia = base ? `${base}/${voce.name}` : voce.name;
      if (giudice.tieniDa(figlia, true, segmentiPrefisso + 1)) coda.push(figlia);
    }
  }

  const giudice = creaGiudice(regole);
  const filtro = (percorsoRelativo, eDirectory = false) => {
    const norm = normalizzaPercorso(percorsoRelativo);
    if (norm === '') return true;
    const dalRepo = prefissoLavoro === '' ? norm : `${prefissoLavoro}/${norm}`;
    // ⛔ Il ciclo sui genitori parte SOTTO la cartella di lavoro: vedi L7.
    return giudice.tieniDa(dalRepo, eDirectory, segmentiPrefisso + 1);
  };
  filtro.quante = giudice.quante;
  filtro.fonti = fonti;
  filtro.radiceRepo = radiceRepo;
  filtro.prefissoLavoro = prefissoLavoro;
  filtro.incompleto = incompleto || visitate >= cartelleMassime;
  filtro.msRaccolta = Math.round(orologio() - avvioMs);
  return filtro;
}
