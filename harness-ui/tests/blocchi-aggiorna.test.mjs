/*
 * Scene 1+4 (FE-081, G-B), core: the `blocco_aggiorna` tool. Ledger §2 G-B, UIG-1.3, UIG-1.4, UIG-1.5.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leggi } from '../src/blocchi/lettore.mjs';
import { Rotto, CODICI_DEL_ROTTO } from '../src/blocchi/catalogo.mjs';
import { creaStorico, versioneCorrente } from '../src/blocchi/versioni.mjs';
import { ATTREZZO_BLOCCO_AGGIORNA, CODICI_DI_BLOCCO_AGGIORNA, daJson, applicaAggiornamento, rispostaAlModello } from '../src/blocchi/aggiorna.mjs';

const TABELLA = readFileSync(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8');
const storico = () => creaStorico(leggi(TABELLA).blocco, 'b1', { sorgente: TABELLA });

test('the schema is the one of the shape, verbatim', () => {
  assert.equal(ATTREZZO_BLOCCO_AGGIORNA.name, 'blocco_aggiorna');
  assert.equal(ATTREZZO_BLOCCO_AGGIORNA.description,
    'Change a live block shown in this chat (versions are kept). Give the whole new source in `sorgente`, or exact replacements in `modifiche`.');
  assert.deepEqual(ATTREZZO_BLOCCO_AGGIORNA.input_schema, {
    type: 'object',
    properties: {
      blocco: { type: 'string', description: 'block name (nome=bN)' },
      sorgente: { type: 'string' },
      modifiche: {
        type: 'array', description: 'each `vecchio` must appear exactly once',
        items: { type: 'object', properties: { vecchio: { type: 'string' }, nuovo: { type: 'string' } }, required: ['vecchio', 'nuovo'] },
      },
    },
    required: ['blocco'],
  });
  for (const c of ['bloccoSconosciuto', 'nessunaModifica', 'modificaAmbigua']) assert.ok(CODICI_DI_BLOCCO_AGGIORNA.includes(c));
  for (const c of CODICI_DEL_ROTTO) assert.ok(CODICI_DI_BLOCCO_AGGIORNA.includes(c));
});

test('UIG-1.3 an unknown name gives Rotto bloccoSconosciuto, and the model gets one line', () => {
  const r = applicaAggiornamento(storico(), { blocco: 'b9', sorgente: TABELLA });
  assert.ok(r instanceof Rotto);
  assert.equal(r.codice, 'bloccoSconosciuto');
  const r2 = applicaAggiornamento(null, { blocco: 'b1', sorgente: TABELLA });
  assert.equal(r2.codice, 'bloccoSconosciuto');
  const riga = rispostaAlModello(r);
  assert.equal(riga.includes('\n'), false);
  const j = JSON.parse(riga);
  assert.equal(j.ok, false);
  assert.equal(j.codice, 'bloccoSconosciuto');
  assert.equal(typeof j.riga, 'string');
  assert.ok(j.riga.length <= 160);
});

test('UIG-1.4 replacements apply in order, each on the text left by the ones before', () => {
  /* the second `vecchio` exists only after the first replacement */
  const r = applicaAggiornamento(storico(), { blocco: 'b1', modifiche: [
    { vecchio: '"Vendite per mese"', nuovo: '"Vendite Q1"' },
    { vecchio: '"Vendite Q1"', nuovo: '"Vendite del primo trimestre"' },
  ] });
  assert.ok(!(r instanceof Rotto), JSON.stringify(r));
  const v = versioneCorrente(r.storico);
  assert.equal(v.versione, 2);
  assert.equal(v.blocco.titolo, 'Vendite del primo trimestre');
  assert.equal(v.origine, 'modello');
  assert.deepEqual(JSON.parse(rispostaAlModello(r)), { ok: true, blocco: 'b1', versione: 2, tipo: 'tabella' });
  /* a `vecchio` that appears twice is ambiguous; one that is missing is no change; a broken result keeps the reader's code */
  assert.equal(applicaAggiornamento(storico(), { blocco: 'b1', modifiche: [{ vecchio: 'titolo:', nuovo: 'nome:' }] }).codice, 'modificaAmbigua');
  assert.equal(applicaAggiornamento(storico(), { blocco: 'b1', modifiche: [{ vecchio: 'NON CI SONO', nuovo: 'x' }] }).codice, 'nessunaModifica');
  assert.equal(applicaAggiornamento(storico(), { blocco: 'b1', sorgente: TABELLA }).codice, 'nessunaModifica');
  assert.equal(applicaAggiornamento(storico(), { blocco: 'b1', modifiche: [{ vecchio: 'Tabella(', nuovo: 'Tavola(' }] }).codice, 'tipoSconosciuto');
  /* the whole source, with the fence too */
  const nuovo = '```talos-blocco\n' + TABELLA.replace('Marzo', 'Aprile') + '\n```';
  const r3 = applicaAggiornamento(storico(), { blocco: 'b1', sorgente: nuovo });
  assert.equal(versioneCorrente(r3.storico).blocco.righe[2][0], 'Aprile');
  assert.equal(versioneCorrente(r3.storico).cosaECambiato, 'righe cambiate');
});

test('UIG-1.5 malformed input is a validation fault, never a TypeError', () => {
  const casi = [null, undefined, 42, 'non json', '[1]', [], { }, { blocco: '' }, { blocco: 3, sorgente: 'x' },
    { blocco: 'b1' }, { blocco: 'b1', sorgente: 'x', modifiche: [] }, { blocco: 'b1', modifiche: 'x' },
    { blocco: 'b1', modifiche: [] }, { blocco: 'b1', modifiche: [null] }, { blocco: 'b1', modifiche: [{ vecchio: 1, nuovo: 'x' }] },
    { blocco: 'b1', modifiche: [{ vecchio: '', nuovo: 'x' }] }, { blocco: 'b1', sorgente: 7 }];
  for (const c of casi) {
    const d = daJson(c);
    assert.ok(d instanceof Rotto, `daJson(${JSON.stringify(c)})`);
    assert.ok(CODICI_DI_BLOCCO_AGGIORNA.includes(d.codice));
    let r;
    assert.doesNotThrow(() => { r = applicaAggiornamento(storico(), c); });
    assert.ok(r instanceof Rotto);
  }
  assert.equal(daJson('{"blocco":"b1","sorgente":"x"}').blocco, 'b1');
  assert.equal(daJson('{').codice, 'sintassi');
});
