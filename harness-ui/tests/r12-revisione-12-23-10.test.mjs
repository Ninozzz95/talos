/*
 * 23/10/2026 sera — revisione 12 della CLI sul motore della compattazione (kernel 9e64cada0, riallineato da lei come b99e21704).
 * R12-1 (S2): «non entra» contava come cornice FISSA anche la storia che il fornitore conta più della stima — il base64 letto al giro
 *   prima, che i passi gratuiti tolgono. Due forme: la linea certa sul rifiuto (il giro falliva) e F6 all'emergenza con la finestra nota
 *   (diceva una frase falsa, e una volta per finestra avrebbe zittito quella vera). I casi sono quelli della CLI (`pdrv12.mjs s1.json`,
 *   `s1win.json`): un fornitore che conta il base64 a 1,6 caratteri per token (la stima a 4) e rifiuta oltre la sua finestra coi numeri.
 *   Ogni prova ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaToken } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* il conto del fornitore: il testo denso (quasi senza spazi) a 1,6 caratteri per token, il resto come la stima; più gli schemi */
const denso = (s) => s.length > 0 && (s.match(/\s/gu)?.length ?? 0) / s.length < 1 / 12;
const conta = (s) => (typeof s !== 'string' || !s ? 0 : denso(s) ? Math.ceil(s.length / 1.6) : stimaToken(s));
const contoDelFornitore = (corpo) => (corpo.messages ?? []).reduce((n, m) => n + conta(m.content)
  + (m.tool_calls ?? []).reduce((k, c) => k + conta(c.function?.arguments), 0), 0) + compattazione.stimaDegliAttrezzi(corpo.tools);
const rifiuto = (massimo, chiesti) => new Response(JSON.stringify({ error: { message: `This model's maximum context length is ${massimo} tokens. However, you requested ${chiesti} tokens. Please reduce the length of the messages.` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
function fornitore(finestraVera) {
  const conti = { richieste: 0, rifiutate: 0, riassunti: 0, mandati: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.richieste += 1;
    const n = contoDelFornitore(corpo);
    conti.mandati.push(n);
    if (n > finestraVera) { conti.rifiutate += 1; return rifiuto(finestraVera, n); }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  };
  return { fetchDiRete, conti };
}
/* base64 vero (righe da 76 come MIME): nessuno spazio, il newline ogni 77 caratteri */
const base64 = (caratteri) => {
  const pezzo = Buffer.from(Array.from({ length: Math.ceil(caratteri * 0.75) }, (_, i) => (i * 131 + 7) % 256)).toString('base64');
  return pezzo.slice(0, caratteri).replace(/(.{76})/gu, '$1\n');
};
const prosa = (caratteri) => 'Il registro delle prove racconta che cosa è successo durante la notte, riga dopo riga, con le ore. '.repeat(Math.ceil(caratteri / 99)).slice(0, caratteri);
/* il giro 2 della CLI: al giro 1 il modello ha letto un file in base64 da 40.000 caratteri; ora la persona incolla 96.000 caratteri */
const storia = ({ scambiDopo = 0, richiesta = 96_000 } = {}) => [
  { role: 'system', content: 'You are a coding agent.' },
  { role: 'user', content: 'Leggi il file dati.b64.' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'b1', type: 'function', function: { name: 'read_file', arguments: '{"path":"dati.b64"}' } }] },
  { role: 'tool', tool_call_id: 'b1', content: base64(40_000) },
  { role: 'assistant', content: 'Letto: è un archivio codificato.' },
  /* altri scambi dopo la lettura: il base64 finisce nel tratto vecchio (da riassumere), non nella coda — la forma di s1win */
  ...Array.from({ length: scambiDopo }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${prosa(600)}` }, { role: 'assistant', content: `Risposta ${i}: ${prosa(600)}` }]).flat(),
  { role: 'user', content: prosa(richiesta) },
];
/* lo scarto che il registro porta dal giro 1: ciò che il fornitore ha contato in più della stima dei messaggi (il base64 e gli schemi) */
const scartoDelGiroPrima = (attrezziStimati) => Math.ceil(40_000 / 1.6) - stimaToken(base64(40_000)) + attrezziStimati;

async function giro(t, { rete, scambiDopo = 0, richiesta = 96_000, ...resto }) {
  const cartella = cartellaDiProva('talos-r12-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  let esito = null;
  let errore = null;
  try {
    esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: storia({ scambiDopo, richiesta }),
      contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione')) eventi.push(e); }, ...resto });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, nonEntra: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'non-entra') };
}
const racconta = (r, rete) => JSON.stringify({ mandati: rete.conti.mandati, riassunti: rete.conti.riassunti, errore: r.errore?.message?.slice(0, 120) ?? null,
  eventi: r.eventi.map((e) => [e.tipo, e.motivo ?? null, e.compattato ?? null, e.finestra ?? null, e.pavimento ?? null]) });

/* gli schemi che il giro manda: si misurano con una prima corsa breve (la stessa lista che il kernel manda davvero) */
async function attrezziDelGiro(t) {
  let stimati = null;
  const cartella = cartellaDiProva('talos-r12-schemi-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [{ role: 'user', content: 'ciao' }],
    contestoDelProgetto: 'Project files:\n', permessi: 'Full access',
    fetchDiRete: async (_u, o) => { stimati ??= compattazione.stimaDegliAttrezzi(JSON.parse(o.body).tools); return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } }); } });
  return stimati;
}

test('R12-1-A — finestra sconosciuta, il fornitore rifiuta oltre 40.000: la storia in base64 che i passi gratuiti tolgono NON è cornice — il giro non dice «non entra» e riesce sotto la finestra; AL CONTRARIO una richiesta nuova che da sola non entra resta «troppo grande»', async (t) => {
  const attrezzi = await attrezziDelGiro(t);
  const rete = fornitore(40_000);
  const r = await giro(t, { rete, scartoMisurato: scartoDelGiroPrima(attrezzi) });
  assert.ok(rete.conti.rifiutate >= 1, `premessa: la richiesta intera non entra ${racconta(r, rete)}`);
  assert.equal(r.nonEntra.length, 0, `niente «non entra»: accorciata entra ${racconta(r, rete)}`);
  assert.equal(r.errore, null, `il giro riesce ${racconta(r, rete)}`);
  assert.ok(rete.conti.mandati.at(-1) <= 40_000, `l'ultima richiesta è entrata ${racconta(r, rete)}`);
  // AL CONTRARIO: 200.000 caratteri di prosa (~50.000 token) non entrano da soli in 40.000 — la regola N lo dice, coi numeri
  const reteBis = fornitore(40_000);
  const lunga = storia();
  lunga[lunga.length - 1] = { role: 'user', content: prosa(200_000) };
  const bis = await giro(t, { rete: reteBis, scartoMisurato: scartoDelGiroPrima(attrezzi), messaggiIniziali: lunga });
  assert.equal(bis.errore?.code, 'REQUEST_TOO_LARGE', racconta(bis, reteBis));
  assert.equal(reteBis.conti.riassunti, 0, 'niente pagato');
});

test('R12-1-B — finestra nota (49.152): all\'emergenza F6 non dice «troppo piccola» per la storia in base64 che il pavimento ha già tolto, e il giro riesce; AL CONTRARIO una cornice che da sola supera la finestra lo dice ancora', async (t) => {
  const attrezzi = await attrezziDelGiro(t);
  const rete = fornitore(49_152);
  const r = await giro(t, { rete, scartoMisurato: scartoDelGiroPrima(attrezzi), finestraToken: 49_152, scambiDopo: 4, richiesta: 128_000 });
  assert.ok(rete.conti.mandati.at(-1) <= 49_152, `è entrata davvero ${racconta(r, rete)}`);
  assert.equal(r.nonEntra.length, 0, `niente frase falsa ${racconta(r, rete)}`);
  assert.equal(r.errore, null, `il giro riesce ${racconta(r, rete)}`);
  // AL CONTRARIO: un sistema da solo più grande della finestra — nessuna storia lo spiega, «non entra» è certo e si dice
  const reteBis = fornitore(8_192);
  const bis = await giro(t, { rete: reteBis, scartoMisurato: attrezzi, finestraToken: 8_192,
    messaggiIniziali: [{ role: 'system', content: `You are a coding agent. ${'regola del progetto '.repeat(1_800)}` }, { role: 'user', content: 'Rispondi OK.' }] });
  assert.equal(bis.nonEntra.length, 1, racconta(bis, reteBis));
});

test('R12-1-C — `scartoFissoCerto`: la storia densa spiega fino al triplo della sua stima, quella con gli spazi fino a una volta; mai meno della quota degli attrezzi; il sistema non è storia', () => {
  const b64 = base64(40_000);
  const spiegabileDenso = compattazione.scartoSpiegabileDallaStoria([{ role: 'tool', content: b64 }]);
  assert.equal(spiegabileDenso, 3 * stimaToken(b64));
  const testo = prosa(4_000);
  assert.equal(compattazione.scartoSpiegabileDallaStoria([{ role: 'user', content: testo }]), stimaToken(testo));
  assert.equal(compattazione.scartoSpiegabileDallaStoria([{ role: 'system', content: b64 }]), 0, 'il sistema è cornice');
  assert.equal(compattazione.scartoSpiegabileDallaStoria([{ role: 'assistant', content: null, tool_calls: [{ function: { arguments: b64 } }] }]), 3 * stimaToken(b64));
  // la parte certa: lo scarto meno ciò che la storia può spiegare, mai sotto gli attrezzi, mai negativa
  assert.equal(compattazione.scartoFissoCerto({ scarto: 21_623, attrezzi: 6_811, spiegabileDallaStoria: 30_000 }), 6_811);
  assert.equal(compattazione.scartoFissoCerto({ scarto: 6_000, attrezzi: 2_192, spiegabileDallaStoria: 500 }), 5_500);
  assert.equal(compattazione.scartoFissoCerto({ scarto: 1_000, attrezzi: 2_000, spiegabileDallaStoria: 5_000 }), 1_000, 'mai più dello scarto');
  assert.equal(compattazione.scartoFissoCerto({ scarto: -5, attrezzi: 0, spiegabileDallaStoria: 0 }), 0);
});

/*
 * R12-2 (S2, owner «correggere nella 0.6.13»): col motore del contesto un «contesto pieno» del fornitore non accorciava e non riprovava
 *   (niente scala, niente numeri, nessuna finestra ricordata). Motore vero, archivio in memoria, fornitore finto (come «non aspettare»).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatoreDelMotore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO_DEL_MOTORE = { provider: 'local', model: 'test', windowTokens: 131_072, responseReserve: 2048 };
function scenaDelMotore(t, { guasto = null } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-r12-motore-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatoreDelMotore, clock: () => '2026-10-23T18:00:00.000Z' });
  /* `guasto`: il motore fallisce la preparazione con questo codice (la strada del ripiego), finché `guasto.attivo` */
  const motore = { ...engine, prepareForRequest: async (opzioni) => {
    if (guasto?.attivo) throw Object.assign(new Error('the engine could not fit the context'), { code: guasto.codice });
    return engine.prepareForRequest(opzioni);
  } };
  const service = createDesktopContextService({ store, engine: motore, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => MODELLO_DEL_MOTORE, clock: () => '2026-10-23T18:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, service };
}
async function giroDelMotore(s, { rete, runId = 'giro-1', messaggiIniziali, ...resto }) {
  const eventi = [];
  let esito = null; let errore = null;
  try {
    esito = await talosLavora({ cartella: s.cartella, task: { consegna: 'Riassumi gli errori del log.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
      fetchDiRete: rete.fetchDiRete, contestoDelProgetto: 'PREAMBOLO', contextHooks: await s.service.createKernelHooks({ sessionId: 'chat', runId }),
      ...(messaggiIniziali ? { messaggiIniziali } : {}), onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione')) eventi.push(e); }, ...resto });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, ripieghi: eventi.filter((e) => e.motivo === 'ripiego') };
}
/* il log letto al giro prima: 160.000 caratteri di prosa (~40.000 token), in un fornitore che regge 30.000 */
const conLogLetto = () => [
  { role: 'user', content: 'Leggi il log.' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'l1', type: 'function', function: { name: 'read_file', arguments: '{"path":"server.log"}' } }] },
  { role: 'tool', tool_call_id: 'l1', content: prosa(160_000) },
  { role: 'assistant', content: 'Letto.' },
  { role: 'user', content: 'Riassumi gli errori del log.' },
];

test('R12-2-A — col MOTORE del contesto un «contesto pieno» coi numeri passa alla scala: accorcia, riprova ed entra, e la finestra del fornitore si ricorda; AL CONTRARIO un errore che non è «contesto pieno» passa com\'è', async (t) => {
  const s = scenaDelMotore(t);
  const rete = fornitore(30_000);
  const r = await giroDelMotore(s, { rete, messaggiIniziali: conLogLetto() });
  assert.ok(rete.conti.rifiutate >= 1, `premessa: la richiesta intera non entra (${JSON.stringify(rete.conti.mandati)})`);
  assert.equal(r.errore, null, `il giro riesce (${r.errore?.message?.slice(0, 160)}; ${JSON.stringify(rete.conti.mandati)})`);
  assert.ok(rete.conti.mandati.at(-1) <= 30_000, `l'ultima è entrata (${JSON.stringify(rete.conti.mandati)})`);
  assert.equal(r.esito?.rifiutoDelFornitore?.finestra, 30_000, 'la finestra detta dal fornitore si ricorda (per il registro)');
  // AL CONTRARIO: un 401 non è «contesto pieno» — nessuna scala, una richiesta sola
  const s2 = scenaDelMotore(t);
  let chiamate = 0;
  const negato = { fetchDiRete: async () => { chiamate += 1; return new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401, headers: { 'content-type': 'application/json' } }); } };
  const r2 = await giroDelMotore(s2, { rete: negato, messaggiIniziali: conLogLetto() });
  assert.ok(r2.errore, 'il giro fallisce');
  assert.equal(r2.eventi.filter((e) => e.motivo === 'overflow').length, 0, 'nessuna scala');
});

test('R12-2-B — il ripiego dal motore si dice UNA volta per sessione finché il motore non guarisce: il giro dopo, con lo stesso codice, tace; AL CONTRARIO un codice diverso o un motore guarito si dicono di nuovo', async (t) => {
  const guasto = { attivo: true, codice: 'CTX_CONTEXT_OVERFLOW' };
  const s = scenaDelMotore(t, { guasto });
  const primo = await giroDelMotore(s, { rete: fornitore(200_000), runId: 'g1' });
  assert.equal(primo.ripieghi.length, 1, 'detto una volta');
  assert.equal(primo.esito?.ripiegoDetto, 'CTX_CONTEXT_OVERFLOW', 'e il registro lo saprà');
  const secondo = await giroDelMotore(s, { rete: fornitore(200_000), runId: 'g2', ripiegoDetto: primo.esito.ripiegoDetto });
  assert.equal(secondo.ripieghi.length, 0, 'il giro dopo, stesso guasto: niente riga ripetuta (la CLI la contava sette volte)');
  const diverso = await giroDelMotore(s, { rete: fornitore(200_000), runId: 'g3', ripiegoDetto: 'CTX_HISTORY_DIVERGED' });
  assert.equal(diverso.ripieghi.length, 1, 'AL CONTRARIO: un guasto diverso si dice');
  guasto.attivo = false;
  const guarito = await giroDelMotore(s, { rete: fornitore(200_000), runId: 'g4', ripiegoDetto: 'CTX_CONTEXT_OVERFLOW' });
  assert.equal(guarito.esito?.ripiegoDetto, null, 'AL CONTRARIO: il motore guarito azzera il ricordo');
});

test('R12-3 nel motore — il giro riporta la richiesta più grande che il fornitore ha accettato (il suo prompt_tokens), che il registro usa contro i rifiuti strani; AL CONTRARIO senza `usage` non riporta niente', async (t) => {
  const conti = [9_000, 14_058, 11_000];
  let i = 0;
  const conUsage = { fetchDiRete: async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'R' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1 } });
    const n = conti[Math.min(i, conti.length - 1)]; i += 1;
    const chiama = i < 3;
    const messaggio = chiama ? { role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'elenca', arguments: '{}' } }] } : { role: 'assistant', content: 'fatto' };
    return Response.json({ choices: [{ index: 0, message: messaggio, finish_reason: chiama ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  } };
  const r = await giro(t, { rete: conUsage, messaggiIniziali: [{ role: 'user', content: 'Elenca la cartella due volte.' }] });
  assert.equal(r.errore, null, r.errore?.message);
  assert.equal(r.esito?.massimoAccettato, 14_058, 'il più grande dei tre');
  const senza = { fetchDiRete: async () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }] }) };
  const r2 = await giro(t, { rete: senza, messaggiIniziali: [{ role: 'user', content: 'ciao' }] });
  assert.equal(r2.esito?.massimoAccettato ?? null, null, 'AL CONTRARIO: nessun numero del fornitore, nessuna misura');
});
