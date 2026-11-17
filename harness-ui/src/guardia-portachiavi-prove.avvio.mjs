/*
 * P045 (11/11/2026, judge v1407 condition 3) — the EFFECT of `guardia-portachiavi-prove.mjs`: imported ONLY by `server.mjs`, third
 * (after the program-search defence and the default kernel), so the ancestry read runs in parallel with the evaluation of every
 * other module and only the first keychain access waits for it. Cura dell'avvio (owner 11/11 09:04): the desktop shell also
 * PRELOADS it (`desktop/runtime.mjs`, `--import` after the bootstrap), so the read starts before the server's module graph is even
 * loaded — the ~0.9-1.5 s of loading hide it. Same URL, same module: the server's own import finds it already run, one read only.
 * It starts only when the server will open the system keychain
 * (no `memoria`, no `modulo:`) and no environment mark already decides: a test server on `memoria` and a marked run pay nothing.
 * Last round (owner 11/11 10:42): only in the MAIN thread. `--import` also runs in every Worker of the server
 * (`kernel/cancello-in-worker.mjs`, `process-output-store.mjs`; Node docs, measured by the controller 11/11): each one started a
 * cscript read of its own that nobody waits for. A Worker that opens the keychain itself still reads, at its first access.
 */
import { isMainThread } from 'node:worker_threads';
import { avviaLetturaAntenati, segnoNellAmbiente } from './guardia-portachiavi-prove.mjs';

/** Pure: whether this thread starts the read now. */
export function deveLeggereGliAntenati({ env = process.env, principale = isMainThread } = {}) {
  const scelta = String(env.TALOS_HARNESS_UI_KEYRING ?? '').trim();
  return principale === true && scelta === '' && !segnoNellAmbiente(env);
}
export const LETTURA_ANTENATI_AVVIATA = deveLeggereGliAntenati();
if (LETTURA_ANTENATI_AVVIATA) void avviaLetturaAntenati();
