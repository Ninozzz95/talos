/*
 * 11/11/2026, round 4 (controller of round 3, «medium»): three launches handed the WHOLE runner environment, provider keys included,
 * to a child that needs none of them (`ci-smoke.test.mjs` and `workflow.test.mjs` to PowerShell and git, `scripts/prova-pty.mjs`
 * to Electron and to the PTY). The one copy they use now: every name that looks like a secret is dropped, in any case, also the
 * ones without KEY/TOKEN/SECRET/PASSWORD the controller saw passing (`GOOGLE_APPLICATION_CREDENTIALS`, `OPENROUTER_PAT`,
 * `AZURE_OPENAI_AD_CREDENTIAL`). Pure: no hook, no file, so a script outside the tests can import it too.
 * Last piece (owner 11/11 09:41, «segno obbligatorio nelle prove»): the copy also carries the explicit test mark the product guard
 * reads (`src/guardia-portachiavi-prove.mjs`), so a child rebuilt by this helper is a marked test child even when the guard's
 * ancestry read times out on a saturated machine.
 */
export const NOMI_DA_SEGRETO = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|(^|_)PAT$/i;

/** A copy of `env` without any secret-looking name (`PATH` stays: only a name ending in `_PAT` or equal to `PAT` goes). */
export function ambienteSenzaChiavi(env = process.env) {
  const copia = Object.fromEntries(Object.entries(env ?? {}).filter(([k]) => !NOMI_DA_SEGRETO.test(k)));
  if (!Object.keys(copia).some(k => k.toUpperCase() === 'TALOS_PROVA_ISOLATA')) copia.TALOS_PROVA_ISOLATA = '1';
  return copia;
}
