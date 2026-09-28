/** ISOL-01: immutable package identity plus explicitly separated preview data. */
import path from 'node:path';

export function desktopProfile({ metadata = {}, env = {}, appData, localAppData, platform = process.platform } = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (!paths.isAbsolute(appData || '')) throw new Error('Cartella applicazioni assoluta richiesta.');
  const packaged = metadata.talosProfile ?? 'production';
  const requested = env.TALOS_DESKTOP_PROFILE || packaged;
  if (!['production', 'preview'].includes(packaged) || !['production', 'preview'].includes(requested)) throw new Error('Profilo Desktop non valido.');
  // A preview executable may never fall back into the installed application's profile.
  if (packaged === 'preview' && requested !== 'preview') throw new Error('La build di prova non può usare il profilo di produzione.');
  const preview = requested === 'preview';
  const name = preview ? 'TALOS Preview' : 'TALOS';
  const standard = paths.join(appData, 'TALOS');
  const dataDir = env.TALOS_DESKTOP_DATA_DIR || paths.join(appData, name);
  if (!paths.isAbsolute(dataDir)) throw new Error('La cartella dati deve essere assoluta.');
  const canonical = value => platform === 'win32' ? paths.resolve(value).toLowerCase() : paths.resolve(value);
  const contains = (parent, child) => { const rel = paths.relative(canonical(parent), canonical(child)); return !rel || (!rel.startsWith('..' + paths.sep) && rel !== '..' && !paths.isAbsolute(rel)); };
  if (preview && (contains(standard, dataDir) || contains(dataDir, standard))) throw new Error('La cartella della preview non può sovrapporsi ai dati di TALOS.');
  /*
   * ⛔ Corsia SCRATCH, 24/09/2026 — la radice dei temporanei (decisione dell'owner, 23/09 notte):
   *   `%LOCALAPPDATA%\<nome>\cache\scratch`; se la cartella dati è stata spostata con
   *   TALOS_DESKTOP_DATA_DIR, la segue in `<dati>\cache\scratch`; TALOS_SCRATCH_DIR la sposta in modo
   *   esplicito. Si decide QUI e si passa al figlio (runtime.mjs), perché il figlio riceve sempre
   *   TALOS_DESKTOP_DATA_DIR e non saprebbe più se era spostata. Stessa regola di `src/scratch.mjs`
   *   `radiceScratch()` (il pacchetto non spedisce src/ dentro l'app: la regola è ripetuta, e
   *   `tests/scratch.test.mjs` prova che le due coincidono). Local e non Roaming: Microsoft esclude
   *   AppData\Local dal profilo roaming, Electron sconsiglia file grossi o usa-e-getta in userData.
   *   La preview ha il suo nome («TALOS Preview»), quindi la sua radice non tocca mai quella stabile.
   *   Senza LOCALAPPDATA (piattaforma diversa, prova) si ripiega sotto la cartella dati.
   */
  const scratchEsplicita = env.TALOS_SCRATCH_DIR?.trim();
  if (scratchEsplicita && !paths.isAbsolute(scratchEsplicita)) throw new Error('La cartella dei temporanei deve essere assoluta.');
  const scratchDir = scratchEsplicita ? paths.resolve(scratchEsplicita)
    : env.TALOS_DESKTOP_DATA_DIR || !paths.isAbsolute(localAppData || '') ? paths.join(paths.resolve(dataDir), 'cache', 'scratch')
      : paths.join(localAppData, name, 'cache', 'scratch');
  /*
   * ⛔ Owner, 24/09/2026 — la sessione di Chromium (localStorage, cookie, cache su disco, shader: Electron
   *   `docs/api/app.md`, voce `sessionData`) lascia Roaming per `%LOCALAPPDATA%\<nome>\browser`; le preferenze di
   *   TALOS (`dataDir`) restano dove sono. Electron stesso sconsiglia file grossi in `userData` («some environments
   *   may backup this directory to cloud storage»). La sotto-cartella `browser` (come già la preview) evita che la
   *   `Cache` di Chromium e la nostra `cache\scratch` diventino la STESSA cartella su un NTFS senza maiuscole.
   *   Cartella dati spostata (TALOS_DESKTOP_DATA_DIR: prove, CI, portabile) o nessun LOCALAPPDATA: resta com'era.
   *   `sessionDataPrecedente` dice da dove migrare (desktop/migrazione-browser.mjs); null = niente da migrare.
   */
  const sessionDataStorica = preview ? paths.join(paths.resolve(dataDir), 'browser') : paths.resolve(dataDir);
  const sessionData = env.TALOS_DESKTOP_DATA_DIR || !paths.isAbsolute(localAppData || '') ? sessionDataStorica
    : paths.join(localAppData, name, 'browser');
  return Object.freeze({ preview, name, appId: preview ? 'it.talos.desktop.preview' : 'it.talos.desktop',
    keyringScope: preview ? 'desktop-preview' : 'desktop', dataDir: paths.resolve(dataDir), scratchDir,
    sessionData, sessionDataPrecedente: sessionData === sessionDataStorica ? null : sessionDataStorica,
    sourceCommit: /^[0-9a-f]{40}$/.test(metadata.talosSourceCommit || '') ? metadata.talosSourceCommit : null });
}

/** The preview build is ZIP-only, with baked metadata; direct EXE launch stays isolated. */
export function previewBuildConfiguration(profile, sourceCommit) {
  if (profile === undefined || profile === '' || profile === 'production') return null;
  if (profile !== 'preview' || !/^[0-9a-f]{40}$/.test(sourceCommit || '')) throw new Error('Build preview: profilo e commit sorgente esatto richiesti.');
  return { appId: 'it.talos.desktop.preview', productName: 'TALOS Preview',
    extraMetadata: { talosProfile: 'preview', talosSourceCommit: sourceCommit },
    directories: { output: 'dist-preview' },
    win: { artifactName: `TALOS-Preview-\${version}-${sourceCommit.slice(0, 7)}-win.\${ext}` } };
}
