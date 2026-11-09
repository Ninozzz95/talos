/*
 * The server half of «the PC does not go to sleep while TALOS works» (01/11/2026, form with the OK of the Desktop). It looks every
 * `ogniMs` at how many turns are working (and whether the local engine is opening) and, applying the person's mode, says
 * `{ tipo: 'sveglio', acceso }` to the shell on the IPC channel only when the answer changes. The shell holds the one blocker
 * (`desktop/pc-sveglio.mjs`). Without a shell (server alone, 4174, phone bridge) `manda` is null and nothing happens.
 *
 * Modes, like Hermes desktop (`power-save.ts:62-71`): 'mai', 'mentre-lavora' (default), 'sempre'. A look every 15 s is enough:
 * Windows puts an idle PC to sleep after minutes, never seconds.
 */

export const MODI = Object.freeze(['mai', 'mentre-lavora', 'sempre']);
export const MODO_DI_SERIE = 'mentre-lavora';

export function modoValido(valore) { return MODI.includes(valore) ? valore : MODO_DI_SERIE; }

/**
 * @param {{ giriAlLavoro: () => number, motoreInApertura?: () => boolean, modo?: () => string, manda: ((m:object)=>void)|null,
 *   ogniMs?: number, ripeti?: typeof setInterval, smetti?: typeof clearInterval }} opzioni
 */
export function creaAvvisoSveglio({ giriAlLavoro, motoreInApertura = () => false, modo = () => MODO_DI_SERIE, manda, ogniMs = 15_000, ripeti = setInterval, smetti = clearInterval }) {
  let detto = null;
  let timer = null;

  function voluto() {
    const m = modoValido(modo());
    if (m === 'mai') return false;
    if (m === 'sempre') return true;
    let giri = 0;
    try { giri = Number(giriAlLavoro()) || 0; } catch { giri = 0; }
    let apre = false;
    try { apre = motoreInApertura() === true; } catch { apre = false; }
    return giri > 0 || apre;
  }

  function guarda() {
    if (typeof manda !== 'function') return detto;
    const acceso = voluto();
    if (acceso === detto) return detto;
    try { manda({ tipo: 'sveglio', acceso }); detto = acceso; } catch { /* the shell went away: say it again at the next look */ }
    return detto;
  }

  return {
    guarda,
    avvia() { if (timer || typeof manda !== 'function') return; guarda(); timer = ripeti(guarda, ogniMs); timer?.unref?.(); },
    ferma() {
      if (timer) smetti(timer);
      timer = null;
      if (detto === true && typeof manda === 'function') { try { manda({ tipo: 'sveglio', acceso: false }); } catch { /* gone */ } }
      detto = null;
    },
  };
}
