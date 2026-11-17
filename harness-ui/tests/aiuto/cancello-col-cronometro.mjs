/*
 * Settimo giro dei permessi (13/11/2026): il cancello intero in un WORKER, col cronometro. Il cancello è sincrono: un comando che lo
 * tiene occupato per secondi ferma il server di TALOS. La prova lo misura qui dentro e, se non risponde entro il tetto esterno, il
 * worker si termina (la prova è rossa, il processo delle prove non resta appeso).
 * Messaggi: { id, sistema: { piattaforma, cartella, home }, comando, livelloAccesso } → { id, ms, msFunzione, critiche, perche }.
 * `process.platform` finto solo dentro questo worker e rimesso dopo ogni comando. Niente viene eseguito: la carta risponde «no».
 */
import { parentPort } from 'node:worker_threads';

const { verificaPermessoScrittura } = await import('../../src/kernel/talosHarness.mjs');
const { cancellazioneCritica } = await import('../../src/kernel/cancellazioni-critiche.mjs');

const DESCRITTORE = Object.getOwnPropertyDescriptor(process, 'platform');

parentPort.on('message', async ({ id, sistema, comando, livelloAccesso }) => {
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const chieste = [];
  let ms = null;
  let msFunzione = null;
  let perche = null;
  let errore = null;
  process.env.USERPROFILE = sistema.home;
  process.env.HOME = sistema.home;
  if (sistema.piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...DESCRITTORE, value: sistema.piattaforma });
  try {
    const t0 = performance.now();
    const r = cancellazioneCritica(comando, { cartella: sistema.cartella, home: sistema.home, piattaforma: sistema.piattaforma, ambiente: { HOME: sistema.home }, realpathFn: (p) => p })
    msFunzione = performance.now() - t0;
    perche = r?.perche ?? null;
    const t1 = performance.now();
    await verificaPermessoScrittura({ toolCallId: 'tetto7', tipo: 'shell', comando }, {
      livelloAccesso, cartella: sistema.cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' },
      chiediApprovazioneFn: async (x) => { chieste.push(x); return false; },
    });
    ms = performance.now() - t1;
  } catch (e) {
    errore = String(e?.message ?? e).slice(0, 200);
  } finally {
    Object.defineProperty(process, 'platform', DESCRITTORE);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  parentPort.postMessage({ id, ms, msFunzione, perche, errore, critiche: chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche) });
});
parentPort.postMessage({ pronto: true });
