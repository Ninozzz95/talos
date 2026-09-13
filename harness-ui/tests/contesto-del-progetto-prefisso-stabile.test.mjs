import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { aggiornamentoInCoda, preamboloVistoDa, segnalaFileCambiati } from '../src/contesto-del-progetto.mjs';
import { progettoBC48, separaBlocchi, primoByteDiverso } from './fixtures/bc48-preambolo.mjs';

test('BC48-ORDINE: istruzioni, mappa, scheda; gli stessi byte della fixture', async t => {
  const p = await progettoBC48(); t.after(() => p.chiudi());
  const risultato = await p.costruisci();
  const blocchi = separaBlocchi(risultato.testo);
  assert.deepEqual(Object.keys(blocchi), ['istruzioni', 'mappa', 'scheda']);
  const fixture = JSON.parse(await readFile(new URL('./fixtures/bc48-preambolo.json', import.meta.url), 'utf8'));
  assert.deepEqual(blocchi, fixture.blocchiPrima);
  assert.equal(risultato.testo, fixture.dopo.pulito);
});

test('BC48-MINUTO: cambia git, dopo 60 secondi ricostruisce e cambia SOLO la scheda', async t => {
  const p = await progettoBC48(); t.after(() => p.chiudi());
  const prima = await p.costruisci();
  p.cambiaGitDopoUnMinuto();
  const dopo = await p.costruisci();
  assert.equal(dopo.riusato, false, 'Si verifica una ricostruzione, non il riuso della stringa in memoria');
  const a = separaBlocchi(prima.testo); const b = separaBlocchi(dopo.testo);
  assert.deepEqual(Buffer.from(a.istruzioni), Buffer.from(b.istruzioni));
  assert.deepEqual(Buffer.from(a.mappa), Buffer.from(b.mappa));
  assert.notEqual(a.scheda, b.scheda);
  assert.match(a.scheda, /niente da salvare/);
  assert.match(b.scheda, /1 file non salvati/);
  const stabile = a.istruzioni + '\n\n' + a.mappa + '\n\n';
  assert.ok(prima.testo.startsWith(stabile));
  assert.ok(dopo.testo.startsWith(stabile));
  const fixture = JSON.parse(await readFile(new URL('./fixtures/bc48-preambolo.json', import.meta.url), 'utf8'));
  assert.equal(primoByteDiverso(prima.testo, dopo.testo), fixture.dopo.primoByteVariabile);
});

test('BC48-SCHEDA-ASSENTE: il ripiego finale lascia identico il prefisso', async t => {
  const p = await progettoBC48(); t.after(() => p.chiudi());
  const prima = await p.costruisci();
  segnalaFileCambiati(p.cartella);
  const assente = await p.costruisci({ piattaforma: { toString() { throw new Error('Scheda non disponibile'); } } });
  assert.equal(assente.blocchi.scheda, null);
  const a = separaBlocchi(prima.testo); const b = separaBlocchi(assente.testo);
  assert.equal(b.istruzioni, a.istruzioni);
  assert.equal(b.mappa, a.mappa);
  assert.ok(assente.testo.startsWith(a.istruzioni + '\n\n' + a.mappa + '\n\n'));
  assert.match(b.scheda, /non sono riuscito/);
  assert.equal(preamboloVistoDa([{ role: 'system', content: assente.testo }]), assente.testo);
});

test('BC48-STORIA: riconosce il nuovo ordine e quello storico; aggiornamento e reload', async t => {
  const p = await progettoBC48(); t.after(() => p.chiudi());
  const prima = await p.costruisci(); const a = separaBlocchi(prima.testo);
  const nuovo = [a.istruzioni, a.mappa, a.scheda].join('\n\n');
  const storico = [a.scheda, a.istruzioni, a.mappa].join('\n\n');
  assert.equal(preamboloVistoDa([{ role: 'system', content: nuovo }]), nuovo);
  assert.equal(preamboloVistoDa([{ role: 'system', content: storico }]), storico);
  assert.equal(preamboloVistoDa([{ role: 'system', content: a.mappa + '\n\n' + a.scheda }]), a.mappa + '\n\n' + a.scheda);
  assert.equal(aggiornamentoInCoda({ storia: [{ role: 'system', content: nuovo }], testo: nuovo }), null);
  p.cambiaGitDopoUnMinuto(); const dopo = await p.costruisci();
  const coda = aggiornamentoInCoda({ storia: [{ role: 'system', content: nuovo }], testo: dopo.testo });
  assert.ok(coda);
  const storia = JSON.parse(JSON.stringify([{ role: 'system', content: nuovo }, { role: 'system', content: coda }]));
  assert.equal(preamboloVistoDa(storia), dopo.testo);
  assert.equal(aggiornamentoInCoda({ storia, testo: dopo.testo }), null);
  assert.equal(preamboloVistoDa([{ role: 'user', content: nuovo }]), null);
  assert.equal(preamboloVistoDa([{ role: 'system', content: 'Nota: ' + nuovo }]), null);
});
