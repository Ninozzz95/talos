import assert from 'node:assert/strict';
import test from 'node:test';
import { creaCambioDiModello } from '../src/attesa-turno.mjs';
import { creaAperturaCondivisa } from '../src/apertura-condivisa.mjs';
import { giroSulModelloLocale } from '../src/session-registry.mjs';

/** One value per read; the last one stays. */
const sequenza = (...valori) => { let i = 0; return () => valori[Math.min(i++, valori.length - 1)]; };

function banco({ occupato = async () => false, giri = () => 0, modello = 'a', ...altro } = {}) {
  let adesso = 1_000;
  const s = { state: 'ready', modelId: modello };
  const scarichi = [];
  const prove = { letture: 0 };
  const cambio = creaCambioDiModello({
    stato: () => s,
    scarica: async () => { scarichi.push(s.modelId); s.state = 'unavailable'; s.modelId = null; },
    giriInCorso: (m) => Array.from({ length: giri(m) }, (_, i) => `s${i}`),
    motoreOccupato: async (o) => { prove.letture += 1; return occupato(o); },
    now: () => adesso,
    dormi: async (ms) => { adesso += ms; },
    ...altro,
  });
  return { cambio, s, scarichi, prove, ora: () => adesso };
}
const segnale = () => new AbortController().signal;

test('AT-01 nothing running: no wait beyond the two reads with the door closed, and the old model leaves', async () => {
  const b = banco();
  assert.equal(await b.cambio.prepara('b', segnale()), null);
  assert.deepEqual(b.scarichi, ['a']);
  assert.equal(b.prove.letture, 3, 'one to see it still, two with the door closed');
  assert.equal(b.ora(), 1_500);
});

test('AT-02 a turn with tools: the engine still between two steps is not the end of the turn (Performance)', async () => {
  /* generation, tool, generation, tool, generation, end */
  const occupato = sequenza(true, false, true, false, true, false);
  const giri = sequenza(1, 1, 1, 1, 1, 1, 0); // the first one is the snapshot of who may go on, then one look per read (third review, D3: also with the engine at work)
  const b = banco({ occupato: async () => occupato(), giri: () => giri() });
  await b.cambio.prepara('b', segnale());
  assert.deepEqual(b.scarichi, ['a']);
  assert.equal(b.ora(), 1_000 + 500 * 6, 'it left only when the turn was over, on the sixth read');
});

test('AT-03 the turns of the OLD model are the ones asked about', async () => {
  const chiesti = [];
  const b = banco({ giri: (m) => { chiesti.push(m); return 0; } });
  await b.cambio.prepara('b', segnale());
  assert.ok(chiesti.length > 0 && chiesti.every((m) => m === 'a'));
});

test('AT-04 the engine at work holds the change even with no turn: a summary in the background, or a request at the door', async () => {
  const occupato = sequenza(true, true, false, false, false);
  const b = banco({ occupato: async () => occupato() });
  await b.cambio.prepara('b', segnale());
  assert.equal(b.ora(), 1_000 + 500 * 3);
  assert.deepEqual(b.scarichi, ['a']);
});

test('AT-05 Desktop: a request that came in just before the door closed is not cut: two still reads in a row, and one at work starts them again', async () => {
  /* still (the turn is over) · door · still · at work · still · still */
  const occupato = sequenza(false, false, true, false, false);
  const b = banco({ occupato: async () => occupato() });
  await b.cambio.prepara('b', segnale());
  assert.equal(b.prove.letture, 5);
  assert.deepEqual(b.scarichi, ['a']);
});

test('AT-06 the door closes only when the turns are over: a turn in course must be able to take its next step, or it would never end', async () => {
  const viste = [];
  let cambio;
  const giri = sequenza(1, 1, 0);
  const b = banco({ giri: () => { viste.push(cambio.portaChiusa()); return giri(); } });
  cambio = b.cambio;
  await b.cambio.prepara('b', segnale());
  assert.deepEqual(viste, [false, false, false]);
});

test('AT-07 with the door closed nobody finds the model ready, and at the end it opens again', async () => {
  const durante = [];
  let cambio;
  const b = banco({ occupato: async () => { durante.push(cambio.portaChiusa()); return false; } });
  cambio = b.cambio;
  await b.cambio.prepara('b', segnale());
  assert.deepEqual(durante, [false, true, true]);
  assert.equal(b.cambio.portaChiusa(), false);
});

test('AT-08 the Stop during the wait: the old model stays ready, the door opens again, nothing is unloaded', async () => {
  const fermo = new AbortController();
  const occupato = sequenza(false, true);
  let letture = 0;
  const b = banco({ occupato: async () => { letture += 1; if (letture === 2) fermo.abort(new Error('stopped')); return occupato(); } });
  await assert.rejects(b.cambio.prepara('b', fermo.signal), /stopped/u);
  assert.deepEqual(b.scarichi, []);
  assert.equal(b.s.state, 'ready');
  assert.equal(b.cambio.portaChiusa(), false);
  assert.equal(b.cambio.inAttesa(), null);
});

test('AT-09 the Stop before anything, and a read that ends after the Stop does not decide', async () => {
  const fermo = new AbortController();
  fermo.abort(new Error('stopped'));
  const prima = banco();
  await assert.rejects(prima.cambio.prepara('b', fermo.signal), /stopped/u);
  assert.equal(prima.prove.letture, 0);
  const dopo = new AbortController();
  const b = banco({ occupato: async () => { dopo.abort(new Error('stopped')); return false; } });
  await assert.rejects(b.cambio.prepara('b', dopo.signal), /stopped/u);
  assert.deepEqual(b.scarichi, []);
});

test('AT-09b the Stop during the very last read: nothing is unloaded', async () => {
  const fermo = new AbortController();
  let letture = 0;
  const b = banco({ occupato: async () => { letture += 1; if (letture === 3) fermo.abort(new Error('stopped')); return false; } });
  await assert.rejects(b.cambio.prepara('b', fermo.signal), /stopped/u);
  assert.deepEqual(b.scarichi, []);
});

test('AT-10 the real pause ends at the Stop, not at its own time', async () => {
  const fermo = new AbortController();
  const cambio = creaCambioDiModello({ stato: () => ({ state: 'ready', modelId: 'a' }), scarica: async () => {}, giriInCorso: () => ['s'], motoreOccupato: async () => true, ogniMs: 60_000 });
  const inizio = performance.now();
  setTimeout(() => fermo.abort(new Error('stopped')), 20);
  await assert.rejects(cambio.prepara('b', fermo.signal), /stopped/u);
  assert.ok(performance.now() - inizio < 5_000);
});

test('AT-11 a long answer has no ceiling: only the end or the Stop', async () => {
  let letture = 0;
  const fermo = new AbortController();
  const b = banco({ giri: () => 1, occupato: async () => { letture += 1; if (letture === 5_000) fermo.abort(new Error('stopped')); return true; } });
  await assert.rejects(b.cambio.prepara('b', fermo.signal), /stopped/u);
  assert.equal(letture, 5_000);
});

test('AT-12 a turn that waits for its own child would wait for ever: a still engine frees it after the quiet time', async () => {
  const b = banco({ giri: () => 1, quieteMs: 2_000 });
  await b.cambio.prepara('b', segnale());
  assert.equal(b.ora(), 1_000 + 2_000 + 500);
  assert.deepEqual(b.scarichi, ['a']);
});

test('AT-12b the quiet exit is written in the engine log, and only then (Performance)', async () => {
  const righe = [];
  const b = banco({ giri: () => 1, quieteMs: 2_000, registro: (r) => righe.push(r) });
  await b.cambio.prepara('b', segnale());
  assert.deepEqual(righe, ['[talos] change of model: a was still for 2 s with a turn open: going on\n']);
  const senza = [];
  await banco({ registro: (r) => senza.push(r) }).cambio.prepara('b', segnale());
  assert.deepEqual(senza, []);
});

test('AT-13 the quiet time starts again whenever the engine works', async () => {
  const occupato = sequenza(false, false, false, true, false);
  const b = banco({ giri: () => 1, quieteMs: 2_000, occupato: async () => occupato() });
  await b.cambio.prepara('b', segnale());
  assert.equal(b.prove.letture, 9 + 2 - 1 + 1, 'it counted from the fifth read, not from the first');
});

test('AT-14 the model already open: nothing to do, and the state says so', async () => {
  const b = banco();
  assert.equal(await b.cambio.prepara('a', segnale()), b.s);
  assert.equal(b.prove.letture, 0);
  assert.deepEqual(b.scarichi, []);
});

test('AT-13b the owner: a true line. Who waits waits only for the turns open when it asked; a new turn on the old model stays behind', async () => {
  const s = { state: 'ready', modelId: 'a' };
  let aperti = ['uno'];
  let staDietroDurante;
  let rilascia;
  const cambio = creaCambioDiModello({ stato: () => s, scarica: async () => { s.state = 'unavailable'; s.modelId = null; }, giriInCorso: () => aperti, motoreOccupato: async () => false, ogniMs: 1,
    dormi: async () => { if (rilascia) rilascia(); await new Promise((r) => { setImmediate(r); }); } });
  const cambiato = cambio.prepara('b', segnale(), { sessione: 'b' });
  await new Promise((r) => { rilascia = r; });
  assert.equal(cambio.staDietro('uno'), false, 'the turn already open goes on with its steps');
  assert.equal(cambio.staDietro('nuova'), true, 'a new turn stays behind');
  assert.equal(cambio.staDietro(null), false, 'a request that does not say whose it is: the door is enough');
  staDietroDurante = cambio.staDietro('nuova');
  aperti = ['uno', 'nuova']; // the new turn has started, and it does not hold the change
  assert.equal(staDietroDurante, true);
  aperti = ['nuova'];
  await cambiato;
  assert.equal(cambio.staDietro('nuova'), false, 'the line ends with the change');
});

test('AT-13c a turn ended cannot come back ahead: a new turn of the same conversation stays behind', async () => {
  const s = { state: 'ready', modelId: 'a' };
  let aperti = ['uno', 'due'];
  let visto = null;
  let letture = 0;
  const cambio = creaCambioDiModello({ stato: () => s, scarica: async () => {}, giriInCorso: () => aperti, ogniMs: 1, dormi: async () => { await new Promise((r) => { setImmediate(r); }); },
    motoreOccupato: async () => { letture += 1; if (letture === 2) aperti = ['due']; if (letture === 3) { visto = cambio.staDietro('uno'); aperti = []; } return false; } });
  await cambio.prepara('b', segnale());
  assert.equal(visto, true);
});

test('AT-13d the turn that asks does not wait for itself: a summary on another local model the person chose', async () => {
  const b = banco({ giri: () => 1 });
  await b.cambio.prepara('b', segnale(), { sessione: 's0' });
  assert.deepEqual(b.scarichi, ['a']);
  assert.ok(b.ora() < 2_000, 'no quiet time');
});

test('AT-14b a model found open by `prima` is not opened again: the engine would refuse it', async () => {
  const stato = { state: 'ready', modelId: 'a' };
  const apertura = creaAperturaCondivisa({ apri: async () => assert.fail('already open') });
  assert.equal(await apertura.apri('a', { prima: async () => stato }), stato);
});

test('AT-15 an engine not ready: nothing to change, the opening goes on', async () => {
  for (const s of [{ state: 'unavailable' }, { state: 'failed', modelId: 'a' }, { state: 'loading', modelId: 'a' }, { state: 'ready' }, null]) {
    const cambio = creaCambioDiModello({ stato: () => s, scarica: async () => assert.fail('nothing to unload'), giriInCorso: () => [], motoreOccupato: async () => assert.fail('nothing to read') });
    assert.equal(await cambio.prepara('b', segnale()), null);
  }
});

test('AT-16 the router keeps the two models: no wait and no unload', async () => {
  const b = banco({ conRouter: true });
  assert.equal(await b.cambio.prepara('b', segnale()), null);
  assert.equal(b.prove.letture, 0);
  assert.deepEqual(b.scarichi, []);
});

test('AT-17 the engine gone by itself during the wait: nothing to unload', async () => {
  let b = null;
  const occupato = sequenza(false, false, false);
  b = banco({ occupato: async () => { if (b.prove.letture === 3) { b.s.state = 'failed'; } return occupato(); } });
  await b.cambio.prepara('b', segnale());
  assert.deepEqual(b.scarichi, []);
});

test('AT-18 while it waits it says for which model, from when, and `alVia` runs first; after it says nothing', async () => {
  const viste = [];
  let cambio;
  const b = banco({ occupato: async () => { viste.push(cambio.inAttesa()); return false; } });
  cambio = b.cambio;
  let chiamato = 0;
  await b.cambio.prepara('b', segnale(), { alVia: async () => { chiamato += viste.length + 1; } });
  assert.equal(chiamato, 1, 'before the first read');
  assert.equal(viste[0].modelId, 'b');
  assert.equal(viste[0].iniziatoIl, new Date(1_000).toISOString());
  assert.equal(b.cambio.inAttesa(), null);
});

test('AT-19 an unload that fails opens the door and goes up', async () => {
  const b = banco({ scarica: async () => { throw new Error('rotto'); } });
  await assert.rejects(b.cambio.prepara('b', segnale()), /rotto/u);
  assert.equal(b.cambio.portaChiusa(), false);
});

/* two conversations with tools on two models, as server.mjs puts the pieces together */
function dueConversazioni() {
  const s = { state: 'ready', modelId: 'a' };
  const passi = [];
  const giri = new Map();
  const cambio = creaCambioDiModello({
    stato: () => s,
    scarica: async () => { passi.push(`scarica:${s.modelId}`); s.state = 'unavailable'; s.modelId = null; },
    giriInCorso: (m) => Array.from({ length: giri.get(m) ?? 0 }, (_, i) => `${m}${i}`),
    motoreOccupato: async () => false,
    ogniMs: 1,
  });
  const apertura = creaAperturaCondivisa({ apri: async (modelId) => { passi.push(`apri:${modelId}`); s.state = 'ready'; s.modelId = modelId; return s; } });
  const pronto = (m) => !cambio.portaChiusa() && s.state === 'ready' && s.modelId === m;
  const chiede = (m, sessione = null) => (pronto(m) && !cambio.staDietro(sessione) ? Promise.resolve(s) : apertura.apri(m, { coda: true, prima: (segnale2) => cambio.prepara(m, segnale2, { sessione }) }));
  return { s, passi, giri, chiede, apertura, cambio };
}

test('AT-20 Performance: two turns with tools on two models, one change per turn', async () => {
  const c = dueConversazioni();
  c.giri.set('a', 1);
  const b = c.chiede('b'); // the second conversation arrives while the first is working
  for (let passo = 0; passo < 5; passo += 1) { await c.chiede('a'); await new Promise((r) => { setTimeout(r, 2); }); } // its steps find their model ready
  assert.deepEqual(c.passi, [], 'no change during the turn');
  c.giri.set('a', 0);
  await b;
  c.giri.set('b', 1);
  const dopo = c.chiede('a'); // the first comes back
  for (let passo = 0; passo < 5; passo += 1) { await c.chiede('b'); await new Promise((r) => { setTimeout(r, 2); }); }
  c.giri.set('b', 0);
  await dopo;
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b', 'scarica:b', 'apri:a'], 'one change per turn');
});

test('AT-20b the owner: a new chat on the old model goes behind the one waiting, and the model opens for it after', async () => {
  const c = dueConversazioni();
  c.giri.set('a', 1); // the turn open on a
  const b = c.chiede('b', 'chat-b');
  await new Promise((r) => { setTimeout(r, 2); });
  const nuova = c.chiede('a', 'chat-nuova');
  await new Promise((r) => { setTimeout(r, 2); });
  assert.deepEqual(c.apertura.inCoda(), ['a'], 'behind');
  c.giri.set('a', 0);
  await Promise.all([b, nuova]);
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b', 'scarica:b', 'apri:a']);
});

test('AT-21 three models: one line, in order of arrival, and nobody unloads the other', async () => {
  const c = dueConversazioni();
  c.giri.set('a', 1);
  const b = c.chiede('b');
  await new Promise((r) => { setTimeout(r, 2); });
  const d = c.chiede('c');
  await new Promise((r) => { setTimeout(r, 2); });
  assert.deepEqual(c.apertura.inCoda(), ['c'], 'the second one is in line, and the row can say so');
  c.giri.set('a', 0);
  await Promise.all([b, d]);
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b', 'scarica:b', 'apri:c']);
  assert.deepEqual(c.apertura.inCoda(), []);
});

test('AT-22 the Stop of the one in line leaves the line, and the first goes on', async () => {
  const c = dueConversazioni();
  c.giri.set('a', 1);
  const b = c.chiede('b');
  await new Promise((r) => { setTimeout(r, 2); });
  const fermo = new AbortController();
  const d = c.apertura.apri('c', { coda: true, signal: fermo.signal, prima: (segnale2) => c.cambio.prepara('c', segnale2) });
  await new Promise((r) => { setTimeout(r, 2); });
  fermo.abort(new Error('stopped'));
  await assert.rejects(d, /stopped/u);
  assert.deepEqual(c.apertura.inCoda(), []);
  c.giri.set('a', 0);
  await b;
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b']);
});

test('AT-23 a chat in line for the model the first one is opening joins it: one opening', async () => {
  const c = dueConversazioni();
  c.giri.set('a', 1);
  const uno = c.chiede('b');
  await new Promise((r) => { setTimeout(r, 2); });
  const due = c.chiede('b');
  c.giri.set('a', 0);
  await Promise.all([uno, due]);
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b']);
});

test('AT-24 who was in line for the model that is open by then does not open it again', async () => {
  const c = dueConversazioni();
  c.giri.set('a', 1);
  const b = c.chiede('b');
  await new Promise((r) => { setTimeout(r, 2); });
  /* the first conversation comes back while the door is about to close: it goes in line for its own model */
  const a = c.apertura.apri('a', { coda: true, prima: (segnale2) => c.cambio.prepara('a', segnale2) });
  await new Promise((r) => { setTimeout(r, 2); });
  c.giri.set('a', 0);
  await Promise.all([a, b]);
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b', 'scarica:b', 'apri:a']);
});

test('AT-24b who counts as a turn on the model', () => {
  const voce = { provider: 'local', modelId: 'a', conclusa: false };
  assert.equal(giroSulModelloLocale(voce, 'a'), true);
  /* the chat page sends only `modello`, so a real chat is born so (`http-app.mjs:2498`, `app.js:25910`): the reviewer saw it live */
  assert.equal(giroSulModelloLocale({ provider: 'cloud', modelId: 'local:a', modello: 'local:a', conclusa: false }, 'a'), true, 'a real chat');
  assert.equal(giroSulModelloLocale({ provider: 'cloud', modelId: 'local:b', modello: 'local:b', conclusa: false }, 'a'), false);
  assert.equal(giroSulModelloLocale(voce, 'b'), false, 'another model');
  assert.equal(giroSulModelloLocale({ ...voce, conclusa: true }, 'a'), false, 'over');
  assert.equal(giroSulModelloLocale({ ...voce, interrotta: true }, 'a'), false, 'interrupted');
  assert.equal(giroSulModelloLocale({ provider: 'cloud', modello: 'openrouter:a', modelId: 'openrouter:a', conclusa: false }, 'a'), false, 'not local');
  assert.equal(giroSulModelloLocale(null, 'a'), false);
  assert.equal(giroSulModelloLocale({ ...voce, approvazionePendente: {} }, 'a'), false, 'on a permission card');
  assert.equal(giroSulModelloLocale({ ...voce, domandaPendente: {} }, 'a'), false, 'on a question');
  assert.equal(giroSulModelloLocale({ provider: 'local', modelId: 'a' }, 'a'), false, 'never started');
});

test('AT-25 Desktop: a turn stopped on a card does not hold the line, and the answer that comes while the new model writes waits without cutting it', async () => {
  const c = dueConversazioni();
  /* the first conversation is on a card: `giriSulModelloLocale` does not count it, so `a` has no turns */
  c.giri.set('a', 0);
  await c.chiede('b');
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b'], 'the change went through with no Stop');
  c.giri.set('b', 1); // the second conversation is writing
  const rispostaAllaCarta = c.chiede('a');
  await new Promise((r) => { setTimeout(r, 5); });
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b'], 'b is not cut');
  assert.equal(c.s.modelId, 'b');
  c.giri.set('b', 0);
  await rispostaAllaCarta;
  assert.deepEqual(c.passi, ['scarica:a', 'apri:b', 'scarica:b', 'apri:a']);
});
