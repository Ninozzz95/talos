/*
 * ⭐ L1 1.3, revisione blocco 4 (26/10/2026, A-3; owner A1-1 «Tutte e due, visibili») — il registro a FINE GIRO: sul modello locale di
 *   questo PC, sopra la soglia la finestra si allarga INVECE di riassumere (Hermes decide la crescita a fine giro,
 *   `hermes_cli/local_runtime/context_policy.py:223`), con la riga «Window enlarged» nella conversazione. «Chiedimi» ⇒ nessun riassunto
 *   senza la persona. AL CONTRARIO: non si può crescere ⇒ il riassunto di sempre; un modello in cloud non riceve mai la finestra viva.
 *   Banco: quello di `registro-compattazione-persistita.test.mjs` (modello finto, riassuntore finto, TEMP privata, nessuna porta).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function sessioneControllabile() {
  let risolviAttesa;
  const attesa = new Promise((risolvi) => { risolviAttesa = risolvi; });
  let onEvento = null;
  let input = null;
  return {
    avviaSessioneFn: async (i) => { input = i; onEvento = i.onEvento; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return attesa; },
    concludi(eventoFinale, risultato) { onEvento(eventoFinale); risolviAttesa(risultato); },
    get ultimoInput() { return input; },
  };
}
async function attendi(condizione, { tentativi = 400, intervalloMs = 10, messaggio = 'condizione non raggiunta' } = {}) {
  for (let i = 0; i < tentativi; i += 1) {
    if (await condizione()) return;
    await new Promise((r) => setTimeout(r, intervalloMs));
  }
  throw new Error(messaggio);
}
function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}
/* sopra un tetto di 2.000 token: 6 risultati d'attrezzo da 3.000 caratteri */
const storiaGrande = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `file${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
  }
  s.push({ role: 'assistant', content: 'Fatto.' });
  return s;
};

async function fineGiro(t, { modello = 'local:m1', esitoCrescita = { ok: true, prima: 16_384, dopo: 24_576, massimo: 131_072, memoriaInPiu: null, nome: 'LFM2.5 24B', proattiva: true }, puo = true } = {}) {
  conTetto(t, 2_000);
  const cartellaStore = cartellaDiProva('talos-fc-registro-');
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  const riassunti = [];
  const crescite = [];
  const chieste = [];
  const finta = sessioneControllabile();
  const registro = createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello, chiave: 'k',
    riassumiPerCompattazioneFn: async (input) => { riassunti.push(input); return { scelta: { role: 'assistant', content: 'RIASSUNTO' }, finishReason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 10 } }; },
    finestraLocaleFn: (perRete) => {
      chieste.push(perRete);
      if (!String(perRete).startsWith('local:')) return null;
      return { puoCrescere: async () => puo, cresci: async (richiesta) => { crescite.push(richiesta); return esitoCrescita; } };
    },
  });
  const { sessionId } = registro.avvia('task-vero');
  const eventi = [];
  registro.iscriviti(sessionId, (e) => eventi.push(e));
  const input = finta.ultimoInput;
  finta.concludi({ type: 'RunFinished' }, { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storiaGrande(), recordDiCompattazione: [] } });
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso !== true, { messaggio: 'il fine giro non finisce' });
  await new Promise((r) => setTimeout(r, 30));
  await attendi(() => registro.statoCompattazione(sessionId)?.inCorso !== true);
  await attendiScritture({ cartellaStore, sessionId });
  return { registro, sessionId, eventi, riassunti, crescite, chieste, input };
}

const righeFinestra = (eventi) => eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.finestra-locale');

test('FC-REG-01 (A-3) a fine giro, sopra la soglia, il modello locale ALLARGA invece di riassumere, e la conversazione lo dice', async (t) => {
  const r = await fineGiro(t);
  assert.equal(r.crescite.length, 1, 'una crescita');
  assert.ok(r.crescite[0].servono >= 2_000, `con l'occupazione misurata: ${JSON.stringify(r.crescite[0])}`);
  assert.equal(r.riassunti.length, 0, 'nessun riassunto pagato');
  const righe = righeFinestra(r.eventi);
  assert.equal(righe.length, 1, JSON.stringify(r.eventi.map((e) => e.name ?? e.type)));
  assert.deepEqual({ prima: righe[0].value.prima, dopo: righe[0].value.dopo, modello: righe[0].value.modello }, { prima: 16_384, dopo: 24_576, modello: 'LFM2.5 24B' });
  assert.match(righe[0].value.testo, /^Window enlarged to 24,576 tokens to fit the conversation\.$/u);
});

test('FC-REG-02 «Chiedimi»: a fine giro niente riassunto senza la persona, e nessuna riga', async (t) => {
  const r = await fineGiro(t, { esitoCrescita: { ok: false, motivo: 'chiedi', prima: 16_384, dopo: 24_576 } });
  assert.equal(r.crescite.length, 1);
  assert.equal(r.riassunti.length, 0);
  assert.equal(righeFinestra(r.eventi).length, 0);
});

test('FC-REG-03 AL CONTRARIO: la crescita non riesce (memoria) ⇒ il riassunto di sempre', async (t) => {
  const r = await fineGiro(t, { esitoCrescita: { ok: false, motivo: 'memoria' } });
  assert.equal(r.crescite.length, 1);
  assert.equal(r.riassunti.length, 1, 'riassume come prima');
  assert.equal(righeFinestra(r.eventi).length, 0);
});

test('FC-REG-04 AL CONTRARIO: non c\'è un gradino da salire ⇒ non si prova nemmeno, si riassume', async (t) => {
  const r = await fineGiro(t, { puo: false });
  assert.equal(r.crescite.length, 0);
  assert.equal(r.riassunti.length, 1);
});

test('FC-REG-05 il giro riceve la finestra viva solo per un modello locale; un modello in cloud no (com\'era)', async (t) => {
  const locale = await fineGiro(t);
  assert.equal(typeof locale.input.finestraLocale?.attuale, 'function', 'il giro locale la riceve');
  assert.equal(typeof locale.input.finestraLocale?.cresci, 'function');
  const cloud = await fineGiro(t, { modello: 'z-ai/glm-5.3-flash' });
  assert.equal(cloud.input.finestraLocale, undefined, 'un modello in cloud: nessuna chiave nuova nell\'input del giro');
  assert.equal(cloud.crescite.length, 0);
  assert.equal(cloud.riassunti.length, 1, 'e riassume come sempre');
});
