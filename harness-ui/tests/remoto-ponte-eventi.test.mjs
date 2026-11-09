import assert from 'node:assert/strict';
import test from 'node:test';

import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { eventiDentroIlTetto } from '../src/remoto/evento-dentro-il-tetto.mjs';
import { codifica } from '../src/remoto/filo.mjs';
import { ISCRIZIONI_MASSIME, creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * D-44, punto 15 del Mobile: un evento oltre il tetto del filo non impedisce di aprire la chat. Il filo è quello vero (`codifica`), il registro è finto ma rigioca come il vero: in modo
 *   sincrono, e l'ascoltatore si attacca prima che la rigiocata finisca di passare dalla coalescenza.
 */
function banco({ storia = [] } = {}) {
  const ascoltatori = new Set();
  const sessionRegistry = {
    esiste: () => true,
    iscriviti(_id, ascolta, daSequenza) {
      for (const e of storia) if ((e._sequenza ?? 0) > daSequenza) ascolta(e);
      ascoltatori.add(ascolta);
      return () => ascoltatori.delete(ascolta);
    },
  };
  const ricevuti = [];
  const contesto = {
    dispositivo: { id: 'A' }, iscrizioni: new Map(),
    iscrivi(sub, chiudi) { contesto.iscrizioni.set(sub, chiudi); return (data) => { const b = codifica({ t: 'evt', sub, data }); ricevuti.push(data); return Promise.resolve(b); }; },
  };
  return { ascoltatori, contesto, operazioni: creaOperazioni({ chiama: async () => ({}), sessionRegistry, iscriviConRigiocata, ogni: () => null, smetti: () => {} }), ricevuti };
}
const apri = (b, sub = 's') => b.operazioni.esegui('session.events', { sessionId: 'x', sub, after: 0 }, b.contesto);
const FINE = (e) => e.name === 'talos.fine-rigiocata';

test('EVENTI-01 D-44: un RunStarted da 1,2 MB si apre, ridotto e col suo numero, e il resto della chat arriva', async () => {
  const b = banco({ storia: [{ type: 'RunStarted', _sequenza: 1, runId: 'r1', input: 'x'.repeat(1_219_383), corto: 'c' }, { type: 'TextMessageStart', _sequenza: 2, messageId: 'm' }] });
  assert.deepEqual(await apri(b), { sub: 's', after: 0 });
  const [primo, secondo] = b.ricevuti;
  assert.deepEqual([primo.type, primo._sequenza, primo.runId, primo.corto, primo._ridotto], ['RunStarted', 1, 'r1', 'c', true]);
  assert.ok(primo.input.length < 20_000);
  assert.deepEqual([secondo.type, Object.hasOwn(secondo, '_ridotto')], ['TextMessageStart', false]);
  assert.ok(b.ricevuti.some(FINE));
});

test('EVENTI-02 D-44: un testo fuso dalla rigiocata si spezza: il testo è intero, e solo l\'ultimo pezzo porta il numero', async () => {
  const storia = Array.from({ length: 1_200 }, (_, i) => ({ type: 'TextMessageContent', messageId: 'm', delta: `${i % 10}`.repeat(1024), _sequenza: i + 1 }));
  const b = banco({ storia });
  await apri(b);
  const pezzi = b.ricevuti.filter((e) => e.type === 'TextMessageContent');
  assert.ok(pezzi.length > 1);
  assert.equal(pezzi.map((e) => e.delta).join(''), storia.map((e) => e.delta).join(''));
  assert.deepEqual(pezzi.map((e) => e._sequenza), [...Array(pezzi.length - 1).fill(undefined), 1_200]);
  assert.equal(pezzi.some((e) => e._ridotto), false, 'il testo non si perde');
  assert.ok(b.ricevuti.some(FINE));
});

test('EVENTI-03 D-44: il dal vivo non arriva a chi emette, e chiudere stacca l\'ascoltatore; i posti non si riempiono', async () => {
  const b = banco({ storia: [{ type: 'RunStarted', _sequenza: 1, input: 'x'.repeat(2 * 1024 * 1024) }] });
  await apri(b);
  const [ascolta] = b.ascoltatori;
  assert.doesNotThrow(() => ascolta({ type: 'ToolCallResult', _sequenza: 2, content: 'y'.repeat(2 * 1024 * 1024) }));
  assert.equal(b.ricevuti.at(-1)._ridotto, true);
  for (let i = 0; i < ISCRIZIONI_MASSIME + 3; i += 1) {
    await apri(b, 'stessa');
    await b.operazioni.esegui('session.unsubscribe', { sub: 'stessa' }, b.contesto);
  }
  assert.equal(b.ascoltatori.size, 1, 'resta solo la prima iscrizione aperta');
  assert.equal(b.contesto.iscrizioni.size, 1);
});

test('EVENTI-04 D-44: un guasto del filo diverso dal tetto non libera il posto in silenzio', async () => {
  const b = banco({ storia: [{ type: 'X', _sequenza: 1 }] });
  const vero = b.contesto.iscrivi;
  b.contesto.iscrivi = (sub, chiudi) => { vero(sub, chiudi); return () => { throw Object.assign(new Error('rotto'), { code: 'ALTRO' }); }; };
  await assert.rejects(apri(b), { code: 'ALTRO' });
  assert.equal(b.contesto.iscrizioni.size, 0, 'nessun posto occupato da un\'apertura fallita');
});

test('EVENTI-05 tanti pezzi piccoli: restano i campi semplici, e un carattere non si spezza a metà', () => {
  const [poco] = eventiDentroIlTetto({ type: 'T', _sequenza: 3, voci: Array.from({ length: 200_000 }, (_, i) => `v${i}`) });
  assert.deepEqual(poco, { type: 'T', _sequenza: 3, _ridotto: true });
  codifica({ t: 'evt', sub: 's', data: poco });
  const testo = `${'a'.repeat(128 * 1024 - 1)}😀${'b'.repeat(10)}`;
  const pezzi = eventiDentroIlTetto({ type: 'TextMessageContent', delta: testo, _sequenza: 9 });
  assert.equal(pezzi.map((p) => p.delta).join(''), testo);
  assert.doesNotMatch(pezzi[0].delta, /[\uD800-\uDBFF]$/u);
  const virgolette = eventiDentroIlTetto({ type: 'ToolCallArgs', delta: '\u0001'.repeat(2 * 1024 * 1024) });
  for (const p of virgolette) codifica({ t: 'evt', sub: 's', data: p });
});

test('EVENTI-06 M2: ogni pezzo porta `_pezzo`, testo e argomenti, e due rigiocate danno gli stessi id', async () => {
  for (const [tipo, campo] of [['TextMessageContent', 'messageId'], ['ToolCallArgs', 'toolCallId']]) {
    const storia = Array.from({ length: 1_200 }, (_, i) => ({ type: tipo, [campo]: 'm', delta: 'x'.repeat(1024), _sequenza: i + 1 }));
    const giro = async () => { const b = banco({ storia }); await apri(b); return b.ricevuti.filter((e) => e.type === tipo); };
    const primo = await giro();
    const secondo = await giro();
    assert.ok(primo.length > 1, tipo);
    assert.deepEqual(primo.map((e) => e._pezzo.n), primo.map((_, i) => i), `${tipo}: n parte da 0`);
    assert.deepEqual(primo.map((e) => e._pezzo.fine), primo.map((_, i) => i === primo.length - 1), `${tipo}: fine solo sull'ultimo`);
    assert.equal(new Set(primo.map((e) => e._pezzo.id)).size, 1, `${tipo}: un id solo`);
    assert.deepEqual(secondo.map((e) => e._pezzo), primo.map((e) => e._pezzo), `${tipo}: la rigiocata dà gli stessi id`);
    assert.deepEqual(primo.map((e) => e._sequenza), [...Array(primo.length - 1).fill(undefined), 1_200]);
  }
});

test('EVENTI-07 M2: con i gruppi interi, una caduta a metà dei pezzi non lascia doppioni sullo schermo', async () => {
  const storia = Array.from({ length: 1_200 }, (_, i) => ({ type: 'TextMessageContent', messageId: 'm', delta: `${i % 10}`.repeat(1024), _sequenza: i + 1 }));
  const vero = storia.map((e) => e.delta).join('');
  const b = banco({ storia });
  await apri(b);
  const pezzi = b.ricevuti.filter((e) => e.type === 'TextMessageContent');
  /* come il dispositivo del contratto: tiene i pezzi per id, applica all'arrivo di `fine`, alla ripartenza butta i gruppi incompleti */
  let schermo = '';
  let gruppo = new Map();
  const arriva = (e) => {
    const lista = gruppo.get(e._pezzo.id) ?? [];
    lista.push(e); gruppo.set(e._pezzo.id, lista);
    if (e._pezzo.fine) { schermo += lista.map((p) => p.delta).join(''); gruppo.delete(e._pezzo.id); }
  };
  pezzi.slice(0, 3).forEach(arriva);
  gruppo = new Map(); // la connessione cade qui
  pezzi.forEach(arriva);
  assert.equal(schermo, vero);
});

test('EVENTI-08 B4: un testo grande con un campo pesante accanto apre la chat lo stesso, e il testo resta intero', async () => {
  const delta = 'x'.repeat(200 * 1024);
  const evento = { type: 'TextMessageContent', messageId: 'm', delta, pesante: 'y'.repeat(2_000_000), _sequenza: 7 };
  const b = banco({ storia: [evento] });
  await apri(b);
  const pezzi = b.ricevuti.filter((e) => e.type === 'TextMessageContent');
  assert.ok(pezzi.length > 1);
  assert.equal(pezzi.map((e) => e.delta).join(''), delta);
  assert.equal(pezzi.at(-1)._sequenza, 7);
  assert.ok(pezzi.every((e) => e._ridotto === true && e.messageId === 'm'), 'il campo pesante non resta, e lo dice');
  for (const e of eventiDentroIlTetto({ ...evento, delta: '"'.repeat(150 * 1024) })) assert.doesNotThrow(() => codifica({ t: 'evt', sub: 's', data: e }));
});
