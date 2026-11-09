/*
 * The PC does not go to sleep while TALOS works (01/11/2026, form `TALOS/motore-locale/in-corso/FORMA-PC-SVEGLIO-E-SCHEDA-LENTA-2026-11-01.md`,
 * OK of the Desktop with its conditions). Same shape as Hermes desktop (`apps/desktop/electron/power-save.ts`): ONE Electron
 * `powerSaveBlocker` of type `prevent-app-suspension`, so the screen still turns off. The server decides (it counts the turns and
 * applies the person's mode) and says `{ tipo: 'sveglio', acceso }` on the IPC channel; the shell only obeys.
 *
 * Desktop's conditions: taken at the first «acceso», released at the last «spento», and also when the server dies or the app quits; a
 * message that does not come from the server child is ignored. No Node or Electron imports: the blocker is injected (tests count it).
 */

export const TIPO_BLOCCO = 'prevent-app-suspension';

/** @param {{ blocker: { start(tipo:string):number, stop(id:number):void, isStarted(id:number):boolean }, registro?: (riga:string)=>void }} opzioni */
export function creaPcSveglio({ blocker, registro = () => {} } = {}) {
  let id = null;
  let figlio = null; // the only process whose messages count

  const attivo = () => id !== null && blocker.isStarted(id);
  function imposta(acceso) {
    if (acceso && !attivo()) {
      try { id = blocker.start(TIPO_BLOCCO); registro('PC sveglio: acceso.'); } catch { id = null; registro('PC sveglio: il blocco non si accende.'); }
    } else if (!acceso && id !== null) {
      try { if (blocker.isStarted(id)) blocker.stop(id); } catch { /* already gone */ }
      id = null;
      registro('PC sveglio: spento.');
    }
    return attivo();
  }

  return {
    attivo,
    /** A new server child: from now on only its messages count. The old one's blocker, if any, goes. */
    nuovoFiglio(proc) { if (figlio !== proc) imposta(false); figlio = proc; },
    /** `proc.on('message')`: only `{ tipo: 'sveglio', acceso: boolean }` from the current child. */
    messaggio(da, messaggio) {
      if (!da || da !== figlio || messaggio?.tipo !== 'sveglio' || typeof messaggio.acceso !== 'boolean') return false;
      imposta(messaggio.acceso);
      return true;
    },
    /** The server exited or failed: nobody can say «spento» any more, so it is released now. */
    figlioUscito(proc) { if (proc === figlio) { figlio = null; imposta(false); } },
    /** The app quits. */
    chiudi() { figlio = null; imposta(false); },
  };
}
