import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  caricaServerMcp,
  fidaServerMcp,
  McpRegistryError,
  serverMcpFidati,
  verificaTrustMcp,
} from '../src/mcp-registry.mjs';

// ⭐ Stesso principio di hook-registry.test.mjs: cartelle VERE su
// disco, nessun mock del filesystem per la logica base.
function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-mcp-registry-'));
}

test('⭐⭐⭐ caricaServerMcp: nessun file .harness-ui-mcp.json — {server:[]}, mai un errore', async () => {
  const cartella = cartellaVera();
  try {
    const { server } = await caricaServerMcp({ cartella });
    assert.deepEqual(server, []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ caricaServerMcp: un server valido, hash calcolato dalla dichiarazione VERA', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [{ id: 'filesystem', comando: 'npx', argomenti: ['-y', '@modelcontextprotocol/server-filesystem', '.'], allowlist: ['read_file'] }],
    }));
    const { server } = await caricaServerMcp({ cartella });
    assert.equal(server.length, 1);
    assert.equal(server[0].id, 'filesystem');
    assert.equal(server[0].comando, 'npx');
    assert.deepEqual(server[0].argomenti, ['-y', '@modelcontextprotocol/server-filesystem', '.']);
    assert.deepEqual(server[0].allowlist, ['read_file']);
    assert.equal(typeof server[0].hash, 'string');
    assert.equal(server[0].hash.length, 64, 'sha256 esadecimale');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ caricaServerMcp: "argomenti" assente diventa un array vuoto, mai undefined', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [{ id: 'minimo', comando: 'echo', allowlist: ['x'] }],
    }));
    const { server } = await caricaServerMcp({ cartella });
    assert.deepEqual(server[0].argomenti, []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ caricaServerMcp: due server con allowlist DIVERSA hanno hash DIVERSI — AL CONTRARIO, stessa dichiarazione stesso hash', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [
        { id: 'uno', comando: 'npx', argomenti: ['a'], allowlist: ['read_file'] },
        { id: 'due', comando: 'npx', argomenti: ['a'], allowlist: ['write_file'] },
        { id: 'tre', comando: 'npx', argomenti: ['a'], allowlist: ['read_file'] },
      ],
    }));
    const { server } = await caricaServerMcp({ cartella });
    assert.notEqual(server[0].hash, server[1].hash);
    assert.equal(server[0].hash, server[2].hash, 'stessa dichiarazione ⇒ stesso hash, indipendentemente dall\'id');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — caricaServerMcp: un JSON malformato è un McpRegistryError dichiarato, mai un server fantasma ignorato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), '{ non e json valido');
    await assert.rejects(
      caricaServerMcp({ cartella }),
      (e) => { assert.ok(e instanceof McpRegistryError); assert.equal(e.code, 'MCP_CONFIG_MALFORMED'); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — caricaServerMcp: "server" mancante o non-array è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({ server: 'non-un-array' }));
    await assert.rejects(
      caricaServerMcp({ cartella }),
      (e) => { assert.equal(e.code, 'MCP_CONFIG_MALFORMED'); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — caricaServerMcp: un server senza "comando" è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [{ id: 'x', allowlist: ['read_file'] }],
    }));
    await assert.rejects(caricaServerMcp({ cartella }), (e) => e.code === 'MCP_CONFIG_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — caricaServerMcp: un server SENZA allowlist è rifiutato — mai un tool MCP esposto senza filtro', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [{ id: 'x', comando: 'npx' }],
    }));
    await assert.rejects(
      caricaServerMcp({ cartella }),
      (e) => { assert.equal(e.code, 'MCP_CONFIG_MALFORMED'); assert.match(e.message, /allowlist/); return true; },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — caricaServerMcp: allowlist VUOTA è rifiutata quanto allowlist assente', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [{ id: 'x', comando: 'npx', allowlist: [] }],
    }));
    await assert.rejects(caricaServerMcp({ cartella }), (e) => e.code === 'MCP_CONFIG_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — caricaServerMcp: "argomenti" non-array è rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [{ id: 'x', comando: 'npx', argomenti: 'non-un-array', allowlist: ['y'] }],
    }));
    await assert.rejects(caricaServerMcp({ cartella }), (e) => e.code === 'MCP_CONFIG_MALFORMED');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ verificaTrustMcp: nessun trust registrato — false, mai fidato per default', async () => {
  const cartellaTrust = cartellaVera();
  try {
    const fidato = await verificaTrustMcp({ cartellaTrust, serverId: 'filesystem', hash: 'abc123' });
    assert.equal(fidato, false);
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ fidaServerMcp poi verificaTrustMcp: lo stesso hash torna VERAMENTE fidato', async () => {
  const cartellaTrust = cartellaVera();
  try {
    await fidaServerMcp({ cartellaTrust, serverId: 'filesystem', hash: 'abc123' });
    assert.equal(existsSync(join(cartellaTrust, 'filesystem.json')), true, 'il trust è scritto DAVVERO sul disco');
    const fidato = await verificaTrustMcp({ cartellaTrust, serverId: 'filesystem', hash: 'abc123' });
    assert.equal(fidato, true);
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ AL CONTRARIO — un server fidato il cui CONTENUTO cambia (allowlist ampliata, hash diverso) torna automaticamente NON fidato', async () => {
  const cartellaTrust = cartellaVera();
  try {
    await fidaServerMcp({ cartellaTrust, serverId: 'filesystem', hash: 'hash-con-solo-read_file' });
    const fidatoConHashNuovo = await verificaTrustMcp({ cartellaTrust, serverId: 'filesystem', hash: 'hash-con-anche-write_file' });
    assert.equal(fidatoConHashNuovo, false, 'il trust è legato al CONTENUTO — allargare l\'allowlist deve chiedere una nuova fiducia esplicita');
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — un serverId con traversal ("..") è rifiutato, mai un percorso fuori dalla cartella di trust', async () => {
  const cartellaTrust = cartellaVera();
  try {
    await assert.rejects(
      fidaServerMcp({ cartellaTrust, serverId: '../fuori', hash: 'x' }),
      (e) => { assert.ok(e instanceof McpRegistryError); return true; },
    );
  } finally {
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ serverMcpFidati: un server fidato finisce in "fidati", uno non fidato in "nonFidati"', async () => {
  const cartella = cartellaVera();
  const cartellaTrust = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [
        { id: 'fidato', comando: 'npx', allowlist: ['read_file'] },
        { id: 'non-fidato', comando: 'npx', allowlist: ['write_file'] },
      ],
    }));
    const { server } = await caricaServerMcp({ cartella });
    await fidaServerMcp({ cartellaTrust, serverId: 'fidato', hash: server[0].hash });

    const { fidati, nonFidati } = await serverMcpFidati({ cartella, cartellaTrust });
    assert.deepEqual(fidati.map((s) => s.id), ['fidato']);
    assert.deepEqual(nonFidati.map((s) => s.id), ['non-fidato']);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⛔⭐⭐ AL CONTRARIO — serverMcpFidati: zero server dichiarati — entrambi vuoti, mai un errore', async () => {
  const cartella = cartellaVera();
  const cartellaTrust = cartellaVera();
  try {
    const { fidati, nonFidati } = await serverMcpFidati({ cartella, cartellaTrust });
    assert.deepEqual(fidati, []);
    assert.deepEqual(nonFidati, []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — serverMcpFidati: un server dichiarato ma MAI fidato non compare in "fidati", nessun errore che blocca la sessione', async () => {
  const cartella = cartellaVera();
  const cartellaTrust = cartellaVera();
  try {
    writeFileSync(join(cartella, '.harness-ui-mcp.json'), JSON.stringify({
      server: [{ id: 'mai-fidato', comando: 'npx', allowlist: ['read_file'] }],
    }));
    const { fidati, nonFidati } = await serverMcpFidati({ cartella, cartellaTrust });
    assert.deepEqual(fidati, []);
    assert.equal(nonFidati.length, 1);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
    rmSync(cartellaTrust, { recursive: true, force: true });
  }
});
