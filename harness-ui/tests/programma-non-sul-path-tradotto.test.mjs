/*
 * Dalla revisione del bugfixer (16/10/2026): il rifiuto di un programma che il PATH non ha (R1, `risolviProgrammaSenzaCartella`) era
 * solo inglese. Ora l'errore porta la chiave `server.program.notOnPath` e i valori, e l'elenco dei server MCP falliti li porta con sé
 * (`erroreChiave`, `erroreParams`), così chi lo mostra (oggi la CLI) lo dice nelle due lingue. La frase inglese resta la sorgente.
 * ⛔ L'agente esterno (ACP) non ci arriva: `validaRuntimeAgenteEsterno` vuole già un percorso assoluto (`acp-agent.mjs:86`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { risolviProgrammaSenzaCartella } from '../src/difesa-ricerca-programmi.mjs';
import { preparaToolMcpPerSessione } from '../src/mcp-session.mjs';
import dizionario from '../frontend/src/i18n/testi/server.js';

const NOME = 'talos-programma-che-non-esiste-xyz';

test('PATH-TRAD-01 — the refusal carries the key and the values, and keeps the English sentence', () => {
  let errore;
  try { risolviProgrammaSenzaCartella(NOME, { env: { PATH: tmpdir() }, eFile: () => false }); } catch (e) { errore = e; }
  assert.ok(errore, 'premessa: rifiuta');
  assert.equal(errore.code, 'ENOENT');
  assert.equal(errore.chiave, 'server.program.notOnPath');
  assert.equal(errore.params.command, NOME);
  assert.match(errore.params.example, new RegExp(`^\\.[\\\\/]${NOME}$`, 'u'));
  assert.match(errore.message, /was not found on PATH/u);
});

test('PATH-TRAD-04 — an MCP server whose program is not on PATH lands in "falliti" with the key; AL CONTRARIO a plain error has none', async () => {
  const servizio = (id) => ({ id, comando: id === 'mancante' ? NOME : 'altro', argomenti: [], allowlist: [], hash: `h-${id}` });
  const { falliti } = await preparaToolMcpPerSessione({ cartella: tmpdir(), cartellaTrust: tmpdir() }, {
    serverMcpFidatiFn: async () => ({ fidati: [servizio('mancante'), servizio('rotto')], nonFidati: [] }),
    connettiServerMcpFn: async ({ comando }) => {
      if (comando === NOME) risolviProgrammaSenzaCartella(NOME, { env: { PATH: tmpdir() }, eFile: () => false });
      throw new Error('qualcos\'altro');
    },
  });
  const perId = Object.fromEntries(falliti.map((f) => [f.serverId, f]));
  assert.equal(perId.mancante.erroreChiave, 'server.program.notOnPath');
  assert.equal(perId.mancante.erroreParams.command, NOME);
  assert.match(perId.mancante.errore, /was not found on PATH/u);
  assert.equal(perId.rotto.erroreChiave, undefined);
});

test('PATH-TRAD-03 — the dictionary says it in English and Italian, with the same placeholders', () => {
  const en = dizionario.en['program.notOnPath'];
  const it = dizionario.it['program.notOnPath'];
  assert.ok(en && it, 'both languages');
  const segnaposto = (s) => [...s.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]).sort();
  assert.deepEqual(segnaposto(en), ['command', 'example']);
  assert.deepEqual(segnaposto(it), segnaposto(en));
  assert.notEqual(it, en);
});
