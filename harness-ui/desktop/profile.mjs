/** ISOL-01: immutable package identity plus explicitly separated preview data. */
import path from 'node:path';

export function desktopProfile({ metadata = {}, env = {}, appData, platform = process.platform } = {}) {
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
  return Object.freeze({ preview, name, appId: preview ? 'it.talos.desktop.preview' : 'it.talos.desktop',
    keyringScope: preview ? 'desktop-preview' : 'desktop', dataDir: paths.resolve(dataDir),
    sessionData: preview ? paths.join(paths.resolve(dataDir), 'browser') : paths.resolve(dataDir),
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
