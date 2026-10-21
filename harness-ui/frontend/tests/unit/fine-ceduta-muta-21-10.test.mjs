/*
 * 21/10/2026 (6) — il riassunto di sfondo che CEDE il posto unico al messaggio della persona (`talos.compattazione {fase:'fine',
 * compattato:false, motivo:'ceduta'}`) è voluto, non un fallimento: nessuna riga in chat né nella trascrizione. La CLI fa lo stesso
 * (`COMPACTION_QUIET`). Le altre fini non riuscite restano dette, col loro motivo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import { fineMuta, interpretaEventoCompattazione } from '../../src/components/compattazione-legacy.js';
import { creaContestoTrascrizione, trascriviEventoInterno } from '../../src/components/trascrizione-eventi-interni.js';

const fine = (value) => ({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', at: '2026-10-21T20:00:00.000Z', ...value } });

test('CEDUTA-01 la fine «ceduta» è muta: niente riga nella trascrizione', () => {
  impostaLingua('en');
  const c = interpretaEventoCompattazione(fine({ compattato: false, motivo: 'ceduta', interrottaIn: 'riassunto' }));
  assert.equal(fineMuta(c), true);
  assert.deepEqual(trascriviEventoInterno(fine({ compattato: false, motivo: 'ceduta' }), creaContestoTrascrizione()), { omesso: true });
});

test('CEDUTA-02 verso contrario: una fine non riuscita per un altro motivo, o riuscita, si racconta ancora', () => {
  for (const lingua of ['en', 'it']) {
    impostaLingua(lingua);
    for (const motivo of ['superata', 'troncato', 'errore: boom', 'non-salvata']) {
      const c = interpretaEventoCompattazione(fine({ compattato: false, motivo }));
      assert.equal(fineMuta(c), false, motivo);
      const riga = trascriviEventoInterno(fine({ compattato: false, motivo }), creaContestoTrascrizione());
      assert.equal(typeof riga?.testo, 'string', `${lingua} ${motivo}`);
      assert.ok(riga.testo.length > 0);
    }
    const riuscita = fine({ compattato: true, motivo: 'ceduta', tokenPrima: 3000, tokenDopo: 900 });
    assert.equal(fineMuta(interpretaEventoCompattazione(riuscita)), false, 'riuscita non è mai muta, qualunque motivo');
    assert.equal(fineMuta(null), false);
    assert.equal(fineMuta({ tipo: 'inizio', motivo: 'ceduta' }), false);
  }
  impostaLingua('en');
});

test('CEDUTA-03 la chiusura della riga di un riassunto del MOTORE è muta (lo racconta già il separatore del motore)', () => {
  impostaLingua('en');
  const c = interpretaEventoCompattazione(fine({ compattato: false, motivo: 'motore', giro: 2 }));
  assert.equal(fineMuta(c), true);
  assert.equal(c.giro, 2, 'il giro passa');
  assert.deepEqual(trascriviEventoInterno(fine({ compattato: false, motivo: 'motore' }), creaContestoTrascrizione()), { omesso: true });
});

test('CEDUTA-04 revisione del Mobile: «error: <testo>» dello sfondo si legge come «errore», col dettaglio; il giro solo se c\'è', () => {
  impostaLingua('en');
  const inglese = interpretaEventoCompattazione(fine({ compattato: false, motivo: 'error: HTTP 500' }));
  assert.equal(inglese.motivo, 'errore');
  assert.equal(inglese.dettaglio, 'HTTP 500');
  const italiano = interpretaEventoCompattazione(fine({ compattato: false, motivo: 'errore: HTTP 500' }));
  assert.equal(italiano.motivo, 'errore');
  assert.equal(Object.hasOwn(italiano, 'giro'), false, 'senza giro nell\'evento, nessun campo in più');
  const inizio = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', motivo: 'soglia', giro: 4 } });
  assert.equal(inizio.giro, 4);
});
