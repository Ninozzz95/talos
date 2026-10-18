import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { datiEstensione } from '../../src/components/estensioni.js';
import { TESTI } from '../../src/i18n/testi/index.js';

/*
 * 17/10/2026 (owner «la fiducia vecchia non vale più, e la carta lo dice»): hook e server MCP ora contano anche gli script del
 * progetto (`src/script-del-progetto.mjs`); una fiducia caduta arriva con `frase` + `fraseChiave` dal server, e la riga la dice nella
 * lingua dell'interfaccia. Le quattro chiavi esistono in inglese e in italiano, e l'inglese è la frase del server.
 */
const CHIAVI = ['server.hook.trust.scriptsNowCovered', 'server.hook.trust.contentChanged', 'server.mcp.trust.scriptsNowCovered', 'server.mcp.trust.contentChanged'];

test('FIDUCIA-SCRIPT-01 — le quattro frasi esistono nelle due lingue, e dicono «script»', () => {
  for (const chiave of CHIAVI) {
    assert.match(TESTI.en[chiave], /script/u, chiave);
    assert.match(TESTI.it[chiave], /script/u, chiave);
    assert.notEqual(TESTI.it[chiave], TESTI.en[chiave], `${chiave}: l'italiano non è l'inglese`);
  }
});

test('FIDUCIA-SCRIPT-02 — la riga di un hook e di un server con la fiducia caduta mostra la frase nella lingua dell\'interfaccia', () => {
  const hook = { id: 'guardia', eventi: ['pre_tool_call'], fidato: false, motivo: 'regola-precedente', frase: 'EN dal server', fraseChiave: 'server.hook.trust.scriptsNowCovered' };
  const server = { id: 'mio', comando: 'node', argomenti: ['s.mjs'], allowlist: ['x'], fidato: false, motivo: 'contenuto-cambiato', frase: 'EN dal server', fraseChiave: 'server.mcp.trust.contentChanged' };
  try {
    impostaLingua('it');
    assert.equal(datiEstensione('hooks', hook).frase, TESTI.it['server.hook.trust.scriptsNowCovered']);
    assert.equal(datiEstensione('mcp', server).frase, TESTI.it['server.mcp.trust.contentChanged']);
    impostaLingua('en');
    assert.equal(datiEstensione('hooks', hook).frase, TESTI.en['server.hook.trust.scriptsNowCovered']);
  } finally { impostaLingua('en'); }
  assert.equal(datiEstensione('hooks', { id: 'x', eventi: [], fidato: false }).frase, null, 'AL CONTRARIO: mai approvato, nessuna frase');
});
