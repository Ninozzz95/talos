/*
 * ⛔ 02/10/2026 — CLI tappa 6b (owner: «i figli possono chiederti»; decisioni nel registro 12 della CLI). Una figlia può fare
 * una domanda alla PERSONA solo se l'host dichiara di saperla mostrare (`domandeDeiFigli`, predefinita false): come OpenCode,
 * dove i sotto-agenti di serie non chiedono e lo strumento esiste solo per i client che lo mostrano. Senza l'opzione tutto è
 * com'era: l'attrezzo non c'è, il gestore rifiuta, `ask_parent` resta la strada.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };
function sportello(risposte, osserva = () => {}) {
  let i = 0;
  return async (_url, opzioni) => {
    const body = JSON.parse(opzioni.body);
    osserva(body);
    return { ok: true, json: async () => ({ choices: [{ message: risposte[i++] ?? FINE }], usage: {} }) };
  };
}
const DOMANDE = [{
  id: 'scelta', question: 'Sandbox o finto?', why: 'Decide se il test va in rete.',
  options: [{ label: 'Finto', description: 'Veloce', recommended: true }, { label: 'Sandbox', description: 'Reale' }],
}];
const chiedi = { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ask_user_question', arguments: JSON.stringify({ questions: DOMANDE }) } }] };

test('FIGLI-01 — con il canale della persona la figlia riceve l\'attrezzo, la guida giusta, e la risposta torna al modello', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-figli-domande-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const corpi = [];const chieste = [];
  await talosLavora({ cartella, task: { consegna: 'scrivi i test' }, modello: 'x', chiave: 'y',
    modalitaOperativa: 'normale', agentRole: 'child', strumentiEstesi: ['ask_user_question', 'ask_parent'],
    figliaChiedeAllaPersona: true,
    chiediDomandaFn: async (questions) => { chieste.push(questions); return { status: 'answered', answers: { scelta: 'Finto' } }; },
    fetchDiRete: sportello([chiedi, FINE], (body) => corpi.push(body)) });
  const nomi = corpi[0].tools.map((tool) => tool.function?.name);
  assert.ok(nomi.includes('ask_user_question'), 'la figlia con il canale non riceve l\'attrezzo');
  assert.ok(nomi.includes('ask_parent'), 'ask_parent resta');
  const askParent = corpi[0].tools.find((tool) => tool.function?.name === 'ask_parent');
  assert.doesNotMatch(askParent.function.description, /never ask the user/i, 'la descrizione contraddice l\'attrezzo offerto');
  assert.match(corpi[0].messages[0].content, /ask_user_question[\s\S]*only the person|only the person[\s\S]*ask_user_question/i, 'manca la guida della figlia');
  assert.match(corpi[0].messages[0].content, /ask_parent/i);
  assert.equal(chieste.length, 1);
  const esito = corpi[1].messages.find((m) => m.role === 'tool' && m.tool_call_id === 'c1');
  assert.match(esito?.content ?? '', /answered/);
});

test('FIGLI-02 — AL CONTRARIO: senza la dichiarazione la figlia è com\'era, anche con un canale (niente attrezzo, rifiuto)', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-figli-domande-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const corpi = [];
  await talosLavora({ cartella, task: { consegna: 'scrivi i test' }, modello: 'x', chiave: 'y',
    modalitaOperativa: 'normale', agentRole: 'child', strumentiEstesi: ['ask_user_question', 'ask_parent'],
    chiediDomandaFn: async () => { throw new Error('mai chiamato'); },
    fetchDiRete: sportello([chiedi, FINE], (body) => corpi.push(body)) });
  assert.equal(corpi[0].tools.some((tool) => tool.function?.name === 'ask_user_question'), false);
  assert.match(corpi[0].tools.find((tool) => tool.function?.name === 'ask_parent').function.description, /never ask the user/i);
  const esito = corpi[1].messages.find((m) => m.role === 'tool' && m.tool_call_id === 'c1');
  assert.match(esito?.content ?? '', /REFUSED/);
});

function modelloFinto() {
  const avvii = [];
  return {
    avvii,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1;let concludi;
      const attesa = new Promise((risolvi) => { concludi = risolvi; });
      avvii.push({ input, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' } }); concludi({ ok: true }); } });
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` });
      return attesa;
    },
  };
}
function registroCon(finto, cartella, opzioni = {}) {
  const registro = createSessionRegistry({
    avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k', ...opzioni,
  });
  const avvio = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'delega', permessi: 'Full access' });
  assert.ok(avvio.sessionId, avvio.erroreAvvio);
  return { registro, madreId: avvio.sessionId };
}

test('FIGLI-03 — dal registro: con `domandeDeiFigli` la domanda della figlia è sua, dice chi chiede, si conta nella scheda e si risponde', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-figli-registro-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const finto = modelloFinto();
  const { registro, madreId } = registroCon(finto, cartella, { domandeDeiFigli: true });
  const madre = finto.avvii[0];
  assert.equal(typeof madre.input.chiediDomandaFn, 'function', 'la radice chiede come sempre');
  const delega = madre.input.onDelega('scrivi i test del checkout');
  const figlia = finto.avvii[1];
  assert.equal(typeof figlia.input.chiediDomandaFn, 'function', 'la figlia non ha il canale della persona');
  assert.equal(figlia.input.figliaChiedeAllaPersona, true, 'il registro non dichiara al kernel che la figlia può chiedere');
  assert.equal(madre.input.figliaChiedeAllaPersona, false);
  const figliaId = registro.elencaFigli(madreId).figli[0].sessionId;
  const eventi = [];registro.iscriviti(figliaId, (e) => eventi.push(e));
  const annunci = [];registro.iscriviti(madreId, (e) => { if (e?.type === 'CUSTOM' && e.name === 'talos.agenti') annunci.push(e.value); });
  const risposta = figlia.input.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] });
  const richiesta = eventi.find((e) => e.type === 'UserQuestionRequested');
  assert.ok(richiesta, 'la domanda non è un evento della figlia');
  assert.equal(richiesta.origine?.agente, 'figlio', 'la domanda non dice che chiede una figlia');
  assert.equal(registro.elencaFigli(madreId).figli[0].questionPendingCount, 1, 'la scheda non conta la domanda in attesa');
  const attesa = annunci.findLast((a) => a.childId === figliaId);
  assert.deepEqual([attesa?.operation?.kind, attesa?.operation?.status], ['question', 'waiting'], 'la madre non sa che la figlia aspetta la persona');
  assert.equal(attesa?.agent?.questionPendingCount, 1);
  assert.deepEqual(await registro.rispondiDomanda(figliaId, richiesta.requestId, { requestId: richiesta.requestId, status: 'answered', answers: { scelta: 'Finto' } }), { ok: true });
  assert.deepEqual(await risposta, { status: 'answered', answers: { scelta: 'Finto' } });
  assert.equal(registro.elencaFigli(madreId).figli[0].questionPendingCount, 0);
  figlia.concludi();madre.concludi();await delega;
});

test('FIGLI-04 — AL CONTRARIO: senza `domandeDeiFigli` (desktop e mobile oggi) la figlia è rifiutata come prima; la radice chiede', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-figli-registro-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const finto = modelloFinto();
  registroCon(finto, cartella);
  const madre = finto.avvii[0];
  assert.equal(typeof madre.input.chiediDomandaFn, 'function');
  const delega = madre.input.onDelega('scrivi i test del checkout');
  assert.equal(finto.avvii[1].input.figliaChiedeAllaPersona, false, 'una figlia chiede senza che l\'host lo sappia mostrare');
  await assert.rejects(finto.avvii[1].input.chiediDomandaFn(DOMANDE, {}), (e) => e.code === 'QUESTION_CHILD_FORBIDDEN');
  finto.avvii[1].concludi();madre.concludi();await delega;
});
