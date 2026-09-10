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
 * Costo misurato della via a mano: ~200 righe di modulo + 40 prove, e un oracolo
 * `git check-ignore` per fissare la semantica prima di scrivere. Il perimetro coperto e'
 * l'insieme dei costrutti che compaiono in un `.gitignore` reale; ogni buco noto e' in L1-L6.
 */

import { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';

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

  /** Se la regola vive in una sottocartella, vale solo la' dentro: torna il resto, o null. */
  function porzioneApplicabile(regola, percorso) {
    if (regola.base === '') return percorso;
    const prefisso = `${regola.base}/`;
    return percorso.startsWith(prefisso) ? percorso.slice(prefisso.length) : null;
  }

  /** L'ultima regola che matcha decide [G punto 2]. */
  function decidiRiga(percorso, eDirectory) {
    const chiave = `${eDirectory ? 'd' : 'f'}:${percorso}`;
    const gia = memoria.get(chiave);
    if (gia !== undefined) return gia;

    let esito = NESSUNA;
    for (const regola of regole) {
      if (regola.soloDirectory && !eDirectory) continue; // [G punto 5]
      const porzione = porzioneApplicabile(regola, percorso);
      if (porzione === null || porzione === '') continue;
      if (!regola.regex.test(porzione)) continue;
      esito = regola.negata ? INCLUSO : ESCLUSO;
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
  function tieni(percorso, eDirectory = false) {
    const norm = normalizzaPercorso(percorso);
    if (norm === '') return true; // la radice non si nasconde mai
    const segmenti = norm.split('/');
    for (let i = 1; i < segmenti.length; i += 1) {
      if (decidiRiga(segmenti.slice(0, i).join('/'), true) === ESCLUSO) return false;
    }
    return decidiRiga(norm, Boolean(eDirectory)) !== ESCLUSO;
  }

  return { tieni, quante: regole.length, regole };
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
 * Legge le regole da una cartella e restituisce il filtro da dare al camminatore.
 *
 * Cerca i `.gitignore` ANNIDATI scendendo in ampiezza e POTANDO con le regole gia' note:
 * non entra in `node_modules` se il `.gitignore` di radice lo esclude, quindi il costo e'
 * proporzionale alle cartelle che il camminatore visitera' comunque.
 *
 * @param {{radice: string, fs?: object, profonditaMassima?: number, cartelleMassime?: number}} opzioni
 * @returns {Promise<((percorsoRelativo: string, eDirectory?: boolean) => boolean) & {quante: number, fonti: string[]}>}
 */
export async function creaFiltroGitignore({
  radice,
  fs = fsPromises,
  profonditaMassima = PROFONDITA_MASSIMA,
  cartelleMassime = CARTELLE_MASSIME,
} = {}) {
  const regole = [];
  const fonti = [];

  const aggiungi = (righe, base, etichetta) => {
    const prima = regole.length;
    for (const riga of righe) {
      const regola = compilaRiga(riga, base);
      if (regola) regole.push(regola);
    }
    if (regole.length > prima) fonti.push(etichetta);
  };

  // `.git/` non entra mai in un elenco per il modello: git stesso non lo lista.
  // Prima di tutto il resto, cosi' resta la regola piu' DEBOLE.
  aggiungi(['.git/'], '', '(implicita) .git/');

  // Precedenza piu' bassa dei `.gitignore`, quindi prima di loro [G, DESCRIPTION].
  // ⛔ L1: `core.excludesFile` no — quello e' dell'utente, non del progetto.
  for (const relativa of FONTI_IMPLICITE) {
    const righe = await leggiRighe(fs, join(radice, ...relativa.split('/')));
    if (righe.length) aggiungi(righe, '', relativa);
  }

  // Ampiezza: i file piu' profondi entrano DOPO, e quindi vincono [G punto 9].
  const giudiceVivo = () => creaGiudice(regole);
  const coda = [''];
  let visitate = 0;

  while (coda.length > 0 && visitate < cartelleMassime) {
    const base = coda.shift();
    visitate += 1;

    const righe = await leggiRighe(fs, join(radice, ...(base ? base.split('/') : []), NOME_FILE_REGOLE));
    if (righe.length) aggiungi(righe, base, base ? `${base}/${NOME_FILE_REGOLE}` : NOME_FILE_REGOLE);

    if (base.split('/').filter(Boolean).length >= profonditaMassima) continue;

    let voci;
    try {
      voci = await fs.readdir(join(radice, ...(base ? base.split('/') : [])), { withFileTypes: true });
    } catch {
      continue; // ⛔ una cartella illeggibile non nasconde nulla: semplicemente non porta regole
    }

    const { tieni } = giudiceVivo();
    for (const voce of voci) {
      // ⛔ L5: un symlink a cartella non e' isDirectory() qui, e va bene: git non ci scende.
      if (!voce.isDirectory?.()) continue;
      const figlia = base ? `${base}/${voce.name}` : voce.name;
      if (tieni(figlia, true)) coda.push(figlia);
    }
  }

  const giudice = creaGiudice(regole);
  const filtro = (percorsoRelativo, eDirectory = false) => giudice.tieni(percorsoRelativo, eDirectory);
  filtro.quante = giudice.quante;
  filtro.fonti = fonti;
  return filtro;
}
