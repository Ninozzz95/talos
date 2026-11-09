/*
 * Banco di Performance sulla candidata (04/11/2026, caso B, z-ai/glm-5.3-flash): 4 /compact su 10 morti con CTX_INVALID_SOURCE
 * «Nessuna citazione corrisponde agli originali (es. «174. cobalt copper bridge …» in message-7 (174))».
 * Misurato sugli eventi veri delle quattro corse (fissaggio `fixtures/banco-perf-2026-11-04-citazioni.json`, tratti copiati dai
 * `ToolCallResult` delle sessioni 06e11660, 19a70608, 878e312f, 305873d6): ogni citazione c'è ALLA LETTERA nel risultato di lettura
 * (anche «174. », che è una riga del file del banco, non un numero messo dall'attrezzo). Ciò che non c'è è il record: il modello
 * scrive come `recordId` «message-7 (174)», «message-7:174», o il solo numero di riga «174», «184».
 * ⇒ Un `recordId` che non esiste si ritrova dalla citazione: il record del segmento che la contiene, se è uno solo; fra più record,
 *   quello il cui id apre il `recordId` scritto. La citazione resta verificata alla lettera (o con le sole tolleranze di sempre), e
 *   una inventata resta respinta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSummary } from '../src/summary.mjs';

const CASI = JSON.parse(readFileSync(new URL('./fixtures/banco-perf-2026-11-04-citazioni.json', import.meta.url), 'utf8'));
const IDS = ['message-5', 'message-7', 'message-9'];
const recordsDi = (caso) => [
  { id: 'message-2', message: { role: 'user', content: 'There are 2 text files in this folder: report1.txt, report2.txt. Read all of them.' } },
  ...caso.tratti.map((testo, i) => ({ id: IDS[i], message: { role: 'tool', tool_call_id: `call_${i}`, content: testo } })),
];
const risposta = (sources) => ({ text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'The person asked for the codes.', goal: 'Read the reports', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources }), finishReason: 'stop' });

for (const caso of CASI) {
  test(`BANCO-PERF-CIT ${caso.sid.slice(0, 8)}: recordId «${caso.recordIdDelModello}» is found again from its verbatim quote`, () => {
    const records = recordsDi(caso);
    const summary = validateSummary(risposta([{ recordId: caso.recordIdDelModello, quote: caso.quote }]), { records });
    assert.equal(summary.sources.length, 1, JSON.stringify(summary.unverifiedSources));
    const [s] = summary.sources;
    assert.equal(s.recordId, IDS[caso.dove], 'the REAL record id, the one the archive check looks up');
    const originale = records.find(r => r.id === s.recordId).message.content;
    assert.equal(originale.slice(s.start, s.start + s.quote.length), s.quote, 'the archive check (context-export.mjs::sources)');
    assert.equal(s.quote, caso.quote);
  });
}

test('BANCO-PERF-CIT counter-proof: an invented quote under a mangled id is still refused', () => {
  const records = recordsDi(CASI[0]);
  assert.throws(() => validateSummary(risposta([{ recordId: '174', quote: '174. cobalt copper bridge signal pepper cedar bridge engine harbor 0000000000' }]), { records }), { code: 'CTX_INVALID_SOURCE' });
});

test('BANCO-PERF-CIT counter-proof: a quote found in two records under a bare number is ambiguous, and dropped', () => {
  const caso = CASI[0];
  const riga = caso.quote;
  const records = [
    { id: 'message-5', message: { role: 'tool', tool_call_id: 'a', content: `x\n${riga}\ny` } },
    { id: 'message-7', message: { role: 'tool', tool_call_id: 'b', content: `z\n${riga}\nw` } },
  ];
  assert.throws(() => validateSummary(risposta([{ recordId: '174', quote: riga }]), { records }), { code: 'CTX_INVALID_SOURCE' });
  /* fra i due, l'id che apre il recordId scritto decide */
  const s = validateSummary(risposta([{ recordId: 'message-7 (174)', quote: riga }]), { records }).sources;
  assert.deepEqual(s.map(x => x.recordId), ['message-7']);
  /* «message-70» non è «message-7»: il confine dopo l'id è un carattere che non fa parte di un id */
  assert.throws(() => validateSummary(risposta([{ recordId: 'message-70', quote: riga }]), { records }), { code: 'CTX_INVALID_SOURCE' });
});

test('BANCO-PERF-CIT counter-proof: two records with the same text and TWO ids that open the written one: nothing', () => {
  const riga = CASI[0].quote;
  const records = [
    { id: 'a', message: { role: 'tool', tool_call_id: 'a', content: `x\n${riga}` } },
    { id: 'a-b', message: { role: 'tool', tool_call_id: 'b', content: `z\n${riga}` } },
  ];
  assert.throws(() => validateSummary(risposta([{ recordId: 'a-b (174)', quote: riga }]), { records }), { code: 'CTX_INVALID_SOURCE' });
});

test('BANCO-PERF-CIT counter-proof: a KNOWN record id keeps the strict check (a quote from another record is not moved)', () => {
  const caso = CASI[0];
  const records = recordsDi(caso);
  const altro = IDS[1 - caso.dove];
  assert.throws(() => validateSummary(risposta([{ recordId: altro, quote: caso.quote }]), { records }), { code: 'CTX_INVALID_SOURCE' });
});

test('BANCO-PERF-CIT counter-proof: an id of another kind (not a mangled id of this segment, not a bare line number) is not derived', () => {
  const caso = CASI[0];
  const records = recordsDi(caso);
  for (const recordId of ['another-chat', 'm7', 'message 7', 'line-174']) {
    assert.throws(() => validateSummary(risposta([{ recordId, quote: caso.quote }]), { records }), { code: 'CTX_INVALID_SOURCE' }, recordId);
  }
});
