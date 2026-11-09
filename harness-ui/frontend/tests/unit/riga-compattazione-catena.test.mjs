import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretaEventoCompattazione, percheDellaCatena, testoRigaCompattazione } from '../../src/components/compattazione-legacy.js';
import { chiaveDelMotivo, nomeCortoDelModello } from '../../src/components/motivi-compattazione.js';
import { etichettaSeparatoreContesto } from '../../src/components/context-separator.js';

/* FE-053: chi ha scritto la compattazione e perché non ha potuto chi era scelto. La lingua di serie delle prove è l'italiano */
const fine = (extra) => ({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, at: '2026-11-01T10:00:00.000Z', tokenPrima: 182_000, tokenDopo: 41_000, ...extra } });
const FERMO = { modello: 'z-ai/glm-5.3-flash', motivo: 'limite', diAccount: true, finoAlle: 1_800_000_000_000 };

test('RIGA-CATENA-01 — il lettore tiene chi non ha potuto e chi ha scritto, solo se ci sono', () => {
  const c = interpretaEventoCompattazione(fine({ ripiego: true, nonDisponibile: { ...FERMO, stato: 'bloccato' }, dallaRiserva: true, riassuntoDi: 'qwen/qwen3.7-flash' }));
  assert.deepEqual(c.nonDisponibile, FERMO);
  assert.equal(c.dallaRiserva, true);
  assert.equal(c.riassuntoDi, 'qwen/qwen3.7-flash');
  const liscia = interpretaEventoCompattazione(fine({}));
  assert.equal('nonDisponibile' in liscia, false, 'la forma di sempre non cambia');
  assert.equal('dallaRiserva' in liscia, false);
  assert.equal('nonDisponibile' in interpretaEventoCompattazione(fine({ nonDisponibile: { motivo: 'limite' } })), false, 'senza il modello non si tiene');
  assert.equal('dallaRiserva' in interpretaEventoCompattazione(fine({ compattato: false, dallaRiserva: true, riassuntoDi: 'qwen/qwen3.7-flash' })), false, 'una compattazione fallita non ha un autore');
});

test('RIGA-CATENA-02 — la riserva firma la riga, coi numeri', () => {
  assert.match(testoRigaCompattazione({ stato: 'riassunta', tokenPrima: 182_000, tokenDopo: 28_000, dallaRiserva: true, riassuntoDi: 'qwen/qwen3.7-flash' }), /^.+qwen3\.7-flash.+ · .+→.+$/u);
});

test('RIGA-CATENA-03 — senza il modello dice il motivo, e il rapido in arrivo resta rapido', () => {
  const senza = testoRigaCompattazione({ stato: 'riassunta', ripiego: true, ragione: 'errore', tokenPrima: 182_000, tokenDopo: 41_000, nonDisponibile: FERMO });
  assert.notEqual(senza, testoRigaCompattazione({ stato: 'riassunta', ripiego: true, ragione: 'errore', tokenPrima: 182_000, tokenDopo: 41_000 }));
  assert.equal(testoRigaCompattazione({ stato: 'riassunta', ripiego: true, ragione: 'in-arrivo', nonDisponibile: FERMO }), testoRigaCompattazione({ stato: 'riassunta', ripiego: true, ragione: 'in-arrivo' }));
});

test('RIGA-CATENA-04 — AL CONTRARIO: senza nessuna scelta la riga di oggi resta uguale', () => {
  const uguali = [{ stato: 'riassunta', tokenPrima: 100, tokenDopo: 50 }, { stato: 'riassunta', ripiego: true, ragione: 'errore' }, { stato: 'non-riuscita', motivo: 'errore' }];
  for (const v of uguali) assert.equal(testoRigaCompattazione({ ...v, nonDisponibile: null, dallaRiserva: false, riassuntoDi: null }), testoRigaCompattazione(v));
});

test('RIGA-CATENA-05 — il perché: uno che si sa, poi chi ha fatto la compattazione; niente da dire senza un modello fermo', () => {
  assert.equal(percheDellaCatena({}), null);
  const senza = percheDellaCatena({ nonDisponibile: { ...FERMO, motivo: 'rete', finoAlle: null } });
  const riserva = percheDellaCatena({ nonDisponibile: { ...FERMO, motivo: 'rete', finoAlle: null }, dallaRiserva: true });
  const intera = percheDellaCatena({ nonDisponibile: { ...FERMO, motivo: 'rete', finoAlle: null }, compattata: false });
  assert.equal(new Set([senza, riserva, intera]).size, 3);
  for (const frase of [senza, riserva, intera]) assert.match(frase, /glm-5\.3-flash/u);
});

test('RIGA-CATENA-06 — i motivi: `limite` si divide con `diAccount`, uno sconosciuto non diventa un limite', () => {
  assert.equal(chiaveDelMotivo({ motivo: 'limite', diAccount: true }), 'planLimit');
  assert.equal(chiaveDelMotivo({ motivo: 'limite' }), 'providerLimit');
  assert.equal(chiaveDelMotivo({ motivo: 'rete' }), 'network');
  assert.equal(chiaveDelMotivo({ motivo: 'mai-visto' }), 'notFound');
});

test('RIGA-CATENA-07 — il nome di un modello che non c\'è più: la parte dopo l\'ultimo / o :', () => {
  assert.equal(nomeCortoDelModello('z-ai/glm-5.3-flash'), 'glm-5.3-flash');
  assert.equal(nomeCortoDelModello('chatgpt:gpt-6-luna'), 'gpt-6-luna');
  assert.equal(nomeCortoDelModello('openrouter:autore/m'), 'm');
  assert.equal(nomeCortoDelModello(null), '');
});

test('RIGA-CATENA-08 — sulla strada del motore la riserva firma il separatore, e senza firma resta quello di oggi', () => {
  const base = { sessionId: 's', versionId: 'v1', kind: 'context.version.committed', id: 'e1' };
  const firmata = etichettaSeparatoreContesto({ ...base, payload: { provenienza: { riassuntoDi: 'qwen/qwen3.7-flash', dallaRiserva: true } } });
  assert.match(firmata, /qwen3\.7-flash/u);
  assert.notEqual(firmata, etichettaSeparatoreContesto(base));
});

/* Frontend 01/11/2026, visto dal vivo dal Motore locale: al primo giro i ganci del motore del contesto non sono partiti (riga D2 del
   registro, `motivo:'ripiego'`, `giro:0`). «Conversazione non compattata» su due messaggi non diceva niente. */
/* Revisione del blocco 25, R3: la frase si decide sul campo che mette CHI SA che il motore non è partito (il registro, `diciGanciDelContestoRotti`:
   `motoreNonPartito: true`), mai su `giro === 0`. Giro 0 + ripiego lo emettono anche il guscio (un `prepare` rifiutato alla prima richiesta di un invio)
   e il nucleo (una `capture('start')` divergente): lì il motore è partito, e la frase sarebbe falsa. */
test('RIGA-CATENA-GANCI — col segno del registro: «il motore del contesto non è partito»; senza, la riga di sempre, anche a giro 0', () => {
  const evento = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', giro: 0, compattato: false, motivo: 'ripiego', ragione: 'rifiutato', codice: 'X', motoreNonPartito: true } };
  const c = interpretaEventoCompattazione(evento);
  assert.equal(c.giro, 0);
  assert.equal(c.motoreNonPartito, true);
  const primo = testoRigaCompattazione({ stato: 'non-riuscita', giro: c.giro, motivo: c.motivo, motoreNonPartito: c.motoreNonPartito });
  assert.match(primo, /motore del contesto non è partito|context engine didn’t start/u);
  assert.doesNotMatch(primo, /non compattata|not compacted/iu);
  const dopo = testoRigaCompattazione({ stato: 'non-riuscita', giro: 3, motivo: 'ripiego' });
  assert.match(dopo, /non compattata|not compacted/iu, 'nel mezzo di una chat resta la riga del ripiego');
  assert.match(testoRigaCompattazione({ stato: 'non-riuscita', motivo: 'ripiego' }), /non compattata|not compacted/iu, 'senza giro: la riga di sempre');
});

for (const [nome, value] of [
  ['guscio: prepare rifiutato alla prima richiesta di un invio', { fase: 'fine', giro: 0, compattato: false, motivo: 'ripiego', codice: 'CTX_SUMMARY_REJECTED' }],
  ['nucleo: capture iniziale divergente', { fase: 'fine', giro: 0, compattato: false, motivo: 'ripiego', codice: 'CTX_HISTORY_DIVERGED' }],
  ['un segno che non è `true`', { fase: 'fine', giro: 0, compattato: false, motivo: 'ripiego', motoreNonPartito: 'sì' }],
  ['il segno su un altro motivo', { fase: 'fine', giro: 0, compattato: false, motivo: 'errore', motoreNonPartito: true }],
]) {
  test(`RIGA-CATENA-GANCI AL CONTRARIO — ${nome}: la riga NON dice che il motore non è partito`, () => {
    const c = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value });
    const testo = testoRigaCompattazione({ stato: 'non-riuscita', giro: c.giro, motivo: c.motivo, codice: c.codice, motoreNonPartito: c.motoreNonPartito });
    assert.doesNotMatch(testo, /motore del contesto non è partito|context engine didn’t start/u, testo);
    assert.equal(c.motoreNonPartito, undefined, 'il campo si tiene solo nella sua forma, e solo sul ripiego');
  });
}

test('RIGA-CATENA-GANCI-TRASCRITTO — il trascritto decide sullo stesso segno: col segno «non è partito», senza (giro 0) la riga del ripiego', async () => {
  const { trascriviEventoInterno } = await import('../../src/components/trascrizione-eventi-interni.js');
  const riga = (extra) => trascriviEventoInterno({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', giro: 0, compattato: false, motivo: 'ripiego', ...extra } })?.testo ?? '';
  assert.match(riga({ motoreNonPartito: true }), /motore del contesto non è partito|context engine didn’t start/u);
  assert.doesNotMatch(riga({ codice: 'CTX_HISTORY_DIVERGED' }), /motore del contesto non è partito|context engine didn’t start/u);
});
