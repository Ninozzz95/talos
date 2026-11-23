/*
 * Round (k), 11/11/2026 (owner «aggancio in OGNI node --test», judge v1456-v1459) — THE NAMED REAL-USER EXEMPTIONS of the keyring hook.
 *
 * Once every `node --test` preloads `gancio-portachiavi.mjs`, every child of a test is marked (TALOS_PROVA_ISOLATA, the hook itself).
 * A few tests exist to prove what the product guard does for a REAL USER (`tests/guardia-portachiavi-prove.test.mjs`): their child
 * must look like a person, with no mark of any kind. They ask for it BY NAME, one test at a time, here; the hook (`ambienteColGancio`)
 * then hands that child no mark, but still its trip wire (the real keyring cannot load in it), and marks the child's own children
 * again. A name that is not on this list does not start (`TALOS_GANCIO_RIFIUTATO`). A new exemption is a decision: it is written
 * here with its reason, and in `lettore-della-traccia.test.mjs` (SHELL-KEYRING-NAMED-EXEMPTIONS).
 * No side effect on import: the server tests import this file without loading the hook.
 * Precedent: Hermes keeps one explicit allowlist of the variables its hermetic test run lets through, «no HERMES_TEST_* glob»
 * (`scripts/run_tests.sh:207-215`), so a new one is a visible change.
 */
export const VARIABILE_UTENTE_VERO = 'TALOS_PROVA_UTENTE_VERO';
/** Where the exempt child writes its trace: not `TALOS_PROVA_GANCIO_REGISTRO`, which the product reads as a mark. */
export const VARIABILE_REGISTRO_UTENTE_VERO = 'TALOS_PROVA_UTENTE_VERO_REGISTRO';
export const ESENZIONI_UTENTE_VERO = Object.freeze({
  'P045-15': 'the preload starts the ancestry read in a real user\'s server, and the main module finds it: no mark may stop it',
  'P045-16': 'a module load that holds the thread, then the first keychain access of a real user: the injected read must be the one used',
  'P045-17': 'a read that never ends: a real user gets «no mark» about 1 s after the first access, so no mark may answer first',
  'P045-18': 'one read per real-user start, in the main thread only: the cscript launches are counted, a mark would read nothing',
  'P045-21': 'the real Windows reader under a held thread, for a real user: the read must run and see the test runner above it',
});
/** The names that mark a test run for the product guard (`src/guardia-portachiavi-prove.mjs`, NOMI_DEL_SEGNO) and the hook's own. */
const SEGNI = /^(TALOS_PROVA_ISOLATA|TALOS_PROVA_GANCIO_REGISTRO|NODE_TEST_CONTEXT|NODE_TEST_WORKER_ID)$/i;

/** The name of the exemption an env asks for: undefined when it asks for none, the raw value otherwise (checked by the caller). */
export function esenzioneChiesta(env) {
  const chiave = Object.keys(env ?? {}).find(k => k.toUpperCase() === VARIABILE_UTENTE_VERO);
  return chiave === undefined ? undefined : String(env[chiave]);
}
export const esenzioneNominata = nome => typeof nome === 'string' && Object.hasOwn(ESENZIONI_UTENTE_VERO, nome);

/** A copy of `env` with no test mark at all and none of the hook's variables (NODE_OPTIONS, the trace, an earlier exemption). */
export function senzaSegni(env) {
  const copia = {};
  for (const [k, v] of Object.entries(env ?? {})) {
    const K = k.toUpperCase();
    if (SEGNI.test(K) || K === 'NODE_OPTIONS' || K === VARIABILE_UTENTE_VERO || K === VARIABILE_REGISTRO_UTENTE_VERO) continue;
    copia[k] = v;
  }
  return copia;
}

/**
 * For the real-user controls: the env of a person as far as the product guard can tell (no mark, no memoria, no NODE_OPTIONS), plus
 * the exemption's name. Under the hook the child keeps the trip wire; without it (a `node --test` typed by hand) the name is inert.
 */
export function ambienteDaUtenteVero(nome, env = process.env, extra = {}) {
  if (!esenzioneNominata(nome)) throw new Error('TALOS-GANCIO-PORTACHIAVI: «' + nome + '» is not a named real-user exemption (esenzioni-utente-vero.mjs).');
  const copia = senzaSegni(env);
  for (const k of Object.keys(copia)) if (k.toUpperCase() === 'TALOS_HARNESS_UI_KEYRING') delete copia[k];
  return { ...copia, ...extra, [VARIABILE_UTENTE_VERO]: nome };
}
