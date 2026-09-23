/**
 * workspace-files.mjs — le azioni sul singolo file dell'albero workspace
 * che oggi mancano (piano `elegant-spinning-dongarra.md`, owner 27/8:
 * "Non ha nessun'opzione per rinominare i file, per aprire i file, per
 * aprirli nel visualizza file explorer di Windows. Non ha opzioni per
 * eliminarlo, per allegarlo nella chat").
 *
 * ⛔ Deliberatamente FUORI da `talosHarness.mjs`: queste sono azioni
 * dell'OWNER sull'albero (mai un tool-call del modello), quindi non
 * hanno bisogno di passare dal kernel benchmarkato — `discoNode` espone
 * solo `elenca`/`leggi`/`scrivi` (verificato leggendo il sorgente prima
 * di scrivere questo file, non presunto), niente rinomina/elimina.
 * Aggiungerle lì avrebbe richiesto un'altra ri-misura TALOS-BANCO per
 * un bisogno che non tocca affatto il banco.
 *
 * ⛔⛔ Stessa disciplina di path-policy.mjs/workspace-tree.mjs: ogni
 * percorso arriva da una richiesta HTTP, non da un modello cooperativo
 * — `isPathInside` (path-policy.mjs, riusato non duplicato) valida
 * SEMPRE il percorso REALE (dopo aver risolto eventuali symlink) contro
 * la radice reale della sessione, mai la stringa grezza.
 *
 * ⭐ 29/8 — porta canonico verbatim (ea623891 + 46940ae4, ledger
 * §27-bis): copia embedded on-device, invariata rispetto al desktop —
 * zero dipendenze npm rischiose (solo node:child_process/node:fs/
 * node:path + path-policy.mjs, già presente in questa copia).
 */
import { execFile } from 'node:child_process';
import { promises as fsp, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import { isPathInside } from './path-policy.mjs';

export class WorkspaceFileError extends Error {
  constructor(message, code = 'QUERY_INVALID') {
    super(message);
    this.name = 'WorkspaceFileError';
    this.code = code;
  }
}

/** ⛔ 512 KB: un'anteprima, non un editor — file più grandi si dichiarano troppo grandi invece di essere troncati in silenzio. */
const DIMENSIONE_MASSIMA_ANTEPRIMA = 512 * 1024;

function risolviPercorsoEsistente(cartella, percorso, { realpathSyncFn = realpathSync } = {}) {
  if (typeof percorso !== 'string' || percorso.length === 0 || percorso.includes('\0') || isAbsolute(percorso)) {
    throw new WorkspaceFileError('Percorso non valido');
  }
  const radiceReale = realpathSyncFn(cartella);
  let reale;
  try {
    reale = realpathSyncFn(join(cartella, percorso));
  } catch {
    throw new WorkspaceFileError('File non trovato', 'FILE_NOT_FOUND');
  }
  if (!isPathInside(radiceReale, reale) || reale === radiceReale) {
    // ⛔ reale === radiceReale: nessuna delle azioni di questo file ha senso sulla RADICE della sessione stessa (rinominarla/eliminarla è un disastro diverso, fuori scope qui)
    throw new WorkspaceFileError('Percorso fuori dalla cartella della sessione, o è la radice stessa');
  }
  return { radiceReale, reale };
}

/**
 * "Apri" — il contenuto di un file, in sola lettura. Non passa da
 * `disco.leggi` del kernel (che tronca a MAX_BYTE_LETTI per un motivo
 * diverso, il contesto del modello): qui l'anteprima ha il suo proprio
 * tetto, dichiarato esplicitamente se superato.
 */
export async function leggiContenutoFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  if (!stat.isFile()) throw new WorkspaceFileError('Non è un file — apri una cartella dall\'albero, non da qui');
  if (stat.size > DIMENSIONE_MASSIMA_ANTEPRIMA) {
    throw new WorkspaceFileError(`File troppo grande per l'anteprima (${Math.round(stat.size / 1024)} KB, tetto ${DIMENSIONE_MASSIMA_ANTEPRIMA / 1024} KB)`, 'FILE_TOO_LARGE');
  }
  const contenuto = await (deps.readFileFn ?? fsp.readFile)(reale, 'utf8');
  return { contenuto, dimensione: stat.size };
}

/**
 * "Rinomina" — `nuovoNome` è un NOME, non un percorso: niente `/`, `\`,
 * `..` — sposta il file nella STESSA cartella, non altrove (rinominare
 * ≠ spostare, stessa distinzione che fa ogni file manager reale).
 */
export async function rinominaFile({ cartella, percorso, nuovoNome }, deps = {}) {
  const { radiceReale, reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  if (
    typeof nuovoNome !== 'string' || nuovoNome.length === 0 || nuovoNome.length > 255
    || nuovoNome.includes('/') || nuovoNome.includes('\\') || nuovoNome.includes('\0')
    || nuovoNome === '.' || nuovoNome === '..'
  ) {
    throw new WorkspaceFileError('Nuovo nome non valido — un nome di file, non un percorso');
  }
  const destinazione = join(dirname(reale), nuovoNome);
  if (!isPathInside(radiceReale, destinazione)) throw new WorkspaceFileError('Destinazione fuori dalla cartella della sessione');
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia) throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS');
  await (deps.renameFn ?? fsp.rename)(reale, destinazione);
  const nuovoPercorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { nuovoPercorso };
}

/**
 * "Elimina" — DISTRUTTIVA. La conferma vive nel frontend (un dialogo
 * vero, non un `confirm()` del browser — stessa disciplina "hard to
 * reverse actions get confirmed" del resto del prodotto): questa
 * funzione esegue e basta, non chiede nulla lei stessa.
 */
export async function eliminaFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  await (deps.rmFn ?? fsp.rm)(reale, { recursive: stat.isDirectory(), force: false });
  return { eliminato: true };
}

/**
 * "Crea" — scrive BYTE nuovi alla radice del workspace (`document_create`,
 * piano elegant-spinning-dongarra.md, 28/8). Diversa dalle altre azioni
 * di questo file: qui il file NON esiste ancora, quindi
 * `risolviPercorsoEsistente` (che richiede `realpathSync` sul
 * bersaglio) non si applica — si valida solo che `nome` sia un NOME
 * piatto (stessa grammatica di `nuovoNome` in `rinominaFile`: niente
 * `/`, `\`, `..`), mai un percorso con sottocartelle. Scope
 * deliberatamente stretto (radice del workspace, non un percorso
 * arbitrario) — un generatore di documenti scrive dove l'utente lo
 * vede subito nell'albero, non in una sottocartella indovinata.
 */
export async function creaFileWorkspace({ cartella, nome, bytes }, deps = {}) {
  if (
    typeof nome !== 'string' || nome.length === 0 || nome.length > 255
    || nome.includes('/') || nome.includes('\\') || nome.includes('\0')
    || nome === '.' || nome === '..'
  ) {
    throw new WorkspaceFileError('Nome file non valido — un nome, non un percorso');
  }
  const radiceReale = (deps.realpathSyncFn ?? realpathSync)(cartella);
  const destinazione = join(radiceReale, nome);
  if (!isPathInside(radiceReale, destinazione)) throw new WorkspaceFileError('Destinazione fuori dalla cartella del workspace');
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia) throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS');
  await (deps.writeFileFn ?? fsp.writeFile)(destinazione, bytes);
  return { percorso: nome };
}

/**
 * "Sposta" — drag&drop (piano `elegant-spinning-dongarra.md`, owner:
 * "nella lista files devo poter draggare i file"). Sposta un file/
 * cartella in un'ALTRA cartella dello stesso workspace, mantenendo il
 * nome — `cartellaDestinazione` è un percorso relativo ('' = radice)
 * che deve esistere ED essere una cartella. Non sovrascrive mai un
 * nome già occupato nella destinazione. `isPathInside(reale,
 * destinazioneCartellaReale)` copre da sola sia "dentro se stessa" sia
 * "dentro un proprio discendente" (torna true anche a parità di
 * percorso — verificato leggendo path-policy.mjs, non presunto): senza
 * questa guardia una cartella spostata dentro se stessa lascerebbe
 * `fs.rename` fallire a metà con un errore di sistema operativo
 * travestito da azione riuscita.
 */
export async function spostaFile({ cartella, percorso, cartellaDestinazione }, deps = {}) {
  const { radiceReale, reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const realpathSyncFn = deps.realpathSyncFn ?? realpathSync;
  let destinazioneCartellaReale;
  if (cartellaDestinazione === '') {
    destinazioneCartellaReale = radiceReale;
  } else {
    if (typeof cartellaDestinazione !== 'string' || isAbsolute(cartellaDestinazione)) {
      throw new WorkspaceFileError('Cartella di destinazione non valida');
    }
    try {
      destinazioneCartellaReale = realpathSyncFn(join(cartella, cartellaDestinazione));
    } catch {
      throw new WorkspaceFileError('Cartella di destinazione non trovata', 'FILE_NOT_FOUND');
    }
    if (!isPathInside(radiceReale, destinazioneCartellaReale)) {
      throw new WorkspaceFileError('Destinazione fuori dalla cartella della sessione');
    }
  }
  const statDestinazione = await (deps.statFn ?? fsp.stat)(destinazioneCartellaReale).catch(() => null);
  if (!statDestinazione || !statDestinazione.isDirectory()) {
    throw new WorkspaceFileError('La destinazione non è una cartella');
  }
  if (isPathInside(reale, destinazioneCartellaReale)) {
    throw new WorkspaceFileError('Non puoi spostare un elemento dentro se stesso o un suo discendente');
  }
  const nome = reale.split(sep).pop();
  const destinazione = join(destinazioneCartellaReale, nome);
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia) throw new WorkspaceFileError('Esiste già un elemento con questo nome nella destinazione', 'FILE_EXISTS');
  await (deps.renameFn ?? fsp.rename)(reale, destinazione);
  const nuovoPercorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { nuovoPercorso };
}

/**
 * "Copia" — owner: "non esiste il comando copia". Duplica un file/
 * cartella nella STESSA posizione, con un nome tipo "nome (copia).ext"
 * (pattern Explorer/Finder — verificato via ricerca web, non inventato:
 * è la convenzione standard di ogni file manager desktop). Se anche
 * quello esiste già, prova "nome (copia 2).ext" e così via, fino a un
 * tetto dichiarato — mai un ciclo infinito su un caso patologico.
 */
export async function copiaFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const accessFn = deps.accessFn ?? fsp.access;
  const cartellaGenitore = dirname(reale);
  const nomeOriginale = reale.split(sep).pop();
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  const puntoEstensione = nomeOriginale.lastIndexOf('.');
  // niente estensione separata per una cartella, o per un file che INIZIA con un punto (es. ".gitignore" resta intero in "base")
  const haEstensione = !stat.isDirectory() && puntoEstensione > 0;
  const base = haEstensione ? nomeOriginale.slice(0, puntoEstensione) : nomeOriginale;
  const estensione = haEstensione ? nomeOriginale.slice(puntoEstensione) : '';

  const TETTO_TENTATIVI = 1000;
  let destinazione = null;
  for (let n = 1; n <= TETTO_TENTATIVI; n += 1) {
    const suffisso = n === 1 ? ' (copia)' : ` (copia ${n})`;
    const candidato = join(cartellaGenitore, `${base}${suffisso}${estensione}`);
    const esisteGia = await accessFn(candidato).then(() => true, () => false);
    if (!esisteGia) { destinazione = candidato; break; }
  }
  if (!destinazione) throw new WorkspaceFileError('Troppe copie già esistenti con questo nome');

  await (deps.cpFn ?? fsp.cp)(reale, destinazione, { recursive: true, errorOnExist: true });
  const radiceReale = realpathSync(cartella);
  const nuovoPercorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { nuovoPercorso };
}

/**
 * "Nuovo file"/"Nuova cartella" — CRUD manuale dell'owner ("comandi
 * crud in generale"), in QUALSIASI punto dell'albero — a differenza di
 * `creaFileWorkspace` sopra, che resta vincolata alla radice per
 * `document_create` (un bisogno diverso, dell'AGENTE, non toccato qui).
 * `percorsoBase` è la cartella dove creare ('' = radice); deve
 * esistere ED essere una cartella se non vuoto.
 */
export async function creaVoceWorkspace({ cartella, percorsoBase, nome, tipo }, deps = {}) {
  if (tipo !== 'file' && tipo !== 'cartella') {
    throw new WorkspaceFileError('Tipo non valido: "file" o "cartella"');
  }
  if (
    typeof nome !== 'string' || nome.length === 0 || nome.length > 255
    || nome.includes('/') || nome.includes('\\') || nome.includes('\0')
    || nome === '.' || nome === '..'
  ) {
    throw new WorkspaceFileError('Nome non valido — un nome, non un percorso');
  }
  const realpathSyncFn = deps.realpathSyncFn ?? realpathSync;
  const radiceReale = realpathSyncFn(cartella);
  let cartellaBaseReale = radiceReale;
  if (percorsoBase) {
    if (typeof percorsoBase !== 'string' || isAbsolute(percorsoBase)) {
      throw new WorkspaceFileError('Cartella base non valida');
    }
    try {
      cartellaBaseReale = realpathSyncFn(join(cartella, percorsoBase));
    } catch {
      throw new WorkspaceFileError('Cartella base non trovata', 'FILE_NOT_FOUND');
    }
    if (!isPathInside(radiceReale, cartellaBaseReale)) {
      throw new WorkspaceFileError('Cartella base fuori dal workspace della sessione');
    }
    const statBase = await (deps.statFn ?? fsp.stat)(cartellaBaseReale).catch(() => null);
    if (!statBase || !statBase.isDirectory()) throw new WorkspaceFileError('La cartella base non è una cartella');
  }
  const destinazione = join(cartellaBaseReale, nome);
  if (!isPathInside(radiceReale, destinazione)) throw new WorkspaceFileError('Destinazione fuori dal workspace della sessione');
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia) throw new WorkspaceFileError('Esiste già un elemento con questo nome', 'FILE_EXISTS');
  if (tipo === 'cartella') await (deps.mkdirFn ?? fsp.mkdir)(destinazione);
  else await (deps.writeFileFn ?? fsp.writeFile)(destinazione, '');
  const percorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { percorso };
}

/**
 * "Rivela in Esplora File" — SOLO Windows (`explorer.exe`), dichiarato
 * non simulato altrove. Un SOLO argomento argv (`/select,<percorso>`,
 * verificato via ricerca web la sintassi esatta — niente spazio dopo la
 * virgola): `execFile` non passa da una shell, quindi zero rischio di
 * injection anche con un percorso pieno di caratteri strani.
 *
 * ⛔ `explorer.exe` torna quasi sempre un codice di uscita diverso da
 * zero ANCHE quando ha aperto la finestra correttamente (comportamento
 * noto, non un guasto di questo codice) — l'unico fallimento vero da
 * segnalare è `execFile` che non trova l'eseguibile affatto.
 *
 * ⭐ 29/8 — su questa copia (Node bundlato per Android) `process.platform`
 * non è mai 'win32': la guardia sotto degrada onestamente a
 * PLATFORM_UNSUPPORTED invece di tentare `explorer.exe` (che non esiste
 * sul dispositivo) — comportamento corretto per costruzione, non un
 * ripiego aggiunto qui.
 */
export async function rivelaInEsploraFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  if ((deps.platform ?? process.platform) !== 'win32') {
    throw new WorkspaceFileError('Disponibile solo su Windows', 'PLATFORM_UNSUPPORTED');
  }
  const execFileFn = deps.execFileFn ?? execFile;
  await new Promise((ok, no) => {
    execFileFn('explorer.exe', [`/select,${reale}`], (errore) => {
      if (errore && errore.code === 'ENOENT') { no(errore); return; }
      ok(); // qualunque altro codice di uscita: comportamento noto di explorer.exe, non un fallimento
    });
  });
  return { rivelato: true };
}
