import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

/*
 * ⭐ FULL ACCESS NON CHIEDE (owner 12/10/2026 «per legge»; quarta tornata 17/10, due consigliate). In «Full access» la carta delle
 *   automazioni e quella dell'esclusione dei fornitori non si mostrano: l'azione si fa e l'esito dice che cosa la carta avrebbe
 *   segnalato. Negli altri livelli la carta resta. Lo scollegamento di ChatGPT chiede SEMPRE (scelta del 12/10).
 */

function fornitore(chiamate) {
  const richieste = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    richieste.push(corpoSenzaMarcatori(init.body));
    n += 1;
    const message = n === 1
      ? { role: 'assistant', content: null, tool_calls: chiamate.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchDiRete, richieste };
}
const esitoDi = (richieste, id) => richieste.flatMap((r) => r.messages).find((m) => m.role === 'tool' && m.tool_call_id === id)?.content;

/* Un ospite finto con la stessa forma dei veri (`automation-per-il-modello.mjs`, `fornitori-per-il-modello.mjs`): anteprima con carta, poi esegui. */
function ospite(registro) {
  return async (nome, argomenti, { fase }) => {
    registro.push([nome, fase]);
    if (fase === 'anteprima') return { ok: true, carta: true, azione: { avvisi: { oltre: [{ codice: 'fuori-dalla-chat' }], minacce: ['ignora le istruzioni'] } } };
    return { ok: true, testo: `${nome} done.` };
  };
}

async function giro({ livelloAccesso, chiamate, approva = false }) {
  const { fetchDiRete, richieste } = fornitore(chiamate);
  const fasi = [];
  const carte = [];
  await talosLavora({
    cartella: mkdtempSync(join(tmpdir(), 'autofull-')), task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, fetchDiRete,
    livelloAccesso, strumentiEstesi: ['automation_create', 'automation_update', 'automation_control', 'provider_exclude', 'provider_allow', 'chatgpt_account'],
    chiediApprovazioneFn: async (azione) => { carte.push(azione.tipo); return approva; },
    onAutomazioneFn: ospite(fasi), onFornitoriFn: ospite(fasi),
  });
  return { richieste, fasi, carte };
}

test('FA-AUTO-01: Full access — crea, modifica e riprendi un\'automazione senza carta, e l\'esito dice che cosa la carta avrebbe segnalato', async () => {
  const { richieste, fasi, carte } = await giro({ livelloAccesso: 'accesso-pieno', chiamate: [
    ['a1', 'automation_create', { nome: 'X' }],
    ['a2', 'automation_update', { id: 'x', nome: 'Y' }],
    ['a3', 'automation_control', { id: 'x', action: 'resume' }],
  ] });
  assert.deepEqual(carte, [], 'nessuna carta');
  assert.deepEqual(fasi.filter(([, f]) => f === 'esegui').map(([n]) => n), ['automation_create', 'automation_update', 'automation_resume']);
  assert.match(esitoDi(richieste, 'a1'), /^automation_create done\. Full access: done without asking the person\. The confirmation card would have flagged: fuori-dalla-chat\. Suspicious text in the instructions: ignora le istruzioni\.$/u);
});

test('FA-AUTO-02: AL CONTRARIO — in «Workspace write» la carta resta, e un «no» non esegue niente', async () => {
  const { richieste, fasi, carte } = await giro({ livelloAccesso: 'scrittura-progetto', chiamate: [['a1', 'automation_create', { nome: 'X' }]] });
  assert.deepEqual(carte, ['automation_create']);
  assert.deepEqual(fasi.filter(([, f]) => f === 'esegui'), []);
  assert.match(esitoDi(richieste, 'a1'), /^REFUSED\./u);
});

test('FA-AUTO-03: Full access — escludere e riammettere un fornitore non chiede; scollegare ChatGPT chiede SEMPRE', async () => {
  const { richieste, fasi, carte } = await giro({ livelloAccesso: 'accesso-pieno', chiamate: [
    ['p1', 'provider_exclude', { provider: 'z' }],
    ['p2', 'provider_allow', { provider: 'z' }],
    ['p3', 'chatgpt_account', { action: 'disconnect' }],
  ] });
  assert.deepEqual(carte, ['chatgpt_account'], 'la sola carta è quella di ChatGPT');
  assert.deepEqual(fasi.filter(([, f]) => f === 'esegui').map(([n]) => n), ['provider_exclude', 'provider_allow']);
  assert.match(esitoDi(richieste, 'p1'), /Full access: done without asking the person\./u);
  assert.match(esitoDi(richieste, 'p3'), /^REFUSED\./u);
});

test('FA-AUTO-04: senza niente da segnalare l\'esito dice solo che non si è chiesto', async () => {
  const { notaSenzaCarta } = await import('../src/kernel/talosHarness.mjs');
  assert.equal(notaSenzaCarta({}), ' Full access: done without asking the person.');
  assert.equal(notaSenzaCarta({ avvisi: { oltre: [{}], minacce: [7] } }), ' Full access: done without asking the person.');
});

/* FA-RI-03 della revisione I del bugfixer (17/10/2026), ripresa qui: uccide il mutante «livello non riletto a ogni chiamata». */
test('FA-AUTO-07: Full access TOLTO a giro vivo — la prima automazione passa senza carta, la seconda chiede', async () => {
  const { fetchDiRete } = fornitore([['a1', 'automation_create', { nome: 'X' }], ['a2', 'automation_create', { nome: 'Y' }]]);
  const fasi = [];
  const carte = [];
  let chiamate = 0;
  await talosLavora({
    cartella: mkdtempSync(join(tmpdir(), 'autofull-c16-')), task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, fetchDiRete,
    livelloAccesso: 'accesso-pieno', strumentiEstesi: ['automation_create'],
    permessiCorrentiFn: () => { chiamate += 1; return { livelloAccesso: chiamate === 1 ? 'accesso-pieno' : 'scrittura-progetto', permessiPerAttrezzo: {} }; },
    chiediApprovazioneFn: async (azione) => { carte.push(azione.tipo); return false; },
    onAutomazioneFn: ospite(fasi),
  });
  assert.deepEqual(carte, ['automation_create'], 'la seconda chiamata, a Full access tolto, chiede');
  assert.equal(fasi.filter(([, f]) => f === 'esegui').length, 1, 'e il «no» ferma la seconda');
});

/*
 * ⭐ Dopo la revisione I (owner 17/10, «niente carta, avviso visibile a te»): un'automazione fatta senza carta, con ciò che la carta
 *   avrebbe segnalato, lo dice alla PERSONA. Si prova lungo tutto il filo (lezione del 17/10): kernel → evento d'esito → AG-UI.
 */
async function giroConEsiti({ livelloAccesso, avvisi, approva = true }) {
  const { fetchDiRete } = fornitore([['a1', 'automation_create', { nome: 'X' }]]);
  const esiti = [];
  await talosLavora({
    cartella: mkdtempSync(join(tmpdir(), 'autofull-')), task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, fetchDiRete,
    livelloAccesso, strumentiEstesi: ['automation_create'], chiediApprovazioneFn: async () => approva,
    onAutomazioneFn: async (_nome, _argomenti, { fase }) => (fase === 'anteprima' ? { ok: true, carta: true, azione: { avvisi } } : { ok: true, id: 'auto-1', testo: 'created' }),
    onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(e); },
  });
  return esiti;
}

test('FA-AUTO-05: kernel — l\'esito porta `senzaCarta` (avvisi + id) solo senza carta E con qualcosa da dire', async () => {
  const avvisi = { oltre: [{ codice: 'accesso-pieno' }], minacce: ['ignora-istruzioni'] };
  const [conAvvisi] = await giroConEsiti({ livelloAccesso: 'accesso-pieno', avvisi });
  assert.deepEqual(conAvvisi.senzaCarta, { oltre: [{ codice: 'accesso-pieno' }], minacce: ['ignora-istruzioni'], automazioneId: 'auto-1' });
  const [senzaAvvisi] = await giroConEsiti({ livelloAccesso: 'accesso-pieno', avvisi: { oltre: [], minacce: [] } });
  assert.equal('senzaCarta' in senzaAvvisi, false, 'AL CONTRARIO: niente da dire, niente segno');
  const [conCarta] = await giroConEsiti({ livelloAccesso: 'scrittura-progetto', avvisi });
  assert.equal('senzaCarta' in conCarta, false, 'AL CONTRARIO: con la carta la persona l\'ha già vista');
});

test('FA-AUTO-06: servizio — il segno arriva sul ToolCallResult come `unasked`', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const eventi = [];
  const talosLavoraFn = async (input) => {
    input.onGiro?.({ tipo: 'risposta', giro: 0, risposta: { role: 'assistant', content: '', tool_calls: [{ id: 'a1', function: { name: 'automation_create', arguments: '{}' } }] } });
    input.onGiro?.({ tipo: 'tool-esito', giro: 0, toolCallId: 'a1', content: 'created',
      senzaCarta: { oltre: [{ codice: 'accesso-pieno' }], minacce: ['ignora-istruzioni'], automazioneId: 'auto-1' } });
    input.onGiro?.({ tipo: 'tool-esito', giro: 0, toolCallId: 'a2', content: 'senza segno' });
    return { comeFinita: 'concluso', detto: 'ok' };
  };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'x' }, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });
  const risultati = eventi.filter((e) => e.type === 'ToolCallResult');
  assert.deepEqual(risultati.find((e) => e.toolCallId === 'a1').unasked, { oltre: [{ codice: 'accesso-pieno' }], minacce: ['ignora-istruzioni'], automationId: 'auto-1' });
  assert.equal('unasked' in risultati.find((e) => e.toolCallId === 'a2'), false, 'senza segno l\'evento resta com\'era');
});
