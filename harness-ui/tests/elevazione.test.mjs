import assert from 'node:assert/strict';
import test from 'node:test';
import { etichettaObbligatoria, rilevaElevazione } from '../src/remoto/elevazione.mjs';

const csv = (sid) => `"BUILTIN\\Utenti","Alias","S-1-5-32-545","Gruppo obbligatorio"\r\n"Etichetta obbligatoria\\Livello obbligatorio alto","Etichetta","${sid}",""\r\n`;

test('elevazione: per SID e mai per nome; High e System sì, Medium no, un errore no; root fuori da Windows', async () => {
  const chiesti = [];
  const run = (sid) => async (file, argomenti) => { chiesti.push(`${file} ${argomenti.join(' ')}`); return csv(sid); };
  assert.equal(await rilevaElevazione({ piattaforma: 'win32', systemRoot: 'C:\\Windows', run: run('S-1-16-12288') }), true);
  assert.equal(await rilevaElevazione({ piattaforma: 'win32', systemRoot: 'C:\\Windows', run: run('S-1-16-16384') }), true);
  assert.equal(await rilevaElevazione({ piattaforma: 'win32', systemRoot: 'C:\\Windows', run: run('S-1-16-8192') }), false);
  assert.equal(await rilevaElevazione({ piattaforma: 'win32', run: async () => { throw new Error('ENOENT'); } }), false);
  assert.match(chiesti[0], /^C:\\Windows[\\/]System32[\\/]whoami\.exe \/groups \/fo csv \/nh$/u);
  assert.equal(etichettaObbligatoria('"Livello obbligatorio alto"'), null, 'il nome tradotto non conta');
  assert.equal(await rilevaElevazione({ piattaforma: 'linux', getuid: () => 0 }), true);
  assert.equal(await rilevaElevazione({ piattaforma: 'linux', getuid: () => 1000 }), false);
});

test('elevazione: un SystemRoot vuoto o relativo non fa cercare whoami nella cartella corrente; un getuid che lancia dice «no»', async () => {
  const chiesti = [];
  const run = async (file) => { chiesti.push(file); return csv('S-1-16-8192'); };
  for (const systemRoot of ['', 'Windows', 'C:Windows', null]) await rilevaElevazione({ piattaforma: 'win32', systemRoot, run });
  assert.deepEqual(chiesti, Array(4).fill('C:\\Windows\\System32\\whoami.exe'), 'sempre un percorso assoluto');
  assert.equal(await rilevaElevazione({ piattaforma: 'linux', getuid: () => { throw new Error('EPERM'); } }), false);
  assert.equal(await rilevaElevazione({ piattaforma: 'darwin', getuid: undefined }), false);
});

test('elevazione: whoami riceve solo SystemRoot, mai l\'ambiente del server', async () => {
  let ambiente = null;
  await rilevaElevazione({ piattaforma: 'win32', systemRoot: 'D:\\Win', run: async (_file, _argomenti, env) => { ambiente = env; return csv('S-1-16-8192'); } });
  assert.deepEqual(ambiente, { SystemRoot: 'D:\\Win' });
});
