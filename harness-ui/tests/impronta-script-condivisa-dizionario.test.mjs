/*
 * 20/10/2026 — la metà di `impronta-script-condivisa.test.mjs` che legge il dizionario dell'interfaccia (solo desktop: l'albero della
 *   CLI non ha `frontend/`, richiesta della CLI). La frase inglese che il server manda accanto alla chiave è la voce inglese del
 *   dizionario, per tutti e quattro i perché che hanno una frase (hook e server MCP × regola precedente e contenuto cambiato): la
 *   persona legge la frase nella sua lingua dalla chiave, e chi legge solo `frase` (la CLI) legge lo stesso testo.
 *   Prima di questa divisione si confrontavano solo le due frasi della «regola precedente».
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { improntaHookRegolaPrecedente, statoTrustHook } from '../src/hook-registry.mjs';
import { statoTrustMcp } from '../src/mcp-registry.mjs';
import { TESTI } from '../frontend/src/i18n/testi/index.js';

/** un archivio della fiducia finto: il file dice `salvato` come impronta approvata */
const archivioCon = (salvato) => ({ readFileFn: async () => JSON.stringify({ hash: salvato }) });

test('IMP-DIZ-01 — hook: le frasi della regola precedente e del contenuto cambiato sono le voci inglesi del dizionario', async () => {
  const cartella = tmpdir();
  const comando = 'echo guardia';
  const prima = await improntaHookRegolaPrecedente({ comando, cartella });
  const precedente = await statoTrustHook({ cartellaTrust: 'x', hookId: 'h', hash: 'impronta-nuova', comando, cartella }, archivioCon(prima));
  const cambiato = await statoTrustHook({ cartellaTrust: 'x', hookId: 'h', hash: 'impronta-nuova', comando, cartella }, archivioCon('un-altra'));
  assert.equal(precedente.motivo, 'regola-precedente');
  assert.equal(cambiato.motivo, 'contenuto-cambiato');
  for (const stato of [precedente, cambiato]) {
    assert.equal(typeof TESTI.en[stato.fraseChiave], 'string', `la chiave ${stato.fraseChiave} è nel dizionario inglese`);
    assert.equal(stato.frase, TESTI.en[stato.fraseChiave]);
    assert.equal(typeof TESTI.it[stato.fraseChiave], 'string', `la chiave ${stato.fraseChiave} è nel dizionario italiano`);
  }
});

test('IMP-DIZ-02 — server MCP: le frasi della regola precedente e del contenuto cambiato sono le voci inglesi del dizionario', async () => {
  const voce = { comando: 'node', argomenti: ['server/mcp.mjs'], allowlist: ['cerca'] };
  const soloDichiarazione = createHash('sha256').update(JSON.stringify(voce)).digest('hex');
  const precedente = await statoTrustMcp({ cartellaTrust: 'x', serverId: 's', hash: 'impronta-nuova', ...voce }, archivioCon(soloDichiarazione));
  const cambiato = await statoTrustMcp({ cartellaTrust: 'x', serverId: 's', hash: 'impronta-nuova', ...voce }, archivioCon('un-altra'));
  assert.equal(precedente.motivo, 'regola-precedente');
  assert.equal(cambiato.motivo, 'contenuto-cambiato');
  for (const stato of [precedente, cambiato]) {
    assert.equal(typeof TESTI.en[stato.fraseChiave], 'string', `la chiave ${stato.fraseChiave} è nel dizionario inglese`);
    assert.equal(stato.frase, TESTI.en[stato.fraseChiave]);
    assert.equal(typeof TESTI.it[stato.fraseChiave], 'string', `la chiave ${stato.fraseChiave} è nel dizionario italiano`);
  }
});

test('IMP-DIZ-03 — AL CONTRARIO: «mai approvato» e «fidato» non hanno frase né chiave', async () => {
  const mai = await statoTrustMcp({ cartellaTrust: 'x', serverId: 's', hash: 'h', comando: 'node', argomenti: [], allowlist: [] }, { readFileFn: async () => { throw new Error('ENOENT'); } });
  const fidato = await statoTrustMcp({ cartellaTrust: 'x', serverId: 's', hash: 'h', comando: 'node', argomenti: [], allowlist: [] }, archivioCon('h'));
  for (const stato of [mai, fidato]) { assert.equal(stato.frase, null); assert.equal(stato.fraseChiave, null); }
});
