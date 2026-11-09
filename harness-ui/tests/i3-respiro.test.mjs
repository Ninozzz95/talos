/*
 * I3 (cloud review of PR 21, assigned to the local engine lane by the Desktop, 04/11/2026): a call held whole by the translator of the
 * emulated tools (written while thinking, or with its fields in another order) sends nothing while the model writes it, and the kernel cuts a
 * stream with no data after 300 s (PROVIDER_SILENCE). Cure, version 2 of the form, with the OK of Performance, Mobile and CLI: every 15 s with
 * nothing out, while a call is held, the translator sends a piece with only `talos_respiro: true`; the kernel counts it as a datum and keeps
 * nothing of it. Form: Downloads/TALOS/motore-locale/in-corso/FORMA-I3-RESPIRO-CHIAMATA-TRATTENUTA-2026-11-04.md.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORMATI, creaEmulatore, creaTraduttore } from '../src/attrezzi-emulati.mjs';
import { consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

const enc = new TextEncoder();
const orologio = () => { const o = { ora: 0 }; o.adesso = () => o.ora; return o; };
const traduttore = (o) => { let n = 0; return creaTraduttore({ formato: FORMATI.etichette, modello: 'm', nuovoId: () => (n += 1), adesso: o.adesso }); };
const respiro = (p) => p.choices[0].delta.talos_respiro === true;
const chiamataDa = (pezzi) => {
  const parti = pezzi.flatMap((p) => p.choices[0].delta.tool_calls ?? []);
  return parti.length ? { id: parti[0].id, nome: parti[0].function?.name, argomenti: parti.map((c) => c.function?.arguments ?? '').join('') } : null;
};
const NEL_PENSIERO = '<think>penso. <tool_call>{"name": "write_file", "arguments": {"path": "a.md", "content": "';
const ALTRO_ORDINE = '<tool_call>{"arguments": {"path": "a.md", "content": "';
/** How each start closes into a real call: the name comes last when the fields are in another order. */
const CHIUSURA = { [NEL_PENSIERO]: '"}}', [ALTRO_ORDINE]: '"}, "name": "write_file"}' };

/** The same model, written step by step; `passo` seconds go by before each piece. Gives every step's pieces and the end. */
function scrivi(inizio, { passo, volte = 7, chiusura = CHIUSURA[inizio] } = {}) {
  const o = orologio();
  const t = traduttore(o);
  const passi = [t.spingi(inizio)];
  for (let i = 0; i < volte; i += 1) { o.ora += passo; passi.push(t.spingi('riga ')); }
  o.ora += passo;
  passi.push(t.spingi(chiusura));
  const fine = t.fine({ stop_type: 'eos' });
  return { passi, fine, tutti: [...passi.flat(), ...fine], testoEsatto: t.testoEsatto() };
}

test('I3-1: a call held inside the thinking, 20 s with nothing out while the model still writes: one breath the kernel counts', () => {
  const o = orologio();
  const t = traduttore(o);
  assert.equal(t.spingi(NEL_PENSIERO).map((p) => p.choices[0].delta.reasoning_content).join(''), 'penso. ');
  o.ora = 20;
  const pezzi = t.spingi('riga ');
  assert.equal(pezzi.length, 1);
  assert.deepEqual(pezzi[0].choices, [{ index: 0, delta: { talos_respiro: true }, finish_reason: null }]);
  assert.equal(pezzi[0].id, 'talos-1', 'the same answer as every other piece');
  assert.equal(pezzi[0].object, 'chat.completion.chunk');
});

test('I3-2: at most one breath every 15 s, and the count starts again from the last piece that went out', () => {
  const o = orologio();
  const t = traduttore(o);
  t.spingi(NEL_PENSIERO);
  const dove = [];
  for (const ora of [20, 30, 34, 35, 49, 50]) { o.ora = ora; if (t.spingi('x').some(respiro)) dove.push(ora); }
  assert.deepEqual(dove, [20, 35, 50]);
  const o2 = orologio();
  const t2 = traduttore(o2);
  t2.spingi('<think>a');
  o2.ora = 10;
  assert.ok(t2.spingi(' b <tool_call>{"name": "w", "arguments": {"c": "').length > 0, 'thinking went out at 10');
  o2.ora = 20;
  assert.deepEqual(t2.spingi('x'), [], '10 s after the last piece, not 20 after the start');
  o2.ora = 25;
  assert.ok(t2.spingi('x').some(respiro));
});

test('I3-3 (Performance): the call, the saved text and the exact text are the same with and without breaths; a breath has no text, thinking or call', () => {
  for (const inizio of [NEL_PENSIERO, ALTRO_ORDINE]) {
    const con = scrivi(inizio, { passo: 20 });
    const senza = scrivi(inizio, { passo: 0 });
    assert.ok(con.tutti.filter(respiro).length >= 7, 'premise: breaths were sent');
    assert.equal(senza.tutti.filter(respiro).length, 0);
    for (const p of con.tutti.filter(respiro)) assert.deepEqual(p.choices[0].delta, { talos_respiro: true });
    assert.deepEqual(con.tutti.filter((p) => !respiro(p)), senza.tutti, inizio);
    assert.equal(con.testoEsatto, senza.testoEsatto);
    assert.deepEqual(chiamataDa(con.fine), chiamataDa(senza.fine));
    assert.equal(chiamataDa(con.fine)?.nome, 'write_file', 'premise: it is a call');
  }
});

test('I3-4: the same breath outside the thinking, when the fields come in another order and the call is read whole at the end', () => {
  const o = orologio();
  const t = traduttore(o);
  assert.deepEqual(t.spingi(ALTRO_ORDINE), []);
  o.ora = 20;
  assert.deepEqual(t.spingi('riga').map((p) => p.choices[0].delta), [{ talos_respiro: true }]);
  t.spingi('"}, "name": "write_file"}');
  assert.deepEqual(chiamataDa(t.fine({ stop_type: 'eos' })), { id: 'emulata-talos-1', nome: 'write_file', argomenti: '{"path":"a.md","content":"riga"}' });
});

test('I3-5, the other way: no breath while data goes out (arguments in pieces, text, normal thinking)', () => {
  for (const [inizio, poi] of [
    ['<tool_call>{"name": "w", "arguments": {"c": "', 'x'.repeat(100)],
    ['ciao', ' ancora'],
    ['<think>penso', ' ancora'],
  ]) {
    const o = orologio();
    const t = traduttore(o);
    const pezzi = [t.spingi(inizio)];
    for (let i = 0; i < 5; i += 1) { o.ora += 20; pezzi.push(t.spingi(poi)); }
    assert.equal(pezzi.flat().filter(respiro).length, 0, inizio);
    assert.ok(pezzi.slice(1).every((p) => p.length > 0), 'every step sent its own data');
  }
  /* only while the call is held: not in the last 64 characters of a call already on its way, not in a piece of label held back in the text */
  for (const [inizio, poi] of [['<tool_call>{"name": "w", "arguments": {"c": "', 'x'], ['ciao ', '<tool']]) {
    const o = orologio();
    const t = traduttore(o);
    assert.ok(t.spingi(inizio).length > 0, inizio);
    o.ora = 20;
    assert.deepEqual(t.spingi(poi), [], `${inizio} then ${poi}`);
  }
});

const frame = (p) => enc.encode(`data: ${JSON.stringify(p)}\n\n`);
const subito = (pezzi) => new Response(new ReadableStream({ start(c) { for (const p of pezzi) c.enqueue(frame(p)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
/** One step every `ogniMs`: a step with no piece sends nothing on the wire, as the stream of the door does. */
function aPassi(passi, fine, ogniMs) {
  let timer = null; let i = 0;
  return new Response(new ReadableStream({
    start(c) {
      timer = setInterval(() => {
        if (i < passi.length) { for (const p of passi[i]) c.enqueue(frame(p)); i += 1; return; }
        clearInterval(timer);
        for (const p of fine) c.enqueue(frame(p));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
      }, ogniMs);
    },
    cancel() { clearInterval(timer); },
  }));
}
async function nelKernel(risposta, o = {}) {
  const eventi = [];
  const esito = await consumaFlussoSSE(risposta, (e) => eventi.push(e), o);
  return { scelta: esito.scelta, eventi };
}

test('I3-6 (CLI, Mobile): a breath reaches no client: no event, no empty text or thinking, and nothing in the saved choice', async () => {
  for (const inizio of [ALTRO_ORDINE, NEL_PENSIERO]) {
    const con = scrivi(inizio, { passo: 20 });
    const senza = scrivi(inizio, { passo: 0 });
    assert.ok(con.tutti.some(respiro), 'premise: breaths were sent');
    const a = await nelKernel(subito(con.tutti));
    const b = await nelKernel(subito(senza.tutti));
    assert.deepEqual(a.eventi, b.eventi, inizio);
    assert.deepEqual(a.scelta, b.scelta, inizio);
    assert.equal(a.scelta.tool_calls?.[0]?.function?.name, 'write_file', 'premise: it is a call');
    if (inizio === ALTRO_ORDINE) assert.equal(a.eventi.filter((e) => e.tipo === 'testo' || e.tipo === 'ragionamento').length, 0, 'no answer made of nothing');
  }
});

test('I3-K: the real kernel guard: held call with breaths past the idle limit arrives whole; without breaths the same wait is PROVIDER_SILENCE', async () => {
  const con = scrivi(NEL_PENSIERO, { passo: 20 });
  const senza = scrivi(NEL_PENSIERO, { passo: 0 });
  const atteso = await nelKernel(subito(senza.tutti));
  const vivo = await nelKernel(aPassi(con.passi, con.fine, 100), { inattivitaDatiMs: 300 });
  assert.deepEqual(vivo.scelta, atteso.scelta, 'the saved choice is the one without breaths');
  assert.equal(vivo.scelta.tool_calls?.[0]?.function?.name, 'write_file');
  await assert.rejects(nelKernel(aPassi(senza.passi, senza.fine, 100), { inattivitaDatiMs: 300 }), (e) => e?.code === 'PROVIDER_SILENCE');
});

test('I3-7 (CLI), the other way: an engine that goes quiet still ends in PROVIDER_SILENCE: the breath is born of a piece of the model, never of a timer', async () => {
  const LEGGI = { type: 'function', function: { name: 'write_file', parameters: { type: 'object' } } };
  const json = (x) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } });
  let chiuso = false;
  const muto = () => new Response(new ReadableStream({
    start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ content: NEL_PENSIERO })}\n\n`)); },
    cancel() { chiuso = true; },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const chiama = async (percorso, o = {}) => {
    const corpo = o.body ? JSON.parse(o.body) : null;
    if (percorso.startsWith('/props')) return json({ chat_template_caps: { supports_tools: false } });
    if (percorso === '/tokenize') return json({ tokens: corpo.content === '<tool_call>' ? [1] : [1, 2, 3] });
    if (percorso === '/apply-template') return json({ prompt: 'P' });
    if (percorso === '/completion') return muto();
    throw new Error(`unexpected ${percorso}`);
  };
  const r = await creaEmulatore({ chiama, nuovoId: () => 'x', registro: () => {} }).genera({ model: 'm', stream: true, messages: [{ role: 'user', content: 'U' }], tools: [LEGGI] });
  await assert.rejects(consumaFlussoSSE(r, () => {}, { inattivitaDatiMs: 300 }), (e) => e?.code === 'PROVIDER_SILENCE');
  assert.equal(chiuso, true, 'the engine stream was let go');
});
