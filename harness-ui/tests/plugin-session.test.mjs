import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { eseguiComandoPlugin, hookIdQualificato, nomeEspostoPlugin, preparaToolPluginPerSessione } from '../src/plugin-session.mjs';

/**
 * ⭐ Stesso principio di mcp-session.test.mjs: mai un registro VERO nei
 * test unitari — caricaPluginFn/verificaTrustPluginFn sono iniettabili
 * (deps), qui finti. eseguiComandoPlugin invece usa `node -e` REALE
 * (stesso principio di eseguiHook in hook-registry.test.mjs: uno
 * spawn vero, deterministico, è più fedele di un mock del child_process).
 */
function pluginFinto(id, { tools = [{ nome: 'conta_righe', descrizione: 'conta le righe', parametri: { type: 'object', properties: {} }, comando: 'echo 3' }], hooks = [], hash = `hash-${id}` } = {}) {
  return { id, nome: id, descrizione: `plugin ${id}`, tools, hooks, hash };
}

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-plugin-session-'));
}

test('⭐ nomeEspostoPlugin: pura, formato plugin__<pluginId>__<toolName>', () => {
  assert.equal(nomeEspostoPlugin('esempio', 'conta_righe'), 'plugin__esempio__conta_righe');
});

test('⭐ hookIdQualificato: pura, formato plugin:<pluginId>:<hookId>', () => {
  assert.equal(hookIdQualificato('esempio', 'blocca-rm'), 'plugin:esempio:blocca-rm');
});

test('⭐⭐⭐ un plugin fidato: toolPlugin col nome prefissato, eseguiToolPluginFn instrada al comando giusto con argomenti veri', async () => {
  const plugin = pluginFinto('esempio');
  const chiamate = [];

  const { toolPlugin, eseguiToolPluginFn, falliti } = await preparaToolPluginPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      caricaPluginFn: async () => ({ plugin: [plugin] }),
      verificaTrustPluginFn: async () => true,
      eseguiComandoPluginFn: async (arg) => { chiamate.push(arg); return '3 righe'; },
    },
  );

  assert.deepEqual(falliti, []);
  assert.equal(toolPlugin.length, 1);
  assert.equal(toolPlugin[0].nome, 'plugin__esempio__conta_righe');
  assert.equal(toolPlugin[0].descrizione, 'conta le righe');

  const esito = await eseguiToolPluginFn('plugin__esempio__conta_righe', { percorso: 'a.txt' });
  assert.deepEqual(chiamate, [{ comando: 'echo 3', argomenti: { percorso: 'a.txt' }, cartella: '/tmp/prova' }]);
  assert.equal(esito, '3 righe');
});

test('⭐⭐ due plugin con un tool OMONIMO: entrambi compaiono, nomi diversi, instradati al comando giusto ciascuno', async () => {
  const alfa = pluginFinto('alfa', { tools: [{ nome: 'esegui', descrizione: 'alfa esegue', parametri: {}, comando: 'echo alfa' }] });
  const beta = pluginFinto('beta', { tools: [{ nome: 'esegui', descrizione: 'beta esegue', parametri: {}, comando: 'echo beta' }] });
  const chiamate = [];

  const { toolPlugin, eseguiToolPluginFn } = await preparaToolPluginPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      caricaPluginFn: async () => ({ plugin: [alfa, beta] }),
      verificaTrustPluginFn: async () => true,
      eseguiComandoPluginFn: async (arg) => { chiamate.push(arg.comando); return `fatto: ${arg.comando}`; },
    },
  );

  const nomi = toolPlugin.map((t) => t.nome);
  assert.deepEqual(nomi, ['plugin__alfa__esegui', 'plugin__beta__esegui']);

  await eseguiToolPluginFn('plugin__alfa__esegui', {});
  await eseguiToolPluginFn('plugin__beta__esegui', {});
  assert.deepEqual(chiamate, ['echo alfa', 'echo beta']);
});

test('⛔⛔⛔ AL CONTRARIO — un plugin NON fidato: zero tool, zero hook, come se non esistesse', async () => {
  const plugin = pluginFinto('non-fidato', { hooks: [{ id: 'blocca-rm', eventi: ['pre_tool_call'], comando: 'echo no' }] });

  const { toolPlugin, eseguiToolPluginFn, hookPlugin } = await preparaToolPluginPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      caricaPluginFn: async () => ({ plugin: [plugin] }),
      verificaTrustPluginFn: async () => false,
    },
  );

  assert.deepEqual(toolPlugin, []);
  assert.equal(eseguiToolPluginFn, null);
  assert.deepEqual(hookPlugin, []);
});

test('⭐⭐⭐ hookPlugin: hook di un plugin fidato compaiono con id QUALIFICATO, un plugin non fidato non ne contribuisce nessuno', async () => {
  const fidato = pluginFinto('fidato', { tools: [], hooks: [{ id: 'blocca-rm', eventi: ['pre_tool_call'], comando: 'echo fidato' }] });
  const nonFidato = pluginFinto('non-fidato', { tools: [], hooks: [{ id: 'blocca-rm', eventi: ['pre_tool_call'], comando: 'echo non fidato' }] });

  const { hookPlugin } = await preparaToolPluginPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      caricaPluginFn: async () => ({ plugin: [fidato, nonFidato] }),
      verificaTrustPluginFn: async ({ pluginId }) => pluginId === 'fidato',
    },
  );

  assert.equal(hookPlugin.length, 1, 'solo il plugin fidato contribuisce hook — stesso id "blocca-rm" del non fidato, mai una collisione silenziosa');
  assert.equal(hookPlugin[0].id, 'plugin:fidato:blocca-rm');
  assert.deepEqual(hookPlugin[0].eventi, ['pre_tool_call']);
  assert.equal(hookPlugin[0].comando, 'echo fidato');
});

test('⭐ AL CONTRARIO — nessun plugin dichiarato: tutto vuoto, mai un errore', async () => {
  const { toolPlugin, eseguiToolPluginFn, hookPlugin, falliti } = await preparaToolPluginPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    { caricaPluginFn: async () => ({ plugin: [] }) },
  );
  assert.deepEqual(toolPlugin, []);
  assert.equal(eseguiToolPluginFn, null);
  assert.deepEqual(hookPlugin, []);
  assert.deepEqual(falliti, []);
});

test('⛔⛔ AL CONTRARIO — caricaPluginFn che LANCIA: degrada a "nessun plugin", mai un blocco della sessione', async () => {
  const { toolPlugin, eseguiToolPluginFn, hookPlugin } = await preparaToolPluginPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    { caricaPluginFn: async () => { throw new Error('disco non raggiungibile') } },
  );
  assert.deepEqual(toolPlugin, []);
  assert.equal(eseguiToolPluginFn, null);
  assert.deepEqual(hookPlugin, []);
});

test('⛔⛔ AL CONTRARIO — un nome NON instradato: eseguiToolPluginFn lancia, mai un tentativo verso un comando a caso', async () => {
  const plugin = pluginFinto('esempio');
  const { eseguiToolPluginFn } = await preparaToolPluginPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    { caricaPluginFn: async () => ({ plugin: [plugin] }), verificaTrustPluginFn: async () => true },
  );
  await assert.rejects(() => eseguiToolPluginFn('plugin__esempio__nome_inventato', {}), /non è fra quelli offerti/);
});

/*
 * eseguiComandoPlugin — spawn VERO (node -e), stesso principio di
 * eseguiHook in hook-registry.test.mjs: uno spawn reale è più fedele
 * di un mock del child_process per questa classe di funzione.
 */
test('⭐⭐⭐ eseguiComandoPlugin: exit 0 — torna lo stdout, TALOS_PLUGIN_TOOL_ARGS porta gli argomenti VERI', async () => {
  const cartella = cartellaVera();
  try {
    const comando = 'node -e "const a = JSON.parse(process.env.TALOS_PLUGIN_TOOL_ARGS); console.log(\'righe:\' + a.percorso)"';
    const esito = await eseguiComandoPlugin({ comando, argomenti: { percorso: 'a.txt' }, cartella });
    assert.equal(esito, 'righe:a.txt');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ eseguiComandoPlugin: exit 0 senza output — stringa onesta, mai una vuota silenziosa', async () => {
  const cartella = cartellaVera();
  try {
    const esito = await eseguiComandoPlugin({ comando: 'node -e "process.exit(0)"', argomenti: {}, cartella });
    assert.equal(esito, '(nessun output)');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — exit non-zero: RISOLVE (mai rigetta) con l\'esito annotato — un comando fallito è un ESITO, non un guasto del canale', async () => {
  const cartella = cartellaVera();
  try {
    const comando = 'node -e "console.error(\'motivo reale\'); process.exit(1)"';
    const esito = await eseguiComandoPlugin({ comando, argomenti: {}, cartella });
    assert.match(esito, /comando terminato con codice 1/);
    assert.match(esito, /motivo reale/);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — un eseguibile non allowlisted viene rifiutato prima dello spawn', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(
      () => eseguiComandoPlugin({ comando: 'un-eseguibile-che-non-esiste-di-sicuro-xyz', argomenti: {}, cartella }),
      (error) => error.code === 'EXECUTABLE_NOT_ALLOWED',
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — un vero guasto di spawn (cwd introvabile): RIGETTA, diventa "plugin tool call failed" nel kernel', async () => {
  await assert.rejects(() => eseguiComandoPlugin({ comando: 'echo hi', argomenti: {}, cartella: 'Z:/questa/cartella/non/esiste/di/sicuro' }));
});
