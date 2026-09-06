import test from 'node:test';
import assert from 'node:assert/strict';
import { consumoPerGiorno, consumoPerModello, riepilogoConsumo, giornoDi, giornoUmano, compatto } from '../../src/components/costi-consumo.js';
import { pesoAttrezzi, ripartizioneContesto, frasiRipartizione } from '../../src/components/contesto.js';

/*
 * 06/09 — D21/D22 (costi e consumo) e D26 (ripartizione del contesto).
 * ⛔ Ogni regola è provata anche AL VERSO CONTRARIO: quello che non sappiamo
 * non deve comparire come zero, e un totale deve dire chi ha lasciato fuori.
 */

const GIORNO = (giorno, extra = {}) => ({ avviata: `${giorno}T10:00:00.000Z`, giri: 3, modello: 'z-ai/glm-5.3-flash', usage: { prompt_tokens: 1000, completion_tokens: 200, cached_tokens: 800 }, ...extra });

test('COSTI-GIORNO: si raggruppa per giorno locale, dal più recente', () => {
  const righe = consumoPerGiorno([GIORNO('2026-09-06'), GIORNO('2026-09-06'), GIORNO('2026-09-05')]);
  assert.equal(righe.length, 2);
  assert.equal(righe[0].chiave, '2026-09-06');
  assert.equal(righe[0].sessioni, 2);
  assert.equal(righe[0].token, 2400);
  assert.equal(righe[0].giri, 6);
  assert.equal(righe[1].chiave, '2026-09-05');
  // ⛔ verso contrario: una sessione senza data NON finisce in un giorno inventato
  assert.equal(giornoDi({}), null);
  assert.equal(consumoPerGiorno([{ giri: 1 }]).length, 0);
});

test('COSTI-MODELLO: si raggruppa per modello, dal più consumato', () => {
  const righe = consumoPerModello([
    GIORNO('2026-09-06', { modello: 'a/uno', usage: { prompt_tokens: 10, completion_tokens: 0 } }),
    GIORNO('2026-09-06', { modello: 'b/due', usage: { prompt_tokens: 900, completion_tokens: 100 } }),
  ]);
  assert.deepEqual(righe.map((r) => r.chiave), ['b/due', 'a/uno']);
  // ⛔ verso contrario: senza modello dichiarato la riga non si inventa
  assert.equal(consumoPerModello([{ avviata: '2026-09-06T10:00:00Z', modello: '' }]).length, 0);
});

test('COSTI-CHI-MANCA: il riepilogo dichiara le sessioni che NON ha potuto contare', () => {
  const r = riepilogoConsumo([
    GIORNO('2026-09-06'),
    { avviata: '2026-09-06T10:00:00Z', modello: 'a/uno' }, // senza usage
    { modello: 'a/uno', usage: { prompt_tokens: 5, completion_tokens: 5 } }, // senza data
    { avviata: '2026-09-06T10:00:00Z', usage: { prompt_tokens: 1, completion_tokens: 1 } }, // senza modello
  ]);
  assert.equal(r.sessioni, 4);
  assert.equal(r.senzaToken, 1);
  assert.equal(r.senzaData, 1);
  assert.equal(r.senzaModello, 1);
  // il totale è di CHI aveva i token, non di tutti
  assert.equal(r.token, 1200 + 10 + 2);
});

test('COSTI-NUMERI: compatto e giorni in parole', () => {
  assert.equal(compatto(950), '950');
  assert.equal(compatto(12_600_000), '12,6 M');
  assert.equal(compatto(-1), '—');
  const oggi = new Date(2026, 8, 6);
  assert.equal(giornoUmano('2026-09-06', oggi), 'oggi');
  assert.equal(giornoUmano('2026-09-05', oggi), 'ieri');
  assert.match(giornoUmano('2026-08-30', oggi), /30/);
});

test('CONTESTO-PESO: si somma quello dichiarato e si contano quelli che NON dichiarano', () => {
  const p = pesoAttrezzi([{ tokenSchemaStimati: 60, categoria: 'base' }, { tokenSchemaStimati: 124, categoria: 'base' }, { categoria: 'esteso' }]);
  assert.equal(p.token, 184);
  assert.equal(p.senzaStima, 1);
  assert.equal(p.contati, 2);
  assert.equal(p.totale, 3);
});

test('CONTESTO-RIPARTIZIONE: la percentuale esiste solo se la finestra è dichiarata', () => {
  const attrezzi = [{ tokenSchemaStimati: 7454, categoria: 'base' }];
  const con = ripartizioneContesto({ attrezzi, finestra: 131_072 });
  assert.equal(con.occupato, 7454);
  assert.ok(con.percentuale > 5 && con.percentuale < 6);
  assert.equal(con.libero, 131_072 - 7454);
  // ⛔ verso contrario: senza finestra NON si sceglie un valore di comodo
  const senza = ripartizioneContesto({ attrezzi });
  assert.equal(senza.percentuale, null);
  assert.equal(senza.libero, null);
  assert.match(frasiRipartizione(senza), /finestra del modello non dichiarata/);
  assert.match(frasiRipartizione(con), /% della finestra/);
});

test('CONTESTO-ZERO-NON-E-IGNOTO: una voce che non so misurare NON compare come 0', () => {
  const attrezzi = [{ tokenSchemaStimati: 100 }];
  // trovato dal vivo il 06/09: Number(null) vale 0 ed è finito ⇒ compariva «Istruzioni di sistema · 0 token»
  const senza = ripartizioneContesto({ attrezzi, istruzioniToken: null, memoriaToken: undefined });
  assert.deepEqual(senza.voci.map((v) => v.id), ['attrezzi']);
  // quando invece il dato c'è davvero, anche se è zero, la riga si vede
  const con = ripartizioneContesto({ attrezzi, istruzioniToken: 0 });
  assert.deepEqual(con.voci.map((v) => v.id), ['attrezzi', 'istruzioni']);
});

test('CONTESTO-CHI-MANCA: se degli attrezzi non dichiarano il peso, la frase lo dice', () => {
  const r = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }, {}, {}], finestra: 1000 });
  assert.match(frasiRipartizione(r), /2 attrezzi su 3 non dichiarano quanto pesano/);
});

test('CONTESTO-PROMESSA: quello che la sezione promette e non misura lo DICHIARA', () => {
  // Il cappello promette attrezzi + istruzioni + ricordi: se due non si misurano, vanno NOMINATI.
  const solo = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }] });
  assert.deepEqual(solo.mancanti, ['istruzioni', 'memoria']);
  const conIstruzioni = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }], istruzioniToken: 300 });
  assert.deepEqual(conIstruzioni.mancanti, ['memoria']);
  // ⛔ verso contrario: quando ci sono tutte, non si dichiara nessuna mancanza
  const tutte = ripartizioneContesto({ attrezzi: [{ tokenSchemaStimati: 100 }], istruzioniToken: 300, memoriaToken: 50 });
  assert.deepEqual(tutte.mancanti, []);
  assert.equal(tutte.occupato, 450);
});

test('C10-DESCRIZIONI: 43 attrezzi, tutte in italiano, senza markdown a schermo', async () => {
  const m = await import('../../src/components/nomi-attrezzi.js');
  const ids = Object.keys(m.DESCRIZIONI_ATTREZZI);
  assert.equal(ids.length, 43);
  for (const id of ids) {
    const d = m.descrizioneAttrezzo(id);
    assert.ok(d && d.length > 10, `descrizione troppo corta per ${id}`);
    // ⛔ finiscono in textContent: il markdown si vedrebbe LETTERALE (visto in una foto del 06/09)
    assert.ok(!/\*\*|\[[^\]]*\]\(/.test(d), `markdown a schermo in ${id}: ${d}`);
    assert.ok(d.trim().endsWith('.'), `manca il punto finale in ${id}`);
  }
  // ⛔ verso contrario: un id che non esiste NON riceve una frase inventata
  assert.equal(m.descrizioneAttrezzo('non_esiste'), null);
  assert.equal(m.descrizioneAttrezzo('__proto__'), null);
  assert.deepEqual(m.attrezziSenzaDescrizione(['elenca', 'non_esiste']), ['non_esiste']);
});
