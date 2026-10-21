/*
 * ⛔⛔ L1 motore locale, «elenca rotto» (owner 20/10/2026 sera) — DOVE SEI e gli ALIAS del percorso.
 *
 * IL DIFETTO, misurato nella sessione `e00ae242` (LFM2.5-24B-A2B, Full access, casa Linux): il prompt diceva solo
 *   «Working folder: «Desktop»» e «Piattaforma: win32», mentre shell e attrezzi dei file lavoravano in Linux. Il modello ha
 *   provato `elenca "/"` (la radice di Linux, 815 voci), `elenca "/Desktop"` (rifiutato) e `ls /workspace`: non sapeva dov'era.
 *
 * COSA FANNO GLI ALTRI, letto nel codice il 20/10/2026:
 *   · Hermes `agent/prompt_builder.py:1044-1046` — «Host: …», «User home directory: …», «Current working directory: …»;
 *     `tools/file_tools_paths.py:143-150` espande `~` e traduce `/c/Users/…` di Git Bash, «Container/WSL Linux paths are never
 *     rewritten»; `tools/file_operations.py:1204-1240` (`_suggest_similar_files`) risponde a un file che non c'è con i nomi simili.
 *   · pi `packages/coding-agent/src/core/system-prompt.ts:183` — `cwd` nel prompt; opencode e Claude Code — «Working directory».
 * ⇒ Owner, consigliata: «Percorso vero a tutti», e «la piattaforma dice dove girano» (`decisioni-owner-percorso-vero-e-piattaforma-20-10`).
 *   ⛔ Il percorso contiene il nome dell'utente del PC e va anche ai fornitori cloud: deciso dall'owner, detto nel CHANGELOG.
 *
 * ONE-UP, sopra a tutti e due:
 *   · la nota dice il percorso COME LO VEDONO GLI ATTREZZI (nella casa Linux `/mnt/c/…`, non `C:\…`), e si ripete solo quando
 *     cambia o quando manca nella conversazione (una ripresa vecchia, una compattazione che l'ha tolta);
 *   · un percorso che nomina la cartella di lavoro come se fosse una sua figlia (`/Desktop/x` mentre si lavora DENTRO Desktop) si
 *     legge come relativo, ma SOLO se quel primo pezzo letterale non esiste — e si dice nell'esito, mai in silenzio.
 * ⛔ Condizione della CLI (Voce 213): l'alias produce un percorso RELATIVO e lo restituisce PRIMA di ogni controllo; confine,
 *   path-policy, segreti, credenziali, negazioni e hook lo vedono come se il modello l'avesse scritto così. Un `..` resta `..`:
 *   `/Desktop/../.ssh/id_rsa` decide come `../.ssh/id_rsa`.
 */

/** Il segno della nota: chi cerca nella conversazione se il modello l'ha già davanti. */
export const SEGNO_NOTA_DOVE = 'Where you are — working folder: '

/**
 * Il testo della nota.
 * @param {object} p
 * @param {string} p.percorso — la cartella di lavoro come la vedono gli attrezzi dei file
 * @param {'linux'|'windows'|'altro'} p.casa — dove lavorano gli attrezzi dei file
 * @param {'wsl2'|'windows'|null} [p.shell] — su Windows senza casa Linux: dove gira la shell (null = sceglie lei)
 * @param {string|null} [p.percorsoLinux] — la stessa cartella vista da WSL, quando la shell può girare lì
 * @param {string} [p.piattaforma] — `process.platform`, per `casa: 'altro'`
 */
export function notaDoveSei({ percorso, casa, shell = null, percorsoLinux = null, piattaforma = '' }) {
  const righe = [`${SEGNO_NOTA_DOVE}${percorso}`];
  const relativi = 'Relative tool paths start from the working folder (`.` is the folder itself).';
  if (casa === 'linux') {
    righe.push('Platform: Linux (WSL2). The shell and the file tools (leggi, scrivi, file_edit, elenca, cerca) use Linux paths.');
    righe.push(`${relativi} \`/\` is the Linux root, not the working folder.`);
  } else if (casa === 'windows') {
    righe.push('Platform: Windows. The file tools use Windows paths.');
    if (shell === 'windows') righe.push('The shell is cmd.exe on Windows.');
    else if (percorsoLinux) {
      righe.push(shell === 'wsl2'
        ? `The shell runs in Linux (WSL2), where the working folder is ${percorsoLinux}.`
        : `The shell may run a command in Windows or in Linux (WSL2); in Linux the working folder is ${percorsoLinux}.`);
    }
    righe.push(`${relativi} A path starting with \`/\` points at the root of the drive, not at the working folder.`);
  } else {
    const nome = piattaforma === 'darwin' ? 'macOS' : piattaforma === 'linux' ? 'Linux' : piattaforma || 'unknown';
    righe.push(`Platform: ${nome}.`);
    righe.push(relativi);
  }
  return righe.join('\n');
}

/** L'ultima nota «dove sei» che il modello ha davanti, o `null`. */
export function ultimaNotaDove(messaggi) {
  if (!Array.isArray(messaggi)) return null;
  for (let i = messaggi.length - 1; i >= 0; i -= 1) {
    const m = messaggi[i];
    if (m?.role === 'system' && typeof m.content === 'string' && m.content.startsWith(SEGNO_NOTA_DOVE)) return m.content;
  }
  return null;
}

/** Gli attrezzi il cui percorso passa dagli alias. */
export const ATTREZZI_CON_ALIAS = Object.freeze(['leggi', 'elenca', 'scrivi', 'file_edit']);
/*
 * ⛔ 20/10/2026 notte, S2 della revisione della CLI 0.6.11: nelle SCRITTURE l'alias del nome della cartella riscriveva un percorso
 *   giusto. Progetto `myproj` con `main.py` alla radice: `scrivi "myproj/__init__.py"` finiva in `__init__.py` e
 *   `scrivi "myproj/main.py"` SOVRASCRIVEVA il `main.py` della radice (il layout piatto di Python e Django, `myproj/myproj/…`,
 *   non si poteva più creare, e una cartella che non esiste ANCORA è proprio quella che una scrittura sta per creare). Hermes non
 *   riscrive mai il nome della cartella: risolve alla lettera (`tools/file_tools_paths.py:267-274`, `_anchor`), espande solo `~`, e
 *   avverte quando un relativo esce dallo spazio di lavoro (`:288-316`). ⇒ Nelle scritture solo `~`; il nome della cartella resta
 *   un alias delle LETTURE (`leggi`, `elenca`), dove serviva al modello che cercava «/Desktop». Un `/myproj/x` scritto alla lettera
 *   esce dal progetto e lo fermano i cancelli di sempre, come in Hermes.
 */
export const ATTREZZI_DI_SCRITTURA = Object.freeze(['scrivi', 'file_edit']);

/**
 * L'alias di UN percorso: `{ percorso, nota }` quando va riletto, `null` quando resta com'è.
 *
 * Due forme, e solo queste:
 *   · `/<cartella>[/resto]` o `<cartella>/resto` (anche con `\`), dove `<cartella>` è il NOME della cartella di lavoro e il primo
 *     pezzo letterale (`/<cartella>`, oppure `<cartella>` dentro la cartella di lavoro) NON esiste ⇒ `resto` (o `.`);
 *   · `~` o `~/resto`, solo quando chi chiama dà la sua casa (`casaUtente`) e `~` letterale non esiste ⇒ il percorso nella casa.
 * ⛔ `/` da solo non è mai un alias: in «Accesso pieno» elencare la radice è una richiesta legittima.
 *
 * @param {string} percorso
 * @param {{ nomeCartella: string, esiste: (p: string) => boolean, maiuscoleIndifferenti?: boolean, casaUtente?: string|null,
 *   separatoreCasa?: string }} opzioni
 */
export function aliasDelPercorso(percorso, { nomeCartella, esiste, maiuscoleIndifferenti = false, casaUtente = null, separatoreCasa = '/', soloCasa = false } = {}) {
  if (typeof percorso !== 'string' || percorso === '' || typeof esiste !== 'function') return null;
  const unificato = percorso.replace(/\\/gu, '/');

  if (casaUtente && (unificato === '~' || unificato.startsWith('~/'))) {
    if (esiste('~')) return null;
    const resto = unificato.slice(2).split('/').filter(Boolean);
    const nuovo = [String(casaUtente).replace(/[\\/]+$/u, ''), ...resto].join(separatoreCasa);
    return { percorso: nuovo, nota: `Note: "${percorso}" was read as "${nuovo}" (\`~\` is the home folder).` };
  }

  if (soloCasa) return null; // una scrittura: il nome della cartella resta alla lettera (sopra, ATTREZZI_DI_SCRITTURA)
  if (typeof nomeCartella !== 'string' || nomeCartella === '' || nomeCartella === '.' || nomeCartella === '..') return null;
  const assoluto = unificato.startsWith('/') && !unificato.startsWith('//');
  const pezzi = (assoluto ? unificato.slice(1) : unificato).split('/');
  const primo = pezzi[0];
  const uguale = maiuscoleIndifferenti ? primo.toLowerCase() === nomeCartella.toLowerCase() : primo === nomeCartella;
  if (!uguale) return null;
  // relativo senza resto (`Desktop`): è il nome di una figlia, non un alias
  if (!assoluto && pezzi.length < 2) return null;
  if (esiste(assoluto ? `/${primo}` : primo)) return null;
  const resto = pezzi.slice(1).filter((p) => p !== '');
  const nuovo = resto.length ? resto.join('/') : '.';
  return {
    percorso: nuovo,
    nota: `Note: "${percorso}" was read as "${nuovo}": "${primo}" is the working folder itself, not a folder inside it or at the root.`,
  };
}

/**
 * Gli argomenti di una chiamata con l'alias applicato al campo del percorso (qualunque dei suoi nomi), o `null` se non cambia.
 * Il percorso nuovo prende il posto di quello vecchio nello STESSO campo: chi legge dopo non vede differenze di forma.
 * ⛔ `elenca` sulla cartella stessa toglie il campo: senza argomenti è la radice con l'uscita di sempre (`.` darebbe `./x`).
 */
export function argomentiConAlias(nome, argomenti, aliasPerPercorso, campi) {
  if (!ATTREZZI_CON_ALIAS.includes(nome) || !argomenti || typeof argomenti !== 'object' || Array.isArray(argomenti)) return null;
  // lo stesso campo che sceglie `campoConAlias` (talosHarness.mjs): il primo non vuoto, nell'ordine dei nomi
  const campo = campi.find((k) => (typeof argomenti[k] === 'string' ? argomenti[k].length > 0 : argomenti[k] !== undefined && argomenti[k] !== null));
  if (!campo || typeof argomenti[campo] !== 'string') return null;
  const alias = aliasPerPercorso(argomenti[campo], { soloCasa: ATTREZZI_DI_SCRITTURA.includes(nome) });
  if (!alias) return null;
  const nuovi = { ...argomenti };
  // la radice: via TUTTI i nomi del percorso, o un secondo nome rimasto prenderebbe il posto del primo
  if (nome === 'elenca' && alias.percorso === '.') for (const k of campi) delete nuovi[k];
  else nuovi[campo] = alias.percorso;
  return { argomenti: nuovi, nota: alias.nota };
}
