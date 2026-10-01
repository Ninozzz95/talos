/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026: «il modello vede i percorsi di Linux; l'interfaccia quelli di Windows») —
 *   le due viste dello STESSO percorso, come le dà `wslpath` (Microsoft Learn, «WSL basic commands»; `/mnt/<unità>` è la radice
 *   di montaggio predefinita, misurata il 01/10/2026 in /proc/mounts della distro dell'owner):
 *     · `/mnt/c/proj/a.txt`        ⇄ `C:\proj\a.txt`
 *     · `/tmp/x`, `/home/u/.bashrc` ⇄ `\\wsl.localhost\<distro>\tmp\x`  (NAMESPACE26: Node per Windows legge gli stessi byte)
 *     · un percorso RELATIVO resta quello: è relativo alla radice del progetto nelle due case.
 * Dal lato Windows, `path.resolve('/mnt/c/x')` diventa `C:\mnt\c\x`: le funzioni di percorso di Windows non capiscono Linux.
 *   ⇒ Il kernel tiene la vista WINDOWS per tutto ciò che fa da sé (permessi, segreti, «leggi prima di sostituire», ricevute,
 *   pannello File), e la vista LINUX va soltanto al servente, che esegue.
 */

const UNITA = /^([A-Za-z]):(?:[\\/](.*))?$/u;
const MONTAGGIO = /^\/mnt\/([a-z])(?:\/(.*))?$/u;
const UNC_WSL = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)(?:\\(.*))?$/iu;

/** La vista Windows di un percorso scritto dal modello nella casa Linux. Un percorso già di Windows, o relativo, resta com'è. */
export function vistaWindows(percorso, { distro }) {
  if (typeof percorso !== 'string' || percorso === '' || !percorso.startsWith('/') || percorso.startsWith('//')) return percorso;
  const montaggio = MONTAGGIO.exec(percorso);
  if (montaggio) return `${montaggio[1].toUpperCase()}:\\${(montaggio[2] ?? '').split('/').filter(Boolean).join('\\')}`;
  return `\\\\wsl.localhost\\${distro}\\${percorso.split('/').filter(Boolean).join('\\')}`;
}

/**
 * La vista Linux di un percorso nella vista Windows (o già di Linux, o relativo). `null` = non raggiungibile da Linux
 * (un altro server, un'altra distro): chi chiama lo dice, non lo indovina.
 */
export function vistaLinux(percorso, { distro }) {
  if (typeof percorso !== 'string' || percorso === '') return percorso;
  if (percorso.startsWith('/') && !percorso.startsWith('//')) return percorso;
  const unita = UNITA.exec(percorso);
  if (unita) return `/mnt/${unita[1].toLowerCase()}${unita[2] ? `/${unita[2].split(/[\\/]+/u).filter(Boolean).join('/')}` : ''}`;
  const unc = UNC_WSL.exec(percorso);
  if (unc) return unc[1].toLowerCase() === String(distro).toLowerCase() ? `/${(unc[2] ?? '').split('\\').filter(Boolean).join('/')}` : null;
  if (percorso.startsWith('\\\\')) return null;
  return percorso.split('\\').join('/');
}
