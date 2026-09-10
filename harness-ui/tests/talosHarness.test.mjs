import assert from 'node:assert/strict';
import test from 'node:test';

import { ambienteSenzaCredenziali, eUnaCredenziale } from '../src/kernel/talosHarness.mjs';

/*
 * ⛔ File nato il 10/09 per D-10E. Il kernel ha i suoi test altrove (nel repo dell'owner, fuori da
 *   questo checkout): qui stanno le prove che riguardano il CONTRATTO che il desktop usa —
 *   a partire da quali variabili d'ambiente un comando ha il diritto di vedere.
 */

/*
 * ⛔⛔⛔ D-10E — IL PROCESSO DI UN COMANDO NON EREDITA I NOSTRI SEGRETI.
 *
 * Misurato prima: si nascondeva UNA SOLA chiave (`OPENROUTER_API_KEY`), e passavano
 * `TALOS_HARNESS_UI_TOKEN` (il token che protegge tutta la nostra API) e
 * `TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64` (la chiave privata Ed25519 delle ricevute), più `HF_TOKEN`
 * e la chiave della ricerca. Ogni `!comando` li portava dentro il proprio ambiente, dove un `env`
 * basta a leggerli.
 * Ricerca 10/09/2026 (nodejs-security.com «Do not use secrets in environment variables»;
 * GitGuardian; OWASP): «any secret stored in an environment variable of the parent process becomes
 * accessible to ALL of its child processes, regardless of whether they actually need that
 * information» — violazione diretta del minimo privilegio.
 */
test('D-10E: i segreti non entrano nell’ambiente di un comando', () => {
  for (const chiave of [
    'OPENROUTER_API_KEY', 'TALOS_HARNESS_UI_TOKEN', 'TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64',
    'HF_TOKEN', 'BRAVE_SEARCH_API_KEY', 'GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'MY_PASSWORD',
    'npm_config__auth', 'QUALCOSA_API_KEY', 'X_PRIVATE_KEY_B64',
  ]) {
    assert.equal(eUnaCredenziale(chiave), true, `⛔ ${chiave} finirebbe nel processo del comando`);
  }
});

test('⛔ D-10E, AL CONTRARIO: ciò che serve ai comandi continua a passare', () => {
  for (const chiave of [
    'PATH', 'Path', 'PATHEXT', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL',
    'SystemRoot', 'WINDIR', 'COMSPEC', 'NODE_ENV', 'npm_config_registry',
    /* ⛔ Le eccezioni dichiarate: contengono «AUTH» ma non sono segreti, e senza di loro
       `git push` e le firme smettono di funzionare dentro un comando. */
    'SSH_AUTH_SOCK', 'GPG_AGENT_INFO',
  ]) {
    assert.equal(eUnaCredenziale(chiave), false, `⛔ ${chiave} serve ai comandi e non deve sparire`);
  }
});

test('D-10E: l’ambiente costruito non contiene NESSUNA chiave che somigli a un segreto', () => {
  const vero = process.env;
  process.env = {
    PATH: vero.PATH, HOME: '/tmp', TALOS_HARNESS_UI_TOKEN: 'x'.repeat(64),
    TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64: 'y'.repeat(88), OPENROUTER_API_KEY: 'z'.repeat(64),
  };
  const ambiente = ambienteSenzaCredenziali();
  process.env = vero;
  assert.deepEqual(Object.keys(ambiente).sort(), ['HOME', 'PATH'], '⛔ passano solo le due neutre');
  /* ⛔ E il valore non resta neppure come stringa vuota: la chiave non c'è proprio. */
  assert.equal('TALOS_HARNESS_UI_TOKEN' in ambiente, false);
});
