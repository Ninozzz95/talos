/**
 * Accesso locale minimale al filesystem di un workspace.
 *
 * Questo adapter sostituisce l'import da repository esterni usato in
 * precedenza dall'albero file. Conosce soltanto l'elenco di un livello:
 * nessuna ricorsione, nessun comando di sistema e nessuna trasformazione del
 * contenuto. Le policy di percorso restano esplicite e verificabili qui.
 */
import { readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export class WorkspaceDiskError extends Error {
  constructor(message, code = 'DIRECTORY_UNREADABLE') {
    super(message);
    this.name = 'WorkspaceDiskError';
    this.code = code;
  }
}

function percorsoRelativoValido(percorso) {
  return typeof percorso === 'string'
    && !percorso.includes('\0')
    && !isAbsolute(percorso);
}

function dentroRadice(radice, candidato) {
  const differenza = relative(radice, candidato);
  return differenza === ''
    || (differenza !== '..' && !differenza.startsWith(`..${sep}`) && !isAbsolute(differenza));
}

/**
 * @param {{rootDir?:string, root?:string, fsImpl?:{readdir?:typeof readdir}, readdirFn?:typeof readdir}} input
 * @returns {{elenca:(percorso?:string)=>Promise<Array<{nome:string, cartella:boolean}>>}}
 */
export function createWorkspaceDisk({ rootDir, root = rootDir, fsImpl = {}, readdirFn = fsImpl.readdir ?? readdir } = {}) {
  if (typeof root !== 'string' || root.length === 0 || root.includes('\0') || !isAbsolute(root)) {
    throw new WorkspaceDiskError('Cartella workspace non valida', 'QUERY_INVALID');
  }

  const radice = resolve(root);
  return {
    async elenca(percorso = '') {
      if (!percorsoRelativoValido(percorso)) {
        throw new WorkspaceDiskError('Percorso non valido', 'QUERY_INVALID');
      }
      const candidato = resolve(radice, percorso);
      if (!dentroRadice(radice, candidato)) {
        throw new WorkspaceDiskError('Percorso fuori dalla cartella della sessione', 'QUERY_INVALID');
      }
      let voci;
      try {
        voci = await readdirFn(candidato, { withFileTypes: true });
      } catch {
        throw new WorkspaceDiskError('Cartella non leggibile');
      }
      return voci
        .map((voce) => ({ nome: voce.name, cartella: voce.isDirectory() }))
        .sort((a, b) => (a.cartella === b.cartella ? a.nome.localeCompare(b.nome, 'en') : a.cartella ? -1 : 1));
    },
  };
}
