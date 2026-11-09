/*
 * E1, decision 121 (owner 03/11/2026, option (d); form FORMA-CARTA-EMULATI-D-2026-11-03.md with the OKs of CLI, Mobile and
 * Performance; plan PIANO-E1-CARTA-EMULATI-2026-11-04.md, Desktop «vai» 04/11 11:25). A model with no tools of its own runs on
 * the emulated tools: its calls come out of the adapter as `emulata-<uuid>`. Decision 44: such a call passes the card of the
 * person first, at every access level, except reading inside the project; a yes «for this tool in this conversation» covers
 * that tool only; the bans of today stay above it. Kernel tests 1-9 of the form.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora, letturaEmulataNelProgetto } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { motivoDaChiedere, chiaveDelConsensoDi } from '../src/path-policy.mjs';

const LOCALE = 'ollama:llama3';
const FINE = { role: 'assistant', content: 'ok' };
const chiama = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
/* a local model is always read as a stream (`consumaFlussoSSE`): the message goes out as the chat route writes it */
const enc = new TextEncoder();
const flusso = (messaggio) => new Response(new ReadableStream({
  start(c) {
    const manda = (delta, fine) => c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta, ...(fine ? { finish_reason: fine } : {}) }] })}\n\n`));
    if (messaggio.tool_calls) for (const [index, tc] of messaggio.tool_calls.entries()) manda({ tool_calls: [{ index, id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } }] });
    else manda({ content: messaggio.content });
    manda({}, messaggio.tool_calls ? 'tool_calls' : 'stop');
    c.enqueue(enc.encode('data: [DONE]\n\n'));
    c.close();
  },
}));
function cartella(t, prefisso = 'e1-carta-') {
  const c = mkdtempSync(join(tmpdir(), prefisso));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* already gone */ } });
  return c;
}
/** One turn: the model makes the calls in order, then ends. `ospite(azione)` answers every card; `null` ⇒ no host channel. */
async function giro(t, { chiamate, ospite = async () => true, livelloAccesso = 'accesso-pieno', personaPresenteFn = () => true, senzaPorta = false, cartellaDelGiro, ...altro }) {
  const dir = cartellaDelGiro ?? cartella(t);
  writeFileSync(join(dir, 'a.txt'), 'CONTENUTO-DI-A\n');
  const risposte = [...chiamate.map(([id, nome, argomenti]) => chiama(id, nome, argomenti)), FINE];
  const corpi = [], chieste = [], eventi = [];
  await talosLavora({
    cartella: dir, task: { consegna: 'lavora' }, modello: LOCALE, chiave: 'finta', livelloAccesso,
    ...(senzaPorta ? {} : { personaPresenteFn }),
    ...(ospite === null ? {} : { chiediApprovazioneFn: async (a) => { chieste.push(a); return ospite(a); } }),
    onDelta: () => {}, onGiro: (e) => eventi.push(e),
    fetchDiRete: async (_u, o) => {
      const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
      corpi.push(JSON.parse(o.body));
      return flusso(scelta);
    },
    ...altro,
  });
  const esiti = corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
  const carteEmulate = chieste.filter((a) => a.tipo === 'chiamata-dal-testo' && a.emulata === true);
  return { dir, chieste, carteEmulate, esiti, eventi };
}
const scritto = (dir, nome = 'b.txt') => existsSync(join(dir, nome)) ? readFileSync(join(dir, nome), 'utf8') : null;

test('E1-01: an emulated write in full access brings the card of the person, with the tool named, and runs after the yes', async (t) => {
  const r = await giro(t, { chiamate: [['emulata-1', 'scrivi', { percorso: 'b.txt', contenuto: 'scritto' }]] });
  assert.equal(r.carteEmulate.length, 1, JSON.stringify(r.chieste.map((a) => a.tipo)));
  const carta = r.carteEmulate[0];
  assert.equal(carta.toolCallId, 'emulata-1');
  assert.equal(carta.nome, 'scrivi');
  assert.equal(carta.semprePersona, true, 'no host answers it by itself (CLI)');
  assert.equal(carta.fraseChiave, 'server.approval.emulatedCall');
  assert.equal(r.chieste.length, 1, 'one card, not two: the ordinary card of the same call is covered by the yes');
  assert.equal(scritto(r.dir), 'scritto');
});

test('E1-02: AL CONTRARIO, a native call of a model with tools of its own: nothing changes, no card in full access', async (t) => {
  const r = await giro(t, { chiamate: [['call_1', 'scrivi', { percorso: 'b.txt', contenuto: 'nativo' }]] });
  assert.deepEqual(r.chieste, []);
  assert.equal(scritto(r.dir), 'nativo');
});

test('E1-03: an emulated read inside the project needs no card', async (t) => {
  const r = await giro(t, { chiamate: [['emulata-2', 'leggi', { percorso: 'a.txt' }], ['emulata-2b', 'elenca', {}], ['emulata-2c', 'cerca', { testo: 'CONTENUTO' }]] });
  assert.deepEqual(r.carteEmulate, []);
  assert.deepEqual(r.chieste, []);
  assert.match(r.esiti[0], /CONTENUTO-DI-A/u);
});

test('E1-04: an emulated read OUTSIDE the project brings the card, even in full access', async (t) => {
  const fuori = cartella(t, 'e1-fuori-');
  writeFileSync(join(fuori, 'f.txt'), 'FUORI\n');
  const r = await giro(t, { chiamate: [['emulata-3', 'leggi', { percorso: join(fuori, 'f.txt') }]], ospite: async () => false });
  assert.equal(r.carteEmulate.length, 1);
  assert.doesNotMatch(r.esiti[0], /FUORI/u, 'nothing was read after the no');
  /* the folder named in a search counts as a path too */
  const s = await giro(t, { chiamate: [['emulata-3b', 'cerca', { testo: 'FUORI', dentro: fuori }]], ospite: async () => false });
  assert.equal(s.carteEmulate.length, 1);
});

test('E1-05: an emulated page read brings the card: the network is not a reading of the project', async (t) => {
  const r = await giro(t, { chiamate: [['emulata-4', 'naviga', { url: 'http://127.0.0.1:9/' }]], ospite: async () => false });
  assert.equal(r.carteEmulate.length, 1);
  assert.equal(r.carteEmulate[0].nome, 'naviga');
});

test('E1-06: a yes for the tool covers that tool only; another tool asks, and a secret still asks', async (t) => {
  const consensiSessione = {};
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto', consensiSessione,
    /* the host plays the server: «yes for this tool in this conversation» puts the name in the session consents */
    ospite: async (a) => {
      if (a.tipo === 'chiamata-dal-testo' && a.nome === 'scrivi') { (consensiSessione.strumentiEmulatiConsentiti ??= []).push('scrivi'); return true; }
      if (a.tipo === 'chiamata-dal-testo') return false;
      return true;
    },
    chiamate: [
      ['emulata-5', 'scrivi', { percorso: 'b.txt', contenuto: 'uno' }],
      ['emulata-6', 'scrivi', { percorso: 'c.txt', contenuto: 'due' }],
      ['emulata-7', 'shell', { comando: 'echo ciao' }],
      ['emulata-8', 'scrivi', { percorso: '.env', contenuto: 'K=1' }],
    ],
  });
  assert.deepEqual(r.carteEmulate.map((a) => [a.toolCallId, a.nome]), [['emulata-5', 'scrivi'], ['emulata-7', 'shell']], 'the second write has no card, the command has one');
  assert.equal(scritto(r.dir, 'c.txt'), 'due');
  const segreto = r.chieste.filter((a) => a.toolCallId === 'emulata-8');
  assert.equal(segreto.length, 1, JSON.stringify(r.chieste.map((a) => [a.tipo, a.toolCallId])));
  assert.ok(segreto[0].segreto, 'the forced sign still reaches the person');
});

test('E1-07: the bans stay above the yes for the tool: Plan, read only, «nega» for the tool', async (t) => {
  for (const [nome, altro] of [
    ['Piano', { modalitaOperativa: 'piano' }],
    ['sola lettura', { livelloAccesso: 'lettura' }],
    ['nega', { permessiPerAttrezzo: { scrivi: 'nega' } }],
  ]) {
    const r = await giro(t, { consensiSessione: { strumentiEmulatiConsentiti: ['scrivi'] }, chiamate: [['emulata-9', 'scrivi', { percorso: 'b.txt', contenuto: 'no' }]], ...altro });
    assert.equal(scritto(r.dir), null, nome);
    assert.match(r.esiti[0], /^(REFUSED|DECLINED)/u, nome);
  }
});

test('E1-07b: rule 17, no card for a call a ban refuses anyway (Plan, «nega» for the tool), and nothing runs', async (t) => {
  for (const [nome, altro] of [
    ['Piano', { modalitaOperativa: 'piano' }],
    ['nega', { permessiPerAttrezzo: { scrivi: 'nega' } }],
    /* Desktop 04/11 11:46 on 5293085ef: in read only a card that always ends in a refusal is a wasted interruption */
    ['sola lettura', { livelloAccesso: 'lettura' }],
  ]) {
    const r = await giro(t, { chiamate: [['emulata-9b', 'scrivi', { percorso: 'b.txt', contenuto: 'no' }]], ...altro });
    assert.deepEqual(r.carteEmulate, [], nome);
    assert.equal(scritto(r.dir), null, nome);
    assert.match(r.esiti[0], /^REFUSED/u, nome);
  }
  /* AL CONTRARIO: in read only an emulated page read is still allowed by the level, so it still asks */
  const pagina = await giro(t, { livelloAccesso: 'lettura', chiamate: [['emulata-9c', 'naviga', { url: 'http://127.0.0.1:9/' }]], ospite: async () => false });
  assert.equal(pagina.carteEmulate.length, 1, 'a page read in read only still brings the card');
});

test('E1-09b: a child starts without a card when the chain carries the yes for the tool; without it nothing runs', async (t) => {
  const con = await giro(t, { agentRole: 'child', consensiSessione: { strumentiEmulatiConsentiti: ['scrivi'] }, chiamate: [['emulata-21', 'scrivi', { percorso: 'b.txt', contenuto: 'figlia' }]] });
  assert.deepEqual(con.carteEmulate, []);
  assert.equal(scritto(con.dir), 'figlia');
  const senza = await giro(t, { agentRole: 'child', chiamate: [['emulata-22', 'scrivi', { percorso: 'b.txt', contenuto: 'figlia' }]] });
  assert.deepEqual(senza.carteEmulate, []);
  assert.equal(scritto(senza.dir), null);
  assert.match(senza.esiti[0], /^REFUSED\./u);
});

test('E1-08: the no of the person is DECLINED; after two no in the same turn no more cards, and nothing runs', async (t) => {
  const r = await giro(t, {
    ospite: async () => false,
    chiamate: [1, 2, 3].map((n) => [`emulata-1${n}`, 'scrivi', { percorso: 'b.txt', contenuto: String(n) }]),
  });
  assert.equal(r.carteEmulate.length, 2, 'two cards, not three');
  assert.equal(scritto(r.dir), null);
  assert.match(r.esiti[0], /^DECLINED\./u);
  assert.match(r.esiti[1], /^DECLINED\./u);
  assert.match(r.esiti[2], /^(DECLINED|REFUSED)\./u);
});

test('E1-09: no client or nobody here: no card and nothing runs', async (t) => {
  for (const [nome, opzioni] of [
    ['host without the presence door', { senzaPorta: true }],
    ['the person is not here', { personaPresenteFn: () => false }],
    ['no approval channel', { ospite: null }],
    ['nobody in front', { nessunoDavanti: true }],
  ]) {
    const r = await giro(t, { chiamate: [['emulata-20', 'scrivi', { percorso: 'b.txt', contenuto: 'x' }]], ...opzioni });
    assert.deepEqual(r.carteEmulate, [], nome);
    assert.equal(scritto(r.dir), null, nome);
    assert.match(r.esiti[0], /^REFUSED\./u, nome);
  }
});

/*
 * Adversarial review of the Desktop (04/11/2026, REVISIONE-E1-2026-11-04.md; form FORMA-E1-CURE-REVISIONE-2026-11-04.md).
 * D1, D2 (way b), D9: rule 17, one interruption where one is enough. V-G1 and V-G2: the guards that no test held (mutants M12, M10).
 */
test('E1-14 (D1): a tool that asks the person by itself gets no emulated card before its own question', async (t) => {
  const domande = [];
  const q = await giro(t, {
    chiamate: [['emulata-q1', 'ask_user_question', { questions: [{ id: 'scelta', question: 'Quale preferisci?', why: 'Cambia il formato del rapporto.' }] }]],
    chiediDomandaFn: async (d) => { domande.push(d); return { status: 'answered', answers: {} }; },
  });
  assert.equal(domande.length, 1, 'premise: the question reaches the person');
  assert.deepEqual(q.carteEmulate, [], 'ask_user_question: the question is the only interruption');
  const piani = [];
  const p = await giro(t, {
    modalitaOperativa: 'piano',
    chiamate: [['emulata-p1', 'present_plan', { plan: '1. leggere a.txt\n2. scrivere b.txt' }]],
    presentaPianoFn: async (x) => { piani.push(x); return { decisione: 'continua', correzione: 'no' }; },
  });
  assert.equal(piani.length, 1, 'premise: the plan reaches the person');
  assert.deepEqual(p.carteEmulate, [], 'present_plan: the plan card is the only interruption');
  for (const [nome, argomenti] of [['research_start', { question: 'Che cosa cambia nel 2026?', depth: 'quick' }], ['remote_control', {}]]) {
    const r = await giro(t, { chiamate: [['emulata-s1', nome, argomenti]], ospite: async () => false });
    assert.deepEqual(r.carteEmulate, [], `${nome}: its own card is the person's already`);
  }
});

test('E1-15 (D2, way b): a call the gate will ask anyway with a forced sign gets no emulated card; the forced yes is not a yes for the tool', async (t) => {
  const fuori = cartella(t, 'e1-fuori-scrive-');
  const r = await giro(t, {
    livelloAccesso: 'scrittura-progetto',
    chiamate: [['emulata-f1', 'scrivi', { percorso: join(fuori, 'x.txt'), contenuto: 'fuori' }], ['emulata-f2', 'scrivi', { percorso: 'b.txt', contenuto: 'dentro' }]],
  });
  assert.deepEqual(r.chieste.map((a) => [a.tipo, a.toolCallId, Boolean(a.fuoriDalProgetto)]), [['scrivi', 'emulata-f1', true], ['chiamata-dal-testo', 'emulata-f2', false]],
    'outside: the folder card only; then inside: the emulated card, because the folder yes covered that call only');
  assert.equal(readFileSync(join(fuori, 'x.txt'), 'utf8'), 'fuori');
  /* CLI condition (04/11 14:13): the forced card inherits semprePersona and the tool name, so no host approves it by itself */
  assert.equal(r.chieste[0].semprePersona, true);
  assert.equal(r.chieste[0].nome, 'scrivi');
  assert.notEqual(r.chieste[1].fuoriDalProgetto, true);
  assert.equal(scritto(r.dir), 'dentro');
  const s = await giro(t, { livelloAccesso: 'scrittura-progetto', ospite: async () => false, chiamate: [['emulata-f3', 'scrivi', { percorso: '.env', contenuto: 'K=1' }]] });
  assert.equal(s.chieste.length, 1, JSON.stringify(s.chieste.map((a) => [a.tipo, Boolean(a.segreto)])));
  assert.ok(s.chieste[0].segreto, 'a secret: the secret card only');
  assert.equal(s.chieste[0].semprePersona, true, 'the secret card is the person\'s only');
  assert.equal(scritto(s.dir, '.env'), null);
});

test('E1-15b (D2, safety net): a secret already allowed for the session asks no forced card, so the emulated card asks', async (t) => {
  const dir = cartella(t);
  const segreto = motivoDaChiedere({ tipo: 'scrivi', percorso: '.env', cartella: dir, accessoPieno: false });
  assert.ok(segreto, 'premise: .env is a secret');
  const consensiSessione = { segretiConsentiti: [chiaveDelConsensoDi(segreto, 'scrivi', '.env')] };
  const r = await giro(t, { cartellaDelGiro: dir, livelloAccesso: 'scrittura-progetto', consensiSessione, ospite: async () => false, chiamate: [['emulata-f4', 'scrivi', { percorso: '.env', contenuto: 'K=1' }]] });
  assert.deepEqual(r.chieste.map((a) => [a.tipo, Boolean(a.segreto)]), [['chiamata-dal-testo', false]]);
  assert.equal(scritto(r.dir, '.env'), null, 'nothing was written after the no');
});

test('E1-16 (D9): the reads without network that Plan already treats as reads need no card', async (t) => {
  for (const [nome, argomenti] of [['notes_find', {}], ['memory_find', {}], ['tasks_find', {}], ['research_find', {}], ['conversation_search', { query: 'x' }], ['talos_help', {}], ['goal_status', {}], ['workflow_status', {}]]) {
    const r = await giro(t, { chiamate: [['emulata-l1', nome, argomenti]], ospite: async () => false });
    assert.deepEqual(r.carteEmulate, [], nome);
  }
  /* AL CONTRARIO: the network and the writes still ask */
  for (const [nome, argomenti] of [['web_search', { query: 'x' }], ['notes_create', { title: 'x', body: 'y' }]]) {
    const r = await giro(t, { chiamate: [['emulata-l2', nome, argomenti]], ospite: async () => false });
    assert.equal(r.carteEmulate.length, 1, nome);
  }
});

test('E1-17 (V-G1, rule 17): a Linux path the namespace refuses anyway brings no emulated card', { skip: process.platform !== 'win32' }, async (t) => {
  const r = await giro(t, { chiamate: [['emulata-n1', 'scrivi', { percorso: '/tmp/e1-v.txt', contenuto: 'x' }]] });
  assert.deepEqual(r.chieste, []);
  assert.match(r.esiti[0], /FILE_NAMESPACE_MISMATCH/u);
});

test('E1-18 (V-G2, rule 17): a bridge call the bridge refuses anyway brings no emulated card', async (t) => {
  const r = await giro(t, { chiamate: [['emulata-p1', 'tool_call', { arguments: {} }]], attrezziDifferiti: true });
  assert.deepEqual(r.chieste, []);
  assert.match(r.esiti[0], /^REFUSED/u);
});

test('E1-20 (D4): an emulated read is measured with the position of the turn (Linux home: from the server), not on the Windows disk', async (t) => {
  const dir = cartella(t);
  const misure = [];
  const dellaCasa = async (percorso) => { misure.push(percorso); return { dentro: true, verificato: true, cartella: '/home/p/progetto', spazio: 'linux:Ubuntu' }; };
  assert.equal(await letturaEmulataNelProgetto('leggi', { percorso: '/home/p/progetto/a.txt' }, dir, dellaCasa), true);
  assert.deepEqual(misure, ['/home/p/progetto/a.txt']);
  /* AL CONTRARIO: without the position of the turn the Linux path is measured on the Windows disk, and it is not inside */
  assert.equal(await letturaEmulataNelProgetto('leggi', { percorso: '/home/p/progetto/a.txt' }, dir), false);
  /* the measure says outside ⇒ a card */
  assert.equal(await letturaEmulataNelProgetto('leggi', { percorso: '/etc/passwd' }, dir, async () => ({ dentro: false, verificato: true })), false);
});
