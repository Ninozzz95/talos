/*
 * «One line», step 3 (11/11/2026, judge v1499 point 1): which keyring trip wire the terminal's test commands load, and how.
 *
 * The trip wire is the desktop's own file (`harness-ui/desktop/tests/gancio-portachiavi.mjs`, branch k `a47b37a9b`; copied again 12/11/2026 from k's last version, D3 (a), judge v1605). While k is
 * not on the line, the terminal carries a byte-identical COPY beside this file, never edited here: `test/build/keyring-hook.test.ts`
 * reds when the copy's sha256 differs from k's. The day k enters the line, `gancioInUso()` picks the line's file by itself and the
 * same test reds until the copy matches it (the copy is then dropped by whoever merges k).
 *
 * The terminal's own runner (`run-tests.mjs`) also loads `finti-portachiavi.mjs`: nineteen tests build a FAKE `@napi-rs/keyring`
 * in their temporary folder to prove where the product looks for it, and the trip wire refuses every keyring by name. The
 * exemption lets through only a fake that lies inside the run's private temp folder (`talos-cli-test-run-*`); the real package,
 * any `.node` file and any keyring outside that folder still meet the trip wire.
 * No side effect on import: the runners read the paths from here.
 * Precedent: Hermes runs every test under one wrapper that sets the hermetic environment for all of them (`scripts/run_tests.sh:207-215`).
 */
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const qui = dirname(fileURLToPath(import.meta.url));
export const RADICE_CLI = join(qui, '..', '..');
export const RADICE_LINEA = join(RADICE_CLI, '..');
/** The copy carried by the terminal until branch k is on the line. */
export const GANCIO_COPIA = join(qui, 'gancio-portachiavi.mjs');
/** The desktop's file, once branch k is on the line. */
export const GANCIO_DELLA_LINEA = join(RADICE_LINEA, 'harness-ui', 'desktop', 'tests', 'gancio-portachiavi.mjs');
export const ESENZIONE_FINTI = join(qui, 'finti-portachiavi.mjs');
/** sha256 of `harness-ui/desktop/tests/gancio-portachiavi.mjs` and `esenzioni-utente-vero.mjs` at k `a47b37a9b` (the trip wire was 1f0686cb… at 0cf0f34d3; the exemptions did not change). */
export const IMPRONTE_DI_K = Object.freeze({
  'gancio-portachiavi.mjs': '8bea5fefe0813f80f94579afc46169add3bfd69a4165a8c757999ded5c5b6df8',
  'esenzioni-utente-vero.mjs': 'e79c9b85098af5a489b8df6c43b3122c27e2d3123c77e9a851086c0047ace3b7',
});
/** The folder whose fakes the exemption lets through: set by `run-tests.mjs` to the run's private temp. */
export const VARIABILE_FINTI = 'TALOS_PROVA_FINTI_PORTACHIAVI';
/** Only a run's private temp may hold the fakes (`run-tests.mjs`, `mkdtempSync(... 'talos-cli-test-run-')`). */
export const PREFISSO_CARTELLA_FINTI = 'talos-cli-test-run-';
/** The trace of every blocked load during a terminal test run (`.prove/` is ignored by git). */
export const REGISTRO_DEL_TERMINALE = join(RADICE_CLI, '.prove', 'gancio-portachiavi.jsonl');

/**
 * Judge v1534 (11/11/2026, evening): the trip wire is DETACHED from `run-tests.mjs` and `kernel-tests.mjs` until branch k is green
 * (on k's own Linux CI the wire refused 293 child starts, «the hook cannot be handed to this child (unknown)»). The runners keep
 * calling `ambienteConGancio`; while this is false it hands their env back untouched. Reattaching is one commit: this line to true.
 * The copy, its fingerprints and the exemption stay, and `test/build/keyring-hook.test.ts` keeps proving them in a child that is
 * given the wire explicitly.
 */
export const GANCIO_ATTACCATO = false;

/** The trip wire the test commands load: the line's file once k has entered, the copy until then. */
export function gancioInUso() {
  return existsSync(GANCIO_DELLA_LINEA) ? GANCIO_DELLA_LINEA : GANCIO_COPIA;
}

/** `--import=` options for NODE_OPTIONS: the trip wire first, then (only for `cli/test`) the exemption of the fakes. */
export function opzioniDelGancio({finti = false} = {}) {
  const opzioni = ['--import=' + pathToFileURL(gancioInUso()).href];
  if (finti) opzioni.push('--import=' + pathToFileURL(ESENZIONE_FINTI).href);
  return opzioni;
}

/** A copy of `env` whose NODE_OPTIONS carries the options above (one spelling of the name, earlier options kept). */
export function ambienteConGancio(env, {finti = false, cartellaFinti, registro = REGISTRO_DEL_TERMINALE, attaccato = GANCIO_ATTACCATO} = {}) {
  if (!attaccato) return {...(env ?? {})};
  const copia = {};
  const prima = [];
  for (const [k, v] of Object.entries(env ?? {})) {
    if (k.toUpperCase() === 'NODE_OPTIONS') { if (typeof v === 'string' && v.trim()) prima.push(v.trim()); }
    else if (k.toUpperCase() !== VARIABILE_FINTI) copia[k] = v;
  }
  copia.NODE_OPTIONS = [...prima, ...opzioniDelGancio({finti})].join(' ');
  if (!Object.keys(copia).some(k => k.toUpperCase() === 'TALOS_PROVA_GANCIO_REGISTRO')) copia.TALOS_PROVA_GANCIO_REGISTRO = registro;
  if (finti) {
    if (!cartellaFinti) throw new Error('the fakes exemption needs the run\'s private temp folder');
    copia[VARIABILE_FINTI] = cartellaFinti;
  }
  return copia;
}
