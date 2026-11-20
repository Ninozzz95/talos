/*
 * 0.2.4, block 1, round 2, item C (reviewer YELLOW 3, noise, decision 375): five names hold a COMMAND or a PATH, not the secret, and were
 * readable in 0.2.3: `token_command`, `password_command`, `secret_mount`, `credentials_json`, `cookie_jar`. Only these exact pairs come back;
 * the words alone stay secret, and a secret written INSIDE their value is still masked by the shapes. Fake secrets only.
 * Red on 4481fea30: all five are «[redacted]» as fields and in text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campoSegreto, oscuraFormeDiSegreto, oscuraPerStruttura, SEGRETO_OSCURATO } from '../src/forme-di-segreto.mjs';

const CASI = [
  ['token_command', 'gh auth token'], ['password_command', 'pass show db'], ['secret_mount', '/run/secrets'],
  ['credentials_json', 'C:/keys/sa.json'], ['cookie_jar', '/tmp/cookies.txt'],
];

test('B1-RUMORE-02: the five names that hold a command or a path are readable again, as fields and in text', () => {
  for (const [nome, valore] of CASI) {
    assert.deepEqual(oscuraPerStruttura({ [nome]: valore }), { [nome]: valore }, nome);
    assert.equal(campoSegreto(nome, valore), false, nome);
    assert.equal(oscuraFormeDiSegreto(`${nome}=${valore} && ls`), `${nome}=${valore} && ls`, `${nome} in text`);
    assert.equal(oscuraFormeDiSegreto(`"${nome}": "${valore}"`), `"${nome}": "${valore}"`, `${nome} as JSON in text`);
    const cammello = nome.replace(/_([a-z])/gu, (_, c) => c.toUpperCase()).replace(/^[a-z]/u, (c) => c.toUpperCase());
    assert.equal(campoSegreto(cammello, valore), false, cammello);
  }
  /* as for the data words: a secret word on the LEFT of the pair is about the same command (`client_secret_token_command`) */
  assert.equal(campoSegreto('client_secret_token_command', 'vault read -field=token x'), false);
});

test('B1-RUMORE-03: only those exact pairs: the secret words alone and other pairs stay masked, and a secret inside the value is masked', () => {
  for (const nome of ['token', 'password', 'secret', 'credentials', 'cookie', 'secret_json', 'token_mount', 'cookie_command', 'password_jar',
    'command_token', 'mount_secret', 'json_credentials', 'jar_cookie', 'token_command_password', 'secret_mount_token', 'db_password_command_2_secret']) {
    assert.equal(campoSegreto(nome, 'FINTO-valore-q7Zt3Xw9'), true, nome);
  }
  const chiave = 'sk-proj-' + 'FINTO0a1b2c3d4e5f6g7h8i9j0k1l2';
  const visto = JSON.stringify(oscuraPerStruttura({ token_command: `echo ${chiave}`, credentials_json: { private_key: 'FINTO-pk-q7Zt3Xw9' } }));
  assert.ok(!visto.includes('FINTO'), visto);
  assert.ok(visto.includes(SEGRETO_OSCURATO));
});
