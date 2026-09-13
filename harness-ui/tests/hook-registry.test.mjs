import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  caricaHooks,
  eseguiHook,
  fidaHook,
  HookRegistryError,
  verificaTrust,
} from '../src/hook-registry.mjs';

// ⭐ Stesso principio di workspace-files.test.mjs: cartelle VERE su
// disco, nessun mock del filesystem per la logica base.
function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-hooks-'));
}

test('⭐⭐⭐ caricaHooks: nessun file hooks.json — {hooks:[]}, mai un errore', async () => {
  const cartella = cartellaVera();
  try {
    const { hooks } = await caricaHooks({ cartella });
    assert.deepEqual(hooks, []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ caricaHooks: un file valido, hash calcolato dal comando VERO', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-hooks.json'), JSON.stringify({
      hooks: [{ id: 'audit', eventi: ['pre_tool_call'], comando: 'echo ciao' }],
    }));
    const { hooks } = await caricaHooks({ cartella });
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].id, 'audit');
    assert.deepEqual(hooks[0].eventi, ['pre_tool_call']);
    assert.equal(hooks[0].comando, 'echo ciao');
    assert.equal(typeof hooks[0].hash, 'string');
    assert.equal(hooks[0].hash.length, 64, 'sha256 esadecimale');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ caricaHooks: due hook diversi (comandi diversi) hanno hash DIVERSI — AL CONTRARIO, stesso comando stesso hash', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-hooks.json'), JSON.stringify({
      hooks: [
        { id: 'uno', eventi: ['pre_tool_call'], comando: 'echo uno' },
        { id: 'due', eventi: ['post_tool_call'], comando: 'echo due' },
        { id: 'tre', eventi: ['pre_tool_call'], comando: 'echo uno' },
      ],
    }));
    const { hooks } = await caricaHooks({ cartella });
    assert.notEqual(hooks[0].hash, hooks[1].hash);
    assert.equal(hooks[0].hash, hooks[2].hash, 'stesso comando testuale ⇒ stesso hash, indipendentemente dall\'id');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ caricaHooks: AL CONTRARIO, un JSON malformato è un HookRegistryError dichiarato, mai un hook fantasma ignorato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-hooks.json'), '{ non e json valido');
    await assert.rejects(
      caricaHooks({ cartella }),
      (e) => { assert.ok(e instanceof HookRegistryError); assert.equal(e.code, 'HOOK_MALFORMED'); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ caricaHooks: AL CONTRARIO, "hooks" mancante o non-array è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-hooks.json'), JSON.stringify({ hooks: 'non-un-array' }));
    await assert.rejects(
      caricaHooks({ cartella }),
      (e) => { assert.equal(e.code, 'HOOK_MALFORMED'); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ caricaHooks: AL CONTRARIO, un hook senza "eventi" validi è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-hooks.json'), JSON.stringify({
      hooks: [{ id: 'x', eventi: ['evento_inventato'], comando: 'echo x' }],
    }));
    await assert.rejects(
      caricaHooks({ cartella }),
      (e) => { assert.equal(e.code, 'HOOK_MALFORMED'); assert.match(e.message, /"x"/); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ caricaHooks: AL CONTRARIO, un hook senza "comando" è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-hooks.json'), JSON.stringify({
      hooks: [{ id: 'x', eventi: ['pre_tool_call'] }],
    }));
    await assert.rejects(caricaHooks({ cartella }), (e) => e.code === 'HOOK_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ verificaTrust: nessun trust registrato — false, mai fidato per default', async () => {
  const cartellaTrust = cartellaVera();
  try {
    const fidato = await verificaTrust({ cartellaTrust, hookId: 'audit', hash: 'abc123' });
    assert.equal(fidato, false);
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ fidaHook poi verificaTrust: lo stesso hash torna VERAMENTE fidato', async () => {
  const cartellaTrust = cartellaVera();
  try {
    await fidaHook({ cartellaTrust, hookId: 'audit', hash: 'abc123' });
    assert.equal(existsSync(join(cartellaTrust, 'audit.json')), true, 'il trust è scritto DAVVERO sul disco');
    const fidato = await verificaTrust({ cartellaTrust, hookId: 'audit', hash: 'abc123' });
    assert.equal(fidato, true);
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — un hook fidato il cui CONTENUTO cambia (hash diverso) torna automaticamente NON fidato', async () => {
  const cartellaTrust = cartellaVera();
  try {
    await fidaHook({ cartellaTrust, hookId: 'audit', hash: 'hash-vecchio' });
    const fidatoConHashNuovo = await verificaTrust({ cartellaTrust, hookId: 'audit', hash: 'hash-nuovo-diverso' });
    assert.equal(fidatoConHashNuovo, false, 'il trust è legato al CONTENUTO, non al nome — un hook modificato deve essere ri-fidato');
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — un hookId con traversal ("..") è rifiutato, mai un percorso fuori dalla cartella di trust', async () => {
  const cartellaTrust = cartellaVera();
  try {
    await assert.rejects(
      fidaHook({ cartellaTrust, hookId: '../fuori', hash: 'x' }),
      (e) => { assert.ok(e instanceof HookRegistryError); return true; },
    );
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ eseguiHook: stdout JSON {consentito:false,motivo} — l\'esito del programma vince sul solo exit code', async () => {
  const cartella = cartellaVera();
  try {
    const hook = { comando: 'node -e "console.log(JSON.stringify({consentito:false,motivo:\'bloccato dal test\'}))"' };
    const esito = await eseguiHook({ hook, evento: { tipo: 'pre_tool_call' }, cartella });
    assert.equal(esito.consentito, false);
    assert.equal(esito.motivo, 'bloccato dal test');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ eseguiHook: exit 0 senza output JSON — consentito:true per default', async () => {
  const cartella = cartellaVera();
  try {
    const hook = { comando: 'node -e "process.exit(0)"' };
    const esito = await eseguiHook({ hook, evento: { tipo: 'post_tool_call' }, cartella });
    assert.equal(esito.consentito, true);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — exit diverso da zero senza JSON — consentito:false, il motivo porta lo stderr reale', async () => {
  const cartella = cartellaVera();
  try {
    const hook = { comando: 'node -e "console.error(\'motivo reale\'); process.exit(1)"' };
    const esito = await eseguiHook({ hook, evento: { tipo: 'pre_tool_call' }, cartella });
    assert.equal(esito.consentito, false);
    assert.match(esito.motivo, /motivo reale/);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ eseguiHook: TALOS_HOOK_EVENT porta l\'evento VERO come JSON nell\'ambiente del processo', async () => {
  const cartella = cartellaVera();
  try {
    const hook = { comando: 'node -e "const e = JSON.parse(process.env.TALOS_HOOK_EVENT); console.log(JSON.stringify({consentito:true, motivo: e.azione}))"' };
    const esito = await eseguiHook({ hook, evento: { tipo: 'pre_tool_call', azione: 'scrivi' }, cartella });
    assert.equal(esito.motivo, 'scrivi', 'il processo hook ha davvero ricevuto l\'evento, non un valore a caso');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
