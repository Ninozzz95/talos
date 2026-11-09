import test from 'node:test';
import assert from 'node:assert/strict';
import { fraseDelLavoro } from '../../src/components/frase-lavoro-contesto.js';
import { TESTI } from '../../src/i18n/testi/index.js';

/* La frase si sceglie dal codice: il testo del motore, inglese e tecnico, resta nel dettaglio chiuso */
const CODICI = ['CTX_COMPACTION_TIMEOUT', 'CTX_SUMMARY_REFUSED', 'CTX_EMPTY_SUMMARY', 'CTX_INVALID_SUMMARY', 'CTX_SUMMARY_RESPONSE_INVALID', 'CTX_INVALID_SOURCE', 'CTX_TRUNCATED_SUMMARY',
  'CTX_PROVIDER_CONTEXT_INVALID', 'CTX_MODEL_INVALID', 'CTX_HISTORY_DIVERGED', 'CTX_STALE_REVISION', 'CTX_PERSISTENCE_FAILED', 'CTX_JOB_INTERRUPTED', 'CTX_COMPACTION_FAILED',
  'CTX_SUMMARY_MODEL_UNAVAILABLE', 'CTX_CONTEXT_TOO_SMALL', 'CTX_SEGMENT_TOO_LARGE', 'CTX_SUMMARY_TOOLS',
  'CTX_NOTHING_TO_COMPACT', 'CTX_NO_REDUCTION', 'CTX_PENDING_TOOLS', 'CTX_RESOURCE_BUSY', 'CTX_USAGE_DENIED'];
const GREZZO = 'XYZZY raw engine text';
const eco = (k) => k;
const lavoro = (code, state = 'failed') => ({ state, error: { code, message: GREZZO } });

test('LAVORO-FRASE-01 — ogni codice ha la sua frase in italiano e in inglese, e il testo del motore non è mai in prima vista', () => {
  for (const lingua of Object.keys(TESTI)) {
    const traduci = (k) => { const v = TESTI[lingua]?.[k]; assert.equal(typeof v, 'string', `${lingua} manca ${k}`); return v; };
    for (const code of CODICI) {
      const esito = fraseDelLavoro(lavoro(code), { traduci });
      assert.ok(esito.testo.length > 0, code);
      assert.ok(!esito.testo.includes(GREZZO), `${code}: il grezzo è in prima vista`);
      assert.ok(!esito.testo.includes('CTX_'), `${code}: il codice è in prima vista`);
    }
  }
});

test('LAVORO-FRASE-02 — il grezzo resta nel dettaglio, col codice', () => {
  assert.equal(fraseDelLavoro(lavoro('CTX_SUMMARY_REFUSED'), { traduci: eco }).dettaglio, `CTX_SUMMARY_REFUSED: ${GREZZO}`);
  assert.equal(fraseDelLavoro({ state: 'failed', error: { code: 'CTX_SUMMARY_REFUSED' } }, { traduci: eco }).dettaglio, 'CTX_SUMMARY_REFUSED');
});

test('LAVORO-FRASE-03 — un guasto dice che la conversazione resta intera; una pausa e un «niente da fare» no', () => {
  const intera = 'chat.context.jobError.intact';
  assert.ok(fraseDelLavoro(lavoro('CTX_HISTORY_DIVERGED'), { traduci: eco }).testo.includes(intera));
  for (const code of ['CTX_PENDING_TOOLS', 'CTX_RESOURCE_BUSY', 'CTX_USAGE_DENIED', 'CTX_JOB_INTERRUPTED', 'CTX_NOTHING_TO_COMPACT', 'CTX_NO_REDUCTION']) {
    assert.ok(!fraseDelLavoro(lavoro(code, 'paused'), { traduci: eco }).testo.includes(intera), code);
  }
});

test('LAVORO-FRASE-04 — rimedio: «Riprova» è testo, «Scegli un altro» è un\'azione, mai un doppione', () => {
  const riprova = 'chat.context.jobError.retry';
  const conRiprova = fraseDelLavoro(lavoro('CTX_HISTORY_DIVERGED'), { traduci: eco });
  assert.ok(conRiprova.testo.includes(riprova)); assert.equal(conRiprova.scegli, false);
  const soloModello = fraseDelLavoro(lavoro('CTX_SUMMARY_REFUSED'), { traduci: eco });
  assert.ok(!soloModello.testo.includes(riprova)); assert.equal(soloModello.scegli, true);
  const disco = fraseDelLavoro(lavoro('CTX_PERSISTENCE_FAILED'), { traduci: eco });
  assert.ok(disco.testo.includes('chat.context.jobError.disk')); assert.equal(disco.scegli, false); assert.ok(!disco.testo.includes(riprova));
});

test('LAVORO-FRASE-05 — AL CONTRARIO: un codice sconosciuto ha la frase generica, annullato e nessun errore non dicono niente', () => {
  const ignoto = fraseDelLavoro(lavoro('CTX_MAI_VISTO'), { traduci: eco });
  assert.ok(ignoto.testo.startsWith('chat.context.jobError.failed'));
  assert.equal(ignoto.dettaglio, `CTX_MAI_VISTO: ${GREZZO}`);
  assert.equal(fraseDelLavoro(lavoro('CTX_JOB_CANCELLED', 'cancelled'), { traduci: eco }), null);
  assert.equal(fraseDelLavoro(lavoro('CTX_SUMMARY_REFUSED', 'cancelled'), { traduci: eco }), null);
  assert.equal(fraseDelLavoro(lavoro('CTX_JOB_CANCELLED', 'failed'), { traduci: eco }), null, 'annullato anche se lo stato non lo dice');
  assert.equal(fraseDelLavoro({ state: 'running' }, { traduci: eco }), null);
  assert.equal(fraseDelLavoro(null, { traduci: eco }), null);
});

test('LAVORO-FRASE-06 (revisione del Blocco 21, R12) — un lavoro interrotto è in pausa: si riprende, «Compatta ora» butterebbe i pezzi già pagati', () => {
  const e = fraseDelLavoro(lavoro('CTX_JOB_INTERRUPTED', 'paused'), { traduci: eco });
  assert.equal(e.testo, 'chat.context.jobError.pausedInterrupted');
  assert.equal(e.scegli, false);
});

test('LAVORO-FRASE-08 — è una riga in corso solo la pausa che aspetta qualcosa, non quella che aspetta la persona', () => {
  for (const code of ['CTX_PENDING_TOOLS', 'CTX_RESOURCE_BUSY']) assert.equal(fraseDelLavoro(lavoro(code, 'paused'), { traduci: eco }).attesa, true, code);
  for (const code of ['CTX_USAGE_DENIED', 'CTX_JOB_INTERRUPTED']) assert.equal(fraseDelLavoro(lavoro(code, 'paused'), { traduci: eco }).attesa, false, code);
  assert.equal(fraseDelLavoro(lavoro('CTX_HISTORY_DIVERGED'), { traduci: eco }).attesa === true, false, 'un guasto no');
});

for (const code of ['CTX_SUMMARY_MODEL_UNAVAILABLE', 'CTX_CONTEXT_TOO_SMALL', 'CTX_SEGMENT_TOO_LARGE', 'CTX_SUMMARY_TOOLS']) {
  test(`LAVORO-FRASE-07 (R13) — ${code}: riprovare con lo stesso modello non cambia niente, il rimedio è sceglierne un altro`, () => {
    const e = fraseDelLavoro(lavoro(code), { traduci: eco });
    assert.equal(e.scegli, true);
    assert.ok(!e.testo.includes('chat.context.jobError.retry'), e.testo);
  });
}
